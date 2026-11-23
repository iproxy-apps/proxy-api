-- D12 (2026-11-23): identity documents are no longer collected or stored.
ALTER TABLE "users" DROP COLUMN "documentType", DROP COLUMN "documentUrl", DROP COLUMN "isVerified";
DROP TYPE "DocumentType";
