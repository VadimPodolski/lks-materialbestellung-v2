'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, statusLabels } from '@/lib/supabase'

type Order = { id:string; status:string; desired_delivery_date:string|null }

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => { load() }, [])
  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('material_orders').select('id,status,desired_delivery_date')
    setOrders(data || [])
  }
  const count = (s:string) => orders.filter(o=>o.status===s).length
  const today = new Date().toISOString().slice(0,10)
  const overdue = orders.filter(o => o.desired_delivery_date && o.desired_delivery_date < today && !['geliefert','storniert'].includes(o.status)).length

  return <main className="container">
    <h1>Dashboard</h1>
    <div className="grid">
      {['offen','bestellt','teilweise_geliefert','geliefert'].map(s => <div className="card" key={s}>
        <div className="small">{statusLabels[s]}</div><h2>{count(s)}</h2>
      </div>)}
      <div className="card"><div className="small">Überfällig</div><h2>{overdue}</h2></div>
    </div>
    <div className="card actions">
      <Link href="/orders/new" className="button">Neue Bestellung</Link>
      <Link href="/orders" className="button secondary">Bestellübersicht</Link>
    </div>
  </main>
}
