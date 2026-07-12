
ALTER TABLE public.backtest_signals ADD COLUMN IF NOT EXISTS in_window boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS backtest_signals_in_window_idx ON public.backtest_signals(case_id) WHERE in_window;

ALTER TABLE public.backtest_runs ADD COLUMN IF NOT EXISTS window_days integer;
ALTER TABLE public.backtest_runs ADD COLUMN IF NOT EXISTS cases_processed integer;
ALTER TABLE public.backtest_runs ADD COLUMN IF NOT EXISTS cases_imported integer;
