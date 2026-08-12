// lookup-pst-sales-item-ids.js
//
// Prints the raw line items for a specific known invoice (2026000543, which
// we already confirmed contains both "SERVICE IN ALBANY" and "SEC OF STATE
// FEE" lines) so we can read the exact SalesItemID field name/value PST
// actually returns.
//
// Run locally with (from the project root, with your .env already set up):
//   node --env-file=.env scripts/lookup-pst-sales-item-ids.js
// or, if your Node version doesn't support --env-file:
//   export $(grep -E '^PST_' .env | xargs) && node scripts/lookup-pst-sales-item-ids.js

const PST_BASE = "https://pstapi.dbsinfo.com";
const INVOICE_NUMBER = "2026000543";

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

async function run() {
  console.log("Authenticating with PST...");
  const token = await getToken();
  console.log("Authenticated.\n");

  const url = `${PST_BASE}/invoices/${INVOICE_NUMBER}/lineitems`;
  console.log(`GET ${url}\n`);

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await resp.text();

  console.log(`HTTP ${resp.status}\n`);
  console.log("--- RAW RESPONSE ---");
  console.log(text);
  console.log("--- END RAW RESPONSE ---");
}

run().catch(err => {
  console.error("\nScript failed:", err.message);
  process.exit(1);
});
