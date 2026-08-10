const mint = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
const treasury = "2W5gxAio1Bz76P58EaDtGC71MuyH4ZAdXHu3qqmeGy7g";
const endpoint = "https://api.devnet.solana.com";

async function call(method, params) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function main() {
  const info = await call("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const supply = await call("getTokenSupply", [mint]);
  const recent = await call("getSignaturesForAddress", [mint, { limit: 12 }]);

  console.log(
    JSON.stringify(
      {
        mint,
        ownerProgram: info?.value?.owner,
        parsed: info?.value?.data?.parsed,
        supply: supply?.value,
      },
      null,
      2,
    ),
  );

  console.log(
    "recentMintActivity",
    (recent || []).map((s) => ({
      t: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      err: s.err,
      sig: s.signature,
    })),
  );

  // Walk to oldest signature (best-effort create marker)
  let before;
  let oldest = null;
  let pages = 0;
  while (pages < 40) {
    const batch = await call("getSignaturesForAddress", [
      mint,
      before ? { limit: 1000, before } : { limit: 1000 },
    ]);
    pages += 1;
    if (!batch?.length) break;
    oldest = batch[batch.length - 1];
    if (batch.length < 1000) break;
    before = oldest.signature;
  }
  console.log(
    "oldestKnown",
    oldest && {
      pages,
      t: oldest.blockTime ? new Date(oldest.blockTime * 1000).toISOString() : null,
      slot: oldest.slot,
      sig: oldest.signature,
    },
  );

  if (oldest?.signature) {
    const createTx = await call("getTransaction", [
      oldest.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    const keys =
      createTx?.transaction?.message?.accountKeys?.map((k) =>
        typeof k === "string" ? k : k.pubkey,
      ) || [];
    console.log(
      "oldestTx",
      JSON.stringify(
        {
          feePayer: keys[0] || null,
          keys: keys.slice(0, 16),
          logSample: createTx?.meta?.logMessages?.slice(0, 25) || [],
        },
        null,
        2,
      ),
    );
  }

  if (recent?.[0]?.signature) {
    const tx = await call("getTransaction", [
      recent[0].signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    const keys =
      tx?.transaction?.message?.accountKeys?.map((k) =>
        typeof k === "string" ? k : k.pubkey,
      ) || [];
    const tokenBalances = tx?.meta?.postTokenBalances || [];
    console.log(
      "latestTx",
      JSON.stringify(
        {
          sig: recent[0].signature,
          feePayer: keys[0] || null,
          involvesTreasury: keys.includes(treasury),
          tokenBalances: tokenBalances.slice(0, 8),
          logs: tx?.meta?.logMessages?.slice(0, 15) || [],
        },
        null,
        2,
      ),
    );
  }

  const treasTok = await call("getTokenAccountsByOwner", [
    treasury,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  console.log(
    "treasuryHoldings",
    JSON.stringify(
      (treasTok?.value || []).map((a) => ({
        ata: a.pubkey,
        amount: a.account.data.parsed.info.tokenAmount,
      })),
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
