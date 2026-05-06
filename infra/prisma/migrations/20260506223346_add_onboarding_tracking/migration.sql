-- Add onboarding tracking to Shop model
ALTER TABLE "shops" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Create an index for faster queries about onboarding status
CREATE INDEX "idx_shops_onboarding_completed_at" ON "shops"("onboardingCompletedAt");
