-- AlterTable: Rename Session table to lowercase session for Shopify compatibility
-- This migration updates the table name from "Session" to "session"
-- The Shopify session storage package expects the table name to match the Prisma model mapping

-- Rename table (if not already renamed)
ALTER TABLE IF EXISTS "Session" RENAME TO "session";

-- Note: This ensures compatibility with @shopify/shopify-app-session-storage-prisma
-- which expects the table name to exactly match the @@map directive in the Prisma schema
