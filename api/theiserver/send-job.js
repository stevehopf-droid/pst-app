// api/theiserver/send-job.js
//
// Called by the "Send to TheIServer" button in App.jsx.
// Expects a POST body shaped like:
// {
//   pstJobNumber: "2026000481",
//   court: "Supreme Court",
//   courtCounty: "Bronx",
//   caseNo: "812341/2026E",
//   plaintiff: "JOSE IMBERT GUZMAN",
//   defendant: "BALWINDER SINGH",
//   servee: "BALWINDER SINGH",
//   documents: "Summons and Complaint",
//   address1: { addr: "22036 93rd Road", city: "Queens Village", state: "NY", zip: "11428" },
//   address2: { addr: "", city: "", state: "", zip: "" },   // optional
//   server: { name: "Fade Masoud", theiserverId: "2091185" }
// }
//
// NOTE: pst-app is intentionally stateless (no job database) — this
// route does not look anything up itself. The frontend must pass the
// full job + server data it already has in memory. The frontend is
// also responsible for tracking that a job has been sent (see App.jsx
// changes) so this route can be safely called only once per job —
// TheIServer does NOT dedupe on jobid; calling this twice for the
// same job creates two separate entries on their end.

import { submitManualJob } from "./manualSubmit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const {
    pstJobNumber,
    court,
    courtCounty,
    caseNo,
    plaintiff,
    defendant,
    servee,
    documents,
    address1,
    address2,
    server,
  } = req.body || {};

  // Basic validation — fail fast with a clear message rather than
  // sending a partially-blank submission to TheIServer.
  const missing = [];
  if (!pstJobNumber) missing.push("pstJobNumber");
  if (!court) missing.push("court");
  if (!courtCounty) missing.push("courtCounty");
  if (!caseNo) missing.push("caseNo");
  if (!defendant) missing.push("defendant");
  if (!servee) missing.push("servee");
  if (!documents) missing.push("documents");
  if (!address1 || !address1.addr) missing.push("address1.addr");
  if (!server || !server.theiserverId) {
    missing.push("server.theiserverId");
  }

  if (missing.length > 0) {
    res.status(400).json({
      error: "Missing required field(s) for TheIServer submission",
      missing,
    });
    return;
  }

  try {
    const result = await submitManualJob({
      jobid: pstJobNumber,
      court,
      courtcounty: courtCounty,
      caseno: caseNo,
      plf: plaintiff || "",
      def: defendant,
      servee,
      docs: documents,
      addr1: address1.addr,
      city1: address1.city || "",
      state1: address1.state || "",
      zip1: address1.zip || "",
      addr2: address2?.addr || "",
      city2: address2?.city || "",
      state2: address2?.state || "",
      zip2: address2?.zip || "",
      serverid: server.theiserverId,
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("TheIServer manual submit failed:", err.message);
    res.status(502).json({ error: err.message });
  }
}
