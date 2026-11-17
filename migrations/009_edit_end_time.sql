-- Tap the end time on Focus to change it (1 = on).
ALTER TABLE settings ADD COLUMN edit_end_time INTEGER NOT NULL DEFAULT 1;
