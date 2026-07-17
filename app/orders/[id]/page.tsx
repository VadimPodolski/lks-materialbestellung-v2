'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { canDeleteForOrderArea } from '@/lib/areaPermissions'
import { packagingDefaultKey, packagingDefaultRows, packagingDefaultsMap, type PackagingDefault } from '@/lib/packagingDefaults'
import { calculateTubeItemWeightKg, calculateTubeWeightKgPerMeter, formatTubeWeight, formatTubeWeightPerMeter } from '@/lib/tubeWeight'
import ConfirmDialog from '@/app/ConfirmDialog'
import ActionIconButton from '@/app/ActionIconButton'
import { useAppDialog } from '@/app/useAppDialog'

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
  document_type: PdfDocumentType
  price_import_status: 'pending' | 'processing' | 'imported' | 'failed' | null
  price_import_message: string | null
  prices_imported_at: string | null
  created_at: string
}

type PdfDocumentType = 'lks_order' | 'supplier_confirmation' | 'supplier_delivery_note'

const pdfSections: { type: PdfDocumentType; title: string; uploadText: string }[] = [
  { type: 'lks_order', title: '1. LKS-Auftrag', uploadText: 'LKS-Auftrag hier ablegen oder klicken' },
  { type: 'supplier_confirmation', title: '2. Lieferanten-AB', uploadText: 'Lieferanten-AB hier ablegen oder klicken' }
]

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
  return value.replace(/^(?:Eigenes Format|Sonderformat):\s*/i, '')
}

function formatEuro(value: number | null | undefined, maximumFractionDigits = 2) {
  if (value == null) return '-'

  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits
  }).format(Number(value))} €`
}

function formatPriceQuantity(value: number | null | undefined, unit: string | null | undefined) {
  if (value == null || !unit) return ''

  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(Number(value))} ${unit}`
}

function normalizedDimensionPart(value: string) {
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) ? String(number) : value
}

function dimensionSignature(value: string | null | undefined) {
  if (!value) return ''

  const match = value.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX×]\s*(\d+(?:[.,]\d+)?))?/)
    || value.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?/)
  if (!match) return ''

  return [match[1], match[2], match[3]]
    .filter(Boolean)
    .map(normalizedDimensionPart)
    .join('x')
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
  const [canDeleteThisOrder, setCanDeleteThisOrder] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState(false)

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

  const [draggingPdfType, setDraggingPdfType] = useState<PdfDocumentType | null>(null)
  const [uploadingPdfType, setUploadingPdfType] = useState<PdfDocumentType | null>(null)
  const [processingPricePdfId, setProcessingPricePdfId] = useState('')
  const processedPricePdfIds = useRef(new Set<string>())
  const [showDetailStatusMenu, setShowDetailStatusMenu] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [deleteCheckTime, setDeleteCheckTime] = useState(() => Date.now())
  const { ask, notify, dialog } = useAppDialog()

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
      const admin = profile?.role === 'admin'
      setIsAdminUser(admin)
      setCanDeleteThisOrder(canDeleteForOrderArea(user.email, admin, area))
    } else {
      setIsAdminUser(false)
      setCanDeleteThisOrder(false)
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
      setEditItems(loadedItems.map(item => ({
        ...item,
        order_unit: area === '2d-laser' ? (item.order_unit || 'paket') : 'stück',
        pieces_per_package: area === '2d-laser' && item.order_unit === 'paket'
          ? item.pieces_per_package
          : null
      })))
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

  const totalOrderPrice = useMemo(() => {
    let hasPrice = false
    const total = orderItems.reduce((sum, item) => {
      if (item.line_total_eur != null) {
        hasPrice = true
        return sum + Number(item.line_total_eur)
      }

      if (item.unit_price_eur != null && item.price_quantity != null) {
        hasPrice = true
        return sum + Number(item.unit_price_eur) * Number(item.price_quantity)
      }

      return sum
    }, 0)

    return hasPrice ? total : null
  }, [orderItems])

  const totalTubeWeight = useMemo(() => (
    orderItems.reduce((sum, item) => sum + (calculateTubeItemWeightKg(item) || 0), 0)
  ), [orderItems])

  useEffect(() => {
    if (!order || orderItems.length === 0 || processingPricePdfId) return

    const hasStoredPositionPrice = orderItems.some(item => (
      item.unit_price_eur != null || item.line_total_eur != null
    ))

    const pendingPdf = orderPdfs.find(pdf => (
      pdf.document_type === 'supplier_confirmation'
      && (pdf.price_import_status !== 'imported' || !hasStoredPositionPrice)
      && !processedPricePdfIds.current.has(pdf.id)
    ))

    if (pendingPdf) {
      void applySupplierPrices(pendingPdf)
    }
  }, [order, orderItems, orderPdfs, processingPricePdfId])

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
      order_unit: twoDLaser
        ? (item.order_unit === 'paket' ? 'paket' : item.order_unit === 'kg' ? 'kg' : 'stück')
        : 'stück',
      pieces_per_package: twoDLaser && item.order_unit === 'paket'
        ? Number(item.pieces_per_package || 0)
        : null
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
        order_unit: twoDLaser ? (item.order_unit || 'paket') : 'stück',
        pieces_per_package: twoDLaser && item.order_unit === 'paket' ? item.pieces_per_package : null,
        price_quantity: item.price_quantity,
        price_unit: item.price_unit,
        unit_price_eur: item.unit_price_eur,
        line_total_eur: item.line_total_eur,
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

    if (!await ask({
      title: 'Ausschuss nachbestellen',
      message: `${totalQuantity} Stück aus Ausschuss nachbestellen?`,
      confirmLabel: 'Nachbestellen'
    })) {
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
    if (!await ask({
      title: 'Wareneingang löschen',
      message: 'Wareneingang wirklich löschen?',
      confirmLabel: 'Löschen',
      danger: true
    })) return

    const supabase = createClient()

    await supabase
      .from('goods_receipts')
      .delete()
      .eq('id', receipt.id)

    await recalculateStatus(order.id, orderItemsTotal(orderItems))
    await load()
    setMsg('Wareneingang wurde gelöscht.')
  }

  async function uploadOrderPdfs(files: FileList | File[], documentType: PdfDocumentType) {
    if (!order) return

    const pdfFiles = Array.from(files).filter(file =>
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )

    if (pdfFiles.length === 0) {
      setMsg('Bitte eine PDF-Datei hochladen.')
      return
    }

    setUploadingPdfType(documentType)
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
        setUploadingPdfType(null)
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
        file_url: publicData.publicUrl,
        document_type: documentType,
        price_import_status: documentType === 'supplier_confirmation' ? 'pending' : null
      })
    }

    const { data: insertedPdfs, error: insertError } = await supabase
      .from('order_pdfs')
      .insert(rows)
      .select('*')

    setUploadingPdfType(null)

    if (insertError) {
      setMsg(insertError.message)
      return
    }

    const sectionTitle = pdfSections.find(section => section.type === documentType)?.title.replace(/^\d+\.\s*/, '')

    if (documentType === 'supplier_confirmation') {
      for (const pdf of (insertedPdfs as OrderPdf[]) || []) {
        await applySupplierPrices(pdf)
      }
    } else {
      await load()
      setMsg(`${rows.length} PDF${rows.length === 1 ? '' : 's'} unter „${sectionTitle}“ hochgeladen.`)
    }
  }

  async function deleteSupplierOrderPdf(pdf: OrderPdf) {
    if (!order) return

    if (!isAdminUser && !canDeleteOrder(order.created_at)) {
      await notify('PDF kann nicht gelöscht werden', 'PDFs können nach zwei Werktagen nur noch von Administratoren gelöscht werden.')
      return
    }

    if (!await ask({
      title: 'PDF löschen',
      message: 'PDF wirklich löschen?',
      confirmLabel: 'Löschen',
      danger: true
    })) return

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
    setMsg('PDF wurde gelöscht.')
  }

  async function applySupplierPrices(pdfFile: OrderPdf) {
    if (!order) return

    processedPricePdfIds.current.add(pdfFile.id)
    setProcessingPricePdfId(pdfFile.id)
    setMsg(`${pdfFile.file_name} wird automatisch ausgewertet...`)

    const supabase = createClient()

    async function failImport(message: string) {
      await supabase
        .from('order_pdfs')
        .update({
          price_import_status: 'failed',
          price_import_message: message,
          prices_imported_at: null
        })
        .eq('id', pdfFile.id)

      setOrderPdfs(current => current.map(pdf => (
        pdf.id === pdfFile.id
          ? { ...pdf, price_import_status: 'failed', price_import_message: message, prices_imported_at: null }
          : pdf
      )))
      setMsg(message)
    }

    try {
      await supabase
        .from('order_pdfs')
        .update({ price_import_status: 'processing', price_import_message: null })
        .eq('id', pdfFile.id)

      const response = await fetch(`/api/orders/${order.id}/extract-ullner-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: pdfFile.file_url,
          orderNumber: order.order_number
        })
      })
      const result = await response.json()

      if (!response.ok) {
        await failImport(result.error || 'Positionspreise konnten nicht ausgelesen werden.')
        return
      }

      const extractedPositions = (result.positions || []) as {
        position: number
        priceQuantity: number
        priceUnit: string
        unitPriceEur: number
        lineTotalEur: number
        description: string
      }[]
      const usedItemIds = new Set<string>()
      const updates = extractedPositions.flatMap(price => {
        const signature = dimensionSignature(price.description)
        const signatureMatches = signature
          ? orderItems.filter(item => dimensionSignature(item.cross_section) === signature)
          : []
        let item = signatureMatches.length === 1 ? signatureMatches[0] : null

        if (!item && extractedPositions.length === orderItems.length) {
          item = orderItems.find((candidate, index) => (
            Number(candidate.position || index + 1) === Number(price.position)
          )) || null
        }

        if (!item?.id || usedItemIds.has(item.id)) return []
        usedItemIds.add(item.id)
        return [{ price, item }]
      })

      if (updates.length === 0) {
        await failImport('Die PDF-Positionen konnten keinem Querschnitt des Auftrags eindeutig zugeordnet werden.')
        return
      }

      const updateResults = await Promise.all(updates.map(({ price, item }) => (
        supabase
          .from('order_items')
          .update({
            price_quantity: price.priceQuantity,
            price_unit: price.priceUnit,
            unit_price_eur: price.unitPriceEur,
            line_total_eur: price.lineTotalEur
          })
          .eq('id', item!.id!)
          .eq('material_order_id', order.id)
          .select('id,price_quantity,price_unit,unit_price_eur,line_total_eur')
          .maybeSingle()
      )))
      const updateError = updateResults.find(update => update.error)?.error

      if (updateError) {
        await failImport(updateError.message)
        return
      }

      const missingUpdate = updateResults.find(update => !update.data)
      if (missingUpdate) {
        await failImport('Der Positionspreis wurde erkannt, konnte aber nicht im Auftrag gespeichert werden.')
        return
      }

      const ignoredCount = extractedPositions.length - updates.length
      const importMessage = `${updates.length} Positionspreis${updates.length === 1 ? '' : 'e'} automatisch übernommen` +
        (ignoredCount > 0 ? `, ${ignoredCount} Zusatzposition${ignoredCount === 1 ? '' : 'en'} ignoriert.` : '.')

      await supabase
        .from('order_pdfs')
        .update({
          price_import_status: 'imported',
          price_import_message: importMessage,
          prices_imported_at: new Date().toISOString()
        })
        .eq('id', pdfFile.id)

      const updatedPrices = new Map(updateResults.map(result => [result.data!.id, result.data!]))
      setOrder(current => current ? {
        ...current,
        order_items: (current.order_items || []).map(item => (
          item.id && updatedPrices.has(item.id)
            ? { ...item, ...updatedPrices.get(item.id)! }
            : item
        ))
      } : current)
      setOrderPdfs(current => current.map(pdf => (
        pdf.id === pdfFile.id
          ? {
              ...pdf,
              price_import_status: 'imported',
              price_import_message: importMessage,
              prices_imported_at: new Date().toISOString()
            }
          : pdf
      )))
      setMsg(`${pdfFile.file_name}: ${importMessage}`)
    } catch (error: any) {
      await failImport(error.message || 'Lieferanten-AB konnte nicht ausgewertet werden.')
    } finally {
      setProcessingPricePdfId('')
    }
  }

  function handlePdfDrop(e: React.DragEvent<HTMLElement>, documentType: PdfDocumentType) {
    e.preventDefault()
    setDraggingPdfType(null)

    const files = e.dataTransfer.files
    if (files?.length) {
      uploadOrderPdfs(files, documentType)
    }
  }

  async function deleteScrap(scrap: Scrap) {
    if (scrap.reordered) {
      setMsg('Nachbestellter Ausschuss kann nicht gelöscht werden.')
      return
    }

    if (!await ask({
      title: 'Ausschuss löschen',
      message: 'Ausschuss wirklich löschen?',
      confirmLabel: 'Löschen',
      danger: true
    })) return

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
    if (!order || !await ask({
      title: 'Bestellung stornieren',
      message: 'Bestellung wirklich stornieren und Stornierungsmail senden?',
      confirmLabel: 'Stornieren',
      danger: true
    })) return

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

    if (!canDeleteThisOrder && !canDeleteOrder(order.created_at)) {
      await notify('Löschen nicht möglich', 'Diese Bestellung kann nach zwei Werktagen nicht mehr gelöscht werden.')
      return
    }

    if (!canDeleteThisOrder) {
      await notify('Löschen nicht möglich', 'Du hast für diesen Fertigungsbereich keine Löschberechtigung.')
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
      canDeleteThisOrder
    )

    if (deleteError) {
      await notify('Bestellung konnte nicht gelöscht werden', deleteError.message)
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
  const canDeletePdfs = isAdminUser || canDeleteOrder(order.created_at, new Date(deleteCheckTime))

  return (
    <main className="container wide">
      {dialog}
      <ConfirmDialog
        open={deleteConfirmationOpen}
        title="Bestellung löschen"
        message={`Bestellung ${order.order_number} wirklich löschen?`}
        onCancel={() => setDeleteConfirmationOpen(false)}
        onConfirm={() => {
          setDeleteConfirmationOpen(false)
          void deleteOrder()
        }}
      />

      <button className="secondary" onClick={() => router.push(ordersHref(normalizeOrderArea(order.order_area)))}>
        Zurück
      </button>

      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>
            Auftrag {order.order_number} — {order.customer}
          </h1>
        </div>

        <ActionIconButton action="edit" label="Bestellung bearbeiten" onClick={() => setEditing(true)} />
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
              <table className={`position-entry-table ${isTwoDLaser ? 'two-d-position-entry-table' : 'tube-position-entry-table'}`}>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Material</th>
                    {isTwoDLaser && <th>Materialstärke</th>}
                    <th>{isTwoDLaser ? 'Format' : 'Querschnitt'}</th>
                    {!isTwoDLaser && <th>AV</th>}
                    {!isTwoDLaser && <th>Länge</th>}
                    <th>{isTwoDLaser ? 'Menge' : 'Stückzahl'}</th>
                    {!isTwoDLaser && <th>Gewicht</th>}
                    <th>Preis</th>
                    <th>Betrag</th>
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
                    const tubeWeightPerMeter = !isTwoDLaser
                      ? calculateTubeWeightKgPerMeter(item.cross_section, item.material)
                      : null
                    const tubeItemWeight = !isTwoDLaser ? calculateTubeItemWeightKg(item) : null

                    return (
                      <tr key={`${item.cross_section}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.material}</td>
                        {isTwoDLaser && <td>{formatMaterialThickness(item.material_thickness_mm)}</td>}
                        <td>{item.cross_section}</td>
                        {!isTwoDLaser && <td>{orderItemAvText(item) || '-'}</td>}
                        {!isTwoDLaser && <td>{item.length_mm || '-'} mm</td>}
                        <td>{item.quantity}</td>
                        {!isTwoDLaser && (
                          <td className="tube-weight-cell">
                            {tubeItemWeight == null || tubeWeightPerMeter == null ? '-' : (
                              <>
                                <strong>{formatTubeWeight(tubeItemWeight)}</strong>
                                <small>{formatTubeWeightPerMeter(tubeWeightPerMeter.weightKgPerMeter)}</small>
                              </>
                            )}
                          </td>
                        )}
                        <td className="order-position-price">
                          {item.unit_price_eur == null ? '-' : (
                            <>
                              <strong>{formatEuro(item.unit_price_eur, 4)} / {item.price_unit || 'Einheit'}</strong>
                              <small>{formatPriceQuantity(item.price_quantity, item.price_unit)}</small>
                            </>
                          )}
                        </td>
                        <td><strong>{formatEuro(item.line_total_eur)}</strong></td>
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
                <tfoot>
                  <tr className="position-booking-row">
                    <td colSpan={isTwoDLaser ? 10 : 9} />
                    <td className="position-booking-cell we-booking-cell" colSpan={isTwoDLaser ? 3 : 4}>
                      <button type="button" onClick={receiveGoods}>
                        Wareneingang buchen
                      </button>
                    </td>
                    <td className="position-booking-cell scrap-booking-cell" colSpan={3}>
                      <button type="button" onClick={bookScraps}>
                        Ausschuss buchen
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid order-summary-grid">
              {!isTwoDLaser && <p><b>Kunde:</b><br />{order.customer}</p>}
              <p><b>Soll:</b><br />{orderItemsTotal(orderItems)}</p>
              <p><b>Geliefert:</b><br />{receivedSum} / {orderItemsTotal(orderItems)}</p>
              <p><b>Ausschuss:</b><br />{scrapSum}</p>
              {!isTwoDLaser && <p><b>Gewicht:</b><br />ca. {formatTubeWeight(totalTubeWeight)}</p>}
              {!isTwoDLaser && <p><b>K-Liefertermin:</b><br />{order.customer_delivery_date || '-'}</p>}
              <p><b>Preis:</b><br />{formatEuro(totalOrderPrice)}</p>
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

              {canDeleteThisOrder && (
                <ActionIconButton
                  action="delete"
                  label="Bestellung löschen"
                  onClick={() => setDeleteConfirmationOpen(true)}
                />
              )}
            </div>

            <div className="pdf-sections">
              {pdfSections.map(section => {
                const sectionPdfs = orderPdfs.filter(pdf => pdf.document_type === section.type)
                const isUploading = uploadingPdfType === section.type

                return (
                  <section
                    className={`pdf-section${draggingPdfType === section.type ? ' active' : ''}`}
                    key={section.type}
                    onDragOver={e => {
                      e.preventDefault()
                      setDraggingPdfType(section.type)
                    }}
                    onDragLeave={() => setDraggingPdfType(null)}
                    onDrop={e => handlePdfDrop(e, section.type)}
                  >
                    <div className="pdf-section-heading">
                      <h3>{section.title}</h3>
                      <span className="small">{sectionPdfs.length} PDF{sectionPdfs.length === 1 ? '' : 's'}</span>
                    </div>

                    <label className="pdf-upload-target">
                      <span className="small">
                        {isUploading ? 'PDFs werden hochgeladen...' : section.uploadText}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        hidden
                        disabled={Boolean(uploadingPdfType)}
                        onChange={e => {
                          const files = e.target.files
                          if (files?.length) {
                            uploadOrderPdfs(files, section.type)
                          }
                          e.currentTarget.value = ''
                        }}
                      />
                    </label>

                    {sectionPdfs.length > 0 ? (
                      <div className="pdf-preview-grid">
                        {sectionPdfs.map(pdf => (
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
                            {section.type === 'supplier_confirmation' && (
                              <div className={`pdf-price-import-status ${pdf.price_import_status || 'pending'}`}>
                                <strong>
                                  {(processingPricePdfId === pdf.id || pdf.price_import_status === 'processing')
                                    ? 'Preise werden automatisch geprüft...'
                                    : pdf.price_import_status === 'imported'
                                      ? 'Preise automatisch übernommen'
                                      : pdf.price_import_status === 'failed'
                                        ? 'Automatische Preisprüfung nicht möglich'
                                        : 'Automatische Preisprüfung startet'}
                                </strong>
                                {pdf.price_import_message && <small>{pdf.price_import_message}</small>}
                              </div>
                            )}
                            {canDeletePdfs && (
                              <ActionIconButton action="delete" label="PDF löschen" onClick={() => deleteSupplierOrderPdf(pdf)} />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pdf-section-empty">Noch keine PDF vorhanden.</p>
                    )}
                  </section>
                )
              })}
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
                              onChange={e => setEditItem(index, 'cross_section', e.target.value === '__custom__' ? 'Sonderformat: ' : e.target.value)}
                            >
                              {crossSections.map(format => (
                                <option key={format.id} value={format.name}>{format.name}</option>
                              ))}
                              <option value="__custom__">Sonderformat</option>
                            </select>
                            <input
                              value={crossSections.some(format => format.name === item.cross_section) ? '' : customFormatValue(item.cross_section)}
                              onChange={e => setEditItem(index, 'cross_section', `Sonderformat: ${e.target.value}`)}
                              placeholder="Sondermaß, z.B. 2800x1400 mm"
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

                      {!isTwoDLaser && (
                        <div>
                          <label>Stückzahl</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity || ''}
                            onChange={e => setEditItem(index, 'quantity', e.target.value)}
                            required
                          />
                        </div>
                      )}

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

                      {isTwoDLaser && (
                        <div>
                          <label>Menge</label>
                          <input
                            type="number"
                            min="1"
                            step={item.order_unit === 'kg' ? '0.01' : '1'}
                            value={item.quantity || ''}
                            onChange={e => setEditItem(index, 'quantity', e.target.value)}
                            required
                          />
                        </div>
                      )}

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
                          <ActionIconButton action="delete" label={`Position ${index + 1} entfernen`} onClick={() => removeEditItem(index)} />
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
                    <ActionIconButton action="delete" label="Ausschuss löschen" onClick={() => deleteScrap(s)} />
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
                      <ActionIconButton action="edit" label="Wareneingang bearbeiten" onClick={() => startEditReceipt(r)} />
                      <ActionIconButton action="delete" label="Wareneingang löschen" onClick={() => deleteReceipt(r)} />
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
