'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AdminNavLink() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    let refreshTimer: number | undefined

    async function refreshAdmin(user: { id: string; email?: string } | null) {
      if (!user) {
        if (active) setIsAdmin(false)
        return
      }

      if (user.email?.toLowerCase() === 'v.podolski@lks-technik.de') {
        if (active) setIsAdmin(true)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (active) setIsAdmin(profile?.role === 'admin')
    }

    void supabase.auth.getUser().then(({ data }) => refreshAdmin(data.user))

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void refreshAdmin(session?.user || null)
      }, 0)
    })

    return () => {
      active = false
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      subscription.unsubscribe()
    }
  }, [])

  return isAdmin ? <Link href="/users">Benutzer</Link> : null
}
