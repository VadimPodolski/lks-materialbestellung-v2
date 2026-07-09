import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/orders'
  }

  return value
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = getSafeNextPath(requestUrl.searchParams.get('next'))
  let response = NextResponse.redirect(new URL(nextPath, request.url))

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            response.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            response.cookies.set({ name, value: '', ...options })
          }
        }
      }
    )

    await supabase.auth.exchangeCodeForSession(code)
  }

  return response
}
