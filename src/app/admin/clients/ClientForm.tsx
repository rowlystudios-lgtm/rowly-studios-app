'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deactivateClient } from './actions'

export type ClientFormInitial = {
  id?: string
  email?: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  city?: string | null
  company_name?: string | null
  entity_type?: string | null
  industry?: string | null
  website?: string | null
  billing_email?: string | null
  bio?: string | null
  admin_notes?: string | null
  verified?: boolean
}

const ENTITY_OPTIONS = [
  { key: '', label: 'Unspecified' },
  { key: 'individual', label: 'Individual' },
  { key: 'sole_prop', label: 'Sole prop' },
  { key: 'llc', label: 'LLC' },
  { key: 'corp', label: 'Corporation' },
  { key: 'other', label: 'Other' },
]

export function ClientForm({
  mode,
  initial,
  action,
}: {
  mode: 'new' | 'edit'
  initial: ClientFormInitial
  action: (formData: FormData) => Promise<void>
}) {
  const [companyName, setCompanyName] = useState(initial.company_name ?? '')
  const [entityType, setEntityType] = useState(initial.entity_type ?? '')
  const [industry, setIndustry] = useState(initial.industry ?? '')
  const [website, setWebsite] = useState(initial.website ?? '')
  const [bio, setBio] = useState(initial.bio ?? '')

  const [firstName, setFirstName] = useState(initial.first_name ?? '')
  const [lastName, setLastName] = useState(initial.last_name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [city, setCity] = useState(initial.city ?? '')
  const [billingEmail, setBillingEmail] = useState(initial.billing_email ?? '')

  const [verified, setVerified] = useState(
    initial.verified === undefined ? true : initial.verified
  )
  const [adminNotes, setAdminNotes] = useState(initial.admin_notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    if (!companyName.trim()) {
      setError('Company name is required.')
      setSaving(false)
      return
    }
    if (mode === 'new' && !email.trim()) {
      setError('Email is required.')
      setSaving(false)
      return
    }

    const fd = new FormData()
    if (mode === 'edit' && initial.id) fd.set('id', initial.id)
    fd.set('company_name', companyName)
    fd.set('entity_type', entityType)
    fd.set('industry', industry)
    fd.set('website', website)
    fd.set('bio', bio)
    fd.set('first_name', firstName)
    fd.set('last_name', lastName)
    fd.set('email', email)
    fd.set('phone', phone)
    fd.set('city', city)
    fd.set('billing_email', billingEmail)
    fd.set('verified', verified ? 'true' : 'false')
    fd.set('admin_notes', adminNotes)

    try {
      await action(fd)
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'digest' in err &&
        String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
      ) {
        throw err
      }
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
      setSaving(false)
    }
  }

  const heading = mode === 'new' ? 'Add client' : 'Edit client'
  const saveLabel = mode === 'new' ? 'Create client' : 'Save changes'
  const backHref =
    mode === 'edit' && initial.id ? `/admin/clients/${initial.id}` : '/admin/clients'

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href={backHref} style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← Back
      </Link>
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>
        {heading}
      </h1>

      <form
        onSubmit={onSubmit}
        className="mt-4 bg-white rounded-xl"
        style={{ padding: 20, color: '#1E3A6B' }}
      >
        <SectionHeading>Company</SectionHeading>
        <Field label="Company name" required>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entity type">
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className={INPUT_CLS}
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.key || 'none'} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Fashion, Tech, Entertainment"
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <Field label="Website">
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Bio / description">
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>

        <Divider />

        <SectionHeading>Contact</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Last name">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <Field label="Email (login)" required={mode === 'new'}>
          <input
            type="email"
            required={mode === 'new'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLS}
            disabled={mode === 'edit'}
            style={mode === 'edit' ? { background: '#F3F4F6' } : undefined}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <Field label="Billing email (defaults to login email)">
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder={email || 'billing@example.com'}
            className={INPUT_CLS}
          />
        </Field>

        <Divider />

        <SectionHeading>Settings</SectionHeading>
        <Field label="Mark as verified">
          <Toggle
            checked={verified}
            onChange={setVerified}
            label={
              verified
                ? 'Client can post jobs and be invoiced'
                : 'Hidden from admin filters until verified'
            }
          />
        </Field>
        <Field label="Internal notes (private)">
          <textarea
            rows={2}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>

        {error && (
          <p
            className="mt-4 rounded-lg"
            style={{
              fontSize: 13,
              color: '#B91C1C',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              padding: '10px 12px',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '14px 0',
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>

        <Link
          href={backHref}
          className="block text-center mt-3"
          style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
        >
          Cancel
        </Link>
      </form>

      {mode === 'edit' && initial.id && (
        <div className="mt-6 text-center">
          <DeactivateButton clientId={initial.id} />
        </div>
      )}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="inline-flex items-center"
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? '#1E3A6B' : '#D1D5DB',
          padding: 2,
          transition: 'background 120ms ease',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#fff',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 120ms ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        />
      </span>
      {label && <span style={{ fontSize: 12, color: '#496275' }}>{label}</span>}
    </label>
  )
}

function DeactivateButton({ clientId }: { clientId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setBusy(true)
        fd.set('id', clientId)
        await deactivateClient(fd)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        style={{
          background: 'transparent',
          border: 'none',
          color: confirming ? '#DC2626' : '#F87171',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
          padding: '8px 12px',
        }}
      >
        {busy
          ? 'Deactivating…'
          : confirming
          ? 'Tap again to deactivate account'
          : 'Deactivate account'}
      </button>
    </form>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#1E3A6B',
        borderBottom: '1px solid #F3F4F6',
        paddingBottom: 8,
        marginBottom: 14,
      }}
    >
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ height: 18 }} />
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
    <label className="block" style={{ marginBottom: 12 }}>
      <span
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#496275',
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: '#DC2626' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

const INPUT_CLS =
  'block w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1E3A6B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A6B]/30 focus:border-[#1E3A6B]/40 transition'
