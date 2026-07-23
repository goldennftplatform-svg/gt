const els = {
  reloadBtn: document.getElementById("reloadBtn"),
  heroNote: document.getElementById("heroNote"),
  hints: document.getElementById("hints"),
  liveMeta: document.getElementById("liveMeta"),
  liveGrid: document.getElementById("liveGrid"),
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
  if (indicator === "none") return "Operational";
  if (indicator === "unknown") return "Unknown";
  return description || indicator;
}

function renderHints(hints = []) {
  els.hints.innerHTML = hints
    .map((h) => `<span class="hint">${escapeHtml(h)}</span>`)
    .join("");
}

function renderLive(live = {}, takenAt) {
  const order = ["geoff", "grok", "openai", "copilot"];
  els.liveMeta.textContent = takenAt
    ? `Updated ${new Date(takenAt).toLocaleString()}`
    : "Live sniff";

  els.liveGrid.innerHTML = order
    .map((id) => {
      const card = live[id] || {};
      const cls = statusClass(card.indicator);
      const comps = (card.spotlight || card.components || []).slice(0, 5);
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
  renderLive(data.live || {}, data.takenAt);
  renderDimensions(catalog.dimensions || []);
  renderVendors(catalog.vendors || []);
  renderMenus(catalog.vendors || []);
  els.footnote.textContent = catalog.updatedNote || "";
  if (catalog.updatedNote) {
    els.heroNote.textContent =
      "Same research lens on every vendor: deliverables, flagship brains, context horsepower, payment shape, and live pipe health.";
  }
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
