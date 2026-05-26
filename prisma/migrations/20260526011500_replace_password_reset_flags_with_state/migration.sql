-- Replace the `verified` and `used` booleans on password_reset_codes with a
-- single state enum (`pending | verified | used`), making the lifecycle
-- explicit and unrepresentable-invalid-states impossible.

-- 1. Create the enum type.
CREATE TYPE "PasswordResetCodeState" AS ENUM ('pending', 'verified', 'used');

-- 2. Add the new column with a default. Existing rows will start at 'pending'.
ALTER TABLE "password_reset_codes"
  ADD COLUMN "state" "PasswordResetCodeState" NOT NULL DEFAULT 'pending';

-- 3. Backfill: derive the state from the old flag pair.
UPDATE "password_reset_codes"
  SET "state" = 'used'
  WHERE "used" = true;

UPDATE "password_reset_codes"
  SET "state" = 'verified'
  WHERE "verified" = true AND "used" = false;

-- 4. Drop the old columns.
ALTER TABLE "password_reset_codes"
  DROP COLUMN "verified",
  DROP COLUMN "used";
