import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type ClientProfileRow = {
  company_name: string | null
  industry: string | null
}

type TalentProfileRow = {
  primary_role: string | null
  department: string | null
}

export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: { query?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body → treat as empty query
  }
  const raw = (body.query ?? '').trim()
  if (!raw) {
    return NextResponse.json({ jobs: [], talent: [], clients: [] })
  }

  // Supabase/PostgREST requires %-escaping of any percent/comma in the value.
  const q = raw
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  const like = `%${q}%`

  const codeLike = raw.toUpperCase()
  const [jobsRes, talentRes, clientsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title, status, start_date, location')
      .or(`title.ilike.${like},location.ilike.${like}`)
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(4),
    supabase
      .from('profiles')
      .select(
        `id, full_name, first_name, last_name, avatar_url, share_code,
         talent_profiles (primary_role, department)`
      )
      .eq('role', 'talent')
      .or(
        `full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},share_code.ilike.%${codeLike}%`
      )
      .order('full_name')
      .limit(4),
    supabase
      .from('profiles')
      .select(
        `id, full_name, first_name, last_name, email, share_code,
         client_profiles (company_name, industry)`
      )
      .eq('role', 'client')
      .or(
        `full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},share_code.ilike.%${codeLike}%`
      )
      .order('full_name')
      .limit(8), // overfetch; filter below
  ])

  // Clients: merge in any matching on client_profiles.company_name (needs a
  // separate query since Supabase can't .or() across joined tables).
  const { data: clientsByCompany } = await supabase
    .from('client_profiles')
    .select(
      `id, company_name, industry,
       profiles!client_profiles_id_fkey (id, full_name, first_name, last_name, email)`
    )
    .ilike('company_name', like)
    .limit(8)

  type ClientRow = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    share_code: string | null
    client_profiles: ClientProfileRow | ClientProfileRow[] | null
  }
  type ClientByCompany = {
    id: string
    company_name: string | null
    industry: string | null
    profiles:
      | {
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
        }
      | {
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          email: string | null
        }[]
      | null
  }

  const seen = new Set<string>()
  const mergedClients: Array<{
    id: string
    name: string
    industry: string | null
    byCode: boolean
  }> = []

  function pushClient(
    id: string,
    name: string,
    industry: string | null,
    byCode: boolean
  ) {
    if (!id || seen.has(id)) return
    seen.add(id)
    mergedClients.push({ id, name, industry, byCode })
  }

  for (const r of ((clientsRes.data ?? []) as unknown as ClientRow[])) {
    const cp = Array.isArray(r.client_profiles)
      ? r.client_profiles[0] ?? null
      : r.client_profiles
    const name =
      cp?.company_name ||
      [r.first_name, r.last_name].filter(Boolean).join(' ') ||
      r.full_name ||
      r.email ||
      'Unnamed'
    const byCode = Boolean(
      r.share_code &&
        r.share_code.toUpperCase().includes(codeLike) &&
        !(
          name.toLowerCase().includes(q.toLowerCase()) ||
          (cp?.company_name ?? '').toLowerCase().includes(q.toLowerCase())
        )
    )
    pushClient(r.id, name, cp?.industry ?? null, byCode)
  }
  for (const r of ((clientsByCompany ?? []) as unknown as ClientByCompany[])) {
    const p = Array.isArray(r.profiles) ? r.profiles[0] ?? null : r.profiles
    if (!p) continue
    pushClient(
      p.id,
      r.company_name ?? p.full_name ?? 'Unnamed',
      r.industry,
      false
    )
  }

  type TalentRow = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
    share_code: string | null
    talent_profiles: TalentProfileRow | TalentProfileRow[] | null
  }
  const talent = ((talentRes.data ?? []) as unknown as TalentRow[]).map((r) => {
    const tp = Array.isArray(r.talent_profiles)
      ? r.talent_profiles[0] ?? null
      : r.talent_profiles
    const name =
      [r.first_name, r.last_name].filter(Boolean).join(' ') ||
      r.full_name ||
      'Unnamed'
    const byCode = Boolean(
      r.share_code &&
        r.share_code.toUpperCase().includes(codeLike) &&
        !name.toLowerCase().includes(q.toLowerCase())
    )
    return {
      id: r.id,
      name,
      avatar_url: r.avatar_url,
      primary_role: tp?.primary_role ?? null,
      department: tp?.department ?? null,
      byCode,
    }
  })

  const jobs = ((jobsRes.data ?? []) as Array<{
    id: string
    title: string
    status: string
    start_date: string | null
    location: string | null
  }>).map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    start_date: j.start_date,
    location: j.location,
  }))

  return NextResponse.json({
    jobs,
    talent,
    clients: mergedClients.slice(0, 4),
  })
}
