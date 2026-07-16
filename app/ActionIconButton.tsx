import type { ButtonHTMLAttributes } from 'react'

type ActionIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  action: 'edit' | 'delete'
  label: string
}

export default function ActionIconButton({ action, label, className = '', ...props }: ActionIconButtonProps) {
  return (
    <button
      type="button"
      className={`square-action-button ${action} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {action === 'edit' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="m6 7 1 13h10l1-13" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      )}
    </button>
  )
}
