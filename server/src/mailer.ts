import nodemailer from 'nodemailer'
import { env, runtimeFlags } from './env.js'

type PasswordResetMailPayload = {
  toEmail: string
  toName: string
  token: string
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!runtimeFlags.smtpEnabled || !env.SMTP_HOST || !env.SMTP_FROM) {
    throw new Error('MAIL_NOT_CONFIGURED')
  }

  if (transporter) {
    return transporter
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: runtimeFlags.smtpSecure,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD ?? '',
        }
      : undefined,
  })

  return transporter
}

export function buildPasswordResetUrl(token: string) {
  const resetUrl = new URL(env.APP_BASE_URL)
  resetUrl.hash = new URLSearchParams({ reset_token: token }).toString()
  return resetUrl.toString()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

export function buildPasswordResetEmailContent(payload: { toName: string; resetUrl: string }) {
  const escapedName = escapeHtml(payload.toName)
  const escapedResetUrl = escapeHtml(payload.resetUrl)

  return {
    text: [
      `${payload.toName}님,`,
      '',
      '아래 링크에서 FocusAI 비밀번호를 재설정해 주세요.',
      payload.resetUrl,
      '',
      `이 링크는 ${env.PASSWORD_RESET_TTL_MINUTES}분 동안만 유효합니다.`,
      '본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin-bottom: 12px;">FocusAI 비밀번호 재설정</h2>
        <p>${escapedName}님, 아래 버튼을 눌러 비밀번호를 재설정해 주세요.</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapedResetUrl}"
            style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 700;"
          >
            비밀번호 재설정
          </a>
        </p>
        <p>버튼이 열리지 않으면 아래 주소를 브라우저에 붙여 넣어 주세요.</p>
        <p><a href="${escapedResetUrl}">${escapedResetUrl}</a></p>
        <p>이 링크는 ${env.PASSWORD_RESET_TTL_MINUTES}분 동안만 유효합니다.</p>
        <p>본인이 요청하지 않았다면 이 메일은 무시하셔도 됩니다.</p>
      </div>
    `,
  }
}

export async function sendPasswordResetEmail(payload: PasswordResetMailPayload) {
  const mailer = getTransporter()
  const resetUrl = buildPasswordResetUrl(payload.token)
  const content = buildPasswordResetEmailContent({
    toName: payload.toName,
    resetUrl,
  })

  await mailer.sendMail({
    from: env.SMTP_FROM,
    to: payload.toEmail,
    subject: '[FocusAI] 비밀번호 재설정',
    text: content.text,
    html: content.html,
    disableFileAccess: true,
    disableUrlAccess: true,
  })

  return resetUrl
}
