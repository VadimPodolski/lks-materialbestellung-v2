'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

type AuditEntry = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  action: AuditAction
  table_name: string
  record_id: string | null
  order_id: string | null
  order_number: string | null
  area: string | null
  changed_fields: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  is_reconstructed: boolean
}

type DisplayAuditEntry = AuditEntry & { repeatCount?: number }

const ENTRIES_PER_PAGE = 50
const VISIBLE_PAGE_BUTTONS = 15

const tableLabels: Record<string, string> = {
  material_orders: 'Auftrag',
  order_items: 'Auftragsposition',
  goods_receipts: 'Wareneingang',
  scrap_items: 'Ausschuss',
  order_pdfs: 'PDF',
  customers: 'Kunde',
  suppliers: 'Lieferant',
  materials: 'Material',
  material_thicknesses: 'Materialstärke',
  cross_sections: 'Querschnitt',
  work_preparations: 'Arbeitsvorbereitung',
  formats: 'Format',
  packaging_defaults: 'Verpackungsvorgabe',
  profiles: 'Benutzer',
  inbound_email_attachments: 'E-Mail-Anhang'
}

const fieldLabels: Record<string, string> = {
  order_number: 'Auftragsnummer',
  order_area: 'Bereich',
  customer: 'Kunde',
  customer_delivery_date: 'K-Liefertermin',
  desired_delivery_date: 'Liefertermin',
  status: 'Status',
  material: 'Material',
  material_thickness_mm: 'Materialstärke',
  cross_section: 'Querschnitt',
  length_mm: 'Länge',
  quantity: 'Menge',
  order_unit: 'Bestelleinheit',
  pieces_per_package: 'Stück je Paket',
  position: 'Position',
  unit_price_eur: 'Einzelpreis',
  line_total_eur: 'Positionspreis',
  price_quantity: 'Preismenge',
  price_unit: 'Preiseinheit',
  supplier_id: 'Lieferant',
  received_quantity: 'Gelieferte Menge',
  delivery_note_number: 'Lieferscheinnummer',
  reason: 'Grund',
  notes: 'Bemerkung',
  file_name: 'Dateiname',
  document_type: 'Dokumentart',
  price_import_status: 'Preisimport',
  price_import_message: 'Ergebnis der Preisprüfung',
  prices_imported_at: 'Preise übernommen am',
  full_name: 'Name',
  email: 'E-Mail',
  role: 'Rolle',
  approved: 'Freigabe',
  name: 'Bezeichnung',
  phone: 'Telefon',
  contact_person: 'Ansprechpartner'
}

const hiddenFields = new Set([
  'id', 'material_order_id', 'order_item_id', 'created_by', 'ordered_by',
  'created_at', 'updated_at', 'ordered_at', 'file_url', 'file_path',
  'supplier_order_pdf_url', 'supplier_order_pdf_path', 'price_import_data'
])

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function formatValue(value: unknown, field = '') {
  if (value == null || value === '') return '–'
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (field === 'price_import_status' && typeof value === 'string') {
    return ({ pending: 'Wartet', processing: 'Wird geprüft', imported: 'Erfolgreich', failed: 'Fehlgeschlagen' } as Record<string, string>)[value] || value
  }
  if ((field.endsWith('_at') || field === 'occurred_at') && typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return formatDateTime(value)
  }
  if (field.endsWith('_date') && typeof value === 'string') {
    const date = new Date(`${value}T00:00:00`)
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('de-DE').format(date)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function actionLabel(action: AuditAction) {
  if (action === 'INSERT') return 'Erstellt'
  if (action === 'DELETE') return 'Gelöscht'
  return 'Geändert'
}

function entryActionLabel(entry: AuditEntry) {
  const table = tableLabels[entry.table_name] || 'Datensatz'
  if (entry.table_name === 'order_pdfs') {
    if (entry.action === 'INSERT') return 'PDF hochgeladen'
    if (entry.action === 'DELETE') return 'PDF gelöscht'
    const status = entry.new_data?.price_import_status
    if (status === 'failed') return 'Preisprüfung fehlgeschlagen'
    if (status === 'imported') return 'Preise übernommen'
    if (status === 'processing') return 'Preisprüfung gestartet'
    return 'PDF geändert'
  }
  if (entry.action === 'INSERT') return `${table} erstellt`
  if (entry.action === 'DELETE') return `${table} gelöscht`
  return `${table} geändert`
}

function compactAuditEntries(entries: AuditEntry[]): DisplayAuditEntry[] {
  const compacted: DisplayAuditEntry[] = []

  for (const entry of entries) {
    const technicalPdfProcessing = entry.table_name === 'order_pdfs'
      && entry.action === 'UPDATE'
      && entry.new_data?.price_import_status === 'processing'
    if (technicalPdfProcessing) continue

    const previous = compacted[compacted.length - 1]
    const samePdfResult = previous
      && entry.table_name === 'order_pdfs'
      && previous.table_name === 'order_pdfs'
      && entry.action === 'UPDATE'
      && previous.action === 'UPDATE'
      && entry.record_id === previous.record_id
      && entry.new_data?.price_import_status === previous.new_data?.price_import_status
      && entry.new_data?.price_import_message === previous.new_data?.price_import_message
      && Math.abs(new Date(previous.occurred_at).getTime() - new Date(entry.occurred_at).getTime()) <= 10 * 60 * 1000

    if (samePdfResult) {
      previous.repeatCount = (previous.repeatCount || 1) + 1
      continue
    }

    compacted.push({ ...entry, repeatCount: 1 })
  }

  return compacted
}

function areaLabel(area: string | null) {
  if (area === 'rohrlaser') return 'Rohrlaser'
  if (area === '2d-laser') return '2D-Laser'
  if (area === 'administration') return 'Administration'
  if (area === 'email-import') return 'E-Mail-Import'
  if (area === 'stammdaten') return 'Stammdaten'
  return area || 'Allgemein'
}

function entryData(entry: AuditEntry) {
  return (entry.action === 'DELETE' ? entry.old_data : entry.new_data) || {}
}

function recordLabel(entry: AuditEntry) {
  const data = entryData(entry)
  const table = tableLabels[entry.table_name] || entry.table_name

  if (entry.table_name === 'material_orders') {
    return `${data.order_number || entry.order_number || 'Auftrag'}${data.customer ? ` · ${data.customer}` : ''}`
  }
  if (entry.table_name === 'order_items') {
    return `Pos. ${data.position || '–'} · ${data.material || ''} ${data.cross_section || ''}`.trim()
  }
  if (entry.table_name === 'goods_receipts') return `Lieferschein ${data.delivery_note_number || '–'}`
  if (entry.table_name === 'scrap_items') return `${data.quantity || '–'} Stück · ${data.reason || 'ohne Grund'}`
  if (entry.table_name === 'order_pdfs') return String(data.file_name || 'PDF')
  if (entry.table_name === 'profiles') return String(data.full_name || data.email || 'Benutzer')
  if (data.name) return String(data.name)
  return `${table}${entry.record_id ? ` · ${entry.record_id}` : ''}`
}

function changedRows(entry: AuditEntry) {
  const oldData = entry.old_data || {}
  const newData = entry.new_data || {}
  const fields = entry.action === 'UPDATE'
    ? (entry.changed_fields || [])
    : Object.keys(entryData(entry))

  return fields
    .filter(field => !hiddenFields.has(field))
    .slice(0, 12)
    .map(field => ({
      field,
      label: fieldLabels[field] || field.replaceAll('_', ' '),
      before: entry.action === 'INSERT' ? null : oldData[field],
      after: entry.action === 'DELETE' ? null : newData[field]
    }))
}

export default function AuditLogPage() {
  const router = useRouter()
  const tableTopRef = useRef<HTMLDivElement>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<'all' | AuditAction>('all')
  const [area, setArea] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (!user) {
      router.replace('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      router.replace('/')
      return
    }

    const allEntries: AuditEntry[] = []
    const pageSize = 1000
    let loadError = ''

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (error) {
        loadError = error.message
        break
      }

      const page = (data as AuditEntry[] | null) || []
      allEntries.push(...page)
      if (page.length < pageSize) break
    }

    if (loadError) setMessage(loadError)
    else setMessage('')
    setEntries(allEntries)
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const areas = useMemo(() => (
    Array.from(new Set(entries.map(entry => entry.area || 'allgemein')))
      .sort((a, b) => areaLabel(a).localeCompare(areaLabel(b), 'de-DE'))
  ), [entries])

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE')
    return compactAuditEntries(entries).filter(entry => {
      const data = entryData(entry)
      const searchable = [
        entry.actor_name,
        entry.actor_email,
        entry.order_number,
        tableLabels[entry.table_name],
        recordLabel(entry),
        areaLabel(entry.area),
        JSON.stringify(data)
      ].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')

      return (!query || searchable.includes(query))
        && (action === 'all' || entry.action === action)
        && (area === 'all' || (entry.area || 'allgemein') === area)
    })
  }, [action, area, entries, search])

  const totals = useMemo(() => ({
    insert: visibleEntries.filter(entry => entry.action === 'INSERT').length,
    update: visibleEntries.filter(entry => entry.action === 'UPDATE').length,
    delete: visibleEntries.filter(entry => entry.action === 'DELETE').length
  }), [visibleEntries])

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / ENTRIES_PER_PAGE))
  const pageStart = (currentPage - 1) * ENTRIES_PER_PAGE
  const paginatedEntries = visibleEntries.slice(pageStart, pageStart + ENTRIES_PER_PAGE)
  const visiblePageNumbers = useMemo(() => {
    const visibleCount = Math.min(VISIBLE_PAGE_BUTTONS, totalPages)
    const maximumStart = Math.max(1, totalPages - visibleCount + 1)
    const start = Math.min(maximumStart, Math.max(1, currentPage - Math.floor(visibleCount / 2)))
    return Array.from({ length: visibleCount }, (_, index) => start + index)
  }, [currentPage, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, action, area])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  function goToPage(page: number) {
    setCurrentPage(Math.min(totalPages, Math.max(1, page)))
    window.requestAnimationFrame(() => {
      tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function pagination(position: 'top' | 'bottom') {
    if (loading || visibleEntries.length === 0) return null

    return (
      <nav className={`audit-pagination ${position}`} aria-label={`Seitennavigation des Protokolls ${position === 'top' ? 'oben' : 'unten'}`}>
        <span>
          {(pageStart + 1).toLocaleString('de-DE')}–{Math.min(pageStart + ENTRIES_PER_PAGE, visibleEntries.length).toLocaleString('de-DE')}
          {' '}von {visibleEntries.length.toLocaleString('de-DE')} Einträgen
        </span>
        <div>
          <button
            type="button"
            className="secondary"
            disabled={currentPage === 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            Zurück
          </button>
          <div className="audit-page-numbers" aria-label={`Seite ${currentPage} von ${totalPages}`}>
            {visiblePageNumbers.map(page => (
              <button
                key={page}
                type="button"
                className={page === currentPage ? 'active' : ''}
                aria-label={`Seite ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => goToPage(page)}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={currentPage === totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            Weiter
          </button>
        </div>
      </nav>
    )
  }

  return (
    <main className="container wide audit-page">
      <div className="audit-page-heading">
        <div>
          <span className="audit-eyebrow">Administration</span>
          <h1>Änderungsprotokoll</h1>
          <p>Wer hat wann und in welchem Bereich Daten erstellt, geändert oder gelöscht?</p>
        </div>
        <button type="button" className="secondary" onClick={() => void load()}>Aktualisieren</button>
      </div>

      <section className="audit-summary" aria-label="Zusammenfassung">
        <div><span>Gefundene Einträge</span><strong>{visibleEntries.length.toLocaleString('de-DE')}</strong></div>
        <div className="created"><span>Erstellt</span><strong>{totals.insert.toLocaleString('de-DE')}</strong></div>
        <div className="updated"><span>Geändert</span><strong>{totals.update.toLocaleString('de-DE')}</strong></div>
        <div className="deleted"><span>Gelöscht</span><strong>{totals.delete.toLocaleString('de-DE')}</strong></div>
      </section>

      <section className="card audit-filters">
        <div>
          <label htmlFor="audit-search">Suche</label>
          <input
            id="audit-search"
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Benutzer, Auftrag, Datensatz oder Inhalt..."
          />
        </div>
        <div>
          <label htmlFor="audit-action">Aktion</label>
          <select id="audit-action" value={action} onChange={event => setAction(event.target.value as typeof action)}>
            <option value="all">Alle Aktionen</option>
            <option value="INSERT">Erstellt</option>
            <option value="UPDATE">Geändert</option>
            <option value="DELETE">Gelöscht</option>
          </select>
        </div>
        <div>
          <label htmlFor="audit-area">Bereich</label>
          <select id="audit-area" value={area} onChange={event => setArea(event.target.value)}>
            <option value="all">Alle Bereiche</option>
            {areas.map(item => <option key={item} value={item}>{areaLabel(item)}</option>)}
          </select>
        </div>
      </section>

      {message && <p className="msg error">{message}</p>}

      <div ref={tableTopRef} className="audit-page-top-anchor">
        {pagination('top')}
      </div>

      <div className="audit-table-shell">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Benutzer</th>
              <th>Aktion</th>
              <th>Wo</th>
              <th>Datensatz</th>
              <th>Was wurde geändert?</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntries.map(entry => {
              const changes = changedRows(entry)
              return (
                <tr key={entry.id}>
                  <td className="audit-time">{formatDateTime(entry.occurred_at)}</td>
                  <td>
                    <div className="audit-user">
                      <strong>{entry.actor_name || (entry.actor_email ? entry.actor_email.split('@')[0] : 'System')}</strong>
                      <span>{entry.actor_email || 'Automatischer Vorgang'}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`audit-action ${entry.action.toLowerCase()}`}>{entryActionLabel(entry)}</span>
                    {(entry.repeatCount || 1) > 1 && <span className="audit-repeat">{entry.repeatCount} gleiche Vorgänge zusammengefasst</span>}
                    {entry.is_reconstructed && <span className="audit-reconstructed">Historischer Bestand</span>}
                  </td>
                  <td>
                    <div className="audit-location">
                      <strong>{areaLabel(entry.area)}</strong>
                      <span>{tableLabels[entry.table_name] || entry.table_name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="audit-record">
                      <strong>{recordLabel(entry)}</strong>
                      {entry.order_number && entry.table_name !== 'material_orders' && (
                        entry.action === 'DELETE' || !entry.order_id
                          ? <span>{entry.order_number}</span>
                          : <Link href={`/orders/${entry.order_id}`}>{entry.order_number} öffnen</Link>
                      )}
                    </div>
                  </td>
                  <td>
                    {changes.length > 0 ? (
                      <details className="audit-changes">
                        <summary>{changes.length} {changes.length === 1 ? 'Angabe' : 'Angaben'}</summary>
                        <div className="audit-change-list">
                          {changes.map(change => (
                            <div key={change.field}>
                              <b>{change.label}</b>
                              {entry.action !== 'INSERT' && <span className="before">{formatValue(change.before, change.field)}</span>}
                              {entry.action === 'UPDATE' && <span aria-hidden="true">→</span>}
                              {entry.action !== 'DELETE' && <span className="after">{formatValue(change.after, change.field)}</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <span className="small">{actionLabel(entry.action)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && visibleEntries.length === 0 && (
          <div className="audit-empty">Noch keine passenden Protokolleinträge vorhanden.</div>
        )}
        {loading && <div className="audit-empty">Protokoll wird geladen...</div>}
      </div>

      {pagination('bottom')}
    </main>
  )
}
