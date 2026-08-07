import { pollAndTranslate, publicConfig } from "../server/service.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    // Browser previous/events are ignored on Vercel — shared desk is authoritative.
    const payload = await pollAndTranslate({ persist: !process.env.VERCEL });
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message, config: publicConfig() });
  }
}
