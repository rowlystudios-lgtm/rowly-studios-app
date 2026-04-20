'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

type SupabaseClient = Awaited<ReturnType<typeof requireAdmin>>['supabase']

type SettingsMap = Record<string, string>

async function readSettings(
  supabase: SupabaseClient,
  keys: string[]
): Promise<SettingsMap> {
  const { data } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', keys)
  const out: SettingsMap = {}
  for (const row of (data ?? []) as Array<{ key: string; value: string | null }>) {
    out[row.key] = row.value ?? ''
  }
  return out
}

async function writeSetting(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  value: string
) {
  await supabase.from('admin_settings').upsert(
    {
      key,
      value: value || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )
}

export async function saveNotionSettings(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const token = ((formData.get('notion_token') as string) ?? '').trim()
  const jobs = ((formData.get('notion_jobs_db') as string) ?? '').trim()
  const talent = ((formData.get('notion_talent_db') as string) ?? '').trim()
  const clients = ((formData.get('notion_clients_db') as string) ?? '').trim()

  // Don't clobber an existing token with an empty string — lets the admin
  // save changes to the DB ids without re-entering the secret every time.
  if (token) await writeSetting(supabase, user.id, 'notion_token', token)
  await writeSetting(supabase, user.id, 'notion_jobs_db', jobs)
  await writeSetting(supabase, user.id, 'notion_talent_db', talent)
  await writeSetting(supabase, user.id, 'notion_clients_db', clients)

  revalidatePath('/admin/settings')
}

/* ─────────── Notion helpers ─────────── */

const NOTION_VERSION = '2022-06-28'

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

function titleProp(text: string | null) {
  return {
    title: [{ type: 'text', text: { content: (text ?? '').slice(0, 200) } }],
  }
}

function richTextProp(text: string | null) {
  if (!text) return { rich_text: [] }
  return {
    rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
  }
}

function selectProp(name: string | null) {
  if (!name) return { select: null }
  return { select: { name: name.slice(0, 100) } }
}

function dateProp(iso: string | null) {
  if (!iso) return { date: null }
  return { date: { start: iso } }
}

function numberProp(n: number | null) {
  if (n == null) return { number: null }
  return { number: n }
}

function emailProp(email: string | null) {
  if (!email) return { email: null }
  return { email }
}

function urlProp(url: string | null) {
  if (!url) return { url: null }
  return { url }
}

function checkboxProp(v: boolean | null | undefined) {
  return { checkbox: Boolean(v) }
}

type NotionUpsertResult = {
  synced: number
  errors: string[]
}

async function notionUpsertPage(opts: {
  token: string
  dbId: string
  existingPageId: string | null
  properties: Record<string, unknown>
}): Promise<{ pageId: string | null; error: string | null }> {
  const { token, dbId, existingPageId, properties } = opts
  const url = existingPageId
    ? `https://api.notion.com/v1/pages/${existingPageId}`
    : 'https://api.notion.com/v1/pages'
  const method = existingPageId ? 'PATCH' : 'POST'
  const body = existingPageId
    ? JSON.stringify({ properties })
    : JSON.stringify({ parent: { database_id: dbId }, properties })

  try {
    const res = await fetch(url, {
      method,
      headers: notionHeaders(token),
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      return { pageId: null, error: `${res.status} ${text.slice(0, 200)}` }
    }
    const json = (await res.json()) as { id?: string }
    return { pageId: json.id ?? existingPageId, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed'
    return { pageId: null, error: msg }
  }
}

/* ─────────── Sync jobs ─────────── */

export async function syncJobsToNotion(): Promise<NotionUpsertResult> {
  const { supabase } = await requireAdmin()
  const settings = await readSettings(supabase, ['notion_token', 'notion_jobs_db'])
  const token = settings.notion_token
  const dbId = settings.notion_jobs_db
  if (!token || !dbId) {
    return { synced: 0, errors: ['Notion token or jobs database ID is missing.'] }
  }

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, status, start_date, end_date, location, day_rate_cents,
       notion_page_id,
       profiles!jobs_client_id_fkey (full_name,
         client_profiles (company_name))`
    )
    .neq('status', 'cancelled')
    .order('start_date', { ascending: false, nullsFirst: false })

  type Row = {
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
    location: string | null
    day_rate_cents: number | null
    notion_page_id: string | null
    profiles:
      | {
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }
      | {
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }[]
      | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const errors: string[] = []
  let synced = 0
  for (const j of rows) {
    const client = Array.isArray(j.profiles) ? j.profiles[0] ?? null : j.profiles
    const cp = client
      ? Array.isArray(client.client_profiles)
        ? client.client_profiles[0] ?? null
        : client.client_profiles
      : null
    const clientName =
      cp?.company_name || client?.full_name || 'Unknown client'

    const properties = {
      Name: titleProp(j.title),
      Status: selectProp(j.status),
      Client: richTextProp(clientName),
      'Start date': dateProp(j.start_date),
      'End date': dateProp(j.end_date),
      Location: richTextProp(j.location),
      'Day rate': numberProp(
        j.day_rate_cents != null ? j.day_rate_cents / 100 : null
      ),
    }

    const r = await notionUpsertPage({
      token,
      dbId,
      existingPageId: j.notion_page_id,
      properties,
    })
    if (r.error) {
      errors.push(`${j.title}: ${r.error}`)
      continue
    }
    synced += 1
    await supabase
      .from('jobs')
      .update({
        notion_page_id: r.pageId,
        external_synced_at: new Date().toISOString(),
      })
      .eq('id', j.id)
  }

  revalidatePath('/admin/settings')
  return { synced, errors }
}

/* ─────────── Sync talent ─────────── */

export async function syncTalentToNotion(): Promise<NotionUpsertResult> {
  const { supabase } = await requireAdmin()
  const settings = await readSettings(supabase, [
    'notion_token',
    'notion_talent_db',
  ])
  const token = settings.notion_token
  const dbId = settings.notion_talent_db
  if (!token || !dbId) {
    return { synced: 0, errors: ['Notion token or talent database ID is missing.'] }
  }

  const { data } = await supabase
    .from('profiles')
    .select(
      `id, full_name, first_name, last_name, email, city, verified,
       talent_profiles (department, primary_role, day_rate_cents, notion_page_id)`
    )
    .eq('role', 'talent')
    .order('full_name')

  type Row = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    city: string | null
    verified: boolean
    talent_profiles:
      | {
          department: string | null
          primary_role: string | null
          day_rate_cents: number | null
          notion_page_id: string | null
        }
      | {
          department: string | null
          primary_role: string | null
          day_rate_cents: number | null
          notion_page_id: string | null
        }[]
      | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const errors: string[] = []
  let synced = 0
  for (const p of rows) {
    const tp = Array.isArray(p.talent_profiles)
      ? p.talent_profiles[0] ?? null
      : p.talent_profiles
    const name =
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      p.full_name ||
      p.email ||
      'Unnamed'

    const properties = {
      Name: titleProp(name),
      Department: selectProp(tp?.department ?? null),
      Role: richTextProp(tp?.primary_role ?? null),
      'Day rate': numberProp(
        tp?.day_rate_cents != null ? tp.day_rate_cents / 100 : null
      ),
      Verified: checkboxProp(p.verified),
      Email: emailProp(p.email),
      City: richTextProp(p.city),
    }

    const r = await notionUpsertPage({
      token,
      dbId,
      existingPageId: tp?.notion_page_id ?? null,
      properties,
    })
    if (r.error) {
      errors.push(`${name}: ${r.error}`)
      continue
    }
    synced += 1
    await supabase
      .from('talent_profiles')
      .upsert(
        {
          id: p.id,
          notion_page_id: r.pageId,
          external_synced_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
  }

  revalidatePath('/admin/settings')
  return { synced, errors }
}

/* ─────────── Sync clients ─────────── */

export async function syncClientsToNotion(): Promise<NotionUpsertResult> {
  const { supabase } = await requireAdmin()
  const settings = await readSettings(supabase, [
    'notion_token',
    'notion_clients_db',
  ])
  const token = settings.notion_token
  const dbId = settings.notion_clients_db
  if (!token || !dbId) {
    return { synced: 0, errors: ['Notion token or clients database ID is missing.'] }
  }

  const { data } = await supabase
    .from('profiles')
    .select(
      `id, full_name, email,
       client_profiles (company_name, industry, website, billing_email,
         entity_type, notion_page_id)`
    )
    .eq('role', 'client')
    .order('full_name')

  type Row = {
    id: string
    full_name: string | null
    email: string | null
    client_profiles:
      | {
          company_name: string | null
          industry: string | null
          website: string | null
          billing_email: string | null
          entity_type: string | null
          notion_page_id: string | null
        }
      | {
          company_name: string | null
          industry: string | null
          website: string | null
          billing_email: string | null
          entity_type: string | null
          notion_page_id: string | null
        }[]
      | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const errors: string[] = []
  let synced = 0
  for (const p of rows) {
    const cp = Array.isArray(p.client_profiles)
      ? p.client_profiles[0] ?? null
      : p.client_profiles
    const name = cp?.company_name || p.full_name || p.email || 'Unnamed'

    const properties = {
      Name: titleProp(name),
      Industry: selectProp(cp?.industry ?? null),
      Website: urlProp(cp?.website ?? null),
      Email: emailProp(p.email),
      'Billing email': emailProp(cp?.billing_email ?? null),
      'Entity type': selectProp(cp?.entity_type ?? null),
    }

    const r = await notionUpsertPage({
      token,
      dbId,
      existingPageId: cp?.notion_page_id ?? null,
      properties,
    })
    if (r.error) {
      errors.push(`${name}: ${r.error}`)
      continue
    }
    synced += 1
    await supabase
      .from('client_profiles')
      .upsert(
        {
          id: p.id,
          notion_page_id: r.pageId,
          external_synced_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
  }

  revalidatePath('/admin/settings')
  return { synced, errors }
}
