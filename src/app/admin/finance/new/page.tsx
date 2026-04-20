import { InvoiceForm } from '../InvoiceForm'
import { createInvoice } from '../actions'

export const dynamic = 'force-dynamic'

export default function AdminNewInvoicePage({
  searchParams,
}: {
  searchParams: { client?: string; job?: string }
}) {
  const clientId = searchParams.client ?? null
  const jobId = searchParams.job ?? null
  return (
    <InvoiceForm
      mode="new"
      initial={{
        client_id: clientId,
        job_id: jobId,
      }}
      action={createInvoice}
      preselectedJobId={jobId}
    />
  )
}
