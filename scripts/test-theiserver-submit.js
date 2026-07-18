// test-theiserver-submit.js
//
// Standalone test script — NOT wired into pst-app yet.
// Logs into TheIServer's admin site, then submits one job via
// manual-enter-submit.php, using the exact field names captured
// from a real browser session.
//
// Run locally with: node scripts/test-theiserver-submit.js
//
// Requires these env vars to be set first:
//   export THEISERVER_WEB_USERNAME="client liaison services"
//   export THEISERVER_WEB_PASSWORD="..."   (get from Vercel/1Password, don't hardcode)

const BASE_URL = "https://theindependentserver.com";
const LOGIN_URL = `${BASE_URL}/agencies/index.php`;
const SUBMIT_URL = `${BASE_URL}/agencies/manual/manual-enter-submit.php`;

// Pull the PHPSESSID (or any cookie) out of a Set-Cookie response header.
function extractCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/([^=]+)=([^;]+)/);
  return match ? `${match[1]}=${match[2]}` : null;
}

async function login() {
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    redirect: "manual", // capture Set-Cookie even if it 302s
  });

  const setCookie = res.headers.get("set-cookie");
  const cookie = extractCookie(setCookie);

  // NOTE: from manual testing, PHPSESSID appeared to stay the same
  // before and after login (session flips to "authenticated" server-side
  // rather than issuing a new session). If this script's login doesn't
  // return a Set-Cookie header at all, that theory is confirmed — in
  // that case we need to do an initial GET to the login page first to
  // grab a session cookie, then POST login reusing that same cookie.
  console.log("Login response status:", res.status);
  console.log("Set-Cookie header:", setCookie || "(none)");

  if (!cookie) {
    throw new Error(
      "No cookie returned from login. This likely means we need to GET " +
        "the login page first to establish a session, then POST login " +
        "reusing that cookie. Not yet confirmed — needs one more capture."
    );
  }

  return cookie;
}

async function submitJob(cookie, job) {
  const body = new URLSearchParams({
    jobid: job.jobid,
    court: job.court,
    courtcounty: job.courtcounty,
    caseno: job.caseno,
    plf: job.plf,
    def: job.def,
    servee: job.servee,
    docs: job.docs, // REQUIRED — server rejects submission if blank
    addr1: job.addr1,
    city1: job.city1,
    state1: job.state1,
    zip1: job.zip1,
    addr2: job.addr2 || "",
    city2: job.city2 || "",
    state2: job.state2 || "",
    zip2: job.zip2 || "",
    serverid: job.serverid,
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
  console.log("Submit response status:", res.status);
  console.log("Submit response body (first 500 chars):", text.slice(0, 500));

  // TODO: we don't yet have a confirmed marker for success vs failure
  // in the response body/redirect. Once we know what a successful vs.
  // rejected submission looks like, add a real check here instead of
  // just logging the raw response.

  return { status: res.status, body: text };
}

async function main() {
  const cookie = await login();
  console.log("Using cookie:", cookie);

  // Test job — same data used in manual browser testing.
  // NOTE: serverid below is "Test Server 2"'s id, not one of the real
  // three roster servers. Replace with a real mapped serverid before
  // using this for an actual job.
  const testJob = {
    jobid: "2026000481",
    court: "Supreme Court",
    courtcounty: "Bronx",
    caseno: "812341/2026E",
    plf: "JOSE IMBERT GUZMAN",
    def: "BALWINDER SINGH",
    servee: "BALWINDER SINGH",
    docs: "Summons and Complaint",
    addr1: "22036 93rd Road",
    city1: "Queens Village",
    state1: "NY",
    zip1: "11428",
    serverid: "2091199387",
  };

  await submitJob(cookie, testJob);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
