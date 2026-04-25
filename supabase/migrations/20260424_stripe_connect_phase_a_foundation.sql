-- =================================================================
-- 20260424_stripe_connect_phase_a_foundation.sql
-- Already applied to project vmsgainaazabertluxbo on 2026-04-24
-- via Supabase MCP. Keep this file in version control as the
-- canonical record of the migration.
-- =================================================================

-- 1. TALENT PROFILES: Connect Express account linkage
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_account_type text DEFAULT 'express',
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_account_status text DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS stripe_onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_requirements_due jsonb,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.talent_profiles
    ADD CONSTRAINT talent_profiles_stripe_account_type_check
    CHECK (stripe_account_type IN ('express','standard','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.talent_profiles
    ADD CONSTRAINT talent_profiles_stripe_account_status_check
    CHECK (stripe_account_status IN ('not_connected','pending','active','restricted','rejected','disabled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_stripe_account_id
  ON public.talent_profiles(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;


-- 2. CLIENT PROFILES: Stripe Customer + default payment method
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_type text,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_brand text,
  ADD COLUMN IF NOT EXISTS stripe_payment_setup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.client_profiles
    ADD CONSTRAINT client_profiles_stripe_pm_type_check
    CHECK (stripe_default_payment_method_type IS NULL
        OR stripe_default_payment_method_type IN ('us_bank_account','card'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_profiles_stripe_customer_id
  ON public.client_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- 3. INVOICES: Stripe payment tracking
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_type text,
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_processing_fee_passed_to_client boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS stripe_charged_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_cents integer DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_stripe_pm_type_check
    CHECK (stripe_payment_method_type IS NULL
        OR stripe_payment_method_type IN ('us_bank_account','card'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent
  ON public.invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;


-- 4. TALENT PAYMENTS: link to Stripe transfers
ALTER TABLE public.talent_payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_destination_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_status text;

DO $$ BEGIN
  ALTER TABLE public.talent_payments
    ADD CONSTRAINT talent_payments_stripe_status_check
    CHECK (stripe_status IS NULL
        OR stripe_status IN ('pending','in_transit','paid','failed','reversed','reversed_partial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 5. STRIPE EVENTS: webhook idempotency + audit log
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  api_version text,
  livemode boolean,
  payload jsonb NOT NULL,
  related_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  related_talent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_stripe_account_id text,
  processed_at timestamptz,
  processing_error text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_type ON public.stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_unprocessed
  ON public.stripe_events(created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_events_invoice ON public.stripe_events(related_invoice_id);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin can view all stripe events"
    ON public.stripe_events FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 6. ADMIN SETTINGS: platform-level Stripe config
INSERT INTO public.admin_settings (key, value)
VALUES
  ('stripe_platform_account_id', 'acct_1TGnqyLNIWZQuUOv'),
  ('stripe_fee_pass_through_default', 'true'),
  ('stripe_preferred_payment_method', 'us_bank_account'),
  ('stripe_ach_fee_bps', '80'),
  ('stripe_ach_fee_cap_cents', '500'),
  ('stripe_card_fee_bps', '290'),
  ('stripe_card_fee_fixed_cents', '30'),
  ('stripe_talent_transfer_hold_days', '5'),
  ('stripe_webhook_signing_secret_set', 'false')
ON CONFLICT (key) DO NOTHING;


-- 7. COMMENTS
COMMENT ON COLUMN public.talent_profiles.stripe_account_id IS
  'Stripe Connect Express account ID (acct_...). Created when talent connects in Payment Settings.';
COMMENT ON COLUMN public.talent_profiles.stripe_account_status IS
  'Lifecycle: not_connected -> pending (link sent) -> active (charges+payouts enabled) | restricted | rejected';
COMMENT ON COLUMN public.client_profiles.stripe_customer_id IS
  'Stripe Customer ID (cus_...). Created when client adds first payment method.';
COMMENT ON COLUMN public.invoices.stripe_application_fee_cents IS
  'Rowly Studios platform fee (15%) locked via Stripe application_fee_amount on the PaymentIntent.';
COMMENT ON COLUMN public.invoices.stripe_processing_fee_cents IS
  'Stripe processing fee charged on this invoice. Passed to client when stripe_processing_fee_passed_to_client = true.';
COMMENT ON TABLE public.stripe_events IS
  'Idempotency log for Stripe webhooks. Each Stripe event_id is recorded once; processed_at marks successful handler completion.';
