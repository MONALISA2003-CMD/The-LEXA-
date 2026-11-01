import { createContext, useContext } from 'react';
import type { Branch, Workspace } from '../domain/shared/types';

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  workspace: Workspace;
  branches: Branch[];
  branch: Branch;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  setActiveBranch: (branchId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace context is only available inside the LEXA workspace shell.');
  return value;
}
