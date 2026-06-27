// ===============================================================
// AFLP / AFLR - Rest integration (Daggerheart)
// ===============================================================
// Two rest behaviors, applied GM-side off the downtime card:
//   - Any rest (short or long) clears the resting actor's Horny tokens.
//   - A registered "Shake Off Defeat" rest move clears one Defeat token.
// Both use the system's own extension point - the Homebrew world setting's
// `restMoves` collection and the downtime chat card - rather
// than monkeypatching the downtime application, so it survives system updates.
//
// Flow:
//   1. On ready (GM only), idempotently inject a `shakeDefeat` move into
//      restMoves.shortRest.moves and restMoves.longRest.moves. The move is
//      schema-valid (name/icon/img/description, empty actions, empty effects).
//      Empty `actions` means the system's action pipeline has nothing to run -
//      the move just posts its card - so we own the mechanical effect ourselves.
//   2. The DH downtime application posts a chat card whose message.system.moves
//      lists the taken moves (each with a movePath like "longRest.moves.<key>")
//      and message.system.actor (the resting actor's uuid). We hook that card's
//      creation and, for each instance of our move, clear one Defeat token.
//
// Defeat tokens are stored in the AFLP condition flag (authoritative count) via
// AFLP.system.conditionValue/setConditionValue; the matching feature resource
// track (if present on the actor) is kept in visual sync.
//
// No top-level import/export (loaded via dynamic import in index.js ready hook;
// must remain `new Function`-safe).

(() => {
  if (window.AFLP?.Rest) return;

  const MOVE_KEY = "shakeDefeat";
  const isDH = () => game.system?.id === "daggerheart";
  const SCOPE = () => AFLP.FLAG_SCOPE;

  function _hbKeys() {
    // Resolve the Homebrew setting id/key defensively across system versions.
    const id = CONFIG.DH?.id ?? "daggerheart";
    const key = CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew ?? "Homebrew";
    return { id, key };
  }

  function _move() {
    return {
      name: "Shake Off Defeat",
      icon: "fa-solid fa-heart-crack",
      img: "icons/magic/control/silhouette-hold-beam-blue.webp",
      description: "<p>You gather yourself against what was done to you. Clear <strong>1 Defeat</strong> token. If you have no Defeat, this move does nothing.</p>",
      actions: {},
      effects: [],
    };
  }

  // Inject the move into both rest categories if missing. GM only (settings are
  // world-scoped). Idempotent: re-running is a no-op once present.
  async function ensureMove() {
    if (!isDH() || !game.user?.isGM) return false;
    const { id, key } = _hbKeys();
    let cur;
    try { cur = game.settings.get(id, key); } catch (e) { return false; }
    if (!cur?.restMoves) return false;
    const hasLong = !!cur.restMoves.longRest?.moves?.[MOVE_KEY];
    const hasShort = !!cur.restMoves.shortRest?.moves?.[MOVE_KEY];
    if (hasLong && hasShort) return false; // already present

    const raw = cur.toObject ? cur.toObject() : foundry.utils.deepClone(cur);
    if (!raw.restMoves.longRest.moves[MOVE_KEY])  raw.restMoves.longRest.moves[MOVE_KEY]  = _move();
    if (!raw.restMoves.shortRest.moves[MOVE_KEY]) raw.restMoves.shortRest.moves[MOVE_KEY] = _move();
    try {
      await game.settings.set(id, key, raw);
      console.log("AFLP | Rest: injected Shake Off Defeat rest move");
      return true;
    } catch (e) {
      console.warn("AFLP | Rest: could not inject rest move", e);
      return false;
    }
  }

  // Remove the move (for uninstall/cleanup). GM only.
  async function removeMove() {
    if (!isDH() || !game.user?.isGM) return false;
    const { id, key } = _hbKeys();
    const cur = game.settings.get(id, key);
    if (!cur?.restMoves) return false;
    const raw = cur.toObject ? cur.toObject() : foundry.utils.deepClone(cur);
    delete raw.restMoves.longRest.moves[MOVE_KEY];
    delete raw.restMoves.shortRest.moves[MOVE_KEY];
    await game.settings.set(id, key, raw);
    return true;
  }

  async function _clearOneDefeat(actor) {
    const cur = AFLP.system?.conditionValue?.(actor, "defeat") ?? 0;
    if (cur <= 0) return { cleared: false, value: 0 };
    const next = Math.max(0, cur - 1);
    await AFLP.system?.setConditionValue?.(actor, "defeat", next);
    // keep the feature resource track (if any) in sync
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "defeat"
        || /^defeat$/i.test(i.name ?? ""));
      if (feat?.system?.resource?.type) await feat.update({ "system.resource.value": next });
    } catch (e) { /* flag is source of truth */ }
    return { cleared: true, value: next };
  }

  async function _clearHorny(actor) {
    if (!actor) return false;
    const cur = AFLP.system?.conditionValue?.(actor, "horny") ?? 0;
    if (cur <= 0) return false;
    await AFLP.system?.setConditionValue?.(actor, "horny", 0);
    // keep the feature resource track (if any) in sync
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "horny"
        || /^horny$/i.test(i.name ?? ""));
      if (feat?.system?.resource?.type) await feat.update({ "system.resource.value": 0 });
    } catch (e) { /* flag is source of truth */ }
    console.log(`AFLP | Rest: cleared Horny (${cur} -> 0) for ${actor.name}`);
    return true;
  }

  // True if the actor has a partnerHistory entry within the last in-world day.
  // Mirrors the PF2e daily-prep decay check, applied DH-side at rest.
  function _hadSexLast24h(actor) {
    const hist = actor.getFlag?.(SCOPE(), "partnerHistory") ?? [];
    const now = game.time?.worldTime ?? 0;
    return hist.some(e => (now - (e.date ?? 0)) < 86400);
  }

  // Decrement a 0-3 condition token track by 1 (min 0), keeping any feature
  // resource track in sync. Used for Bimbofied/Bullified long-rest decay.
  async function _decayToken(actor, key, label) {
    const cur = AFLP.system?.conditionValue?.(actor, key) ?? 0;
    if (cur <= 0) return { changed: false, value: 0 };
    const next = Math.max(0, cur - 1);
    await AFLP.system?.setConditionValue?.(actor, key, next);
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === key
        || new RegExp("^" + label + "$", "i").test(i.name ?? ""));
      if (feat?.system?.resource?.type) await feat.update({ "system.resource.value": next });
    } catch (e) { /* flag is source of truth */ }
    return { changed: true, value: next };
  }

  // Clear the entire Defeat track (long-rest Shake Off Defeat clears it completely).
  async function _clearAllDefeat(actor) {
    const cur = AFLP.system?.conditionValue?.(actor, "defeat") ?? 0;
    if (cur <= 0) return { cleared: false, was: 0 };
    await AFLP.system?.setConditionValue?.(actor, "defeat", 0);
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "defeat"
        || /^defeat$/i.test(i.name ?? ""));
      if (feat?.system?.resource?.type) await feat.update({ "system.resource.value": 0 });
    } catch (e) { /* flag is source of truth */ }
    return { cleared: true, was: cur };
  }

  // When a downtime card is posted, the rest resolves AFLR conditions GM-side:
  //   - Any rest (short OR long) clears the resting actor's Horny tokens.
  //   - Shake Off Defeat: short rest -1 per instance; long rest clears Defeat fully.
  //   - A long rest with no sex in the last 24h drops Bimbofied and Bullified by 1.
  // Runs once, GM-side, to avoid double-applying across connected clients.
  async function _onDowntimeMessage(message) {
    if (!isDH() || !game.user?.isGM) return;
    const sys = message?.system;
    if (!sys?.moves || !sys?.actor) return;
    let actor = null;
    try { actor = await fromUuid(sys.actor); } catch (e) {}
    actor = actor?.actor ?? actor; // tolerate token/actor uuids
    if (!actor) return;

    // Any rest clears Horny.
    await _clearHorny(actor);

    const moves = Array.isArray(sys.moves) ? sys.moves : [];
    // Rest type comes from the move paths ("longRest.moves.*" / "shortRest.moves.*").
    const isLong = moves.some(m => (m?.movePath ?? "").startsWith("longRest"));

    // Short rest: refresh the cum reservoir. A long rest already refills it via
    // Daily Preparations below, so this only runs on a short rest to avoid doubling.
    if (!isLong) {
      try {
        const r = await AFLP.recalculateCum?.(actor);
        if (r) ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> takes a short rest - cum reservoir refills to <strong>${r.max}</strong> (${r.loads} loads x ${r.perShot}/shot).</p></div>`,
        });
      } catch (e) { console.warn("AFLR | short-rest cum refresh failed", e); }
    }

    // Shake Off Defeat: short rest reduces Defeat by 1 per instance taken; a long
    // rest with the move taken clears the Defeat track completely.
    const shakeCount = moves.filter(m => {
      const mp = m?.movePath ?? "";
      // movePath looks like "longRest.moves.shakeDefeat" / "shortRest.moves.shakeDefeat"
      return mp.endsWith("." + MOVE_KEY) || m?.name === "Shake Off Defeat";
    }).length;
    if (shakeCount > 0) {
      if (isLong) {
        const r = await _clearAllDefeat(actor);
        if (r.cleared) ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> takes a long rest and shakes off Defeat completely (was ${r.was}/3).</p></div>`,
        });
      } else {
        let last = null;
        for (let i = 0; i < shakeCount; i++) last = await _clearOneDefeat(actor);
        if (last?.cleared) ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> shakes off Defeat - now ${last.value}/3.</p></div>`,
        });
      }
    }

    // Bullified: a Bull automatically tops Bimbofied PCs during a rest. The Bull
    // and every Bimbofied participant gain a Hope (as if they had used the Prepare
    // downtime move, without consuming it). Read before any Bullified decay below.
    if ((AFLP.system?.conditionValue?.(actor, "bullified") ?? 0) > 0) {
      const bimboAllies = (game.actors?.contents ?? []).filter(a =>
        a.id !== actor.id && a.type === "character"
        && (AFLP.system?.conditionValue?.(a, "bimbofied") ?? 0) > 0);
      if (bimboAllies.length) {
        await AFLP.system?.gainHope?.(actor, 1);
        for (const ally of bimboAllies) await AFLP.system?.gainHope?.(ally, 1);
        const names = bimboAllies.map(a => a.name).join(", ");
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> (Bull) tops <strong>${names}</strong> during the rest - everyone who took part gains a <strong>Hope</strong> (as if Prepared, without spending the move).</p></div>`,
        });
      }
    }

    // Long-rest transformation decay: Bimbofied and Bullified each drop by 1 if the
    // character hasn't had sex in the last 24 in-world hours (per their item rules).
    if (isLong && !_hadSexLast24h(actor)) {
      for (const [key, label] of [["bimbofied", "Bimbofied"], ["bullified", "Bullified"]]) {
        const r = await _decayToken(actor, key, label);
        if (r.changed) ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong>'s <strong>${label}</strong> fades a little after an untouched night's rest - now ${r.value}/3.</p></div>`,
        });
      }
    }

    // Hooked (chemical/lewd dependence) clears when the creature completes a
    // long rest - they sleep the craving off.
    if (isLong && (AFLP.system?.conditionValue?.(actor, "hooked") ?? 0) > 0) {
      await AFLP.system?.setConditionValue?.(actor, "hooked", 0);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${actor.name}</strong> sleeps off the craving - <strong>Hooked</strong> clears after a long rest.</p></div>`,
      });
    }

    // Daggerheart has no daily preparations - so the AFLR daily upkeep (arousal
    // reset, Denied clear, cum refill, pregnancy progression and births, kink daily
    // resets) renews automatically on a Long Rest. Hand the resting actor to the
    // Daily Preparations macro via a global so it doesn't need a token selection.
    if (isLong) {
      const dp = game.macros.find(m =>
        m.name === "AFLR Daily Preparations" || m.name === "AFLP Daily Preparations"
        || m.slug === "aflp-daily-prep");
      if (dp) {
        window._aflpDailyPrepActor   = actor;
        window._aflpDailyPrepContext = "longRest";
        try { await dp.execute(); }
        catch (e) { console.warn("AFLR | Daily Preparations on Long Rest failed", e); }
      }
    }
  }

  window.AFLP = window.AFLP || {};
  AFLP.Rest = { ensureMove, removeMove, MOVE_KEY };

  // Inject after the world is ready (settings registered). Also re-assert on a
  // settings change in case a GM resets the Homebrew rest moves.
  Hooks.once("ready", () => { ensureMove(); });
  Hooks.on("createChatMessage", (message) => { try { _onDowntimeMessage(message); } catch (e) { /* never break chat */ } });

  console.log("AFLP | Rest integration loaded");
})();
