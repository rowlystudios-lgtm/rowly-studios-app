import type { Metadata } from 'next'
import FinancePageServer from './FinancePageServer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Finance — RS Admin',
}

export default function AdminFinancePage() {
  return <FinancePageServer />
}
