'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AdminNavLink() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      setIsAdmin(profile?.role === 'admin' || user.email?.toLowerCase() === 'v.podolski@lks-technik.de')
    })
  }, [])

  return isAdmin ? <Link href="/users">Benutzer</Link> : null
}
