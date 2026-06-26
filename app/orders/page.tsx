'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'

type Order = {
  id:string; order_number:string; customer:string; material:string; cross_section:string;
  quantity:number; status:string; desired_delivery_date:string|null; suppliers:{name:string}|null
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')

  useEffect(()=>{ load() }, [])
  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('material_orders')
      .select('id,order_number,customer,material,cross_section,quantity,status,desired_delivery_date,suppliers(name)')
      .order('created_at', { ascending:false })
    setOrders((data as any) || [])
  }

  const filtered = useMemo(() => orders.filter(o => {
    const text = `${o.order_number} ${o.customer} ${o.material} ${o.cross_section} ${o.suppliers?.name || ''}`.toLowerCase()
    return text.includes(q.toLowerCase()) && (!status || o.status === status)
  }), [orders,q,status])

  return <main className="container">
    <div className="actions" style={{justifyContent:'space-between'}}><h1>Bestellungen</h1><Link className="button" href="/orders/new">Neue Bestellung</Link></div>
    <div className="card grid">
      <div><label>Suche</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Auftrag, Kunde, Material..." /></div>
      <div><label>Status</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Alle</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    </div>
    <table><thead><tr><th>Status</th><th>Auftrag</th><th>Kunde</th><th>Material</th><th>Querschnitt</th><th>Menge</th><th>Lieferant</th><th>Liefertermin</th></tr></thead>
    <tbody>{filtered.map(o => <tr key={o.id}>
      <td><span className={statusClass(o.status)}>{statusLabels[o.status]}</span></td>
      <td><Link href={`/orders/${o.id}`}><b>{o.order_number}</b></Link></td>
      <td>{o.customer}</td><td>{o.material}</td><td>{o.cross_section}</td><td>{o.quantity}</td><td>{o.suppliers?.name || '-'}</td><td>{o.desired_delivery_date || '-'}</td>
    </tr>)}</tbody></table>
  </main>
}
