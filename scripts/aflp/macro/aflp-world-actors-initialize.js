// ===============================
// AFLP – World Actors Full Initialize
// ===============================
// Initializes all actors, adds missing flags,
// migrates legacy items and cockTypes flag, recalcs cum.

if (!window.AFLP) {
  const schema = await fromUuid(
    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-macros.Macro.onWnuWJsqNZH96fn"
  );
  await schema?.execute();
}

const FLAG = AFLP.FLAG_SCOPE;
const COOMER_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.wBsTNWnQOnsiqjoy";
const CUMVOL_UUID  = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.JNCgJRCpdbCl8meY";

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

let processedCount = 0;

for (const actor of game.actors.contents) {

  // -------------------------------
  // Ensure core flags exist (preserves existing values)
  // -------------------------------
  const sexual = actor.getFlag(FLAG, "sexual") ?? structuredClone(AFLP.sexualDefaults);
  await actor.setFlag(FLAG, "sexual", sexual);

  const cum = actor.getFlag(FLAG, "cum") ?? structuredClone(AFLP.cumDefaults);
  await actor.setFlag(FLAG, "cum", cum);

  const coomer = actor.getFlag(FLAG, "coomer") ?? structuredClone(AFLP.coomerDefaults);
  await actor.setFlag(FLAG, "coomer", coomer);

  await actor.setFlag(FLAG, "cock",   actor.getFlag(FLAG, "cock")   ?? false);
  await actor.setFlag(FLAG, "pussy",  actor.getFlag(FLAG, "pussy")  ?? false);

  const genitalTypes = actor.getFlag(FLAG, "genitalTypes") ?? {};
  await actor.setFlag(FLAG, "genitalTypes", genitalTypes);

  await actor.setFlag(FLAG, "pregnancy",   actor.getFlag(FLAG, "pregnancy")   ?? {});
  await actor.setFlag(FLAG, "cumflation",  actor.getFlag(FLAG, "cumflation")  ?? structuredClone(AFLP.cumflationDefaults));
  await actor.setFlag(FLAG, "cumOverflow", actor.getFlag(FLAG, "cumOverflow") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 });

  // -------------------------------
  // Legacy cockTypes flag → genitalTypes migration
  // Safely no-ops if cockTypes doesn't exist
  // -------------------------------
  const oldCockTypes = actor.getFlag(FLAG, "cockTypes");
  const currentGenitalTypes = structuredClone(actor.getFlag(FLAG, "genitalTypes") ?? {});

  if (oldCockTypes && typeof oldCockTypes === "object") {
    for (const [slug, val] of Object.entries(oldCockTypes)) {
      if (val) currentGenitalTypes[slug] = true;
    }
    if (Object.entries(currentGenitalTypes).some(([slug, val]) => slug.startsWith("cock") && val)) {
      await actor.setFlag(FLAG, "cock", true);
      currentGenitalTypes["cock"] = true;
    }
    await actor.setFlag(FLAG, "genitalTypes", currentGenitalTypes);
    await actor.unsetFlag(FLAG, "cockTypes");
  }

  // -------------------------------
  // Legacy item migration: Coomer
  // -------------------------------
  const coomerItem = actor.items.find(i => i.sourceId === COOMER_UUID);
  if (coomerItem && !actor.getFlag(FLAG, "coomer")) {
    const level = Number(coomerItem.system.badge?.value ?? 1);
    await actor.setFlag(FLAG, "coomer", { level });
    await actor.deleteEmbeddedDocuments("Item", [coomerItem.id]);
  }

  // Legacy item migration: Cum Volume
  const cumItem = actor.items.find(i => i.sourceId === CUMVOL_UUID);
  const cumData = actor.getFlag(FLAG, "cum");
  if (cumItem && (!cumData || cumData.max === 0)) {
    const current = Number(cumItem.system.badge?.value ?? 0);
    const max = Number(cumItem.system.badge?.max ?? current);
    await actor.setFlag(FLAG, "cum", { current, max });
    await actor.deleteEmbeddedDocuments("Item", [cumItem.id]);
  }

  // -------------------------------
  // Legacy compendium item → genitalTypes migration
  // -------------------------------
  const latestGenitalTypes = structuredClone(actor.getFlag(FLAG, "genitalTypes") ?? {});
  let genitalTypesChanged = false;

  for (const [slug, uuid] of Object.entries(GENITAL_TYPE_ITEMS)) {
    const item = actor.items.find(i => i.sourceId === uuid);
    if (item && !latestGenitalTypes[slug]) {
      latestGenitalTypes[slug] = true;
      genitalTypesChanged = true;
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
    }
  }

  if (genitalTypesChanged) {
    if (latestGenitalTypes["cock"])  await actor.setFlag(FLAG, "cock", true);
    if (latestGenitalTypes["pussy"]) await actor.setFlag(FLAG, "pussy", true);
    await actor.setFlag(FLAG, "genitalTypes", latestGenitalTypes);
  }

  // -------------------------------
  // Kink item → flag migration
  // -------------------------------
  const sexualData = structuredClone(actor.getFlag(FLAG, "sexual") ?? {});
  const kinkFlags = sexualData.kinks ?? {};
  let kinksChanged = false;

  for (const [slug, data] of Object.entries(AFLP.kinks)) {
    const item = actor.items.find(i => i.sourceId === data.uuid);
    if (!item) continue;
    kinkFlags[slug] = true;
    kinksChanged = true;
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  if (kinksChanged) {
    sexualData.kinks = kinkFlags;
    await actor.setFlag(FLAG, "sexual", sexualData);
  }

  // -------------------------------
  // Arousal — strip effect, reset flag to default
  // -------------------------------
  const arousalEffects = actor.items.filter(i =>
    i.slug === "arousal" ||
    i.sourceId === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.7Z2RdSitwyyppWN8"
  );
  if (arousalEffects.length) {
    await actor.deleteEmbeddedDocuments("Item", arousalEffects.map(i => i.id));
  }
  await actor.setFlag(FLAG, "arousal", structuredClone(AFLP.arousalDefaults));

  // -------------------------------
  // Recalculate cum if missing
  // -------------------------------
  const cumFinal = actor.getFlag(FLAG, "cum");
  if (!cumFinal || (cumFinal.current === 0 && cumFinal.max === 0)) {
    await AFLP.recalculateCum(actor);
  }

  processedCount++;
}

ui.notifications.info(`AFLP: All ${processedCount} world actors fully processed!`);