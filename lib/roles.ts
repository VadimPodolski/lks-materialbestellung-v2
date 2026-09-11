export type UserRole = 'user' | 'admin' | 'superadmin'

export function normalizeUserRole(value: unknown): UserRole {
  if (value === 'superadmin') return 'superadmin'
  if (value === 'admin') return 'admin'
  return 'user'
}

export function isAdminRole(value: unknown) {
  return value === 'admin' || value === 'superadmin'
}

export function isSuperAdminRole(value: unknown) {
  return value === 'superadmin'
}
