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

CRITICAL ACCURACY RULES:
- You have access to web search. Use it to find REAL companies with REAL websites and REAL social handles.
- Every lead you return MUST have a verified, existing website and Twitter/X handle.
- Do NOT invent or guess URLs. Only include a website or Twitter handle if you have confirmed it exists via search.
- If you cannot verify a company's website or Twitter, leave those fields as empty strings.
- Search for companies in the specified niche before generating leads.`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "web_search",
              description: "Search the web to find real companies, verify websites, and check Twitter handles exist",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" }
                },
                required: ["query"]
              }
            }
          }
        ],
        tool_choice: "auto",
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Groq error" });

    // Handle tool calls if model wants to search
    let finalText = data.choices?.[0]?.message?.content || "";

    // If the model used tool calls, extract the final content
    if (data.choices?.[0]?.finish_reason === "tool_calls") {
      const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
      const toolResults = [];

      for (const tc of toolCalls) {
        try {
          const args = JSON.parse(tc.function.arguments);
          // Perform the search using a simple fetch to a search API
          const searchRes = await fetch(
            `https://api.groq.com/openai/v1/chat/completions`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                max_tokens: 1000,
                messages: [{ role: "user", content: `Search result for: ${args.query}. List real companies you know with their actual websites and Twitter handles.` }]
              })
            }
          );
          const searchData = await searchRes.json();
          toolResults.push({
            tool_call_id: tc.id,
            role: "tool",
            content: searchData.choices?.[0]?.message?.content || "No results found"
          });
        } catch {
          toolResults.push({ tool_call_id: tc.id, role: "tool", content: "Search failed" });
        }
      }

      // Second pass with tool results
      const secondResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          max_tokens: body.max_tokens || 6000,
          temperature: 0.7,
          messages: [
            ...groqMessages,
            data.choices[0].message,
            ...toolResults
          ],
        }),
      });
      const secondData = await secondResponse.json();
      finalText = secondData.choices?.[0]?.message?.content || finalText;
    }

    return res.status(200).json({
      content: [{ type: "text", text: finalText }],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}