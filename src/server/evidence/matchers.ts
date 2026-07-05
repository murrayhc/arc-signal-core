import type { AtomicClaimType } from '@/shared/enums'

export type AtomicMatcher = { claimType: AtomicClaimType; pattern: RegExp; baseConfidence: number }

/** Rule table v2 — maps a matched sentence to an atomic claim type. Ordered
 *  most-specific first; the generic COMPANY_STATEMENT fallback is last so a
 *  richer type wins when several match. Every matcher runs per sentence. */
export const ATOMIC_MATCHERS: AtomicMatcher[] = [
  {
    claimType: 'LAYOFF_SIGNAL',
    pattern:
      /\b(lay[- ]?offs?|redundanc(?:y|ies)|job cuts?|cut(?:ting)? \d+ (?:jobs|roles)|shed(?:ding)? (?:\d+|hundreds|thousands) (?:of )?(?:jobs|roles)|workforce reduction|reduc(?:e|ing) (?:its|the) .{0,20}workforce)\b/i,
    baseConfidence: 0.75,
  },
  {
    claimType: 'HIRING_CHANGE',
    pattern:
      /\b(hiring (?:surge|freeze|spree|drive)|recruitment (?:drive|freeze)|headcount (?:growth|increase|freeze)|expand(?:ing)? (?:its|the) workforce|adding \d+ (?:jobs|roles|staff))\b/i,
    baseConfidence: 0.6,
  },
  {
    claimType: 'EXECUTIVE_CHANGE',
    pattern:
      /\b(chief executive|ceo|cfo|coo|cto|chair(?:man|woman|person)?)\b.{0,60}\b(resign|step(?:s|ped|ping)? down|depart|appoint|join|exit|replac)/i,
    baseConfidence: 0.7,
  },
  {
    claimType: 'REGULATORY_PRESSURE',
    pattern:
      /\b(regulator|watchdog|fine[ds]?\b|sanction|investigation|inquiry|probe|compliance (?:order|obligation)|new rules|legislation|antitrust|competition authority)\b/i,
    baseConfidence: 0.6,
  },
  {
    claimType: 'PROCUREMENT_ACTIVITY',
    pattern:
      /\b(procurement|tender|public contract|framework agreement|contract award|awarded (?:a|the) contract|bid(?:ding)? for)\b/i,
    baseConfidence: 0.7,
  },
  {
    claimType: 'SUPPLY_CHAIN_PRESSURE',
    pattern:
      /\b(supply chain|component shortage|chip shortage|port delays|shipping disruption|freight backlog|logistics bottleneck|shortage of (?:parts|components|materials))\b/i,
    baseConfidence: 0.65,
  },
  {
    claimType: 'COMMODITY_PRESSURE',
    pattern:
      /\b(lithium|cobalt|nickel|copper|alumin(?:i)?um|steel|crude oil|brent|natural gas|wheat|grain)\b.{0,40}\b(shortage|price|supply|demand|surg|slump|disruption|tight|export|import)/i,
    baseConfidence: 0.6,
  },
  {
    claimType: 'MARKET_MOVEMENT',
    pattern:
      /\b(shares?|stock|share price|index|ftse|nasdaq|dow)\b.{0,30}\b(rose|fell|jump|plunge|surg|slump|rall|sell[- ]?off|gain|drop|tumbl)/i,
    baseConfidence: 0.55,
  },
  {
    claimType: 'DEMAND_SIGNAL',
    pattern:
      /\b(demand (?:surge|spike|growth|jump)|record orders|orders? (?:jump|surge|rose)|sales (?:jump|surge|soar|rose))\b/i,
    baseConfidence: 0.6,
  },
  {
    claimType: 'FUNDING_SIGNAL',
    pattern:
      /\b(funding round|series [a-e]\b|raise[sd]? (?:[£$€]|\d)|venture capital|investment round|secured (?:[£$€]|\d)|fresh funding)\b/i,
    baseConfidence: 0.65,
  },
  {
    claimType: 'LEGAL_EVENT',
    pattern: /\b(lawsuit|court ruling|sued|legal action|litigation|settlement|damages|tribunal|class action)\b/i,
    baseConfidence: 0.6,
  },
  {
    claimType: 'CUSTOMER_COMPLAINT',
    pattern:
      /\b(customer (?:complaint|backlash|anger|frustration)|service (?:outage|failure|disruption)|users? (?:complain|report problems)|outage affecting)\b/i,
    baseConfidence: 0.5,
  },
  {
    claimType: 'MACRO_SIGNAL',
    pattern:
      /\b(inflation|interest rates?|gdp|recession|central bank|bank of england|federal reserve|unemployment rate|economic (?:growth|slowdown|outlook))\b/i,
    baseConfidence: 0.5,
  },
  {
    claimType: 'COMPANY_STATEMENT',
    pattern:
      /\b(said in a statement|announced|confirmed|spokesperson said|the company said|reported (?:that )?(?:it|its)|posted (?:a )?(?:profit|loss)|unveil(?:ed|s)?)\b/i,
    baseConfidence: 0.45,
  },
]

const SECTOR_PATTERNS: Record<string, RegExp> = {
  technology: /\b(tech(?:nology)?|software|semiconductor|chip|cloud computing)\b/i,
  retail: /\b(retail|high street|supermarket|merchant|checkout|e-?commerce)\b/i,
  energy: /\b(energy|solar|oil|gas|renewables?|inverter|grid|utility|power station)\b/i,
  healthcare: /\b(health(?:care)?|hospital|pharma|biotech|medical device)\b/i,
  logistics: /\b(logistics|shipping|freight|supply chain|haulage|warehousing)\b/i,
  finance: /\b(bank|lender|insurer|fintech|asset manager|hedge fund)\b/i,
  automotive: /\b(car maker|carmaker|automotive|electric vehicle|\bev\b)\b/i,
  manufacturing: /\b(manufactur|factor(?:y|ies)|plant|industrial|production line)\b/i,
  mining: /\b(mining|\bminer\b|\bmine\b|extraction)\b/i,
  'public-sector': /\b(council|local authority|public contract|government|\bnhs\b|ministry)\b/i,
}

const REGION_PATTERNS: Record<string, RegExp> = {
  UK: /\b(uk|united kingdom|britain|british|england|scotland|wales|london|manchester)\b/i,
  EU: /\b(eu|europe|european|germany|france|spain|italy|netherlands)\b/i,
  US: /\b(us|u\.s\.|united states|america|american)\b/i,
  ASIA: /\b(asia|china|chinese|japan|india|korea|taiwan)\b/i,
}

const COMMODITY_PATTERNS: Record<string, RegExp> = {
  lithium: /\blithium\b/i,
  cobalt: /\bcobalt\b/i,
  nickel: /\bnickel\b/i,
  copper: /\bcopper\b/i,
  aluminium: /\balumin(?:i)?um\b/i,
  steel: /\bsteel\b/i,
  oil: /\b(crude oil|brent|\boil\b)\b/i,
  gas: /\bnatural gas\b/i,
  wheat: /\bwheat\b/i,
}

function detectMany(text: string, patterns: Record<string, RegExp>): string[] {
  return Object.entries(patterns)
    .filter(([, re]) => re.test(text))
    .map(([key]) => key)
}

export function detectSectors(text: string): string[] {
  return detectMany(text, SECTOR_PATTERNS)
}
export function detectRegions(text: string): string[] {
  return detectMany(text, REGION_PATTERNS)
}
export function detectCommodities(text: string): string[] {
  return detectMany(text, COMMODITY_PATTERNS)
}

/** Cheap ticker detection: "LSE: ABC" style and "$ABC" style only. */
export function detectInstruments(text: string): string[] {
  const out = new Set<string>()
  const exch = text.match(/\b(?:LSE|NYSE|NASDAQ|LON)\s*:\s*[A-Z]{1,5}\b/g)
  if (exch) exch.forEach((m) => out.add(m.replace(/\s+/g, '')))
  const dollar = text.match(/\$[A-Z]{1,5}\b/g)
  if (dollar) dollar.forEach((m) => out.add(m))
  return [...out]
}

/** True when a sentence reads as opinion/forecast rather than asserted fact —
 *  used to keep commentary from being scored as established fact. */
export function hasOpinionMarker(text: string): boolean {
  return /\b(could|may|might|expects?|forecasts?|predicts?|warns?|fears?|likely|potential(?:ly)?|analysts? (?:say|expect|believe)|is expected to|braces? for|speculat)/i.test(
    text,
  )
}
