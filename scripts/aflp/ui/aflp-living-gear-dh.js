// ===============================
// AFLP Living Gear - DAGGERHEART TABLES
// ===============================
// The machinery is in `aflp-living-gear-core.js`. This file is rows, and every
// row is a claim about a card in `aflr-dh-items`, read on 27 August 2026.
//
// DAGGERHEART IS WHERE LIVING BONDAGE WAS INVENTED. Ardis, 27 Aug 2026: "dh was
// the world where i invented it. dh has mundane bondage and living bondage. pf2e
// has mundane bondage, living bondage, and magical cursed bondage." The old
// combined file carried a header saying the opposite - "PF2e ONLY, deliberately.
// Living bondage is a PF2e line" - and that false sentence is why the thirty-odd
// DH living pieces got no automation at all, and why a Deepthroat its own card
// promises was reported as unfixable rather than as a missing row.
//
// TWO DELIBERATE DIFFERENCES FROM THE PF2e FILE:
//
// 1. NO CURSES TABLE. Ardis: "the cursed items have been built in dh as living
//    items, so there's no need to make them into curses. they work the same as
//    the other living items." A DH piece that keeps a body change says so in its
//    own sentence and gets a `KEEPS` row here. It is a property of the piece,
//    not a second category of magic.
//
// 2. NO TRAPS AND NO STRIP. Those are the PF2e Feminizer Glyph's, and they read
//    `system.equipped.carryType`, which does not exist on Daggerheart. DH's
//    equivalent is in the fiction already: the `living-bondage` card says "The GM
//    can spend a Fear to reveal something in the scene as living bondage and have
//    it attach to a character. There is no roll to avoid it." That is a GM
//    action, and GM adjudication is a legitimate design answer.
//
// WHAT IS DELIBERATELY *NOT* HERE, because something else already does it:
//   - Chaste / Plugged seals            -> `AFLP.chastityGear.ITEMS`, cross-system
//   - the while-worn Denied floor       -> `AFLP.chastityGear.registerDeniedFloor`,
//                                          cross-system and gated on each card
//   - Tits (Lactating) and tits size    -> the `grantsAnatomy` / `titsSizeBonus`
//     from the Milkmaid Harness and        ITEM FLAGS, which `AFLP.anatomy` and
//     the Milking Station                  `AFLP.titsItemBonus` already read on
//                                          every system - verified 27 Aug, both
//                                          items carry the flags in the DH pack.
// Adding rows here for any of those would be a SECOND writer of one rule.

window.AFLP_LivingGear_DH = Object.assign(Object.create(window.AFLP_LivingGearCore), {

  // EVERY ROW QUOTES ITS OWN CARD, and only conditions the card NAMES are here.
  // A card that describes an effect without naming a condition does not get one
  // inferred. The Living Ring Gag says "you cannot speak clearly" and is NOT given
  // Gagged, even though the Sensory Hood two items away says "you are Gagged"
  // outright. Reading the first as the second is the whole failure mode this file
  // exists to stop; those are listed under "REPORTED, NOT BUILT" as card-wording
  // questions, for Ardis to rule on one at a time.
  //
  // THE LEATHER BLINDFOLD USED TO BE ON THAT LIST and no longer is - its card was
  // rewritten on 27 Aug to name the condition, so the row below is the card's
  // word, not an inference. That is the intended route off the list: change the
  // card, then add the row. Never the row alone.
  //
  // ON DAGGERHEART, HAVING THE PIECE IS WEARING IT. Every living item in the DH
  // pack is `type: "loot"` with no equip block, so the core's `_isOn` ->
  // `AFLP.anatomy._active` counts presence - measured 27 Aug across all twelve.
  // That is right for this line rather than a gap: the `living-bondage` card says
  // "You cannot free yourself... Another creature has to wrench it off you", and
  // "Removed, it dies. Once a piece comes off it falls dormant and becomes the
  // ordinary item of the same name." A LIVING piece on a sheet is on the body; the
  // dormant one is a different item. So dropping a Living Pillory into a
  // character's inventory DOES lock them in it, and that is the fiction working.
  //
  // GOES STALE IF: a DH living item is ever given an equip block, at which point
  // presence stops meaning worn and every row here changes meaning at once.
  GRANTS: {
    // "While worn, you are Restrained until another creature cuts you loose."
    "living-rope-bindings":  { conditions: { restrained: 1 } },

    // "While worn, you cannot use your hands and you are Vulnerable."
    // The hands half is fiction the GM adjudicates; there is no hands condition.
    //
    // THE KEY IS `off-guard`, NOT `vulnerable`, AND THAT IS NOT A TYPO.
    // "vulnerable" is Daggerheart's STATUS ID; it is not an AFLR condition key.
    // `DaggerheartAdapter.conditionSlug` maps `off-guard` and `flat-footed` onto
    // the native `vulnerable` status and returns NULL for "vulnerable" itself, so
    // `cond.apply(actor, "vulnerable")` writes an AFLR flag, sets no native
    // status, and hands nobody advantage against the wearer. The adapter already
    // warns about this at the Exposed-grant site; this row was written with the
    // status id anyway on 27 Aug and measured doing nothing.
    //
    // AND THE TEST AGREED WITH IT, which is the worse half: the check read back
    // through `AFLP.cond.has(actor, "vulnerable")` - the same wrong key - so it
    // passed 12/12. A test that reads through the feature's own mistake can only
    // ever confirm it. Assert on `actor.statuses.has("vulnerable")` for this row.
    "living-yoke":           { conditions: { "off-guard": 1 } },

    // "While worn, you cannot close your stance: your Evasion drops by 2 and you
    // are Exposed." The Evasion drop is a stat change, not a condition, and is
    // left to the GM - see the report below.
    "living-spreader-bar":   { conditions: { exposed: 1 } },

    // "A creature locked in it is Exposed and Restrained, cannot use their hands,
    // and faces one direction." Both pillories carry the identical sentence; the
    // Attraction one adds a musk effect on OTHER creatures, which is a trigger on
    // someone else and is not a grant on the wearer.
    "living-pillory":              { conditions: { exposed: 1, restrained: 1 } },
    "living-pillory-of-attraction":{ conditions: { exposed: 1, restrained: 1 } },

    // "While worn you are Blindfolded and Gagged."
    "living-sensory-hood":   { conditions: { blindfolded: 1, gagged: 1 } },

    // "While worn, you are Blindfolded." Added 27 Aug 2026, when the card was
    // rewritten to NAME the condition instead of describing it - it used to say
    // "you cannot see, and you have disadvantage on rolls that rely on sight",
    // which is why it had no row and sat in the card-wording list below.
    //
    // NOTE THAT THIS ROW DOES NOT MENTION VULNERABLE, and must not. Blindfolded
    // grants and HOLDS native Vulnerable through `AFLP.dhHold`, wired to the
    // condition in daggerheart-adapter.js. The condition owns its own contents;
    // a gear row restating them is a second writer that drifts - which is
    // literally how this card and the Blindfolded card came to disagree about
    // whether sight rolls fail or are at disadvantage.
    "living-leather-blindfold": { conditions: { blindfolded: 1 } },

    // "You are Caged." Caged was unregistered on DH until 27 Aug 2026 - the card
    // sat in the Conditions folder and was not in the adapter's AFLR_HUD_CONDS,
    // so this row would have written a flag no HUD could show. Registered now.
    "living-femboy-cage":    { conditions: { caged: 1 } },

    // "While strapped in you are Stuck Submitting and Tits (Lactating), and your
    // tits swell a size larger on top of that." The Lactating and the size come
    // from this item's OWN `grantsAnatomy` / `titsSizeBonus` flags, which already
    // work on every system - only the condition is this file's job.
    //
    // Stuck Submitting's own card says "While Stuck Submitting, you are Restrained
    // and Exposed". Those are the CONDITION's implications, not this piece's, and
    // are deliberately not restated here: a gear table that spells out another
    // condition's contents is a second writer of that rule and will drift from it.
    // Whether anything applies them centrally is a REPORTED question below.
    "living-milking-station":{ conditions: { "stuck-submitting": 1 } },

    // "While worn, you are Exposed in silhouette, and you become Vulnerable
    // whenever you move further than Close range."
    // ONLY THE EXPOSED. The Vulnerable is CONDITIONAL on movement, and this file
    // has no way to know when a token moved far enough - automating it as a flat
    // while-worn Vulnerable would enforce something stricter than the card.
    "living-latex-corset":   { conditions: { exposed: 1 } },

    // "Two pistons seat inside you to hold you in the shell, denying others access
    // to those holes, and you are Plugged."
    //
    // PLUGGED ONLY, AND THAT IS THE CARD'S DOING, not an oversight. PF2e's twin
    // grants Plugged plus Chaste and Caged, because Ardis edited THAT card on 28 Aug
    // to name all three ("You are Plugged, and also Chaste and Caged if you have a
    // pussy or cock respectively"). **The Daggerheart card was not edited with it**
    // and names only Plugged - measured 29 Aug, zero hits for "chaste" or "caged" in
    // its whole description - so the row states what this system's card states.
    //
    // ARDIS, 29 AUG 2026: "yes in pf2e we added to the description about and chaste
    // or caged if you have a pussy or cock respectively, we could add that here too."
    // The DH card gained the same clause the PF2e one carries, so the row carries the
    // same two anatomy branches. **The card was edited FIRST and this row follows
    // it** - the order matters, because a row that grants what no card states is the
    // Throat Sleeve Slave defect, and a card that promises what no row grants is the
    // blindfold one.
    //
    // THE SEAL WAS NEVER MISSING. `AFLP.chastityGear.ITEMS` is cross-system and
    // already carries `living-exoskeleton` with holes ["vaginal","anal"] and a drain
    // of 2, so the holes have been sealed on Daggerheart all along - what was absent
    // is the Plugged CONDITION the card names beside them.
    //
    // GOES STALE IF: the DH card's respectively-clause is reworded. Its PF2e twin
    // carries the identical sentence and the identical three grants, so they are a
    // drift pair - change one and change the other.
    // `conditionsUnless` added 29 Aug 2026 - see the PF2e twin. The suit grants
    // nothing while it is Exoskeleton Dry; the gate lives in the shared core.
    "living-exoskeleton": {
      conditions:        { "plugged": 1 },
      conditionsIfPussy: { "chaste": 1 },
      conditionsIfCock:  { "caged": 1 },
      conditionsUnless:  "exoskeleton-dry",
    },

    // ── HORNY FLOORS ────────────────────────────────────────────────────────
    // Three pieces state the same floor in the same words: "your Horny cannot be
    // cleared below 1". That is a FLOOR, not a marking, so the core's dual-store
    // branch sends it to `AFLP.horny.setSustained`, keyed by the piece.
    //
    // WHY setSustained AND NOT raiseTo: `horny.clearTemp` - what a DH rest calls -
    // settles the total to `permanent`, and `setSustained` maintains `permanent`
    // as the MAX of its named sources. So the floor survives a rest by
    // construction, two pieces do not stack to 2, and removing one withdraws only
    // its own source. Read out of schema.js on 27 Aug rather than assumed from
    // the Denied floor behaving that way.

    // "While worn your ass is Plugged, your Horny cannot be cleared below 1, and
    // you count as collared." Plugged is the seal, owned by chastityGear.ITEMS.
    // The collared half is NOT automated - see COLLARED_NOTE below.
    "living-tail-plug":     { conditions: { horny: 1 } },
    // "While worn, your Horny cannot be cleared below 1, and you have disadvantage
    // on rolls that require fine focus."
    "mimic-suction-clamps": { conditions: { horny: 1 } },
    // "While worn, your Horny cannot be cleared below 1, and each long rest you
    // spend in it marks a Bimbofied token (max 3)." The rest half is a TRIGGER,
    // not a while-worn grant, and is not built - see the report below.
    "mimic-biosuit":        { conditions: { horny: 1 } },
  },

  // ── LANDED ONCE AND KEPT ──────────────────────────────────────────────────
  //
  // The DH analogue of PF2e's CURSES, expressed as a property of a living piece
  // rather than as a separate kind of item. Both rows quote their own card:
  //
  //   living-femboy-cage:      "While worn your cock shrinks to a Micro size and
  //                             your ass gains Cumfinity. BOTH FEATURES REMAIN
  //                             WHEN THE CAGE COMES OFF."
  //   living-chastity-harness: "Your throat becomes a Deepthroat, AND THAT STAYS."
  //
  // "Remains when it comes off" is the whole reason these cannot be GRANTS rows:
  // the core's `_revoke` puts a granted subtype back the way it found it, which is
  // exactly the wrong behaviour for a body change the card says is permanent.
  //
  // APPLIED ONCE PER ACTOR PER KEY and recorded, so re-equipping does not re-apply.
  // For a boolean subtype re-applying is harmless, but the record is what a later
  // "did this piece ever take?" question reads, and it is what keeps this honest
  // if a row ever gains a valued effect.
  //
  // NOT REVOKED, EVER. There is no `_revokeKeeps`, on purpose. If a GM wants to
  // undo one they clear the anatomy flag on the sheet, which is a thing they can
  // already do.
  KEEPS: {
    "living-femboy-cage": {
      label:   "Living Femboy Cage",
      anatomy: ["cock-micro", "ass-cumfinity"],
      // STATED INTENT, and NOT a gap in the card. Ardis, 27 Aug 2026: "the femboy
      // cage's requiresCock is because in order to wear a cage, they need a cock.
      // dh generally needs less explicitly technical language in its card text
      // because its a game ruled by the fiction-first approach - players dont need
      // to be told that a cage requires a cock because the fiction tells them it
      // is so. but pf2e generally requires more technically clinically explicit
      // language like that. the fact that dh doesn't state that the cage
      // requiresCock doesn't make that requirement any less true - so the
      // automation should of course reflect that intended truth."
      //
      // SO: "the card does not say it" is NOT sufficient grounds to drop a
      // requirement on Daggerheart. PF2e's Cock Cage of the Cumdump Femboy spells
      // out "Requirement You have a penis"; DH's card carries the same rule in
      // "A cage of living steel that swallows a cock and seals it away". Same
      // truth, different register. Do not "fix" the DH card to add a Requirement
      // line - that would be PF2e's voice leaking into DH's.
      //
      // Refuses LOUDLY rather than applying half of itself: a GM who disagrees
      // sees a notification and sets the flag by hand, where the alternative
      // writes a Micro cock onto a body with none and nobody ever finds out.
      requiresCock: true,
    },
    "living-chastity-harness": {
      label:   "Living Chastity Harness",
      // The key is `throat-deep`; the DISPLAY name is "Deepthroat", which is not
      // the same string. Getting that wrong writes a flag nothing reads.
      anatomy: ["throat-deep"],
      // No requirement: the harness belts from hips to throat and every body has
      // a throat. The card states none either.
    },
  },

  FLAG_KEPT: "livingGearKeptDH",

  _isKeepItem(item) {
    if (!item) return null;
    for (const key of Object.keys(this.KEEPS)) {
      if (AFLP.itemHasKey?.(item, key)) return key;
    }
    return null;
  },

  async _applyKeeps(actor, key) {
    const def = this.KEEPS[key];
    if (!actor || !def) return;

    const F = AFLP.FLAG_SCOPE;
    const rec = foundry.utils.deepClone(actor.getFlag(F, this.FLAG_KEPT) ?? {});
    if (rec[key]) return;                          // already landed, never twice

    if (def.requiresCock && actor.getFlag(F, "cock") !== true) {
      ui.notifications.warn(`AFLR | ${def.label} found no cock on ${actor.name} to close on. `
        + `Nothing was applied - set the anatomy by hand if this is intended.`);
      return;
    }

    // Record what was there BEFORE, the same way the core's `_grant` does. These
    // are never given back, but "did this actor already have a Micro cock" is a
    // real question and guessing it afterwards is impossible.
    const af = foundry.utils.deepClone(actor.getFlag(F, "anatomyFeatures") ?? {});
    const had = {};
    for (const sub of def.anatomy ?? []) {
      had[sub] = Object.hasOwn(af, sub) ? af[sub] : null;
      af[sub] = true;
    }
    await actor.setFlag(F, "anatomyFeatures", af);

    rec[key] = { had, when: Date.now() };
    await actor.setFlag(F, this.FLAG_KEPT, rec);

    const names = (def.anatomy ?? [])
      .map(k => AFLP.anatomyFeatures?.[k]?.name ?? k)
      .join(" and ");
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> takes hold of `
             + `<strong>${actor.name}</strong>. They gain <strong>${names}</strong>, and that stays `
             + `even after the piece comes off.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // ── REPORTED, NOT BUILT ───────────────────────────────────────────────────
  //
  // Read off the DH cards on 27 Aug and deliberately left alone, each for a
  // stated reason. Listed here rather than in a document so it cannot go stale
  // separately from the code it is about.
  //
  // 1. STUCK SUBMITTING'S IMPLICATIONS. Its card says "While Stuck Submitting,
  //    you are Restrained and Exposed", and this file applies only the condition
  //    itself. If nothing applies those two centrally when the condition lands,
  //    a creature in the Milking Station reads Stuck Submitting while its own
  //    card's Restrained and Exposed never appear. NOT patched from the gear
  //    table on purpose - that would put one condition's contents in another
  //    file, which is how the Exposed/Vulnerable pair went wrong in August.
  //    RESOLVE BY: checking the condition onset path, then fixing it THERE.
  //
  // 2. CARD WORDING, seven pieces. These describe a condition's effect without
  //    naming it, so they get no row - the reading has to be the card's, not
  //    mine. Each is a one-line card fix if Ardis wants the automation:
  //      living-ring-gag           "cannot speak clearly"     -> Gagged?
  //      living-leather-mitts      "cannot hold items"        -> Cuffed?
  //      living-leather-armbinder  "cannot use your hands"    -> Cuffed?
  //      living-manacles           "disadvantage ... hands"   -> Cuffed?
  //      living-leg-cuffs          "move no farther than Close" -> Hobbled?
  //      living-hobble-boots       "move no farther than Very Close" -> Hobbled?
  //      locking-ballet-heels      "move no farther than Close" -> Hobbled?
  //    `hobbled` and `cuffed` are both already registered on DH, so these are
  //    wording decisions, not capability ones.
  //
  // 3. Bimbofied triggers: `living-femboy-cage` "Each climax marks a Bimbofied
  //    token, up to 3", `mimic-biosuit` "each long rest you spend in it marks a
  //    Bimbofied token (max 3)". These are TRIGGERS - a climax hook and a rest
  //    hook - not while-worn grants, and belong wherever DH's climax and rest
  //    already live, not in a gear table.
  //
  // 4. `cursed-codpiece` ("Living Codpiece") grows a cock at the next rest and
  //    then bursts off. A rest trigger plus a self-removal, same category as 3.
  //
  // 5. COLLARED_NOTE: `living-tail-plug` says "you count as collared". There is
  //    no `collared` condition in the DH probe output; the module expresses that
  //    idea through worn collar ITEMS. Left to the GM.
  //
  // 6. Flat stat changes with no condition to carry them: the Spreader Bar's
  //    "your Evasion drops by 2" and the Exoskeleton's "+1 to your Strength".
  //    Left to the GM - preferring state automation to stat automation is the
  //    house rule, and a stat written by gear is a stat that gets stranded.
  //
  // 7. `living-piercings` "you cannot become Hidden" is a PROHIBITION, not a
  //    condition to apply. Nothing to write.
  //
  // 8. Five DH condition cards are still unregistered in the adapter's
  //    AFLR_HUD_CONDS - `defeat`, `cumflation`, `arousal`, `masturbating`,
  //    `afterglow`. The first three look like counters rather than markable
  //    states; the last two need a ruling. Found by the folder-vs-list sweep on
  //    27 Aug, same sweep that found Caged and Stuck Submitting.

  register() {
    if (AFLP.system?.id !== "daggerheart") return;
    // GM only, so a player client cannot double-apply.
    if (!game.user.isGM) return;

    const touch = async (item) => {
      if (!item?.actor) return;
      // Kept body changes land on donning and are never taken back, so they are
      // checked before the worn-grant reconcile and do not participate in it.
      const keep = this._isKeepItem(item);
      if (keep && this._isOn(item)) await this._applyKeeps(item.actor, keep);
      if (!this._isGrantItem(item)) return;
      await this.sync(item.actor);
    };

    Hooks.on("createItem", async (item) => { await touch(item); });
    Hooks.on("deleteItem", async (item) => {
      if (!item?.actor) return;
      if (!this._isGrantItem(item)) return;
      await this.sync(item.actor);
    });
    Hooks.on("updateItem", async (item, changes) => {
      // Daggerheart uses a BOOLEAN `system.equipped` on weapons and armor and has
      // no equip block at all on loot - the core's `_isOn` -> `AFLP.anatomy._active`
      // is what reads all three shapes. Watching the same path still works,
      // because the boolean lives there too.
      if (changes?.system?.equipped === undefined) return;
      await touch(item);
    });

    console.log("AFLP | Living gear (Daggerheart) registered. Worn grants:", Object.keys(this.GRANTS).join(", "),
      "| Kept on removal:", Object.keys(this.KEEPS).join(", "));
  },
});
