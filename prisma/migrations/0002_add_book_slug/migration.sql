-- AlterTable: add bookSlug column to UserLibrary
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "bookSlug" TEXT;

-- CreateIndex: speed up getUserLibrary queries by userId
CREATE INDEX IF NOT EXISTS "UserLibrary_userId_idx" ON "UserLibrary"("userId");
