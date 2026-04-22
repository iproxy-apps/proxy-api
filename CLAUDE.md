# Proxy API

Backend API for a task/service marketplace platform with Stripe-powered payments.

## Stack

- **Runtime**: Node.js with TypeScript (ES2024, strict mode)
- **Framework**: NestJS 11 (CommonJS, decorators enabled; bootstrap uses `rawBody: true` for Stripe webhooks)
- **ORM**: Prisma 7 with PostgreSQL adapter (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (does not use class-validator)
- **Authentication**: JWT RS256 (passport-jwt) with base64-encoded public/private keys
- **Payments**: Stripe SDK (Connect with merchant accounts) + webhooks for async state
- **Notifications**: AWS SES (email) and AWS SNS (SMS) via `@aws-sdk/client-ses` and `@aws-sdk/client-sns`
- **Testing**: Jest (unit) + Testcontainers PostgreSQL (e2e) + supertest
- **Formatting**: Prettier (no semicolons, single quotes, trailing commas)

## Commands

```bash
npm run start:dev          # Dev: syncs Stripe secret, runs API + stripe listen in parallel
npm run start:dev:api      # Just the Nest API (nest start --watch)
npm run stripe:listen      # Just the Stripe webhook forwarder
npm run stripe:sync-secret # Capture whsec from CLI and write to .env
npm run build              # Build (prisma generate && nest build)
npm run start:prod         # Production (node dist/src/main)
npm run format             # Prettier
npm run lint               # ESLint with auto-fix
npm run type-check         # tsc --noEmit
npm test                   # Unit tests (jest)
npm run test:watch         # Unit tests in watch mode
npm run test:cov           # Unit coverage
npm run test:e2e           # E2E suite (Testcontainers Postgres, runs in-band)
```

### Prisma

```bash
npx prisma migrate dev       # Create/apply migrations
npx prisma generate          # Generate client (required after schema changes)
npx prisma studio            # UI to browse data
```

### Docker (PostgreSQL)

```bash
docker compose up -d   # Starts PostgreSQL on port 5432 (local dev)
```

E2E tests do **not** use this instance — Testcontainers spins up an ephemeral Postgres per run.

## Architecture

### Directory structure

```
src/
├── main.ts                    # Bootstrap (rawBody enabled, global HttpExceptionFilter)
├── app.module.ts              # Root module, validates env with Zod
├── env/                       # Typed environment config (Zod schema)
├── exception/                 # AppException, HttpExceptionFilter, errorDictionary
├── pipes/                     # ZodValidationPipe, multerOptions
├── prisma/                    # PrismaService (extends PrismaClient)
├── stripe/                    # StripeService and StripeModule (dynamic module)
├── notification/              # NotificationService (AWS SES for email, SNS for SMS)
└── modules/
    ├── auth/                  # Authentication, accounts, merchant (Stripe Connect)
    ├── tasks/                 # Full task lifecycle CRUD
    ├── cards/                 # User payment methods
    ├── payments/              # Payment records (intents, refunds)
    └── stripe-webhook/        # Stripe webhook endpoint + event handlers

scripts/
└── sync-stripe-secret.mjs     # Captures stripe listen secret into .env

test/
├── jest-e2e.config.ts
├── setup/                     # global-setup (Testcontainers + migrations), app factory
├── mocks/                     # StripeService and NotificationService mocks
├── factories/                 # user + task factories for e2e seeding
└── <module>/                  # one <endpoint>.e2e-spec.ts per route
```

### Module patterns

Every domain module follows the same structure:

```
modules/<name>/
├── <name>.module.ts           # NestJS module
├── controllers/               # One controller per action (create-task.controller.ts)
├── use-cases/                 # One service per use case (create-task.service.ts)
├── repository/                # Repository with DTO interface + Prisma implementation
├── dtos/                      # Repository interfaces (contracts)
├── types/                     # index.d.ts with domain types
└── test-utils/                # Optional: shared factories for unit tests (e.g., user.factory.ts)
```

- **1 controller = 1 route**: Each controller exposes a single endpoint.
- **1 service = 1 use case**: Each service in `use-cases/` has a single `execute()` method.
- **Repository pattern**: Repositories implement a DTO interface defined in `dtos/`.
- **Types in `types/index.d.ts`**: Module domain types live in declaration files.
- **Unit spec co-located**: `<name>.service.spec.ts` sits next to the service.

### Code conventions

- Zod schemas are defined inline in controllers (not in separate files).
- Body validation uses `@Body(new ZodValidationPipe(schema))`.
- Protected routes use `@UseGuards(JwtAuthGuard)`.
- Authenticated user accessed via `@User()` decorator, which returns `SessionPayload`.
- Domain errors use `throw new AppException(errorDictionary.xxx.yyy)`.
- Error messages in `errorDictionary` are written in **Portuguese**.
- No semicolons (Prettier config).
- Path aliases: `src/*` maps to `src/*` (e.g., `import { X } from 'src/pipes/...'`).

### Database models (Prisma)

- **Users**: Clients and proxies, with `walletBalance`, `stripeCustomerId`/`stripeAccountId`, `stripeAccountReady` (true after `account.updated` webhook confirms charges+payouts enabled), soft delete (`isDeleted`).
- **Tasks**: Lifecycle: `available → accepted → on_the_way → in_progress → verification_required → completed | canceled`. `completedAt` is set when the proxy finishes (`finish-task`); validation only updates status and fees.
- **Cards**: Saved cards via Stripe (brand, last4, stripeCardId).
- **UserTaskMapping**: Links executor (proxy) to a task.
- **Payments**: Payment record with `status` (`PaymentStatus` enum: `pending | succeeded | failed | refunded | disputed`). Created as `pending` by `start-task` **before** Stripe confirm, then flipped by webhooks.
- **StripeEvents**: Dedupe table — stores every processed Stripe event `id` so retries from Stripe don't double-apply side effects.
- **PasswordResetCodes**: Rate-limited (3 per 15 min) hashed codes for password recovery.

### Stripe Connect

- Clients pay via PaymentIntent with a saved card.
- Proxies receive funds via merchant accounts (Stripe Connect Express).
- Platform charges a `platformFee` and calculates `proxyEarnings` upon task validation.
- Currency: BRL.
- Proxies can only accept tasks after `stripeAccountReady === true`.

### Stripe webhooks (`POST /stripe/webhook`)

- Signature verified via `StripeService.constructWebhookEvent` using `STRIPE_WEBHOOK_SECRET`.
- Deduped by `event.id` against `StripeEvents` (safe against Stripe retries).
- Handlers in `modules/stripe-webhook/use-cases/`:
  - `payment_intent.succeeded` → payment `pending → succeeded`
  - `payment_intent.payment_failed` → payment `failed`, revert task to `available`, delete mapping
  - `charge.refunded` → payment `refunded` + `refundId`
  - `charge.dispute.created` → payment `disputed`; **if task was already validated**, atomically reverse `proxyEarnings` from the executor's `walletBalance`
  - `account.updated` → flip `Users.stripeAccountReady`
  - `payout.failed` → log-only (no automated compensation yet)
- Unhandled event types are logged and return 200.

### 3DS / async payment flow

`POST /tasks/start` can return two shapes:

```ts
{ status: 'succeeded' }
{ status: 'requires_action', clientSecret: string | null }
```

When `requires_action` is returned, the frontend uses `clientSecret` to complete 3DS. The payment record already exists as `pending`; the eventual webhook (`payment_intent.succeeded` or `payment_intent.payment_failed`) finalizes state.

## Testing

Two layers:

- **Unit** (`*.spec.ts`, co-located with services): instantiate service directly with `jest.fn()` mocks. Fast (~1s for full suite). Use `src/modules/auth/test-utils/user.factory.ts` (`makeUser`) and `src/modules/tasks/test-utils/task.factory.ts` for fixtures.
- **E2E** (`test/**/*.e2e-spec.ts`): Testcontainers Postgres + real Prisma + Nest app; Stripe/Notification services replaced with jest mocks via `overrideProvider`. Factories in `test/factories/` seed users/tasks and return signed JWTs. DB is truncated in `beforeEach`.

Write new tests:
- For a use case → new `<use-case>.service.spec.ts` next to the service.
- For a route → new `test/<module>/<endpoint>.e2e-spec.ts`. Always test: 401 auth (when applicable), validation errors, each domain error, happy path side effects in DB.

## Environment variables

See `.env.example`. Required:
- `DATABASE_URL`, `NODE_ENV`, `PORT`
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (RS256, base64-encoded)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`
- `DEV_CALLBACK_URL`, `PROD_CALLBACK_URL` (for Stripe Connect onboarding redirects)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_FROM_EMAIL`

### Local Stripe webhook setup

`npm run start:dev` handles this automatically: runs `scripts/sync-stripe-secret.mjs` (captures `whsec_...` from `stripe listen --print-secret` into `.env`), then starts the API and `stripe listen --forward-to localhost:3333/stripe/webhook` in parallel via `concurrently`. Requires `stripe login` done once per machine.

## Troubleshooting

After schema changes, if tests fail in strange ways (wrong status codes, missing fields), refresh the build state:

```bash
npx prisma generate
npx jest --clearCache
rm -rf dist
```
