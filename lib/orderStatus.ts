export function canManuallySetOrderStatus(currentStatus: string, nextStatus: string) {
  return !(
    currentStatus === 'bestellt'
    && (nextStatus === 'offen' || nextStatus === 'storniert')
  )
}
