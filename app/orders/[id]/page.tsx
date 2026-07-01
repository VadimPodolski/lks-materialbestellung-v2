'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'
import {
  OrderItem,
  emptyOrderItem,
  mergeOrderItems,
  normalizeOrderItems,
  orderItemsMailText,
  orderItemsSelect,
  orderItemsTotal,
  primaryOrderItem
} from '@/lib/orderItems'

type Order = {
  id: string
  order_number: string
  customer: string
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  status: string
  desired_delivery_date: string | null
  notes: string | null
  supplier_id: string | null
  suppliers: { name: string; email: string } | null
  order_items?: OrderItem[] | null
  ordered_at: string | null
  supplier_order_pdf_name: string | null
  supplier_order_pdf_url: string | null
  supplier_order_pdf_path: string | null
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
type MasterData = { id: string; name: string }
type ReceiptDraft = { quantity: string; deliveryNote: string; notes: string }
type ScrapDraft = { quantity: string; reason: string }

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [scraps, setScraps] = useState<Scrap[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<MasterData[]>([])
  const [crossSections, setCrossSections] = useState<MasterData[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    customer: '',
    supplier_id: '',
    desired_delivery_date: '',
    notes: ''
  })
  const [editItems, setEditItems] = useState<OrderItem[]>([emptyOrderItem()])

  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, ReceiptDraft>>({})
  const [scrapDrafts, setScrapDrafts] = useState<Record<string, ScrapDraft>>({})
  const [selectedScrapIds, setSelectedScrapIds] = useState<string[]>([])

  const [editingReceiptId, setEditingReceiptId] = useState('')
  const [editReceiptQty, setEditReceiptQty] = useState('')
  const [editReceiptNote, setEditReceiptNote] = useState('')
  const [editReceiptComment, setEditReceiptComment] = useState('')

  const [isPdfDragging, setIsPdfDragging] = useState(false)
  const [isPdfUploading, setIsPdfUploading] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()

    const [
      { data: orderData },
      { data: receiptData },
      { data: scrapData },
      { data: supplierData },
      { data: materialData },
      { data: crossData }
    ] = await Promise.all([
      supabase
        .from('material_orders')
        .select(`*,suppliers(name,email),order_items(${orderItemsSelect})`)
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

      supabase.from('suppliers').select('id,name,email').order('name'),
      supabase.from('materials').select('id,name').order('name'),
      supabase.from('cross_sections').select('id,name').order('name')
    ])

    const loadedOrder = orderData as any

    setOrder(loadedOrder)
    setReceipts(receiptData || [])
    setScraps((scrapData as any) || [])
    setSuppliers(supplierData || [])
    setMaterials(materialData || [])
    setCrossSections(crossData || [])

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (user) {
      const { data: profileById } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const { data: profileByEmail } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', user.email)
        .maybeSingle()

      setIsAdmin(
        profileById?.role === 'admin' ||
        profileByEmail?.role === 'admin'
      )
    } else {
      setIsAdmin(false)
    }

    if (loadedOrder) {
      const loadedItems = normalizeOrderItems(loadedOrder)

      setEditForm({
        customer: loadedOrder.customer || '',
        supplier_id: loadedOrder.supplier_id || supplierData?.[0]?.id || '',
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

  function setEdit(k: string, v: string) {
    setEditForm(prev => ({ ...prev, [k]: v }))
  }

  function setEditItem(index: number, key: 'material' | 'cross_section' | 'length_mm' | 'quantity', value: string) {
    setEditItems(prev => prev.map((item, itemIndex) => {
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

  function addEditItem() {
    const last = editItems[editItems.length - 1] || emptyOrderItem()

    setEditItems(prev => [
      ...prev,
      {
        ...emptyOrderItem(),
        material: last.material,
        cross_section: last.cross_section,
        length_mm: last.length_mm
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

  async function sendOrderEmail() {
    if (!order || !order.suppliers?.email) {
      setMsg('Keine Lieferanten-E-Mail vorhanden.')
      return
    }

    setMsg('Bestellung wird per E-Mail versendet...')

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
    const cleanItems = mergeOrderItems(editItems.map(item => ({
      material: item.material.trim(),
      cross_section: item.cross_section.trim(),
      length_mm: item.length_mm ? Number(item.length_mm) : null,
      quantity: Number(item.quantity)
    })))

    if (cleanItems.some(item => !item.material || !item.cross_section || !item.quantity || item.quantity < 1)) {
      return setMsg('Bitte jede Position mit Material, Querschnitt und Stückzahl ausfüllen.')
    }

    const firstItem = primaryOrderItem(cleanItems)
    const totalQuantity = orderItemsTotal(cleanItems)

    const { error } = await supabase
      .from('material_orders')
      .update({
        customer: editForm.customer,
        supplier_id: editForm.supplier_id || null,
        material: firstItem.material,
        cross_section: firstItem.cross_section,
        length_mm: firstItem.length_mm,
        quantity: totalQuantity,
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
        cross_section: item.cross_section,
        length_mm: item.length_mm,
        quantity: item.quantity,
        position: index + 1
      }))
    )

    if (itemError) return setMsg(itemError.message)

    await recalculateStatus(order.id, totalQuantity)
    setEditing(false)
    await load()
    setMsg('Änderungen wurden gespeichert.')
  }

  async function markOrdered() {
    if (!order) return

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

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

      return {
        material: scrap.material || fallbackItem.material,
        cross_section: scrap.cross_section || fallbackItem.cross_section,
        length_mm: scrap.length_mm ?? fallbackItem.length_mm,
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
        cross_section: item.cross_section,
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

  async function uploadSupplierOrderPdf(file: File) {
    if (!order) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMsg('Bitte eine PDF-Datei hochladen.')
      return
    }

    setIsPdfUploading(true)
    setMsg('')

    const supabase = createClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${order.id}/${Date.now()}-${safeName}`

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

    const { error: updateError } = await supabase
      .from('material_orders')
      .update({
        supplier_order_pdf_name: file.name,
        supplier_order_pdf_path: path,
        supplier_order_pdf_url: publicData.publicUrl
      })
      .eq('id', order.id)

    setIsPdfUploading(false)

    if (updateError) {
      setMsg(updateError.message)
      return
    }

    await load()
    setMsg('AB-PDF wurde hochgeladen.')
  }

  function handlePdfDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsPdfDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      uploadSupplierOrderPdf(file)
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
    const supabase = createClient()

    if (!order || !confirm('Bestellung wirklich stornieren?')) return

    await supabase
      .from('material_orders')
      .update({ status: 'storniert' })
      .eq('id', order.id)

    await load()
  }

  async function deleteOrder() {
    if (!order) return

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

    await supabase
      .from('material_orders')
      .delete()
      .eq('id', order.id)

    router.push('/orders')
  }

  if (!order) {
    return (
      <main className="container wide">
        <p>Lade Bestellung...</p>
      </main>
    )
  }

  return (
    <main className="container wide">
      <button className="secondary" onClick={() => router.push('/orders')}>
        Zurück
      </button>

      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h1>
          Auftrag {order.order_number} — {order.customer}
        </h1>

        <button
          type="button"
          className="secondary"
          onClick={() => setEditing(true)}
        >
          ✏️ Bearbeiten
        </button>
      </div>

      <div className="card">
        {!editing ? (
          <>
            <p>
              <span className={statusClass(order.status)}>
                {statusLabels[order.status]}
              </span>
            </p>

            <div className="order-items-table">
              <table className="position-entry-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Material</th>
                    <th>Querschnitt</th>
                    <th>Länge</th>
                    <th>Stückzahl</th>
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
                        <td>{item.cross_section}</td>
                        <td>{item.length_mm || '-'} mm</td>
                        <td>{item.quantity}</td>
                        <td className={receivedQtyForItem(item) >= item.quantity ? 'qty-delivered complete' : receivedQtyForItem(item) > 0 ? 'qty-delivered partial' : ''}>
                          {receivedQtyForItem(item)}
                        </td>
                        <td className="we-block">
                          <input
                            type="number"
                            min="1"
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

            <div className="grid">
              <p><b>Gesamtstückzahl:</b><br />{orderItemsTotal(orderItems)}</p>
              <p><b>Liefertermin:</b><br />{order.desired_delivery_date || '-'}</p>
              <p><b>Geliefert:</b><br />{receivedSum} / {orderItemsTotal(orderItems)}</p>
              <p><b>Ausschuss:</b><br />{scrapSum}</p>
              <p>
                <b>Lieferant:</b>
                <br />
                {order.suppliers?.name || '-'}
                <br />
                {order.suppliers?.email || ''}
              </p>
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
              <div className="pdf-dropzone-content">
                {order.supplier_order_pdf_url ? (
                  <a
                    className="pdf-preview"
                    href={order.supplier_order_pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    title={order.supplier_order_pdf_name || 'AB-PDF öffnen'}
                  >
                    <iframe
                      src={`${order.supplier_order_pdf_url}#toolbar=0&navpanes=0&scrollbar=0`}
                      title={order.supplier_order_pdf_name || 'AB-PDF'}
                    />
                    <span>{order.supplier_order_pdf_name || 'AB-PDF'}</span>
                  </a>
                ) : (
                  <div>
                    <b>AB vom Lieferanten</b>
                    <p className="small">PDF hier ablegen oder auswählen</p>
                  </div>
                )}
              </div>

              <div className="actions">
                <label className="button">
                  {isPdfUploading ? 'Lädt...' : 'PDF wählen'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    disabled={isPdfUploading}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        uploadSupplierOrderPdf(file)
                      }
                      e.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
          </>
        ) : (
          <form className="grid" onSubmit={saveEdit}>
            <div>
              <label>Kunde</label>
              <input
                value={editForm.customer}
                onChange={e => setEdit('customer', e.target.value)}
                required
              />
            </div>

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

            <div style={{ gridColumn: '1/-1' }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <h2>Positionen</h2>
                <button type="button" onClick={addEditItem}>+ Position</button>
              </div>

              <div className="order-items">
                {editItems.map((item, index) => (
                  <div className="order-item" key={index}>
                    <div className="order-item-row">
                      <div className="order-item-title">
                        <b>Position {index + 1}</b>
                      </div>

                      <div>
                        <label>Material</label>
                        <select
                          value={item.material}
                          onChange={e => setEditItem(index, 'material', e.target.value)}
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
                        <label>Querschnitt</label>
                        <select
                          value={item.cross_section}
                          onChange={e => setEditItem(index, 'cross_section', e.target.value)}
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
                        <label>Länge mm</label>
                        <input
                          type="number"
                          value={item.length_mm || ''}
                          onChange={e => setEditItem(index, 'length_mm', e.target.value)}
                        />
                      </div>

                      <div>
                        <label>Stückzahl</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={e => setEditItem(index, 'quantity', e.target.value)}
                          required
                        />
                      </div>

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

              <p className="small">Gesamtstückzahl: {orderItemsTotal(editItems)}</p>
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
