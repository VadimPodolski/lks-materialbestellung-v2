import PDFDocument from 'pdfkit'
import {
  formatCrossSectionMm,
  formatLengthMm,
  formatMaterialThickness,
  OrderItem,
  orderItemQuantityWithoutPackageSizeText
} from '@/lib/orderItems'
import { lksEmailLogoBase64 } from '@/lib/lksEmailLogo'

type OrderPdfData = {
  orderNumber: string
  orderedBy: string
  orderArea: string
  desiredDeliveryDate: string
  notes: string
  items: OrderItem[]
}

const colors = {
  green: '#00a95c',
  dark: '#172033',
  muted: '#64748b',
  line: '#d6dde5',
  soft: '#f1f5f9',
  white: '#ffffff'
}

function formatDateShort(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}.${month}.${year}` : value
}

function pdfBuffer(document: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    document.on('data', chunk => chunks.push(Buffer.from(chunk)))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.end()
  })
}

export function createOrderPdf(data: OrderPdfData) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 42, right: 42, bottom: 48, left: 42 },
    bufferPages: true,
    info: {
      Title: `Materialbestellung ${data.orderNumber}`,
      Author: 'LKS-Technik GmbH & Co. KG'
    }
  })
  const pageWidth = doc.page.width
  const contentWidth = pageWidth - 84
  const isTwoDLaser = data.orderArea === '2d-laser'

  function drawHeader() {
    doc.rect(0, 0, pageWidth, 9).fill(colors.green)
    doc.font('Helvetica-Bold').fontSize(23).fillColor(colors.dark)
      .text('Materialbestellung', 42, 48)
    doc.font('Helvetica').fontSize(11).fillColor(colors.muted)
      .text(`Auftrag ${data.orderNumber}`, 42, 80)

    try {
      doc.image(Buffer.from(lksEmailLogoBase64, 'base64'), pageWidth - 154, 34, { fit: [112, 62] })
    } catch {
      doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.green)
        .text('LKS-TECHNIK', pageWidth - 170, 52, { width: 128, align: 'right' })
    }

    doc.moveTo(42, 112).lineTo(pageWidth - 42, 112).strokeColor(colors.line).stroke()
  }

  function drawTableHeader(y: number) {
    doc.rect(42, y, contentWidth, 28).fill(colors.dark)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.white)
    const columns = isTwoDLaser
      ? [
          { label: 'Pos.', x: 50, width: 34 },
          { label: 'Material', x: 84, width: 128 },
          { label: 'Stärke', x: 212, width: 64 },
          { label: 'Format', x: 276, width: 128 },
          { label: 'Menge', x: 404, width: 142 }
        ]
      : [
          { label: 'Pos.', x: 50, width: 34 },
          { label: 'Material', x: 84, width: 128 },
          { label: 'Querschnitt', x: 212, width: 130 },
          { label: 'Länge', x: 342, width: 84 },
          { label: 'Menge', x: 426, width: 120 }
        ]
    columns.forEach(column => doc.text(column.label, column.x, y + 9, { width: column.width }))
    return y + 28
  }

  drawHeader()
  doc.font('Helvetica').fontSize(11).fillColor(colors.dark)
    .text('Sehr geehrte Damen und Herren,', 42, 136)
    .moveDown(0.65)
    .text('bitte liefern Sie uns die nachfolgend aufgeführten Materialien.')

  const infoY = 190
  doc.roundedRect(42, infoY, contentWidth, 76, 4).fill(colors.soft)
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted)
    .text('AUFTRAG', 56, infoY + 17)
    .text('LIEFERTERMIN', 56, infoY + 45)
    .text('BEARBEITER', 306, infoY + 17)
    .text('BEMERKUNG', 306, infoY + 45)
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(colors.dark)
    .text(data.orderNumber, 130, infoY + 14, { width: 150 })
    .text(data.desiredDeliveryDate ? formatDateShort(data.desiredDeliveryDate) : 'schnellstmöglich', 130, infoY + 42, { width: 150 })
    .text(data.orderedBy || '-', 385, infoY + 14, { width: 160 })
    .text(data.notes || '-', 385, infoY + 42, { width: 160, height: 24, ellipsis: true })

  let y = drawTableHeader(292)
  data.items.forEach((item, index) => {
    const rowHeight = 42
    if (y + rowHeight > doc.page.height - 80) {
      doc.addPage()
      drawHeader()
      y = drawTableHeader(132)
    }

    if (index % 2 === 0) doc.rect(42, y, contentWidth, rowHeight).fill('#f8fafc')
    doc.moveTo(42, y + rowHeight).lineTo(pageWidth - 42, y + rowHeight).strokeColor(colors.line).stroke()
    doc.font('Helvetica').fontSize(9.5).fillColor(colors.dark)
      .text(String(index + 1), 50, y + 14, { width: 34 })
      .font('Helvetica-Bold')
      .text(item.material || '-', 84, y + 14, { width: 124, height: 24, ellipsis: true })
      .font('Helvetica')

    if (isTwoDLaser) {
      doc.text(formatMaterialThickness(item.material_thickness_mm), 212, y + 14, { width: 60 })
        .text(item.cross_section || '-', 276, y + 14, { width: 124, height: 24, ellipsis: true })
        .text(orderItemQuantityWithoutPackageSizeText(item), 404, y + 14, { width: 142 })
    } else {
      doc.text(formatCrossSectionMm(item.cross_section), 212, y + 14, { width: 126, height: 24, ellipsis: true })
        .text(formatLengthMm(item.length_mm), 342, y + 14, { width: 80 })
        .text(orderItemQuantityWithoutPackageSizeText(item), 426, y + 14, { width: 120 })
    }

    y += rowHeight
  })

  y += 24
  if (y > doc.page.height - 155) {
    doc.addPage()
    drawHeader()
    y = 140
  }
  doc.rect(42, y, 5, 48).fill(colors.green)
  doc.rect(47, y, contentWidth - 5, 48).fill('#e8f5ee')
  doc.font('Helvetica').fontSize(9.5).fillColor(colors.dark)
    .text(
      'Bitte geben Sie auf Ihrer Auftragsbestätigung sowie auf allen Lieferpapieren unsere Auftragsnummer an und senden Sie diese bitte immer an einkauf@lks-technik.de.',
      60,
      y + 10,
      { width: contentWidth - 30, lineGap: 2 }
    )

  doc.font('Helvetica').fontSize(10.5).fillColor(colors.dark)
    .text('Mit freundlichen Grüßen', 42, y + 70)
    .font('Helvetica-Bold')
    .text('LKS-Team', 42, y + 88)

  const pages = doc.bufferedPageRange()
  for (let page = pages.start; page < pages.start + pages.count; page += 1) {
    doc.switchToPage(page)
    doc.moveTo(42, doc.page.height - 68).lineTo(pageWidth - 42, doc.page.height - 68)
      .strokeColor(colors.line).stroke()
    doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
      .text('LKS-Technik GmbH & Co. KG | Stettiner Str. 34 | 33106 Paderborn', 42, doc.page.height - 58, {
        width: 390,
        lineBreak: false
      })
      .text(`Seite ${page + 1} von ${pages.count}`, pageWidth - 140, doc.page.height - 58, {
        width: 98,
        align: 'right',
        lineBreak: false
      })
  }

  return pdfBuffer(doc)
}
