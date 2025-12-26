// ===============================
// AFLP Cumflation Helper (aflp_cumflation.js) – AUDITED
// ===============================

if (!window.AFLP.Macros) window.AFLP.Macros = {};

window.AFLP_Cumflation = {
  getCumflation: actor => structuredClone(actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 }),
  getCumOverflow: actor => structuredClone(actor.getFlag(AFLP.FLAG_SCOPE, "cumOverflow") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 }),

  applyCumflation: (actor, cumFlags, cumOverflow, sexualStatsDialog, selectedHoles, cumUnitsSpent) => {
    const receivingHoles = selectedHoles.filter(h => ["oral","anal","vaginal","facial"].includes(h));
    if (!receivingHoles.length) return;

    const perHole = Math.floor(cumUnitsSpent / receivingHoles.length);
    const remainder = cumUnitsSpent % receivingHoles.length;

    for (const [i, hole] of receivingHoles.entries()) {
      const prevUnits = cumFlags[hole] ?? 0;

      // Apply tier clamping for anal/oral/vaginal only
      const appliedTier = hole === "facial" ? prevUnits + perHole + (i === 0 ? remainder : 0) : Math.min(8, prevUnits + perHole + (i === 0 ? remainder : 0));
      cumFlags[hole] = appliedTier;

      // Overflow only applies to capped holes
      const overflow = (hole === "facial") ? 0 : Math.max(0, (prevUnits + perHole + (i === 0 ? remainder : 0)) - 8);
      cumOverflow[hole] = (cumOverflow[hole] ?? 0) + overflow;

      // Ensure lifetime mlReceived exists
      if (!sexualStatsDialog.sexual.lifetime.mlReceived[hole]) sexualStatsDialog.sexual.lifetime.mlReceived[hole] = 0;

      // Increment lifetime mlReceived fully, uncapped
      const unitsToAdd = perHole + (i === 0 ? remainder : 0);
      sexualStatsDialog.sexual.lifetime.mlReceived[hole] += unitsToAdd * 125;
    }

    // Total cumReceived across all holes (uncapped)
    if (sexualStatsDialog?.sexual?.lifetime?.cumReceived !== undefined) {
      sexualStatsDialog.sexual.lifetime.cumReceived += cumUnitsSpent * 125;
    }
  },

  saveCumflation: async (actor, cumFlags, cumOverflow) => {
    await actor.setFlag(AFLP.FLAG_SCOPE, "cumflation", cumFlags);
    await actor.setFlag(AFLP.FLAG_SCOPE, "cumOverflow", cumOverflow);
  },

  applyCumflationEffects: async actor => {
    const cumFlags = actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    const newItems = [];
    const holeEffectMap = {
      anal: AFLP.items.cumflationAnal,
      oral: AFLP.items.cumflationOral,
      vaginal: AFLP.items.cumflationVaginal
      // Facial has no embedded effects
    };

    for (const hole of ["anal","oral","vaginal"]) {
      const tier = cumFlags[hole] ?? 0;
      if (tier <= 0) continue;

      const uuid = holeEffectMap[hole]?.[tier - 1];
      if (!uuid) continue;

      const old = actor.items.filter(i =>
        i.name.startsWith(`Cumflated ${hole.charAt(0).toUpperCase() + hole.slice(1)}`)
      );
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(i=>i.id), { noHook:true });

      const effectDoc = await fromUuid(uuid);
      if (!effectDoc) continue;

      const effect = effectDoc.toObject();
      effect.name = `Cumflated ${hole.charAt(0).toUpperCase() + hole.slice(1)} ${tier}`;
      newItems.push(effect);
    }

    // Total cumflation tier (anal/oral/vaginal average)
    const totalRaw = ((cumFlags.anal ?? 0) + (cumFlags.oral ?? 0) + (cumFlags.vaginal ?? 0)) / 3;
    const totalTier = Math.clamp(Math.round(totalRaw), 0, 8);

    if (totalTier > 0) {
      const uuid = AFLP.items.cumflationTotal?.[totalTier - 1];
      if (uuid) {
        const oldTotal = actor.items.filter(i =>
          i.name.startsWith("Cumflated ") &&
          !["Oral","Anal","Vaginal"].some(h => i.name.includes(h))
        );
        if (oldTotal.length) await actor.deleteEmbeddedDocuments("Item", oldTotal.map(i=>i.id), { noHook:true });

        const effectDoc = await fromUuid(uuid);
        if (effectDoc) {
          const effect = effectDoc.toObject();
          effect.name = `Cumflated ${totalTier}`;
          newItems.push(effect);
        }
      }
    }

    if (newItems.length) await actor.createEmbeddedDocuments("Item", newItems, { noHook:true });
  }
};
