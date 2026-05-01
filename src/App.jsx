import { useState, useEffect, useRef, useCallback } from "react";

const PINK = "#ff6eb4";
const FLAMINGO = "data:image/png;base64,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";

const fieldLabels = {
  documentType: "Document Type", attorney: "Attorney / Client",
  state: "State", county: "County", court: "Court",
  indexNumber: "Index Number", clientRef: "Client Ref #", dateFiled: "Date Filed",
  plaintiff: "Plaintiff", defendants: "Defendant(s)",
  partyToBeServed: "Party to Be Served", partyType: "Party Type",
  serveAddress: "Serve Address", courtDate: "Court Date",
  rush: "Rush", pageCount: "Page Count", efile: "E-File",
};
const wideFields = ["documentType", "attorney", "serveAddress", "defendants", "plaintiff"];

async function pdfToPages(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = pdf.numPages;
  const pages = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
  }
  return { pages, total };
}

const CLAUDE_URL = "/api/claude";

async function extractJobs(pages, fileName, total) {
  const resp = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          ...pages.map(b64 => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } })),
          {
            type: "text", text: `You are a legal document processor for a NYC process serving company. Read every page of this PDF visually and extract job data. Return one job object per party to be served.

═══ STEP 1 — IDENTIFY DOCUMENT TYPE ═══

First, identify what this PDF is. Only these types generate jobs:
- SUMMONS AND VERIFIED COMPLAINT (most common)
- SUBPOENA FOR DOCUMENT PRODUCTION
- SUBPOENA AD TESTIFICANDUM
- SUBPOENA DUCES TECUM AND AD TESTIFICANDUM

IGNORE entirely — do not create any job from:
- Notice of Electronic Filing / NYSCEF cover pages
- HIPAA Release / Authorization for Release of Health Information
- Power of Attorney to Execute HIPAA Forms
- Compliance Instructions / Instructions for Complying with Subpoena
- Certification of Business Records
- Proof of Service forms
- Any page that is clearly a supporting/administrative form

FEDERAL SUMMONS (US District Court, AO 440 form, case number like 2:26-cv-XXXXX):
- Create a job object but set all fields to blank
- Add "Federal summons — manual entry required" to flags
- Flag every field in flaggedFields

═══ STEP 2 — EXTRACT CORE FIELDS ═══

INDEX NUMBER:
- Located in top right corner of the document header
- Store exactly as it appears — including any suffix letters (e.g. 804329/2026E), two-digit years (e.g. 503765/22), or federal formats
- indexNumber and clientRef always get the same value

DATE FILED:
- For summons: find the clerk stamp in the document header — it reads: "FILED: [COUNTY] COUNTY CLERK [MM/DD/YYYY] [HH:MM] [AM/PM]"
- Always use the clerk stamp date — never the blank "Filed:" line in the body of the summons
- For subpoenas: always leave dateFiled blank — subpoenas never have a filed date

ATTORNEY:
- Take firm name from the signature block at the bottom of the document
- Use the full firm name exactly as written

COURT DATE:
- Summons and Verified Complaint: leave blank — these do not have court dates
- Subpoenas: find the date and time the party must appear or produce records. It appears in the body text (e.g. "1st day of May, 2026 at 9:30 A.M.") — format as MM/DD/YYYY HH:MM AM/PM
- For subpoenas: flag courtDate if blank or not found
- For summons: do NOT flag courtDate — summons never have court dates, blank is correct

PLAINTIFF:
- The party above "-against-" in the caption

DEFENDANTS:
- All named defendants in the caption
- Exclude fictitious names like John Doe, Jane Doe, ABC Corp

E-FILE:
- "Yes" only if attorney is "Mikhail Yadgarov & Associates, P.C." — exact match
- "No" for all other firms

═══ STEP 3 — IDENTIFY PARTIES TO SERVE ═══

For summons: parties to serve are listed at the bottom of page 1 with their addresses, below the attorney signature block.
For subpoenas: the party to serve is on the "TO:" line near the top.

Create one job object per party. Read the verified complaint body carefully to determine party type — the complaint explicitly states each defendant's jurisdiction and state of incorporation.

═══ STEP 4 — DETERMINE PARTY TYPE AND ROUTING ═══

NATURAL PERSON:
- Name is a person's first + last name
- Complaint confirms they are "a resident of the County of..."
- → partyType: "Natural Person", serve at listed address

NY GOVERNMENT AGENCY:
- Name contains: Transit Authority, MTA, Metropolitan Transportation Authority, City of New York, NYPD, NYC DOT, NYC Housing Authority, etc.
- Complaint describes them as a "public authority" or "municipal corporation"
- → partyType: "Business/Entity", serve at the listed municipal address (NOT Secretary of State)

NY CORPORATION / BUSINESS:
- Name ends in Inc., LLC, Corp., P.C., Ltd., L.P., etc.
- Complaint states they are "organized and existing under the laws of the State of New York"
- → partyType: "Business/Entity", serveAddress: "1 COMMERCE PLAZA, 6TH FLOOR, ALBANY, NY 12260", suffix: "C/O SECRETARY OF STATE"

OUT-OF-STATE CORPORATION:
- Name ends in Inc., LLC, etc.
- Complaint states principal place of business is in another state, OR their listed address is outside NY
- → partyType: "Business/Entity", serve at the listed address on the summons, add "Out-of-state serve" to flags

SUBPOENA — ANY PARTY TYPE:
- Always serve at the listed address on the subpoena
- Never route to Secretary of State for subpoenas

═══ STEP 5 — FLAGS ═══

Add field key to flaggedFields array if: value is missing, ambiguous, or needs human review.
Always flag courtDate if blank.
Add to flags array (plain text): "Out-of-state serve", "Federal summons — manual entry required", "Continuing subpoena", "Blank filed date — used clerk stamp", or any other note for the reviewer.

═══ OUTPUT ═══

Respond ONLY with a raw JSON array — no markdown, no explanation, no preamble:
[{"documentType":"","attorney":"","state":"NY","county":"","court":"","indexNumber":"","clientRef":"","dateFiled":"","plaintiff":"","defendants":"","partyToBeServed":"","partyType":"","serveAddress":"","courtDate":"","rush":"No","pageCount":"${total}","efile":"No","suffix":"","flaggedFields":[],"flags":[],"confidence":"high"}]`
          }
        ]
      }]
    })
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Claude API error ${resp.status}`);
  }

  const data = await resp.json();
  const raw = data.content.map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error("Could not parse Claude response as JSON");
  }

  return (Array.isArray(parsed) ? parsed : [parsed]).map((job, i) => ({
    ...job,
    id: `${Date.now()}-${i}`,
    sourceFile: fileName,
    status: "pending",
    flaggedFields: job.flaggedFields || [],
    flags: job.flags || [],
    confidence: job.flaggedFields?.length > 0 ? "review" : (job.confidence || "high"),
  }));
}

async function createPSTJob(job) {
  const resp = await fetch("/api/pst", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) {
    const detail = data.details?.[0]?.ErrorCodeDescription || data.error || "Unknown error";
    throw new Error(`PST error: ${detail}`);
  }
  return data;
}

function statusTag(job) {
  if (job.status === "created") return { bg: "#000", color: "#fff", label: "Created", border: "none" };
  if (job.status === "creating") return { bg: "#f5f5f5", color: "#aaa", label: "Creating…", border: "none" };
  if (job.confidence === "review") return { bg: "#fff0f7", color: PINK, label: "Needs Review", border: `1px solid ${PINK}66` };
  return { bg: "#f5f5f5", color: "#999", label: "Ready", border: "none" };
}

function DropArea({ onFiles, compact }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const pick = (files) => {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf");
    if (pdfs.length) onFiles(pdfs);
  };
  return (
    <div style={compact ? { padding: "12px 16px 16px", borderTop: "1px solid #f0f0f0" } : {}}>
      <div
        style={{ border: `1.5px dashed ${drag ? PINK : "#ddd"}`, borderRadius: compact ? 10 : 14, padding: compact ? "14px 12px" : "52px 60px", textAlign: "center", cursor: "pointer", background: drag ? "#fff8fc" : "#fafafa", transition: "all 0.15s" }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
        onClick={() => ref.current.click()}>
        {compact
          ? <div style={{ fontSize: 12, color: "#999" }}>+ New Case (drop PDF)</div>
          : <>
              <div style={{ fontSize: 40, marginBottom: 14 }}>📎</div>
              <div style={{ fontSize: 14, color: "#555", marginBottom: 6 }}>Drop PDF here or click to browse</div>
              <div style={{ fontSize: 12, color: "#bbb" }}>Supports Summons, Subpoenas, and Notice of Electronic Filing</div>
            </>
        }
      </div>
      <input ref={ref} type="file" accept="application/pdf" multiple style={{ display: "none" }} onChange={e => pick(e.target.files)} />
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [edits, setEdits] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const check = () => { const m = window.innerWidth < 768; setMobile(m); if (m) setSidebarOpen(false); };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  const handleFiles = useCallback(async (files) => {
    setBusy(true);
    let added = 0;
    let firstId = null;
    for (const file of files) {
      try {
        const { pages, total } = await pdfToPages(file);
        const extracted = await extractJobs(pages, file.name, total);
        if (extracted.length === 0) {
          toast(`${file.name} — no jobs extracted (supporting document).`, "info");
        } else {
          setJobs(prev => [...prev, ...extracted]);
          if (!firstId) firstId = extracted[0].id;
          added += extracted.length;
        }
      } catch (e) {
        toast(`Error reading ${file.name}: ${e.message}`, "error");
      }
    }
    if (added > 0) toast(`${added} job${added > 1 ? "s" : ""} extracted — ready for review`, "success");
    if (added > 1) { setActiveId(null); setSidebarOpen(true); }
    else if (firstId) setActiveId(firstId);
    setBusy(false);
  }, [toast]);

  const handleCreateJob = useCallback(async (id) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "creating" } : j));
    try {
      const result = await createPSTJob(job);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "created", pstJobNumber: result.pstJobNumber } : j));
      toast(`Job created in PST ✓  —  PST #${result.pstJobNumber}`, "success");
      const next = jobs.find(j => j.status === "pending" && j.id !== id);
      if (next) setActiveId(next.id);
      setEditing(null);
    } catch (e) {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: "pending" } : j));
      toast(e.message, "error");
    }
  }, [jobs, toast]);

  const updateField = (id, key, val) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, [key]: val } : j));
    setEdits(prev => ({ ...prev, [`${id}-${key}`]: val }));
  };

  const cur = jobs.find(j => j.id === activeId);
  const fv = k => cur?.[k] ?? "";
  const pc = parseInt(fv("pageCount")) || 0;
  const isSub = fv("documentType").toLowerCase().includes("subpoena");
  const invoiceLines = cur ? [
    { label: "Service Fee (Local)", amount: 79 },
    { label: `Print Fee (${pc} pages × $0.20)`, amount: pc * 0.20 },
    ...(fv("efile") === "Yes" ? [{ label: "E-File Fee", amount: 15 }] : []),
    ...(isSub ? [{ label: "Witness Fee", amount: 15 }] : []),
  ] : [];
  const invoiceTotal = invoiceLines.reduce((s, l) => s + l.amount, 0);

  return (
    <div style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", background: "#fff", minHeight: "100vh", color: "#000" }}>
      <style>{`
        @keyframes bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-18px) } }
        @keyframes slidein { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: "10px 16px", borderRadius: 10, fontSize: 12, background: t.type === "error" ? "#c00" : t.type === "success" ? "#000" : "#444", color: "#fff", animation: "slidein 0.2s ease", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", maxWidth: 340, lineHeight: 1.5 }}>
            {t.msg}
          </div>
        ))}
      </div>

      {busy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.94)", zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <img src={FLAMINGO} alt="" style={{ width: 48, height: 48, animation: "bounce 0.7s ease-in-out infinite" }} />
          <div style={{ fontSize: 14, color: "#333" }}>Reading document with Claude Vision…</div>
          <div style={{ fontSize: 12, color: "#bbb" }}>Extracting all job fields</div>
        </div>
      )}

      <div style={{ height: 52, borderBottom: "1px solid #ebebeb", display: "flex", alignItems: "center", padding: "0 20px", position: "sticky", top: 0, background: "#fff", zIndex: 100 }}>
        <img src={FLAMINGO} alt="PST" onClick={() => setSidebarOpen(v => !v)} style={{ width: 32, height: 32, objectFit: "contain", cursor: "pointer" }} />
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 52px)", position: "relative" }}>
        {mobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 90 }} />
        )}

        <div style={{
          borderRight: "1px solid #ebebeb", display: "flex", flexDirection: "column",
          flexShrink: 0, background: "#fff", zIndex: 95,
          transition: "transform 0.2s ease, width 0.2s ease",
          ...(mobile
            ? { position: "fixed", top: 52, left: 0, bottom: 0, width: 270, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }
            : { width: sidebarOpen ? 270 : 0, overflow: sidebarOpen ? "visible" : "hidden" }),
        }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "16px 20px 8px", fontSize: 10, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "left" }}>
              Jobs {jobs.length > 0 && `— ${jobs.length} total`}
            </div>
            {jobs.length === 0 && <div style={{ padding: "4px 20px 16px", fontSize: 12, color: "#ccc" }}>Drop a PDF to get started</div>}
            {jobs.map(job => {
              const s = statusTag(job);
              const isActive = job.id === activeId;
              return (
                <div key={job.id}
                  onClick={() => { setActiveId(job.id); setEditing(null); if (mobile) setSidebarOpen(false); }}
                  style={{ padding: "13px 20px", cursor: "pointer", borderLeft: isActive && !mobile ? `3px solid ${PINK}` : "3px solid transparent", background: isActive ? "#fafafa" : "#fff", borderBottom: "1px solid #f5f5f5", textAlign: "left" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8, textAlign: "left" }}>
                      {job.partyToBeServed || "New Job"}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, border: s.border, whiteSpace: "nowrap", flexShrink: 0 }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#777", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2 }}>
                    {job.pstJobNumber ? `PST #${job.pstJobNumber}` : (job.indexNumber || "—")}
                  </div>
                  <div style={{ fontSize: 10, color: "#888", textAlign: "left" }}>{job.sourceFile}</div>
                </div>
              );
            })}
          </div>
          <DropArea onFiles={handleFiles} compact />
        </div>

        {jobs.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 40 }}>
            <img src={FLAMINGO} alt="" style={{ width: 64, height: 64, opacity: 0.7 }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 400, marginBottom: 8 }}>Drop a PDF to begin</div>
              <div style={{ fontSize: 13, color: "#aaa", maxWidth: 360, lineHeight: 1.7 }}>
                Claude reads each page with vision, extracts all job fields,<br />and presents them for review before creating in PST.
              </div>
            </div>
            <DropArea onFiles={handleFiles} />
          </div>
        ) : cur ? (
          <div style={{ flex: 1, overflowY: "auto", padding: mobile ? "24px 16px" : "36px 48px", minWidth: 0 }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: "#bbb", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{cur.sourceFile}</div>
                  <div style={{ fontSize: mobile ? 18 : 22, fontWeight: 400, marginBottom: 4, wordBreak: "break-word" }}>{fv("partyToBeServed") || "Untitled"}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>
                    {fv("indexNumber")}{fv("county") ? ` — ${fv("county")} County` : ""}
                    {cur.pstJobNumber && <span style={{ marginLeft: 12, color: "#000", fontWeight: 500 }}>PST #{cur.pstJobNumber}</span>}
                  </div>
                </div>
                {cur.status === "pending" && (
                  <button onClick={() => handleCreateJob(cur.id)} style={{ padding: "10px 28px", borderRadius: 20, border: "none", background: "#000", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                    ✓ Create Job
                  </button>
                )}
                {cur.status === "creating" && (
                  <span style={{ padding: "10px 24px", borderRadius: 20, background: "#f5f5f5", color: "#aaa", fontSize: 13 }}>Creating…</span>
                )}
                {cur.status === "created" && (
                  <span style={{ padding: "10px 24px", borderRadius: 20, background: "#000", color: "#fff", fontSize: 13 }}>Created</span>
                )}
              </div>

              {(cur.flags || []).length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {cur.flags.map((f, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: "#f5f5f5", color: "#555" }}>{f}</span>
                  ))}
                </div>
              )}

              {cur.confidence === "review" && cur.status === "pending" && (
                <div style={{ marginTop: 12, fontSize: 12, color: "#888", padding: "10px 16px", background: "#fff8fb", borderRadius: 8, border: `1px solid ${PINK}22` }}>
                  Fields marked <span style={{ color: PINK }}>•</span> need attention. Click any field to edit inline.
                </div>
              )}
            </div>

            <div style={{ height: 1, background: "#f0f0f0", marginBottom: 28 }} />

            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 1, background: "#f0f0f0", border: "1px solid #f0f0f0" }}>
              {Object.entries(fieldLabels).map(([key, label]) => {
                const wide = wideFields.includes(key);
                const isEdit = editing === `${cur.id}-${key}`;
                const val = fv(key);
                const corrected = edits[`${cur.id}-${key}`] !== undefined;
                const flagged = (cur.flaggedFields || []).includes(key);
                const canEdit = cur.status === "pending";
                return (
                  <div key={key} style={{ gridColumn: mobile ? "span 1" : wide ? "span 3" : "span 1", background: val ? "#fff" : "transparent", padding: "14px 18px", outline: flagged ? `1.5px solid ${PINK}` : "none" }}>
                    <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>
                      {flagged && <span style={{ color: PINK, fontSize: 15, lineHeight: 1 }}>•</span>}
                      {label}
                      {corrected && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "#f5f5f5", color: "#aaa", marginLeft: 4 }}>edited</span>}
                    </div>
                    {isEdit ? (
                      <input autoFocus value={val}
                        onChange={e => updateField(cur.id, key, e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={e => e.key === "Enter" && setEditing(null)}
                        style={{ width: "100%", border: "none", borderBottom: "1px solid #000", outline: "none", fontSize: 13, fontFamily: "inherit", padding: "2px 0", background: "transparent", boxSizing: "border-box" }} />
                    ) : (
                      <div onClick={() => canEdit && setEditing(`${cur.id}-${key}`)}
                        style={{ fontSize: 13, color: val ? "#000" : "#ddd", cursor: canEdit ? "text" : "default", minHeight: 20, lineHeight: 1.5, textAlign: "left" }}>
                        {val || "—"}
                      </div>
                    )}
                  </div>
                );
              })}

              {fv("suffix") && (
                <div style={{ gridColumn: mobile ? "span 1" : "span 3", background: "#fff", padding: "14px 18px" }}>
                  <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Suffix</div>
                  <div style={{ fontSize: 13 }}>{fv("suffix")}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 32, marginBottom: 48 }}>
              <div style={{ fontSize: 10, color: "#888", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Invoice Preview</div>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 2 }}>
                {invoiceLines.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}>
                    <span style={{ color: "#888" }}>{item.label}</span>
                    <span>${item.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 18px", fontSize: 13, fontWeight: 600 }}>
                  <span>Total</span><span>${invoiceTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 13, color: "#ccc" }}>Select a job from the sidebar</div>
          </div>
        )}
      </div>
    </div>
  );
}
