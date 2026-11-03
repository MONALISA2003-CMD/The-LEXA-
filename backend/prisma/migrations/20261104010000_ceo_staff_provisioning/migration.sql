-- CEO-led employee provisioning. Existing accounts remain untouched.
-- No changes to ownership or to existing business / accounting records.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username);
ALTER TABLE users ADD CONSTRAINT lexa_users_username_normalized
  CHECK (username IS NULL OR username ~ '^[a-z][a-z0-9._-]{2,31}$');

CREATE TABLE IF NOT EXISTS hr_employee_private_profiles (
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  residential_address text,
  district text,
  date_of_birth date,
  emergency_contact_name text,
  emergency_contact_phone text,
  national_id text,
  contract_reference text,
  probation_end date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,employee_id),
  FOREIGN KEY(tenant_id,employee_id) REFERENCES hr_employees(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE hr_employee_private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_private_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY hr_employee_private_profiles_scope ON hr_employee_private_profiles FOR ALL
 USING(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK(tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON hr_employee_private_profiles TO lexa_app_runtime;
 END IF;
END $$;

-- Permit an active CEO to revoke only non-owner employee sessions during a reset.
CREATE POLICY sessions_owner_resets_employee_password ON sessions FOR DELETE
 USING (EXISTS (
   SELECT 1 FROM memberships actor
   JOIN memberships employee ON employee.tenant_id=actor.tenant_id
   WHERE actor.tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')
     AND actor.user_id::text=NULLIF(current_setting('app.user_id',true),'')
     AND actor.role IN ('owner','owner_administrator') AND actor.status='ACTIVE'
     AND employee.user_id=sessions.user_id
     AND employee.role NOT IN('owner','owner_administrator')
 ));
