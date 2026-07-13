CREATE TABLE public.source_lean (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  outlet_name text NOT NULL,
  lean text NOT NULL CHECK (lean IN ('left','lean_left','center','lean_right','right','mixed')),
  lean_label text NOT NULL,
  lean_source text NOT NULL DEFAULT 'AllSides',
  reviewed boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.source_lean TO anon, authenticated;
GRANT ALL ON public.source_lean TO service_role;

ALTER TABLE public.source_lean ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read source lean"
  ON public.source_lean FOR SELECT
  USING (true);

CREATE TRIGGER source_lean_set_updated_at
  BEFORE UPDATE ON public.source_lean
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.source_lean (domain, outlet_name, lean, lean_label, lean_source) VALUES
  ('bbc.co.uk','BBC News','center','Center','AllSides'),
  ('sky.com','Sky News','center','Center','AllSides'),
  ('theguardian.com','The Guardian','left','Left','AllSides'),
  ('independent.co.uk','The Independent','lean_left','Lean left','AllSides'),
  ('mirror.co.uk','The Mirror','left','Left','AllSides'),
  ('ft.com','Financial Times','center','Center','AllSides'),
  ('economist.com','The Economist','center','Center','AllSides'),
  ('thetimes.co.uk','The Times (UK)','lean_right','Lean right','AllSides'),
  ('telegraph.co.uk','The Telegraph','lean_right','Lean right','AllSides'),
  ('dailymail.co.uk','Daily Mail','right','Right','AllSides'),
  ('thesun.co.uk','The Sun','right','Right','AllSides'),
  ('spectator.co.uk','The Spectator','right','Right','AllSides'),
  ('reuters.com','Reuters','center','Center','AllSides'),
  ('apnews.com','Associated Press','center','Center','AllSides'),
  ('npr.org','NPR','lean_left','Lean left','AllSides'),
  ('nytimes.com','The New York Times','lean_left','Lean left','AllSides'),
  ('washingtonpost.com','The Washington Post','lean_left','Lean left','AllSides'),
  ('cnn.com','CNN','lean_left','Lean left','AllSides'),
  ('abcnews.com','ABC News','lean_left','Lean left','AllSides'),
  ('cbsnews.com','CBS News','lean_left','Lean left','AllSides'),
  ('nbcnews.com','NBC News','lean_left','Lean left','AllSides'),
  ('politico.com','Politico','center','Center','AllSides'),
  ('bloomberg.com','Bloomberg','center','Center','AllSides'),
  ('cnbc.com','CNBC','center','Center','AllSides'),
  ('wsj.com','The Wall Street Journal','center','Center','AllSides'),
  ('foxnews.com','Fox News','right','Right','AllSides'),
  ('nypost.com','New York Post','right','Right','AllSides'),
  ('newsmax.com','Newsmax','right','Right','AllSides'),
  ('breitbart.com','Breitbart','right','Right','AllSides'),
  ('aljazeera.com','Al Jazeera','mixed','Mixed / intl','AllSides'),
  ('dw.com','Deutsche Welle','center','Center','AllSides'),
  ('france24.com','France 24','center','Center','AllSides'),
  ('afp.com','AFP','center','Center','AllSides')
ON CONFLICT (domain) DO NOTHING;