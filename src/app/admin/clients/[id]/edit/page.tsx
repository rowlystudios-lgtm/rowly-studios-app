import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { ClientForm, type ClientFormInitial } from '../../ClientForm'
import { updateClientProfile } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function AdminEditClientPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [profileRes, clientRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('client_profiles').select('*').eq('id', params.id).maybeSingle(),
  ])

  const profile = profileRes.data as unknown as {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
    city: string | null
    verified: boolean
  } | null

  if (!profile) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/clients" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Clients
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Client not found.
        </p>
      </div>
    )
  }

  const cp = clientRes.data as unknown as {
    company_name: string | null
    industry: string | null
    website: string | null
    billing_email: string | null
    bio: string | null
    entity_type: string | null
    admin_notes: string | null
  } | null

  const initial: ClientFormInitial = {
    id: profile.id,
    email: profile.email ?? '',
    first_name: profile.first_name,
    last_name: profile.last_name,
    phone: profile.phone,
    city: profile.city,
    company_name: cp?.company_name ?? '',
    entity_type: cp?.entity_type ?? '',
    industry: cp?.industry ?? '',
    website: cp?.website ?? '',
    billing_email: cp?.billing_email ?? '',
    bio: cp?.bio ?? '',
    admin_notes: cp?.admin_notes ?? '',
    verified: profile.verified,
  }

  return (
    <ClientForm mode="edit" initial={initial} action={updateClientProfile} />
  )
}
