-- Phase 1c: a short plan for today, a length picked at Start, and a heads-up chime.

-- A task on today's shortlist has planned_for = today's local date. Yesterday's plan
-- simply stops matching, so unfinished tasks drift back to the inbox without fuss.
ALTER TABLE tasks ADD COLUMN planned_for TEXT;
ALTER TABLE tasks ADD COLUMN plan_position INTEGER;

-- The length chosen at Start, before any +5 min, so Keep going repeats it.
ALTER TABLE focus_blocks ADD COLUMN base_seconds INTEGER;

-- A soft chime shortly before a block or break ends (1 = on).
ALTER TABLE settings ADD COLUMN heads_up INTEGER NOT NULL DEFAULT 1;
