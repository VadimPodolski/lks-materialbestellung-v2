export async function ensureCurrentUserProfile(supabase: any, currentUser?: any) {
  const user = currentUser || (await supabase.auth.getUser()).data.user

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
    const profileUpdates: Record<string, string> = {}

    if (email && profileById.email !== email) {
      profileUpdates.email = email
    }

    if (!profileById.full_name && (metadataName || fallbackName)) {
      profileUpdates.full_name = metadataName || fallbackName
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id)
        .select('id,full_name,email,role')
        .single()

      if (!error && updatedProfile) return updatedProfile
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

  const { data: savedProfile, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' })
    .select('id,full_name,email,role')
    .single()

  return error ? null : savedProfile
}

function displayNameFromEmail(email: string | null) {
  if (!email) return null

  const localPart = email.split('@')[0] || ''
  const parts = localPart.split(/[._-]+/).filter(Boolean)
  const name = parts[parts.length - 1] || localPart

  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null
}
