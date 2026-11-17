-- Pause a running block. paused_at is set while paused; on resume the pause is added to
-- both planned_seconds (so the end moves) and paused_seconds (so it doesn't count as focus).
ALTER TABLE focus_blocks ADD COLUMN paused_at TEXT;
ALTER TABLE focus_blocks ADD COLUMN paused_seconds INTEGER NOT NULL DEFAULT 0;
