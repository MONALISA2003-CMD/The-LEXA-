#!/usr/bin/env python3
"""Dependency-free static release guard for LEXA Control Centre.

This does not substitute for PostgreSQL migration tests or authenticated browser E2E.
Run before importing the clean source ZIP; prints filenames only, never secrets.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'backend/prisma/migrations/20261108100000_platform_admin_subscriptions/migration.sql'
TABLES = {
    'platform_admin_members', 'platform_subscriptions', 'platform_payment_claims',
    'platform_subscription_periods', 'platform_administration_audit',
    'platform_support_cases', 'platform_incidents', 'platform_user_directory',
}


def check() -> list[str]:
    problems: list[str] = []
    sql = MIGRATION.read_text(encoding='utf-8')
    for name in sorted(TABLES):
        if not re.search(rf'CREATE\s+TABLE\s+{re.escape(name)}\s*\(', sql, re.I):
            problems.append(f'Migration missing table {name}')
        if not re.search(rf'ALTER\s+TABLE\s+{re.escape(name)}\s+FORCE\s+ROW\s+LEVEL\s+SECURITY', sql, re.I):
            problems.append(f'Forced row-level security missing for {name}')
    dangerous = re.findall(r'(?im)^\s*(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+DROP\b)', sql)
    if dangerous:
        problems.append('Destructive migration statements detected')
    if not re.search(r'INSERT\s+INTO\s+platform_subscriptions[\s\S]*?[\'\"]legacy[\'\"]', sql, re.I):
        problems.append('Existing tenants must receive legacy grandfathering')
    if 'status=\'pending\'' not in (ROOT/'backend/src/platform-administration/platform-administration.controller.ts').read_text():
        problems.append('Legacy transition path missing reviewed pending state')
    sources = [
        ROOT/'backend/src/auth/public-registration.controller.ts',
        ROOT/'backend/src/core/core.controller.ts',
    ]
    for file in sources:
        s = file.read_text(encoding='utf-8')
        if "INSERT INTO platform_subscriptions" not in s or "'pending'" not in s:
            problems.append(f'Payment-pending entitlement not attached to {file.name}')
    guard = (ROOT/'backend/src/platform-administration/subscription-access.guard.ts').read_text()
    if not all(s in guard for s in ('hasOperationalAccess', 'ForbiddenException', 'membership.status', "request.method==='GET'")):
        problems.append('Subscription API access guard missing fail-closed enforcement')
    controller = (ROOT/'backend/src/platform-administration/platform-administration.controller.ts').read_text()
    required = ['platform_admin_members', 'mfaEnabled', 'I_VERIFIED_RECEIPT',
                'Serializable', 'FOR UPDATE OF c,s', 'platform_subscription_periods',
                'platform_administration_audit', 'paid_through',
                "claim.subscription_status==='legacy'", 'normalizedTransactionReference']
    for feature in required:
        if feature not in controller:
            problems.append(f'Platform controller missing safeguard {feature}')
    migration_lock = 'ON platform_payment_claims(method, upper(btrim(verified_reference)))'
    if migration_lock not in sql:
        problems.append('Duplicate verified provider reference database constraint missing')
    if "WHERE status='submitted'" not in sql:
        problems.append('One-open-payment-per-business index missing')
    if not ('owner_enroll' in sql and 'owner_revoke' in sql):
        problems.append('Owner-only platform admin enrollment/revocation policies missing')
    if re.search(r'GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)[^;]+\bplatform_admin_members\b',sql,re.I):
        problems.append('Runtime role must not be allowed to grant platform-admin status')
    if not ('/platform-admin' in (ROOT/'lexa-frontend/src/app/router.tsx').read_text()
            and '/subscription' in (ROOT/'lexa-frontend/src/app/router.tsx').read_text()):
        problems.append('Missing platform and subscription routes')
    if 'apiPlatformBilling.status' not in (ROOT/'lexa-frontend/src/app/layouts/AppShell.tsx').read_text():
        problems.append('Business shell does not validate subscription status')
    backup = json.loads((ROOT/'backend/backup/authoritative-inventory.json').read_text())
    mapping = {v['table']:v for v in backup}
    for name in sorted(TABLES):
        if mapping.get(name,{}).get('disposition') not in {'excluded','reconstructed'}:
            problems.append(f'Platform-owned {name} must not be restored via tenant-level backup')
    if not (ROOT/'docs/operations/runbooks/platform-control-centre-manual-subscriptions.md').is_file():
        problems.append('Missing release and recovery runbook')
    return problems


if __name__ == '__main__':
    errs = check()
    for error in errs:
        print('ERROR:', error)
    if errs:
        raise SystemExit(1)
    print(f'LEXA Control Centre release checks passed: {len(TABLES)} new RLS-protected tables, '
          'no destructive SQL, protected signup, billing and backup boundaries.')
