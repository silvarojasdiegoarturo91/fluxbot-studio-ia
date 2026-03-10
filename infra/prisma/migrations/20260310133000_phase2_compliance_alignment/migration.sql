-- AlterTable
ALTER TABLE "handoff_requests" ADD COLUMN     "context" JSONB,
ADD COLUMN     "shopId" TEXT;

-- Backfill shopId for existing rows before enforcing NOT NULL.
UPDATE "handoff_requests" h
SET "shopId" = c."shopId"
FROM "conversations" c
WHERE h."conversationId" = c."id";

ALTER TABLE "handoff_requests" ALTER COLUMN "shopId" SET NOT NULL;

-- CreateTable
CREATE TABLE "data_export_jobs" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "exportUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_jobs" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requestedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recordsDeleted" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_deletion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "omnichannel_callback_receipts" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "requestedStatus" TEXT NOT NULL,
    "callbackTimestamp" INTEGER NOT NULL,
    "signatureDigest" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "omnichannel_callback_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_callbacks" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,
    "failureReason" TEXT NOT NULL,
    "errorDetails" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dead_letter_callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_events" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT,
    "customerId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_signals" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT,
    "signalType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "triggerData" JSONB NOT NULL,
    "actionTaken" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intent_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_triggers" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cooldownMs" INTEGER NOT NULL DEFAULT 300000,
    "targetLocale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proactive_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_messages" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "recipientId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'WEB_CHAT',
    "messageTemplate" TEXT NOT NULL,
    "renderedMessage" TEXT NOT NULL,
    "messageMetadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "interactedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proactive_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,
    "revenue" DOUBLE PRECISION,
    "attributionType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_export_jobs_shopId_createdAt_idx" ON "data_export_jobs"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "data_deletion_jobs_shopId_createdAt_idx" ON "data_deletion_jobs"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "omnichannel_callback_receipts_shopId_messageId_createdAt_idx" ON "omnichannel_callback_receipts"("shopId", "messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "omnichannel_callback_receipts_shopId_eventKey_key" ON "omnichannel_callback_receipts"("shopId", "eventKey");

-- CreateIndex
CREATE INDEX "dead_letter_callbacks_shopId_createdAt_idx" ON "dead_letter_callbacks"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "dead_letter_callbacks_shopId_isResolved_idx" ON "dead_letter_callbacks"("shopId", "isResolved");

-- CreateIndex
CREATE INDEX "dead_letter_callbacks_nextRetryAt_idx" ON "dead_letter_callbacks"("nextRetryAt");

-- CreateIndex
CREATE INDEX "behavior_events_shopId_sessionId_idx" ON "behavior_events"("shopId", "sessionId");

-- CreateIndex
CREATE INDEX "behavior_events_shopId_eventType_timestamp_idx" ON "behavior_events"("shopId", "eventType", "timestamp");

-- CreateIndex
CREATE INDEX "behavior_events_sessionId_timestamp_idx" ON "behavior_events"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "intent_signals_shopId_sessionId_idx" ON "intent_signals"("shopId", "sessionId");

-- CreateIndex
CREATE INDEX "intent_signals_shopId_signalType_createdAt_idx" ON "intent_signals"("shopId", "signalType", "createdAt");

-- CreateIndex
CREATE INDEX "intent_signals_sessionId_createdAt_idx" ON "intent_signals"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "proactive_triggers_shopId_enabled_idx" ON "proactive_triggers"("shopId", "enabled");

-- CreateIndex
CREATE INDEX "proactive_triggers_shopId_triggerType_idx" ON "proactive_triggers"("shopId", "triggerType");

-- CreateIndex
CREATE INDEX "proactive_messages_shopId_createdAt_idx" ON "proactive_messages"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "proactive_messages_shopId_status_idx" ON "proactive_messages"("shopId", "status");

-- CreateIndex
CREATE INDEX "proactive_messages_sessionId_status_idx" ON "proactive_messages"("sessionId", "status");

-- CreateIndex
CREATE INDEX "proactive_messages_triggerId_status_idx" ON "proactive_messages"("triggerId", "status");

-- CreateIndex
CREATE INDEX "proactive_messages_shopId_channel_createdAt_idx" ON "proactive_messages"("shopId", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "conversion_events_shopId_createdAt_idx" ON "conversion_events"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "conversion_events_conversationId_idx" ON "conversion_events"("conversationId");

-- CreateIndex
CREATE INDEX "conversion_events_shopId_attributionType_createdAt_idx" ON "conversion_events"("shopId", "attributionType", "createdAt");

-- CreateIndex
CREATE INDEX "handoff_requests_shopId_status_idx" ON "handoff_requests"("shopId", "status");

-- AddForeignKey
ALTER TABLE "handoff_requests" ADD CONSTRAINT "handoff_requests_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_jobs" ADD CONSTRAINT "data_deletion_jobs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "omnichannel_callback_receipts" ADD CONSTRAINT "omnichannel_callback_receipts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_callbacks" ADD CONSTRAINT "dead_letter_callbacks_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_triggers" ADD CONSTRAINT "proactive_triggers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_messages" ADD CONSTRAINT "proactive_messages_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proactive_messages" ADD CONSTRAINT "proactive_messages_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "proactive_triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

