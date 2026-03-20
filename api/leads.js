async function searchWeb(query, serperKey) {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": serperKey,
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    const data = await res.json();
    const results = data.organic || [];
    return results.map(r => `${r.title} - ${r.link}\n${r.snippet}`).join("\n\n");
  } catch {
    return null;
  }
}

async function verifyLead(lead, serperKey) {
  // Search for the company to verify and enrich details
  const query = `${lead.name} ${lead.industry || ""} website twitter`;
  const results = await searchWeb(query, serperKey);
  if (!results) return lead;

  // Second search specifically for their Twitter/X
  const twitterQuery = `${lead.name} site:twitter.com OR site:x.com`;
  const twitterResults = await searchWeb(twitterQuery, serperKey);

  return { ...lead, _searchResults: results, _twitterResults: twitterResults || "" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY not set" });

  try {
    const body = req.body;
    const messages = body.messages || [];

    // Step 1: Get lead names and basic info from AI
    const firstPass = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: body.max_tokens || 6000,
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content: `You are an elite growth operator identifying high-quality early-stage leads.
Quality over quantity. Return only valid JSON - no markdown, no explanation, no code blocks.

TARGET: Pre-launch or recently launched companies (0-6 months). Not established players. Not well-known brands.
AVOID: Any company with strong brand recognition, 50k+ followers, or an obvious professional growth team.

NOTE: Do not worry about websites or Twitter handles - leave those as empty strings. A separate system will verify and fill them in from live search results. Focus only on finding the right companies and writing accurate analysis.`
          },
          ...messages
        ],
      }),
    });

    const firstData = await firstPass.json();
    if (!firstPass.ok) return res.status(firstPass.status).json({ error: firstData?.error?.message || "Groq error" });

    let text = firstData.choices?.[0]?.message?.content || "";
    if (!text) return res.status(500).json({ error: "Empty response from model" });

    // Step 2: Parse leads and verify with Serper
    if (serperKey) {
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const start = clean.indexOf("[");
        const end = clean.lastIndexOf("]");
        if (start !== -1 && end !== -1) {
          const leads = JSON.parse(clean.slice(start, end + 1));

          // Verify each lead with live search (parallel)
          const verified = await Promise.all(leads.map(lead => verifyLead(lead, serperKey)));

          // Step 3: Ask AI to fill in real URLs from search results
          const enrichPrompt = `You have search results for each of these leads. Extract the correct website URL and Twitter/X handle from the search results for each lead. Return the same JSON array with website and twitter fields filled in accurately based on the search results. If you cannot find a verified URL or handle from the search results, use empty string.

LEADS WITH SEARCH RESULTS:
${verified.map((l, i) => `
Lead ${i + 1}: ${l.name}
Search Results: ${l._searchResults || "No results"}
Twitter Search: ${l._twitterResults || "No results"}
`).join("\n")}

Return the full leads array as valid JSON with corrected website and twitter fields. Keep all other fields exactly as they are. No markdown, no explanation, just JSON.`;

          const enrichPass = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              max_tokens: 4000,
              temperature: 0.1,
              messages: [
                { role: "user", content: enrichPrompt },
                { role: "assistant", content: clean.slice(start, end + 1) }
              ],
            }),
          });

          const enrichData = await enrichPass.json();
          const enrichedText = enrichData.choices?.[0]?.message?.content || "";
          if (enrichedText) text = enrichedText;
        }
      } catch {
        // If enrichment fails, return original text
      }
    }

    return res.status(200).json({
      content: [{ type: "text", text }],
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}