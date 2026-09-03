// ===============================
// AFLP System Adapter - Base Contract (adapter-base.js)
// ===============================
// Defines the interface every per-system adapter implements. AFLP domain
// logic (H Scene, arousal, kinks, titles, cumflation) calls AFLP.system.*
// and must never touch a game system directly. Each supported system
// (pf2e, dnd5e, daggerheart) ships a subclass that fills in system specifics.
//
// Every method here is a safe no-op / fallback default, so an unimplemented
// system degrades gracefully instead of throwing. Subclasses override.
// ===============================

(() => {
  window.AFLP = window.AFLP || {};
  if (AFLP.SystemAdapter) return;

  class SystemAdapter {
    // Cached aflrKey -> UUID index for this system's content pack(s); built at ready.
    _contentIndex = null;
    // Cached canonical PF2e UUID -> logical key reverse map; built alongside the index.
    _canonicalToKey = null;

    // System id this adapter handles. Subclasses override.
    get id() { return "unknown"; }

    // Capability flags. AFLP features check these and hide / adapt UI when a
    // system lacks a feature. Subclasses override the relevant entries.
    get capabilities() {
      return {
        degreesOfSuccess: false,  // four-tier crit/success/fail/crit-fail resolution
        // THIS IS ABOUT THE SYSTEM'S OWN CONDITIONS, NOT AFLR'S. It asks whether
        // the game system natively carries an incrementing numeric badge on a
        // condition - true on PF2e, false on Daggerheart and 5e, where AFLR's
        // valued conditions are flag-backed instead. Reading it as "does AFLR
        // have valued conditions here" gets the opposite answer on two systems.
        valuedConditions: false,
        nativeArousal: null,      // null = AFLP-owned flag; a string = bridge to that native resource
        resistKind: null,         // which save/roll resists a cum; null = auto-resolve
      };
    }

    // NOTHING OUTSIDE THE ADAPTERS READS `capabilities` - measured 19 Aug 2026 by
    // grepping the whole tree. It is a declaration with no consumer, which is
    // precisely how `nativeArousal: "stress"` sat on the Daggerheart adapter for
    // weeks describing a bridge that had been deleted. **A declaration nothing
    // exercises rots silently**, so the simulation harness now measures every key
    // here against real behaviour rather than trusting the literal.
    // GOES STALE IF: a consumer appears, in which case the wrong value stops being
    // merely untrue and starts being a bug.

    // --- Actor helpers (system-agnostic, kept here so there is one home) ---

    // True if the actor is a player character rather than an NPC / adversary.
    isPC(actor) {
      return !!actor?.hasPlayerOwner;
    }

    // True if the actor is a non-player creature (NPC / adversary / hazard).
    isNPC(actor) {
      return !this.isPC(actor);
    }

    // True if the actor is an unowned monster (an NPC with no player owner).
    // Drives "is the scene target a monster" defaults.
    isMonster(actor) {
      return this.isNPC(actor) && !actor?.hasPlayerOwner;
    }

    // Resolve the live (synthetic, for unlinked tokens) actor. Conditions and
    // effects must be applied to this, not the base actor template.
    liveActor(actor, tokenId = null) {
      return canvas?.tokens?.get(tokenId)?.actor ?? actor?.token?.actor ?? actor;
    }

    // --- H-Scene damage accrual (per-system) ---------------------------
    // The current HP value from an actor's update `changes`, or null if this
    // update did not touch HP. PF2e / 5e store HP at system.attributes.hp.value
    // and count DOWN (damage lowers it). Daggerheart overrides this.
    hpValueFromChanges(changes) {
      return foundry.utils.getProperty(changes, "system.attributes.hp.value") ?? null;
    }
    // The actor's current HP value right now (same field as above).
    hpValueNow(actor) {
      return actor?.system?.attributes?.hp?.value ?? null;
    }
    // Positive damage from an oldHP/newHP pair. PF2e/5e: damage = old - new
    // (HP falls). Daggerheart overrides (marks rise).
    hpDamageDelta(oldHP, newHP) {
      const d = (Number(oldHP) || 0) - (Number(newHP) || 0);
      return d > 0 ? d : 0;
    }
    // The actor's "downing" HP: the raw damage that represents one full drop of
    // this actor's health bar, used to normalize H-Scene damage into a common
    // unit (downings) so title thresholds mean the same thing on every system.
    // PF2e / 5e: the actor's max HP. Daggerheart overrides with its 6-12 band.
    downingHP(actor) {
      const max = actor?.system?.attributes?.hp?.max
        ?? actor?.system?.attributes?.hp?.value ?? 0;
      return Math.max(1, Number(max) || 1);
    }
    // Convert raw H-Scene damage into normalized "downing units" (1.0 = one full
    // health bar of this actor). Cross-system stable.
    hscDamageToUnits(actor, rawDamage) {
      return (Number(rawDamage) || 0) / this.downingHP(actor);
    }

    // Restore HP. PF2e / 5e store HP at system.attributes.hp.value counting UP to
    // max; Daggerheart overrides (clearing marks). Returns HP actually restored.
    async healActor(actor, amount) {
      const cur = this.hpValueNow(actor);
      if (cur == null) return 0;
      const max = actor?.system?.attributes?.hp?.max ?? this.downingHP(actor);
      const next = Math.min(max, cur + Math.max(0, Number(amount) || 0));
      if (next <= cur) return 0;
      await actor.update({ "system.attributes.hp.value": next });
      return next - cur;
    }

    // How much one unit of milk heals. Health means different things per system:
    // 3 hit points is a rounding error in PF2e, but 3 Daggerheart MARKS is half a
    // health bar (a DH bar is 6-12 total). Each adapter prices its own.
    // Milk heals per unit, scaled by the PRODUCER's level so nursing keeps pace
    // with the party instead of falling off after level 2. Curve is half of PF2e's
    // Lay on Hands (6 per rank): 3 at levels 1-2, 6 at 3-4, 9 at 5-6, and so on.
    // Half, not full, because milk stockpiles and Lay on Hands cannot. Falls back
    // to the flat base when no producer is known.
    milkHealPerUnit(producer = null) {
      const base = 3;
      const lvl = Number(producer?.level ?? producer?.system?.details?.level?.value ?? 0);
      if (!lvl) return base;
      return base * Math.max(1, Math.ceil(lvl / 2));
    }

    // Is this actor lactating? PF2e and 5e carry a Tits (Lactating) anatomy
    // subtype. Daggerheart deliberately has no such item and uses the Leaking
    // condition instead, so it overrides this. Kept separate from
    // AFLP.milk.isLactating, which gates the numeric milk POOL - a concept DH
    // does not have at all.
    isLactating(actor) {
      return (actor?.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-lactating"] === true;
    }

    // Does this system keep milk in a numeric POOL with a capacity? PF2e and 5e
    // do. Daggerheart does not - its milk is Bottled Milk items drawn off at a
    // rest - so the pool bar, its capacity and the Express button must not appear
    // there. Gating on isLactating is NOT enough: DH grants tits-lactating too.
    usesMilkPool() { return true; }

    // Status-panel mouseover text that states RULES. These were hardcoded to
    // PF2e, so a Daggerheart GM read about Clumsy, AC and three-action Purge -
    // none of which exist there. Each system answers for itself.
    // What the daily upkeep is CALLED to a player. PF2e has Daily Preparations;
    // Daggerheart has no such activity and runs the same upkeep off a Long Rest,
    // so the chat line has to say the thing that system actually does.
    dailyResetText() { return "completes daily preparations"; }

    cumflationMaxText(max) {
      return `Filled to the brim: -1 to Dexterity-based checks and DCs (AC, Reflex, ranged attacks, `
        + `Acrobatics, Stealth, Thievery) and -5 feet Speed. Stacks with each other maxed hole. `
        + `Purge Cumflation (3 actions, Fortitude save) empties one hole.`;
    }
    cumflationBelowMaxText(max) {
      return `No penalty yet - penalties begin at ${max}. Purge Cumflation empties a hole early.`;
    }
    pregnancyLateText() {
      return "Past half term and showing. Clumsy and slowed until you give birth.";
    }
    pregnancyEarlyText() {
      return "Carrying, but not showing yet. No penalty until half term.";
    }

    // --- Resource-change vocabulary ------------------------------------
    // How this system talks about changing a pooled/marked resource (Arousal,
    // Stress, HP). Daggerheart "marks" and "clears"; PF2e and D&D 5e "gain" and
    // "lose", matching their Hit Point / Spell Slot language. Only the systems
    // that diverge from the gain/lose default (Daggerheart) override these.
    get markVerb()  { return "gain"; }
    get clearVerb() { return "lose"; }

    // What this system calls the number you roll against. Pathfinder and D&D 5e
    // say DC; Daggerheart says DIFFICULTY and never DC - it is one of the
    // vocabulary rules the project states outright.
    //
    // Added 17 Aug 2026 after a sweep of every player-facing string found "DC" in
    // six Carnal cards on Daggerheart, plus both escape flavours, the Brood roll
    // and two macros. Ardis spotted the same class from the other end ("there are
    // no turns in dh"). Sixteen hand edits would have been sixteen chances to
    // drift, so it lives here beside markVerb and clearVerb, which exist for
    // exactly this reason.
    //
    // Use it in any string a player reads. Do NOT use it for a Foundry roll
    // formula or a flag name - it is a WORD, not an identifier.
    get dcWord() { return "DC"; }

    // Phrase for a signed resource change: "gain 3 Arousal" / "lose 2 Arousal"
    // (pf2e, 5e), or "mark 3 Arousal" / "clear 2 Arousal" (Daggerheart).
    deltaText(delta, label = "Arousal") {
      const n = Math.abs(Number(delta) || 0);
      return `${delta >= 0 ? this.markVerb : this.clearVerb} ${n} ${label}`;
    }

    // How a reset-to-zero reads. DH "Arousal clears to 0"; others "resets to 0".
    resetText(label = "Arousal") { return `${label} resets to 0`; }

    // --- Arousal backing ---
    // Arousal is AFLP's core resource. By default it lives in an AFLP world
    // flag (system-agnostic); these accessors read/write that flag, which is
    // exactly the legacy behavior. A system may bridge arousal to a native
    // resource (e.g. Daggerheart Stress) by overriding these in its subclass.
    // Callers pass the token-resolved actor instance (see the actor-resolution
    // rule in aflp-arousal.js) so per-token state stays consistent.

    // Current arousal value for this actor instance.
    getArousalCurrent(actor) {
      const a = actor?.getFlag?.(AFLP.FLAG_SCOPE, "arousal") ?? AFLP.arousalDefaults;
      return a.current ?? 0;
    }

    // Write the current arousal value (and optionally the resolved max) onto
    // this actor. Returns the stored arousal object. Default: the AFLP flag.
    async setArousalCurrent(actor, value, max = null) {
      const a = structuredClone(actor.getFlag(AFLP.FLAG_SCOPE, "arousal") ?? AFLP.arousalDefaults);
      a.current = value;
      if (max != null) a.max = max;
      await actor.setFlag(AFLP.FLAG_SCOPE, "arousal", a);
      return a;
    }

    // Native maximum arousal for this actor, or null to use AFLP's own
    // maxBase + kink/title modifier formula (HScene.calcArousalMax). A system
    // that bridges arousal to a capped native resource returns that cap here.
    nativeArousalMax(actor) {
      return null;
    }

    // --- Conditions ---

    // Map an AFLP-neutral condition key to this system's slug, or null if the
    // system has no equivalent and AFLP should skip it.
    conditionSlug(key) { return key; }

    // Apply a condition. A content uuid (a system item) is preferred; falls
    // back to a system condition API where available. value is for valued
    // conditions (e.g. Mind Break N).
    async applyCondition(actor, slug, uuid = null, value = null, tokenId = null) {
      console.warn(`AFLP | applyCondition not implemented for system '${this.id}' (${slug})`);
    }

    // Remove a condition by slug.
    async removeCondition(actor, slug, tokenId = null) {
      console.warn(`AFLP | removeCondition not implemented for system '${this.id}' (${slug})`);
    }

    // Brood Roll - the shared breeding check, read in four degrees that drive a
    // success number (0/1/2) upstream. Default is a d20 vs the Brood DC: a natural
    // 1 is a "safe day", a natural 20 is a critical success, meeting the DC is a
    // success, anything else is a failure. Daggerheart overrides this with a
    // Duality roll. Returns { degree: "safe"|"fail"|"success"|"crit", detail }.
    async rollBrood(dc) {
      const roll = await new Roll("1d20").evaluate();
      const nat = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;
      let degree;
      if (nat === 1) degree = "safe";
      else if (nat === 20) degree = "crit";
      else if (roll.total >= dc) degree = "success";
      else degree = "fail";
      return { degree, detail: `Roll <strong>${roll.total}</strong> vs Brood ${this.dcWord} ${dc}` };
    }

    // Apply a system-native core condition (e.g. grabbed, restrained, sickened,
    // stunned) by slug, with an optional numeric value for valued conditions.
    // Distinct from applyCondition, which applies AFLP content items by uuid.
    // Reset a mirrored timed effect's duration without changing its value. Only
    // PF2e keeps such mirrors today (see pf2e-adapter._syncTimedMirror); every
    // other system stores AFLR conditions as flags with no duration, so this is a
    // genuine no-op there rather than a gap.
    //
    // RETURN-VALUE contract, not typeof: a `typeof === "function"` guard is always
    // true against a base stub, which is the documented trap that made
    // setBimbofied/setBullified silently swallow writes. Callers ignore the result
    // here, but it answers honestly so a caller COULD branch on it.
    async refreshConditionDuration(actor, slug, tokenId = null) { return false; }

    async applyNativeCondition(actor, slug, value = null, tokenId = null) {
      console.warn(`AFLP | applyNativeCondition not implemented for system '${this.id}' (${slug})`);
    }

    // ── Effects layer ──────────────────────────────────────────────────────
    // Find the doc this system emitted for an intent (AE on DH, Item on PF2e).
    findEffectIntentDoc(actor, key) { return null; }
    // Emit / retract an intent. Defaults no-op with a warn so an unmapped
    // system (5e later) degrades gracefully rather than erroring.
    async applyEffectIntent(actor, key, spec) {
      console.warn(`AFLP | applyEffectIntent not implemented for system '${this.id}' (${key})`);
    }
    async removeEffectIntent(actor, key) { /* nothing emitted, nothing to remove */ }

    // Size Difference: the "first oversized penetration" bite. On Daggerheart
    // this is 1 Stress; systems without a Stress track (pf2e, 5e) override this
    // to their own equivalent (pf2e: minor nonlethal + Clumsy 1). Default is a
    // no-op so an unmapped system simply skips the bite rather than erroring.
    async sizePenalty(actor, tokenId = null) { /* system override */ }

    // Remove exactly the size-penalty affliction WE applied (tracked on the
    // sizeClumsy flag), leaving any same-named condition from other sources
    // alone. Called at scene end, on leaving, and on a switch to a
    // non-penetrative position.
    //
    // Only PF2e implements this, and deliberately so: its penalty is a lingering
    // condition (Clumsy) that stacks. Daggerheart marks 1 Stress and D&D 5e deals
    // 1d4 damage - a spent resource and a wound. Neither lingers, and "clearing"
    // them would refund Stress or heal the strain, which is wrong. Base no-op.
    async clearSizePenalty(actor, tokenId = null) { /* PF2e only - see note */ }

    // Size Difference: being pinned on an oversized partner (gap 3, Ruined).
    // DH uses restrained; pf2e/5e map to grabbed/grappled. Returns the slug that
    // was applied (so cleanup can strip the right one), or null.
    async sizeRestrain(actor, tokenId = null) {
      await this.applyNativeCondition(actor, "restrained", null, tokenId);
      return "restrained";
    }

    // --- AFLP custom condition state (valued / binary) ---
    // AFLP's own conditions (Mind Break, Defeated, Submitting, Dominating,
    // Exposed, ...) are PF2e condition ITEMS. These accessors expose their
    // presence and numeric value so domain logic never queries actor.items
    // directly. A system without those items (5e / Daggerheart) overrides these
    // to a flag-backed store, so the same conditions work there.

    // Does this system MIRROR the AFLR condition `id` onto a native token status?
    //
    // Only Daggerheart does today: it registers every AFLR condition in the
    // condition manager, so one application produces a flag write and then, a
    // tick later, a status toggle. The condition-change feed in schema.js drops
    // status events for anything this returns true for, which is the only thing
    // that stops that pair being counted as two transitions. Answering false is
    // the safe default and means "a status with this id is the system's, not
    // ours" - PF2e's Restrained and Off-Guard are exactly that.
    //
    // Deliberately NOT the registry test. A Daggerheart-only condition (Hooked,
    // Lustful) has no AFLP.conditions entry at all, because registry entries
    // carry a canonical PF2e uuid and there is no PF2e item for them to name.
    ownsStatus(_id) { return false; }


    hasCondition(actor, key, tokenId = null) {
      const live = this.liveActor(actor, tokenId);
      const uuid = AFLP.conditions?.[key]?.uuid;
      return !!live?.items?.find(c =>
        c.slug === key || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      );
    }

    conditionValue(actor, key, tokenId = null) {
      const live = this.liveActor(actor, tokenId);
      const uuid = AFLP.conditions?.[key]?.uuid;
      const item = live?.items?.find(c =>
        c.slug === key || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      );
      if (!item) return 0;
      return item.system?.badge?.value ?? 1;
    }

    // Set a valued condition to an absolute value (PF2e: update the item badge).
    async setConditionValue(actor, key, value, tokenId = null) {
      const live = this.liveActor(actor, tokenId);
      const uuid = AFLP.conditions?.[key]?.uuid;
      const item = live?.items?.find(c =>
        c.slug === key || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      );
      if (item) await item.update({ "system.badge.value": value });
    }

    // --- Resolution ---

    // Roll a resist check (e.g. to Edge instead of cumming). Returns a
    // normalized result: { total:Number, roll:Roll|null, native:Boolean }.
    // Default: a plain d20 posted to chat, which works in any system.
    async rollResist(actor, { dc = 15, kind = null, flavor = "", options = [] } = {}) {
      const roll = await new Roll("1d20").evaluate();
      if (flavor) {
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
      }
      return { total: roll.total ?? 0, roll, native: false };
    }

    // Normalize a roll into a degree-of-success tier. Systems without degrees
    // collapse to two bands. Returns one of:
    // "critFail" | "fail" | "success" | "critSuccess".
    degreeOf(total, dc, dieResult = null) {
      return total >= dc ? "success" : "fail";
    }

    // --- Effects (content application mechanism only) ---
    // PF2e applies an effect item from a compendium uuid. 5e / DH build an
    // ActiveEffect. Contract: returns the created document(s) on success, null
    // when no document resolves (falsy uuid, or the uuid did not resolve), and
    // PROPAGATES any thrown error so callers keep their own error handling.
    // Options: badgeValue, systemMerge, flagProps, name, noHook (see PF2e impl).

    async applyEffect(actor, uuid, opts = {}) {
      console.warn(`AFLP | applyEffect not implemented for system '${this.id}'`);
      return null;
    }

    async removeEffect(actor, slugOrUuid) {
      console.warn(`AFLP | removeEffect not implemented for system '${this.id}'`);
    }

    // --- Climax reward/penalty primitives ---
    // Systems that resolve these as effect items (PF2e) leave them as no-ops and
    // keep their item path. A non-null return means the call was handled natively,
    // so the caller skips its effect-item fallback. DH overrides all four.
    async gainHope(actor, n = 1) { return null; }
    async clearStress(actor, n = 1) { return null; }
    async markStress(actor, n = 1) { return null; }
    async markSpiralToken(actor, n = 1) { return null; }
    async setBimbofied(actor, level) { return null; }
    async setBullified(actor, level) { return null; }

    // --- Per-system content resolution (logical key -> UUID) ---
    // AFLP content (conditions, kinks, effects) is referenced by a stable logical
    // key (its slug). On PF2e the canonical items live in aflp-lewd-items; other
    // systems keep parallel content in their own packs (aflr-dh-items, aflr-5e-items)
    // tagged with flags.ardisfoxxs-lewd-pf2e.aflrKey = <logical key>. contentUuid()
    // resolves a key to the current system's content, falling back to the canonical
    // PF2e UUID so behaviour is unchanged until those packs are populated and tagged.

    // Pack ids this system draws content from. Subclasses override.
    contentPackIds() { return []; }

    // Build (and cache) the aflrKey -> UUID index from this system's content packs.
    async buildContentIndex() {
      const idx = new Map();
      for (const packId of this.contentPackIds()) {
        const full = packId.includes(".") ? packId : `ardisfoxxs-lewd-pf2e.${packId}`;
        const pack = game.packs?.get(full);
        if (!pack) continue;
        try {
          const index = await pack.getIndex({ fields: ["flags.ardisfoxxs-lewd-pf2e.aflrKey"] });
          for (const entry of index) {
            const key = entry.flags?.["ardisfoxxs-lewd-pf2e"]?.aflrKey;
            if (key && !idx.has(key)) idx.set(key, `Compendium.${pack.collection}.${pack.documentName}.${entry._id}`);
          }
        } catch (e) {
          console.warn(`AFLP | content index build failed for ${full}:`, e);
        }
      }
      this._contentIndex = idx;

      // Reverse map: canonical PF2e UUID -> logical key, from the static registries.
      // Lets applyEffect transparently redirect a canonical UUID to this system's
      // content without every call site needing to pass a logical key.
      const rev = new Map();
      for (const reg of [AFLP.conditions, AFLP.kinks]) {
        for (const [key, def] of Object.entries(reg ?? {})) {
          if (def?.uuid && !rev.has(def.uuid)) rev.set(def.uuid, key);
        }
      }
      this._canonicalToKey = rev;

      return idx;
    }

    // Redirect a canonical (PF2e) content UUID to this system's equivalent when one
    // exists. Passthrough when the UUID isn't registry content or no system content
    // is indexed yet, so behaviour is unchanged until the DH/5e packs are populated.
    resolveContentUuid(uuid) {
      if (!uuid || !this._contentIndex?.size || !this._canonicalToKey) return uuid;
      const key = this._canonicalToKey.get(uuid);
      if (!key) return uuid;
      return this._contentIndex.get(key) ?? uuid;
    }

    // Canonical PF2e fallback drawn from the static registries.
    _canonicalUuid(key) {
      return AFLP.conditions?.[key]?.uuid ?? AFLP.kinks?.[key]?.uuid ?? null;
    }

    // Resolve a logical content key to this system's UUID (canonical PF2e fallback).
    contentUuid(key) {
      if (!key) return null;
      return this._contentIndex?.get(key) ?? this._canonicalUuid(key);
    }

    // Convenience: resolve a logical key, then applyEffect.
    async applyEffectByKey(actor, key, opts = {}) {
      const uuid = this.contentUuid(key);
      if (!uuid) return null;
      return this.applyEffect(actor, uuid, opts);
    }

    // --- Roll-message integration ---
    // Normalize a chat message's roll context into neutral fields, or null if
    // the message is not a recognized roll. Lets features react to roll
    // outcomes (crits, save results) without reading system-specific flags.
    // Shape: { degree, actorId, targetId, rollType, statistic } where degree is
    // "critSuccess"|"success"|"fail"|"critFail"|null and rollType is a neutral
    // name like "save"|"attack"|"skill".
    readMessageContext(msg) {
      return null;
    }
  }

  AFLP.SystemAdapter = SystemAdapter;
})();
