'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ActionIconButton from '@/app/ActionIconButton'

type Supplier = { id:string; name:string; email:string; phone:string|null; contact_person:string|null; notes:string|null }

export default function SuppliersPage(){
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [form, setForm] = useState({ name:'', email:'', phone:'', contact_person:'', notes:'' })
  const [msg, setMsg] = useState('')

  useEffect(()=>{ load() }, [])
  async function load(){ const supabase = createClient(); const { data } = await supabase.from('suppliers').select('*').order('name'); setSuppliers(data || []) }
  function set(k:string, v:string){ setForm({...form, [k]:v}) }

  async function save(e:React.FormEvent){
    e.preventDefault(); setMsg('')
    const supabase = createClient()
    const { error } = await supabase.from('suppliers').insert(form)
    if(error) return setMsg(error.message)
    setForm({ name:'', email:'', phone:'', contact_person:'', notes:'' })
    await load(); setMsg('Lieferant gespeichert.')
  }

  async function remove(id:string){
    const supabase = createClient()
    if(!confirm('Lieferant löschen? Bestehende Bestellungen bleiben erhalten, aber ohne Lieferant.')) return
    await supabase.from('suppliers').delete().eq('id', id)
    await load()
  }

  return <main className="container">
    <h1>Lieferanten</h1>
    <form className="card grid" onSubmit={save}>
      <div><label>Name</label><input value={form.name} onChange={e=>set('name', e.target.value)} required /></div>
      <div><label>E-Mail</label><input type="email" value={form.email} onChange={e=>set('email', e.target.value)} required /></div>
      <div><label>Telefon</label><input value={form.phone} onChange={e=>set('phone', e.target.value)} /></div>
      <div><label>Ansprechpartner</label><input value={form.contact_person} onChange={e=>set('contact_person', e.target.value)} /></div>
      <div style={{gridColumn:'1/-1'}}><label>Bemerkung</label><textarea value={form.notes} onChange={e=>set('notes', e.target.value)} /></div>
      <button>Lieferant speichern</button>{msg && <p className="success">{msg}</p>}
    </form>
    <table><thead><tr><th>Name</th><th>E-Mail</th><th>Telefon</th><th>Ansprechpartner</th><th></th></tr></thead>
    <tbody>{suppliers.map(s=><tr key={s.id}><td><b>{s.name}</b></td><td>{s.email}</td><td>{s.phone || '-'}</td><td>{s.contact_person || '-'}</td><td><ActionIconButton action="delete" label="Lieferant löschen" onClick={()=>remove(s.id)} /></td></tr>)}</tbody></table>
  </main>
}
