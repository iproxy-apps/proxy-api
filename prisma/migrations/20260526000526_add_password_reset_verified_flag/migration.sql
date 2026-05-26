-- AlterTable
ALTER TABLE "password_reset_codes" ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;
