/*
  Warnings:

  - You are about to drop the column `totalTasks` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "totalTasks",
ADD COLUMN     "totalTasksCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalTasksCreated" INTEGER NOT NULL DEFAULT 0;
