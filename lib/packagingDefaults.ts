import type { OrderItem } from '@/lib/orderItems'

export type PackagingDefault = {
  lookup_key: string
  material: string
  cross_section: string
  pieces_per_package: number
}

export function packagingDefaultKey(orderArea: string, material: string, crossSection: string) {
  return [orderArea, material, crossSection]
    .map(value => value.trim().toLowerCase())
    .join('|')
}

export function packagingDefaultsMap(rows: PackagingDefault[] | null | undefined) {
  return Object.fromEntries(
    (rows || []).map(row => [row.lookup_key, Number(row.pieces_per_package)])
  )
}

export function packagingDefaultRows(orderArea: string, items: OrderItem[]) {
  const rows = new Map<string, {
    lookup_key: string
    order_area: string
    material: string
    cross_section: string
    pieces_per_package: number
    updated_at: string
  }>()

  for (const item of items) {
    if (item.order_unit !== 'paket' || !item.pieces_per_package) continue

    const lookupKey = packagingDefaultKey(orderArea, item.material, item.cross_section)
    rows.set(lookupKey, {
      lookup_key: lookupKey,
      order_area: orderArea,
      material: item.material,
      cross_section: item.cross_section,
      pieces_per_package: Number(item.pieces_per_package),
      updated_at: new Date().toISOString()
    })
  }

  return Array.from(rows.values())
}
