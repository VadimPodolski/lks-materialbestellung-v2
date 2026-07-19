export type UllnerPositionPrice = {
  position: number
  priceQuantity: number
  priceUnit: string
  pieceQuantity: number | null
  unitPriceEur: number
  lineTotalEur: number
  description: string
  materialHint?: string | null
  crossSectionHint?: string | null
  pieceLengthMm?: number | null
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

function parseCompactDreckshagePrice(value: string) {
  const matches = Array.from(value.matchAll(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*Meter\s*([\d.]+,\d{2,4})\s*Meter\s*([\d.]+,\d{2})/gi
  ))

  for (const match of matches) {
    const priceQuantity = localizedNumber(match[1])
    const unitPriceEur = localizedNumber(match[2])
    const lineTotalEur = localizedNumber(match[3])
    const difference = Math.abs(priceQuantity * unitPriceEur - lineTotalEur)

    if (
      !Number.isFinite(priceQuantity)
      || !Number.isFinite(unitPriceEur)
      || !Number.isFinite(lineTotalEur)
      || difference > 0.08
    ) continue

    return {
      priceQuantity,
      priceUnit: 'm',
      pieceQuantity: null,
      unitPriceEur,
      lineTotalEur
    }
  }

  return null
}

function enrichDreckshageDescription(value: string) {
  const qeCode = value.match(
    /QE\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d{4})/i
  )

  if (!qeCode) return value

  const crossSection = `${qeCode[1]} x ${qeCode[2]} x ${qeCode[3]} mm`
  const materialNumber = `1.${qeCode[4]}`
  return `${value} ${crossSection} ${materialNumber}`
}

function extractDreckshageProduct(value: string) {
  const qeCode = value.match(
    /QE\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d+(?:[.,]\d+)?)\s*[.]\s*(\d{4})/i
  )
  const dimension = qeCode
    ? `${qeCode[1]}x${qeCode[2]}x${qeCode[3]} mm`
    : value.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*mm/i)

  const crossSectionHint = typeof dimension === 'string'
    ? dimension
    : dimension ? `${dimension[1]}x${dimension[2]}x${dimension[3]} mm` : null
  const grade = qeCode ? `1.${qeCode[4]}` : value.match(/1\s*[.,]\s*(4301|4307|4541)/)?.[1]

  return {
    materialHint: grade ? 'Edelstahl V2A' : null,
    crossSectionHint,
    pieceLengthMm: 6000
  }
}

function parseUnorderedDreckshagePrice(value: string) {
  const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  const quantityMatches = Array.from(normalized.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(Meter|Metre|Meters|Metres|mtr|lfm|m)(?![a-z])/gi
  ))
  const moneyMatches = Array.from(normalized.matchAll(
    /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[.,]\d{2,4}/g
  ))
  let best: {
    priceQuantity: number
    priceUnit: string
    pieceQuantity: number | null
    unitPriceEur: number
    lineTotalEur: number
    score: number
  } | null = null

  for (const quantityMatch of quantityMatches) {
    const priceQuantity = localizedNumber(quantityMatch[1])
    if (!Number.isFinite(priceQuantity) || priceQuantity <= 0) continue

    for (let unitIndex = 0; unitIndex < moneyMatches.length; unitIndex += 1) {
      const unitPriceEur = localizedNumber(moneyMatches[unitIndex][0])
      if (!Number.isFinite(unitPriceEur) || unitPriceEur <= 0) continue

      for (let totalIndex = 0; totalIndex < moneyMatches.length; totalIndex += 1) {
        if (unitIndex === totalIndex) continue

        const lineTotalEur = localizedNumber(moneyMatches[totalIndex][0])
        if (!Number.isFinite(lineTotalEur) || lineTotalEur <= unitPriceEur) continue

        const difference = Math.abs(priceQuantity * unitPriceEur - lineTotalEur)
        const score = difference / Math.max(lineTotalEur, 1)
        if (difference > 0.08 && score > 0.002) continue
        if (best && best.score <= score) continue

        const sixMeterPieces = priceQuantity / 6
        best = {
          priceQuantity,
          priceUnit: 'm',
          pieceQuantity: Math.abs(sixMeterPieces - Math.round(sixMeterPieces)) < 0.001
            ? Math.round(sixMeterPieces)
            : null,
          unitPriceEur,
          lineTotalEur,
          score
        }
      }
    }
  }

  if (!best) return null
  const { score: _score, ...price } = best
  return price
}

function parseDreckshagePositions(text: string) {
  const fullDocument = text.replace(/\s+/g, ' ').trim()
  const documentPrice = parseUnorderedDreckshagePrice(fullDocument)

  if (documentPrice) {
    const position = Number(
      text.match(/(?:^|\n)\s*0*(\d{1,3})\s+(?:\n\s*)?\d{5,}(?=\s|\n)/)?.[1]
      || text.match(/\bPos(?:ition)?\.?\s*[:#]?\s*0*(\d{1,3})\b/i)?.[1]
      || 1
    )

    return [{
      position,
      ...documentPrice,
      description: enrichDreckshageDescription(fullDocument),
      ...extractDreckshageProduct(fullDocument)
    }]
  }

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
      || parseCompactDreckshagePrice(block)
      || parseUnorderedDreckshagePrice(block)

    if (!price) continue

    positions.push({
      position: Number(marker[1]),
      ...price,
      description: enrichDreckshageDescription(block),
      ...extractDreckshageProduct(block)
    })
  }

  if (positions.length === 0) {
    const price = parseGenericPriceLine(fullDocument)
      || parseCompactDreckshagePrice(fullDocument)
      || parseUnorderedDreckshagePrice(fullDocument)

    if (price) {
      const position = Number(
        text.match(/(?:^|\n)\s*(?:Pos(?:ition)?\.?\s*)?0*(\d{1,3})(?:\s|\n)+\d{5,}/i)?.[1]
        || 1
      )

      positions.push({
        position,
        ...price,
        description: enrichDreckshageDescription(fullDocument),
        ...extractDreckshageProduct(fullDocument)
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
