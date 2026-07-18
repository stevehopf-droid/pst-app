// api/theiserver/manualSubmit.js
//
// Reusable module wrapping the TheIServer manual-enter-submit.php flow:
// logs in with the agency's TheIServer website login, then submits one
// job using the exact field names captured from a real browser session.
//
// Env vars required (set in Vercel, Production + Preview):
//   THEISERVER_WEB_USERNAME  — e.g. "client liaison services"
//   THEISERVER_WEB_PASSWORD
//
// Confirmed via manual testing (July 2026):
// - Login POST to /agencies/index.php returns a fresh Set-Cookie
//   (PHPSESSID) every time — no separate GET-first step needed.
// - manual-enter-submit.php requires `docs` to be non-empty or it
//   rejects the submission with an error page (still HTTP 200).
// - The site does NOT dedupe on jobid — submitting the same job twice
//   creates two separate entries. Callers of submitJob() are responsible
//   for ensuring a job is only ever submitted once (see send-job.js).

const BASE_URL = "https://theindependentserver.com";
const LOGIN_URL = `${BASE_URL}/agencies/index.php`;
const SUBMIT_URL = `${BASE_URL}/agencies/manual/manual-enter-submit.php`;

function extractCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/([^=]+)=([^;]+)/);
  return match ? `${match[1]}=${match[2]}` : null;
}

async function loginToTheIServer() {
  const username = process.env.THEISERVER_WEB_USERNAME;
  const password = process.env.THEISERVER_WEB_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Missing THEISERVER_WEB_USERNAME / THEISERVER_WEB_PASSWORD env vars."
    );
  }

  const body = new URLSearchParams({
    remember: "true",
    uname: username,
    pword: password,
    pp: "1",
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "manual",
  });

  const cookie = extractCookie(res.headers.get("set-cookie"));

  if (!cookie) {
    throw new Error(
      "TheIServer login did not return a session cookie. Login may have " +
        "failed, or the site's auth flow changed since this was last tested."
    );
  }

  return cookie;
}

// job: {
//   jobid, court, courtcounty, caseno, plf, def, servee, docs,
//   addr1, city1, state1, zip1, addr2, city2, state2, zip2, serverid
// }
async function submitManualJob(job) {
  if (!job.docs) {
    throw new Error(
      "TheIServer requires a non-empty `docs` field — submission would " +
        "be rejected server-side."
    );
  }
  if (!job.serverid) {
    throw new Error("Missing serverid — no field server assigned to this job.");
  }

  const cookie = await loginToTheIServer();

  const body = new URLSearchParams({
    jobid: job.jobid || "",
    court: job.court || "",
    courtcounty: job.courtcounty || "",
    caseno: job.caseno || "",
    plf: job.plf || "",
    def: job.def || "",
    servee: job.servee || "",
    docs: job.docs,
    addr1: job.addr1 || "",
    city1: job.city1 || "",
    state1: job.state1 || "",
    zip1: job.zip1 || "",
    addr2: job.addr2 || "",
    city2: job.city2 || "",
    state2: job.state2 || "",
    zip2: job.zip2 || "",
    serverid: String(job.serverid),
    sub: "Submit New Job",
  });

  const res = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Referer: `${BASE_URL}/agencies/manual/manual-enter.php`,
    },
    body: body.toString(),
  });

  const text = await res.text();

  // NOTE: we still don't have a confirmed success marker in the response
  // body — the one error marker we DO know is the "You must enter in the
  // documents for service" message. If that phrase is missing and the
  // status is 200, we're treating it as a success, but this hasn't been
  // stress-tested against every possible rejection reason (e.g. bad
  // serverid, missing required address fields might have their own
  // distinct error text we haven't seen yet).
  const looksLikeError = /you must enter/i.test(text);

  if (res.status !== 200 || looksLikeError) {
    throw new Error(
      `TheIServer submission may have failed (status ${res.status}). ` +
        `Response snippet: ${text.slice(0, 300)}`
    );
  }

  return { success: true, rawResponseSnippet: text.slice(0, 300) };
}

export { submitManualJob, loginToTheIServer };
