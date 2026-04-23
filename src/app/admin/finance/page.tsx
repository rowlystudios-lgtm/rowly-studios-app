import { FinancePageServer } from './FinancePageServer'

export const dynamic = 'force-dynamic'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { month?: string; quarter?: string }
}) {
  return <FinancePageServer searchParams={searchParams} />
}
