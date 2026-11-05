/** Execute the reviewed Python demand model with already-authorised aggregate
 * inputs. The child process has no database credentials or network bindings.
 * Forecasts are advisory and cannot create a stock, supplier or GL record.
 */
import {spawn} from 'node:child_process';
import {join} from 'node:path';

export type DemandAdvice = {
 schemaVersion:number;tenantId:string;branchId:string;asOf:string;algorithmVersion:string;inputSha256:string;
 items:Array<{productId:string;variantId:string|null;sourceVersion:string;currency:string;model:string;modelVersion:string;
 observations:number;windowStart:string|null;windowEnd:string;forecastDaily:string|null;
 leadTimeDemand:string|null;availableToPromise:string;confirmedOnOrder:string;safetyStock:string;
 supplierPackMultiple:string;recommendedPurchaseUnits:string|null;unitCostMinor:number|null;
 validationMae:string|null;baselineMae:string|null;warnings:string[];requiresApproval:boolean;postingAllowed:boolean}>;
 scope:string;requiresHumanApproval:boolean;
};

export function reviewDemandAggregates(payload:unknown):Promise<DemandAdvice>{
 const input=JSON.stringify(payload);
 if(Buffer.byteLength(input,'utf8')>1_048_576)return Promise.reject(new Error('Demand source snapshot exceeds the permitted size.'));
 return new Promise((resolve,reject)=>{
  const child=spawn('python3',[join(process.cwd(),'analytics','industry_demand.py')],{
   shell:false,stdio:['pipe','pipe','pipe'],
   env:{PATH:process.env.PATH??'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'},
  });
  let output='',diagnostic='',finished=false;
  const done=(error?:Error,value?:DemandAdvice)=>{
   if(finished)return;finished=true;clearTimeout(timeout);
   if(error)reject(error);else if(value)resolve(value);else reject(new Error('Demand model returned no result.'));
  };
  const timeout=setTimeout(()=>{child.kill('SIGKILL');done(new Error('Demand model exceeded the execution limit.'));},4000);
  child.stdout.setEncoding('utf8').on('data',(chunk:string)=>{
   output+=chunk;if(Buffer.byteLength(output,'utf8')>1_048_576){child.kill('SIGKILL');done(new Error('Demand output exceeded the size limit.'));}
  });
  child.stderr.setEncoding('utf8').on('data',(chunk:string)=>{diagnostic=(diagnostic+chunk).slice(-240);});
  child.on('error',(error)=>done(error));
  child.on('close',(code)=>{
   if(code!==0){done(new Error('Demand model rejected the source snapshot. '+diagnostic));return;}
   try{
    const value=JSON.parse(output) as DemandAdvice;
    if(value?.schemaVersion!==1||value?.scope!=='read_only_recommendations'||value.requiresHumanApproval!==true||!Array.isArray(value.items)||
      value.items.some(x=>x.postingAllowed!==false||x.requiresApproval!==true))throw new Error('Unexpected demand output contract.');
    done(undefined,value);
   }catch{done(new Error('Demand model returned an invalid output contract.'));}
  });
  child.stdin.on('error',()=>{/* Exit event reports broken or closed stdin. */});
  child.stdin.end(input);
 });
}
