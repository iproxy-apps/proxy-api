/*
  Warnings:

  - You are about to drop the column `stripeAccountId` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "stripeAccountId",
ADD COLUMN     "stripeCustomerId" TEXT;
