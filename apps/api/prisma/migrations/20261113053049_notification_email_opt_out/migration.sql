/*
  Warnings:

  - A unique constraint covering the columns `[emailUnsubscribeToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailUnsubscribeToken" TEXT,
ADD COLUMN     "notificationEmailOptOutAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailUnsubscribeToken_key" ON "users"("emailUnsubscribeToken");
