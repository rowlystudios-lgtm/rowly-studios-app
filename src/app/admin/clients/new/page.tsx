import { ClientForm } from '../ClientForm'
import { createClientProfile } from '../actions'

export const dynamic = 'force-dynamic'

export default function AdminNewClientPage() {
  return (
    <ClientForm
      mode="new"
      initial={{ verified: true }}
      action={createClientProfile}
    />
  )
}
