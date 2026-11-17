-- Offer "End the day" when a task wraps up, from this local time on (1 = on).
ALTER TABLE settings ADD COLUMN end_day_offer INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN end_day_after TEXT NOT NULL DEFAULT '15:00';
