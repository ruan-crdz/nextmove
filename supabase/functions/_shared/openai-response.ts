type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function openAiOutputText(response: unknown): string | null {
  if (!isRecord(response)) return null
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text
  if (!Array.isArray(response.output)) return null

  const textParts: string[] = []
  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') {
        textParts.push(content.text)
      }
    }
  }
  return textParts.length ? textParts.join('\n') : null
}

export function parseOpenAiOutput<T = unknown>(response: unknown): T {
  const output = openAiOutputText(response)
  if (!output) throw new Error('OpenAI response did not contain structured output text')
  return JSON.parse(output) as T
}