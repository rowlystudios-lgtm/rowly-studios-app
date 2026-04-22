import { DEPARTMENTS, type DepartmentKey } from '@/lib/crew-taxonomy'

export type UserRole = 'talent' | 'client' | 'admin'
// Department is an alias for DepartmentKey — the single source of truth is
// src/lib/crew-taxonomy.ts. Imports from '@/lib/types' keep working.
export type Department = DepartmentKey
export type AvailabilityStatus = 'available' | 'hold' | 'unavailable'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed'
export type JobStatus = 'draft' | 'submitted' | 'crewing' | 'confirmed' | 'wrapped' | 'cancelled'

export type ViewMode = 'talent' | 'admin' | 'client'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  role: UserRole
  phone: string | null
  city: string | null
  avatar_url: string | null
  verified: boolean
  verified_at: string | null
  available: boolean
  last_view_mode: ViewMode | null
  pin_verified_at: string | null
  share_code: string | null
  onboarded: boolean | null
  account_status: 'active' | 'paused' | 'deleted' | null
  paused_at: string | null
  paused_by: string | null
  paused_reason: string | null
  created_at: string
  updated_at: string
}

export type TalentProfile = {
  id: string
  department: Department | null
  primary_role: string | null
  secondary_roles: string[] | null
  bio: string | null
  day_rate_cents: number | null
  half_day_rate_cents: number | null
  rate_floor_cents: number | null
  showreel_url: string | null
  equipment: string | null
  union_eligible: boolean | null
  travel_radius_miles: number | null
  created_at: string
  updated_at: string
}

export const CITY_OPTIONS = [
  'Los Angeles',
  'New York',
  'Atlanta',
  'Austin',
  'Nashville',
  'Boston',
  'San Francisco',
  'Seattle',
] as const

export type City = (typeof CITY_OPTIONS)[number]

export type Availability = {
  id: string
  talent_id: string
  date: string
  status: AvailabilityStatus
  note: string | null
  created_at: string
}

// Computed from the taxonomy so there's one source of truth.
// Widened to Record<string, string> so legacy DB values (e.g. 'camera',
// 'direction') still render a label instead of undefined.
export const DEPARTMENT_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.key, d.label])
)
