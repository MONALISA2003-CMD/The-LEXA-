import type { PreviewDataService, PreviewScope } from '../contracts/previewData';
import type { ModuleDefinition, PreviewRecord } from '../../modules/operations/moduleCatalog';

export interface PreviewWorkspaceBundle {
  format: 'lexa-workspace-export';
  version: 2;
  exportedAt: string;
  sourceScope: PreviewScope;
  modules: Record<string, PreviewRecord[]>;
}

export interface PreviewModuleSeed {
  id: string;
  initial: PreviewRecord[];
}

function isRecordArray(value: unknown): value is PreviewRecord[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    return typeof record.id === 'string' && record.id.length > 0
      && typeof record.status === 'string' && typeof record.updatedAt === 'string'
      && Object.values(record).every((field) => typeof field === 'string');
  });
}

/** Export only module-register records. Core products, sales and IndexedDB rows are never read. */
export async function exportPreviewWorkspace(
  service: PreviewDataService,
  scope: PreviewScope,
  definitions: PreviewModuleSeed[],
  exportedAt = new Date().toISOString(),
): Promise<PreviewWorkspaceBundle> {
  const entries = await Promise.all(definitions.map(async (definition) => [
    definition.id,
    await service.list(scope, definition.id, definition.initial),
  ] as const));
  return {
    format: 'lexa-workspace-export',
    version: 2,
    exportedAt,
    sourceScope: { ...scope },
    modules: Object.fromEntries(entries),
  };
}

/** Validate the entire import before changing any row, and require a complete same-version module bundle. */
export function validatePreviewWorkspaceBundle(value: unknown, definitions: PreviewModuleSeed[]): PreviewWorkspaceBundle {
  if (!value || typeof value !== 'object') throw new Error('The selected file is not a valid LEXA workspace export.');
  const bundle = value as Record<string, unknown>;
  if (bundle.format !== 'lexa-workspace-export' || bundle.version !== 2) throw new Error('This workspace export format is not supported by this version of LEXA.');
  if (typeof bundle.exportedAt !== 'string' || !bundle.sourceScope || typeof bundle.sourceScope !== 'object' || !bundle.modules || typeof bundle.modules !== 'object' || Array.isArray(bundle.modules)) throw new Error('The workspace export is missing required information.');
  const sourceScope = bundle.sourceScope as Record<string, unknown>;
  if (typeof sourceScope.workspaceId !== 'string' || typeof sourceScope.branchId !== 'string') throw new Error('The workspace export does not identify its source business and branch.');
  const moduleData = bundle.modules as Record<string, unknown>;
  const allowed = new Set(definitions.map((definition) => definition.id));
  const unknownModules = Object.keys(moduleData).filter((id) => !allowed.has(id));
  if (unknownModules.length) throw new Error('The workspace export includes unrecognised modules: ' + unknownModules.join(', '));
  const missingModules = definitions.filter((definition) => !(definition.id in moduleData));
  if (missingModules.length) throw new Error('The workspace export is incomplete. Missing modules: ' + missingModules.map((definition) => definition.id).join(', '));
  const modules: Record<string, PreviewRecord[]> = {};
  for (const definition of definitions) {
    const rows = moduleData[definition.id];
    if (!isRecordArray(rows)) throw new Error(`The ${definition.id} export contains invalid rows.`);
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`The ${definition.id} export contains duplicate record IDs.`);
    modules[definition.id] = rows.map((row) => ({ ...row }));
  }
  return {
    format: 'lexa-workspace-export', version: 2, exportedAt: bundle.exportedAt,
    sourceScope: { workspaceId: sourceScope.workspaceId, branchId: sourceScope.branchId }, modules,
  };
}

/**
 * Restore a validated bundle into the current workspace. The source scope is metadata only;
 * the bundle is never imported into the core IndexedDB store or a real backend.
 * Previous module records are snapshotted and restored if any module replacement fails.
 */
export async function importPreviewWorkspace(
  service: PreviewDataService,
  targetScope: PreviewScope,
  value: unknown,
  definitions: PreviewModuleSeed[],
): Promise<{ importedRecords: number; moduleCount: number; sourceScope: PreviewScope }> {
  const bundle = validatePreviewWorkspaceBundle(value, definitions);
  const before = await Promise.all(definitions.map(async (definition) => ({
    definition,
    rows: await service.list(targetScope, definition.id, definition.initial),
  })));
  try {
    for (const { definition } of before) {
      await service.replace(targetScope, definition.id, bundle.modules[definition.id] ?? [], definition.initial);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const previous of before) {
      try { await service.replace(targetScope, previous.definition.id, previous.rows, previous.definition.initial); }
      catch { rollbackErrors.push(previous.definition.id); }
    }
    if (rollbackErrors.length) throw new Error(`Import failed and rollback was incomplete for: ${rollbackErrors.join(', ')}. Import a verified backup to restore the prior records.`);
    throw error instanceof Error ? new Error(`Import failed. The previous records were restored. ${error.message}`) : new Error('Import failed. The previous records were restored.');
  }
  return {
    importedRecords: definitions.reduce((sum, definition) => sum + (bundle.modules[definition.id]?.length ?? 0), 0),
    moduleCount: definitions.length,
    sourceScope: bundle.sourceScope,
  };
}

export async function resetPreviewWorkspace(
  service: PreviewDataService,
  scope: PreviewScope,
  definitions: PreviewModuleSeed[] | ModuleDefinition[],
): Promise<{ moduleCount: number; recordCount: number }> {
  const before = await Promise.all(definitions.map(async (definition) => ({
    definition,
    previous: await service.list(scope, definition.id, definition.initial),
  })));
  try {
    for (const { definition } of before) await service.reset(scope, definition.id, definition.initial);
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const { definition, previous } of before) {
      try { await service.replace(scope, definition.id, previous, definition.initial); }
      catch { rollbackErrors.push(definition.id); }
    }
    if (rollbackErrors.length) throw new Error(`Reset failed and rollback was incomplete for: ${rollbackErrors.join(', ')}.`);
    throw error instanceof Error ? new Error(`Reset failed. Your prior preview records were restored. ${error.message}`) : new Error('Reset failed. Your prior preview records were restored.');
  }
  return { moduleCount: definitions.length, recordCount: definitions.reduce((sum, definition) => sum + definition.initial.length, 0) };
}
