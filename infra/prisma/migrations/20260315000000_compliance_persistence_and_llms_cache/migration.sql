-- Migration: compliance_persistence_and_llms_cache
-- Adds persistent storage for DataResidency, ProcessingActivity, BreachNotification (C6)
-- and LlmsTxtCache (S5), replacing previous in-memory Maps.

-- DataResidencySetting
CREATE TABLE "data_residency_settings" (
    "id"               TEXT NOT NULL,
    "shopId"           TEXT NOT NULL,
    "region"           "DataRegion" NOT NULL DEFAULT 'GLOBAL',
    "enforced"         BOOLEAN NOT NULL DEFAULT false,
    "enforcedCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_residency_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "data_residency_settings_shopId_key" ON "data_residency_settings"("shopId");

-- ProcessingActivityRecord
CREATE TABLE "processing_activity_records" (
    "id"             TEXT NOT NULL,
    "shopId"         TEXT NOT NULL,
    "activityName"   TEXT NOT NULL,
    "purpose"        TEXT NOT NULL,
    "legalBasis"     TEXT NOT NULL,
    "dataCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dataSubjects"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "retentionDays"  INTEGER NOT NULL DEFAULT 365,
    "thirdParties"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "transferCountries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_activity_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "processing_activity_records_shopId_isActive_idx" ON "processing_activity_records"("shopId", "isActive");

-- BreachNotificationRecord
CREATE TABLE "breach_notification_records" (
    "id"                  TEXT NOT NULL,
    "shopId"              TEXT NOT NULL,
    "detectedAt"          TIMESTAMP(3) NOT NULL,
    "reportedAt"          TIMESTAMP(3),
    "severity"            TEXT NOT NULL,
    "description"         TEXT NOT NULL,
    "affectedDataSubjects" INTEGER NOT NULL DEFAULT 0,
    "dataCategories"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mitigationTaken"     TEXT NOT NULL DEFAULT 'Investigation in progress',
    "reportedToAuthority" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt72h"       BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt"          TIMESTAMP(3),
    "regulatorRef"        TEXT,
    "remediationSteps"    TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breach_notification_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "breach_notification_records_shopId_detectedAt_idx" ON "breach_notification_records"("shopId", "detectedAt");

-- LlmsTxtCache
CREATE TABLE "llms_txt_cache" (
    "id"          TEXT NOT NULL,
    "shopId"      TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llms_txt_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llms_txt_cache_shopId_key" ON "llms_txt_cache"("shopId");
