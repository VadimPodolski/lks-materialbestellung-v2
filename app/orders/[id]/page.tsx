'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'
import {
  OrderItem,
  emptyOrderItem,
  formatMaterialThickness,
  mergeOrderItems,
  normalizeOrderItems,
  orderItemAvText,
  orderItemsMailText,
  orderItemsSelect,
  orderItemsTotal,
  primaryOrderItem
} from '@/lib/orderItems'
import { ensureCurrentUserProfile } from '@/lib/profiles'
import { normalizeOrderArea, ordersHref, type OrderArea } from '@/lib/orderAreas'
import { canDeleteOrder } from '@/lib/orderDeletion'
import { deleteMaterialOrder } from '@/lib/materialOrderDeletion'
import { packagingDefaultKey, packagingDefaultRows, packagingDefaultsMap, type PackagingDefault } from '@/lib/packagingDefaults'

type Order = {
  id: string
  order_area: OrderArea
  order_number: string
  customer: string
  customer_delivery_date: string | null
  material: string
  cross_section: string
  av_1: string | null
  av_2: string | null
  av_3: string | null
  av_4: string | null
  length_mm: number | null
  quantity: number
  status: string
  desired_delivery_date: string | null
  notes: string | null
  supplier_id: string | null
  suppliers: { name: string; contact_person: string | null; email: string } | null
  order_items?: OrderItem[] | null
  ordered_at: string | null
  created_at: string
  supplier_order_pdf_name: string | null
  supplier_order_pdf_url: string | null
  supplier_order_pdf_path: string | null
}

type OrderPdf = {
  id: string
  file_name: string
  file_url: string
  file_path: string
  created_at: string
}

type Receipt = {
  id: string
  order_item_id: string | null
  material: string | null
  cross_section: string | null
  length_mm: number | null
  received_quantity: number
  delivery_note_number: string | null
  notes: string | null
  received_at: string
}

type Scrap = {
  id: string
  order_item_id: string | null
  material: string | null
  cross_section: string | null
  length_mm: number | null
  quantity: number
  reason: string | null
  reordered: boolean | null
  created_at: string
}

type Supplier = { id: string; name: string; email: string }
type MasterData = { id: string; name: string; order_area: OrderArea }
type SheetFormat = { id: string; name: string; width_mm: number; height_mm: number }
type MaterialThickness = { id: string; material: string; thickness_mm: number; order_area: string }
type ReceiptDraft = { quantity: string; deliveryNote: string; notes: string }
type ScrapDraft = { quantity: string; reason: string }

function formatLabel(format: SheetFormat) {
  return `${format.name} ${format.width_mm}x${format.height_mm} mm`
}

function customFormatValue(value: string) {
  return value.replace(/^Eigenes Format:\s*/i, '')
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [orderPdfs, setOrderPdfs] = useState<OrderPdf[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [scraps, setScraps] = useState<Scrap[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [customers, setCustomers] = useState<MasterData[]>([])
  const [materials, setMaterials] = useState<MasterData[]>([])
  const [crossSections, setCrossSections] = useState<MasterData[]>([])
  const [workPreparations, setWorkPreparations] = useState<MasterData[]>([])
  const [packagingDefaults, setPackagingDefaults] = useState<Record<string, number>>({})
  const [materialThicknesses, setMaterialThicknesses] = useState<MaterialThickness[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    customer: '',
    supplier_id: '',
    customer_delivery_date: '',
    desired_delivery_date: '',
    notes: ''
  })
  const [editItems, setEditItems] = useState<OrderItem[]>([emptyOrderItem()])
  const [activeCustomerSuggestions, setActiveCustomerSuggestions] = useState(false)
  const [activeEditMaterialIndex, setActiveEditMaterialIndex] = useState<number | null>(null)
  const [activeEditCrossIndex, setActiveEditCrossIndex] = useState<number | null>(null)

  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, ReceiptDraft>>({})
  const [scrapDrafts, setScrapDrafts] = useState<Record<string, ScrapDraft>>({})
  const [selectedScrapIds, setSelectedScrapIds] = useState<string[]>([])

  const [editingReceiptId, setEditingReceiptId] = useState('')
  const [editReceiptQty, setEditReceiptQty] = useState('')
  const [editReceiptNote, setEditReceiptNote] = useState('')
  const [editReceiptComment, setEditReceiptComment] = useState('')

  const [isPdfDragging, setIsPdfDragging] = useState(false)
  const [isPdfUploading, setIsPdfUploading] = useState(false)
  const [showDetailStatusMenu, setShowDetailStatusMenu] = useState(false)
  const [msg, setMsg] = useState('')
  const [deleteCheckTime, setDeleteCheckTime] = useState(() => Date.now())

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setDeleteCheckTime(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  async function load() {
    const supabase = createClient()

    const [
      { data: orderData },
      { data: receiptData },
      { data: scrapData },
      { data: pdfData },
      { data: supplierData },
      { data: customerData },
      { data: materialData },
      { data: crossData },
      { data: workPreparationData },
      { data: formatData },
      { data: packagingData },
      { data: thicknessData }
    ] = await Promise.all([
      supabase
        .from('material_orders')
        .select(`*,suppliers(name,contact_person,email),order_items(${orderItemsSelect})`)
        .eq('id', params.id)
        .single(),

      supabase
        .from('goods_receipts')
        .select('*')
        .eq('material_order_id', params.id)
        .order('received_at', { ascending: false }),

      supabase
        .from('scrap_items')
        .select('*')
        .eq('material_order_id', params.id)
        .order('created_at', { ascending: false }),

      supabase
        .from('order_pdfs')
        .select('*')
        .eq('material_order_id', params.id)
        .order('created_at', { ascending: false }),

      supabase.from('suppliers').select('id,name,email').order('name'),
      supabase.from('customers').select('id,name,order_area').order('name'),
      supabase.from('materials').select('id,name,order_area').order('name'),
      supabase.from('cross_sections').select('id,name,order_area').order('name'),
      supabase.from('work_preparations').select('id,name,order_area').order('name'),
      supabase.from('formats').select('id,name,width_mm,height_mm').order('width_mm', { ascending: false }),
      supabase.from('packaging_defaults').select('lookup_key,material,cross_section,pieces_per_package,order_area'),
      supabase.from('material_thicknesses').select('id,material,thickness_mm,order_area').order('thickness_mm')
    ])

    const loadedOrder = orderData as any

    setOrder(loadedOrder)
    setOrderPdfs((pdfData as any) || [])
    setReceipts(receiptData || [])
    setScraps((scrapData as any) || [])
    const area = normalizeOrderArea(loadedOrder?.order_area)
    setSuppliers((supplierData as Supplier[]) || [])
    setCustomers(((customerData as MasterData[]) || []).filter(item => item.order_area === area))
    setMaterials(((materialData as MasterData[]) || []).filter(item => item.order_area === area))
    setCrossSections(area === '2d-laser'
      ? ((formatData as SheetFormat[]) || []).map(format => ({ id: format.id, name: formatLabel(format), order_area: area }))
      : ((crossData as MasterData[]) || []).filter(item => item.order_area === area))
    setWorkPreparations(((workPreparationData as MasterData[]) || []).filter(item => item.order_area === area))
    setPackagingDefaults(packagingDefaultsMap(
      ((packagingData as (PackagingDefault & { order_area: string })[]) || [])
        .filter(item => item.order_area === area)
    ))
    setMaterialThicknesses(
      ((thicknessData as MaterialThickness[]) || []).filter(item => item.order_area === area)
    )

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (user) {
      const profile = await ensureCurrentUserProfile(supabase, user)
      setIsAdmin(profile?.role === 'admin')
    } else {
      setIsAdmin(false)
    }

    if (loadedOrder) {
      const loadedItems = normalizeOrderItems(loadedOrder)

      setEditForm({
        customer: loadedOrder.customer || '',
        supplier_id: loadedOrder.supplier_id || supplierData?.[0]?.id || '',
        customer_delivery_date: loadedOrder.customer_delivery_date || '',
        desired_delivery_date: loadedOrder.desired_delivery_date || '',
        notes: loadedOrder.notes || ''
      })
      setEditItems(loadedItems)
    }
  }

  const receivedSum = useMemo(
    () => receipts.reduce((sum, r) => sum + r.received_quantity, 0),
    [receipts]
  )

  const scrapSum = useMemo(
    () => scraps.reduce((sum, s) => sum + Number(s.quantity || 0), 0),
    [scraps]
  )

  const orderItems = useMemo(
    () => normalizeOrderItems(order),
    [order]
  )

  const customerSuggestions = useMemo(() => {
    return masterDataOptions(customers, editForm.customer)
  }, [customers, editForm.customer])

  function setEdit(k: string, v: string) {
    setEditForm(prev => ({ ...prev, [k]: v }))
  }

  function masterDataOptions(list: MasterData[], value: string) {
    const q = value.trim().toLowerCase()
    const matches = q
      ? list.filter(item => item.name.toLowerCase().includes(q))
      : list

    return matches.slice(0, 8)
  }

  async function ensureEditMasterData(customerName: string, cleanItems: OrderItem[]) {
    const supabase = createClient()
    const orderArea = normalizeOrderArea(order?.order_area)
    const customer = customerName.trim()
    const knownCustomers = new Set(customers.map(item => item.name.trim().toLowerCase()).filter(Boolean))
    const knownMaterials = new Set(materials.map(item => item.name.trim().toLowerCase()).filter(Boolean))
    const knownCrossSections = new Set(crossSections.map(item => item.name.trim().toLowerCase()).filter(Boolean))
    const knownWorkPreparations = new Set(workPreparations.map(item => item.name.trim().toLowerCase()).filter(Boolean))

    if (orderArea === 'rohrlaser' && customer && !knownCustomers.has(customer.toLowerCase())) {
      const { error } = await supabase.from('customers').insert({ name: customer, order_area: orderArea })

      if (error && !error.message.includes('duplicate')) {
        throw new Error(error.message)
      }
    }

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
        .map(item => ({ order_area: orderArea, material: item.material, thickness_mm: item.material_thickness_mm }))

      if (thicknessRows.length > 0) {
        const { error } = await supabase.from('material_thicknesses').upsert(thicknessRows, {
          onConflict: 'order_area,material,thickness_mm',
          ignoreDuplicates: true
        })
        if (error) throw new Error(error.message)
      }
    }
  }

  function visibleStatus(currentOrder: Order) {
    if (currentOrder.status === 'bestellt' && !currentOrder.ordered_at) return 'offen'
    return currentOrder.status
  }

  function setEditItem(index: number, key: 'material' | 'material_thickness_mm' | 'cross_section' | 'av_1' | 'av_2' | 'av_3' | 'av_4' | 'length_mm' | 'quantity' | 'order_unit' | 'pieces_per_package', value: string) {
    setEditItems(prev => prev.map((item, itemIndex) => {
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

      if (key === 'material_thickness_mm') {
        return { ...item, material_thickness_mm: value ? Number(value) : null }
      }

      if (key === 'order_unit') {
        const orderUnit = value === 'paket' ? 'paket' : value === 'kg' ? 'kg' : 'stück'
        return {
          ...item,
          order_unit: orderUnit,
          pieces_per_package: orderUnit === 'paket'
            ? packagingDefaults[packagingDefaultKey(order?.order_area || '2d-laser', item.material, item.cross_section)] || null
            : null
        }
      }

      const nextItem = { ...item, [key]: value }

      if (order?.order_area === '2d-laser' && (key === 'material' || key === 'cross_section') && nextItem.order_unit === 'paket') {
        nextItem.pieces_per_package = packagingDefaults[
          packagingDefaultKey(order.order_area, nextItem.material, nextItem.cross_section)
        ] || null
      }

      return nextItem
    }))
  }

  function addEditItem() {
    const last = editItems[editItems.length - 1] || emptyOrderItem()

    setEditItems(prev => [
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

  function removeEditItem(index: number) {
    setEditItems(prev => prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function orderItemOptionValue(item: OrderItem, index: number) {
    return item.id || `index:${index}`
  }

  function receiptDraftFor(item: OrderItem, index: number) {
    return receiptDrafts[orderItemOptionValue(item, index)] || { quantity: '', deliveryNote: '', notes: '' }
  }

  function setReceiptDraft(item: OrderItem, index: number, key: keyof ReceiptDraft, value: string) {
    const draftKey = orderItemOptionValue(item, index)
    setReceiptDrafts(prev => ({
      ...prev,
      [draftKey]: {
        ...(prev[draftKey] || { quantity: '', deliveryNote: '', notes: '' }),
        [key]: value
      }
    }))
  }

  function receivedQtyForItem(item: OrderItem) {
    return receipts
      .filter(receipt => {
        if (receipt.order_item_id && item.id) return receipt.order_item_id === item.id

        return (
          receipt.material === item.material &&
          receipt.cross_section === item.cross_section &&
          Number(receipt.length_mm || 0) === Number(item.length_mm || 0)
        )
      })
      .reduce((sum, receipt) => sum + Number(receipt.received_quantity || 0), 0)
  }

  function scrapDraftFor(item: OrderItem, index: number) {
    return scrapDrafts[orderItemOptionValue(item, index)] || { quantity: '', reason: '' }
  }

  function setScrapDraft(item: OrderItem, index: number, key: keyof ScrapDraft, value: string) {
    const draftKey = orderItemOptionValue(item, index)
    setScrapDrafts(prev => ({
      ...prev,
      [draftKey]: {
        ...(prev[draftKey] || { quantity: '', reason: '' }),
        [key]: value
      }
    }))
  }

  function scrapQtyForItem(item: OrderItem) {
    return scraps
      .filter(scrap => {
        if (scrap.order_item_id && item.id) return scrap.order_item_id === item.id

        return (
          scrap.material === item.material &&
          scrap.cross_section === item.cross_section &&
          Number(scrap.length_mm || 0) === Number(item.length_mm || 0)
        )
      })
      .reduce((sum, scrap) => sum + Number(scrap.quantity || 0), 0)
  }

  function toggleScrapSelection(scrapId: string) {
    setSelectedScrapIds(prev =>
      prev.includes(scrapId)
        ? prev.filter(id => id !== scrapId)
        : [...prev, scrapId]
    )
  }

  function mailto() {
    if (!order || !order.suppliers?.email) return '#'

    const subject = `Materialbestellung LKS - Auftrag ${order.order_number}`
    const body = `Sehr geehrte Damen und Herren,

bitte liefern Sie uns folgendes Material:

Auftrag: ${order.order_number}
Kunde: ${order.customer}
Bemerkung: ${order.notes || '-'}

${orderItemsMailText(orderItems)}

Gewünschter Liefertermin: ${order.desired_delivery_date || '-'}

Mit freundlichen Grüßen
LKS-Technik GmbH & Co. KG`

    return `mailto:${order.suppliers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  async function currentUserDisplayName() {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (!user) return ''

    const { data: profileById } = await supabase
      .from('profiles')
      .select('full_name,email')
      .eq('id', user.id)
      .maybeSingle()

    if (profileById?.full_name || profileById?.email) {
      return profileById.full_name || profileById.email || ''
    }

    const { data: profileByEmail } = await supabase
      .from('profiles')
      .select('full_name,email')
      .eq('email', user.email)
      .maybeSingle()

    return profileByEmail?.full_name || profileByEmail?.email || user.email || ''
  }

  async function sendOrderEmail() {
    if (!order || !order.suppliers?.email) {
      setMsg('Keine Lieferanten-E-Mail vorhanden.')
      return
    }

    setMsg('Bestellung wird per E-Mail versendet...')
    const orderedBy = await currentUserDisplayName()

    const res = await fetch('/api/send-order-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierEmail: order.suppliers.email,
        orderNumber: order.order_number,
        customer: order.customer,
        items: orderItems,
        desiredDeliveryDate: order.desired_delivery_date,
        supplierName: order.suppliers.name,
        orderedBy,
        notes: order.notes
      })
    })

    const data = await res.json()

    if (!res.ok) {
      setMsg(data.error || 'E-Mail konnte nicht gesendet werden.')
      return
    }

    await markOrdered()
    setMsg(`Bestellung wurde an ${order.suppliers.email} versendet.`)
  }

  async function recalculateStatus(orderId: string, quantity: number) {
    const supabase = createClient()

    const { data } = await supabase
      .from('goods_receipts')
      .select('received_quantity')
      .eq('material_order_id', orderId)

    const sum = (data || []).reduce(
      (s, r) => s + Number(r.received_quantity || 0),
      0
    )

    let newStatus = 'bestellt'

    if (sum === 0) newStatus = 'bestellt'
    else if (sum < quantity) newStatus = 'teilweise_geliefert'
    else newStatus = 'geliefert'

    await supabase
      .from('material_orders')
      .update({ status: newStatus })
      .eq('id', orderId)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return

    const supabase = createClient()
    const twoDLaser = normalizeOrderArea(order.order_area) === '2d-laser'
    const customerName = twoDLaser ? '2D-Laser' : editForm.customer.trim()
    const cleanItems = mergeOrderItems(editItems.map(item => ({
      material: item.material.trim(),
      material_thickness_mm: item.material_thickness_mm ? Number(item.material_thickness_mm) : null,
      cross_section: item.cross_section.trim(),
      av_1: (item.av_1 || '').trim(),
      av_2: (item.av_2 || '').trim(),
      av_3: (item.av_3 || '').trim(),
      av_4: (item.av_4 || '').trim(),
      length_mm: item.length_mm ? Number(item.length_mm) : null,
      quantity: Number(item.quantity),
      order_unit: item.order_unit === 'paket' ? 'paket' : item.order_unit === 'kg' ? 'kg' : 'stück',
      pieces_per_package: item.order_unit === 'paket' ? Number(item.pieces_per_package || 0) : null
    })))

    if (!twoDLaser && !customerName) {
      return setMsg('Bitte Kundennamen eintragen.')
    }

    if (cleanItems.some(item => !item.material || !item.cross_section || !item.quantity || item.quantity < 1)) {
      return setMsg(normalizeOrderArea(order.order_area) === '2d-laser'
        ? 'Bitte jede Position mit Material, Format und Menge ausfüllen.'
        : 'Bitte jede Position mit Material, Querschnitt und Stückzahl ausfüllen.')
    }

    if (twoDLaser && cleanItems.some(item => item.order_unit === 'paket' && !item.pieces_per_package)) {
      return setMsg('Bitte bei jeder Paket-Position die Stückzahl pro Paket angeben.')
    }

    if (twoDLaser && cleanItems.some(item => !item.material_thickness_mm || item.material_thickness_mm <= 0)) {
      return setMsg('Bitte bei jeder Position eine Materialstärke eingeben.')
    }

    try {
      await ensureEditMasterData(customerName, cleanItems)
    } catch (error: any) {
      return setMsg(error.message || 'Stammdaten konnten nicht gespeichert werden.')
    }

    const firstItem = primaryOrderItem(cleanItems)
    const totalQuantity = orderItemsTotal(cleanItems)

    const { error } = await supabase
      .from('material_orders')
      .update({
        customer: customerName,
        supplier_id: editForm.supplier_id || null,
        material: firstItem.material,
        cross_section: firstItem.cross_section,
        length_mm: firstItem.length_mm,
        quantity: totalQuantity,
        customer_delivery_date: twoDLaser ? null : editForm.customer_delivery_date || null,
        desired_delivery_date: editForm.desired_delivery_date || null,
        notes: editForm.notes || null
      })
      .eq('id', order.id)

    if (error) return setMsg(error.message)

    await supabase.from('order_items').delete().eq('material_order_id', order.id)

    const { error: itemError } = await supabase.from('order_items').insert(
      cleanItems.map((item, index) => ({
        material_order_id: order.id,
        material: item.material,
        material_thickness_mm: item.material_thickness_mm,
        cross_section: item.cross_section,
        av_1: item.av_1 || null,
        av_2: item.av_2 || null,
        av_3: item.av_3 || null,
        av_4: item.av_4 || null,
        length_mm: item.length_mm,
        quantity: item.quantity,
        order_unit: item.order_unit || 'paket',
        pieces_per_package: item.order_unit === 'paket' ? item.pieces_per_package : null,
        position: index + 1
      }))
    )

    if (itemError) return setMsg(itemError.message)

    const defaultRows = packagingDefaultRows(order.order_area, cleanItems)
    if (defaultRows.length > 0) {
      await supabase.from('packaging_defaults').upsert(defaultRows)
    }

    await recalculateStatus(order.id, totalQuantity)
    setEditing(false)
    await load()
    setMsg('Änderungen wurden gespeichert.')
  }

  async function markOrdered() {
    if (!order) return

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await ensureCurrentUserProfile(supabase, userData.user)

    await supabase
      .from('material_orders')
      .update({
        status: 'bestellt',
        ordered_at: new Date().toISOString(),
        ordered_by: userData.user?.id || null
      })
      .eq('id', order.id)

    await load()
    setMsg('Status wurde auf Bestellt gesetzt.')
  }

  async function changeStatus(nextStatus: string) {
    if (!order) return

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const update: Record<string, string | null> = { status: nextStatus }

    if (nextStatus === 'bestellt' && !order.ordered_at) {
      await ensureCurrentUserProfile(supabase, userData.user)
      update.ordered_at = new Date().toISOString()
      update.ordered_by = userData.user?.id || null
    }

    const { error } = await supabase
      .from('material_orders')
      .update(update)
      .eq('id', order.id)

    if (error) {
      setMsg(error.message)
      return
    }

    await load()
    setShowDetailStatusMenu(false)
    setMsg('Status wurde manuell geändert.')
  }

  async function receiveGoods() {
    if (!order) return

    const entries = orderItems
      .map((item, index) => {
        const draftKey = orderItemOptionValue(item, index)
        const draft = receiptDrafts[draftKey] || { quantity: '', deliveryNote: '', notes: '' }
        const qty = Number(draft.quantity)

        return { item, draftKey, draft, qty }
      })
      .filter(entry => entry.draft.quantity.trim() !== '')

    if (entries.length === 0) {
      return setMsg('Bitte mindestens eine gelieferte Menge eingeben.')
    }

    if (entries.some(entry => !entry.qty || entry.qty < 1)) {
      return setMsg('Bitte nur gültige Wareneingangsmengen größer 0 eingeben.')
    }

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase.from('goods_receipts').insert(
      entries.map(({ item, draft, qty }) => ({
        material_order_id: order.id,
        order_item_id: item.id || null,
        material: item.material,
        cross_section: item.cross_section,
        length_mm: item.length_mm,
        received_quantity: qty,
        delivery_note_number: draft.deliveryNote || null,
        notes: draft.notes || null,
        received_by: userData.user?.id || null
      }))
    )

    if (error) {
      setMsg(error.message)
      return
    }

    await recalculateStatus(order.id, orderItemsTotal(orderItems))

    setReceiptDrafts(prev => {
      const next = { ...prev }

      for (const entry of entries) {
        next[entry.draftKey] = { quantity: '', deliveryNote: '', notes: '' }
      }

      return next
    })

    await load()
    setMsg('Wareneingang wurde gebucht.')
  }

  async function bookScraps() {
    if (!order) return

    const entries = orderItems
      .map((item, index) => {
        const draftKey = orderItemOptionValue(item, index)
        const draft = scrapDrafts[draftKey] || { quantity: '', reason: '' }
        const qty = Number(draft.quantity)

        return { item, draftKey, draft, qty }
      })
      .filter(entry => entry.draft.quantity.trim() !== '')

    if (entries.length === 0) {
      return setMsg('Bitte mindestens eine Ausschussmenge eingeben.')
    }

    if (entries.some(entry => !entry.qty || entry.qty < 1)) {
      return setMsg('Bitte nur gültige Ausschussmengen größer 0 eingeben.')
    }

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await ensureCurrentUserProfile(supabase, userData.user)

    const { error } = await supabase.from('scrap_items').insert(
      entries.map(({ item, draft, qty }) => ({
        material_order_id: order.id,
        order_item_id: item.id || null,
        material: item.material,
        cross_section: item.cross_section,
        length_mm: item.length_mm,
        quantity: qty,
        reason: draft.reason || null,
        created_by: userData.user?.id || null,
        reordered: false
      }))
    )

    if (error) {
      setMsg(error.message)
      return
    }

    setScrapDrafts(prev => {
      const next = { ...prev }

      for (const entry of entries) {
        next[entry.draftKey] = { quantity: '', reason: '' }
      }

      return next
    })

    await load()
    setMsg('Ausschuss wurde gebucht.')
  }

  async function reorderSelectedScraps() {
    if (!order) return

    const selectedScraps = scraps.filter(scrap => selectedScrapIds.includes(scrap.id) && !scrap.reordered)

    if (selectedScraps.length === 0) {
      return setMsg('Bitte mindestens einen offenen Ausschuss anhaken.')
    }

    const reorderItems = mergeOrderItems(selectedScraps.map(scrap => {
      const fallbackItem = primaryOrderItem(orderItems)
      const sourceItem = orderItems.find(item => item.id && item.id === scrap.order_item_id) || fallbackItem

      return {
        material: scrap.material || sourceItem.material,
        material_thickness_mm: sourceItem.material_thickness_mm,
        cross_section: scrap.cross_section || sourceItem.cross_section,
        av_1: sourceItem.av_1 || '',
        av_2: sourceItem.av_2 || '',
        av_3: sourceItem.av_3 || '',
        av_4: sourceItem.av_4 || '',
        length_mm: scrap.length_mm ?? sourceItem.length_mm,
        quantity: scrap.quantity
      }
    }))
    const firstItem = primaryOrderItem(reorderItems)
    const totalQuantity = orderItemsTotal(reorderItems)
    const reorderNotes = `Nachbestellung aus Ausschuss (${totalQuantity} Stück)\n${selectedScraps.map(scrap => {
      const fallbackItem = primaryOrderItem(orderItems)
      const material = scrap.material || fallbackItem.material
      const crossSection = scrap.cross_section || fallbackItem.cross_section
      const lengthMm = scrap.length_mm ?? fallbackItem.length_mm

      return `- ${material} - ${crossSection}, ${lengthMm || '-'} mm: ${scrap.quantity} Stück, Grund: ${scrap.reason || '-'}`
    }).join('\n')}`

    if (!confirm(`${totalQuantity} Stück aus Ausschuss nachbestellen?`)) {
      return
    }

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    await ensureCurrentUserProfile(supabase, userData.user)
    const orderedBy = await currentUserDisplayName()

    const { data, error } = await supabase
      .from('material_orders')
      .insert({
        order_number: `${order.order_number}-NB`,
        customer: order.customer,
        material: firstItem.material,
        cross_section: firstItem.cross_section,
        length_mm: firstItem.length_mm,
        quantity: totalQuantity,
        supplier_id: order.supplier_id,
        customer_delivery_date: order.customer_delivery_date,
        desired_delivery_date: order.desired_delivery_date,
        status: 'offen',
        notes: `Nachbestellung aus Ausschuss (${totalQuantity} Stück)\n${selectedScraps.map(scrap => {
          const fallbackItem = primaryOrderItem(orderItems)
          const material = scrap.material || fallbackItem.material
          const crossSection = scrap.cross_section || fallbackItem.cross_section
          const lengthMm = scrap.length_mm ?? fallbackItem.length_mm

          return `- ${material} - ${crossSection}, ${lengthMm || '-'} mm: ${scrap.quantity} Stück, Grund: ${scrap.reason || '-'}`
        }).join('\n')}`,
        created_by: userData.user?.id || null
      })
      .select('id')
      .single()

    if (error) {
      setMsg(error.message)
      return
    }

    await supabase.from('order_items').insert(
      reorderItems.map((item, index) => ({
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
        position: index + 1
      }))
    )

    if (order.suppliers?.email) {
      const res = await fetch('/api/send-order-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierEmail: order.suppliers.email,
          orderNumber: `${order.order_number}-NB`,
          customer: order.customer,
          items: reorderItems,
          desiredDeliveryDate: order.desired_delivery_date,
          supplierName: order.suppliers.name,
          orderedBy,
          notes: reorderNotes
        })
      })

      const mailData = await res.json()

      if (!res.ok) {
        setMsg(mailData.error || 'Nachbestellung wurde erzeugt, aber die E-Mail konnte nicht gesendet werden.')
        router.push(`/orders/${data.id}`)
        return
      }

      await supabase
        .from('material_orders')
        .update({
          status: 'bestellt',
          ordered_at: new Date().toISOString(),
          ordered_by: userData.user?.id || null
        })
        .eq('id', data.id)
    }

    await supabase
      .from('scrap_items')
      .update({ reordered: true })
      .in('id', selectedScraps.map(scrap => scrap.id))

    await load()
    setSelectedScrapIds([])
    setMsg(order.suppliers?.email ? 'Nachbestellung wurde erzeugt und per E-Mail versendet.' : 'Nachbestellung wurde erzeugt. Keine Lieferanten-E-Mail vorhanden.')
    router.push(`/orders/${data.id}`)
  }

  function startEditReceipt(r: Receipt) {
    setEditingReceiptId(r.id)
    setEditReceiptQty(String(r.received_quantity))
    setEditReceiptNote(r.delivery_note_number || '')
    setEditReceiptComment(r.notes || '')
  }

  async function saveReceiptEdit(receipt: Receipt) {
    if (!order) return

    const qty = Number(editReceiptQty)

    if (!qty || qty < 1) {
      return setMsg('Bitte gültige Stückzahl eingeben.')
    }

    const supabase = createClient()

    await supabase
      .from('goods_receipts')
      .update({
        received_quantity: qty,
        delivery_note_number: editReceiptNote || null,
        notes: editReceiptComment || null
      })
      .eq('id', receipt.id)

    setEditingReceiptId('')
    await recalculateStatus(order.id, orderItemsTotal(orderItems))
    await load()
    setMsg('Wareneingang wurde geändert.')
  }

  async function deleteReceipt(receipt: Receipt) {
    if (!order) return
    if (!confirm('Wareneingang wirklich löschen?')) return

    const supabase = createClient()

    await supabase
      .from('goods_receipts')
      .delete()
      .eq('id', receipt.id)

    await recalculateStatus(order.id, orderItemsTotal(orderItems))
    await load()
    setMsg('Wareneingang wurde gelöscht.')
  }

  async function uploadSupplierOrderPdfs(files: FileList | File[]) {
    if (!order) return

    const pdfFiles = Array.from(files).filter(file =>
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )

    if (pdfFiles.length === 0) {
      setMsg('Bitte eine PDF-Datei hochladen.')
      return
    }

    setIsPdfUploading(true)
    setMsg('')

    const supabase = createClient()
    const rows = []

    for (const file of pdfFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${order.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('order-pdfs')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/pdf'
        })

      if (uploadError) {
        setIsPdfUploading(false)
        setMsg(uploadError.message)
        return
      }

      const { data: publicData } = supabase.storage
        .from('order-pdfs')
        .getPublicUrl(path)

      rows.push({
        material_order_id: order.id,
        file_name: file.name,
        file_path: path,
        file_url: publicData.publicUrl
      })
    }

    const { error: insertError } = await supabase
      .from('order_pdfs')
      .insert(rows)

    setIsPdfUploading(false)

    if (insertError) {
      setMsg(insertError.message)
      return
    }

    await load()
    setMsg(`${rows.length} PDF${rows.length === 1 ? '' : 's'} wurden hochgeladen.`)
  }

  async function deleteSupplierOrderPdf(pdf: OrderPdf) {
    if (!order) return
    if (!confirm('AB-PDF wirklich löschen?')) return

    const supabase = createClient()

    await supabase.storage
      .from('order-pdfs')
      .remove([pdf.file_path])

    const { error } = await supabase
      .from('order_pdfs')
      .delete()
      .eq('id', pdf.id)

    if (error) {
      setMsg(error.message)
      return
    }

    await load()
    setMsg('AB-PDF wurde gelöscht.')
  }

  function handlePdfDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsPdfDragging(false)

    const files = e.dataTransfer.files
    if (files?.length) {
      uploadSupplierOrderPdfs(files)
    }
  }

  async function deleteScrap(scrap: Scrap) {
    if (scrap.reordered) {
      setMsg('Nachbestellter Ausschuss kann nicht gelöscht werden.')
      return
    }

    if (!confirm('Ausschuss wirklich löschen?')) return

    const supabase = createClient()

    await supabase
      .from('scrap_items')
      .delete()
      .eq('id', scrap.id)

    setSelectedScrapIds(prev => prev.filter(id => id !== scrap.id))
    await load()
    setMsg('Ausschuss wurde gelöscht.')
  }

  async function cancelOrder() {
    if (!order || !confirm('Bestellung wirklich stornieren und Stornierungsmail senden?')) return

    if (!order.suppliers?.email) {
      setMsg('Keine Lieferanten-E-Mail vorhanden. Stornierungsmail wurde nicht gesendet.')
      return
    }

    setMsg('Stornierung wird per E-Mail versendet...')
    const orderedBy = await currentUserDisplayName()

    const res = await fetch('/api/send-order-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailType: 'cancellation',
        supplierEmail: order.suppliers.email,
        orderNumber: order.order_number,
        customer: order.customer,
        items: orderItems,
        supplierName: order.suppliers.name,
        orderedBy,
        notes: order.notes
      })
    })

    const data = await res.json()

    if (!res.ok) {
      setMsg(data.error || 'Stornierungsmail konnte nicht gesendet werden.')
      return
    }

    const supabase = createClient()
    await supabase
      .from('material_orders')
      .update({ status: 'storniert' })
      .eq('id', order.id)

    await load()
    setMsg('Stornierung wurde per E-Mail gesendet und der Status wurde auf Storniert gesetzt.')
  }

  async function deleteOrder() {
    if (!order) return

    if (!isAdmin && !canDeleteOrder(order.created_at)) {
      alert('Diese Bestellung kann nach zwei Werktagen nicht mehr gelöscht werden.')
      return
    }

    if (!isAdmin) {
      alert('Nur Administratoren dürfen Bestellungen löschen.')
      return
    }

    if (!confirm(`Bestellung ${order.order_number} wirklich löschen?`)) {
      return
    }

    const supabase = createClient()

    await supabase
      .from('goods_receipts')
      .delete()
      .eq('material_order_id', order.id)

    await supabase
      .from('scrap_items')
      .delete()
      .eq('material_order_id', order.id)

    await supabase
      .from('order_history')
      .delete()
      .eq('material_order_id', order.id)

    const deleteError = await deleteMaterialOrder(
      supabase,
      order.id,
      order.created_at,
      isAdmin
    )

    if (deleteError) {
      alert(`Bestellung konnte nicht gelöscht werden: ${deleteError.message}`)
      return
    }

    router.push(ordersHref(normalizeOrderArea(order?.order_area)))
  }

  if (!order) {
    return (
      <main className="container wide">
        <p>Lade Bestellung...</p>
      </main>
    )
  }

  const isTwoDLaser = normalizeOrderArea(order.order_area) === '2d-laser'

  return (
    <main className="container wide">
      <button className="secondary" onClick={() => router.push(ordersHref(normalizeOrderArea(order.order_area)))}>
        Zurück
      </button>

      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>
            Auftrag {order.order_number} — {order.customer}
          </h1>
        </div>

        <button
          type="button"
          className="primary icon-button"
          onClick={() => setEditing(true)}
        >
          <span aria-hidden="true">✎</span>
          Bearbeiten
        </button>
      </div>

      <div className="card">
        {!editing ? (
          <>
            <div className="status-control">
              <div
                className="status-menu"
                onMouseEnter={() => setShowDetailStatusMenu(true)}
                onMouseLeave={() => setShowDetailStatusMenu(false)}
              >
                <button
                  type="button"
                  className={`status-badge-button ${statusClass(visibleStatus(order))}`}
                  title="Status ändern"
                >
                  {statusLabels[visibleStatus(order)]}
                </button>

                {showDetailStatusMenu && (
                  <div className="status-detail-menu-options">
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={`status-menu-option ${key === visibleStatus(order) ? 'active' : ''}`}
                        onClick={() => changeStatus(key)}
                      >
                        <span className={statusClass(key)}>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="order-items-table">
              <table className={`position-entry-table${isTwoDLaser ? ' two-d-position-entry-table' : ''}`}>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Material</th>
                    {isTwoDLaser && <th>Materialstärke</th>}
                    <th>{isTwoDLaser ? 'Format' : 'Querschnitt'}</th>
                    {!isTwoDLaser && <th>AV</th>}
                    {!isTwoDLaser && <th>Länge</th>}
                    <th>{isTwoDLaser ? 'Menge' : 'Stückzahl'}</th>
                    {isTwoDLaser && <th>Einheit</th>}
                    {isTwoDLaser && <th>Stück/Paket</th>}
                    <th>Geliefert</th>
                    <th className="we-block">WE-Menge</th>
                    <th className="we-block">Lieferschein</th>
                    <th className="we-block">WE-Bemerkung</th>
                    <th>Ausschuss</th>
                    <th>AUS-Menge</th>
                    <th>Grund</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, index) => {
                    const receiptDraft = receiptDraftFor(item, index)
                    const draft = scrapDraftFor(item, index)

                    return (
                      <tr key={`${item.cross_section}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.material}</td>
                        {isTwoDLaser && <td>{formatMaterialThickness(item.material_thickness_mm)}</td>}
                        <td>{item.cross_section}</td>
                        {!isTwoDLaser && <td>{orderItemAvText(item) || '-'}</td>}
                        {!isTwoDLaser && <td>{item.length_mm || '-'} mm</td>}
                        <td>{item.quantity}</td>
                        {isTwoDLaser && <td>{item.order_unit === 'paket' ? 'Paket' : item.order_unit === 'kg' ? 'kg' : 'Stück'}</td>}
                        {isTwoDLaser && <td>{item.order_unit === 'paket' ? item.pieces_per_package || '-' : '-'}</td>}
                        <td className={receivedQtyForItem(item) >= item.quantity ? 'qty-delivered complete' : receivedQtyForItem(item) > 0 ? 'qty-delivered partial' : ''}>
                          {receivedQtyForItem(item)}
                        </td>
                        <td className="we-block">
                          <input
                            type="number"
                            min="1"
                            step={item.order_unit === 'kg' ? '0.01' : '1'}
                            value={receiptDraft.quantity}
                            onChange={e => setReceiptDraft(item, index, 'quantity', e.target.value)}
                            className="table-input small-number"
                          />
                        </td>
                        <td className="we-block">
                          <input
                            value={receiptDraft.deliveryNote}
                            onChange={e => setReceiptDraft(item, index, 'deliveryNote', e.target.value)}
                            placeholder="LS-Nr."
                            className="table-input"
                          />
                        </td>
                        <td className="we-block">
                          <input
                            value={receiptDraft.notes}
                            onChange={e => setReceiptDraft(item, index, 'notes', e.target.value)}
                            placeholder="Bemerkung"
                            className="table-input"
                          />
                        </td>
                        <td className="qty-scrap">{scrapQtyForItem(item)}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step={item.order_unit === 'kg' ? '0.01' : '1'}
                            value={draft.quantity}
                            onChange={e => setScrapDraft(item, index, 'quantity', e.target.value)}
                            className="table-input small-number"
                          />
                        </td>
                        <td>
                          <input
                            value={draft.reason}
                            onChange={e => setScrapDraft(item, index, 'reason', e.target.value)}
                            placeholder="Grund"
                            className="table-input"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" onClick={receiveGoods}>
                Wareneingang buchen
              </button>
              <button type="button" onClick={bookScraps}>
                Ausschuss buchen
              </button>
            </div>

            <div className="grid order-summary-grid">
              <p><b>Gesamtmenge:</b><br />{orderItemsTotal(orderItems)}</p>
              <p><b>Geliefert:</b><br />{receivedSum} / {orderItemsTotal(orderItems)}</p>
              <p><b>Ausschuss:</b><br />{scrapSum}</p>
              {!isTwoDLaser && <p><b>Kunde:</b><br />{order.customer}</p>}
              {!isTwoDLaser && <p><b>K-Liefertermin:</b><br />{order.customer_delivery_date || '-'}</p>}
              <p>
                <b>Lieferant:</b>
                <br />
                {order.suppliers?.name || '-'}
                <br />
                {order.suppliers?.contact_person || '-'}
                <br />
                {order.suppliers?.email || ''}
              </p>
              <p><b>Liefertermin:</b><br />{order.desired_delivery_date || '-'}</p>
            </div>

            {order.notes && (
              <p><b>Bemerkung:</b><br />{order.notes}</p>
            )}

            <div className="actions">
              <button type="button" onClick={sendOrderEmail}>
                Bestellung senden
              </button>

              <button className="danger" onClick={cancelOrder}>
                Stornieren
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="danger"
                  onClick={deleteOrder}
                >
                  🗑 Bestellung löschen
                </button>
              )}
            </div>

            <div
              className={`pdf-dropzone${isPdfDragging ? ' active' : ''}`}
              onDragOver={e => {
                e.preventDefault()
                setIsPdfDragging(true)
              }}
              onDragLeave={() => setIsPdfDragging(false)}
              onDrop={handlePdfDrop}
            >
              <label className="pdf-upload-target">
                <span className="small">
                  {isPdfUploading ? 'PDFs werden hochgeladen...' : 'PDFs hier ablegen oder klicken'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  hidden
                  disabled={isPdfUploading}
                  onChange={e => {
                    const files = e.target.files
                    if (files?.length) {
                      uploadSupplierOrderPdfs(files)
                    }
                    e.currentTarget.value = ''
                  }}
                />
              </label>

              {orderPdfs.length > 0 && (
                <div className="pdf-preview-grid">
                  {orderPdfs.map(pdf => (
                    <div className="pdf-preview-card" key={pdf.id}>
                      <a
                        className="pdf-preview"
                        href={pdf.file_url}
                        target="_blank"
                        rel="noreferrer"
                        title={pdf.file_name}
                      >
                        <span className="pdf-preview-page">
                          <iframe
                            src={`${pdf.file_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                            title={pdf.file_name}
                            scrolling="no"
                          />
                        </span>
                        <span>{pdf.file_name}</span>
                      </a>
                      <button type="button" className="danger" onClick={() => deleteSupplierOrderPdf(pdf)}>
                        PDF löschen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <form className="grid" onSubmit={saveEdit}>
            {!isTwoDLaser && (
              <div>
                <label>Kunde</label>
                <div className="combo-box">
                  <input
                    value={editForm.customer}
                    onFocus={() => setActiveCustomerSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setActiveCustomerSuggestions(false), 120)}
                    onChange={e => setEdit('customer', e.target.value)}
                    placeholder="Kunde wählen oder eingeben"
                    required
                  />
                  {activeCustomerSuggestions && customerSuggestions.length > 0 && (
                    <div className="combo-options">
                      {customerSuggestions.map(customer => (
                        <button
                          type="button"
                          key={customer.id}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setEdit('customer', customer.name)
                            setActiveCustomerSuggestions(false)
                          }}
                        >
                          {customer.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isTwoDLaser && (
              <div>
                <label>K-Liefertermin</label>
                <input
                  type="date"
                  value={editForm.customer_delivery_date}
                  onChange={e => setEdit('customer_delivery_date', e.target.value)}
                />
              </div>
            )}

            <div>
              <label>Lieferant</label>
              <select
                value={editForm.supplier_id}
                onChange={e => setEdit('supplier_id', e.target.value)}
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
              <label>Liefertermin</label>
              <input
                type="date"
                value={editForm.desired_delivery_date}
                onChange={e => setEdit('desired_delivery_date', e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h2>Positionen</h2>
                <button type="button" onClick={addEditItem}>+ Position</button>
              </div>

              {!isTwoDLaser && (
                <datalist id="edit-work-preparation-options">
                  {workPreparations.map(av => (
                    <option key={av.id} value={av.name} />
                  ))}
                </datalist>
              )}

              <div className="order-items">
                {editItems.map((item, index) => (
                  <div className="order-item" key={index}>
                    <div className={`order-item-row${isTwoDLaser ? ' two-d-order-item-row' : ''}`}>
                      <div className="order-item-title">
                        <b>Position {index + 1}</b>
                      </div>

                      <div>
                        <label>Material</label>
                        <div className="combo-box">
                          <input
                            value={item.material}
                            onFocus={() => setActiveEditMaterialIndex(index)}
                            onBlur={() => window.setTimeout(() => setActiveEditMaterialIndex(null), 120)}
                            onChange={e => setEditItem(index, 'material', e.target.value)}
                            placeholder="Material wählen oder eingeben"
                            required
                          />
                          {activeEditMaterialIndex === index && masterDataOptions(materials, item.material).length > 0 && (
                            <div className="combo-options">
                              {masterDataOptions(materials, item.material).map(material => (
                                <button
                                  type="button"
                                  key={material.id}
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setEditItem(index, 'material', material.name)
                                    setActiveEditMaterialIndex(null)
                                  }}
                                >
                                  {material.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {isTwoDLaser && (
                        <div>
                          <label>Materialstärke (mm)</label>
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            list={`edit-material-thickness-options-${index}`}
                            value={item.material_thickness_mm || ''}
                            onChange={e => setEditItem(index, 'material_thickness_mm', e.target.value)}
                            placeholder="z.B. 1,5"
                            required
                          />
                          <datalist id={`edit-material-thickness-options-${index}`}>
                            {materialThicknesses
                              .filter(thickness => thickness.material.trim().toLocaleLowerCase('de-DE') === item.material.trim().toLocaleLowerCase('de-DE'))
                              .map(thickness => <option key={thickness.id} value={thickness.thickness_mm} />)}
                          </datalist>
                        </div>
                      )}

                      <div className={isTwoDLaser ? 'order-item-format' : undefined}>
                        <label>{isTwoDLaser ? 'Format' : 'Querschnitt'}</label>
                        {isTwoDLaser ? (
                          <div className="format-entry-row">
                            <select
                              value={crossSections.some(format => format.name === item.cross_section) ? item.cross_section : '__custom__'}
                              onChange={e => setEditItem(index, 'cross_section', e.target.value === '__custom__' ? 'Eigenes Format: ' : e.target.value)}
                            >
                              {crossSections.map(format => (
                                <option key={format.id} value={format.name}>{format.name}</option>
                              ))}
                              <option value="__custom__">Eigenes Format</option>
                            </select>
                            <input
                              value={crossSections.some(format => format.name === item.cross_section) ? '' : customFormatValue(item.cross_section)}
                              onChange={e => setEditItem(index, 'cross_section', `Eigenes Format: ${e.target.value}`)}
                              placeholder="Eigenes Maß, z.B. 2800x1400 mm"
                              disabled={crossSections.some(format => format.name === item.cross_section)}
                              required={!crossSections.some(format => format.name === item.cross_section)}
                            />
                          </div>
                        ) : (
                          <div className="combo-box">
                            <input
                              value={item.cross_section}
                              onFocus={() => setActiveEditCrossIndex(index)}
                              onBlur={() => window.setTimeout(() => setActiveEditCrossIndex(null), 120)}
                              onChange={e => setEditItem(index, 'cross_section', e.target.value)}
                              placeholder="Querschnitt wählen oder eingeben"
                              required
                            />
                            {activeEditCrossIndex === index && masterDataOptions(crossSections, item.cross_section).length > 0 && (
                              <div className="combo-options">
                                {masterDataOptions(crossSections, item.cross_section).map(crossSection => (
                                  <button
                                    type="button"
                                    key={crossSection.id}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                      setEditItem(index, 'cross_section', crossSection.name)
                                      setActiveEditCrossIndex(null)
                                    }}
                                  >
                                    {crossSection.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {!isTwoDLaser && (['av_1', 'av_2', 'av_3', 'av_4'] as const).map((key, avIndex) => (
                        <div key={key}>
                          <label>AV {avIndex + 1}</label>
                          <input
                            value={item[key] || ''}
                            list="edit-work-preparation-options"
                            onChange={e => setEditItem(index, key, e.target.value)}
                            placeholder="Arbeitsvorbereitung"
                          />
                        </div>
                      ))}

                      {!isTwoDLaser && (
                        <div>
                          <label>Länge mm</label>
                          <input
                            type="number"
                            value={item.length_mm || ''}
                            onChange={e => setEditItem(index, 'length_mm', e.target.value)}
                          />
                        </div>
                      )}

                      {isTwoDLaser && (
                        <div>
                          <label>Einheit</label>
                          <select value={item.order_unit || 'paket'} onChange={e => setEditItem(index, 'order_unit', e.target.value)}>
                            <option value="paket">Paket</option>
                            <option value="stück">Stück</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label>{isTwoDLaser ? 'Menge' : 'Stückzahl'}</label>
                        <input
                          type="number"
                          min="1"
                          step={item.order_unit === 'kg' ? '0.01' : '1'}
                          value={item.quantity || ''}
                          onChange={e => setEditItem(index, 'quantity', e.target.value)}
                          required
                        />
                      </div>

                      {isTwoDLaser && (
                        <div>
                          <label>Stück pro Paket</label>
                          <input
                            type="number"
                            min="1"
                            value={item.pieces_per_package || ''}
                            onChange={e => setEditItem(index, 'pieces_per_package', e.target.value)}
                            disabled={item.order_unit !== 'paket'}
                            required={item.order_unit === 'paket'}
                          />
                        </div>
                      )}

                      <div className="order-item-remove">
                        {editItems.length > 1 && (
                          <button type="button" className="danger" onClick={() => removeEditItem(index)}>
                            Entfernen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="small">Gesamtmenge: {orderItemsTotal(editItems)}</p>
            </div>


            <div style={{ gridColumn: '1/-1' }}>
              <label>Bemerkung</label>
              <textarea
                value={editForm.notes}
                onChange={e => setEdit('notes', e.target.value)}
              />
            </div>

            <div className="actions">
              <button type="submit">Änderungen speichern</button>

              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(false)
                  load()
                }}
              >
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {msg && <p className="success">{msg}</p>}
      </div>

      <div className="card">
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <h2>Ausschuss</h2>
          <button type="button" onClick={reorderSelectedScraps}>
            Ausgewählte nachbestellen
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th></th>
              <th>Datum</th>
              <th>Position</th>
              <th>Stückzahl</th>
              <th>Grund</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>

          <tbody>
            {scraps.map(s => (
              <tr key={s.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedScrapIds.includes(s.id)}
                    disabled={Boolean(s.reordered)}
                    onChange={() => toggleScrapSelection(s.id)}
                    className="table-checkbox"
                  />
                </td>
                <td>{new Date(s.created_at).toLocaleString('de-DE')}</td>
                <td>
                  {s.material && s.cross_section
                    ? `${s.material} - ${s.cross_section}, ${s.length_mm || '-'} mm`
                    : '-'}
                </td>
                <td>{s.quantity}</td>
                <td>{s.reason || '-'}</td>
                <td>{s.reordered ? 'Nachbestellt' : 'Offen'}</td>
                <td>
                  {!s.reordered && (
                    <button type="button" className="danger" onClick={() => deleteScrap(s)}>
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Wareneingänge</h2>

        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Position</th>
              <th>Stückzahl</th>
              <th>Lieferschein</th>
              <th>Bemerkung</th>
              <th>Aktionen</th>
            </tr>
          </thead>

          <tbody>
            {receipts.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.received_at).toLocaleString('de-DE')}</td>

                {editingReceiptId === r.id ? (
                  <>
                    <td>
                      {r.material && r.cross_section
                        ? `${r.material} - ${r.cross_section}, ${r.length_mm || '-'} mm`
                        : '-'}
                    </td>

                    <td>
                      <input
                        type="number"
                        min="1"
                        value={editReceiptQty}
                        onChange={e => setEditReceiptQty(e.target.value)}
                      />
                    </td>

                    <td>
                      <input
                        value={editReceiptNote}
                        onChange={e => setEditReceiptNote(e.target.value)}
                      />
                    </td>

                    <td>
                      <input
                        value={editReceiptComment}
                        onChange={e => setEditReceiptComment(e.target.value)}
                      />
                    </td>

                    <td className="actions">
                      <button
                        type="button"
                        onClick={() => saveReceiptEdit(r)}
                      >
                        Speichern
                      </button>

                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingReceiptId('')}
                      >
                        Abbrechen
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      {r.material && r.cross_section
                        ? `${r.material} - ${r.cross_section}, ${r.length_mm || '-'} mm`
                        : '-'}
                    </td>
                    <td>{r.received_quantity}</td>
                    <td>{r.delivery_note_number || '-'}</td>
                    <td>{r.notes || '-'}</td>

                    <td className="actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => startEditReceipt(r)}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteReceipt(r)}
                      >
                        🗑
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
