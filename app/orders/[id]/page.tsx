'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'

type Order = {
  id:string; order_number:string; customer:string; material:string; cross_section:string; length_mm:number|null;
  quantity:number; status:string; desired_delivery_date:string|null; notes:string|null; supplier_id:string|null;
  suppliers:{name:string; email:string}|null; ordered_at:string|null
}
type Receipt = { id:string; received_quantity:number; delivery_note_number:string|null; notes:string|null; received_at:string }

export default function OrderDetailPage(){
  const params = useParams<{id:string}>()
  const router = useRouter()
  const [order, setOrder] = useState<Order|null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [receivedQuantity, setReceivedQuantity] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(()=>{ load() }, [])
  async function load(){
    const supabase = createClient()
    const { data } = await supabase.from('material_orders')
      .select('*,suppliers(name,email)')
      .eq('id', params.id).single()
    setOrder(data as any)
    const { data: r } = await supabase.from('goods_receipts').select('*').eq('material_order_id', params.id).order('received_at', { ascending:false })
    setReceipts(r || [])
  }
  const receivedSum = useMemo(()=>receipts.reduce((sum, r)=>sum + r.received_quantity, 0), [receipts])

  function mailto(){
    if(!order || !order.suppliers?.email) return '#'
    const subject = `Materialbestellung LKS - Auftrag ${order.order_number}`
    const body = `Sehr geehrte Damen und Herren,\n\nbitte liefern Sie uns folgendes Material:\n\nAuftrag: ${order.order_number}\nKunde: ${order.customer}\nMaterial: ${order.material}\nQuerschnitt: ${order.cross_section}\nLänge: ${order.length_mm || '-'} mm\nStückzahl: ${order.quantity}\n\nGewünschter Liefertermin: ${order.desired_delivery_date || '-'}\n\nMit freundlichen Grüßen\nLKS-Technik GmbH & Co. KG`
    return `mailto:${order.suppliers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  async function markOrdered(){
    if(!order) return
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('material_orders').update({ status:'bestellt', ordered_at:new Date().toISOString(), ordered_by:userData.user?.id || null }).eq('id', order.id)
    await supabase.from('order_history').insert({ material_order_id:order.id, action:'Bestellung gesendet/vorbereitet', old_status:order.status, new_status:'bestellt', user_id:userData.user?.id || null })
    await load(); setMsg('Status wurde auf Bestellt gesetzt.')
  }

  async function receiveGoods(e:React.FormEvent){
    e.preventDefault(); if(!order) return
    const supabase = createClient()
    const qty = Number(receivedQuantity)
    if(!qty || qty < 1) return setMsg('Bitte gelieferte Stückzahl eingeben.')
    const { data: userData } = await supabase.auth.getUser()
    await supabase.from('goods_receipts').insert({ material_order_id:order.id, received_quantity:qty, delivery_note_number:deliveryNote, notes:receiptNotes, received_by:userData.user?.id || null })
    const newSum = receivedSum + qty
    const newStatus = newSum >= order.quantity ? 'geliefert' : 'teilweise_geliefert'
    await supabase.from('material_orders').update({ status:newStatus }).eq('id', order.id)
    await supabase.from('order_history').insert({ material_order_id:order.id, action:'Wareneingang gebucht', old_status:order.status, new_status:newStatus, user_id:userData.user?.id || null })
    setReceivedQuantity(''); setDeliveryNote(''); setReceiptNotes('')
    await load(); setMsg('Wareneingang wurde gebucht.')
  }

  async function cancelOrder(){
    const supabase = createClient()
    if(!order || !confirm('Bestellung wirklich stornieren?')) return
    await supabase.from('material_orders').update({ status:'storniert' }).eq('id', order.id)
    await load()
  }

  if(!order) return <main className="container"><p>Lade Bestellung...</p></main>

  return <main className="container">
    <button className="secondary" onClick={()=>router.push('/orders')}>Zurück</button>
    <h1>Auftrag {order.order_number} — {order.customer}</h1>
    <div className="card">
      <p><span className={statusClass(order.status)}>{statusLabels[order.status]}</span></p>
      <div className="grid">
        <p><b>Material:</b><br />{order.material}</p>
        <p><b>Querschnitt:</b><br />{order.cross_section}</p>
        <p><b>Länge:</b><br />{order.length_mm || '-'} mm</p>
        <p><b>Stückzahl:</b><br />{order.quantity}</p>
        <p><b>Geliefert:</b><br />{receivedSum} / {order.quantity}</p>
        <p><b>Lieferant:</b><br />{order.suppliers?.name || '-'}<br />{order.suppliers?.email || ''}</p>
      </div>
      {order.notes && <p><b>Bemerkung:</b><br />{order.notes}</p>}
      <div className="actions">
        <a className="button" href={mailto()} onClick={markOrdered}>Bestellung senden</a>
        <button className="danger" onClick={cancelOrder}>Stornieren</button>
      </div>
      {msg && <p className="success">{msg}</p>}
    </div>

    <div className="card">
      <h2>Wareneingang buchen</h2>
      <form className="grid" onSubmit={receiveGoods}>
        <div><label>Gelieferte Stückzahl</label><input type="number" min="1" value={receivedQuantity} onChange={e=>setReceivedQuantity(e.target.value)} required /></div>
        <div><label>Lieferscheinnummer</label><input value={deliveryNote} onChange={e=>setDeliveryNote(e.target.value)} /></div>
        <div style={{gridColumn:'1/-1'}}><label>Bemerkung</label><textarea value={receiptNotes} onChange={e=>setReceiptNotes(e.target.value)} /></div>
        <button>Wareneingang buchen</button>
      </form>
    </div>

    <div className="card">
      <h2>Wareneingänge</h2>
      <table><thead><tr><th>Datum</th><th>Stückzahl</th><th>Lieferschein</th><th>Bemerkung</th></tr></thead>
      <tbody>{receipts.map(r=><tr key={r.id}><td>{new Date(r.received_at).toLocaleString('de-DE')}</td><td>{r.received_quantity}</td><td>{r.delivery_note_number || '-'}</td><td>{r.notes || '-'}</td></tr>)}</tbody></table>
    </div>
  </main>
}
