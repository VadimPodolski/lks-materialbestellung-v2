'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type UserProfile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  approved: boolean
  created_at: string | null
}

export default function UsersPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (!user) {
      router.replace('/login')
      return
    }

    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = ownProfile?.role === 'admin' || user.email?.toLowerCase() === 'v.podolski@lks-technik.de'
    if (!isAdmin) {
      router.replace('/')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,approved,created_at')
      .order('approved', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) setMessage(error.message)
    setProfiles((data as UserProfile[] | null) || [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  async function setApproval(profile: UserProfile, approved: boolean) {
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.rpc('set_user_approval', {
      target_user_id: profile.id,
      should_approve: approved
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setProfiles(current => current.map(item => item.id === profile.id ? { ...item, approved } : item))
  }

  return (
    <main className="container">
      <div className="section-title-row">
        <div>
          <h1>Benutzerfreigaben</h1>
          <p className="small">Neue Konten erhalten erst nach deiner Prüfung Zugriff auf das Bestellportal.</p>
        </div>
        <strong>{profiles.filter(profile => !profile.approved).length} offen</strong>
      </div>

      {message && <p className="error">{message}</p>}
      {loading ? <p>Lade Benutzer...</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Registriert</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(profile => (
                <tr key={profile.id}>
                  <td><b>{profile.full_name || '-'}</b></td>
                  <td>{profile.email || '-'}</td>
                  <td>{profile.created_at ? new Date(profile.created_at).toLocaleString('de-DE') : '-'}</td>
                  <td>{profile.approved ? 'Freigegeben' : 'Wartet auf Freigabe'}</td>
                  <td>
                    {profile.role === 'admin' ? <span>Administrator</span> : (
                      <button type="button" onClick={() => setApproval(profile, !profile.approved)}>
                        {profile.approved ? 'Sperren' : 'Freigeben'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
