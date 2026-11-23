-- Hand-written data migration: enforce the lowercase-e-mail invariant.
-- Sign-up and login now normalise e-mails to lowercase (P2-T01); this brings
-- existing rows in line. Aborts if two rows differ only by case, so that no
-- account is merged or deleted silently: resolve those manually, then re-run.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'lowercase_user_emails: emails differing only by case exist; resolve manually';
  END IF;
END $$;

UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");
