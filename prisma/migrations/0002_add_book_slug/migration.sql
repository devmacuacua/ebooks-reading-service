-- AlterTable: add bookSlug column to user_library
ALTER TABLE "UserLibrary" ADD COLUMN IF NOT EXISTS "bookSlug" TEXT;
