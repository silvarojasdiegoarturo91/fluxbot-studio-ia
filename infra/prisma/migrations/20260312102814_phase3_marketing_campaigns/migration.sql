/*
  Warnings:

  - You are about to drop the `ai_provider_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignScheduleType" AS ENUM ('IMMEDIATE', 'SCHEDULED', 'RECURRING');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "ai_provider_configs" DROP CONSTRAINT "ai_provider_configs_chatbotConfigId_fkey";

-- DropTable
DROP TABLE "ai_provider_configs";

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduleType" "CampaignScheduleType" NOT NULL DEFAULT 'IMMEDIATE',
    "cronExpression" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "localeTemplates" JSONB NOT NULL DEFAULT '{}',
    "targetLocales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triggerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceFilter" JSONB,
    "frequencyCap" INTEGER NOT NULL DEFAULT 1,
    "campaignWindowMs" INTEGER NOT NULL DEFAULT 86400000,
    "totalDispatched" INTEGER NOT NULL DEFAULT 0,
    "totalConverted" INTEGER NOT NULL DEFAULT 0,
    "lastDispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_dispatch_events" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "renderedMessage" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WEB_CHAT',
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,
    "outcomeAt" TIMESTAMP(3),

    CONSTRAINT "campaign_dispatch_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaigns_shopId_status_idx" ON "marketing_campaigns"("shopId", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_shopId_scheduleType_scheduledAt_idx" ON "marketing_campaigns"("shopId", "scheduleType", "scheduledAt");

-- CreateIndex
CREATE INDEX "marketing_campaigns_shopId_createdAt_idx" ON "marketing_campaigns"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_dispatch_events_campaignId_dispatchedAt_idx" ON "campaign_dispatch_events"("campaignId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "campaign_dispatch_events_shopId_dispatchedAt_idx" ON "campaign_dispatch_events"("shopId", "dispatchedAt");

-- CreateIndex
CREATE INDEX "campaign_dispatch_events_sessionId_campaignId_idx" ON "campaign_dispatch_events"("sessionId", "campaignId");

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_dispatch_events" ADD CONSTRAINT "campaign_dispatch_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
