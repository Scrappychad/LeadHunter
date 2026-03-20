async function fetchWebsite(url) {
  if (!url) return null;
  try {
    if (!url.startsWith("http")) url = "https://" + url;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadHunter/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/\s{2,}/g, " ").trim().slice(0, 3000);
  } catch { return null; }
}

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
    let websiteContent = null;
    if (body.websiteUrl) websiteContent = await fetchWebsite(body.websiteUrl);

    const groqMessages = [];
    let system = `You are an elite growth operator identifying high-quality leads.
Quality over quantity. Apply strict filters. Return only valid JSON - no markdown, no explanation.
ACCURACY: Base all observations on provided context. If inferring, note it clearly.`;

    if (websiteContent) {
      system += `\n\nWEBSITE CONTENT:\n"""\n${websiteContent}\n"""`;
    }

    groqMessages.push({ role: "system", content: system });
    for (const msg of body.messages || []) {
      groqMessages.push({ role: msg.role, content: msg.content });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        max_tokens: body.max_tokens || 6000,
        temperature: 0.7,
        messages: groqMessages,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Groq error" });

    return res.status(200).json({
      content: [{ type: "text", text: data.choices?.[0]?.message?.content || "" }],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
