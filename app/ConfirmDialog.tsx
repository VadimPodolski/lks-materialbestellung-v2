'use client'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string | null
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Löschen',
  cancelLabel = 'Abbrechen',
  danger = true,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="actions confirm-modal-actions">
          {cancelLabel && <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>}
          <button type="button" className={danger ? 'danger' : undefined} onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
