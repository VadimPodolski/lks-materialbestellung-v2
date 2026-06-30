'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMsg(error.message)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1>Anmelden</h1>

        <form className="grid" onSubmit={login}>
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
      </div>
    </main>
  )
}
