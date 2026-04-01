# Proxy API

Backend API for a task/service marketplace platform with Stripe-powered payments.

## Stack

- **Runtime**: Node.js with TypeScript (ES2024, strict mode)
- **Framework**: NestJS 11 (CommonJS, decorators enabled)
- **ORM**: Prisma 7 with PostgreSQL adapter (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (does not use class-validator)
- **Authentication**: JWT RS256 (passport-jwt) with base64-encoded public/private keys
- **Payments**: Stripe SDK (Connect with merchant accounts)
- **Formatting**: Prettier (no semicolons, single quotes, trailing commas)

## Commands

```bash
npm run start:dev      # Dev server with watch
npm run build          # Build (nest build)
npm run start:prod     # Production (node dist/src/main)
npm run format         # Prettier
npm run lint           # ESLint with auto-fix
npm run type-check     # tsc --noEmit
```

### Prisma

```bash
npx prisma migrate dev       # Create/apply migrations
npx prisma generate          # Generate client
npx prisma studio            # UI to browse data
```

### Docker (PostgreSQL)

```bash
docker compose up -d   # Starts PostgreSQL on port 5432
```

## Architecture

### Directory structure

```
src/
├── main.ts                    # Bootstrap, applies global HttpExceptionFilter
├── app.module.ts              # Root module, validates env with Zod
├── env/                       # Typed environment config (Zod schema)
├── exception/                 # AppException, HttpExceptionFilter, errorDictionary
├── pipes/                     # ZodValidationPipe, multerOptions
├── prisma/                    # PrismaService (extends PrismaClient)
├── stripe/                    # StripeService and StripeModule (dynamic module)
└── modules/
    ├── auth/                  # Authentication, accounts, merchant (Stripe Connect)
    ├── tasks/                 # Full task lifecycle CRUD
    ├── cards/                 # User payment methods
    └── payments/              # Payment records (intents, refunds)
```

### Module patterns

Every module follows the same structure:

```
modules/<name>/
├── <name>.module.ts           # NestJS module
├── controllers/               # One controller per action (create-task.controller.ts)
├── use-cases/                 # One service per use case (create-task.service.ts)
├── repository/                # Repository with DTO interface + Prisma implementation
├── dtos/                      # Repository interfaces (contracts)
└── types/                     # index.d.ts with domain types
```

- **1 controller = 1 route**: Each controller exposes a single endpoint.
- **1 service = 1 use case**: Each service in `use-cases/` has a single `execute()` method.
- **Repository pattern**: Repositories implement a DTO interface defined in `dtos/`.
- **Types in `types/index.d.ts`**: Module domain types live in declaration files.

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

- **Users**: Clients and proxies, with walletBalance, stripeCustomerId/stripeAccountId, soft delete (isDeleted)
- **Tasks**: Lifecycle: `available → accepted → in_progress → verification_required → completed | canceled`
- **Cards**: Saved cards via Stripe (brand, last4, stripeCardId)
- **UserTaskMapping**: Links executor (proxy) to a task
- **Payments**: Payment intent and refund records

### Stripe Connect

- Clients pay via PaymentIntent with a saved card
- Proxies receive funds via merchant accounts (Stripe Connect Express)
- Platform charges a `platformFee` and calculates `proxyEarnings` upon task validation
- Currency: BRL

## Environment variables

See `.env.example`. JWT keys are RS256 in base64. Stripe requires secret and public keys.
