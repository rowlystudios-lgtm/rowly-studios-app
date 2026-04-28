'use client'

interface RateFloorSliderProps {
  value: number
  onChange: (cents: number) => void
  disabled?: boolean
}

const MIN = 300
const MAX = 1500
const STEP = 25

export default function RateFloorSlider({ value, onChange, disabled }: RateFloorSliderProps) {
  const dollars = Math.round(value / 100)
  const clamped = Math.min(Math.max(dollars, MIN), MAX)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Rate floor</span>
        <span className="font-semibold tabular-nums text-white">
          ${clamped.toLocaleString()}/day
        </span>
      </div>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={clamped}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) * 100)}
        className="w-full accent-[#2a72e8]"
      />
      <div className="flex justify-between text-xs text-white/40">
        <span>$300</span>
        <span>$1,500</span>
      </div>
      <p className="text-xs text-white/50 leading-relaxed">
        Your rate floor is the minimum day rate you&apos;ll accept for a
        booking. Clients can only make offers at or above this amount. You
        can update it any time from your profile.
      </p>
    </div>
  )
}
