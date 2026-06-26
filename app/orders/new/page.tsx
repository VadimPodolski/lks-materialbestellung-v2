'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Supplier = { id:string; name:string }

export default function NewOrderPage() {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [form, setForm] = useState({ order_number:'', customer:'', supplier_id:'', material:'S235', cross_section:'', length_mm:'6000', quantity:'1', desired_delivery_date:'', notes:'' })
  const [msg, setMsg] = useState('')

  useEffect(()=>{ const supabase = createClient(); supabase.from('suppliers').select('id,name').order('name').then(({data})=>setSuppliers(data||[])) }, [])
  function set(k:string, v:string){ setForm({...form, [k]:v}) }

  async function save(e:React.FormEvent){
    e.preventDefault(); setMsg('')
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('material_orders').insert({
      ...form,
      supplier_id: form.supplier_id || null,
      length_mm: form.length_mm ? Number(form.length_mm) : null,
      quantity: Number(form.quantity),
      desired_delivery_date: form.desired_delivery_date || null,
      created_by: userData.user?.id || null
    }).select('id').single()
    if(error) return setMsg(error.message)
    router.push(`/orders/${data.id}`)
  }

  return <main className="container"><h1>Neue Materialbestellung</h1>
    <form className="card grid" onSubmit={save}>
      <div><label>Auftragsnummer</label><input value={form.order_number} onChange={e=>set('order_number',e.target.value)} required /></div>
      <div><label>Kunde</label><input value={form.customer} onChange={e=>set('customer',e.target.value)} required /></div>
      <div><label>Lieferant</label><select value={form.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Bitte wählen</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label>Material</label><input value={form.material} onChange={e=>set('material',e.target.value)} required /></div>
      <div><label>Querschnitt</label><input value={form.cross_section} onChange={e=>set('cross_section',e.target.value)} placeholder="z.B. 40x40x3" required /></div>
      <div><label>Länge mm</label><input type="number" value={form.length_mm} onChange={e=>set('length_mm',e.target.value)} /></div>
      <div><label>Stückzahl</label><input type="number" min="1" value={form.quantity} onChange={e=>set('quantity',e.target.value)} required /></div>
      <div><label>Gewünschter Liefertermin</label><input type="date" value={form.desired_delivery_date} onChange={e=>set('desired_delivery_date',e.target.value)} /></div>
      <div style={{gridColumn:'1/-1'}}><label>Bemerkung</label><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
      <button>Speichern</button>{msg && <p className="error">{msg}</p>}
    </form>
  </main>
}
