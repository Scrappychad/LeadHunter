import { useState } from "react";

const G = {
  bg: "#06060a", surface: "#0f0f16", surface2: "#15151f",
  border: "#1e1e2a", accent: "#f97316", accent2: "#ea580c",
  text: "#e8e8f0", muted: "#4a4a6a", radius: 14,
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:#1e1e2a;border-radius:4px}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
`;

function cleanText(t) {
  return t.replace(/\u2014/g, "-").replace(/\u2013/g, "-");
}

async function askGroq(messages, maxTokens = 5000, websiteUrl = null) {
  const body = { messages, max_tokens: maxTokens };
  if (websiteUrl) body.websiteUrl = websiteUrl;
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  if (!text) throw new Error("Empty response");
  return cleanText(text);
}

function parseBold(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p);
}

function renderContent(text) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        const numbered = t.match(/^(\d+[\.\)])\s+(.+)/);
        const bulleted = t.match(/^[-•]\s+(.+)/);
        if (numbered) return (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5 }}>
            <span style={{ flexShrink: 0, fontWeight: 700, color: G.accent, fontFamily: "IBM Plex Mono, monospace", fontSize: "0.82rem" }}>{numbered[1]}</span>
            <span>{parseBold(numbered[2])}</span>
          </div>
        );
        if (bulleted) return (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5 }}>
            <span style={{ flexShrink: 0, color: G.accent }}>-</span>
            <span>{parseBold(bulleted[1])}</span>
          </div>
        );
        if (t === "") return <div key={i} style={{ height: 5 }} />;
        return <p key={i} style={{ marginBottom: 5, lineHeight: 1.75 }}>{parseBold(line)}</p>;
      })}
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${G.border}`, borderTopColor: G.accent, animation: "spin 0.8s linear infinite" }} />;
}

function ModeToggle({ mode, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: G.surface2, border: `1px solid ${G.border}`, borderRadius: 50, padding: 4, gap: 4 }}>
      {[{ id: "generate", label: "Generate Leads" }, { id: "qualify", label: "Qualify Leads" }].map(m => (
        <button key={m.id} onClick={() => onChange(m.id)} style={{
          padding: "8px 20px", borderRadius: 50, border: "none",
          background: mode === m.id ? G.accent : "transparent",
          color: mode === m.id ? "#000" : G.muted,
          fontFamily: "Space Grotesk, sans-serif", fontWeight: mode === m.id ? 700 : 500,
          fontSize: "0.8rem", cursor: "pointer", transition: "all 0.2s",
        }}>{m.label}</button>
      ))}
    </div>
  );
}

const baseInput = {
  width: "100%", background: G.surface2, border: `1px solid ${G.border}`,
  borderRadius: G.radius, padding: "11px 14px", color: G.text,
  fontFamily: "Space Grotesk, sans-serif", fontSize: "0.88rem", outline: "none",
};

function TInput({ label, value, onChange, placeholder, hint }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.muted, marginBottom: 5, fontFamily: "Space Grotesk, sans-serif" }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...baseInput, borderColor: f ? G.accent : G.border, transition: "border-color 0.2s" }}
        onFocus={() => setF(true)} onBlur={() => setF(false)} />
      {hint && <div style={{ fontSize: "0.67rem", color: G.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function TArea({ label, value, onChange, placeholder, rows = 4, hint }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.muted, marginBottom: 5, fontFamily: "Space Grotesk, sans-serif" }}>{label}</div>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ ...baseInput, resize: "vertical", lineHeight: 1.6, borderColor: f ? G.accent : G.border, transition: "border-color 0.2s" }}
        onFocus={() => setF(true)} onBlur={() => setF(false)} />
      {hint && <div style={{ fontSize: "0.67rem", color: G.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────

function buildGeneratePrompt(f) {
  return `You are an elite growth operator identifying high-quality, high-probability leads.
Your job is NOT to list many leads. Find only the most promising ones.
Strictly filter out weak, inactive, or low-quality projects.

Apply these filters to every lead before including it:
- Active presence (recent posts, updates, visible activity)
- Visible growth effort or momentum
- Clear pain points and weaknesses
- Signs of seriousness (team, branding, product)
- Potential ability to pay for services

TARGET PROFILE:
- Niche/Industry: ${f.niche}
- Type: ${f.type || "Web2 and Web3"}
- Service being offered: ${f.service || "growth strategy, brand architecture, marketing"}
- Ideal client description: ${f.description || "Not specified"}
- Platform to find them on: ${f.platform || "Any"}

CRITICAL: Respond ONLY with a valid JSON array. No markdown, no preamble, no explanation. Just the raw JSON.

Return exactly 10 leads in this format:
[
  {
    "name": "Company/Project Name",
    "website": "https://...",
    "twitter": "@handle",
    "industry": "Web3 / Web2 / SaaS / etc",
    "overview": "2-3 sentence description of what they do and where they are",
    "signals": {
      "activity": "Specific evidence they are active right now",
      "pain": "Specific visible problem or gap",
      "capability": "Why they are worth targeting - budget signals, team size, traction",
      "timing": "Why now is the right moment to reach out"
    },
    "growth_gaps": "Precise description of exactly what is not working for them",
    "leverage_angle": "Specific entry point where a growth strategist adds immediate value",
    "score": 8,
    "outreach": "4-5 sentence personalized message. Hyper-specific observation. No fluff. No generic lines. Must feel written after real analysis."
  }
]`;
}

function buildQualifyPrompt(f) {
  return `You are an elite growth operator qualifying leads for high-probability outreach.
Your job is to analyze the provided context and identify only the strongest leads.
Strictly filter out weak, inactive, or low-quality prospects.

Apply these filters:
- Active presence (recent posts, updates)
- Visible growth effort
- Clear pain points
- Signs of seriousness (team, branding, product)
- Potential ability to pay

SERVICE CONTEXT:
- Service being offered: ${f.service || "growth strategy, brand architecture, marketing"}
- Target niche: ${f.niche || "Not specified"}

RAW CONTEXT TO ANALYZE:
${f.context}

CRITICAL: Respond ONLY with a valid JSON array. No markdown, no preamble, no explanation. Just the raw JSON.

From the context provided, extract and qualify up to 10 leads. For each one that passes your filters:
[
  {
    "name": "Company/Project Name",
    "website": "https://... (if found in context)",
    "twitter": "@handle (if found in context)",
    "industry": "Web3 / Web2 / SaaS / etc",
    "overview": "2-3 sentence description based on the context provided",
    "signals": {
      "activity": "Specific evidence from context showing they are active",
      "pain": "Specific problem visible in the context",
      "capability": "Why they are worth targeting based on context signals",
      "timing": "Why now is the right moment based on what you see"
    },
    "growth_gaps": "Precise gaps visible from the context",
    "leverage_angle": "Where a growth strategist steps in based on their specific situation",
    "score": 8,
    "outreach": "4-5 sentence personalized message referencing something specific from the context. No fluff. Must feel written after real analysis."
  }
]`;
}

// ─── PARSER ───────────────────────────────────────────────────────────────────

function parseLeads(raw) {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) return null;
    const arr = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr;
  } catch {
    return null;
  }
}

// ─── SCORE BADGE ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  const color = score >= 8 ? "#22c55e" : score >= 6 ? G.accent : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.78rem", color, fontFamily: "IBM Plex Mono, monospace" }}>{score}</div>
      <div style={{ fontSize: "0.65rem", color: G.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{score >= 8 ? "Hot" : score >= 6 ? "Warm" : "Cold"}</div>
    </div>
  );
}

// ─── LEAD CARD ────────────────────────────────────────────────────────────────

function LeadCard({ lead, index, expanded, onToggle }) {
  return (
    <div style={{ background: G.surface, border: `1px solid ${expanded ? G.accent + "44" : G.border}`, borderRadius: G.radius, overflow: "hidden", transition: "border-color 0.2s", animation: `fadeUp 0.3s ease ${index * 0.05}s both` }}>
      <div onClick={onToggle} style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${G.accent}18`, border: `1px solid ${G.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: G.accent, fontFamily: "IBM Plex Mono, monospace", flexShrink: 0 }}>
            {String(index + 1).padStart(2, "0")}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", fontFamily: "Space Grotesk, sans-serif", color: G.text, marginBottom: 2 }}>{lead.name}</div>
            <div style={{ fontSize: "0.72rem", color: G.muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {lead.industry && <span style={{ background: G.surface2, padding: "1px 8px", borderRadius: 20, border: `1px solid ${G.border}` }}>{lead.industry}</span>}
              {lead.website && <span style={{ color: G.accent + "aa" }}>{lead.website.replace("https://", "").replace("http://", "").split("/")[0]}</span>}
              {lead.twitter && <span>{lead.twitter}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <ScoreBadge score={lead.score || 7} />
          <div style={{ color: G.muted, fontSize: "0.8rem", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▾</div>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${G.border}`, padding: "20px", animation: "fadeIn 0.2s ease" }}>

          <Section label="Overview" icon="◈">{renderContent(lead.overview)}</Section>

          <div style={{ marginBottom: 18 }}>
            <SectionLabel label="Signal Breakdown" icon="◎" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { key: "activity", label: "Activity Signal" },
                { key: "pain", label: "Pain Signal" },
                { key: "capability", label: "Capability Signal" },
                { key: "timing", label: "Timing Signal" },
              ].map(s => (
                <div key={s.key} style={{ background: G.surface2, borderRadius: 10, padding: "12px 14px", border: `1px solid ${G.border}` }}>
                  <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: G.accent, marginBottom: 6, fontFamily: "Space Grotesk, sans-serif", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: "0.83rem", color: "#ccc", lineHeight: 1.65 }}>{parseBold(lead.signals?.[s.key] || "N/A")}</div>
                </div>
              ))}
            </div>
          </div>

          <Section label="Growth Gaps" icon="▽">{renderContent(lead.growth_gaps)}</Section>
          <Section label="Leverage Angle" icon="◆">{renderContent(lead.leverage_angle)}</Section>

          <div style={{ marginBottom: 18 }}>
            <SectionLabel label="Outreach Message" icon="▶" />
            <div style={{ background: `${G.accent}08`, border: `1px solid ${G.accent}33`, borderRadius: 10, padding: "16px 18px", fontSize: "0.88rem", color: "#ddd", lineHeight: 1.8, fontStyle: "italic", position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12 }}>
                <CopyBtn text={lead.outreach} />
              </div>
              {parseBold(lead.outreach)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" style={{ fontSize: "0.72rem", color: G.accent, textDecoration: "none", background: G.surface2, border: `1px solid ${G.border}`, padding: "6px 12px", borderRadius: 8 }}>Visit Website ↗</a>}
            {lead.twitter && <a href={`https://x.com/${lead.twitter.replace("@", "")}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.72rem", color: G.accent, textDecoration: "none", background: G.surface2, border: `1px solid ${G.border}`, padding: "6px 12px", borderRadius: 8 }}>View X Profile ↗</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ label, icon }) {
  return (
    <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.accent, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, fontFamily: "Space Grotesk, sans-serif", fontWeight: 600 }}>
      <span>{icon}</span>{label}
    </div>
  );
}

function Section({ label, icon, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel label={label} icon={icon} />
      <div style={{ fontSize: "0.86rem", color: "#ccc", lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ fontSize: "0.65rem", color: copied ? "#22c55e" : G.muted, background: "none", border: "none", cursor: "pointer", fontFamily: "Space Grotesk, sans-serif" }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── RESULTS VIEW ────────────────────────────────────────────────────────────

function ResultsView({ leads, formData, mode, onReset }) {
  const [expanded, setExpanded] = useState(0);
  const toggle = i => setExpanded(expanded === i ? null : i);

  const exportCSV = () => {
    const headers = ["#", "Name", "Website", "Twitter", "Industry", "Score", "Overview", "Pain Signal", "Growth Gaps", "Leverage Angle", "Outreach Message"];
    const rows = leads.map((l, i) => [
      i + 1, l.name, l.website || "", l.twitter || "", l.industry || "",
      l.score || "", `"${(l.overview || "").replace(/"/g, "'")}"`,
      `"${(l.signals?.pain || "").replace(/"/g, "'")}"`,
      `"${(l.growth_gaps || "").replace(/"/g, "'")}"`,
      `"${(l.leverage_angle || "").replace(/"/g, "'")}"`,
      `"${(l.outreach || "").replace(/"/g, "'")}"`
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `leads-${formData.niche || "hunt"}-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const copyAll = () => {
    const text = leads.map((l, i) =>
      `${i + 1}. ${l.name} (Score: ${l.score}/10)\n${l.website || ""} ${l.twitter || ""}\n\nOVERVIEW\n${l.overview}\n\nPAIN: ${l.signals?.pain}\nGROWTH GAPS: ${l.growth_gaps}\nLEVERAGE: ${l.leverage_angle}\n\nOUTREACH:\n${l.outreach}`
    ).join("\n\n" + "=".repeat(50) + "\n\n");
    navigator.clipboard.writeText(text);
  };

  const printPDF = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Lead Hunt Report</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Space Grotesk',sans-serif;max-width:740px;margin:0 auto;color:#111;padding:48px 32px}
      .brand-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px;padding-bottom:20px;border-bottom:3px solid #f97316}
      .brand-name{font-weight:800;font-size:1.1rem;color:#06060a}
      .brand-name span{color:#ea580c}
      .brand-tag{font-size:0.68rem;color:#888;text-transform:uppercase;letter-spacing:0.1em}
      .report-title{font-size:2rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:6px;color:#06060a}
      .meta{color:#777;font-size:0.82rem;margin-bottom:36px;padding-bottom:16px;border-bottom:1px solid #eee}
      .lead{margin-bottom:40px;padding-bottom:40px;border-bottom:1px solid #eee}
      .lead-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
      .lead-name{font-size:1.1rem;font-weight:700}
      .score{font-size:0.8rem;font-weight:700;padding:4px 12px;border-radius:20px;background:#f97316;color:#000}
      h4{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:#f97316;margin:14px 0 5px;font-weight:700}
      p{line-height:1.8;color:#333;font-size:0.88rem}
      .outreach{background:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;font-style:italic;margin-top:8px}
      .footer{margin-top:48px;padding-top:14px;border-top:1px solid #eee;display:flex;justify-content:space-between}
      .footer-brand{font-weight:700;font-size:0.75rem}
      .footer-brand span{color:#ea580c}
      .footer-note{font-size:0.7rem;color:#aaa}
    </style></head><body>
    <div class="brand-header">
      <div><div class="brand-name">Fredrick Strategy <span>Lab</span></div><div class="brand-tag">Lead Hunter Agent</div></div>
      <div class="brand-tag">${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
    <div class="report-title">Lead Hunt Report</div>
    <p class="meta">Niche: <strong>${formData.niche || "N/A"}</strong> &nbsp; Mode: ${mode === "generate" ? "Generated" : "Qualified"} &nbsp; ${leads.length} leads</p>
    ${leads.map((l, i) => `
      <div class="lead">
        <div class="lead-header"><div class="lead-name">${i + 1}. ${l.name}</div><div class="score">Score: ${l.score}/10</div></div>
        <p>${l.website || ""} ${l.twitter || ""}</p>
        <h4>Overview</h4><p>${l.overview}</p>
        <h4>Pain Signal</h4><p>${l.signals?.pain || ""}</p>
        <h4>Growth Gaps</h4><p>${l.growth_gaps}</p>
        <h4>Leverage Angle</h4><p>${l.leverage_angle}</p>
        <h4>Outreach Message</h4><div class="outreach">${l.outreach}</div>
      </div>
    `).join("")}
    <div class="footer">
      <div class="footer-brand">Fredrick Strategy <span>Lab</span></div>
      <div class="footer-note">Prepared by LeadHunter - Lead Hunter Agent</div>
    </div>
    </body></html>`);
    w.document.close(); w.print();
  };

  const avgScore = Math.round(leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length);
  const hot = leads.filter(l => l.score >= 8).length;

  return (
    <div style={{ animation: "fadeUp 0.35s ease" }}>
      <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: "18px 22px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.muted, marginBottom: 2 }}>Leads Found</div>
            <div style={{ fontWeight: 800, fontSize: "1.4rem", fontFamily: "Space Grotesk, sans-serif", color: G.accent }}>{leads.length}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.muted, marginBottom: 2 }}>Hot Leads</div>
            <div style={{ fontWeight: 800, fontSize: "1.4rem", fontFamily: "Space Grotesk, sans-serif", color: "#22c55e" }}>{hot}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.muted, marginBottom: 2 }}>Avg Score</div>
            <div style={{ fontWeight: 800, fontSize: "1.4rem", fontFamily: "Space Grotesk, sans-serif" }}>{avgScore}/10</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={copyAll} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${G.border}`, background: "transparent", color: G.muted, fontFamily: "Space Grotesk, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>Copy All</button>
          <button onClick={exportCSV} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${G.accent}`, background: "transparent", color: G.accent, fontFamily: "Space Grotesk, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>Export CSV</button>
          <button onClick={printPDF} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${G.accent}`, background: "transparent", color: G.accent, fontFamily: "Space Grotesk, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>Export PDF</button>
          <button onClick={onReset} style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${G.border}`, background: G.accent, color: "#000", fontFamily: "Space Grotesk, sans-serif", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>New Hunt</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {leads.map((lead, i) => (
          <LeadCard key={i} lead={lead} index={i} expanded={expanded === i} onToggle={() => toggle(i)} />
        ))}
      </div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────

export default function LeadHunter() {
  const [mode, setMode] = useState("generate");
  const [step, setStep] = useState("form");
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState("");

  const [genForm, setGenForm] = useState({ niche: "", type: "", service: "", description: "", platform: "" });
  const setG = k => v => setGenForm(p => ({ ...p, [k]: v }));

  const [qualForm, setQualForm] = useState({ niche: "", service: "", context: "" });
  const setQ = k => v => setQualForm(p => ({ ...p, [k]: v }));

  const reset = () => {
    setStep("form"); setLeads([]); setError("");
    setGenForm({ niche: "", type: "", service: "", description: "", platform: "" });
    setQualForm({ niche: "", service: "", context: "" });
  };

  const submit = async () => {
    const form = mode === "generate" ? genForm : qualForm;
    if (mode === "generate" && !genForm.niche.trim()) { setError("Niche is required."); return; }
    if (mode === "qualify" && !qualForm.context.trim()) { setError("Paste some context to qualify."); return; }
    setError(""); setStep("loading");
    try {
      const prompt = mode === "generate" ? buildGeneratePrompt(genForm) : buildQualifyPrompt(qualForm);
      const raw = await askGroq([{ role: "user", content: prompt }], 6000);
      const parsed = parseLeads(raw);
      if (!parsed) throw new Error("AI did not return valid leads. Please try again.");
      setLeads(parsed); setStep("results");
    } catch (err) { setError(`Hunt failed: ${err.message}`); setStep("form"); }
  };

  if (step === "loading") return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><Spinner /></div>
        {(mode === "generate"
          ? ["Scanning the niche...", "Filtering weak leads...", "Scoring prospects...", "Writing outreach messages..."]
          : ["Reading your context...", "Qualifying each lead...", "Scoring prospects...", "Writing outreach messages..."]
        ).map((t, i) => (
          <div key={i} style={{ fontSize: "0.73rem", color: G.muted, fontFamily: "IBM Plex Mono, monospace", marginTop: 10, animation: `fadeUp 0.4s ease ${i * 0.18}s both` }}>{t}</div>
        ))}
      </div>
    </div>
  );

  if (step === "results") return (
    <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "Space Grotesk, sans-serif", padding: "22px 18px 40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: "1.3rem", letterSpacing: "-0.025em" }}>Lead<span style={{ color: G.accent }}>Hunter</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: G.muted }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: G.accent, animation: "pulse 2s infinite" }} />
            {mode === "generate" ? "Generated" : "Qualified"}
          </div>
        </div>
        <ResultsView leads={leads} formData={mode === "generate" ? genForm : qualForm} mode={mode} onReset={reset} />
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: G.bg, color: G.text, fontFamily: "Space Grotesk, sans-serif", padding: "22px 18px 40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div style={{ marginBottom: 28, animation: "fadeUp 0.4s ease" }}>
          <div style={{ fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.03em", marginBottom: 6 }}>Lead<span style={{ color: G.accent }}>Hunter</span></div>
          <div style={{ fontSize: "0.8rem", color: G.muted }}>Lead Hunter Agent - Fredrick Strategy Lab</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <ModeToggle mode={mode} onChange={m => { setMode(m); setError(""); }} />
          <div style={{ fontSize: "0.72rem", color: G.muted }}>
            {mode === "generate" ? "AI finds and scores 10 leads in your niche" : "Paste context and AI qualifies + scores each lead"}
          </div>
        </div>

        <div style={{ background: G.surface, border: `1px solid ${G.border}`, borderRadius: G.radius, padding: "24px", animation: "fadeUp 0.5s ease 0.1s both" }}>
          {mode === "generate" ? (
            <>
              <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.accent, marginBottom: 20, fontWeight: 600 }}>Hunt Parameters</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
                <TInput label="Niche / Industry *" value={genForm.niche} onChange={setG("niche")} placeholder="e.g. Web3 DeFi protocols, SaaS fintech startups" />
                <TInput label="Company Type" value={genForm.type} onChange={setG("type")} placeholder="e.g. Web3, Web2, Both" />
              </div>
              <TInput label="Service You're Offering" value={genForm.service} onChange={setG("service")}
                placeholder="e.g. growth strategy, brand architecture, community management"
                hint="Helps the AI find leads with matching pain points" />
              <TArea label="Ideal Client Description" value={genForm.description} onChange={setG("description")} rows={3}
                placeholder="Describe your ideal client: stage, size, problems they have, what makes them a good fit."
                hint="More detail = more targeted leads" />
              <TInput label="Platform to Source From" value={genForm.platform} onChange={setG("platform")}
                placeholder="e.g. Twitter/X, LinkedIn, Product Hunt, Discord" />
            </>
          ) : (
            <>
              <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: G.accent, marginBottom: 20, fontWeight: 600 }}>Qualify Leads</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
                <TInput label="Target Niche" value={qualForm.niche} onChange={setQ("niche")} placeholder="e.g. Web3 marketing, DeFi protocols" />
                <TInput label="Service You're Offering" value={qualForm.service} onChange={setQ("service")} placeholder="e.g. growth strategy, branding" />
              </div>
              <TArea label="Paste Context *" value={qualForm.context} onChange={setQ("context")} rows={8}
                placeholder="Paste anything: tweets, bios, website copy, LinkedIn profiles, Discord messages, newsletter excerpts. The more context you paste, the sharper the qualification."
                hint="AI will extract companies, qualify them against your filters, and write personalized outreach for each" />
            </>
          )}
        </div>

        {error && <div style={{ background: "#ff4d4d10", border: "1px solid #ff4d4d33", borderRadius: 10, padding: "12px 16px", margin: "14px 0", fontSize: "0.82rem", color: "#ff8888" }}>{error}</div>}

        <button onClick={submit} style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: G.radius, background: G.accent, border: "none", color: "#000", fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: "0.92rem", cursor: "pointer", transition: "opacity 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          {mode === "generate" ? "Hunt Leads" : "Qualify Leads"}
        </button>
        <p style={{ textAlign: "center", fontSize: "0.68rem", color: G.muted, marginTop: 10 }}>
          {mode === "generate" ? "10 qualified leads with outreach messages - 15-25 seconds" : "AI qualifies your context and writes outreach - 15-25 seconds"}
        </p>
      </div>
    </div>
  );
}
