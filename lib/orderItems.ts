export type OrderItem = {
  id?: string
  material: string
  cross_section: string
  av_1?: string | null
  av_2?: string | null
  av_3?: string | null
  av_4?: string | null
  length_mm: number | null
  quantity: number
  order_unit?: 'stück' | 'paket' | null
  pieces_per_package?: number | null
  position?: number | null
}

export type LegacyOrderFields = {
  material: string
  cross_section: string
  av_1?: string | null
  av_2?: string | null
  av_3?: string | null
  av_4?: string | null
  length_mm: number | null
  quantity: number
  order_items?: OrderItem[] | null
}

export const orderItemsSelect = 'id,material,cross_section,av_1,av_2,av_3,av_4,length_mm,quantity,order_unit,pieces_per_package,position'

export function emptyOrderItem(): OrderItem {
  return {
    material: '',
    cross_section: '',
    av_1: '',
    av_2: '',
    av_3: '',
    av_4: '',
    length_mm: 6000,
    quantity: 1,
    order_unit: 'stück',
    pieces_per_package: null
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
      av_1: order.av_1 || '',
      av_2: order.av_2 || '',
      av_3: order.av_3 || '',
      av_4: order.av_4 || '',
      length_mm: order.length_mm,
      quantity: order.quantity,
      order_unit: 'stück',
      pieces_per_package: null,
      position: 1
    }
  ])
}

export function mergeOrderItems(items: OrderItem[]) {
  const merged = new Map<string, OrderItem>()

  for (const item of items) {
    const material = item.material.trim()
    const crossSection = item.cross_section.trim()
    const av1 = (item.av_1 || '').trim()
    const av2 = (item.av_2 || '').trim()
    const av3 = (item.av_3 || '').trim()
    const av4 = (item.av_4 || '').trim()
    const lengthMm = item.length_mm ? Number(item.length_mm) : null
    const quantity = Number(item.quantity || 0)
    const orderUnit = item.order_unit === 'paket' ? 'paket' : 'stück'
    const piecesPerPackage = orderUnit === 'paket' ? Number(item.pieces_per_package || 0) : null
    const key = [
      material.toLowerCase(),
      crossSection.toLowerCase(),
      av1.toLowerCase(),
      av2.toLowerCase(),
      av3.toLowerCase(),
      av4.toLowerCase(),
      lengthMm ?? '',
      orderUnit,
      piecesPerPackage ?? ''
    ].join('|')
    const existing = merged.get(key)

    if (existing) {
      existing.quantity += quantity
      continue
    }

    merged.set(key, {
      id: item.id,
      material,
      cross_section: crossSection,
      av_1: av1 || null,
      av_2: av2 || null,
      av_3: av3 || null,
      av_4: av4 || null,
      length_mm: lengthMm,
      quantity,
      order_unit: orderUnit,
      pieces_per_package: piecesPerPackage
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
    .map(item => {
      const av = orderItemAvText(item)
      return `${item.material} - ${item.cross_section}${av ? ` - AV: ${av}` : ''} (${orderItemQuantityText(item)})`
    })
    .join(', ')
}

export function orderItemAvValues(item: OrderItem) {
  return [item.av_1, item.av_2, item.av_3, item.av_4]
    .map(value => (value || '').trim())
    .filter(Boolean)
}

export function orderItemAvText(item: OrderItem) {
  return orderItemAvValues(item).join(', ')
}

export function orderItemQuantityText(item: OrderItem) {
  if (item.order_unit === 'paket') {
    return `${item.quantity} Paket${item.quantity === 1 ? '' : 'e'} à ${item.pieces_per_package || '-'} Stück`
  }

  return `${item.quantity} Stück`
}

export function orderItemsMailText(items: OrderItem[]) {
  return items
    .map((item, index) => (
      `${index + 1}. Material: ${item.material}
   Querschnitt: ${item.cross_section}
   AV: ${orderItemAvText(item) || '-'}
   Länge: ${item.length_mm || '-'} mm
   Menge: ${orderItemQuantityText(item)}`
    ))
    .join('\n\n')
}

export function primaryOrderItem(items: OrderItem[]) {
  return items[0] || emptyOrderItem()
}
