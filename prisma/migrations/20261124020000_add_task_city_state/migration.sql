ALTER TABLE "tasks" ADD COLUMN "city" TEXT, ADD COLUMN "state" TEXT;

-- backfill from "<street>, <city> - <UF>, <zip>" (create-task.service.ts composition before D16)
UPDATE "tasks" SET
  "city"  = trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[1]),
  "state" = upper(trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[2]));

-- rows that never followed the pattern (pre-1.0 seeds): keep them readable, flag with empty state
UPDATE "tasks" SET "city" = left(trim("locationAddress"), 120), "state" = '' WHERE "city" IS NULL;

ALTER TABLE "tasks" ALTER COLUMN "city" SET NOT NULL, ALTER COLUMN "state" SET NOT NULL;

CREATE INDEX "tasks_city_status_createdAt_idx" ON "tasks"("city", "status", "createdAt");
