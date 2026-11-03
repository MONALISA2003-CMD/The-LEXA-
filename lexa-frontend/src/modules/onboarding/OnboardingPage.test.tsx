import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Branch, Workspace } from '../../domain/shared/types';
import OnboardingPage from './OnboardingPage';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), list: vi.fn(), branches: vi.fn(), create: vi.fn(), createBranch: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('../../data/remote/runtimeConfig', () => ({ isApiProvider: true, apiBaseUrl: 'https://example.test', dataProviderMode: 'api' }));
vi.mock('../../data/remote/apiAuth', () => ({ apiAuth: { getSession: mocks.session } }));
vi.mock('../../data/repositories', () => ({ workspaces: { list: mocks.list, listBranches: mocks.branches, create: mocks.create, createBranch: mocks.createBranch } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

const business: Workspace = { id: 'business-1', businessName: 'Kampala Traders', businessType: 'retail', currency: 'UGX', timezone: 'Africa/Kampala', enabledModules: [], createdAt: '2026-11-03', updatedAt: '2026-11-03' };
const branch: Branch = { id: 'branch-1', workspaceId: business.id, name: 'Main branch', createdAt: '2026-11-03', updatedAt: '2026-11-03' };
function start() {
  return render(<MemoryRouter initialEntries={['/onboarding']}><Routes><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/" element={<h1>Business dashboard loaded</h1>} /><Route path="/sign-in" element={<h1>Sign in to LEXA</h1>} /></Routes></MemoryRouter>);
}

describe('LEXA account-first business entry', () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks(); localStorage.clear();
    mocks.session.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.test' }, roles: [] });
    mocks.list.mockResolvedValue([]);
    mocks.branches.mockResolvedValue([branch]);
    mocks.create.mockResolvedValue(business);
  });

  it('shows a prominent sign-in action, not a creation form, to signed-out users', async () => {
    mocks.session.mockRejectedValue({ status: 401, message: 'Unauthorized' });
    start();
    expect(await screen.findByRole('link', { name: /sign in to my account/i })).toHaveAttribute('href', '/sign-in');
    expect(screen.queryByRole('button', { name: /create and open/i })).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('opens an existing business only after its branch is available', async () => {
    mocks.list.mockResolvedValue([business]);
    start();
    await screen.findByRole('button', { name: /open my business/i });
    fireEvent.click(screen.getByRole('button', { name: /open my business/i }));
    await screen.findByText('Business dashboard loaded');
    expect(localStorage.getItem('lexa.ui.activeWorkspaceId')).toBe('business-1');
    expect(localStorage.getItem('lexa.ui.activeBranchId')).toBe('branch-1');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates a new business then opens it after confirming its branch', async () => {
    start();
    const name = await screen.findByPlaceholderText('For example, My Trading Company');
    fireEvent.change(name, { target: { value: 'Kampala Traders' } });
    fireEvent.click(screen.getByRole('button', { name: /create and open my business/i }));
    await screen.findByText('Business dashboard loaded');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.branches).toHaveBeenCalledWith('business-1');
    expect(localStorage.getItem('lexa.ui.activeBranchId')).toBe('branch-1');
  });

  it('keeps a successfully created business recoverable if its branch cannot be opened', async () => {
    mocks.branches.mockRejectedValue(new Error('Unable to load branches'));
    start();
    fireEvent.change(await screen.findByPlaceholderText('For example, My Trading Company'), { target: { value: 'Kampala Traders' } });
    fireEvent.click(screen.getByRole('button', { name: /create and open my business/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /open my business/i })).toBeInTheDocument());
    expect(screen.getByText(/has been created, but we could not open it yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Business dashboard loaded')).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
