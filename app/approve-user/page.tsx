import Link from 'next/link'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdminRequest } from '@/lib/serverAdminAuth'
import { verifyApprovalToken } from '@/lib/registrationApproval'

export const dynamic = 'force-dynamic'

export default async function ApproveUserPage({
  searchParams
}: {
  searchParams: { token?: string; status?: string }
}) {
  const isAdmin = await isAdminRequest()
  const payload = verifyApprovalToken(searchParams.token)

  if (searchParams.status === 'approved') {
    return <main className="container auth-page"><div className="card auth-card"><h1>Freigegeben</h1><p className="success">Der Benutzer wurde freigegeben.</p><Link href="/users">Zu den Benutzerfreigaben</Link></div></main>
  }

  if (searchParams.status === 'error') {
    return <main className="container auth-page"><div className="card auth-card"><h1>Fehler</h1><p className="error">Der Benutzer konnte nicht freigegeben werden.</p><Link href="/users">Zu den Benutzerfreigaben</Link></div></main>
  }

  if (!isAdmin) {
    const next = `/approve-user?token=${encodeURIComponent(searchParams.token || '')}`
    return <main className="container auth-page"><div className="card auth-card"><h1>Administrator-Anmeldung erforderlich</h1><p>Bitte melde dich mit deinem Administratorkonto an, um die Registrierung zu prüfen.</p><Link href={`/login?next=${encodeURIComponent(next)}`}>Als Administrator anmelden</Link></div></main>
  }

  if (!payload) {
    return <main className="container auth-page"><div className="card auth-card"><h1>Link ungültig</h1><p className="error">Der Freigabe-Link ist ungültig oder abgelaufen.</p><Link href="/users">Zu den Benutzerfreigaben</Link></div></main>
  }

  const admin = createAdminClient()
  const { data: authData } = await admin.auth.admin.getUserById(payload.userId)
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name,email,approved')
    .eq('id', payload.userId)
    .maybeSingle()
  const email = profile?.email || authData.user?.email || '-'
  const name = profile?.full_name || authData.user?.user_metadata?.full_name || '-'

  return (
    <main className="container auth-page">
      <div className="card auth-card">
        <h1>Registrierung prüfen</h1>
        <div className="grid auth-form">
          <p><strong>Name:</strong><br />{name}</p>
          <p><strong>E-Mail:</strong><br />{email}</p>
          {profile?.approved ? (
            <><p className="success">Dieser Benutzer ist bereits freigegeben.</p><Link href="/users">Zu den Benutzerfreigaben</Link></>
          ) : (
            <form action="/api/registration-approval/approve" method="post">
              <input type="hidden" name="token" value={searchParams.token} />
              <button type="submit">Benutzer freigeben</button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
