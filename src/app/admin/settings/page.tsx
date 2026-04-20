import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin, formatDate } from '@/lib/admin-auth'
import { saveNotionSettings } from './actions'
import { SyncButton, SyncAllButton } from './SyncButtons'
import { CalendarCopyField } from './CalendarCopyField'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings — RS Admin',
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://rowly-studios-app.vercel.app'
const SUPABASE_PROJECT = 'vmsgainaazabertluxbo'

function relTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return formatDate(iso)
}

export default async function AdminSettingsPage() {
  const { supabase } = await requireAdmin()

  // Read current Notion settings (token is masked in the UI).
  const { data: settingsRows } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', [
      'notion_token',
      'notion_jobs_db',
      'notion_talent_db',
      'notion_clients_db',
    ])
  const settings: Record<string, string> = {}
  for (const r of (settingsRows ?? []) as Array<{
    key: string
    value: string | null
  }>) {
    settings[r.key] = r.value ?? ''
  }

  const hasToken = Boolean(settings.notion_token)

  // Last-synced timestamps (max external_synced_at per table).
  const [jobsSyncRes, talentSyncRes, clientsSyncRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('external_synced_at')
      .not('external_synced_at', 'is', null)
      .order('external_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('talent_profiles')
      .select('external_synced_at')
      .not('external_synced_at', 'is', null)
      .order('external_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_profiles')
      .select('external_synced_at')
      .not('external_synced_at', 'is', null)
      .order('external_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const jobsLast = relTime(jobsSyncRes.data?.external_synced_at ?? null)
  const talentLast = relTime(talentSyncRes.data?.external_synced_at ?? null)
  const clientsLast = relTime(clientsSyncRes.data?.external_synced_at ?? null)

  const calendarUrl = `${APP_URL}/api/admin/calendar`
  const googleAddUrl = 'https://www.google.com/calendar/r/settings/addbyurl'

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link
        href="/admin"
        style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
      >
        ← Dashboard
      </Link>
      <h1
        className="text-white"
        style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}
      >
        Settings
      </h1>

      {/* ─── Calendar ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          Calendar
        </p>
        <p
          className="text-white"
          style={{ fontSize: 15, fontWeight: 600 }}
        >
          Admin calendar feed
        </p>
        <p
          style={{
            fontSize: 12,
            color: '#AABDE0',
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          Subscribe in Google Calendar or Apple Calendar to see all Rowly
          Studios jobs automatically.
        </p>
        <div className="mt-3">
          <CalendarCopyField url={calendarUrl} />
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <a
            href={googleAddUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg"
            style={{
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: '#1E3A6B',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Add to Google Calendar ↗
          </a>
          <a
            href={calendarUrl}
            className="rounded-lg"
            style={{
              padding: '9px 14px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.06)',
              color: '#AABDE0',
              border: '1px solid rgba(170,189,224,0.2)',
              textDecoration: 'none',
            }}
          >
            Open .ics file
          </a>
        </div>
        <p
          className="mt-3"
          style={{ fontSize: 11, color: '#7A90AA', lineHeight: 1.5 }}
        >
          Google: paste the URL into the &quot;Add calendar → From URL&quot; form.
          Apple: tap &quot;Open .ics file&quot; on iOS and confirm the subscription.
        </p>
      </section>

      {/* ─── Notion ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          Notion sync
        </p>
        <p
          className="text-white"
          style={{ fontSize: 15, fontWeight: 600 }}
        >
          Push jobs, talent, and clients to Notion
        </p>
        <p
          style={{
            fontSize: 12,
            color: '#AABDE0',
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          Create a Notion integration at{' '}
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#F0A500', textDecoration: 'underline' }}
          >
            notion.so/my-integrations
          </a>{' '}
          and share each database with the integration before syncing.
        </p>

        <form
          action={saveNotionSettings}
          className="mt-4 flex flex-col gap-3"
        >
          <DarkField label="Integration token">
            <input
              type="password"
              name="notion_token"
              defaultValue=""
              placeholder={
                hasToken ? '••• saved — enter new value to replace' : 'secret_…'
              }
              autoComplete="off"
              className={DARK_INPUT_CLS}
            />
          </DarkField>
          <DarkField label="Jobs database ID">
            <input
              type="text"
              name="notion_jobs_db"
              defaultValue={settings.notion_jobs_db ?? ''}
              placeholder="32-character database ID"
              className={DARK_INPUT_CLS}
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </DarkField>
          <DarkField label="Talent database ID">
            <input
              type="text"
              name="notion_talent_db"
              defaultValue={settings.notion_talent_db ?? ''}
              placeholder="32-character database ID"
              className={DARK_INPUT_CLS}
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </DarkField>
          <DarkField label="Clients database ID">
            <input
              type="text"
              name="notion_clients_db"
              defaultValue={settings.notion_clients_db ?? ''}
              placeholder="32-character database ID"
              className={DARK_INPUT_CLS}
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </DarkField>
          <button
            type="submit"
            className="mt-1 rounded-lg"
            style={{
              padding: '10px 14px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: 'rgba(240,165,0,0.2)',
              color: '#F0A500',
              border: '1px solid rgba(240,165,0,0.35)',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            Save Notion settings
          </button>
        </form>

        <div
          className="mt-5 grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <SyncButton kind="jobs" label="Jobs" lastSynced={jobsLast} />
          <SyncButton kind="talent" label="Talent" lastSynced={talentLast} />
          <SyncButton kind="clients" label="Clients" lastSynced={clientsLast} />
        </div>

        <div className="mt-3">
          <SyncAllButton />
        </div>
      </section>

      {/* ─── App info ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 10,
          }}
        >
          App info
        </p>
        <div
          className="grid gap-2"
          style={{ fontSize: 13, color: '#C5D3E8' }}
        >
          <InfoRow label="App URL" value={APP_URL} mono />
          <InfoRow label="Supabase project" value={SUPABASE_PROJECT} mono />
          <InfoRow label="Environment" value="Production" />
          <InfoRow label="Version" value="Phase 3" />
        </div>
      </section>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#7A90AA',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: '#fff',
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
            : undefined,
          wordBreak: 'break-all',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function DarkField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

const DARK_INPUT_CLS =
  'block w-full rounded-lg px-3 py-2.5 text-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(170,189,224,0.2)] focus:outline-none focus:ring-2 focus:ring-[#F0A500]/40 focus:border-[#F0A500]/50 transition'
