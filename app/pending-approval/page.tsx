'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function PendingApprovalPage() {
  const [working, setWorking] = useState(false)

  async function logout() {
    setWorking(true)
    await createClient().auth.signOut()
    window.location.href = '/login'
  }

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Freigabe ausstehend</h1>
        <p>Deine E-Mail-Adresse wurde bestätigt. Ein Administrator prüft jetzt deinen Zugang.</p>
        <p className="small">Sobald dein Konto freigegeben wurde, kannst du dich normal anmelden.</p>
        <button type="button" onClick={logout} disabled={working}>
          {working ? 'Abmelden...' : 'Abmelden'}
        </button>
      </div>
    </main>
  )
}
