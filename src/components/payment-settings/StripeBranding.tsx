/**
 * Stripe brand components — used inside the payment-settings panels.
 * Wordmark and color usage follow Stripe's brand asset guidelines:
 * https://stripe.com/newsroom/brand-assets
 *
 * Stripe Indigo (Blurple): #635BFF
 */

export const STRIPE_INDIGO = '#635BFF';

/**
 * Stripe wordmark, official path data. Renders crisp at any size.
 * Default size 48x20 (matches Stripe's docs examples).
 */
export function StripeWordmark({
  height = 20,
  className,
  fill = 'currentColor',
}: { height?: number; className?: string; fill?: string }) {
  return (
    <svg
      role="img"
      aria-label="Stripe"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 25"
      height={height}
      width={(60 / 25) * height}
      className={className}
    >
      <title>Stripe</title>
      <path
        fill={fill}
        d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.62l.21 1.07a4.46 4.46 0 0 1 3.3-1.32c2.96 0 5.74 2.66 5.74 7.4 0 5.17-2.74 7.58-5.83 7.58zM40 9.4c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.4h-3.13v5.54zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z"
      />
    </svg>
  );
}

/**
 * Small "powered by Stripe" lockup — fits inside a footer line.
 * Uses muted color so it doesn't fight with the panel content.
 */
export function PoweredByStripe({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-stone-500 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>Powered by</span>
      <StripeWordmark height={11} fill="currentColor" />
    </span>
  );
}

/**
 * Stripe-branded primary CTA button. Use Stripe Indigo background per their
 * Connect onboarding examples. Renders consistently in light + dark.
 */
export function StripeBrandedButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: STRIPE_INDIGO }}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
