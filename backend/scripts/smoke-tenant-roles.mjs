#!/usr/bin/env node
/** Read-only authenticated staging smoke test; no records are created or modified.
 *
 * Required env: LEXA_SMOKE_API_URL, LEXA_SMOKE_WORKSPACE_ID,
 * LEXA_SMOKE_BRANCH_ID, LEXA_SMOKE_OTHER_WORKSPACE_ID,
 * LEXA_SMOKE_OWNER_SESSION, LEXA_SMOKE_MANAGER_SESSION,
 * LEXA_SMOKE_CASHIER_SESSION, LEXA_SMOKE_WAREHOUSE_SESSION,
 * LEXA_SMOKE_TECHNICIAN_SESSION.
 * Never log cookies or use live customer accounts for negative testing.
 */
const e=process.env;
const required=['LEXA_SMOKE_API_URL','LEXA_SMOKE_WORKSPACE_ID','LEXA_SMOKE_BRANCH_ID','LEXA_SMOKE_OTHER_WORKSPACE_ID','LEXA_SMOKE_OWNER_SESSION','LEXA_SMOKE_MANAGER_SESSION','LEXA_SMOKE_CASHIER_SESSION','LEXA_SMOKE_WAREHOUSE_SESSION','LEXA_SMOKE_TECHNICIAN_SESSION'];
const missing=required.filter(k=>!e[k]);
if(missing.length){console.error('Staging smoke test not configured: '+missing.join(', '));process.exit(2);}
const base=new URL(e.LEXA_SMOKE_API_URL);
if(base.protocol!=='https:'&&base.hostname!=='127.0.0.1'&&base.hostname!=='localhost')throw Error('Smoke test requires HTTPS or localhost.');
if(e.LEXA_SMOKE_WORKSPACE_ID===e.LEXA_SMOKE_OTHER_WORKSPACE_ID)throw Error('The isolated test workspace must be distinct.');
const w=encodeURIComponent(e.LEXA_SMOKE_WORKSPACE_ID),b=encodeURIComponent(e.LEXA_SMOKE_BRANCH_ID),other=encodeURIComponent(e.LEXA_SMOKE_OTHER_WORKSPACE_ID);
const a=`/api/v1/workspaces/${w}`,br=`${a}/branches/${b}`;
const runs=[
 {role:'owner',path:`${a}/catalog/industry-config`,ok:[200]},
 {role:'manager',path:`${a}/products`,ok:[200]},
 {role:'cashier',path:`${a}/products`,ok:[200]},
 {role:'cashier',path:`${br}/workstream6/support/my-cases`,ok:[403]},
 {role:'warehouse',path:`${a}/products`,ok:[200]},
 {role:'warehouse',path:`${br}/platform/jobs`,ok:[403]},
 {role:'technician',path:`${a}/products`,ok:[200]},
 {role:'technician',path:`${br}/workstream6/support/my-cases`,ok:[200]},
 {role:'technician',path:`${br}/workstream6/support/cases`,ok:[403]},
 {role:'technician',path:`${br}/platform/jobs`,ok:[403]},
 {role:'manager',path:`${a}/roles/catalog`,ok:[403]},
 {role:'owner',path:`/api/v1/workspaces/${other}/products`,ok:[403,404]},
 {role:'cashier',path:`/api/v1/workspaces/${other}/products`,ok:[403,404]},
];
let passed=0;
for(const task of runs){
 const session=e[`LEXA_SMOKE_${task.role.toUpperCase()}_SESSION`];
 const url=new URL(task.path,base);
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
 let response;
 try{response=await fetch(url,{method:'GET',headers:{cookie:`lexa_session=${encodeURIComponent(session)}`,accept:'application/json'},redirect:'manual',signal:controller.signal});}
 finally{clearTimeout(timer);}
 if(!task.ok.includes(response.status))throw Error(`Role smoke failed: ${task.role} ${task.path}: HTTP ${response.status}, expected ${task.ok.join('/')}`);
 console.log(`PASS: ${task.role} GET ${task.path} -> HTTP ${response.status}`);
 passed++;
}
console.log(`${passed} authenticated read-only role/tenant smoke checks passed.`);
