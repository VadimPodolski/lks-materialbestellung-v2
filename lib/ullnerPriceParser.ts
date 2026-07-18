export type UllnerPositionPrice = {
  position: number
  priceQuantity: number
  priceUnit: string
  unitPriceEur: number
  lineTotalEur: number
  description: string
}

export type UllnerPriceConfirmation = {
  confirmationNumber: string | null
  referenceNumber: string | null
  supplierFormat: 'ullner' | 'kloeckner' | 'generic'
  positions: UllnerPositionPrice[]
}

function germanNumber(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

function splitUnitPriceAndTotal(value: string, quantity: number) {
  const compact = value.replace(/\s+/g, '')
  const candidates: { unitPrice: number; total: number; difference: number }[] = []

  for (let index = 1; index < compact.length; index += 1) {
    const unitPriceText = compact.slice(0, index)
    const totalText = compact.slice(index)

    if (!/^\d+(?:\.\d{3})*,\d{2,4}$/.test(unitPriceText)) continue
    if (!/^\d+(?:\.\d{3})*,\d{2}$/.test(totalText)) continue

    const unitPrice = germanNumber(unitPriceText)
    const total = germanNumber(totalText)

    candidates.push({
      unitPrice,
      total,
      difference: Math.abs(quantity * unitPrice - total)
    })
  }

  return candidates.sort((a, b) => a.difference - b.difference)[0] || null
}

function parsePriceLine(line: string) {
  const compact = line.replace(/\s+/g, '').replace(/[a-z]$/i, '')
  const match = compact.match(/^([\d.]+,\d{2,3})(m|kg|Stg\.?|Stk\.?|Stück)([\d.,]+)$/i)

  if (!match) return null

  const priceQuantity = germanNumber(match[1])
  const prices = splitUnitPriceAndTotal(match[3], priceQuantity)

  if (!prices || prices.difference > 0.06) return null

  return {
    priceQuantity,
    priceUnit: normalizeUnit(match[2]),
    unitPriceEur: prices.unitPrice,
    lineTotalEur: prices.total
  }
}

function normalizeUnit(value: string) {
  return /^(?:stck|stg|stk|st|stück)/i.test(value) ? 'Stück' : value.toLowerCase()
}

function parseGenericPriceLine(line: string) {
  const compact = line.replace(/\s+/g, '')
  const unitPattern = '(?:Stück|Stck\\.?|Stk\\.?|Stg\\.?|St\\.?|m|kg)'
  const quantityPattern = new RegExp(`(\\d+(?:\\.\\d{3})*,\\d{2,3})(${unitPattern})`, 'ig')
  let quantityMatch: RegExpExecArray | null

  while ((quantityMatch = quantityPattern.exec(compact))) {
    let priceAndTotal = compact.slice(quantityMatch.index + quantityMatch[0].length)
    const totalMatch = priceAndTotal.match(/([\d.]+,\d{2})(?:EUR|€)?$/i)
    if (!totalMatch || totalMatch.index == null) continue

    const lineTotalEur = germanNumber(totalMatch[1])
    priceAndTotal = priceAndTotal.slice(0, totalMatch.index)

    const priceUnitPattern = new RegExp(`\\/?(1|100|1000)?(${unitPattern})$`, 'i')
    const priceUnitMatch = priceAndTotal.match(priceUnitPattern)
    const priceBase = Number(priceUnitMatch?.[1] || 1)
    if (priceUnitMatch?.index != null) {
      priceAndTotal = priceAndTotal.slice(0, priceUnitMatch.index)
    }

    const unitPriceMatch = priceAndTotal.match(/^([\d.]+,\d{2,4})(?:EUR|€)?$/i)
    if (!unitPriceMatch) continue

    const quantity = germanNumber(quantityMatch[1])
    const unitPriceEur = germanNumber(unitPriceMatch[1])
    const difference = Math.abs(quantity * unitPriceEur / priceBase - lineTotalEur)
    if (difference > 0.06) continue

    return {
      priceQuantity: quantity,
      priceUnit: normalizeUnit(quantityMatch[2]),
      unitPriceEur,
      lineTotalEur
    }
  }

  return null
}

export function parseUllnerPriceConfirmation(text: string): UllnerPriceConfirmation {
  if (!/(?:ULLNER\s*u\.?\s*ULLNER|ullner\.de)/i.test(text)) {
    throw new Error('Die PDF wurde nicht als Ullner-Auftragsbestätigung erkannt.')
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  const tableStart = lines.findIndex(line => line.includes('Pos.Bezeichnung'))
  const tableEnd = lines.findIndex((line, index) => index > tableStart && line.includes('Nettowarenwert'))
  const positions: UllnerPositionPrice[] = []

  if (tableStart >= 0) {
    const end = tableEnd >= 0 ? tableEnd : lines.length

    for (let index = tableStart + 1; index < end; index += 1) {
      if (!/^\d{1,3}$/.test(lines[index])) continue

      const position = Number(lines[index])

      for (let priceIndex = index + 1; priceIndex <= Math.min(index + 4, end - 1); priceIndex += 1) {
        const price = parsePriceLine(lines[priceIndex])

        if (price) {
          let descriptionEnd = end
          for (let descriptionIndex = priceIndex + 1; descriptionIndex < end; descriptionIndex += 1) {
            if (/^\d{1,3}$/.test(lines[descriptionIndex])) {
              descriptionEnd = descriptionIndex
              break
            }
          }

          positions.push({
            position,
            ...price,
            description: lines.slice(index + 1, Math.min(descriptionEnd, priceIndex + 6)).join(' ')
          })
          index = priceIndex
          break
        }
      }
    }
  }

  const confirmationNumber = text.match(/KAB\s+(\d+)/i)?.[1] || null
  const referenceNumber = text.match(/Referenznummer:\s*([A-Z0-9-]+)/i)?.[1]
    || text.match(/Kommission:\s*A?(AB-\d+)/i)?.[1]
    || null

  return { confirmationNumber, referenceNumber, supplierFormat: 'ullner', positions }
}

export function parseSupplierPriceConfirmation(text: string): UllnerPriceConfirmation {
  if (/(?:ULLNER\s*u\.?\s*ULLNER|ullner\.de)/i.test(text)) {
    return parseUllnerPriceConfirmation(text)
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const compactText = text.replace(/\s+/g, '')
  const isKloeckner = /(?:klöckner|kloeckner)/i.test(text)
  const hasConfirmationTitle = /(?:Auftragsbest(?:ätigung|\.)|OrderConfirmation)/i.test(compactText)

  if (!hasConfirmationTitle) {
    throw new Error('Die PDF wurde nicht als Lieferanten-Auftragsbestätigung erkannt.')
  }
  const positions: UllnerPositionPrice[] = []

  for (let index = 0; index < lines.length; index += 1) {
    let price: ReturnType<typeof parseGenericPriceLine> = null
    let priceLine = lines[index]
    let consumedLines = 1

    for (let lineCount = 1; lineCount <= 5 && index + lineCount <= lines.length; lineCount += 1) {
      const candidate = lines.slice(index, index + lineCount).join(' ')
      const parsedPrice = parseGenericPriceLine(candidate)

      if (parsedPrice) {
        price = parsedPrice
        priceLine = candidate
        consumedLines = lineCount
        break
      }
    }

    if (!price) continue

    const positionMatch = priceLine.match(/^(?:\d{4,})?(\d{1,3})(?=\d+[.,]\d{2,3}(?:Stück|Stck|Stk|Stg|St|m|kg))/i)
    const fallbackPosition = positions.length + 1
    positions.push({
      position: positionMatch ? Number(positionMatch[1]) : fallbackPosition,
      ...price,
      description: priceLine
    })
    index += consumedLines - 1
  }

  const confirmationNumber = text.match(/(?:Auftragsbest(?:ätigung|\.)|Bestellung)\s*[:#]?\s*([A-Z0-9-]{4,})/i)?.[1] || null
  const referenceNumber = text.match(/\b(?:AB-[A-Z0-9]+(?:-[A-Z0-9]+)*|TAFEL-\d+)\b/i)?.[0] || null

  return { confirmationNumber, referenceNumber, supplierFormat: isKloeckner ? 'kloeckner' : 'generic', positions }
}
