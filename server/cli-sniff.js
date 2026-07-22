import { runSniff } from "./sniffer.js";
import { translate } from "./translator.js";
import { loadLatestSnapshot, saveLatestSnapshot, appendEvents } from "./store.js";

const previous = await loadLatestSnapshot();
const snapshot = await runSniff();
const events = translate(previous, snapshot);
await saveLatestSnapshot(snapshot);
await appendEvents(events);

console.log(JSON.stringify({ snapshot, events }, null, 2));