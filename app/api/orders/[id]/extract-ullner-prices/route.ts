import { NextResponse } from 'next/server'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import { parseSupplierPriceConfirmation } from '@/lib/ullnerPriceParser'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { fileUrl, orderNumber, supplierName } = await request.json()

    if (typeof fileUrl !== 'string' || !fileUrl) {
      return NextResponse.json({ error: 'PDF-Adresse fehlt.' }, { status: 400 })
    }

    const pdfUrl = new URL(fileUrl)
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    const expectedPath = `/storage/v1/object/public/order-pdfs/${params.id}/`

    if (pdfUrl.origin !== supabaseUrl.origin || !pdfUrl.pathname.startsWith(expectedPath)) {
      return NextResponse.json({ error: 'Diese PDF gehört nicht zum ausgewählten Auftrag.' }, { status: 400 })
    }

    const response = await fetch(pdfUrl, { cache: 'no-store' })

    if (!response.ok) {
      return NextResponse.json({ error: 'PDF konnte nicht geladen werden.' }, { status: 502 })
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF ist größer als 10 MB.' }, { status: 413 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF ist größer als 10 MB.' }, { status: 413 })
    }

    const parsedPdf = await pdf(buffer)
    let confirmation

    try {
      confirmation = parseSupplierPriceConfirmation(
        parsedPdf.text,
        typeof supplierName === 'string' ? supplierName : ''
      )
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Die PDF wurde nicht als Lieferanten-Auftragsbestätigung oder Angebot erkannt.' },
        { status: 422 }
      )
    }

    if (confirmation.positions.length === 0) {
      return NextResponse.json(
        { error: 'In diesem Lieferantendokument wurden keine Positionspreise erkannt.' },
        { status: 422 }
      )
    }

    if (
      orderNumber &&
      confirmation.referenceNumber &&
      confirmation.supplierFormat !== 'dreckshage' &&
      String(orderNumber).trim().toLowerCase() !== confirmation.referenceNumber.trim().toLowerCase()
    ) {
      return NextResponse.json(
        { error: `Die PDF gehört zu ${confirmation.referenceNumber}, nicht zu ${orderNumber}.` },
        { status: 422 }
      )
    }

    return NextResponse.json(confirmation)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Das Lieferantendokument konnte nicht ausgewertet werden.' },
      { status: 500 }
    )
  }
}
