import { getAllServers } from "./_serverStore.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const servers = await getAllServers();
    return res.status(200).json({ servers });
  } catch (err) {
    console.error("Error fetching server list:", err);
    return res.status(500).json({ error: "Failed to fetch server list" });
  }
}
