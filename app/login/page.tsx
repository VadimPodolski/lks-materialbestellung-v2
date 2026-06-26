'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return setMessage(error.message)
    router.push('/dashboard')
  }

  return <main className="container">
    <div className="card" style={{maxWidth: 460, margin: '60px auto'}}>
      <h1>Login</h1>
      <form onSubmit={login} className="grid">
        <div><label>E-Mail</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
        <div><label>Passwort</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
        <button>Anmelden</button>
        {message && <p className="error">{message}</p>}
      </form>
    </div>
  </main>
}
