'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Supplier = {
  id: string
  name: string
}

type MasterData = {
  id: string
  name: string
}

export default function NewOrderPage() {
  const router = useRouter()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<MasterData[]>([])
  const [crossSections, setCrossSections] = useState<MasterData[]>([])

  const [newMaterial, setNewMaterial] = useState('')
  const [newCrossSection, setNewCrossSection] = useState('')

  const [form, setForm] = useState({
    order_number: 'AB-',
    customer: '',
    supplier_id: '',
    material: 'S235',
    cross_section: '',
    length_mm: '6000',
    quantity: '1',
    desired_delivery_date: '',
    notes: ''
  })

  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadMasterData()
  }, [])

  async function loadMasterData() {
    const supabase = createClient()

    const [{ data: supplierData }, { data: materialData }, { data: crossSectionData }] =
      await Promise.all([
        supabase.from('suppliers').select('id,name').order('name'),
        supabase.from('materials').select('id,name').order('name'),
        supabase.from('cross_sections').select('id,name').order('name')
      ])

    const supplierList = supplierData || []
    const materialList = materialData || []
    const crossSectionList = crossSectionData || []

    setSuppliers(supplierList)
    setMaterials(materialList)
    setCrossSections(crossSectionList)

    const lastSupplier = localStorage.getItem('last_supplier_id')
    const lastMaterial = localStorage.getItem('last_material')
    const lastCrossSection = localStorage.getItem('last_cross_section')

    setForm(prev => ({
      ...prev,
      supplier_id:
        lastSupplier && supplierList.some(s => s.id === lastSupplier)
          ? lastSupplier
          : prev.supplier_id,
      material:
        lastMaterial && materialList.some(m => m.name === lastMaterial)
          ? lastMaterial
          : materialList.some(m => m.name === prev.material)
            ? prev.material
            : materialList[0]?.name || prev.material,
      cross_section:
        lastCrossSection && crossSectionList.some(q => q.name === lastCrossSection)
          ? lastCrossSection
          : crossSectionList[0]?.name || prev.cross_section
    }))
  }

  function set(k: string, v: string) {
    if (k === 'order_number') {
      const rest = v.startsWith('AB-') ? v.slice(3) : v.replace(/^AB-?/, '')
      setForm(prev => ({ ...prev, order_number: 'AB-' + rest }))
      return
    }

    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function addMaterial() {
    const name = newMaterial.trim()
    if (!name) return

    const supabase = createClient()

    const { error } = await supabase
      .from('materials')
      .insert({ name })

    if (error && !error.message.includes('duplicate')) {
      setMsg(error.message)
      return
    }

    setNewMaterial('')
    setMsg('')
    await loadMasterData()
    setForm(prev => ({ ...prev, material: name }))
  }

  async function addCrossSection() {
    const name = newCrossSection.trim()
    if (!name) return

    const supabase = createClient()

    const { error } = await supabase
      .from('cross_sections')
      .insert({ name })

    if (error && !error.message.includes('duplicate')) {
      setMsg(error.message)
      return
    }

    setNewCrossSection('')
    setMsg('')
    await loadMasterData()
    setForm(prev => ({ ...prev, cross_section: name }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')

    if (form.supplier_id) localStorage.setItem('last_supplier_id', form.supplier_id)
    if (form.material) localStorage.setItem('last_material', form.material)
    if (form.cross_section) localStorage.setItem('last_cross_section', form.cross_section)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('material_orders')
      .insert({
        ...form,
        supplier_id: form.supplier_id || null,
        length_mm: form.length_mm ? Number(form.length_mm) : null,
        quantity: Number(form.quantity),
        desired_delivery_date: form.desired_delivery_date || null,
        created_by: userData.user?.id || null
      })
      .select('id')
      .single()

    if (error) return setMsg(error.message)

    router.push(`/orders/${data.id}`)
  }

  return (
    <main className="container">
      <h1>Neue Materialbestellung</h1>

      <form className="card grid" onSubmit={save}>
        <div>
          <label>Auftragsnummer</label>
          <input
            value={form.order_number}
            onChange={e => set('order_number', e.target.value)}
            required
          />
        </div>

        <div>
          <label>Kunde</label>
          <input
            value={form.customer}
            onChange={e => set('customer', e.target.value)}
            required
          />
        </div>

        <div>
          <label>Lieferant</label>
          <select
            value={form.supplier_id}
            onChange={e => set('supplier_id', e.target.value)}
          >
            <option value="">Bitte wählen</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Material</label>
          <select
            value={form.material}
            onChange={e => set('material', e.target.value)}
            required
          >
            {materials.map(m => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Neues Material hinzufügen</label>
          <div className="actions">
            <input
              value={newMaterial}
              onChange={e => setNewMaterial(e.target.value)}
              placeholder="z.B. Corten, 1.4571, Hardox"
            />
            <button type="button" onClick={addMaterial}>
              + Material
            </button>
          </div>
        </div>

        <div>
          <label>Rohrquerschnitt</label>
          <select
            value={form.cross_section}
            onChange={e => set('cross_section', e.target.value)}
            required
          >
            {crossSections.map(q => (
              <option key={q.id} value={q.name}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Neuen Querschnitt hinzufügen</label>
          <div className="actions">
            <input
              value={newCrossSection}
              onChange={e => setNewCrossSection(e.target.value)}
              placeholder="z.B. 70x70x4"
            />
            <button type="button" onClick={addCrossSection}>
              + Querschnitt
            </button>
          </div>
        </div>

        <div>
          <label>Länge mm</label>
          <input
            type="number"
            value={form.length_mm}
            onChange={e => set('length_mm', e.target.value)}
          />
        </div>

        <div>
          <label>Stückzahl</label>
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={e => set('quantity', e.target.value)}
            required
          />
        </div>

        <div>
          <label>Gewünschter Liefertermin</label>
          <input
            type="date"
            value={form.desired_delivery_date}
            onChange={e => set('desired_delivery_date', e.target.value)}
          />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label>Bemerkung</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        <button>Speichern</button>

        {msg && <p className="error">{msg}</p>}
      </form>
    </main>
  )
}
