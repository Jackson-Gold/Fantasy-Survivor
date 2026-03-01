/**
 * Maps contestant display name to image filename (without path).
 * Images are in public/images/ as {slug}SOLE.jpg.
 * Special cases for filenames that don't match simple lowercase (e.g. _q_SOLE.jpg for "Q").
 */
const SPECIAL_SLUGS: Record<string, string> = {
  q: '_q_',
};

export function getContestantImageSlug(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (SPECIAL_SLUGS[trimmed.toLowerCase()]) return SPECIAL_SLUGS[trimmed.toLowerCase()];
  return trimmed.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

export function getContestantImagePath(name: string): string {
  const slug = getContestantImageSlug(name);
  if (!slug) return '';
  return `/images/${slug}SOLE.jpg`;
}
