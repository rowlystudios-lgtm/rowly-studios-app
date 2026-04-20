'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

/** Flip verified on a client. */
export async function verifyClient(formData: FormData) {
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
  revalidatePath(`/admin/clients/${id}`)
  revalidatePath('/admin/clients')
}

/** Quick approve from the list page. */
export async function approveClient(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  await supabase
    .from('profiles')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/clients')
}

export async function updateClientNotes(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  const notes = ((formData.get('notes') as string) ?? '').trim()
  if (!id) return
  await supabase
    .from('client_profiles')
    .upsert({ id, admin_notes: notes || null }, { onConflict: 'id' })
  revalidatePath(`/admin/clients/${id}`)
}

type ClientInput = {
  email: string
  first_name: string
  last_name: string
  phone: string | null
  city: string | null
  company_name: string
  entity_type: string | null
  industry: string | null
  website: string | null
  billing_email: string | null
  bio: string | null
  admin_notes: string | null
  verified: boolean
}

function parseFormClient(formData: FormData): ClientInput {
  const email = ((formData.get('email') as string) ?? '').trim().toLowerCase()
  const billing = ((formData.get('billing_email') as string) ?? '').trim().toLowerCase()
  return {
    email,
    first_name: ((formData.get('first_name') as string) ?? '').trim(),
    last_name: ((formData.get('last_name') as string) ?? '').trim(),
    phone: ((formData.get('phone') as string) ?? '').trim() || null,
    city: ((formData.get('city') as string) ?? '').trim() || null,
    company_name: ((formData.get('company_name') as string) ?? '').trim(),
    entity_type:
      ((formData.get('entity_type') as string) ?? '').trim() || null,
    industry: ((formData.get('industry') as string) ?? '').trim() || null,
    website: ((formData.get('website') as string) ?? '').trim() || null,
    billing_email: billing || email || null,
    bio: ((formData.get('bio') as string) ?? '').trim() || null,
    admin_notes:
      ((formData.get('admin_notes') as string) ?? '').trim() || null,
    verified: formData.get('verified') !== 'false',
  }
}

export async function createClientProfile(formData: FormData) {
  const { supabase } = await requireAdmin()
  const input = parseFormClient(formData)
  if (!input.email || !input.company_name) return
  const nowIso = new Date().toISOString()

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  const profileId = existing?.id ?? crypto.randomUUID()

  // The `full_name` column is rendered in many places where we don't
  // already unwrap client_profiles.company_name, so we mirror the company
  // name into it. first_name/last_name still hold the account-holder's
  // human name for contact purposes.
  const { error: profileErr } = await supabase.from('profiles').upsert(
    {
      id: profileId,
      email: input.email,
      first_name: input.first_name || null,
      last_name: input.last_name || null,
      full_name: input.company_name,
      phone: input.phone,
      city: input.city,
      role: 'client',
      verified: input.verified,
      verified_at: input.verified ? nowIso : null,
    },
    { onConflict: 'id' }
  )
  if (profileErr) return

  await supabase.from('client_profiles').upsert(
    {
      id: profileId,
      company_name: input.company_name,
      industry: input.industry,
      website: input.website,
      billing_email: input.billing_email,
      bio: input.bio,
      entity_type: input.entity_type,
      admin_notes: input.admin_notes,
    },
    { onConflict: 'id' }
  )

  revalidatePath('/admin/clients')
  redirect(`/admin/clients/${profileId}`)
}

export async function updateClientProfile(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  const input = parseFormClient(formData)
  const nowIso = new Date().toISOString()

  await supabase
    .from('profiles')
    .update({
      first_name: input.first_name || null,
      last_name: input.last_name || null,
      full_name: input.company_name,
      phone: input.phone,
      city: input.city,
      verified: input.verified,
      verified_at: input.verified ? nowIso : null,
    })
    .eq('id', id)

  await supabase.from('client_profiles').upsert(
    {
      id,
      company_name: input.company_name,
      industry: input.industry,
      website: input.website,
      billing_email: input.billing_email,
      bio: input.bio,
      entity_type: input.entity_type,
      admin_notes: input.admin_notes,
    },
    { onConflict: 'id' }
  )

  revalidatePath(`/admin/clients/${id}`)
  revalidatePath('/admin/clients')
  redirect(`/admin/clients/${id}`)
}

/** Soft deactivate — flips verified=false. */
export async function deactivateClient(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = (formData.get('id') as string) ?? ''
  if (!id) return
  await supabase
    .from('profiles')
    .update({ verified: false, verified_at: null })
    .eq('id', id)
  revalidatePath('/admin/clients')
  redirect('/admin/clients')
}
