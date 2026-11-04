-- Preserve the business identity printed on the issued invoice.
-- Existing invoices may have null snapshots and use the authorised current business profile.
ALTER TABLE public.ar_customer_invoices
 ADD COLUMN IF NOT EXISTS seller_snapshot jsonb;
