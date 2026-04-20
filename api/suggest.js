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
- Keep the same meaning and personal voice
- Fix grammar errors
- Make it sound more natural
- Keep it informal/personal (it's a diary)

Original text:
${text}

Format your response as:
IMPROVED:
[improved text here]

WHAT I CHANGED:
[3-5 bullet points listing the specific edits made]

WRITING ANALYSIS:
[3-5 bullet points analyzing the weaknesses in the original text — what grammar rules were broken, what word choices were unnatural, what recurring patterns of mistakes exist. Write as constructive feedback to help the user learn, not just repeat the fixes.]`

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
