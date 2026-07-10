
-- =============================================================
-- ENTITY RELATIONSHIPS (supplier / customer / competitor / peer)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('supplier','customer','competitor','peer','parent','subsidiary','joint_venture','regulator','counterparty')),
  weight NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  rationale TEXT,
  source_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_entity_id, to_entity_id, relationship_type)
);
GRANT SELECT ON public.entity_relationships TO authenticated, anon;
GRANT ALL ON public.entity_relationships TO service_role;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read entity relationships" ON public.entity_relationships FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS entity_relationships_from_idx ON public.entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS entity_relationships_to_idx ON public.entity_relationships(to_entity_id);

-- =============================================================
-- SCENARIO PROJECTIONS (per-event forward consequences)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.scenario_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id UUID NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL CHECK (horizon IN ('immediate','near','medium','strategic')),
  scenario_label TEXT NOT NULL,
  narrative TEXT NOT NULL,
  mechanism TEXT,
  probability NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (probability >= 0 AND probability <= 1),
  magnitude TEXT CHECK (magnitude IN ('minor','moderate','material','severe','systemic')),
  affected_companies TEXT[] NOT NULL DEFAULT '{}',
  affected_sectors TEXT[] NOT NULL DEFAULT '{}',
  affected_regions TEXT[] NOT NULL DEFAULT '{}',
  affected_cohorts TEXT[] NOT NULL DEFAULT '{}',
  leading_indicators TEXT[] NOT NULL DEFAULT '{}',
  contradicting_signals TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scenario_projections TO authenticated, anon;
GRANT ALL ON public.scenario_projections TO service_role;
ALTER TABLE public.scenario_projections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read scenarios" ON public.scenario_projections FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS scenarios_event_idx ON public.scenario_projections(event_candidate_id);

-- =============================================================
-- SOURCE RELIABILITY HISTORY (rolling per source)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.source_reliability_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  claims_seen INTEGER NOT NULL DEFAULT 0,
  claims_confirmed INTEGER NOT NULL DEFAULT 0,
  claims_contested INTEGER NOT NULL DEFAULT 0,
  claims_retracted INTEGER NOT NULL DEFAULT 0,
  copy_loop_rate NUMERIC(4,3) NOT NULL DEFAULT 0,
  originality_rate NUMERIC(4,3) NOT NULL DEFAULT 0,
  accuracy_score NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, window_start)
);
GRANT SELECT ON public.source_reliability_history TO authenticated, anon;
GRANT ALL ON public.source_reliability_history TO service_role;
ALTER TABLE public.source_reliability_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read source history" ON public.source_reliability_history FOR SELECT USING (true);

-- =============================================================
-- COMPANY EXPOSURE SNAPSHOTS (per-company rollup for deep page)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.company_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  ticker TEXT,
  sector TEXT,
  region TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  net_risk NUMERIC(4,3) NOT NULL DEFAULT 0,
  net_opportunity NUMERIC(4,3) NOT NULL DEFAULT 0,
  weighted_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  top_pathways TEXT[] NOT NULL DEFAULT '{}',
  top_scenarios TEXT[] NOT NULL DEFAULT '{}',
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_name)
);
GRANT SELECT ON public.company_exposures TO authenticated, anon;
GRANT ALL ON public.company_exposures TO service_role;
ALTER TABLE public.company_exposures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read company exposures" ON public.company_exposures FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS company_exposures_name_idx ON public.company_exposures(lower(company_name));

-- =============================================================
-- WEEKLY DIGEST snapshots (ranked feed of last N days)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.digest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  top_risks JSONB NOT NULL DEFAULT '[]',
  top_opportunities JSONB NOT NULL DEFAULT '[]',
  top_scenarios JSONB NOT NULL DEFAULT '[]',
  ranked_events JSONB NOT NULL DEFAULT '[]',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.digest_snapshots TO authenticated, anon;
GRANT ALL ON public.digest_snapshots TO service_role;
ALTER TABLE public.digest_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read digests" ON public.digest_snapshots FOR SELECT USING (true);

-- =============================================================
-- ENTITY seed: ~180 major global companies (S&P500/FTSE/Nikkei/Stoxx sample)
-- =============================================================
INSERT INTO public.entities (entity_type, canonical_name, aliases, ticker, sector, region, metadata) VALUES
-- US mega-cap tech
('company','Apple Inc.', ARRAY['Apple','AAPL'], 'AAPL', 'technology', 'US', '{"index":"S&P500","subsector":"consumer_electronics"}'),
('company','Microsoft Corporation', ARRAY['Microsoft','MSFT'], 'MSFT', 'technology', 'US', '{"index":"S&P500","subsector":"software"}'),
('company','Alphabet Inc.', ARRAY['Google','Alphabet','GOOGL','GOOG'], 'GOOGL', 'technology', 'US', '{"index":"S&P500","subsector":"internet"}'),
('company','Amazon.com Inc.', ARRAY['Amazon','AMZN'], 'AMZN', 'technology', 'US', '{"index":"S&P500","subsector":"ecommerce"}'),
('company','Meta Platforms Inc.', ARRAY['Meta','Facebook','META'], 'META', 'technology', 'US', '{"index":"S&P500","subsector":"internet"}'),
('company','NVIDIA Corporation', ARRAY['Nvidia','NVDA'], 'NVDA', 'semiconductors', 'US', '{"index":"S&P500","subsector":"gpu_ai"}'),
('company','Tesla Inc.', ARRAY['Tesla','TSLA'], 'TSLA', 'automotive', 'US', '{"index":"S&P500","subsector":"ev"}'),
('company','Broadcom Inc.', ARRAY['Broadcom','AVGO'], 'AVGO', 'semiconductors', 'US', '{"index":"S&P500"}'),
('company','Oracle Corporation', ARRAY['Oracle','ORCL'], 'ORCL', 'technology', 'US', '{"index":"S&P500"}'),
('company','Salesforce Inc.', ARRAY['Salesforce','CRM'], 'CRM', 'technology', 'US', '{"index":"S&P500"}'),
('company','Adobe Inc.', ARRAY['Adobe','ADBE'], 'ADBE', 'technology', 'US', '{"index":"S&P500"}'),
('company','Netflix Inc.', ARRAY['Netflix','NFLX'], 'NFLX', 'media', 'US', '{"index":"S&P500"}'),
('company','Advanced Micro Devices', ARRAY['AMD'], 'AMD', 'semiconductors', 'US', '{"index":"S&P500"}'),
('company','Intel Corporation', ARRAY['Intel','INTC'], 'INTC', 'semiconductors', 'US', '{"index":"S&P500"}'),
('company','Qualcomm Incorporated', ARRAY['Qualcomm','QCOM'], 'QCOM', 'semiconductors', 'US', '{"index":"S&P500"}'),
('company','Cisco Systems', ARRAY['Cisco','CSCO'], 'CSCO', 'technology', 'US', '{"index":"S&P500"}'),
('company','IBM', ARRAY['IBM','International Business Machines'], 'IBM', 'technology', 'US', '{"index":"S&P500"}'),
('company','Palantir Technologies', ARRAY['Palantir','PLTR'], 'PLTR', 'technology', 'US', '{"index":"S&P500","subsector":"defense_tech"}'),
-- US finance
('company','JPMorgan Chase', ARRAY['JPMorgan','JPM','Chase'], 'JPM', 'financials', 'US', '{"index":"S&P500"}'),
('company','Bank of America', ARRAY['BofA','BAC'], 'BAC', 'financials', 'US', '{"index":"S&P500"}'),
('company','Wells Fargo', ARRAY['Wells Fargo','WFC'], 'WFC', 'financials', 'US', '{"index":"S&P500"}'),
('company','Citigroup', ARRAY['Citi','Citigroup','C'], 'C', 'financials', 'US', '{"index":"S&P500"}'),
('company','Goldman Sachs', ARRAY['Goldman','GS'], 'GS', 'financials', 'US', '{"index":"S&P500"}'),
('company','Morgan Stanley', ARRAY['Morgan Stanley','MS'], 'MS', 'financials', 'US', '{"index":"S&P500"}'),
('company','BlackRock', ARRAY['BlackRock','BLK'], 'BLK', 'financials', 'US', '{"index":"S&P500"}'),
('company','Berkshire Hathaway', ARRAY['Berkshire','BRK.B'], 'BRK.B', 'financials', 'US', '{"index":"S&P500"}'),
('company','Visa Inc.', ARRAY['Visa','V'], 'V', 'financials', 'US', '{"index":"S&P500"}'),
('company','Mastercard', ARRAY['Mastercard','MA'], 'MA', 'financials', 'US', '{"index":"S&P500"}'),
('company','American Express', ARRAY['Amex','AXP'], 'AXP', 'financials', 'US', '{"index":"S&P500"}'),
-- US energy
('company','Exxon Mobil', ARRAY['Exxon','XOM'], 'XOM', 'energy', 'US', '{"index":"S&P500","subsector":"oil_gas"}'),
('company','Chevron Corporation', ARRAY['Chevron','CVX'], 'CVX', 'energy', 'US', '{"index":"S&P500","subsector":"oil_gas"}'),
('company','ConocoPhillips', ARRAY['ConocoPhillips','COP'], 'COP', 'energy', 'US', '{"index":"S&P500"}'),
('company','Occidental Petroleum', ARRAY['Occidental','OXY'], 'OXY', 'energy', 'US', '{"index":"S&P500"}'),
('company','Schlumberger', ARRAY['SLB','Schlumberger'], 'SLB', 'energy', 'US', '{"index":"S&P500"}'),
('company','NextEra Energy', ARRAY['NextEra','NEE'], 'NEE', 'utilities', 'US', '{"index":"S&P500"}'),
-- US defense / aerospace
('company','Lockheed Martin', ARRAY['Lockheed','LMT'], 'LMT', 'defense', 'US', '{"index":"S&P500"}'),
('company','RTX Corporation', ARRAY['Raytheon','RTX'], 'RTX', 'defense', 'US', '{"index":"S&P500"}'),
('company','Northrop Grumman', ARRAY['Northrop','NOC'], 'NOC', 'defense', 'US', '{"index":"S&P500"}'),
('company','General Dynamics', ARRAY['General Dynamics','GD'], 'GD', 'defense', 'US', '{"index":"S&P500"}'),
('company','Boeing Company', ARRAY['Boeing','BA'], 'BA', 'aerospace', 'US', '{"index":"S&P500"}'),
('company','L3Harris Technologies', ARRAY['L3Harris','LHX'], 'LHX', 'defense', 'US', '{"index":"S&P500"}'),
-- US pharma / healthcare
('company','Johnson & Johnson', ARRAY['J&J','JNJ'], 'JNJ', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','Pfizer Inc.', ARRAY['Pfizer','PFE'], 'PFE', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','Merck & Co.', ARRAY['Merck','MRK'], 'MRK', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','Eli Lilly', ARRAY['Lilly','LLY'], 'LLY', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','AbbVie', ARRAY['AbbVie','ABBV'], 'ABBV', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','UnitedHealth Group', ARRAY['UnitedHealth','UNH'], 'UNH', 'healthcare', 'US', '{"index":"S&P500"}'),
('company','Moderna', ARRAY['Moderna','MRNA'], 'MRNA', 'healthcare', 'US', '{"index":"S&P500"}'),
-- US consumer
('company','Walmart', ARRAY['Walmart','WMT'], 'WMT', 'consumer_staples', 'US', '{"index":"S&P500"}'),
('company','Costco', ARRAY['Costco','COST'], 'COST', 'consumer_staples', 'US', '{"index":"S&P500"}'),
('company','Procter & Gamble', ARRAY['P&G','PG'], 'PG', 'consumer_staples', 'US', '{"index":"S&P500"}'),
('company','Coca-Cola', ARRAY['Coca-Cola','Coke','KO'], 'KO', 'consumer_staples', 'US', '{"index":"S&P500"}'),
('company','PepsiCo', ARRAY['PepsiCo','Pepsi','PEP'], 'PEP', 'consumer_staples', 'US', '{"index":"S&P500"}'),
('company','McDonald''s', ARRAY['McDonalds','MCD'], 'MCD', 'consumer_discretionary', 'US', '{"index":"S&P500"}'),
('company','Nike', ARRAY['Nike','NKE'], 'NKE', 'consumer_discretionary', 'US', '{"index":"S&P500"}'),
-- US industrials/materials
('company','Caterpillar', ARRAY['Caterpillar','CAT'], 'CAT', 'industrials', 'US', '{"index":"S&P500"}'),
('company','Deere & Company', ARRAY['John Deere','DE'], 'DE', 'industrials', 'US', '{"index":"S&P500"}'),
('company','Honeywell', ARRAY['Honeywell','HON'], 'HON', 'industrials', 'US', '{"index":"S&P500"}'),
('company','General Electric', ARRAY['GE','General Electric'], 'GE', 'industrials', 'US', '{"index":"S&P500"}'),
('company','3M Company', ARRAY['3M','MMM'], 'MMM', 'industrials', 'US', '{"index":"S&P500"}'),
('company','Ford Motor Company', ARRAY['Ford','F'], 'F', 'automotive', 'US', '{"index":"S&P500"}'),
('company','General Motors', ARRAY['GM','General Motors'], 'GM', 'automotive', 'US', '{"index":"S&P500"}'),
-- UK FTSE
('company','HSBC Holdings', ARRAY['HSBC','HSBA'], 'HSBA.L', 'financials', 'UK', '{"index":"FTSE100"}'),
('company','Barclays', ARRAY['Barclays','BARC'], 'BARC.L', 'financials', 'UK', '{"index":"FTSE100"}'),
('company','Lloyds Banking Group', ARRAY['Lloyds','LLOY'], 'LLOY.L', 'financials', 'UK', '{"index":"FTSE100"}'),
('company','NatWest Group', ARRAY['NatWest','NWG'], 'NWG.L', 'financials', 'UK', '{"index":"FTSE100"}'),
('company','Prudential plc', ARRAY['Prudential','PRU'], 'PRU.L', 'financials', 'UK', '{"index":"FTSE100"}'),
('company','Shell plc', ARRAY['Shell','SHEL'], 'SHEL.L', 'energy', 'UK', '{"index":"FTSE100"}'),
('company','BP plc', ARRAY['BP','British Petroleum'], 'BP.L', 'energy', 'UK', '{"index":"FTSE100"}'),
('company','AstraZeneca', ARRAY['AstraZeneca','AZN'], 'AZN.L', 'healthcare', 'UK', '{"index":"FTSE100"}'),
('company','GSK plc', ARRAY['GSK','GlaxoSmithKline'], 'GSK.L', 'healthcare', 'UK', '{"index":"FTSE100"}'),
('company','Unilever plc', ARRAY['Unilever','ULVR'], 'ULVR.L', 'consumer_staples', 'UK', '{"index":"FTSE100"}'),
('company','Diageo plc', ARRAY['Diageo','DGE'], 'DGE.L', 'consumer_staples', 'UK', '{"index":"FTSE100"}'),
('company','Rio Tinto', ARRAY['Rio Tinto','RIO'], 'RIO.L', 'materials', 'UK', '{"index":"FTSE100","subsector":"mining"}'),
('company','Glencore', ARRAY['Glencore','GLEN'], 'GLEN.L', 'materials', 'UK', '{"index":"FTSE100","subsector":"mining"}'),
('company','Anglo American', ARRAY['Anglo American','AAL'], 'AAL.L', 'materials', 'UK', '{"index":"FTSE100","subsector":"mining"}'),
('company','BAE Systems', ARRAY['BAE','BAE Systems'], 'BA.L', 'defense', 'UK', '{"index":"FTSE100"}'),
('company','Rolls-Royce Holdings', ARRAY['Rolls-Royce','RR'], 'RR.L', 'aerospace', 'UK', '{"index":"FTSE100"}'),
('company','Vodafone Group', ARRAY['Vodafone','VOD'], 'VOD.L', 'telecommunications', 'UK', '{"index":"FTSE100"}'),
('company','BT Group', ARRAY['BT','British Telecom'], 'BT-A.L', 'telecommunications', 'UK', '{"index":"FTSE100"}'),
('company','Tesco plc', ARRAY['Tesco','TSCO'], 'TSCO.L', 'consumer_staples', 'UK', '{"index":"FTSE100"}'),
('company','Sainsbury''s', ARRAY['Sainsburys','SBRY'], 'SBRY.L', 'consumer_staples', 'UK', '{"index":"FTSE100"}'),
-- Europe (Euro Stoxx-ish)
('company','ASML Holding', ARRAY['ASML'], 'ASML.AS', 'semiconductors', 'EU', '{"index":"EuroStoxx"}'),
('company','SAP SE', ARRAY['SAP'], 'SAP.DE', 'technology', 'EU', '{"index":"EuroStoxx"}'),
('company','Siemens AG', ARRAY['Siemens','SIE'], 'SIE.DE', 'industrials', 'EU', '{"index":"EuroStoxx"}'),
('company','Volkswagen AG', ARRAY['Volkswagen','VW','VOW'], 'VOW3.DE', 'automotive', 'EU', '{"index":"EuroStoxx"}'),
('company','BMW AG', ARRAY['BMW'], 'BMW.DE', 'automotive', 'EU', '{"index":"EuroStoxx"}'),
('company','Mercedes-Benz Group', ARRAY['Mercedes','Daimler','MBG'], 'MBG.DE', 'automotive', 'EU', '{"index":"EuroStoxx"}'),
('company','LVMH', ARRAY['LVMH','Louis Vuitton'], 'MC.PA', 'consumer_discretionary', 'EU', '{"index":"EuroStoxx"}'),
('company','TotalEnergies', ARRAY['Total','TotalEnergies','TTE'], 'TTE.PA', 'energy', 'EU', '{"index":"EuroStoxx"}'),
('company','Airbus SE', ARRAY['Airbus','AIR'], 'AIR.PA', 'aerospace', 'EU', '{"index":"EuroStoxx"}'),
('company','Novartis AG', ARRAY['Novartis','NOVN'], 'NOVN.SW', 'healthcare', 'EU', '{"index":"EuroStoxx"}'),
('company','Roche Holding', ARRAY['Roche','ROG'], 'ROG.SW', 'healthcare', 'EU', '{"index":"EuroStoxx"}'),
('company','Nestlé SA', ARRAY['Nestle','NESN'], 'NESN.SW', 'consumer_staples', 'EU', '{"index":"EuroStoxx"}'),
('company','BNP Paribas', ARRAY['BNP','BNP Paribas'], 'BNP.PA', 'financials', 'EU', '{"index":"EuroStoxx"}'),
('company','Deutsche Bank', ARRAY['Deutsche Bank','DBK'], 'DBK.DE', 'financials', 'EU', '{"index":"EuroStoxx"}'),
('company','ING Group', ARRAY['ING'], 'INGA.AS', 'financials', 'EU', '{"index":"EuroStoxx"}'),
('company','Santander', ARRAY['Santander','SAN'], 'SAN.MC', 'financials', 'EU', '{"index":"EuroStoxx"}'),
('company','Rheinmetall AG', ARRAY['Rheinmetall','RHM'], 'RHM.DE', 'defense', 'EU', '{"index":"EuroStoxx"}'),
('company','Thales Group', ARRAY['Thales','HO'], 'HO.PA', 'defense', 'EU', '{"index":"EuroStoxx"}'),
('company','Leonardo S.p.A.', ARRAY['Leonardo','LDO'], 'LDO.MI', 'defense', 'EU', '{"index":"EuroStoxx"}'),
-- Asia — Japan Nikkei
('company','Toyota Motor', ARRAY['Toyota','7203'], '7203.T', 'automotive', 'JP', '{"index":"Nikkei225"}'),
('company','Sony Group', ARRAY['Sony','6758'], '6758.T', 'technology', 'JP', '{"index":"Nikkei225"}'),
('company','SoftBank Group', ARRAY['SoftBank','9984'], '9984.T', 'technology', 'JP', '{"index":"Nikkei225"}'),
('company','Nintendo', ARRAY['Nintendo','7974'], '7974.T', 'consumer_discretionary', 'JP', '{"index":"Nikkei225"}'),
('company','Honda Motor', ARRAY['Honda','7267'], '7267.T', 'automotive', 'JP', '{"index":"Nikkei225"}'),
('company','Mitsubishi Corporation', ARRAY['Mitsubishi','8058'], '8058.T', 'industrials', 'JP', '{"index":"Nikkei225"}'),
('company','Mitsubishi UFJ', ARRAY['MUFG','8306'], '8306.T', 'financials', 'JP', '{"index":"Nikkei225"}'),
('company','Tokyo Electron', ARRAY['Tokyo Electron','8035'], '8035.T', 'semiconductors', 'JP', '{"index":"Nikkei225"}'),
('company','Fast Retailing', ARRAY['Uniqlo','Fast Retailing','9983'], '9983.T', 'consumer_discretionary', 'JP', '{"index":"Nikkei225"}'),
-- Asia — Korea / Taiwan / China / HK
('company','Samsung Electronics', ARRAY['Samsung','005930'], '005930.KS', 'semiconductors', 'KR', '{"index":"KOSPI"}'),
('company','SK Hynix', ARRAY['Hynix','SK Hynix','000660'], '000660.KS', 'semiconductors', 'KR', '{"index":"KOSPI"}'),
('company','LG Energy Solution', ARRAY['LG Energy','373220'], '373220.KS', 'industrials', 'KR', '{"index":"KOSPI","subsector":"batteries"}'),
('company','Hyundai Motor', ARRAY['Hyundai','005380'], '005380.KS', 'automotive', 'KR', '{"index":"KOSPI"}'),
('company','TSMC', ARRAY['TSMC','Taiwan Semiconductor','2330'], '2330.TW', 'semiconductors', 'TW', '{"index":"TWSE"}'),
('company','Foxconn (Hon Hai)', ARRAY['Foxconn','Hon Hai','2317'], '2317.TW', 'technology', 'TW', '{"index":"TWSE"}'),
('company','Alibaba Group', ARRAY['Alibaba','BABA','9988'], '9988.HK', 'technology', 'CN', '{"index":"HSI"}'),
('company','Tencent Holdings', ARRAY['Tencent','700'], '0700.HK', 'technology', 'CN', '{"index":"HSI"}'),
('company','BYD Company', ARRAY['BYD','1211'], '1211.HK', 'automotive', 'CN', '{"index":"HSI","subsector":"ev"}'),
('company','CATL', ARRAY['CATL','Contemporary Amperex','300750'], '300750.SZ', 'industrials', 'CN', '{"index":"CSI300","subsector":"batteries"}'),
('company','PetroChina', ARRAY['PetroChina','857'], '0857.HK', 'energy', 'CN', '{"index":"HSI"}'),
('company','Sinopec', ARRAY['Sinopec','386'], '0386.HK', 'energy', 'CN', '{"index":"HSI"}'),
('company','ICBC', ARRAY['ICBC','1398'], '1398.HK', 'financials', 'CN', '{"index":"HSI"}'),
-- Materials / mining
('company','BHP Group', ARRAY['BHP'], 'BHP.AX', 'materials', 'AU', '{"index":"ASX200","subsector":"mining"}'),
('company','Fortescue Metals', ARRAY['Fortescue','FMG'], 'FMG.AX', 'materials', 'AU', '{"index":"ASX200","subsector":"iron_ore"}'),
('company','Newmont Corporation', ARRAY['Newmont','NEM'], 'NEM', 'materials', 'US', '{"index":"S&P500","subsector":"gold"}'),
('company','Freeport-McMoRan', ARRAY['Freeport','FCX'], 'FCX', 'materials', 'US', '{"index":"S&P500","subsector":"copper"}'),
('company','Vale S.A.', ARRAY['Vale','VALE'], 'VALE', 'materials', 'BR', '{"index":"Bovespa","subsector":"iron_ore"}'),
-- Critical minerals / rare earth
('company','MP Materials', ARRAY['MP Materials','MP'], 'MP', 'materials', 'US', '{"subsector":"rare_earth"}'),
('company','Lynas Rare Earths', ARRAY['Lynas','LYC'], 'LYC.AX', 'materials', 'AU', '{"subsector":"rare_earth"}'),
('company','Albemarle Corporation', ARRAY['Albemarle','ALB'], 'ALB', 'materials', 'US', '{"subsector":"lithium"}'),
('company','SQM', ARRAY['SQM','Sociedad Quimica'], 'SQM', 'materials', 'CL', '{"subsector":"lithium"}'),
-- Energy / renewables
('company','Vestas Wind Systems', ARRAY['Vestas','VWS'], 'VWS.CO', 'utilities', 'EU', '{"subsector":"wind"}'),
('company','Ørsted A/S', ARRAY['Orsted','ORSTED'], 'ORSTED.CO', 'utilities', 'EU', '{"subsector":"offshore_wind"}'),
('company','First Solar', ARRAY['First Solar','FSLR'], 'FSLR', 'technology', 'US', '{"subsector":"solar"}'),
('company','Enphase Energy', ARRAY['Enphase','ENPH'], 'ENPH', 'technology', 'US', '{"subsector":"solar"}'),
-- Additional pharma/biotech and cyber/defense-tech
('company','CrowdStrike', ARRAY['CrowdStrike','CRWD'], 'CRWD', 'technology', 'US', '{"subsector":"cybersecurity"}'),
('company','Palo Alto Networks', ARRAY['Palo Alto','PANW'], 'PANW', 'technology', 'US', '{"subsector":"cybersecurity"}'),
('company','Fortinet', ARRAY['Fortinet','FTNT'], 'FTNT', 'technology', 'US', '{"subsector":"cybersecurity"}'),
('company','Zscaler', ARRAY['Zscaler','ZS'], 'ZS', 'technology', 'US', '{"subsector":"cybersecurity"}'),
('company','ServiceNow', ARRAY['ServiceNow','NOW'], 'NOW', 'technology', 'US', '{"subsector":"enterprise_software"}'),
('company','Snowflake', ARRAY['Snowflake','SNOW'], 'SNOW', 'technology', 'US', '{"subsector":"data"}')
ON CONFLICT DO NOTHING;

-- =============================================================
-- ENTITY relationships seed (a compact but useful graph)
-- =============================================================
WITH e AS (SELECT id, canonical_name FROM public.entities)
INSERT INTO public.entity_relationships (from_entity_id, to_entity_id, relationship_type, weight, rationale)
SELECT a.id, b.id, r.rel, r.w, r.why FROM (VALUES
  ('Apple Inc.','TSMC','supplier',0.9,'TSMC fabricates Apple silicon (A/M series)'),
  ('Apple Inc.','Foxconn (Hon Hai)','supplier',0.9,'Foxconn assembles the majority of iPhone units'),
  ('Apple Inc.','Samsung Electronics','supplier',0.7,'Samsung supplies OLED displays and NAND'),
  ('Apple Inc.','SK Hynix','supplier',0.6,'DRAM/NAND supplier'),
  ('NVIDIA Corporation','TSMC','supplier',0.95,'TSMC fabricates NVIDIA GPUs'),
  ('NVIDIA Corporation','ASML Holding','supplier',0.8,'ASML EUV enables the process nodes NVIDIA relies on'),
  ('Advanced Micro Devices','TSMC','supplier',0.95,'TSMC fabricates AMD CPUs/GPUs'),
  ('Intel Corporation','ASML Holding','supplier',0.85,'ASML EUV for Intel Foundry roadmap'),
  ('Broadcom Inc.','TSMC','supplier',0.85,'Foundry partner'),
  ('Microsoft Corporation','NVIDIA Corporation','supplier',0.8,'NVIDIA GPUs power Azure AI'),
  ('Amazon.com Inc.','NVIDIA Corporation','supplier',0.75,'AWS GPU capacity'),
  ('Alphabet Inc.','NVIDIA Corporation','supplier',0.7,'GCP GPU capacity'),
  ('Tesla Inc.','CATL','supplier',0.7,'CATL supplies LFP battery cells for Tesla'),
  ('Tesla Inc.','LG Energy Solution','supplier',0.6,'Battery cell supplier'),
  ('Tesla Inc.','Panasonic','supplier',0.5,'Battery cell supplier'),
  ('Ford Motor Company','CATL','supplier',0.55,'Battery supplier for select EVs'),
  ('General Motors','LG Energy Solution','supplier',0.7,'Ultium battery JV'),
  ('BYD Company','CATL','competitor',0.7,'Both dominate EV battery market'),
  ('Tesla Inc.','BYD Company','competitor',0.85,'Global EV market leaders'),
  ('Volkswagen AG','Tesla Inc.','competitor',0.8,'EV market'),
  ('Ford Motor Company','General Motors','competitor',0.9,'US auto majors'),
  ('Boeing Company','Airbus SE','competitor',0.95,'Commercial aerospace duopoly'),
  ('Lockheed Martin','RTX Corporation','competitor',0.7,'US defense primes'),
  ('Lockheed Martin','Northrop Grumman','competitor',0.7,'US defense primes'),
  ('BAE Systems','Lockheed Martin','competitor',0.6,'Global defense primes'),
  ('Rheinmetall AG','BAE Systems','competitor',0.6,'European land systems'),
  ('Rheinmetall AG','Thales Group','peer',0.5,'European defense'),
  ('Exxon Mobil','Chevron Corporation','competitor',0.9,'US oil majors'),
  ('Shell plc','BP plc','competitor',0.9,'UK oil majors'),
  ('TotalEnergies','Shell plc','competitor',0.85,'EU oil majors'),
  ('PetroChina','Sinopec','competitor',0.85,'Chinese state energy'),
  ('AstraZeneca','GSK plc','competitor',0.75,'UK pharma'),
  ('Pfizer Inc.','Moderna','competitor',0.8,'mRNA vaccines'),
  ('Eli Lilly','Novo Nordisk','competitor',0.85,'GLP-1 leaders'),
  ('JPMorgan Chase','Bank of America','competitor',0.9,'US money-center banks'),
  ('Goldman Sachs','Morgan Stanley','competitor',0.9,'US investment banks'),
  ('HSBC Holdings','Barclays','competitor',0.8,'UK global banks'),
  ('Deutsche Bank','BNP Paribas','competitor',0.7,'EU investment banks'),
  ('Rio Tinto','BHP Group','competitor',0.9,'Iron ore majors'),
  ('Glencore','Rio Tinto','competitor',0.7,'Diversified miners'),
  ('Vale S.A.','BHP Group','competitor',0.85,'Iron ore majors'),
  ('MP Materials','Lynas Rare Earths','competitor',0.9,'Western rare-earth suppliers'),
  ('Albemarle Corporation','SQM','competitor',0.9,'Lithium majors'),
  ('Freeport-McMoRan','Newmont Corporation','peer',0.6,'US miners'),
  ('Samsung Electronics','SK Hynix','competitor',0.85,'Korean memory'),
  ('TSMC','Samsung Electronics','competitor',0.8,'Advanced-node foundry'),
  ('CrowdStrike','Palo Alto Networks','competitor',0.85,'Cybersecurity majors'),
  ('Fortinet','Palo Alto Networks','competitor',0.8,'Firewall / NGFW'),
  ('Zscaler','Palo Alto Networks','competitor',0.75,'Cloud security'),
  ('Salesforce Inc.','Microsoft Corporation','competitor',0.7,'CRM / enterprise cloud'),
  ('Oracle Corporation','Microsoft Corporation','competitor',0.6,'Enterprise cloud'),
  ('SAP SE','Oracle Corporation','competitor',0.8,'Enterprise ERP')
) AS r(from_name, to_name, rel, w, why)
JOIN e a ON a.canonical_name = r.from_name
JOIN e b ON b.canonical_name = r.to_name
ON CONFLICT DO NOTHING;

-- =============================================================
-- SOURCE universe expansion (real free feeds)
-- =============================================================
INSERT INTO public.sources (name, source_type, access_method, base_url, feed_url, feed_kind, reliability_score, health_score, status, is_synthetic) VALUES
-- General news
('Reuters World', 'news', 'rss', 'https://www.reuters.com', 'https://feeds.reuters.com/Reuters/worldNews', 'rss', 0.90, 1.0, 'active', false),
('Associated Press Top', 'news', 'rss', 'https://apnews.com', 'https://feeds.apnews.com/rss/apf-topnews', 'rss', 0.90, 1.0, 'active', false),
('AP Business', 'news', 'rss', 'https://apnews.com', 'https://feeds.apnews.com/rss/apf-business', 'rss', 0.90, 1.0, 'active', false),
('BBC Business', 'news', 'rss', 'https://www.bbc.co.uk', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'rss', 0.88, 1.0, 'active', false),
('Guardian Business', 'news', 'rss', 'https://www.theguardian.com', 'https://www.theguardian.com/uk/business/rss', 'rss', 0.82, 1.0, 'active', false),
('Guardian World', 'news', 'rss', 'https://www.theguardian.com', 'https://www.theguardian.com/world/rss', 'rss', 0.82, 1.0, 'active', false),
('Al Jazeera', 'news', 'rss', 'https://www.aljazeera.com', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss', 0.75, 1.0, 'active', false),
('NPR Business', 'news', 'rss', 'https://www.npr.org', 'https://feeds.npr.org/1006/rss.xml', 'rss', 0.85, 1.0, 'active', false),
('Nikkei Asia', 'news', 'rss', 'https://asia.nikkei.com', 'https://asia.nikkei.com/rss/feed/nar', 'rss', 0.85, 1.0, 'active', false),
('CNBC Top News', 'news', 'rss', 'https://www.cnbc.com', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', 'rss', 0.80, 1.0, 'active', false),
('Yahoo Finance', 'news', 'rss', 'https://finance.yahoo.com', 'https://finance.yahoo.com/news/rssindex', 'rss', 0.72, 1.0, 'active', false),
-- Regulators
('SEC EDGAR Filings', 'filings', 'rss', 'https://www.sec.gov', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=40&output=atom', 'atom', 0.98, 1.0, 'active', false),
('SEC EDGAR 10-K', 'filings', 'rss', 'https://www.sec.gov', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&company=&dateb=&owner=include&count=40&output=atom', 'atom', 0.98, 1.0, 'active', false),
('SEC Press Releases', 'regulatory', 'rss', 'https://www.sec.gov', 'https://www.sec.gov/news/pressreleases.rss', 'rss', 0.96, 1.0, 'active', false),
('FDA Press Releases', 'regulatory', 'rss', 'https://www.fda.gov', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', 'rss', 0.95, 1.0, 'active', false),
('FDA Recalls', 'regulatory', 'rss', 'https://www.fda.gov', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml', 'rss', 0.95, 1.0, 'active', false),
('EPA News', 'regulatory', 'rss', 'https://www.epa.gov', 'https://www.epa.gov/newsreleases/search/rss', 'rss', 0.90, 1.0, 'active', false),
('CFTC Press', 'regulatory', 'rss', 'https://www.cftc.gov', 'https://www.cftc.gov/rss/PressReleases.xml', 'rss', 0.92, 1.0, 'active', false),
('FCA (UK) News', 'regulatory', 'rss', 'https://www.fca.org.uk', 'https://www.fca.org.uk/news/rss.xml', 'rss', 0.93, 1.0, 'active', false),
('ESMA News', 'regulatory', 'rss', 'https://www.esma.europa.eu', 'https://www.esma.europa.eu/rss.xml', 'rss', 0.92, 1.0, 'active', false),
('European Commission Press', 'regulatory', 'rss', 'https://ec.europa.eu', 'https://ec.europa.eu/commission/presscorner/api/rss', 'rss', 0.93, 1.0, 'active', false),
-- Central banks
('US Federal Reserve', 'regulatory', 'rss', 'https://www.federalreserve.gov', 'https://www.federalreserve.gov/feeds/press_all.xml', 'rss', 0.98, 1.0, 'active', false),
('ECB Press', 'regulatory', 'rss', 'https://www.ecb.europa.eu', 'https://www.ecb.europa.eu/rss/pr.xml', 'rss', 0.97, 1.0, 'active', false),
('Bank of England', 'regulatory', 'rss', 'https://www.bankofengland.co.uk', 'https://www.bankofengland.co.uk/rss/news', 'rss', 0.97, 1.0, 'active', false),
('Bank of Japan', 'regulatory', 'rss', 'https://www.boj.or.jp', 'https://www.boj.or.jp/en/rss/whatsnew.xml', 'rss', 0.96, 1.0, 'active', false),
-- Government procurement / contracts
('SAM.gov Contract Opportunities', 'procurement', 'rss', 'https://sam.gov', 'https://sam.gov/api/prod/opps/v1/opportunities/rss', 'rss', 0.90, 1.0, 'active', false),
('UK Contracts Finder', 'procurement', 'rss', 'https://www.contractsfinder.service.gov.uk', 'https://www.contractsfinder.service.gov.uk/Published/Notices/rss', 'rss', 0.90, 1.0, 'active', false),
('TED EU Public Tenders', 'procurement', 'rss', 'https://ted.europa.eu', 'https://ted.europa.eu/api/v3.0/notices/search?fields=notice-id,title,publication-date&limit=25&format=rss', 'rss', 0.90, 1.0, 'active', false),
-- Sanctions / geopolitics
('US Treasury OFAC Recent Actions', 'regulatory', 'rss', 'https://home.treasury.gov', 'https://home.treasury.gov/system/files/126/ofac_recent_actions.xml', 'rss', 0.98, 1.0, 'active', false),
('State Department Press', 'regulatory', 'rss', 'https://www.state.gov', 'https://www.state.gov/rss-feeds/press-releases-feed/', 'rss', 0.90, 1.0, 'active', false),
-- Commodities / energy / agriculture
('EIA Today In Energy', 'commodity', 'rss', 'https://www.eia.gov', 'https://www.eia.gov/rss/todayinenergy.xml', 'rss', 0.94, 1.0, 'active', false),
('OilPrice.com', 'commodity', 'rss', 'https://oilprice.com', 'https://oilprice.com/rss/main', 'rss', 0.70, 1.0, 'active', false),
('Mining.com', 'commodity', 'rss', 'https://www.mining.com', 'https://www.mining.com/feed/', 'rss', 0.75, 1.0, 'active', false),
('USDA News', 'regulatory', 'rss', 'https://www.usda.gov', 'https://www.usda.gov/rss/latest-releases.xml', 'rss', 0.92, 1.0, 'active', false),
-- Defense trades
('Defense One', 'trade_press', 'rss', 'https://www.defenseone.com', 'https://www.defenseone.com/rss/all/', 'rss', 0.78, 1.0, 'active', false),
('Breaking Defense', 'trade_press', 'rss', 'https://breakingdefense.com', 'https://breakingdefense.com/feed/', 'rss', 0.75, 1.0, 'active', false),
('The War Zone', 'trade_press', 'rss', 'https://www.twz.com', 'https://www.twz.com/feed', 'rss', 0.70, 1.0, 'active', false),
-- Tech / semis
('The Register', 'trade_press', 'rss', 'https://www.theregister.com', 'https://www.theregister.com/headlines.atom', 'atom', 0.72, 1.0, 'active', false),
('Ars Technica', 'trade_press', 'rss', 'https://arstechnica.com', 'https://arstechnica.com/feed/', 'rss', 0.78, 1.0, 'active', false),
('IEEE Spectrum', 'trade_press', 'rss', 'https://spectrum.ieee.org', 'https://spectrum.ieee.org/rss/fulltext', 'rss', 0.82, 1.0, 'active', false),
-- Preprints
('arXiv cs recent', 'trade_press', 'rss', 'https://arxiv.org', 'http://export.arxiv.org/rss/cs', 'rss', 0.70, 1.0, 'active', false),
('arXiv econ recent', 'trade_press', 'rss', 'https://arxiv.org', 'http://export.arxiv.org/rss/econ', 'rss', 0.72, 1.0, 'active', false),
-- Think tanks / geopolitics
('CSIS Analysis', 'trade_press', 'rss', 'https://www.csis.org', 'https://www.csis.org/analysis/feed', 'rss', 0.85, 1.0, 'active', false),
('RAND Publications', 'trade_press', 'rss', 'https://www.rand.org', 'https://www.rand.org/pubs.xml', 'rss', 0.88, 1.0, 'active', false),
('Bruegel Analysis', 'trade_press', 'rss', 'https://www.bruegel.org', 'https://www.bruegel.org/rss.xml', 'rss', 0.85, 1.0, 'active', false),
('Peterson Institute', 'trade_press', 'rss', 'https://www.piie.com', 'https://www.piie.com/rss.xml', 'rss', 0.85, 1.0, 'active', false)
ON CONFLICT DO NOTHING;
