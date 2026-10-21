-- 003_create_duties: duty records for CSDL dashboard
CREATE TABLE duties (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'pending', 'missed')),
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_duties_status ON duties (status);
CREATE INDEX idx_duties_assigned_to ON duties (assigned_to);
CREATE INDEX idx_duties_created_at ON duties (created_at);
