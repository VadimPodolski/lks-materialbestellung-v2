import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/serverAdminAuth'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'auftragsbestaetigung.pdf'
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: 'Nur Administratoren dürfen E-Mail-Anhänge zuordnen.' }, { status: 403 })
  }

  const { attachmentId, orderId } = await request.json()
  if (!attachmentId || !orderId) {
    return NextResponse.json({ error: 'Anhang und Auftrag müssen ausgewählt werden.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const [{ data: attachment, error: attachmentError }, { data: order, error: orderError }] = await Promise.all([
    supabase
      .from('inbound_email_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single(),
    supabase
      .from('material_orders')
      .select('id,order_number')
      .eq('id', orderId)
      .single()
  ])

  if (attachmentError || !attachment) {
    return NextResponse.json({ error: attachmentError?.message || 'E-Mail-Anhang wurde nicht gefunden.' }, { status: 404 })
  }
  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message || 'Auftrag wurde nicht gefunden.' }, { status: 404 })
  }
  if (attachment.status === 'assigned') {
    return NextResponse.json({ error: 'Dieser Anhang wurde bereits zugeordnet.' }, { status: 409 })
  }
  if (!attachment.file_path) {
    return NextResponse.json({ error: 'Für diesen Eintrag ist keine gespeicherte PDF vorhanden.' }, { status: 409 })
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from('inbound-email-pdfs')
    .download(attachment.file_path)

  if (downloadError || !file) {
    return NextResponse.json({ error: downloadError?.message || 'PDF konnte nicht geladen werden.' }, { status: 502 })
  }

  const path = `${order.id}/${Date.now()}-${randomUUID()}-email-${safeFileName(attachment.file_name)}`
  const content = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from('order-pdfs')
    .upload(path, content, { contentType: 'application/pdf', cacheControl: '3600', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 502 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const fileUrl = `${baseUrl}/storage/v1/object/public/order-pdfs/${path.split('/').map(encodeURIComponent).join('/')}`
  const { error: pdfError } = await supabase.from('order_pdfs').insert({
    material_order_id: order.id,
    file_name: attachment.file_name,
    file_path: path,
    file_url: fileUrl,
    document_type: 'supplier_confirmation',
    price_import_status: 'pending'
  })

  if (pdfError) {
    await supabase.storage.from('order-pdfs').remove([path])
    return NextResponse.json({ error: pdfError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('inbound_email_attachments')
    .update({
      status: 'assigned',
      matched_order_id: order.id,
      confidence: 100,
      file_path: path,
      file_url: fileUrl,
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', attachment.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await supabase.storage.from('inbound-email-pdfs').remove([attachment.file_path])

  return NextResponse.json({ ok: true, orderNumber: order.order_number })
}
