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

  SLUGS: new Set(["bitchsuit", "bitchsuit-primal", "bitchsuit-animated"]),

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

  _isBitchsuitItem(item) {
    const slug = item.slug ?? item.system?.slug ?? "";
    const src  = item.flags?.core?.sourceId ?? item.sourceId ?? "";
    return this.SLUGS.has(slug)
        || src === this.UUID_MUNDANE
        || src === this.UUID_PRIMAL
        || src === this.UUID_ANIMATED;
  },

  _suitVariant(item) {
    const slug = item.slug ?? item.system?.slug ?? "";
    const src  = item.flags?.core?.sourceId ?? item.sourceId ?? "";
    if (slug === "bitchsuit-animated" || src === this.UUID_ANIMATED) return "animated";
    if (slug === "bitchsuit-primal"   || src === this.UUID_PRIMAL)   return "primal";
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
      const actor = game.actors.get(combatant.actor.id) ?? combatant.actor;
      const suit  = this.getEquippedSuit(actor);
      if (!suit || this._suitVariant(suit) !== "animated") return;

      await AFLP.ensureCoreFlags(actor);
      await AFLP_Arousal.increment(actor, 2, "Animated Bitchsuit", combatant.tokenId ?? null);
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p>The <strong>Animated Bitchsuit</strong> relentlessly stimulates <strong>${actor.name}</strong>, forcing +2 Arousal.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
    });

    // ── Hourly arousal (Mundane and Primal) ────────────────────────────
    // Fires whenever world time advances. Applies 2 arousal for each
    // complete hour elapsed since the suit was donned, using the
    // bitchsuitWornHours flag to track how many hours have already fired.
    Hooks.on("updateWorldTime", async (worldTime, _dt) => {
      for (const actor of game.actors.contents) {
        const suit = this.getEquippedSuit(actor);
        if (!suit) continue;
        const variant = this._suitVariant(suit);
        if (variant === "animated") continue; // Animated uses turn-based arousal

        const FLAG       = AFLP.FLAG_SCOPE;
        const wornSince  = actor.getFlag(FLAG, "bitchsuitWornSince");
        if (!wornSince) continue;

        const elapsedSeconds  = worldTime - wornSince;
        const elapsedHours    = Math.floor(elapsedSeconds / 3600);
        const appliedHours    = actor.getFlag(FLAG, "bitchsuitWornHours") ?? 0;
        const dueHours        = elapsedHours - appliedHours;
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
    const liveActor = game.actors.get(actor.id) ?? actor;
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
        const doc  = await fromUuid(this.UUID_CF);
        if (!doc) throw new Error("CF UUID not found");
        const data = doc.toObject();
        data.system.badge.value = 3;
        // Tag the granted item so we can remove it cleanly on unequip
        foundry.utils.setProperty(data, "flags.aflp.grantedByBitchsuit", true);
        await liveActor.createEmbeddedDocuments("Item", [data]);
        console.log(`AFLP | Primal Bitchsuit: Creature Fetish 3 granted to ${liveActor.name}`);
      } catch (e) {
        console.warn(`AFLP | Primal Bitchsuit: could not grant Creature Fetish:`, e);
      }
    }
  },

  // Remove Creature Fetish granted by the suit (only if flagged as suit-granted).
  async _removePrimalCF(actor) {
    const liveActor = game.actors.get(actor.id) ?? actor;
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
