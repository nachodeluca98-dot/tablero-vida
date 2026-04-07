-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "googleSyncToken" TEXT,
ADD COLUMN     "googleWatchChannelId" TEXT,
ADD COLUMN     "googleWatchExpiration" TIMESTAMP(3),
ADD COLUMN     "googleWatchResourceId" TEXT;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
