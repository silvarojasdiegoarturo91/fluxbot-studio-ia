-- CreateEnum
CREATE TYPE "DataRegion" AS ENUM ('EU', 'US', 'APAC', 'GLOBAL');

-- CreateEnum
CREATE TYPE "LegalHoldScope" AS ENUM ('ALL', 'CONVERSATIONS', 'BEHAVIOR_EVENTS', 'AUDIT_LOGS', 'CONSENT_RECORDS');

-- CreateTable
CREATE TABLE "regional_deployment_controls" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "primaryRegion" "DataRegion" NOT NULL DEFAULT 'GLOBAL',
    "failoverRegions" "DataRegion"[] DEFAULT ARRAY[]::"DataRegion"[],
    "strictIsolation" BOOLEAN NOT NULL DEFAULT false,
    "piiRestrictedToPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regional_deployment_controls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" "LegalHoldScope"[] DEFAULT ARRAY[]::"LegalHoldScope"[],
    "placedBy" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regional_deployment_controls_shopId_key" ON "regional_deployment_controls"("shopId");

-- CreateIndex
CREATE INDEX "legal_holds_shopId_releasedAt_idx" ON "legal_holds"("shopId", "releasedAt");

-- CreateIndex
CREATE INDEX "legal_holds_shopId_expiresAt_idx" ON "legal_holds"("shopId", "expiresAt");

-- AddForeignKey
ALTER TABLE "regional_deployment_controls" ADD CONSTRAINT "regional_deployment_controls_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
