'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { LOGIN_DISABLED } from '@/lib/authMode'

export default function LoginLogoutLink() {
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (LOGIN_DISABLED) {
      setUserEmail(null)
      return
    }

    const supabase = createClient()

    async function init() {
      const {
        data: { session }
      } = await supabase.auth.getSession()

      setUserEmail(session?.user.email || null)
    }

    init()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (LOGIN_DISABLED) {
    return null
  }

  if (userEmail === undefined) {
    return null
  }

  if (!userEmail) {
    return <Link href="/login">Login</Link>
  }

  return (
    <>
      <span className="nav-user" title={userEmail}>{userEmail}</span>
      <button type="button" className="nav-link-button" onClick={logout}>
        Logout
      </button>
    </>
  )
}
