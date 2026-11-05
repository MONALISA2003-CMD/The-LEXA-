#!/usr/bin/env python3
"""Deterministic, data-only product-wizard snapshots from the canonical catalogue.

No business records, suppliers, customers, demo stock, or device identifiers are
included. Use --check in CI to fail on unreviewed changes to published forms.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'scripts/electronics-catalogue-v2.v1.json'
OUTPUT=ROOT/'docs/quality/electronics-product-wizard-policy-snapshots.json'
TARGETS=['feature_phone','smartphone','laptop','charger','refrigerator','printer','inverter']

def generate()->str:
    data=json.loads(SOURCE.read_text(encoding='utf-8'))
    by_code={p['code']:p for p in data['families']}
    if any(code not in by_code for code in TARGETS):
        raise ValueError('The published catalogue no longer covers all acceptance-gate product families.')
    entries=[]
    for code in TARGETS:
        policy=by_code[code]
        entries.append({'family':code,'stockProfile':policy['stockProfile'],
          'identifiers':policy['identifiers'],'variantAxes':policy['variantAxes'],
          'requiredFields':[f['key'] for f in policy['fields'] if f['required']],
          'fieldDefinitions':policy['fields']})
    return json.dumps({'schemaVersion':data['schemaVersion'],'policyVersion':data['policyVersion'],
      'description':'Canonical policy snapshots for the seven required electronics wizard acceptance forms; no products or stock.',
      'families':entries},indent=2,ensure_ascii=False)+'\n'

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args(); result=generate()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding='utf-8')!=result:
            raise SystemExit('Product wizard policy snapshots are out of sync. Review and regenerate.')
        print('Product wizard policy snapshots match canonical catalogue.')
    else:
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        OUTPUT.write_text(result,encoding='utf-8')
        print('Wrote',OUTPUT.relative_to(ROOT))
