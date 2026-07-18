import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import {
  formatMaterialThickness,
  OrderItem,
  orderItemQuantityText,
  orderItemsMailText
} from '@/lib/orderItems'

function formatDateShort(value: string) {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value

  return `${day}.${month}.${year}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function emailFooterHtml() {
  return `
    <tr>
      <td style="padding:0 32px 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #cbd5e1;">
          <tr>
            <td style="padding:22px 0 18px;color:#334155;font-size:13px;line-height:1.55;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td width="38%" valign="top" style="padding:0 18px 12px 0;">
                    <strong style="color:#172033;">LKS-Technik GmbH &amp; Co. KG</strong><br>
                    Stettiner Str. 34<br>
                    33106 Paderborn
                  </td>
                  <td width="34%" valign="top" style="padding:0 18px 12px 0;">
                    E-Mail: <a href="mailto:info@lks-technik.de" style="color:#0f5fa8;">info@lks-technik.de</a><br>
                    Web: <a href="https://www.lks-technik.de" style="color:#0f5fa8;">www.lks-technik.de</a>
                  </td>
                  <td width="28%" valign="top" style="padding:0 0 12px;">
                    Fon: +49 5251 78757 0<br>
                    Fax: +49 5251 78757 10
                  </td>
                </tr>
              </table>
              <div style="padding-top:14px;border-top:1px solid #e2e8f0;color:#7b8492;font-size:11px;line-height:1.55;">
                Diese E-Mail kann vertrauliche und/oder rechtlich geschützte Informationen enthalten.<br>
                Wenn Sie nicht der richtige Adressat sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail.<br>
                Das unerlaubte Kopieren sowie die unbefugte Weitergabe dieser E-Mail oder von Teilen dieser E-Mail ist nicht gestattet.
                <div style="margin-top:12px;">Paderborn HR-Nr.: HRA 8220 | USt.-ID: DE353415477 | Steuer-Nr.: 339/5742/3414 | Geschäftsführung: Nicolas Florian, Yaroslav Ballach</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function orderItemsHtml(items: OrderItem[]) {
  return items.map((item, index) => {
    const thickness = item.material_thickness_mm
      ? `<div style="margin-top:4px;color:#64748b;font-size:12px;">Materialstärke: ${escapeHtml(formatMaterialThickness(item.material_thickness_mm))}</div>`
      : ''

    return `
      <tr>
        <td valign="top" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700;">${index + 1}</td>
        <td valign="top" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;color:#172033;font-weight:700;">${escapeHtml(item.material)}${thickness}</td>
        <td valign="top" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.cross_section || '-')}</td>
        <td valign="top" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(item.length_mm || '-')} mm</td>
        <td valign="top" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(orderItemQuantityText(item))}</td>
      </tr>`
  }).join('')
}

function emailHtml({
  isCancellation,
  orderNumber,
  orderedBy,
  orderItems,
  desiredDeliveryDate,
  notes
}: {
  isCancellation: boolean
  orderNumber: string
  orderedBy: string
  orderItems: OrderItem[]
  desiredDeliveryDate?: string | null
  notes?: string | null
}) {
  const deliveryDate = desiredDeliveryDate ? formatDateShort(desiredDeliveryDate) : 'schnellstmöglich'
  const accent = isCancellation ? '#b42318' : '#0f5fa8'
  const title = isCancellation ? 'Stornierung Ihrer Materialbestellung' : 'Materialbestellung'
  const intro = isCancellation
    ? 'Hiermit stornieren wir die nachfolgende Materialbestellung.'
    : 'Bitte liefern Sie uns die nachfolgend aufgeführten Materialien.'
  const actionNote = isCancellation
    ? 'Bitte bestätigen Sie uns die Stornierung kurz per E-Mail.'
    : 'Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere AB-Nummer an.'

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f6f9;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 18px rgba(15,35,55,.08);">
            <tr>
              <td style="padding:24px 32px;background:${accent};color:#ffffff;">
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">LKS-Technik GmbH &amp; Co. KG</div>
                <div style="margin-top:7px;font-size:25px;font-weight:700;">${title}</div>
                <div style="margin-top:5px;font-size:14px;opacity:.9;">Auftrag ${escapeHtml(orderNumber)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 18px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Sehr geehrte Damen und Herren,</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${intro}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Auftrag</td>
                    <td style="padding:14px 16px;font-weight:700;">${escapeHtml(orderNumber)}</td>
                    <td style="padding:14px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bearbeiter</td>
                    <td style="padding:14px 16px;font-weight:700;">${escapeHtml(orderedBy || '-')}</td>
                  </tr>
                  ${isCancellation ? '' : `<tr>
                    <td style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Liefertermin</td>
                    <td style="padding:0 16px 14px;font-weight:700;color:${accent};">${escapeHtml(deliveryDate)}</td>
                    <td style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bemerkung</td>
                    <td style="padding:0 16px 14px;">${escapeHtml(notes || '-')}</td>
                  </tr>`}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #dbe3ec;border-radius:8px;overflow:hidden;font-size:14px;">
                  <thead>
                    <tr style="background:#edf3f8;color:#475569;text-align:left;">
                      <th style="padding:11px 10px;width:34px;">Pos.</th>
                      <th style="padding:11px 10px;">Material</th>
                      <th style="padding:11px 10px;">Querschnitt</th>
                      <th style="padding:11px 10px;">Länge</th>
                      <th style="padding:11px 10px;">Menge</th>
                    </tr>
                  </thead>
                  <tbody>${orderItemsHtml(orderItems)}</tbody>
                </table>
                ${isCancellation && notes ? `<p style="margin:18px 0 0;"><strong>Bemerkung:</strong> ${escapeHtml(notes)}</p>` : ''}
                <div style="margin-top:22px;padding:14px 16px;border-left:4px solid ${accent};background:${isCancellation ? '#fff5f4' : '#f0f7fc'};font-size:14px;line-height:1.55;">${actionNote}</div>
                <p style="margin:26px 0 0;font-size:15px;line-height:1.6;">Mit freundlichen Grüßen<br><strong>LKS-Technik GmbH &amp; Co. KG</strong></p>
              </td>
            </tr>
            ${emailFooterHtml()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      supplierEmail,
      orderNumber,
      material,
      crossSection,
      lengthMm,
      quantity,
      desiredDeliveryDate,
      supplierName,
      orderedBy,
      notes,
      items,
      mailType
    } = body

    if (!supplierEmail) {
      return NextResponse.json(
        { error: 'Keine Lieferanten-E-Mail vorhanden.' },
        { status: 400 }
      )
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
      return NextResponse.json(
        { error: 'SMTP-Umgebungsvariablen fehlen in Vercel.' },
        { status: 500 }
      )
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })

    const orderItems: OrderItem[] = Array.isArray(items) && items.length > 0
      ? items
      : [{
        material,
        cross_section: crossSection,
        length_mm: lengthMm,
        quantity
      }]

    const isCancellation = mailType === 'cancellation'
    const subject = isCancellation
      ? `Stornierung Materialbestellung LKS - Auftrag ${orderNumber}`
      : `Materialbestellung LKS - Auftrag ${orderNumber}`
    const text = isCancellation
      ? `Sehr geehrte Damen und Herren,

hiermit stornieren wir unsere Materialbestellung.

Auftrag: ${orderNumber}
Bearbeiter: ${orderedBy || '-'}

${orderItemsMailText(orderItems)}

Bemerkung: ${notes || '-'}

Bitte bestätigen Sie uns die Stornierung kurz per E-Mail.


Mit freundlichen Grüßen

LKS-Technik GmbH & Co. KG`
      : `Sehr geehrte Damen und Herren,

bitte liefern Sie uns folgendes Material:

Auftrag: ${orderNumber}
Bearbeiter: ${orderedBy || '-'}

${orderItemsMailText(orderItems)}

Liefertermin: ${desiredDeliveryDate ? formatDateShort(desiredDeliveryDate) : 'schnellstmöglich'}
Bemerkung: ${notes || '-'}

Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere (AB-Nummer) an.


Mit freundlichen Grüßen

LKS-Technik GmbH & Co. KG`

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: supplierEmail,
      subject,
      text,
      html: emailHtml({
        isCancellation,
        orderNumber,
        orderedBy,
        orderItems,
        desiredDeliveryDate,
        notes
      })
    })

    return NextResponse.json({
      success: true,
      message: isCancellation
        ? `Stornierung wurde an ${supplierName || supplierEmail} versendet.`
        : `Bestellung wurde an ${supplierName || supplierEmail} versendet.`
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'E-Mail konnte nicht gesendet werden.' },
      { status: 500 }
    )
  }
}
