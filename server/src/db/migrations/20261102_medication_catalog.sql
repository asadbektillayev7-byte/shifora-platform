-- Narrow, idempotent migration for an existing Shifora PostgreSQL database.
-- Creates catalogue storage only. No patient records, prescriptions, seeds,
-- existing tables or access permissions are changed. Requires the existing
-- hospitals/users tables and Shifora datetime() helper from schema.sql.

CREATE TABLE IF NOT EXISTS medication_catalog (
  id            SERIAL PRIMARY KEY,
  hospital_id   INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  generic_name  TEXT NOT NULL DEFAULT '' CHECK (length(generic_name) <= 160),
  strength      TEXT NOT NULL DEFAULT '' CHECK (length(strength) <= 80),
  form          TEXT NOT NULL DEFAULT '' CHECK (length(form) <= 80),
  unit          TEXT NOT NULL DEFAULT 'mg' CHECK (length(unit) <= 30),
  notes         TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_medication_catalog_hospital
  ON medication_catalog(hospital_id, is_active, lower(name));
