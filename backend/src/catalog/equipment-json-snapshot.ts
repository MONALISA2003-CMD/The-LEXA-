/** Safe Prisma JSON round-trip for immutable unit configuration history.
 * Prisma.JsonValue (reads) may contain a top-level null, whereas Prisma's
 * InputJsonValue (writes) does not. Specifications are JSON objects by
 * contract; rejecting malformed legacy values prevents silent audit loss.
 */
import type {Prisma} from '../generated/prisma/client';

export class InvalidEquipmentConfigurationSnapshot extends Error {
 constructor(field:string){
  super(`${field} must be a non-null JSON object. Reinspect the unit before applying its upgrade.`);
  this.name='InvalidEquipmentConfigurationSnapshot';
 }
}

export function asEquipmentConfigurationSnapshot(value:Prisma.JsonValue,field:string):Prisma.InputJsonObject {
 if(value===null||typeof value!=='object'||Array.isArray(value))
  throw new InvalidEquipmentConfigurationSnapshot(field);
 // Both read/write forms describe JSON objects; their nested nulls are
 // intentionally preserved. Only the top-level shape needs narrowing.
 return value as Prisma.InputJsonObject;
}
