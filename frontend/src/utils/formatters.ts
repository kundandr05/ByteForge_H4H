/**
 * Normalizes fields that can either be a raw string or an array of strings
 * (e.g. skills, serviceZones, requiredSkills) into a guaranteed string array.
 */
export function ensureArray(val: string | string[] | undefined | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [val];
  } catch {
    return [val];
  }
}
