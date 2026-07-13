INSERT INTO public.sources
  (name, source_type, access_method, base_url, feed_url, feed_kind, reliability_score, health_score, status, is_synthetic)
VALUES
  ('Fox Business', 'news', 'rss', 'https://www.foxbusiness.com', 'https://moxie.foxbusiness.com/google-publisher/latest.xml', 'rss', 0.80, 1.0, 'active', false),
  ('Telegraph Business', 'news', 'rss', 'https://www.telegraph.co.uk', 'https://www.telegraph.co.uk/business/rss.xml', 'rss', 0.82, 1.0, 'active', false),
  ('Daily Mail Money', 'news', 'rss', 'https://www.dailymail.co.uk', 'https://www.dailymail.co.uk/money/index.rss', 'rss', 0.72, 1.0, 'active', false),
  ('NY Post Business', 'news', 'rss', 'https://nypost.com', 'https://nypost.com/business/feed/', 'rss', 0.72, 1.0, 'active', false),
  ('WSJ Markets', 'news', 'rss', 'https://www.wsj.com', 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', 'rss', 0.85, 1.0, 'active', false),
  ('CNN Business', 'news', 'rss', 'https://www.cnn.com', 'http://rss.cnn.com/rss/money_latest.rss', 'rss', 0.82, 1.0, 'active', false),
  ('Sky News Business', 'news', 'rss', 'https://news.sky.com', 'https://feeds.skynews.com/feeds/rss/business.xml', 'rss', 0.82, 1.0, 'active', false);

INSERT INTO public.source_lean
  (domain, outlet_name, lean, lean_label, lean_source)
VALUES
  ('foxbusiness.com', 'Fox Business', 'right', 'Right', 'AllSides')
ON CONFLICT (domain) DO NOTHING;