import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminRole, normalizeUserRole } from '@/lib/roles'

export async function getAdminRequestContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

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
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = normalizeUserRole(profile?.role)
  return isAdminRole(role) ? { user, role } : null
}

export async function getAdminRequestUser() {
  return (await getAdminRequestContext())?.user || null
}

export async function isAdminRequest() {
  return Boolean(await getAdminRequestUser())
}

export async function isCronOrAdminRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  return isAdminRequest()
}
