-- Review A4 (2026-11-23): emails an admin typed kept their capital letters,
-- but sign-in and forgot-password look the email up lowercased, so those
-- accounts could never sign in. The API now lowercases and trims on every
-- write; this brings existing rows in line.
--
-- Data only, no schema change. A row whose lowercased email another account
-- already has (users.email is unique) is left as it is: two accounts that
-- differ only in case need an admin to choose which one stays. Find them with
-- the query in docs/TROUBLESHOOTING.md ("can never sign in").
UPDATE "users" AS u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1
    FROM "users" AS o
    WHERE o."id" <> u."id"
      AND lower(btrim(o."email")) = lower(btrim(u."email"))
  );
