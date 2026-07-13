import { updateServer } from "./_serverStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { theiserverId, name, license } = req.body || {};

  if (!theiserverId) {
    return res.status(400).json({ error: "theiserverId is required" });
  }
  if (!name && !license) {
    return res.status(400).json({
      error: "At least one of name or license must be provided to update",
    });
  }

  try {
    const updated = await updateServer(theiserverId, { name, license });
    return res.status(200).json({ server: updated });
  } catch (err) {
    console.error("Error updating server:", err);
    const status = err.message.includes("No server found") ? 404 : 500;
    return res.status(status).json({ error: err.message });
  }
}
