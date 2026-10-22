-- 006_duty_locations_and_status: the duty location catalogue, the location
-- every duty is held at, and the status vocabulary without "missed".
--
-- The stored `duties.status` keeps only the facts the database cannot derive:
-- an explicit cancellation. Everything else is derived from the schedule's
-- own times and from the completion recorded on its assignment rows.

-- The catalogue of authorized locations.
CREATE TABLE IF NOT EXISTS duty_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('classroom', 'office', 'laboratory', 'facility', 'area')),
  building TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_locations_active ON duty_locations (is_active);

-- The location a duty is held at. It stays nullable so a duty written
-- before the catalogue existed still reads; the API refuses a duty without a
-- location from now on.
ALTER TABLE duties ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES duty_locations(id) ON DELETE SET NULL;
ALTER TABLE duties ADD COLUMN IF NOT EXISTS requires_exclusive_location BOOLEAN NOT NULL DEFAULT FALSE;

-- The status vocabulary: "missed" is replaced by "cancelled".
ALTER TABLE duties DROP CONSTRAINT IF EXISTS duties_status_check;
UPDATE duties SET status = 'cancelled' WHERE status = 'missed';
ALTER TABLE duties ADD CONSTRAINT duties_status_check CHECK (status IN ('pending', 'ongoing', 'completed', 'cancelled'));

-- The assignment rows speak the same vocabulary: assigned, or completed.
ALTER TABLE duty_assignments DROP CONSTRAINT IF EXISTS duty_assignments_status_check;
UPDATE duty_assignments SET status = 'completed' WHERE status = 'done';
ALTER TABLE duty_assignments ADD CONSTRAINT duty_assignments_status_check CHECK (status IN ('assigned', 'completed'));

-- The locations the school uses. The kind is what the picker narrows by.
INSERT INTO duty_locations (name, kind, building) VALUES
  ('Library', 'area', 'Main Building'),
  ('Cafeteria', 'area', 'Main Building'),
  ('Main Hallway', 'area', 'Main Building'),
  ('Science Laboratory', 'laboratory', 'Main Building'),
  ('Computer Laboratory', 'laboratory', 'Main Building'),
  ('Gymnasium', 'facility', 'Sports Building'),
  ('Clinic', 'office', 'Main Building'),
  ('Guidance Office', 'office', 'Main Building'),
  ('Principal''s Office', 'office', 'Main Building'),
  ('Classroom 1', 'classroom', 'Main Building'),
  ('Classroom 2', 'classroom', 'Main Building'),
  ('Classroom 3', 'classroom', 'Main Building'),
  ('Classroom 4', 'classroom', 'Main Building'),
  ('Classroom 5', 'classroom', 'Main Building'),
  ('Classroom 6', 'classroom', 'Main Building')
ON CONFLICT (name) DO NOTHING;

-- A duty whose area names a location now points at it, so the location
-- filter covers the historical rows too. The area text is kept.
UPDATE duties d
SET location_id = l.id
FROM duty_locations l
WHERE d.location_id IS NULL AND lower(d.area) = lower(l.name);
