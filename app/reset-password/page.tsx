'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState('')

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setSuccess('')

    if (password.length < 8) {
      setMsg('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }

    if (password !== confirmPassword) {
      setMsg('Die Passwörter stimmen nicht überein.')
      return
    }

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setMsg(error.message)
      return
    }

    if (userData.user?.id) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', userData.user.id)

      if (profileError) {
        setMsg(`Das Passwort wurde geändert, aber der Pflichtwechsel konnte nicht abgeschlossen werden: ${profileError.message}`)
        return
      }
    }

    setSuccess('Passwort wurde geändert. Du wirst zur Anmeldung weitergeleitet.')
    window.setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    }, 1200)
  }

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Neues Passwort</h1>
        <p>Bitte lege ein neues persönliches Passwort fest.</p>

        <form className="grid auth-form" onSubmit={updatePassword}>
          <div>
            <label>Neues Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <div>
            <label>Passwort wiederholen</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>

          <button>Passwort speichern</button>

          {msg && <p className="error">{msg}</p>}
          {success && <p className="success">{success}</p>}
        </form>

        <p className="small auth-link-row">
          Zur <Link href="/login">Anmeldung</Link>
        </p>
      </div>
    </main>
  )
}
