/**
 * Entity resolution — the precision layer between "a capitalised phrase
 * appeared in the evidence" and "a company is publicly named as affected".
 *
 * Deterministic and conservative: a name is only ever classified ORGANISATION
 * on positive evidence (legal suffix, organisational keyword, known alias).
 * Everything ambiguous is honestly UNKNOWN and is EXCLUDED from named
 * impacts — the cost of missing a name is a category-level statement; the
 * cost of promoting "Chief Executive" to a company on a public report is
 * credibility. Asymmetric, so we bias hard against invention.
 */

export type EntityKind = 'ORGANISATION' | 'PERSON' | 'PLACE' | 'ROLE_OR_TITLE' | 'TIME_OR_GENERIC' | 'UNKNOWN'

export type ResolvedEntity = {
  kind: EntityKind
  /** Why it was classified — carried onto the impact metadata for audit. */
  basis: string
  /** Suffix-folded, alias-resolved key: 'Voltcore Ltd', 'Voltcore Limited'
   *  and 'VOLTCORE' all resolve to the same key. */
  canonicalKey: string
  /** Clean display form (original casing, suffix retained). */
  displayName: string
}

/** Legal-form suffixes folded away for the canonical key. Longest first. */
const LEGAL_SUFFIX_RE =
  /\s+(limited liability partnership|public limited company|incorporated|corporation|limited|holdings plc|group plc|plc|ltd\.?|llp|llc|inc\.?|gmbh|ag|s\.?a\.?|s\.?p\.?a\.?|b\.?v\.?|n\.?v\.?|pty\.?|corp\.?|co\.?)\s*$/i

/** Positive organisational keywords — a name containing one is an org. */
const ORG_KEYWORD_RE =
  /\b(bank|council|authority|university|college|institute|association|federation|commission|agency|ministry|department|airlines?|airways|motors?|pharma(?:ceuticals)?|technolog(?:y|ies)|systems|solutions|energy|petroleum|steel|aerospace|defence|defense|logistics|shipping|foods?|breweries|brewing|hospital|trust|partners(?:hip)?|capital|ventures|industries|engineering|construction|rail(?:ways?)?|telecom(?:munications)?|media|broadcasting|insurance|utilities|water|grid|airport|port)\b/i

/** Honorific prefix → a person, never a company. */
const PERSON_PREFIX_RE = /^(mr|mrs|ms|miss|dr|sir|dame|lord|lady|baroness|professor|prof)\.?\s+/i

/** Role/title phrases that the capitalised-mention extractor loves to promote. */
const ROLES = new Set(
  [
    'chief executive', 'chief executive officer', 'chief financial officer', 'chief operating officer',
    'ceo', 'cfo', 'coo', 'cto', 'chair', 'chairman', 'chairwoman', 'managing director', 'director',
    'president', 'vice president', 'prime minister', 'chancellor', 'chancellor of the exchequer',
    'secretary of state', 'home secretary', 'foreign secretary', 'governor', 'minister', 'mp', 'mep',
    'spokesperson', 'spokesman', 'spokeswoman', 'analyst', 'analysts', 'union', 'unions', 'workers',
    'the company', 'the firm', 'the government', 'the regulator', 'the city', 'the treasury', 'shareholders',
  ].map((s) => s.toLowerCase()),
)

/** Days/months/other time-ish capitalised tokens. */
const TIME_OR_GENERIC = new Set(
  [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
    'november', 'december', 'spring', 'summer', 'autumn', 'winter', 'christmas', 'easter',
    'new year', 'q1', 'q2', 'q3', 'q4', 'brexit', 'covid', 'covid-19', 'internet', 'twitter', 'x',
  ].map((s) => s.toLowerCase()),
)

/** Geographic gazetteer — a place is never a company. */
export const PLACES = new Set([
  'manchester', 'london', 'leeds', 'birmingham', 'glasgow', 'edinburgh', 'bristol', 'liverpool', 'sheffield',
  'cardiff', 'belfast', 'newcastle', 'nottingham', 'oxford', 'cambridge', 'brighton', 'southampton',
  'aberdeen', 'dundee', 'swansea', 'coventry', 'leicester', 'hull', 'plymouth', 'stoke', 'derby',
  'uk', 'united kingdom', 'britain', 'great britain', 'england', 'scotland', 'wales', 'ireland',
  'northern ireland', 'europe', 'european union', 'eu', 'us', 'usa', 'u.s.', 'united states', 'america',
  'north america', 'south america', 'latin america',
  'china', 'japan', 'india', 'germany', 'france', 'spain', 'italy', 'netherlands', 'korea', 'south korea',
  'taiwan', 'asia', 'africa', 'middle east', 'north sea', 'russia', 'australia', 'chile', 'peru',
  'brazil', 'mexico', 'canada', 'poland', 'sweden', 'norway', 'denmark', 'finland', 'switzerland',
  'austria', 'belgium', 'portugal', 'greece', 'turkey', 'ukraine', 'israel', 'saudi arabia', 'uae',
  'qatar', 'singapore', 'hong kong', 'indonesia', 'vietnam', 'thailand', 'malaysia', 'philippines',
  'new zealand', 'argentina', 'colombia', 'egypt', 'nigeria', 'south africa', 'kenya',
])

/** Known alias → canonical key map. Small and curated; grows via review
 *  (Stage 6) rather than guesswork. Keys and values are lowercase. */
const ALIASES: Record<string, string> = {
  'rolls royce': 'rolls-royce',
  'the bbc': 'bbc',
  'the guardian newspaper': 'the guardian',
  'hsbc bank': 'hsbc',
  'bp plc': 'bp',
}

function foldSuffix(name: string): { folded: string; hadSuffix: boolean } {
  const folded = name.replace(LEGAL_SUFFIX_RE, '').trim()
  return { folded: folded || name, hadSuffix: folded !== name.trim() && folded.length > 0 }
}

/** Canonical key: lowercase, suffix-folded, alias-resolved, punctuation-light. */
export function canonicalEntityKey(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  const { folded } = foldSuffix(cleaned)
  const lower = folded.toLowerCase().replace(/[.,']/g, '').trim()
  return ALIASES[lower] ?? lower
}

/** Classifies a capitalised mention. Conservative by design (see module doc). */
export function resolveEntityName(raw: string): ResolvedEntity {
  const name = raw.trim().replace(/\s+/g, ' ')
  const lower = name.toLowerCase().replace(/[.,]/g, '').trim()
  const canonicalKey = canonicalEntityKey(name)

  if (name.length < 3) {
    return { kind: 'UNKNOWN', basis: 'too short to classify', canonicalKey, displayName: name }
  }
  if (PLACES.has(lower)) {
    return { kind: 'PLACE', basis: 'geographic gazetteer', canonicalKey, displayName: name }
  }
  if (ROLES.has(lower)) {
    return { kind: 'ROLE_OR_TITLE', basis: 'role/title stoplist', canonicalKey, displayName: name }
  }
  if (TIME_OR_GENERIC.has(lower)) {
    return { kind: 'TIME_OR_GENERIC', basis: 'time/generic stoplist', canonicalKey, displayName: name }
  }
  if (PERSON_PREFIX_RE.test(name)) {
    return { kind: 'PERSON', basis: 'honorific prefix', canonicalKey, displayName: name }
  }
  const { hadSuffix } = foldSuffix(name)
  if (hadSuffix) {
    return { kind: 'ORGANISATION', basis: 'legal-form suffix', canonicalKey, displayName: name }
  }
  if (ORG_KEYWORD_RE.test(name)) {
    return { kind: 'ORGANISATION', basis: 'organisational keyword', canonicalKey, displayName: name }
  }
  if (ALIASES[lower]) {
    return { kind: 'ORGANISATION', basis: 'known alias', canonicalKey, displayName: name }
  }
  // A single capitalised token that is not any of the above COULD be a brand
  // ("Voltcore") or could be a surname — and a multi-word capitalised phrase
  // could be a headline fragment. Without positive evidence we say UNKNOWN,
  // and UNKNOWN never becomes a publicly named impact.
  return { kind: 'UNKNOWN', basis: 'no positive organisation evidence', canonicalKey, displayName: name }
}

/** Brand-shaped: 1–4 capitalised tokens, no stoplist hits — the shape of a
 *  company name as prose actually names one ("Voltcore", "Meridian Grid
 *  Systems"). The stoplists above have already removed persons (honorifics),
 *  places, roles and time words by the time this is consulted. */
const BRAND_SHAPE_RE = /^[A-Z][A-Za-z0-9&-]{2,}(\s+[A-Z][A-Za-z0-9&-]+){0,3}$/

/** True when the mention should be treated as a nameable organisation:
 *  positive evidence (legal suffix / org keyword / known alias), or a
 *  brand-shaped mention that survived every stoplist. What is EXCLUDED is
 *  the audit's actual failure mode — "Chief Executive", "Manchester",
 *  "Next Tuesday" can never become publicly named companies. */
export function isNameableOrganisation(raw: string, _corroboratedAcrossSources = false): boolean {
  const resolved = resolveEntityName(raw)
  if (resolved.kind === 'ORGANISATION') return true
  return resolved.kind === 'UNKNOWN' && BRAND_SHAPE_RE.test(raw.trim())
}
