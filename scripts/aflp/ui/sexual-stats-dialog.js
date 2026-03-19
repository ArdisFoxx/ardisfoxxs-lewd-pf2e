// ============================================
// AFLP Sexual Stats & Pregnancy UI (World Actor Version)
// ============================================

if (!window.AFLP) throw new Error("AFLP schema not loaded");
if (!window.AFLP_Pregnancy) window.AFLP_Pregnancy = {};
if (!window.AFLP.UI) window.AFLP.UI = {};
if (!window.AFLP.Macros) window.AFLP.Macros = {};

// ===============================
// AFLP Pregnancy Helper (world actor persistence)
// ===============================
window.AFLP_Pregnancy = {

  getPregnancies: actor => actor.getWorldActor?.()?.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? actor.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? {},

  addPregnancy: async (actor, { partner, method = "vaginal", gestationTotal = 30, offspring = 1, deliveryType = "live" }) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    await AFLP.ensureCoreFlags(worldActor);
    const pregnancies = (await worldActor.getFlag(AFLP.FLAG_SCOPE, "pregnancy")) ?? {};
    const id = foundry.utils.randomID();
    pregnancies[id] = {
      sourceUuid: partner?.uuid ?? "",
      sourceName: partner?.name || "Unknown",
      gestationTotal,
      gestationRemaining: gestationTotal,
      offspring,
      deliveryType,
      method,
      startedAt: game.time.worldTime
    };
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
    return { id, ...pregnancies[id] };
  },

  attemptImpregnation: async (targetActor, sourceActor, cockTypes, hasPotionOfBreeding) => {
    const targetSexual = targetActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {};
    const targetKinks = targetSexual.kinks ?? {};

    const hasBroodSow = !!targetKinks["brood-sow"];
    const hasBreeder = !!cockTypes["cock-breeder"];
    const hasFertile = !!cockTypes["cock-fertile"];

    const isOvidepositor = !!cockTypes["cock-ovidepositor"];
    const deliveryType = isOvidepositor ? "egg" : "live";

    const autoSuccess = hasBroodSow || hasBreeder;

    let dc = 15;
    if (hasFertile) dc = 11;

    let roll = { total: 0 }, success;

    if (autoSuccess) {
      success = true;
    } else {
      roll = await new Roll("1d20").evaluate();
      success = roll.total >= dc;
    }

    ChatMessage.create({
      content: `
        <strong>Impregnation Check</strong><br>
        Source: <strong>${sourceActor.name}</strong><br>
        ${
          hasBroodSow
            ? `<em>${targetActor.name} is a <strong>Brood Sow</strong> - their womb eagerly accepts seed.</em><br>`
            : hasBreeder
              ? `<em>${sourceActor.name}'s breeder cock guarantees impregnation.</em><br>`
              : `Roll: <strong>${roll.total}</strong> vs DC <strong>${dc}</strong><br>`
        }
        Result: <strong>${success ? "Impregnation!" : "No impregnation."}</strong>
      `
    });

    if (!success) return null;

    const gestationDays = deliveryType === "egg"
      ? 9
      : hasPotionOfBreeding
        ? 11
        : 30;

    const offspring = deliveryType === "live"
      ? await AFLP_Pregnancy.rollLiveBirth(targetActor)
      : await AFLP_Pregnancy.rollExploding2D4();

    return await AFLP_Pregnancy.addPregnancy(targetActor, {
      partner: sourceActor,
      gestationTotal: gestationDays,
      offspring,
      deliveryType
    });
  },

  savePregnancies: async (actor, pregnancies) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
  },

  rollLiveBirth: async (actor = null) => {
    let count = 1;
    let hasBroodSow = false;
    let level = 0;

    if (actor) {
      const sexual = actor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {};
      const kinks = sexual.kinks ?? {};
      hasBroodSow = !!kinks["brood-sow"];
      level = actor.system?.details?.level?.value ?? 0;
    }

    while (true) {
      const roll = await new Roll("1d6").evaluate();
      const explode =
        roll.total === 6 ||
        (hasBroodSow && roll.total >= 5) ||
        (hasBroodSow && level >= 3 && roll.total >= 4) ||
        (hasBroodSow && level >= 7 && roll.total >= 3);
      if (explode) { count++; } else { break; }
    }

    return count;
  },

  rollExploding2D4: async () => {
    let dice = 2;
    let result = [];
    while (true) {
      const r = await new Roll(`${dice}d4`).evaluate();
      const faces = r.dice[0].results.map(x => x.result);
      result.push(...faces);
      if (faces.every(x => x === 4)) dice += 2;
      else break;
    }
    return result.reduce((a, b) => a + b, 0);
  },

  recordBirth: async (actor, pregId, { suppressChat = false } = {}) => {
    const worldActor = actor.getWorldActor?.() ?? actor;
    const FLAG = AFLP.FLAG_SCOPE;
    const pregnancies = structuredClone(await worldActor.getFlag(FLAG, "pregnancy")) ?? {};
    const preg = pregnancies[pregId];
    if (!preg) return;
    preg.gestationRemaining = "Complete";
    await worldActor.setFlag(FLAG, "pregnancy", pregnancies);
    if (!suppressChat) {
      const sourceName = preg.sourceName || "Unknown";
      const type = preg.deliveryType === "egg" ? "eggs" : "offspring";
      ChatMessage.create({
        content: `${worldActor.name} gave birth to ${preg.offspring} ${type} fathered by ${sourceName}!`
      });
    }
    return preg;
  }

};

// ===============================
// AFLP Sexual Stats Dialog (world actor persistence)
// ===============================
AFLP.UI.SexualStatsDialog = class SexualStatsDialog {
  constructor(actor) {
    this.actor = actor.getWorldActor?.() ?? actor;
    this.FLAG = AFLP.FLAG_SCOPE;
    this.view = "display";
    this.CUM_UNIT_ML = AFLP.CUM_UNIT_ML;
    this.flatPregnancy = [];
  }
};

AFLP.UI.SexualStatsDialog.prototype.load = async function() {
  await AFLP.ensureCoreFlags(this.actor);

  this.sexual = structuredClone(await this.actor.getFlag(this.FLAG, "sexual") ?? AFLP.sexualDefaults);
  this.cum = structuredClone(await this.actor.getFlag(this.FLAG, "cum") ?? AFLP.cumDefaults);
  this.coomer = structuredClone(await this.actor.getFlag(this.FLAG, "coomer") ?? AFLP.coomerDefaults);

  this.hasPussy = !!(await this.actor.getFlag(this.FLAG, "pussy"));
  this.hasCock = !!(await this.actor.getFlag(this.FLAG, "cock"));

  const savedGenitalTypes = structuredClone(await this.actor.getFlag(this.FLAG, "genitalTypes") ?? {});
  this.genitalTypes = {};
  for (const slug of Object.keys(AFLP.genitalTypes)) {
    this.genitalTypes[slug] = !!savedGenitalTypes[slug];
  }

  this.kinks = {};
  for (const slug of Object.keys(AFLP.kinks)) {
    this.kinks[slug] = !!this.sexual.kinks?.[slug];
  }
  this.kinkNotes = structuredClone(this.sexual.kinkNotes ?? {});

  // Patch missing sub-objects for older actors
  if (!this.sexual.lifetime.mlReceived) {
    this.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
  } else if (this.sexual.lifetime.mlReceived.gangbang === undefined) {
    this.sexual.lifetime.mlReceived.gangbang = 0;
  }
  if (!this.sexual.lifetime.mlGiven) {
    this.sexual.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
  } else if (this.sexual.lifetime.mlGiven.gangbang === undefined) {
    this.sexual.lifetime.mlGiven.gangbang = 0;
  }

  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.size = this.actor.system.traits?.size?.value ?? "med";

  for (const [id, preg] of Object.entries(this.pregnancy)) {
    if (typeof preg.gestationRemaining === "number" && preg.gestationRemaining <= 0) {
      await AFLP_Pregnancy.recordBirth(this.actor, id);
    }
  }

  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
};

AFLP.UI.SexualStatsDialog.prototype._handleBirthById = async function(pregId) {
  if (!pregId) return;
  await AFLP_Pregnancy.recordBirth(this.actor, pregId);
  this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
  this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
  this.render();
};

AFLP.UI.SexualStatsDialog.prototype.render = async function() {
  const content = await this._renderContent();

  const dialog = new Dialog({
    title: `${this.actor.name} — Sexual Stats`,
    content,
    buttons: { close: { label: "Close" } },
    render: html => this._activateListeners(html, dialog)
  }, { width: 680 });

  dialog.render(true);
};

// =======================
// _renderContent
// =======================
AFLP.UI.SexualStatsDialog.prototype._renderContent = async function() {

  // -----------------------------------------------
  // Unified Lifetime Totals table
  // Columns: Sex Act | Times Given | Times Received | Cum Given (ml) | Cum Received (ml)
  // Given columns hidden entirely if !hasCock
  // Vaginal row hidden if !hasPussy
  // -----------------------------------------------
  const allActs = ["oral", "vaginal", "anal", "facial", "gangbang"];

  const tableHeaders = `
    <tr>
      <th>Sex Act</th>
      ${this.hasCock ? `<th>Times Given</th>` : ""}
      <th>Times Received</th>
      ${this.hasCock ? `<th>Cum Given (ml)</th>` : ""}
      <th>Cum Received (ml)</th>
    </tr>`;

  const actRows = allActs.map(act => {
    if (act === "vaginal" && !this.hasPussy) return "";

    const timesReceived = this.sexual.lifetime[act] ?? 0;
    const timesGiven    = act === "gangbang" ? "—" : (this.sexual.lifetime[act] ?? 0);
    const mlReceived    = this.sexual.lifetime.mlReceived?.[act] ?? 0;
    const mlGiven       = this.sexual.lifetime.mlGiven?.[act] ?? 0;

    if (this.view === "display") {
      return `
        <tr>
          <td>${act}</td>
          ${this.hasCock ? `<td>${timesGiven}</td>` : ""}
          <td>${timesReceived}</td>
          ${this.hasCock ? `<td>${mlGiven.toLocaleString()} ml</td>` : ""}
          <td>${mlReceived.toLocaleString()} ml</td>
        </tr>`;
    } else {
      // Gangbang: times given is not tracked (shown as —), but ml given and ml received are editable
      const timesGivenCell = act === "gangbang"
        ? `<td>—</td>`
        : `<td><input name="times-given-${act}" type="number" value="${timesGiven}" style="width:55px"/></td>`;

      const timesReceivedCell = act === "gangbang"
        ? `<td><input name="lifetime-gangbang" type="number" value="${timesReceived}" style="width:55px"/></td>`
        : `<td><input name="lifetime-${act}" type="number" value="${timesReceived}" style="width:55px"/></td>`;

      const mlGivenCell = act === "gangbang"
        ? `<td><input name="ml-given-gangbang" type="number" value="${mlGiven}" style="width:70px"/></td>`
        : `<td><input name="ml-given-${act}" type="number" value="${mlGiven}" style="width:70px"/></td>`;

      const mlReceivedCell = act === "gangbang"
        ? `<td><input name="ml-received-gangbang" type="number" value="${mlReceived}" style="width:70px"/></td>`
        : `<td><input name="ml-received-${act}" type="number" value="${mlReceived}" style="width:70px"/></td>`;

      return `
        <tr>
          <td>${act}</td>
          ${this.hasCock ? `${timesGivenCell}` : ""}
          ${timesReceivedCell}
          ${this.hasCock ? `${mlGivenCell}` : ""}
          ${mlReceivedCell}
        </tr>`;
    }
  }).join("");

  const lifetimeTable = `
    <table class="aflp-table">
      ${tableHeaders}
      ${actRows}
    </table>`;

  // ---- Kinks (left column) ----
  let kinkList = await Promise.all(
    Object.entries(AFLP.kinks)
      .map(([slug, kink]) => ({ slug, enabled: !!this.kinks[slug], kink }))
      .sort((a, b) => a.kink.name.localeCompare(b.kink.name))
      .map(async ({ slug, enabled, kink }) => {
        if (this.view === "display") {
          if (!enabled) return "";
          if (slug === "creature-fetish") {
            const note = this.kinkNotes?.[slug];
            const extra = note ? ` — <em>${note}</em>` : "";
            return `<li>${await TextEditor.enrichHTML(`@UUID[${kink.uuid}]{${kink.name}}`)  }${extra}</li>`;
          }
          return `<li>${await TextEditor.enrichHTML(`@UUID[${kink.uuid}]{${kink.name}}`)}</li>`;
        }
        if (slug === "creature-fetish") {
          const note = this.kinkNotes?.[slug] ?? "";
          return `
            <div style="margin-bottom:4px">
              <label><input type="checkbox" name="kink-${slug}" ${enabled ? "checked" : ""}/> ${kink.name}</label>
              <input type="text" name="kinknote-${slug}" value="${note}" placeholder="e.g. dragons, beasts" style="width:100%;margin-top:2px;"/>
            </div>`;
        }
        return `<div style="margin-bottom:2px"><label><input type="checkbox" name="kink-${slug}" ${enabled ? "checked" : ""}/> ${kink.name}</label></div>`;
      })
  );
  kinkList = kinkList.filter(x => x);

  const kinkSection = this.view === "display"
    ? `<div class="aflp-col-section"><b>Kinks</b>${kinkList.length ? `<ul style="margin:4px 0 0 0;padding-left:16px">${kinkList.join("")}</ul>` : `<div style="color:#888">None</div>`}</div>`
    : `<div class="aflp-col-section"><b>Kinks</b><div style="margin-top:4px">${kinkList.length ? kinkList.join("") : `<div style="color:#888">None</div>`}</div></div>`;

  // ---- Genitalia (right column) ----
  let genitalSection = "";

  if (this.view === "display") {
    const genitals = [];

    if (this.hasPussy) {
      const pEntry = AFLP.genitalTypes["pussy"];
      if (pEntry?.uuid) {
        genitals.push(`<li>${await TextEditor.enrichHTML(`@UUID[${pEntry.uuid}]{${pEntry.name}}`)}</li>`);
      }
    }

    if (this.hasCock) {
      const cEntry = AFLP.genitalTypes["cock"];
      if (cEntry?.uuid) {
        genitals.push(`<li>${await TextEditor.enrichHTML(`@UUID[${cEntry.uuid}]{${cEntry.name}}`)}</li>`);
      }
      const subtypes = await Promise.all(
        Object.entries(AFLP.genitalTypes)
          .filter(([slug, data]) => data.parent === "cock" && this.genitalTypes[slug])
          .sort((a, b) => a[1].name.localeCompare(b[1].name))
          .map(async ([slug, data]) =>
            `<li style="margin-left:14px">${await TextEditor.enrichHTML(`@UUID[${data.uuid}]{${data.name}}`)}</li>`
          )
      );
      genitals.push(...subtypes.filter(Boolean));
    }

    genitalSection = `<div class="aflp-col-section"><b>Genitalia</b>${genitals.length ? `<ul style="margin:4px 0 0 0;padding-left:16px">${genitals.join("")}</ul>` : `<div style="color:#888">None</div>`}</div>`;

  } else {
    const cockSubtypeHtml = Object.entries(AFLP.genitalTypes)
      .filter(([slug, data]) => data.parent === "cock")
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([slug, data]) => {
        const checked = this.genitalTypes[slug] ? "checked" : "";
        return `<div style="margin-bottom:2px;margin-left:14px"><label><input type="checkbox" name="genitalType-${slug}" ${checked}/> ${data.name}</label></div>`;
      }).join("");

    genitalSection = `
      <div class="aflp-col-section">
        <b>Genitalia</b>
        <div style="margin-top:4px">
          <div style="margin-bottom:4px">
            <label><input type="checkbox" name="pussy" ${this.hasPussy ? "checked" : ""}/> <strong>Pussy</strong></label>
          </div>
          <div style="margin-bottom:2px">
            <label><input type="checkbox" name="cock" id="aflp-cock-checkbox" ${this.hasCock ? "checked" : ""}/> <strong>Cock</strong></label>
          </div>
          <div id="aflp-cock-subtypes" style="${this.hasCock ? "" : "display:none;"}">
            ${cockSubtypeHtml}
          </div>
        </div>
      </div>`;
  }

  // ---- Pregnancy rows ----
  const pregRows = this.flatPregnancy.map(p => `
    <tr>
      <td>${p.sourceName ?? "Unknown"}</td>
      <td>${p.deliveryType === "egg" ? "Egg" : "Live Birth"}</td>
      <td>${p.offspring ?? 1}</td>
      <td>${p.gestationRemaining === "Complete" ? "Complete" : `${p.gestationRemaining}/${p.gestationTotal}`}</td>
    </tr>
  `).join("");

  return `
  <form id="aflp-sexual-stats">
    <style>
      .aflp-table{width:100%;border-collapse:collapse;}
      .aflp-table td,.aflp-table th{border:1px solid #aaa;padding:4px 6px;}
      .aflp-section{margin-bottom:10px;}
      .aflp-two-col{display:flex;gap:16px;margin-bottom:10px;}
      .aflp-col-section{flex:1;min-width:0;}
      .aflp-col-section b{display:block;margin-bottom:2px;}
    </style>

    <div class="aflp-section">
      <b>Cum:</b> ${this.cum.current}/${this.cum.max}
      ${this.view === "adjust" ? `<br><label style="margin-top:4px;display:inline-block">Coomer Level: <input name="coomer" type="number" value="${this.coomer.level}" style="width:50px"/></label>` : ""}
    </div>

    <div class="aflp-section">
      <b>Lifetime Totals</b>
      ${lifetimeTable}
    </div>

    <div class="aflp-two-col">
      ${kinkSection}
      ${genitalSection}
    </div>

    ${this.hasPussy ? `
    <div class="aflp-section">
      <b>Pregnancy</b>
      ${pregRows
        ? `<table class="aflp-table"><tr><th>Source</th><th>Type</th><th>Number</th><th>Gestation</th></tr>${pregRows}</table>`
        : `<div style="color:#888">None</div>`}
    </div>` : ""}

    <div style="text-align:center;margin-top:8px">
      ${this.view === "display"
        ? `<button type="button" data-action="adjust">Adjust Stats</button>`
        : `<button type="submit">Apply</button> <button type="button" data-action="display">Cancel</button>`}
      <button type="button" data-action="reset">Reset Stats</button>
    </div>
  </form>
  `;
};

// =======================
// _activateListeners
// =======================
AFLP.UI.SexualStatsDialog.prototype._activateListeners = function(html, dialog) {
  html.find("[data-action=adjust]").click(() => { this.view = "adjust"; dialog.close(); this.render(); });
  html.find("[data-action=display]").click(() => { this.view = "display"; dialog.close(); this.render(); });

  html.find("#aflp-cock-checkbox").on("change", function() {
    html.find("#aflp-cock-subtypes").toggle(this.checked);
  });

  html.find("[data-action=reset]").click(async () => {
    const ok = await Dialog.confirm({ title: "Reset Sexual Stats", content: "Reset all sexual stats and clear pregnancies?" });
    if (!ok) return;
    await this.actor.setFlag(this.FLAG, "sexual", structuredClone(AFLP.sexualDefaults));
    await this.actor.unsetFlag(this.FLAG, "pregnancy");
    if (this.actor) await AFLP.recalculateCum(this.actor);
    ui.notifications.info(`${this.actor.name} sexual stats reset.`);
    dialog.close();
  });

  html.find("#aflp-sexual-stats").on("submit", async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);

    // Coomer and recalc
    this.coomer.level = Number(fd.get("coomer") ?? 0);
    await this.actor.setFlag(this.FLAG, "coomer", this.coomer);
    await AFLP.recalculateCum(this.actor);
    this.cum = structuredClone(await this.actor.getFlag(this.FLAG, "cum"));

    // Lifetime act counters + ml per hole
    for (const act of ["oral", "vaginal", "anal", "facial"]) {
      if (act === "vaginal" && !this.hasPussy) continue;
      this.sexual.lifetime[act] = Number(fd.get(`lifetime-${act}`)) || 0;
      this.sexual.lifetime.mlReceived[act] = Number(fd.get(`ml-received-${act}`)) || 0;
      if (this.hasCock) {
        this.sexual.lifetime.mlGiven[act] = Number(fd.get(`ml-given-${act}`)) || 0;
      }
    }

    // Gangbang
    this.sexual.lifetime.gangbang = Number(fd.get("lifetime-gangbang")) || 0;
    this.sexual.lifetime.mlReceived.gangbang = Number(fd.get("ml-received-gangbang")) || 0;
    if (this.hasCock) {
      this.sexual.lifetime.mlGiven.gangbang = Number(fd.get("ml-given-gangbang")) || 0;
    }

    // Genitalia top-level flags
    this.hasPussy = !!fd.get("pussy");
    this.hasCock = !!fd.get("cock");
    await this.actor.setFlag(this.FLAG, "pussy", this.hasPussy);
    await this.actor.setFlag(this.FLAG, "cock", this.hasCock);

    // GenitalTypes
    for (const slug of Object.keys(AFLP.genitalTypes)) {
      if (slug === "pussy") {
        this.genitalTypes[slug] = this.hasPussy;
      } else if (slug === "cock") {
        this.genitalTypes[slug] = this.hasCock;
      } else {
        this.genitalTypes[slug] = !!fd.get(`genitalType-${slug}`);
      }
    }
    await this.actor.setFlag(this.FLAG, "genitalTypes", this.genitalTypes);

    // Kinks
    for (const slug of Object.keys(AFLP.kinks)) {
      this.kinks[slug] = !!fd.get(`kink-${slug}`);
    }
    const creatureNote = String(fd.get("kinknote-creature-fetish") ?? "").trim();
    if (creatureNote) {
      this.kinkNotes["creature-fetish"] = creatureNote;
    } else {
      delete this.kinkNotes["creature-fetish"];
    }

    this.sexual.kinks = structuredClone(this.kinks);
    this.sexual.kinkNotes = structuredClone(this.kinkNotes);
    await this.actor.setFlag(this.FLAG, "sexual", this.sexual);

    ui.notifications.info("Sexual stats updated.");
    this.view = "display";
    dialog.close();
    this.render();
  });
};