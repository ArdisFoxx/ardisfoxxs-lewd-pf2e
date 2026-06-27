// ===============================
// AFLP - Cum Rag Macro
// ===============================
// Cleans AFLP cum splatter off the floor of the current scene. Optionally
// bottles the floor cum into "Vial of Cum" consumables in the selected token's
// inventory. Ground splatter is stored per-token in the scene flag
// flags.ardisfoxxs-lewd-pf2e.splatterPuddles (see aflp-splatter.js).
// ===============================

(async () => {
  const MODULE_ID  = "ardisfoxxs-lewd-pf2e";
  const PUDDLE_KEY = "splatterPuddles";
  // Resolve the Vial of Cum per system: the Daggerheart pack item (tagged
  // aflrKey "vial-of-cum") on DH, the canonical PF2e compendium item elsewhere.
  const VIAL_UUID = AFLP.system?.contentUuid?.("vial-of-cum")
    ?? "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rloXTr10gPd7Xh0J";

  const scene = canvas?.scene;
  if (!scene) return ui.notifications.warn("No active scene.");

  // Tally floor cum. Puddle records may be a per-token array (current) or a
  // single legacy object; normalise both.
  const map = scene.getFlag(MODULE_ID, PUDDLE_KEY) ?? {};
  let puddles = 0, vials = 0;
  for (const v of Object.values(map)) {
    const list = Array.isArray(v) ? v : (v ? [v] : []);
    for (const rec of list) {
      puddles++;
      // One vial per ordinary splatter; a big overflow flood bottles into many
      // (its spilled volume in cum units, each ~250ml).
      vials += Math.max(1, rec.spillUnits ?? 1);
    }
  }
  if (!puddles) return ui.notifications.info("There's no cum on the floor here.");

  const clearFloor = async () => {
    // Clear the per-token spill markers so pools don't immediately re-flood big.
    try {
      for (const tokId of Object.keys(map)) {
        const tok = scene.tokens?.get?.(tokId);
        const act = tok?.actor;
        if (act?.getFlag?.(MODULE_ID, "cumSpill") !== undefined) await act.unsetFlag(MODULE_ID, "cumSpill");
      }
    } catch (e) { /* best effort */ }
    if (window.AFLP_Splatter?.clearScenePuddles) await window.AFLP_Splatter.clearScenePuddles(scene);
    else await scene.unsetFlag(MODULE_ID, PUDDLE_KEY);
  };

  const bottleIt = async () => {
    const sel = canvas.tokens.controlled.filter(t => t.actor);
    if (!sel.length) { ui.notifications.warn("Select a token to hold the vials."); return false; }
    const src = await fromUuid(VIAL_UUID);
    if (!src) { ui.notifications.error("'Vial of Cum' item not found in the AFLP items compendium."); return false; }
    const recipient = sel[0].actor;
    const data = src.toObject();
    foundry.utils.setProperty(data, "system.quantity", vials);
    await recipient.createEmbeddedDocuments("Item", [data]);
    ChatMessage.create({
      content: `<em>${recipient.name} scoops the floor clean and bottles it into ${vials} Vial${vials === 1 ? "" : "s"} of Cum.</em>`,
    });
    return true;
  };

  new Dialog({
    title: "Lick it all up?",
    content: `<p>There ${puddles === 1 ? "is" : "are"} <strong>${puddles}</strong> cum splatter${puddles === 1 ? "" : "s"} on the floor of this scene (about <strong>${vials}</strong> vial${vials === 1 ? "" : "s"}' worth).</p>`,
    buttons: {
      clean: {
        icon: '<i class="fas fa-broom"></i>',
        label: "Clean Cum off Floor",
        callback: async () => { await clearFloor(); ChatMessage.create({ content: "<em>The floor is licked clean.</em>" }); },
      },
      vials: {
        icon: '<i class="fas fa-flask"></i>',
        label: "Put Floor Cum in Vials",
        callback: async () => { const ok = await bottleIt(); if (ok) await clearFloor(); },
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" },
    },
    default: "clean",
  }).render(true);
})();
