
CREATE TABLE IF NOT EXISTS public.backtest_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  company_number text,
  outcome_type text NOT NULL DEFAULT 'insolvency',
  outcome_date date NOT NULL,
  source text NOT NULL DEFAULT 'the_gazette',
  notes text,
  signals_computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_name, outcome_type, outcome_date)
);
GRANT SELECT ON public.backtest_cases TO anon, authenticated;
GRANT ALL ON public.backtest_cases TO service_role;
ALTER TABLE public.backtest_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read backtest cases" ON public.backtest_cases FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.backtest_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.backtest_cases(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('charge_registered','insolvency_filing','officer_resignation','news_mention')),
  signal_date date NOT NULL,
  detail text,
  lead_days int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backtest_signals_case_idx ON public.backtest_signals(case_id);
GRANT SELECT ON public.backtest_signals TO anon, authenticated;
GRANT ALL ON public.backtest_signals TO service_role;
ALTER TABLE public.backtest_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read backtest signals" ON public.backtest_signals FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  cases_total int,
  cases_with_signal int,
  median_lead_days numeric,
  signal_type_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.backtest_runs TO anon, authenticated;
GRANT ALL ON public.backtest_runs TO service_role;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read backtest runs" ON public.backtest_runs FOR SELECT USING (true);
