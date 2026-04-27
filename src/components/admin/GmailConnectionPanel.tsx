'use client';

import { useEffect, useState } from 'react';

type GmailStatus = {
  connected: boolean;
  googleEmail?: string;
  connectedAt?: string;
  lastUsedAt?: string;
};

/**
 * GmailConnectionPanel — drop in on the admin profile page.
 *
 * - If not connected: shows a "Connect Gmail" button → /api/auth/google/start
 * - If connected: shows "Connected as <email>" + "Disconnect" button
 *
 * Reads ?gmail_connected=1 / ?gmail_error=... from URL on mount and surfaces
 * a transient banner.
 */
export default function GmailConnectionPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Surface OAuth callback result from URL
    const url = new URL(window.location.href);
    if (url.searchParams.get('gmail_connected') === '1') {
      setBanner({ kind: 'success', text: 'Gmail connected successfully.' });
      url.searchParams.delete('gmail_connected');
      window.history.replaceState({}, '', url.toString());
    }
    const err = url.searchParams.get('gmail_error');
    if (err) {
      setBanner({ kind: 'error', text: `Gmail connection failed: ${err}` });
      url.searchParams.delete('gmail_error');
      window.history.replaceState({}, '', url.toString());
    }
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      if (data.ok) {
        setStatus({
          connected: data.connected,
          googleEmail: data.googleEmail,
          connectedAt: data.connectedAt,
          lastUsedAt: data.lastUsedAt,
        });
      } else {
        setStatus({ connected: false });
      }
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Gmail? You will need to reconnect to send invoice drafts.')) {
      return;
    }
    setBusy(true);
    try {
      await fetch('/api/auth/google/status', { method: 'DELETE' });
      setBanner({ kind: 'success', text: 'Gmail disconnected.' });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setBanner({ kind: 'error', text: `Disconnect failed: ${msg}` });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/50">
        Loading Gmail connection…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
        Gmail Integration
      </div>
      <div className="text-sm text-white/80">
        Used to create invoice drafts in your Gmail inbox before sending to clients.
      </div>

      {banner && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            banner.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {status?.connected ? (
          <>
            <div>
              <div className="text-sm text-white">
                Connected as <span className="font-medium">{status.googleEmail}</span>
              </div>
              {status.lastUsedAt && (
                <div className="mt-0.5 text-[11px] text-white/40">
                  Last used: {new Date(status.lastUsedAt).toLocaleString()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <>
            <div className="text-sm text-white/60">Not connected</div>
            <a
              href="/api/auth/google/start"
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-white/90"
            >
              Connect Gmail
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
