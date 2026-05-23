// ── Verdict Parser (V8) ──
// Parses agent output text to extract structured verdict

export type SemanticVerdict = {
  answer: string
  entities: string[]
  rationale: string
  confidence: number
}

export type AgentResult = {
  facts: unknown[]
  verdict: SemanticVerdict | null
  rawText: string
}

/**
 * Parse verdict from agent output text.
 * Looks for JSON in ```json blocks or raw JSON.
 */
export function parseVerdict(text: string): SemanticVerdict | null {
  try {
    // Try to extract JSON from code block
    const match = text.match(/```json\s*([\s\S]*?)```/)
    const jsonStr = match ? match[1] : text

    const parsed = JSON.parse(jsonStr.trim())
    const v = parsed.verdict ?? parsed

    return {
      answer: v.answer ?? '',
      entities: v.entities ?? [],
      rationale: v.rationale ?? '',
      confidence: typeof v.confidence === 'number' ? v.confidence : 0.5,
    }
  } catch {
    // Fallback: return null, raw text contains answer
    return null
  }
}

/**
 * Create fallback verdict when parsing fails.
 */
export function createFallbackVerdict(rawText: string): SemanticVerdict {
  return {
    answer: rawText.slice(0, 200),
    entities: [],
    rationale: 'Failed to parse structured verdict from agent output',
    confidence: 0.3,
  }
}