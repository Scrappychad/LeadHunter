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

function buildSearchQueries(body) {
  const niche = body.niche || "";
  const type = body.type || "";
  const service = body.service || "";
  const platform = body.platform || "";

  // Determine industry scope
  const isWeb3 = /web3|crypto|defi|nft|blockchain|wallet|dao|token/i.test(niche + type);
  const isSaaS = /saas|software|startup|tech/i.test(niche + type);
  const isAI = /ai|artificial intelligence|machine learning/i.test(niche + type);
  const isFintech = /fintech|finance|payment/i.test(niche + type);

  const queries = [];

  // Primary discovery queries
  queries.push(`new ${niche} startup recently launched 2024 2025 site:twitter.com OR site:x.com`);
  queries.push(`"just launched" OR "new project" ${niche} ${type} twitter handle`);

  // Industry-specific queries
  if (isWeb3 || (!isSaaS && !isAI && !isFintech)) {
    queries.push(`new crypto web3 DeFi NFT project launched 2024 2025 twitter x.com`);
    queries.push(`new blockchain wallet DAO project site:x.com 2024 2025`);
    queries.push(`"launching soon" OR "just launched" web3 project twitter 2025`);
  }
  if (isSaaS || niche === "") {
    queries.push(`new SaaS startup product launched 2024 2025 twitter`);
  }
  if (isAI || niche === "") {
    queries.push(`new AI tool product launched 2024 2025 twitter site:x.com`);
  }
  if (isFintech) {
    queries.push(`new fintech startup launched 2024 2025 twitter`);
  }

  // Platform-specific
  if (platform && /product hunt/i.test(platform)) {
    queries.push(`site:producthunt.com ${niche} new product 2024 2025`);
  }

  // Service-pain-point match
  if (service) {
    queries.push(`${niche} project "looking for" OR "need help with" ${service} twitter 2024 2025`);
  }

  return queries.slice(0, 4); // Max 4 searches to stay within free tier
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
      // Qualify mode - just pass context to AI directly
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
              content: `You are an elite growth operator qualifying leads. Quality over quantity. Return only valid JSON - no markdown, no explanation.
ACCURACY: Only state facts from the provided context. Never fabricate URLs or social handles.`,
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

    // Generate mode - Serper first, then AI qualifies
    const queries = buildSearchQueries(body);

    // Run all searches in parallel
    const searchResults = await Promise.all(
      queries.map(q => serperSearch(q, serperKey, 8))
    );

    const combinedResults = searchResults
      .filter(Boolean)
      .join("\n\n========\n\n");

    if (!combinedResults) {
      return res.status(500).json({ error: "Search returned no results. Try a different niche or industry." });
    }

    // AI qualifies the real search results
    const qualifyPrompt = `You are an elite growth operator. You have been given live Google search results for recently active projects in the following niche: ${body.niche || "tech/Web3"}.

Your job is to extract and qualify the BEST leads from these search results.

QUALIFICATION FILTERS:
- Must be a real, active project (has a website or X handle visible in results)
- Must appear recently launched or recently active (2024 or 2025 signals preferred)
- Must show pain signals: early stage, small team, no obvious professional growth operation
- Must have potential to pay for services like: ${body.service || "growth strategy, brand, marketing"}
- Skip established companies with strong brand recognition
- Prioritize Web3/crypto projects but include SaaS, AI tools, fintech if they appear strong

INDUSTRIES IN SCOPE (Web3 is priority):
Web3, DeFi, NFTs, crypto wallets, DAOs, L2s, SaaS startups, AI tools, fintech, developer tools

ABILITY TO PAY SCORING:
- 8-10: Has raised funding, hiring actively, or has visible traction
- 5-7: Early but serious - active team, product launched
- 1-4: Too early or unclear

SEARCH RESULTS FROM GOOGLE (these are REAL, live results):
${combinedResults.slice(0, 8000)}

From these real search results, extract up to 10 qualifying leads. Only include projects you can confirm exist from the search results. Return valid JSON only, no markdown:

[
  {
    "name": "Project Name",
    "website": "https://... (from search results only, empty string if not found)",
    "twitter": "@handle (from search results only, empty string if not found)",
    "industry": "Web3 / DeFi / SaaS / AI / Fintech / etc",
    "overview": "2-3 sentence description based only on search result snippets",
    "signals": {
      "activity": "Specific evidence from search results showing they are active",
      "pain": "Specific visible problem or gap based on what the search results show",
      "capability": "Why they are worth targeting - signals from search results",
      "timing": "Why now is the right time based on search result recency"
    },
    "growth_gaps": "What is clearly missing based on their online presence in the search results",
    "leverage_angle": "Where a growth strategist steps in based on their specific situation",
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

    return res.status(200).json({
      content: [{ type: "text", text }],
      searchesRun: queries.length,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}