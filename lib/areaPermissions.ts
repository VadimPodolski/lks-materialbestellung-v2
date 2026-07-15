import type { OrderArea } from '@/lib/orderAreas'

export const TWO_D_LASER_DELETE_MANAGER_EMAIL = 'y.ballach@lks-technik.de'

export function isTwoDLaserDeleteManager(email: string | null | undefined) {
  return email?.trim().toLowerCase() === TWO_D_LASER_DELETE_MANAGER_EMAIL
}

export function canDeleteForOrderArea(
  email: string | null | undefined,
  isAdmin: boolean,
  orderArea: OrderArea
) {
  return isAdmin || (orderArea === '2d-laser' && isTwoDLaserDeleteManager(email))
}
