'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ensureCurrentUserProfile } from '@/lib/profiles'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMsg(error.message)
      return
    }

    await ensureCurrentUserProfile(supabase)

    router.push('/')
    router.refresh()
  }

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Anmelden</h1>

        <form className="grid auth-form" onSubmit={login}>
          <div>
            <label>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button>Anmelden</button>

          {msg && <p className="error">{msg}</p>}
        </form>

        <div className="auth-link-row">
          <Link href="/forgot-password">Passwort vergessen?</Link>
          <Link href="/register">Registrieren</Link>
        </div>
      </div>
    </main>
  )
}
