import { addServer } from "./_serverStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, license, theiserverId } = req.body || {};

  if (!name || !license || !theiserverId) {
    return res.status(400).json({
      error: "name, license, and theiserverId are all required",
    });
  }

  try {
    const record = await addServer({ name, license, theiserverId });
    return res.status(201).json({ server: record });
  } catch (err) {
    console.error("Error adding server:", err);
    const status = err.message.includes("already exists") ? 409 : 500;
    return res.status(status).json({ error: err.message });
  }
}
