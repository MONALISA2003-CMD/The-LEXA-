# LEXA Control Centre — Simple Private Administrator Setup

## Start here

The customer ERP and the platform administration area have **separate credentials and separate session cookies**. You can register a new administrator using the same email address as an existing business user without affecting that business.

### First administrator (developer)

1. Deploy this full release through the existing clean-ZIP GitHub importer. Confirm frontend/backend CI succeeds and the additive `20261110100000_private_platform_admin_enrolment` database migration has completed.
2. Make sure existing transactional email (`RESEND_API_KEY` and `RESEND_FROM_EMAIL`) is working; no new paid service is required.
3. Open **https://lexaaamaal.com/platform-admin/login**. The first-time setup panel appears only while there are no enabled platform administrators.
4. Click **Email my administrator setup link**. LEXA sends a **single-use 30-minute** invitation **only** to the developer email already registered in the source. The public request cannot select another recipient.
5. Open the email, follow the `/platform-admin/setup?token=...` link, enter your invited address and your name, and create a **separate 12+ character administrator password**.
6. Return to `/platform-admin/login`, sign in with your **admin** password, and open the yellow Control Centre. No customer signup, tenant membership, database SQL, or prior LEXA account is involved.

### Financier (second Super Admin)

1. Sign in as the developer Super Admin.
2. Open **Admin team & invitations**.
3. Enter the financier's own email and select **Super Administrator**.
4. Click **Send private invitation**. The system delivers a **single-use 24-hour** link to that address.
5. The financier opens the email, sets their own private admin password, and signs in at `/platform-admin/login`.

### More staff

Only a Super Admin can invite or disable administrators. You can assign Billing Manager, Operations Manager, Support Agent, Auditor (read-only), or Super Admin, with a **maximum of five active administrators**. Pending invitations reserve a seat. A Super Admin cannot disable themselves or remove the last active Super Admin. Disabling another admin invalidates their private sessions.

### Password recovery

Use `/platform-admin/recover` to receive a **single-use 30-minute** link. Complete password reset at `/platform-admin/reset?token=...`. Existing admin sessions are revoked on reset. This is **not** a customer-business reset.

### MFA and initial testing

MFA is **not mandatory in this first five-seat private setup**. Strong passwords, private email invitations, throttled login, the existing Turnstile configuration, expiring sessions and access controls remain mandatory. Add administrator-specific MFA **after the private admin setup has been tested and before collecting substantial live funds**. Do not treat browser navigation or a customer session as proof of administrator authority.

### WhatsApp contact numbers

Both approved contacts appear in the customer subscription page without configuring the billing-support phone or billing-instructions environment variables:

- **+256 749 064282** (`https://wa.me/256749064282`)
- **+256 703 953711** (`https://wa.me/256703953711`)

`LEXA_BILLING_SUPPORT_PHONE` and `LEXA_BILLING_INSTRUCTIONS` intentionally remain unchanged and unconfigured until you approve official payment instructions. No screenshot or message is accepted as proof of payment without independent verification.

### Checks and precautions

- Confirm the first developer invitation arrives at the expected mailbox; never send the founder link to another address.
- Verify both new Super Admins have no tenant memberships automatically created by the setup.
- Test that the normal LEXA customer password does **not** log in through `/platform-admin/login`.
- Verify sending an invite requires an authenticated Super Admin, and a sixth active admin is rejected.
- Verify expired and reused invitation/recovery links fail; changing a password revokes admin sessions.
- Confirm suspended/archived business operations remain blocked on the API and legacy businesses remain protected.
- Test migration on an isolated Neon branch, confirm GitHub CI, and back up production before rollout. Never manually alter existing business rows during private administrator enrollment.
- Account activity continues to refresh every 15 seconds only while the console is open; it cannot guarantee monitoring when the browser is closed.

### Rollback

If the new frontend is unavailable, roll back the application deployment via existing GitHub/Vercel/Render release mechanisms. The migration is additive; do not drop its tables or roll back identity records automatically. Preserve all admin audit and credential records, rotate/reissue invitations if needed, and run any data repair through a reviewed, isolated change.
