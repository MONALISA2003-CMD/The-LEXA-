-- Reversible operational closure without erasing invoices, journals or audit provenance.
-- Finance records hold foreign keys to users and must never be cascaded away.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS closure_reason text;
ALTER TABLE public.users ADD CONSTRAINT users_closure_reason_length CHECK (closure_reason IS NULL OR length(closure_reason) <= 500);
CREATE INDEX IF NOT EXISTS users_closed_at_idx ON public.users (closed_at) WHERE closed_at IS NOT NULL;
