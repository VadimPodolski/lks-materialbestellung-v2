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

function registrationApprovalEmailHtml(fullName: string, email: string, approvalUrl: string) {
  const safeName = escapeHtml(fullName)
  const safeEmail = escapeHtml(email)
  const safeApprovalUrl = escapeHtml(approvalUrl)

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#eef2f1;">
      <tr>
        <td align="center" style="padding:36px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border-collapse:separate;background:#ffffff;border:1px solid #dce5e1;border-radius:12px;overflow:hidden;box-shadow:0 5px 18px rgba(23,32,51,.08);">
            <tr>
              <td style="height:8px;line-height:8px;background:#00a859;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:34px 36px 16px;">
                <p style="margin:0 0 8px;color:#00a859;font-size:13px;font-weight:bold;letter-spacing:.7px;text-transform:uppercase;">LKS Bestellportal</p>
                <h1 style="margin:0 0 14px;color:#172033;font-size:27px;line-height:1.25;">Neue Registrierung</h1>
                <p style="margin:0;color:#475569;font-size:16px;line-height:1.55;">Ein neues Konto wartet auf deine Prüfung und Freigabe.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f5f8f7;border:1px solid #e2e8e5;border-radius:8px;">
                  <tr>
                    <td style="width:120px;padding:15px 18px;color:#64748b;font-size:14px;border-bottom:1px solid #e2e8e5;">Name</td>
                    <td style="padding:15px 18px;color:#172033;font-size:15px;font-weight:bold;border-bottom:1px solid #e2e8e5;">${safeName}</td>
                  </tr>
                  <tr>
                    <td style="width:120px;padding:15px 18px;color:#64748b;font-size:14px;">E-Mail</td>
                    <td style="padding:15px 18px;color:#172033;font-size:15px;font-weight:bold;word-break:break-word;">${safeEmail}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px 12px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="#00a859" style="background:#00a859;border:1px solid #008f4c;border-radius:8px;">
                      <a href="${safeApprovalUrl}" target="_blank" style="display:inline-block;padding:14px 24px;color:#ffffff!important;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:20px;text-decoration:none!important;">
                        <span style="color:#ffffff!important;text-decoration:none!important;"><font color="#ffffff">Registrierung prüfen und freigeben</font></span>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 36px 34px;">
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.55;">Melde dich bei Bedarf mit dem Administratorkonto an und bestätige anschließend die Freigabe. Der Link ist 48 Stunden gültig.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
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
      html: registrationApprovalEmailHtml(String(fullName), user.email, approvalUrl)
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Benachrichtigung konnte nicht gesendet werden.' }, { status: 500 })
  }
}
