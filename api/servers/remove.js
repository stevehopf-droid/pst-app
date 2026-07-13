import { removeServer } from "./_serverStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { theiserverId } = req.body || {};

  if (!theiserverId) {
    return res.status(400).json({ error: "theiserverId is required" });
  }

  try {
    const result = await removeServer(theiserverId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error removing server:", err);
    const status = err.message.includes("No server found") ? 404 : 500;
    return res.status(status).json({ error: err.message });
  }
}
