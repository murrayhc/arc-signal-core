-- AlterTable
ALTER TABLE "Entity" ADD COLUMN "canonicalKey" TEXT;

-- CreateIndex
CREATE INDEX "Entity_canonicalKey_idx" ON "Entity"("canonicalKey");
