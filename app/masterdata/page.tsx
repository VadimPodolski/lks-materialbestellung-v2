'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Customer = { id:string; name:string; contact_person:string|null; email:string|null; phone:string|null; notes:string|null }
type Supplier = { id:string; name:string; email:string; phone:string|null; contact_person:string|null; notes:string|null }
type Material = { id:string; name:string; material_name:string|null; material_number:string|null }
type CrossSection = { id:string; name:string }

type TypeKey = 'customers' | 'suppliers' | 'materials' | 'cross_sections'

export default function MasterDataPage() {
  const searchParams = useSearchParams()

  const [type, setType] = useState<TypeKey>('customers')
  const [q, setQ] = useState('')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])

  const [customer, setCustomer] = useState({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
  const [supplier, setSupplier] = useState({ id:'', name:'', email:'', phone:'', contact_person:'', notes:'' })
  const [material, setMaterial] = useState({ id:'', material_name:'', material_number:'' })
  const [cross, setCross] = useState({ id:'', name:'' })

  useEffect(() => {
    const t = searchParams.get('type') as TypeKey | null
    if (t && ['customers','suppliers','materials','cross_sections'].includes(t)) {
      setType(t)
    }
    load()
  }, [searchParams])

  async function load() {
    const supabase = createClient()

    const [{data:c}, {data:s}, {data:m}, {data:cs}] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('materials').select('*').order('name'),
      supabase.from('cross_sections').select('*').order('name')
    ])

    setCustomers(c || [])
    setSuppliers(s || [])
    setMaterials(m || [])
    setCrossSections(cs || [])
  }

  function resetForms() {
    setCustomer({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
    setSupplier({ id:'', name:'', email:'', phone:'', contact_person:'', notes:'' })
    setMaterial({ id:'', material_name:'', material_number:'' })
    setCross({ id:'', name:'' })
  }

  async function saveCustomer(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const row = {
      name: customer.name,
      contact_person: customer.contact_person || null,
      email: customer.email || null,
      phone: customer.phone || null,
      notes: customer.notes || null
    }

    if (customer.id) {
      await supabase.from('customers').update(row).eq('id', customer.id)
    } else {
      await supabase.from('customers').insert(row)
    }

    resetForms()
    load()
  }

  async function saveSupplier(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const row = {
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone || null,
      contact_person: supplier.contact_person || null,
      notes: supplier.notes || null
    }

    if (supplier.id) {
      await supabase.from('suppliers').update(row).eq('id', supplier.id)
    } else {
      await supabase.from('suppliers').insert(row)
    }

    resetForms()
    load()
  }

  async function saveMaterial(e:React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()

    const row = {
      name: material.material_number
        ? `${material.material_number} - ${material.material_name}`
        : material.material_name,
      material_name: material.material_name,
      material_number: material.material_number || null
    }

    if (material.id) {
      await supabase.from('materials').update(row).eq('id', material.id)
    } else {
      await supabase.from('materials').insert(row)
    }

    resetForms()
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

    resetForms()
    load()
  }

  async function remove(table:string, id:string) {
    if (!confirm('Eintrag wirklich löschen?')) return
    const supabase = createClient()
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  const filteredCustomers = useMemo(() => {
    const x = q.toLowerCase()
    return customers.filter(c =>
      `${c.name} ${c.contact_person || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(x)
    )
  }, [customers, q])

  const filteredSuppliers = useMemo(() => {
    const x = q.toLowerCase()
    return suppliers.filter(s =>
      `${s.name} ${s.contact_person || ''} ${s.email || ''} ${s.phone || ''}`.toLowerCase().includes(x)
    )
  }, [suppliers, q])

  const filteredMaterials = useMemo(() => {
    const x = q.toLowerCase()
    return materials.filter(m =>
      `${m.material_number || ''} ${m.material_name || ''} ${m.name}`.toLowerCase().includes(x)
    )
  }, [materials, q])

  const filteredCrossSections = useMemo(() => {
    const x = q.toLowerCase()
    return crossSections.filter(c => c.name.toLowerCase().includes(x))
  }, [crossSections, q])

  return (
    <main className="container">
      <h1>Stammdaten</h1>

      <div className="card grid">
        <div>
          <label>Bereich</label>
          <select value={type} onChange={e => {
            setType(e.target.value as TypeKey)
            resetForms()
          }}>
            <option value="customers">Kunden</option>
            <option value="suppliers">Lieferanten</option>
            <option value="materials">Materialien</option>
            <option value="cross_sections">Querschnitte</option>
          </select>
        </div>

        <div>
          <label>Suche</label>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suchen..." />
        </div>
      </div>

      {type === 'customers' && (
        <>
          <h2>Kunden</h2>

          <form className="card grid" onSubmit={saveCustomer}>
            <input placeholder="Kundenname" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})} required />
            <input placeholder="Ansprechpartner" value={customer.contact_person} onChange={e=>setCustomer({...customer,contact_person:e.target.value})} />
            <input placeholder="E-Mail" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})} />
            <input placeholder="Telefon" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})} />
            <button>{customer.id ? 'Kunde ändern' : 'Kunde speichern'}</button>
            {customer.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Ansprechpartner</th>
                <th>E-Mail</th>
                <th>Telefon</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c=>(
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td>{c.contact_person || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td className="actions">
                    <button onClick={()=>setCustomer({
                      id:c.id,
                      name:c.name,
                      contact_person:c.contact_person || '',
                      email:c.email || '',
                      phone:c.phone || '',
                      notes:c.notes || ''
                    })}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('customers', c.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'suppliers' && (
        <>
          <h2>Lieferanten</h2>

          <form className="card grid" onSubmit={saveSupplier}>
            <input placeholder="Lieferantenname" value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})} required />
            <input placeholder="E-Mail" type="email" value={supplier.email} onChange={e=>setSupplier({...supplier,email:e.target.value})} required />
            <input placeholder="Telefon" value={supplier.phone} onChange={e=>setSupplier({...supplier,phone:e.target.value})} />
            <input placeholder="Ansprechpartner" value={supplier.contact_person} onChange={e=>setSupplier({...supplier,contact_person:e.target.value})} />
            <button>{supplier.id ? 'Lieferant ändern' : 'Lieferant speichern'}</button>
            {supplier.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Telefon</th>
                <th>Ansprechpartner</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map(s=>(
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td>{s.email}</td>
                  <td>{s.phone || '-'}</td>
                  <td>{s.contact_person || '-'}</td>
                  <td className="actions">
                    <button onClick={()=>setSupplier({
                      id:s.id,
                      name:s.name,
                      email:s.email,
                      phone:s.phone || '',
                      contact_person:s.contact_person || '',
                      notes:s.notes || ''
                    })}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('suppliers', s.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'materials' && (
        <>
          <h2>Materialien</h2>

          <form className="card grid" onSubmit={saveMaterial}>
            <input placeholder="Werkstoffnummer z.B. 1.4301" value={material.material_number} onChange={e=>setMaterial({...material,material_number:e.target.value})} />
            <input placeholder="Material z.B. Edelstahl" value={material.material_name} onChange={e=>setMaterial({...material,material_name:e.target.value})} required />
            <button>{material.id ? 'Material ändern' : 'Material speichern'}</button>
            {material.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Werkstoffnummer</th>
                <th>Material</th>
                <th>Anzeige</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map(m=>(
                <tr key={m.id}>
                  <td><b>{m.material_number || '-'}</b></td>
                  <td>{m.material_name || '-'}</td>
                  <td>{m.name}</td>
                  <td className="actions">
                    <button onClick={()=>setMaterial({
                      id:m.id,
                      material_name:m.material_name || m.name,
                      material_number:m.material_number || ''
                    })}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('materials', m.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'cross_sections' && (
        <>
          <h2>Querschnitte</h2>

          <form className="card grid" onSubmit={saveCross}>
            <input placeholder="z.B. 40x40x3" value={cross.name} onChange={e=>setCross({...cross,name:e.target.value})} required />
            <button>{cross.id ? 'Querschnitt ändern' : 'Querschnitt speichern'}</button>
            {cross.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Querschnitt</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredCrossSections.map(c=>(
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td className="actions">
                    <button onClick={()=>setCross(c)}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('cross_sections', c.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
