Repository-root overlay. Extract the ZIP contents into the existing The-LEXA- repository; do not replace the whole repository.

backend/
  Dockerfile                                      Runs deterministic security patcher before build and migration on startup.
  scripts/apply-auth-security-patch.mjs           Applies auth and security changes in the Render Docker build copy.
  scripts/auth-patch/*.before|*.after             Exact expected controller/schema/source anchors and replacements, including trusted proxy IP handling.
  prisma/migrations/20261030130000_auth_security_controls/migration.sql
                                                   Adds database-backed auth rate limiting.

lexa-frontend/
  package.json                                    Runs idempotent frontend security UI patcher in prebuild.
  scripts/apply_auth_security_ui.mjs               Adds the Account Security section and no-referrer meta policy.
  src/modules/auth/AuthPage.tsx                    Refreshed sign-in, first-admin, forgot and reset screens.
  src/modules/auth/AuthFields.tsx                  Password visibility and passphrase guidance.
  src/modules/security/SecurityPanel.tsx            Signed-in password change and recovery status.
  src/styles/auth.css                              Responsive authentication and security styling.
  vercel.json                                      API proxy rewrite and browser security headers.

Also included: AUTH_SETUP_GUIDE.md with apply, deployment, email-provider and first-admin steps.
