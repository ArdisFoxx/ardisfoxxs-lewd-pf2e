// ===============================
// AFLP Bitchsuit Automation
// ===============================
// Handles dynamic effects for all three Bitchsuit variants:
//
//   Bitchsuit (Mundane)  — on-equip arousal, hourly arousal
//   Bitchsuit (Primal)   — above + Creature Fetish 3 grant
//   Bitchsuit (Animated) — per-combat-turn arousal, Edge blocked
//
// Static effects (speed penalty, save penalty, Gagged grant) are
// handled by rule elements on the items themselves.

window.AFLP_Bitchsuit = {

  // Compendium source UUIDs
  UUID_MUNDANE:  "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.0bytRvf1yjMMBPJX",
  UUID_PRIMAL:   "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xr0NHYZqmPriHvzb",
  UUID_ANIMATED: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ha8v6JLGefT4yaHg",
  UUID_CF:       "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.fcnEx5qeoOFNcr5v",

  // Content keys for the three PF2e suits. These are the aflrKey AND the
  // system.slug on each item - the two were made identical on 10 Aug 2026, when
  // all three were found carrying aflrKey null and resolving through the
  // hardcoded UUIDs below as their only path.
  //
  // "bitchsuit-animated" used to sit in this set and matched NOTHING: the
  // Living suit's slug is "bitchsuit-living". Detection only ever worked because
  // the UUID branch caught it. A phantom identifier that reads correctly is the
  // failure mode of this codebase, so the set is now checked against the pack by
  // the simulation harness.
  KEYS: new Set(["bitchsuit", "bitchsuit-primal", "bitchsuit-living"]),

  // Hours worn -> Bimbofied tier for the Animated suit. THREE steps, because
  // Bimbofied caps at 3: the condition item's counter badge max is 3, and the
  // badge is the real ceiling on PF2e - a raw write above it stores the max
  // before any of this code runs. This was [1, 4, 24, 48] and computed a tier 4
  // that the badge silently clamped, so the 48-hour step delivered nothing the
  // 24-hour step had not already given. Rescaled 9 Aug 2026 so every step is
  // reachable, and hoisted out of the hook 10 Aug so the ladder is testable
  // without driving the world clock.
  BIMBO_HOUR_STEPS: [1, 8, 24],

  // Tier for a given whole number of hours worn. 0 below the first step.
  _tierForHours(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h)) return 0;
    return this.BIMBO_HOUR_STEPS.filter(step => h >= step).length;
  },

  // -----------------------------------------------
  // Identify which (if any) bitchsuit an actor has equipped.
  // Returns the item, or null.
  // -----------------------------------------------
  getEquippedSuit(actor) {
    return actor.items?.find(i => {
      if (!this._isBitchsuitItem(i)) return false;
      // wornclothing usage: equipped when carryType === "worn"
      return i.system?.equipped?.carryType === "worn";
    }) ?? null;
  },

  // AFLP.itemHasKey asks aflrKey first, then system.slug, then a RESOLVING
  // sourceId - so it covers every path these items have ever been identified by,
  // including an actor's embedded copy. The UUID comparisons stay as a last
  // resort for a copy whose key and slug were both lost in a clone.
  _isBitchsuitItem(item) {
    if (!item) return false;
    for (const k of this.KEYS) if (AFLP.itemHasKey(item, k)) return true;
    const src = item.flags?.core?.sourceId ?? item.sourceId ?? "";
    return src === this.UUID_MUNDANE
        || src === this.UUID_PRIMAL
        || src === this.UUID_ANIMATED;
  },

  // The variant NAMES are internal and do not track the item names: the Living
  // suit drives the "animated" branch. Renaming the branch would touch the
  // escalation logic, the flags and the chat text, so the mapping is stated here
  // instead.
  _suitVariant(item) {
    const src = item?.flags?.core?.sourceId ?? item?.sourceId ?? "";
    if (AFLP.itemHasKey(item, "bitchsuit-living") || src === this.UUID_ANIMATED) return "animated";
    if (AFLP.itemHasKey(item, "bitchsuit-primal") || src === this.UUID_PRIMAL)   return "primal";
    return "mundane";
  },

  // -----------------------------------------------
  // Edge blocking — called from aflp-kinks.js tryEdge.
  // Returns true if Edge should be blocked for this actor.
  // -----------------------------------------------
  blocksEdge(actor) {
    const suit = this.getEquippedSuit(actor);
    return !!suit && this._suitVariant(suit) === "animated";
  },

  // -----------------------------------------------
  // Register all hooks
  // -----------------------------------------------
  register() {
    // PF2e-only: the bitchsuit automation keys off PF2e item slugs/UUIDs that do
    // not exist in other systems. On Daggerheart/5e it cleanly does nothing.
    if (AFLP.system?.id !== "pf2e") return;
    // Only the GM applies automated effects to avoid double-firing
    if (!game.user.isGM) return;

    // ── Equip / unequip detection ──────────────────────────────────────
    Hooks.on("updateItem", async (item, changes, _diff, userId) => {
      if (userId !== game.user.id) return;
      if (!this._isBitchsuitItem(item)) return;
      if (!item.actor) return;

      const nowWorn    = changes?.system?.equipped?.carryType === "worn";
      const nowUnworn  = changes?.system?.equipped?.carryType !== undefined && changes.system.equipped.carryType !== "worn";

      if (nowWorn) {
        await this._onEquip(item.actor, item);
      } else if (nowUnworn) {
        await this._onUnequip(item.actor, item);
      }
    });

    // ── Per-combat-turn arousal (Animated only) ────────────────────────
    Hooks.on("combatTurnChange", async (combat, _prior, current) => {
      const combatant = combat.combatants.get(current.combatantId);
      if (!combatant?.actor) return;
      const actor = AFLP.system.liveActor(combatant.actor, combatant.tokenId ?? null);
      const suit  = this.getEquippedSuit(actor);
      if (!suit || this._suitVariant(suit) !== "animated") return;

      await AFLP.ensureCoreFlags(actor);
      await AFLP_Arousal.increment(actor, 2, "Animated Bitchsuit", combatant.tokenId ?? null);
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p>The <strong>Animated Bitchsuit</strong> relentlessly stimulates <strong>${actor.name}</strong>, forcing them to ${AFLP.system.deltaText(2)}.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
    });

    // ── Hourly arousal (Mundane and Primal) ────────────────────────────
    // Fires whenever world time advances. Applies 2 arousal for each
    // complete hour elapsed since the suit was donned, using the
    // bitchsuitWornHours flag to track how many hours have already fired.
    Hooks.on("updateWorldTime", async (worldTime, _dt) => {
      // allLiveActors, not game.actors: an unlinked token wearing a suit is not
      // in game.actors at all, so this hook never ticked for a mook.
      for (const { actor, tokenId } of AFLP.allLiveActors()) {
        const suit = this.getEquippedSuit(actor);
        if (!suit) continue;
        const variant = this._suitVariant(suit);
        const FLAG    = AFLP.FLAG_SCOPE;
        const wornSince = actor.getFlag(FLAG, "bitchsuitWornSince");
        if (!wornSince) continue;

        const elapsedSeconds = worldTime - wornSince;
        const elapsedHours   = Math.floor(elapsedSeconds / 3600);

        // ── Animated: Bimbofied escalation ─────────────────────────
        // Tier 1 at 1h, tier 2 at 8h, tier 3 at 24h - see BIMBO_HOUR_STEPS for
        // why there is no fourth step. Keep this comment and that constant in
        // step: a stale copy of the old 1/4/24/48 ladder sat here until 10 Aug
        // 2026, directly above code that no longer did what it said.
        if (variant === "animated") {
          const BIMBO_UUID  = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V";
          const targetTier  = this._tierForHours(elapsedHours); // 0 - 3
          const appliedTier = actor.getFlag(FLAG, "bitchsuitBimbofiedTier") ?? 0;

          if (targetTier > appliedTier) {
            // Find existing Bimbofied item on actor
            const existing = actor.items.find(i =>
              i.slug === "bimbofied" ||
              (i.flags?.core?.sourceId ?? i.sourceId) === BIMBO_UUID
            );

            if (existing) {
              // Update badge to new tier
              await existing.update({ "system.badge.value": targetTier });
            } else {
              // Create fresh at correct tier
              await AFLP.system.applyEffect(actor, BIMBO_UUID, {
                noHook: true,
                badgeValue: targetTier,
              });
            }

            await actor.setFlag(FLAG, "bitchsuitBimbofiedTier", targetTier);
            await ChatMessage.create({
              content: `<div class="aflp-chat-card"><p>The <strong>Animated Bitchsuit</strong> has reshaped <strong>${actor.name}</strong>. They are now <strong>Bimbofied ${targetTier}</strong>.</p></div>`,
              speaker: { alias: "AFLP" },
            });
            console.log(`AFLP | ${actor.name} Bitchsuit: Bimbofied tier ${targetTier} applied`);
          }
          continue; // animated doesn't use hourly arousal tick below
        }

        // ── Mundane / Primal: hourly arousal ───────────────────────
        const appliedHours = actor.getFlag(FLAG, "bitchsuitWornHours") ?? 0;
        const dueHours     = elapsedHours - appliedHours;
        if (dueHours <= 0) continue;

        for (let i = 0; i < dueHours; i++) {
          await AFLP_Arousal.increment(actor, 2, "Bitchsuit (hourly)", null);
        }
        await actor.setFlag(FLAG, "bitchsuitWornHours", elapsedHours);
        await ChatMessage.create({
          content: `<div class="aflp-chat-card">
            <p>The <strong>Bitchsuit</strong>'s integrated stimulation torments <strong>${actor.name}</strong>
            (+${dueHours * 2} Arousal across ${dueHours} hour${dueHours > 1 ? "s" : ""}).</p>
          </div>`,
          speaker: { alias: "AFLP" },
        });
      }
    });
  },

  // -----------------------------------------------
  // Called when a bitchsuit is equipped (carryType → "worn")
  // -----------------------------------------------
  async _onEquip(actor, item) {
    const FLAG   = AFLP.FLAG_SCOPE;
    const variant = this._suitVariant(item);

    await AFLP.ensureCoreFlags(actor);

    // Record the world time the suit was donned
    const wornSince = game.time?.worldTime ?? 0;
    await actor.setFlag(FLAG, "bitchsuitWornSince",  wornSince);
    await actor.setFlag(FLAG, "bitchsuitWornHours",  0);

    // Apply 2 immediate Arousal
    await AFLP_Arousal.increment(actor, 2, "Bitchsuit donned", null);

    // Primal: grant Creature Fetish at level 3
    if (variant === "primal") {
      await this._ensurePrimalCF(actor);
    }

    const flavour = {
      mundane:  "The suit seals around them with a series of clicks. The integrated stimulation begins immediately.",
      primal:   "The enchanted suit moulds to them, the tail twitching to life. They are no longer quite human.",
      animated: "The suit seizes them like a living thing, straps pulling tight. It will not let go.",
    }[variant];

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong> is locked into a Bitchsuit. ${flavour}</p>
      </div>`,
      speaker: { alias: "AFLP" },
    });

    console.log(`AFLP | Bitchsuit (${variant}) equipped on ${actor.name}`);
  },

  // -----------------------------------------------
  // Called when a bitchsuit is unequipped
  // -----------------------------------------------
  async _onUnequip(actor, item) {
    const FLAG    = AFLP.FLAG_SCOPE;
    const variant = this._suitVariant(item);

    await actor.unsetFlag(FLAG, "bitchsuitWornSince");
    await actor.unsetFlag(FLAG, "bitchsuitWornHours");

    // Animated: remove Bimbofied and clear tier flag
    if (variant === "animated") {
      await actor.unsetFlag(FLAG, "bitchsuitBimbofiedTier");
      const BIMBO_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V";
      const bimboItems = actor.items.filter(i =>
        i.slug === "bimbofied" ||
        (i.flags?.core?.sourceId ?? i.sourceId) === BIMBO_UUID
      );
      if (bimboItems.length) {
        await actor.deleteEmbeddedDocuments("Item", bimboItems.map(i => i.id));
      }
    }

    // Primal: remove Creature Fetish if it came from the suit
    // Only remove if the actor doesn't also have the CF kink naturally
    if (variant === "primal") {
      await this._removePrimalCF(actor);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p>The Bitchsuit is removed from <strong>${actor.name}</strong>.</p>
      </div>`,
      speaker: { alias: "AFLP" },
    });

    console.log(`AFLP | Bitchsuit (${variant}) removed from ${actor.name}`);
  },

  // -----------------------------------------------
  // Ensure actor has Creature Fetish at ≥3 while Primal suit is worn.
  // Only increases; never decreases a naturally-higher existing level.
  // -----------------------------------------------
  async _ensurePrimalCF(actor) {
    const liveActor = AFLP.system.liveActor(actor);
    const existing  = liveActor.items?.find(i => {
      const src = i.flags?.core?.sourceId ?? i.sourceId ?? "";
      return i.slug === "creature-fetish" || i.system?.slug === "creature-fetish" || src === this.UUID_CF;
    });

    if (existing) {
      const cur = existing.system?.badge?.value ?? 1;
      if (cur < 3) {
        await existing.update({ "system.badge.value": 3 });
        console.log(`AFLP | Primal Bitchsuit: Creature Fetish raised to 3 on ${liveActor.name}`);
      }
    } else {
      try {
        const r = await AFLP.system.applyEffect(liveActor, this.UUID_CF, {
          badgeValue: 3,
          // Tag the granted item so we can remove it cleanly on unequip
          flagProps: { "flags.aflp.grantedByBitchsuit": true },
        });
        if (r === null) throw new Error("CF UUID not found");
        console.log(`AFLP | Primal Bitchsuit: Creature Fetish 3 granted to ${liveActor.name}`);
      } catch (e) {
        console.warn(`AFLP | Primal Bitchsuit: could not grant Creature Fetish:`, e);
      }
    }
  },

  // Remove Creature Fetish granted by the suit (only if flagged as suit-granted).
  async _removePrimalCF(actor) {
    const liveActor = AFLP.system.liveActor(actor);
    const grantedCF = liveActor.items?.find(i => {
      const src = i.flags?.core?.sourceId ?? i.sourceId ?? "";
      return (i.slug === "creature-fetish" || src === this.UUID_CF)
          && i.flags?.aflp?.grantedByBitchsuit === true;
    });
    if (grantedCF) {
      await grantedCF.delete().catch(() => {});
      console.log(`AFLP | Primal Bitchsuit: Creature Fetish removed from ${liveActor.name}`);
    }
  },
};
