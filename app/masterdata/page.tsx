'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LOGIN_DISABLED } from '@/lib/authMode'
import { normalizeOrderArea, ordersHref, type OrderArea } from '@/lib/orderAreas'
import { ensureCurrentUserProfile } from '@/lib/profiles'
import { isTwoDLaserDeleteManager } from '@/lib/areaPermissions'

type Customer = { id:string; name:string; contact_person:string|null; email:string|null; phone:string|null; notes:string|null }
type Supplier = { id:string; name:string; email:string; phone:string|null; contact_person:string|null; notes:string|null }
type Material = { id:string; name:string; material_name:string|null; material_number:string|null }
type CrossSection = { id:string; name:string }
type WorkPreparation = { id:string; name:string }
type SheetFormat = { id:string; name:string; width_mm:number; height_mm:number }
type MaterialThickness = { id:string; material:string; thickness_mm:number }
type CrossSectionCategory = 'square' | 'rectangular' | 'round'

type TypeKey = 'customers' | 'suppliers' | 'materials' | 'material_thicknesses' | 'cross_sections' | 'work_preparations' | 'formats'

const ROHRLASER_TYPES: TypeKey[] = ['customers', 'suppliers', 'materials', 'cross_sections', 'work_preparations']
const TWO_D_LASER_TYPES: TypeKey[] = ['suppliers', 'materials', 'material_thicknesses', 'formats']

function getCrossSectionCategory(name:string): CrossSectionCategory {
  const normalized = name.toLowerCase().replace(/×/g, 'x')

  if (/rund|kreis|ø|⌀/.test(normalized)) return 'round'
  if (/quadrat/.test(normalized)) return 'square'
  if (/rechteck/.test(normalized)) return 'rectangular'

  const dimensions = normalized.match(/\d+(?:[.,]\d+)?/g)?.map(value => Number(value.replace(',', '.'))) || []
  if (dimensions.length === 2) return 'round'
  if (dimensions.length >= 3 && Math.abs(dimensions[0] - dimensions[1]) < 0.001) return 'square'
  return 'rectangular'
}

function MasterDataContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderArea = normalizeOrderArea(searchParams.get('bereich'))

  const [type, setType] = useState<TypeKey>('customers')
  const [q, setQ] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isTwoDDeleteManager, setIsTwoDDeleteManager] = useState(false)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])
  const [workPreparations, setWorkPreparations] = useState<WorkPreparation[]>([])
  const [formats, setFormats] = useState<SheetFormat[]>([])
  const [materialThicknesses, setMaterialThicknesses] = useState<MaterialThickness[]>([])

  const [customer, setCustomer] = useState({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
  const [supplier, setSupplier] = useState({ id:'', name:'', email:'', phone:'', contact_person:'', notes:'' })
  const [material, setMaterial] = useState({ id:'', material_name:'', material_number:'' })
  const [cross, setCross] = useState({ id:'', name:'' })
  const [workPreparation, setWorkPreparation] = useState({ id:'', name:'' })
  const [format, setFormat] = useState({ id:'', name:'', width_mm:'', height_mm:'' })
  const [materialThickness, setMaterialThickness] = useState({ id:'', material:'', thickness_mm:'' })

  useEffect(() => {
    const t = searchParams.get('type') as TypeKey | null
    const allowedTypes = orderArea === '2d-laser' ? TWO_D_LASER_TYPES : ROHRLASER_TYPES
    setType(t && allowedTypes.includes(t) ? t : orderArea === '2d-laser' ? 'formats' : 'customers')
    load()
  }, [searchParams])

  async function load() {
    const supabase = createClient()

    const [
      { data: userData },
      {data:c},
      {data:s},
      {data:m},
      {data:cs},
      {data:av},
      {data:f},
      {data:mt}
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('customers').select('*').eq('order_area', orderArea).order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('materials').select('*').eq('order_area', orderArea).order('name'),
      supabase.from('cross_sections').select('*').eq('order_area', orderArea).order('name'),
      supabase.from('work_preparations').select('*').eq('order_area', orderArea).order('name'),
      supabase.from('formats').select('*').order('width_mm', { ascending: false }),
      supabase.from('material_thicknesses').select('id,material,thickness_mm').eq('order_area', '2d-laser').order('material').order('thickness_mm')
    ])

    const user = userData.user || null
    const email = user?.email?.toLowerCase() || ''
    let admin = !LOGIN_DISABLED && email === 'v.podolski@lks-technik.de'

    if (!LOGIN_DISABLED && user) {
      const profile = await ensureCurrentUserProfile(supabase, user)
      admin = admin || profile?.role === 'admin'
    }

    setIsAdmin(admin)
    setIsTwoDDeleteManager(!LOGIN_DISABLED && isTwoDLaserDeleteManager(email))
    setCustomers(c || [])
    setSuppliers(s || [])
    setMaterials(m || [])
    setCrossSections(cs || [])
    setWorkPreparations(av || [])
    setFormats(f || [])
    setMaterialThicknesses(mt || [])
  }

  function resetForms() {
    setCustomer({ id:'', name:'', contact_person:'', email:'', phone:'', notes:'' })
    setSupplier({ id:'', name:'', email:'', phone:'', contact_person:'', notes:'' })
    setMaterial({ id:'', material_name:'', material_number:'' })
    setCross({ id:'', name:'' })
    setWorkPreparation({ id:'', name:'' })
    setFormat({ id:'', name:'', width_mm:'', height_mm:'' })
    setMaterialThickness({ id:'', material:'', thickness_mm:'' })
  }

  async function saveCustomer(e:React.FormEvent) {
    e.preventDefault()
    if (customer.id && !isAdmin) return
    const supabase = createClient()

    const row = {
      name: customer.name,
      contact_person: customer.contact_person || null,
      email: customer.email || null,
      phone: customer.phone || null,
      notes: customer.notes || null,
      order_area: 'rohrlaser'
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
    if (supplier.id && !isAdmin) return
    const supabase = createClient()

    const row = {
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone || null,
      contact_person: supplier.contact_person || null,
      notes: supplier.notes || null,
      order_area: orderArea
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
    if (material.id && !isAdmin) return
    const supabase = createClient()

    const row = {
      name: material.material_name,
      material_name: material.material_name,
      material_number: null,
      order_area: orderArea
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
    if (cross.id && !isAdmin) return
    const supabase = createClient()

    if (cross.id) {
      await supabase.from('cross_sections').update({ name: cross.name }).eq('id', cross.id)
    } else {
      await supabase.from('cross_sections').insert({ name: cross.name, order_area: orderArea })
    }

    resetForms()
    load()
  }

  async function saveWorkPreparation(e:React.FormEvent) {
    e.preventDefault()
    if (workPreparation.id && !isAdmin) return
    const supabase = createClient()

    if (workPreparation.id) {
      await supabase.from('work_preparations').update({ name: workPreparation.name }).eq('id', workPreparation.id)
    } else {
      await supabase.from('work_preparations').insert({ name: workPreparation.name, order_area: orderArea })
    }

    resetForms()
    load()
  }

  async function saveFormat(e:React.FormEvent) {
    e.preventDefault()
    if (format.id && !isAdmin) return

    const width = Number(format.width_mm)
    const height = Number(format.height_mm)
    if (!width || !height) return

    const row = {
      name: format.name.trim() || 'Sonderformat',
      width_mm: width,
      height_mm: height
    }
    const supabase = createClient()

    if (format.id) {
      await supabase.from('formats').update(row).eq('id', format.id)
    } else {
      await supabase.from('formats').insert(row)
    }

    resetForms()
    load()
  }

  async function saveMaterialThickness(e:React.FormEvent) {
    e.preventDefault()
    if (materialThickness.id && !isAdmin) return

    const thickness = Number(materialThickness.thickness_mm.replace(',', '.'))
    if (!materialThickness.material.trim() || !thickness || thickness <= 0) return

    const row = {
      order_area: '2d-laser',
      material: materialThickness.material.trim(),
      thickness_mm: thickness
    }
    const supabase = createClient()

    if (materialThickness.id) {
      await supabase.from('material_thicknesses').update(row).eq('id', materialThickness.id)
    } else {
      await supabase.from('material_thicknesses').upsert(row, {
        onConflict: 'order_area,material,thickness_mm',
        ignoreDuplicates: true
      })
    }

    resetForms()
    load()
  }

  async function remove(table:string, id:string) {
    const isTwoDOnlyTable = ['materials', 'material_thicknesses', 'formats'].includes(table)
    const canDelete = isAdmin || (orderArea === '2d-laser' && isTwoDDeleteManager && isTwoDOnlyTable)
    if (!canDelete) return
    if (!confirm('Eintrag wirklich löschen?')) return
    const supabase = createClient()
    let query = supabase.from(table).delete().eq('id', id)
    if (table === 'materials' || table === 'material_thicknesses') {
      query = query.eq('order_area', '2d-laser')
    }
    const { error } = await query
    if (error) {
      alert(`Eintrag konnte nicht gelöscht werden: ${error.message}`)
      return
    }
    load()
  }

  const canDeleteSelectedMasterData = isAdmin || (
    orderArea === '2d-laser' &&
    isTwoDDeleteManager &&
    ['materials', 'material_thicknesses', 'formats'].includes(type)
  )

  const filteredSuppliers = useMemo(() => {
    const x = q.toLowerCase()
    return suppliers.filter(s =>
      `${s.name} ${s.contact_person || ''} ${s.email || ''} ${s.phone || ''}`.toLowerCase().includes(x)
    )
  }, [suppliers, q])

  const filteredMaterials = useMemo(() => {
    const x = q.toLowerCase()
    return materials.filter(m =>
      `${m.material_name || ''} ${m.name}`.toLowerCase().includes(x)
    )
  }, [materials, q])

  const filteredCrossSections = useMemo(() => {
    const x = q.toLowerCase()
    return crossSections.filter(c => c.name.toLowerCase().includes(x))
  }, [crossSections, q])

  const groupedCrossSections = useMemo(() => {
    const groups: Record<CrossSectionCategory, CrossSection[]> = {
      square: [],
      rectangular: [],
      round: []
    }

    filteredCrossSections.forEach(crossSection => {
      groups[getCrossSectionCategory(crossSection.name)].push(crossSection)
    })

    return groups
  }, [filteredCrossSections])

  const filteredWorkPreparations = useMemo(() => {
    const x = q.toLowerCase()
    return workPreparations.filter(av => av.name.toLowerCase().includes(x))
  }, [workPreparations, q])

  const filteredCustomers = useMemo(() => {
    const x = q.toLowerCase()
    return customers.filter(c =>
      `${c.name} ${c.contact_person || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(x)
    )
  }, [customers, q])

  const filteredFormats = useMemo(() => {
    const x = q.toLowerCase()
    return formats.filter(f => `${f.name} ${f.width_mm} ${f.height_mm}`.toLowerCase().includes(x))
  }, [formats, q])

  const filteredMaterialThicknesses = useMemo(() => {
    const x = q.toLowerCase()
    return materialThicknesses.filter(item =>
      `${item.material} ${String(item.thickness_mm).replace('.', ',')}`.toLowerCase().includes(x)
    )
  }, [materialThicknesses, q])

  return (
    <main className="container masterdata-page">
      <button type="button" className="secondary" onClick={() => router.push(ordersHref(orderArea))}>
        Zurück
      </button>

      <h1>Stammdaten</h1>

      {!isAdmin && !canDeleteSelectedMasterData && (
        <p className="small">Normale Benutzer koennen Stammdaten anlegen. Bearbeiten und Loeschen ist nur fuer Administratoren moeglich.</p>
      )}
      {!isAdmin && canDeleteSelectedMasterData && (
        <p className="small">Du kannst die Stammdaten dieses 2D-Laser-Bereichs löschen. Bearbeiten bleibt Administratoren vorbehalten.</p>
      )}

      <div className="card grid">
        <div>
          <label>Fertigungsbereich</label>
          <select value={orderArea} onChange={e => {
            const area = e.target.value as OrderArea
            const nextType = area === '2d-laser'
              ? (TWO_D_LASER_TYPES.includes(type) ? type : 'formats')
              : (ROHRLASER_TYPES.includes(type) ? type : 'customers')
            router.push(`/masterdata?bereich=${area}&type=${nextType}`)
          }}>
            <option value="rohrlaser">Rohrlaser</option>
            <option value="2d-laser">2D-Laser</option>
          </select>
        </div>

        <div>
          <label>Bereich</label>
          <select value={type} onChange={e => {
            const nextType = e.target.value as TypeKey
            setType(nextType)
            router.replace(`/masterdata?bereich=${orderArea}&type=${nextType}`)
            resetForms()
          }}>
            {orderArea === 'rohrlaser' && <option value="customers">Kunden</option>}
            <option value="suppliers">Lieferanten</option>
            <option value="materials">Materialien</option>
            {orderArea === '2d-laser' && <option value="material_thicknesses">Materialstärken</option>}
            {orderArea === 'rohrlaser' && <option value="cross_sections">Querschnitte</option>}
            {orderArea === 'rohrlaser' && <option value="work_preparations">AV</option>}
            {orderArea === '2d-laser' && <option value="formats">Formate</option>}
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
                {isAdmin && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c=>(
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td>{c.contact_person || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  {isAdmin && <td className="actions">
                    <button onClick={()=>setCustomer({
                      id:c.id,
                      name:c.name,
                      contact_person:c.contact_person || '',
                      email:c.email || '',
                      phone:c.phone || '',
                      notes:c.notes || ''
                    })}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('customers', c.id)}>Löschen</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'suppliers' && (
        <>
          <h2>Lieferanten (Rohrlaser und 2D-Laser)</h2>

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
                {isAdmin && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map(s=>(
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td>{s.email}</td>
                  <td>{s.phone || '-'}</td>
                  <td>{s.contact_person || '-'}</td>
                  {isAdmin && <td className="actions">
                    <button onClick={()=>setSupplier({
                      id:s.id,
                      name:s.name,
                      email:s.email,
                      phone:s.phone || '',
                      contact_person:s.contact_person || '',
                      notes:s.notes || ''
                    })}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('suppliers', s.id)}>Löschen</button>
                  </td>}
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
            <input
              placeholder="Material z.B. Edelstahl"
              value={material.material_name}
              onChange={e=>setMaterial({...material,material_name:e.target.value})}
              required
            />
            <button>{material.id ? 'Material ändern' : 'Material speichern'}</button>
            {material.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Material</th>
                {canDeleteSelectedMasterData && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map(m=>(
                <tr key={m.id}>
                  <td><b>{m.material_name || m.name}</b></td>
                  {canDeleteSelectedMasterData && <td className="actions">
                    {isAdmin && <button onClick={()=>setMaterial({
                      id:m.id,
                      material_name:m.material_name || m.name,
                      material_number:''
                    })}>Bearbeiten</button>}
                    <button className="danger" onClick={()=>remove('materials', m.id)}>Löschen</button>
                  </td>}
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

          <div className="cross-section-card-grid">
            {([
              ['square', 'Quadratrohr'],
              ['rectangular', 'Rechteckrohr'],
              ['round', 'Rundrohr']
            ] as const).map(([category, title]) => (
              <section className="card cross-section-card" key={category}>
                <h3>{title}</h3>
                <div className="cross-section-list">
                  {groupedCrossSections[category].length === 0 && (
                    <p className="small">Keine Querschnitte vorhanden.</p>
                  )}
                  {groupedCrossSections[category].map(c => (
                    <div className="cross-section-entry" key={c.id}>
                      <b>{c.name}</b>
                      {isAdmin && (
                        <span className="cross-section-actions">
                          <button onClick={()=>setCross(c)}>Bearbeiten</button>
                          <button className="danger" onClick={()=>remove('cross_sections', c.id)}>Löschen</button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {type === 'work_preparations' && (
        <>
          <h2>AV</h2>

          <form className="card grid" onSubmit={saveWorkPreparation}>
            <input placeholder="z.B. Sortieren, Kanten, Schweißen, Pulverbeschichtung" value={workPreparation.name} onChange={e=>setWorkPreparation({...workPreparation,name:e.target.value})} required />
            <button>{workPreparation.id ? 'AV ändern' : 'AV speichern'}</button>
            {workPreparation.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Arbeitsvorbereitung</th>
                {isAdmin && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredWorkPreparations.map(av=>(
                <tr key={av.id}>
                  <td><b>{av.name}</b></td>
                  {isAdmin && <td className="actions">
                    <button onClick={()=>setWorkPreparation(av)}>Bearbeiten</button>
                    <button className="danger" onClick={()=>remove('work_preparations', av.id)}>Löschen</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'material_thicknesses' && orderArea === '2d-laser' && (
        <>
          <h2>Materialstärken</h2>

          <form className="card grid" onSubmit={saveMaterialThickness}>
            <select
              value={materialThickness.material}
              onChange={e=>setMaterialThickness({...materialThickness,material:e.target.value})}
              required
            >
              <option value="">Material auswählen</option>
              {materials.map(m => (
                <option key={m.id} value={m.name}>{m.material_name || m.name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Materialstärke in mm, z.B. 1,5"
              value={materialThickness.thickness_mm}
              onChange={e=>setMaterialThickness({...materialThickness,thickness_mm:e.target.value})}
              required
            />
            <button>{materialThickness.id ? 'Materialstärke ändern' : 'Materialstärke speichern'}</button>
            {materialThickness.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Materialstärke</th>
                {canDeleteSelectedMasterData && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredMaterialThicknesses.map(item=>(
                <tr key={item.id}>
                  <td><b>{item.material}</b></td>
                  <td>{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(item.thickness_mm)} mm</td>
                  {canDeleteSelectedMasterData && <td className="actions">
                    {isAdmin && <button onClick={()=>setMaterialThickness({
                      id:item.id,
                      material:item.material,
                      thickness_mm:String(item.thickness_mm)
                    })}>Bearbeiten</button>}
                    <button className="danger" onClick={()=>remove('material_thicknesses', item.id)}>Löschen</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === 'formats' && orderArea === '2d-laser' && (
        <>
          <h2>Formate</h2>

          <form className="card grid" onSubmit={saveFormat}>
            <input
              placeholder="Bezeichnung, z.B. Sonderformat (optional)"
              value={format.name}
              onChange={e=>setFormat({...format,name:e.target.value})}
            />
            <input
              type="number"
              min="1"
              placeholder="Breite in mm"
              value={format.width_mm}
              onChange={e=>setFormat({...format,width_mm:e.target.value})}
              required
            />
            <input
              type="number"
              min="1"
              placeholder="Höhe in mm"
              value={format.height_mm}
              onChange={e=>setFormat({...format,height_mm:e.target.value})}
              required
            />
            <button>{format.id ? 'Format ändern' : 'Format speichern'}</button>
            {format.id && <button type="button" className="secondary" onClick={resetForms}>Abbrechen</button>}
          </form>

          <table>
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Breite</th>
                <th>Höhe</th>
                {canDeleteSelectedMasterData && <th>Aktionen</th>}
              </tr>
            </thead>
            <tbody>
              {filteredFormats.map(f=>(
                <tr key={f.id}>
                  <td><b>{f.name}</b></td>
                  <td>{f.width_mm} mm</td>
                  <td>{f.height_mm} mm</td>
                  {canDeleteSelectedMasterData && <td className="actions">
                    {isAdmin && <button onClick={()=>setFormat({
                      id:f.id,
                      name:f.name,
                      width_mm:String(f.width_mm),
                      height_mm:String(f.height_mm)
                    })}>Bearbeiten</button>}
                    <button className="danger" onClick={()=>remove('formats', f.id)}>Löschen</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}

export default function MasterDataPage() {
  return (
    <Suspense fallback={<main className="container">Lade Stammdaten...</main>}>
      <MasterDataContent />
    </Suspense>
  )
}
