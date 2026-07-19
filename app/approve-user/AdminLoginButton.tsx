'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AdminLoginButton({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function switchToAdmin() {
    setLoading(true)
    await createClient().auth.signOut()
    router.push(`/login?next=${encodeURIComponent(nextPath)}`)
    router.refresh()
  }

  return (
    <button type="button" onClick={switchToAdmin} disabled={loading}>
      {loading ? 'Abmelden...' : 'Mit Administratorkonto anmelden'}
    </button>
  )
}
