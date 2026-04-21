import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <Skeleton className="h-6 w-32 mb-2" />
      <Skeleton className="h-3 w-24 mb-5" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="w-16 h-16 rounded-full" />
        ))}
      </div>
    </main>
  )
}
