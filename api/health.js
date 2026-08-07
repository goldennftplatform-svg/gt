import { sharedStoreConfig } from "../server/shared-store.js";

export default function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const shared = sharedStoreConfig();
  res.status(200).json({
    ok: true,
    service: "geoff-thermometer",
    mode: "vercel",
    sharedStore: true,
    trustMode: "universal",
    sharedStoreBackend: shared.backend,
    sharedStoreUrl: shared.redis ? `redis:${shared.redisKey}` : shared.rawUrl,
  });
}
