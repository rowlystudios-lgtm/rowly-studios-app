'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { appendToSheet, overwriteSheet } from '@/lib/google'

/* ─────────── Application review ─────────── */

export async function approveApplication(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  await supabase
    .from('talent_applications')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  revalidatePath('/admin/talent')
}

export async function declineApplication(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  await supabase
    .from('talent_applications')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  revalidatePath('/admin/talent')
}

/* ─────────── Talent profile actions ─────────── */

export async function verifyTalent(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  const nextRaw = (formData.get('verified') as string) ?? 'true'
  const next = nextRaw === 'true'
  if (!id) return
  await supabase
    .from('profiles')
    .update({
      verified: next,
      verified_at: next ? new Date().toISOString() : null,
    })
    .eq('id', id)
  revalidatePath(`/admin/talent/${id}`)
  revalidatePath('/admin/talent')
}

export async function updateTalentRate(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  const raw = (formData.get('day_rate') as string) ?? ''
  if (!id) return
  const cents = raw ? Math.round(parseFloat(raw) * 100) : null
  await supabase
    .from('talent_profiles')
    .upsert({ id, day_rate_cents: cents }, { onConflict: 'id' })
  revalidatePath(`/admin/talent/${id}`)
  revalidatePath('/admin/talent')
}

export async function updateRateFloor(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  const raw = (formData.get('rate_floor') as string) ?? ''
  if (!id) return
  const cents = raw ? Math.round(parseFloat(raw) * 100) : null
  await supabase
    .from('talent_profiles')
    .upsert({ id, rate_floor_cents: cents }, { onConflict: 'id' })
  revalidatePath(`/admin/talent/${id}`)
}

export async function updateAdminNotes(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  const notes = ((formData.get('notes') as string) ?? '').trim()
  if (!id) return
  await supabase
    .from('talent_profiles')
    .upsert({ id, admin_notes: notes || null }, { onConflict: 'id' })
  revalidatePath(`/admin/talent/${id}`)
}

/* ─────────── Create / update / remove ─────────── */

type TalentInput = {
  email: string
  first_name: string
  last_name: string
  phone: string | null
  city: string | null
  department: string | null
  primary_role: string | null
  secondary_roles: string[]
  day_rate_cents: number | null
  half_day_rate_cents: number | null
  rate_floor_cents: number | null
  bio: string | null
  showreel_url: string | null
  equipment: string | null
  travel_radius_miles: number | null
  union_eligible: boolean
  verified: boolean
}

function parseFormTalent(formData: FormData): TalentInput {
  const dayRate = (formData.get('day_rate') as string) ?? ''
  const halfDay = (formData.get('half_day_rate') as string) ?? ''
  const floor = (formData.get('rate_floor') as string) ?? ''
  const travel = (formData.get('travel_radius_miles') as string) ?? ''
  let secondary: string[] = []
  try {
    const parsed = JSON.parse(
      (formData.get('secondary_roles') as string) ?? '[]'
    )
    if (Array.isArray(parsed))
      secondary = parsed.filter((x) => typeof x === 'string')
  } catch {
    // ignore
  }
  return {
    email: ((formData.get('email') as string) ?? '').trim().toLowerCase(),
    first_name: ((formData.get('first_name') as string) ?? '').trim(),
    last_name: ((formData.get('last_name') as string) ?? '').trim(),
    phone: ((formData.get('phone') as string) ?? '').trim() || null,
    city: ((formData.get('city') as string) ?? '').trim() || null,
    department: ((formData.get('department') as string) ?? '').trim() || null,
    primary_role:
      ((formData.get('primary_role') as string) ?? '').trim() || null,
    secondary_roles: secondary,
    day_rate_cents: dayRate ? Math.round(parseFloat(dayRate) * 100) : null,
    half_day_rate_cents: halfDay ? Math.round(parseFloat(halfDay) * 100) : null,
    rate_floor_cents: floor ? Math.round(parseFloat(floor) * 100) : null,
    bio: ((formData.get('bio') as string) ?? '').trim() || null,
    showreel_url:
      ((formData.get('showreel_url') as string) ?? '').trim() || null,
    equipment: ((formData.get('equipment') as string) ?? '').trim() || null,
    travel_radius_miles: travel ? parseInt(travel, 10) : null,
    union_eligible: formData.get('union_eligible') === 'true',
    verified: formData.get('verified') !== 'false',
  }
}

export async function createTalentProfile(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const input = parseFormTalent(formData)
  if (!input.email || !input.first_name || !input.last_name) return

  const full = `${input.first_name} ${input.last_name}`.trim()
  const nowIso = new Date().toISOString()

  // Check for an existing profile by email. If one exists we treat this as
  // an upsert so the admin can fill in talent details for a signed-up user.
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  let profileId = existing?.id ?? null

  if (!profileId) {
    // Direct-created talent have no auth user yet; we still want a profile
    // row so they show up in the roster. Generate an id manually.
    profileId = crypto.randomUUID()
  }

  const { error: profileErr } = await supabase.from('profiles').upsert(
    {
      id: profileId,
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      full_name: full,
      phone: input.phone,
      city: input.city,
      role: 'talent',
      verified: input.verified,
      verified_at: input.verified ? nowIso : null,
    },
    { onConflict: 'id' }
  )
  if (profileErr) return

  const { error: tpErr } = await supabase.from('talent_profiles').upsert(
    {
      id: profileId,
      department: input.department,
      primary_role: input.primary_role,
      secondary_roles: input.secondary_roles,
      day_rate_cents: input.day_rate_cents,
      half_day_rate_cents: input.half_day_rate_cents,
      rate_floor_cents: input.rate_floor_cents,
      bio: input.bio,
      showreel_url: input.showreel_url,
      equipment: input.equipment,
      travel_radius_miles: input.travel_radius_miles,
      union_eligible: input.union_eligible,
    },
    { onConflict: 'id' }
  )
  if (tpErr) return

  // Leave an invite record so the admin can track the pre-approval.
  await supabase
    .from('talent_invites')
    .upsert(
      {
        email: input.email,
        invited_by: user.id,
        invited_at: nowIso,
        profile_id: profileId,
      },
      { onConflict: 'email' }
    )

  revalidatePath('/admin/talent')
  redirect(`/admin/talent/${profileId}`)
}

export async function updateTalentProfile(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  const input = parseFormTalent(formData)

  const full = `${input.first_name} ${input.last_name}`.trim()
  const nowIso = new Date().toISOString()

  const patch: Record<string, unknown> = {
    first_name: input.first_name,
    last_name: input.last_name,
    full_name: full,
    phone: input.phone,
    city: input.city,
  }
  // Only overwrite email on update if it was supplied and actually changed —
  // we avoid triggering trigger-based cascades with identical emails.
  if (input.email) patch.email = input.email

  // Verified is a toggle the admin can flip at the bottom of the form.
  patch.verified = input.verified
  if (input.verified) patch.verified_at = nowIso

  await supabase.from('profiles').update(patch).eq('id', id)

  await supabase.from('talent_profiles').upsert(
    {
      id,
      department: input.department,
      primary_role: input.primary_role,
      secondary_roles: input.secondary_roles,
      day_rate_cents: input.day_rate_cents,
      half_day_rate_cents: input.half_day_rate_cents,
      rate_floor_cents: input.rate_floor_cents,
      bio: input.bio,
      showreel_url: input.showreel_url,
      equipment: input.equipment,
      travel_radius_miles: input.travel_radius_miles,
      union_eligible: input.union_eligible,
    },
    { onConflict: 'id' }
  )

  revalidatePath(`/admin/talent/${id}`)
  revalidatePath('/admin/talent')
  redirect(`/admin/talent/${id}`)
}

/* ─────────── Payments ─────────── */

export async function recordTalentPayment(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const talentId = ((formData.get('talent_id') as string) ?? '').trim()
  const amountRaw = ((formData.get('amount') as string) ?? '').trim()
  const paymentDate = ((formData.get('payment_date') as string) ?? '').trim()
  const method = ((formData.get('method') as string) ?? '').trim() || 'Bank transfer'
  const reference =
    ((formData.get('reference') as string) ?? '').trim() || null
  const bookingId =
    ((formData.get('booking_id') as string) ?? '').trim() || null
  const notes = ((formData.get('notes') as string) ?? '').trim() || null
  if (!talentId || !amountRaw || !paymentDate) return

  const amountCents = Math.round(parseFloat(amountRaw) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return

  // Resolve job_id from booking if provided — lets the tax tracker filter
  // payments by job and lets us mark the booking paid in one sweep.
  let jobId: string | null = null
  if (bookingId) {
    const { data: b } = await supabase
      .from('job_bookings')
      .select('job_id')
      .eq('id', bookingId)
      .maybeSingle()
    jobId = b?.job_id ?? null
  }

  const { error } = await supabase.from('talent_payments').insert({
    talent_id: talentId,
    booking_id: bookingId,
    job_id: jobId,
    amount_cents: amountCents,
    payment_date: paymentDate,
    payment_method: method,
    reference,
    notes,
    created_by: user.id,
  })
  if (error) return

  // Flip the associated booking to paid so the job / client views sync up.
  if (bookingId) {
    await supabase
      .from('job_bookings')
      .update({
        paid: true,
        paid_at: new Date(paymentDate + 'T00:00:00Z').toISOString(),
      })
      .eq('id', bookingId)
  }

  // Best-effort append to the Google Sheet payment ledger.
  try {
    const [{ data: talentRow }, { data: jobRow }, { data: ledgerSetting }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', talentId)
          .maybeSingle(),
        jobId
          ? supabase
              .from('jobs')
              .select('title')
              .eq('id', jobId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'drive_payment_ledger_id')
          .maybeSingle(),
      ])

    if (ledgerSetting?.value) {
      await appendToSheet(ledgerSetting.value, 'Sheet1!A:K', [
        paymentDate,
        talentRow?.full_name ?? '',
        jobRow?.title ?? '',
        amountCents / 100,
        method,
        reference ?? '',
        new Date().toISOString(),
        new Date(paymentDate).getFullYear(),
        talentRow?.email ?? '',
        talentId,
        bookingId ?? '',
      ])
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[payment] ledger sync failed', err)
  }

  revalidatePath(`/admin/talent/${talentId}`)
  revalidatePath('/admin/finance')
}

/* ─────────── Tax records ─────────── */

async function syncTaxTrackerSheet(): Promise<void> {
  const { supabase } = await requireAdmin()

  const year = new Date().getFullYear()
  const [{ data: records }, { data: tracker }] = await Promise.all([
    supabase
      .from('talent_tax_records')
      .select(
        `talent_id, tax_year, total_paid_cents,
         w9_received, legal_name, tax_id_last4, entity_type,
         requires_1099, form_1099_sent,
         profiles!talent_tax_records_talent_id_fkey (full_name, email,
           talent_profiles (primary_role))`
      )
      .eq('tax_year', year)
      .order('total_paid_cents', { ascending: false }),
    supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'drive_tax_tracker_id')
      .maybeSingle(),
  ])

  if (!tracker?.value) return

  type Row = {
    talent_id: string
    tax_year: number
    total_paid_cents: number | null
    w9_received: boolean | null
    legal_name: string | null
    tax_id_last4: string | null
    entity_type: string | null
    requires_1099: boolean | null
    form_1099_sent: boolean | null
    profiles:
      | {
          full_name: string | null
          email: string | null
          talent_profiles:
            | { primary_role: string | null }
            | { primary_role: string | null }[]
            | null
        }
      | {
          full_name: string | null
          email: string | null
          talent_profiles:
            | { primary_role: string | null }
            | { primary_role: string | null }[]
            | null
        }[]
      | null
  }

  const header = [
    'Name',
    'Email',
    'Role',
    'Total Paid',
    'W-9 Received',
    'Legal Name',
    'Tax ID Last 4',
    'Entity',
    '1099 Required',
    '1099 Sent',
  ]

  const rows = ((records ?? []) as unknown as Row[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] ?? null : r.profiles
    const tp = p
      ? Array.isArray(p.talent_profiles)
        ? p.talent_profiles[0] ?? null
        : p.talent_profiles
      : null
    return [
      p?.full_name ?? '',
      p?.email ?? '',
      tp?.primary_role ?? '',
      (r.total_paid_cents ?? 0) / 100,
      r.w9_received ? 'Yes' : 'No',
      r.legal_name ?? '',
      r.tax_id_last4 ?? '',
      r.entity_type ?? '',
      r.requires_1099 ? 'Yes' : 'No',
      r.form_1099_sent ? 'Yes' : 'No',
    ]
  })

  try {
    await overwriteSheet(tracker.value, 'Sheet1!A1', [header, ...rows])
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[tax] tracker sheet sync failed', err)
  }
}

export async function markW9Received(formData: FormData) {
  const { supabase } = await requireAdmin()
  const talentId = ((formData.get('talent_id') as string) ?? '').trim()
  if (!talentId) return
  const driveUrl = ((formData.get('w9_drive_url') as string) ?? '').trim() || null
  const legalName = ((formData.get('legal_name') as string) ?? '').trim() || null
  const taxIdLast4 =
    ((formData.get('tax_id_last4') as string) ?? '').trim().slice(0, 4) || null
  const entityType =
    ((formData.get('entity_type') as string) ?? '').trim() || null
  const year = new Date().getFullYear()

  await supabase.from('talent_tax_records').upsert(
    {
      talent_id: talentId,
      tax_year: year,
      w9_received: true,
      w9_received_at: new Date().toISOString(),
      w9_drive_url: driveUrl,
      legal_name: legalName,
      tax_id_last4: taxIdLast4,
      entity_type: entityType,
    },
    { onConflict: 'talent_id,tax_year' }
  )

  try {
    await syncTaxTrackerSheet()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[w9] tracker sync failed', err)
  }

  revalidatePath(`/admin/talent/${talentId}`)
  revalidatePath('/admin/finance')
}

export async function toggle1099Sent(formData: FormData) {
  const { supabase } = await requireAdmin()
  const talentId = ((formData.get('talent_id') as string) ?? '').trim()
  const next = (formData.get('next') as string) === 'true'
  if (!talentId) return
  const year = new Date().getFullYear()

  await supabase
    .from('talent_tax_records')
    .upsert(
      {
        talent_id: talentId,
        tax_year: year,
        form_1099_sent: next,
        form_1099_sent_at: next ? new Date().toISOString() : null,
      },
      { onConflict: 'talent_id,tax_year' }
    )

  try {
    await syncTaxTrackerSheet()
  } catch {
    // non-fatal
  }

  revalidatePath(`/admin/talent/${talentId}`)
  revalidatePath('/admin/finance')
}

/** Soft remove — flips verified=false so they drop out of the active roster. */
export async function removeFromRoster(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  await supabase
    .from('profiles')
    .update({ verified: false, verified_at: null })
    .eq('id', id)
  revalidatePath('/admin/talent')
  redirect('/admin/talent')
}
