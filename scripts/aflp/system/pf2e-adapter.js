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
      "creature-fetish": 9,    // up to 9
    };

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
        await this._deleteLegacyConditionItem(liveActor, slug);
        const conds = { ...this._aflpConds(liveActor) };
        conds[slug] = value ?? 1;
        await liveActor.setFlag(AFLP.FLAG_SCOPE, "aflpConditions", conds);
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
          const cap = this._STACKABLE[slug];
          const current = existing.system?.badge?.value ?? 0;
          const next = this._RAISE_TO.has(slug)
            ? (value !== null ? Math.max(current, value) : current + 1)
            : current + (value ?? 1);
          const capped = cap !== null ? Math.min(next, cap) : next;
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
            if (value !== null && itemData.system?.badge !== undefined) {
              itemData.system.badge.value = value;
            }
            await actor.createEmbeddedDocuments("Item", [itemData]);
            return;
          }
        }
      } catch (e) {
        console.warn(`AFLP | applyCondition UUID path failed for ${slug}:`, e);
      }
      // Fallback: PF2e actor.increaseCondition for core conditions.
      if (typeof actor.increaseCondition === "function") {
        await actor.increaseCondition(slug);
      } else {
        console.warn(`AFLP | Could not apply condition ${slug} to ${actor.name}`);
      }
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

      const existing = liveActor.items?.find(c => c.slug === slug);
      if (existing) {
        await existing.delete();
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
          conds[key] = value;
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
