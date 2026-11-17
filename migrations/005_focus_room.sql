-- A link to a body-doubling room (e.g. a Discord voice channel), shown on Focus.
ALTER TABLE settings ADD COLUMN focus_room INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN focus_room_url TEXT NOT NULL DEFAULT '';
