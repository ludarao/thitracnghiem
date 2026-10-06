-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "bankId" TEXT,
ADD COLUMN     "summary" JSONB;

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" TEXT NOT NULL,
    "questions" JSONB NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attempt_submittedAt_id_idx" ON "Attempt"("submittedAt", "id");

-- Copy only summaries for old attempts, preserving the original detailed results.
UPDATE "Attempt" SET "summary" = ("result" - 'answers') || '{"answers": []}'::jsonb WHERE "result" IS NOT NULL AND "submittedAt" IS NOT NULL;
