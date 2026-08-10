const treasury = "2W5gxAio1Bz76P58EaDtGC71MuyH4ZAdXHu3qqmeGy7g";
const fakeUsdc = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
const ata = "JD1cxfW8vsgmgAFRzpLggFZJVH1vh75M4aU2JJiyuhEp";

const endpoints = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

async function call(cluster, method, params) {
  const res = await fetch(endpoints[cluster], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${cluster} ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function allSigs(cluster, address, maxPages = 20) {
  const out = [];
  let before;
  for (let i = 0; i < maxPages; i++) {
    const batch = await call(cluster, "getSignaturesForAddress", [
      address,
      before ? { limit: 1000, before } : { limit: 1000 },
    ]);
    if (!batch?.length) break;
    out.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

function summarizeTx(tx, sigMeta) {
  const keys =
    tx?.transaction?.message?.accountKeys?.map((k) =>
      typeof k === "string" ? k : k.pubkey,
    ) || [];
  const ixs = tx?.transaction?.message?.instructions || [];
  const inner = tx?.meta?.innerInstructions?.flatMap((x) => x.instructions) || [];
  const all = [...ixs, ...inner];
  const parsed = all
    .map((ix) => ({
      program: ix.program || ix.programId,
      type: ix.parsed?.type || null,
      mint: ix.parsed?.info?.mint || null,
      source: ix.parsed?.info?.source || ix.parsed?.info?.authority || null,
      dest: ix.parsed?.info?.destination || null,
      amount:
        ix.parsed?.info?.amount ||
        ix.parsed?.info?.lamports ||
        ix.parsed?.info?.tokenAmount?.uiAmountString ||
        null,
    }))
    .filter((x) => x.type || (typeof x.program === "string" && !x.program.startsWith("Compute")));

  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];
  const tokenDeltas = [];
  for (const p of post) {
    const before = pre.find(
      (x) => x.accountIndex === p.accountIndex && x.mint === p.mint,
    );
    const a = Number(before?.uiTokenAmount?.uiAmountString || 0);
    const b = Number(p.uiTokenAmount?.uiAmountString || 0);
    if (a !== b) {
      tokenDeltas.push({
        mint: p.mint,
        owner: p.owner,
        delta: b - a,
        after: b,
      });
    }
  }

  return {
    sig: sigMeta.signature,
    t: sigMeta.blockTime ? new Date(sigMeta.blockTime * 1000).toISOString() : null,
    err: sigMeta.err || tx?.meta?.err || null,
    feePayer: keys[0] || null,
    keyCount: keys.length,
    keys: keys.slice(0, 12),
    programs: [...new Set(all.map((ix) => ix.program || ix.programId).filter(Boolean))],
    parsed: parsed.slice(0, 20),
    tokenDeltas,
    solDeltaLamports:
      (tx?.meta?.postBalances?.[0] ?? 0) - (tx?.meta?.preBalances?.[0] ?? 0),
  };
}

async function dumpCluster(cluster) {
  console.log(`\n======== ${cluster.toUpperCase()} TREASURY ========`);
  const bal = await call(cluster, "getBalance", [treasury]);
  console.log("SOL", (bal?.value || 0) / 1e9);

  const tokenAccounts = await call(cluster, "getTokenAccountsByOwner", [
    treasury,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ]);
  console.log(
    "tokenAccounts",
    JSON.stringify(
      (tokenAccounts?.value || []).map((a) => ({
        ata: a.pubkey,
        mint: a.account.data.parsed.info.mint,
        amount: a.account.data.parsed.info.tokenAmount.uiAmountString,
      })),
      null,
      2,
    ),
  );

  const sigs = await allSigs(cluster, treasury, 5);
  console.log("txCountFetched", sigs.length);
  if (sigs.length) {
    console.log("first", new Date(sigs[sigs.length - 1].blockTime * 1000).toISOString());
    console.log("last", new Date(sigs[0].blockTime * 1000).toISOString());
  }

  // Decode all if small, else first 8 + last 8
  const pick =
    sigs.length <= 40
      ? sigs
      : [...sigs.slice(0, 8), ...sigs.slice(-8)];

  const decoded = [];
  for (const s of pick) {
    try {
      const tx = await call(cluster, "getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      decoded.push(summarizeTx(tx, s));
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      decoded.push({ sig: s.signature, error: e.message });
    }
  }
  console.log("decodedSample", JSON.stringify(decoded, null, 2));

  // ATA-specific history on devnet
  if (cluster === "devnet") {
    console.log("\n======== DEVNET FAKE-USDC ATA ========");
    const ataSigs = await allSigs("devnet", ata, 3);
    console.log("ataTxCount", ataSigs.length);
    if (ataSigs.length) {
      console.log(
        "ataFirst",
        new Date(ataSigs[ataSigs.length - 1].blockTime * 1000).toISOString(),
      );
      console.log("ataLast", new Date(ataSigs[0].blockTime * 1000).toISOString());
    }
    const ataPick = ataSigs.slice(0, 12);
    const ataDecoded = [];
    for (const s of ataPick) {
      const tx = await call("devnet", "getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      ataDecoded.push(summarizeTx(tx, s));
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log("ataDecoded", JSON.stringify(ataDecoded, null, 2));
  }
}

async function main() {
  await dumpCluster("devnet");
  await dumpCluster("mainnet");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
