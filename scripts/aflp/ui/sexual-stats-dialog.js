// ============================================
// AFLP.UI.SexualStatsDialog
// Foundry v13 / PF2e 7.8.0 compatible
// ============================================

if (!window.AFLP) throw new Error("AFLP schema not loaded");
if (!window.AFLP.UI) window.AFLP.UI = {};

AFLP.UI.SexualStatsDialog = class SexualStatsDialog {
  constructor(actor) {
    this.actor = actor;
    this.FLAG = AFLP.FLAG_SCOPE;
    this.view = "display";
    this.cumUnits = "ml";

    this.BASE_CUM_BY_SIZE = {
      tiny: 1,
      sm: 2,
      med: 4,
      lg: 80,
      huge: 1600,
      grg: 32000
    };

    this.CUM_UNIT_ML = 125;
  }

  async load() {
    await AFLP.ensureCoreFlags(this.actor);

    this.sexual = structuredClone(
      this.actor.getFlag(this.FLAG, "sexual")
    );
    this.cum = structuredClone(
      this.actor.getFlag(this.FLAG, "cum")
    );
    this.coomer = structuredClone(
      this.actor.getFlag(this.FLAG, "coomer")
    );
    this.hasPussy = !!this.actor.getFlag(this.FLAG, "pussy");
    this.hasCock = !!this.actor.getFlag(this.FLAG, "cock");
    this.cockTypes = structuredClone(
      this.actor.getFlag(this.FLAG, "cockTypes") ?? {}
    );
    this.pregnancy = structuredClone(
      this.actor.getFlag(this.FLAG, "pregnancy") ?? {}
    );

    this.size = this.actor.system.traits?.size?.value ?? "med";
  }

  render() {
    const title = `${this.actor.name} — Sexual Stats`;

    const content = this._renderContent();

    const dialog = new Dialog({
      title,
      content,
      buttons: { close: { label: "Close" } },
      render: html => this._activateListeners(html, dialog)
    });

    dialog.render(true);
  }

  _renderContent() {
    const acts = ["oral", "vaginal", "anal", "facial", "gangbang"]
      .map(act => {
        if (act === "vaginal" && !this.hasPussy) return "";
        const L = this.sexual.lifetime[act];
        const E = this.sexual.event[act];

        return this.view === "display"
          ? `<tr><td>${act}</td><td>${L}</td><td>${E}</td></tr>`
          : `<tr>
              <td>${act}</td>
              <td><input name="lifetime-${act}" type="number" value="${L}"/></td>
              <td><input name="event-${act}" type="number" value="${E}"/></td>
            </tr>`;
      })
      .join("");

    const cumReceived = ["oral", "vaginal", "anal", "facial"]
      .map(act => {
        if (act === "vaginal" && !this.hasPussy) return "";
        const v = this.sexual.lifetime.mlReceived[act];
        if (this.view === "display") {
          return `<li>${act}: ${v * this.CUM_UNIT_ML} ml</li>`;
        }
        return `<li>${act}: <input name="ml-${act}" type="number" value="${v}"/></li>`;
      })
      .join("");

    const cockTypesHtml = Object.keys(AFLP.cockTypes)
      .map(type => {
        const checked = this.cockTypes[type] ? "checked" : "";
        return `<label>
          <input type="checkbox" name="cockType-${type}" ${checked}/>
          ${type.replace("cock-", "")}
        </label>`;
      })
      .join("");

    return `
    <form id="aflp-sexual-stats">
      <style>
        .aflp-table { width:100%; border-collapse:collapse; }
        .aflp-table td, .aflp-table th { border:1px solid #aaa; padding:4px; }
        .aflp-section { margin-bottom:10px; }
      </style>

      <div class="aflp-section">
        <b>Cum:</b> ${this.cum.current} / ${this.cum.max}
        ${this.view === "adjust"
          ? `<br>Coomer: <input name="coomer" type="number" value="${this.coomer.level}"/>`
          : ""}
      </div>

      <div class="aflp-section">
        <table class="aflp-table">
          <tr><th>Act</th><th>Lifetime</th><th>Event</th></tr>
          ${acts}
        </table>
      </div>

      <div class="aflp-section">
        <b>Cum Received</b>
        <ul>${cumReceived}</ul>
      </div>

      ${this.hasCock
        ? `<div class="aflp-section"><b>Cum Given:</b> ${this.sexual.lifetime.cumGiven}</div>`
        : ""}

      ${this.hasPussy
        ? `<div class="aflp-section">
            <b>Pregnancy</b>
            <ul>
              ${Object.values(this.pregnancy).map(p =>
                `<li>${p.sourceName}: ${p.gestationRemaining}/${p.gestationTotal} (${p.deliveryType})</li>`
              ).join("")}
            </ul>
          </div>`
        : ""}

      ${this.view === "adjust"
        ? `<div class="aflp-section">
            <b>Genitalia</b><br>
            <label><input type="checkbox" name="pussy" ${this.hasPussy?"checked":""}/> Pussy</label>
            <label><input type="checkbox" name="cock" ${this.hasCock?"checked":""}/> Cock</label>
            <div>${cockTypesHtml}</div>
          </div>`
        : ""}

      <div style="text-align:center">
        ${this.view === "display"
          ? `<button type="button" data-action="adjust">Adjust</button>`
          : `<button type="submit">Apply</button>
             <button type="button" data-action="display">Display</button>`}
        <button type="button" data-action="reset">Reset</button>
      </div>
    </form>
    `;
  }

  _activateListeners(html, dialog) {
    html.find("[data-action=adjust]").click(() => {
      this.view = "adjust";
      dialog.close();
      this.render();
    });

    html.find("[data-action=display]").click(() => {
      this.view = "display";
      dialog.close();
      this.render();
    });

    html.find("[data-action=reset]").click(async () => {
      const ok = await Dialog.confirm({
        title: "Reset Sexual Stats",
        content: "Reset all sexual stats and clear pregnancies?"
      });
      if (!ok) return;

      this.sexual = structuredClone(AFLP.sexualDefaults);
      await this.actor.setFlag(this.FLAG, "sexual", this.sexual);
      await this.actor.unsetFlag(this.FLAG, "pregnancy");

      this.view = "display";
      dialog.close();
      this.render();
    });

    html.find("#aflp-sexual-stats").on("submit", async ev => {
      ev.preventDefault();
      const fd = new FormData(ev.currentTarget);

      this.coomer.level = Number(fd.get("coomer") ?? 0);
      await this.actor.setFlag(this.FLAG, "coomer", this.coomer);

      const base = this.BASE_CUM_BY_SIZE[this.size] ?? 4;
      const max = base * (1 + this.coomer.level);
      await this.actor.setFlag(this.FLAG, "cum", { current: max, max });

      ["oral","vaginal","anal","facial","gangbang"].forEach(act => {
        if (act === "vaginal" && !fd.get("pussy")) return;
        this.sexual.lifetime[act] = Number(fd.get(`lifetime-${act}`)) || 0;
        this.sexual.event[act] = Number(fd.get(`event-${act}`)) || 0;
        if (this.sexual.lifetime.mlReceived[act] !== undefined) {
          this.sexual.lifetime.mlReceived[act] = Number(fd.get(`ml-${act}`)) || 0;
        }
      });

      this.hasPussy = !!fd.get("pussy");
      this.hasCock = !!fd.get("cock");
      await this.actor.setFlag(this.FLAG, "pussy", this.hasPussy);
      await this.actor.setFlag(this.FLAG, "cock", this.hasCock);

      for (const type of Object.keys(AFLP.cockTypes)) {
        this.cockTypes[type] = !!fd.get(`cockType-${type}`);
      }
      await this.actor.setFlag(this.FLAG, "cockTypes", this.cockTypes);
      await this.actor.setFlag(this.FLAG, "sexual", this.sexual);

      ui.notifications.info("Sexual stats updated.");
      this.view = "display";
      dialog.close();
      this.render();
    });
  }
};