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
  applyCumflation: async (actor, cumFlags, cumOverflow, sexualStatsDialog, selectedHoles, cumUnitsSpent, attackerName) => {
    const receivingHoles = selectedHoles.filter(h => ["oral", "anal", "vaginal", "facial"].includes(h));
    if (!receivingHoles.length) return;

    const perHole  = Math.floor(cumUnitsSpent / receivingHoles.length);
    const remainder = cumUnitsSpent % receivingHoles.length;

    for (const [i, hole] of receivingHoles.entries()) {
      const prevUnits  = cumFlags[hole] ?? 0;
      const unitsToAdd = perHole + (i === 0 ? remainder : 0);

      // Tier clamped to 8 for all holes including facial
      cumFlags[hole] = Math.min(8, prevUnits + unitsToAdd);

      // Track overflow for all holes
      const overflow = Math.max(0, (prevUnits + unitsToAdd) - 8);
      if (overflow > 0) cumOverflow[hole] = (cumOverflow[hole] ?? 0) + overflow;

      // Fire tier message when the tier increases
      const newTier = cumFlags[hole];
      if (newTier > prevUnits && game.user.isGM) {
        // Cumflation word message
        if (newTier >= 1 && AFLP.Messages) {
          const msgKey = `cumflated-${hole}-${newTier}`;
          const msg = AFLP.Messages.get(msgKey, {
            target:   actor.name,
            attacker: attackerName ?? "",
          });
          if (msg) {
            const scenes = AFLP.HScene?._scenes;
            const sceneEntry = scenes
              ? [...scenes.entries()].find(([, sc]) => sc.targetActorId === actor.id)
              : null;
            if (sceneEntry) AFLP.HScene.addProse?.(sceneEntry[0], msg, "flavor");
          }
        }

        // Refresh the H scene portrait to update the cumflation status pill
        if (game.user.isGM) {
          const scenes = AFLP.HScene?._scenes;
          const sceneEntry = scenes
            ? [...scenes.entries()].find(([, sc]) => sc.targetActorId === actor.id)
            : null;
          if (sceneEntry) {
            // Short defer so cumflation flags are flushed before the refresh reads them
            setTimeout(() => AFLP.HScene.refreshScene?.(sceneEntry[0]), 200);
          }
        }
        // Speed penalty at tier 8 is handled automatically via FlatModifier rule elements
        // on the Cumflated [Hole] 8 condition items in the compendium - no direct actor update needed.
        if (newTier === 8 && ["anal","oral","vaginal"].includes(hole)) {
          const updatedFlags = { ...cumFlags };
          const allFull = (updatedFlags.anal ?? 0) >= 8 &&
                          (updatedFlags.oral ?? 0) >= 8 &&
                          (updatedFlags.vaginal ?? 0) >= 8;
          const allFullMsg = allFull
            ? ` Every hole is completely packed — ${actor.name} can barely move.`
            : "";
          const speedMsgs = {
            anal:    `${actor.name}'s distended belly and leaking ass make every step a struggle.`,
            oral:    `Cum overflows from ${actor.name}'s mouth with every movement, belly grotesquely swollen.`,
            vaginal: `${actor.name} staggers, thighs coated in thick ropes of cum leaking from their stuffed pussy.`,
          };
          ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><em>${speedMsgs[hole] ?? `${actor.name} is heavily cumflated.`}${allFullMsg}</em></p></div>`,
            speaker: { alias: "AFLP" },
          }).catch(() => {});
        }
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

    if (totalTier <= 0) {
      // Still need to handle facial vision even if no total tier
      await _applyFacialVision(actor, cumFlags.facial ?? 0);
      return;
    }

    // Pick cum-slut override or standard total effect
    const uuidArray = isCumSlut ? AFLP.items.cumSlutTotal : AFLP.items.cumflationTotal;
    const uuid      = uuidArray?.[totalTier - 1];
    if (!uuid) {
      await _applyFacialVision(actor, cumFlags.facial ?? 0);
      return;
    }

    const effectDoc = await fromUuid(uuid);
    if (!effectDoc) {
      await _applyFacialVision(actor, cumFlags.facial ?? 0);
      return;
    }

    const effect = effectDoc.toObject();
    effect.name  = `Cumflated ${totalTier}`;

    // Tag with a flag so we can find it reliably later
    foundry.utils.setProperty(effect, "flags.world.aflpCumflationTotal", true);

    await actor.createEmbeddedDocuments("Item", [effect], { noHook: true });
    await _applyFacialVision(actor, cumFlags.facial ?? 0);
  }
};

async function _applyFacialVision(actor, facialTier) {
    // Cum Slut L7: immune to Dazzled and Blinded caused by facials
    if (AFLP.actorHasKink?.(actor, "cum-slut") && (AFLP.getKinkLevel?.(actor, "cum-slut") ?? 0) >= 7) return;

    const DAZZLED_UUID = "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh";
    const BLINDED_UUID = "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2";

    // Remove any existing facial-vision conditions applied by AFLP
    const oldVision = actor.items.filter(i => i.getFlag("world", "aflpFacialVision") === true);
    if (oldVision.length) {
      await actor.deleteEmbeddedDocuments("Item", oldVision.map(i => i.id), { noHook: true });
    }

    if (facialTier >= 4) {
      const condUuid = facialTier >= 8 ? BLINDED_UUID : DAZZLED_UUID;
      const condDoc  = await fromUuid(condUuid);
      if (condDoc) {
        const condObj = condDoc.toObject();
        foundry.utils.setProperty(condObj, "flags.world.aflpFacialVision", true);
        await actor.createEmbeddedDocuments("Item", [condObj], { noHook: true });
      }
    }
};