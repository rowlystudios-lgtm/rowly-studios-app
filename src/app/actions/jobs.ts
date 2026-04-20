'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendNotification } from '@/lib/notifications'

// Platform-wide minimum working budget per person — must match the
// client-facing post-job form and the admin guard.
const MIN_BUDGET_CENTS = 30000

/**
 * A client updates the working budget on one of their own jobs. This
 * rewrites jobs.client_budget_cents + the per-day budget_cents entries
 * in shoot_days, and fires an in-app notification to every admin so
 * they know to re-evaluate any pending offers.
 */
export async function updateClientJobBudget(
  formData: FormData
): Promise<{ error?: string }> {
  const jobId = ((formData.get('jobId') as string) ?? '').trim()
  const budgetRaw = ((formData.get('budget') as string) ?? '').trim()
  if (!jobId || !budgetRaw) return { error: 'Missing fields' }

  const dollars = parseFloat(budgetRaw)
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return { error: 'Enter a valid amount.' }
  }
  const cents = Math.round(dollars * 100)
  if (cents < MIN_BUDGET_CENTS) {
    return { error: `Minimum budget is $${MIN_BUDGET_CENTS / 100}` }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  // Ownership: only the client who posted the job can edit its budget.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, client_id, title, job_code, shoot_days, client_budget_cents')
    .eq('id', jobId)
    .maybeSingle()
  if (!job || job.client_id !== user.id) return { error: 'Not authorised' }

  // Patch each shoot day so the per-day budget stays in sync with the
  // job-level summary. We trust the existing shape and fill any missing
  // fields defensively.
  type ShootDayRow = {
    date: string
    call_time?: string | null
    end_time?: string | null
    duration_type?: string | null
    duration_hours?: number | null
    budget_cents?: number | null
  }
  const prevDays = (Array.isArray(job.shoot_days)
    ? job.shoot_days
    : []) as ShootDayRow[]
  const nextDays = prevDays.map((d) => ({ ...d, budget_cents: cents }))

  await supabase
    .from('jobs')
    .update({
      client_budget_cents: cents,
      shoot_days: nextDays,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  // Notify admins so they can review in-flight offers against the new budget.
  // Uses the service client so we can enumerate admin profiles without RLS.
  try {
    const service = createServiceClient()
    const { data: admins } = await service
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    const admins_ = (admins ?? []) as Array<{ id: string }>
    const jobTitle = job.title ?? 'Job'
    const codeSuffix = job.job_code ? ` (${job.job_code})` : ''
    for (const a of admins_) {
      await sendNotification({
        userId: a.id,
        type: 'client_budget_changed',
        title: `Budget updated: ${jobTitle}${codeSuffix}`,
        body: `Client set a new working budget of $${(cents / 100).toLocaleString()} per person.`,
        actionUrl: `/admin/jobs/${jobId}`,
        jobId,
        channels: ['in_app', 'email'],
      })
    }
  } catch {
    // Notifications are best-effort — don't block the update if they fail.
  }

  revalidatePath('/app')
  revalidatePath(`/admin/jobs/${jobId}`)
  return {}
}

/**
 * Admin-only: set the working budget on a job. Mirrors updateClientJobBudget
 * but without the ownership gate (RLS + admin-auth cover that) and without
 * the admin notification (the admin is the one doing it).
 */
export async function updateAdminJobBudget(
  formData: FormData
): Promise<{ error?: string }> {
  const jobId = ((formData.get('jobId') as string) ?? '').trim()
  const budgetRaw = ((formData.get('budget') as string) ?? '').trim()
  if (!jobId || !budgetRaw) return { error: 'Missing fields' }

  const dollars = parseFloat(budgetRaw)
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return { error: 'Enter a valid amount.' }
  }
  const cents = Math.round(dollars * 100)

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  // requireAdmin-equivalent: pull role directly to avoid a circular import.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Not authorised' }

  const service = createServiceClient()
  const { data: job } = await service
    .from('jobs')
    .select('shoot_days')
    .eq('id', jobId)
    .maybeSingle()
  type ShootDayRow = {
    date: string
    call_time?: string | null
    end_time?: string | null
    duration_type?: string | null
    duration_hours?: number | null
    budget_cents?: number | null
  }
  const prevDays = (Array.isArray(job?.shoot_days)
    ? job!.shoot_days
    : []) as ShootDayRow[]
  const nextDays = prevDays.map((d) => ({ ...d, budget_cents: cents }))

  await service
    .from('jobs')
    .update({
      client_budget_cents: cents,
      shoot_days: nextDays,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  revalidatePath(`/admin/jobs/${jobId}`)
  return {}
}
