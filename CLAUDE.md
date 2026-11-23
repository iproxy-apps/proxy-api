# Proxy API

Backend API for a task/service marketplace platform with Stripe-powered payments.

## Stack

- **Runtime**: Node.js with TypeScript (ES2024, strict mode)
- **Framework**: NestJS 11 (CommonJS, decorators enabled; bootstrap uses `rawBody: true` for Stripe webhooks; `app.enableCors()` in `main.ts`)
- **ORM**: Prisma 7 with PostgreSQL adapter (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (does not use class-validator)
- **Authentication**: JWT RS256 (passport-jwt) with base64-encoded public/private keys; `JwtStrategy.validate` queries `Users.isDeleted` and rejects tokens of removed accounts
- **Rate limiting**: `@nestjs/throttler` globally (100 req/min default per route+IP, 5 req/min on `/auth/session`, `/auth/create`, `/auth/forgot-password`, `/auth/verify-reset-code`; `TRUST_PROXY` hops honoured for the client IP). `@SkipThrottle()` on the Stripe webhook controller. Bypassed when `NODE_ENV=test`, or when `LOOP_TEST_HOOKS=1` outside production.
- **Payments**: Stripe SDK (Connect with merchant accounts, `stripe.transfers.create` on validate) + webhooks for async state
- **Notifications**: AWS SES (email) and AWS SNS (SMS) via `@aws-sdk/client-ses` and `@aws-sdk/client-sns` — currently only used by `forgot-password`
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
    ├── auth/                  # Authentication, accounts (incl. soft-delete), merchant (Stripe Connect)
    ├── tasks/                 # Full task lifecycle CRUD
    ├── cards/                 # User payment methods (soft-deletable)
    ├── payments/              # Payment records (intents, refunds) — internal services, no HTTP
    ├── ratings/               # 1-rating-per-task, recomputes Users.rating as average
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

### Route surface

Public route map (auth required everywhere except where noted):

- **Auth** — `POST /auth/session` (public, throttled 5/min), `POST /auth/create` (public, throttled 5/min), `POST /auth/forgot-password` (public, throttled 5/min), `POST /auth/verify-reset-code` (public, throttled 5/min), `POST /auth/reset-password` (public), `POST /auth/update-profile`, `POST /auth/merchant-account`, `GET /auth/merchant-dashboard`, `GET /auth/transaction-history`, `DELETE /auth/account` (soft delete, blocked by active tasks).
- **Tasks** — `POST /tasks/create` (returns `{ id }`), `GET /tasks/fetch?city=&page=` (paginated available tasks), `GET /tasks/price-preview?offeredPrice=` (D1 breakdown as five numbers), `GET /tasks/active` (tasks where caller is owner or executor and status ∈ `accepted | on_the_way | in_progress | verification_required`), `GET /tasks/:id` (single task with embedded `payment`), `POST /tasks/start`, `POST /tasks/finish` (multipart, JPG/PNG/WEBP), `POST /tasks/validate` (accepts optional `rating` 1–5 and `comment` ≤500 chars), `POST /tasks/cancel`.
- **Cards** — `POST /card/setup-intent`, `POST /card/create`, `GET /card/fetch`, `DELETE /card/:id` (detaches PaymentMethod on Stripe + soft delete).
- **Stripe** — `POST /stripe/webhook` (public, signature verified, `@SkipThrottle()`).
- **Health** — `GET /health` (public, `@SkipThrottle()`, pings the database with `SELECT 1`; 503 `HEALTH_DATABASE_UNAVAILABLE` when it fails).

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

- **Users**: Clients and proxies, with `walletBalance`, `stripeCustomerId`/`stripeAccountId`, `stripeAccountReady` (true after `account.updated` webhook confirms charges+payouts enabled), soft delete (`isDeleted`). On `DELETE /auth/account`, PII is anonymized (`name`, `email`, `phoneNumber`, `avatarUrl`, `documentUrl`, `documentType`) and `isDeleted` is set; deletion is blocked when the user has active tasks.
- **Tasks**: Lifecycle: `available → accepted → on_the_way → in_progress → verification_required → completed | canceled | payout_failed`. `completedAt` is set when the proxy finishes (`finish-task`); validation updates status, fees, and the `transferId` of the Stripe Transfer created at that point. `payout_failed` is reached when a Stripe Transfer that succeeded later belongs to a payout that failed (see webhooks below).
- **Cards**: Saved cards via Stripe (brand, last4, stripeCardId). Soft-deletable via `isDeleted`; `DELETE /card/:id` detaches the PaymentMethod on Stripe and marks the row.
- **UserTaskMapping**: Links executor (proxy) to a task.
- **Payments**: Payment record with `status` (`PaymentStatus` enum: `pending | succeeded | failed | refunded | disputed`). Created as `pending` by `start-task` **before** Stripe confirm, then flipped by webhooks.
- **Ratings**: One rating per task (`taskId @unique`), with `raterId`/`ratedId`/`score (1-5)`/`comment?`. Inserted from `/tasks/validate` when a rating is included in the body; `RateProxyService` then writes the average of `score` back to `Users.rating`.
- **StripeEvents**: Dedupe table — stores every processed Stripe event `id` so retries from Stripe don't double-apply side effects.
- **PasswordResetCodes**: Rate-limited (3 per 15 min) hashed codes for password recovery. Each code has a single `state` enum (`PasswordResetCodeState`) that traces its lifecycle: `pending → verified → used`. `POST /auth/verify-reset-code` consumes a `pending` code and transitions it to `verified`; `POST /auth/reset-password` consumes a `verified` code and transitions it to `used`. Re-verifying or re-using a code at any later state returns `PASSWORD_RESET_INVALID_CODE`. `reset-password` updates the user's password and transitions the code to `used` in a single Prisma transaction, so the code is never left in a reusable state after a successful reset.

### Stripe Connect

- Clients pay via PaymentIntent with a saved card (full amount lands in the platform account).
- On `/tasks/validate`, the platform creates a `stripe.transfers.create({ amount, destination: proxy.stripeAccountId, metadata.taskId })` to push `proxyEarnings` (in centavos) to the proxy's Connect account. The transfer id is persisted on `Tasks.transferId @unique`. If the proxy lacks `stripeAccountReady`/`stripeAccountId`, validate returns `PROXY_ACCOUNT_NOT_READY` (409) and no state changes.
- `Tasks.platformFee` stores the 20% platform cut; `Tasks.proxyEarnings` stores the actual net paid to the proxy (`offeredPrice - stripeFee - platformFee`). The Stripe processing fee is not persisted — it is derivable.
- `Users.walletBalance` is internal accounting that mirrors what was transferred; credited on validate, debited atomically on dispute reversal and payout-failed compensation.
- Currency: BRL (amounts to Stripe are `* 100` cents).
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
  - `payout.failed` → compensation: lists balance transactions for the failed payout on the connected account, finds each task by `transferId`, calls `stripe.transfers.createReversal`, debits `walletBalance` by `proxyEarnings`, decrements `totalTasksCompleted`, and sets the task to `payout_failed` (clearing `transferId`). Errors per-transfer are logged and don't break the loop.
- Unhandled event types are logged and return 200.

### 3DS / async payment flow

`POST /tasks/start` can return two shapes:

```ts
{ status: 'succeeded' }
{ status: 'requires_action', clientSecret: string | null }
```

When `requires_action` is returned, the frontend uses `clientSecret` to complete 3DS. The payment record already exists as `pending`; the eventual webhook (`payment_intent.succeeded` or `payment_intent.payment_failed`) finalizes state. The frontend can poll the current payment status via `GET /tasks/:id`, which embeds the `Payments` row under `payment`.

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

## Release 1.0 workstream (read first)

All audit reports, the release plan and the live status board for the 1.0 release live in
`proxy-app/docs/release-1.0/`. At the start of ANY session on either repo, read
`proxy-app/docs/release-1.0/START-HERE.md` before touching code: it says what is done, what is in
progress and what to pick up next. When you finish a task, update `STATUS.md` in that folder in the
same change, so progress survives new sessions, machine switches and context compaction.

## Loop dev stack

Local stack for the autonomous simulator loop (Postgres compose container `proxy`, api on 3333 with test hooks, `stripe listen` forwarding webhooks). State lives in `.dev-stack/` (gitignored); `.env` is never rewritten.

```bash
scripts/dev-stack.sh up      # start (exit 0 ok, 1 precondition failed, 2 api timeout)
DEV_STACK_TEST_HOOKS=0 scripts/dev-stack.sh up   # same, but without the loop hooks (throttler on, /__test/* 404)
scripts/dev-stack.sh status  # pids, listener, container, hooks
scripts/dev-stack.sh logs    # tail api + stripe logs
scripts/dev-stack.sh down    # stop only what `up` started (container is left running)
```

Test hooks (`/__test/*`) are live only under `dev-stack.sh up`; see `src/modules/test-hooks`.
