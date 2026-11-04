#!/usr/bin/env python3
"""Static release safety checks; run alongside the full frontend/backend test suites."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
read=lambda p:(root/p).read_text()
router=read('lexa-frontend/src/modules/operations/OperationsWorkspacePage.tsx')
guard=read('backend/src/core/typed-module-write.guard.ts')
backend=read('backend/src/supply-chain/supply-chain.controller.ts')
projects=read('backend/src/people-projects/people-projects.controller.ts')
palette=read('lexa-frontend/src/domain/shared/moduleAccents.ts')
palgen=read('lexa-frontend/scripts/apply_lexa_palette.py')
for module in ('purchase-requests','rfqs','supplier-quotes','suppliers','purchases','purchase-returns','purchase-invoices'):
    assert f"'{module}'" in router, f'Missing purchasing route: {module}'
    assert f"'{module}'" in guard, f'Generic mutation allowed for {module}'
for module in ('projects','tasks','support'):
    assert f"'{module}'" in router, f'Missing project/service route: {module}'
for route in ('rfqs','quotations','awards','supplier-returns','purchase-orders'):
    assert f"@Get('procurement/{route}')" in backend, f'Missing governed read: {route}'
for route in ('projects/tasks','projects/assignees','projects/customers','support/assignees','support/customers'):
    assert f"@Get('{route}')" in projects, f'Missing project/service read: {route}'
for key in ('bronze','indigo','teal'):
    assert f"'{key}'" in palette and f"'{key}'" in palgen, f'Missing authoritative palette: {key}'
for method in ('GET','POST','PATCH'):
    endpoints=re.findall(r"@"+('Get' if method=='GET' else 'Post' if method=='POST' else 'Patch')+r"\('([^']+)'\)",backend)
    duplicates={name for name in endpoints if endpoints.count(name)>1}
    assert not duplicates, f'Duplicate {method} supply-chain routes: {duplicates}'
print('Purchasing, Projects & Service safety assertions passed.')
