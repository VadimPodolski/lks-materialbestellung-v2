'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginLogoutLink() {
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    async function checkLogin() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      setLoggedIn(!!data.user)
    }

    checkLogin()
  }, [])

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
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
