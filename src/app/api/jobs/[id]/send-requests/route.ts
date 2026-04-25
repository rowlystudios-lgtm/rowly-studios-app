import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { checkClientCanSendRequests } from '@/lib/stripe/gate';

/**
 * GET /api/jobs/[id]/send-requests
 *
 * Pre-flight check before the client submits talent requests for a job.
 * Returns 200 { ok: true } if they can proceed, or 403 with a structured
 * blocked response if they need to add a payment method first.
 *
 * The actual "send requests" action (creating booking rows) lives in
 * existing app code. Wrap your existing handler with a call to
 * checkClientCanSendRequests() OR have the client UI hit this endpoint
 * before showing the "Send" button as enabled.
 *
 * NOTE: This is GET because it's purely a state check. The mutating
 * action (creating bookings) happens in your existing code path.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['client', 'admin']);
    const { id: jobId } = params;

    // Verify the client owns this job (or the user is admin)
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, client_id, title, start_date')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (profile.role === 'client' && job.client_id !== profile.id) {
      return NextResponse.json({ error: 'Not your job' }, { status: 403 });
    }

    const clientIdToCheck = profile.role === 'admin' ? job.client_id : profile.id;
    const result = await checkClientCanSendRequests(supabase, clientIdToCheck);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          message: result.message,
          actionUrl: result.actionUrl,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
