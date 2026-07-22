import { pollAndTranslate, publicConfig } from "../server/service.js";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const body = req.method === "POST" ? readBody(req) : {};
    const payload = await pollAndTranslate({
      previous: body.previous ?? null,
      knownEvents: Array.isArray(body.events) ? body.events : [],
      persist: false,
    });
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message, config: publicConfig() });
  }
}

