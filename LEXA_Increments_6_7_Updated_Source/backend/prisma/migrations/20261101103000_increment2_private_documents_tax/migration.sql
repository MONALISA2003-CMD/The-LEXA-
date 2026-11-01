-- Increment 2: private document platform and reviewed, effective-dated tax references.
-- Additive and safe for existing attachment/payment/sale data.
ALTER TABLE platform_attachments DROP CONSTRAINT IF EXISTS platform_attachments_status_check;
ALTER TABLE platform_attachments ADD CONSTRAINT platform_attachments_status_check CHECK(status IN ('pending_upload','pending_scan','clean','quarantined','scan_failed','deleted'));
ALTER TABLE platform_attachments
  ADD COLUMN IF NOT EXISTS declared_mime_type text,
  ADD COLUMN IF NOT EXISTS detected_mime_type text,
  ADD COLUMN IF NOT EXISTS bucket_ref text NOT NULL DEFAULT 'private-platform-files',
  ADD COLUMN IF NOT EXISTS upload_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS object_etag text,
  ADD COLUMN IF NOT EXISTS scan_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'owner_and_record_participants',
  ADD COLUMN IF NOT EXISTS retention_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS display_name text;
UPDATE platform_attachments SET declared_mime_type=COALESCE(declared_mime_type,mime_type), detected_mime_type=COALESCE(detected_mime_type,mime_type), display_name=COALESCE(display_name,original_name);
ALTER TABLE platform_attachments ADD CONSTRAINT platform_attachments_visibility_check CHECK (visibility IN ('private','owner_and_record_participants','workspace_restricted'));
ALTER TABLE platform_attachments ADD CONSTRAINT platform_attachments_retention_check CHECK (retention_state IN ('active','legal_hold','pending_deletion','deleted'));
CREATE UNIQUE INDEX IF NOT EXISTS platform_attachments_tenant_id_key ON platform_attachments(tenant_id,id);
CREATE INDEX IF NOT EXISTS platform_attachments_owner_idx ON platform_attachments(tenant_id,branch_id,record_type,record_id,status);

CREATE TABLE tax_reference_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 title text NOT NULL, issuing_authority text NOT NULL, jurisdiction text NOT NULL, document_type text NOT NULL CHECK(document_type IN ('act','regulation','notice','circular','official_guidance','internal_interpretation')),
 publication_date date, effective_from date, effective_to date, source_url text, source_details text,
 original_attachment_id uuid, document_sha256 text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 supersedes_id uuid, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','superseded','withdrawn')),
 uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reviewer_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 approver_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, review_notes text, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_sha256,version),
 FOREIGN KEY(tenant_id,original_attachment_id) REFERENCES platform_attachments(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,supersedes_id) REFERENCES tax_reference_documents(tenant_id,id) ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
 CHECK(status<>'approved' OR (approver_user_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX tax_reference_documents_library_idx ON tax_reference_documents(tenant_id,jurisdiction,status,effective_from DESC);

CREATE TABLE tax_code_rule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 tax_code_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), code_snapshot text NOT NULL, description_snapshot text NOT NULL,
 treatment text NOT NULL CHECK(treatment IN ('standard_rated','zero_rated','exempt','outside_scope','other')),
 rate_basis_points integer NOT NULL CHECK(rate_basis_points BETWEEN 0 AND 100000), calculation_method text NOT NULL CHECK(calculation_method IN ('inclusive','exclusive')),
 taxable_base_rule text NOT NULL DEFAULT 'line_net', rounding_method text NOT NULL DEFAULT 'half_up' CHECK(rounding_method IN ('half_up','half_even','floor','ceiling')),
 effective_from date NOT NULL, effective_to date, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','superseded','withdrawn')),
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reviewer_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 approver_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz, review_notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,tax_code_id,version),
 FOREIGN KEY(tenant_id,tax_code_id) REFERENCES tax_codes(tenant_id,id) ON DELETE RESTRICT,
 CHECK(effective_to IS NULL OR effective_to>=effective_from),
 CHECK(status<>'approved' OR (approver_user_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX tax_code_rule_versions_effective_idx ON tax_code_rule_versions(tenant_id,tax_code_id,status,effective_from,effective_to);
CREATE TABLE tax_rule_reference_links (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, rule_version_id uuid NOT NULL, reference_document_id uuid NOT NULL,
 created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,rule_version_id,reference_document_id),
 FOREIGN KEY(tenant_id,rule_version_id) REFERENCES tax_code_rule_versions(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,reference_document_id) REFERENCES tax_reference_documents(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS tax_code_snapshot text,
  ADD COLUMN IF NOT EXISTS tax_description_snapshot text,
  ADD COLUMN IF NOT EXISTS tax_rule_version_id uuid,
  ADD COLUMN IF NOT EXISTS tax_calculation_method text,
  ADD COLUMN IF NOT EXISTS tax_rounding_method text,
  ADD COLUMN IF NOT EXISTS tax_reference_document_version_id uuid;
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_tax_rule_version_fk FOREIGN KEY(tenant_id,tax_rule_version_id) REFERENCES tax_code_rule_versions(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_tax_reference_version_fk FOREIGN KEY(tenant_id,tax_reference_document_version_id) REFERENCES tax_reference_documents(tenant_id,id) ON DELETE RESTRICT;
-- Existing invoices are not recalculated. Their existing tax_minor/tax_rate_basis_points remain authoritative snapshots.

ALTER TABLE tax_reference_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_reference_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tax_reference_documents_tenant_scope ON tax_reference_documents USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')) WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
ALTER TABLE tax_code_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_code_rule_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tax_code_rule_versions_tenant_scope ON tax_code_rule_versions USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')) WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
ALTER TABLE tax_rule_reference_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rule_reference_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tax_rule_reference_links_tenant_scope ON tax_rule_reference_links USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),'')) WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT,INSERT,UPDATE,DELETE ON tax_reference_documents,tax_code_rule_versions,tax_rule_reference_links TO lexa_app_runtime;
