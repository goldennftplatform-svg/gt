const els = {
  reloadBtn: document.getElementById("reloadBtn"),
  heroNote: document.getElementById("heroNote"),
  hints: document.getElementById("hints"),
  manifesto: document.getElementById("manifesto"),
  scorecard: document.getElementById("scorecard"),
  liveMeta: document.getElementById("liveMeta"),
  liveGrid: document.getElementById("liveGrid"),
  incidents: document.getElementById("incidents"),
  inventories: document.getElementById("inventories"),
  dimTable: document.querySelector("#dimTable tbody"),
  vendors: document.getElementById("vendors"),
  menus: document.getElementById("menus"),
  footnote: document.getElementById("footnote"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusClass(indicator) {
  if (!indicator || indicator === "unknown") return "unknown";
  if (indicator === "none" || indicator === "operational") return "good";
  if (indicator === "minor") return "warn";
  return "bad";
}

function statusLabel(indicator, description) {
  if (indicator === "none") return "Covered · all clear";
  if (indicator === "unknown") return "Quote pending";
  if (indicator === "minor") return "Minor claim noise";
  return description || indicator;
}

function gradeClass(grade = "") {
  if (grade.startsWith("A")) return "A";
  if (grade.startsWith("B")) return "B";
  if (grade.startsWith("C")) return grade.includes("+") ? "Cplus" : "C";
  return "C";
}

function renderHints(hints = []) {
  els.hints.innerHTML = hints
    .map((h) => `<span class="hint">${escapeHtml(h)}</span>`)
    .join("");
}

function renderManifesto(manifesto) {
  if (!manifesto) {
    els.manifesto.innerHTML = "";
    return;
  }
  els.manifesto.innerHTML = `
    <div class="manifesto-copy">
      <p class="kicker">${escapeHtml(manifesto.kicker || "Research desk")}</p>
      <h3>${escapeHtml(manifesto.title)}</h3>
      ${(manifesto.paragraphs || [])
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("")}
    </div>
    <aside class="manifesto-side">
      <h4>Field checklist</h4>
      <ul>
        ${(manifesto.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
      </ul>
    </aside>
  `;
}

function renderScorecard(rows = []) {
  if (!rows.length) {
    els.scorecard.innerHTML = `<p class="empty">Scorecard loading…</p>`;
    return;
  }
  els.scorecard.innerHTML = rows
    .map(
      (r) => `
      <article class="score">
        <div class="score-top">
          <div>
            <h4>${escapeHtml(r.name)}</h4>
            <p class="posture">${escapeHtml(r.posture)} · ${escapeHtml(String(r.score))}/100</p>
          </div>
          <div class="grade ${gradeClass(r.grade)}">${escapeHtml(r.grade)}</div>
        </div>
        <p class="why">${escapeHtml(r.why)}</p>
        <div class="meter"><i style="width:${Math.max(8, r.score)}%"></i></div>
        <details>
          <summary>Receipts &amp; blind spots</summary>
          <ul>
            ${(r.reveals || []).map((x) => `<li><strong>Shows:</strong> ${escapeHtml(x)}</li>`).join("")}
            ${(r.hides || []).map((x) => `<li><strong>Hides:</strong> ${escapeHtml(x)}</li>`).join("")}
          </ul>
        </details>
      </article>
    `,
    )
    .join("");
}

function renderLive(live = {}, takenAt) {
  const order = ["geoff", "grok", "openai", "copilot"];
  els.liveMeta.textContent = takenAt
    ? `Quotes refreshed ${new Date(takenAt).toLocaleString()}`
    : "Pulling live quotes…";

  els.liveGrid.innerHTML = order
    .map((id) => {
      const card = live[id] || {};
      const cls = statusClass(card.indicator);
      const comps = (card.spotlight || card.components || []).slice(0, 6);
      return `
        <article class="live-card">
          <p class="name">${escapeHtml(card.label || id)}</p>
          <p class="status ${cls}">${escapeHtml(statusLabel(card.indicator, card.description))}</p>
          <p class="desc">${escapeHtml(card.description || "—")}${card.note ? ` · ${escapeHtml(card.note)}` : ""}</p>
          <ul>
            ${comps
              .map(
                (c) => `
              <li>
                <span>${escapeHtml(c.name)}</span>
                <span>${escapeHtml(c.status)}</span>
              </li>`,
              )
              .join("")}
          </ul>
        </article>
      `;
    })
    .join("");

  const incidents = live.openai?.recentIncidents || [];
  if (!incidents.length) {
    els.incidents.innerHTML = "";
    return;
  }
  els.incidents.innerHTML = `
    <h4>OpenAI recent incidents (public status feed)</h4>
    ${incidents
      .map(
        (i) => `
      <div class="incident-row">
        <span class="impact ${escapeHtml(i.impact || "")}">${escapeHtml(i.impact || "n/a")}</span>
        <span>${escapeHtml(i.name)} · ${escapeHtml(i.status)}</span>
        <time>${escapeHtml(i.updatedAt ? new Date(i.updatedAt).toLocaleString() : "")}</time>
      </div>
    `,
      )
      .join("")}
  `;
}

function renderInventories(inventories = []) {
  if (!inventories.length) {
    els.inventories.innerHTML = `<p class="empty">No inventories yet.</p>`;
    return;
  }
  els.inventories.innerHTML = inventories
    .map(
      (inv) => `
      <article class="inventory">
        <h4>${escapeHtml(inv.title)}</h4>
        <p class="sub">${escapeHtml(inv.subtitle || "")}</p>
        <div class="chips">
          ${(inv.items || [])
            .slice(0, 28)
            .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
            .join("")}
          ${(inv.extras || [])
            .slice(0, 12)
            .map((item) => `<span class="chip extra">${escapeHtml(item)}</span>`)
            .join("")}
        </div>
      </article>
    `,
    )
    .join("");
}

function renderDimensions(dimensions = []) {
  els.dimTable.innerHTML = dimensions
    .map(
      (d) => `
      <tr>
        <td>
          <div class="dim-label">${escapeHtml(d.label)}</div>
          <p class="dim-blurb">${escapeHtml(d.blurb)}</p>
        </td>
        <td>${escapeHtml(d.scores?.geoff)}</td>
        <td>${escapeHtml(d.scores?.grok)}</td>
        <td>${escapeHtml(d.scores?.openai)}</td>
        <td>${escapeHtml(d.scores?.copilot)}</td>
      </tr>
    `,
    )
    .join("");
}

function renderVendors(vendors = []) {
  els.vendors.innerHTML = vendors
    .map((v) => {
      const hp = v.horsepower || {};
      return `
        <article class="vendor">
          <div class="vendor-top">
            <div>
              <h4>${escapeHtml(v.name)}</h4>
              <p class="company">${escapeHtml(v.company)}</p>
            </div>
            <span class="swatch" style="color:${escapeHtml(v.color)};background:${escapeHtml(v.color)}"></span>
          </div>
          <p class="tagline">${escapeHtml(v.tagline)}</p>
          <div class="hp">
            <div class="hp-item"><span class="k">Flagship</span><span class="v">${escapeHtml(hp.flagship)}</span></div>
            <div class="hp-item"><span class="k">Context</span><span class="v">${escapeHtml(hp.context)}</span></div>
            <div class="hp-item"><span class="k">API style</span><span class="v">${escapeHtml(hp.apiStyle)}</span></div>
            <div class="hp-item"><span class="k">Pricing</span><span class="v">${escapeHtml(hp.pricingModel)}</span></div>
          </div>
          <ul class="delivers">
            ${(v.delivers || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
          </ul>
          <div class="links">
            ${(v.research || [])
              .map(
                (r) =>
                  `<a href="${escapeHtml(r.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label)}</a>`,
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMenus(vendors = []) {
  els.menus.innerHTML = vendors
    .map(
      (v) => `
      <article class="menu">
        <h4>${escapeHtml(v.name)} menu</h4>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Role</th>
              <th>Context</th>
              <th>In / Out</th>
            </tr>
          </thead>
          <tbody>
            ${(v.models || [])
              .map(
                (m) => `
              <tr>
                <td><strong>${escapeHtml(m.id)}</strong><div class="notes">${escapeHtml(m.notes || "")}</div></td>
                <td>${escapeHtml(m.role)}</td>
                <td>${escapeHtml(m.context)}</td>
                <td>${escapeHtml(m.input)} · ${escapeHtml(m.output)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </article>
    `,
    )
    .join("");
}

function applyPayload(data) {
  const catalog = data.catalog || {};
  renderHints(data.compareHints || []);
  renderManifesto(data.manifesto);
  renderScorecard(data.scorecard || []);
  renderLive(data.live || {}, data.takenAt);
  renderInventories(data.inventories || []);
  renderDimensions(catalog.dimensions || []);
  renderVendors(catalog.vendors || []);
  renderMenus(catalog.vendors || []);
  els.footnote.textContent = catalog.updatedNote
    ? `${catalog.updatedNote} CoverAI scrapes public pages only. Not an insurer. Not affiliated with Progressive. Not medical advice. Just receipts.`
    : "";
}

async function loadMarket() {
  els.reloadBtn.disabled = true;
  try {
    const res = await fetch("/api/market");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load market intel");
    applyPayload(data);
  } catch (error) {
    els.liveMeta.textContent = "Load failed";
    els.liveGrid.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    console.error(error);
  } finally {
    els.reloadBtn.disabled = false;
  }
}

els.reloadBtn.addEventListener("click", loadMarket);
loadMarket();
