'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ActionIconButton from '@/app/ActionIconButton'
import { useAppDialog } from '@/app/useAppDialog'
import { createClient } from '@/lib/supabase'

type UserProfile = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  approved: boolean
  created_at: string | null
}

type UserForm = {
  id: string
  fullName: string
  email: string
  role: 'user' | 'admin'
}

type UserSortKey = 'name' | 'email' | 'role' | 'created' | 'status'
type UserSortMode = `${UserSortKey}_asc` | `${UserSortKey}_desc`

const emptyForm: UserForm = { id: '', fullName: '', email: '', role: 'user' }

function formatRegistrationDate(value: string | null) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

export default function UsersPage() {
  const router = useRouter()
  const { ask, notify, dialog } = useAppDialog()
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<UserForm | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
  const [sortMode, setSortMode] = useState<UserSortMode>('created_desc')

  const visibleProfiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE')
    const filtered = profiles.filter(profile => {
      const matchesSearch = !query || `${profile.full_name || ''} ${profile.email || ''}`
        .toLocaleLowerCase('de-DE')
        .includes(query)
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'approved' ? profile.approved : !profile.approved)
      const matchesRole = roleFilter === 'all' || profile.role === roleFilter
      return matchesSearch && matchesStatus && matchesRole
    })

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name_asc') return (a.full_name || '').localeCompare(b.full_name || '', 'de-DE')
      if (sortMode === 'name_desc') return (b.full_name || '').localeCompare(a.full_name || '', 'de-DE')
      if (sortMode === 'email_asc') return (a.email || '').localeCompare(b.email || '', 'de-DE')
      if (sortMode === 'email_desc') return (b.email || '').localeCompare(a.email || '', 'de-DE')
      if (sortMode === 'created_asc') return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      if (sortMode === 'status_asc') return Number(a.approved) - Number(b.approved)
      if (sortMode === 'status_desc') return Number(b.approved) - Number(a.approved)
      if (sortMode === 'role_asc') return a.role.localeCompare(b.role, 'de-DE')
      if (sortMode === 'role_desc') return b.role.localeCompare(a.role, 'de-DE')
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })
  }, [profiles, roleFilter, search, sortMode, statusFilter])

  function toggleColumnSort(key: UserSortKey) {
    setSortMode(current => current === `${key}_asc` ? `${key}_desc` : `${key}_asc`)
  }

  function sortButton(key: UserSortKey, label: string) {
    const isActive = sortMode.startsWith(`${key}_`)

    return (
      <button
        type="button"
        className={`column-sort-button${isActive ? ' active' : ''}`}
        onClick={() => toggleColumnSort(key)}
        title={`${label} sortieren`}
      >
        {label}
      </button>
    )
  }

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

    setCurrentUserId(user.id)
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

  async function apiRequest(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) {
    const response = await fetch('/api/admin/users', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Benutzeraktion fehlgeschlagen.')
    return result as { message?: string }
  }

  async function setApproval(profile: UserProfile, approved: boolean) {
    setMessage('')
    setSuccess('')
    setBusy(`approval-${profile.id}`)
    const supabase = createClient()
    const { error } = await supabase.rpc('set_user_approval', {
      target_user_id: profile.id,
      should_approve: approved
    })
    setBusy('')

    if (error) {
      setMessage(error.message)
      return
    }

    setProfiles(current => current.map(item => item.id === profile.id ? { ...item, approved } : item))
    setSuccess(approved ? `${profile.full_name || profile.email} wurde freigegeben.` : `${profile.full_name || profile.email} wurde gesperrt.`)
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault()
    if (!form) return

    setMessage('')
    setSuccess('')
    setBusy('save-user')
    try {
      const result = form.id
        ? await apiRequest('PATCH', {
            id: form.id,
            fullName: form.fullName,
            email: form.email,
            role: form.role
          })
        : await apiRequest('POST', {
            action: 'create',
            fullName: form.fullName,
            email: form.email,
            role: form.role
          })

      setForm(null)
      setSuccess(result.message || (form.id ? 'Benutzer wurde aktualisiert.' : 'Benutzer wurde angelegt.'))
      await load()
    } catch (error: any) {
      setMessage(error.message || 'Benutzer konnte nicht gespeichert werden.')
    } finally {
      setBusy('')
    }
  }

  async function sendPasswordReset(profile: UserProfile) {
    if (!profile.email) return
    const confirmed = await ask({
      title: 'Passwort zurücksetzen',
      message: `Einen Link zum Festlegen eines neuen Passworts an ${profile.email} senden?`,
      confirmLabel: 'Link senden'
    })
    if (!confirmed) return

    setMessage('')
    setSuccess('')
    setBusy(`reset-${profile.id}`)
    try {
      const result = await apiRequest('POST', { action: 'reset-password', email: profile.email })
      setSuccess(result.message || 'Passwort-Link wurde gesendet.')
    } catch (error: any) {
      setMessage(error.message || 'Passwort-Link konnte nicht gesendet werden.')
    } finally {
      setBusy('')
    }
  }

  async function deleteUser(profile: UserProfile) {
    const confirmed = await ask({
      title: 'Benutzer löschen',
      message: `${profile.full_name || profile.email || 'Diesen Benutzer'} wirklich dauerhaft löschen?`,
      confirmLabel: 'Löschen',
      danger: true
    })
    if (!confirmed) return

    setMessage('')
    setSuccess('')
    setBusy(`delete-${profile.id}`)
    try {
      const result = await apiRequest('DELETE', { id: profile.id })
      setProfiles(current => current.filter(item => item.id !== profile.id))
      setSuccess(result.message || 'Benutzer wurde gelöscht.')
    } catch (error: any) {
      setMessage(error.message || 'Benutzer konnte nicht gelöscht werden.')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="container wide users-page">
      {dialog}
      <div className="section-title-row users-page-heading">
        <div>
          <h1>Benutzerverwaltung</h1>
          <p className="small">Benutzer anlegen, bearbeiten, freigeben und Passwörter zurücksetzen.</p>
        </div>
        <div className="actions">
          <strong>{profiles.filter(profile => !profile.approved).length} offen</strong>
          <button type="button" onClick={() => setForm({ ...emptyForm })}>Neuer Benutzer</button>
        </div>
      </div>

      {message && <p className="error">{message}</p>}
      {success && <p className="success">{success}</p>}
      {loading ? <p>Lade Benutzer...</p> : (
        <>
          <div className="users-list-toolbar">
            <div className="users-count-summary">
              <strong>{profiles.length} Benutzer</strong>
              <span>{visibleProfiles.length} angezeigt</span>
            </div>

            <div className="users-filter-controls">
              <div>
                <label htmlFor="users-search">Suche</label>
                <input
                  id="users-search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Name oder E-Mail..."
                />
              </div>
              <div>
                <label htmlFor="users-status-filter">Status</label>
                <select id="users-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">Alle Status</option>
                  <option value="pending">Wartet auf Freigabe</option>
                  <option value="approved">Freigegeben</option>
                </select>
              </div>
              <div>
                <label htmlFor="users-role-filter">Rolle</label>
                <select id="users-role-filter" value={roleFilter} onChange={event => setRoleFilter(event.target.value as typeof roleFilter)}>
                  <option value="all">Alle Rollen</option>
                  <option value="user">Benutzer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label htmlFor="users-sort">Sortierung</label>
                <select id="users-sort" value={sortMode} onChange={event => setSortMode(event.target.value as UserSortMode)}>
                  <option value="created_desc">Neueste zuerst</option>
                  <option value="created_asc">Älteste zuerst</option>
                  <option value="name_asc">Name A–Z</option>
                  <option value="name_desc">Name Z–A</option>
                  <option value="email_asc">E-Mail A–Z</option>
                  <option value="email_desc">E-Mail Z–A</option>
                  <option value="status_asc">Offene zuerst</option>
                  <option value="status_desc">Freigegebene zuerst</option>
                  <option value="role_asc">Nach Rolle A–Z</option>
                  <option value="role_desc">Nach Rolle Z–A</option>
                </select>
              </div>
            </div>
          </div>

          <div className="table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>{sortButton('name', 'Name')}</th>
                <th>{sortButton('email', 'E-Mail')}</th>
                <th>{sortButton('role', 'Rolle')}</th>
                <th>{sortButton('created', 'Registriert')}</th>
                <th>{sortButton('status', 'Status')}</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {visibleProfiles.length === 0 && (
                <tr><td colSpan={6} className="users-empty-state">Keine Benutzer für die gewählten Filter gefunden.</td></tr>
              )}
              {visibleProfiles.map(profile => {
                const isCurrentUser = profile.id === currentUserId
                const isProtectedAdmin = profile.email?.toLowerCase() === 'v.podolski@lks-technik.de'
                const actionBusy = busy.endsWith(profile.id)

                return (
                  <tr key={profile.id}>
                    <td><b>{profile.full_name || '-'}</b>{isCurrentUser && <small className="current-user-label">Du</small>}</td>
                    <td>{profile.email || '-'}</td>
                    <td>{profile.role === 'admin' ? 'Administrator' : 'Benutzer'}</td>
                    <td>{formatRegistrationDate(profile.created_at)}</td>
                    <td>
                      <span className={`user-status ${profile.approved ? 'approved' : 'pending'}`}>
                        {profile.approved ? 'Freigegeben' : 'Wartet auf Freigabe'}
                      </span>
                    </td>
                    <td className="users-actions-cell">
                      <div className="users-actions">
                        <ActionIconButton
                          action="edit"
                          label="Benutzer bearbeiten"
                          disabled={actionBusy}
                          onClick={() => setForm({
                            id: profile.id,
                            fullName: profile.full_name || '',
                            email: profile.email || '',
                            role: profile.role === 'admin' ? 'admin' : 'user'
                          })}
                        />
                        <button
                          type="button"
                          className="secondary user-action-text"
                          disabled={actionBusy || !profile.email}
                          onClick={() => sendPasswordReset(profile)}
                        >
                          Passwort-Link
                        </button>
                        {profile.role === 'admin' ? (
                          <span className="admin-protected-label">Administrator</span>
                        ) : (
                          <button
                            type="button"
                            className="user-action-text"
                            disabled={actionBusy}
                            onClick={() => setApproval(profile, !profile.approved)}
                          >
                            {profile.approved ? 'Sperren' : 'Freigeben'}
                          </button>
                        )}
                        {!isCurrentUser && !isProtectedAdmin && (
                          <ActionIconButton
                            action="delete"
                            label="Benutzer löschen"
                            disabled={actionBusy}
                            onClick={() => deleteUser(profile)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {form && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setForm(null)}>
          <form className="modal user-form-modal" onSubmit={saveUser} onMouseDown={event => event.stopPropagation()}>
            <h2>{form.id ? 'Benutzer bearbeiten' : 'Neuen Benutzer anlegen'}</h2>

            <label>Name</label>
            <input
              value={form.fullName}
              onChange={event => setForm(current => current ? { ...current, fullName: event.target.value } : current)}
              required
              autoFocus
            />

            <label>E-Mail</label>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(current => current ? { ...current, email: event.target.value } : current)}
              required
            />

            <label>Rolle</label>
            <select
              value={form.role}
              onChange={event => setForm(current => current ? { ...current, role: event.target.value === 'admin' ? 'admin' : 'user' } : current)}
              disabled={form.id === currentUserId}
            >
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>

            {!form.id && <p className="small">Der Benutzer erhält automatisch eine Einladungs-Mail zum Festlegen des Passworts.</p>}

            <div className="actions user-form-actions">
              <button type="button" className="secondary" onClick={() => setForm(null)}>Abbrechen</button>
              <button disabled={busy === 'save-user'}>{form.id ? 'Speichern' : 'Anlegen und einladen'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
