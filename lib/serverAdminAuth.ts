import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function isAdminRequest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false

  const cookieStore = cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set() {},
      remove() {}
    }
  })
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return false
  if (user.email?.trim().toLowerCase() === 'v.podolski@lks-technik.de') return true

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.role === 'admin'
}

export async function isCronOrAdminRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  return isAdminRequest()
}
