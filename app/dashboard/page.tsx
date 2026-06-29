'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, statusLabels } from '@/lib/supabase'

type Order = {
  id: string
  status: string
  desired_delivery_date: string | null
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('material_orders')
      .select('id,status,desired_delivery_date')

    setOrders(data || [])
  }

  const count = (s: string) => orders.filter(o => o.status === s).length

  const today = new Date().toISOString().slice(0, 10)

  const overdue = orders.filter(
    o =>
      o.desired_delivery_date &&
      o.desired_delivery_date < today &&
      !['geliefert', 'storniert'].includes(o.status)
  ).length

  return (
    <main className="container">
      <h1>Dashboard</h1>

      <div className="grid">
        <Link href="/orders?status=offen" className="card">
          <div className="small">{statusLabels['offen']}</div>
          <h2>{count('offen')}</h2>
        </Link>

        <Link href="/orders?status=bestellt" className="card">
          <div className="small">{statusLabels['bestellt']}</div>
          <h2>{count('bestellt')}</h2>
        </Link>

        <Link href="/orders?status=teilweise_geliefert" className="card">
          <div className="small">{statusLabels['teilweise_geliefert']}</div>
          <h2>{count('teilweise_geliefert')}</h2>
        </Link>

        <Link href="/orders?status=geliefert" className="card">
          <div className="small">{statusLabels['geliefert']}</div>
          <h2>{count('geliefert')}</h2>
        </Link>

        <Link href="/orders?overdue=1" className="card">
          <div className="small">Überfällig</div>
          <h2>{overdue}</h2>
        </Link>
      </div>

      <div className="card actions">
        <Link href="/orders/new" className="button">
          Neue Bestellung
        </Link>

        <Link href="/orders" className="button secondary">
          Bestellübersicht
        </Link>
      </div>
    </main>
  )
}
