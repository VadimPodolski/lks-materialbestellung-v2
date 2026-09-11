import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { getAdminRequestContext } from '@/lib/serverAdminAuth'
import { isAdminRole, normalizeUserRole } from '@/lib/roles'

const protectedAdminEmail = 'vadim.podolski@online.de'

function normalizedEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizedName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function resetRedirect(request: Request) {
  return `${new URL(request.url).origin}/reset-password?forced=1`
}

async function requireAdmin() {
  const context = await getAdminRequestContext()
  if (!context) {
    return { context: null, response: NextResponse.json({ error: 'Keine Administratorberechtigung.' }, { status: 403 }) }
  }
  return { context, response: null }
}

export async function POST(request: Request) {
  const authorization = await requireAdmin()
  if (authorization.response) return authorization.response

  try {
    const body = await request.json()
    const action = body.action === 'reset-password' ? 'reset-password' : 'create'
    const admin = createAdminClient()

    if (action === 'reset-password') {
      const email = normalizedEmail(body.email)
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 })
      }
      const { data: targetProfile } = await admin.from('profiles').select('role').eq('email', email).maybeSingle()
      if (isAdminRole(targetProfile?.role) && authorization.context?.role !== 'superadmin') {
        return NextResponse.json({ error: 'Nur der Superadmin darf das Passwort eines Administrators zurücksetzen.' }, { status: 403 })
      }

      const { error } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect(request)
      })
      if (error) throw error

      return NextResponse.json({ success: true, message: `Passwort-Link wurde an ${email} gesendet.` })
    }

    const email = normalizedEmail(body.email)
    const fullName = normalizedName(body.fullName)
    const role = normalizeUserRole(body.role)
    if (isAdminRole(role) && authorization.context?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Nur der Superadmin darf Administratoren anlegen.' }, { status: 403 })
    }
    if (!fullName) {
      return NextResponse.json({ error: 'Bitte einen Namen angeben.' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 })
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, name: fullName },
      redirectTo: resetRedirect(request)
    })
    if (error) throw error
    if (!data.user) throw new Error('Benutzer konnte nicht angelegt werden.')

    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role,
      approved: true,
      must_change_password: true
    }, { onConflict: 'id' })
    if (profileError) throw profileError

    return NextResponse.json({ success: true, message: `Einladung wurde an ${email} gesendet.` })
  } catch (error: any) {
    const message = String(error?.message || 'Benutzeraktion fehlgeschlagen.')
    const duplicate = /already|registered|exists|duplicate/i.test(message)
    return NextResponse.json({
      error: duplicate ? 'Für diese E-Mail-Adresse existiert bereits ein Benutzer.' : message
    }, { status: duplicate ? 409 : 500 })
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin()
  if (authorization.response || !authorization.context) return authorization.response

  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const email = normalizedEmail(body.email)
    const fullName = normalizedName(body.fullName)
    const role = normalizeUserRole(body.role)
    if (!id || !fullName || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Name und gültige E-Mail-Adresse sind erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existingProfile } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
    const existingRole = normalizeUserRole(existingProfile?.role)
    if ((isAdminRole(existingRole) || isAdminRole(role)) && authorization.context.role !== 'superadmin') {
      return NextResponse.json({ error: 'Nur der Superadmin darf Administratoren bearbeiten.' }, { status: 403 })
    }
    const { data: existingData, error: existingError } = await admin.auth.admin.getUserById(id)
    if (existingError || !existingData.user) {
      return NextResponse.json({ error: 'Benutzer wurde nicht gefunden.' }, { status: 404 })
    }

    const existingEmail = normalizedEmail(existingData.user.email)
    const isProtectedAdmin = existingEmail === protectedAdminEmail
    const isCurrentUser = authorization.context.user.id === id
    if ((isProtectedAdmin || isCurrentUser) && role !== existingRole) {
      return NextResponse.json({ error: 'Das eigene Superadmin-Konto kann nicht herabgestuft werden.' }, { status: 400 })
    }

    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
      user_metadata: { ...existingData.user.user_metadata, full_name: fullName, name: fullName }
    })
    if (authError) throw authError

    const { error: profileError } = await admin.from('profiles').update({
      email,
      full_name: fullName,
      role
    }).eq('id', id)
    if (profileError) throw profileError

    return NextResponse.json({ success: true, message: 'Benutzer wurde aktualisiert.' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Benutzer konnte nicht aktualisiert werden.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin()
  if (authorization.response || !authorization.context) return authorization.response

  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'Benutzer-ID fehlt.' }, { status: 400 })
    if (authorization.context.user.id === id) {
      return NextResponse.json({ error: 'Das eigene Administratorkonto kann nicht gelöscht werden.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existingProfile } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
    if (isAdminRole(existingProfile?.role) && authorization.context.role !== 'superadmin') {
      return NextResponse.json({ error: 'Nur der Superadmin darf Administratoren löschen.' }, { status: 403 })
    }
    const { data, error: userError } = await admin.auth.admin.getUserById(id)
    if (userError || !data.user) {
      const { error: profileError } = await admin.from('profiles').delete().eq('id', id)
      if (profileError) throw profileError
      return NextResponse.json({ success: true, message: 'Verwaistes Benutzerprofil wurde gelöscht.' })
    }
    if (normalizedEmail(data.user.email) === protectedAdminEmail) {
      return NextResponse.json({ error: 'Dieses Administratorkonto ist geschützt.' }, { status: 400 })
    }

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw error

    return NextResponse.json({ success: true, message: 'Benutzer wurde gelöscht.' })
  } catch (error: any) {
    const message = String(error?.message || 'Benutzer konnte nicht gelöscht werden.')
    const referenced = /foreign key|violates|constraint/i.test(message)
    return NextResponse.json({
      error: referenced
        ? 'Der Benutzer ist bereits in Aufträgen hinterlegt und kann deshalb nicht vollständig gelöscht werden. Bitte stattdessen sperren.'
        : message
    }, { status: 500 })
  }
}
