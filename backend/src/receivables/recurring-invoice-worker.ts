import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { addCalendarDays, nextRecurringDate, type RecurrenceFrequency, type RecurrenceIntervalUnit } from './recurring-schedule-rules';

function toDate(value: unknown): string { return value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10); }
function minor(value: number, label: string): number { if(!Number.isSafeInteger(value)||value<0||value>2_000_000_000)throw new Error(`${label} exceeds the supported amount.`);return value; }
function roundTax(base: number, rate: number, method: string, inclusive=false): number {
  const value=inclusive?base*rate/(10000+rate):base*rate/10000;
  if(method==='floor')return Math.floor(value);if(method==='ceiling')return Math.ceil(value);
  if(method==='half_even'){const lower=Math.floor(value),fraction=value-lower;return fraction<0.5?lower:fraction>0.5?lower+1:(lower%2===0?lower:lower+1);}
  return Math.round(value);
}

async function postRecurringInvoiceJournal(client:any, schedule:any, invoiceId:string, subtotal:number, tax:number, actorId:string, date:string) {
  const sourceType='recurring_invoice_issued';
  const existing=await client.query('SELECT id FROM ledger_journals WHERE tenant_id=$1::uuid AND source_type=$2 AND source_id=$3 LIMIT 1',[schedule.tenant_id,sourceType,invoiceId]);
  if(existing.rowCount)return;
  const accounts=[['1100','Accounts receivable control','asset','debit','accounts_receivable'],['4000','Sales revenue','revenue','credit','sales_revenue'],['2100','Tax payable','liability','credit','tax_payable']];
  for(const [code,name,kind,normal,key] of accounts)await client.query(
    `INSERT INTO ledger_accounts(id,tenant_id,account_code,account_name,account_type,normal_balance,system_key)
     VALUES(gen_random_uuid(),$1::uuid,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,account_code) DO NOTHING`,[schedule.tenant_id,code,name,kind,normal,key]);
  const result=await client.query("SELECT id::text,system_key FROM ledger_accounts WHERE tenant_id=$1::uuid AND is_active=true AND system_key=ANY($2::text[]) FOR SHARE",[schedule.tenant_id,['accounts_receivable','sales_revenue','tax_payable']]);
  const byKey=new Map(result.rows.map((x:any)=>[String(x.system_key),String(x.id)]));
  if(!byKey.has('accounts_receivable')||!byKey.has('sales_revenue')||(tax>0&&!byKey.has('tax_payable')))throw new Error('Required ledger accounts are missing or inactive for recurring invoice auto-issue.');
  const journalId=randomUUID();const number=`AUTO-${date.replace(/-/g,'')}-${journalId.slice(0,8).toUpperCase()}`;
  await client.query(`INSERT INTO ledger_journals(id,tenant_id,branch_id,journal_number,entry_date,memo,status,source_type,source_id,created_by_user_id,posted_by_user_id,posted_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,'posted',$7,$8,$9::uuid,$9::uuid,now())`,[journalId,schedule.tenant_id,schedule.branch_id,number,date,`Recurring invoice ${schedule.customer_name_snapshot}`,sourceType,invoiceId,actorId]);
  const lines=[{key:'accounts_receivable',debit:subtotal+tax,credit:0,description:'Accounts receivable'},{key:'sales_revenue',debit:0,credit:subtotal,description:'Recurring invoice revenue'}];
  if(tax>0)lines.push({key:'tax_payable',debit:0,credit:tax,description:'Output tax'});
  for(let i=0;i<lines.length;i++){const line=lines[i];await client.query(`INSERT INTO ledger_journal_lines(id,tenant_id,journal_id,line_number,account_id,description,debit_minor,credit_minor)
    VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7)`,[schedule.tenant_id,journalId,i+1,byKey.get(line.key),line.description,line.debit,line.credit]);}
  await client.query(`INSERT INTO audit_events(id,tenant_id,branch_id,actor_user_id,action,resource_type,resource_id,metadata)
    VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,'ledger.source.posted','ledger_journal',$4,$5::jsonb)`,[schedule.tenant_id,schedule.branch_id,actorId,journalId,JSON.stringify({sourceType,sourceId:invoiceId,debitMinor:subtotal+tax,creditMinor:subtotal+tax})]);
}

/** Generate exactly one occurrence. Occurrence uniqueness and invoice link are enforced in PostgreSQL. */
export async function processRecurringInvoice(pool:Pool,tenantId:string,scheduleId:string,scheduledDate:string):Promise<void>{
  const client=await pool.connect();let schedule:any;let occurrenceId:string|undefined;
  try{
    // The supplied tenant-scoped pool applies role and tenant settings after BEGIN.
    await client.query('BEGIN');
    const found=await client.query(`SELECT s.*,b.timezone AS branch_timezone FROM recurring_invoice_schedules s JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id
      WHERE s.id=$1::uuid AND s.tenant_id=$2::uuid FOR UPDATE OF s`,[scheduleId,tenantId]);schedule=found.rows[0];
    if(!schedule||schedule.status!=='active'||toDate(schedule.next_run_date)!==scheduledDate){await client.query('COMMIT');return;}
    if(await client.query("SELECT 1 FROM platform_runtime_controls WHERE tenant_id=$1::uuid AND control_key='recurring_jobs_paused' AND enabled=true LIMIT 1",[tenantId]).then((x:any)=>x.rowCount)){await client.query('COMMIT');return;}
    const occurrenceKey=scheduledDate;
    const created=await client.query(`INSERT INTO recurring_invoice_occurrences(id,tenant_id,branch_id,schedule_id,occurrence_key,scheduled_local_date,status,snapshot,attempts)
      VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4,$5::date,'generating',$6::jsonb,0)
      ON CONFLICT(schedule_id,occurrence_key) DO UPDATE SET status='generating',attempts=recurring_invoice_occurrences.attempts+1,error_summary=NULL,updated_at=now(),snapshot=EXCLUDED.snapshot WHERE recurring_invoice_occurrences.status IN ('failed','queued') RETURNING id::text`,[tenantId,schedule.branch_id,scheduleId,occurrenceKey,scheduledDate,JSON.stringify({scheduleId,customerName:schedule.customer_name_snapshot,issueMode:schedule.issue_mode,lineTemplates:schedule.line_templates})]);
    occurrenceId=created.rows[0]?.id;
    if(!occurrenceId){await client.query('COMMIT');return;}
    const customer=await client.query(`SELECT data FROM module_records WHERE tenant_id=$1::uuid AND branch_id=$2::uuid AND module_id='customers' AND record_id=$3 LIMIT 1`,[tenantId,schedule.branch_id,schedule.customer_record_id]);
    if(!customer.rowCount)throw Object.assign(new Error('Scheduled customer is no longer available in this branch.'),{permanent:true});
    const customerData=customer.rows[0].data||{};
    const customerName=String(customerData.name||customerData.customerName||schedule.customer_name_snapshot);
    const templates=Array.isArray(schedule.line_templates)?schedule.line_templates:[];if(!templates.length)throw Object.assign(new Error('Recurring invoice schedule contains no line templates.'),{permanent:true});
    const issueDate=scheduledDate;const dueDate=addCalendarDays(issueDate,Number(schedule.due_days));
    let subtotal=0;let totalTax=0;const lines:any[]=[];
    for(const template of templates){
      const q=Number(template.quantity);const unitPrice=Number(template.unitPriceMinor);const discount=Number(template.discountMinor||0);
      if(!Number.isFinite(q)||q<=0||!Number.isSafeInteger(unitPrice)||unitPrice<0||!Number.isSafeInteger(discount)||discount<0)throw Object.assign(new Error('Recurring invoice line template is invalid.'),{permanent:true});
      const gross=minor(Math.round(q*unitPrice),'Invoice line gross');const discountedGross=minor(gross-discount,'Invoice line discounted gross');if(discountedGross<0)throw Object.assign(new Error('Invoice line discount exceeds its value.'),{permanent:true});
      let net=discountedGross;let tax=0;let taxCodeSnapshot:string|null=null;let taxRuleVersionId:string|null=null;let rate=0;let calculation:string|null=null;let rounding='half_up';let taxSnapshot:any={treatment:'unconfigured',rateBasisPoints:0,taxMinor:0};
      if(template.taxCodeId){
        const versions=await client.query(`SELECT v.id::text,v.rate_basis_points,v.calculation_method,v.rounding_method,v.treatment,v.code_snapshot
          FROM tax_code_rule_versions v WHERE v.tenant_id=$1::uuid AND v.tax_code_id=$2::uuid AND v.status='approved'
            AND v.effective_from<=$3::date AND (v.effective_to IS NULL OR v.effective_to>=$3::date) ORDER BY v.version DESC LIMIT 1`,[tenantId,template.taxCodeId,scheduledDate]);
        if(!versions.rowCount)throw Object.assign(new Error('An invoice line tax code has no approved effective rule on its scheduled issue date.'),{permanent:true});
        const v=versions.rows[0];rate=Number(v.rate_basis_points);calculation=String(v.calculation_method);rounding=String(v.rounding_method);taxCodeSnapshot=String(v.code_snapshot);taxRuleVersionId=String(v.id);
        if(String(v.treatment)==='standard_rated'){tax=roundTax(discountedGross,rate,rounding,calculation==='inclusive');if(calculation==='inclusive')net=discountedGross-tax;}
        taxSnapshot={treatment:v.treatment,code:v.code_snapshot,rateBasisPoints:rate,calculationMethod:calculation,roundingMethod:rounding,ruleVersionId:taxRuleVersionId,effectiveOn:scheduledDate,taxMinor:tax};
      }
      subtotal+=net;totalTax+=tax;
      lines.push({description:String(template.description),productId:template.productId||null,quantity:q,unitPriceMinor:unitPrice,discountMinor:discount,lineTotalMinor:net,taxMinor:tax,taxCodeSnapshot,taxRuleVersionId,taxRateBasisPoints:rate,taxCalculationMethod:calculation,taxRoundingMethod:rounding,taxSnapshot});
    }
    minor(subtotal,'Invoice subtotal');minor(totalTax,'Invoice tax');const total=minor(subtotal+totalTax,'Invoice total');
    const invoiceId=randomUUID();const invoiceNumber=`RINV-${scheduledDate.replace(/-/g,'')}-${randomUUID().slice(0,6).toUpperCase()}`;
    const issueMode=String(schedule.issue_mode);const status=issueMode==='auto_issue'?'issued':'draft';
    await client.query(`INSERT INTO ar_customer_invoices(id,tenant_id,branch_id,invoice_number,customer_record_id,customer_name,customer_phone,currency,status,
      subtotal_minor,tax_minor,total_minor,issue_date,due_date,issued_at,notes,created_by_user_id,recurring_schedule_id,recurring_occurrence_id,tax_snapshot)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,CASE WHEN $9='issued' THEN now() ELSE NULL END,$15,$16::uuid,$17::uuid,$18::uuid,$19::jsonb)`,
      [invoiceId,tenantId,schedule.branch_id,invoiceNumber,schedule.customer_record_id,customerName,schedule.customer_phone_snapshot,schedule.currency,status,subtotal,totalTax,total,issueDate,dueDate,`Generated from recurring invoice schedule ${scheduleId}`,schedule.created_by_user_id,scheduleId,occurrenceId,JSON.stringify({source:'recurring_schedule',scheduleId,occurrenceId,issueDate,lines:lines.map(x=>x.taxSnapshot)})]);
    for(const line of lines)await client.query(`INSERT INTO ar_customer_invoice_lines(id,tenant_id,branch_id,invoice_id,product_id,product_name_snapshot,quantity,unit_price_minor,line_total_minor,
      description_snapshot,discount_minor,tax_minor,tax_code_snapshot,tax_rule_version_id,tax_rate_basis_points,tax_calculation_method,tax_rounding_method,tax_snapshot)
      VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::numeric,$7,$8,$9,$10,$11,$12,$13::uuid,$14,$15,$16,$17::jsonb)`,
      [tenantId,schedule.branch_id,invoiceId,line.productId,line.description,line.quantity,line.unitPriceMinor,line.lineTotalMinor,line.description,line.discountMinor,line.taxMinor,line.taxCodeSnapshot,line.taxRuleVersionId,line.taxRateBasisPoints,line.taxCalculationMethod,line.taxRoundingMethod,JSON.stringify(line.taxSnapshot)]);
    if(issueMode==='auto_issue')await postRecurringInvoiceJournal(client,schedule,invoiceId,subtotal,totalTax,String(schedule.updated_by_user_id||schedule.created_by_user_id),issueDate);
    const invoiceData={id:invoiceId,invoiceNumber,customer:customerName,customerName,customerRecordId:schedule.customer_record_id,issueDate,dueDate,itemSummary:lines.map(x=>x.description).join('; '),quantity:String(lines.reduce((s,x)=>s+x.quantity,0)),totalMinor:total,subtotalMinor:subtotal,taxMinor:totalTax,currency:schedule.currency,status:status==='issued'?'Issued':'Draft',recurringScheduleId:scheduleId,recurringOccurrenceId:occurrenceId};
    await client.query(`INSERT INTO module_records(id,tenant_id,branch_id,module_id,record_id,data,version) VALUES(gen_random_uuid(),$1::uuid,$2::uuid,'sales-invoices',$3,$4::jsonb,1)
      ON CONFLICT(tenant_id,branch_id,module_id,record_id) DO UPDATE SET data=EXCLUDED.data,version=module_records.version+1,updated_at=now()`,[tenantId,schedule.branch_id,invoiceId,JSON.stringify(invoiceData)]);
    await client.query(`UPDATE recurring_invoice_occurrences SET status='generated',invoice_id=$3::uuid,invoice_number=$4,snapshot=snapshot||$5::jsonb,generated_at=now(),updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid`,[occurrenceId,tenantId,invoiceId,invoiceNumber,JSON.stringify({invoiceId,invoiceNumber,subtotalMinor:subtotal,taxMinor:totalTax,totalMinor:total,issueMode})]);
    const count=Number(schedule.occurrence_count)+1;const maximum= schedule.maximum_occurrences===null?null:Number(schedule.maximum_occurrences);
    const next=nextRecurringDate({currentDate:scheduledDate,frequency:schedule.frequency as RecurrenceFrequency,anchorDay:Number(schedule.anchor_day),intervalCount:Number(schedule.interval_count),intervalUnit:schedule.interval_unit as RecurrenceIntervalUnit|null});
    const complete=(maximum!==null&&count>=maximum)||(schedule.end_date&&next>toDate(schedule.end_date));
    const nextRun=await client.query(`SELECT ($1::date + $2::time) AT TIME ZONE $3 AS next_run_at`,[next,schedule.run_at_local_time,schedule.schedule_timezone]);
    await client.query(`UPDATE recurring_invoice_schedules SET occurrence_count=$3,next_run_date=$4::date,next_run_at=$5,status=CASE WHEN $6 THEN 'completed' ELSE 'active' END,last_error_summary=NULL,updated_at=now() WHERE id=$1::uuid AND tenant_id=$2::uuid`,[scheduleId,tenantId,count,next,nextRun.rows[0].next_run_at,Boolean(complete)]);
    const eventId=randomUUID();const eventType='recurring_invoice.generated';
    await client.query(`INSERT INTO module_domain_events(id,tenant_id,branch_id,module_id,record_id,event_type,payload,dedupe_key,actor_user_id)
      VALUES($1::uuid,$2::uuid,$3::uuid,'sales-invoices',$4,$5,$6::jsonb,$7,$8::uuid) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING`,[eventId,tenantId,schedule.branch_id,invoiceId,eventType,JSON.stringify({invoiceNumber,invoiceId,scheduleId,occurrenceId,notificationUserIds:schedule.notification_user_ids||[]}),`recurring-invoice-generated:${occurrenceId}`,schedule.created_by_user_id]);
    await client.query('COMMIT');
  }catch(error:any){
    await client.query('ROLLBACK').catch(()=>undefined);
    const message=String(error?.message||'Recurring invoice generation failed').slice(0,240);
    if(occurrenceId){await client.query(`INSERT INTO recurring_invoice_occurrences(id,tenant_id,branch_id,schedule_id,occurrence_key,scheduled_local_date,status,snapshot,attempts,error_summary)
      SELECT $1::uuid,$2::uuid,s.branch_id,s.id,$3,$4::date,'failed','{}'::jsonb,1,$5 FROM recurring_invoice_schedules s WHERE s.id=$6::uuid AND s.tenant_id=$2::uuid
      ON CONFLICT(schedule_id,occurrence_key) DO UPDATE SET status='failed',attempts=recurring_invoice_occurrences.attempts+1,error_summary=EXCLUDED.error_summary,updated_at=now()`,[occurrenceId,tenantId,scheduledDate,scheduledDate,message,scheduleId]).catch(()=>undefined);}
    const attemptRows = occurrenceId ? await client.query(`SELECT attempts FROM recurring_invoice_occurrences WHERE id=$1::uuid AND tenant_id=$2::uuid`,[occurrenceId,tenantId]).catch(()=>({rows:[]})) : {rows:[]};
    const retryAttempt = Math.max(1, Number(attemptRows.rows[0]?.attempts ?? 1));
    const retryDelayMs = Math.min(3600000, 30000 * 2 ** Math.min(6, retryAttempt - 1));
    const scheduleRow = await client.query(`UPDATE recurring_invoice_schedules SET status=CASE WHEN $3 THEN 'needs_attention' ELSE status END,
      next_run_at=CASE WHEN $3 THEN next_run_at ELSE now()+($5::text||' milliseconds')::interval END,
      last_error_summary=$4,updated_at=now()
      WHERE id=$1::uuid AND tenant_id=$2::uuid RETURNING branch_id,created_by_user_id`,[scheduleId,tenantId,Boolean(error?.permanent),message,retryDelayMs]).catch(()=>({rows:[]}));
    if (scheduleRow.rows[0]) {
      await client.query(`INSERT INTO module_domain_events(id,tenant_id,branch_id,module_id,record_id,event_type,payload,dedupe_key,actor_user_id)
        VALUES($1::uuid,$2::uuid,$3::uuid,'recurring-invoices',$4,'recurring_invoice.failed',$5::jsonb,$6,$7::uuid)
        ON CONFLICT(tenant_id,dedupe_key) DO NOTHING`, [randomUUID(),tenantId,scheduleRow.rows[0].branch_id,scheduleId,JSON.stringify({scheduleId,occurrenceId,scheduledDate,errorCode:error?.permanent?'PERMANENT':'RETRYABLE',notificationUserIds:schedule?.notification_user_ids||[]}),`recurring-invoice-failed:${scheduleId}:${scheduledDate}:${occurrenceId||'unstarted'}`,scheduleRow.rows[0].created_by_user_id]).catch(()=>undefined);
    }
    throw error;
  }finally{client.release();}
}
