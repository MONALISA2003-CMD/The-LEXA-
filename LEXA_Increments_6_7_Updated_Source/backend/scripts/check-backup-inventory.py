#!/usr/bin/env python3
"""Fail CI when Prisma/raw-SQL tables lack a backup disposition."""
import re, pathlib, json, sys
root=pathlib.Path(__file__).resolve().parents[1]
schema=(root/'prisma/schema.prisma').read_text()
tables=set(re.findall(r'@@map\("([a-zA-Z0-9_]+)"\)',schema))
for p in (root/'prisma/migrations').glob('*/migration.sql'):
 s=p.read_text()
 s=re.sub(r'\bIF\s+(?:NOT\s+)?EXISTS\b','',s,flags=re.I).replace('public.','')
 tables.update(re.findall(r'CREATE\s+TABLE\s+([a-zA-Z0-9_]+)',s,re.I))
 tables.update(re.findall(r'ALTER\s+TABLE\s+([a-zA-Z0-9_]+)',s,re.I))
inventory=json.loads((root/'backup/authoritative-inventory.json').read_text())
known={x['table'] for x in inventory}
ignore={'_prisma_migrations'}
missing=sorted(tables-known-ignore)
if missing:
 print('Backup inventory missing tables:',', '.join(missing));sys.exit(1)
print(f'Backup inventory covers {len(known)} table decisions ({len(tables)} discovered schema/migration references).')
