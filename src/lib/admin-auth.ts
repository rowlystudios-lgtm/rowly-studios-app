import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

/**
 * Server-side guard for all /admin pages. Returns the authenticated admin's
 * supabase client + user row. Redirects non-admins to /app and signed-out
 * users to /login.
 */
export async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, full_name, email, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') redirect('/app')

  return { supabase, user, profile }
}

export function centsToUsd(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '—'
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export function centsToUsdPrecise(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '$0.00'
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const JOB_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(170,189,224,0.15)', color: '#AABDE0', label: 'Draft' },
  submitted: { bg: 'rgba(212,149,10,0.18)', color: '#F0A500', label: 'Submitted' },
  crewing: { bg: 'rgba(59,130,246,0.18)', color: '#60A5FA', label: 'Crewing' },
  confirmed: { bg: 'rgba(34,197,94,0.18)', color: '#4ADE80', label: 'Confirmed' },
  wrapped: { bg: 'rgba(168,85,247,0.18)', color: '#C084FC', label: 'Wrapped' },
  cancelled: { bg: 'rgba(239,68,68,0.18)', color: '#F87171', label: 'Cancelled' },
}

export function jobStatusStyle(status: string | null | undefined) {
  return JOB_STATUS_STYLES[status ?? 'draft'] ?? JOB_STATUS_STYLES.draft
}

const INVOICE_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'rgba(170,189,224,0.15)', color: '#AABDE0', label: 'Draft' },
  sent: { bg: 'rgba(59,130,246,0.18)', color: '#60A5FA', label: 'Sent' },
  paid: { bg: 'rgba(34,197,94,0.18)', color: '#4ADE80', label: 'Paid' },
  overdue: { bg: 'rgba(239,68,68,0.18)', color: '#F87171', label: 'Overdue' },
  void: { bg: 'rgba(170,189,224,0.1)', color: '#7A90AA', label: 'Void' },
}

export function invoiceStatusStyle(status: string | null | undefined) {
  return INVOICE_STATUS_STYLES[status ?? 'draft'] ?? INVOICE_STATUS_STYLES.draft
}
