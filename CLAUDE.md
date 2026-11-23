# Proxy API

Backend API for a task/service marketplace platform with Stripe-powered payments.

## Stack

- **Runtime**: Node.js with TypeScript (ES2024, strict mode)
- **Framework**: NestJS 11 (CommonJS, decorators enabled; bootstrap uses `rawBody: true` for Stripe webhooks; `app.enableCors()` in `main.ts`)
- **ORM**: Prisma 7 with PostgreSQL adapter (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (does not use class-validator)
- **Authentication**: JWT RS256 (passport-jwt) with base64-encoded public/private keys; `JwtStrategy.validate` queries `Users.isDeleted` and rejects tokens of removed accounts
- **Rate limiting**: `@nestjs/throttler` globally (100 req/min default per route+IP, 5 req/min on `/auth/session`, `/auth/create`, `/auth/forgot-password`, `/auth/verify-reset-code`; `TRUST_PROXY` hops honoured for the client IP). `@SkipThrottle()` on the Stripe webhook controller. Bypassed when `NODE_ENV=test`, or when `LOOP_TEST_HOOKS=1` outside production.
- **Payments**: Stripe SDK, Connect with separate charges and transfers: the client's card is charged off-session when a proxy starts a task (automatic capture), the proxy is paid with a transfer tied to that charge (`source_transaction`) on validate; webhooks reconcile async state
- **Notifications**: AWS SES (email) and AWS SNS (SMS) via `@aws-sdk/client-ses` and `@aws-sdk/client-sns` — used by `forgot-password` and by `/tasks/start` (e-mail "Confirme seu cartão na Carteira" to the client when the card charge fails)
- **Proof storage**: `src/storage` (`PROOF_STORAGE`); S3-compatible bucket (Cloudflare R2) when `S3_BUCKET` is set, otherwise local disk
- **Scheduling**: `@nestjs/schedule`; one cron, `AutoReleaseTasksJob` (see Stripe Connect)
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
├── storage/                   # ProofStorage (S3/R2 or local disk), StorageModule
├── common/                    # money.ts: fee model (computeCharge, toCentavos)
├── health/                    # GET /health
├── notification/              # NotificationService (AWS SES for email, SNS for SMS)
└── modules/
    ├── auth/                  # Authentication, accounts (incl. soft-delete), merchant (Stripe Connect)
    ├── tasks/                 # Full task lifecycle CRUD
    ├── cards/                 # User payment methods (soft-deletable)
    ├── payments/              # Payment records (charges, refunds, disputes) — repository only, no HTTP
    ├── ratings/               # 1-rating-per-task, recomputes Users.rating as average
    ├── stripe-webhook/        # Stripe webhook endpoint + event handlers
    └── test-hooks/            # /__test/* hooks for the local loop (off unless LOOP_TEST_HOOKS=1)

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

- **Auth** — `POST /auth/session` (public, throttled 5/min), `GET /auth/session/refresh`, `POST /auth/create` (public, throttled 5/min), `POST /auth/forgot-password` (public, throttled 5/min), `POST /auth/verify-reset-code` (public, throttled 5/min), `POST /auth/reset-password` (public), `POST /auth/update-profile`, `POST /auth/merchant-account`, `GET /auth/merchant-dashboard`, `GET /auth/transaction-history`, `DELETE /auth/account` (soft delete, blocked while `GET /tasks/active` would return any task).
- **Tasks** — `POST /tasks/create` (CLIENT only; returns `{ id }`; `pricing.offeredPrice` 20–10 000 with 2 decimals; `cardDetails: { savedCard } | { paymentMethodId }`), `GET /tasks/fetch?city=&page=` (paginated available tasks), `GET /tasks/price-preview?offeredPrice=` (five numbers: `offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`), `GET /tasks/active` (as owner: status ∈ `available | accepted | on_the_way | in_progress | verification_required`; as executor: the same without `available`; tasks whose owner is `isDeleted` are excluded), `GET /tasks/:id` (single task with embedded `payment`), `GET /tasks/:id/proof` (streams the proof `image/jpeg` from storage; owner or executor only, 404 otherwise), `POST /tasks/start` (charges the client, returns `{ status: 'succeeded' }`), `POST /tasks/finish` (multipart `file` **required**, JPG/PNG/WEBP/HEIC, stored as JPEG with the long edge ≤ 1600 px), `POST /tasks/validate` (accepts optional `rating` 1–5 and `comment` ≤500 chars; pays the proxy), `POST /tasks/cancel` (refunds a succeeded charge).
- **Cards** — `POST /card/setup-intent` (returns `{ clientSecret, setupIntentId }`), `POST /card/create` (body `{ paymentMethodId }`; saves the card and clears `Users.cardActionRequired`), `GET /card/fetch`, `DELETE /card/:id` (detaches PaymentMethod on Stripe + soft delete).
- **Stripe** — `POST /stripe/webhook` (public, signature verified, `@SkipThrottle()`).
- **Health** — `GET /health` (public, `@SkipThrottle()`, pings the database with `SELECT 1`; 503 `HEALTH_DATABASE_UNAVAILABLE` when it fails). Lives in `src/health`, not in `src/modules`.
- **Test hooks** — `POST /__test/seed-user`, `POST /__test/mark-account-ready`, `POST /__test/reset` (`@SkipThrottle()`; 404 unless `LOOP_TEST_HOOKS=1` outside production, 403 `TEST_HOOKS_FORBIDDEN` unless `DATABASE_URL` is a loopback host).

Route-map check: `ls src/modules/*/controllers | grep -c controller.ts` is 29 = 11 auth + 10 tasks + 4 cards + 1 stripe webhook + 3 test hooks (`/health` is the only route outside `src/modules`).

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

- **Users**: Clients and proxies, with `walletBalance` ("total recebido": credited with `proxyEarnings` on validate, never debited), `stripeCustomerId`/`stripeAccountId`, `stripeAccountReady` (true after `account.updated` webhook confirms charges+payouts enabled), `payoutIssue` (set by the `payout.failed` webhook; cleared by `account.updated` when payouts are enabled), `cardActionRequired` (set by `/tasks/start` when the client's card cannot be charged — in the claim-release transaction or the no-card branch — and cleared by `POST /card/create`), soft delete (`isDeleted`). On `DELETE /auth/account`, PII is anonymized (`name`, `email`, `phoneNumber`, `avatarUrl`, `documentUrl`, `documentType`) and `isDeleted` is set; deletion is blocked when the user has any task in the `GET /tasks/active` set.
- **Tasks**: Lifecycle: `available → in_progress → verification_required → completed | canceled`. `accepted` and `on_the_way` exist in the `TaskStatus` enum only: no use case writes them and the UI ignores them. `payout_failed` is kept for old rows and is never written. Money columns are set at create from `src/common/money.ts` (`computeCharge`): `chargedAmount = offeredPrice`, `platformFee = 20 %` of `offeredPrice`, `proxyEarnings = offeredPrice − platformFee` (80 %), `stripeFee = 3.99 % × chargedAmount + 0.39` (all rounded half-up to 2 dp). The Stripe fee is paid by the platform out of its cut: platform net = `platformFee − stripeFee`, derived, not stored. `startedAt` is the claim time (set by `start`, cleared on claim release). `completedAt` and `proofImageUrl` (storage key `<taskId>/<uuid>.jpg`) are set when the proxy finishes. `transferId @unique` is the Stripe Transfer created on validate.
- **Cards**: Saved cards via Stripe (brand, last4, stripeCardId). One active card per user (partial unique index `cards_one_active_per_user` on non-deleted rows); saving a new one replaces the old and detaches the previous PaymentMethod on Stripe. Soft-deletable via `isDeleted`; `DELETE /card/:id` detaches the PaymentMethod on Stripe and marks the row.
- **UserTaskMapping**: Links executor (proxy) to a task; created by the claim and deleted when the claim is released.
- **Payments**: `status` (`PaymentStatus` enum: `pending | succeeded | failed | refunded | disputed`), `amount = chargedAmount`, `paymentIntent` (unique), `chargeId`, `refundId`, `disputeId`. `start` writes the row as `succeeded` after Stripe answers; the `payment_intent.succeeded` webhook writes or completes the same row from the PaymentIntent metadata, idempotently (either may go first; the second only back-fills `chargeId`). `pending` exists only on rows created before Phase 1.
- **Ratings**: One rating per task (`taskId @unique`), with `raterId`/`ratedId`/`score (1-5)`/`comment?`. Inserted from `/tasks/validate` when a rating is included in the body; `RateProxyService` then writes the average of `score` back to `Users.rating`.
- **StripeEvents**: Dedupe table — stores every processed Stripe event `id` so retries from Stripe don't double-apply side effects.
- **PasswordResetCodes**: Rate-limited (3 per 15 min) hashed codes for password recovery. Each code has a single `state` enum (`PasswordResetCodeState`) that traces its lifecycle: `pending → verified → used`. `POST /auth/verify-reset-code` consumes a `pending` code and transitions it to `verified`; `POST /auth/reset-password` consumes a `verified` code and transitions it to `used`. Re-verifying or re-using a code at any later state returns `PASSWORD_RESET_INVALID_CODE`. `reset-password` updates the user's password and transitions the code to `used` in a single Prisma transaction, so the code is never left in a reusable state after a successful reset.

### Stripe Connect

Separate charges and transfers. The platform account receives the client's money and later transfers the proxy's share to the proxy's Connect account.

- Fee model (`src/common/money.ts`): the client pays exactly `offeredPrice`; the platform keeps 20 %; the proxy receives 80 %; Stripe's fee comes out of the platform's 20 %. Example, R$ 100: client pays 100.00, proxy receives 80.00, platform fee 20.00, of which Stripe takes 4.38, platform net 15.62. Amounts sent to Stripe are centavos (`toCentavos`), currency BRL.
- `POST /tasks/start` sequence:
  1. Gates: task is `available` (or `in_progress` and held by the caller), caller is not the owner, caller is a PROXY with `stripeAccountReady`. A replay by the claim holder whose payment already succeeded returns `{ status: 'succeeded' }` without touching the card.
  2. Owner card and Stripe customer must exist. If missing and the proxy does not yet hold the claim: `Users.cardActionRequired` is set, the client gets the "Confirme seu cartão na Carteira" e-mail and the proxy gets 409 `PAYMENT_FAILED`. If missing but the proxy already holds the live claim: 409 `PAYMENT_PENDING`, claim kept, no flag, no e-mail.
  3. CAS claim: `available → in_progress` plus the `UserTaskMapping` row (`TasksRepository.claimTask`). On CAS loss the claim is re-read through `TasksRepository.fetchClaim` (RepeatableRead snapshot); the same proxy resumes its own claim, anyone else gets `TASK_NOT_AVAILABLE`.
  4. PaymentIntent created and confirmed off-session for `chargedAmount` with automatic capture; idempotency key `start:<taskId>:<proxyId>:<startedAt ms>`; metadata `{ taskId, proxyId, claimedAt }`; `transfer_group = taskId`. Succeeded → `Payments` row written as `succeeded` (with `chargeId`) → response `{ status: 'succeeded' }`.
  5. Definite failure (Stripe error `type` `StripeCardError` or `StripeInvalidRequestError`, or an intent in any non-succeeded, non-processing state) → claim released (task back to `available`, mapping deleted, `cardActionRequired` set in the same transaction), client e-mailed, proxy gets 409 `PAYMENT_FAILED`. Unknown outcome (any other error, or the intent is still processing) → claim kept, 409 `PAYMENT_PENDING`; a retry resumes the same claim and key.
  - The charged funds sit in the platform balance until validate.
- `POST /tasks/validate` sequence: owner check, status must be `verification_required` (else 409 `TASK_STATUS_CONFLICT`), the executor mapping must exist (else 404 `TASK_MAPPING_NOT_FOUND`), proxy must have `stripeAccountReady` and `stripeAccountId` (else 409 `PROXY_ACCOUNT_NOT_READY`), payment check (`disputed` → 409 `PAYMENT_DISPUTED`; not `succeeded` or no `chargeId` → 409 `PAYMENT_NOT_CONFIRMED`), CAS `verification_required → completed`, then `transfers.create({ amount: proxyEarnings, destination: proxy.stripeAccountId, source_transaction: chargeId, transfer_group: taskId }, { idempotencyKey: 'task:<id>:transfer' })`, then one transaction that stores `Tasks.transferId` and credits `Users.walletBalance` and `totalTasksCompleted`. If the transfer fails the CAS is reverted and the response is 500 `TASK_TRANSFER_FAILED`. If `recordTransfer` fails after the transfer succeeded, the task stays `completed` (not reverted) and the error is logged for manual reconciliation. The optional rating is written last and never fails the validate.
- `POST /tasks/cancel`: owner only, status `available`, or `in_progress` within 1 h of `startedAt`. A disputed payment → 409 `PAYMENT_DISPUTED` before anything is written. Otherwise CAS to `canceled`; the payment is re-read after the CAS and, if it turned `disputed`, the cancel is reverted with 409 `PAYMENT_DISPUTED`. Then a full refund of a `succeeded` charge (idempotency key `task:<id>:refund`, shared with the webhook refund) and the payment row becomes `refunded`; a refund failure reverts the CAS (500 `REFUND_FAILED`).
- Cards: saved with a SetupIntent (`POST /card/setup-intent`, `usage: 'off_session'`) confirmed on the client's device; `POST /card/create` verifies the PaymentMethod belongs to the user's customer (else 400 `CARD_NOT_CONFIRMED`) and replaces the previous card, detaching the previous PaymentMethod. A concurrent duplicate hits the partial unique index → 409 `CARD_ALREADY_EXISTS`.
- Proxies can only accept tasks after `stripeAccountReady === true`.
- Auto-release: `AutoReleaseTasksJob` runs daily at `0 3 * * *` (America/Sao_Paulo) and runs the validate use case as the owner for every task that has been `verification_required` for 7 days (`AUTO_RELEASE_AFTER_DAYS`, up to 200 per run, oldest first); failures are logged and skipped.
- Proof storage: `StorageModule` picks S3/R2 when `S3_BUCKET` is set (missing `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` throws at boot), else local disk at `PROOF_DIR` or `./tmp/proofs`. `POST /tasks/finish` requires the photo (400 `PROOF_PHOTO_REQUIRED`) and is blocked on a disputed payment.

### Stripe webhooks (`POST /stripe/webhook`)

- Two endpoints/secrets: `STRIPE_WEBHOOK_SECRET` (platform events) and `STRIPE_CONNECT_WEBHOOK_SECRET` (connected-account events, optional). `StripeService.constructWebhookEvent` tries the platform secret first, then the Connect one; an invalid signature is 400 `WEBHOOK_INVALID_SIGNATURE`.
- Deduped by `event.id` against `StripeEvents` **before** the handler runs; if the handler throws the dedupe row is removed so Stripe's retry reprocesses the event.
- Handlers in `modules/stripe-webhook/use-cases/`:
  - `payment_intent.succeeded` → writes or completes the `succeeded` payment row idempotently (task id from the existing row or the PaymentIntent metadata, amount from the intent); failed/refunded/disputed rows are left untouched; if the task is already `canceled`, the charge is refunded in full (key `task:<id>:refund`) and the row becomes `refunded`
  - `payment_intent.payment_failed` → a legacy `pending` row is marked `failed` and its task reverted to `available`; otherwise, if no payment row exists, releases only the open claim named by the metadata (`taskId`, `proxyId`, `claimedAt`); never downgrades an existing row
  - `charge.refunded` → full refund: payment `refunded` + `refundId` (from `succeeded` or `pending` only); partial refund: status unchanged, `refundId` stored
  - `charge.dispute.created` → payment `disputed` + `disputeId`; logged for manual review, no balance movement. A disputed payment blocks finish, validate and cancel (409 `PAYMENT_DISPUTED`)
  - `account.updated` → sets `Users.stripeAccountReady` (charges and payouts enabled) and clears `payoutIssue` when payouts are enabled
  - `payout.failed` → sets `Users.payoutIssue` on the user owning the connected account (`event.account`); no reversal and no wallet change
- Unhandled event types are logged and return 200.

### Card authentication and the start charge

3DS happens once, when the card is saved: the SetupIntent from `POST /card/setup-intent` is confirmed on the client's device. `POST /tasks/start` then charges the saved card off-session and returns one of:

```ts
{ status: 'succeeded' }                               // 200
409 PAYMENT_FAILED   // "Não foi possível cobrar o cliente. Tente outra tarefa."
409 PAYMENT_PENDING  // outcome unknown, claim kept; retry later
```

There is no authentication challenge on the proxy's device and no `clientSecret` in the response. After `PAYMENT_PENDING` the proxy retries `/tasks/start` (same claim, same key) or the webhook completes the payment row; `GET /tasks/:id` embeds the `Payments` row under `payment`.

### Error codes added or changed in Phase 1 (for the SPEC §3.3 sync)

- Added: `PAYMENT_NOT_CONFIRMED` 409, `PAYMENT_DISPUTED` 409, `PAYMENT_PENDING` 409, `PROOF_PHOTO_REQUIRED` 400, `TASK_STATUS_CONFLICT` 409, `USER_NOT_CLIENT` 403, `CARD_NOT_CONFIRMED` 400, `CARD_ALREADY_EXISTS` 409.
- Changed: `PAYMENT_FAILED` is now 409 (was 402) with message "Não foi possível cobrar o cliente. Tente outra tarefa.".
- Removed: `TASK_STARTED_AT_NOT_VALID`, `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `TRANSFER_FAILED` (the transfer error that remains is `TASK_TRANSFER_FAILED`, 500).

## Testing

Two layers:

- **Unit** (`*.spec.ts`, co-located with services): instantiate service directly with `jest.fn()` mocks. Fast (~1s for full suite). Use `src/modules/auth/test-utils/user.factory.ts` (`makeUser`) and `src/modules/tasks/test-utils/task.factory.ts` for fixtures.
- **E2E** (`test/**/*.e2e-spec.ts`): Testcontainers Postgres + real Prisma + Nest app; Stripe/Notification services replaced with jest mocks via `overrideProvider`. Factories in `test/factories/` seed users/tasks and return signed JWTs. DB is truncated in `beforeEach`.

Write new tests:
- For a use case → new `<use-case>.service.spec.ts` next to the service.
- For a route → new `test/<module>/<endpoint>.e2e-spec.ts`. Always test: 401 auth (when applicable), validation errors, each domain error, happy path side effects in DB.

## Environment variables

See `.env.example`. Required:
- `DATABASE_URL`
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (RS256, base64-encoded)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `DEV_CALLBACK_URL`, `PROD_CALLBACK_URL` (for Stripe Connect onboarding redirects)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_FROM_EMAIL`

Optional:
- `STRIPE_CONNECT_WEBHOOK_SECRET` (secret of the connected-account webhook endpoint)
- `STRIPE_PUBLIC_KEY` (unused by the API)
- `S3_BUCKET` (enables S3/R2 proof storage), `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (the two keys are required once `S3_BUCKET` is set)
- `PROOF_DIR` (local proof storage directory when `S3_BUCKET` is unset; default `./tmp/proofs`)
- `NODE_ENV` (default `development`), `PORT` (default 3333), `TRUST_PROXY` (default 0), `LOOP_TEST_HOOKS` (`0`/`1`, default `0`), `AWS_REGION` (default `us-east-1`)

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
