export function RSLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 504 504"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Rowly Studios"
    >
      <circle cx="252" cy="252" r="222" fill="#E8EAED" stroke="#1E3A6B" strokeWidth="36" />
      <text
        x="252"
        y="332"
        fontFamily="Montserrat, sans-serif"
        fontWeight="700"
        fontSize="220"
        fill="#1E3A6B"
        textAnchor="middle"
      >
        RS
      </text>
    </svg>
  )
}
