-- AlterTable
ALTER TABLE "order_projections" ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "policy_projections" ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "session" RENAME CONSTRAINT "Session_pkey" TO "session_pkey";
