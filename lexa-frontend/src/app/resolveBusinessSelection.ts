/**
 * Recover a previously opened business when the list endpoint temporarily
 * returns an empty/partial collection. Only a server-authorized detail response
 * is accepted. Local preferences are identifiers, never authoritative records.
 */
export async function resolveBusinessSelection<T extends { id: string }>(
  businesses: T[],
  preferredBusinessId: string | null,
  getBusinessById: (businessId: string) => Promise<T | null>,
): Promise<{ businesses: T[]; selected: T | null }> {
  const preferred = preferredBusinessId?.trim();
  if (!preferred) return { businesses, selected: businesses[0] ?? null };
  const found = businesses.find((business) => business.id === preferred);
  if (found) return { businesses, selected: found };
  // Verify any stale preference against the server before relying on it.
  // An inaccessible/null ID may belong to a different account: never resurrect it.
  let verified: T | null = null;
  try {
    verified = await getBusinessById(preferred);
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? (error as { status?: unknown }).status : undefined;
    // A stale ID from a different account must not block the other businesses
    // the signed-in user is authorized to see. Other failures remain visible.
    if (status !== 403 && status !== 404) throw error;
  }
  if (verified?.id !== preferred) return { businesses, selected: businesses[0] ?? null };
  return { businesses: [verified, ...businesses], selected: verified };
}
