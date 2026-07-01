'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'
import { OrderItem, normalizeOrderItems, orderItemsSelect, orderItemsSummary } from '@/lib/orderItems'
import { LOGIN_DISABLED } from '@/lib/authMode'

type Order = {
  id: string
  order_number: string
  customer: string
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  status: string
  desired_delivery_date: string | null
  created_by: string | null
  ordered_by: string | null
  created_at: string | null
  supplier_order_pdf_name: string | null
  supplier_order_pdf_url: string | null
  suppliers: { name: string } | null
  order_items?: OrderItem[] | null
  goods_receipts?: { received_quantity: number | null }[]
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
  | 'material'
  | 'positions'
  | 'quantity'
  | 'delivered'
  | 'open'
  | 'scrap'
  | 'supplier'
  | 'desired_delivery_date'
  | 'created_by'
  | 'ordered_by'

type SortDirection = 'asc' | 'desc'
type SortMode = 'latest_order' | SortKey

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

  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    setOverdueOnly(searchParams.get('overdue') === '1')
    load()
  }, [searchParams])

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

    const [{ data: orderData }, { data: profileData }] = await Promise.all([
      supabase
        .from('material_orders')
        .select(`
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
          supplier_order_pdf_name,
          supplier_order_pdf_url,
          suppliers(name),
          order_items(${orderItemsSelect}),
          goods_receipts(received_quantity),
          scrap_items(quantity)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,role')
    ])

    setOrders((orderData as any) || [])
    setProfiles(profileData || [])
  }

  function profileName(id: string | null) {
    if (!id) return '-'
    const p = profiles.find(x => x.id === id)
    return p?.full_name || p?.email || '-'
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
        return statusLabels[order.status] || order.status
      case 'order_number':
        return order.order_number
      case 'customer':
        return order.customer
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
      const text = `${o.order_number} ${o.customer} ${o.material} ${o.cross_section} ${orderItemsSummary(items)} ${o.suppliers?.name || ''}`.toLowerCase()
      const matchesSearch = text.includes(q.toLowerCase())
      const matchesStatus = !status || o.status === status
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

  function orderBaseNumber(orderNumber: string) {
    return orderNumber.replace(/(?:-NB)+$/, '')
  }

  function orderLevel(orderNumber: string) {
    return (orderNumber.match(/-NB/g) || []).length
  }

  function isReorder(orderNumber: string) {
    return orderLevel(orderNumber) > 0
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

        <Link className="button" href="/orders/new">
          Neue Bestellung
        </Link>
      </div>

      <div className="card grid">
        <div>
          <label>Suche</label>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Auftrag, Kunde, Material..."
          />
        </div>

        <div>
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Alle</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
            <option value="material">Material</option>
            <option value="supplier">Lieferant</option>
            <option value="desired_delivery_date">Liefertermin</option>
          </select>
        </div>
      </div>

      <div className="orders-table-shell">
      <table className="orders-table">
        <thead>
          <tr>
            <th>{sortButton('status', 'Status')}</th>
            <th>{sortButton('order_number', 'Auftrag')}</th>
            <th>{sortButton('customer', 'Kunde')}</th>
            <th>{sortButton('material', 'Material')}</th>
            <th>{sortButton('positions', 'Positionen')}</th>
            <th>{sortButton('quantity', 'Menge')}</th>
            <th>{sortButton('delivered', 'Geliefert')}</th>
            <th>{sortButton('open', 'Offen')}</th>
            <th>{sortButton('scrap', 'Ausschuss')}</th>
            <th>{sortButton('supplier', 'Lieferant')}</th>
            <th>{sortButton('desired_delivery_date', 'Liefertermin')}</th>
            <th>{sortButton('created_by', 'Erstellt von')}</th>
            <th>{sortButton('ordered_by', 'Bestellt von')}</th>
            <th>Aktion</th>
          </tr>
        </thead>

        <tbody onClick={e => openOrderFromRow(e.target)}>
          {filtered.map(o => {
            const orderItems = normalizeOrderItems(o)
            const delivered = deliveredQty(o)
            const scrap = scrapQty(o)
            const open = openQty(o)

            return (
              <tr
                key={o.id}
                data-order-id={o.id}
                className={`clickable-order-row ${isReorder(o.order_number) ? 'reorder-row' : ''}`}
              >
                <td>
                  <span className={statusClass(o.status)}>
                    {statusLabels[o.status]}
                  </span>
                </td>
                <td>
                  <b>
                    {isReorder(o.order_number) && (
                      <span
                        className="reorder-indent"
                        style={{ marginLeft: `${(orderLevel(o.order_number) - 1) * 22}px` }}
                      >
                        NB
                      </span>
                    )}
                    {o.order_number}
                  </b>
                </td>
                <td>{o.customer}</td>
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
                <td>{o.desired_delivery_date || '-'}</td>
                <td>{profileName(o.created_by)}</td>
                <td>{profileName(o.ordered_by)}</td>
                <td className="row-actions">
                  {o.supplier_order_pdf_url && (
                    <a
                      className="pdf-icon-link"
                      href={o.supplier_order_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      title={o.supplier_order_pdf_name || 'AB-PDF öffnen'}
                      onClick={e => openPdf(o.supplier_order_pdf_url, e)}
                    >
                      PDF
                    </a>
                  )}
                  {isAdmin && (
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
