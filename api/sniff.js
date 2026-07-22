import { runSniff } from "../server/sniffer.js";

export default async function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const snapshot = await runSniff();
    res.status(200).json({ latest: snapshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
