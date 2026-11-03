import { describe, expect, it, vi } from 'vitest';
import { resolveBusinessSelection } from './resolveBusinessSelection';

const first = { id: 'business-a', businessName: 'First shop' };
const second = { id: 'business-b', businessName: 'Second shop' };

describe('business selection after sign-in and setup', () => {
  it('uses an existing authorized business without extra requests', async () => {
    const lookup = vi.fn(async () => first);
    const resolved = await resolveBusinessSelection([first, second], second.id, lookup);
    expect(resolved.selected).toEqual(second);
    expect(resolved.businesses).toEqual([first, second]);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('recovers a just-created business from its saved id when the list is empty', async () => {
    const resolved = await resolveBusinessSelection([], first.id, async () => first);
    expect(resolved.businesses).toEqual([first]);
    expect(resolved.selected).toEqual(first);
  });
  it('does not show businesses from another account without server authorization', async () => {
    const resolved = await resolveBusinessSelection([], first.id, async () => null);
    expect(resolved.businesses).toEqual([]);
    expect(resolved.selected).toBeNull();
  });
  it('preserves genuinely available businesses when a stale id is no longer accessible', async () => {
    const resolved = await resolveBusinessSelection([second], first.id, async () => { throw { status: 404 }; });
    expect(resolved.businesses).toEqual([second]);
    expect(resolved.selected).toEqual(second);
  });
  it('ignores a stale saved ID from another account and keeps authorized businesses available', async () => {
    const resolved = await resolveBusinessSelection([second], first.id, async () => { throw { status: 403 }; });
    expect(resolved.businesses).toEqual([second]);
    expect(resolved.selected).toEqual(second);
  });
  it('does not turn a temporary server failure into a false empty account', async () => {
    await expect(resolveBusinessSelection([], first.id, async () => { throw { status: 503 }; })).rejects.toEqual({ status: 503 });
  });
});
