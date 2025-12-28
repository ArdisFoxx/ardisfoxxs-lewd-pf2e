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

  attemptImpregnation: async (actor, sourceActor, cockTypes, hasPotionOfBreeding) => {
    const isOvidepositor = !!cockTypes["cock-ovidepositor"];
    const deliveryType = isOvidepositor ? "egg" : "live";
    const dc = cockTypes["cock-breeder"] ? 20 : cockTypes["cock-fertile"] ? 11 : 5;

    const roll = await new Roll("1d20").evaluate({ async: true });
    const success = roll.total <= dc;

    ChatMessage.create({
      content: `<strong>Impregnation Flat Check</strong><br>
                Source: <strong>${sourceActor.name}</strong><br>
                Roll: <strong>${roll.total}</strong> vs DC <strong>${dc}</strong><br>
                Result: <strong>${success ? "Impregnation!" : "No impregnation."}</strong>`
    });

    if (!success) return null;

    const gestationDays = deliveryType === "egg" ? 9 : hasPotionOfBreeding ? 11 : 30;
    const offspring = deliveryType === "live"
      ? await AFLP_Pregnancy.rollLiveBirth()
      : await AFLP_Pregnancy.rollExploding2D4();

    return await AFLP_Pregnancy.addPregnancy(actor, {
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

  rollLiveBirth: async () => {
    let count = 1;
    while (true) {
      const roll = await new Roll("1d6").evaluate({ async: true });
      if (roll.total === 6) count++;
      else break;
    }
    return count;
  },

  rollExploding2D4: async () => {
    let dice = 2;
    let result = [];
    while (true) {
      const r = await new Roll(`${dice}d4`).evaluate({ async: true });
      const faces = r.dice[0].results.map(x => x.result);
      result.push(...faces);
      if (faces.every(x => x === 4)) dice += 2;
      else break;
    }
    return result.reduce((a,b) => a+b, 0);
  },

  recordBirth: async (actor, pregId, { suppressChat=false } = {}) => {
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
    this.cumUnits = "ml";
    this.CUM_UNIT_ML = 125;
    this.flatPregnancy = [];
  }

  async load() {
    await AFLP.ensureCoreFlags(this.actor);
    this.sexual = structuredClone(this.actor.getFlag(this.FLAG, "sexual"));
    this.cum = structuredClone(this.actor.getFlag(this.FLAG, "cum"));
    this.coomer = structuredClone(this.actor.getFlag(this.FLAG, "coomer"));
    this.hasPussy = !!this.actor.getFlag(this.FLAG, "pussy");
    this.hasCock = !!this.actor.getFlag(this.FLAG, "cock");
    this.cockTypes = structuredClone(this.actor.getFlag(this.FLAG, "cockTypes") ?? {});
    this.pregnancy = structuredClone(this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
    this.size = this.actor.system.traits?.size?.value ?? "med";

    for (const [id, preg] of Object.entries(this.pregnancy)) {
      if (typeof preg.gestationRemaining === "number" && preg.gestationRemaining <= 0) {
        await AFLP_Pregnancy.recordBirth(this.actor, id);
      }
    }

    this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
  }

  async _handleBirthById(pregId) {
    if (!pregId) return;
    await AFLP_Pregnancy.recordBirth(this.actor, pregId);
    this.pregnancy = structuredClone(await this.actor.getFlag(this.FLAG, "pregnancy") ?? {});
    this.flatPregnancy = Object.entries(this.pregnancy).map(([id, data]) => ({ ...data, __id: id }));
    this.render();
  }

  render() {
    const dialog = new Dialog({
      title: `${this.actor.name} — Sexual Stats`,
      content: this._renderContent(),
      buttons: { close: { label: "Close" } },
      render: html => this._activateListeners(html, dialog)
    });
    dialog.render(true);
  }

  _renderContent() {
    const acts = ["oral","vaginal","anal","facial","gangbang"].map(act => {
      if (act==="vaginal" && !this.hasPussy) return "";
      const L=this.sexual.lifetime[act]; const E=this.sexual.event[act];
      return this.view==="display"
        ? `<tr><td>${act}</td><td>${L}</td><td>${E}</td></tr>`
        : `<tr><td>${act}</td><td><input name="lifetime-${act}" type="number" value="${L}"/></td><td><input name="event-${act}" type="number" value="${E}"/></td></tr>`;
    }).join("");

	 const cumReceived = ["oral","vaginal","anal","facial"].map(act=>{
	   if(act==="vaginal" && !this.hasPussy) return "";
	   const ml = this.sexual.lifetime.mlReceived[act] ?? 0;

	   return this.view==="display"
		 ? `<li>${act}: ${ml.toLocaleString()} ml</li>`
		 : `<li>${act}: <input name="ml-${act}" type="number" value="${ml}"/></li>`;
	 }).join("");

    const cockTypesHtml = Object.keys(AFLP.cockTypes).map(type=>{
      const checked=this.cockTypes[type]?"checked":"";
      return `<label><input type="checkbox" name="cockType-${type}" ${checked}/> ${type.replace("cock-","")}</label>`;
    }).join("");

    const pregRows = this.flatPregnancy.map(p => `
      <tr>
        <td>${p.sourceName ?? "Unknown"}</td>
        <td>${p.deliveryType==="egg"?"Egg":"Live Birth"}</td>
        <td>${p.offspring ?? 1}</td>
        <td>${p.gestationRemaining <= 0 ? "Complete" : `${p.gestationRemaining}/${p.gestationTotal}`}</td>
      </tr>
    `).join("");

    return `
    <form id="aflp-sexual-stats">
      <style>
        .aflp-table{width:100%;border-collapse:collapse;}
        .aflp-table td,.aflp-table th{border:1px solid #aaa;padding:4px;}
        .aflp-section{margin-bottom:10px;}
      </style>

      <div class="aflp-section">
        <b>Cum:</b> ${this.cum.current}/${this.cum.max}
        ${this.view==="adjust"?`<br>Coomer: <input name="coomer" type="number" value="${this.coomer.level}"/>`:''}
      </div>

      <div class="aflp-section">
        <table class="aflp-table"><tr><th>Act</th><th>Lifetime</th><th>Event</th></tr>${acts}</table>
      </div>

      <div class="aflp-section"><b>Cum Received</b><ul>${cumReceived}</ul></div>

      ${this.hasCock?`<div class="aflp-section"><b>Cum Given</b>${this.view==="display"?`${this.sexual.lifetime.cumGiven*this.CUM_UNIT_ML} ml`:`<input name="cumGiven" type="number" value="${this.sexual.lifetime.cumGiven}"/> units`}</div>`:''}

      ${this.hasPussy?`<div class="aflp-section"><b>Pregnancy</b>${pregRows?`<table class="aflp-table"><tr><th>Source</th><th>Type</th><th>Number</th><th>Gestation</th></tr>${pregRows}</table>`:'<div>None</div>'}</div>`:''}

      ${this.view==="adjust"?`<div class="aflp-section"><b>Genitalia</b><br><label><input type="checkbox" name="pussy" ${this.hasPussy?"checked":""}/> Pussy</label> <label><input type="checkbox" name="cock" ${this.hasCock?"checked":""}/> Cock</label><div>${cockTypesHtml}</div></div>`:''}

      <div style="text-align:center">
        ${this.view==="display"?`<button type="button" data-action="adjust">Adjust Stats</button>`:`<button type="submit">Apply</button><button type="button" data-action="display">Display Stats</button>`}
        <button type="button" data-action="reset">Reset Stats</button>
      </div>
    </form>
    `;
  }

  _activateListeners(html, dialog) {
    html.find("[data-action=adjust]").click(()=>{this.view="adjust";dialog.close();this.render();});
    html.find("[data-action=display]").click(()=>{this.view="display";dialog.close();this.render();});

    html.find("[data-action=reset]").click(async ()=>{
      const ok = await Dialog.confirm({ title:"Reset Sexual Stats", content:"Reset all sexual stats and clear pregnancies?" });
      if(!ok) return;

      await this.actor.setFlag(this.FLAG,"sexual",structuredClone(AFLP.sexualDefaults));
      await this.actor.unsetFlag(this.FLAG,"pregnancy");
      await this.actor.setFlag(this.FLAG,"pregnancySourcesHistory",[]);
      if (this.actor) await AFLP.recalculateCum(this.actor);
      ui.notifications.info(`${this.actor.name} sexual stats reset.`);
      dialog.close();
    });

    html.find("#aflp-sexual-stats").on("submit", async ev=>{
      ev.preventDefault();
      const fd=new FormData(ev.currentTarget);
      this.coomer.level=Number(fd.get("coomer")??0);await this.actor.setFlag(this.FLAG,"coomer",this.coomer);
      await AFLP.recalculateCum(this.actor);
      this.cum = structuredClone(await this.actor.getFlag(this.FLAG,"cum"));

      ["oral","vaginal","anal","facial","gangbang"].forEach(act=>{
        if(act==="vaginal"&&!fd.get("pussy")) return;
        this.sexual.lifetime[act]=Number(fd.get(`lifetime-${act}`))||0;
        this.sexual.event[act]=Number(fd.get(`event-${act}`))||0;
        if(this.sexual.lifetime.mlReceived[act]!==undefined) this.sexual.lifetime.mlReceived[act]=Number(fd.get(`ml-${act}`))||0;
      });

      this.hasPussy=!!fd.get("pussy"); this.hasCock=!!fd.get("cock");
      await this.actor.setFlag(this.FLAG,"pussy",this.hasPussy); await this.actor.setFlag(this.FLAG,"cock",this.hasCock);

      for(const type of Object.keys(AFLP.cockTypes)){ this.cockTypes[type]=!!fd.get(`cockType-${type}`);}
      await this.actor.setFlag(this.FLAG,"cockTypes",this.cockTypes);

      if(this.hasCock) this.sexual.lifetime.cumGiven=Number(fd.get("cumGiven"))||0;
      await this.actor.setFlag(this.FLAG,"sexual",this.sexual);

      ui.notifications.info("Sexual stats updated.");
      this.view="display";dialog.close();this.render();
    });
  }
};
