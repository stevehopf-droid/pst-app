// POST /api/theiserver/send
// Body: { job } — the same job object already used for PST creation, which by
// this point should also have job.pstJobNumber (set after Create Job succeeds)
// and job.server (the roster entry Nick picked, if any).
//
// Builds the XML-ready fields TheIServer expects (see the sample Balwinder
// Singh job) and stores them in Redis for the feed endpoint to serve.
//
// This does NOT call TheIServer directly — TheIServer polls our feed.js
// endpoint on its own schedule. This route only queues the data.

import { queueJob } from "./_theiserverStore.js";

function parseAddressForTheIServer(fullAddress) {
  // Mirrors the address-splitting logic in pst.js, but returns the fields
  // in the shape TheIServer's <A> element expects.
  if (!fullAddress) return { addr: "", city: "", state: "", zip: "" };

  const parts = fullAddress.split(",").map((p) => p.trim());
  const lastPart = parts[parts.length - 1] || "";
  const lastTokens = lastPart.trim().split(/\s+/);
  const zip = lastTokens[lastTokens.length - 1] || "";
  const state = lastTokens.slice(0, -1).join(" ");

  if (parts.length >= 3) {
    return {
      addr: parts[0],
      city: parts[parts.length - 2],
      state,
      zip,
    };
  }

  return { addr: fullAddress, city: "", state: "", zip: "" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { job } = req.body || {};
  if (!job) return res.status(400).json({ error: "No job data provided" });

  if (!job.pstJobNumber) {
    return res.status(400).json({
      error: "Job must be created in PST before sending to TheIServer",
    });
  }

  if (!job.server) {
    return res.status(400).json({
      error: "A server must be assigned to this job before sending to TheIServer",
    });
  }

  try {
    const addr = parseAddressForTheIServer(job.serveAddress);

    const data = {
      jobNum: job.pstJobNumber,
      court: job.court || "",
      county: job.county || "",
      plaintiff: job.plaintiff || "",
      defendant: job.defendants || "",
      caseNo: job.indexNumber || "",
      servee: job.partyToBeServed || "",
      docs: job.documentType || "",
      ljr: job.clientRef || "",
      server: job.server.name || "",
      serverLicense: job.server.license || "",
      serverId: job.server.theiserverId || "",
      subServerId: job.server.license || "",
      addr: addr.addr,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
    };

    await queueJob(String(job.pstJobNumber), data);

    return res.status(200).json({ success: true, queued: data });
  } catch (err) {
    console.error("Error queuing job for TheIServer:", err);
    return res.status(500).json({ error: err.message });
  }
}
