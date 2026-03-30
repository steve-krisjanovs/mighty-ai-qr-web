import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { Resend } from 'resend'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/mighty.db')
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const resendApiKey = process.env.RESEND_API_KEY
const resend = resendApiKey ? new Resend(resendApiKey) : null
const emailFrom = process.env.EMAIL_FROM ?? 'noreply@mighty-ai-qr.com'
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
  baseURL: appUrl,
  database: new Database(DB_PATH),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: resend
      ? async ({ user, url }) => {
          await resend.emails.send({
            from: emailFrom,
            to: user.email,
            subject: 'Reset your Mighty AI password',
            html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${url}">${url}</a></p>`,
          })
        }
      : undefined,
  },

  emailVerification: resend
    ? {
        sendVerificationEmail: async ({ user, url }) => {
          await resend.emails.send({
            from: emailFrom,
            to: user.email,
            subject: 'Verify your Mighty AI email',
            html: `<p>Click the link below to verify your email address.</p><p><a href="${url}">${url}</a></p>`,
          })
        },
      }
    : undefined,

  socialProviders: {
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
      : undefined,

    microsoft: process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? { clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET, tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common' }
      : undefined,

    facebook: process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? { clientId: process.env.FACEBOOK_CLIENT_ID, clientSecret: process.env.FACEBOOK_CLIENT_SECRET }
      : undefined,
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'microsoft', 'facebook'],
    },
  },

  trustedOrigins: [appUrl],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
