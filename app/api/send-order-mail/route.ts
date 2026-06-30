import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import PDFDocument from 'pdfkit'

function createOrderPdf(body: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(20).text('LKS-Technik GmbH & Co. KG', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(16).text('Materialbestellung', { align: 'center' })

    doc.moveDown(2)

    doc.fontSize(11)
    doc.text(`Auftrag / AB-Nummer: ${body.orderNumber}`)
    doc.text(`Lieferant: ${body.supplierName || '-'}`)
    doc.text(`Liefertermin: ${body.desiredDeliveryDate || '-'}`)

    doc.moveDown(1.5)

    doc.fontSize(13).text('Bestelldaten', { underline: true })
    doc.moveDown(0.5)

    doc.fontSize(11)
    doc.text(`Material: ${body.material}`)
    doc.text(`Querschnitt: ${body.crossSection}`)
    doc.text(`Laenge: ${body.lengthMm || '-'} mm`)
    doc.text(`Stueckzahl: ${body.quantity}`)

    doc.moveDown(1.5)

    doc.fontSize(11).text(
      'Bitte geben Sie auf Ihrer Auftragsbestaetigung sowie auf allen Lieferpapieren unsere AB-Nummer / Kommission an.'
    )

    doc.moveDown(0.5)
    doc.fontSize(13).text(`AB-Nummer / Kommission: ${body.orderNumber}`, {
      underline: true
    })

    doc.moveDown(3)

    doc.fontSize(11).text('Mit freundlichen Gruessen')
    doc.moveDown(1)
    doc.text('LKS-Technik GmbH & Co. KG')

    doc.end()
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (!body.supplierEmail) {
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

    const pdfBuffer = await createOrderPdf(body)

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: body.supplierEmail,
      subject: `Materialbestellung LKS - Auftrag ${body.orderNumber}`,
      text: `Sehr geehrte Damen und Herren,

anbei erhalten Sie unsere Materialbestellung als PDF.

Bitte geben Sie auf Ihrer Auftragsbestaetigung sowie auf allen Lieferpapieren unsere AB-Nummer / Kommission an.

AB-Nummer / Kommission: ${body.orderNumber}

Mit freundlichen Gruessen

LKS-Technik GmbH & Co. KG`,
      attachments: [
        {
          filename: `Materialbestellung-${body.orderNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    })

    return NextResponse.json({
      success: true,
      message: `Bestellung wurde an ${body.supplierName || body.supplierEmail} versendet.`
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'E-Mail konnte nicht gesendet werden.' },
      { status: 500 }
    )
  }
}
