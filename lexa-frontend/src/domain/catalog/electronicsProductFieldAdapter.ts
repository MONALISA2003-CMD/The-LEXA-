import type { ProductField } from './industryCatalog';
import type { V2Family } from './electronicsFamilyTypes';

/** Adapt server-published family fields without mutating the shared policy. */
export function productFieldsForFamily(family: V2Family): readonly ProductField[] {
  return family.fields.map(field => ({
    key: field.key,
    label: field.key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, value => value.toUpperCase())
      + (field.unit ? ` (${field.unit})` : ''),
    kind: field.type === 'enum' ? 'select' as const : field.type,
    required: field.required,
    // Under exactOptionalPropertyTypes, an absent option list must be omitted,
    // not stored as an explicitly undefined property.
    ...(field.options === undefined ? {} : { options: field.options }),
  }));
}

/** Combine immutable catalogue fields with editable category-defined fields. */
export function mergeProductFields(
  base: readonly ProductField[],
  categoryFields: readonly ProductField[],
): ProductField[] {
  const publishedKeys = new Set(base.map(field => field.key));
  return [...base, ...categoryFields.filter(field => !publishedKeys.has(field.key))];
}
