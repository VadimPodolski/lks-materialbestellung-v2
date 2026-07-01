'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OrderItem, emptyOrderItem, mergeOrderItems, orderItemsTotal, primaryOrderItem } from '@/lib/orderItems'

type Supplier = { id: string; name: string }
type Customer = { id: string; name: string }
type Material = { id: string; name: string; material_name: string | null; material_number: string | null }
type CrossSection = { id: string; name: string }

export default function NewOrderPage() {
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])

  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [showCrossModal, setShowCrossModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)

  const [materialForm, setMaterialForm] = useState({ material_name: '' })
  const [crossForm, setCrossForm] = useState({ name: '' })
  const [customerForm, setCustomerForm] = useState({ name: '', contact_person: '', email: '', phone: '', notes: '' })

  const [form, setForm] = useState({
    order_number: 'AB-',
    customer: '',
    supplier_id: '',
    desired_delivery_date: '',
    notes: ''
  })
  const [items, setItems] = useState<OrderItem[]>([emptyOrderItem()])
  const [activeMaterialIndex, setActiveMaterialIndex] = useState<number | null>(null)
  const [activeCrossIndex, setActiveCrossIndex] = useState<number | null>(null)

  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadMasterData()
  }, [])

  async function loadMasterData() {
    const supabase = createClient()

    const [{ data: supplierData }, { data: customerData }, { data: materialData }, { data: crossSectionData }] =
      await Promise.all([
        supabase.from('suppliers').select('id,name').order('name'),
        supabase.from('customers').select('id,name').order('name'),
        supabase.from('materials').select('id,name,material_name,material_number').order('name'),
        supabase.from('cross_sections').select('id,name').order('name')
      ])

    const supplierList = supplierData || []
    const materialList = materialData || []
    const crossSectionList = crossSectionData || []

    setSuppliers(supplierList)
    setCustomers(customerData || [])
    setMaterials(materialList)
    setCrossSections(crossSectionList)

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
  }

  function setItem(index: number, key: 'material' | 'cross_section' | 'length_mm' | 'quantity', value: string) {
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
        length_mm: last.length_mm
      }
    ])
  }

  function removeItem(index: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index))
  }

  async function saveMaterial() {
    const materialName = materialForm.material_name.trim()

    if (!materialName) return setMsg('Bitte Material eintragen.')

    const supabase = createClient()

    const { error } = await supabase.from('materials').insert({
      name: materialName,
      material_name: materialName,
      material_number: null
    })

    if (error && !error.message.includes('duplicate')) return setMsg(error.message)

    setMaterialForm({ material_name: '' })
    setShowMaterialModal(false)
    setMsg('')

    await loadMasterData()

    setItems(prev => prev.map((item, index) => index === 0 ? { ...item, material: materialName } : item))
  }

  async function saveCrossSection() {
    const name = crossForm.name.trim()
    if (!name) return setMsg('Bitte Querschnitt eintragen.')

    const supabase = createClient()
    const { error } = await supabase.from('cross_sections').insert({ name })

    if (error && !error.message.includes('duplicate')) return setMsg(error.message)

    setCrossForm({ name: '' })
    setShowCrossModal(false)
    setMsg('')
    await loadMasterData()
    setItems(prev => prev.map((item, index) => index === 0 ? { ...item, cross_section: name } : item))
  }

  async function saveCustomer() {
    const name = customerForm.name.trim()
    if (!name) return setMsg('Bitte Kundennamen eintragen.')

    const supabase = createClient()
    const { error } = await supabase.from('customers').insert({
      name,
      contact_person: customerForm.contact_person || null,
      email: customerForm.email || null,
      phone: customerForm.phone || null,
      notes: customerForm.notes || null
    })

    if (error && !error.message.includes('duplicate')) return setMsg(error.message)

    setCustomerForm({ name: '', contact_person: '', email: '', phone: '', notes: '' })
    setShowCustomerModal(false)
    setMsg('')
    await loadMasterData()
    setForm(prev => ({ ...prev, customer: name }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')

    const cleanItems = mergeOrderItems(items.map(item => ({
      material: item.material.trim(),
      cross_section: item.cross_section.trim(),
      length_mm: item.length_mm ? Number(item.length_mm) : null,
      quantity: Number(item.quantity)
    })))

    if (cleanItems.some(item => !item.material || !item.cross_section || !item.quantity || item.quantity < 1)) {
      return setMsg('Bitte jede Position mit Material, Querschnitt und Stückzahl ausfüllen.')
    }

    try {
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

    const { data, error } = await supabase
      .from('material_orders')
      .insert({
        ...form,
        supplier_id: form.supplier_id || null,
        material: firstItem.material,
        cross_section: firstItem.cross_section,
        length_mm: firstItem.length_mm,
        quantity: totalQuantity,
        desired_delivery_date: form.desired_delivery_date || null,
        created_by: userData.user?.id || null
      })
      .select('id')
      .single()

    if (error) return setMsg(error.message)

    const { error: itemError } = await supabase.from('order_items').insert(
      cleanItems.map((item, index) => ({
        material_order_id: data.id,
        material: item.material,
        cross_section: item.cross_section,
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

      <h1>Neue Materialbestellung</h1>

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
          <label>Lieferant</label>
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
            <option value="">Bitte wählen</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <h2>Positionen</h2>
            <div className="actions">
              <button type="button" className="button-customer" onClick={() => {
                setCustomerForm(prev => ({ ...prev, name: form.customer }))
                setShowCustomerModal(true)
              }}>+ Kunde</button>
              <button type="button" className="button-material" onClick={() => setShowMaterialModal(true)}>+ Material</button>
              <button type="button" className="button-cross-section" onClick={() => setShowCrossModal(true)}>+ Querschnitt</button>
              <button type="button" className="primary" onClick={addItem}>+ Position</button>
            </div>
          </div>

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

        <div>
          <label>Gewünschter Liefertermin</label>
          <input type="date" value={form.desired_delivery_date} onChange={e => set('desired_delivery_date', e.target.value)} />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label>Bemerkung</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <button>Speichern</button>
        {msg && <p className="error">{msg}</p>}
      </form>

      {showMaterialModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Material anlegen</h2>

            <label>Material</label>
            <input
              value={materialForm.material_name}
              onChange={e => setMaterialForm({ material_name: e.target.value })}
              placeholder="z.B. Edelstahl, Baustahl, Alu"
            />

            <div className="actions">
              <button type="button" onClick={saveMaterial}>Speichern</button>
              <button type="button" className="secondary" onClick={() => setShowMaterialModal(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {showCrossModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Querschnitt anlegen</h2>
            <label>Querschnitt</label>
            <input value={crossForm.name} onChange={e => setCrossForm({ name: e.target.value })} placeholder="z.B. 70x70x4" />
            <div className="actions">
              <button type="button" onClick={saveCrossSection}>Speichern</button>
              <button type="button" className="secondary" onClick={() => setShowCrossModal(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Kunde anlegen</h2>
            <label>Kundenname</label>
            <input value={customerForm.name} onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })} />
            <label>Ansprechpartner</label>
            <input value={customerForm.contact_person} onChange={e => setCustomerForm({ ...customerForm, contact_person: e.target.value })} />
            <label>E-Mail</label>
            <input value={customerForm.email} onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })} />
            <label>Telefon</label>
            <input value={customerForm.phone} onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })} />
            <label>Bemerkung</label>
            <textarea value={customerForm.notes} onChange={e => setCustomerForm({ ...customerForm, notes: e.target.value })} />
            <div className="actions">
              <button type="button" onClick={saveCustomer}>Speichern</button>
              <button type="button" className="secondary" onClick={() => setShowCustomerModal(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
