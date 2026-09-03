// ===============================
// AFLP Deepthroat — the throat pin
// ===============================
// Throat (Deepthroat): "You have a serious oral fixation and become weak in the
// knees while your mouth is being used - when a cock fills your throat you fall
// Prone and your speed becomes 0 until the cock is removed."
//
// The card carries no rule elements, so nothing on the sheet said this before.
// This file is the whole mechanism: while a Deepthroat body is the RECEIVER of a
// penetrative oral position in a live H-Scene, it is Prone with every speed at 0,
// and both come off the moment that stops being true.
//
// PF2e ONLY, deliberately. Prone and a numeric Speed are PF2e's vocabulary;
// Daggerheart has neither, and its own Throat (Deepthroat) card does not state
// this rule. Do not drop the guard in register() to "make it work on DH" - that
// is the exact shape of the three regressions on 7 Aug 2026, where waking a dead
// read made code say something the DH card never said. A DH version needs its
// own reading of its own card.
//
// WHAT COUNTS AS "a cock fills your throat"
//   - the actor is a receiver (someone's partnerId points at their token), and
//   - that performer's position has `penile: true`, and
//   - the position occupies `oral` (or is the `gangbang` wildcard, which its own
//     text says includes the mouth).
// `penile` is the same gate closeScene and the size-gap code use, so a tentacle
// or a phantom down the throat pins too. That is intentional: every one of those
// positions describes something filling the throat, and the alternative is a
// second, divergent definition of "penetrative" living in this file only.
//
// `oral-give` (going down on someone) and `face-sit-oral` are penile:false and
// correctly do NOT pin - nothing is in the throat. `facial` is not `oral`.
//
// Manual hole chips (scene.manualHoles) are deliberately ignored. A GM marking
// the mouth filled says a hole is in use, not that a cock is in it, and those
// marks are a transient display override rather than persisted intent.
//
// OWNERSHIP. Prone is a native condition anything can apply, so this only ever
// removes the Prone it applied itself - the exposedVulnerable rule. A creature
// already Prone when the cock arrives is left Prone when it leaves. The flag
// records WHAT was applied rather than a bare true, the same shape as
// `sizeRestrained`.
//
// The speed half is an effect intent (`deepthroat-pinned` in AFLP.EFFECT_INTENTS),
// so applying and clearing it is the shared, idempotent path and the carrier
// effect is found by its effectIntent flag rather than by name.

window.AFLP_Deepthroat = {

  FLAG: "deepthroatPinned",
  INTENT: "deepthroat-pinned",

  // Anatomy subtype that carries the rule. Key, never the display name:
  // the item is called "Throat (Deepthroat)" and its key is `throat-deep`.
  ANATOMY_KEY: "throat-deep",

  // Every hole a position occupies. Mirrors _posHoles in aflp-hscene.js: holes[]
  // is authoritative when present, `hole` is only the primary.
  _posHoles(id) {
    const p = AFLP.getPosition?.(id);
    if (!p) return [];
    if (Array.isArray(p.holes) && p.holes.length) return p.holes;
    return [p.hole ?? null].filter(Boolean);
  },

  _isThroatFill(positionId) {
    const p = AFLP.getPosition?.(positionId);
    if (!p || p.penile !== true) return false;
    const holes = this._posHoles(positionId);
    return holes.includes("oral") || holes.includes("gangbang");
  },

  // Is a cock in this actor's throat right now, in any live scene?
  // Reads the scene map directly rather than receivedHolesForActor, which only
  // looks at `pe.hole` and so misses every multi-hole position (Throat and Ass
  // at Once reports "oral" as its primary, but Three Shafts One Throat and the
  // tentacle spitroast are the class this would get wrong).
  isPinned(actor) {
    try {
      if (!actor) return false;
      const af = actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
      if (af[this.ANATOMY_KEY] !== true) return false;
      const scenes = AFLP.HScene?._scenes;
      if (!scenes) return false;
      for (const scene of scenes.values()) {
        const parts = scene?.participants ?? [];
        for (const perf of parts) {
          if (!perf.position || !perf.partnerId) continue;
          if (!this._isThroatFill(perf.position)) continue;
          const recv = parts.find(x => x.tokenId === perf.partnerId);
          if (recv && recv.actorId === actor.id) return true;
        }
      }
      return false;
    } catch (e) { return false; }
  },

  _isProne(actor) {
    try {
      // PF2e keeps Prone as a condition item; hasCondition is the system's own
      // question and does not care how it was applied.
      if (typeof actor?.hasCondition === "function") return !!actor.hasCondition("prone");
      return (actor?.items ?? []).some(i => i.type === "condition" && i.system?.slug === "prone");
    } catch (e) { return false; }
  },

  // Apply or clear the pin on one actor. Idempotent: safe to call on every tick.
  async sync(actor) {
    if (!actor || !game.user?.isGM) return;
    if (AFLP.system?.id !== "pf2e") return;
    const want = this.isPinned(actor);
    const owned = actor.getFlag?.(AFLP.FLAG_SCOPE, this.FLAG) ?? null;

    if (want && !owned) {
      // Only claim Prone if it was not already there. A creature knocked down
      // before the scene keeps its own Prone when the cock comes out.
      const alreadyProne = this._isProne(actor);
      if (!alreadyProne) await AFLP.system?.applyNativeCondition?.(actor, "prone");
      await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, { prone: !alreadyProne, speed: true });
      await AFLP.effects?.ensure?.(actor, this.INTENT, true);
      await this._announce(actor, true);
      return;
    }

    if (!want && owned) {
      if (owned.prone === true && typeof actor.decreaseCondition === "function") {
        try { await actor.decreaseCondition("prone"); } catch (e) { /* non-fatal */ }
      }
      await AFLP.effects?.ensure?.(actor, this.INTENT, false);
      // setFlag MERGES, so writing false would leave the key present and a later
      // read would treat it as a deliberate "off". Delete form only.
      await actor.update({ [`flags.${AFLP.FLAG_SCOPE}.-=${this.FLAG}`]: null });
      await this._announce(actor, false);
      return;
    }

    // Held state: reconcile the carrier effect in case it was deleted by hand.
    if (want && owned) await AFLP.effects?.ensure?.(actor, this.INTENT, true);
  },

  async _announce(actor, on) {
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: on
          ? `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> goes weak in the knees with a cock down their throat: <strong>Prone</strong>, Speed <strong>0</strong> until it is pulled out.</p></div>`
          : `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s throat is clear. Prone and the Speed penalty end.</p></div>`,
      });
    } catch (e) { /* chat optional */ }
  },

  // Recompute for everyone who could have changed: every participant in every
  // live scene, plus anyone still carrying the flag (they may have just left a
  // scene, or the scene may have closed out from under them).
  async syncAll() {
    if (!game.user?.isGM) return;
    if (AFLP.system?.id !== "pf2e") return;
    // Collect INSTANCES, never ids. An unlinked token actor's id EQUALS its base
    // actor's, so an id-keyed set silently merges every mook of one prototype and
    // `game.actors.get(id)` then hands back the template rather than the token
    // that earned the pin. This used to gather `p.actorId` into a Set and look
    // each one up in game.actors, which did exactly that.
    const instances = new Map();   // de-duped by object identity, not by id
    try {
      for (const scene of (AFLP.HScene?._scenes?.values?.() ?? [])) {
        for (const p of (scene?.participants ?? [])) {
          // A participant carries BOTH ids; tokenId is the one that identifies
          // the creature. actorId is only the fallback for a token off canvas.
          const a = canvas?.tokens?.get(p?.tokenId)?.actor ?? (p?.actorId ? game.actors.get(p.actorId) : null);
          if (a) instances.set(a, a);
        }
      }
    } catch (e) { /* scene map optional */ }
    // allLiveActors, not game.actors: a mook carrying the pin flag is not in
    // game.actors at all, so this sweep never reached one.
    for (const { actor } of AFLP.allLiveActors()) {
      if (actor?.getFlag?.(AFLP.FLAG_SCOPE, this.FLAG)) instances.set(actor, actor);
    }
    for (const a of instances.values()) await this.sync(a);
  },

  _queued: null,
  queueSync() {
    // Debounced: one settings write can follow several mutations, and closeScene
    // saves once at the end of a long teardown.
    if (this._queued) clearTimeout(this._queued);
    this._queued = setTimeout(() => { this._queued = null; this.syncAll().catch(() => {}); }, 200);
  },

  register() {
    // See the header: PF2e only, on purpose.
    if (AFLP.system?.id !== "pf2e") return;
    if (!game.user?.isGM) return;

    // WHY A SETTING HOOK AND NOT A WRAPPER. There is no position-change or
    // scene-end hook in aflp-hscene.js, and its public methods are called
    // INTERNALLY by their local names - wrapping AFLP.HScene._promptGroupPosition
    // would be bypassed by startScene, which calls the local function directly.
    // Every mutation instead ends in _saveSceneState(), which writes the
    // hsceneActiveScenes world setting, and Foundry fires updateSetting on every
    // write. That is a real external choke point covering position set, position
    // change, repointing, participant removal and closeScene alike.
    Hooks.on("updateSetting", (setting) => {
      try {
        if (!String(setting?.key ?? "").endsWith("hsceneActiveScenes")) return;
        this.queueSync();
      } catch (e) { /* non-fatal */ }
    });

    // A reload restores scenes without a settings write, so reconcile once.
    Hooks.once("ready", () => this.queueSync());

    console.log("AFLP | Deepthroat throat pin registered (pf2e).");
  },
};
