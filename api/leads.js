async function serperSearch(query, serperKey, num = 10) {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: query, num }),
    });
    const data = await res.json();
    return (data.organic || []).map(r => `TITLE: ${r.title}\nURL: ${r.link}\nSNIPPET: ${r.snippet}`).join("\n\n---\n\n");
  } catch { return null; }
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
  if (!serperKey) return res.status(500).json({ error: "SERPER_API_KEY not set" });

  try {
    const body = req.body;
    const isQualify = body.mode === "qualify";

    if (isQualify) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 6000,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: `You are an elite Web3 growth operator qualifying leads. Quality over quantity. Return only valid JSON - no markdown, no explanation. Only state facts from the provided context. Never fabricate URLs or social handles.`,
            },
            ...(body.messages || []),
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Groq error" });
      const text = data.choices?.[0]?.message?.content || "";
      if (!text) return res.status(500).json({ error: "Empty response" });
      return res.status(200).json({ content: [{ type: "text", text }] });
    }

    const service = body.service || "growth strategy and brand architecture";

    // Hardcoded Web3 search queries
    const queries = [
      `new Web3 crypto project launched 2024 2025 site:x.com OR site:twitter.com`,
      `new DeFi NFT wallet DAO project "just launched" OR "launching" 2025 twitter`,
      `new crypto blockchain project site:linkedin.com 2024 2025`,
      `new web3 utility token L2 project recently launched website twitter linkedin`,
    ];

    // Run all searches in parallel
    const searchResults = await Promise.all(
      queries.map(q => serperSearch(q, serperKey, 8))
    );

    const combinedResults = searchResults.filter(Boolean).join("\n\n========\n\n");

    if (!combinedResults) {
      return res.status(500).json({ error: "Search returned no results. Please try again." });
    }

    const qualifyPrompt = `You are an elite Web3 growth operator. You have been given live Google search results for recently active Web3 projects.

Extract and qualify the BEST leads from these search results.

SERVICE BEING OFFERED: ${service}

QUALIFICATION FILTERS:
- Must be a real, active Web3 project visible in the search results
- Must be early-stage or recently launched (2024 or 2025 signals preferred)
- Must have visible pain signals: small team, early community, no professional growth operation yet
- Must have potential to pay for growth, brand, or marketing services
- Skip established projects with large communities or strong brand recognition
- Web3 scope: DeFi, NFTs, wallets, DAOs, L2s, utility tokens, crypto infrastructure, GameFi, SocialFi

SCORING (ability to pay):
- 8-10: Raised funding, hiring, or has visible traction and revenue signals
- 5-7: Serious team, product launched, early but moving
- 1-4: Too early or unclear signals

SEARCH RESULTS FROM GOOGLE (real, live results):
${combinedResults.slice(0, 8000)}

From these results, extract up to 10 qualifying Web3 leads. Only include projects confirmed in the search results. Return valid JSON only, no markdown:

[
  {
    "name": "Project Name",
    "website": "https://... (from search results only, empty string if not found)",
    "twitter": "@handle (from search results only, empty string if not found)",
    "linkedin": "https://linkedin.com/company/... (from search results only, empty string if not found)",
    "other_social": "any other social link found e.g. Discord, Telegram, Instagram (empty string if not found)",
    "industry": "DeFi / NFT / DAO / Wallet / L2 / GameFi / etc",
    "overview": "2-3 sentence description based only on search result snippets",
    "signals": {
      "activity": "Specific evidence from search results they are active",
      "pain": "Specific visible gap or problem based on search results",
      "capability": "Why they are worth targeting based on search signals",
      "timing": "Why now is the right time based on recency signals"
    },
    "growth_gaps": "What is clearly missing from their online presence",
    "leverage_angle": "Where a growth strategist steps in for this specific project",
    "score": 7,
    "outreach": "4-5 sentence personalized message. Reference something specific from the search results. No fluff. Must feel written after real research."
  }
]`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 6000,
        temperature: 0.7,
        messages: [{ role: "user", content: qualifyPrompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "Groq error" });

    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return res.status(500).json({ error: "Empty response" });

    return res.status(200).json({ content: [{ type: "text", text }], searchesRun: queries.length });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}