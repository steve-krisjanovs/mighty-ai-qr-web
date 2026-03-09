import db from './db'

const TAVILY_API_URL = 'https://api.tavily.com/search'

export interface SearchResult {
  text: string
  sources: { title: string; url: string }[]
}

export async function webSearch(query: string): Promise<SearchResult> {
  // Check cache first
  const cached = db.prepare('SELECT result FROM web_search_cache WHERE query = ?').get(query) as { result: string } | undefined
  if (cached) {
    try {
      const parsed = JSON.parse(cached.result)
      if (parsed && typeof parsed.text === 'string') return parsed as SearchResult
    } catch {}
    // Legacy cache entry (plain string)
    return { text: cached.result, sources: [] }
  }

  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return { text: 'Web search unavailable — no TAVILY_API_KEY configured.', sources: [] }

  const res = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'advanced', max_results: 5 }),
  })

  if (!res.ok) return { text: `Web search failed: ${res.status} ${res.statusText}`, sources: [] }

  const data = await res.json() as { results: { title: string; url: string; content: string }[] }

  const sources = data.results.map(r => ({ title: r.title, url: r.url }))
  const text = data.results
    .map(r => `${r.title}\n${r.content}`)
    .join('\n\n---\n\n')
    .slice(0, 4000)

  const result: SearchResult = { text: text || 'No results found.', sources }
  db.prepare('INSERT OR REPLACE INTO web_search_cache (query, result, cached_at) VALUES (?, ?, datetime(\'now\'))').run(query, JSON.stringify(result))

  return result
}
