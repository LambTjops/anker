-- The focus music link is editable (Endel, Brain.fm, …). https only, or '' for none.
ALTER TABLE settings ADD COLUMN focus_music_url TEXT NOT NULL DEFAULT 'https://app.endel.io/player/focus';
