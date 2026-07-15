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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/orders`,
        data: {
          full_name: fullName.trim()
        }
      }
    })

    if (error) {
      setMsg(error.message)
      return
    }

    if (data.session) {
      await ensureCurrentUserProfile(supabase, data.user)
      router.push('/orders')
      router.refresh()
      return
    }

    setSuccess('Registrierung angelegt. Bitte bestätige deine E-Mail-Adresse über den Link in der Mail.')
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
