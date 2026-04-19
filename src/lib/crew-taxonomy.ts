// ─── Master taxonomy ──────────────────────────────────────────
// department: top-level category (stored in talent_profiles.department)
// roles: specific sub-roles (stored in talent_profiles.primary_role)
// Used in: talent profile edit, roster filters, post-job crew chips,
//          job booking summaries, admin crew assignment.

export type DepartmentKey =
  | 'photography'
  | 'video'
  | 'styling'
  | 'glam'
  | 'art_direction'
  | 'production'
  | 'lighting'
  | 'post'
  | 'sound'
  | 'other'

export type DepartmentDef = {
  key: DepartmentKey
  label: string          // Short label for chips/badges
  fullLabel: string      // Full label for dropdowns
  roles: string[]        // Selectable sub-roles (primary_role values)
  crewLabel: string      // Label used on post-job crew selector
}

export const DEPARTMENTS: DepartmentDef[] = [
  {
    key: 'photography',
    label: 'Photography',
    fullLabel: 'Camera / Photography',
    crewLabel: 'Camera / Photography',
    roles: [
      'Photographer',
      'DP (Director of Photography)',
      'Camera Operator',
      '1st AC (Focus Puller)',
      '2nd AC (Loader)',
      'Stills Photographer',
      'Unit Photographer',
    ],
  },
  {
    key: 'video',
    label: 'Video',
    fullLabel: 'Video / Motion',
    crewLabel: 'Video / DP',
    roles: [
      'DP / Cinematographer',
      'Director',
      'Camera Operator',
      'Drone Operator / Pilot',
      'Steadicam Operator',
      'Video Editor',
      'Videographer',
    ],
  },
  {
    key: 'styling',
    label: 'Styling',
    fullLabel: 'Styling',
    crewLabel: 'Styling',
    roles: [
      'Fashion Stylist',
      'Wardrobe Stylist',
      'Prop Stylist',
      'Set Stylist / Decorator',
      'Stylist Assistant',
    ],
  },
  {
    key: 'glam',
    label: 'Hair & MUA',
    fullLabel: 'Hair & Makeup',
    crewLabel: 'Hair & Makeup',
    roles: [
      'Makeup Artist',
      'Hair Stylist',
      'Hair & Makeup Artist',
      'SFX Makeup Artist',
      'Nail Artist',
      'Groomer',
    ],
  },
  {
    key: 'art_direction',
    label: 'Art Direction',
    fullLabel: 'Art Direction',
    crewLabel: 'Art Direction',
    roles: [
      'Art Director',
      'Creative Director',
      'Production Designer',
      'Set Designer',
      'Graphic Designer',
      'Brand Designer',
    ],
  },
  {
    key: 'production',
    label: 'Production',
    fullLabel: 'Production Management',
    crewLabel: 'Production Manager',
    roles: [
      'Producer',
      'Production Manager',
      'Production Coordinator',
      'Line Producer',
      'Production Assistant (PA)',
      'Runner',
    ],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    fullLabel: 'Lighting / Grip',
    crewLabel: 'Lighting / Gaffer',
    roles: [
      'Gaffer',
      'Best Boy Electric',
      'Electrician',
      'Key Grip',
      'Grip',
      'Lighting Technician',
      'Rigging Gaffer',
    ],
  },
  {
    key: 'post',
    label: 'Post',
    fullLabel: 'Post Production',
    crewLabel: 'Edit & Post',
    roles: [
      'Video Editor',
      'Photo Retoucher / Retoucher',
      'Colorist',
      'Motion Designer',
      'VFX Artist',
      'Sound Designer',
      'Post Supervisor',
    ],
  },
  {
    key: 'sound',
    label: 'Sound',
    fullLabel: 'Sound',
    crewLabel: 'Sound',
    roles: [
      'Sound Recordist',
      'Boom Operator',
      'Sound Designer',
      'Music Supervisor',
      'Dialogue Editor',
    ],
  },
  {
    key: 'other',
    label: 'Other',
    fullLabel: 'Other',
    crewLabel: 'Other',
    roles: [
      'Talent / Model',
      'Brand Ambassador',
      'Influencer',
      'Host / Presenter',
      'Chef / Food Stylist',
      'Other',
    ],
  },
]

// Helper: get a department def by key
export function getDepartment(key: string): DepartmentDef | undefined {
  return DEPARTMENTS.find((d) => d.key === key)
}

// Helper: get display label for a department key
export function deptLabel(key: string): string {
  return getDepartment(key)?.label ?? key
}

// Helper: get roles for a department key
export function deptRoles(key: string): string[] {
  return getDepartment(key)?.roles ?? []
}

// CREW_OPTIONS for post-job form — replaces old src/lib/jobs.ts CREW_OPTIONS.
export const CREW_OPTIONS: Array<{ key: string; label: string }> = DEPARTMENTS
  .filter((d) => d.key !== 'other')
  .map((d) => ({ key: d.key, label: d.crewLabel }))
