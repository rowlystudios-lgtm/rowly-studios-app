'use client'

import { useState } from 'react'
import Link from 'next/link'
import { updateAdminJobBudget } from '@/app/actions/jobs'

/**
 * Inline, edit-in-place JOB BUDGET row rendered above the talent section
 * on /admin/jobs/[id]. Gives the admin a quick glance at what the client
 * is offering per person without opening the edit page.
 */
export function AdminBudgetRow({
  jobId,
  budgetCents,
  isShortShoot,
  editHref,
}: {
  jobId: string
  budgetCents: number | null
  isShortShoot: boolean
  editHref: string
}) {
  const [editing, setEditing] = useState(false)
  const [dollars, setDollars] = useState(
    budgetCents != null ? String(Math.round(budgetCents / 100)) : ''
  )
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const num = parseFloat(dollars)
    if (!Number.isFinite(num) || num <= 0) {
      setErrorMsg('Enter a valid amount.')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set('jobId', jobId)
      fd.set('budget', String(num))
      const result = await updateAdminJobBudget(fd)
      if (result?.error) {
        setErrorMsg(result.error)
        return
      }
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const formatted =
    budgetCents != null
      ? `$${Math.round(budgetCents / 100).toLocaleString()}`
      : null
  const suffix = isShortShoot ? '' : '/person'

  return (
    <section
      className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 14 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Job budget
          </p>
          {!editing ? (
            formatted ? (
              <p
                className="text-white"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  marginTop: 2,
                }}
              >
                {formatted}
                <span
                  style={{
                    color: '#AABDE0',
                    fontWeight: 400,
                    fontSize: 13,
                  }}
                >
                  {suffix}
                </span>
                {isShortShoot && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#F0A500',
                      background: 'rgba(240,165,0,0.12)',
                      border: '1px solid rgba(240,165,0,0.3)',
                      padding: '2px 6px',
                      borderRadius: 999,
                    }}
                  >
                    Flat fee
                  </span>
                )}
              </p>
            ) : (
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: '#F0A500',
                    fontWeight: 600,
                  }}
                >
                  No budget set
                </span>
                <Link
                  href={editHref}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#AABDE0',
                    textDecoration: 'underline',
                  }}
                >
                  Set on job →
                </Link>
              </div>
            )
          ) : null}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true)
              setErrorMsg('')
            }}
            aria-label="Edit budget"
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              background: 'rgba(170,189,224,0.1)',
              color: '#AABDE0',
              border: '1px solid rgba(170,189,224,0.25)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ✎ Edit
          </button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={save}
          style={{
            marginTop: 10,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <label style={{ flex: '1 1 140px' }}>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 4,
              }}
            >
              Budget per person
            </span>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#7A90AA',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              >
                $
              </span>
              <input
                autoFocus
                type="number"
                min={0}
                step={25}
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 22px',
                  borderRadius: 8,
                  border: '1px solid rgba(170,189,224,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px 14px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#F0A500',
              color: '#0F1B2E',
              border: 'none',
              borderRadius: 8,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setErrorMsg('')
            }}
            disabled={saving}
            style={{
              padding: '9px 12px',
              fontSize: 11,
              fontWeight: 600,
              background: 'transparent',
              color: '#AABDE0',
              border: '1px solid rgba(170,189,224,0.2)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          {errorMsg && (
            <p style={{ fontSize: 11, color: '#F87171', flex: '1 0 100%' }}>
              {errorMsg}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
