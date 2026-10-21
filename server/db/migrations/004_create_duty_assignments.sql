-- 004_create_duty_assignments: assignment records linked to duties
CREATE TABLE duty_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  duty_id BIGINT NOT NULL REFERENCES duties(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_duty_assignments_duty_id ON duty_assignments (duty_id);
CREATE INDEX idx_duty_assignments_student_id ON duty_assignments (student_id);
