// api/pst.js
// Vercel serverless function — handles all PST Toolbox API interactions
// Keeps credentials server-side. Called by the app when Nick clicks Create Job.

const PST_BASE = "https://pstapi.dbsinfo.com";

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    apiusername: process.env.PST_API_USERNAME,
    apipassword: process.env.PST_API_PASSWORD,
    dbscode: process.env.PST_DBS_CODE,
  });

  const resp = await fetch(`${PST_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`PST auth failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("No token returned from PST");
  return data.access_token;
}

// ─── Entity lookup/create (attorney + client) ─────────────────────────────────
async function findOrCreateEntity(token, firmName) {
  // Search for existing entity by firm name
  const searchResp = await fetch(
    `${PST_BASE}/entities?SearchText=${encodeURIComponent(firmName)}&SearchBy=FirmName&EntityType=Attorney&ActiveOnly=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchResp.json();

  if (searchData.Entities && searchData.Entities.length > 0) {
    // Found — return the serial number of the first match
    return searchData.Entities[0].SerialNumber;
  }

  // Not found — create new entity
  const createResp = await fetch(`${PST_BASE}/entities`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Entity: {
        FirmName: firmName,
        ClientActive: true,
        IsClient: true,
        IsAttorney: true,
        IsServer: false,
        EntityDefaultsToUse: "Attorney",
      },
    }),
  });

  const createData = await createResp.json();
  if (!createData.IsSuccess) {
    throw new Error(`Failed to create entity: ${JSON.stringify(createData.TransactionErrors)}`);
  }
  return createData.Entity.SerialNumber;
}

// ─── Case lookup/create ───────────────────────────────────────────────────────
async function findOrCreateCase(token, job, entitySerialNumber) {
  // Search for existing case by case number
  const searchResp = await fetch(
    `${PST_BASE}/cases?CaseNumber=${encodeURIComponent(job.indexNumber)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchResp.json();

  if (searchData.Cases && searchData.Cases.length > 0) {
    return searchData.Cases[0].SerialNumber;
  }

  // Not found — create new case
  const createResp = await fetch(`${PST_BASE}/cases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Case: {
        CaseNumber: job.indexNumber,
        State: job.state || "NY",
        County: job.county || "Kings",
        PlainTitle: "Plaintiff",
        Plaintiff: job.plaintiff || "",
        DefendTitle: "Defendant",
        Defendant: job.defendants || "",
        TypeCourt: job.court || "Supreme Court",
        ...(job.dateFiled ? { FileDate: job.dateFiled } : {}),
        CaseClientSpecifics: {
          ClientSerialNumber: entitySerialNumber,
          ClientReferenceNumber: job.clientRef || job.indexNumber,
        },
      },
    }),
  });

  const createData = await createResp.json();
  if (!createData.IsSuccess) {
    throw new Error(`Failed to create case: ${JSON.stringify(createData.TransactionErrors)}`);
  }
  return createData.Case.SerialNumber;
}

// ─── Parse serve address into components ─────────────────────────────────────
function parseAddress(fullAddress) {
  // Expected format: "123 Main St, City, NY 12345"
  // or "1 COMMERCE PLAZA, 6TH FLOOR, ALBANY, NY 12260"
  if (!fullAddress) return { address1: "", address2: "", city: "", state: "", zip: "" };

  const parts = fullAddress.split(",").map(p => p.trim());

  if (parts.length >= 4) {
    // Has a floor/suite line
    const stateZip = parts[parts.length - 1].trim().split(" ");
    return {
      address1: parts[0],
      address2: parts[1],
      city: parts[parts.length - 2],
      state: stateZip[0] || "",
      zip: stateZip[1] || "",
    };
  } else if (parts.length === 3) {
    const stateZip = parts[2].trim().split(" ");
    return {
      address1: parts[0],
      address2: "",
      city: parts[1],
      state: stateZip[0] || "",
      zip: stateZip[1] || "",
    };
  }

  return { address1: fullAddress, address2: "", city: "", state: "", zip: "" };
}

// ─── Build party to be served model ──────────────────────────────────────────
function buildPartyToBeServed(job) {
  const addr = parseAddress(job.serveAddress);
  const isNaturalPerson = job.partyType === "Natural Person";

  // For natural persons split name into first/last
  let firstName = "";
  let lastName = job.partyToBeServed || "";
  if (isNaturalPerson) {
    const nameParts = (job.partyToBeServed || "").trim().split(" ");
    firstName = nameParts.slice(0, -1).join(" ");
    lastName = nameParts[nameParts.length - 1] || "";
  }

  return {
    PartyType: isNaturalPerson ? "NaturalPerson" : "Corporation",
    FirstName: firstName,
    LastName: isNaturalPerson ? lastName : "",
    FirmName: isNaturalPerson ? "" : (job.partyToBeServed || ""),
    Suffix: job.suffix || "",
    Address1: addr.address1,
    Address2: addr.address2,
    City: addr.city,
    State: addr.state,
    Zip: addr.zip,
    AddressType: "Other",
  };
}

// ─── Build invoice line items ─────────────────────────────────────────────────
// Note: SalesItemId GUIDs must match what's configured in Nick's PST account.
// These are placeholders — Nick needs to look up actual SalesItemIds from PST.
function buildInvoiceLineItems(job) {
  const pageCount = parseInt(job.pageCount) || 0;
  const isSubpoena = (job.documentType || "").toLowerCase().includes("subpoena");
  const isEfile = job.efile === "Yes";

  const items = [
    // Service Fee — replace SalesItemId with actual value from PST
    {
      SalesItemId: process.env.PST_SALES_ITEM_SERVICE_FEE,
      Rate: 79.00,
      Quantity: 1,
    },
    // Print Fee
    {
      SalesItemId: process.env.PST_SALES_ITEM_PRINT_FEE,
      Rate: 0.20,
      Quantity: pageCount,
    },
  ];

  if (isEfile) {
    items.push({
      SalesItemId: process.env.PST_SALES_ITEM_EFILE_FEE,
      Rate: 15.00,
      Quantity: 1,
    });
  }

  if (isSubpoena) {
    items.push({
      SalesItemId: process.env.PST_SALES_ITEM_WITNESS_FEE,
      Rate: 15.00,
      Quantity: 1,
    });
  }

  return items;
}

// ─── Priority mapping ─────────────────────────────────────────────────────────
function mapPriority(rush) {
  if (!rush || rush === "No") return "Standard";
  return "Rush";
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { job } = req.body;
  if (!job) return res.status(400).json({ error: "No job data provided" });

  try {
    // Step 1 — Authenticate
    const token = await getToken();

    // Step 2 — Find or create attorney/client entity
    const entitySerialNumber = await findOrCreateEntity(token, job.attorney);

    // Step 3 — Find or create case
    const caseSerialNumber = await findOrCreateCase(token, job, entitySerialNumber);

    // Step 4 — Create the job
    const partyToBeServed = buildPartyToBeServed(job);
    const invoiceLineItems = buildInvoiceLineItems(job);

    const jobPayload = {
      Job: {
        AttorneySerialNumber: entitySerialNumber,
        ClientSerialNumber: entitySerialNumber,
        CaseSerialNumber: caseSerialNumber,
        ClientReferenceNumber: job.clientRef || job.indexNumber,
        DocumentsToServe: job.documentType || "",
        ...(job.courtDate ? { CourtDateTime: job.courtDate } : {}),
        Priority: mapPriority(job.rush),
        PartyToBeServed: partyToBeServed,
        Invoice: {
          AddLineItems: invoiceLineItems.filter(item => item.SalesItemId), // skip any missing SalesItemIds
        },
      },
    };

    const createResp = await fetch(`${PST_BASE}/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobPayload),
    });

    const createData = await createResp.json();

    if (!createData.IsSuccess) {
      return res.status(400).json({
        error: "PST job creation failed",
        details: createData.TransactionErrors,
      });
    }

    // Return the PST job number so we can display it in the UI
    return res.status(200).json({
      success: true,
      pstJobNumber: createData.Job?.JobNumber,
      caseSerialNumber,
      entitySerialNumber,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
