// ===============================
// AFLP System Adapter - Pathfinder 2e (pf2e-adapter.js)
// ===============================
// The current shipping behavior, relocated behind the adapter contract with
// no logic changes. PF2e was AFLP's only system through 7.0.0, so this is the
// reference implementation other adapters mirror.
// ===============================

(() => {
  window.AFLP = window.AFLP || {};
  if (!AFLP.SystemAdapter) {
    console.error("AFLP | PF2e adapter loaded before SystemAdapter base.");
    return;
  }
  if (AFLP.PF2eAdapter) return;

  // Register the "sexual" trait across every PF2e trait list, including
  // npcAttackTraits - PF2e validates traits per item type and STRIPS invalid
  // choices at document construction (Tentacle Snuggle's melee strike was
  // silently losing its sexual trait with an element-validation warning).
  // Idempotent: skips lists that already carry it (a world script registers
  // most of them today; AFLR should not depend on that).
  Hooks.once("init", () => {
    if (!["pf2e", "sf2e"].includes(game.system.id)) return;
    const LISTS = [
      "actionTraits", "effectTraits", "featTraits", "spellTraits",
      "equipmentTraits", "weaponTraits", "consumableTraits",
      "npcAttackTraits", "armorTraits", "classTraits",
    ];
    for (const l of LISTS) {
      const list = CONFIG.PF2E?.[l];
      if (list && !("sexual" in list)) list.sexual = "Sexual";
    }
  });

  class PF2eAdapter extends AFLP.SystemAdapter {
    get id() { return "pf2e"; }
    contentPackIds() { return ["aflp-lewd-items"]; }

    get capabilities() {
      return {
        degreesOfSuccess: true,
        valuedConditions: true,
        nativeArousal: null,
        resistKind: "fortitude",
      };
    }

    // PF2e PCs are the "character" type. (NPCs may be player-owned, so type is
    // the correct discriminator, matching the existing gating logic.)
    isPC(actor) { return actor?.type === "character"; }

    // PF2e adversaries / creatures and hazards.
    isNPC(actor) { return actor?.type === "npc" || actor?.type === "hazard"; }

    // An unowned NPC: AFLP's "monster" idiom (npc && !hasPlayerOwner).
    isMonster(actor) { return actor?.type === "npc" && !actor?.hasPlayerOwner; }

    // Map a pf2e actor's size to a BASE_CUM_BY_SIZE key. PF2e's native size
    // values (tiny/sm/med/lg/huge/grg) already line up, so this is mostly an
    // identity guard with the long-form aliases folded in.
    cumSizeKey(actor) {
      const raw = String(actor?.system?.traits?.size?.value ?? "med").toLowerCase();
      const map = {
        tiny: "tiny", sm: "sm", small: "sm", med: "med", medium: "med",
        lg: "lg", large: "lg", huge: "huge", grg: "grg", gargantuan: "grg",
      };
      return map[raw] ?? "med";
    }

    // Valued conditions that increment (respecting a cap) rather than
    // duplicating. Relocated from AFLP.Arousal so every system shares one path.
    _STACKABLE = {
      "horny":           3,    // base caps at 3 (kinks raise the practical ceiling)
      "mind-break":      null, // no cap
      "exposed":         2,    // 1-2
      "creature-fetish": 6,    // badge is 1-6
      "bimbofied":       3,    // badge is 1-3
      "bullified":       3,    // badge is 1-3
    };

    // Where PF2e's ceilings differ from the shared base in AFLP.CONDITION_CAPS,
    // which carries Daggerheart's 3 / 6 / 8 ladder. Kept in step with _STACKABLE
    // above so the increment path and AFLP.capCondition cannot disagree.
    //
    // Bimbofied and Bullified reach 4 here because PF2e's content is already
    // built for it and the pack is the specification:
    //   - the Bimbofied card: "you gain another level of Bimbofied to a maximum
    //     of 4";
    //   - the Animated Bitchsuit's four-step ladder (1 / 4 / 24 / 48 hours) in
    //     aflp-bitchsuit.js, which ends at Bimbofied 4 and writes the badge
    //     directly, so it never passed through capCondition to be caught;
    //   - the Bull kink's Greater: "your Bullified value can rise to 4";
    //   - ArchBimbomancer, Idiot Slut Juice and Flesh to Fleshlight all name
    //     Bimbofied 4.
    // Daggerheart states 3 for both and stays on the base. Decided 9 Aug 2026;
    // the alternative considered and rejected was capping at 3 everywhere and
    // letting the Bimbomancer archetype raise it, which is a rule nobody needs.
    // Of the stackables, the level-style conditions: re-applying does not
    // accumulate. An explicit value means "set to at least N"; a null value
    // means "one more level". (Exposed; the others genuinely accumulate.)
    _RAISE_TO = new Set(["exposed", "exposed-nude"]);

    // Singular conditions: never stack, silently skip if already present.
    _SINGULAR = new Set(["dominating", "submitting", "defeated", "restrained", "grabbed"]);

    // AFLR-owned conditions stored as a flag on PF2e (matching Daggerheart), not
    // as embedded items. Limited to the no-rules state markers - Dominating,
    // Submitting, Defeated carry zero PF2e rule elements, so flag storage loses no
    // mechanics. Exposed and Mind Break carry FlatModifier rules and still use the
    // item path until their effect-via-applyEffect handling lands (2c step 2).
    _FLAG_CONDS = new Set(["dominating", "submitting", "defeated", "birth-control", "breeding"]);

    // Read the AFLR condition flag bag (slug -> numeric value). Shared key/scope
    // with the Daggerheart adapter so AFLP.cond and the badge UI read uniformly.
    _aflpConds(actor) {
      return actor?.getFlag?.(AFLP.FLAG_SCOPE, "aflpConditions") ?? {};
    }
    // Delete any legacy embedded condition item for `slug` (migration cleanup, so
    // a flipped condition does not read as present via the dual-read item path).
    // ── TIMED EFFECTS ARE MIRRORED, NOT REPLACED ───────────────────────────
    //
    // Ardis, 20 Aug 2026: "probably easier to have effects that have durations to
    // not be deleted with the flag import. the effect and duration is clean, we
    // can just have the flag mirror those effects so we get the best of both flag
    // and effect."
    //
    // The flag migration deleted the pack item for every `_FLAG_CONDS` key, which
    // is right for a key whose card says `unlimited` and WRONG for one that
    // carries a real duration: Defeated promises "1 minute, expiry turn-start"
    // and, stored as a flag, never expired at all. Measured 20 Aug in pf2e-dev -
    // the only exit was failing the flat check, so the card's safe path (stop
    // being aroused and wait it out) did not exist.
    //
    // MEASURED, so this stays narrow: of the five _FLAG_CONDS keys, only
    // `defeated` has a real duration. Dominating, Submitting, Birth Control and
    // Fertility are all `unlimited` and keep the flag-only path untouched.
    //
    // The item is tagged twice and both tags are load-bearing:
    //   aflrApplied        - AFLP.importConditionItem skips its own writes
    //   importedCondition  - the deleteItem hook in schema.js clears the flag when
    //                        Foundry expires the effect. That hook already exists
    //                        and is already tested; this reuses it rather than
    //                        inventing an expiry mechanism.
    // Re-applying RESETS the clock, which is the card's "defeat's duration
    // resets" - PF2e reads elapsed time from system.start.value.
    // GOES STALE IF: a second _FLAG_CONDS card gains a duration (this handles it
    // automatically), or PF2e moves where an effect records its start.
    _hasRealDuration(dur) {
      return !!(dur && dur.unit && !["unlimited", "encounter"].includes(dur.unit) && Number(dur.value) > 0);
    }

    async _syncTimedMirror(liveActor, slug) {
      const uuid = AFLP.conditions?.[slug]?.uuid;
      const existing = liveActor?.items?.find(c =>
        c.slug === slug || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      );
      let doc = null;
      try { doc = uuid ? await fromUuid(uuid) : null; } catch (e) { doc = null; }
      const timed = this._hasRealDuration(doc?.system?.duration);

      if (!timed) { if (existing) { try { await existing.delete(); } catch (e) {} } return false; }

      const now = Number(game.time?.worldTime) || 0;
      if (existing) {
        // Reset the clock rather than churning the document.
        try { await existing.update({ "system.start.value": now }); } catch (e) { /* non-fatal */ }
        return true;
      }
      if (!doc) return false;
      try {
        const data = doc.toObject();
        delete data._id;
        foundry.utils.setProperty(data, "system.start.value", now);
        const MOD = AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e";
        foundry.utils.setProperty(data, `flags.${MOD}.aflrApplied`, true);
        foundry.utils.setProperty(data, `flags.${AFLP.FLAG_SCOPE}.importedCondition`, slug);
        await liveActor.createEmbeddedDocuments("Item", [data]);
        return true;
      } catch (e) {
        console.warn(`AFLP | timed mirror for ${slug} failed:`, e?.message);
        return false;
      }
    }

    // Reset a mirrored effect's duration without changing its value. Returns true
    // when a timed mirror exists and was refreshed.
    async refreshConditionDuration(actor, slug, tokenId = null) {
      if (!this._FLAG_CONDS.has(slug)) return false;
      return this._syncTimedMirror(this.liveActor(actor, tokenId), slug);
    }

    async _deleteLegacyConditionItem(liveActor, slug) {
      const uuid = AFLP.conditions?.[slug]?.uuid;
      const item = liveActor?.items?.find(c =>
        c.slug === slug || (uuid && (c.flags?.core?.sourceId ?? c.sourceId) === uuid)
      );
      if (item) { try { await item.delete(); } catch (e) { /* ignore */ } }
    }

    async applyCondition(actor, slug, uuid = null, value = null, tokenId = null) {
      // Always check conditions on the live token actor (synthetic instance for
      // unlinked tokens); the fresh-apply still writes to the passed actor.
      const liveActor = this.liveActor(actor, tokenId);

      // Flag-backed AFLR state markers (Dominating/Submitting/Defeated): store on
      // the shared aflpConditions flag, clean up any legacy embedded item, and
      // skip the PF2e item path entirely. Matches the Daggerheart adapter.
      if (this._FLAG_CONDS.has(slug)) {
        const conds = { ...this._aflpConds(liveActor) };
        // CLAMPED. PF2e's clamp was added to the ITEM path on 8 Aug 2026 and never
        // extended to this one, so the five conditions that had been MOVED into the
        // flag bag were writing whatever they were handed. Breeding and Birth
        // Control both reached 7 against cards that say 3. Found 14 Aug by the first
        // pf2e-dev harness run since the 13th.
        conds[slug] = AFLP.capCondition(slug, value ?? 1);
        await liveActor.setFlag(AFLP.FLAG_SCOPE, "aflpConditions", conds);
        // AFTER the flag write, and it replaces the unconditional delete that used
        // to sit at the top of this branch: a timed card keeps its effect (and has
        // its clock reset), an unlimited one is still stripped. See _syncTimedMirror.
        await this._syncTimedMirror(liveActor, slug);
        return;
      }

      const existing = liveActor.items?.find(c =>
        c.slug === slug || (uuid && c.sourceId === uuid)
      );

      if (existing) {
        if (slug in this._STACKABLE) {
          // Increment valued condition, respecting cap. Level-style conditions
          // (Exposed) raise-to-at-least instead of accumulating: an explicit
          // value sets max(current, value); a null value adds one level.
          const current = existing.system?.badge?.value ?? 0;
          const next = this._RAISE_TO.has(slug)
            ? (value !== null ? Math.max(current, value) : current + 1)
            : current + (value ?? 1);
          // Through capCondition rather than _STACKABLE directly: the two tables
          // duplicate each other and this is the path where they would drift
          // apart. It also picks up the per-actor raise, without which a
          // Bimbomancer would still stop at 3 on the second application.
          const capped = AFLP.capCondition(slug, next);
          if (capped > current) {
            await existing.update({ "system.badge.value": capped });
          }
        }
        // Singular, or already-present stackable at cap: do nothing.
        return;
      }

      // Not present: apply fresh.
      try {
        if (uuid) {
          const condDoc = await fromUuid(uuid);
          if (condDoc) {
            const itemData = condDoc.toObject();
            // Truthy check, not !== undefined: binary effects carry badge: null
            // in the PF2e schema, and null passed the old guard then threw on
            // the .value assignment.
            //
            // CLAMPED. The increment branch above respects _STACKABLE, but this
            // FRESH-apply branch did not, so applying a condition an actor did
            // not already have, at an explicit value, wrote that value straight
            // onto the badge: `apply(actor, "bimbofied", 9)` landed 9 against a
            // card that says 3, and only because the actor happened to be clean.
            // The same call on an actor who already had Bimbofied clamped
            // correctly, which is why this survived - it failed only on the
            // first application. AFLP.capCondition reads CONDITION_CAPS, which
            // is copied from _STACKABLE so the two cannot disagree, and returns
            // an unknown key untouched. Found 8 Aug 2026.
            if (value !== null && itemData.system?.badge) {
              itemData.system.badge.value = AFLP.capCondition(slug, value);
            }
            // TAGGED AS OURS, so AFLP.importConditionItem can tell a card AFLR
            // applied from one a user DRAGGED onto the sheet, and only converts
            // the latter. An ITEM flag, so the module id is correct here rather
            // than AFLP.FLAG_SCOPE.
            //
            // This tag was added on 19 Aug 2026 for a reason that no longer
            // applies and is recorded because the shape recurs: `horny` and
            // `denied` reached this method at all, the importer converted the
            // item AFLR had just created, and `cond.apply(actor,"horny",1)` was
            // followed by `cond.value(actor,"horny") === 0`. The tag stopped the
            // importer eating it - and left the two stores disagreeing the other
            // way round, cond.value 2 against AFLP.horny.total 0. The actual fix
            // is in AFLP.cond._door: those two keys never reach this method now.
            // The tag stays because it makes the importer's refusal DETERMINISTIC
            // for every other key rather than dependent on read-back timing.
            //
            // WHAT MAKES THIS STALE: AFLP.importConditionItem gaining a different
            // way to identify its own writes, or _door growing to cover every
            // valued condition (then nothing AFLR applies is importable at all).
            foundry.utils.setProperty(itemData,
              `flags.${AFLP.MODULE_ID ?? "ardisfoxxs-lewd-pf2e"}.aflrApplied`, true);
            await actor.createEmbeddedDocuments("Item", [itemData]);
            return;
          }
        }
      } catch (e) {
        console.warn(`AFLP | applyCondition UUID path failed for ${slug}:`, e);
      }
      // Fallback: PF2e actor.increaseCondition for core conditions.
      //
      // GATED ON PF2E ACTUALLY HAVING THE CONDITION, because increaseCondition
      // assumes the slug names one of ITS conditions and does not check: it looks
      // the slug up, gets null, and THROWS on null.toObject() deep inside
      // pf2e.mjs. Everything above this point fails soft - a missing content uuid
      // no-ops - so an AFLR key that PF2e does not know was the one path that blew
      // up instead of doing nothing.
      //
      // `defeat` is exactly that key and it is not a mistake: canon is that PF2e
      // has no Defeat condition, only Defeated. It still carries a CONDITION_CAPS
      // entry because that registry is shared across all three systems, so any
      // shared code calling AFLP.cond.apply(actor, "defeat", n) on Pathfinder threw
      // rather than no-opping. Found 14 Aug 2026 by the first harness run in
      // pf2e-dev since the 13th.
      //
      // WHAT MAKES THIS STALE: PF2e gaining a Defeat condition, or AFLR shipping
      // one as a content item - either way the branches above would catch it first.
      if (typeof actor.increaseCondition === "function" && this._pf2eKnowsCondition(slug)) {
        await actor.increaseCondition(slug);
      } else {
        console.warn(`AFLP | Could not apply condition ${slug} to ${actor.name}`);
      }
    }

    // Does PF2e itself define this condition slug? Asked of the system rather than
    // of a list we maintain, so a Remaster rename cannot silently desync it.
    // ConditionManager.conditions is keyed by slug AND by uuid; conditionTypes is
    // the config map. Either answering is enough; if neither exists (a PF2e version
    // that moved both), fall back to true so behaviour is unchanged rather than
    // newly suppressed - the try/catch above still contains the damage.
    _pf2eKnowsCondition(slug) {
      const cm = game.pf2e?.ConditionManager?.conditions;
      if (cm?.has) return cm.has(slug);
      const types = CONFIG?.PF2E?.conditionTypes;
      if (types) return slug in types;
      return true;
    }

    async removeCondition(actor, slug, tokenId = null) {
      const liveActor = this.liveActor(actor, tokenId);

      // Flag-backed AFLR state markers: clear the flag key with -= (a plain
      // setFlag merge would resurrect the deleted key) and strip any legacy item.
      if (this._FLAG_CONDS.has(slug)) {
        await this._deleteLegacyConditionItem(liveActor, slug);
        if ((this._aflpConds(liveActor)[slug] ?? 0) !== 0) {
          await liveActor.update({ [`flags.${AFLP.FLAG_SCOPE}.aflpConditions.-=${slug}`]: null });
        }
        return;
      }

      // REMOVE EVERY INSTANCE, NOT THE FIRST. This was `items.find(...)` and a
      // single `.delete()`, so an actor carrying two copies of a condition came
      // back from `removeCondition` still carrying one - and `cond.has` and
      // `cond.value` both answer "present" off ANY match, so the API said the
      // condition was gone while every reader still saw it.
      //
      // MEASURED 23 Aug 2026: two CONCURRENT `cond.raiseTo` calls produced two
      // `Bimbofied` effect items; one `cond.remove` left one behind and the value
      // stayed 1. That is what failed the living-gear suite intermittently. The
      // duplicate itself is fixed at source by the per-actor serialisation in
      // `schema.js`; this is the other half, and it is what heals a world that
      // already carries duplicates from before that fix.
      //
      // SAFE FOR NATIVE CONDITIONS: Pathfinder keeps its own conditions unique per
      // actor, so a second match is AFLR's duplicate rather than something the
      // system or a GM put there - and removing "the condition" is what the caller
      // asked for either way. One `deleteEmbeddedDocuments` call rather than N
      // deletes, so the removals cannot race each other.
      // GOES STALE IF: PF2e starts allowing multiple simultaneous instances of one
      // condition slug with independent meanings.
      const matches = (liveActor.items?.filter?.(c => c.slug === slug) ?? []);
      if (matches.length) {
        await liveActor.deleteEmbeddedDocuments("Item", matches.map(i => i.id));
      } else if (typeof actor.decreaseCondition === "function") {
        await actor.decreaseCondition(slug, { forceRemove: true });
      }
    }

    // --- Flag-aware condition reads (dual-read during migration) ---
    // For the flag-backed AFLR state markers, consult the aflpConditions flag
    // first, then fall through to the base item check so any legacy embedded
    // item still registers until the one-time strip migration (2e) runs.
    hasCondition(actor, key, tokenId = null) {
      if (this._FLAG_CONDS.has(key)) {
        const live = this.liveActor(actor, tokenId);
        if ((this._aflpConds(live)[key] ?? 0) > 0) return true;
      }
      return super.hasCondition(actor, key, tokenId);
    }

    conditionValue(actor, key, tokenId = null) {
      if (this._FLAG_CONDS.has(key)) {
        const live = this.liveActor(actor, tokenId);
        const v = this._aflpConds(live)[key] ?? 0;
        if (v > 0) return v;
      }
      return super.conditionValue(actor, key, tokenId);
    }

    async setConditionValue(actor, key, value, tokenId = null) {
      if (this._FLAG_CONDS.has(key)) {
        if (value > 0) {
          const live = this.liveActor(actor, tokenId);
          const conds = { ...this._aflpConds(live) };
          // CLAMPED - see applyCondition. setValue and setExact are the paths the
          // sheet's condition manager uses, which is how a GM could type 7 into a
          // track whose card promises 3.
          conds[key] = AFLP.capCondition(key, value);
          await live.setFlag(AFLP.FLAG_SCOPE, "aflpConditions", conds);
        } else {
          await this.removeCondition(actor, key, tokenId);
        }
        return;
      }
      return super.setConditionValue(actor, key, value, tokenId);
    }

    // Apply a PF2e core condition by slug via actor.increaseCondition, with an
    // optional value for valued core conditions (e.g. stunned 2). Errors are
    // swallowed, matching the defensive call sites this replaces.
    async applyNativeCondition(actor, slug, value = null, tokenId = null) {
      const target = tokenId ? this.liveActor(actor, tokenId) : actor;
      if (typeof target?.increaseCondition !== "function") return;
      try {
        await target.increaseCondition(slug, value != null ? { value } : undefined);
      } catch (e) {
        /* swallow: parity with the optional-chaining / try-catch sites */
      }
    }

    // ── Effects layer (PF2e) ──────────────────────────────────────────────
    // PF2e ignores ActiveEffects for stats; numeric intents emit as a carrier
    // effect ITEM whose system.rules[] holds the Rule Elements.
    findEffectIntentDoc(actor, key) {
      const a = this.liveActor(actor) ?? actor;
      return a?.items?.find?.(i => i.getFlag?.("ardisfoxxs-lewd-pf2e", "effectIntent") === key) ?? null;
    }
    async applyEffectIntent(actor, key, spec) {
      const a = this.liveActor(actor) ?? actor;
      if (!a || !spec?.pf2e?.rules) return;
      await a.createEmbeddedDocuments("Item", [{
        name: spec.label,
        type: "effect",
        img: "icons/svg/aura.svg",
        system: {
          description: { value: `<p>${spec.note ?? "Managed by AFLR (auto-applies and auto-clears)."}</p>` },
          slug: `aflr-effect-${key}`,
          rules: spec.pf2e.rules,
          traits: { value: [], rarity: "common" },
          level: { value: 1 },
          duration: { value: -1, unit: "unlimited", expiry: null, sustained: false },
          tokenIcon: { show: true },
        },
        flags: { "ardisfoxxs-lewd-pf2e": { effectIntent: key } },
      }]);
    }
    async removeEffectIntent(actor, key) {
      const doc = this.findEffectIntentDoc(actor, key);
      if (doc) await doc.delete();
    }

    // Size Difference bite on PF2e (no Stress track): a smaller body forced open
    // takes a little nonlethal and is briefly Clumsy 1. Nonlethal so it reads as
    // rough sex, not a wound; Clumsy 1 is the "still adjusting to the stretch" beat.
    async sizePenalty(actor, tokenId = null) {
      const target = tokenId ? this.liveActor(actor, tokenId) : actor;
      try {
        const roll = await new Roll("1d4").evaluate();
        const dmg = roll.total;
        const hp = target?.system?.attributes?.hp;
        if (hp && typeof hp.value === "number") {
          // Direct write is the reliable cross-version path (applyDamage's
          // auto-apply vs chat-card behavior varies by PF2e version / settings).
          // Nonlethal: it cannot drop the receiver below 1 HP - rough sex, not a
          // wound. A creature already at 1 takes none.
          const next = Math.max(1, hp.value - dmg);
          if (next < hp.value) {
            await target.update({ "system.attributes.hp.value": next });
          }
          try {
            ChatMessage.create({
              content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> is stretched by an oversized partner: <strong>${hp.value - next}</strong> nonlethal, and Clumsy 1.</p></div>`,
              speaker: { alias: "AFLR" },
            });
          } catch (e) { /* chat optional */ }
        }
      } catch (e) { /* non-fatal */ }
      await this.applyNativeCondition(target, "clumsy", 1, tokenId);
      // Record how much Clumsy WE added, so it can be removed cleanly later
      // (scene end, leaving, or switching to a non-penetrative position) without
      // touching Clumsy from any other source. Accumulates within a scene.
      try {
        const t = tokenId ? this.liveActor(target, tokenId) : target;
        const prev = Number(t.getFlag(AFLP.FLAG_SCOPE, "sizeClumsy")) || 0;
        await t.setFlag(AFLP.FLAG_SCOPE, "sizeClumsy", prev + 1);
      } catch (e) { /* non-fatal */ }
      return true;
    }

    // Remove exactly the Clumsy WE stacked from oversized penetration, then clear
    // the tracker. Uses decreaseCondition per point so an unrelated Clumsy (spell,
    // trap) is left intact.
    async clearSizePenalty(actor, tokenId = null) {
      const t = tokenId ? this.liveActor(actor, tokenId) : actor;
      if (!t) return;
      const owed = Number(t.getFlag(AFLP.FLAG_SCOPE, "sizeClumsy")) || 0;
      if (owed <= 0) return;
      try {
        for (let i = 0; i < owed; i++) {
          if (typeof t.decreaseCondition === "function") await t.decreaseCondition("clumsy");
        }
      } catch (e) { /* non-fatal */ }
      try { await t.unsetFlag(AFLP.FLAG_SCOPE, "sizeClumsy"); } catch (e) { /* non-fatal */ }
      return true;
    }

    // Ruined (gap 3) on PF2e: pinned on it -> Grabbed.
    async sizeRestrain(actor, tokenId = null) {
      await this.applyNativeCondition(actor, "grabbed", null, tokenId);
      return "grabbed";
    }

    async rollResist(actor, { dc = 15, kind = "fortitude", flavor = "", options = [] } = {}) {
      let roll = null;
      try {
        // PF2e: actor.saves.<kind>.roll posts its own styled chat card.
        roll = await actor.saves?.[kind]?.roll({
          dc: { value: dc },
          rollMode: "publicroll",
          extraRollOptions: options,
        });
      } catch (e) {
        console.warn("AFLP | rollResist: native save roll failed, falling back to d20.", e);
        roll = null;
      }
      if (!roll) {
        // Fallback: plain d20 posted to chat with the supplied flavor.
        roll = await new Roll("1d20").evaluate();
        if (flavor) {
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
        }
        return { total: roll.total ?? 0, roll, native: false };
      }
      return { total: roll.total ?? roll._total ?? 0, roll, native: true };
    }

    degreeOf(total, dc, dieResult = null) {
      let tier = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
      if (dieResult === 20) tier = Math.min(3, tier + 1);
      else if (dieResult === 1) tier = Math.max(0, tier - 1);
      return ["critFail", "fail", "success", "critSuccess"][tier];
    }

    // Apply a PF2e effect / condition item from a compendium uuid.
    // Returns the created document(s) on success, or null if no document
    // resolves (falsy uuid or fromUuid returned null). Throws from fromUuid /
    // createEmbeddedDocuments propagate so callers keep their own handling.
    // Options:
    //   badgeValue  - set system.badge.value (only if the item has a badge)
    //   systemMerge - object deep-merged into system (e.g. { level: { value: N } })
    //   flagProps   - map of dot-path -> value applied via setProperty
    //   name        - override the item name
    //   noHook      - suppress creation hooks
    async applyEffect(actor, uuid, { badgeValue = null, systemMerge = null, flagProps = null, name = null, noHook = false } = {}) {
      if (!uuid) return null;
      const doc = await fromUuid(uuid);
      if (!doc) return null;
      const data = doc.toObject();
      if (name !== null) data.name = name;
      if (badgeValue !== null && data.system?.badge !== undefined) {
        data.system.badge.value = badgeValue;
      }
      if (systemMerge !== null) {
        data.system = foundry.utils.mergeObject(data.system ?? {}, systemMerge);
      }
      if (flagProps) {
        for (const [path, val] of Object.entries(flagProps)) {
          foundry.utils.setProperty(data, path, val);
        }
      }
      return actor.createEmbeddedDocuments("Item", [data], noHook ? { noHook: true } : {});
    }

    // Normalize a PF2e chat-message roll context into neutral fields.
    readMessageContext(msg) {
      const ctx = msg?.flags?.pf2e?.context;
      if (!ctx) return null;
      const degMap = {
        criticalSuccess: "critSuccess",
        success: "success",
        failure: "fail",
        criticalFailure: "critFail",
      };
      const typeMap = {
        "saving-throw": "save",
        "attack-roll": "attack",
        "skill-check": "skill",
      };
      return {
        degree: degMap[ctx.outcome] ?? null,
        actorId: ctx.actor ?? null,
        targetId: ctx.target?.actor ?? null,
        rollType: typeMap[ctx.type] ?? (ctx.type ?? null),
        statistic: ctx.statistic ?? null,
      };
    }
  }

  AFLP.PF2eAdapter = PF2eAdapter;
})();
