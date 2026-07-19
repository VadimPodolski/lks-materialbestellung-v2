export type UllnerPositionPrice = {
  position: number
  priceQuantity: number
  priceUnit: string
  pieceQuantity: number | null
  unitPriceEur: number
  lineTotalEur: number
  description: string
}

export type UllnerPriceConfirmation = {
  confirmationNumber: string | null
  referenceNumber: string | null
  supplierFormat: 'ullner' | 'kloeckner' | 'dreckshage' | 'generic'
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
  if (/^(?:stck|stg|stk|st|stück|pcs|pc|ea)/i.test(value)) return 'Stück'
  if (/^(?:meter|metre|meters|metres|mtr|lfm|m)$/i.test(value)) return 'm'
  return value.toLowerCase()
}

function parseStructuredGenericPriceLine(line: string) {
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

function localizedNumber(value: string) {
  const compact = value.replace(/\s+/g, '').replace(/[^\d,.-]/g, '')
  const comma = compact.lastIndexOf(',')
  const dot = compact.lastIndexOf('.')

  if (comma >= 0 && dot >= 0) {
    return comma > dot
      ? Number(compact.replace(/\./g, '').replace(',', '.'))
      : Number(compact.replace(/,/g, ''))
  }

  if (comma >= 0) return Number(compact.replace(',', '.'))
  return Number(compact)
}

function extractPieceQuantity(value: string) {
  const matches = Array.from(value.matchAll(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:Stück|Stck\.?|Stk\.?|Stg\.?|St\.?|ST|PCS|PC|EA|Stäbe?|Stab)(?=\s|$|[.,;])/gi
  ))
  if (matches.length === 0) return null

  const quantity = localizedNumber(matches[0][1])
  return Number.isFinite(quantity) ? quantity : null
}

function parseLooseGenericPriceLine(line: string) {
  const unitPattern = 'Stück|Stck\\.?|Stk\\.?|Stg\\.?|St\\.?|ST|PCS|PC|EA|Stäbe?|Stab|Meter|Metre|Meters|Metres|mtr|lfm|kg|m'
  const quantityPattern = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})(?=\\s|$|[.,;/])`, 'gi')
  const quantityMatches = Array.from(line.matchAll(quantityPattern))
  const moneyPattern = /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[.,]\d{2,4}/g
  const moneyMatches = Array.from(line.matchAll(moneyPattern))
  let best: {
    priceQuantity: number
    priceUnit: string
    pieceQuantity: number | null
    unitPriceEur: number
    lineTotalEur: number
    score: number
  } | null = null

  for (const quantityMatch of quantityMatches) {
    const quantity = localizedNumber(quantityMatch[1])
    const quantityEnd = (quantityMatch.index || 0) + quantityMatch[0].length
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const followingPrices = moneyMatches.filter(match => (match.index || 0) >= quantityEnd)
    for (let unitIndex = 0; unitIndex < followingPrices.length - 1; unitIndex += 1) {
      for (let totalIndex = unitIndex + 1; totalIndex < followingPrices.length; totalIndex += 1) {
        const unitPriceEur = localizedNumber(followingPrices[unitIndex][0])
        const lineTotalEur = localizedNumber(followingPrices[totalIndex][0])
        if (!Number.isFinite(unitPriceEur) || !Number.isFinite(lineTotalEur)) continue

        for (const priceBase of [1, 100, 1000]) {
          const difference = Math.abs(quantity * unitPriceEur / priceBase - lineTotalEur)
          const score = difference / Math.max(lineTotalEur, 1)
          if (difference > 0.08 && score > 0.002) continue
          if (best && best.score <= score) continue

          const priceUnit = normalizeUnit(quantityMatch[2])
          best = {
            priceQuantity: quantity,
            priceUnit,
            pieceQuantity: priceUnit === 'Stück' ? quantity : extractPieceQuantity(line),
            unitPriceEur,
            lineTotalEur,
            score
          }
        }
      }
    }
  }

  if (!best) return null
  const { score: _score, ...price } = best
  return price
}

function parseGenericPriceLine(line: string) {
  const structured = parseStructuredGenericPriceLine(line)
  if (structured) {
    return {
      ...structured,
      pieceQuantity: structured.priceUnit === 'Stück'
        ? structured.priceQuantity
        : extractPieceQuantity(line)
    }
  }

  return parseLooseGenericPriceLine(line)
}

function parseDreckshagePositions(text: string) {
  const lineMarkers = Array.from(text.matchAll(/(?:^|\n)\s*(\d{1,3})\s+(?:\n\s*)?(\d{5,})(?=\s|\n)/g))
  const markers = lineMarkers.length > 0
    ? lineMarkers
    : Array.from(text.matchAll(/\b(\d{1,3})\s+(\d{5,})\b/g))
  const positions: UllnerPositionPrice[] = []

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const blockStart = marker.index || 0
    const blockEnd = markers[index + 1]?.index ?? text.length
    const block = text.slice(blockStart, blockEnd).replace(/\s+/g, ' ').trim()
    const price = parseGenericPriceLine(block)

    if (!price) continue

    positions.push({
      position: Number(marker[1]),
      ...price,
      description: block
    })
  }

  if (positions.length === 0) {
    const fullDocument = text.replace(/\s+/g, ' ').trim()
    const price = parseGenericPriceLine(fullDocument)

    if (price) {
      const position = Number(
        text.match(/(?:^|\n)\s*(?:Pos(?:ition)?\.?\s*)?0*(\d{1,3})(?:\s|\n)+\d{5,}/i)?.[1]
        || 1
      )

      positions.push({
        position,
        ...price,
        description: fullDocument
      })
    }
  }

  return positions
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
            pieceQuantity: price.priceUnit === 'Stück' ? price.priceQuantity : extractPieceQuantity(lines.slice(index + 1, priceIndex + 1).join(' ')),
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

export function parseSupplierPriceConfirmation(text: string, supplierName = ''): UllnerPriceConfirmation {
  if (/(?:ULLNER\s*u\.?\s*ULLNER|ullner\.de)/i.test(text)) {
    return parseUllnerPriceConfirmation(text)
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const compactText = text.replace(/\s+/g, '')
  const isKloeckner = /(?:klöckner|kloeckner)/i.test(text)
  const isDreckshage = /dreckshage/i.test(`${supplierName} ${text}`)
  const hasConfirmationTitle = /(?:Auftrags[- ]?best(?:ätigung|\.)|Bestellbestätigung|OrderConfirmation|SalesOrderConfirmation|Angebot|Offerte|Quotation|Quote)/i.test(compactText)

  if (!hasConfirmationTitle) {
    throw new Error('Die PDF wurde nicht als Lieferanten-Auftragsbestätigung oder Angebot erkannt.')
  }
  const positions: UllnerPositionPrice[] = isDreckshage ? parseDreckshagePositions(text) : []

  for (let index = 0; positions.length === 0 && index < lines.length; index += 1) {
    let price: ReturnType<typeof parseGenericPriceLine> = null
    let priceLine = lines[index]
    let consumedLines = 1

    for (let lineCount = 1; lineCount <= 10 && index + lineCount <= lines.length; lineCount += 1) {
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

    const positionMatch = priceLine.match(/^(?:Pos(?:ition)?\.?\s*)?0*(\d{1,4})(?=\s|[.:;-])/i)
      || priceLine.match(/^(?:\d{4,})?(\d{1,3})(?=\d+[.,]\d{2,3}(?:Stück|Stck|Stk|Stg|St|m|kg))/i)
    const fallbackPosition = positions.length + 1
    let descriptionEnd = Math.min(lines.length, index + consumedLines + 6)

    for (let descriptionIndex = index + consumedLines; descriptionIndex < descriptionEnd; descriptionIndex += 1) {
      if (/^(?:Pos(?:ition)?\.?\s*)?0*\d{1,4}(?:\s+\d{4,}|\s*$)/i.test(lines[descriptionIndex])) {
        descriptionEnd = descriptionIndex
        break
      }
    }

    positions.push({
      position: positionMatch ? Number(positionMatch[1]) : fallbackPosition,
      ...price,
      description: lines.slice(index, descriptionEnd).join(' ')
    })
    index += consumedLines - 1
  }

  const confirmationNumber = text.match(/(?:Auftrags[- ]?best(?:ätigung|\.)|Bestellbestätigung|Bestellung|Order\s*Confirmation|Angebot|Offerte|Quotation|Quote)\s*(?:s[- ]?Nr\.?|Nr\.?|No\.?)?\s*[:#]?\s*([A-Z0-9/-]{4,})/i)?.[1] || null
  const referenceNumber = text.match(/\b(?:AB-[A-Z0-9]+(?:-[A-Z0-9]+)*|TAFEL-\d+)\b/i)?.[0]
    || text.match(/(?:Ihre\s+(?:Bestell|Auftrags)(?:nummer|nr\.?)|Your\s+(?:order|reference))\s*[:#]?\s*([A-Z0-9/-]{4,})/i)?.[1]
    || null

  const supplierFormat = isKloeckner ? 'kloeckner' : isDreckshage ? 'dreckshage' : 'generic'
  return { confirmationNumber, referenceNumber, supplierFormat, positions }
}
