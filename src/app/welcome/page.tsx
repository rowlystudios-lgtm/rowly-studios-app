import Link from 'next/link'
import { lookupWelcomeToken } from '@/lib/welcome-tokens'
import WelcomeSetPasswordForm from './WelcomeSetPasswordForm'

export const dynamic = 'force-dynamic'

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const rawToken = typeof params.token === 'string' ? params.token : ''
  const lookup = await lookupWelcomeToken(rawToken)

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F4F7FC',
        padding: '40px 16px',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily:
                "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#2B4780',
              fontWeight: 700,
            }}
          >
            Rowly Studios
          </span>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 10,
            padding: 32,
            border: '1px solid #E8EDF5',
          }}
        >
          {lookup.state === 'valid' && (
            <WelcomeSetPasswordForm
              token={lookup.token}
              email={lookup.email}
              firstName={lookup.firstName ?? ''}
            />
          )}

          {lookup.state === 'consumed' && (
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display',Georgia,serif",
                  fontSize: 22,
                  lineHeight: 1.3,
                  color: '#1A2030',
                  fontWeight: 500,
                }}
              >
                Your account is all set up
              </h1>
              <p
                style={{
                  margin: '12px 0 20px 0',
                  fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#4A5368',
                }}
              >
                Looks like you&apos;ve already created your password. Sign
                in to get started.
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  padding: '13px 28px',
                  background: '#2B4780',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontFamily:
                    "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Sign in
              </Link>
              {lookup.email && (
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 12,
                    color: '#8A96AA',
                  }}
                >
                  Signing in as{' '}
                  <strong style={{ color: '#1A2030' }}>{lookup.email}</strong>
                </p>
              )}
            </div>
          )}

          {lookup.state === 'expired' && (
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display',Georgia,serif",
                  fontSize: 22,
                  lineHeight: 1.3,
                  color: '#1A2030',
                  fontWeight: 500,
                }}
              >
                This link has expired
              </h1>
              <p
                style={{
                  margin: '12px 0 20px 0',
                  fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#4A5368',
                }}
              >
                Welcome links are valid for 30 days. Reply to your
                acceptance email or write to{' '}
                <a
                  href="mailto:hello@rowlystudios.com"
                  style={{ color: '#2B4780' }}
                >
                  hello@rowlystudios.com
                </a>{' '}
                and we&apos;ll send you a fresh one.
              </p>
            </div>
          )}

          {lookup.state === 'not_found' && (
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display',Georgia,serif",
                  fontSize: 22,
                  lineHeight: 1.3,
                  color: '#1A2030',
                  fontWeight: 500,
                }}
              >
                Invalid link
              </h1>
              <p
                style={{
                  margin: '12px 0 20px 0',
                  fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#4A5368',
                }}
              >
                We couldn&apos;t find that welcome link. It may have been
                mistyped. If you already have an account, sign in below.
                Otherwise please reply to your acceptance email.
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  padding: '13px 28px',
                  background: '#2B4780',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontFamily:
                    "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
