'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'

type Order = {
  id: string
  order_number: string
  customer: string
  material: string
  cross_section: string
  quantity: number
  status: string
  desired_delivery_date: string | null
  created_by: string | null
  ordered_by: string | null
  suppliers: { name: string } | null
  goods_receipts?: { received_quantity: number | null }[]
  scrap_items?: { quantity: number | null }[]
}

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

function OrdersContent() {
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  useEffect(() => {
    setStatus(searchParams.get('status') || '')
    setOverdueOnly(searchParams.get('overdue') === '1')
    load()
  }, [searchParams])

  async function logout() {
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

    setCurrentUserEmail(email)

    let admin = email === 'v.podolski@lks-technik.de'

    if (user) {
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
          quantity,
          status,
          desired_delivery_date,
          created_by,
          ordered_by,
          suppliers(name),
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

  async function deleteOrder(order: Order) {
    if (!isAdmin) {
      alert('Nur Administratoren dürfen Bestellungen löschen.')
      return
    }

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

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const text = `${o.order_number} ${o.customer} ${o.material} ${o.cross_section} ${o.suppliers?.name || ''}`.toLowerCase()
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
    })
  }, [orders, q, status, overdueOnly, today])

  return (
    <main className="container wide">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Bestellungen</h1>
          <p className="small">Admin: {isAdmin ? 'JA' : 'NEIN'}</p>
          <p className="small">Eingeloggt als: {currentUserEmail || 'nicht erkannt'}</p>
        </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
  <Link className="button" href="/orders/new">
    Neue Bestellung
  </Link>

  <button
    type="button"
    className="secondary"
    onClick={logout}
  >
    Abmelden
  </button>
</div>
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
      </div>

      <table className="orders-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Auftrag</th>
            <th>Kunde</th>
            <th>Material</th>
            <th>Querschnitt</th>
            <th>Menge</th>
            <th>Geliefert</th>
            <th>Offen</th>
            <th>Ausschuss</th>
            <th>Lieferant</th>
            <th>Liefertermin</th>
            <th>Erstellt von</th>
            <th>Bestellt von</th>
            {isAdmin && <th>Aktion</th>}
          </tr>
        </thead>

        <tbody>
          {filtered.map(o => {
            const delivered = deliveredQty(o)
            const scrap = scrapQty(o)
            const open = openQty(o)

            return (
              <tr key={o.id}>
                <td>
                  <span className={statusClass(o.status)}>
                    {statusLabels[o.status]}
                  </span>
                </td>
                <td>
                  <Link href={`/orders/${o.id}`}>
                    <b>{o.order_number}</b>
                  </Link>
                </td>
                <td>{o.customer}</td>
                <td>{o.material}</td>
                <td>{o.cross_section}</td>
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
                {isAdmin && (
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteOrder(o)}
                    >
                      🗑
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
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
