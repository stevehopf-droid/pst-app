// api/theiserver/ldwinservices.js
//
// This is the actual endpoint TheIServer (Independent Server) calls to pull
// jobs. Per their real API documentation (theiserver.com/dca-api-documentation.html),
// this is a SOAP 1.1 service, NOT a plain REST GET — this replaces the earlier
// feed.js approach, which assumed a simple unauthenticated polling GET and was
// wrong for this protocol.
//
// Exposed at the literal path /ldwinservices.php via a rewrite in vercel.json
// (Robert's instructions were specific about that filename, so we match it
// exactly rather than using our normal /api/... convention).
//
// ─── How this works ────────────────────────────────────────────────────────
// TheIServer POSTs a SOAP envelope with SOAPAction "urn:ld#getTime" or
// "urn:ld#downloadQueue". The real payload is a STRING containing XML,
// carried inside a <jxml> element (their "XML-in-a-string" pattern — the
// SOAP layer only ever carries strings; the actual schema lives inside that
// string). That inner XML contains <username>, <password>, <ownerid>.
//
// We validate those three against env vars (THEISERVER_USERNAME,
// THEISERVER_PASSWORD, THEISERVER_OWNERID) — this is the real security
// mechanism per their docs, not something we're adding on top.
//
// getTime -> just echo back a timestamp, used as a health check.
// downloadQueue -> return the static lookup lists (statuses, manners, titles,
// etc. — verbatim, required to match exactly) plus one <Job>/<A> pair per
// job currently queued via send.js.
//
// ─── What's now CONFIRMED vs still open ────────────────────────────────────
// The response envelope shape below is confirmed against the real WSDL
// (https://data.dcacompliant.net/ldwinservices.php?wsdl) — response part
// names match the operation name itself, not a generic <return>.
//
// STILL OPEN: the WSDL also lists a third operation, addAddress, that never
// appeared in the documentation we were given. We don't implement it here —
// any call for it currently falls through to "Unknown operation". Worth
// asking Robert what it's for before assuming it's safe to ignore; it may be
// something TheIServer expects us to support (e.g. adding a second address
// to an existing job) that we're currently missing entirely.

// ─── PST live query (replaces the old Redis-queue approach) ────────────────
// Per Robert's clarification: TheIServer expects our downloadQueue handler to
// use PST's own credentials to pull whatever's currently open/unfinished in
// PST Toolbox, in real time — not a manually-queued list from our own storage.
// This means: no "Send to TheIServer" button needed anymore. Any job with a
// server assigned in PST automatically shows up here next time TheIServer polls.
//
// We still need our own server roster (api/servers) for one thing PST doesn't
// track: TheIServer's ServerID and the DCA/DCWP license number. PST only knows
// its own ServerSerialNumber — we cross-reference that against our roster's
// pstServerSerialNumber field to fill in the rest.

import { getAllServers } from "../servers/_serverStore.js";

const PST_BASE = "https://pstapi.dbsinfo.com";

async function getPstToken() {
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

// Pulls unfinished jobs from PST, with JobServers included inline
// (UseLinkedResources=false), then cross-references each assigned server
// against our own roster to fill in TheIServer-specific fields.
async function getOpenJobsForTheIServer() {
  const token = await getPstToken();

  const resp = await fetch(
    `${PST_BASE}/jobs?SearchPurpose=UnfinishedJobs&UseLinkedResources=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (!data.IsSuccess) {
    throw new Error(`PST job search failed: ${JSON.stringify(data.TransactionErrors)}`);
  }

  const roster = await getAllServers();
  const rosterByPstSerial = new Map(
    roster
      .filter((s) => s.pstServerSerialNumber)
      .map((s) => [String(s.pstServerSerialNumber), s])
  );

  const results = [];

  for (const job of data.Jobs || []) {
    const jobServers = job.JobServers?.List || [];
    if (jobServers.length === 0) continue; // no server assigned yet — skip

    for (const jobServer of jobServers) {
      const rosterMatch = rosterByPstSerial.get(String(jobServer.SerialNumber));
      if (!rosterMatch) {
        // This server has no corresponding roster entry (no theiserverId /
        // license on file for them) — we can't build a complete TheIServer
        // record without it, so skip rather than send incomplete data.
        console.warn(
          `Job ${job.JobNumber}: server ${jobServer.SerialNumber} (${jobServer.FirmName || jobServer.LastName}) has no matching roster entry — skipping.`
        );
        continue;
      }

      const p = job.PartyToBeServed || {};
      results.push({
        jobNum: job.JobNumber,
        court: job.Case?.TypeCourt || "",
        county: job.Case?.County || "",
        plaintiff: job.Case?.Plaintiff || "",
        defendant: job.Case?.Defendant || "",
        caseNo: job.Case?.CaseNumber || "",
        servee: [p.FirstName, p.LastName].filter(Boolean).join(" "),
        docs: job.DocumentsToServe || "",
        ljr: job.ClientReferenceNumber || "",
        server: rosterMatch.name,
        serverLicense: rosterMatch.license,
        serverId: rosterMatch.theiserverId,
        subServerId: rosterMatch.license,
        addr: p.Address1 || "",
        city: p.City || "",
        state: p.State || "",
        zip: p.Zip || "",
      });

      break; // only need one server entry per job for this XML shape
    }
  }

  return results;
}

// ─── SOAP helpers ───────────────────────────────────────────────────────────

const STATIC_REFERENCE_XML = `
  <!-- ===== Status items ===== -->
  <S><ID>NAD</ID><AC>No answer at the door</AC></S>
  <S><ID>UNK</ID><AC>Spoke with current resident def unknown at this address.</AC></S>
  <S><ID>NONSERVE</ID><AC>Non-service</AC></S>

  <!-- ===== Manners ===== -->
  <M><ID>23</ID><MA>CO - CORPORATE</MA></M>
  <M><ID>26</ID><MA>C - NAIL/MAIL</MA></M>
  <M><ID>29</ID><MA>P - INDIVIDUAL</MA></M>
  <M><ID>31</ID><MA>S - SUITABLE RES</MA></M>
  <M><ID>32</ID><MA>S - SUITABLE BUS</MA></M>
  <M><ID>35</ID><MA>PA - PARTNERSHIP</MA></M>
  <M><ID>36</ID><MA>V - VTL</MA></M>

  <!-- ===== Service comment dropdown options ===== -->
  <SC><ID>Cancel and Return</ID><AC>Cancel Service as per clients request</AC></SC>

  <!-- ===== Titles ===== -->
  <ST><ID>23</ID><AC>CO-TENANT</AC></ST>
  <ST><ID>23</ID><AC>CO-RESIDENT</AC></ST>
  <ST><ID>10</ID><AC>ADMINISTRATIVE ASSISTANT</AC></ST>
  <ST><ID>10</ID><AC>AGENT</AC></ST>
  <ST><ID>10</ID><AC>ASSISTANT BRANCH MANAGER</AC></ST>
  <ST><ID>10</ID><AC>ASSISTANT MANAGER</AC></ST>
  <ST><ID>10</ID><AC>ATTORNEY</AC></ST>
  <ST><ID>10</ID><AC>ATTORNEY FOR DEFENDANT</AC></ST>
  <ST><ID>10</ID><AC>AUNT</AC></ST>
  <ST><ID>10</ID><AC>AUTHORIZED AGENT</AC></ST>
  <ST><ID>10</ID><AC>BRANCH MANAGER</AC></ST>
  <ST><ID>10</ID><AC>BROTHER</AC></ST>
  <ST><ID>10</ID><AC>BROTHER-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>CIVIL CLERK</AC></ST>
  <ST><ID>10</ID><AC>CLAIMS ADJUSTER</AC></ST>
  <ST><ID>10</ID><AC>CLAIMS ADMINISTRATOR</AC></ST>
  <ST><ID>10</ID><AC>CLAIMS CLERK</AC></ST>
  <ST><ID>10</ID><AC>CLERK</AC></ST>
  <ST><ID>10</ID><AC>CO-OCCUPANT</AC></ST>
  <ST><ID>10</ID><AC>CO-WORKER</AC></ST>
  <ST><ID>10</ID><AC>COUSIN</AC></ST>
  <ST><ID>10</ID><AC>CUSTOMER SERVICE REPRESENTATIVE</AC></ST>
  <ST><ID>10</ID><AC>DAUGHTER</AC></ST>
  <ST><ID>10</ID><AC>DAUGHTER-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>DOORLADY</AC></ST>
  <ST><ID>10</ID><AC>DOORMAN</AC></ST>
  <ST><ID>10</ID><AC>FAMILY MEMBER</AC></ST>
  <ST><ID>10</ID><AC>FATHER</AC></ST>
  <ST><ID>10</ID><AC>FATHER-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>FIANCE</AC></ST>
  <ST><ID>10</ID><AC>GENERAL AGENT</AC></ST>
  <ST><ID>10</ID><AC>GRANDDAUGHTER</AC></ST>
  <ST><ID>10</ID><AC>GRANDFATHER</AC></ST>
  <ST><ID>10</ID><AC>GRANDMOTHER</AC></ST>
  <ST><ID>10</ID><AC>GRANDSON</AC></ST>
  <ST><ID>10</ID><AC>HUSBAND</AC></ST>
  <ST><ID>10</ID><AC>INDIVIDUAL</AC></ST>
  <ST><ID>10</ID><AC>LEGAL ASSISTANT</AC></ST>
  <ST><ID>10</ID><AC>LEGAL DEPARTMENT</AC></ST>
  <ST><ID>10</ID><AC>LEGAL MANAGER</AC></ST>
  <ST><ID>10</ID><AC>LITIGATION ASSISTANT</AC></ST>
  <ST><ID>10</ID><AC>LITIGATION SPECIALIST</AC></ST>
  <ST><ID>10</ID><AC>LSA1</AC></ST>
  <ST><ID>10</ID><AC>MANAGER</AC></ST>
  <ST><ID>10</ID><AC>MANAGING AGENT</AC></ST>
  <ST><ID>10</ID><AC>MOTHER</AC></ST>
  <ST><ID>10</ID><AC>MOTHER-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>NEPHEW</AC></ST>
  <ST><ID>10</ID><AC>NIECE</AC></ST>
  <ST><ID>10</ID><AC>NO FAULT ADMINISTRATOR</AC></ST>
  <ST><ID>10</ID><AC>OTHER INDIVIDUAL AUTHORIZED TO ACCEPT SERVICE</AC></ST>
  <ST><ID>10</ID><AC>OWNER</AC></ST>
  <ST><ID>10</ID><AC>PARALEGAL</AC></ST>
  <ST><ID>10</ID><AC>PARTNER</AC></ST>
  <ST><ID>10</ID><AC>PERSONAL BANKER</AC></ST>
  <ST><ID>10</ID><AC>PRESIDENT</AC></ST>
  <ST><ID>10</ID><AC>PROCESS SPECIALIST</AC></ST>
  <ST><ID>10</ID><AC>RECEPTIONIST</AC></ST>
  <ST><ID>10</ID><AC>RELATIVE</AC></ST>
  <ST><ID>10</ID><AC>SALES REPRESENTATIVE</AC></ST>
  <ST><ID>10</ID><AC>SCOA</AC></ST>
  <ST><ID>10</ID><AC>SECRETARY</AC></ST>
  <ST><ID>10</ID><AC>SECURITY GUARD</AC></ST>
  <ST><ID>10</ID><AC>SISTER</AC></ST>
  <ST><ID>10</ID><AC>SISTER-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>SON</AC></ST>
  <ST><ID>10</ID><AC>SON-IN-LAW</AC></ST>
  <ST><ID>10</ID><AC>STEP-DAUGHTER</AC></ST>
  <ST><ID>10</ID><AC>STEP-FATHER</AC></ST>
  <ST><ID>10</ID><AC>STEP-MOTHER</AC></ST>
  <ST><ID>10</ID><AC>STEP-SON</AC></ST>
  <ST><ID>10</ID><AC>SUPER</AC></ST>
  <ST><ID>10</ID><AC>SUPERVISOR</AC></ST>
  <ST><ID>10</ID><AC>TSR1</AC></ST>
  <ST><ID>10</ID><AC>UNCLE</AC></ST>
  <ST><ID>10</ID><AC>UNDERWRITER</AC></ST>
  <ST><ID>10</ID><AC>WIFE</AC></ST>

  <!-- ===== Description dropdowns ===== -->
  <Sex><AC>Female</AC></Sex>
  <Sex><AC>Male</AC></Sex>
  <Sex><AC>N/A</AC></Sex>
  <Sex><AC>Unknown</AC></Sex>
  <Skin><AC>American Indian or Alaska Native</AC></Skin>
  <Skin><AC>Asian</AC></Skin>
  <Skin><AC>Black or African American</AC></Skin>
  <Skin><AC>Hispanic or Latino</AC></Skin>
  <Skin><AC>Middle Eastern or North African</AC></Skin>
  <Skin><AC>Native Hawaiian or Pacific Islander</AC></Skin>
  <Skin><AC>N/A</AC></Skin>
  <Skin><AC>White</AC></Skin>
  <Hair><AC>Auburn</AC></Hair>
  <Hair><AC>Bald</AC></Hair>
  <Hair><AC>Balding</AC></Hair>
  <Hair><AC>Black</AC></Hair>
  <Hair><AC>Blonde</AC></Hair>
  <Hair><AC>Brown</AC></Hair>
  <Hair><AC>Dyed Other Color</AC></Hair>
  <Hair><AC>Gray</AC></Hair>
  <Hair><AC>Hat</AC></Hair>
  <Hair><AC>N/A</AC></Hair>
  <Hair><AC>Red</AC></Hair>
  <Hair><AC>Reddish Blonde</AC></Hair>
  <Hair><AC>Salt and Pepper</AC></Hair>
  <Hair><AC>Shaved Head</AC></Hair>
  <Hair><AC>White</AC></Hair>
  <Ht><AC>5ft0in-5ft3in</AC></Ht>
  <Ht><AC>5ft4in-5ft7in</AC></Ht>
  <Ht><AC>5ft8in-5ft11in</AC></Ht>
  <Ht><AC>Over 6ft</AC></Ht>
  <Ht><AC>N/A</AC></Ht>
  <Ht><AC>Under 5ft</AC></Ht>
  <Wt><AC>100-130 lbs</AC></Wt>
  <Wt><AC>130-150 lbs</AC></Wt>
  <Wt><AC>131-160 lbs</AC></Wt>
  <Wt><AC>161-200 lbs</AC></Wt>
  <Wt><AC>N/A</AC></Wt>
  <Wt><AC>Over 200 lbs</AC></Wt>
  <Wt><AC>Under 100 lbs</AC></Wt>
  <Prop><AC>Apartment</AC></Prop>
  <Prop><AC>Commercial Building</AC></Prop>
  <Prop><AC>Condo</AC></Prop>
  <Prop><AC>Government Building</AC></Prop>
  <Prop><AC>House</AC></Prop>
  <Prop><AC>N/A</AC></Prop>
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function unescapeXmlEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Extracts the text content of a named tag from a small, known-shape XML
// string. Not a general-purpose parser — relies on the documented request
// shape being simple, flat, single-occurrence tags.
function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

// Pulls the inner jxml string out of the SOAP envelope and un-escapes it
// back into real XML we can read fields from.
function extractJxml(rawBody) {
  const match = rawBody.match(/<jxml[^>]*>([\s\S]*?)<\/jxml>/i);
  if (!match) return null;
  return unescapeXmlEntities(match[1].trim());
}

// Which operation is being called — read from SOAPAction header first
// (most reliable), falling back to sniffing the body for the operation's
// element name if the header is missing or non-standard.
function detectOperation(req, rawBody) {
  const soapAction = req.headers["soapaction"] || req.headers["SOAPAction"] || "";
  if (soapAction.includes("downloadQueue")) return "downloadQueue";
  if (soapAction.includes("getTime")) return "getTime";
  if (soapAction.includes("addAddress")) return "addAddress";
  if (/downloadQueue/i.test(rawBody)) return "downloadQueue";
  if (/getTime/i.test(rawBody)) return "getTime";
  if (/addAddress/i.test(rawBody)) return "addAddress";
  return null;
}

function soapFault(faultString) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <SOAP-ENV:Fault>
      <faultcode>SOAP-ENV:Server</faultcode>
      <faultstring>${escapeXml(faultString)}</faultstring>
    </SOAP-ENV:Fault>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

// CONFIRMED against the real WSDL (https://data.dcacompliant.net/ldwinservices.php?wsdl):
// the response message's part is named after the operation itself
// (downloadQueueResponse -> <downloadQueue>, getTimeResponse -> <getTime>),
// not a generic <return> element as we'd originally guessed. Style is
// rpc/encoded per the WSDL, so the envelope carries the standard
// SOAP-ENC encodingStyle attribute PHP's SoapServer emits.
function soapResponse(operationName, innerXmlString) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
    xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
    SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <SOAP-ENV:Body>
    <ns1:${operationName}Response xmlns:ns1="urn:ld">
      <${operationName} xsi:type="xsd:string">${escapeXml(innerXmlString)}</${operationName}>
    </ns1:${operationName}Response>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

function buildJobXml(data) {
  return `
  <Job>
    <JobNum>${escapeXml(data.jobNum)}</JobNum>
    <C>${escapeXml(data.court)}</C>
    <CCO>${escapeXml(data.county)}</CCO>
    <P>${escapeXml(data.plaintiff)}</P>
    <D>${escapeXml(data.defendant)}</D>
    <CaseNo>${escapeXml(data.caseNo)}</CaseNo>
    <Servee>${escapeXml(data.servee)}</Servee>
    <Docs>${escapeXml(data.docs)}</Docs>
    <Immed></Immed>
    <LJR>${escapeXml(data.ljr)}</LJR>
    <Email></Email>
    <Server>${escapeXml(data.server)}</Server>
    <ServerLicense>${escapeXml(data.serverLicense)}</ServerLicense>
    <ServerID>${escapeXml(data.serverId)}</ServerID>
    <SubServerID>${escapeXml(data.subServerId)}</SubServerID>
    <dohttppost>0</dohttppost>
    <dohttppostip></dohttppostip>
  </Job>

  <A>
    <JobNum>${escapeXml(data.jobNum)}</JobNum>
    <AddrID>1</AddrID>
    <Addr>${escapeXml(data.addr)}</Addr>
    <Addr1></Addr1>
    <City>${escapeXml(data.city)}</City>
    <State>${escapeXml(data.state)}</State>
    <Zip>${escapeXml(data.zip)}</Zip>
    <GPSLat></GPSLat>
    <GPSLong></GPSLong>
  </A>`;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export const config = {
  api: {
    bodyParser: false, // we need the raw XML body, not Vercel's JSON parsing
  },
};

// ─── WSDL ───────────────────────────────────────────────────────────────────
// Served on GET requests (e.g. /ldwinservices.php?wsdl). Some SOAP clients —
// especially PHP-based ones, which TheIServer's own reference instance
// clearly is — resolve the service definition via a GET before ever making
// the real POST call. If we only ever respond to POST, a client doing this
// could fail or abort silently client-side, and we'd never see any request
// in our logs at all. This mirrors the operations documented at
// https://data.dcacompliant.net/ldwinservices.php?wsdl (their own reference
// instance), adapted to point at our endpoint instead of theirs.
const WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="ldwinservices"
  targetNamespace="urn:ld"
  xmlns:typens="urn:ld"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns="http://schemas.xmlsoap.org/wsdl/">

  <message name="getTimeRequest">
    <part name="jxml" type="xsd:string"/>
  </message>
  <message name="getTimeResponse">
    <part name="getTime" type="xsd:string"/>
  </message>

  <message name="downloadQueueRequest">
    <part name="jxml" type="xsd:string"/>
  </message>
  <message name="downloadQueueResponse">
    <part name="downloadQueue" type="xsd:string"/>
  </message>

  <message name="addAddressRequest">
    <part name="jxml" type="xsd:string"/>
  </message>
  <message name="addAddressResponse">
    <part name="addAddress" type="xsd:string"/>
  </message>

  <portType name="ldPortType">
    <operation name="getTime">
      <input message="typens:getTimeRequest"/>
      <output message="typens:getTimeResponse"/>
    </operation>
    <operation name="downloadQueue">
      <input message="typens:downloadQueueRequest"/>
      <output message="typens:downloadQueueResponse"/>
    </operation>
    <operation name="addAddress">
      <input message="typens:addAddressRequest"/>
      <output message="typens:addAddressResponse"/>
    </operation>
  </portType>

  <binding name="ldBinding" type="typens:ldPortType">
    <soap:binding style="rpc" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="getTime">
      <soap:operation soapAction="urn:ld#getTime"/>
      <input><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></input>
      <output><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></output>
    </operation>
    <operation name="downloadQueue">
      <soap:operation soapAction="urn:ld#downloadQueue"/>
      <input><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></input>
      <output><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></output>
    </operation>
    <operation name="addAddress">
      <soap:operation soapAction="urn:ld#addAddress"/>
      <input><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></input>
      <output><soap:body use="encoded" namespace="urn:ld" encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"/></output>
    </operation>
  </binding>

  <service name="ldwinservices">
    <port name="ldPort" binding="typens:ldBinding">
      <soap:address location="https://pst-app.vercel.app/ldwinservices.php"/>
    </port>
  </service>
</definitions>`;

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/xml; charset=utf-8");
    return res.status(200).send(WSDL);
  }

  if (req.method !== "POST") {
    res.setHeader("Content-Type", "text/xml");
    return res.status(405).send(soapFault("Method not allowed — POST or GET required"));
  }

  res.setHeader("Content-Type", "text/xml; charset=utf-8");

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(400).send(soapFault("Could not read request body"));
  }

  const jxml = extractJxml(rawBody);
  if (!jxml) {
    return res.status(400).send(soapFault("XML FAILURE"));
  }

  const username = extractTag(jxml, "username");
  const password = extractTag(jxml, "password");
  const ownerid = extractTag(jxml, "ownerid");

  if (!username) return res.status(200).send(soapFault("UFAILURE"));
  if (!password) return res.status(200).send(soapFault("PFAILURE"));
  if (!ownerid) return res.status(200).send(soapFault("OFAILURE"));

  const expectedUsername = process.env.THEISERVER_USERNAME;
  const expectedPassword = process.env.THEISERVER_PASSWORD;
  const expectedOwnerId = process.env.THEISERVER_OWNERID;

  if (
    username !== expectedUsername ||
    password !== expectedPassword ||
    ownerid !== expectedOwnerId
  ) {
    console.warn(
      `Credential check FAILED. Received username="${username}" ownerid="${ownerid}" (password not logged). Expected username="${expectedUsername}" ownerid="${expectedOwnerId}".`
    );
    return res.status(200).send(soapFault("FAILURE-Invalid credentials"));
  }

  const operation = detectOperation(req, rawBody);
  console.log(`Credential check PASSED for username="${username}". Detected operation: ${operation || "UNKNOWN"}.`);

  if (operation === "getTime") {
    const now = new Date();
    const iso = now.toISOString().replace("T", " ").slice(0, 19);
    return res.status(200).send(soapResponse("getTime", `<DateTime>${iso} UTC</DateTime>`));
  }

  if (operation === "downloadQueue") {
    try {
      console.log("downloadQueue: querying PST for open jobs...");
      const jobs = await getOpenJobsForTheIServer();
      console.log(`downloadQueue: found ${jobs.length} matching job(s) to return.`);
      const jobsXml = jobs.map(buildJobXml).join("\n");
      const infoXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<Info>
${STATIC_REFERENCE_XML}
${jobsXml}
</Info>`;
      return res.status(200).send(soapResponse("downloadQueue", infoXml));
    } catch (err) {
      console.error("Error building downloadQueue response:", err);
      return res.status(200).send(soapFault("Internal error building job queue"));
    }
  }

  if (operation === "addAddress") {
    // Not yet implemented — this operation exists in the real WSDL but wasn't
    // covered in the documentation we have. Logging so we notice if/when
    // TheIServer actually calls it, rather than silently no-op'ing.
    console.warn("Received addAddress call — not yet implemented. Raw jxml:", jxml);
    return res.status(200).send(soapFault("addAddress not yet supported by this integration"));
  }

  return res.status(200).send(soapFault("Unknown operation"));
}
