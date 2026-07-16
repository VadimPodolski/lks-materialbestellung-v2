export type TubeShape = 'square' | 'rectangular' | 'round'

export type TubeWeightResult = {
  shape: TubeShape
  weightKgPerMeter: number
}

const STEEL_DENSITY_KG_M3 = 7850
const STAINLESS_STEEL_DENSITY_KG_M3 = 7900
const ALUMINIUM_DENSITY_KG_M3 = 2700

export function materialDensityKgM3(material: string) {
  const normalized = material.trim().toLowerCase()

  if (/aluminium|\balu\b|en\s*aw|almg|alsi/.test(normalized)) {
    return ALUMINIUM_DENSITY_KG_M3
  }

  if (/edelstahl|\bva\b|v2a|v4a|inox|1\.[34]\d{3}/.test(normalized)) {
    return STAINLESS_STEEL_DENSITY_KG_M3
  }

  return STEEL_DENSITY_KG_M3
}

export function calculateTubeWeightKgPerMeter(crossSection: string, material = 'Stahl'): TubeWeightResult | null {
  const normalized = crossSection.toLowerCase().replace(/×/g, 'x')
  const dimensions = normalized
    .match(/\d+(?:[.,]\d+)?/g)
    ?.map(value => Number(value.replace(',', '.')))
    .filter(Number.isFinite) || []
  const explicitlyRound = /rund|kreis|ø|⌀/.test(normalized)
  const density = materialDensityKgM3(material)

  if (explicitlyRound || dimensions.length === 2) {
    const [outsideDiameter, wallThickness] = dimensions
    const insideDiameter = outsideDiameter - 2 * wallThickness
    if (!(outsideDiameter > 0) || !(wallThickness > 0) || insideDiameter < 0) return null

    const areaMm2 = Math.PI / 4 * (outsideDiameter ** 2 - insideDiameter ** 2)
    return { shape: 'round', weightKgPerMeter: areaMm2 * density / 1_000_000 }
  }

  if (dimensions.length >= 3) {
    const [outsideWidth, outsideHeight, wallThickness] = dimensions
    const insideWidth = outsideWidth - 2 * wallThickness
    const insideHeight = outsideHeight - 2 * wallThickness
    if (!(outsideWidth > 0) || !(outsideHeight > 0) || !(wallThickness > 0) || insideWidth < 0 || insideHeight < 0) return null

    const areaMm2 = outsideWidth * outsideHeight - insideWidth * insideHeight
    return {
      shape: Math.abs(outsideWidth - outsideHeight) < 0.001 ? 'square' : 'rectangular',
      weightKgPerMeter: areaMm2 * density / 1_000_000
    }
  }

  return null
}

export function calculateTubeItemWeightKg(item: {
  material: string
  cross_section: string
  length_mm: number | null
  quantity: number
  order_unit?: string | null
  pieces_per_package?: number | null
}) {
  const weight = calculateTubeWeightKgPerMeter(item.cross_section, item.material)
  if (!weight) return null

  const pieces = item.order_unit === 'paket'
    ? Number(item.quantity || 0) * Number(item.pieces_per_package || 0)
    : item.order_unit === 'kg'
      ? 0
      : Number(item.quantity || 0)

  return weight.weightKgPerMeter * Number(item.length_mm || 0) / 1000 * pieces
}

export function formatTubeWeight(value: number) {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
}

export function formatTubeWeightPerMeter(value: number) {
  return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/m`
}
