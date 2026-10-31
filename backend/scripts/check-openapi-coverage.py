#!/usr/bin/env python3
"""Fail CI when NestJS controller routes or HTTP verbs are absent from OpenAPI."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
CONTROLLERS = [
    ROOT / 'backend/src/core/core.controller.ts',
    ROOT / 'backend/src/health/health.controller.ts',
    ROOT / 'backend/src/commerce/commerce.controller.ts',
    ROOT / 'backend/src/receivables/receivables.controller.ts',
    ROOT / 'backend/src/payables/payables.controller.ts',
    ROOT / 'backend/src/module-graph/module-graph.controller.ts',
    ROOT / 'backend/src/general-ledger/general-ledger.controller.ts',
    ROOT / 'backend/src/invitations/invitations.controller.ts',
    ROOT / 'backend/src/commerce/catalog-inventory.controller.ts',
    ROOT / 'backend/src/finance/finance-operations.controller.ts',
    ROOT / 'backend/src/supply-chain/supply-chain.controller.ts',
    ROOT / 'backend/src/people-projects/people-projects.controller.ts',
]
CONTRACT = ROOT / 'lexa-frontend/openapi/backend-contract.yaml'
ROUTE_RE = re.compile(r"@(Get|Post|Put|Patch|Delete)\((?:(?:'([^']*)')|(?:\"([^\"]*)\"))?\)")
PATH_KEY_RE = re.compile(r'^  (/[^:]+):\s*$')
METHOD_RE = re.compile(r'^    (get|post|put|patch|delete):\s*$')

def controller_routes():
    routes = {}
    for filename in CONTROLLERS:
        source = filename.read_text(encoding='utf-8')
        controller = re.search(r"@Controller\((?:'([^']*)'|\"([^\"]*)\")?\)", source)
        prefix = (controller.group(1) or controller.group(2) or '') if controller else ''
        for match in ROUTE_RE.finditer(source):
            method = match.group(1).lower()
            path = match.group(2) or match.group(3) or ''
            combined = '/'.join(part.strip('/') for part in (prefix, path) if part.strip('/'))
            full = '/' + re.sub(r':([A-Za-z][A-Za-z0-9]*)', r'{\1}', combined)
            routes.setdefault(full, set()).add(method)
    return routes

def contract_routes():
    result = {}
    current = None
    for line in CONTRACT.read_text(encoding='utf-8').splitlines():
        path_match = PATH_KEY_RE.match(line)
        if path_match:
            current = path_match.group(1)
            result.setdefault(current, set())
            continue
        method_match = METHOD_RE.match(line)
        if current and method_match:
            result[current].add(method_match.group(1))
    return result

source = controller_routes()
contract = contract_routes()
missing = []
extra = []
for path, methods in sorted(source.items()):
    for method in sorted(methods):
        if method not in contract.get(path, set()):
            missing.append(f'{method.upper()} {path}')
for path, methods in sorted(contract.items()):
    for method in sorted(methods):
        if method not in source.get(path, set()):
            extra.append(f'{method.upper()} {path}')
if missing or extra:
    if missing:
        print('OpenAPI is missing active controller routes:')
        for route in missing:
            print(f' - {route}')
    if extra:
        print('OpenAPI advertises operations with no active controller:')
        for route in extra:
            print(f' - {route}')
    sys.exit(1)
print(f'OpenAPI exact match passed: {sum(map(len, source.values()))} operations across {len(source)} routes; no missing or orphan operations.')
