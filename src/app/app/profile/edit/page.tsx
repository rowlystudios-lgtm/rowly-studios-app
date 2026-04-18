'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

type FormState = {
  full_name: string
  phone: string
  city: string
  department: Department | ''
  primary_role: string
  bio: string
  day_rate: string
  half_day_rate: string
  showreel_url: string
  equipment: string
}

const INITIAL: FormState = {
  full_name: '',
  phone: '',
  city: 'Los Angeles',
  department: '',
  primary_role: '',
  bio: '',
  day_rate: '',
  half_day_rate: '',
  showreel_url: '',
  equipment: '',
}

export default function EditProfilePage() {
  const router = useRouter()
  const { user, supabase, refresh } = useAuth()
  const userId = user?.id ?? null
  const [form, setForm] = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const [{ data: profile }, { data: talent }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('talent_profiles').select('*').eq('id', userId).maybeSingle(),
      ])
      if (cancelled) return

      setForm({
        full_name: profile?.full_name ?? '',
        phone: profile?.phone ?? '',
        city: profile?.city ?? 'Los Angeles',
        department: (talent?.department as Department) ?? '',
        primary_role: talent?.primary_role ?? '',
        bio: talent?.bio ?? '',
        day_rate: talent?.day_rate_cents ? String(talent.day_rate_cents / 100) : '',
        half_day_rate: talent?.half_day_rate_cents
          ? String(talent.half_day_rate_cents / 100)
          : '',
        showreel_url: talent?.showreel_url ?? '',
        equipment: talent?.equipment ?? '',
      })
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!userId) {
      setError('Not signed in')
      setSaving(false)
      return
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name || null,
        phone: form.phone || null,
        city: form.city || null,
      })
      .eq('id', userId)

    if (profileUpdate.error) {
      setError(profileUpdate.error.message)
      setSaving(false)
      return
    }

    const talentUpsert = await supabase.from('talent_profiles').upsert(
      {
        id: userId,
        department: form.department || null,
        primary_role: form.primary_role || null,
        bio: form.bio || null,
        day_rate_cents: form.day_rate ? Math.round(parseFloat(form.day_rate) * 100) : null,
        half_day_rate_cents: form.half_day_rate
          ? Math.round(parseFloat(form.half_day_rate) * 100)
          : null,
        showreel_url: form.showreel_url || null,
        equipment: form.equipment || null,
      },
      { onConflict: 'id' }
    )

    if (talentUpsert.error) {
      setError(talentUpsert.error.message)
      setSaving(false)
      return
    }

    await refresh()
    router.push('/app/profile')
  }

  if (loading) {
    return (
      <main className="px-5 py-6 max-w-md mx-auto">
        <p className="text-[12px] text-rs-blue-fusion/60">Loading…</p>
      </main>
    )
  }

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <Link
        href="/app/profile"
        className="text-[11px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold"
      >
        ← Back to profile
      </Link>
      <h1 className="text-[22px] font-semibold text-rs-blue-logo mt-3 mb-1">Edit profile</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mb-6">
        The info clients will see
      </p>

      <form onSubmit={handleSave} className="space-y-5">
        <Section title="About you">
          <Field label="Full name">
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              placeholder="Amelia Cross"
              className="rs-input"
              required
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="(310) 555-0100"
              className="rs-input"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className="rs-input"
            />
          </Field>
        </Section>

        <Section title="Your craft">
          <Field label="Department">
            <select
              value={form.department}
              onChange={(e) => update('department', e.target.value as Department | '')}
              className="rs-input"
              required
            >
              <option value="">Choose a department</option>
              {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primary role">
            <input
              type="text"
              value={form.primary_role}
              onChange={(e) => update('primary_role', e.target.value)}
              placeholder="1st AC · DP · Stylist · Editor"
              className="rs-input"
              required
            />
          </Field>
          <Field label="Bio">
            <textarea
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="A few sentences about your background, style, what you bring to a set."
              rows={4}
              className="rs-input resize-none"
            />
          </Field>
        </Section>

        <Section title="Rates (USD)">
          <Field label="Day rate">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rs-blue-fusion/50 text-[14px]">
                $
              </span>
              <input
                type="number"
                min="0"
                step="25"
                value={form.day_rate}
                onChange={(e) => update('day_rate', e.target.value)}
                placeholder="850"
                className="rs-input pl-7"
              />
            </div>
          </Field>
          <Field label="Half day rate">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rs-blue-fusion/50 text-[14px]">
                $
              </span>
              <input
                type="number"
                min="0"
                step="25"
                value={form.half_day_rate}
                onChange={(e) => update('half_day_rate', e.target.value)}
                placeholder="550"
                className="rs-input pl-7"
              />
            </div>
          </Field>
        </Section>

        <Section title="Showreel & gear">
          <Field label="Showreel URL">
            <input
              type="url"
              value={form.showreel_url}
              onChange={(e) => update('showreel_url', e.target.value)}
              placeholder="https://vimeo.com/yourreel"
              className="rs-input"
            />
          </Field>
          <Field label="Equipment you bring">
            <textarea
              value={form.equipment}
              onChange={(e) => update('equipment', e.target.value)}
              placeholder="Sony FX6 kit, 18-110 zoom, matte box, own lighting package"
              rows={3}
              className="rs-input resize-none"
            />
          </Field>
        </Section>

        {error && (
          <p className="text-[12px] text-red-700 bg-red-50 rounded-rs p-3">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/app/profile"
            className="flex-1 text-center rs-btn-ghost rs-btn"
          >
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="flex-1 rs-btn disabled:opacity-50">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        {title}
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 space-y-3">
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-rs-blue-fusion mb-1.5">{label}</span>
      {children}
    </label>
  )
}
