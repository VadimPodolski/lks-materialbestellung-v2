'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'
import { OrderItem, formatMaterialThickness, normalizeOrderItems, orderItemAvText, orderItemQuantityText, orderItemsSelect, orderItemsSummary } from '@/lib/orderItems'
import { LOGIN_DISABLED } from '@/lib/authMode'
import { ensureCurrentUserProfile } from '@/lib/profiles'
import { newOrderHref, normalizeOrderArea, type OrderArea } from '@/lib/orderAreas'
import { canDeleteOrder } from '@/lib/orderDeletion'
import { deleteMaterialOrder } from '@/lib/materialOrderDeletion'
import { canDeleteForOrderArea } from '@/lib/areaPermissions'
import ConfirmDialog from '@/app/ConfirmDialog'

type Order = {
  id: string
  order_area: string
  order_number: string
  customer: string
  customer_delivery_date: string | null
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  status: string
  desired_delivery_date: string | null
  created_by: string | null
  ordered_by: string | null
  created_at: string | null
  ordered_at: string | null
  supplier_order_pdf_name: string | null
  supplier_order_pdf_url: string | null
  order_pdfs?: { file_name: string | null; file_url: string | null }[] | null
  suppliers: { name: string } | null
  order_items?: OrderItem[] | null
  goods_receipts?: { received_quantity: number | null; delivery_note_number: string | null }[]
  scrap_items?: { quantity: number | null }[]
}

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

type SortKey =
  | 'status'
  | 'order_number'
  | 'customer'
  | 'customer_delivery_date'
  | 'material'
  | 'material_thickness'
  | 'positions'
  | 'quantity'
  | 'delivered'
  | 'open'
  | 'scrap'
  | 'total_price'
  | 'supplier'
  | 'desired_delivery_date'
  | 'created_at'
  | 'created_by'
  | 'ordered_by'

type SortDirection = 'asc' | 'desc'
type SortMode = 'latest_order' | SortKey
type TubeStatisticsSortKey = 'material' | 'crossSection' | 'pieces' | 'meters' | 'totalPrice' | 'orders'
type ActiveStatusMenu = { orderId: string; top: number; left: number; placement: 'top' | 'bottom' }

function formatSortValue(value: string) {
  const dimensions = value.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i)
  if (!dimensions) return 0

  return Number(dimensions[1].replace(',', '.')) * Number(dimensions[2].replace(',', '.'))
}

function formatMeters(value: number) {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
}

function formatEuro(value: number) {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function orderTotalPrice(items: OrderItem[]) {
  let hasPrice = false
  const total = items.reduce((sum, item) => {
    if (item.line_total_eur != null) {
      hasPrice = true
      return sum + Number(item.line_total_eur)
    }

    if (item.unit_price_eur != null && item.price_quantity != null) {
      hasPrice = true
      return sum + Number(item.unit_price_eur) * Number(item.price_quantity)
    }

    return sum
  }, 0)

  return hasPrice ? total : null
}

function OrdersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderArea = normalizeOrderArea(searchParams.get('bereich'))

  const [orders, setOrders] = useState<Order[]>([])
  const [loadedOrderArea, setLoadedOrderArea] = useState<OrderArea | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [canDeleteCurrentArea, setCanDeleteCurrentArea] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('order_number')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortMode, setSortMode] = useState<SortMode>('latest_order')
  const [showTubeStatistics, setShowTubeStatistics] = useState(false)
  const [tubeStatisticsSearch, setTubeStatisticsSearch] = useState('')
  const [tubeStatisticsMaterial, setTubeStatisticsMaterial] = useState('')
  const [tubeStatisticsSortKey, setTubeStatisticsSortKey] = useState<TubeStatisticsSortKey>('pieces')
  const [tubeStatisticsSortDirection, setTubeStatisticsSortDirection] = useState<SortDirection>('desc')
  const [activeStatusMenu, setActiveStatusMenu] = useState<ActiveStatusMenu | null>(null)
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null)
  const [deleteCheckTime, setDeleteCheckTime] = useState(() => Date.now())
  const statusMenuCloseTimer = useRef<number | null>(null)
  const loadRequestId = useRef(0)
  const ordersByAreaCache = useRef<Partial<Record<OrderArea, Order[]>>>({})

  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    setOverdueOnly(searchParams.get('overdue') === '1')
  }, [searchParams])

  useEffect(() => {
    const cachedOrders = ordersByAreaCache.current[orderArea]
    if (cachedOrders) {
      setOrders(cachedOrders)
      setLoadedOrderArea(orderArea)
    }

    const requestId = ++loadRequestId.current
    setActiveStatusMenu(null)
    load(orderArea, requestId)
  }, [orderArea])

  useEffect(() => {
    return () => clearStatusMenuCloseTimer()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setDeleteCheckTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!showTubeStatistics) return

    function closeStatisticsOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowTubeStatistics(false)
    }

    window.addEventListener('keydown', closeStatisticsOnEscape)
    return () => window.removeEventListener('keydown', closeStatisticsOnEscape)
  }, [showTubeStatistics])

  function clearStatusMenuCloseTimer() {
    if (statusMenuCloseTimer.current !== null) {
      window.clearTimeout(statusMenuCloseTimer.current)
      statusMenuCloseTimer.current = null
    }
  }

  function statusMenuPosition(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect()
    const menuWidth = 170
    const menuHeight = 190
    const gap = 6
    const viewportGap = 8
    const belowTop = rect.bottom + gap
    const hasRoomBelow = belowTop + menuHeight <= window.innerHeight - viewportGap

    return {
      top: hasRoomBelow ? belowTop : Math.max(viewportGap, rect.top - menuHeight - gap),
      left: Math.min(
        Math.max(viewportGap, rect.left),
        window.innerWidth - menuWidth - viewportGap
      ),
      placement: hasRoomBelow ? 'bottom' as const : 'top' as const
    }
  }

  function openStatusMenu(orderId: string, anchor: HTMLElement) {
    clearStatusMenuCloseTimer()
    setActiveStatusMenu({ orderId, ...statusMenuPosition(anchor) })
  }

  function closeStatusMenuSoon() {
    clearStatusMenuCloseTimer()
    statusMenuCloseTimer.current = window.setTimeout(() => {
      setActiveStatusMenu(null)
      statusMenuCloseTimer.current = null
    }, 120)
  }

  async function logout() {
  if (LOGIN_DISABLED) return
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}
  
  async function load(area: OrderArea, requestId: number) {
    const supabase = createClient()

    const { data: userData } = await supabase.auth.getUser()

    const user = userData.user || null
    const email = user?.email?.toLowerCase() || ''

    let admin = !LOGIN_DISABLED && email === 'v.podolski@lks-technik.de'

    if (!LOGIN_DISABLED && user) {
      const profile = await ensureCurrentUserProfile(supabase, user)
      admin = admin || profile?.role === 'admin'
    }

    const ordersSelect = `
          id,
          order_area,
          order_number,
          customer,
          customer_delivery_date,
          material,
          cross_section,
          length_mm,
          quantity,
          status,
          desired_delivery_date,
          created_by,
          ordered_by,
          created_at,
          ordered_at,
          supplier_order_pdf_name,
          supplier_order_pdf_url,
          order_pdfs(file_name,file_url),
          suppliers(name),
          order_items(${orderItemsSelect}),
          goods_receipts(received_quantity,delivery_note_number),
          scrap_items(quantity)
        `
    const ordersSelectWithoutPdfs = `
          id,
          order_area,
          order_number,
          customer,
          material,
          cross_section,
          length_mm,
          quantity,
          status,
          desired_delivery_date,
          created_by,
          ordered_by,
          created_at,
          ordered_at,
          supplier_order_pdf_name,
          supplier_order_pdf_url,
          suppliers(name),
          order_items(${orderItemsSelect}),
          goods_receipts(received_quantity,delivery_note_number),
          scrap_items(quantity)
        `

    const [{ data: orderData, error: orderError }, { data: profileData }] = await Promise.all([
      supabase
        .from('material_orders')
        .select(ordersSelect)
        .eq('order_area', area)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,role')
    ])

    let nextOrders = (orderData as any) || []

    if (orderError) {
      const { data: fallbackOrderData } = await supabase
        .from('material_orders')
        .select(ordersSelectWithoutPdfs)
        .eq('order_area', area)
        .order('created_at', { ascending: false })

      nextOrders = (fallbackOrderData as any) || []
    }

    if (requestId !== loadRequestId.current) return

    ordersByAreaCache.current[area] = nextOrders
    setCanDeleteCurrentArea(canDeleteForOrderArea(email, admin, area))
    setOrders(nextOrders)
    setProfiles(profileData || [])
    setLoadedOrderArea(area)
  }

  function profileName(id: string | null) {
    if (!id) return '-'
    const p = profiles.find(x => x.id === id)
    return p?.full_name || p?.email || '-'
  }

  function visibleStatus(order: Order) {
    if (order.status === 'bestellt' && !order.ordered_at) return 'offen'
    return order.status
  }

  function deliveredQty(order: Order) {
    return (order.goods_receipts || []).reduce(
      (sum, r) => sum + Number(r.received_quantity || 0),
      0
    )
  }

  function scrapQty(order: Order) {
    return (order.scrap_items || []).reduce(
      (sum, s) => sum + Number(s.quantity || 0),
      0
    )
  }

  function openQty(order: Order) {
    return Math.max(order.quantity - deliveredQty(order), 0)
  }

  function orderSortValue(order: Order, key: SortKey) {
    const items = normalizeOrderItems(order)

    switch (key) {
      case 'status':
        return statusLabels[visibleStatus(order)] || visibleStatus(order)
      case 'order_number':
        return order.order_number
      case 'customer':
        return order.customer
      case 'customer_delivery_date':
        return order.customer_delivery_date || ''
      case 'material':
        return items.map(item => item.material).join(' ')
      case 'material_thickness': {
        const thicknesses = items
          .map(item => Number(item.material_thickness_mm))
          .filter(value => Number.isFinite(value) && value > 0)

        return thicknesses.length > 0 ? Math.min(...thicknesses) : null
      }
      case 'positions':
        return orderItemsSummary(items)
      case 'quantity':
        return order.quantity
      case 'delivered':
        return deliveredQty(order)
      case 'open':
        return openQty(order)
      case 'scrap':
        return scrapQty(order)
      case 'total_price':
        return orderTotalPrice(items)
      case 'supplier':
        return order.suppliers?.name || ''
      case 'desired_delivery_date':
        return order.desired_delivery_date || ''
      case 'created_at':
        return order.created_at || ''
      case 'created_by':
        return profileName(order.created_by)
      case 'ordered_by':
        return profileName(order.ordered_by)
    }
  }

  function sortOrders(a: Order, b: Order) {
    const aValue = orderSortValue(a, sortKey)
    const bValue = orderSortValue(b, sortKey)
    const direction = sortDirection === 'asc' ? 1 : -1

    if (aValue === null && bValue === null) return 0
    if (aValue === null) return 1
    if (bValue === null) return -1

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * direction
    }

    return String(aValue).localeCompare(String(bValue), 'de', {
      numeric: true,
      sensitivity: 'base'
    }) * direction
  }

  function latestOrderSort(a: Order, b: Order) {
    const aBase = orderBaseNumber(a.order_number)
    const bBase = orderBaseNumber(b.order_number)
    const aGroupTime = latestGroupTime.get(aBase) || a.created_at || ''
    const bGroupTime = latestGroupTime.get(bBase) || b.created_at || ''
    const timeCompare = bGroupTime.localeCompare(aGroupTime)

    if (timeCompare !== 0) return timeCompare

    const baseCompare = bBase.localeCompare(aBase, 'de', {
      numeric: true,
      sensitivity: 'base'
    })

    if (baseCompare !== 0) return baseCompare

    return orderLevel(a.order_number) - orderLevel(b.order_number)
  }

  function toggleSort(key: SortKey) {
    setSortMode(key)

    if (sortKey === key) {
      setSortDirection(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function sortButton(key: SortKey, label: string) {
    const isActive = sortKey === key

    return (
      <button
        type="button"
        className={`column-sort-button${isActive ? ' active' : ''}`}
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
      </button>
    )
  }

  async function deleteOrder(order: Order) {
    if (!canDeleteCurrentArea && !canDeleteOrder(order.created_at)) {
      alert('Diese Bestellung kann nach zwei Werktagen nicht mehr gelöscht werden.')
      return
    }

    const supabase = createClient()

    await supabase.from('goods_receipts').delete().eq('material_order_id', order.id)
    await supabase.from('order_history').delete().eq('material_order_id', order.id)
    await supabase.from('scrap_items').delete().eq('material_order_id', order.id)
    const deleteError = await deleteMaterialOrder(
      supabase,
      order.id,
      order.created_at,
      canDeleteCurrentArea
    )

    if (deleteError) {
      alert(`Bestellung konnte nicht gelöscht werden: ${deleteError.message}`)
      return
    }

    await load(orderArea, ++loadRequestId.current)
  }

  async function changeOrderStatus(order: Order, nextStatus: string) {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const update: Record<string, string | null> = { status: nextStatus }

    if (nextStatus === 'bestellt' && !order.ordered_at) {
      await ensureCurrentUserProfile(supabase, userData.user)
      update.ordered_at = new Date().toISOString()
      update.ordered_by = userData.user?.id || null
    }

    await supabase
      .from('material_orders')
      .update(update)
      .eq('id', order.id)

    clearStatusMenuCloseTimer()
    setActiveStatusMenu(null)
    await load(orderArea, ++loadRequestId.current)
  }

  function orderItemAvTitle(item: OrderItem) {
    return [
      ['AV 1', item.av_1],
      ['AV 2', item.av_2],
      ['AV 3', item.av_3],
      ['AV 4', item.av_4]
    ]
      .filter(([, value]) => Boolean(String(value || '').trim()))
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n')
  }

  const today = new Date().toISOString().slice(0, 10)

  const latestGroupTime = useMemo(() => {
    const groups = new Map<string, string>()

    for (const order of orders) {
      const base = orderBaseNumber(order.order_number)
      const createdAt = order.created_at || ''
      const current = groups.get(base) || ''

      if (createdAt > current) {
        groups.set(base, createdAt)
      }
    }

    return groups
  }, [orders])

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const items = normalizeOrderItems(o)
      const deliveryNotes = (o.goods_receipts || [])
        .map(receipt => receipt.delivery_note_number || '')
        .join(' ')
      const text = `${o.order_number} ${formatDateShort(o.customer_delivery_date)} ${o.material} ${o.cross_section} ${orderItemsSummary(items)} ${deliveryNotes} ${o.suppliers?.name || ''} ${formatDateShort(o.desired_delivery_date)} ${formatDateTimeShort(o.created_at)}`.toLowerCase()
      const matchesSearch = text.includes(q.toLowerCase())
      const matchesStatus = !status || visibleStatus(o) === status
      const matchesOverdue =
        !overdueOnly ||
        Boolean(
          o.desired_delivery_date &&
          o.desired_delivery_date < today &&
          !['geliefert', 'storniert'].includes(o.status)
        )

      return matchesSearch && matchesStatus && matchesOverdue
    }).sort(sortMode === 'latest_order' ? latestOrderSort : sortOrders)
  }, [orders, q, status, overdueOnly, today, sortKey, sortDirection, sortMode, profiles, latestGroupTime])

  const statusCounts = useMemo(() => {
    return orders.reduce<Record<string, number>>((counts, order) => {
      const key = visibleStatus(order)
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
  }, [orders])

  const formatCards = useMemo(() => {
    if (orderArea !== '2d-laser' || loadedOrderArea !== orderArea) return []

    const formats = new Map<string, {
      format: string
      sheets: number
      kilograms: number
      orderIds: Set<string>
    }>()

    for (const order of orders) {
      if (order.status === 'storniert') continue

      for (const item of normalizeOrderItems(order)) {
        const format = item.cross_section.trim() || 'Ohne Format'
        const key = format.toLocaleLowerCase('de-DE')
        const current = formats.get(key) || {
          format,
          sheets: 0,
          kilograms: 0,
          orderIds: new Set<string>()
        }

        if (item.order_unit === 'kg') {
          current.kilograms += Number(item.quantity || 0)
        } else if (item.order_unit === 'paket') {
          current.sheets += Number(item.quantity || 0) * Number(item.pieces_per_package || 0)
        } else {
          current.sheets += Number(item.quantity || 0)
        }

        current.orderIds.add(order.id)
        formats.set(key, current)
      }
    }

    return Array.from(formats.values()).sort((a, b) => (
      formatSortValue(b.format) - formatSortValue(a.format) ||
      a.format.localeCompare(b.format, 'de-DE')
    ))
  }, [orders, orderArea, loadedOrderArea])

  const tubeStatistics = useMemo(() => {
    const tubes = new Map<string, {
      material: string
      crossSection: string
      pieces: number
      meters: number
      totalPrice: number
      orderIds: Set<string>
    }>()
    const orderIds = new Set<string>()
    let totalPieces = 0
    let totalMeters = 0
    let totalPrice = 0

    if (orderArea !== 'rohrlaser' || loadedOrderArea !== orderArea) {
      return { rows: [], totalPieces, totalMeters, totalPrice, orderCount: 0 }
    }

    for (const order of orders) {
      if (order.status === 'storniert') continue

      orderIds.add(order.id)
      for (const item of normalizeOrderItems(order)) {
        const material = item.material.trim() || 'Ohne Materialangabe'
        const crossSection = item.cross_section.trim() || 'Ohne Querschnitt'
        const pieces = item.order_unit === 'paket'
          ? Number(item.quantity || 0) * Number(item.pieces_per_package || 0)
          : item.order_unit === 'kg'
            ? 0
            : Number(item.quantity || 0)
        const meters = Number(item.length_mm || 0) / 1000 * pieces
        const itemPrice = item.line_total_eur == null
          ? Number(item.unit_price_eur || 0) * Number(item.price_quantity || 0)
          : Number(item.line_total_eur)
        const key = `${material.toLocaleLowerCase('de-DE')}|${crossSection.toLocaleLowerCase('de-DE')}`
        const current = tubes.get(key) || {
          material,
          crossSection,
          pieces: 0,
          meters: 0,
          totalPrice: 0,
          orderIds: new Set<string>()
        }

        current.pieces += pieces
        current.meters += meters
        current.totalPrice += itemPrice
        current.orderIds.add(order.id)
        totalPieces += pieces
        totalMeters += meters
        totalPrice += itemPrice
        tubes.set(key, current)
      }
    }

    return {
      rows: Array.from(tubes.values()).sort((a, b) => (
        b.pieces - a.pieces ||
        a.material.localeCompare(b.material, 'de-DE') ||
        a.crossSection.localeCompare(b.crossSection, 'de-DE', { numeric: true })
      )),
      totalPieces,
      totalMeters,
      totalPrice,
      orderCount: orderIds.size
    }
  }, [orders, orderArea, loadedOrderArea])

  const tubeStatisticsMaterials = useMemo(() => (
    Array.from(new Set(tubeStatistics.rows.map(row => row.material))).sort((a, b) => (
      a.localeCompare(b, 'de-DE', { numeric: true, sensitivity: 'base' })
    ))
  ), [tubeStatistics.rows])

  const visibleTubeStatistics = useMemo(() => {
    const search = tubeStatisticsSearch.trim().toLocaleLowerCase('de-DE')
    const rows = tubeStatistics.rows
      .filter(row => !tubeStatisticsMaterial || row.material === tubeStatisticsMaterial)
      .filter(row => !search || `${row.material} ${row.crossSection}`.toLocaleLowerCase('de-DE').includes(search))
      .sort((a, b) => {
        const direction = tubeStatisticsSortDirection === 'asc' ? 1 : -1

        if (tubeStatisticsSortKey === 'pieces') return (a.pieces - b.pieces) * direction
        if (tubeStatisticsSortKey === 'meters') return (a.meters - b.meters) * direction
        if (tubeStatisticsSortKey === 'totalPrice') return (a.totalPrice - b.totalPrice) * direction
        if (tubeStatisticsSortKey === 'orders') return (a.orderIds.size - b.orderIds.size) * direction

        const aValue = tubeStatisticsSortKey === 'material' ? a.material : a.crossSection
        const bValue = tubeStatisticsSortKey === 'material' ? b.material : b.crossSection
        return aValue.localeCompare(bValue, 'de-DE', { numeric: true, sensitivity: 'base' }) * direction
      })
    const orderIds = new Set<string>()

    for (const row of rows) {
      for (const orderId of row.orderIds) orderIds.add(orderId)
    }

    return {
      rows,
      totalPieces: rows.reduce((sum, row) => sum + row.pieces, 0),
      totalMeters: rows.reduce((sum, row) => sum + row.meters, 0),
      totalPrice: rows.reduce((sum, row) => sum + row.totalPrice, 0),
      orderCount: orderIds.size
    }
  }, [tubeStatistics, tubeStatisticsSearch, tubeStatisticsMaterial, tubeStatisticsSortKey, tubeStatisticsSortDirection])

  function toggleTubeStatisticsSort(key: TubeStatisticsSortKey) {
    if (tubeStatisticsSortKey === key) {
      setTubeStatisticsSortDirection(current => current === 'asc' ? 'desc' : 'asc')
      return
    }

    setTubeStatisticsSortKey(key)
    setTubeStatisticsSortDirection(key === 'material' || key === 'crossSection' ? 'asc' : 'desc')
  }

  function tubeStatisticsSortButton(key: TubeStatisticsSortKey, label: string) {
    const active = tubeStatisticsSortKey === key

    return (
      <button
        type="button"
        className={`tube-statistics-sort${active ? ' active' : ''}`}
        onClick={() => toggleTubeStatisticsSort(key)}
      >
        <span>{label}</span>
        <span className="tube-statistics-sort-arrow" aria-hidden="true">
          {active ? (tubeStatisticsSortDirection === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    )
  }

  function orderBaseNumber(orderNumber: string) {
    return orderNumber.replace(/(?:-NB)+$/, '')
  }

  function orderLevel(orderNumber: string) {
    return (orderNumber.match(/-NB/g) || []).length
  }

  function isReorder(orderNumber: string) {
    return orderLevel(orderNumber) > 0
  }

  function formatDateShort(value: string | null) {
    if (!value) return '-'

    const [year, month, day] = value.split('-')
    if (!year || !month || !day) return value

    return `${day}.${month}.${year.slice(-2)}`
  }

  function formatDateTimeShort(value: string | null) {
    if (!value) return '-'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${day}.${month}.${year} ${hours}:${minutes}`
  }

  function openPdf(url: string | null, e: React.MouseEvent<HTMLAnchorElement>) {
    e.stopPropagation()

    if (!url) {
      e.preventDefault()
    }
  }

  function openOrderFromRow(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return
    if (target.closest('button, a, input, select, textarea')) return

    const row = target.closest<HTMLTableRowElement>('tr[data-order-id]')
    const orderId = row?.dataset.orderId

    if (orderId) {
      router.push(`/orders/${orderId}`)
    }
  }

  return (
    <main className="container wide">
      <div className="orders-page-heading">
        <div>
          <h1>Bestellungen {orderArea === '2d-laser' ? '2D-Laser' : 'Rohrlaser'}</h1>
        </div>

        {orderArea === '2d-laser' && (
          <section className="format-summary" aria-label="Bestellte Tafeln nach Format">
            <h2>Bestellte Tafeln nach Format</h2>
            <div className="format-summary-cards">
              {loadedOrderArea !== orderArea ? (
                <p className="small">Tafeln werden geladen...</p>
              ) : formatCards.length > 0 ? formatCards.map(card => (
                <article className="format-summary-card" key={card.format}>
                  <strong>{card.format}</strong>
                  <span>
                    {card.sheets > 0 && `${card.sheets.toLocaleString('de-DE')} Tafeln`}
                    {card.sheets > 0 && card.kilograms > 0 && ' · '}
                    {card.kilograms > 0 && `${card.kilograms.toLocaleString('de-DE')} kg`}
                  </span>
                  <small>{card.orderIds.size} {card.orderIds.size === 1 ? 'Auftrag' : 'Aufträge'}</small>
                </article>
              )) : (
                <p className="small">Noch keine Tafeln bestellt.</p>
              )}
            </div>
          </section>
        )}

        {orderArea === 'rohrlaser' && (
          <button
            type="button"
            className="tube-statistics-card"
            onClick={() => setShowTubeStatistics(true)}
          >
            <span className="tube-statistics-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 19V11M12 19V5M19 19v-6" />
              </svg>
            </span>
            <span className="tube-statistics-card-copy">
              <strong>Statistik</strong>
            </span>
          </button>
        )}

        <div className="actions">
          <Link className="button" href={newOrderHref(orderArea)}>
            Neue Bestellung
          </Link>
        </div>
      </div>

      <div className="card grid">
        <div>
          <label>Suche</label>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Auftrag, Material, Lieferschein..."
          />
        </div>

        <div>
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Alle ({orders.length})</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({statusCounts[k] || 0})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Filter</label>
          <select
            value={overdueOnly ? 'overdue' : ''}
            onChange={e => setOverdueOnly(e.target.value === 'overdue')}
          >
            <option value="">Alle</option>
            <option value="overdue">Nur überfällig</option>
          </select>
        </div>

        <div>
          <label>Sortieren nach</label>
          <select
            value={sortMode}
            onChange={e => {
              const value = e.target.value as SortMode
              setSortMode(value)

              if (value !== 'latest_order') {
                setSortKey(value)
                setSortDirection(value === 'order_number' ? 'desc' : 'asc')
              }
            }}
          >
            <option value="latest_order">Letzter Auftrag</option>
            <option value="order_number">Auftragsnummer</option>
            <option value="status">Status</option>
            {orderArea === 'rohrlaser' && <option value="customer">Kunde</option>}
            {orderArea === 'rohrlaser' && <option value="customer_delivery_date">K-Liefertermin</option>}
            <option value="material">Material</option>
            {orderArea === '2d-laser' && <option value="material_thickness">Materialstärke</option>}
            <option value="total_price">Preis</option>
            <option value="supplier">Lieferant</option>
            <option value="desired_delivery_date">Liefertermin</option>
            <option value="created_at">Erstellt am</option>
          </select>
        </div>
      </div>

      <div className="orders-table-shell" onScroll={() => setActiveStatusMenu(null)}>
      <table className="orders-table">
        <colgroup>
          <col className="orders-col-status" />
          <col className="orders-col-order" />
          <col className="orders-col-material" />
          {orderArea === '2d-laser' && <col className="orders-col-material" />}
          <col className="orders-col-positions" />
          {orderArea === 'rohrlaser' && <col className="orders-col-av" />}
          {orderArea === 'rohrlaser' && <col className="orders-col-customer" />}
          <col className="orders-col-total-qty" />
          <col className="orders-col-qty" />
          <col className="orders-col-qty" />
          {orderArea === 'rohrlaser' && <col className="orders-col-date" />}
          <col className="orders-col-price" />
          <col className="orders-col-supplier" />
          <col className="orders-col-date" />
          <col className="orders-col-person" />
          <col className="orders-col-person" />
          <col className="orders-col-pdf" />
          <col className="orders-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>{sortButton('status', 'Status')}</th>
            <th>{sortButton('order_number', 'Auftrag')}</th>
            <th>{sortButton('material', 'Material')}</th>
            {orderArea === '2d-laser' && <th>{sortButton('material_thickness', 'Materialstärke')}</th>}
            <th>{sortButton('positions', 'Positionen')}</th>
            {orderArea === 'rohrlaser' && <th>AV</th>}
            {orderArea === 'rohrlaser' && <th>{sortButton('customer', 'Kunde')}</th>}
            <th>{sortButton('quantity', 'Soll')}</th>
            <th>{sortButton('delivered', 'Geliefert')}</th>
            <th>{sortButton('scrap', 'Ausschuss')}</th>
            {orderArea === 'rohrlaser' && <th>{sortButton('customer_delivery_date', 'K-Liefertermin')}</th>}
            <th>{sortButton('total_price', 'Preis')}</th>
            <th>{sortButton('supplier', 'Lieferant')}</th>
            <th>{sortButton('desired_delivery_date', 'Liefertermin')}</th>
            <th>{sortButton('created_by', 'Erstellt von')}</th>
            <th>{sortButton('ordered_by', 'Bestellt von')}</th>
            <th>PDF</th>
            <th>Aktion</th>
          </tr>
        </thead>

        <tbody onClick={e => openOrderFromRow(e.target)}>
          {filtered.map(o => {
            const orderItems = normalizeOrderItems(o)
            const delivered = deliveredQty(o)
            const scrap = scrapQty(o)
            const totalPrice = orderTotalPrice(orderItems)
            const orderStatus = visibleStatus(o)
            const pdf = o.order_pdfs?.[0]
            const pdfUrl = pdf?.file_url || o.supplier_order_pdf_url
            const pdfName = pdf?.file_name || o.supplier_order_pdf_name

            return (
              <tr
                key={o.id}
                data-order-id={o.id}
                className={`clickable-order-row ${isReorder(o.order_number) ? 'reorder-row' : ''}`}
              >
                <td>
                  <div
                    className={`status-menu ${activeStatusMenu?.orderId === o.id ? 'open' : ''}`}
                    onMouseLeave={closeStatusMenuSoon}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`status-badge-button ${statusClass(orderStatus)}`}
                      title="Status ändern"
                      onMouseEnter={e => openStatusMenu(o.id, e.currentTarget)}
                      onFocus={e => openStatusMenu(o.id, e.currentTarget)}
                      onClick={e => openStatusMenu(o.id, e.currentTarget)}
                    >
                      {statusLabels[orderStatus]}
                    </button>

                    {activeStatusMenu?.orderId === o.id && (
                      <div
                        className={`status-menu-options ${activeStatusMenu.placement === 'top' ? 'above' : 'below'}`}
                        style={{ top: activeStatusMenu.top, left: activeStatusMenu.left }}
                        onMouseEnter={clearStatusMenuCloseTimer}
                        onMouseLeave={closeStatusMenuSoon}
                      >
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <button
                            type="button"
                            key={key}
                            className={`status-menu-option ${key === orderStatus ? 'active' : ''}`}
                            onClick={() => changeOrderStatus(o, key)}
                          >
                            <span className={statusClass(key)}>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <b>{o.order_number}</b>
                </td>
                <td className="order-positions-cell">
                  <div className="order-position-lines">
                    {orderItems.map((item, index) => (
                      <div key={`${item.material}-${item.cross_section}-${item.length_mm}-${index}`}>
                        {item.material}
                      </div>
                    ))}
                  </div>
                </td>
                {orderArea === '2d-laser' && <td className="order-positions-cell">
                  <div className="order-position-lines">
                    {orderItems.map((item, index) => (
                      <div key={`${item.material}-${item.material_thickness_mm}-${index}`}>
                        {formatMaterialThickness(item.material_thickness_mm)}
                      </div>
                    ))}
                  </div>
                </td>}
                <td className="order-positions-cell">
                  <div className="order-position-lines">
                    {orderItems.map((item, index) => (
                      <div key={`${item.cross_section}-${item.length_mm}-${index}`}>
                        {item.cross_section} ({orderItemQuantityText(item)})
                      </div>
                    ))}
                  </div>
                </td>
                {orderArea === 'rohrlaser' && <td className="av-cell">
                  <div className="av-lines">
                    {orderItems.some(item => orderItemAvText(item)) ? (
                      orderItems.map((item, index) => (
                        orderItemAvText(item) ? (
                          <span
                            key={`${item.cross_section}-${item.length_mm}-${index}`}
                            className="av-indicator"
                            title={orderItemAvTitle(item)}
                            aria-label={orderItemAvTitle(item)}
                          >
                            AV
                          </span>
                        ) : (
                          <span key={`${item.cross_section}-${item.length_mm}-${index}`} className="av-empty-line">-</span>
                        )
                      ))
                    ) : (
                      <span className="av-empty-line">-</span>
                    )}
                  </div>
                </td>}
                {orderArea === 'rohrlaser' && <td>{o.customer}</td>}
                <td>{o.quantity}</td>
               <td
  className={
    delivered >= o.quantity
      ? 'qty-delivered complete'
      : delivered > 0
        ? 'qty-delivered partial'
        : ''
  }
>
  {delivered}
</td>

<td className="qty-scrap">
  {scrap}
</td>
                {orderArea === 'rohrlaser' && <td>{formatDateShort(o.customer_delivery_date)}</td>}
                <td className="order-total-price">{totalPrice == null ? '-' : formatEuro(totalPrice)}</td>
                <td>{o.suppliers?.name || '-'}</td>
                <td>{formatDateShort(o.desired_delivery_date)}</td>
                <td>
                  <div className="table-person-cell">
                    <b>{profileName(o.created_by)}</b>
                    <span>{formatDateTimeShort(o.created_at)}</span>
                  </div>
                </td>
                <td>
                  <div className="table-person-cell">
                    <b>{profileName(o.ordered_by)}</b>
                    <span>{formatDateTimeShort(o.ordered_at)}</span>
                  </div>
                </td>
                <td>
                  {pdfUrl && (
                    <a
                      className="pdf-icon-link"
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={pdfName || 'AB-PDF öffnen'}
                      onClick={e => openPdf(pdfUrl, e)}
                    >
                      PDF
                    </a>
                  )}
                </td>
                <td className="row-actions">
                  {(canDeleteCurrentArea || (orderStatus === 'offen' && canDeleteOrder(o.created_at, new Date(deleteCheckTime)))) && (
                    <button
                      type="button"
                      className="danger"
                      onClick={e => {
                        e.stopPropagation()
                        setOrderToDelete(o)
                      }}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {showTubeStatistics && orderArea === 'rohrlaser' && (
        <div className="modal-backdrop tube-statistics-backdrop" role="presentation" onMouseDown={() => setShowTubeStatistics(false)}>
          <section
            className="modal tube-statistics-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tube-statistics-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="tube-statistics-modal-header">
              <div>
                <span className="tube-statistics-eyebrow">Rohrlaser</span>
                <h2 id="tube-statistics-title">Bestellstatistik</h2>
                <p>Alle nicht stornierten Aufträge, zusammengefasst nach Material und Querschnitt.</p>
              </div>
              <button
                type="button"
                className="tube-statistics-close"
                aria-label="Statistik schließen"
                onClick={() => setShowTubeStatistics(false)}
              >
                ×
              </button>
            </header>

            <div className="tube-statistics-controls">
              <div>
                <label htmlFor="tube-statistics-search">Suche</label>
                <input
                  id="tube-statistics-search"
                  type="search"
                  value={tubeStatisticsSearch}
                  onChange={event => setTubeStatisticsSearch(event.target.value)}
                  placeholder="Material oder Querschnitt suchen..."
                />
              </div>
              <div>
                <label htmlFor="tube-statistics-material">Filter</label>
                <select
                  id="tube-statistics-material"
                  value={tubeStatisticsMaterial}
                  onChange={event => setTubeStatisticsMaterial(event.target.value)}
                >
                  <option value="">Alle Materialien</option>
                  {tubeStatisticsMaterials.map(material => (
                    <option key={material} value={material}>{material}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tube-statistics-totals">
              <div>
                <span>Querschnitte gesamt</span>
                <strong>{visibleTubeStatistics.rows.length.toLocaleString('de-DE')}</strong>
              </div>
              <div>
                <span>Stück gesamt</span>
                <strong>{visibleTubeStatistics.totalPieces.toLocaleString('de-DE')}</strong>
              </div>
              <div>
                <span>Meter gesamt</span>
                <strong>{formatMeters(visibleTubeStatistics.totalMeters)}</strong>
              </div>
              <div>
                <span>Gesamtpreis</span>
                <strong>{formatEuro(visibleTubeStatistics.totalPrice)}</strong>
              </div>
              <div>
                <span>Aufträge</span>
                <strong>{visibleTubeStatistics.orderCount.toLocaleString('de-DE')}</strong>
              </div>
            </div>

            <div className="tube-statistics-table-shell">
              {loadedOrderArea !== orderArea ? (
                <p className="small">Statistik wird geladen...</p>
              ) : visibleTubeStatistics.rows.length > 0 ? (
                <table className="tube-statistics-table">
                  <thead>
                    <tr>
                      <th>{tubeStatisticsSortButton('material', 'Material')}</th>
                      <th>{tubeStatisticsSortButton('crossSection', 'Querschnitt')}</th>
                      <th className="number">{tubeStatisticsSortButton('pieces', 'Stück')}</th>
                      <th className="number">{tubeStatisticsSortButton('meters', 'Meter gesamt')}</th>
                      <th className="number">{tubeStatisticsSortButton('totalPrice', 'Gesamtpreis')}</th>
                      <th className="number">{tubeStatisticsSortButton('orders', 'Aufträge')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTubeStatistics.rows.map(row => (
                      <tr key={`${row.material}|${row.crossSection}`}>
                        <td><strong>{row.material}</strong></td>
                        <td>{row.crossSection}</td>
                        <td className="number">{row.pieces.toLocaleString('de-DE')}</td>
                        <td className="number">{formatMeters(row.meters)}</td>
                        <td className="number">{formatEuro(row.totalPrice)}</td>
                        <td className="number">{row.orderIds.size.toLocaleString('de-DE')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="tube-statistics-empty">
                  {tubeStatistics.rows.length > 0
                    ? 'Keine passenden Einträge gefunden.'
                    : 'Noch keine Rohrlaser-Bestellungen vorhanden.'}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(orderToDelete)}
        title="Bestellung löschen"
        message={orderToDelete ? `Bestellung ${orderToDelete.order_number} wirklich löschen?` : ''}
        onCancel={() => setOrderToDelete(null)}
        onConfirm={() => {
          const selectedOrder = orderToDelete
          setOrderToDelete(null)
          if (selectedOrder) void deleteOrder(selectedOrder)
        }}
      />
    </main>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<main className="container">Lade Bestellungen...</main>}>
      <OrdersContent />
    </Suspense>
  )
}
