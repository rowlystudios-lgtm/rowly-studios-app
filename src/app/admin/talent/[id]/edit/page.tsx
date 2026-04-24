import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { TalentForm, type TalentFormInitial } from '../../TalentForm'
import { updateTalentProfile } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function AdminEditTalentPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [profileRes, talentRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('talent_profiles').select('*').eq('id', params.id).maybeSingle(),
  ])

  const profile = profileRes.data as unknown as {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    city: string | null
    verified: boolean
  } | null

  if (!profile) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/talent" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Talent
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Talent not found.
        </p>
      </div>
    )
  }

  const tp = talentRes.data as unknown as {
    department: string | null
    primary_role: string | null
    secondary_roles: string[] | null
    bio: string | null
    day_rate_cents: number | null
    rate_floor_cents: number | null
    showreel_url: string | null
    equipment: string | null
    union_eligible: boolean | null
    travel_radius_miles: number | null
  } | null

  const initial: TalentFormInitial = {
    id: profile.id,
    email: profile.email ?? '',
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
    phone: profile.phone,
    city: profile.city,
    department: tp?.department ?? null,
    primary_role: tp?.primary_role ?? null,
    secondary_roles: Array.isArray(tp?.secondary_roles)
      ? tp?.secondary_roles
      : [],
    day_rate_cents: tp?.day_rate_cents ?? null,
    rate_floor_cents: tp?.rate_floor_cents ?? null,
    bio: tp?.bio ?? null,
    showreel_url: tp?.showreel_url ?? null,
    equipment: tp?.equipment ?? null,
    travel_radius_miles: tp?.travel_radius_miles ?? null,
    union_eligible: tp?.union_eligible ?? false,
    verified: profile.verified,
  }

  return <TalentForm mode="edit" initial={initial} action={updateTalentProfile} />
}
