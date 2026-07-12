UPDATE public.backtest_signals
SET in_window = (lead_days <= 730)
WHERE in_window IS DISTINCT FROM (lead_days <= 730);