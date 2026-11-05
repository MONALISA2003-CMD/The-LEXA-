/** Industry-independent purchase/sales packaging. Stock is always stored in base units. */
export class PackageQuantityError extends Error {constructor(message:string){super(message);this.name='PackageQuantityError';}}
function milli(value:unknown, label:string, allowZero=false):bigint {
 if((typeof value!=='string'&&typeof value!=='number') || typeof value==='number'&&!Number.isFinite(value))throw new PackageQuantityError(`${label} must be a decimal quantity.`);
 const text=String(value);
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/.test(text))throw new PackageQuantityError(`${label} must be a non-negative quantity with at most three decimal places.`);
 const [whole,fraction='']=text.split('.');
 const units=BigInt(whole!)*1000n+BigInt(fraction.padEnd(3,'0'));
 if(units===0n&&!allowZero)throw new PackageQuantityError(`${label} must be positive.`);
 return units;
}
/** Exact three-decimal unit conversion: rejects rather than silently rounding offcuts. */
export function packagesToBase(packs:unknown,unitsPerPackage:unknown, allowZero=false):number {
 const p=milli(packs,'Packages',allowZero),u=milli(unitsPerPackage,'Units per package');
 if((p*u)%1000n!==0n)throw new PackageQuantityError('Package conversion produces more than three decimal places of stock.');
 const result=(p*u)/1000n;
 if(result>1000000000n)throw new PackageQuantityError('Converted quantity exceeds the stock limit.');
 return Number(result)/1000;
}
/** Exact integer-safe unit counts for serialised goods. */
export function requireSerializedUnits(quantity:number):void {
 if(!Number.isSafeInteger(quantity)||quantity<=0)throw new PackageQuantityError('Serialized goods must be counted in whole physical units.');
}
export function validatePackageSize(units:unknown):number {return Number(milli(units,'Units per package'))/1000;}
