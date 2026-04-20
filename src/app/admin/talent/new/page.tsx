import { TalentForm } from '../TalentForm'
import { createTalentProfile } from '../actions'

export const dynamic = 'force-dynamic'

export default function AdminNewTalentPage() {
  return <TalentForm mode="new" initial={{ verified: true }} action={createTalentProfile} />
}
