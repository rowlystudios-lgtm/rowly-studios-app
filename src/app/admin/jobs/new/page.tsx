import { JobForm } from '../JobForm'
import { createJob } from '../actions'

export const dynamic = 'force-dynamic'

export default function AdminNewJobPage({
  searchParams,
}: {
  searchParams: { client?: string }
}) {
  const preselectedClient = searchParams.client ?? ''
  return (
    <JobForm
      mode="new"
      initial={{ client_id: preselectedClient || null }}
      action={createJob}
    />
  )
}
