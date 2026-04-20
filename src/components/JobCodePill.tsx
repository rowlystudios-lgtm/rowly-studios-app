/**
 * Small monospaced pill displaying a job's reference code. Muted by default,
 * optional `prominent` + `label` props for detail-page headers.
 */
type Props = {
  code: string | null | undefined
  /** e.g. "Job" or "Ref" — defaults to "#" */
  label?: string
  /** Larger/lighter for detail headers. */
  prominent?: boolean
  /** Lean colour palette for cream/light surfaces. */
  variant?: 'dark' | 'cream'
}

export function JobCodePill({
  code,
  label,
  prominent = false,
  variant = 'dark',
}: Props) {
  if (!code) return null
  const prefix = label ? `${label}` : '#'
  const darkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: prominent ? 12 : 10,
    color: '#7A90AA',
    background: '#0F1B2E',
    padding: prominent ? '4px 10px' : '2px 8px',
    borderRadius: 999,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }
  const creamStyle: React.CSSProperties = {
    ...darkStyle,
    color: '#496275',
    background: 'rgba(26,60,107,0.08)',
  }
  return (
    <span style={variant === 'cream' ? creamStyle : darkStyle}>
      <span style={{ opacity: 0.65 }}>{prefix}</span>
      <span>{code}</span>
    </span>
  )
}
