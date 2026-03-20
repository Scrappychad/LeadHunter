export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not set" });

  try {
    const body = req.body;
    const messages = body.messages || [];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: body.max_tokens || 6000,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You are an elite growth operator identifying high-quality leads.
Quality over quantity. Apply strict filters. Return only valid JSON - no markdown, no explanation, no code blocks.

ACCURACY RULES - MANDATORY:
- Only return companies that genuinely exist and are active.
- For websites: only include URLs you are confident are real and active. If unsure, use empty string.
- For Twitter/X: only include handles you are confident exist. If unsure, use empty string.
- It is better to leave website and twitter blank than to guess wrong.
- Never fabricate or hallucinate URLs or social handles.`
          },
          ...messages
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Groq error" });

    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return res.status(500).json({ error: "Empty response from model" });

    return res.status(200).json({
      content: [{ type: "text", text }],
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}