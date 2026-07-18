import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import {
  formatMaterialThickness,
  OrderItem,
  orderItemQuantityText,
  orderItemsMailText
} from '@/lib/orderItems'
import { lksEmailLogoBase64 } from '@/lib/lksEmailLogo'

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
                    E-Mail: <a href="mailto:info@lks-technik.de" style="color:#008f4c;">info@lks-technik.de</a><br>
                    Web: <a href="https://www.lks-technik.de" style="color:#008f4c;">www.lks-technik.de</a>
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
        <td width="8%" valign="top" style="width:8%;padding:14px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:700;text-align:left;">${index + 1}</td>
        <td width="32%" valign="top" style="width:32%;padding:14px 10px;border-bottom:1px solid #e2e8f0;color:#172033;font-weight:700;text-align:left;">${escapeHtml(item.material)}${thickness}</td>
        <td width="22%" valign="top" style="width:22%;padding:14px 10px;border-bottom:1px solid #e2e8f0;text-align:left;">${escapeHtml(item.cross_section || '-')}</td>
        <td width="19%" valign="top" style="width:19%;padding:14px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;text-align:left;">${escapeHtml(item.length_mm || '-')} mm</td>
        <td width="19%" valign="top" style="width:19%;padding:14px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;text-align:left;">${escapeHtml(orderItemQuantityText(item))}</td>
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
  const accent = isCancellation ? '#b42318' : '#00a859'
  const title = isCancellation ? 'Stornierung Ihrer Materialbestellung' : 'Materialbestellung'
  const intro = isCancellation
    ? 'Hiermit stornieren wir die nachfolgende Materialbestellung.'
    : 'bitte liefern Sie uns die nachfolgend aufgeführten Materialien.'
  const actionNote = isCancellation
    ? 'Bitte bestätigen Sie uns die Stornierung kurz per E-Mail.'
    : 'Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere AB-Nummer an.'
  const notesText = notes?.trim() || '-'
  const scrapReorderPrefix = 'Nachbestellung aus Ausschuss - Grund:'
  const isScrapReorder = notesText.startsWith(scrapReorderPrefix)
  const scrapReason = isScrapReorder ? notesText.slice(scrapReorderPrefix.length).trim() || '-' : '-'
  const notesAreLong = !isScrapReorder && notesText.length > 45

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f5f4;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 18px rgba(15,35,55,.08);">
            <tr>
              <td style="padding:22px 32px;background:#20252a;border-top:7px solid #00a859;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="padding-right:20px;">
                      <div style="font-size:25px;font-weight:700;">${title}</div>
                      <div style="margin-top:7px;color:#d7dadd;font-size:14px;">Auftrag ${escapeHtml(orderNumber)}</div>
                    </td>
                    <td width="130" align="right" valign="middle">
                      <img src="cid:lks-technik-logo" width="112" alt="LKS Technik" style="display:block;width:112px;max-width:112px;height:auto;border:0;">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 18px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Sehr geehrte Damen und Herren,</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${intro}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td width="14%" style="width:14%;padding:14px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Auftrag</td>
                    <td width="41%" style="width:41%;padding:14px 16px;font-weight:700;white-space:nowrap;">${escapeHtml(orderNumber)}</td>
                    <td width="18%" style="width:18%;padding:14px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bearbeiter</td>
                    <td width="27%" style="width:27%;padding:14px 16px;font-weight:700;">${escapeHtml(orderedBy || '-')}</td>
                  </tr>
                  ${isCancellation ? '' : isScrapReorder ? `<tr>
                    <td valign="top" style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Liefertermin</td>
                    <td valign="top" style="padding:0 16px 14px;font-weight:700;color:${accent};line-height:1.55;">${escapeHtml(deliveryDate)}</td>
                    <td valign="top" style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Grund</td>
                    <td valign="top" style="padding:0 16px 14px;line-height:1.55;overflow-wrap:anywhere;">${escapeHtml(scrapReason)}</td>
                  </tr>
                  <tr>
                    <td valign="top" style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bemerkung</td>
                    <td colspan="3" valign="top" style="padding:0 16px 14px;line-height:1.55;">Nachbestellung aus Ausschuss</td>
                  </tr>` : notesAreLong ? `<tr>
                    <td style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Liefertermin</td>
                    <td colspan="3" style="padding:0 16px 14px;font-weight:700;color:${accent};">${escapeHtml(deliveryDate)}</td>
                  </tr>
                  <tr>
                    <td valign="top" style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bemerkung</td>
                    <td colspan="3" style="padding:0 16px 14px;line-height:1.55;overflow-wrap:anywhere;">${escapeHtml(notesText)}</td>
                  </tr>` : `<tr>
                    <td style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Liefertermin</td>
                    <td style="padding:0 16px 14px;font-weight:700;color:${accent};">${escapeHtml(deliveryDate)}</td>
                    <td style="padding:0 16px 14px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Bemerkung</td>
                    <td style="padding:0 16px 14px;overflow-wrap:anywhere;">${escapeHtml(notesText)}</td>
                  </tr>`}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #dbe3ec;border-radius:8px;overflow:hidden;font-size:14px;">
                  <thead>
                    <tr style="background:#eef2f0;color:#475569;text-align:left;">
                      <th width="8%" align="left" style="width:8%;padding:11px 10px;text-align:left;">Pos.</th>
                      <th width="32%" align="left" style="width:32%;padding:11px 10px;text-align:left;">Material</th>
                      <th width="22%" align="left" style="width:22%;padding:11px 10px;text-align:left;">Querschnitt</th>
                      <th width="19%" align="left" style="width:19%;padding:11px 10px;text-align:left;">Länge</th>
                      <th width="19%" align="left" style="width:19%;padding:11px 10px;text-align:left;">Menge</th>
                    </tr>
                  </thead>
                  <tbody>${orderItemsHtml(orderItems)}</tbody>
                </table>
                ${isCancellation && notes ? `<p style="margin:18px 0 0;"><strong>Bemerkung:</strong> ${escapeHtml(notes)}</p>` : ''}
                <div style="margin-top:22px;padding:14px 16px;border-left:4px solid ${accent};background:${isCancellation ? '#fff5f4' : '#edf9f3'};font-size:14px;line-height:1.55;">${actionNote}</div>
                <p style="margin:26px 0 0;font-size:15px;line-height:1.6;">Mit freundlichen Grüßen<br><strong>LKS-Team</strong></p>
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

LKS-Team`
      : `Sehr geehrte Damen und Herren,

bitte liefern Sie uns folgendes Material:

Auftrag: ${orderNumber}
Bearbeiter: ${orderedBy || '-'}

${orderItemsMailText(orderItems)}

Liefertermin: ${desiredDeliveryDate ? formatDateShort(desiredDeliveryDate) : 'schnellstmöglich'}
Bemerkung: ${notes || '-'}

Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere (AB-Nummer) an.


Mit freundlichen Grüßen

LKS-Team`

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
      }),
      attachments: [{
        filename: 'lks-technik-logo.png',
        content: Buffer.from(lksEmailLogoBase64, 'base64'),
        cid: 'lks-technik-logo'
      }]
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
