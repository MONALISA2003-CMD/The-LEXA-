import { describe, expect, it } from 'vitest';
import type { InspectionCheck } from '../../data/remote/apiProductionQuality';
import {
  makeBomPayload,
  makeWorkOrderPayload,
  makeInspectionPlanPayload,
  makeInspectionPayload,
  makeInspectionDecisionPayload,
  makeCompletedWorkOrderPayload,
  makeCompletedJobStepPayload,
} from './productionQualityForms';

const component = { productId: 'component-1', quantityPerOutput: '2.125', scrapPercent: '5', operationName: '' };
const checks: InspectionCheck[] = [
  { id: 'check-1', code: 'VIS', description: 'Visual examination', type: 'boolean', required: true, minimum: null, maximum: null, sequence: 1 },
  { id: 'check-2', code: 'DIM', description: 'Dimension', type: 'numeric', required: true, minimum: 5, maximum: 10, sequence: 2 },
  { id: 'check-3', code: 'OBS', description: 'Inspection observation', type: 'text', required: true, minimum: null, maximum: null, sequence: 3 },
];

describe('Production and quality form payloads', () => {
  it('requires a finished product and omits blank optional BOM fields', () => {
    expect(() => makeBomPayload({ outputQuantity: '1' }, [component])).toThrow('Finished product is required');
    const body = makeBomPayload({ productId: 'finished-1', outputQuantity: '1', status: 'draft', bomCode: '', notes: '' }, [component]);
    expect(body).toMatchObject({ productId: 'finished-1', outputQuantity: 1, status: 'draft', components: [{ productId: 'component-1', quantityPerOutput: 2.125, scrapPercent: 5, sequence: 1 }] });
    expect(body).not.toHaveProperty('bomCode');
    expect(body).not.toHaveProperty('notes');
    expect(body.components[0]).not.toHaveProperty('operationName');
  });

  it('rejects invalid or over-precise BOM quantities and scrap percentages', () => {
    expect(() => makeBomPayload({ productId: 'finished-1', outputQuantity: '1' }, [{ ...component, quantityPerOutput: '1.1234' }])).toThrow('no more than three decimal places');
    expect(() => makeBomPayload({ productId: 'finished-1', outputQuantity: '1' }, [{ ...component, scrapPercent: '101' }])).toThrow('between 0 and 100');
    expect(() => makeBomPayload({ productId: 'finished-1', outputQuantity: '1' }, [])).toThrow('Add at least one component');
  });

  it('requires real BOM and warehouse references for a work order', () => {
    expect(() => makeWorkOrderPayload({ plannedQuantity: '10' })).toThrow('Approved BOM is required');
    expect(() => makeWorkOrderPayload({ bomId: 'bom-1', plannedQuantity: '10' })).toThrow('Production warehouse is required');
    expect(makeWorkOrderPayload({ bomId: 'bom-1', warehouseId: 'warehouse-1', plannedQuantity: '10', plannedStart: '', dueDate: '' }))
      .toEqual({ bomId: 'bom-1', warehouseId: 'warehouse-1', plannedQuantity: 10 });
  });

  it('rejects invalid quality thresholds and preserves valid numeric limits', () => {
    const check = { code: '', description: 'Measure length', type: 'numeric', minimum: '5', maximum: '10' };
    const body = makeInspectionPlanPayload({ name: 'Final check', inspectionStage: 'final' }, [check]);
    expect(body.checks[0]).toMatchObject({ code: 'QC-1', type: 'numeric', minimum: 5, maximum: 10 });
    expect(body).not.toHaveProperty('planCode');
    expect(() => makeInspectionPlanPayload({ name: 'Final check' }, [{ ...check, minimum: '11' }])).toThrow('minimum cannot exceed maximum');
    expect(() => makeInspectionPlanPayload({ name: 'Final check' }, [{ ...check, maximum: 'NaN' }])).toThrow('valid number');
  });

  it('omits unselected inspection relationships and rejects missing required references', () => {
    expect(() => makeInspectionPayload({ planId: 'plan-1', inspectedQuantity: '1' })).toThrow('Inspected product is required');
    expect(makeInspectionPayload({ planId: 'plan-1', productId: 'product-1', inspectedQuantity: '2', workOrderId: '', lotId: '' }))
      .toEqual({ planId: 'plan-1', productId: 'product-1', inspectedQuantity: 2 });
  });

  it('validates all quality results and omits blank optional decision notes', () => {
    const answers = { 'check-1': 'yes', 'check-2': '7.25', 'check-3': 'Within specification' };
    expect(makeInspectionDecisionPayload({ decision: 'passed' }, checks, answers)).toEqual({
      decision: 'passed',
      results: [{ checkId: 'check-1', booleanValue: true }, { checkId: 'check-2', numericValue: 7.25 }, { checkId: 'check-3', textValue: 'Within specification' }],
    });
    expect(() => makeInspectionDecisionPayload({ decision: 'passed' }, checks, { ...answers, 'check-2': 'NaN' })).toThrow('valid measurement');
    expect(() => makeInspectionDecisionPayload({ decision: 'passed' }, checks, { ...answers, 'check-1': 'maybe' })).toThrow('Select a valid result');
  });

  it('prevents duplicated serial numbers and never sends undefined optional values', () => {
    expect(() => makeCompletedWorkOrderPayload({ completedQuantity: '4', serialNumbers: 'S1,S1' })).toThrow('must be unique');
    expect(makeCompletedWorkOrderPayload({ completedQuantity: '4', batchNumber: '', serialNumbers: '' })).toEqual({ completedQuantity: 4 });
    expect(makeCompletedWorkOrderPayload({ completedQuantity: '2', serialNumbers: 'S1\nS2' })).toEqual({ completedQuantity: 2, serialNumbers: ['S1', 'S2'] });
  });

  it('allows zero actual minutes but rejects fractional or negative minutes', () => {
    expect(makeCompletedJobStepPayload({ actualMinutes: '0', notes: '' })).toEqual({ actualMinutes: 0 });
    expect(() => makeCompletedJobStepPayload({ actualMinutes: '-1' })).toThrow('non-negative whole number');
    expect(() => makeCompletedJobStepPayload({ actualMinutes: '3.5' })).toThrow('non-negative whole number');
  });
});
