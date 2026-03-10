-- AlterTable
ALTER TABLE "order_projections" ADD COLUMN     "data" JSONB;

-- AlterTable
ALTER TABLE "policy_projections" ADD COLUMN     "data" JSONB;

-- Align session PK constraint naming regardless of migration replay order.
-- Some environments have "Session" at this point, while others already have "session".
DO $$
BEGIN
	IF to_regclass('"session"') IS NOT NULL THEN
		IF EXISTS (
			SELECT 1
			FROM pg_constraint
			WHERE conrelid = to_regclass('"session"')
			  AND conname = 'Session_pkey'
		) THEN
			EXECUTE 'ALTER TABLE "session" RENAME CONSTRAINT "Session_pkey" TO "session_pkey"';
		END IF;
	ELSIF to_regclass('"Session"') IS NOT NULL THEN
		IF EXISTS (
			SELECT 1
			FROM pg_constraint
			WHERE conrelid = to_regclass('"Session"')
			  AND conname = 'Session_pkey'
		) THEN
			EXECUTE 'ALTER TABLE "Session" RENAME CONSTRAINT "Session_pkey" TO "session_pkey"';
		END IF;
	END IF;
END $$;
