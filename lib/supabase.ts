import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  return browserClient
}

export const statusLabels: Record<string, string> = {
  offen: 'Offen',
  bestellt: 'Bestellt',
  teilweise_geliefert: 'Teilweise geliefert',
  geliefert: 'Geliefert',
  storniert: 'Storniert'
}

export function statusClass(status: string) {
  switch (status) {
    case 'offen': return 'badge red'
    case 'bestellt': return 'badge yellow'
    case 'teilweise_geliefert': return 'badge blue'
    case 'geliefert': return 'badge green'
    case 'storniert': return 'badge gray'
    default: return 'badge'
  }
}
