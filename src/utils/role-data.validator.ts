// server/src/utils/role-data.validator.ts

function checkFields(data: unknown, fields: string[]): string[] {
  if (!data || typeof data !== 'object') {
    return ['roleData must be an object'];
  }
  const errors: string[] = [];
  for (const field of fields) {
    const value = (data as Record<string, unknown>)[field];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      errors.push(`roleData.${field} is required and must be a non-empty string`);
    }
  }
  return errors;
}

function pickFields(data: unknown, fields: string[]): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === 'string') result[field] = value.trim();
  }
  return result;
}

// Platform-wide Roles slugs (see env/seed.static.ts). None require any
// roleData fields today — per-institution custom profile fields are a
// separate, not-yet-built feature. validateRoleData stays strict on unknown
// slugs (see below) so a typo is caught rather than silently accepted;
// registering a slug here is what "supported" means, not an implicit
// fallback.
const ROLE_SCHEMAS: Record<string, string[]> = {
  student: [],
  'self-taught': [],
  institutional: [],
  independent: [],
  rector: [],
  coordinator: [],
};

export function validateRoleData(
  slug: string,
  data: unknown,
): { valid: boolean; errors: string[] } {
  const fields = ROLE_SCHEMAS[slug];
  if (fields === undefined) {
    return { valid: false, errors: [`Unknown role slug: ${slug}`] };
  }
  const errors = checkFields(data, fields);
  return { valid: errors.length === 0, errors };
}

export function sanitizeRoleData(
  slug: string,
  data: unknown,
): Record<string, string> {
  const fields = ROLE_SCHEMAS[slug] ?? [];
  return pickFields(data, fields);
}
