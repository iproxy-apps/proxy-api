-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "chargeId" TEXT,
ADD COLUMN     "disputeId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "chargedAmount" DECIMAL(10,2),
ADD COLUMN     "stripeFee" DECIMAL(10,2),
ALTER COLUMN "locationLat" SET DATA TYPE DECIMAL(9,6),
ALTER COLUMN "locationLng" SET DATA TYPE DECIMAL(9,6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "payoutIssue" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "rating" SET DATA TYPE DECIMAL(3,2),
ALTER COLUMN "walletBalance" SET DATA TYPE DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "payments_taskId_idx" ON "payments"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentIntent_key" ON "payments"("paymentIntent");


-- one active card per user: soft-delete older duplicates, then enforce
UPDATE "cards" c SET "isDeleted" = true
WHERE c."isDeleted" = false AND c.id NOT IN (
  SELECT DISTINCT ON ("userId") id FROM "cards" WHERE "isDeleted" = false
  ORDER BY "userId", "createdAt" DESC
);
CREATE UNIQUE INDEX "cards_one_active_per_user" ON "cards" ("userId") WHERE "isDeleted" = false;

-- backfill fee columns for existing tasks with the D1 model (only where missing):
-- client pays offeredPrice, platform 20 %, proxy 80 %, Stripe fee 3.99 % + 0.39 on the charge
-- (Postgres ROUND(numeric, 2) rounds half away from zero = ROUND_HALF_UP for positive amounts)
UPDATE "tasks" SET "platformFee" = ROUND("offeredPrice" * 0.20, 2) WHERE "platformFee" IS NULL;
UPDATE "tasks" SET "proxyEarnings" = "offeredPrice" - "platformFee" WHERE "proxyEarnings" IS NULL;
UPDATE "tasks" SET "chargedAmount" = "offeredPrice" WHERE "chargedAmount" IS NULL;
UPDATE "tasks" SET "stripeFee" = ROUND("chargedAmount" * 0.0399 + 0.39, 2) WHERE "stripeFee" IS NULL;
