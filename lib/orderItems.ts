export type OrderItem = {
  id?: string
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  position?: number | null
}

export type LegacyOrderFields = {
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  order_items?: OrderItem[] | null
}

export const orderItemsSelect = 'id,material,cross_section,length_mm,quantity,position'

export function emptyOrderItem(): OrderItem {
  return {
    material: '',
    cross_section: '',
    length_mm: 6000,
    quantity: 1
  }
}

export function normalizeOrderItems(order: LegacyOrderFields | null | undefined): OrderItem[] {
  if (!order) return []

  const items = order.order_items || []

  if (items.length > 0) {
    return mergeOrderItems([...items].sort((a, b) => Number(a.position || 0) - Number(b.position || 0)))
  }

  return mergeOrderItems([
    {
      material: order.material,
      cross_section: order.cross_section,
      length_mm: order.length_mm,
      quantity: order.quantity,
      position: 1
    }
  ])
}

export function mergeOrderItems(items: OrderItem[]) {
  const merged = new Map<string, OrderItem>()

  for (const item of items) {
    const material = item.material.trim()
    const crossSection = item.cross_section.trim()
    const lengthMm = item.length_mm ? Number(item.length_mm) : null
    const quantity = Number(item.quantity || 0)
    const key = `${material.toLowerCase()}|${crossSection.toLowerCase()}|${lengthMm ?? ''}`
    const existing = merged.get(key)

    if (existing) {
      existing.quantity += quantity
      continue
    }

    merged.set(key, {
      material,
      cross_section: crossSection,
      length_mm: lengthMm,
      quantity
    })
  }

  return Array.from(merged.values()).map((item, index) => ({
    ...item,
    position: index + 1
  }))
}

export function orderItemsTotal(items: OrderItem[]) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

export function orderItemsSummary(items: OrderItem[]) {
  return items
    .map(item => `${item.cross_section} (${item.quantity} Stk.)`)
    .join(', ')
}

export function orderItemsMailText(items: OrderItem[]) {
  return items
    .map((item, index) => (
      `${index + 1}. Material: ${item.material}
   Querschnitt: ${item.cross_section}
   Länge: ${item.length_mm || '-'} mm
   Stückzahl: ${item.quantity}`
    ))
    .join('\n\n')
}

export function primaryOrderItem(items: OrderItem[]) {
  return items[0] || emptyOrderItem()
}
