'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function restoreRecoverySession() {
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })

        if (error) {
          if (active) setMsg('Der Passwort-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.')
          return
        }

        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      }

      const { data, error } = await supabase.auth.getSession()
      if (!active) return

      if (error || !data.session) {
        setMsg('Der Passwort-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.')
        return
      }

      setSessionReady(true)
    }

    void restoreRecoverySession()

    return () => {
      active = false
    }
  }, [])

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setSuccess('')

    if (!sessionReady) {
      setMsg('Der Passwort-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.')
      return
    }

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

          <button disabled={!sessionReady}>Passwort speichern</button>

          {msg && <p className="error">{msg}</p>}
          {success && <p className="success">{success}</p>}
        </form>

      </div>
    </main>
  )
}
