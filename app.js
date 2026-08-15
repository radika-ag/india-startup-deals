(function () {
  "use strict";

  let deals = [];
  let filtered = [];
  let sortKey = "idx";
  let sortDir = 1;
  let activeStatus = "all";

  const el = {
    stats: document.getElementById("stats"),
    search: document.getElementById("search"),
    sectorFilter: document.getElementById("sectorFilter"),
    periodFilter: document.getElementById("periodFilter"),
    body: document.getElementById("dealsBody"),
    empty: document.getElementById("emptyState"),
    table: document.getElementById("dealsTable"),
    drawer: document.getElementById("drawer"),
    drawerContent: document.getElementById("drawerContent"),
    drawerClose: document.getElementById("drawerClose"),
  };

  function parseAmount(amountStr) {
    if (!amountStr) return null;
    const s = amountStr.trim();
    if (/undisclosed/i.test(s)) return null;
    const m = s.match(/\$([\d.]+)\s*([BMK])?/i);
    if (!m) return null;
    let n = parseFloat(m[1]);
    const unit = (m[2] || "").toUpperCase();
    if (unit === "B") n *= 1000;
    else if (unit === "K") n /= 1000;
    return n; // normalized to $M
  }

  function getStatus(d) {
    if (!d.checked) return "notchecked";
    const vr = (d.verifiedRound || "").toLowerCase();
    const label = (d.sourceLabel || "").toLowerCase();
    if (vr.includes("unverified") || label.includes("unverified")) return "unverified";
    const note = d.note || "";
    if (/\[discrepancy\]/i.test(note)) return "discrepancy";
    if (/\[partial\]/i.test(note)) return "partial";
    return "confirmed";
  }

  const STATUS_LABEL = {
    confirmed: "Confirmed",
    discrepancy: "Discrepancy",
    partial: "Partial",
    unverified: "Unverified",
    notchecked: "Not checked",
  };

  function fmtAmount(d) {
    return d.amount || "—";
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function render() {
    const q = el.search.value.trim().toLowerCase();
    const sector = el.sectorFilter.value;
    const period = el.periodFilter.value;

    filtered = deals.filter((d) => {
      if (activeStatus !== "all" && getStatus(d) !== activeStatus) return false;
      if (sector && d.sector !== sector) return false;
      if (period && d.period !== period) return false;
      if (q) {
        const hay = `${d.name} ${d.sector} ${d.investors} ${d.round}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av === null || av === undefined) av = sortDir === 1 ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === 1 ? Infinity : -Infinity;
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    el.body.innerHTML = filtered.map(rowHtml).join("");
    el.empty.hidden = filtered.length > 0;
    el.table.style.display = filtered.length > 0 ? "" : "none";

    renderStats();
  }

  function rowHtml(d) {
    const status = getStatus(d);
    const sourceCell = d.sourceUrl
      ? `<a href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(d.sourceLabel)}</a>`
      : `<span class="none">${escapeHtml(d.sourceLabel || "—")}</span>`;
    return `
      <tr data-idx="${d.idx}">
        <td class="col-idx">${d.idx}</td>
        <td class="deal-name">${escapeHtml(d.name)}</td>
        <td>${escapeHtml(d.sector)}</td>
        <td class="col-amount">${escapeHtml(fmtAmount(d))}</td>
        <td>${escapeHtml(d.round)}</td>
        <td class="investors-cell">${escapeHtml(d.investors)}</td>
        <td>${escapeHtml(d.period)}</td>
        <td class="col-status"><span class="badge badge-${status}">${STATUS_LABEL[status]}</span></td>
        <td class="col-source">${sourceCell}</td>
      </tr>`;
  }

  function renderStats() {
    const total = deals.length;
    const checked = deals.filter((d) => d.checked).length;
    const disclosedSum = deals.reduce((sum, d) => {
      const n = parseAmount(d.amount);
      return n ? sum + n : sum;
    }, 0);
    const flagged = deals.filter((d) => getStatus(d) === "discrepancy" || getStatus(d) === "unverified").length;

    el.stats.innerHTML = `
      <div class="stat"><span class="stat-value">${total}</span><span class="stat-label">Total deals</span></div>
      <div class="stat"><span class="stat-value">${checked} <span style="font-size:0.9rem;color:var(--ink-soft)">(${Math.round(checked/total*100)}%)</span></span><span class="stat-label">Verified</span></div>
      <div class="stat"><span class="stat-value">$${(disclosedSum/1000).toFixed(2)}B</span><span class="stat-label">Disclosed sum</span></div>
      <div class="stat"><span class="stat-value">${flagged}</span><span class="stat-label">Flagged</span></div>
    `;
  }

  function populateFilters() {
    const sectors = [...new Set(deals.map((d) => d.sector).filter(Boolean))].sort();
    el.sectorFilter.innerHTML = `<option value="">All sectors</option>` +
      sectors.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    const periods = [...new Set(deals.map((d) => d.period).filter(Boolean))];
    // keep original dataset order (roughly reverse-chronological already)
    const seen = new Set();
    const orderedPeriods = [];
    deals.forEach((d) => {
      if (d.period && !seen.has(d.period)) {
        seen.add(d.period);
        orderedPeriods.push(d.period);
      }
    });
    el.periodFilter.innerHTML = `<option value="">All months</option>` +
      orderedPeriods.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  }

  function openDrawer(idx) {
    const d = deals.find((x) => x.idx === idx);
    if (!d) return;
    const status = getStatus(d);
    const sourceLine = d.sourceUrl
      ? `<a href="${escapeHtml(d.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(d.sourceLabel)}</a>`
      : escapeHtml(d.sourceLabel || "—");

    el.drawerContent.innerHTML = `
      <h2>${escapeHtml(d.name)}</h2>
      <div class="drawer-meta">#${d.idx} &middot; ${escapeHtml(d.sector)} &middot; ${escapeHtml(d.period)}</div>
      <div class="drawer-row"><span class="k">Amount</span><span class="v">${escapeHtml(fmtAmount(d))}</span></div>
      <div class="drawer-row"><span class="k">Round (original)</span><span class="v">${escapeHtml(d.round)}</span></div>
      <div class="drawer-row"><span class="k">Verified round</span><span class="v">${escapeHtml(d.verifiedRound || "—")}</span></div>
      <div class="drawer-row"><span class="k">Investors</span><span class="v">${escapeHtml(d.investors)}</span></div>
      <div class="drawer-row"><span class="k">Status</span><span class="v"><span class="badge badge-${status}">${STATUS_LABEL[status]}</span></span></div>
      <div class="drawer-row"><span class="k">Source</span><span class="v">${sourceLine}</span></div>
      ${d.note ? `<div class="drawer-note">${escapeHtml(d.note)}</div>` : ""}
    `;
    el.drawer.hidden = false;
  }

  function closeDrawer() {
    el.drawer.hidden = true;
  }

  function initSorting() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir *= -1;
        } else {
          sortKey = key;
          sortDir = 1;
        }
        document.querySelectorAll("th.sortable").forEach((t) => t.classList.remove("sort-asc", "sort-desc"));
        th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
        render();
      });
    });
  }

  function init(data) {
    deals = data.map((d) => ({ ...d, amountNum: parseAmount(d.amount) }));
    populateFilters();
    initSorting();
    render();

    el.search.addEventListener("input", render);
    el.sectorFilter.addEventListener("change", render);
    el.periodFilter.addEventListener("change", render);

    document.querySelectorAll("#statusChips .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#statusChips .chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        activeStatus = chip.dataset.status;
        render();
      });
    });

    el.body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-idx]");
      if (!tr) return;
      if (e.target.tagName === "A") return;
      openDrawer(parseInt(tr.dataset.idx, 10));
    });

    el.drawerClose.addEventListener("click", closeDrawer);
    el.drawer.addEventListener("click", (e) => {
      if (e.target === el.drawer) closeDrawer();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  fetch("data/deals.json")
    .then((r) => r.json())
    .then(init)
    .catch((err) => {
      el.body.innerHTML = `<tr><td colspan="9">Failed to load deals.json: ${err}</td></tr>`;
    });
})();
