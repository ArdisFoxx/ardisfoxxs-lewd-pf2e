// ===============================
// AFLP - Cum Cleaner Macro
// ===============================
// Cleans AFLP cum splatter off the floor of the current scene. Optionally
// bottles the floor cum into bottled-cum consumables (Bottled Cum on DH, Vial
// of Cum on PF2e) in the selected token's
// inventory. Ground splatter is stored per-token in the scene flag
// flags.ardisfoxxs-lewd-pf2e.splatterPuddles (see aflp-splatter.js).
// ===============================

(async () => {
  const MODULE_ID  = "ardisfoxxs-lewd-pf2e";
  const PUDDLE_KEY = "splatterPuddles";
  // Resolve the bottled-cum item per system: the DH Bottled Cum item (tagged
  // aflrKey "vial-of-cum") on DH, the canonical PF2e compendium item elsewhere.
  const VIAL_UUID = AFLP.system?.contentUuid?.("vial-of-cum")
    ?? "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rloXTr10gPd7Xh0J";

  const scene = canvas?.scene;
  if (!scene) return ui.notifications.warn("No active scene.");

  // Tally floor cum. Puddle records may be a per-token array (current) or a
  // single legacy object; normalise both. The map is keyed by token id, so each
  // entry is one actor's pools.
  const map = scene.getFlag(MODULE_ID, PUDDLE_KEY) ?? {};
  let puddles = 0, vials = 0;
  for (const v of Object.values(map)) {
    const list = Array.isArray(v) ? v : (v ? [v] : []);
    for (const rec of list) {
      puddles++;
      // Leak pools are the dribble a brim-full actor leaves while walking. They
      // can be mopped up (they count as splatters for the clean prompt) but they
      // NEVER bottle - otherwise a player could just walk-and-bottle for infinite
      // vials. Only deposited pools (cumflation overflow, ground cum, purge) bottle.
      if (rec.leak) continue;
      // Non-leak pools scale with what they represent: every overflow unit that
      // flooded past the brim (~250ml each, from spill events) PLUS a drip share
      // from the pool's cumflation tier - the tier drives the pool's on-canvas
      // size (tier 1-2 a small splatter, 8-9 a room-flooding slick), so a big
      // pool bottles big even when nothing ever overflowed.
      const drip = Math.ceil(Math.max(0, rec.tier ?? 0) / 2);
      vials += Math.max(1, (rec.spillUnits ?? 0) + drip);
    }
  }
  if (!puddles) return ui.notifications.info("There's no cum on the floor here.");

  const clearFloor = async () => {
    // Clear the per-token spill markers so pools don't immediately re-flood big.
    try {
      for (const tokId of Object.keys(map)) {
        const tok = scene.tokens?.get?.(tokId);
        const act = tok?.actor;
        // AFLP.FLAG_SCOPE, NOT MODULE_ID. `cumSpill` is an ACTOR flag and is written
        // at schema.js:3002 with setFlag(AFLP.FLAG_SCOPE, ...) - "world". Read here
        // under the module id it always came back undefined, the `!== undefined`
        // guard was always false, and the unset never ran: the Cum Cleaner mopped
        // the floor and left every token's spill marker standing, so the next spill
        // re-flooded at the old width. Exactly what the comment above says this
        // loop prevents. The SCENE puddle map on the next line is a different
        // document and IS module-scoped on both sides, so it stays.
        // Found 20 Aug 2026 by the entry-point sweep.
        const _SPILL_SCOPE = AFLP.FLAG_SCOPE;
        if (act?.getFlag?.(_SPILL_SCOPE, "cumSpill") !== undefined) await act.unsetFlag(_SPILL_SCOPE, "cumSpill");
      }
    } catch (e) { /* best effort */ }
    if (window.AFLP_Splatter?.clearScenePuddles) await window.AFLP_Splatter.clearScenePuddles(scene);
    else await scene.unsetFlag(MODULE_ID, PUDDLE_KEY);
  };

  const bottleIt = async () => {
    if (vials <= 0) { ui.notifications.info("These are just drips - nothing worth bottling. Mop them up instead."); return false; }
    const sel = canvas.tokens.controlled.filter(t => t.actor);
    if (!sel.length) { ui.notifications.warn("Select a token to hold the vials."); return false; }
    const src = await fromUuid(VIAL_UUID);
    if (!src) { ui.notifications.error("Bottled-cum item not found in the AFLP items compendium."); return false; }
    const recipient = sel[0].actor;
    const data = src.toObject();
    foundry.utils.setProperty(data, "system.quantity", vials);
    await recipient.createEmbeddedDocuments("Item", [data]);
    ChatMessage.create({
      content: `<em>${recipient.name} scoops the floor clean and bottles it into ${vials}x ${src.name}.</em>`,
    });
    return true;
  };

  foundry.applications.api.DialogV2.wait({
    window: { title: "Lick it all up?" },
    content: `<p>There ${puddles === 1 ? "is" : "are"} <strong>${puddles}</strong> cum splatter${puddles === 1 ? "" : "s"} on the floor of this scene${vials > 0 ? ` (about <strong>${vials}</strong> vial${vials === 1 ? "" : "s"}' worth)` : " (just drips - nothing to bottle)"}.</p>`,
    buttons: [
      { action: "clean", icon: "fas fa-broom", label: "Clean Cum off Floor", default: true,
        callback: async () => { await clearFloor(); ChatMessage.create({ content: "<em>The floor is licked clean.</em>" }); } },
      { action: "vials", icon: "fas fa-flask", label: "Put Floor Cum in Vials",
        callback: async () => { const ok = await bottleIt(); if (ok) await clearFloor(); } },
      { action: "cancel", icon: "fas fa-times", label: "Cancel" },
    ],
  });
})();
