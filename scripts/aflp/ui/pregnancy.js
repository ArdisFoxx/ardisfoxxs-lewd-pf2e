// ===============================
// AFLP Pregnancy Helper (aflp_pregnancy.js)
// ===============================
// Handles UUID-based pregnancy creation, tracking, progression, and birth
// Fully compatible with AFLP core flags, cumflation, and chat messaging
// ===============================

if (!window.AFLP.Macros) window.AFLP.Macros = {};

window.AFLP_Pregnancy = {

  getPregnancies: actor => actor.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? {},

  addPregnancy: async (actor, { partner, method = "vaginal", gestationTotal = 30, offspring = 1, deliveryType = "live" }) => {
    await AFLP.ensureCoreFlags(actor);
    const pregnancies = (await actor.getFlag(AFLP.FLAG_SCOPE, "pregnancy")) ?? {};
    const id = foundry.utils.randomID();
    pregnancies[id] = {
      sourceUuid: partner?.uuid ?? "",
      sourceName: partner?.name ?? "Unknown",
      gestationTotal,
      gestationRemaining: gestationTotal,
      offspring,
      deliveryType,
      method,
      startedAt: game.time.worldTime
    };
    await actor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
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
    await actor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
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

  // Automatic birth on gestation completion
  async recordBirth(actor, pregId) {
    const FLAG = AFLP.FLAG_SCOPE;
    const pregnancies = structuredClone(await actor.getFlag(FLAG, "pregnancy")) ?? {};
    const preg = pregnancies[pregId];
    if (!preg) return;

    // log birth
    ChatMessage.create({
      content: `${actor.name} gave birth to ${preg.offspring} ${preg.deliveryType === "egg" ? "eggs" : "offspring"} fathered by ${preg.sourceName}!`
    });

    // mark complete
    preg.gestationRemaining = "Complete";
    await actor.setFlag(FLAG, "pregnancy", pregnancies);
  }

};

// =====================================
// SexualStatsDialog pregnancy section
// =====================================
AFLP.UI.SexualStatsDialog.prototype._renderContent = function() {
  const pregRows = this.flatPregnancy.map((p, i) => `
    <tr>
      <td>${p.sourceName ?? "Unknown"}</td>
      <td>${p.deliveryType === "egg" ? "Egg" : "Live Birth"}</td>
      <td>${p.offspring ?? 1}</td>
      <td>${p.gestationRemaining <= 0 ? "Complete" : `${p.gestationRemaining}/${p.gestationTotal}`}</td>
    </tr>
  `).join("");

  return `
    <form id="aflp-sexual-stats">
      <table class="aflp-table">
        <tr>
          <th>Source</th>
          <th>Type</th>
          <th>Number</th>
          <th>Gestation</th>
        </tr>
        ${pregRows || `<tr><td colspan="4">None</td></tr>`}
      </table>
    </form>
  `;
};