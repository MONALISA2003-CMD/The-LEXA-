import { db } from './database';
import type { WorkspaceRepository } from '../contracts/repositories';
import { createId, nowIso } from '../../domain/shared/ids';
import type { Branch, CreateWorkspaceInput, Workspace } from '../../domain/shared/types';

export const localWorkspaceRepository: WorkspaceRepository = {
  async list() {
    return db.workspaces.orderBy('createdAt').toArray();
  },

  async getById(workspaceId) {
    return (await db.workspaces.get(workspaceId)) ?? null;
  },

  async listBranches(workspaceId) {
    return db.branches.where('workspaceId').equals(workspaceId).sortBy('createdAt');
  },

  async create(input: CreateWorkspaceInput) {
    const businessName = input.businessName.trim();
    const branchName = input.branchName.trim();
    if (!businessName) throw new Error('Business name is required.');
    if (!branchName) throw new Error('Branch name is required.');
    if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Choose a valid three-letter currency code.');

    const timestamp = nowIso();
    const workspace: Workspace = {
      id: createId('ws'),
      businessName,
      businessType: input.businessType,
      currency: input.currency,
      timezone: input.timezone,
      enabledModules: ['dashboard', 'products', 'inventory', 'checkout', 'sales'],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const branch: Branch = {
      id: createId('br'),
      workspaceId: workspace.id,
      name: branchName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.transaction('rw', db.workspaces, db.branches, db.auditEvents, async () => {
      await db.workspaces.add(workspace);
      await db.branches.add(branch);
      await db.auditEvents.add({
        id: createId('audit'),
        workspaceId: workspace.id,
        entityType: 'workspace',
        entityId: workspace.id,
        action: 'created_locally',
        createdAt: timestamp,
      });
    });
    return workspace;
  },

  async update(workspace) {
    const businessName = workspace.businessName.trim();
    if (!businessName) throw new Error('Business name is required.');
    const updated = { ...workspace, businessName, updatedAt: nowIso() };
    await db.workspaces.put(updated);
    return updated;
  },

  async createBranch(input) {
    const name = input.name.trim();
    if (!name) throw new Error('Branch name is required.');
    if (!(await db.workspaces.get(input.workspaceId))) throw new Error('The selected business workspace was not found.');
    const branch: Branch = {
      id: createId('br'),
      workspaceId: input.workspaceId,
      name,
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.branches.add(branch);
    return branch;
  },
};
