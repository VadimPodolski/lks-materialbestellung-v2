import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { applicationUrl, createApprovalToken } from '@/lib/registrationApproval'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: 'Ungültige Registrierung.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
    const user = authData.user
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Registrierung wurde nicht gefunden.' }, { status: 404 })
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name,approved')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.approved) {
      return NextResponse.json({ success: true })
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const smtpFrom = process.env.SMTP_FROM
    const approvalEmail = process.env.REGISTRATION_APPROVAL_EMAIL || 'v.podolski@lks-technik.de'
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      throw new Error('SMTP-Umgebungsvariablen fehlen.')
    }

    const token = createApprovalToken(userId)
    const approvalUrl = `${applicationUrl(request.url)}/approve-user?token=${encodeURIComponent(token)}`
    const fullName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '-'
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: smtpUser, pass: smtpPass }
    })

    await transporter.sendMail({
      from: smtpFrom,
      to: approvalEmail,
      subject: `Neue Registrierung prüfen: ${fullName}`,
      text: `Eine neue Registrierung wartet auf Freigabe.\n\nName: ${fullName}\nE-Mail: ${user.email}\n\nPrüfen und freigeben: ${approvalUrl}\n\nDer Link ist 48 Stunden gültig.`,
      html: `<!doctype html><html lang="de"><body style="margin:0;background:#f3f5f4;font-family:Arial,sans-serif;color:#172033;"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 12px;"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border-top:7px solid #00a859;border-radius:10px;"><tr><td style="padding:30px;"><h1 style="margin:0 0 22px;font-size:24px;">Neue Registrierung</h1><p>Ein neues Konto wartet auf deine Prüfung.</p><table role="presentation" width="100%" style="margin:22px 0;background:#f5f7f6;border-collapse:collapse;"><tr><td style="padding:12px;color:#64748b;">Name</td><td style="padding:12px;font-weight:bold;">${escapeHtml(String(fullName))}</td></tr><tr><td style="padding:12px;color:#64748b;">E-Mail</td><td style="padding:12px;font-weight:bold;">${escapeHtml(user.email)}</td></tr></table><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#172033" style="border-radius:7px;"><a href="${escapeHtml(approvalUrl)}" style="display:block;padding:14px 22px;color:#ffffff!important;text-decoration:none!important;font-weight:bold;">Registrierung prüfen und freigeben</a></td></tr></table><p style="margin:22px 0 0;color:#64748b;font-size:13px;">Klicke auf den Button, melde dich bei Bedarf mit dem Administratorkonto an und bestätige anschließend die Freigabe. Der Link ist 48 Stunden gültig.</p></td></tr></table></td></tr></table></body></html>`
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Benachrichtigung konnte nicht gesendet werden.' }, { status: 500 })
  }
}
