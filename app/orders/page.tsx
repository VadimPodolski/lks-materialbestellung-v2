'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'
import { OrderItem, normalizeOrderItems, orderItemAvText, orderItemsSelect, orderItemsSummary } from '@/lib/orderItems'
import { LOGIN_DISABLED } from '@/lib/authMode'
import { ensureCurrentUserProfile } from '@/lib/profiles'

type Order = {
  id: string
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
  | 'positions'
  | 'quantity'
  | 'delivered'
  | 'open'
  | 'scrap'
  | 'supplier'
  | 'desired_delivery_date'
  | 'created_at'
  | 'created_by'
  | 'ordered_by'

type SortDirection = 'asc' | 'desc'
type SortMode = 'latest_order' | SortKey
type ActiveStatusMenu = { orderId: string; top: number; left: number; placement: 'top' | 'bottom' }

function OrdersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('order_number')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortMode, setSortMode] = useState<SortMode>('latest_order')
  const [activeStatusMenu, setActiveStatusMenu] = useState<ActiveStatusMenu | null>(null)
  const statusMenuCloseTimer = useRef<number | null>(null)

  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    setOverdueOnly(searchParams.get('overdue') === '1')
    load()
  }, [searchParams])

  useEffect(() => {
    return () => clearStatusMenuCloseTimer()
  }, [])

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
  
  async function load() {
    const supabase = createClient()

    const { data: sessionData } = await supabase.auth.getSession()
    const { data: userData } = await supabase.auth.getUser()

    const user = userData.user || sessionData.session?.user || null
    const email = user?.email?.toLowerCase() || ''

    if (!LOGIN_DISABLED && user) {
      await ensureCurrentUserProfile(supabase)
    }

    setCurrentUserEmail(LOGIN_DISABLED ? 'Login deaktiviert' : email)

    let admin = !LOGIN_DISABLED && email === 'v.podolski@lks-technik.de'

    if (!LOGIN_DISABLED && user) {
      const { data: profileById } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', email)
        .maybeSingle()

      admin =
        admin ||
        profileById?.role === 'admin' ||
        profileByEmail?.role === 'admin'
    }

    setIsAdmin(admin)

    const ordersSelect = `
          id,
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
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,role')
    ])

    if (orderError) {
      const { data: fallbackOrderData } = await supabase
        .from('material_orders')
        .select(ordersSelectWithoutPdfs)
        .order('created_at', { ascending: false })

      setOrders((fallbackOrderData as any) || [])
    } else {
      setOrders((orderData as any) || [])
    }

    setProfiles(profileData || [])
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
    if (!confirm(`Bestellung ${order.order_number} wirklich löschen?`)) {
      return
    }

    const supabase = createClient()

    await supabase.from('goods_receipts').delete().eq('material_order_id', order.id)
    await supabase.from('order_history').delete().eq('material_order_id', order.id)
    await supabase.from('scrap_items').delete().eq('material_order_id', order.id)
    await supabase.from('material_orders').delete().eq('id', order.id)

    await load()
  }

  async function changeOrderStatus(order: Order, nextStatus: string) {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const update: Record<string, string | null> = { status: nextStatus }

    if (nextStatus === 'bestellt' && !order.ordered_at) {
      await ensureCurrentUserProfile(supabase)
      update.ordered_at = new Date().toISOString()
      update.ordered_by = userData.user?.id || null
    }

    await supabase
      .from('material_orders')
      .update(update)
      .eq('id', order.id)

    clearStatusMenuCloseTimer()
    setActiveStatusMenu(null)
    await load()
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
      const text = `${o.order_number} ${o.customer} ${formatDateShort(o.customer_delivery_date)} ${o.material} ${o.cross_section} ${orderItemsSummary(items)} ${deliveryNotes} ${o.suppliers?.name || ''} ${formatDateShort(o.desired_delivery_date)} ${formatDateTimeShort(o.created_at)}`.toLowerCase()
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
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Bestellungen</h1>
          <p className="small">Admin: {isAdmin ? 'JA' : 'NEIN'}</p>
          <p className="small">{LOGIN_DISABLED ? currentUserEmail : `Eingeloggt als: ${currentUserEmail || 'nicht erkannt'}`}</p>
        </div>

        <Link className="button" href="/">
          Neue Bestellung
        </Link>
      </div>

      <div className="card grid">
        <div>
          <label>Suche</label>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Auftrag, Kunde, Material, Lieferschein..."
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
            <option value="customer">Kunde</option>
            <option value="customer_delivery_date">K-Liefertermin</option>
            <option value="material">Material</option>
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
          <col className="orders-col-customer" />
          <col className="orders-col-date" />
          <col className="orders-col-material" />
          <col className="orders-col-positions" />
          <col className="orders-col-av" />
          <col className="orders-col-qty" />
          <col className="orders-col-qty" />
          <col className="orders-col-qty" />
          <col className="orders-col-qty" />
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
            <th>{sortButton('customer', 'Kunde')}</th>
            <th>{sortButton('customer_delivery_date', 'K-Liefertermin')}</th>
            <th>{sortButton('material', 'Material')}</th>
            <th>{sortButton('positions', 'Positionen')}</th>
            <th>AV</th>
            <th>{sortButton('quantity', 'Menge')}</th>
            <th>{sortButton('delivered', 'Geliefert')}</th>
            <th>{sortButton('open', 'Offen')}</th>
            <th>{sortButton('scrap', 'Ausschuss')}</th>
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
            const open = openQty(o)
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
                <td>{o.customer}</td>
                <td>{formatDateShort(o.customer_delivery_date)}</td>
                <td className="order-positions-cell">
                  <div className="order-position-lines">
                    {orderItems.map((item, index) => (
                      <div key={`${item.material}-${item.cross_section}-${item.length_mm}-${index}`}>
                        {item.material}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="order-positions-cell">
                  <div className="order-position-lines">
                    {orderItems.map((item, index) => (
                      <div key={`${item.cross_section}-${item.length_mm}-${index}`}>
                        {item.cross_section} ({item.quantity} Stk.)
                      </div>
                    ))}
                  </div>
                </td>
                <td className="av-cell">
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
                </td>
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

<td className={open === 0 ? 'qty-open complete' : 'qty-open open'}>
  {open}
</td>

<td className="qty-scrap">
  {scrap}
</td>
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
                  {(isAdmin || orderStatus === 'offen') && (
                    <button
                      type="button"
                      className="danger"
                      onClick={e => {
                        e.stopPropagation()
                        deleteOrder(o)
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
