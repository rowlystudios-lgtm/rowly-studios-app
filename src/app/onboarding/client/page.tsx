'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { useAuth } from '@/lib/auth-context'
import {
  PAGE_BG,
  CARD_BG,
  CARD_BORDER,
  TEXT_PRIMARY,
  TEXT_MUTED,
} from '@/components/PageShell'

type IndustryValue =
  | ''
  | 'fashion'
  | 'beauty'
  | 'lifestyle'
  | 'food_beverage'
  | 'tech'
  | 'entertainment'
  | 'healthcare'
  | 'other'

const INDUSTRY_OPTIONS: { value: Exclude<IndustryValue, ''>; label: string }[] = [
  { value: 'fashion', label: 'Fashion' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'tech', label: 'Tech' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
]

const TOTAL_STEPS = 2

export default function ClientOnboardingPage() {
  const router = useRouter()
  const { user, profile, loading, supabase, updateProfile } = useAuth()

  const [step, setStep] = useState<1 | 2>(1)

  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState<IndustryValue>('')
  const [website, setWebsite] = useState('')
  const [billingContact, setBillingContact] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill billing email with the authenticated user's email once auth loads.
  useEffect(() => {
    if (!billingEmail && user?.email) {
      setBillingEmail(user.email)
    }
  }, [user?.email, billingEmail])

  // Auth gate: boot out if unsigned; skip wizard if already onboarded.
  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (profile?.onboarded === true) {
      router.replace('/app')
    }
  }, [loading, user, profile, router])

  const canNextStep1 = companyName.trim().length > 0
  const canFinish = billingContact.trim().length > 0 && billingEmail.trim().length > 0

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Logo must be an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be under 5MB.')
      return
    }
    setError('')
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function finish() {
    if (!user?.id || saving) return
    if (!canFinish) return
    setSaving(true)
    setError('')

    const trimmedCompany = companyName.trim()
    const trimmedContact = billingContact.trim()
    const contactParts = trimmedContact.split(/\s+/).filter(Boolean)
    const firstNamePart = contactParts[0] ?? null
    const lastNamePart = contactParts.slice(1).join(' ') || null

    // 1. Billing contact lands on profiles.full_name per spec.
    const profileUpdate = await supabase
      .from('profiles')
      .update({
        full_name: trimmedContact || null,
        first_name: firstNamePart,
        last_name: lastNamePart,
      })
      .eq('id', user.id)

    if (profileUpdate.error) {
      setSaving(false)
      setError(profileUpdate.error.message)
      return
    }

    // 2. Optional logo upload to the `client-logos` bucket. Best-effort —
    //    if the bucket doesn't exist we skip the logo_url rather than
    //    failing the whole onboarding save.
    let logoUrl: string | null = null
    if (logoFile) {
      const ext = logoFile.type === 'image/png'
        ? 'png'
        : logoFile.type === 'image/webp'
        ? 'webp'
        : logoFile.type === 'image/svg+xml'
        ? 'svg'
        : 'jpg'
      const path = `${user.id}/logo.${ext}`
      const upload = await supabase.storage
        .from('client-logos')
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type })
      if (!upload.error) {
        const { data } = supabase.storage.from('client-logos').getPublicUrl(path)
        logoUrl = `${data.publicUrl}?t=${Date.now()}`
      }
    }

    // 3. Upsert client_profiles with company + billing + (optional) logo.
    const clientRow: Record<string, unknown> = {
      id: user.id,
      company_name: trimmedCompany,
      industry: industry || null,
      website: website.trim() || null,
      billing_email: billingEmail.trim() || null,
    }
    if (logoUrl) {
      clientRow.logo_url = logoUrl
    }

    const clientUpsert = await supabase
      .from('client_profiles')
      .upsert(clientRow, { onConflict: 'id' })

    if (clientUpsert.error) {
      setSaving(false)
      setError(clientUpsert.error.message)
      return
    }

    // 4. Best-effort onboarded flag.
    const flag = await supabase
      .from('profiles')
      .update({ onboarded: true })
      .eq('id', user.id)
    if (!flag.error) {
      updateProfile({ onboarded: true })
    }

    updateProfile({
      full_name: trimmedContact || null,
      first_name: firstNamePart,
      last_name: lastNamePart,
    })

    router.replace('/app')
  }

  function goNext() {
    if (step === 1 && !canNextStep1) return
    if (step < TOTAL_STEPS) setStep((s) => (s + 1) as 1 | 2)
  }

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2)
  }

  if (loading || !user) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          background: PAGE_BG,
          color: TEXT_MUTED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
        }}
      >
        Loading…
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: PAGE_BG,
        color: TEXT_PRIMARY,
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-8 pb-12">
        {/* RS mark */}
        <div className="flex justify-center mb-5">
          <RSLogo size={40} />
        </div>

        {/* Step indicator */}
        <p
          className="text-center text-[10px] uppercase tracking-[0.2em] font-semibold"
          style={{ color: TEXT_MUTED }}
        >
          Step {step} of {TOTAL_STEPS}
        </p>
        <div className="flex justify-center gap-2 mt-2 mb-8" aria-hidden>
          {[1, 2].map((n) => {
            const active = n === step
            return (
              <span
                key={n}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: active ? '#FFFFFF' : 'rgba(170,189,224,0.3)',
                }}
              />
            )
          })}
        </div>

        {step === 1 && (
          <section>
            <h1
              className="text-[22px] font-semibold text-center mb-1"
              style={{ color: TEXT_PRIMARY }}
            >
              Your company
            </h1>
            <p
              className="text-[12px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              We use this to set up your workspace.
            </p>

            <div
              className="rounded-rs p-4 space-y-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <Field label="Company name" required>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Studios"
                  className="rs-input"
                  autoComplete="organization"
                  required
                />
              </Field>
              <Field label="Industry">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value as IndustryValue)}
                  className="rs-input"
                >
                  <option value="">Select industry…</option>
                  {INDUSTRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Company website">
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className="rs-input"
                  autoComplete="url"
                />
              </Field>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1
              className="text-[22px] font-semibold text-center mb-1"
              style={{ color: TEXT_PRIMARY }}
            >
              Billing details
            </h1>
            <p
              className="text-[12px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              Where should we send your paperwork?
            </p>

            <div
              className="rounded-rs p-4 space-y-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <Field label="Billing contact name" required>
                <input
                  type="text"
                  value={billingContact}
                  onChange={(e) => setBillingContact(e.target.value)}
                  placeholder="Amelia Cross"
                  className="rs-input"
                  autoComplete="name"
                  required
                />
              </Field>
              <div>
                <Field label="Billing email" required>
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="billing@company.com"
                    className="rs-input"
                    autoComplete="email"
                    required
                  />
                </Field>
                <p
                  className="text-[10px] mt-1.5"
                  style={{ color: TEXT_MUTED }}
                >
                  Invoices and call sheets will be sent here
                </p>
              </div>
              <Field label="Logo">
                <label
                  className="rs-input flex items-center gap-3 cursor-pointer"
                  style={{ padding: '10px 12px' }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        objectFit: 'cover',
                        background: '#fff',
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: 'rgba(73,98,117,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        color: 'rgba(73,98,117,0.6)',
                      }}
                    >
                      ＋
                    </span>
                  )}
                  <span
                    className="text-[13px] flex-1"
                    style={{ color: logoFile ? 'var(--rs-ink)' : 'rgba(73,98,117,0.5)' }}
                  >
                    {logoFile ? logoFile.name : 'Choose image'}
                  </span>
                </label>
              </Field>
            </div>
          </section>
        )}

        {error && (
          <p
            className="text-[12px] rounded-rs p-3 mt-4"
            style={{
              color: '#fca5a5',
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
            }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-6">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="flex-1 rs-btn rs-btn-ghost disabled:opacity-50"
              style={{ color: TEXT_MUTED, borderColor: 'rgba(170,189,224,0.3)' }}
            >
              Back
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNextStep1}
              className="flex-1 rs-btn disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving || !canFinish}
              className="flex-1 rs-btn disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Get started'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        className="block text-[11px] font-semibold mb-1.5"
        style={{ color: TEXT_MUTED }}
      >
        {label}
        {required && <span style={{ color: '#fca5a5', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  )
}
