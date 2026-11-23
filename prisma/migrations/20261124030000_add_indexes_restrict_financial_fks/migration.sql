-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_taskId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_owner_fkey";

-- CreateIndex
CREATE INDEX "cards_userId_idx" ON "cards"("userId");

-- CreateIndex
CREATE INDEX "password_reset_codes_userId_createdAt_idx" ON "password_reset_codes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ratings_ratedId_idx" ON "ratings"("ratedId");

-- CreateIndex
CREATE INDEX "tasks_status_createdAt_idx" ON "tasks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_owner_idx" ON "tasks"("owner");

-- CreateIndex
CREATE INDEX "user_task_mapping_executorId_idx" ON "user_task_mapping"("executorId");

-- CreateIndex
CREATE INDEX "users_stripeAccountId_idx" ON "users"("stripeAccountId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_fkey" FOREIGN KEY ("owner") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

