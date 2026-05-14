-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'payout_failed';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "transferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tasks_transferId_key" ON "tasks"("transferId");
