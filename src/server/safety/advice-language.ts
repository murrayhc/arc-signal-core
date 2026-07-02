/** Financial-advice language guard. Deterministic, case-insensitive. Fails closed:
 *  services call assertNoAdviceLanguage before persisting any generated text. */

export class AdviceLanguageError extends Error {
  constructor(context: string, matches: string[]) {
    super(`Prohibited financial-advice language in ${context}: ${matches.join('; ')}`)
    this.name = 'AdviceLanguageError'
  }
}

const PROHIBITED_ADVICE_PATTERNS: RegExp[] = [
  /\b(should|must|need to)\s+(buy|sell|hold|short|long)\b/i,
  /\b(buy|sell|hold)\s+(this|the|these|that)\s+(stock|share|shares|instrument|position|asset)\b/i,
  /\b(buy|sell)\s+(recommendation|rating|signal)\b/i,
  /\btarget\s+price\b/i,
  /\b(expected|projected|guaranteed)\s+(return|returns|profit|gains?)\b/i,
  /\bguarantee[ds]?\s+(profit|returns?|gains?)\b/i,
  /\brisk[-\s]?free\b/i,
  /\bwill\s+definitely\b/i,
  /\b(act|buy|sell)\s+now\b/i,
  /\b(personal|personalised|personalized)\s+(financial|investment|portfolio)\s+(advice|recommendation)\b/i,
  /\b(allocate|rebalance)\s+your\s+(portfolio|holdings)\b/i,
  /\bfinancial\s+advice\b/i,
]

export function findAdviceLanguage(text: string): string[] {
  const matches: string[] = []
  for (const pattern of PROHIBITED_ADVICE_PATTERNS) {
    const m = text.match(pattern)
    if (m) matches.push(m[0])
  }
  return matches
}

export function assertNoAdviceLanguage(text: string, context: string): void {
  const matches = findAdviceLanguage(text)
  if (matches.length > 0) throw new AdviceLanguageError(context, matches)
}
