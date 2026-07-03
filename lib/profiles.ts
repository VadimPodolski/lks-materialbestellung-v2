export async function ensureCurrentUserProfile(supabase: any) {
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user

  if (!user?.id) return null

  const email = user.email?.toLowerCase() || null
  const metadataName = user.user_metadata?.full_name || user.user_metadata?.name || null
  const fallbackName = displayNameFromEmail(email)

  const { data: profileById } = await supabase
    .from('profiles')
    .select('id,full_name,email,role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileById) {
    if (email && profileById.email !== email) {
      await supabase.from('profiles').update({ email }).eq('id', user.id)
    }

    return profileById
  }

  const { data: profileByEmail } = email
    ? await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .eq('email', email)
        .maybeSingle()
    : { data: null }

  const row = {
    id: user.id,
    email,
    full_name: profileByEmail?.full_name || metadataName || fallbackName,
    role: profileByEmail?.role || 'user'
  }

  if (profileByEmail && profileByEmail.id !== user.id) {
    const { error } = await supabase.from('profiles').update(row).eq('email', email)
    if (!error) return row
  }

  await supabase.from('profiles').upsert(row, { onConflict: 'id' })
  return row
}

function displayNameFromEmail(email: string | null) {
  if (!email) return null

  const localPart = email.split('@')[0] || ''
  const parts = localPart.split(/[._-]+/).filter(Boolean)
  const name = parts[parts.length - 1] || localPart

  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null
}
