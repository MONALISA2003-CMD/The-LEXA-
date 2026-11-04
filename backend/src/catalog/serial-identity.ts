/** Physical item identity, used by every API that registers an inventory serial.
 * The PostgreSQL trigger is a second enforcement boundary for direct SQL writers.
 */
export class SerialIdentityError extends Error {
  constructor(message:string){super(message);this.name='SerialIdentityError';}
}

/** GSMA IMEI check digit (Luhn). Never generate a real device IMEI in production. */
export function isValidImei(value:string):boolean {
  if(!/^\d{15}$/.test(value))return false;
  let sum=0;
  for(let i=0;i<15;i++){
    let digit=value.charCodeAt(i)-48;
    if(i%2===1){digit*=2;if(digit>9)digit-=9;}
    sum+=digit;
  }
  return sum%10===0;
}

export type PhysicalIdentifiers={serialNumber:string;imei2:string|null};
export function validatePhysicalIdentifiers(primary:unknown,secondary:unknown,phone:boolean):PhysicalIdentifiers {
  if(typeof primary!=='string'||!primary.trim()||primary.trim().length>120)throw new SerialIdentityError('Enter an actual device IMEI or serial number (1–120 characters).');
  const serialNumber=primary.trim();
  if(/[\u0000-\u001f\u007f]/.test(serialNumber))throw new SerialIdentityError('Device identifiers must not contain control characters.');
  if(secondary!==undefined&&secondary!==null&&typeof secondary!=='string')throw new SerialIdentityError('Second IMEI must be a 15-digit text value.');
  const imei2=typeof secondary==='string'&&secondary.trim()?secondary.trim():null;
  if(phone&&!isValidImei(serialNumber))throw new SerialIdentityError('Phone IMEI must be 15 digits with a valid check digit. Scan the assigned IMEI.');
  if(imei2){
    if(!phone)throw new SerialIdentityError('A second IMEI is only accepted for an IMEI-tracked phone.');
    if(!isValidImei(imei2))throw new SerialIdentityError('Second IMEI must be 15 digits with a valid check digit.');
    if(imei2===serialNumber)throw new SerialIdentityError('Primary and secondary IMEIs must differ.');
  }
  return {serialNumber,imei2};
}
