'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ensureCurrentUserProfile } from '@/lib/profiles'

type Suggestion = {
  orderId: string
  orderNumber: string
  confidence: number
  matchedFields: string[]
}

type InboundAttachment = {
  id: string
  sender_email: string | null
  sender_name: string | null
  subject: string | null
  received_at: string | null
  file_name: string
  file_path: string
  file_url: string
  status: 'review' | 'assigned' | 'ignored' | 'failed'
  matched_order_id: string | null
  confidence: number
  error_message: string | null
  match_details: {
    extractedOrderNumbers?: string[]
    suggestions?: Suggestion[]
    documentType?: 'supplier_confirmation' | 'supplier_quote' | null
  } | null
  material_orders: { order_number: string } | null
}

type OrderOption = {
  id: string
  order_number: string
}

const statusLabels: Record<InboundAttachment['status'], string> = {
  review: 'Zuordnung prüfen',
  assigned: 'Zugeordnet',
  ignored: 'Ignoriert',
  failed: 'Fehler'
}

export default function InboundEmailPage() {
  const [attachments, setAttachments] = useState<InboundAttachment[]>([])
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [privateFileUrls, setPrivateFileUrls] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<InboundAttachment['status'] | 'all'>('review')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: attachmentData, error }, { data: orderData }, { data: userData }] = await Promise.all([
      supabase
        .from('inbound_email_attachments')
        .select('*,material_orders(order_number)')
        .order('created_at', { ascending: false }),
      supabase
        .from('material_orders')
        .select('id,order_number')
        .neq('status', 'storniert')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.auth.getUser()
    ])

    if (error) {
      setMsg(error.message)
      setLoading(false)
      return
    }

    const rows = (attachmentData as InboundAttachment[]) || []
    setAttachments(rows)
    setOrders((orderData as OrderOption[]) || [])
    setSelection(current => {
      const next = { ...current }
      rows.forEach(row => {
        if (!next[row.id]) next[row.id] = row.match_details?.suggestions?.[0]?.orderId || ''
      })
      return next
    })

    const privateFiles = rows.filter(row => row.file_path && row.status !== 'assigned')
    const signedFiles = await Promise.all(privateFiles.map(async row => {
      const { data } = await supabase.storage
        .from('inbound-email-pdfs')
        .createSignedUrl(row.file_path, 60 * 60)
      return [row.id, data?.signedUrl || ''] as const
    }))
    setPrivateFileUrls(Object.fromEntries(signedFiles))

    const user = userData.user
    if (user) {
      const profile = await ensureCurrentUserProfile(supabase, user)
      setIsAdmin(profile?.role === 'admin' || user.email?.toLowerCase() === 'v.podolski@lks-technik.de')
    }
    setLoading(false)
  }

  async function syncMailbox() {
    setSyncing(true)
    setMsg('Einkaufspostfach wird geprüft...')
    const response = await fetch('/api/inbound-email/sync', { method: 'POST' })
    const data = await response.json()

    if (!response.ok) {
      setMsg(data.error || 'Einkaufspostfach konnte nicht geprüft werden.')
      setSyncing(false)
      return
    }

    const result = data.result
    setMsg(`${result.checkedEmails} E-Mails geprüft: ${result.assigned} automatisch zugeordnet, ${result.review} zur Prüfung.`)
    setSyncing(false)
    await load()
  }

  async function assign(attachment: InboundAttachment) {
    const orderId = selection[attachment.id]
    if (!orderId) return setMsg('Bitte zuerst einen Auftrag auswählen.')

    const response = await fetch('/api/inbound-email/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId: attachment.id, orderId })
    })
    const data = await response.json()

    if (!response.ok) return setMsg(data.error || 'PDF konnte nicht zugeordnet werden.')
    setMsg(`PDF wurde ${data.orderNumber} als Lieferanten-AB zugeordnet.`)
    await load()
  }

  async function ignore(attachment: InboundAttachment) {
    const supabase = createClient()
    const { error } = await supabase
      .from('inbound_email_attachments')
      .update({ status: 'ignored', updated_at: new Date().toISOString() })
      .eq('id', attachment.id)

    if (error) return setMsg(error.message)
    await load()
  }

  const filtered = useMemo(
    () => status === 'all' ? attachments : attachments.filter(item => item.status === status),
    [attachments, status]
  )

  const reviewCount = attachments.filter(item => item.status === 'review').length

  return (
    <main className="container wide inbound-email-page">
      <div className="order-page-heading">
        <div>
          <h1>E-Mail-Zuordnung</h1>
          <p className="small">Lieferanten-Auftragsbestätigungen und Angebote aus einkauf@lks-technik.de</p>
        </div>
        <div className="actions">
          {isAdmin && (
            <button type="button" onClick={syncMailbox} disabled={syncing}>
              {syncing ? 'Postfach wird geprüft...' : 'Postfach jetzt prüfen'}
            </button>
          )}
        </div>
      </div>

      {msg && <p className="message">{msg}</p>}

      <div className="card inbound-email-filters">
        <div>
          <label>Status</label>
          <select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
            <option value="review">Zuordnung prüfen ({reviewCount})</option>
            <option value="assigned">Zugeordnet</option>
            <option value="failed">Fehler</option>
            <option value="ignored">Ignoriert</option>
            <option value="all">Alle</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card">E-Mail-Anhänge werden geladen...</div>
      ) : filtered.length === 0 ? (
        <div className="card inbound-email-empty">Keine E-Mail-Anhänge in dieser Ansicht.</div>
      ) : (
        <div className="inbound-email-list">
          {filtered.map(attachment => {
            const suggestions = attachment.match_details?.suggestions || []
            const isQuote = attachment.match_details?.documentType === 'supplier_quote'
              || /\bKAN\s*[-:]?\s*\d+/i.test(`${attachment.subject || ''} ${attachment.file_name}`)
            return (
              <article className="card inbound-email-card" key={attachment.id}>
                <div className="inbound-email-card-main">
                  <div>
                    <span className={`inbound-email-status ${attachment.status}`}>{statusLabels[attachment.status]}</span>
                    <h2>{attachment.subject || 'Ohne Betreff'}</h2>
                    <p>
                      {attachment.sender_name || attachment.sender_email || 'Unbekannter Absender'}
                      {attachment.sender_name && attachment.sender_email ? ` · ${attachment.sender_email}` : ''}
                    </p>
                    <small>{attachment.received_at ? new Date(attachment.received_at).toLocaleString('de-DE') : '-'}</small>
                  </div>
                  <div className="inbound-email-file">
                    {(privateFileUrls[attachment.id] || attachment.file_url) ? (
                      <a href={privateFileUrls[attachment.id] || attachment.file_url} target="_blank" rel="noreferrer">PDF öffnen</a>
                    ) : (
                      <span>Keine PDF verfügbar</span>
                    )}
                    <strong>{attachment.file_name}</strong>
                  </div>
                </div>

                {attachment.status === 'review' && (
                  <div className="inbound-email-match">
                    <div className="inbound-email-suggestions">
                      <strong>Erkannte Übereinstimmungen</strong>
                      {suggestions.length > 0 ? suggestions.slice(0, 3).map(suggestion => (
                        <div key={suggestion.orderId}>
                          <b>{suggestion.orderNumber}</b>
                          <span>{suggestion.confidence}% · {suggestion.matchedFields.join(', ') || 'wenige Merkmale'}</span>
                        </div>
                      )) : <span>Kein passender Auftrag erkannt.</span>}
                    </div>

                    {isAdmin && (
                      <div className="inbound-email-assign">
                        <label>Auftrag auswählen</label>
                        <select
                          value={selection[attachment.id] || ''}
                          onChange={event => setSelection(current => ({ ...current, [attachment.id]: event.target.value }))}
                        >
                          <option value="">Bitte auswählen</option>
                          {orders.map(order => (
                            <option key={order.id} value={order.id}>{order.order_number}</option>
                          ))}
                        </select>
                        <div className="actions">
                          <button type="button" onClick={() => assign(attachment)}>
                            Als {isQuote ? 'Lieferanten-Angebot' : 'Lieferanten-Auftragsbestätigung'} zuordnen
                          </button>
                          <button type="button" className="secondary" onClick={() => ignore(attachment)}>Ignorieren</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {attachment.status === 'assigned' && attachment.material_orders && (
                  <p className="inbound-email-assigned">
                    Zugeordnet zu <Link href={`/orders/${attachment.matched_order_id}`}>{attachment.material_orders.order_number}</Link>
                  </p>
                )}

                {attachment.error_message && <p className="error">{attachment.error_message}</p>}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
