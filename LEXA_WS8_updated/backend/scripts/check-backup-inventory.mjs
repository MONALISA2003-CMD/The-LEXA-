import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schema=fs.readFileSync(path.join(root,'prisma/schema.prisma'),'utf8');
const tables=new Set([...schema.matchAll(/@@map\("([a-zA-Z0-9_]+)"\)/g)].map(m=>m[1]));
const migrations=path.join(root,'prisma/migrations');
for(const dir of fs.readdirSync(migrations,{withFileTypes:true}).filter(x=>x.isDirectory())){
 const file=path.join(migrations,dir.name,'migration.sql');if(!fs.existsSync(file))continue;
 let sql=fs.readFileSync(file,'utf8').replace(/\bIF\s+(?:NOT\s+)?EXISTS\b/gi,'').replace(/\bpublic\./gi,'');
 for(const m of sql.matchAll(/CREATE\s+TABLE\s+([a-zA-Z0-9_]+)/gi))tables.add(m[1]);
 for(const m of sql.matchAll(/ALTER\s+TABLE\s+([a-zA-Z0-9_]+)/gi))tables.add(m[1]);
}
const inventory=JSON.parse(fs.readFileSync(path.join(root,'backup/authoritative-inventory.json'),'utf8'));
const known=new Set(inventory.map(x=>x.table));
const missing=[...tables].filter(x=>x!=='_prisma_migrations'&&!known.has(x)).sort();
if(missing.length){console.error('Backup inventory missing tables:',missing.join(', '));process.exit(1);}
console.log(`Backup inventory covers ${known.size} table decisions (${tables.size} discovered schema/migration references).`);
