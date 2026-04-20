'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

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
