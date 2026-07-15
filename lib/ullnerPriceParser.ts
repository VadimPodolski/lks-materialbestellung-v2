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
  supplierFormat: 'ullner' | 'generic'
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
  return /^(?:stg|stk|stück)/i.test(value) ? 'Stück' : value.toLowerCase()
}

function parseGenericPriceLine(line: string) {
  const compact = line.replace(/\s+/g, '')
  const unitMatch = compact.match(/(Stück|Stk\.?|Stg\.?|m|kg)/i)
  if (!unitMatch || unitMatch.index == null) return null

  const beforeUnit = compact.slice(0, unitMatch.index)
  const afterUnit = compact.slice(unitMatch.index + unitMatch[0].length)
  const priceMatch = afterUnit.match(/([\d.]+,\d{2,4})€?(?:\/(?:Stück|Stk\.?|Stg\.?|m|kg))?([\d.]+,\d{2})€?$/i)
  if (!priceMatch) return null

  const unitPriceEur = germanNumber(priceMatch[1])
  const lineTotalEur = germanNumber(priceMatch[2])
  const quantityCandidates: { quantity: number; difference: number }[] = []

  for (let index = 0; index < beforeUnit.length; index += 1) {
    const candidate = beforeUnit.slice(index)
    if (!/^\d+(?:\.\d{3})*,\d{2,3}$/.test(candidate)) continue

    const quantity = germanNumber(candidate)
    quantityCandidates.push({ quantity, difference: Math.abs(quantity * unitPriceEur - lineTotalEur) })
  }

  const quantity = quantityCandidates.sort((a, b) => a.difference - b.difference)[0]
  if (!quantity || quantity.difference > 0.06) return null

  return {
    priceQuantity: quantity.quantity,
    priceUnit: normalizeUnit(unitMatch[0]),
    unitPriceEur,
    lineTotalEur
  }
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

  if (!lines.some(line => /^(?:Auftragsbestätigung|Order\s+Confirmation)(?:\s|$)/i.test(line))) {
    throw new Error('Die PDF wurde nicht als Lieferanten-Auftragsbestätigung erkannt.')
  }
  const positions: UllnerPositionPrice[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const price = parseGenericPriceLine(lines[index])
    if (!price) continue

    const positionMatch = lines[index].match(/^(?:\d{4,})?(\d{1,3})(?=\d+[.,]\d{2,3}(?:Stück|Stk|Stg|m|kg))/i)
    const fallbackPosition = positions.length + 1
    positions.push({
      position: positionMatch ? Number(positionMatch[1]) : fallbackPosition,
      ...price,
      description: lines.slice(index, Math.min(lines.length, index + 7)).join(' ')
    })
  }

  const confirmationNumber = text.match(/(?:Auftragsbestätigung|Bestellung)\s*[:#]?\s*([A-Z0-9-]{4,})/i)?.[1] || null
  const referenceNumber = text.match(/(?:Referenz|Kommission|Ihre Bestellung)\s*[:#]?\s*([A-Z0-9-]+)/i)?.[1] || null

  return { confirmationNumber, referenceNumber, supplierFormat: 'generic', positions }
}
