-- AlterTable
ALTER TABLE "CompanyImpact" ADD COLUMN "enrichedByLLMRunId" TEXT;
ALTER TABLE "CompanyImpact" ADD COLUMN "llmRationale" TEXT;

-- AlterTable
ALTER TABLE "EventContextSynthesis" ADD COLUMN "enrichedByLLMRunId" TEXT;
ALTER TABLE "EventContextSynthesis" ADD COLUMN "llmNarrativeJson" TEXT;
