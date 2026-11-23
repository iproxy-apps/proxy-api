# Proxy API

Backend API for a task/service marketplace platform with Stripe-powered payments.

## Stack

- **Runtime**: Node.js 22 with TypeScript (ES2024, strict mode). The repo pins Node 22 via `.nvmrc` and `engines`; Node 24.12.0 crashes the e2e suite in a V8 GC bug, so run `nvm use` before tests.
- **Framework**: NestJS 11 (CommonJS, decorators enabled; bootstrap uses `rawBody: true` for Stripe webhooks; `app.enableCors()` in `main.ts`)
- **ORM**: Prisma 7 with PostgreSQL adapter (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (does not use class-validator)
- **Authentication**: RS256 access JWT (passport-jwt, base64-encoded public/private keys, `expiresIn: '30m'`) plus opaque rotating refresh tokens. `POST /auth/session` and `POST /auth/create` return `{ session, refreshToken }`. The refresh token is 32 random bytes (base64url); only its SHA-256 hash is stored (`refresh_tokens.tokenHash`), valid 60 days from issue (sliding: every `POST /auth/refresh` rotates it and extends 60 days). Presenting a token that was already rotated or revoked revokes its whole family (`familyId`) and answers 401 `SESSION_REFRESH_INVALID`. `JwtStrategy.validate` requires `exp` plus the full session claim set, then queries `Users.isDeleted` and the DB `userType` (the claim is overridden by the DB value) and rejects tokens of removed accounts. Password reset (`POST /auth/reset-password`) and account deletion revoke every refresh token of the user; `POST /auth/logout` revokes the family of the token sent
- **Rate limiting**: `@nestjs/throttler` globally (100 req/min default per route+IP, 5 req/min on `/auth/session`, `/auth/create`, `/auth/forgot-password`, `/auth/verify-reset-code`, `/auth/reset-password`; 30 req/min on `/auth/refresh`; 10 req/min on `/auth/logout`; `TRUST_PROXY` hops honoured for the client IP). `@SkipThrottle()` on the Stripe webhook controller. Bypassed when `NODE_ENV=test`, or when `LOOP_TEST_HOOKS=1` outside production.
- **Payments**: Stripe SDK, Connect with separate charges and transfers: the client's card is charged off-session when a proxy starts a task (automatic capture), the proxy is paid with a transfer tied to that charge (`source_transaction`) on validate; webhooks reconcile async state
- **Notifications**: e-mail through the `MailPort` abstraction (`src/notification/mail`): Resend adapter by default (`MAIL_PROVIDER=resend`, needs `RESEND_API_KEY`), AWS SES adapter via `MAIL_PROVIDER=ses`; sender is `MAIL_FROM` — used by `forgot-password` (delivered in a detached job so the response time does not reveal whether the account exists) and by `/tasks/start` (e-mail "Confirme seu cartão na Carteira" to the client when the card charge fails)
- **Proof storage**: `src/storage` (`PROOF_STORAGE` is the DI token, a Symbol in `src/storage/proof-storage.ts`; the env keys are `PROOF_DIR` and `S3_*`); S3-compatible bucket (Cloudflare R2) when `S3_BUCKET` is set, otherwise local disk
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
├── notification/              # NotificationService + mail/ (MailPort: Resend and SES adapters)
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

- **Auth** — `POST /auth/session` (public, throttled 5/min; body `{ email, password }`; 200 `{ session, refreshToken }`; 401 `USER_INVALID_CREDENTIALS` for unknown email, deleted user and wrong password alike, same timing), `POST /auth/create` (public, throttled 5/min; strict body `{ name, email, password (8–72), userType: CLIENT | PROXY, phoneNumber?, termsAccepted: true }`; legacy identity-document keys sent by the old app are tolerated and ignored; 200 `{ session, refreshToken }`; 409 `USER_EMAIL_EXISTS`; 503 `SIGN_UP_UNAVAILABLE` and the user row is rolled back when the Stripe customer cannot be created; e-mails are lower-cased), `GET /auth/me` (200 profile: `id`, `name`, `email`, `phoneNumber`, `avatarUrl`, `userType`, `rating`, `totalTasksCompleted`, `totalTasksCreated`, `walletBalance`, `stripeAccountId`, `stripeAccountReady`, `payoutIssue`, `cardActionRequired`, `termsAccepted`; numbers are JSON numbers), `GET /auth/session/refresh` (access token only; re-signs the session JWT from the DB, returns `{ session }`, no refresh token), `POST /auth/refresh` (public, throttled 30/min; body `{ refreshToken }`; rotates and returns `{ session, refreshToken }`; 401 `SESSION_REFRESH_INVALID`), `POST /auth/logout` (public, throttled 10/min; body `{ refreshToken }`; always 204, revokes the token family when the token is known), `POST /auth/forgot-password` (public, throttled 5/min; always the same generic 200 message), `POST /auth/verify-reset-code` (public, throttled 5/min), `POST /auth/reset-password` (public, throttled 5/min; body `{ email, code (6 chars), newPassword (8–72) }`), `POST /auth/update-profile` (body `{ name?, phoneNumber? }` strict, at least one; `phoneNumber` may be `null`; returns `{ session }` only), `POST /auth/merchant-account`, `GET /auth/merchant-dashboard`, `GET /auth/transaction-history?page=` (`{ tasksCreated, tasksCompleted, page, perPage: 20, hasMore }`; each item `{ id, title, status, city, offeredPrice, netAmount, createdAt, completedAt, canceledAt }`; `netAmount` is read from the stored columns: proxy side `proxyEarnings` (0 when `canceled`), client side `chargedAmount` only when `completed`; executed tasks are those with status `completed | canceled | payout_failed`), `DELETE /auth/account` (204; soft delete; `available` tasks owned by the user are canceled automatically; blocked with 409 `USER_HAS_ACTIVE_TASKS` while the user owns or executes a task in `in_progress | verification_required`; PII is scrubbed, cards soft-deleted and detached, the Stripe customer scrubbed, all refresh tokens revoked).
- **Tasks** — `POST /tasks/create` (CLIENT only, 201 `{ id }`; `pricing.offeredPrice` 20–10 000 with 2 decimals; `address: { formattedAddress, complement?, city, state, locationLat, locationLng }` with `city`/`state` matched against the served cities (`src/common/served-cities.ts`: São Paulo/SP, Rio de Janeiro/RJ, Belo Horizonte/MG), else 400 `CITY_NOT_SERVED`; legacy `street` + `zipCode` instead of `formattedAddress` is still accepted until Phase 5; `cardDetails: { savedCard } | { paymentMethodId }`), `GET /tasks/fetch?city=&page=` (available tasks of one served city, owners not deleted, newest first; `{ items, page, perPage: 10, hasMore }`; a city that is not served returns an empty page), `GET /tasks/price-preview?offeredPrice=` (five numbers: `offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`; same 20–10 000 bounds), `GET /tasks/active` (as owner: status ∈ `available | accepted | on_the_way | in_progress | verification_required`, in practice `available | in_progress | verification_required` because the other two are never written; as executor: the same without `available`; tasks whose owner is `isDeleted` are excluded), `GET /tasks/:id` (visible to the owner, the executor, or any PROXY while the task is `available`; everyone else gets 404 `TASK_NOT_FOUND`; embeds `executor` and, for the owner only, the latest `payment` without `paymentIntent`; the counterpart's `phoneNumber` appears only to the owner/executor while the task is `in_progress` or `verification_required`), `GET /tasks/:id/proof` (streams the proof image from storage, `Cache-Control: private, max-age=300`; owner or executor only, 404 otherwise), `POST /tasks/start` (charges the client, returns `{ status: 'succeeded' }`), `POST /tasks/finish` (multipart `file` **required**, JPG/PNG/WEBP/HEIC, stored as JPEG with the long edge ≤ 1600 px), `POST /tasks/validate` (accepts optional `rating` 1–5 and `comment` ≤500 chars; pays the proxy; 409 `TASK_STATUS_CONFLICT` outside `verification_required`), `POST /tasks/cancel` (refunds a succeeded charge).
  - Task JSON (list, active, by id): money columns (`offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`) and `locationLat`/`locationLng` are JSON numbers; `ownerId` is the public owner `{ id, name, avatarUrl, rating, totalTasksCreated }`; `city`, `state`, `startedAt`, `completedAt`, `canceledAt`, `proofImageUrl`, `owner` (the owner id) are included.
- **Cards** — `POST /card/setup-intent` (returns `{ clientSecret, setupIntentId }`), `POST /card/create` (body `{ paymentMethodId }`; saves the card and clears `Users.cardActionRequired`), `GET /card/fetch`, `DELETE /card/:id` (detaches PaymentMethod on Stripe + soft delete).
- **Stripe** — `POST /stripe/webhook` (public, signature verified, `@SkipThrottle()`).
- **Health** — `GET /health` (public, `@SkipThrottle()`, pings the database with `SELECT 1`; 503 `HEALTH_DATABASE_UNAVAILABLE` when it fails). Lives in `src/health`, not in `src/modules`.
- **Test hooks** — `POST /__test/seed-user`, `POST /__test/mark-account-ready`, `POST /__test/reset` (`@SkipThrottle()`; 404 unless `LOOP_TEST_HOOKS=1` outside production, 403 `TEST_HOOKS_FORBIDDEN` unless `DATABASE_URL` is a loopback host; `seed-user` still uses `StripeService.searchCustomer` (kept for the loop seed hook only; account creation does not call it)).

Route-map check: `grep -rhoE "@(Controller|Get|Post|Delete)\([^)]*\)" src/modules/*/controllers/*.ts | paste - - | sort | wc -l` is 32 = 14 auth + 10 tasks + 4 cards + 1 stripe webhook + 3 test hooks (`/health` is the only route outside `src/modules`).

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

- **Users**: Clients and proxies (`phoneNumber` is optional/nullable; no identity-document columns: the document type/URL and verified-flag columns and the `DocumentType` enum were dropped), with `walletBalance` ("total recebido": credited with `proxyEarnings` on validate, never debited), `stripeCustomerId`/`stripeAccountId`, `stripeAccountReady` (true after `account.updated` webhook confirms charges+payouts enabled), `payoutIssue` (set by the `payout.failed` webhook; cleared by `account.updated` when payouts are enabled), `cardActionRequired` (set by `/tasks/start` when the client's card cannot be charged — in the claim-release transaction or the no-card branch — and cleared by `POST /card/create`), soft delete (`isDeleted` + `deletedAt`). On `DELETE /auth/account`, PII is anonymized (`name` → `Conta removida`, `email` → `deleted-<id>@deleted.local`, `phoneNumber` and `avatarUrl` cleared, `password` invalidated) and `isDeleted`/`deletedAt` are set; the user's `available` tasks are canceled first, and deletion is blocked (409 `USER_HAS_ACTIVE_TASKS`) while the user owns or executes a task in `in_progress` or `verification_required`.
- **Tasks**: `city` and `state` hold the canonical served-city values (set at create from `src/common/served-cities.ts`); `/tasks/fetch` filters on `city` exactly. Lifecycle: `available → in_progress → verification_required → completed | canceled`. `accepted` and `on_the_way` exist in the `TaskStatus` enum only: no use case writes them and the UI ignores them. `payout_failed` is kept for old rows and is never written. Money columns are set at create from `src/common/money.ts` (`computeCharge`): `chargedAmount = offeredPrice`, `platformFee = 20 %` of `offeredPrice`, `proxyEarnings = offeredPrice − platformFee` (80 %), `stripeFee = 3.99 % × chargedAmount + 0.39` (all rounded half-up to 2 dp). The Stripe fee is paid by the platform out of its cut: platform net = `platformFee − stripeFee`, derived, not stored. `startedAt` is the claim time (set by `start`, cleared on claim release). `completedAt` and `proofImageUrl` (storage key `<taskId>/<uuid>.jpg`) are set when the proxy finishes. `canceledAt` is set when the task is canceled (by `/tasks/cancel` or by account deletion). `transferId @unique` is the Stripe Transfer created on validate. Financial foreign keys (`Tasks.owner`, `Payments.taskId`) use `onDelete: Restrict`; indexes on `(city, status, createdAt)`, `(status, createdAt)` and `owner`.
- **Cards**: Saved cards via Stripe (brand, last4, stripeCardId). One active card per user (partial unique index `cards_one_active_per_user` on non-deleted rows); saving a new one replaces the old and detaches the previous PaymentMethod on Stripe. Soft-deletable via `isDeleted`; `DELETE /card/:id` detaches the PaymentMethod on Stripe and marks the row.
- **UserTaskMapping**: Links executor (proxy) to a task; created by the claim and deleted when the claim is released.
- **Payments**: `status` (`PaymentStatus` enum: `pending | succeeded | failed | refunded | disputed`), `amount = chargedAmount`, `paymentIntent` (unique), `chargeId`, `refundId`, `disputeId`. `start` writes the row as `succeeded` after Stripe answers; the `payment_intent.succeeded` webhook writes or completes the same row from the PaymentIntent metadata, idempotently (either may go first; the second only back-fills `chargeId`). `pending` exists only on rows created before Phase 1.
- **Ratings**: One rating per task (`taskId @unique`), with `raterId`/`ratedId`/`score (1-5)`/`comment?`. Inserted from `/tasks/validate` when a rating is included in the body; `RateProxyService` then writes the average of `score` back to `Users.rating`.
- **StripeEvents**: Dedupe table — stores every processed Stripe event `id` so retries from Stripe don't double-apply side effects.
- **RefreshTokens**: `userId`, `familyId`, `tokenHash @unique` (SHA-256 of the opaque token), `expiresAt`, `revokedAt`, `replacedById` (set when the token is rotated). See Authentication in Stack.
- **PasswordResetCodes**: Rate-limited (3 per 15 min) hashed codes for password recovery, 15 minutes validity, `attempts` counts guesses (5 maximum per code and per state; reserved atomically before the compare; reset to 0 when the code becomes `verified`). Each code has a single `state` enum (`PasswordResetCodeState`) that traces its lifecycle: `pending → verified → used`. `POST /auth/verify-reset-code` consumes a `pending` code and transitions it to `verified`; `POST /auth/reset-password` consumes a `verified` code and transitions it to `used`. Re-verifying or re-using a code at any later state returns `PASSWORD_RESET_INVALID_CODE`. `reset-password` updates the user's password and transitions the code to `used` in a single Prisma transaction, so the code is never left in a reusable state after a successful reset. The same transaction revokes all the user's refresh tokens.

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
- Connect onboarding (`POST /auth/merchant-account`, PROXY only, else 403 `USER_NOT_PROXY`): creates an Express-dashboard account for Brazil (`country: 'BR'`, `default_currency: 'brl'`, `business_type: 'individual'`, `transfers` capability, fees and losses paid by the platform) once per user, then an `account_onboarding` account link with a single return URL, `STRIPE_CONNECT_RETURN_URL`; the refresh URL is the same URL with `refresh=1` appended (`?refresh=1`, or `&refresh=1` when it already has a query). Returns `{ accountLinkUrl }`; failures are 400 `MERCHANT_ACCOUNT_CREATION_FAILED`.
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

### Error codes added or changed (for the SPEC §3.3 sync)

- Added in Phase 2: `SIGN_UP_UNAVAILABLE` 503, `SESSION_REFRESH_INVALID` 401, `CITY_NOT_SERVED` 400. `PROXY_ACCOUNT_NOT_READY` 409 has two dictionary messages: `tasks.proxyAccountNotReady` on validate, `user.accountNotReadyToStart` on start. `PASSWORD_RESET_TOO_MANY_REQUESTS` and `PASSWORD_RESET_SEND_FAILED` no longer exist (forgot-password always answers the generic 200).
- Added in Phase 1: `PAYMENT_NOT_CONFIRMED` 409, `PAYMENT_DISPUTED` 409, `PAYMENT_PENDING` 409, `PROOF_PHOTO_REQUIRED` 400, `TASK_STATUS_CONFLICT` 409, `USER_NOT_CLIENT` 403, `CARD_NOT_CONFIRMED` 400, `CARD_ALREADY_EXISTS` 409.
- Changed: `PAYMENT_FAILED` is now 409 (was 402) with message "Não foi possível cobrar o cliente. Tente outra tarefa.".
- Removed: the start-window error (finish has no time limit), the not-available-for-validation error (now `TASK_STATUS_CONFLICT`) and the generic transfer error (the one that remains is `TASK_TRANSFER_FAILED`, 500).

## Testing

Two layers:

- **Unit** (`*.spec.ts`, co-located with services): instantiate service directly with `jest.fn()` mocks. Fast (~1s for full suite). Use `src/modules/auth/test-utils/user.factory.ts` (`makeUser`) and `src/modules/tasks/test-utils/task.factory.ts` for fixtures.
- **E2E** (`test/**/*.e2e-spec.ts`): Testcontainers Postgres + real Prisma + Nest app; Stripe/Notification services replaced with jest mocks via `overrideProvider`. Factories in `test/factories/` seed users/tasks and return signed JWTs. DB is truncated in `beforeEach`. The app factory (`test/setup/test-app.factory.ts`) calls `app.listen(0)` so the HTTP server stays listening and supertest must not manage it (parallel requests otherwise hit ECONNRESET). Use Node 22 (`nvm use`).

Write new tests:
- For a use case → new `<use-case>.service.spec.ts` next to the service.
- For a route → new `test/<module>/<endpoint>.e2e-spec.ts`. Always test: 401 auth (when applicable), validation errors, each domain error, happy path side effects in DB.

## Environment variables

See `.env.example`. Required:
- `DATABASE_URL`
- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (RS256, base64-encoded)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `NODE_ENV` (`development`/`production`/`test`, no default; the deploy must set `production`)
- `STRIPE_CONNECT_RETURN_URL` (Stripe Connect onboarding return URL; `?refresh=1` is appended for the refresh URL; https in production)
- `MAIL_FROM` (sender, e.g. `Proxy <no-reply@domain>`); `RESEND_API_KEY` (`re_...`, required when `MAIL_PROVIDER=resend`, the default); `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (required only when `MAIL_PROVIDER=ses`)

Optional:
- `STRIPE_CONNECT_WEBHOOK_SECRET` (secret of the connected-account webhook endpoint)
- `S3_BUCKET` (enables S3/R2 proof storage), `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (the two keys are required once `S3_BUCKET` is set)
- `PROOF_DIR` (local proof storage directory when `S3_BUCKET` is unset; default `./tmp/proofs`)
- `MAIL_PROVIDER` (`resend` default | `ses`), `PORT` (default 3333), `TRUST_PROXY` (default 0), `LOOP_TEST_HOOKS` (`0`/`1`, default `0`), `AWS_REGION` (default `us-east-1`)

Removed (do not reintroduce): `STRIPE_PUBLIC_KEY`, the `*_CALLBACK_URL` keys and the old SES sender key; the env schema ignores them.

Rule: read configuration through `EnvService` (`src/env`). The only deliberate pre-bootstrap `process.env` reads outside `src/env` are: `src/app.module.ts` (throttler `skipIf` on `NODE_ENV` / `LOOP_TEST_HOOKS`), `src/prisma/prisma.service.ts` (adapter `DATABASE_URL` and development-only query logging) and `src/modules/test-hooks/test-hooks.guard.ts` (`LOOP_TEST_HOOKS`, `NODE_ENV`, `DATABASE_URL`).

Local dev: the owner's `.env` needs `STRIPE_CONNECT_RETURN_URL`, `MAIL_FROM`, and either `MAIL_PROVIDER=resend` with `RESEND_API_KEY` or `MAIL_PROVIDER=ses` with the AWS keys. `scripts/dev-stack.sh up` falls back (without rewriting `.env`) to `NODE_ENV=development`, `STRIPE_CONNECT_RETURN_URL=http://localhost:3000/callback`, and, when neither the environment nor `.env` defines them, `MAIL_PROVIDER=ses` and `MAIL_FROM` (the old SES sender variable if set in the environment, else `no-reply@proxy.local`).

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
