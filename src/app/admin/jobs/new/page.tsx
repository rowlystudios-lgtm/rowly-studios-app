import { JobForm } from '../JobForm'
import { createJob } from '../actions'

export const dynamic = 'force-dynamic'

export default function AdminNewJobPage() {
  return <JobForm mode="new" initial={{}} action={createJob} />
}
