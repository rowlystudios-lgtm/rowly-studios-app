'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PasswordInput } from '@/components/PasswordInput'
import { ShareCodeCard } from '@/components/ShareCodeCard'
import { TaxDocumentsSection } from '@/components/TaxDocumentsSection'
import { Skeleton } from '@/components/ui/Skeleton'
import { DEPARTMENT_LABELS, type Department, type TalentProfile } from '@/lib/types'

const BG = '#1A3C6B'
const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170, 189, 224, 0.2)'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'
const AVAILABLE_GREEN = '#4ade80'
const BUTTON_PRIMARY = '#1A3C6B'
const LINK = '#AABDE0'

function formatMoney(cents: number | null | undefined): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

function fullName(
  profile: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null
): string {
  if (!profile) return 'Your name'
  const joined = [profile.first_name?.trim(), profile.last_name?.trim()]
    .filter(Boolean)
    .join(' ')
  return joined || profile.full_name || 'Your name'
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/|channels\/\w+\/)?(\d+)/)
  return match ? match[1] : null
}

function Spinner({ size = 14, color = TEXT_PRIMARY }: { size?: number; color?: string }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

export default function ProfilePage() {
  const { profile, user, supabase, updateProfile } = useAuth()

  const [talent, setTalent] = useState<TalentProfile | null>(null)
  const [talentLoading, setTalentLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    supabase
      .from('talent_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setTalent(data as TalentProfile | null)
          setTalentLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  const displayName = fullName(profile)
  const departmentLabel = talent?.department
    ? DEPARTMENT_LABELS[talent.department as Department]
    : null

  return (
    <main
      className="rounded-t-rs-lg"
      style={{
        background: BG,
        color: TEXT_PRIMARY,
        minHeight: 'calc(100dvh - 64px)',
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">
        <div className="flex justify-end mb-4">
          <Link
            href="/app/profile/edit"
            className="text-[11px] uppercase tracking-wider underline"
            style={{ color: LINK }}
          >
            Edit profile
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Avatar url={profile?.avatar_url ?? null} name={displayName} size={96} />
          <h1 className="text-[24px] font-bold mt-4 leading-tight" style={{ color: TEXT_PRIMARY }}>
            {displayName}
          </h1>
          {profile?.city && (
            <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
              {profile.city}
            </p>
          )}
          {profile?.phone && (
            <p className="text-[12px] mt-1" style={{ color: TEXT_MUTED }}>
              {profile.phone}
            </p>
          )}
          {profile?.verified && (
            <span
              className="inline-block mt-3 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{ background: '#AABDE0', color: BUTTON_PRIMARY }}
            >
              ✓ Verified
            </span>
          )}
        </div>

        {/* Department */}
        <Card>
          <FieldLabel>Department</FieldLabel>
          {talentLoading ? (
            <Skeleton className="h-5 w-40 mt-2" />
          ) : (
            <p className="text-[16px] font-semibold mt-1" style={{ color: TEXT_PRIMARY }}>
              {departmentLabel ?? <Muted>Not set</Muted>}
            </p>
          )}
        </Card>

        {/* Rates */}
        <Card>
          <div className="grid grid-cols-2" style={{ gap: 0 }}>
            <div className="pr-4">
              <FieldLabel>Day Rate</FieldLabel>
              {talentLoading ? (
                <Skeleton className="h-6 w-24 mt-2" />
              ) : (
                <p className="text-[18px] font-bold mt-1" style={{ color: TEXT_PRIMARY }}>
                  {formatMoney(talent?.day_rate_cents)}
                </p>
              )}
            </div>
            <div className="pl-4" style={{ borderLeft: `1px solid ${CARD_BORDER}` }}>
              <FieldLabel>Rate Floor</FieldLabel>
              {talentLoading ? (
                <Skeleton className="h-6 w-24 mt-2" />
              ) : (
                <p className="text-[18px] font-bold mt-1" style={{ color: TEXT_PRIMARY }}>
                  {formatMoney(talent?.rate_floor_cents)}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Equipment */}
        <Card>
          <FieldLabel>Equipment</FieldLabel>
          {talentLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ) : talent?.equipment ? (
            <p
              className="text-[14px] mt-1 leading-relaxed whitespace-pre-wrap"
              style={{ color: TEXT_PRIMARY }}
            >
              {talent.equipment}
            </p>
          ) : (
            <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
              No equipment listed
            </p>
          )}
        </Card>

        {/* Worked with */}
        <WorkedWithList userId={user?.id ?? null} supabase={supabase} />

        {/* Availability */}
        <AvailabilityCard
          userId={user?.id ?? null}
          available={profile?.available ?? true}
          supabase={supabase}
          onChange={(val) => updateProfile({ available: val })}
        />

        {/* About */}
        <Card>
          <FieldLabel>About</FieldLabel>
          {talentLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : talent?.bio ? (
            <p
              className="text-[14px] mt-1 leading-relaxed whitespace-pre-wrap"
              style={{ color: TEXT_PRIMARY }}
            >
              {talent.bio}
            </p>
          ) : (
            <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
              No bio added yet
            </p>
          )}
        </Card>

        {/* Showreel */}
        {talentLoading ? (
          <Card>
            <FieldLabel>Showreel</FieldLabel>
            <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
              Loading…
            </p>
          </Card>
        ) : (
          <ShowreelBlock url={talent?.showreel_url ?? null} />
        )}

        {/* Account & Security */}
        <div className="mt-8">
          <ShareCodeCard code={profile?.share_code ?? null} variant="dark" />
        </div>

        {/* Tax Documents — collapsible accordion so it stays out of the way
            on first load but is there when talent need to upload W-9s etc. */}
        <div className="mt-4">
          <TaxDocumentsSection role="talent" variant="dark" />
        </div>

        <div style={{ borderTop: `1px solid ${CARD_BORDER}` }} className="mt-10 pt-6">
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: TEXT_MUTED }}
          >
            Account &amp; Security
          </p>
          <ChangePasswordSection
            email={profile?.email ?? user?.email ?? null}
            supabase={supabase}
          />
        </div>
      </div>
    </main>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 12,
        color: TEXT_PRIMARY,
      }}
    >
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-wider font-semibold"
      style={{ color: TEXT_MUTED }}
    >
      {children}
    </p>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>{children}</span>
}

function ShowreelBlock({ url }: { url: string | null }) {
  if (!url) {
    return (
      <Card>
        <FieldLabel>Showreel</FieldLabel>
        <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
          No showreel added —{' '}
          <Link href="/app/profile/edit" className="underline" style={{ color: LINK }}>
            add in Edit Profile
          </Link>
        </p>
      </Card>
    )
  }

  const vimeoId = getVimeoId(url)

  if (vimeoId) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="mb-2">
          <FieldLabel>Showreel</FieldLabel>
        </div>
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: '125%',
            borderRadius: 12,
            overflow: 'hidden',
            background: '#000',
            border: `1px solid ${CARD_BORDER}`,
          }}
        >
          <iframe
            src={`https://player.vimeo.com/video/${vimeoId}?autoplay=0&title=0&byline=0&portrait=0&dnt=1`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            title="Showreel"
          />
        </div>
      </div>
    )
  }

  // Non-Vimeo (e.g. YouTube) — link card
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-[12px] p-4 transition-opacity hover:opacity-90"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        color: TEXT_PRIMARY,
        marginBottom: 12,
      }}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.15)' }}
      >
        <PlayIcon className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider">
        View showreel
      </span>
      <span className="text-[16px]" aria-hidden>
        →
      </span>
    </a>
  )
}

type AvailStatus = 'idle' | 'saving' | 'error'

function AvailabilityCard({
  userId,
  available,
  supabase,
  onChange,
}: {
  userId: string | null
  available: boolean
  supabase: ReturnType<typeof useAuth>['supabase']
  onChange: (val: boolean) => void
}) {
  const [status, setStatus] = useState<AvailStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function toggle() {
    if (!userId || status === 'saving') return
    const next = !available
    onChange(next)
    setStatus('saving')
    setErrorMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({ available: next })
      .eq('id', userId)
    if (error) {
      onChange(!next)
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    setStatus('idle')
  }

  return (
    <Card>
      <FieldLabel>Availability</FieldLabel>
      <div className="flex items-center gap-3 mt-2">
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: available ? AVAILABLE_GREEN : 'rgba(170, 189, 224, 0.4)',
            boxShadow: available ? '0 0 0 3px rgba(74, 222, 128, 0.25)' : 'none',
            flexShrink: 0,
          }}
        />
        <p className="text-[14px] font-semibold flex-1" style={{ color: TEXT_PRIMARY }}>
          {available ? 'Available' : 'Unavailable'}
        </p>
        <button
          type="button"
          onClick={toggle}
          disabled={status === 'saving' || !userId}
          role="switch"
          aria-checked={available}
          aria-label="Toggle availability"
          className="flex-shrink-0"
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            background: available ? AVAILABLE_GREEN : 'rgba(170, 189, 224, 0.25)',
            position: 'relative',
            transition: 'background 150ms ease',
            opacity: status === 'saving' ? 0.6 : 1,
            border: 'none',
            cursor: status === 'saving' ? 'wait' : 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 3,
              left: available ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: 999,
              background: '#ffffff',
              transition: 'left 150ms ease',
            }}
          />
        </button>
      </div>
      {status === 'error' && errorMsg && (
        <p className="text-[11px] mt-3" style={{ color: '#fca5a5' }}>
          {errorMsg}
        </p>
      )}
    </Card>
  )
}

type WorkedWithProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  talent_profiles:
    | { primary_role: string | null }
    | { primary_role: string | null }[]
    | null
}

function WorkedWithList({
  userId,
  supabase,
}: {
  userId: string | null
  supabase: ReturnType<typeof useAuth>['supabase']
}) {
  const [profiles, setProfiles] = useState<WorkedWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const { data: rows } = await supabase
        .from('worked_with')
        .select('talent_id, other_talent_id')
        .or(`talent_id.eq.${userId},other_talent_id.eq.${userId}`)

      if (cancelled) return
      const otherIds = new Set<string>()
      for (const r of (rows ?? []) as { talent_id: string; other_talent_id: string }[]) {
        otherIds.add(r.talent_id === userId ? r.other_talent_id : r.talent_id)
      }
      if (otherIds.size === 0) {
        setProfiles([])
        setLoading(false)
        return
      }
      const { data: people } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, talent_profiles(primary_role)')
        .in('id', Array.from(otherIds))
      if (cancelled) return
      setProfiles((people ?? []) as WorkedWithProfile[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId, supabase])

  return (
    <Card>
      <FieldLabel>Worked with</FieldLabel>
      {loading ? (
        <div className="flex gap-3 mt-3 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-14 h-14 rounded-full shrink-0" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <p className="text-[12px] mt-2 leading-relaxed" style={{ color: TEXT_MUTED }}>
          No connections yet — connections appear automatically after a confirmed job
        </p>
      ) : (
        <div
          className="flex gap-3 mt-3 overflow-x-auto pb-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {profiles.map((p) => {
            const name = p.full_name || 'Unnamed'
            return (
              <div
                key={p.id}
                className="shrink-0 flex flex-col items-center"
                style={{ width: 64 }}
              >
                <Avatar url={p.avatar_url} name={name} size={56} />
                <p
                  className="text-[10px] mt-1 text-center leading-tight"
                  style={{
                    color: TEXT_PRIMARY,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {name}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

type ChangeStatus = 'idle' | 'open' | 'verifying' | 'updating' | 'done' | 'error'

function ChangePasswordSection({
  email,
  supabase,
}: {
  email: string | null
  supabase: ReturnType<typeof useAuth>['supabase']
}) {
  const [status, setStatus] = useState<ChangeStatus>('idle')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  function open() {
    setStatus('open')
    setErrorMsg('')
  }

  function cancel() {
    setStatus('idle')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setErrorMsg('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (!email) {
      setStatus('error')
      setErrorMsg('Could not read your email. Refresh and try again.')
      return
    }
    if (newPassword.length < 8) {
      setStatus('error')
      setErrorMsg('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setStatus('error')
      setErrorMsg('New password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setStatus('error')
      setErrorMsg('New password must be different from the current one.')
      return
    }

    setStatus('verifying')
    const verify = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (verify.error) {
      setStatus('error')
      setErrorMsg('Current password is incorrect.')
      return
    }

    setStatus('updating')
    const update = await supabase.auth.updateUser({ password: newPassword })
    if (update.error) {
      setStatus('error')
      setErrorMsg(update.error.message)
      return
    }

    setStatus('done')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setTimeout(() => setStatus('idle'), 2500)
  }

  if (status === 'idle' || status === 'done') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>
              Password
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
              Keep your account secure. Change it any time.
            </p>
          </div>
          <button
            type="button"
            onClick={open}
            className="shrink-0 rounded-[10px] px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
            style={{ background: BUTTON_PRIMARY, color: '#ffffff' }}
          >
            Change password
          </button>
        </div>
        {status === 'done' && (
          <p className="text-[12px] mt-3" style={{ color: AVAILABLE_GREEN }}>
            Password updated successfully.
          </p>
        )}
      </Card>
    )
  }

  const busy = status === 'verifying' || status === 'updating'

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <p className="text-[13px] font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>
          Change password
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              Current password
            </label>
            <PasswordInput
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              New password
            </label>
            <PasswordInput
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              Confirm new password
            </label>
            <PasswordInput
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          {errorMsg && <p className="text-[12px] leading-relaxed" style={{ color: '#fca5a5' }}>{errorMsg}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !currentPassword || !newPassword || !confirm}
              className="rounded-[10px] px-4 py-2 text-[11px] uppercase tracking-wider font-semibold disabled:opacity-50 flex items-center gap-2"
              style={{ background: BUTTON_PRIMARY, color: '#ffffff' }}
            >
              {busy && <Spinner />}
              {status === 'verifying' ? 'Verifying…' : status === 'updating' ? 'Updating…' : 'Update password'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="text-[11px] uppercase tracking-wider underline disabled:opacity-50"
              style={{ color: LINK }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Card>
    </form>
  )
}
