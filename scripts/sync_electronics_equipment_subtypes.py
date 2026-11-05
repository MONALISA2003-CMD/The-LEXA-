#!/usr/bin/env python3
"""Generate an identical, reviewed equipment subtype contract for API and UI."""
from pathlib import Path
import json, hashlib, sys
root=Path(__file__).resolve().parents[1]
source=(root/'scripts/electronics-equipment-subtypes.v1.json').read_bytes()
obj=json.loads(source)
assert obj['schemaVersion']==1 and len({s['code'] for s in obj['subtypes']})==len(obj['subtypes'])
sha=hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':')).encode()).hexdigest()
header='/** Generated from scripts/electronics-equipment-subtypes.v1.json — do not edit. */\n'
code=header+'export const EQUIPMENT_SUBTYPE_CONTRACT = '+json.dumps(obj,ensure_ascii=False,separators=(',',':'))+' as const;\nexport const EQUIPMENT_SUBTYPE_HASH = '+json.dumps(sha)+' as const;\n'
paths=[root/'backend/src/catalog/equipment-subtypes.generated.ts',root/'lexa-frontend/src/domain/catalog/equipment-subtypes.generated.ts']
node_path=root/'backend/src/catalog/equipment-subtypes.generated.js'
node_code=code.replace(' as const','')
if '--check' in sys.argv:
    mismatched=[str(p.relative_to(root)) for p in paths if not p.exists() or p.read_text()!=code]
    if not node_path.exists() or node_path.read_text()!=node_code:mismatched.append(str(node_path.relative_to(root)))
    if mismatched:sys.exit('Equipment subtype contract out of sync: '+', '.join(mismatched))
    print('Equipment subtype contract synchronized:',sha)
else:
    for p in paths:
        p.parent.mkdir(parents=True,exist_ok=True);p.write_text(code)
    node_path.write_text(node_code)
    print('Generated equipment subtype contract:',sha)
