-- Natural title order in the database ("Puzzle 2" before "Puzzle 10"), so the
-- library can sort and page in SQL instead of loading every title. ICU with
-- numeric ordering mirrors `compareNatural` in @nexa-chess/types. Deterministic
-- (the default), so ILIKE search on the column keeps working.
CREATE COLLATION IF NOT EXISTS "natural_sort" (provider = icu, locale = 'und-u-kn-true');

ALTER TABLE "puzzles" ALTER COLUMN "title" TYPE TEXT COLLATE "natural_sort";
