import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOGIN_DISABLED } from '@/lib/authMode'

export async function middleware(request: NextRequest) {
  if (LOGIN_DISABLED) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          })
          response.cookies.set({ name, value: '', ...options })
        }
      }
    }
  )

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const publicAuthPages = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/callback']
  const isPublicAuthPage = publicAuthPages.some(path => request.nextUrl.pathname.startsWith(path))
  const isApprovalPage = request.nextUrl.pathname.startsWith('/pending-approval')

  if (!user && !isPublicAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved,role,email')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin' || user.email?.toLowerCase() === 'v.podolski@lks-technik.de'
    const isApproved = isAdmin || profile?.approved === true

    if (!isApproved && !isApprovalPage && !request.nextUrl.pathname.startsWith('/auth/callback')) {
      return NextResponse.redirect(new URL('/pending-approval', request.url))
    }

    if (isApproved && isApprovalPage) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (
    user &&
    isPublicAuthPage &&
    !request.nextUrl.pathname.startsWith('/reset-password') &&
    !request.nextUrl.pathname.startsWith('/auth/callback')
  ) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
