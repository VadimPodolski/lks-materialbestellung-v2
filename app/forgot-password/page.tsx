'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState('')

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setSuccess('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
    })

    if (error) {
      setMsg(error.message)
      return
    }

    setSuccess('Wenn die E-Mail registriert ist, wurde ein Link zum Zurücksetzen gesendet.')
  }

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Passwort vergessen</h1>

        <form className="grid auth-form" onSubmit={sendResetLink}>
          <div>
            <label>E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <button>Link senden</button>

          {msg && <p className="error">{msg}</p>}
          {success && <p className="success">{success}</p>}
        </form>

        <p className="small auth-link-row">
          Zurück zur <Link href="/login">Anmeldung</Link>
        </p>
      </div>
    </main>
  )
}
