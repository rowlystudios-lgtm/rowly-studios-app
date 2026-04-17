import { createClient } from '@/lib/supabase-server'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

function initials(name: string | null) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default async function TeamPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, verified, talent_profiles(department, primary_role)')
    .eq('verified', true)
    .eq('role', 'talent')
    .order('full_name', { ascending: true, nullsFirst: false })

  const list = members ?? []

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <h1 className="text-[22px] font-semibold text-rs-blue-logo">The team</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mt-1 mb-5">
        {list.length} verified {list.length === 1 ? 'contributor' : 'contributors'}
      </p>

      {list.length === 0 ? (
        <div className="bg-white rounded-rs p-5 border border-rs-blue-fusion/10">
          <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
            No verified talent yet. As admin verifies team members, they'll appear here
            so clients can browse and request bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((m) => {
            const talent = (m.talent_profiles as { department: Department | null; primary_role: string | null } | null) ?? null
            const isMe = m.id === user?.id
            return (
              <div
                key={m.id}
                className="bg-white rounded-rs p-3 border border-rs-blue-fusion/10 flex items-center gap-3"
              >
                <div className="w-11 h-11 rounded-full bg-[#E8EAED] flex items-center justify-center text-[13px] font-bold text-rs-blue-logo shrink-0">
                  {initials(m.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-rs-blue-logo truncate">
                      {m.full_name || m.email}
                    </p>
                    {isMe && (
                      <span className="text-[9px] bg-rs-blue-fusion text-rs-cream px-1.5 py-0.5 rounded-full font-semibold tracking-wider uppercase">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-rs-blue-fusion/70 font-medium truncate mt-0.5">
                    {talent?.primary_role || 'Role not set'}
                    {talent?.department && ` · ${DEPARTMENT_LABELS[talent.department as Department]}`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
