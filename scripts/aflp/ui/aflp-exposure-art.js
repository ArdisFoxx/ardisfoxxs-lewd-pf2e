// ===============================
// AFLR - Exposure Token Variant Art (aflp-exposure-art.js)
// ===============================
// Maps token art to a creature's Exposed value: Exposed 0 / 1 / 2 each show a
// user-chosen image, so a stripped token looks stripped. Plays nice with:
//   - the prototype token (PF2e re-derives token art from it, so we write it
//     first, then push to placed tokens),
//   - the base token texture,
//   - the dynamic ring (we set ring.subject.texture when the ring is enabled),
//   - wildcard art (randomImg): left untouched - that is the user's own system.
//
// Data lives on flags.<scope>.exposureArt:
//   { enabled, base, e1, e2, _origin: { texture, subject, ringEnabled } }
// base is optional: blank means "use the actor's own art at Exposed 0".
// ===============================

(() => {
  window.AFLP = window.AFLP || {};
  if (AFLP.ExposureArt) return;

  const KEY = "exposureArt";
  const F = () => AFLP.FLAG_SCOPE;

  function _cfg(actor) {
    return actor?.getFlag?.(F(), KEY) ?? null;
  }

  // Which image should show at the actor's current Exposed level.
  // Returns { src, origin } where origin true means "fall back to normal art".
  function _wantFor(actor, cfg) {
    const lvl = AFLP.Kinks?._getEffectiveExposedLevel?.(actor) ?? 0;
    let src = "";
    if (lvl >= 2) src = cfg.e2 || cfg.e1 || cfg.base || "";
    else if (lvl >= 1) src = cfg.e1 || cfg.base || "";
    else src = cfg.base || "";
    // A blank slot for this tier means "no variant here" -> restore the original.
    if (!src) return { src: cfg._origin?.texture ?? null, origin: true };
    return { src, origin: false };
  }

  // Apply the correct art for this actor's Exposed value. Idempotent - safe to
  // call on every exposure change.
  AFLP.ExposureArt = {
    async sync(actor) {
      try {
        const world = actor?.getWorldActor?.() ?? actor;
        if (!world) return;
        const cfg = _cfg(world);
        if (!cfg || !cfg.enabled) return;

        const proto = world.prototypeToken;
        // Wildcard art is the user's own variant system; never fight it.
        if (proto?.randomImg) return;

        // Save the originals ONCE, before the first swap, so we can restore.
        if (!cfg._origin) {
          const origin = {
            img:     world.img ?? null,          // PF2e derives token art from actor.img
            texture: proto?.texture?.src ?? null,
            subject: proto?.ring?.subject?.texture ?? null,
            ringEnabled: !!proto?.ring?.enabled,
          };
          await AFLP.gm.run("setFlag", world, `${KEY}._origin`, origin);
          cfg._origin = origin;
        }

        const { src } = _wantFor(world, cfg);
        if (!src) return;

        const ringOn = !!proto?.ring?.enabled;
        // PF2e re-derives token art from actor.img in prepareData, overriding a
        // bare token or prototype texture write. So the actor image is the true
        // lever; we set it alongside the prototype and token so all three agree.
        // NOTE: this also changes the actor's sheet portrait - that is the cost of
        // PF2e's art-link, and the original img is restored on disable / Exposed 0.
        const actorUpdate = { img: src, "prototypeToken.texture.src": src };
        if (ringOn) actorUpdate["prototypeToken.ring.subject.texture"] = src;
        if (AFLP.gm.canWrite(world)) await world.update(actorUpdate);
        else await AFLP.gm.run("updateActor", world, actorUpdate);

        // Push to every placed token of this actor.
        const tokUpdate = { "texture.src": src };
        if (ringOn) tokUpdate["ring.subject.texture"] = src;
        for (const t of world.getActiveTokens()) {
          const td = t.document ?? t;
          if (AFLP.gm.canWrite(td)) await td.update(tokUpdate);
          else await AFLP.gm.run("updateTokenDoc", td, tokUpdate);
        }

        // If this actor is in an open H-Scene, its portrait was snapshotted at
        // build time - refresh it so the card tracks the new token art. The
        // arousal refresh does a full portrait re-render, which now re-reads live
        // art, so it doubles as the art refresh.
        try { AFLP.HScene?.refreshArousalForActor?.(world.id); } catch (e) { /* non-fatal */ }
      } catch (e) { console.warn("AFLP | ExposureArt.sync:", e?.message); }
    },

    // Restore the saved originals and forget them. Called on disable.
    async restore(actor) {
      try {
        const world = actor?.getWorldActor?.() ?? actor;
        const cfg = _cfg(world);
        const origin = cfg?._origin;
        if (!world || !origin) return;
        const actorUpdate = { img: origin.img ?? origin.texture, "prototypeToken.texture.src": origin.texture };
        if (origin.ringEnabled) actorUpdate["prototypeToken.ring.subject.texture"] = origin.subject;
        if (AFLP.gm.canWrite(world)) await world.update(actorUpdate);
        else await AFLP.gm.run("updateActor", world, actorUpdate);
        const tokUpdate = { "texture.src": origin.texture };
        if (origin.ringEnabled) tokUpdate["ring.subject.texture"] = origin.subject;
        for (const t of world.getActiveTokens()) {
          const td = t.document ?? t;
          if (AFLP.gm.canWrite(td)) await td.update(tokUpdate);
          else await AFLP.gm.run("updateTokenDoc", td, tokUpdate);
        }
        try { AFLP.HScene?.refreshArousalForActor?.(world.id); } catch (e) { /* non-fatal */ }
      } catch (e) { console.warn("AFLP | ExposureArt.restore:", e?.message); }
    },

    // Persist a new map from the condition manager, then apply immediately.
    async save(actor, { enabled, base, e1, e2 }) {
      const world = actor?.getWorldActor?.() ?? actor;
      if (!world) return;
      const prev = _cfg(world) ?? {};
      const cfg = { enabled: !!enabled, base: base || "", e1: e1 || "", e2: e2 || "", _origin: prev._origin ?? null };
      await AFLP.gm.run("setFlag", world, KEY, cfg);
      if (cfg.enabled) await this.sync(world);
      else await this.restore(world);
    },

    get(actor) { return _cfg(actor?.getWorldActor?.() ?? actor); },
  };

  // Recompute on ANY exposure change - not the fragile increase-only edge hook.
  // PF2e: the exposed / exposed-nude condition items. DH: the vulnerable toggle
  // routes through our cond layer, which reapplies the exposed slug, so the same
  // hooks cover it.
  const EXPOSURE_SLUGS = new Set(["exposed", "exposed-nude"]);
  const _isExposure = (doc) =>
    EXPOSURE_SLUGS.has(doc?.slug) ||
    EXPOSURE_SLUGS.has(doc?.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey"));

  Hooks.on("createItem", (item) => {
    if (!game.user?.isGM || !item.actor || !_isExposure(item)) return;
    AFLP.ExposureArt.sync(item.actor);
  });
  Hooks.on("updateItem", (item) => {
    if (!game.user?.isGM || !item.actor || !_isExposure(item)) return;
    AFLP.ExposureArt.sync(item.actor);
  });
  Hooks.on("deleteItem", (item) => {
    if (!game.user?.isGM || !item.actor || !_isExposure(item)) return;
    AFLP.ExposureArt.sync(item.actor);
  });
  // Flag-backed exposure (DH / 5e write aflpConditions, not items).
  Hooks.on("updateActor", (actor, diff) => {
    if (!game.user?.isGM) return;
    const touched = foundry.utils.getProperty(diff ?? {}, `flags.${AFLP.FLAG_SCOPE}.aflpConditions`);
    if (touched && ("exposed" in touched || "exposed-nude" in touched)) AFLP.ExposureArt.sync(actor);
  });

  console.log("AFLP | Exposure token art loaded");
})();
