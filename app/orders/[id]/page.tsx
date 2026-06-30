'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient, statusClass, statusLabels } from '@/lib/supabase'

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
  ordered_at: string | null
}

type Receipt = {
  id: string
  received_quantity: number
  delivery_note_number: string | null
  notes: string | null
  received_at: string
}

type Scrap = {
  id: string
  quantity: number
  reason: string | null
  reordered: boolean | null
  created_at: string
}

type Supplier = { id: string; name: string; email: string }
type MasterData = { id: string; name: string }

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
    material: '',
    cross_section: '',
    length_mm: '',
    quantity: '',
    desired_delivery_date: '',
    notes: ''
  })

  const [receivedQuantity, setReceivedQuantity] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')

  const [scrapQuantity, setScrapQuantity] = useState('')
  const [scrapReason, setScrapReason] = useState('')

  const [editingReceiptId, setEditingReceiptId] = useState('')
  const [editReceiptQty, setEditReceiptQty] = useState('')
  const [editReceiptNote, setEditReceiptNote] = useState('')
  const [editReceiptComment, setEditReceiptComment] = useState('')

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
        .select('*,suppliers(name,email)')
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
      setEditForm({
        customer: loadedOrder.customer || '',
        supplier_id: loadedOrder.supplier_id || '',
        material: loadedOrder.material || '',
        cross_section: loadedOrder.cross_section || '',
        length_mm: loadedOrder.length_mm ? String(loadedOrder.length_mm) : '',
        quantity: loadedOrder.quantity ? String(loadedOrder.quantity) : '1',
        desired_delivery_date: loadedOrder.desired_delivery_date || '',
        notes: loadedOrder.notes || ''
      })
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

  function setEdit(k: string, v: string) {
    setEditForm(prev => ({ ...prev, [k]: v }))
  }

  function mailto() {
    if (!order || !order.suppliers?.email) return '#'

    const subject = `Materialbestellung LKS - Auftrag ${order.order_number}`
    const body = `Sehr geehrte Damen und Herren,

bitte liefern Sie uns folgendes Material:

Auftrag: ${order.order_number}
Kunde: ${order.customer}
Material: ${order.material}
Querschnitt: ${order.cross_section}
Länge: ${order.length_mm || '-'} mm
Stückzahl: ${order.quantity}

Gewünschter Liefertermin: ${order.desired_delivery_date || '-'}

Mit freundlichen Grüßen
LKS-Technik GmbH & Co. KG`

    return `mailto:${order.suppliers.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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

    const { error } = await supabase
      .from('material_orders')
      .update({
        customer: editForm.customer,
        supplier_id: editForm.supplier_id || null,
        material: editForm.material,
        cross_section: editForm.cross_section,
        length_mm: editForm.length_mm ? Number(editForm.length_mm) : null,
        quantity: Number(editForm.quantity),
        desired_delivery_date: editForm.desired_delivery_date || null,
        notes: editForm.notes || null
      })
      .eq('id', order.id)

    if (error) return setMsg(error.message)

    await recalculateStatus(order.id, Number(editForm.quantity))
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

  async function receiveGoods(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return

    const supabase = createClient()
    const qty = Number(receivedQuantity)

    if (!qty || qty < 1) {
      return setMsg('Bitte gelieferte Stückzahl eingeben.')
    }

    const { data: userData } = await supabase.auth.getUser()

    await supabase.from('goods_receipts').insert({
      material_order_id: order.id,
      received_quantity: qty,
      delivery_note_number: deliveryNote || null,
      notes: receiptNotes || null,
      received_by: userData.user?.id || null
    })

    await recalculateStatus(order.id, order.quantity)

    setReceivedQuantity('')
    setDeliveryNote('')
    setReceiptNotes('')

    await load()
    setMsg('Wareneingang wurde gebucht.')
  }

  async function bookScrap(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const qty = Number(scrapQuantity)

    if (!qty || qty < 1) {
      return setMsg('Bitte Ausschussmenge eingeben.')
    }

    const { error } = await supabase.from('scrap_items').insert({
      material_order_id: order.id,
      quantity: qty,
      reason: scrapReason || null,
      created_by: userData.user?.id || null,
      reordered: false
    })

    if (error) {
      setMsg(error.message)
      return
    }

    setScrapQuantity('')
    setScrapReason('')

    await load()
    setMsg('Ausschuss wurde gebucht.')
  }

  async function reorderScrap(scrap: Scrap) {
    if (!order) return

    if (!confirm(`${scrap.quantity} Stück aus Ausschuss nachbestellen?`)) {
      return
    }

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('material_orders')
      .insert({
        order_number: `${order.order_number}-NB`,
        customer: order.customer,
        material: order.material,
        cross_section: order.cross_section,
        length_mm: order.length_mm,
        quantity: scrap.quantity,
        supplier_id: order.supplier_id,
        desired_delivery_date: order.desired_delivery_date,
        status: 'offen',
        notes: `Nachbestellung aus Ausschuss (${scrap.quantity} Stück)\nGrund: ${scrap.reason || '-'}`,
        created_by: userData.user?.id || null
      })
      .select('id')
      .single()

    if (error) {
      setMsg(error.message)
      return
    }

    await supabase
      .from('scrap_items')
      .update({ reordered: true })
      .eq('id', scrap.id)

    await load()
    setMsg('Nachbestellung wurde erzeugt.')
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
    await recalculateStatus(order.id, order.quantity)
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

    await recalculateStatus(order.id, order.quantity)
    await load()
    setMsg('Wareneingang wurde gelöscht.')
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
      <main className="container">
        <p>Lade Bestellung...</p>
      </main>
    )
  }

  return (
    <main className="container">
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

            <div className="grid">
              <p><b>Material:</b><br />{order.material}</p>
              <p><b>Querschnitt:</b><br />{order.cross_section}</p>
              <p><b>Länge:</b><br />{order.length_mm || '-'} mm</p>
              <p><b>Stückzahl:</b><br />{order.quantity}</p>
              <p><b>Liefertermin:</b><br />{order.desired_delivery_date || '-'}</p>
              <p><b>Geliefert:</b><br />{receivedSum} / {order.quantity}</p>
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
              <a className="button" href={mailto()} onClick={markOrdered}>
                Bestellung senden
              </a>

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

            <div>
              <label>Material</label>
              <select
                value={editForm.material}
                onChange={e => setEdit('material', e.target.value)}
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
                value={editForm.cross_section}
                onChange={e => setEdit('cross_section', e.target.value)}
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
                value={editForm.length_mm}
                onChange={e => setEdit('length_mm', e.target.value)}
              />
            </div>

            <div>
              <label>Stückzahl</label>
              <input
                type="number"
                min="1"
                value={editForm.quantity}
                onChange={e => setEdit('quantity', e.target.value)}
                required
              />
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
        <h2>Wareneingang buchen</h2>

        <form className="grid" onSubmit={receiveGoods}>
          <div>
            <label>Gelieferte Stückzahl</label>
            <input
              type="number"
              min="1"
              value={receivedQuantity}
              onChange={e => setReceivedQuantity(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Lieferscheinnummer</label>
            <input
              value={deliveryNote}
              onChange={e => setDeliveryNote(e.target.value)}
            />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label>Bemerkung</label>
            <textarea
              value={receiptNotes}
              onChange={e => setReceiptNotes(e.target.value)}
            />
          </div>

          <button>Wareneingang buchen</button>
        </form>
      </div>

      <div className="card">
        <h2>Ausschuss melden</h2>

        <form className="grid" onSubmit={bookScrap}>
          <div>
            <label>Ausschuss Stückzahl</label>
            <input
              type="number"
              min="1"
              value={scrapQuantity}
              onChange={e => setScrapQuantity(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Grund</label>
            <input
              value={scrapReason}
              onChange={e => setScrapReason(e.target.value)}
              placeholder="Rohr verbogen, falsch geschnitten ..."
            />
          </div>

          <button style={{ alignSelf: 'end' }}>Ausschuss buchen</button>
        </form>
      </div>

      <div className="card">
        <h2>Ausschuss</h2>

        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Stückzahl</th>
              <th>Grund</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>

          <tbody>
            {scraps.map(s => (
              <tr key={s.id}>
                <td>{new Date(s.created_at).toLocaleString('de-DE')}</td>
                <td>{s.quantity}</td>
                <td>{s.reason || '-'}</td>
                <td>{s.reordered ? 'Nachbestellt' : 'Offen'}</td>
                <td>
                  {!s.reordered && (
                    <button
                      type="button"
                      onClick={() => reorderScrap(s)}
                    >
                      Nachbestellen
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
