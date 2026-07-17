import { createHash, randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import { matchInboundPdfToOrder, type InboundOrderCandidate } from '@/lib/inboundOrderMatcher'
import { isCronOrAdminRequest } from '@/lib/serverAdminAuth'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_EMAILS_PER_RUN = 50
const MAX_PDF_BYTES = 10 * 1024 * 1024
const LOOKBACK_DAYS = 14

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'auftragsbestaetigung.pdf'
}

function isoDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function looksLikeOrderConfirmation(subject: string, pdfText: string) {
  return /(?:auftragsbest[äa]tigung|order\s+confirmation|\bKAB\s*\d+)/i.test(`${subject}\n${pdfText}`)
}

function publicStorageUrl(bucket: string, path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) throw new Error('Supabase-URL fehlt.')

  return `${baseUrl}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}

async function syncInboundEmail(request: Request) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  const user = process.env.INBOUND_EMAIL_USER
  const password = process.env.INBOUND_EMAIL_PASSWORD
  const host = process.env.INBOUND_EMAIL_HOST || 'imap.ionos.de'
  const port = Number(process.env.INBOUND_EMAIL_PORT || 993)

  if (!user || !password) {
    return NextResponse.json(
      { error: 'Zugang zum Einkaufspostfach ist noch nicht konfiguriert.' },
      { status: 503 }
    )
  }

  const supabase = createAdminClient()
  const { data: orderRows, error: orderError } = await supabase
    .from('material_orders')
    .select('id,order_number,status,suppliers(email),order_items(material,cross_section,length_mm,quantity)')
    .neq('status', 'storniert')
    .order('created_at', { ascending: false })
    .limit(500)

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 })
  }

  const orders: InboundOrderCandidate[] = (orderRows || []).map((order: any) => ({
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    supplier_email: order.suppliers?.email || null,
    order_items: order.order_items || []
  }))

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass: password },
    logger: false,
    socketTimeout: 30_000
  })

  const result = {
    checkedEmails: 0,
    checkedPdfs: 0,
    assigned: 0,
    review: 0,
    skipped: 0,
    failed: 0
  }

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX', { description: 'LKS Lieferanten-AB Import' })

    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      const foundUids = await client.search({ since }, { uid: true })
      const uids = (foundUids || []).slice(-MAX_EMAILS_PER_RUN)

      for (const uid of uids) {
        const message = await client.fetchOne(String(uid), {
          uid: true,
          envelope: true,
          internalDate: true,
          source: { maxLength: 25 * 1024 * 1024 }
        }, { uid: true })

        if (!message || !message.source) continue
        result.checkedEmails += 1

        const parsed = await simpleParser(message.source, { skipImageLinks: true })
        const sender = parsed.from?.value?.[0]
        const senderEmail = sender?.address || message.envelope?.from?.[0]?.address || ''
        const senderName = sender?.name || message.envelope?.from?.[0]?.name || ''
        const subject = parsed.subject || message.envelope?.subject || ''
        const emailText = parsed.text || (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '')
        const pdfAttachments = parsed.attachments.filter(attachment => (
          attachment.contentType === 'application/pdf' || attachment.filename?.toLowerCase().endsWith('.pdf')
        ))

        for (const attachment of pdfAttachments) {
          result.checkedPdfs += 1

          const hash = createHash('sha256').update(attachment.content).digest('hex')
          const sourceKey = `sha256:${hash}`
          const { data: existing } = await supabase
            .from('inbound_email_attachments')
            .select('id')
            .eq('source_key', sourceKey)
            .maybeSingle()

          if (existing) {
            result.skipped += 1
            continue
          }

          const fileName = attachment.filename || 'auftragsbestaetigung.pdf'

          if (attachment.content.length > MAX_PDF_BYTES) {
            await supabase.from('inbound_email_attachments').insert({
              source_key: sourceKey,
              message_uid: uid,
              message_id: parsed.messageId || message.envelope?.messageId || null,
              sender_email: senderEmail || null,
              sender_name: senderName || null,
              subject: subject || null,
              received_at: isoDate(parsed.date) || isoDate(message.internalDate),
              file_name: fileName,
              file_path: '',
              file_url: '',
              status: 'failed',
              error_message: 'PDF ist größer als 10 MB.'
            })
            result.failed += 1
            continue
          }

          try {
            const parsedPdf = await pdf(attachment.content)
            const isOrderConfirmation = looksLikeOrderConfirmation(subject, parsedPdf.text)
            const match = matchInboundPdfToOrder({
              subject,
              emailText,
              pdfText: parsedPdf.text,
              senderEmail,
              orders
            })
            const matchedOrderId = isOrderConfirmation && match.autoAssign ? match.matchedOrderId : null
            const bucket = matchedOrderId ? 'order-pdfs' : 'inbound-email-pdfs'
            const storagePath = matchedOrderId
              ? `${matchedOrderId}/${Date.now()}-${randomUUID()}-email-${safeFileName(fileName)}`
              : `${new Date().toISOString().slice(0, 10)}/${hash}-${safeFileName(fileName)}`
            const { error: uploadError } = await supabase.storage
              .from(bucket)
              .upload(storagePath, attachment.content, {
                contentType: 'application/pdf',
                cacheControl: '3600',
                upsert: false
              })

            if (uploadError) throw uploadError

            const fileUrl = publicStorageUrl(bucket, storagePath)

            if (matchedOrderId) {
              const { error: pdfInsertError } = await supabase.from('order_pdfs').insert({
                material_order_id: matchedOrderId,
                file_name: fileName,
                file_path: storagePath,
                file_url: fileUrl,
                document_type: 'supplier_confirmation',
                price_import_status: 'pending'
              })

              if (pdfInsertError) throw pdfInsertError
            }

            const { error: trackingError } = await supabase.from('inbound_email_attachments').insert({
              source_key: sourceKey,
              message_uid: uid,
              message_id: parsed.messageId || message.envelope?.messageId || null,
              sender_email: senderEmail || null,
              sender_name: senderName || null,
              subject: subject || null,
              received_at: isoDate(parsed.date) || isoDate(message.internalDate),
              file_name: fileName,
              file_path: storagePath,
              file_url: fileUrl,
              status: matchedOrderId ? 'assigned' : 'review',
              matched_order_id: matchedOrderId,
              confidence: match.confidence,
              match_details: { ...match, isOrderConfirmation }
            })

            if (trackingError) {
              if (matchedOrderId) {
                await supabase.from('order_pdfs').delete().eq('file_path', storagePath)
              }
              await supabase.storage.from(bucket).remove([storagePath])
              throw trackingError
            }

            if (matchedOrderId) result.assigned += 1
            else result.review += 1
          } catch (error: any) {
            await supabase.from('inbound_email_attachments').insert({
              source_key: sourceKey,
              message_uid: uid,
              message_id: parsed.messageId || message.envelope?.messageId || null,
              sender_email: senderEmail || null,
              sender_name: senderName || null,
              subject: subject || null,
              received_at: isoDate(parsed.date) || isoDate(message.internalDate),
              file_name: fileName,
              file_path: '',
              file_url: '',
              status: 'failed',
              error_message: error.message || 'PDF konnte nicht verarbeitet werden.'
            })
            result.failed += 1
          }
        }
      }
    } finally {
      lock.release()
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Einkaufspostfach konnte nicht abgerufen werden.', result },
      { status: 502 }
    )
  } finally {
    if (client.usable) await client.logout().catch(() => undefined)
  }

  return NextResponse.json({ ok: true, result })
}

export async function GET(request: Request) {
  return syncInboundEmail(request)
}

export async function POST(request: Request) {
  return syncInboundEmail(request)
}
