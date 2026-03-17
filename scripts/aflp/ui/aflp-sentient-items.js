// ===============================
// AFLP Sentient Items — Armor of Hands
// ===============================
// Manages the Disposition system for the Armor of Hands and its variants.
//
// Disposition (1-5) is stored per-actor as world flag "armorOfHandsDisposition".
// All mutation hooks fire only on the GM client to avoid double-processing.
//
// Disposition 1 — Bonded:      +1 attack, Aid once/round, Hardness 4 vs first hit
// Disposition 2 — Cooperative: Default. 1d6 per turn, 5-6 = +1 Arousal
// Disposition 3 — Mischievous: SA (+1 Arousal) per turn, -1 Perception
// Disposition 4 — Dominant:    SA (+2 Arousal) per turn, Exposed 1, -1 attack
// Disposition 5 — In Control:  Grabbed, Exposed 2, SA (+2 Arousal), GM controls

window.AFLP_SentientItems = {

  UUID_ARMOR:    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.017D4bJ2SxYJbzJc",
  UUID_GUARDING: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.Olh6A7c9bj4QbrbN",
  UUID_GROPING:  "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.eAPSO3IxoD8HU0dA",
  UUID_GRABBED:  "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2",
  UUID_EXPOSED:  "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ocRgNSfLD65sWBhs",

  FLAG:      "armorOfHandsDisposition",
  FLAG_WORN: "armorOfHandsWorn",
  SLUGS: new Set(["armor-of-hands", "armor-of-guarding-hands", "armor-of-groping-hands"]),

  // -----------------------------------------------
  getEquipped(actor) {
    const item = actor.items?.find(i =>
      this._isArmorItem(i) && i.system?.equipped?.carryType === "worn"
    );
    if (!item) return null;
    return { item, variant: this._variant(item) };
  },

  _isArmorItem(item) {
    const slug = item.slug ?? item.system?.slug ?? "";
    const src  = item.flags?.core?.sourceId ?? item.sourceId ?? "";
    return this.SLUGS.has(slug) || src === this.UUID_ARMOR || src === this.UUID_GUARDING || src === this.UUID_GROPING;
  },

  _variant(item) {
    const slug = item.slug ?? item.system?.slug ?? "";
    const src  = item.flags?.core?.sourceId ?? item.sourceId ?? "";
    if (slug === "armor-of-guarding-hands" || src === this.UUID_GUARDING) return "guarding";
    if (slug === "armor-of-groping-hands"  || src === this.UUID_GROPING)  return "groping";
    return "standard";
  },

  getDisposition(actor) {
    return actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG) ?? 2;
  },

  async setDisposition(actor, value, source = "") {
    const equipped = this.getEquipped(actor);
    const variant  = equipped?.variant ?? "standard";
    let clamped    = Math.max(1, Math.min(5, value));
    if (variant === "guarding") clamped = Math.min(3, clamped);
    if (variant === "groping")  clamped = Math.max(3, clamped);

    const prev = this.getDisposition(actor);
    if (clamped === prev) return;

    await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, clamped);
    await this._announceDispositionChange(actor, prev, clamped, source);
    await this._applyDispositionEffects(actor, prev, clamped);
    console.log(`AFLP | Armor of Hands: ${actor.name} Disposition ${prev} → ${clamped} (${source})`);
  },

  async shiftDisposition(actor, delta, source = "") {
    const equipped = this.getEquipped(actor);
    if (!equipped) return;

    let effective = delta;
    if (delta > 0 && AFLP.actorHasKink(actor, "bondage-princess")) effective = delta * 2;
    if (delta < 0 && AFLP.actorHasKink(actor, "dominant"))         effective = delta * 2;
    if (equipped.variant === "guarding" && delta > 0) effective = Math.floor(effective / 2);

    await this.setDisposition(actor, this.getDisposition(actor) + effective, source);
  },

  // -----------------------------------------------
  register() {
    if (!game.user.isGM) return;

    // Equip / unequip + RollOption toggle sync
    Hooks.on("updateItem", async (item, changes, _diff, userId) => {
      if (userId !== game.user.id || !item.actor || !this._isArmorItem(item)) return;
      if (changes?.system?.equipped?.carryType === "worn")        { await this._onEquip(item.actor, item); return; }
      if (changes?.system?.equipped?.carryType !== undefined)     { await this._onUnequip(item.actor, item); return; }

      // If a RollOption rule changed (GM manually toggled), infer and sync disposition flag.
      const updatedRules = changes?.system?.rules;
      if (!updatedRules) return;
      const opts = {};
      for (const r of updatedRules) {
        if (r.key === "RollOption" && r.option?.startsWith("armor-of-hands-")) opts[r.option] = r.value;
      }
      if (!Object.keys(opts).length) return;

      // Merge with the current rules to get the full picture
      const allRules = item.system?.rules ?? [];
      const merged   = {};
      for (const r of allRules) {
        if (r.key === "RollOption" && r.option?.startsWith("armor-of-hands-")) merged[r.option] = r.value;
      }
      Object.assign(merged, opts); // overlay the changes

      // Infer disposition from toggles
      let inferred = 2; // default: Cooperative
      if (merged["armor-of-hands-disposition-5"])     inferred = 5;
      else if (merged["armor-of-hands-disposition-4plus"]) inferred = 4;
      else if (merged["armor-of-hands-disposition-3plus"]) inferred = 3;
      else if (merged["armor-of-hands-bonded"])            inferred = 1;

      const actor   = game.actors.get(item.actor.id) ?? item.actor;
      const current = this.getDisposition(actor);
      if (inferred === current) return;

      // Write flag silently (no announce, no condition changes — GM is doing this manually)
      await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG, inferred);
      // Still apply condition effects to match the new disposition
      await this._applyDispositionEffects(actor, current, inferred);
      console.log(`AFLP | AoH: RollOption toggle synced disposition ${current} → ${inferred} for ${actor.name}`);
    });

    // Per-turn effects
    Hooks.on("combatTurnChange", async (combat, _prior, current) => {
      const combatant = combat.combatants.get(current.combatantId);
      if (!combatant?.actor) return;
      const actor = game.actors.get(combatant.actor.id) ?? combatant.actor;
      const equipped = this.getEquipped(actor);
      if (!equipped) return;
      const disp = this.getDisposition(actor);
      await this._onTurnStart(actor, disp, combatant.tokenId ?? null);
      await actor.setFlag(AFLP.FLAG_SCOPE, "armorOfHandsStruckThisTurn", false);
    });

    // Critical hit detection for Disposition shifts
    Hooks.on("createChatMessage", async (msg) => {
      if (!game.user.isGM) return;
      const outcome  = msg.flags?.pf2e?.context?.outcome;
      const actorId  = msg.flags?.pf2e?.context?.actor;
      const targetId = msg.flags?.pf2e?.context?.target?.actor;

      // Attacker crits: Disposition down for attacker
      if (outcome === "criticalSuccess" && actorId) {
        const actor = game.actors.get(actorId);
        if (actor && this.getEquipped(actor)) {
          await actor.setFlag(AFLP.FLAG_SCOPE, "armorOfHandsStruckThisTurn", true);
          await this.shiftDisposition(actor, -1, "Critical hit landed");
        }
      }
      // Defender critted: Disposition up for defender
      if (outcome === "criticalSuccess" && targetId) {
        const target = game.actors.get(targetId);
        if (target && this.getEquipped(target)) {
          await this.shiftDisposition(target, +1, "Received critical hit");
        }
      }
    });

    // Will save outcomes
    Hooks.on("createChatMessage", async (msg) => {
      if (!game.user.isGM) return;
      const ctx = msg.flags?.pf2e?.context;
      if (!ctx || ctx.type !== "saving-throw" || ctx.statistic !== "will") return;
      const actor = game.actors.get(ctx.actor);
      if (!actor || !this.getEquipped(actor)) return;
      if (ctx.outcome === "success" || ctx.outcome === "criticalSuccess") {
        await this.shiftDisposition(actor, -1, "Will save success");
      } else if (ctx.outcome === "failure" || ctx.outcome === "criticalFailure") {
        await this.shiftDisposition(actor, +1, "Will save failure");
      }
    });

    // Cum and Edge are handled by onActorCum() and onActorEdge(),
    // called directly from aflp-arousal.js and aflp-kinks.js.

    // Rest without armor
    Hooks.on("pf2e.restForTheNight", async (actor) => {
      if (!game.user.isGM) return;
      if (!this.getEquipped(actor)) {
        const disp = this.getDisposition(actor);
        if (disp > 1) await this.shiftDisposition(actor, -1, "Rest without armor");
      }
    });
  },

  // -----------------------------------------------
  async _onEquip(actor, item) {
    const variant  = this._variant(item);
    const FLAG     = AFLP.FLAG_SCOPE;
    const existing = actor.getFlag(FLAG, this.FLAG);
    if (existing == null) {
      await actor.setFlag(FLAG, this.FLAG, variant === "groping" ? 3 : 2);
    }
    await actor.setFlag(FLAG, this.FLAG_WORN, variant);
    const disp    = this.getDisposition(actor);
    const flavour = {
      standard: "The living armor flows over them like dark water. Dozens of hands find their places. One gives an experimental squeeze.",
      guarding: "The armor settles carefully, hands positioning to deflect and guide. It seems almost shy.",
      groping:  "The armor seizes them immediately with enthusiastic possessiveness. It already feels like it owns them.",
    }[variant];
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong> dons the ${item.name}. ${flavour}</p>
        <p><em>Disposition: ${this._dispositionLabel(disp)}</em></p>
      </div>`,
      speaker: { alias: "AFLP" },
    });
    await this._applyDispositionEffects(actor, null, disp);
  },

  async _onUnequip(actor, item) {
    const disp = this.getDisposition(actor);
    await this._clearConditions(actor, 0);
    await actor.unsetFlag(AFLP.FLAG_SCOPE, this.FLAG_WORN);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p>The ${item.name} is removed from <strong>${actor.name}</strong>. The hands reluctantly release.${disp >= 4 ? " It takes considerable effort." : ""}</p>
      </div>`,
      speaker: { alias: "AFLP" },
    });
  },

  async _onTurnStart(actor, disp, tokenId) {
    const FLAG     = AFLP.FLAG_SCOPE;
    const hasCock  = !!actor.getFlag(FLAG, "cock");
    const hasPussy = !!actor.getFlag(FLAG, "pussy");

    if (disp === 2) {
      const roll = Math.ceil(Math.random() * 6);
      if (roll >= 5) {
        await AFLP.ensureCoreFlags(actor);
        const gain = await AFLP_Arousal.increment(actor, 1, "Armor of Hands (grope)", tokenId);
        const total = gain?.applied ?? 1;
        const bonus = gain ? (gain.submittingBonus ?? 0) + (gain.hornyBonus ?? 0) : 0;
        const detail = bonus > 0 ? ` (+${total} with bonuses)` : "";
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p>The Armor of Hands wanders across <strong>${actor.name}</strong> uninvited. +${total} Arousal${detail}.</p></div>`,
          speaker: { alias: "AFLP" },
        });
      }
    }

    if (disp >= 3) {
      const base = disp >= 4 ? 2 : 2; // always 2 base from D3+ (SA)
      await AFLP.ensureCoreFlags(actor);
      const gain = await AFLP_Arousal.increment(actor, base, "Armor of Hands (SA)", tokenId);
      const total = gain?.applied ?? base;
      const parts = [`${base} base`];
      if (gain?.submittingBonus > 0) parts.push(`+${gain.submittingBonus} Submitting`);
      if (gain?.hornyBonus      > 0) parts.push(`+${gain.hornyBonus} Horny`);
      const detail = parts.length > 1 ? ` (${parts.join(", ")})` : "";
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p>${this._saProseForGenitalia(actor.name, hasCock, hasPussy, disp)} <em>+${total} Arousal${detail}.</em></p></div>`,
        speaker: { alias: "AFLP" },
      });
    }

    if (disp === 5) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><em>The Armor of Hands is in full control of <strong>${actor.name}</strong>. The GM directs their actions this turn. A DC 20 Will save lets the wearer assert one free action.</em></p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },

  // ── Public hooks called from aflp-arousal.js and aflp-kinks.js ──────

  async onActorCum(actor) {
    const suit = this.getEquipped(actor);
    if (!suit) return;
    const hasBP = AFLP.actorHasKink(actor, "bondage-princess");
    await this.shiftDisposition(actor, hasBP ? 2 : 1, "Wearer cummed");
  },

  async onActorEdge(actor) {
    const suit = this.getEquipped(actor);
    if (!suit) return;
    const hasDom = AFLP.actorHasKink(actor, "dominant");
    await this.shiftDisposition(actor, hasDom ? -2 : -1, "Wearer Edged");
  },

  async _applyDispositionEffects(actor, fromDisp, toDisp) {
    const live = game.actors.get(actor.id) ?? actor;

    // ── Update RollOption toggles on the equipped item ─────────────────
    const equipped = this.getEquipped(live);
    if (equipped?.item) {
      const rules = foundry.utils.deepClone(equipped.item.system?.rules ?? []);
      for (const r of rules) {
        if (r.key !== "RollOption") continue;
        switch (r.option) {
          case "armor-of-hands-bonded":            r.value = toDisp === 1; break;
          case "armor-of-hands-disposition-3plus": r.value = toDisp >= 3; break;
          case "armor-of-hands-disposition-4plus": r.value = toDisp >= 4; break;
          case "armor-of-hands-disposition-5":     r.value = toDisp >= 5; break;
        }
      }
      await equipped.item.update({ "system.rules": rules });
    }

    // ── Conditions ────────────────────────────────────────────────────
    await this._clearConditions(live, toDisp);
    if (toDisp >= 4) await this._ensureExposed(live, toDisp >= 5 ? 2 : 1);
    if (toDisp >= 5) await this._ensureGrabbed(live);
  },

  async _clearConditions(actor, currentDisp) {
    const live = game.actors.get(actor.id) ?? actor;
    if (currentDisp < 5) {
      const grabbed = live.items?.find(i =>
        ((i.flags?.core?.sourceId ?? i.sourceId ?? "") === this.UUID_GRABBED || i.slug === "grabbed")
        && i.flags?.aflp?.grantedByArmor
      );
      if (grabbed) await grabbed.delete().catch(() => {});
    }
    if (currentDisp < 4) {
      const exposed = live.items?.find(i =>
        ((i.flags?.core?.sourceId ?? i.sourceId ?? "") === this.UUID_EXPOSED || i.slug === "exposed")
        && i.flags?.aflp?.grantedByArmor
      );
      if (exposed) await exposed.delete().catch(() => {});
    }
  },

  async _ensureExposed(actor, level = 1) {
    const existing = actor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId ?? "") === this.UUID_EXPOSED || i.slug === "exposed"
    );
    if (existing) {
      if ((existing.system?.badge?.value ?? 0) < level) await existing.update({ "system.badge.value": level });
    } else {
      try {
        const doc  = await fromUuid(this.UUID_EXPOSED);
        const data = doc.toObject();
        data.system.badge.value = level;
        foundry.utils.setProperty(data, "flags.aflp.grantedByArmor", true);
        await actor.createEmbeddedDocuments("Item", [data]);
      } catch (e) { console.warn("AFLP | AoH: could not apply Exposed:", e); }
    }
  },

  async _ensureGrabbed(actor) {
    const existing = actor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId ?? "") === this.UUID_GRABBED || i.slug === "grabbed"
    );
    if (!existing) {
      try {
        const doc  = await fromUuid(this.UUID_GRABBED);
        const data = doc.toObject();
        foundry.utils.setProperty(data, "flags.aflp.grantedByArmor", true);
        await actor.createEmbeddedDocuments("Item", [data]);
      } catch (e) { console.warn("AFLP | AoH: could not apply Grabbed:", e); }
    }
  },

  async _announceDispositionChange(actor, from, to, source) {
    const labels = ["", "Bonded", "Cooperative", "Mischievous", "Dominant", "In Control"];
    const dir    = to > from ? "The armor tightens its grip." : "The armor yields a little.";
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p>${to > from ? "🖤" : "✨"} <strong>${actor.name}</strong>'s Armor of Hands shifts to <strong>${labels[to]}</strong> (was ${labels[from]}). ${dir}</p>
        <p><em>${source}</em></p>
      </div>`,
      speaker: { alias: "AFLP" },
    });
  },

  _dispositionLabel(d) {
    return ["", "Bonded", "Cooperative", "Mischievous", "Dominant", "In Control"][d] ?? String(d);
  },

  _saProseForGenitalia(name, hasCock, hasPussy, disp) {
    if (disp >= 5) {
      if (hasPussy && hasCock) return `The armor works <strong>${name}</strong> with remorseless precision, hands everywhere at once.`;
      if (hasPussy) return `The armor's hands have found their mark completely. <strong>${name}</strong> has lost all say in the matter.`;
      if (hasCock)  return `The armor wraps a hand around <strong>${name}</strong> with total authority, not asking and not stopping.`;
    }
    if (disp >= 4) {
      if (hasPussy && hasCock) return `The armor takes what it wants from <strong>${name}</strong>, working both with practiced ease.`;
      if (hasPussy) return `The armor's hands slide where they want. <strong>${name}</strong> cannot stop it.`;
      if (hasCock)  return `The armor curls possessively around <strong>${name}</strong>, demanding their attention.`;
    }
    if (hasPussy && hasCock) return `The Armor of Hands wanders intrusively across <strong>${name}</strong>, fondling as it sees fit.`;
    if (hasPussy) return `The armor's hands roam across <strong>${name}</strong> with cheerful disregard.`;
    if (hasCock)  return `The armor gives <strong>${name}</strong> an entirely unwelcome squeeze.`;
    return `The Armor of Hands gropes <strong>${name}</strong> distractingly.`;
  },
};
