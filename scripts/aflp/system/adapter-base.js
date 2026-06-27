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
        valuedConditions: false,  // conditions that carry an incrementing numeric badge
        nativeArousal: null,      // null = AFLP-owned flag; "stress" = bridge to a native resource
        resistKind: null,         // which save/roll resists a cum; null = auto-resolve
      };
    }

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

    // --- Resource-change vocabulary ------------------------------------
    // How this system talks about changing a pooled/marked resource (Arousal,
    // Stress, HP). Daggerheart "marks" and "clears"; PF2e and D&D 5e "gain" and
    // "lose", matching their Hit Point / Spell Slot language. Only the systems
    // that diverge from the gain/lose default (Daggerheart) override these.
    get markVerb()  { return "gain"; }
    get clearVerb() { return "lose"; }

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
      return { degree, detail: `Roll <strong>${roll.total}</strong> vs Brood DC ${dc}` };
    }

    // Apply a system-native core condition (e.g. grabbed, restrained, sickened,
    // stunned) by slug, with an optional numeric value for valued conditions.
    // Distinct from applyCondition, which applies AFLP content items by uuid.
    async applyNativeCondition(actor, slug, value = null, tokenId = null) {
      console.warn(`AFLP | applyNativeCondition not implemented for system '${this.id}' (${slug})`);
    }

    // --- AFLP custom condition state (valued / binary) ---
    // AFLP's own conditions (Mind Break, Defeated, Submitting, Dominating,
    // Exposed, ...) are PF2e condition ITEMS. These accessors expose their
    // presence and numeric value so domain logic never queries actor.items
    // directly. A system without those items (5e / Daggerheart) overrides these
    // to a flag-backed store, so the same conditions work there.

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
