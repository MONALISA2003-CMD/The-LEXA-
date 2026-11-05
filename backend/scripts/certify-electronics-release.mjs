#!/usr/bin/env node
/** Read-only Phase 9 evidence gate. This command never changes production feature flags. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const [file]=process.argv.slice(2);
if(!file){console.error('Usage: npm run release:electronics-gate -- <signed-evidence.json>');process.exit(2);}
let evidence;
try{evidence=JSON.parse(readFileSync(resolve(file),'utf8'));}catch(e){console.error('Evidence file cannot be read:',e instanceof Error?e.message:String(e));process.exit(2);}
const required=['backendBuild','frontendBuild','migrationApplied','tenantRls','serialLedger','financialLedger','backupRestore','scenarioMatrix','crossClientRoles','concurrentCheckout','perfBenchmarks','internalSmoke','monitoringReady','incidentRollback','ownerApproval'];
const missing=[];
// A single 'scenarioMatrix: passed' checkbox is insufficient. Every normative
// journey and adversarial case must have its own reviewer and evidence link.
const requiredScenarioIds=[
  ...Array.from({length:25},(_,i)=>`E2E-${String(i+1).padStart(3,'0')}`),
  ...Array.from({length:20},(_,i)=>`NEG-${String(i+1).padStart(3,'0')}`),
];
for(const scenario of requiredScenarioIds){
  const record=evidence.scenarios?.[scenario];
  if(record?.passed!==true||typeof record.evidenceRef!=='string'||!record.evidenceRef.trim()||
    typeof record.reviewer!=='string'||!record.reviewer.trim()||
    typeof record.reviewedAt!=='string'||!Number.isFinite(Date.parse(record.reviewedAt))){
    missing.push(`scenarios.${scenario}: verified result, reviewer and evidence required`);
  }
}
// Per-spec cross-client / permission matrix must include every worker persona.
const roleSet=new Set(Array.isArray(evidence.certifiedRoles)?evidence.certifiedRoles:[]);
for(const role of ['owner','manager','cashier','warehouse','technician','auditor']){
  if(!roleSet.has(role))missing.push(`certifiedRoles.${role}`);
}
if(!Array.isArray(evidence.testTenants)||new Set(evidence.testTenants).size<2)missing.push('testTenants: two independent tenant IDs required');
if(!Array.isArray(evidence.testBranches)||new Set(evidence.testBranches).size<2)missing.push('testBranches: two independent branches required');
const perf=evidence.performance??{};
if(!(typeof perf.searchP95Ms==='number'&&perf.searchP95Ms>=0&&perf.searchP95Ms<300))missing.push('performance.searchP95Ms under 300ms');
if(!(typeof perf.identifierLookupP95Ms==='number'&&perf.identifierLookupP95Ms>=0&&perf.identifierLookupP95Ms<250))missing.push('performance.identifierLookupP95Ms under 250ms');
if(perf.lastUnitAttempts!==100||perf.lastUnitSuccesses!==1)missing.push('performance: 100 concurrent attempts with one successful last-unit allocation');
if(perf.unitScanBatchSize!==1000||perf.unitScanBatchValidated!==true)missing.push('performance: 1000-unit receiving reviewed');
if(typeof evidence.qaSignoff?.reviewer!=='string'||!evidence.qaSignoff.reviewer.trim()||
   typeof evidence.qaSignoff?.signedEvidenceRef!=='string'||!evidence.qaSignoff.signedEvidenceRef.trim())missing.push('qaSignoff: separately reviewed signed evidence required');
if(evidence.schemaVersion!==1)missing.push('schemaVersion');
if(!['isolated_staging','internal_test_workspace'].includes(evidence.environment))missing.push('environment must be a test environment');
if(!/^[0-9a-f]{40}$/i.test(evidence.gitSha??''))missing.push('gitSha');
const deployed=typeof evidence.gitSha==='string'?evidence.gitSha.toLowerCase():'';
for(const field of ['backendBuildSha','frontendBuildSha'])if((evidence[field]??'').toLowerCase()!==deployed)missing.push(`${field} must match tested Git commit`);
if(evidence.migrationHead!=='20261105220000_equipment_service_and_appliance_custody')missing.push('migrationHead');
if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(evidence.workspaceId??''))missing.push('workspaceId');
if(!Array.isArray(evidence.criticalFindings)||evidence.criticalFindings.length!==0)missing.push('criticalFindings must be confirmed empty');
for(const key of required){const item=evidence.checks?.[key];if(item?.passed!==true||typeof item.evidenceRef!=='string'||!item.evidenceRef.trim()||!item.reviewedAt)missing.push(`checks.${key}: independently verified evidence required`);}
if(typeof evidence.ownerAuthorization?.approver!=='string'||!evidence.ownerAuthorization.approver.trim()||
   typeof evidence.ownerAuthorization?.signedEvidenceRef!=='string'||!evidence.ownerAuthorization.signedEvidenceRef.trim())missing.push('ownerAuthorization: independent owner signoff required');
if(evidence.ownerAuthorization?.explicitProductionPromotion===true)missing.push('production promotion is not accepted by an automated staging-evidence script');
const allow=missing.length===0;
console.log(JSON.stringify({status:allow?'staging_evidence_complete_pending_human_production_authorization':'blocked',gitSha:deployed||null,missing},null,2));
process.exit(allow?0:2);
