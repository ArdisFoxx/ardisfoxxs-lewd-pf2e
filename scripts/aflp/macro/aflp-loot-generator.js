// ===============================
// AFLR - Lewd Loot Generator (Pathfinder 2e)
// ===============================
// Fills a chest from AFLR's lewd tables and PF2e's own treasure tables.
//
// Scope dropdown follows PF2e's treasure-by-level guidance: an encounter is a
// slice of a level's budget, a hoard is a chunk of it, and "a full level" is the
// whole allotment for one party level. The numbers below are deliberately
// approximate - the GM is placing this, not auditing it.
// ===============================

(async () => {
  if (!game.user.isGM) { ui.notifications.warn("Only a GM can generate loot."); return; }

  const TABLES = "ardisfoxxs-lewd-pf2e.aflp-lewd-tables";
  const PF2E   = "pf2e.rollable-tables";

  const lewdPack = game.packs.get(TABLES);
  if (!lewdPack) { ui.notifications.error("AFLR lewd tables pack not found."); return; }
  await lewdPack.getIndex();
  const pf2ePack = game.packs.get(PF2E);
  if (pf2ePack) await pf2ePack.getIndex();

  // ---- helpers -------------------------------------------------------------

  const ord = (i) => { const s = ["th","st","nd","rd"], v = i % 100; return i + (s[(v-20)%10] || s[v] || s[0]); };

  // PF2e's consumable tables are NOT consistently named: levels 4-17 and 19 are
  // "Nth-Level Consumables Items", but 1-3, 18 and 20 are "Nth-Level Consumables".
  // Hardcoding either pattern fails silently at exactly those levels.
  const pf2eTable = (kind, lvl) => {
    if (!pf2ePack) return null;
    const names = kind === "permanent"
      ? [`${ord(lvl)}-Level Permanent Items`]
      : [`${ord(lvl)}-Level Consumables Items`, `${ord(lvl)}-Level Consumables`];
    for (const n of names) {
      const hit = [...pf2ePack.index].find(e => e.name === n);
      if (hit) return hit._id;
    }
    return null;
  };

  const band = (lvl) => lvl <= 4 ? "1-4" : lvl <= 8 ? "5-8" : lvl <= 12 ? "9-12" : "13+";

  const lewdTable = (name) => [...lewdPack.index].find(e => e.name === name)?._id ?? null;

  // Draw N documents from a table, resolving each to a real item.
  //
  // PF2e's own tables are sparse: the 14th-Level Permanent Items table rolls
  // 1d138 across 25 results, so most rolls land outside every range and return
  // nothing at all. That is correct table behaviour, not an error - but it means
  // one roll per requested item quietly under-delivers. Retry until we have n,
  // with a hard ceiling so a genuinely broken table cannot spin forever.
  const drawFrom = async (pack, tableId, n) => {
    if (!tableId || n < 1) return [];
    const table = await pack.getDocument(tableId);
    const out = [];
    let attempts = 0;
    const ceiling = n * 20;
    while (out.length < n && attempts < ceiling) {
      attempts++;
      const res = await table.roll();
      for (const r of res.results) {
        const uuid = r.documentUuid ?? r.getFlag?.("core", "documentUuid");
        if (!uuid) continue;
        const doc = await fromUuid(uuid).catch(() => null);
        if (doc) out.push(doc);
      }
    }
    return out.slice(0, n);
  };

  // ---- the dialog ----------------------------------------------------------

  const content = `
    <form>
      <div class="form-group">
        <label>Party level</label>
        <input type="number" name="level" value="1" min="1" max="25" style="width:60px"/>
        <label style="margin-left:10px">Party size</label>
        <input type="number" name="party" value="4" min="1" max="8" style="width:60px"/>
      </div>
      <div class="form-group">
        <label>Amount</label>
        <select name="scope">
          <option value="encounter">One encounter</option>
          <option value="hoard" selected>A hoard</option>
          <option value="level">A full level's treasure</option>
        </select>
      </div>
      <hr/>
      <div class="form-group"><label><input type="checkbox" name="lewd" checked/> Lewd loot</label></div>
      <div class="form-group"><label><input type="checkbox" name="normal" checked/> Normal PF2e loot</label></div>
      <div class="form-group"><label><input type="checkbox" name="consum" checked/> Consumables</label></div>
      <div class="form-group"><label><input type="checkbox" name="coin" checked/> Gold and jewels</label></div>
      <div class="form-group"><label><input type="checkbox" name="trap"/> Living bondage trap</label></div>
      <hr/>
      <div class="form-group">
        <label>Put it in</label>
        <select name="dest">
          <option value="chat" selected>Chat only</option>
          <option value="loot">A new Loot actor</option>
        </select>
      </div>
    </form>`;

  const cfg = await foundry.applications.api.DialogV2.wait({
    window: { title: "AFLR - Lewd Loot Generator" },
    content,
    buttons: [
      { action: "roll", label: "Generate", default: true, callback: (ev, btn) => {
          const f = btn.form ?? btn.element ?? document;
          const v = (n) => f.querySelector(`[name='${n}']`);
          return {
            level:  Math.max(1, Number(v("level")?.value) || 1),
            party:  Math.max(1, Number(v("party")?.value) || 4),
            scope:  v("scope")?.value ?? "hoard",
            lewd:   !!v("lewd")?.checked,
            normal: !!v("normal")?.checked,
            consum: !!v("consum")?.checked,
            coin:   !!v("coin")?.checked,
            trap:   !!v("trap")?.checked,
            dest:   v("dest")?.value ?? "chat",
          };
        } },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    rejectClose: false,
  });
  if (!cfg) return;

  // ---- how much ------------------------------------------------------------
  // Treasure per level for a party of four, from the PF2e treasure table. Scaled
  // by party size, then split by scope. Index 0 is unused so lvl reads directly.
  const TREASURE_BY_LEVEL = [0,
    175, 300, 500, 850, 1350, 2000, 2900, 4000, 5700, 8000,
    11000, 15000, 20000, 27000, 36000, 50000, 68000, 95000, 132000, 185000];

  const perLevel = (TREASURE_BY_LEVEL[Math.min(20, cfg.level)] ?? 185000) * (cfg.party / 4);
  const share = cfg.scope === "encounter" ? 0.10 : cfg.scope === "hoard" ? 0.35 : 1;
  const budget = Math.round(perLevel * share);

  // Item counts scale with scope rather than with the gold budget - a GM wants a
  // handful of things to hand over, not a spreadsheet.
  const counts = cfg.scope === "encounter" ? { perm: 1, cons: 1 }
               : cfg.scope === "hoard"     ? { perm: 2, cons: 2 }
               :                             { perm: 4, cons: 4 };

  const found = [];
  const lvl = cfg.level;

  if (cfg.lewd) {
    found.push(...await drawFrom(lewdPack, lewdTable(`Lewd Permanent Items (Levels ${band(lvl)})`), counts.perm));
    if (cfg.consum)
      found.push(...await drawFrom(lewdPack, lewdTable(`Lewd Consumables (Levels ${band(lvl)})`), counts.cons));
  }

  if (cfg.normal && pf2ePack) {
    found.push(...await drawFrom(pf2ePack, pf2eTable("permanent", lvl), counts.perm));
    if (cfg.consum)
      found.push(...await drawFrom(pf2ePack, pf2eTable("consumable", lvl), counts.cons));
  }

  let trapDoc = null;
  if (cfg.trap) {
    const tName = lvl <= 4 ? "Living Bondage Trap (Levels 1-4)"
                : lvl <= 8 ? "Living Bondage Trap (Levels 5-8)"
                :            "Living Bondage Trap (Levels 9+)";
    trapDoc = (await drawFrom(lewdPack, lewdTable(tName), 1))[0] ?? null;
  }

  // ---- coins and jewels ----------------------------------------------------
  let coinLine = "";
  if (cfg.coin) {
    // Roughly a third of the budget as coin, the rest already spent on items.
    const gp = Math.max(1, Math.round(budget / 3));
    const roll = await new Roll("1d4").evaluate();
    const gems = roll.total;
    coinLine = `<p><strong>Coin:</strong> ${gp} gp</p>`;
    if (pf2ePack && lvl >= 3) {
      const tier = lvl <= 5 ? "Lesser" : lvl <= 11 ? "Moderate" : "Greater";
      const gemT = [...pf2ePack.index].find(e => e.name === `${tier} Semiprecious Stones`)
               ?? [...pf2ePack.index].find(e => e.name === `${tier} Precious Stones`);
      if (gemT) {
        const stones = await drawFrom(pf2ePack, gemT._id, gems);
        if (stones.length) coinLine += `<p><strong>Jewels:</strong> ${stones.map(s => s.name).join(", ")}</p>`;
      }
    }
  }

  // ---- output --------------------------------------------------------------
  const list = found.length
    ? `<ul>${found.map(d => `<li>@UUID[${d.uuid}]{${d.name}}</li>`).join("")}</ul>`
    : `<p><em>No items rolled.</em></p>`;

  const trapLine = trapDoc
    ? `<hr/><p><strong>Trap:</strong> the container is @UUID[${trapDoc.uuid}]{${trapDoc.name}}. It springs on whoever opens it.</p>`
    : "";

  let destLine = "";
  if (cfg.dest === "loot" && found.length) {
    const actor = await Actor.create({ name: `Lewd Loot (Level ${lvl})`, type: "loot" });
    await actor.createEmbeddedDocuments("Item", found.map(d => d.toObject()));
    destLine = `<p>Placed in <strong>${actor.name}</strong>.</p>`;
  }

  ChatMessage.create({
    content: `<div class="aflp-chat-card">
      <h3>Lewd Loot - Level ${lvl}, ${cfg.scope === "level" ? "full level" : cfg.scope}</h3>
      <p style="opacity:.7;font-size:11px">Budget about ${budget} gp for ${cfg.party} characters.</p>
      ${list}${coinLine}${trapLine}${destLine}
    </div>`,
    whisper: [game.user.id],
  });
})();
