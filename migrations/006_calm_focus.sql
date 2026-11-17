-- Hide the Focus buttons until the mouse is over them or the screen is tapped (1 = on).
ALTER TABLE settings ADD COLUMN calm_focus INTEGER NOT NULL DEFAULT 1;
