import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  try {
    const body = await req.json()

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

bitte liefern Sie uns folgendes Material:

Auftrag: ${body.orderNumber}
Kunde: ${body.customer}
Material: ${body.material}
Querschnitt: ${body.crossSection}
Länge: ${body.lengthMm || '-'} mm
Stückzahl: ${body.quantity}

Gewünschter Liefertermin: ${body.desiredDeliveryDate || '-'}

Mit freundlichen Grüßen
LKS-Technik GmbH & Co. KG`
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'E-Mail konnte nicht gesendet werden.' },
      { status: 500 }
    )
  }
}
