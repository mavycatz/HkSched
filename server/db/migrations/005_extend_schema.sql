-- 005_extend_schema: applications, notifications, user profile/preferences, assignment status
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "in_app": true}'::jsonb;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  applicant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duty_id BIGINT REFERENCES duties(id) ON DELETE SET NULL,
  duty_title TEXT,
  duty_area TEXT,
  duty_date DATE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications (applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_applications_duty ON applications (duty_id);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read, created_at);

ALTER TABLE duty_assignments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'done', 'completed'));
ALTER TABLE duty_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE duty_assignments ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE duties ADD COLUMN IF NOT EXISTS required_headcount INT DEFAULT 1;
ALTER TABLE duties ADD COLUMN IF NOT EXISTS class_group TEXT;
