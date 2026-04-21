export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Missing text' })
  }

  const prompt = `You are a helpful English writing assistant. The user is a Vietnamese person learning English who writes diary entries.

Please improve the following diary text to make it more natural, grammatically correct, and fluent in English.

Rules:
- Keep EXACTLY the same meaning, content, and length as the original
- Do NOT add new information, new sentences, or new ideas that were not in the original
- Do NOT expand or elaborate on anything — only fix what is already written
- Fix grammar errors
- Make it sound more natural and personal (it's a diary)
- If the original is short, the improved version must also be short

Original text:
${text}

Format your response as:
IMPROVED:
[improved text here — same length and content as original, just better grammar and phrasing]

WHAT I CHANGED:
[List only the actual edits made — as few or as many bullet points as genuinely needed. If only 1 thing was changed, write 1 bullet. If the text was already good and needed minimal edits, say so briefly.]

WRITING ANALYSIS:
[Analyze only the real weaknesses found in the original. If the text was mostly correct, say so and give 1-2 brief notes. Do not pad with generic feedback if there is nothing meaningful to add.]`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    return res.status(response.status).json({ error: err.error?.message || 'Groq API error' })
  }

  const data = await response.json()
  return res.status(200).json(data)
}
