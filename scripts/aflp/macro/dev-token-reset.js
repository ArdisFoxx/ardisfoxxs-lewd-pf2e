// ===============================
// AFLP - Dev Token Reset Macro  (testing utility)
// ===============================
// Resets the AFLP sexual stats of every selected token back to defaults so a
// scene can be re-tested from scratch. PRESERVES:
//   - genitalia (pussy / cock / genitalTypes flags and any genital items)
//   - the orientation kinks: Submissive, Dominant, Switch
// Everything else AFLP-tracked is cleared: arousal, cum, cumflation, overflow,
// horny, denied, coomer, partner history, pregnancies, lifetime metrics,
// titles, and all non-orientation kinks (flags + their items). Also strips the
// total-cumflation / facial-vision effect items.
// ===============================

(async () => {
  const sel = canvas.tokens.controlled.filter(t => t.actor);
  if (!sel.length) return ui.notifications.warn("Select one or more tokens to reset.");

  const FLAG = AFLP.FLAG_SCOPE;
  const KEEP_KINKS = ["dominant", "submissive", "switch"];
  const kinkReg = AFLP.kinks ?? {};
  const condReg = AFLP.conditions ?? {};
  const keepUuids = new Set(KEEP_KINKS.map(s => kinkReg[s]?.uuid).filter(Boolean));
  const allKinkUuids = new Set(Object.values(kinkReg).map(k => k?.uuid).filter(Boolean));
  // Sex-state effects to clear: Afterglow, Arousal, Defeated, Denied, Dominating,
  // Exposed, Horny, Bimbofied, Mind Break, Submitting, etc.
  const condUuids = new Set(Object.values(condReg).map(c => c?.uuid).filter(Boolean));
  const condSlugs = new Set(Object.keys(condReg));

  const clone = (o, fb) => (o ? foundry.utils.deepClone(o) : foundry.utils.deepClone(fb));

  let count = 0;
  for (const t of sel) {
    const actor = t.actor;

    // Preserve any orientation kinks currently present.
    const sexual = actor.getFlag(FLAG, "sexual") ?? {};
    const keptKinks = {};
    for (const slug of KEEP_KINKS) if (sexual.kinks?.[slug]) keptKinks[slug] = true;

    // Reset the sexual stat block (genitalia flags are NOT touched).
    const freshSexual = clone(AFLP.sexualDefaults, { lifetime: {}, titles: [], favorites: [], kinks: {}, kinkNotes: {} });
    freshSexual.kinks = keptKinks;
    await actor.setFlag(FLAG, "sexual", freshSexual);
    await actor.setFlag(FLAG, "cumOverflow", { anal: 0, oral: 0, vaginal: 0, facial: 0, paizuri: 0 });
    await actor.setFlag(FLAG, "arousal", clone(AFLP.arousalDefaults, { current: 0, max: 6, maxBase: 6 }));
    await actor.setFlag(FLAG, "horny", clone(AFLP.hornyDefaults, { temp: 0, permanent: 0 }));
    await actor.setFlag(FLAG, "denied", clone(AFLP.deniedDefaults, { value: 0 }));
    await actor.setFlag(FLAG, "cumflation", clone(AFLP.cumflationDefaults, { oral: 0, anal: 0, vaginal: 0, facial: 0 }));
    await actor.setFlag(FLAG, "coomer", clone(AFLP.coomerDefaults, { level: 0 }));
    await actor.setFlag(FLAG, "partnerHistory", []);
    await actor.setFlag(FLAG, "pregnancy", {});
    if (AFLP.recalculateCum) await AFLP.recalculateCum(actor);

    // Strip AFLP-applied items: cumflation effects, all sex-state condition
    // effects (afterglow/mind break/defeated/etc.), and acquired (non-orientation)
    // kink items. Genitalia and orientation-kink items are left in place.
    const toRemove = actor.items.filter(i => {
      if (i.getFlag("world", "aflpCumflationTotal") || i.getFlag("world", "aflpFacialVision")) return true;
      const slug = i.slug ?? i.system?.slug ?? "";
      const nm = (i.name ?? "").toLowerCase();
      if (i.type === "effect" && (slug.includes("cumflat") || nm.startsWith("cumflated"))) return true;
      if (slug && condSlugs.has(slug)) return true;
      const src = i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? i.sourceId ?? null;
      if (src && condUuids.has(src)) return true;
      return !!(src && allKinkUuids.has(src) && !keepUuids.has(src));
    });
    if (toRemove.length) await actor.deleteEmbeddedDocuments("Item", toRemove.map(i => i.id), { noHook: true });

    // Refresh splatter visuals to match the cleared state.
    window.AFLP_Splatter?.refreshActor?.(actor);
    count++;
  }

  ui.notifications.info(`AFLP: reset sexual stats on ${count} token${count === 1 ? "" : "s"} (kept genitalia + orientation kinks).`);
})();
