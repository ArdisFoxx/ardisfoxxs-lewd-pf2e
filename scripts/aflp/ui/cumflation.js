// ===============================
// AFLP Cumflation Helper (cumflation.js)
// ===============================
// Per-hole cumflation tiers (anal/oral/vaginal/facial) are now stored as
// flags only. Only the total cumflation effect is applied as an item,
// as it carries actual mechanical status penalties.

if (!window.AFLP.Macros) window.AFLP.Macros = {};

window.AFLP_Cumflation = {

  getCumflation: actor => structuredClone(
    actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 }
  ),

  getCumOverflow: actor => structuredClone(
    actor.getFlag(AFLP.FLAG_SCOPE, "cumOverflow") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 }
  ),

  // Distribute cumUnitsSpent across the given holes on the target.
  // Mutates cumFlags and sexualStatsDialog.sexual in place.
  // Caller is responsible for saving afterward.
  applyCumflation: (actor, cumFlags, cumOverflow, sexualStatsDialog, selectedHoles, cumUnitsSpent) => {
    const receivingHoles = selectedHoles.filter(h => ["oral", "anal", "vaginal", "facial"].includes(h));
    if (!receivingHoles.length) return;

    const perHole  = Math.floor(cumUnitsSpent / receivingHoles.length);
    const remainder = cumUnitsSpent % receivingHoles.length;

    for (const [i, hole] of receivingHoles.entries()) {
      const prevUnits  = cumFlags[hole] ?? 0;
      const unitsToAdd = perHole + (i === 0 ? remainder : 0);

      // Tier clamped to 8 for anal/oral/vaginal; facial is uncapped
      cumFlags[hole] = hole === "facial"
        ? prevUnits + unitsToAdd
        : Math.min(8, prevUnits + unitsToAdd);

      // Track overflow for capped holes
      if (hole !== "facial") {
        const overflow = Math.max(0, (prevUnits + unitsToAdd) - 8);
        cumOverflow[hole] = (cumOverflow[hole] ?? 0) + overflow;
      }

      // Lifetime mlReceived per hole
      // Guard against mlReceived being stored as a number (legacy data) or missing entirely.
      if (typeof sexualStatsDialog.sexual.lifetime.mlReceived !== "object" ||
          sexualStatsDialog.sexual.lifetime.mlReceived === null) {
        sexualStatsDialog.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      }
      sexualStatsDialog.sexual.lifetime.mlReceived[hole] =
        (sexualStatsDialog.sexual.lifetime.mlReceived[hole] ?? 0) + (unitsToAdd * AFLP.CUM_UNIT_ML);
    }

    // Lifetime total cumReceived (all holes combined)
    if (sexualStatsDialog?.sexual?.lifetime !== undefined) {
      sexualStatsDialog.sexual.lifetime.cumReceived =
        (sexualStatsDialog.sexual.lifetime.cumReceived ?? 0) + cumUnitsSpent * AFLP.CUM_UNIT_ML;
    }
  },

  saveCumflation: async (actor, cumFlags, cumOverflow) => {
    await actor.setFlag(AFLP.FLAG_SCOPE, "cumflation",  cumFlags);
    await actor.setFlag(AFLP.FLAG_SCOPE, "cumOverflow", cumOverflow);
  },

  // Applies only the TOTAL cumflation effect item.
  // Per-hole effects are no longer applied as items — tier is flag-only.
  // Total = Math.floor((anal + oral + vaginal) / 3), capped at 8.
  applyCumflationEffects: async actor => {
    const FLAG      = AFLP.FLAG_SCOPE;
    const cumFlags  = actor.getFlag(FLAG, "cumflation") ?? {};
    const sexual    = actor.getFlag(FLAG, "sexual") ?? {};
    const kinks     = sexual.kinks ?? {};
    const isCumSlut = !!kinks["cum-slut"];

    const anal    = cumFlags.anal    ?? 0;
    const oral    = cumFlags.oral    ?? 0;
    const vaginal = cumFlags.vaginal ?? 0;

    // Total tier = floor average of the three capped holes, capped at 8
    const totalTier = Math.min(8, Math.floor((anal + oral + vaginal) / 3));

    // Remove any existing total cumflation effect
    const oldTotal = actor.items.filter(i => i.getFlag("world", "aflpCumflationTotal") === true);
    if (oldTotal.length) {
      await actor.deleteEmbeddedDocuments("Item", oldTotal.map(i => i.id), { noHook: true });
    }

    if (totalTier <= 0) return;

    // Pick cum-slut override or standard total effect
    const uuidArray = isCumSlut ? AFLP.items.cumSlutTotal : AFLP.items.cumflationTotal;
    const uuid      = uuidArray?.[totalTier - 1];
    if (!uuid) return;

    const effectDoc = await fromUuid(uuid);
    if (!effectDoc) return;

    const effect = effectDoc.toObject();
    effect.name  = `Cumflated ${totalTier}`;

    // Tag with a flag so we can find it reliably later
    foundry.utils.setProperty(effect, "flags.world.aflpCumflationTotal", true);

    await actor.createEmbeddedDocuments("Item", [effect], { noHook: true });
  }
};