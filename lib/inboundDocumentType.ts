export type SupplierDocumentType = 'supplier_confirmation' | 'supplier_quote'

export function classifyInboundSupplierDocument(args: {
  subject?: string | null
  fileName?: string | null
  pdfText?: string | null
}): SupplierDocumentType | null {
  const text = [args.subject, args.fileName, args.pdfText].filter(Boolean).join('\n')

  if (/(?:auftragsbest[äa]tigung|auftragsbestaetigung|order\s+confirmation|\bKAB\s*[-:]?\s*\d+)/i.test(text)) {
    return 'supplier_confirmation'
  }

  if (/(?:\bangebot\b|\bquotation\b|\bquote\b|\bKAN\s*[-:]?\s*\d+)/i.test(text)) {
    return 'supplier_quote'
  }

  return null
}
