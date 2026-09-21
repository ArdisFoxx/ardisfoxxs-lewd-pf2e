// ===============================
// AFLP Deepthroat — the throat pin
// ===============================
// Throat (Deepthroat): "You have a serious oral fixation and become weak in the
// knees while your mouth is being used - when a cock fills your throat you fall
// Prone and are Grabbed until the cock is removed."
//
// The card carries no rule elements, so nothing on the sheet said this before.
// This file is the whole mechanism: while a Deepthroat body is the RECEIVER of a
// penetrative oral position in a live H-Scene, it is Prone and Grabbed, and both
// come off the moment that stops being true.
//
// GRABBED REPLACED A SPEED EFFECT, 11 Sept 2026: saying the creature is
// grabbed is clearer, and Grabbed already makes its speed 0.
//
// It used to apply `FlatModifier / all-speeds / untyped / -1000` through the
// `deepthroat-pinned` intent. That worked, but it said the wrong thing twice:
// the card promised a literal Speed 0, which is true on PF2e and FALSE on
// Starfinder - sf2e floors a speed at 5 feet, measured 1 Sept 2026, land 25 -> 5
// with the carrier on. Grabbed brings Immobilized, which stops movement by the
// rules rather than by a number, and reads the same on both systems.
//
// KNOWN AND ACCEPTED CONSEQUENCE: the H-Scene bound flag reads Grabbed
// (`_sampleSceneStates` in aflp-hscene.js: restrained OR grabbed OR worn gear),
// so a pinned Deepthroat now counts a bondage scene in their lifetime totals.
// That is intended: held by the throat is being held.
//
// The retired intent is still CLEARED on every path so a carrier applied before
// this version cannot outlive the rule that applied it.
//
// PF2e ONLY, deliberately. Prone and Grabbed are PF2e's vocabulary; Daggerheart
// has no Prone at all and folds grabbed, restrained and immobilized into one
// `restrained`, and its own Throat (Deepthroat) card does not state this rule. Do not drop the guard in register() to "make it work on DH" - that
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
// OWNERSHIP. Prone and Grabbed are native conditions anything can apply, so this
// only ever removes the ones it applied itself - the exposedVulnerable rule. A
// creature already Prone, or already Grabbed by a monster, keeps that when the
// cock leaves. The flag records WHAT was applied rather than a bare true, the
// same shape as `sizeRestrained`:
//
//     { prone: true, grabbed: false }   we applied Prone, it was already Grabbed
//
// `{ speed: true }` is the pre-11-Sept shape and is read only to know there is a
// retired carrier to sweep.

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

  // PF2e keeps its conditions as condition ITEMS; hasCondition is the system's
  // own question and does not care how one was applied.
  _hasCond(actor, slug) {
    try {
      if (typeof actor?.hasCondition === "function") return !!actor.hasCondition(slug);
      return (actor?.items ?? []).some(i => i.type === "condition" && i.system?.slug === slug);
    } catch (e) { return false; }
  },
  _isProne(actor)   { return this._hasCond(actor, "prone"); },
  _isGrabbed(actor) { return this._hasCond(actor, "grabbed"); },

  // Apply or clear the pin on one actor. Idempotent: safe to call on every tick.
  async sync(actor) {
    if (!actor || !game.user?.isGM) return;
    if (AFLP.system?.id !== "pf2e") return;
    const want = this.isPinned(actor);
    const owned = actor.getFlag?.(AFLP.FLAG_SCOPE, this.FLAG) ?? null;

    if (want && !owned) {
      // Only claim a condition that was not already there. A creature knocked
      // down or already held when the cock arrives keeps its own when it leaves.
      const alreadyProne   = this._isProne(actor);
      const alreadyGrabbed = this._isGrabbed(actor);
      if (!alreadyProne)   await AFLP.system?.applyNativeCondition?.(actor, "prone");
      if (!alreadyGrabbed) await AFLP.system?.applyNativeCondition?.(actor, "grabbed");
      await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG,
        { prone: !alreadyProne, grabbed: !alreadyGrabbed });
      // Sweep the retired speed carrier off anyone still wearing one from before
      // 11 Sept 2026. Cheap, idempotent, and it stops a stale -1000 outliving the
      // rule that applied it.
      await AFLP.effects?.ensure?.(actor, this.INTENT, false);
      await this._announce(actor, true);
      return;
    }

    if (!want && owned) {
      if (owned.prone === true && typeof actor.decreaseCondition === "function") {
        try { await actor.decreaseCondition("prone"); } catch (e) { /* non-fatal */ }
      }
      if (owned.grabbed === true && typeof actor.decreaseCondition === "function") {
        try { await actor.decreaseCondition("grabbed"); } catch (e) { /* non-fatal */ }
      }
      // `owned.speed` is the pre-11-Sept shape. Clearing the intent is harmless
      // when there is no carrier, so it runs either way.
      await AFLP.effects?.ensure?.(actor, this.INTENT, false);
      // setFlag MERGES, so writing false would leave the key present and a later
      // read would treat it as a deliberate "off". Delete form only.
      await actor.update({ [`flags.${AFLP.FLAG_SCOPE}.-=${this.FLAG}`]: null });
      await this._announce(actor, false);
      return;
    }

    // Held state: re-apply anything removed by hand mid-scene, and keep sweeping
    // the retired carrier.
    if (want && owned) {
      if (owned.prone === true && !this._isProne(actor)) {
        await AFLP.system?.applyNativeCondition?.(actor, "prone");
      }
      if (owned.grabbed === true && !this._isGrabbed(actor)) {
        await AFLP.system?.applyNativeCondition?.(actor, "grabbed");
      }
      await AFLP.effects?.ensure?.(actor, this.INTENT, false);
    }
  },

  async _announce(actor, on) {
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: on
          ? `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> goes weak in the knees with a cock down their throat: <strong>Prone</strong> and <strong>Grabbed</strong> until it is pulled out.</p></div>`
          : `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s throat is clear. Prone and Grabbed end.</p></div>`,
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
