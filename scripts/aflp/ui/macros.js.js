// ============================================
// AFLP Macros (macro helpers for sexual and pregnancy actions)
// ============================================

if (!window.AFLP) throw new Error("AFLP schema not loaded");
if (!window.AFLP.Macros) window.AFLP.Macros = {};

// -------------------------------
// Recalculate cum for an actor
// -------------------------------
AFLP.Macros.recalcCum = async actor => {
  if (!actor) return console.warn("AFLP.Macros.recalcCum: no actor provided");
  return await AFLP.recalculateCum(actor);
};

// -------------------------------
// Reset sexual stats & pregnancy
// -------------------------------
AFLP.Macros.resetSexualStats = async actor => {
  if (!actor) return;
  await actor.setFlag(AFLP.FLAG_SCOPE,"sexual",structuredClone(AFLP.sexualDefaults));
  await actor.unsetFlag(AFLP.FLAG_SCOPE,"pregnancy");
  await AFLP.recalculateCum(actor);
  ui.notifications.info(`${actor.name} sexual stats and pregnancies reset.`);
};

// -------------------------------
// Add pregnancy macro
// -------------------------------
AFLP.Macros.addPregnancy = async (targetActor, partnerActor, options={}) => {
  await AFLP.ensureCoreFlags(targetActor);
  return await AFLP_Pregnancy.addPregnancy(targetActor, {
    partner: partnerActor,
    gestationTotal: options.gestationTotal ?? 30,
    offspring: options.offspring ?? 1,
    deliveryType: options.deliveryType ?? "live",
    method: options.method ?? "vaginal"
  });
};

// -------------------------------
// Attempt impregnation macro
// -------------------------------
AFLP.Macros.attemptImpregnation = async (targetActor, sourceActor) => {
  const cockTypes = await sourceActor.getFlag(AFLP.FLAG_SCOPE,"cockTypes") ?? {};
  const hasPotionOfBreeding = false; // placeholder, integrate with consumables if needed
  return await AFLP_Pregnancy.attemptImpregnation(targetActor, sourceActor, cockTypes, hasPotionOfBreeding);
};

// -------------------------------
// Apply cumflation manually
// -------------------------------
AFLP.Macros.addCumflation = async (actor, type="vaginal", amount=1) => {
  if (!actor) return;
  const c = await actor.getFlag(AFLP.FLAG_SCOPE,"cumflation") ?? {};
  c[type] = (c[type] ?? 0) + amount;
  await actor.setFlag(AFLP.FLAG_SCOPE,"cumflation",c);
  return c;
};

// -------------------------------
// Reset cumflation
// -------------------------------
AFLP.Macros.resetCumflation = async actor => {
  if (!actor) return;
  await actor.setFlag(AFLP.FLAG_SCOPE,"cumflation",structuredClone(AFLP.cumflationDefaults));
  ui.notifications.info(`${actor.name} cumflation reset.`);
};

// -------------------------------
// Add coomer levels
// -------------------------------
AFLP.Macros.addCoomerLevel = async (actor, amount=1) => {
  if (!actor) return;
  const coomer = await actor.getFlag(AFLP.FLAG_SCOPE,"coomer") ?? {level:0};
  coomer.level = Math.max(0, (coomer.level ?? 0) + amount);
  await actor.setFlag(AFLP.FLAG_SCOPE,"coomer",coomer);
  await AFLP.recalculateCum(actor);
  return coomer.level;
};

// -------------------------------
// Adjust arousal
// -------------------------------
AFLP.Macros.adjustArousal = async (actor, delta) => {
  if (!actor) return;
  const arousal = await actor.getFlag(AFLP.FLAG_SCOPE,"arousal") ?? structuredClone(AFLP.arousalDefaults);
  arousal.value = Math.min(Math.max(arousal.value + delta,0), arousal.max);
  await actor.setFlag(AFLP.FLAG_SCOPE,"arousal",arousal);
  return arousal.value;
};

// -------------------------------
// Toggle kinks
// -------------------------------
AFLP.Macros.setKink = async (actor, slug, enabled=true) => {
  if (!actor || !slug) return;
  const sexual = await actor.getFlag(AFLP.FLAG_SCOPE,"sexual") ?? structuredClone(AFLP.sexualDefaults);
  sexual.kinks = sexual.kinks ?? {};
  sexual.kinks[slug] = enabled;
  await actor.setFlag(AFLP.FLAG_SCOPE,"sexual",sexual);
  return sexual.kinks[slug];
};

// -------------------------------
// Utility: Get total cumflation average
// -------------------------------
AFLP.Macros.getCumflationTotal = actor => {
  if (!actor) return 0;
  const c = actor.getFlag(AFLP.FLAG_SCOPE,"cumflation") ?? {};
  return Math.floor(((c.anal??0)+(c.oral??0)+(c.vaginal??0))/3);
};

// -------------------------------
// Utility: Check if actor has cock or pussy
// -------------------------------
AFLP.Macros.hasGenitalia = async (actor) => {
  const hasPussy = !!(await actor.getFlag(AFLP.FLAG_SCOPE,"pussy"));
  const hasCock = !!(await actor.getFlag(AFLP.FLAG_SCOPE,"cock"));
  return { hasPussy, hasCock };
};
