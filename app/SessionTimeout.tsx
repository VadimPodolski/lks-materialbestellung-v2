'use client'

import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { LOGIN_DISABLED } from '@/lib/authMode'

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
const ADMIN_EMAIL = 'v.podolski@lks-technik.de'

export default function SessionTimeout() {
  useEffect(() => {
    if (LOGIN_DISABLED) return

    const supabase = createClient()
    let logoutTimer: number | undefined
    let roleRetryTimer: number | undefined
    let scheduleVersion = 0
    let active = true
    let logoutInProgress = false

    function clearTimers() {
      if (logoutTimer !== undefined) window.clearTimeout(logoutTimer)
      if (roleRetryTimer !== undefined) window.clearTimeout(roleRetryTimer)
      logoutTimer = undefined
      roleRetryTimer = undefined
    }

    async function logoutAfterTimeout() {
      if (!active || logoutInProgress) return

      logoutInProgress = true
      const { error } = await supabase.auth.signOut({ scope: 'local' })

      if (!active) return

      if (error) {
        logoutInProgress = false
        logoutTimer = window.setTimeout(logoutAfterTimeout, 60_000)
        return
      }

      window.location.replace('/login')
    }

    async function scheduleTimeout(session: Session | null) {
      const currentVersion = ++scheduleVersion
      clearTimers()

      if (!session?.user || !active) return

      const email = session.user.email?.trim().toLowerCase() || ''
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!active || currentVersion !== scheduleVersion) return

      if (profileError) {
        roleRetryTimer = window.setTimeout(() => void scheduleTimeout(session), 60_000)
        return
      }

      if (profile?.role === 'admin' || email === ADMIN_EMAIL) return

      const signedInAt = Date.parse(session.user.last_sign_in_at || '')
      const remainingMs = Number.isFinite(signedInAt)
        ? signedInAt + SESSION_DURATION_MS - Date.now()
        : SESSION_DURATION_MS

      if (remainingMs <= 0) {
        await logoutAfterTimeout()
        return
      }

      logoutTimer = window.setTimeout(logoutAfterTimeout, remainingMs)
    }

    void supabase.auth.getSession().then(({ data }) => scheduleTimeout(data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void scheduleTimeout(session), 0)
    })

    return () => {
      active = false
      scheduleVersion += 1
      clearTimers()
      subscription.unsubscribe()
    }
  }, [])

  return null
}
