'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ensureCurrentUserProfile } from '@/lib/profiles'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState('')

  async function register(e: React.FormEvent) {
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
    const normalizedEmail = email.trim().toLowerCase()
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/orders`
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName.trim()
        }
      }
    })

    if (error) {
      setMsg(error.message)
      return
    }

    if (data.user) {
      const notificationResponse = await fetch('/api/registration-approval/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, email: normalizedEmail })
      })
      const notification = await notificationResponse.json().catch(() => ({}))

      if (!notificationResponse.ok) {
        setMsg(notification.error || 'Die Registrierung wurde angelegt, aber der Administrator konnte nicht per E-Mail benachrichtigt werden.')
        return
      }

      if (notification.alreadyApproved) {
        setSuccess('Für diese E-Mail-Adresse besteht bereits ein freigegebenes Konto. Du kannst dich direkt anmelden.')
        return
      }

      if (notification.existingRegistration && notification.needsEmailConfirmation) {
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: normalizedEmail,
          options: { emailRedirectTo }
        })
        if (resendError) {
          setMsg(`Die Admin-Benachrichtigung wurde versendet, die Bestätigungsmail konnte aber nicht erneut gesendet werden: ${resendError.message}`)
          return
        }
      }
    }

    if (data.session) {
      await ensureCurrentUserProfile(supabase, data.user)
      router.push('/orders')
      router.refresh()
      return
    }

    setSuccess('Registrierung angelegt. Bitte bestätige deine E-Mail-Adresse. Der Administrator wurde über deine Registrierung informiert und prüft anschließend deinen Zugang.')
  }

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Registrieren</h1>

        <form className="grid auth-form" onSubmit={register}>
          <div>
            <label>Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} required />
          </div>

          <div>
            <label>E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div>
            <label>Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <div>
            <label>Passwort wiederholen</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          </div>

          <button>Registrieren</button>

          {msg && <p className="error">{msg}</p>}
          {success && <p className="success">{success}</p>}
        </form>

        <p className="small auth-link-row">
          Schon registriert? <Link href="/login">Anmelden</Link>
        </p>
      </div>
    </main>
  )
}
