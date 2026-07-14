// api/pst.js
// Vercel serverless function — handles all PST Toolbox API interactions
// Keeps credentials server-side. Called by the app when Nick clicks Create Job.

const PST_BASE = "https://pstapi.dbsinfo.com";

// ─── State name <-> abbreviation maps ────────────────────────────────────────
const STATE_TO_ABBR = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
  "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
  "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
  "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH",
  "new jersey":"NJ","new mexico":"NM","new york":"NY","north carolina":"NC",
  "north dakota":"ND","ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA",
  "rhode island":"RI","south carolina":"SC","south dakota":"SD","tennessee":"TN",
  "texas":"TX","utah":"UT","vermont":"VT","virginia":"VA","washington":"WA",
  "west virginia":"WV","wisconsin":"WI","wyoming":"WY","district of columbia":"DC"
};

const ABBR_TO_STATE = Object.fromEntries(
  Object.entries(STATE_TO_ABBR).map(([full, abbr]) => [
    abbr,
    full.replace(/\b\w/g, c => c.toUpperCase())
  ])
);

// Returns 2-letter abbreviation — used for Party/Address State field
function normalizeStateAbbr(s) {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_TO_ABBR[trimmed.toLowerCase()] || trimmed;
}

// Returns full state name — used for Case State field (per PST API docs example: "State":"Florida")
function normalizeStateFull(s) {
  if (!s) return "";
  const trimmed = s.trim();
  if (trimmed.length === 2) {
    return ABBR_TO_STATE[trimmed.toUpperCase()] || trimmed;
  }
  if (STATE_TO_ABBR[trimmed.toLowerCase()]) {
    return trimmed.replace(/\b\w/g, c => c.toUpperCase());
  }
  return trimmed;
}

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
  const normalize = s => s.replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();

  const searchResp = await fetch(
    `${PST_BASE}/entities?SearchText=${encodeURIComponent(firmName)}&SearchBy=FirmName&ActiveOnly=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchResp.json();

  if (searchData.Entities && searchData.Entities.length > 0) {
    const exact = searchData.Entities.find(
      e => e.FirmName && normalize(e.FirmName) === normalize(firmName)
    );
    return (exact || searchData.Entities[0]).SerialNumber;
  }

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

// ─── Update existing case's client reference number ───────────────────────────
// Ensures ClientReferenceNumber is always set, even when reusing a case found
// from a prior job (e.g. multiple parties on the same summons/index number).
async function updateCaseClientReference(token, caseSerialNumber, entitySerialNumber, clientRef) {
  await fetch(`${PST_BASE}/cases`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Case: {
        SerialNumber: caseSerialNumber,
        CaseClientSpecifics: {
          ClientSerialNumber: entitySerialNumber,
          ClientReferenceNumber: clientRef,
        },
      },
    }),
  });
  // Best-effort — if this fails we still proceed; the Job-level ClientReferenceNumber is set separately as a fallback.
}

// ─── Case lookup/create ───────────────────────────────────────────────────────
async function findOrCreateCase(token, job, entitySerialNumber) {
  const clientRef = job.clientRef || job.indexNumber;

  const searchResp = await fetch(
    `${PST_BASE}/cases?CaseNumber=${encodeURIComponent(job.indexNumber)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchResp.json();

  if (searchData.Cases && searchData.Cases.length > 0) {
    const existingCaseSerial = searchData.Cases[0].SerialNumber;
    // Existing case found — make sure the client reference number is set on it too,
    // since it may have been created without one (e.g. by an earlier party on the same case).
    await updateCaseClientReference(token, existingCaseSerial, entitySerialNumber, clientRef);
    return existingCaseSerial;
  }

  const createResp = await fetch(`${PST_BASE}/cases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Case: {
        CaseNumber: job.indexNumber,
        State: normalizeStateFull(job.state) || "New York",
        County: job.county || "Kings",
        PlainTitle: "Plaintiff",
        Plaintiff: job.plaintiff || "",
        DefendTitle: "Defendant",
        Defendant: job.defendants || "",
        TypeCourt: job.court || "Supreme Court",
        ...(job.dateFiled ? { FileDate: job.dateFiled } : {}),
        CaseClientSpecifics: {
          ClientSerialNumber: entitySerialNumber,
          ClientReferenceNumber: clientRef,
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
  if (!fullAddress) return { address1: "", address2: "", city: "", state: "", zip: "" };

  const parts = fullAddress.split(",").map(p => p.trim());

  const lastPart = parts[parts.length - 1] || "";
  const lastTokens = lastPart.trim().split(/\s+/);
  const zip = lastTokens[lastTokens.length - 1] || "";
  const stateRaw = lastTokens.slice(0, -1).join(" ");
  const state = normalizeStateAbbr(stateRaw); // Party/Address State stays abbreviated per PST docs example

  if (parts.length >= 4) {
    return {
      address1: parts[0],
      address2: parts[1],
      city: parts[parts.length - 2],
      state,
      zip,
    };
  } else if (parts.length === 3) {
    return {
      address1: parts[0],
      address2: "",
      city: parts[1],
      state,
      zip,
    };
  }

  return { address1: fullAddress, address2: "", city: "", state: "", zip: "" };
}

// ─── Split natural person name into first/last ────────────────────────────────
function splitName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0], needsReview: false };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1], needsReview: false };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    needsReview: true,
  };
}

// ─── Build party to be served model ──────────────────────────────────────────
function buildPartyToBeServed(job) {
  const addr = parseAddress(job.serveAddress);
  const isNaturalPerson = job.partyType === "Natural Person";

  let firstName = "";
  let lastName = job.partyToBeServed || "";

  if (isNaturalPerson) {
    const split = splitName(job.partyToBeServed);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  return {
    IsRepresentativeToBeServed: true,
    PartyType: isNaturalPerson ? "NaturalPerson" : "Corporation",
    FirstName: firstName,
    LastName: lastName,
    Suffix: job.suffix || "",
    Address1: addr.address1,
    Address2: addr.address2,
    City: addr.city,
    State: addr.state,
    Zip: addr.zip,
    AddressType: "Other",
  };
}

// ─── Build job servers array (optional) ──────────────────────────────────────
function buildJobServers(job) {
  if (!job.server || !job.server.pstServerSerialNumber) return [];
  return [
    {
      IsDefault: true,
      ServerSerialNumber: job.server.pstServerSerialNumber,
    },
  ];
}

// ─── Build invoice line items ─────────────────────────────────────────────────
function buildInvoiceLineItems(job) {
  const pageCount = parseInt(job.pageCount) || 0;
  const isSubpoena = (job.documentType || "").toLowerCase().includes("subpoena");
  const isEfile = job.efile === "Yes";

  const items = [
    {
      SalesItemId: process.env.PST_SALES_ITEM_SERVICE_FEE,
      Rate: 85.00,
      Quantity: 1,
    },
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
    const token = await getToken();
    const entitySerialNumber = await findOrCreateEntity(token, job.attorney);
    const caseSerialNumber = await findOrCreateCase(token, job, entitySerialNumber);
    const partyToBeServed = buildPartyToBeServed(job);
    const invoiceLineItems = buildInvoiceLineItems(job);
    const jobServers = buildJobServers(job);

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
        ...(jobServers.length > 0 ? { AddJobServers: jobServers } : {}),
        Invoice: {
          AddLineItems: invoiceLineItems.filter(item => item.SalesItemId),
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
