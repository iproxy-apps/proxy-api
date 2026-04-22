-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'disputed');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripeAccountReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);
