// ===============================
// AFLP Living Gear - PATHFINDER 2e TABLES
// ===============================
// The machinery is in `aflp-living-gear-core.js`. This file is nothing but rows,
// and every row is a claim about a card in the PF2e pack.
//
// PF2e HAS THREE LINES OF BONDAGE - mundane, living, and magical cursed - which
// is why this file has two tables where Daggerheart's has one. A GRANT is held
// while worn and given back on removal; a CURSE lands once on donning and is
// KEPT, because its card says so outright: "If you end the curse and remove the
// Cock Cage you retain the Ass (Cumfinity), Cock (Micro), and any kinks and
// Bimbofied levels gained from wearing it." Putting a curse in GRANTS would
// strip everything the moment it came off, against its own card.
//
// DAGGERHEART HAS NO CURSES. Ardis, 27 Aug 2026: "the cursed items have been
// built in dh as living items, so there's no need to make them into curses. they
// work the same as the other living items." A DH piece that keeps a body change
// says so on its own card and carries a `keeps` row in the DH file - it is not
// a second category over there. Nothing in this file describes a DH item, and
// nothing in the DH file describes one of these.
//
// GOES STALE IF: a row here names a key that PF2e's pack does not carry. That is
// what `dev-aflr-audit-chastity-floor.js` and the DH/PF2e split exist to catch -
// a key that resolves in the OTHER system's pack used to look like a working row.

window.AFLP_LivingGear_PF = Object.assign(Object.create(window.AFLP_LivingGearCore), {


  // PF2e creature types, for the Creature Fetish prompt. Copied from the same
  // list `aflp-kinks.js` uses when Mind Break ends, so the two cannot offer
  // different vocabularies for the same stat.
  CREATURE_TYPES: ["aberration","animal","beast","celestial","construct","daemon","dragon",
    "elemental","fey","fiend","fungus","giant","humanoid","monitor","ooze","petitioner",
    "plant","spirit","undead"],

  // CURSES are the opposite of GRANTS and must never share a table with them.
  // A grant is held while worn and given back on removal. A curse lands ONCE and
  // is kept: the Cumdump Femboy card says so outright, "If you end the curse and
  // remove the Cock Cage you retain the Ass (Cumfinity), Cock (Micro), and any
  // kinks and Bimbofied levels gained from wearing it." Putting it in GRANTS
  // would strip everything the moment it came off, against its own card.
  //
  // BOTH cards name every row of their entry as of 11 Aug 2026, so this table can
  // be checked against them line by line. Creature Fetish counts as a kink for
  // that reading: the pack item lives in the Kinks folder with the key
  // `creature-fetish`, so "any kinks gained" covers it and it is kept too.
  //
  // Applied once per actor per key. Re-equipping must not re-apply, or Creature
  // Fetish 3 climbs to 6 and Bimbofied walks up with it.


  // CURSES are the opposite of GRANTS and must never share a table with them.
  // A grant is held while worn and given back on removal. A curse lands ONCE and
  // is kept: the Cumdump Femboy card says so outright, "If you end the curse and
  // remove the Cock Cage you retain the Ass (Cumfinity), Cock (Micro), and any
  // kinks and Bimbofied levels gained from wearing it." Putting it in GRANTS
  // would strip everything the moment it came off, against its own card.
  //
  // BOTH cards name every row of their entry as of 11 Aug 2026, so this table can
  // be checked against them line by line. Creature Fetish counts as a kink for
  // that reading: the pack item lives in the Kinks folder with the key
  // `creature-fetish`, so "any kinks gained" covers it and it is kept too.
  //
  // Applied once per actor per key. Re-equipping must not re-apply, or Creature
  // Fetish 3 climbs to 6 and Bimbofied walks up with it.
  CURSES: {
    "cock-cage-of-the-cumdump-femboy": {
      label:      "Cock Cage of the Cumdump Femboy",
      removalNoun: "cage",
      // "Requirement You have a penis" - the cage locks onto a cock, so with
      // nothing to lock onto the curse does not take. Refuses loudly rather than
      // applying half of itself.
      requiresCock: true,
      anatomy:      ["ass-cumfinity", "cock-micro"],
      conditions:   { "bimbofied": 1 },
      kinksGained:  ["submissive"],
      kinksLost:    ["dominant"],
      creatureFetish: 3,   // prompts for the type on donning
    },

    // The female half of the Feminizer Glyph. Same shape as the cage: the body
    // changes are kept, the restraint is not.
    //
    // "You gain Throat (Deepthroat) and become Bimbofied 1, your body taking on
    // a more curvaceous shape... your tits swell to a heavy size... If you end
    // the curse and remove the harness you keep the Throat (Deepthroat), the
    // Tits (Heavy) and the Bimbofied levels it gave you."
    //
    // The retain sentence names all three, so this table matches the card
    // exactly. It used to name only two of them; the card was corrected on
    // 11 Aug 2026 rather than the code, because the code was already granting
    // three and the femboy cage under-specifies its `cock-micro` the same way.
    //
    // Denied 3 is NOT here - it is a while-worn grant, see GRANTS below.
    "chastity-harness-of-the-throat-sleeve-slave": {
      label:       "Chastity Harness of the Throat Sleeve Slave",
      removalNoun: "harness",
      // No anatomical requirement on the card. The harness belts on and seals
      // whatever is under it, so unlike the cage there is nothing to refuse.
      // Reworked by Ardis on 10 Aug 2026: the harness grants Throat (Deepthroat)
      // where it used to grant Ass (Cumfinity). The key is `throat-deep`; the
      // DISPLAY name is "Deepthroat", which is not the same string.
      anatomy:     ["throat-deep", "tits-heavy"],
      conditions:  { "bimbofied": 1 },
    },
  },


  FLAG_CURSED: "livingGearCursed",

  // aflrKey -> what the piece grants while it is worn.
  //   anatomy:    anatomyFeatures subtype keys set true
  //   conditions: condition slug -> the value to raise to (never lowers)


  // aflrKey -> what the piece grants while it is worn.
  //   anatomy:    anatomyFeatures subtype keys set true
  //   conditions: condition slug -> the value to raise to (never lowers)
  GRANTS: {
    "living-cock-cage": {
      anatomy:    ["ass-cumfinity"],
      conditions: { "bimbofied": 1 },
    },

    // ── THE LIVING EXOSKELETON ──────────────────────────────────────────────
    //
    // Its card, after Ardis's 28 Aug 2026 edit: **"You are Plugged, and also
    // Chaste and Caged if you have a pussy or cock respectively."**
    //
    // Read literally, and the conditional half is the point: the suit plugs
    // everyone, but there is nothing to keep chaste on a body with no pussy and
    // nothing to cage on one with no cock. `conditionsIfCock` / `conditionsIfPussy`
    // exist for this sentence - see `_conditionsFor` in the core.
    //
    // ON PF2e THESE ARE CONDITION *ITEMS*, not flags. Measured here 28 Aug on a
    // scratch rig: `AFLP.cond.apply(a, "chaste")` embeds the `Chaste` effect from
    // the Conditions folder and `cond.has` reads it back. **Daggerheart keeps the
    // same three in a flag bag instead** - Ardis: *"dont assume pf2e is laid out
    // like dh, its a completely different system."* `AFLP.cond` is what hides that
    // difference, which is exactly why this row names conditions and not storage.
    //
    // NOT A `chastityGear.ITEMS` CONCERN: that row already carries this suit's
    // `holes` and `drain` (the seal and the daily lubricant cost). These are the
    // CONDITIONS the same sentence names, and they get ownership and give-back
    // from the living-gear engine, which the seal does not need.
    //
    // GOES STALE IF: the card's respectively-clause is reworded, or PF2e gains
    // native Chaste/Caged/Plugged conditions - `_pf2eKnowsCondition` reports all
    // three FALSE today, so AFLR's own cards are the only source.
    //
    // REPORTED, NOT BUILT - the card also says the pistons "stay seated while the
    // suit is still greased" and that "when it needs lubricating they withdraw,
    // leaving you open and still bound". So the SEAL is conditional on total
    // Cumflation and cum coat reaching 8, while `chastityGear.ITEMS` seals its
    // holes unconditionally. That gap predates this edit and making the seal
    // dynamic is a design call, not a row.
    // `conditionsUnless` added 29 Aug 2026: the suit grants NOTHING while it is
    // Exoskeleton Dry, because its own card says the pistons withdraw and leave you
    // open. The gate is in the shared core, so both systems' rows read the same way.
    "living-exoskeleton": {
      conditions:        { "plugged": 1 },
      conditionsIfPussy: { "chaste": 1 },
      conditionsIfCock:  { "caged": 1 },
      conditionsUnless:  "exoskeleton-dry",
    },

    // ── THE CHASTITY DENIED FLOOR IS NOT HERE ANY MORE ──────────────────────
    //
    // This table used to carry six `conditions: { denied: N }` rows. They were
    // REMOVED on 28 Aug 2026, and the suite is what forced it.
    //
    // `AFLP.chastityGear` became the owner of that floor on 27 Aug: cross-system,
    // and CARD-GATED, so a row is only applied when the item's own card states
    // that number. These rows were left in place as a deliberate deferral -
    // "harmless, both write the same source id and `permanent` is the MAX of its
    // sources, so it is idempotent". That reasoning was true about the VALUE and
    // missed the point entirely.
    //
    // WHAT THE TEST FOUND, in `pf2e-dev`: the card-gate test sabotages the table
    // with a number no card states, confirms the gate drops the row, then wears
    // the piece and asserts nothing is granted. **The wearer got Denied 3 anyway** -
    // because living gear granted it from HERE, with no gate at all.
    //
    // So the gate's guarantee was void on Pathfinder while these rows existed. Two
    // writers of one rule, and only one of them asked the card. That is exactly
    // what Ardis warned about: *"the moment that our code breaks the intended
    // function of the card's mechanic in the name of efficiency, is the moment
    // where it loses its usefulness completely."*
    //
    // DAGGERHEART NEVER HAD THEM - `aflp-living-gear-dh.js` has no denied rows -
    // which is why the same test passed there and failed here. **A duplicate
    // writer is invisible until something tries to REFUSE.**
    //
    // GOES STALE IF: `chastityGear.registerDeniedFloor` stops running on PF2e.
    // Then these six pieces silently grant nothing, rather than granting twice.
    "chastity-harness-of-the-throat-sleeve-slave": {
      // The Denied row is gone with the rest; what remains is the built-in gear,
      // which is this piece's alone and nothing else writes.
      //
      // "The harness comes with a built-in Slave Collar, Slave Buttplug and
      // Piercings of Vibration that cannot be removed while the harness is
      // worn." Built INTO the harness, so they arrive with it and leave with it,
      // and they are not part of the curse the wearer keeps.
      //
      // Keys, not names. `Piercings of Vibration` shares the slug `piercings`
      // with the plain `Piercings` item, so a slug lookup would have been a coin
      // flip between them; it was given its own aflrKey on 10 Aug for this.
      // Swapped 10 Aug 2026 for the synchronous set, which carry the
      // arousalBonus item flags AFLP.gearArousalBonus reads. The plain
      // collar / buttplug / piercings they replace are unchanged and still
      // exist as ordinary gear. The pussy vibe egg joined the set 11 Aug.
      //
      // The rule for all four is stated ONCE, on the Oral Slave Collar: an oral
      // act marks the wearer 1 plus 1 per vibrating piece worn, and the creature
      // working the throat 1. Every piece is hole-gated to `oral`, so the count
      // is just the sum of the item flags - there is no list in code to fall out
      // of step with what the harness actually fits.
      companions: ["oral-slave-collar", "buttplug-of-synchronous-vibrations", "piercings-of-synchronous-vibrations", "pussy-vibe-egg-of-synchronous-vibrations"],
    },
  },

  // Ownership flags. We restore EXACTLY what was there before and never take
  // away something we did not give - the `exposedVulnerable` lesson: AFLR only
  // removes the Vulnerable it granted, so a Vulnerable from another source
  // survives. Same rule here for a Bimbofied or a subtype the actor already had.


  // ---------------------------------------------------------------- traps ---
  //
  // A trap does not apply anything itself. It finds the right piece and PUTS IT
  // ON, which fires the ordinary createItem hook and runs the same curse and
  // grant paths a hand-equipped item runs. That is deliberate: the trap gets the
  // once-only guard, the ownership tracking, the creature-type prompt and the
  // no-cock refusal for free, and there is no second copy of the apply logic to
  // drift out of step.
  TRAPS: {
    "feminizer-glyph": {
      label:  "Feminizer Glyph Trap",
      // Branch on what the body HAS, not on a gender label - the module has no
      // such field and would not want one. A cock takes the cage, because the
      // cage locks onto a cock and refuses a body without one; anything else
      // with a pussy takes the harness, which belts on and needs nothing.
      //
      // A body with BOTH takes the cage. The cage is the pickier of the two, so
      // giving it the body it needs and letting the harness serve everyone else
      // is the only order that never leaves a victim with nothing.
      cock:   "cock-cage-of-the-cumdump-femboy",
      pussy:  "chastity-harness-of-the-throat-sleeve-slave",
      // The treat. Worn, not cursed - it comes off.
      extra:  "bondage-bikini-armor",
    },
  },

  // Measured 10 Aug 2026: the pack scan below costs ~430ms PER KEY, and fitting
  // the Chastity Harness does four of them back to back. That is slow enough to
  // matter on its own, and it widened the window between a hook firing and the
  // grant finishing far enough for a create-then-delete to interleave - which is
  // how the harness test first failed.
  //
  // The content index answers the same question in ~0ms and was already built.
  // contentUuid is NOT trusted blindly: it falls through to the canonical PF2e
  // uuid when the system-local index has no entry, so in the wrong world it hands
  // back a truthy string pointing into an unloaded pack. Resolve it, and confirm
  // the document that comes back really carries the key.


  async _stripWorn(actor) {
    const off = [];
    const updates = [];
    for (const it of (actor?.items ?? [])) {
      const eq = it.system?.equipped;
      if (!eq || eq.carryType !== "worn") continue;
      const slug = String(it.system?.slug ?? "");
      const isArmor = it.type === "armor";
      const isClothing = it.type === "equipment" && slug.startsWith("clothing");
      if (!isArmor && !isClothing) continue;
      if (this._isOurs(it)) continue;
      updates.push({ _id: it.id, "system.equipped.carryType": "stowed", "system.equipped.inSlot": false });
      off.push(it.name);
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    return off;
  },


  async spring(actor, trapKey = "feminizer-glyph") {
    const def = this.TRAPS[trapKey];
    if (!actor || !def) return null;
    if (!game.user.isGM) { ui.notifications.warn("AFLR | only the GM can spring a trap."); return null; }

    const F = AFLP.FLAG_SCOPE;
    // A body with both takes BOTH pieces. They cover different things - the cage
    // caps a cock, the harness belts over everything below the waist - so there
    // is no reason a futa should get one and be spared the other.
    const keys = [];
    if (actor.getFlag(F, "cock")  === true) keys.push(def.cock);
    if (actor.getFlag(F, "pussy") === true) keys.push(def.pussy);

    if (!keys.length) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> flares under <strong>${actor.name}</strong> and gutters out. It finds nothing on them to take hold of.</p></div>`,
        speaker: { alias: "AFLP" },
      });
      return { actor: actor.name, fitted: [], extra: null };
    }

    // Strip FIRST. The gear has to land on a bare body, and doing it after would
    // leave a window where the victim is wearing two sets of armour.
    const stripped = await this._stripWorn(actor);

    const fitted = [];
    for (const k of keys) {
      const made = await this._fit(actor, k);
      if (made) fitted.push(made.name);
    }
    const extra = def.extra ? await this._fit(actor, def.extra) : null;

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> flares under <strong>${actor.name}</strong>. `
             + `<strong>${fitted.join("</strong> and <strong>")}</strong> close${fitted.length > 1 ? "" : "s"} on them`
             + `${extra ? `, and <strong>${extra.name}</strong> straps itself on over the top` : ""}.</p>`
             + (stripped.length
                 ? `<p>Stripped and stowed: <strong>${stripped.join("</strong>, <strong>")}</strong>. The gear is in their pack, not destroyed.</p>`
                 : "")
             + `</div>`,
      speaker: { alias: "AFLP" },
    });
    return { actor: actor.name, fitted, extra: extra?.name ?? null, stripped };
  },


  _isCurseItem(item) {
    if (!item) return null;
    for (const key of Object.keys(this.CURSES)) {
      if (AFLP.itemHasKey?.(item, key)) return key;
    }
    return null;
  },


  async _promptCreatureType(def) {
    const opts = this.CREATURE_TYPES
      .map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("");
    try {
      return await foundry.applications.api.DialogV2.wait({
        window: { title: def.label },
        content: `<p>The curse fixes on a creature type. Choose the one their ass now aches for.</p>`
               + `<p><select name="ctype" style="width:100%">${opts}</select></p>`,
        buttons: [
          { action: "ok", label: "Set the fetish", default: true,
            callback: (_e, btn) => btn.form.elements.ctype.value },
          { action: "skip", label: "Leave it to me", callback: () => null },
        ],
      });
    } catch (e) { return null; }   // dismissed
  },


  async _applyCurse(actor, key) {
    const def = this.CURSES[key];
    if (!actor || !def) return;
    const done = actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG_CURSED) ?? {};
    if (done[key]) return;                       // once per actor, never again

    if (def.requiresCock && actor.getFlag(AFLP.FLAG_SCOPE, "cock") !== true) {
      ui.notifications.warn(`${actor.name} has no cock for the ${def.label} to lock onto - the curse does not take.`);
      return;
    }

    const ctype = def.creatureFetish ? await this._promptCreatureType(def) : null;

    if (def.anatomy?.length) {
      const af = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
      for (const sub of def.anatomy) af[sub] = true;
      await actor.setFlag(AFLP.FLAG_SCOPE, "anatomyFeatures", af);
    }

    for (const [slug, value] of Object.entries(def.conditions ?? {})) {
      if ((Number(AFLP.cond?.value?.(actor, slug)) || 0) < value) await AFLP.cond.raiseTo(actor, slug, value);
    }

    // Kinks live in flags.world.sexual. Mirrors what aflp-kinks.js writes when
    // Mind Break ends: the kink flag, plus the creature type appended to the
    // comma-separated kinkNotes rather than overwriting what is there.
    const sexual = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
    sexual.kinks ??= {};
    sexual.kinkNotes ??= {};
    for (const k of def.kinksGained ?? []) sexual.kinks[k] = true;
    if (def.creatureFetish && ctype) {
      sexual.kinks["creature-fetish"] = true;
      const have = String(sexual.kinkNotes["creature-fetish"] ?? "").split(",").map(t => t.trim()).filter(Boolean);
      if (!have.includes(ctype)) have.push(ctype);
      sexual.kinkNotes["creature-fetish"] = have.join(", ");
    }
    await actor.setFlag(AFLP.FLAG_SCOPE, "sexual", sexual);

    // setFlag MERGES, so a kink cannot be dropped by deleting it from a clone -
    // it comes straight back. Losing the Dominant kink needs the delete form.
    for (const k of def.kinksLost ?? []) {
      if (sexual.kinks?.[k] === undefined) continue;
      await actor.update({ [`flags.${AFLP.FLAG_SCOPE}.sexual.kinks.-=${k}`]: null });
    }

    if (def.creatureFetish && ctype) {
      await AFLP.cond.raiseTo(actor, "creature-fetish", AFLP.capCondition("creature-fetish", def.creatureFetish));
    }

    await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG_CURSED, { ...done, [key]: true });

    const bits = [];
    if (def.anatomy?.length) bits.push(def.anatomy.map(a => AFLP.anatomyFeatures?.[a]?.name ?? a).join(" and "));
    for (const [slug, v] of Object.entries(def.conditions ?? {})) bits.push(`${slug} ${v}`);
    if (def.creatureFetish && ctype) bits.push(`Creature Fetish ${def.creatureFetish} (${ctype})`);
    await ChatMessage.create({
      // ONE LINE SERVES EVERY CURSE, so it must not name a piece. It said "when
      // the cage comes off" and CURSES holds a cage AND a harness - so the
      // Chastity Harness of the Throat Sleeve Slave announced itself as a cage.
      // The Feminizer Glyph Trap reaches this same line, because it resolves
      // into whichever of the two the body can take.
      // STALE WHEN: a curse is added whose removal noun is neither of these -
      // give it its own `removalNoun` rather than widening the fallback.
      content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> closes on <strong>${actor.name}</strong> and does not open again. They gain ${bits.join(", ")}`
             + `${def.kinksLost?.length ? `, and lose the ${def.kinksLost.join(", ")} kink` : ""}. This does not end when the ${def.removalNoun ?? "gear"} comes off.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  register() {
    // PF2e's OWN tables, gated to PF2e. This is no longer "living bondage is a
    // PF2e line" - it is not, Daggerheart invented it and has its own file - it
    // is "these particular rows describe cards in the PF2e pack".
    if (AFLP.system?.id !== "pf2e" && AFLP.system?.id !== "sf2e") return;
    // GM only, so a player client cannot double-apply.
    if (!game.user.isGM) return;

    const touch = async (item) => {
      if (!item?.actor) return;
      // A curse lands on donning and is never taken back, so it is checked
      // before the worn-grant reconcile and does not participate in it.
      const curse = this._isCurseItem(item);
      if (curse && this._isOn(item)) await this._applyCurse(item.actor, curse);
      if (!this._isGrantItem(item)) return;
      await this.sync(item.actor);
    };

    // updateItem alone is not enough: the piece can arrive already worn, and it
    // can be deleted outright rather than unequipped first.
    Hooks.on("createItem", async (item) => { await touch(item); });
    Hooks.on("deleteItem", async (item) => {
      if (!item?.actor) return;
      if (!this._isGrantItem(item)) return;
      await this.sync(item.actor);
    });
    Hooks.on("updateItem", async (item, changes) => {
      // Any equip-shape change at all. PF2e moves carryType inside an object,
      // so watching `changes.system.equipped` covers worn, held and stowed.
      if (changes?.system?.equipped === undefined) return;
      await touch(item);
    });

    console.log("AFLP | Living gear (PF2e) registered. Worn grants:", Object.keys(this.GRANTS).join(", "),
      "| Curses:", Object.keys(this.CURSES).join(", "));
  },
});
