/**
 * Strongly typed production form payloads.
 *
 * The frontend uses noUncheckedIndexedAccess and exactOptionalPropertyTypes:
 * - browser forms may omit any named field;
 * - optional API properties must be omitted, not assigned undefined;
 * - quantities must be validated before a stock or accounting operation.
 */
import type { apiProductionQuality, InspectionCheck } from '../../data/remote/apiProductionQuality';

type ProductionApi = typeof apiProductionQuality;
export type FormFields = Readonly<Record<string, string>>;
export type BomComponentFields = Readonly<{ productId: string; quantityPerOutput: string; scrapPercent: string; operationName: string }>;
export type InspectionCriterionFields = Readonly<{ code: string; description: string; type: string; minimum: string; maximum: string }>;

export function requiredField(fields: FormFields, key: string, label: string): string {
  const value = fields[key]?.trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalField(fields: FormFields, key: string): string | undefined {
  return fields[key]?.trim() || undefined;
}

/** Only include a property when it exists; never serialize `undefined`. */
function optionalString(key: string, value: string | undefined): Record<string, string> {
  return value ? { [key]: value } : {};
}

export function positiveQuantity(value: string | undefined, label: string): number {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || Math.abs(Math.round(n * 1000) - n * 1000) > 0.000001) {
    throw new Error(`${label} must be a positive quantity with no more than three decimal places.`);
  }
  return n;
}

function boundedPercent(value: string, label: string): number {
  if (!value.trim()) throw new Error(`${label} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error(`${label} must be between 0 and 100.`);
  return number;
}

function optionalFinite(value: string, label: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
}

export function makeBomPayload(fields: FormFields, components: readonly BomComponentFields[]): Parameters<ProductionApi['createBom']>[1] {
  if (!components.length) throw new Error('Add at least one component to this BOM.');
  return {
    productId: requiredField(fields, 'productId', 'Finished product'),
    ...optionalString('bomCode', optionalField(fields, 'bomCode')),
    outputQuantity: positiveQuantity(fields['outputQuantity'], 'Output quantity'),
    status: fields['status'] === 'active' ? 'active' : 'draft',
    ...optionalString('notes', optionalField(fields, 'notes')),
    components: components.map((component, index) => ({
      productId: requiredField(component, 'productId', `Component ${index + 1}`),
      quantityPerOutput: positiveQuantity(component.quantityPerOutput, `Component ${index + 1} quantity`),
      scrapPercent: boundedPercent(component.scrapPercent, `Component ${index + 1} scrap percentage`),
      ...(component.operationName.trim() ? { operationName: component.operationName.trim() } : {}),
      sequence: index + 1,
    })),
  };
}

export function makeWorkOrderPayload(fields: FormFields): Parameters<ProductionApi['createWorkOrder']>[1] {
  return {
    bomId: requiredField(fields, 'bomId', 'Approved BOM'),
    warehouseId: requiredField(fields, 'warehouseId', 'Production warehouse'),
    plannedQuantity: positiveQuantity(fields['plannedQuantity'], 'Planned quantity'),
    ...optionalString('plannedStart', optionalField(fields, 'plannedStart')),
    ...optionalString('dueDate', optionalField(fields, 'dueDate')),
  };
}

export function makeInspectionPlanPayload(fields: FormFields, checks: readonly InspectionCriterionFields[]): Parameters<ProductionApi['createPlan']>[1] {
  if (!checks.length) throw new Error('Add at least one inspection criterion.');
  const stage = fields['inspectionStage'];
  const inspectionStage: 'receiving' | 'in_process' | 'final' = stage === 'receiving' || stage === 'in_process' ? stage : 'final';
  return {
    ...optionalString('planCode', optionalField(fields, 'planCode')),
    name: requiredField(fields, 'name', 'Inspection plan name'),
    ...optionalString('productId', optionalField(fields, 'productId')),
    inspectionStage,
    checks: checks.map((check, index) => {
      const type = check.type;
      if (type !== 'boolean' && type !== 'numeric' && type !== 'text') throw new Error(`Criterion ${index + 1} has an invalid type.`);
      const minimum = type === 'numeric' ? optionalFinite(check.minimum, 'Minimum measurement') : undefined;
      const maximum = type === 'numeric' ? optionalFinite(check.maximum, 'Maximum measurement') : undefined;
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new Error(`Criterion ${index + 1}: minimum cannot exceed maximum.`);
      }
      return {
        code: check.code.trim() || `QC-${index + 1}`,
        description: requiredField(check, 'description', `Criterion ${index + 1} description`),
        type,
        required: true,
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
        sequence: index + 1,
      };
    }),
  };
}

export function makeInspectionPayload(fields: FormFields): Parameters<ProductionApi['createInspection']>[1] {
  return {
    planId: requiredField(fields, 'planId', 'Inspection plan'),
    productId: requiredField(fields, 'productId', 'Inspected product'),
    inspectedQuantity: positiveQuantity(fields['inspectedQuantity'], 'Inspected quantity'),
    ...optionalString('workOrderId', optionalField(fields, 'workOrderId')),
    ...optionalString('lotId', optionalField(fields, 'lotId')),
  };
}

export function makeInspectionDecisionPayload(
  fields: FormFields,
  checks: readonly InspectionCheck[],
  answers: Readonly<Record<string, string>>,
): Parameters<ProductionApi['decideInspection']>[2] {
  if (!checks.length) throw new Error('Inspection plan has no criteria.');
  const decision = requiredField(fields, 'decision', 'Inspection decision');
  if (decision !== 'passed' && decision !== 'failed') throw new Error('Select a valid inspection decision.');
  const results = checks.map((check) => {
    const input = requiredField(answers, check.id, check.description);
    if (check.type === 'boolean') {
      if (input !== 'yes' && input !== 'no') throw new Error(`Select a valid result for ${check.description}.`);
      return { checkId: check.id, booleanValue: input === 'yes' };
    }
    if (check.type === 'numeric') {
      const numericValue = Number(input);
      if (!Number.isFinite(numericValue)) throw new Error(`${check.description} must be a valid measurement.`);
      return { checkId: check.id, numericValue };
    }
    return { checkId: check.id, textValue: input };
  });
  return {
    decision,
    ...optionalString('notes', optionalField(fields, 'notes')),
    results,
  };
}

export function makeCompletedWorkOrderPayload(fields: FormFields): Parameters<ProductionApi['completeWorkOrder']>[2] {
  const batchNumber = optionalField(fields, 'batchNumber');
  const serialNumbers = optionalField(fields, 'serialNumbers')?.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
  if (serialNumbers && new Set(serialNumbers).size !== serialNumbers.length) {
    throw new Error('Finished-product serial numbers must be unique.');
  }
  return {
    completedQuantity: positiveQuantity(fields['completedQuantity'], 'Completed quantity'),
    ...(batchNumber ? { batchNumber } : {}),
    ...(serialNumbers?.length ? { serialNumbers } : {}),
  };
}

export function makeCompletedJobStepPayload(fields: FormFields): Parameters<ProductionApi['completeJobStep']>[3] {
  const raw = requiredField(fields, 'actualMinutes', 'Actual minutes');
  const actualMinutes = Number(raw);
  if (!Number.isSafeInteger(actualMinutes) || actualMinutes < 0 || actualMinutes > 1_000_000) {
    throw new Error('Actual minutes must be a non-negative whole number.');
  }
  return {
    actualMinutes,
    ...optionalString('notes', optionalField(fields, 'notes')),
  };
}
