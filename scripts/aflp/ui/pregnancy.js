// ===============================
// AFLP Pregnancy Helper (aflp_pregnancy.js)
// ===============================
// Extends AFLP_Pregnancy (defined in sexual-stats-dialog.js) with:
//   - applyPotionOfBreeding
//   - recordBirth
//   - Potion of Breeding createItem hook
//   - SexualStatsDialog prototype override
// Core methods (getPregnancies, addPregnancy, attemptImpregnation,
// savePregnancies, rollLiveBirth, rollExploding2D4) come from
// sexual-stats-dialog.js and are preserved here — NOT overwritten.
// ===============================

if (!window.AFLP.Macros) window.AFLP.Macros = {};

// Merge unique methods into existing AFLP_Pregnancy without clobbering
// the core methods already defined by sexual-stats-dialog.js.
if (!window.AFLP_Pregnancy) window.AFLP_Pregnancy = {};

Object.assign(window.AFLP_Pregnancy, {

  // Only define core methods if they weren't already set by sexual-stats-dialog.js
  ...(!window.AFLP_Pregnancy.getPregnancies ? {
    getPregnancies: actor => actor.getFlag(AFLP.FLAG_SCOPE, "pregnancy") ?? {},
  } : {}),

  ...(!window.AFLP_Pregnancy.addPregnancy ? {
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
  } : {}),

  ...(!window.AFLP_Pregnancy.attemptImpregnation ? {
    attemptImpregnation: async (actor, sourceActor, cockTypes, hasPotionOfBreeding) => {
      const isOvidepositor = !!cockTypes["cock-ovidepositor"];
      const deliveryType = isOvidepositor ? "egg" : "live";
      const dc = cockTypes["cock-breeder"] ? 20 : cockTypes["cock-fertile"] ? 11 : 5;

      const roll = await new Roll("1d20").evaluate();
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
  } : {}),

  ...(!window.AFLP_Pregnancy.savePregnancies ? {
    savePregnancies: async (actor, pregnancies) => {
      await actor.setFlag(AFLP.FLAG_SCOPE, "pregnancy", pregnancies);
    },
  } : {}),

  ...(!window.AFLP_Pregnancy.rollLiveBirth ? {
    rollLiveBirth: async () => {
      let count = 1;
      while (true) {
        const roll = await new Roll("1d6").evaluate();
        if (roll.total === 6) count++;
        else break;
      }
      return count;
    },
  } : {}),

  ...(!window.AFLP_Pregnancy.rollExploding2D4 ? {
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
      return result.reduce((a,b) => a+b, 0);
    },
  } : {}),

  // -----------------------------------------------
  // These methods are ALWAYS added/overwritten since they are
  // unique to this file and not defined in sexual-stats-dialog.js.
  // -----------------------------------------------

  // Apply Potion of Breeding retroactively to existing pregnancies.
  applyPotionOfBreeding: async (actor) => {
    const FLAG = AFLP.FLAG_SCOPE;
    const pregnancies = structuredClone(actor.getFlag(FLAG, "pregnancy") ?? {});
    if (!Object.keys(pregnancies).length) return;

    let changed = false;
    for (const [id, preg] of Object.entries(pregnancies)) {
      if (preg.deliveryType !== "live") continue;
      if (preg.gestationRemaining === "Complete" || preg.gestationRemaining <= 0) continue;

      if (preg.gestationRemaining > 11) {
        preg.gestationRemaining = 11;
        preg.gestationTotal     = Math.min(preg.gestationTotal, 11);
        changed = true;
        console.log(`AFLP | Potion of Breeding applied to ${actor.name} — pregnancy by ${preg.sourceName} reduced to 11 days`);
      }
    }

    if (changed) {
      await actor.setFlag(FLAG, "pregnancy", pregnancies);
      ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p>The <strong>Potion of Breeding</strong> surges through <strong>${actor.name}</strong>'s body,
          accelerating the pregnancy to term in just 11 days.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },

  // Automatic birth on gestation completion
  async recordBirth(actor, pregId) {
    const FLAG = AFLP.FLAG_SCOPE;
    const pregnancies = structuredClone(await actor.getFlag(FLAG, "pregnancy")) ?? {};
    const preg = pregnancies[pregId];
    if (!preg) return;

    ChatMessage.create({
      content: `${actor.name} gave birth to ${preg.offspring} ${preg.deliveryType === "egg" ? "eggs" : "offspring"} fathered by ${preg.sourceName}!`
    });

    preg.gestationRemaining = "Complete";
    await actor.setFlag(FLAG, "pregnancy", pregnancies);
  }

});

// =====================================
// Potion of Breeding — retroactive gestation reduction hook
// Fires when any item is added to an actor; checks if it is the
// Potion of Breeding effect and if so applies the 11-day reduction.
// Only runs on the GM client to avoid duplicate writes.
// =====================================
Hooks.on("createItem", async (item, options, userId) => {
  if (!game.user.isGM) return;
  const POTION_UUID = AFLP.items?.["potion-of-breeding-effect"]?.uuid;
  if (!POTION_UUID) return;
  if (item.sourceId !== POTION_UUID) return;

  const actor = item.parent;
  if (!actor) return;

  await AFLP_Pregnancy.applyPotionOfBreeding(actor);
});

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