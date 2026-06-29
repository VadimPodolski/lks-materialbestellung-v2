'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Customer = { id:string; name:string; contact_person:string|null; email:string|null; phone:string|null; notes:string|null }
type Material = { id:string; name:string; material_name:string|null; material_number:string|null }
type CrossSection = { id:string; name:string }

export default function MasterDataPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])

  const [customer, setCustomer] = useState({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
  const [material, setMaterial] = useState({ id:'', material_name:'', material_number:'' })
  const [cross, setCross] = useState({ id:'', name:'' })

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const [{data:c}, {data:m}, {data:q}] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('materials').select('*').order('name'),
      supabase.from('cross_sections').select('*').order('name')
    ])
    setCustomers(c || [])
    setMaterials(m || [])
    setCrossSections(q || [])
  }

  async function saveCustomer(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    if (customer.id) {
      await supabase.from('customers').update(customer).eq('id', customer.id)
    } else {
      await supabase.from('customers').insert(customer)
    }
    setCustomer({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
    load()
  }

  async function saveMaterial(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const row = {
      name: material.material_number ? `${material.material_number} ${material.material_name}` : material.material_name,
      material_name: material.material_name,
      material_number: material.material_number
    }
    if (material.id) {
      await supabase.from('materials').update(row).eq('id', material.id)
    } else {
      await supabase.from('materials').insert(row)
    }
    setMaterial({ id:'', material_name:'', material_number:'' })
    load()
  }

  async function saveCross(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    if (cross.id) {
      await supabase.from('cross_sections').update({ name: cross.name }).eq('id', cross.id)
    } else {
      await supabase.from('cross_sections').insert({ name: cross.name })
    }
    setCross({ id:'', name:'' })
    load()
  }

  async function remove(table:string, id:string) {
    if (!confirm('Wirklich löschen?')) return
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return <main className="container">
    <h1>Stammdaten</h1>

    <h2>Kunden</h2>
    <form className="card grid" onSubmit={saveCustomer}>
      <input placeholder="Kundenname" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})} required />
      <input placeholder="Ansprechpartner" value={customer.contact_person} onChange={e=>setCustomer({...customer,contact_person:e.target.value})} />
      <input placeholder="E-Mail" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})} />
      <input placeholder="Telefon" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})} />
      <button>{customer.id ? 'Kunde ändern' : 'Kunde speichern'}</button>
    </form>

    <table><tbody>{customers.map(c=><tr key={c.id}>
      <td><b>{c.name}</b></td><td>{c.email || '-'}</td><td>{c.phone || '-'}</td>
      <td><button onClick={()=>setCustomer({...c, contact_person:c.contact_person||'', email:c.email||'', phone:c.phone||'', notes:c.notes||''})}>Bearbeiten</button></td>
      <td><button className="danger" onClick={()=>remove('customers', c.id)}>Löschen</button></td>
    </tr>)}</tbody></table>

    <h2>Materialien</h2>
    <form className="card grid" onSubmit={saveMaterial}>
      <input placeholder="Werkstoffnummer z.B. 1.4301" value={material.material_number} onChange={e=>setMaterial({...material,material_number:e.target.value})} />
      <input placeholder="Material z.B. Edelstahl" value={material.material_name} onChange={e=>setMaterial({...material,material_name:e.target.value})} required />
      <button>{material.id ? 'Material ändern' : 'Material speichern'}</button>
    </form>

    <table><tbody>{materials.map(m=><tr key={m.id}>
      <td><b>{m.material_number || '-'}</b></td><td>{m.material_name || m.name}</td>
      <td><button onClick={()=>setMaterial({id:m.id, material_name:m.material_name||m.name, material_number:m.material_number||''})}>Bearbeiten</button></td>
      <td><button className="danger" onClick={()=>remove('materials', m.id)}>Löschen</button></td>
    </tr>)}</tbody></table>

    <h2>Querschnitte</h2>
    <form className="card grid" onSubmit={saveCross}>
      <input placeholder="z.B. 40x40x3" value={cross.name} onChange={e=>setCross({...cross,name:e.target.value})} required />
      <button>{cross.id ? 'Querschnitt ändern' : 'Querschnitt speichern'}</button>
    </form>

    <table><tbody>{crossSections.map(q=><tr key={q.id}>
      <td><b>{q.name}</b></td>
      <td><button onClick={()=>setCross(q)}>Bearbeiten</button></td>
      <td><button className="danger" onClick={()=>remove('cross_sections', q.id)}>Löschen</button></td>
    </tr>)}</tbody></table>
  </main>
}
