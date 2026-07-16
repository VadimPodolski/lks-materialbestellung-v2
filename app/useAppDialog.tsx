'use client'

import { useCallback, useState } from 'react'
import ConfirmDialog from '@/app/ConfirmDialog'

type DialogOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string | null
  danger?: boolean
}

type DialogRequest = DialogOptions & {
  resolve: (confirmed: boolean) => void
}

export function useAppDialog() {
  const [request, setRequest] = useState<DialogRequest | null>(null)

  const ask = useCallback((options: DialogOptions) => new Promise<boolean>(resolve => {
    setRequest({ ...options, resolve })
  }), [])

  const close = useCallback((confirmed: boolean) => {
    const current = request
    setRequest(null)
    current?.resolve(confirmed)
  }, [request])

  const notify = useCallback((title: string, message: string) => (
    ask({ title, message, confirmLabel: 'OK', cancelLabel: null, danger: false }).then(() => undefined)
  ), [ask])

  const dialog = request ? (
    <ConfirmDialog
      open
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel || 'Bestätigen'}
      cancelLabel={request.cancelLabel === undefined ? 'Abbrechen' : request.cancelLabel}
      danger={request.danger ?? false}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null

  return { ask, notify, dialog }
}
