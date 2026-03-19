// ===============================
// AFLP – Token Initialize Macro
// ===============================
// Initializes and migrates AFLP-related flags for selected actors.
// Run once per actor or after schema updates.

if (!window.AFLP) {
  const schema = await fromUuid(
    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-macros.Macro.onWnuWJsqNZH96fn"
  );
  await schema?.execute();
}

const FLAG = AFLP.FLAG_SCOPE;
const tokens = canvas.tokens.controlled;
if (!tokens.length) return ui.notifications.warn("Select at least one token.");

const COOMER_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.wBsTNWnQOnsiqjoy";
const CUMVOL_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JNCgJRCpdbCl8meY";

const GENITAL_TYPE_ITEMS = {
  pussy:               "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.pXivTb1f84SDm2xc",
  cock:                "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PR96OQsnDSzt1e4i",
  "cock-breeder":      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Lsd1xTTpGv7irtB",
  "cock-electrifying": "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jkRFNqFtRcKkAZwC",
  "cock-fertile":      "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tUqN9UtQhawLd5Nq",
  "cock-flared":       "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.qF8wy9Nz11DyBgRH",
  "cock-hemipenis":    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JTWCaeV5zCKpT7uk",
  "cock-knot":         "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.A8cubySA9aPKmNCF",
  "cock-ovidepositor": "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.0sZoe3XFXKv57RJ6",
  "cock-pacifying":    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.tuc39pbCilMKvYx8",
  "cock-paralyzing":   "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.vy3wCGu8tRKwfAP5",
  "cock-slime":        "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.TAfvb2RvjbwcT7Ci"
};

for (const { actor } of tokens) {
  const worldActor = actor.getWorldActor?.() ?? actor;

  // Core flag initialization
  await AFLP.ensureCoreFlags(worldActor);

  // --------------------------------------------------
  // Legacy item → flag migration: Coomer & Cum Volume
  // --------------------------------------------------
  const coomerItem = worldActor.items.find(i => i.sourceId === COOMER_UUID);
  if (coomerItem) {
    const level = Number(coomerItem.system.badge?.value ?? 1);
    await worldActor.setFlag(FLAG, "coomer", { level });
    await worldActor.deleteEmbeddedDocuments("Item", [coomerItem.id]);
  }

  const cumItem = worldActor.items.find(i => i.sourceId === CUMVOL_UUID);
  if (cumItem) {
    const current = Number(cumItem.system.badge?.value ?? 0);
    const max = Number(cumItem.system.badge?.max ?? current);
    await worldActor.setFlag(FLAG, "cum", { current, max });
    await worldActor.deleteEmbeddedDocuments("Item", [cumItem.id]);
  }

  // --------------------------------------------------
  // Legacy cockTypes flag → genitalTypes migration
  // Safely no-ops if cockTypes flag doesn't exist
  // --------------------------------------------------
  const oldCockTypes = worldActor.getFlag(FLAG, "cockTypes");
  const genitalTypes = structuredClone(worldActor.getFlag(FLAG, "genitalTypes") ?? {});

  if (oldCockTypes && typeof oldCockTypes === "object") {
    for (const [slug, val] of Object.entries(oldCockTypes)) {
      if (val) genitalTypes[slug] = true;
    }
    // Sync top-level cock flag if any cock type was set
    if (Object.entries(genitalTypes).some(([slug, val]) => slug.startsWith("cock") && val)) {
      await worldActor.setFlag(FLAG, "cock", true);
      genitalTypes["cock"] = true;
    }
    await worldActor.setFlag(FLAG, "genitalTypes", genitalTypes);
    await worldActor.unsetFlag(FLAG, "cockTypes");
  }

  // --------------------------------------------------
  // Legacy compendium item → genitalTypes migration
  // --------------------------------------------------
  for (const [slug, uuid] of Object.entries(GENITAL_TYPE_ITEMS)) {
    const item = worldActor.items.find(i => i.sourceId === uuid);
    if (!item) continue;
    genitalTypes[slug] = true;
    await worldActor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  if (genitalTypes["cock"]) await worldActor.setFlag(FLAG, "cock", true);
  if (genitalTypes["pussy"]) await worldActor.setFlag(FLAG, "pussy", true);
  await worldActor.setFlag(FLAG, "genitalTypes", genitalTypes);

  // --------------------------------------------------
  // Kink item → flag migration
  // --------------------------------------------------
  const sexual = structuredClone(worldActor.getFlag(FLAG, "sexual") ?? {});
  const kinkFlags = sexual.kinks ?? {};

  for (const [slug, data] of Object.entries(AFLP.kinks)) {
    const item = worldActor.items.find(i => i.sourceId === data.uuid);
    if (!item) continue;
    kinkFlags[slug] = true;
    await worldActor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  sexual.kinks = kinkFlags;
  await worldActor.setFlag(FLAG, "sexual", sexual);

  // --------------------------------------------------
  // Arousal — strip any existing Arousal effect/condition and reset to flag default.
  // Arousal is now tracked entirely in flags; the effect is no longer needed.
  // --------------------------------------------------
  const arousalEffects = worldActor.items.filter(i =>
    i.slug === "arousal" ||
    i.sourceId === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Z2RdSitwyyppWN8"
  );
  if (arousalEffects.length) {
    await worldActor.deleteEmbeddedDocuments("Item", arousalEffects.map(i => i.id));
    console.log(`AFLP | Stripped ${arousalEffects.length} Arousal effect(s) from ${worldActor.name}`);
  }
  // Ensure arousal flag exists at default (0 current, 6 max base)
  await worldActor.setFlag(FLAG, "arousal", structuredClone(AFLP.arousalDefaults));

  // --------------------------------------------------
  // Recalculate cum volume from coomer level
  // --------------------------------------------------
  await AFLP.recalculateCum(worldActor);

  ui.notifications.info(`${worldActor.name}: AFLP flags initialized.`);
}

window.AFLP_FLAGS_INITIALIZED = true;