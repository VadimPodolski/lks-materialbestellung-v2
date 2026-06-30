'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginLogoutLink() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const {
        data: { session }
      } = await supabase.auth.getSession()

      setLoggedIn(!!session)
    }

    init()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loggedIn === null) {
    return null
  }

  if (!loggedIn) {
    return <Link href="/login">Login</Link>
  }

  return (
    <button type="button" className="nav-link-button" onClick={logout}>
      Logout
    </button>
  )
}
