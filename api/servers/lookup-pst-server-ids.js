import { getAllServers, updateServer } from "./_serverStore.js";

const PST_BASE = "https://pstapi.dbsinfo.com";

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

async function findServerEntity(token, name) {
  const tryQuery = async (searchBy) => {
    const url = `${PST_BASE}/entities?EntityType=Server&SearchText=${encodeURIComponent(name)}&SearchBy=${searchBy}&ActiveOnly=true`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json();
    return data.Entities || [];
  };

  let matches = await tryQuery("FirmName");
  if (matches.length === 0) {
    const lastName = name.trim().split(/\s+/).slice(-1)[0];
    matches = await tryQuery("LastName");
    matches = matches.filter(
      (e) => e.LastName && e.LastName.toLowerCase() === lastName.toLowerCase()
    );
  }

  return matches;
}

async function run() {
  const token = await getToken();
  const servers = await getAllServers();

  if (servers.length === 0) {
    console.log("No servers in the roster yet. Nothing to look up.");
    return;
  }

  for (const server of servers) {
    console.log(`\nLooking up: ${server.name}`);
    try {
      const matches = await findServerEntity(token, server.name);

      if (matches.length === 0) {
        console.log(`  No match found in PST for "${server.name}". Skipping — you'll need to find this one manually.`);
        continue;
      }

      if (matches.length > 1) {
        console.log(`  Multiple matches found for "${server.name}":`);
        matches.forEach((m) =>
          console.log(`    - SerialNumber ${m.SerialNumber}: ${m.FirmName || `${m.FirstName} ${m.LastName}`}`)
        );
        console.log(`  Skipping this one — too ambiguous to pick automatically. Review manually.`);
        continue;
      }

      const match = matches[0];
      await updateServer(server.theiserverId, {
        pstServerSerialNumber: match.SerialNumber,
      });
      console.log(`  Matched: SerialNumber ${match.SerialNumber} (${match.FirmName || `${match.FirstName} ${match.LastName}`}). Saved to roster.`);
    } catch (err) {
      console.error(`  Error looking up ${server.name}: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

run();
