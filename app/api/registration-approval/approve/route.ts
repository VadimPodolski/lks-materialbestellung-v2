import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdminRequest } from '@/lib/serverAdminAuth'
import { verifyApprovalToken } from '@/lib/registrationApproval'

export async function POST(request: Request) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: 'Keine Administratorberechtigung.' }, { status: 403 })
  }

  const formData = await request.formData()
  const token = formData.get('token')
  const payload = verifyApprovalToken(typeof token === 'string' ? token : null)
  if (!payload) {
    return NextResponse.redirect(new URL('/approve-user?status=invalid', request.url), 303)
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ approved: true })
    .eq('id', payload.userId)
    .neq('role', 'admin')

  const status = error ? 'error' : 'approved'
  return NextResponse.redirect(new URL(`/approve-user?status=${status}`, request.url), 303)
}
