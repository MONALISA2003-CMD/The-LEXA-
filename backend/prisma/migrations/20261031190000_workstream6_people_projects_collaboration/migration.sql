-- Workstream 6: typed people, project, support and shared approval records.
-- All business records are tenant + branch scoped. Compensation is stored separately
-- from employee directory data so API permissions can redact it independently.

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS branch_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_events_tenant_branch_fkey') THEN
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_tenant_branch_fkey
      FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS audit_events_tenant_branch_created_idx
  ON audit_events(tenant_id, branch_id, created_at DESC);

CREATE OR REPLACE FUNCTION lexa_audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; updates and deletes are prohibited';
END $$;
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION lexa_audit_events_append_only();
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION lexa_audit_events_append_only();

CREATE TABLE hr_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
  starts_at time NOT NULL, ends_at time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,branch_id,code),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  employee_number text NOT NULL, user_id uuid, full_name text NOT NULL,
  preferred_name text, work_email text, phone text, department text, job_title text,
  manager_employee_id uuid, employment_type text NOT NULL DEFAULT 'salaried'
    CHECK (employment_type IN ('salaried','hourly','contractor')),
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','suspended','terminated')),
  hire_date date NOT NULL, termination_date date, default_shift_id uuid,
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,branch_id,employee_number),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,branch_id,manager_employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,default_shift_id) REFERENCES hr_shifts(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (termination_date IS NULL OR termination_date >= hire_date)
);
CREATE UNIQUE INDEX hr_employees_tenant_user_unique ON hr_employees(tenant_id,user_id) WHERE user_id IS NOT NULL;
CREATE INDEX hr_employees_tenant_branch_status_idx ON hr_employees(tenant_id,branch_id,employment_status,full_name);
CREATE INDEX hr_employees_tenant_manager_idx ON hr_employees(tenant_id,manager_employee_id);

CREATE TABLE hr_employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  employee_id uuid NOT NULL, shift_id uuid NOT NULL, starts_on date NOT NULL, ends_on date,
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,branch_id,shift_id) REFERENCES hr_shifts(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX hr_employee_shift_assignments_effective_idx
  ON hr_employee_shift_assignments(tenant_id,branch_id,employee_id,starts_on DESC,ends_on);
CREATE OR REPLACE FUNCTION lexa_hr_shift_assignment_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || NEW.branch_id::text || ':' || NEW.employee_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM hr_employee_shift_assignments a
    WHERE a.tenant_id=NEW.tenant_id AND a.employee_id=NEW.employee_id AND a.id IS DISTINCT FROM NEW.id
      AND daterange(a.starts_on,COALESCE(a.ends_on + 1,'infinity'::date),'[)')
          && daterange(NEW.starts_on,COALESCE(NEW.ends_on + 1,'infinity'::date),'[)')
  ) THEN
    RAISE EXCEPTION 'An employee cannot have overlapping shift assignments';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_employee_shift_assignment_no_overlap
  BEFORE INSERT OR UPDATE OF employee_id,starts_on,ends_on ON hr_employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION lexa_hr_shift_assignment_no_overlap();

CREATE TABLE hr_employee_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
  effective_from date NOT NULL, effective_to date, pay_basis text NOT NULL
    CHECK (pay_basis IN ('monthly','hourly')),
  currency char(3) NOT NULL DEFAULT 'UGX', pay_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (pay_frequency IN ('weekly','biweekly','monthly')),
  base_pay_minor bigint NOT NULL DEFAULT 0 CHECK (base_pay_minor >= 0),
  hourly_rate_minor bigint NOT NULL DEFAULT 0 CHECK (hourly_rate_minor >= 0),
  overtime_multiplier numeric(5,2) NOT NULL DEFAULT 1.50 CHECK (overtime_multiplier BETWEEN 1 AND 5),
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,employee_id,effective_from),
  FOREIGN KEY (tenant_id,employee_id) REFERENCES hr_employees(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK ((pay_basis='monthly' AND base_pay_minor >= 0) OR (pay_basis='hourly' AND hourly_rate_minor >= 0))
);
CREATE INDEX hr_compensation_effective_idx ON hr_employee_compensation(tenant_id,employee_id,effective_from DESC,effective_to);

-- Prevent overlapping compensation periods even when updates race or arrive out of order.
CREATE OR REPLACE FUNCTION lexa_hr_compensation_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || NEW.employee_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM hr_employee_compensation c
    WHERE c.tenant_id=NEW.tenant_id AND c.employee_id=NEW.employee_id
      AND c.id IS DISTINCT FROM NEW.id
      AND daterange(c.effective_from,COALESCE(c.effective_to + 1,'infinity'::date),'[)')
          && daterange(NEW.effective_from,COALESCE(NEW.effective_to + 1,'infinity'::date),'[)')
  ) THEN
    RAISE EXCEPTION 'Compensation effective periods cannot overlap for one employee';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_employee_compensation_no_overlap
  BEFORE INSERT OR UPDATE OF employee_id,effective_from,effective_to ON hr_employee_compensation
  FOR EACH ROW EXECUTE FUNCTION lexa_hr_compensation_no_overlap();

CREATE TABLE hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  employee_id uuid NOT NULL, shift_id uuid, attendance_date date NOT NULL,
  clock_in timestamptz, clock_out timestamptz, worked_minutes integer NOT NULL DEFAULT 0 CHECK(worked_minutes BETWEEN 0 AND 1440),
  late_minutes integer NOT NULL DEFAULT 0 CHECK(late_minutes BETWEEN 0 AND 1440),
  status text NOT NULL DEFAULT 'present' CHECK(status IN ('present','late','absent','leave','incomplete')),
  note text, reviewed_by_user_id uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,employee_id,attendance_date),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,shift_id) REFERENCES hr_shifts(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (clock_out IS NULL OR (clock_in IS NOT NULL AND clock_out > clock_in))
);
CREATE INDEX hr_attendance_branch_date_idx ON hr_attendance(tenant_id,branch_id,attendance_date DESC,status);

CREATE TABLE hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  employee_id uuid NOT NULL, request_number text NOT NULL, leave_type text NOT NULL
    CHECK (leave_type IN ('annual','sick','maternity_paternity','compassionate','unpaid','study','other')),
  starts_on date NOT NULL, ends_on date NOT NULL, days_requested numeric(7,2) NOT NULL CHECK(days_requested > 0),
  paid boolean NOT NULL DEFAULT true, reason text, handover_note text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','rejected','cancelled','taken')),
  requested_by_user_id uuid NOT NULL, submitted_at timestamptz, decided_by_user_id uuid,
  decision_comment text, approval_record_id text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,request_number),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX hr_leave_employee_dates_idx ON hr_leave_requests(tenant_id,employee_id,starts_on,ends_on,status);

-- Leave overlap protection is enforced inside PostgreSQL as well as the API.
-- Advisory locking prevents two concurrent submissions/approvals for one employee
-- from both passing an overlap check.
CREATE OR REPLACE FUNCTION lexa_hr_leave_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('pending_approval','approved','taken') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || NEW.employee_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM hr_leave_requests l
      WHERE l.tenant_id=NEW.tenant_id AND l.employee_id=NEW.employee_id AND l.id IS DISTINCT FROM NEW.id
        AND l.status IN ('pending_approval','approved','taken')
        AND daterange(l.starts_on,l.ends_on + 1,'[)') && daterange(NEW.starts_on,NEW.ends_on + 1,'[)')
    ) THEN
      RAISE EXCEPTION 'Leave requests for one employee cannot overlap';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_leave_no_overlap
  BEFORE INSERT OR UPDATE OF employee_id,starts_on,ends_on,status ON hr_leave_requests
  FOR EACH ROW EXECUTE FUNCTION lexa_hr_leave_no_overlap();

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  project_code text NOT NULL, name text NOT NULL, description text,
  customer_record_id text, manager_employee_id uuid,
  starts_on date, ends_on date, budget_minor bigint NOT NULL DEFAULT 0 CHECK(budget_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'UGX', status text NOT NULL DEFAULT 'planning'
    CHECK(status IN ('planning','active','on_hold','completed','cancelled')),
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,branch_id,project_code),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,manager_employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX projects_tenant_branch_status_idx ON projects(tenant_id,branch_id,status,starts_on);

CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  project_id uuid NOT NULL, task_code text NOT NULL, title text NOT NULL, description text,
  assigned_employee_id uuid, due_at date, status text NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','blocked','done','cancelled')),
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,project_id,task_code),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,project_id) REFERENCES projects(tenant_id,branch_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,branch_id,assigned_employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX project_tasks_project_status_idx ON project_tasks(tenant_id,project_id,status,due_at);

CREATE TABLE hr_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  employee_id uuid NOT NULL, project_id uuid, project_task_id uuid,
  timesheet_number text NOT NULL, work_date date NOT NULL,
  regular_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK(regular_hours >= 0 AND regular_hours <= 24),
  overtime_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK(overtime_hours >= 0 AND overtime_hours <= 24),
  billable_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK(billable_hours >= 0 AND billable_hours <= 48),
  notes text, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','rejected','invoiced')),
  submitted_by_user_id uuid NOT NULL, submitted_at timestamptz,
  decided_by_user_id uuid, decision_comment text, approval_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,timesheet_number),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,project_id) REFERENCES projects(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,project_task_id) REFERENCES project_tasks(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (billable_hours <= regular_hours + overtime_hours)
);
CREATE INDEX hr_timesheets_payroll_idx ON hr_timesheets(tenant_id,employee_id,work_date,status);
CREATE INDEX hr_timesheets_project_idx ON hr_timesheets(tenant_id,project_id,work_date,status);

CREATE TABLE project_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  project_id uuid NOT NULL, source_type text NOT NULL, source_id text NOT NULL,
  category text NOT NULL, description text NOT NULL, cost_minor bigint NOT NULL CHECK(cost_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'UGX', cost_date date NOT NULL,
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,source_type,source_id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,project_id) REFERENCES projects(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX project_cost_entries_project_date_idx ON project_cost_entries(tenant_id,project_id,cost_date DESC);

CREATE TABLE hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  run_number text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'UGX', status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','calculated','pending_approval','approved','rejected','paid')),
  gross_minor bigint NOT NULL DEFAULT 0 CHECK(gross_minor >= 0), deductions_minor bigint NOT NULL DEFAULT 0 CHECK(deductions_minor >= 0),
  net_minor bigint NOT NULL DEFAULT 0 CHECK(net_minor = gross_minor - deductions_minor),
  calculated_by_user_id uuid, calculated_at timestamptz, submitted_by_user_id uuid,
  approval_record_id text, approved_by_user_id uuid, approved_at timestamptz,
  payment_reference text, paid_by_user_id uuid, paid_at timestamptz,
  created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,branch_id,run_number),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (calculated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start)
);
CREATE INDEX hr_payroll_branch_period_idx ON hr_payroll_runs(tenant_id,branch_id,period_start DESC,status);
CREATE UNIQUE INDEX hr_payroll_one_run_per_period ON hr_payroll_runs(tenant_id,branch_id,period_start,period_end);

CREATE TABLE hr_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, payroll_run_id uuid NOT NULL,
  employee_id uuid NOT NULL, pay_basis text NOT NULL CHECK(pay_basis IN ('monthly','hourly')),
  base_pay_minor bigint NOT NULL DEFAULT 0 CHECK(base_pay_minor >= 0),
  regular_hours numeric(9,2) NOT NULL DEFAULT 0, overtime_hours numeric(9,2) NOT NULL DEFAULT 0,
  approved_paid_leave_days numeric(7,2) NOT NULL DEFAULT 0, approved_unpaid_leave_days numeric(7,2) NOT NULL DEFAULT 0,
  approved_absence_days numeric(7,2) NOT NULL DEFAULT 0,
  approved_paid_leave_hours numeric(9,2) NOT NULL DEFAULT 0,
  gross_minor bigint NOT NULL DEFAULT 0 CHECK(gross_minor >= 0), deductions_minor bigint NOT NULL DEFAULT 0 CHECK(deductions_minor >= 0),
  net_minor bigint NOT NULL DEFAULT 0 CHECK(net_minor = gross_minor - deductions_minor),
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,id), UNIQUE (tenant_id,payroll_run_id,employee_id),
  FOREIGN KEY (tenant_id,branch_id,payroll_run_id) REFERENCES hr_payroll_runs(tenant_id,branch_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,branch_id,employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT
);
CREATE INDEX hr_payroll_lines_employee_idx ON hr_payroll_lines(tenant_id,employee_id,payroll_run_id);

CREATE TABLE hr_payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL, payroll_line_id uuid NOT NULL,
  category text NOT NULL, description text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor > 0),
  reference text, created_by_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,branch_id,payroll_line_id) REFERENCES hr_payroll_lines(tenant_id,branch_id,id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX hr_payroll_deductions_line_idx ON hr_payroll_deductions(tenant_id,payroll_line_id);

CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
  case_number text NOT NULL, customer_record_id text, task_record_id text,
  assigned_employee_id uuid, opened_by_user_id uuid NOT NULL,
  subject text NOT NULL, description text, channel text NOT NULL DEFAULT 'other'
    CHECK(channel IN ('phone','email','in_person','website','whatsapp','other')),
  category text NOT NULL DEFAULT 'other', priority text NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','triaged','in_progress','waiting_customer','resolved','closed','reopened')),
  response_due_at timestamptz, resolution text, resolved_at timestamptz, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,branch_id,case_number),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,branch_id,assigned_employee_id) REFERENCES hr_employees(tenant_id,branch_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (opened_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX support_cases_queue_idx ON support_cases(tenant_id,branch_id,status,priority,created_at DESC);
CREATE INDEX support_cases_customer_idx ON support_cases(tenant_id,customer_record_id);

INSERT INTO module_definitions(module_id,title,singular_label,group_name,is_writable,sort_order)
VALUES ('shifts','Shift templates','shift template','PEOPLE & PAYROLL',true,57),
       ('project-tasks','Project tasks','project task','ADMINISTRATION',true,58)
ON CONFLICT (module_id) DO NOTHING;

