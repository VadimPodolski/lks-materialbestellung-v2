'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('v.podolski@lks-technik.de')
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

    router.push('/orders')
  }

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMsg('Abgemeldet.')
  }

  return (
    <main className="container">
      <h1>Login</h1>

      <form className="card grid" onSubmit={login}>
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

        <div className="actions">
          <button type="submit">Einloggen</button>
          <button type="button" className="secondary" onClick={logout}>
            Ausloggen
          </button>
        </div>

        {msg && <p className="error">{msg}</p>}
      </form>
    </main>
  )
}
