export type UllnerPositionPrice = {
  position: number
  priceQuantity: number
  priceUnit: string
  unitPriceEur: number
  lineTotalEur: number
}

export type UllnerPriceConfirmation = {
  confirmationNumber: string | null
  referenceNumber: string | null
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
  const compact = line.replace(/\s+/g, '')
  const match = compact.match(/^([\d.]+,\d{3})(m|kg|Stg\.?)([\d.,]+)$/i)

  if (!match) return null

  const priceQuantity = germanNumber(match[1])
  const prices = splitUnitPriceAndTotal(match[3], priceQuantity)

  if (!prices || prices.difference > 0.06) return null

  return {
    priceQuantity,
    priceUnit: /^stg/i.test(match[2]) ? 'Stück' : match[2].toLowerCase(),
    unitPriceEur: prices.unitPrice,
    lineTotalEur: prices.total
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
          positions.push({ position, ...price })
          index = priceIndex
          break
        }
      }
    }
  }

  const confirmationNumber = text.match(/KAB\s+(\d+)/i)?.[1] || null
  const referenceNumber = text.match(/Referenznummer:\s*([A-Z0-9-]+)/i)?.[1] || null

  return { confirmationNumber, referenceNumber, positions }
}
