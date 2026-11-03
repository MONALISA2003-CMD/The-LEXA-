-- Customer Rose: preserve all existing business and customer records.
-- These nullable references link future sales to selected customer, opportunity and employee.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_record_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS opportunity_record_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS salesperson_employee_id uuid;
CREATE INDEX IF NOT EXISTS sales_tenant_customer_growth_idx ON public.sales(tenant_id,branch_id,customer_record_id,created_at);
CREATE INDEX IF NOT EXISTS sales_tenant_opportunity_growth_idx ON public.sales(tenant_id,branch_id,opportunity_record_id,created_at);
CREATE INDEX IF NOT EXISTS sales_tenant_salesperson_growth_idx ON public.sales(tenant_id,branch_id,salesperson_employee_id,created_at);

CREATE TABLE IF NOT EXISTS public.crm_activities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
 module_id text NOT NULL CHECK (module_id IN ('leads','opportunities','contacts','campaigns','sales-teams','customers')),
 record_id text NOT NULL,
 activity_type text NOT NULL CHECK (activity_type IN ('call','whatsapp','email','meeting','note','follow_up')),
 summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 1200),
 happened_at timestamptz NOT NULL DEFAULT now(),
 next_follow_up_on date,
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_tenant_record_idx ON public.crm_activities(tenant_id,branch_id,module_id,record_id,happened_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_tenant_due_idx ON public.crm_activities(tenant_id,branch_id,next_follow_up_on) WHERE next_follow_up_on IS NOT NULL;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY crm_activities_tenant_scope ON public.crm_activities
 FOR ALL USING (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''))
 WITH CHECK (tenant_id::text=NULLIF(current_setting('app.tenant_id',true),''));
