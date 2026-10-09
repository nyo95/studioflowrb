-- Schedule codes fill the lowest empty number again (owner, 2026-10-09; contract §11.2), so a code group no
-- longer remembers the highest number it handed out. The table only held that counter.
DROP TABLE "studioflow"."sf_schedule_code_mark";
