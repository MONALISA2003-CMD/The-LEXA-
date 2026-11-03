-- Verification must complete before any user or workspace is created.
-- Pending signup records are scoped to an exact email on creation and an
-- unguessable SHA-256 token hash on verification; the runtime role cannot list
-- arbitrary pending signups without first setting the corresponding context.
CREATE TABLE signup_verifications (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  business_name text NOT NULL,
  business_type text NOT NULL DEFAULT 'general',
  password_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX signup_verifications_expires_at_idx ON signup_verifications(expires_at);
ALTER TABLE signup_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY signup_verifications_scope ON signup_verifications FOR ALL
 USING (
   email = NULLIF(current_setting('app.signup_email',true),'') OR
   token_hash = NULLIF(current_setting('app.signup_token_hash',true),'')
 )
 WITH CHECK (
   email = NULLIF(current_setting('app.signup_email',true),'') OR
   token_hash = NULLIF(current_setting('app.signup_token_hash',true),'')
 );
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lexa_app_runtime') THEN
   GRANT SELECT,INSERT,UPDATE,DELETE ON signup_verifications TO lexa_app_runtime;
 END IF;
END $$;
