'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OrderItem, emptyOrderItem, mergeOrderItems, orderItemsTotal, primaryOrderItem } from '@/lib/orderItems'
import { ensureCurrentUserProfile } from '@/lib/profiles'

type Supplier = { id: string; name: string }
type Customer = { id: string; name: string }
type Material = { id: string; name: string; material_name: string | null; material_number: string | null }
type CrossSection = { id: string; name: string }
type WorkPreparation = { id: string; name: string }

export default function NewOrderPage() {
  const router = useRouter()
  const [orderArea, setOrderArea] = useState('')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])
  const [workPreparations, setWorkPreparations] = useState<WorkPreparation[]>([])

  const [form, setForm] = useState({
    order_number: 'AB-',
    customer: '',
    supplier_id: '',
    customer_delivery_date: '',
    desired_delivery_date: '',
    notes: ''
  })
  const [items, setItems] = useState<OrderItem[]>([emptyOrderItem()])
  const [activeMaterialIndex, setActiveMaterialIndex] = useState<number | null>(null)
  const [activeCrossIndex, setActiveCrossIndex] = useState<number | null>(null)

  const [msg, setMsg] = useState('')

  useEffect(() => {
    const area = new URLSearchParams(window.location.search).get('bereich') || ''
    setOrderArea(area)
    loadMasterData()
  }, [])

  async function loadMasterData() {
    const supabase = createClient()

    const [{ data: supplierData }, { data: customerData }, { data: materialData }, { data: crossSectionData }, { data: workPreparationData }] =
      await Promise.all([
        supabase.from('suppliers').select('id,name').order('name'),
        supabase.from('customers').select('id,name').order('name'),
        supabase.from('materials').select('id,name,material_name,material_number').order('name'),
        supabase.from('cross_sections').select('id,name').order('name'),
        supabase.from('work_preparations').select('id,name').order('name')
      ])

    const supplierList = supplierData || []
    const materialList = materialData || []
    const crossSectionList = crossSectionData || []

    setSuppliers(supplierList)
    setCustomers(customerData || [])
    setMaterials(materialList)
    setCrossSections(crossSectionList)
    setWorkPreparations(workPreparationData || [])

    const lastSupplier = localStorage.getItem('last_supplier_id')
    const lastMaterial = localStorage.getItem('last_material')
    const lastCrossSection = localStorage.getItem('last_cross_section')

    setForm(prev => ({
      ...prev,
      supplier_id: lastSupplier && supplierList.some(s => s.id === lastSupplier)
        ? lastSupplier
        : prev.supplier_id || supplierList[0]?.id || ''
    }))

    setItems(prev => {
      const material = lastMaterial && materialList.some(m => m.name === lastMaterial) ? lastMaterial : materialList[0]?.name || prev[0]?.material || ''
      const crossSection = lastCrossSection && crossSectionList.some(q => q.name === lastCrossSection) ? lastCrossSection : crossSectionList[0]?.name || prev[0]?.cross_section || ''

      return prev.map((item, index) => index === 0 ? {
        ...item,
        material: item.material || material,
        cross_section: item.cross_section || crossSection
      } : item)
    })
  }

  const customerSuggestions = useMemo(() => {
    const q = form.customer.trim().toLowerCase()
    if (q.length < 1) return []
    return customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [customers, form.customer])

  function set(k: string, v: string) {
    if (k === 'order_number') {
      const rest = v.startsWith('AB-') ? v.slice(3) : v.replace(/^AB-?/, '')
      setForm(prev => ({ ...prev, order_number: 'AB-' + rest }))
      return
    }

    setForm(prev => ({ ...prev, [k]: v }))
  }

  function materialLabel(m: Material) {
    return m.material_name || m.name
  }

  function materialOptions(value: string) {
    return materials
  }

  function crossSectionOptions(value: string) {
    return crossSections
  }

  async function ensureMasterData(cleanItems: OrderItem[]) {
    const supabase = createClient()
    const knownMaterials = new Set(
      materials.map(m => m.name.trim().toLowerCase()).filter(Boolean)
    )
    const knownCrossSections = new Set(
      crossSections.map(c => c.name.trim().toLowerCase()).filter(Boolean)
    )
    const knownWorkPreparations = new Set(
      workPreparations.map(av => av.name.trim().toLowerCase()).filter(Boolean)
    )
    const newMaterials = Array.from(
      new Set(
        cleanItems
          .map(item => item.material.trim())
          .filter(name => name && !knownMaterials.has(name.toLowerCase()))
      )
    )
    const newCrossSections = Array.from(
      new Set(
        cleanItems
          .map(item => item.cross_section.trim())
          .filter(name => name && !knownCrossSections.has(name.toLowerCase()))
      )
    )
    const newWorkPreparations = Array.from(
      new Set(
        cleanItems
          .flatMap(item => [item.av_1, item.av_2, item.av_3, item.av_4])
          .map(name => (name || '').trim())
          .filter(name => name && !knownWorkPreparations.has(name.toLowerCase()))
      )
    )

    if (newMaterials.length > 0) {
      const { error } = await supabase.from('materials').insert(
        newMaterials.map(name => ({
          name,
          material_name: name,
          material_number: null
        }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

    if (newCrossSections.length > 0) {
      const { error } = await supabase.from('cross_sections').insert(
        newCrossSections.map(name => ({ name }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

    if (newWorkPreparations.length > 0) {
      const { error } = await supabase.from('work_preparations').insert(
        newWorkPreparations.map(name => ({ name }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }
  }

  async function ensureCustomerMasterData(customerName: string) {
    const name = customerName.trim()
    if (!name) return

    const knownCustomers = new Set(
      customers.map(customer => customer.name.trim().toLowerCase()).filter(Boolean)
    )

    if (knownCustomers.has(name.toLowerCase())) return

    const supabase = createClient()
    const { error } = await supabase.from('customers').insert({ name })

    if (error && !error.message.includes('duplicate')) {
      throw new Error(error.message)
    }
  }

  function setItem(index: number, key: 'material' | 'cross_section' | 'av_1' | 'av_2' | 'av_3' | 'av_4' | 'length_mm' | 'quantity', value: string) {
    setItems(prev => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item

      if (key === 'length_mm') {
        return { ...item, length_mm: value ? Number(value) : null }
      }

      if (key === 'quantity') {
        return { ...item, quantity: Number(value || 0) }
      }

      return { ...item, [key]: value }
    }))
  }

  function addItem() {
    const last = items[items.length - 1] || emptyOrderItem()

    setItems(prev => [
      ...prev,
      {
        ...emptyOrderItem(),
        material: last.material,
        cross_section: last.cross_section,
        av_1: last.av_1,
        av_2: last.av_2,
        av_3: last.av_3,
        av_4: last.av_4,
        length_mm: last.length_mm
      }
    ])
  }

  function removeItem(index: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')

    const orderNumberSuffix = form.order_number.replace(/^AB-/, '').trim()
    const customerName = form.customer.trim()

    if (!orderNumberSuffix) {
      return setMsg('Bitte eine AB-Nummer eintragen.')
    }

    if (!customerName) {
      return setMsg('Bitte Kundennamen eintragen.')
    }

    const cleanItems = mergeOrderItems(items.map(item => ({
      material: item.material.trim(),
      cross_section: item.cross_section.trim(),
      av_1: (item.av_1 || '').trim(),
      av_2: (item.av_2 || '').trim(),
      av_3: (item.av_3 || '').trim(),
      av_4: (item.av_4 || '').trim(),
      length_mm: item.length_mm ? Number(item.length_mm) : null,
      quantity: Number(item.quantity)
    })))

    if (cleanItems.some(item => !item.material || !item.cross_section || !item.quantity || item.quantity < 1)) {
      return setMsg('Bitte jede Position mit Material, Querschnitt und Stückzahl ausfüllen.')
    }

    try {
      await ensureCustomerMasterData(customerName)
      await ensureMasterData(cleanItems)
    } catch (error: any) {
      return setMsg(error.message || 'Stammdaten konnten nicht gespeichert werden.')
    }

    const firstItem = primaryOrderItem(cleanItems)
    const totalQuantity = orderItemsTotal(cleanItems)

    if (form.supplier_id) localStorage.setItem('last_supplier_id', form.supplier_id)
    if (firstItem.material) localStorage.setItem('last_material', firstItem.material)
    if (firstItem.cross_section) localStorage.setItem('last_cross_section', firstItem.cross_section)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await ensureCurrentUserProfile(supabase)

    const orderRow = {
      ...form,
      customer: customerName,
      supplier_id: form.supplier_id || null,
      material: firstItem.material,
      cross_section: firstItem.cross_section,
      length_mm: firstItem.length_mm,
      quantity: totalQuantity,
      status: 'offen',
      customer_delivery_date: form.customer_delivery_date || null,
      desired_delivery_date: form.desired_delivery_date || null,
      created_by: userData.user?.id || null
    }

    const { data, error } = await supabase
      .from('material_orders')
      .insert(orderRow)
      .select('id')
      .single()

    if (error) {
      if (error.message.includes('customer_delivery_date')) {
        return setMsg('Bitte zuerst die Supabase-Migration fuer K-Liefertermin ausfuehren.')
      }

      return setMsg(error.message)
    }

    const { error: itemError } = await supabase.from('order_items').insert(
      cleanItems.map((item, index) => ({
        material_order_id: data.id,
        material: item.material,
        cross_section: item.cross_section,
        av_1: item.av_1 || null,
        av_2: item.av_2 || null,
        av_3: item.av_3 || null,
        av_4: item.av_4 || null,
        length_mm: item.length_mm,
        quantity: item.quantity,
        position: index + 1
      }))
    )

    if (itemError) return setMsg(itemError.message)

    router.push(`/orders/${data.id}`)
  }

  return (
    <main className="container">
      <button type="button" className="secondary" onClick={() => router.push('/orders')}>
        Zurück
      </button>

      <div className="order-page-heading">
        <div>
          <span className="order-area-badge">
            {orderArea === '2d-laser' ? '2D-Laser' : orderArea === 'rohrlaser' ? 'Rohrlaser' : 'Materialbestellung'}
          </span>
          <h1>Neue Materialbestellung</h1>
        </div>
        <button type="button" className="button secondary" onClick={() => router.push('/')}>
          Bereich wechseln
        </button>
      </div>

      <form className="card grid" onSubmit={save}>
        <div>
          <label>Auftragsnummer</label>
          <input value={form.order_number} onChange={e => set('order_number', e.target.value)} required />
        </div>

        <div style={{ position: 'relative' }}>
          <label>Kunde</label>
          <input value={form.customer} onChange={e => set('customer', e.target.value)} required />

          {customerSuggestions.length > 0 && (
            <div className="suggestions">
              {customerSuggestions.map(c => (
                <button type="button" key={c.id} onClick={() => set('customer', c.name)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label>K-Liefertermin</label>
          <input type="date" value={form.customer_delivery_date} onChange={e => set('customer_delivery_date', e.target.value)} />
        </div>

        <div>
          <label>Lieferant</label>
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
            <option value="">Bitte wählen</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label>Liefertermin</label>
          <input type="date" value={form.desired_delivery_date} onChange={e => set('desired_delivery_date', e.target.value)} />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <h2>Positionen</h2>
            <div className="actions">
              <button type="button" className="primary" onClick={addItem}>+ Position</button>
            </div>
          </div>

          <datalist id="work-preparation-options">
            {workPreparations.map(av => (
              <option key={av.id} value={av.name} />
            ))}
          </datalist>

          <div className="order-items">
            {items.map((item, index) => (
              <div className="order-item" key={index}>
                <div className="order-item-row">
                  <div className="order-item-title">
                    <b>Position {index + 1}</b>
                  </div>

                  <div>
                    <label>Material</label>
                    <div className="combo-box">
                      <input
                        value={item.material}
                        onFocus={() => setActiveMaterialIndex(index)}
                        onBlur={() => window.setTimeout(() => setActiveMaterialIndex(null), 120)}
                        onChange={e => setItem(index, 'material', e.target.value)}
                        placeholder="Material wählen oder eingeben"
                        required
                      />
                      {activeMaterialIndex === index && materialOptions(item.material).length > 0 && (
                        <div className="combo-options">
                          {materialOptions(item.material).map(m => (
                            <button
                              type="button"
                              key={m.id}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setItem(index, 'material', m.name)
                                setActiveMaterialIndex(null)
                              }}
                            >
                              {materialLabel(m)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label>Rohrquerschnitt</label>
                    <div className="combo-box">
                      <input
                        value={item.cross_section}
                        onFocus={() => setActiveCrossIndex(index)}
                        onBlur={() => window.setTimeout(() => setActiveCrossIndex(null), 120)}
                        onChange={e => setItem(index, 'cross_section', e.target.value)}
                        placeholder="Querschnitt wählen oder eingeben"
                        required
                      />
                      {activeCrossIndex === index && crossSectionOptions(item.cross_section).length > 0 && (
                        <div className="combo-options">
                          {crossSectionOptions(item.cross_section).map(q => (
                            <button
                              type="button"
                              key={q.id}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                setItem(index, 'cross_section', q.name)
                                setActiveCrossIndex(null)
                              }}
                            >
                              {q.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label>Länge mm</label>
                    <input
                      type="number"
                      value={item.length_mm || ''}
                      onChange={e => setItem(index, 'length_mm', e.target.value)}
                    />
                  </div>

                  {(['av_1', 'av_2', 'av_3', 'av_4'] as const).map((key, avIndex) => (
                    <div key={key}>
                      <label>AV {avIndex + 1}</label>
                      <input
                        value={item[key] || ''}
                        list="work-preparation-options"
                        onChange={e => setItem(index, key, e.target.value)}
                        placeholder="Arbeitsvorbereitung"
                      />
                    </div>
                  ))}

                  <div>
                    <label>Stückzahl</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity || ''}
                      onChange={e => setItem(index, 'quantity', e.target.value)}
                      required
                    />
                  </div>

                  <div className="order-item-remove">
                    {items.length > 1 && (
                      <button type="button" className="danger" onClick={() => removeItem(index)}>
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="small">Gesamtstückzahl: {orderItemsTotal(items)}</p>
        </div>


        <div style={{ gridColumn: '1/-1' }}>
          <label>Bemerkung</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <button>Speichern</button>
        {msg && <p className="error">{msg}</p>}
      </form>

    </main>
  )
}
