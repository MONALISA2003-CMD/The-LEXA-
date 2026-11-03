# LEXA Customers & Growth — Customer Rose

## Implemented
- Dedicated responsive CRM screens for Leads, Opportunities, Contacts, Campaigns, Sales Team and the shared Customers directory.
- Premium colour: berry rose #B74F77, soft blush #FFF1F5, deep plum #653049.
- PostgreSQL/Neon stores new interaction notes with tenant-isolated RLS and protected business backup.
- Qualified leads convert to opportunities; won opportunities and contacts convert to customer records with durable module links, audit events and duplicate checks.
- Existing CEO-managed employees can be assigned to leads and sales territories; sales achievement uses real explicitly attributed checkout sales, not a typed amount or automatic payroll.
- Checkout offers existing customer, won deal and salesperson selections; protected backend validates all IDs within this business and saves them atomically on real sales.
- Campaign activity counts only explicitly linked leads, deals and completed sales. No messages or advertising are sent by CRM.
- Basic customer counts are available to authorized Business Reports and LEXA Assistant without advanced-analytics entitlement; private customer or employee details are excluded from AI prompts.
- My Business now uses ordinary business-friendly wording for company security, employees, workspace and payment recording.

## Data assurance and privacy
- No direct external messaging has been enabled. Store consent and its source; never send campaigns to people who did not opt in or asked to stop.
- Existing sales without explicit customer/deal/staff links are preserved and remain unattributed; do not infer identity from a matching name or phone.
- Sales targets are entered in business currency units, but actual sales and receipts are linked verified transactions; commission is not automatically paid or posted to payroll.
- CRM activities have no facility to edit sales or financial records; all writes are auditable and subject to existing role checks and CSRF protection.
- A single CEO-controlled business is maintained; sales territories do not create branches.

## Acceptance checklist
1. Import the full repository ZIP in GitHub, then wait for Render backend and Vercel frontend deployments and migration.
2. Sign in as an existing CEO. Visit all six customer screens and confirm their mobile layout, save a lead and log a follow-up.
3. Qualify the lead, create a deal, mark it won, convert to a customer and verify that a duplicate conversion does not create another customer.
4. In Checkout select this customer, won deal and salesperson. Record a real sale and confirm the customer and salesperson results update.
5. Check CRM summaries in Business Reports and ask LEXA Assistant an aggregate customer-growth question.
6. Verify unauthorized staff cannot access or edit other people's data; ensure no email or WhatsApp is sent by simply recording a campaign.
7. Confirm current production data and existing CEO memberships remain unchanged.
