'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OrderItem, emptyOrderItem, formatCrossSectionMm, mergeOrderItems, orderItemsTotal, primaryOrderItem } from '@/lib/orderItems'
import { ensureCurrentUserProfile } from '@/lib/profiles'
import { normalizeOrderArea, ordersHref, type OrderArea } from '@/lib/orderAreas'
import { packagingDefaultKey, packagingDefaultRows, packagingDefaultsMap, type PackagingDefault } from '@/lib/packagingDefaults'

type Supplier = { id: string; name: string }
type Customer = { id: string; name: string }
type Material = { id: string; name: string; material_name: string | null; material_number: string | null }
type CrossSection = { id: string; name: string }
type WorkPreparation = { id: string; name: string }
type SheetFormat = { id: string; name: string; width_mm: number; height_mm: number }
type MaterialThickness = { id: string; material: string; thickness_mm: number }

function isUllnerSupplier(supplier: Supplier) {
  return supplier.name.trim().toLocaleLowerCase('de-DE').includes('ullner')
}

function formatLabel(format: SheetFormat) {
  return `${format.name} ${format.width_mm}x${format.height_mm} mm`
}

function customFormatValue(value: string) {
  return value.replace(/^(?:Eigenes Format|Sonderformat):\s*/i, '')
}

export default function NewOrderPage() {
  const router = useRouter()
  const [orderArea, setOrderArea] = useState<OrderArea>('rohrlaser')

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [crossSections, setCrossSections] = useState<CrossSection[]>([])
  const [workPreparations, setWorkPreparations] = useState<WorkPreparation[]>([])
  const [packagingDefaults, setPackagingDefaults] = useState<Record<string, number>>({})
  const [materialThicknesses, setMaterialThicknesses] = useState<MaterialThickness[]>([])

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
    const area = normalizeOrderArea(new URLSearchParams(window.location.search).get('bereich'))
    setOrderArea(area)
    loadMasterData(area)
  }, [])

  async function loadMasterData(area: OrderArea) {
    const supabase = createClient()

    const [{ data: supplierData }, { data: customerData }, { data: materialData }, { data: crossSectionData }, { data: workPreparationData }, { data: packagingData }, { data: thicknessData }] =
      await Promise.all([
        supabase.from('suppliers').select('id,name').order('name'),
        supabase.from('customers').select('id,name').eq('order_area', area).order('name'),
        supabase.from('materials').select('id,name,material_name,material_number').eq('order_area', area).order('name'),
        area === '2d-laser'
          ? supabase.from('formats').select('id,name,width_mm,height_mm').order('width_mm', { ascending: false })
          : supabase.from('cross_sections').select('id,name').eq('order_area', area).order('name'),
        supabase.from('work_preparations').select('id,name').eq('order_area', area).order('name'),
        area === '2d-laser'
          ? supabase.from('packaging_defaults').select('lookup_key,material,cross_section,pieces_per_package').eq('order_area', area)
          : Promise.resolve({ data: [] as PackagingDefault[] }),
        area === '2d-laser'
          ? supabase.from('material_thicknesses').select('id,material,thickness_mm').eq('order_area', area).order('thickness_mm')
          : Promise.resolve({ data: [] as MaterialThickness[] })
      ])

    const supplierList = [...(supplierData || [])].sort((a, b) => {
      const preferredOrder = Number(isUllnerSupplier(b)) - Number(isUllnerSupplier(a))
      return preferredOrder || a.name.localeCompare(b.name, 'de')
    })
    const materialList = materialData || []
    const crossSectionList: CrossSection[] = area === '2d-laser'
      ? ((crossSectionData as SheetFormat[] | null) || []).map(format => ({ id: format.id, name: formatLabel(format) }))
      : (crossSectionData || []) as CrossSection[]

    setSuppliers(supplierList)
    setCustomers(customerData || [])
    setMaterials(materialList)
    setCrossSections(crossSectionList)
    setWorkPreparations(workPreparationData || [])
    const loadedPackagingDefaults = packagingDefaultsMap(packagingData as PackagingDefault[] | null)
    setPackagingDefaults(loadedPackagingDefaults)
    setMaterialThicknesses((thicknessData as MaterialThickness[] | null) || [])

    const { data: tafelNumber } = area === '2d-laser'
      ? await supabase.rpc('peek_next_tafel_order_number')
      : { data: null }

    const lastSupplier = localStorage.getItem(`${area}_last_supplier_id`)
    const lastMaterial = localStorage.getItem(`${area}_last_material`)
    const lastCrossSection = localStorage.getItem(`${area}_last_cross_section`)
    const preferredUllnerSupplier = supplierList.find(isUllnerSupplier)

    setForm(prev => ({
      ...prev,
      order_number: area === '2d-laser' && tafelNumber ? tafelNumber : prev.order_number,
      customer: area === '2d-laser' ? '2D-Laser' : prev.customer,
      customer_delivery_date: area === '2d-laser' ? '' : prev.customer_delivery_date,
      supplier_id: preferredUllnerSupplier?.id || (
        lastSupplier && supplierList.some(s => s.id === lastSupplier)
          ? lastSupplier
          : prev.supplier_id || supplierList[0]?.id || ''
      )
    }))

    setItems(prev => {
      const material = lastMaterial && materialList.some(m => m.name === lastMaterial) ? lastMaterial : materialList[0]?.name || prev[0]?.material || ''
      const crossSection = lastCrossSection && crossSectionList.some(q => q.name === lastCrossSection) ? lastCrossSection : crossSectionList[0]?.name || prev[0]?.cross_section || ''

      return prev.map((item, index) => index === 0 ? {
        ...item,
        material: item.material || material,
        cross_section: item.cross_section || crossSection,
        order_unit: area === '2d-laser' ? (item.order_unit || 'paket') : 'stück',
        pieces_per_package: area === '2d-laser'
          ? loadedPackagingDefaults[packagingDefaultKey(area, item.material || material, item.cross_section || crossSection)] || null
          : null,
        length_mm: area === '2d-laser' ? null : item.length_mm
      } : item)
    })
  }

  const customerSuggestions = useMemo(() => {
    const q = form.customer.trim().toLowerCase()
    if (q.length < 1) return []
    return customers
      .filter(c => {
        const customerName = c.name.trim().toLowerCase()
        return customerName.includes(q) && customerName !== q
      })
      .slice(0, 8)
  }, [customers, form.customer])

  function set(k: string, v: string) {
    if (k === 'order_number') {
      if (orderArea === '2d-laser') return
      const rawSuffix = v.replace(/^AB-?/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      let suffix = ''

      if (/^\d/.test(rawSuffix)) {
        suffix = rawSuffix.replace(/\D/g, '')
      } else if ('LAGER'.startsWith(rawSuffix)) {
        suffix = rawSuffix
      } else if (rawSuffix.startsWith('LAGER')) {
        suffix = 'LAGER'
      } else {
        return
      }

      setForm(prev => ({ ...prev, order_number: 'AB-' + suffix }))
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

  function thicknessOptions(material: string) {
    const normalizedMaterial = material.trim().toLocaleLowerCase('de-DE')
    return materialThicknesses.filter(item => item.material.trim().toLocaleLowerCase('de-DE') === normalizedMaterial)
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
          material_number: null,
          order_area: orderArea
        }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

    if (orderArea === 'rohrlaser' && newCrossSections.length > 0) {
      const { error } = await supabase.from('cross_sections').insert(
        newCrossSections.map(name => ({ name, order_area: orderArea }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

    if (orderArea === 'rohrlaser' && newWorkPreparations.length > 0) {
      const { error } = await supabase.from('work_preparations').insert(
        newWorkPreparations.map(name => ({ name, order_area: orderArea }))
      )

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

    if (orderArea === '2d-laser') {
      const thicknessRows = cleanItems
        .filter(item => item.material && item.material_thickness_mm)
        .map(item => ({
          order_area: orderArea,
          material: item.material,
          thickness_mm: item.material_thickness_mm
        }))

      if (thicknessRows.length > 0) {
        const { error } = await supabase.from('material_thicknesses').upsert(thicknessRows, {
          onConflict: 'order_area,material,thickness_mm',
          ignoreDuplicates: true
        })

        if (error) throw new Error(error.message)
      }
    }
  }

  async function ensureCustomerMasterData(customerName: string) {
    if (orderArea === '2d-laser') return

    const name = customerName.trim()
    if (!name) return

    const knownCustomers = new Set(
      customers.map(customer => customer.name.trim().toLowerCase()).filter(Boolean)
    )

    if (knownCustomers.has(name.toLowerCase())) return

    const supabase = createClient()
    const { error } = await supabase.from('customers').insert({ name, order_area: orderArea })

    if (error && !error.message.includes('duplicate')) {
      throw new Error(error.message)
    }
  }

  function setItem(index: number, key: 'material' | 'material_thickness_mm' | 'cross_section' | 'av_1' | 'av_2' | 'av_3' | 'av_4' | 'length_mm' | 'quantity' | 'order_unit' | 'pieces_per_package', value: string) {
    setItems(prev => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item

      if (key === 'length_mm') {
        return { ...item, length_mm: value ? Number(value) : null }
      }

      if (key === 'quantity') {
        return { ...item, quantity: Number(value || 0) }
      }

      if (key === 'pieces_per_package') {
        return { ...item, pieces_per_package: value ? Number(value) : null }
      }

      if (key === 'order_unit') {
        const orderUnit = value === 'paket' ? 'paket' : value === 'kg' ? 'kg' : 'stück'
        return {
          ...item,
          order_unit: orderUnit,
          pieces_per_package: orderUnit === 'paket'
            ? packagingDefaults[packagingDefaultKey(orderArea, item.material, item.cross_section)] || null
            : null
        }
      }

      const nextItem = { ...item, [key]: value }

      if (orderArea === '2d-laser' && (key === 'material' || key === 'cross_section') && nextItem.order_unit === 'paket') {
        nextItem.pieces_per_package = packagingDefaults[
          packagingDefaultKey(orderArea, nextItem.material, nextItem.cross_section)
        ] || null
      }

      return nextItem
    }))
  }

  function addItem() {
    const last = items[items.length - 1] || emptyOrderItem()

    setItems(prev => [
      ...prev,
      {
        ...emptyOrderItem(),
        material: last.material,
        material_thickness_mm: last.material_thickness_mm,
        cross_section: last.cross_section,
        av_1: last.av_1,
        av_2: last.av_2,
        av_3: last.av_3,
        av_4: last.av_4,
        length_mm: last.length_mm,
        order_unit: last.order_unit,
        pieces_per_package: last.pieces_per_package
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
    const customerName = orderArea === '2d-laser' ? '2D-Laser' : form.customer.trim()

    if (orderArea === 'rohrlaser' && !orderNumberSuffix) {
      return setMsg('Bitte eine AB-Nummer eintragen.')
    }

    if (orderArea === 'rohrlaser' && !/^(?:\d+|LAGER)$/.test(orderNumberSuffix)) {
      return setMsg('Die Auftragsnummer darf nach AB- nur Zahlen oder das Wort LAGER enthalten.')
    }

    if (orderArea === 'rohrlaser' && !customerName) {
      return setMsg('Bitte Kundennamen eintragen.')
    }

    const cleanItems = mergeOrderItems(items.map(item => ({
      material: item.material.trim(),
      material_thickness_mm: item.material_thickness_mm ? Number(item.material_thickness_mm) : null,
      cross_section: item.cross_section.trim(),
      av_1: (item.av_1 || '').trim(),
      av_2: (item.av_2 || '').trim(),
      av_3: (item.av_3 || '').trim(),
      av_4: (item.av_4 || '').trim(),
      length_mm: item.length_mm ? Number(item.length_mm) : null,
      quantity: Number(item.quantity),
      order_unit: orderArea === '2d-laser'
        ? (item.order_unit === 'paket' ? 'paket' : item.order_unit === 'kg' ? 'kg' : 'stück')
        : 'stück',
      pieces_per_package: orderArea === '2d-laser' && item.order_unit === 'paket'
        ? Number(item.pieces_per_package || 0)
        : null
    })))

    if (cleanItems.some(item => !item.material || !item.cross_section || !item.quantity || item.quantity < 1)) {
      return setMsg(orderArea === '2d-laser'
        ? 'Bitte jede Position mit Material, Format und Menge ausfüllen.'
        : 'Bitte jede Position mit Material, Querschnitt und Stückzahl ausfüllen.')
    }

    if (orderArea === '2d-laser' && cleanItems.some(item => !item.material_thickness_mm || item.material_thickness_mm <= 0)) {
      return setMsg('Bitte bei jeder Position eine Materialstärke eingeben.')
    }

    if (orderArea === '2d-laser' && cleanItems.some(item => item.order_unit === 'paket' && !item.pieces_per_package)) {
      return setMsg('Bitte bei jeder Paket-Position die Stückzahl pro Paket angeben.')
    }

    try {
      await ensureCustomerMasterData(customerName)
      await ensureMasterData(cleanItems)
    } catch (error: any) {
      return setMsg(error.message || 'Stammdaten konnten nicht gespeichert werden.')
    }

    const firstItem = primaryOrderItem(cleanItems)
    const totalQuantity = orderItemsTotal(cleanItems)

    if (form.supplier_id) localStorage.setItem(`${orderArea}_last_supplier_id`, form.supplier_id)
    if (firstItem.material) localStorage.setItem(`${orderArea}_last_material`, firstItem.material)
    if (firstItem.cross_section) localStorage.setItem(`${orderArea}_last_cross_section`, firstItem.cross_section)

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await ensureCurrentUserProfile(supabase, userData.user)

    let orderNumber = form.order_number

    if (orderArea === '2d-laser') {
      const { data: nextNumber, error: numberError } = await supabase.rpc('next_tafel_order_number')

      if (numberError || !nextNumber) {
        return setMsg(numberError?.message || 'Die nächste TAFEL-Auftragsnummer konnte nicht ermittelt werden.')
      }

      orderNumber = nextNumber
      setForm(prev => ({ ...prev, order_number: nextNumber }))
    }

    const orderRow = {
      ...form,
      customer: customerName,
      order_number: orderNumber,
      supplier_id: form.supplier_id || null,
      material: firstItem.material,
      cross_section: firstItem.cross_section,
      length_mm: firstItem.length_mm,
      quantity: totalQuantity,
      status: 'offen',
      order_area: orderArea,
      customer_delivery_date: orderArea === '2d-laser' ? null : form.customer_delivery_date || null,
      desired_delivery_date: form.desired_delivery_date || null,
      created_by: userData.user?.id || null
    }

    let insertResult = await supabase
      .from('material_orders')
      .insert(orderRow)
      .select('id')
      .single()

    if (orderArea === '2d-laser' && insertResult.error?.message.toLowerCase().includes('duplicate')) {
      const { data: retryNumber, error: retryNumberError } = await supabase.rpc('next_tafel_order_number')

      if (retryNumberError || !retryNumber) {
        return setMsg(retryNumberError?.message || 'Die nächste TAFEL-Auftragsnummer konnte nicht ermittelt werden.')
      }

      orderNumber = retryNumber
      setForm(prev => ({ ...prev, order_number: retryNumber }))
      insertResult = await supabase
        .from('material_orders')
        .insert({ ...orderRow, order_number: retryNumber })
        .select('id')
        .single()
    }

    const { data, error } = insertResult

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
        material_thickness_mm: item.material_thickness_mm,
        cross_section: item.cross_section,
        av_1: item.av_1 || null,
        av_2: item.av_2 || null,
        av_3: item.av_3 || null,
        av_4: item.av_4 || null,
        length_mm: item.length_mm,
        quantity: item.quantity,
        order_unit: orderArea === '2d-laser' ? (item.order_unit || 'paket') : 'stück',
        pieces_per_package: orderArea === '2d-laser' && item.order_unit === 'paket' ? item.pieces_per_package : null,
        position: index + 1
      }))
    )

    if (itemError) return setMsg(itemError.message)

    const defaultRows = packagingDefaultRows(orderArea, cleanItems)
    if (defaultRows.length > 0) {
      await supabase.from('packaging_defaults').upsert(defaultRows)
    }

    router.push(`/orders/${data.id}`)
  }

  return (
    <main className="container">
      <button type="button" className="secondary" onClick={() => router.push(ordersHref(orderArea))}>
        Zurück
      </button>

      <div className="order-page-heading">
        <div>
          <h1>Neue Materialbestellung</h1>
        </div>
      </div>

      <form className="card grid" onSubmit={save}>
        <div>
          <label>Auftragsnummer</label>
          <input
            value={form.order_number}
            onChange={e => set('order_number', e.target.value)}
            readOnly={orderArea === '2d-laser'}
            pattern={orderArea === 'rohrlaser' ? 'AB-(?:[0-9]+|LAGER)' : undefined}
            title={orderArea === 'rohrlaser' ? 'Nach AB- sind nur Zahlen oder das Wort LAGER erlaubt.' : undefined}
            required
          />
        </div>

        {orderArea === 'rohrlaser' && (
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
        )}

        {orderArea === 'rohrlaser' && (
          <div>
            <label>K-Liefertermin</label>
            <input type="date" value={form.customer_delivery_date} onChange={e => set('customer_delivery_date', e.target.value)} />
          </div>
        )}

        <div>
          <label>Lieferant</label>
          <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
            <option value="">Bitte wählen</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label>L-Liefertermin</label>
          <input type="date" value={form.desired_delivery_date} onChange={e => set('desired_delivery_date', e.target.value)} />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <div className="actions" style={{ justifyContent: 'space-between' }}>
            <h2>Positionen</h2>
            <div className="actions">
              <button type="button" className="primary" onClick={addItem}>+ Position</button>
            </div>
          </div>

          {orderArea === 'rohrlaser' && (
            <datalist id="work-preparation-options">
              {workPreparations.map(av => (
                <option key={av.id} value={av.name} />
              ))}
            </datalist>
          )}

          <div className="order-items">
            {items.map((item, index) => (
              <div className="order-item" key={index}>
                <div className={`order-item-row${orderArea === '2d-laser' ? ' two-d-order-item-row' : ''}`}>
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

                  {orderArea === '2d-laser' && (
                    <div>
                      <label>Materialstärke (mm)</label>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        list={`material-thickness-options-${index}`}
                        value={item.material_thickness_mm || ''}
                        onChange={e => setItem(index, 'material_thickness_mm', e.target.value)}
                        placeholder="z.B. 1,5"
                        required
                      />
                      <datalist id={`material-thickness-options-${index}`}>
                        {thicknessOptions(item.material).map(thickness => (
                          <option key={thickness.id} value={thickness.thickness_mm} />
                        ))}
                      </datalist>
                    </div>
                  )}

                  <div className={orderArea === '2d-laser' ? 'order-item-format' : undefined}>
                    <label>{orderArea === '2d-laser' ? 'Format' : 'Rohrquerschnitt'}</label>
                    {orderArea === '2d-laser' ? (
                      <div className="format-entry-row">
                        <select
                          value={crossSections.some(format => format.name === item.cross_section) ? item.cross_section : '__custom__'}
                          onChange={e => setItem(index, 'cross_section', e.target.value === '__custom__' ? 'Sonderformat: ' : e.target.value)}
                        >
                          {crossSections.map(format => (
                            <option key={format.id} value={format.name}>{formatCrossSectionMm(format.name)}</option>
                          ))}
                          <option value="__custom__">Sonderformat</option>
                        </select>
                        <input
                          value={crossSections.some(format => format.name === item.cross_section) ? '' : customFormatValue(item.cross_section)}
                          onChange={e => setItem(index, 'cross_section', `Sonderformat: ${e.target.value}`)}
                          placeholder="Sondermaß, z.B. 2800x1400 mm"
                          disabled={crossSections.some(format => format.name === item.cross_section)}
                          required={!crossSections.some(format => format.name === item.cross_section)}
                        />
                      </div>
                    ) : (
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
                                {formatCrossSectionMm(q.name)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {orderArea === 'rohrlaser' && (
                    <div>
                      <label>Länge mm</label>
                      <input
                        type="number"
                        value={item.length_mm || ''}
                        onChange={e => setItem(index, 'length_mm', e.target.value)}
                      />
                    </div>
                  )}

                  {orderArea === 'rohrlaser' && (
                    <div>
                      <label>Stückzahl</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity || ''}
                        onChange={e => setItem(index, 'quantity', e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {orderArea === 'rohrlaser' && (['av_1', 'av_2', 'av_3', 'av_4'] as const).map((key, avIndex) => (
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

                  {orderArea === '2d-laser' && (
                    <div>
                      <label>Einheit</label>
                      <select value={item.order_unit || 'paket'} onChange={e => setItem(index, 'order_unit', e.target.value)}>
                        <option value="paket">Paket</option>
                        <option value="stück">Stück</option>
                        <option value="kg">kg</option>
                      </select>
                    </div>
                  )}

                  {orderArea === '2d-laser' && (
                    <div>
                      <label>Menge</label>
                      <input
                        type="number"
                        min="1"
                        step={item.order_unit === 'kg' ? '0.01' : '1'}
                        value={item.quantity || ''}
                        onChange={e => setItem(index, 'quantity', e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {orderArea === '2d-laser' && (
                    <div>
                      <label>Stück pro Paket</label>
                      <input
                        type="number"
                        min="1"
                        value={item.pieces_per_package || ''}
                        onChange={e => setItem(index, 'pieces_per_package', e.target.value)}
                        disabled={item.order_unit !== 'paket'}
                        required={item.order_unit === 'paket'}
                      />
                    </div>
                  )}

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

          <p className="small">Gesamtmenge: {orderItemsTotal(items)}</p>
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
