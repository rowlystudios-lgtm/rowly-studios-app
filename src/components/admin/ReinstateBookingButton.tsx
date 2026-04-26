'use client';

import { useState } from 'react';

type Props = {
  bookingId: string;
  /** Display info shown in the confirmation prompt. */
  talentName?: string;
  jobTitle?: string;
  /** Called after a successful reinstate so parent can refresh the list. */
  onReinstated?: (status: 'confirmed' | 'pending_stripe', message: string) => void;
  /** Tailwind size variant. */
  size?: 'sm' | 'md';
};

/**
 * ReinstateBookingButton
 *
 * Drop-in admin button for cancelled/auto_released/declined bookings.
 * Calls /api/admin/bookings/[id]/reinstate which delegates to the
 * reinstate_booking() Postgres helper.
 *
 * Three outcomes are surfaced in the UI:
 *   1. Talent Stripe-active        → toast "Booking confirmed"
 *   2. Talent NOT Stripe-active    → toast "Pending Stripe (Xh grace)"
 *   3. Job too imminent + not active → red error "Talent must already be Stripe-active"
 *
 * Mount on the admin's job detail or finance view next to any booking
 * row that's cancelled/auto_released/declined.
 */
export default function ReinstateBookingButton({
  bookingId,
  talentName,
  jobTitle,
  onReinstated,
  size = 'sm',
}: Props) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reinstate = async () => {
    const promptText =
      `Reinstate ${talentName ?? 'this talent'}` +
      (jobTitle ? ` on "${jobTitle}"` : '') + '?\n\n' +
      'If they have an active Stripe account, the booking will be confirmed immediately.\n' +
      'If not, they enter a grace period to complete Stripe setup.\n\n' +
      'Note: bookings cannot be reinstated within 2 hours of the job if the talent is not already Stripe-active.';

    if (!confirm(promptText)) return;

    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/reinstate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Failed to reinstate booking');
      }
      setDone(true);
      onReinstated?.(data.status, data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs'
      : 'px-3 py-1.5 text-sm';

  if (done) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-emerald-50 ${sizeClasses} font-medium text-emerald-800`}>
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        Reinstated
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={reinstate}
        disabled={acting}
        className={`inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white ${sizeClasses} font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {acting ? 'Reinstating…' : 'Reinstate booking'}
      </button>
      {error && (
        <span className="max-w-xs text-right text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
