export type InboundOrderItem = {
  material: string | null
  cross_section: string | null
  length_mm: number | null
  quantity: number | null
}

export type InboundOrderCandidate = {
  id: string
  order_number: string
  status: string
  supplier_email?: string | null
  order_items?: InboundOrderItem[] | null
}

export type InboundMatchSuggestion = {
  orderId: string
  orderNumber: string
  score: number
  confidence: number
  exactOrderNumber: boolean
  matchedFields: string[]
}

export type InboundOrderMatch = {
  matchedOrderId: string | null
  matchedOrderNumber: string | null
  confidence: number
  autoAssign: boolean
  extractedOrderNumbers: string[]
  suggestions: InboundMatchSuggestion[]
}

function normalizedText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('de-DE')
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .replace(/[×*]/g, 'X')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberAppears(text: string, value: number) {
  if (!Number.isFinite(value)) return false

  const integer = Math.round(value)
  const normalized = normalizedText(text)
  const integerPattern = new RegExp(`(?:^|\\s)${integer}(?:\\s|$)`)
  if (integerPattern.test(normalized)) return true

  const german = value.toLocaleString('de-DE', { maximumFractionDigits: 3 })
  const english = value.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return text.includes(german) || text.includes(english)
}

function materialAppears(text: string, material: string) {
  const expected = normalizedText(material)
  if (!expected) return false

  return normalizedText(text).includes(expected)
}

function dimensionSignature(value: string | null | undefined) {
  if (!value) return ''

  const dimensions = value.match(/(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX×*]\s*(\d+(?:[.,]\d+)?))?/)
  if (!dimensions) return ''

  return [dimensions[1], dimensions[2], dimensions[3]]
    .filter(Boolean)
    .map(part => Number(String(part).replace(',', '.')).toLocaleString('de-DE', { maximumFractionDigits: 3 }))
    .join('x')
    .toLowerCase()
}

function dimensionAppears(text: string, crossSection: string) {
  const expected = dimensionSignature(crossSection)
  if (!expected) return materialAppears(text, crossSection)

  const signatures = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX×*]\s*(\d+(?:[.,]\d+)?))?/g))
    .map(match => dimensionSignature(match[0]))

  return signatures.includes(expected)
}

function normalizeOrderNumber(value: string) {
  return value.trim().toLocaleUpperCase('de-DE')
}

export function extractOrderNumbers(text: string) {
  const matches = text.match(/\b(?:AB-(?:\d+|LAGER)(?:-NB)*|TAFEL-\d{5})\b/gi) || []
  return Array.from(new Set(matches.map(normalizeOrderNumber)))
}

export function matchInboundPdfToOrder(args: {
  subject?: string | null
  emailText?: string | null
  pdfText: string
  senderEmail?: string | null
  orders: InboundOrderCandidate[]
}): InboundOrderMatch {
  const combinedText = [args.subject, args.emailText, args.pdfText].filter(Boolean).join('\n')
  const extractedOrderNumbers = extractOrderNumbers(combinedText)
  const senderEmail = args.senderEmail?.trim().toLowerCase() || ''

  const suggestions = args.orders.map(order => {
    const matchedFields: string[] = []
    const orderNumber = normalizeOrderNumber(order.order_number)
    const exactOrderNumber = extractedOrderNumbers.includes(orderNumber)
    let score = exactOrderNumber ? 150 : 0

    if (exactOrderNumber) matchedFields.push('Auftragsnummer')

    if (senderEmail && order.supplier_email?.trim().toLowerCase() === senderEmail) {
      score += 12
      matchedFields.push('Lieferant')
    }

    for (const [index, item] of (order.order_items || []).entries()) {
      const position = index + 1

      if (item.material && materialAppears(combinedText, item.material)) {
        score += 14
        matchedFields.push(`Material Position ${position}`)
      }

      if (item.cross_section && dimensionAppears(combinedText, item.cross_section)) {
        score += 28
        matchedFields.push(`Querschnitt Position ${position}`)
      }

      const lengthMm = Number(item.length_mm || 0)
      if (lengthMm > 0 && (numberAppears(combinedText, lengthMm) || numberAppears(combinedText, lengthMm / 1000))) {
        score += 10
        matchedFields.push(`Länge Position ${position}`)
      }

      const quantity = Number(item.quantity || 0)
      if (quantity > 0 && numberAppears(combinedText, quantity)) {
        score += 7
        matchedFields.push(`Stückzahl Position ${position}`)
      }

      const totalMeters = lengthMm > 0 && quantity > 0 ? (lengthMm * quantity) / 1000 : 0
      if (totalMeters > 0 && numberAppears(combinedText, totalMeters)) {
        score += 10
        matchedFields.push(`Gesamtmeter Position ${position}`)
      }
    }

    const possibleScore = Math.max(59, (order.order_items?.length || 1) * 69 + 12)
    const confidence = exactOrderNumber ? 100 : Math.min(99, Math.round((score / possibleScore) * 100))

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      score,
      confidence,
      exactOrderNumber,
      matchedFields
    }
  }).sort((a, b) => b.score - a.score)

  const best = suggestions[0]
  const second = suggestions[1]
  const scoreMargin = best ? best.score - (second?.score || 0) : 0
  const autoAssign = Boolean(
    best && (
      best.exactOrderNumber ||
      (best.score >= 52 && best.confidence >= 65 && scoreMargin >= 18)
    )
  )

  return {
    matchedOrderId: autoAssign ? best.orderId : null,
    matchedOrderNumber: autoAssign ? best.orderNumber : null,
    confidence: best?.confidence || 0,
    autoAssign,
    extractedOrderNumbers,
    suggestions: suggestions.slice(0, 5)
  }
}
