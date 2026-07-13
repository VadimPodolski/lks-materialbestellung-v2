export type OrderArea = 'rohrlaser' | '2d-laser'

export function normalizeOrderArea(value: string | null | undefined): OrderArea {
  return value === '2d-laser' ? '2d-laser' : 'rohrlaser'
}

export function orderAreaLabel(area: OrderArea) {
  return area === '2d-laser' ? '2D-Laser' : 'Rohrlaser'
}

export function ordersHref(area: OrderArea) {
  return `/orders?bereich=${area}`
}

export function newOrderHref(area: OrderArea) {
  return `/orders/new?bereich=${area}`
}

export function masterDataHref(area: OrderArea, type = 'customers') {
  return `/masterdata?bereich=${area}&type=${type}`
}
