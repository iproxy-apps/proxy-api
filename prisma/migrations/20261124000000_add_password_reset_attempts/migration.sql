-- AlterTable
ALTER TABLE "password_reset_codes" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

