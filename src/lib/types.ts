export type UserRole = 'talent' | 'client' | 'admin'
export type Department = 'camera' | 'styling' | 'glam' | 'post' | 'production' | 'direction' | 'other'
export type AvailabilityStatus = 'available' | 'hold' | 'unavailable'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed'
export type JobStatus = 'draft' | 'submitted' | 'crewing' | 'confirmed' | 'wrapped' | 'cancelled'

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

export const DEPARTMENT_LABELS: Record<Department, string> = {
  camera: 'Camera',
  styling: 'Styling',
  glam: 'Glam',
  post: 'Post',
  production: 'Production',
  direction: 'Direction',
  other: 'Other',
}
