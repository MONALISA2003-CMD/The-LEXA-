#!/usr/bin/env python3
"""Guard that every backend-backed frontend adapter is wired to a live API family."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
# apiBusinessTools intentionally remains device-local and is therefore not listed.
# apiClient.test.ts is transport-level test coverage, not a domain adapter.
checks = {
    "Authentication": ("lexa-frontend/src/data/remote/apiAuth.ts", "/auth/"),
    "Workspace repositories": ("lexa-frontend/src/data/remote/apiRepositories.ts", "/workspaces"),
    "Commerce": ("lexa-frontend/src/data/remote/apiCommerce.ts", "/commerce"),
    "Sales workflow": ("lexa-frontend/src/data/remote/apiSalesWorkflow.ts", "/sales/complete"),
    "Accounts Receivable": ("lexa-frontend/src/data/remote/apiReceivables.ts", "/receivables"),
    "Accounts Payable": ("lexa-frontend/src/data/remote/apiPayables.ts", "/payables"),
    "General Ledger": ("lexa-frontend/src/data/remote/apiGeneralLedger.ts", "/ledger"),
    "Module Graph": ("lexa-frontend/src/data/remote/apiModuleGraph.ts", "/module-graph"),
    "Module Records": ("lexa-frontend/src/data/remote/apiModuleRecords.ts", "/modules/"),
    "Module Reports": ("lexa-frontend/src/data/remote/apiModuleReports.ts", "/reports/modules"),
    "Team and Access": ("lexa-frontend/src/data/remote/apiTeamAccess.ts", "/memberships/"),
    "Collaboration": ("lexa-frontend/src/data/remote/apiCollaboration.ts", "/inbox/"),
    "Dashboard and analytics": ("lexa-frontend/src/data/remote/apiDashboard.ts", "/analytics/overview"),
    "Global search": ("lexa-frontend/src/data/remote/apiGlobalSearch.ts", "/search"),
}
errors = []
for label, (relative, route_marker) in checks.items():
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"{label}: missing adapter {relative}")
        continue
    source = path.read_text(encoding="utf-8")
    if route_marker not in source:
        errors.append(f"{label}: adapter {relative} does not reference expected backend route marker {route_marker}")
    if "apiClient." not in source:
        errors.append(f"{label}: adapter {relative} is not wired to the shared API client")
if errors:
    print("Route-to-adapter coverage failed:")
    for error in errors:
        print(f" - {error}")
    sys.exit(1)
print(f"Route-to-adapter coverage passed: {len(checks)} backend-backed domain adapters are wired to the shared API client.")
