import { marketCatalog } from "./market-catalog.js";
import { scrapeMarketIntel } from "./market-scrape.js";
import { runSniff } from "./sniffer.js";

export async function buildMarketPayload() {
  const geoffSnap = await runSniff().catch(() => null);
  const intel = await scrapeMarketIntel(geoffSnap);

  return {
    takenAt: new Date().toISOString(),
    catalog: marketCatalog,
    live: intel.live,
    scraped: intel.scraped,
    scorecard: intel.scorecard,
    manifesto: intel.manifesto,
    inventories: intel.inventories,
    compareHints: [
      "Rule 1: if they won’t show capacity without a login, price in the opacity tax.",
      "Geoff column is live Stacknet sniff. Grok/OpenAI/Copilot menus are scraped from public docs + status boards.",
      "Seat products can look “all green” while the real horsepower stays behind plan gates.",
    ],
  };
}
