import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { OrderItem, orderItemsMailText } from '@/lib/orderItems'

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
      notes,
      items
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

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: supplierEmail,
      subject: `Materialbestellung LKS - Auftrag ${orderNumber}`,
      text: `Sehr geehrte Damen und Herren,

bitte liefern Sie uns folgendes Material:

Auftrag: ${orderNumber}

${orderItemsMailText(orderItems)}

Gewünschter Liefertermin: ${desiredDeliveryDate || '-'}
Bemerkung: ${notes || '-'}

Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere (AB-Nummer) an.


Mit freundlichen Grüßen

LKS-Technik GmbH & Co. KG`
    })

    return NextResponse.json({
      success: true,
      message: `Bestellung wurde an ${supplierName || supplierEmail} versendet.`
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'E-Mail konnte nicht gesendet werden.' },
      { status: 500 }
    )
  }
}
