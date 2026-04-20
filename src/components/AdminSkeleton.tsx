// Plain server component skeleton blocks used by each admin loading.tsx.
// Uses `animate-pulse` from Tailwind; no client-side JS required.

export function AdminPageSkeleton({
  title = 'Loading',
  rowCount = 4,
}: {
  title?: string
  rowCount?: number
}) {
  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <div className="flex items-center justify-between gap-3">
        <div
          className="rounded-md bg-[#1A2E4A] animate-pulse"
          style={{ height: 22, width: 120 }}
        />
        <div
          className="rounded-lg bg-[#1A2E4A] animate-pulse"
          style={{ height: 32, width: 120 }}
        />
      </div>

      {/* Big header card */}
      <div
        className="mt-4 rounded-xl bg-[#1A2E4A] animate-pulse"
        style={{ height: 120, border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="sr-only">{title}…</span>
      </div>

      {/* Stat strip */}
      <div
        className="mt-4 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-[#1A2E4A] animate-pulse"
            style={{ height: 82 }}
          />
        ))}
      </div>

      {/* Row skeletons */}
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-[#1A2E4A] animate-pulse"
            style={{ height: 76 }}
          />
        ))}
      </div>
    </div>
  )
}
