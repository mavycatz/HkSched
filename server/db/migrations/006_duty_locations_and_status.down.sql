-- 006 down: remove the duty location catalogue and the new status
-- vocabulary, restoring the "missed" wording the old code used.
--
-- The order matters: the duties' reference to the catalogue goes first, then
-- the catalogue itself.

ALTER TABLE duties DROP COLUMN IF EXISTS location_id;
ALTER TABLE duties DROP COLUMN IF EXISTS requires_exclusive_location;

DROP TABLE IF EXISTS duty_locations;

ALTER TABLE duties DROP CONSTRAINT IF EXISTS duties_status_check;
UPDATE duties SET status = 'missed' WHERE status = 'cancelled';
ALTER TABLE duties ADD CONSTRAINT duties_status_check CHECK (status IN ('ongoing', 'completed', 'pending', 'missed'));

ALTER TABLE duty_assignments DROP CONSTRAINT IF EXISTS duty_assignments_status_check;
ALTER TABLE duty_assignments ADD CONSTRAINT duty_assignments_status_check CHECK (status IN ('assigned', 'done', 'completed'));
