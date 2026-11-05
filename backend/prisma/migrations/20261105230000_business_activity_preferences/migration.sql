-- Additive tenant-owned business specialties and immutable activity change evidence.
-- No product, receipt, stock, sale or ledger data is rewritten.
ALTER TABLE public.business_profiles
 ADD COLUMN sub_activity_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
 ADD COLUMN activity_revision integer NOT NULL DEFAULT 0 CHECK (activity_revision >= 0);

CREATE TABLE public.business_activity_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version > 0),
 previous_industries text[] NOT NULL,
 current_industries text[] NOT NULL,
 previous_specialties text[] NOT NULL,
 current_specialties text[] NOT NULL,
 policy_hash text NOT NULL CHECK(length(policy_hash)=64),
 actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 changed_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,version)
);
CREATE INDEX business_activity_revisions_tenant_time_idx
 ON public.business_activity_revisions(tenant_id,changed_at DESC);
CREATE FUNCTION public.lexa_business_activity_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Business activity history cannot be changed or deleted' USING ERRCODE='23514'; END $$;
CREATE TRIGGER business_activity_history_immutable
 BEFORE UPDATE OR DELETE ON public.business_activity_revisions
 FOR EACH ROW EXECUTE FUNCTION public.lexa_business_activity_revision_immutable();
ALTER TABLE public.business_activity_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_activity_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON public.business_activity_revisions FOR ALL
 USING (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text = NULLIF(current_setting('app.tenant_id',true),''));
GRANT SELECT,INSERT ON public.business_activity_revisions TO lexa_app_runtime;
INSERT INTO public.platform_backup_inventory (table_name,disposition,domain,rationale,dependency_order)
 VALUES ('business_activity_revisions','authoritative','business_identity','Append-only owner specialty and industry selection history for audit and restore',32)
 ON CONFLICT(table_name) DO UPDATE SET disposition=EXCLUDED.disposition,domain=EXCLUDED.domain,rationale=EXCLUDED.rationale,dependency_order=EXCLUDED.dependency_order;
