-- Each optional feature can be turned off in Settings (1 = on).
ALTER TABLE settings ADD COLUMN show_clock INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN show_end_time INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN early_break INTEGER NOT NULL DEFAULT 1;
