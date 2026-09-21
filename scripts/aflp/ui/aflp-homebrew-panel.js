// ===============================
// AFLR - Homebrew item panel
// ===============================
// 1 Sept 2026: an injected menu for adding AFLR effects to homebrew items that
// exist in a user's world data, so a GM can make an item that behaves like a
// Chastity Cage without duplicating the Chastity Cage item.
//
// WHY THERE WAS NOTHING TO COPY. The Denied 1 on the Cock Cage is not an
// ActiveEffect and not on the item - it is two rows in a code table plus a card
// check. A GM cannot add a row to a code table, so homebrew was shut out by
// construction. `chastityGear._homebrewRow` (12 Sept 2026) is the engine half:
// a per-ITEM row shaped exactly like an `ITEMS` row, read by `worn()`, so every
// downstream reader works unchanged. This file is the GM's way to write one.
//
// WHAT THIS PANEL CAN AND CANNOT DO, and the line is not arbitrary - it is
// "which engine already reads this per item":
//
//   CAN, all already read off worn items by existing engines:
//     holes / drain / coatWipe / denied   chastityGear.worn -> sealed,
//                                         sealedHoles, drainAtRest, the Denied
//                                         floor, the purge macro
//     loadsBonus, cumShotBonus            AFLP.effectiveLoads, AFLP.cumPerShot
//     arousalBonus(+Partner,+Hole)        AFLP.gearArousalBonus
//
//     conditions from an attached piece   AFLP_LivingGear's table, through the
//                                         per-item `homebrewGrant` row that
//                                         `_homebrewGrant` reads (15 Sept 2026).
//                                         Includes the anatomy-conditional
//                                         variants and the `conditionsUnless`
//                                         gate. NOT typed by hand - a GM gets
//                                         them by attaching an AFLR piece.
//
//   CANNOT, deliberately:
//     companions                          a piece whose row FITS other AFLR items
//                                         onto the wearer (the Throat Sleeve Slave
//                                         harness brings four). A copy would spawn
//                                         AFLR gear this item is not.
//     anatomy grants                      permanent body changes that outlive the
//                                         item (PF2e's Living Cock Cage grants
//                                         ass-cumfinity).
//
// Both are the piece's IDENTITY rather than its rules - the same line this panel
// already draws by never lending the `aflrKey` - and the attached line NAMES what
// it did not copy rather than leaving a GM waiting for it.
//
// EVERY FIELD IS CROSS-SYSTEM, which is why this file is not gated on a system
// id - all four engines above are shared. It gates on GM instead.
//
// AN AFLR ITEM IS NOT EDITABLE HERE, and the panel says so rather than showing
// fields that do nothing: `chastityGear.worn` gives an AFLR key precedence over a
// homebrew row, so a flag written onto a real Chastity Belt would be read by
// nothing. Offering the field anyway is how a GM learns to distrust the panel.
//
// GOES STALE IF: a new per-item flag joins the "read off worn gear" set and is
// not added to FIELDS, or `_homebrewRow` starts reading a key this does not
// write. The suite's "the homebrew panel writes what the engine reads" test
// compares the two lists rather than trusting this comment.
(() => {
  const MOD = "ardisfoxxs-lewd-pf2e";
  const HOLES = ["vaginal", "anal", "oral"];

  window.AFLP = window.AFLP || {};

  // ── Reading and writing ──────────────────────────────────────────────────
  //
  // The row is written WHOLE every time, never merged field by field. Foundry
  // merges nested objects on update, so writing only the changed keys would
  // leave a hole a GM had just unticked still sealed. Arrays are replaced
  // wholesale, so `holes` is safe inside a whole-object write.
  //
  // ── THE ROW HAS THREE PARTS, AND ONLY THE FIRST IS READ BY ANY ENGINE ──────
  //
  //   holes/denied/drain/coatWipe/holesUnless   the EFFECTIVE rules. Recomputed on
  //                                             every write. `_homebrewRow`,
  //                                             `worn()`, the Denied floor and the
  //                                             drain all read these and none of
  //                                             them changed.
  //   own                                       what the GM typed themselves.
  //   presets                                   the AFLR pieces they attached.
  //
  // A user who copies the exoskeleton and then changes their mind removes it AND
  // the exoskeleton-dry effect attached to it (14 Sept 2026). A flat row cannot
  // answer that. Two attached pieces can seal the same hole, and removing
  // one must leave it sealed if the other still seals it - nothing in a flat row
  // says where a value came from. So the row stores what it is MADE OF and
  // recomputes what it IS.
  //
  // `presets` stores KEYS, not snapshots, so a piece whose definition changes
  // reaches every item that attached it.
  function readRow(item) {
    const hb = item?.getFlag?.(MOD, "homebrew") ?? null;
    // MIGRATION FROM THE SINGULAR `preset`, which shipped earlier the same day and
    // is on any item saved in between. One copied preset IS one attachment, so it
    // is folded in and `write` deletes the old key. Removing this fold would make
    // those items read as having nothing attached while still carrying the rules.
    const list = Array.isArray(hb?.presets) ? hb.presets.filter(k => typeof k === "string")
               : (typeof hb?.preset === "string" ? [hb.preset] : []);
    return {
      holes:      Array.isArray(hb?.holes) ? hb.holes.filter(h => HOLES.includes(h)) : [],
      denied:     Number(hb?.denied) || 0,
      drain:      Number(hb?.drain) || 0,
      coatWipe:   hb?.coatWipe === true,
      holesUnless: typeof hb?.holesUnless === "string" ? hb.holesUnless : null,
      presets:    list,
      // AN ITEM SAVED BEFORE `own` EXISTED STILL HAS RULES, and they are all the
      // GM's. Taking the absent `own` as an empty one would recompute the effective
      // row from the attachments alone and WIPE everything they typed on the next
      // save. So an absent `own` is derived: the effective row minus whatever the
      // attachments explain. `_ownFrom` is the same subtraction the Save button
      // uses, so a migrated item and a freshly saved one hold the same shape.
      own: hb?.own ? {
        holes:    Array.isArray(hb.own.holes) ? hb.own.holes.filter(h => HOLES.includes(h)) : [],
        denied:   Number(hb.own.denied) || 0,
        drain:    Number(hb.own.drain) || 0,
        coatWipe: hb.own.coatWipe === true,
      } : _ownFrom({
        holes:    Array.isArray(hb?.holes) ? hb.holes.filter(h => HOLES.includes(h)) : [],
        denied:   Number(hb?.denied) || 0,
        drain:    Number(hb?.drain) || 0,
        coatWipe: hb?.coatWipe === true,
      }, contribution(list)),
      loadsBonus:         Number(item?.getFlag?.(MOD, "loadsBonus")) || 0,
      cumShotBonus:       Number(item?.getFlag?.(MOD, "cumShotBonus")) || 0,
      arousalBonus:        Number(item?.getFlag?.(MOD, "arousalBonus")) || 0,
      arousalBonusPartner: Number(item?.getFlag?.(MOD, "arousalBonusPartner")) || 0,
      arousalBonusHole:   item?.getFlag?.(MOD, "arousalBonusHole") ?? "",
    };
  }

  // The per-item flags that live OUTSIDE the homebrew row, because their engines
  // read them straight off the item and predate this panel.
  const LOOSE = ["loadsBonus", "cumShotBonus", "arousalBonus", "arousalBonusPartner", "arousalBonusHole"];

  // ── COMPOSITION ───────────────────────────────────────────────────────────
  //
  // What a set of attached pieces contributes between them. The rules, and why:
  //
  //   holes        UNION. Two pieces that seal the ass both seal the ass, and
  //                removing one must leave it sealed while the other is on.
  //   denied       MAX, never sum - the floor mechanism itself works that way
  //                ("floors do not stack, the wearer holds the highest one"), and a
  //                row that summed here would disagree with the engine reading it.
  //   drain        MAX, not sum. One item is one piece of gear; two attached rows
  //                each draining 1 taking 2 tiers a rest reads as a stacking bug.
  //   coatWipe     OR. It takes the whole coat; twice is once.
  //   holesUnless  ONE ONLY. `_holesSuspended` reads a single condition slug and
  //                has no OR, so a second attachment carrying a DIFFERENT
  //                suspension is REFUSED at attach time with a message, rather
  //                than silently dropping one of them. Only `living-exoskeleton`
  //                carries one today, so this is a guard, not a daily event.
  //
  // GOES STALE IF: `_holesSuspended` learns to take more than one condition, or a
  // sixth row key is added and not given a rule here.
  function contribution(keys, list = presets()) {
    const out = { holes: [], denied: 0, drain: 0, coatWipe: false, holesUnless: null };
    for (const key of keys ?? []) {
      const p = list.find(x => x.key === key);
      if (!p) continue;                      // another system's, or no longer offered
      for (const h of p.holes) if (!out.holes.includes(h)) out.holes.push(h);
      out.denied = Math.max(out.denied, Number(p.denied) || 0);
      out.drain  = Math.max(out.drain,  Number(p.drain)  || 0);
      out.coatWipe = out.coatWipe || p.coatWipe === true;
      if (p.holesUnless && !out.holesUnless) out.holesUnless = p.holesUnless;
    }
    return out;
  }

  // The rules the item actually has: the GM's own, plus everything attached.
  function compose(own, contrib) {
    const holes = [...(own?.holes ?? [])];
    for (const h of contrib.holes) if (!holes.includes(h)) holes.push(h);
    return {
      holes,
      denied: Math.max(Number(own?.denied) || 0, contrib.denied),
      drain:  Math.max(Number(own?.drain)  || 0, contrib.drain),
      coatWipe: (own?.coatWipe === true) || contrib.coatWipe,
      holesUnless: contrib.holesUnless,
    };
  }

  // The reverse: what of an effective row is the GM's, given what is attached.
  //
  // A NUMBER IS ONLY THEIRS WHEN IT EXCEEDS THE ATTACHMENT. Without that, a field
  // showing a preset's Denied 3 that the GM never touched would be recorded as
  // their own 3 and SURVIVE removing the preset - the floor would not come back
  // off. Typing BELOW an attached value records nothing and changes nothing, which
  // is why the panel says so out loud instead of letting it look accepted.
  function _ownFrom(eff, contrib) {
    return {
      holes: (eff?.holes ?? []).filter(h => !contrib.holes.includes(h)),
      denied: (Number(eff?.denied) || 0) > contrib.denied ? (Number(eff.denied) || 0) : 0,
      drain:  (Number(eff?.drain)  || 0) > contrib.drain  ? (Number(eff.drain)  || 0) : 0,
      coatWipe: (eff?.coatWipe === true) && !contrib.coatWipe,
    };
  }

  // ── THE CONDITIONS HALF ────────────────────────────────────────────────────
  //
  // A piece's seal lives in `chastityGear.ITEMS`; the conditions it applies live in
  // the LIVING GEAR table, which is per-system and reached through the alias
  // `window.AFLP_LivingGear` (index.js points it at whichever file this world
  // runs). Attaching a preset copies both halves.
  //
  // CONDITIONS ONLY. `companions` and `anatomy` are deliberately not copied - see
  // `_homebrewGrant` in `aflp-living-gear-core.js` for the measurement and the
  // reasoning - and `describe` says so on the line rather than leaving it silent.
  // THE LIVING-GEAR TABLE FOR **THIS** SYSTEM, OR NOTHING.
  //
  // `window.AFLP_LivingGear` is a back-compat alias and `index.js` points it at the
  // PF2e object on every system that is not Daggerheart - INCLUDING D&D 5e. Reading
  // it blind means a 5e world reads PATHFINDER'S rows, which is the exact leak the
  // per-system file split exists to prevent ("neither can see the other's rows").
  //
  // MEASURED 16 Sept 2026 in dnd-test: `grantsFor("living-exoskeleton")` returned
  // PF2e's plugged/caged/chaste row on a D&D 5e world. It could not fire - 5e has
  // no gear, so nothing is offered to attach - but the 5e build is next.
  //
  // `_liveFor` is stamped by `register()` only when that table actually registers,
  // so this asks the table whether it belongs here rather than re-deriving the
  // system rule in a third place.
  //
  // A SYSTEM WITH NO LIVING-GEAR FILE GETS NO CONDITIONS, SILENTLY AND SAFELY -
  // AND D&D 5e IS THAT SYSTEM TODAY. The 5e packs will not stay spells-only, and
  // this is what that means here: the moment 5e ships gear whose cards
  // promise a condition, attaching it as a preset will copy the SEAL and the FLOOR
  // and none of the conditions, because there is no `aflp-living-gear-5e.js` to
  // stamp itself. Nothing will look broken - the attached line will simply not
  // mention conditions - which is exactly the kind of quiet gap this project keeps
  // producing.
  //
  // **The fix at that point is a 5e living-gear file, not a change here.** Reaching
  // for PF2e's table instead is the leak this function exists to close.
  //
  // GOES STALE IF: a per-system file stops stamping itself, or 5e gains one - the
  // second is a milestone, not a regression.
  function liveGearTable() {
    const t = window.AFLP_LivingGear;
    return (t && t._liveFor && t._liveFor === AFLP.system?.id) ? t : null;
  }

  function grantsFor(key) {
    const row = liveGearTable()?.GRANTS?.[key];
    if (!row) return null;
    const out = {};
    for (const f of ["conditions", "conditionsIfCock", "conditionsIfPussy"]) {
      const o = row[f];
      if (!o || typeof o !== "object") continue;
      const clean = {};
      for (const [slug, v] of Object.entries(o)) {
        if (slug === "denied") continue;        // the chastity row owns the floor
        const n = Number(v) || 0;
        if (n > 0) clean[slug] = n;
      }
      if (Object.keys(clean).length) out[f] = clean;
    }
    if (typeof row.conditionsUnless === "string" && row.conditionsUnless) out.conditionsUnless = row.conditionsUnless;
    return Object.keys(out).length ? out : null;
  }

  // What this piece does that a copy leaves behind, in the GM's words.
  function notCopied(key) {
    const row = liveGearTable()?.GRANTS?.[key];
    const out = [];
    const c = row?.companions?.length ?? 0;
    if (c) out.push(`fits ${c} other AFLR item${c > 1 ? "s" : ""} onto the wearer`);
    if (row?.anatomy?.length) out.push(`grants ${row.anatomy.join(", ")} permanently`);
    if (Number(row?.conditions?.denied) > 0) out.push("a Denied floor of its own - set one in the field below instead");
    return out;
  }

  // Merged across every attached piece, MAX per condition - the same rule the
  // numbers use, and for the same reason: two pieces each applying Plugged 1 leave
  // the wearer Plugged 1, not 2.
  function grantContribution(keys) {
    const out = {};
    for (const key of keys ?? []) {
      const g = grantsFor(key);
      if (!g) continue;
      for (const f of ["conditions", "conditionsIfCock", "conditionsIfPussy"]) {
        if (!g[f]) continue;
        out[f] ??= {};
        for (const [slug, n] of Object.entries(g[f])) out[f][slug] = Math.max(out[f][slug] ?? 0, n);
      }
      if (g.conditionsUnless && !out.conditionsUnless) out.conditionsUnless = g.conditionsUnless;
    }
    return Object.keys(out).length ? out : null;
  }

  const ownUsed = (o) => !!(o?.holes?.length || Number(o?.denied) > 0 || Number(o?.drain) > 0 || o?.coatWipe === true);

  function isDeclared(d) {
    return !!(d.holes.length || d.denied > 0 || d.drain > 0 || d.coatWipe
      || d.loadsBonus || d.cumShotBonus || d.arousalBonus || d.arousalBonusPartner);
  }

  // Does this row declare anything at all? A row of zeroes is not a rule, it is an
  // absence, and it is DELETED rather than stored - so this is also what decides
  // whether the panel has anything to read back to a GM.
  function rowUsed(d) {
    return !!(d?.holes?.length || Number(d?.denied) > 0 || Number(d?.drain) > 0 || d?.coatWipe === true);
  }

  // `d` carries `own` and `presets`; the effective four are RECOMPUTED here and
  // whatever the caller passed for them is ignored. One place computes the rules,
  // and it is the one place that writes them.
  async function write(item, d) {
    const payload = {};
    const keys = (d.presets ?? []).filter(k => typeof k === "string");
    const contrib = contribution(keys);
    const own = d.own ?? _ownFrom(d, contrib);
    const eff = compose(own, contrib);
    if (rowUsed(eff)) {
      const row = { holes: [...eff.holes], denied: eff.denied,
                    drain: eff.drain, coatWipe: eff.coatWipe };
      // The two parts it is made of, same `-=` rule as below: both are conditional.
      if (keys.length) row.presets = [...keys]; else row["-=presets"] = null;
      if (ownUsed(own)) row.own = { holes: [...own.holes], denied: Number(own.denied) || 0,
                                    drain: Number(own.drain) || 0, coatWipe: own.coatWipe === true };
      else row["-=own"] = null;
      // The singular key this replaced, gone from any item saved while it existed.
      row["-=preset"] = null;
      // A CONDITIONAL KEY MUST BE DELETED, NOT OMITTED. The note above says the row
      // is written whole - and it is, for the four keys that are always present.
      // These two are not: Foundry MERGES nested objects, so a row that simply
      // leaves `holesUnless` out keeps whatever was there before.
      //
      // Measured 14 Sept 2026 in dh-test, on the preset name: saved a Chastity Belt
      // row, unticked vaginal, saved again, and `preset: "chastity-belt"` was still
      // on the item.
      //
      // `holesUnless` HAS THE SAME SHAPE AND IS NOT HARMLESS. Copy Living
      // Exoskeleton (which suspends its seal while `exoskeleton-dry`), save, then
      // copy Chastity Belt over it and save: the suspension used to survive, and
      // `_holesSuspended` would go on unsealing an item that is not an exoskeleton.
      // Nothing on the sheet says `holesUnless` is there to remove.
      //
      // `-=key` inside the nested object is the delete-on-merge form, and it works
      // at this depth - measured in the same session, not assumed.
      //
      // GOES STALE IF: a sixth row key is added conditionally and not given a `-=`
      // leg here. There are now four: presets, own, preset (the retired one), and
      // this.
      //
      // The suspension is NEVER the GM's own - it comes from an attachment and goes
      // with it, which is the whole of the requirement.
      if (eff.holesUnless) row.holesUnless = eff.holesUnless; else row["-=holesUnless"] = null;
      payload[`flags.${MOD}.homebrew`] = row;
    } else {
      payload[`flags.${MOD}.-=homebrew`] = null;
    }
    // ── THE CONDITIONS HALF, IN ONE UPDATE ────────────────────────────────────
    //
    // Foundry merges nested objects and this row is TWO levels deep: writing
    // `{conditions:{plugged:1}}` over `{conditions:{plugged:1, horny:1}}` keeps the
    // horny, and a `-=` only helps at the level you spell it. So every slug the
    // PREVIOUS row carried and this one does not gets its own `-=` leg, and a whole
    // field that has gone is deleted at the field level.
    //
    // THE OBVIOUS SHAPE - delete the flag, then write the new one - IS WRONG HERE,
    // and it was written that way first. Two updates fire the living-gear hook
    // TWICE, `sync` is async and nothing serialises the two calls, so the revoke
    // from the delete can land after the grant from the write and leave the wearer
    // with none of the conditions. Caught by this file's own suite test, which
    // failed with "attached living-exoskeleton and the wearer does not have plugged
    // 1" against a hand-run that had passed - the hand-run polled long enough for
    // the race to settle. The chastity floor has a promise chain per actor for
    // exactly this; living gear has none, so the fix is to not need one.
    //
    // GOES STALE IF: `homebrewGrant` gains a third level, or living-gear's `sync`
    // gains a per-actor lock - at which point the simpler delete-then-write is safe
    // again, though still two writes where one will do.
    const grant = grantContribution(keys);
    const prevGrant = item.getFlag(MOD, "homebrewGrant") ?? null;
    if (grant) {
      const row = {};
      for (const f of ["conditions", "conditionsIfCock", "conditionsIfPussy"]) {
        if (grant[f]) {
          const sub = { ...grant[f] };
          for (const slug of Object.keys(prevGrant?.[f] ?? {})) if (!(slug in grant[f])) sub[`-=${slug}`] = null;
          row[f] = sub;
        } else if (prevGrant?.[f]) row[`-=${f}`] = null;
      }
      if (grant.conditionsUnless) row.conditionsUnless = grant.conditionsUnless;
      else if (prevGrant?.conditionsUnless) row["-=conditionsUnless"] = null;
      payload[`flags.${MOD}.homebrewGrant`] = row;
    } else if (prevGrant) {
      payload[`flags.${MOD}.-=homebrewGrant`] = null;
    }

    for (const k of LOOSE) {
      const v = k === "arousalBonusHole" ? (d[k] || "") : (Number(d[k]) || 0);
      // A hole with no bonus attached to it is not a rule, it is a leftover.
      const keep = k === "arousalBonusHole"
        ? (!!v && (Number(d.arousalBonus) || Number(d.arousalBonusPartner)))
        : !!v;
      if (keep) payload[`flags.${MOD}.${k}`] = v;
      else payload[`flags.${MOD}.-=${k}`] = null;
    }
    await item.update(payload);
    return readRow(item);
  }

  async function clear(item) {
    // The grant row goes too. It is written by attaching a preset and nothing else
    // reads it, so leaving it would apply conditions from an item that, as far as
    // the panel and every other reader are concerned, now declares nothing.
    const payload = { [`flags.${MOD}.-=homebrew`]: null, [`flags.${MOD}.-=homebrewGrant`]: null };
    for (const k of LOOSE) payload[`flags.${MOD}.-=${k}`] = null;
    await item.update(payload);
  }

  // ── Presets ──────────────────────────────────────────────────────────────
  //
  // A preset COPIES a shipped row's definition into this item; it does NOT
  // borrow its `aflrKey`. Borrowing would make the item BE a Cock Cage to every
  // other rule that names that key - the curse tables, the audits, the pack
  // conformance checks - and a GM asking for "something like a cock cage" is not
  // asking for that.
  //
  // The Denied floor comes from `DENIED`, which is the table's INTENT. The card
  // gate (`_deniedActive`) deliberately does not apply: it exists so AFLR's
  // shared table cannot apply Pathfinder's reading of an item to a Daggerheart
  // card, and a GM declaring a floor on their own item is the authority - there
  // is nobody to disagree with. See the note in `_syncDeniedFloorNow`.
  //
  // ONLY THIS SYSTEM'S ITEMS ARE OFFERED (14 Sept 2026). The presets match the
  // system that is loaded, and presets matching another system's items are never
  // offered at all.
  //
  // `chastityGear.ITEMS` is a SHARED table carrying both systems' rows - that is
  // what makes one reader serve both - so listing it raw offered Pathfinder gear to
  // a Daggerheart GM. Measured in dh-test, 14 Sept: EIGHT of the 24 offered had no
  // Daggerheart card at all, including `chastity-harness-of-the-throat-sleeve-slave`,
  // which `DENIED`'s own comment says does not exist there.
  //
  // `_worldKeys` is the set of AFLR keys this world's packs actually hold, built by
  // `_buildDeniedFloor`. **Undefined until it resolves, and undefined is not empty**
  // - see `presetsReady` below, which is why this returns [] rather than guessing.
  //
  // AND THE FLOOR COMES FROM THE CARD-CONFIRMED TABLE, not the raw one. `DENIED` is
  // the shared intent; `_deniedActive` is what THIS world's cards agree to. A
  // preset is a copy of a piece as this world plays it, so a key whose card here
  // refuses its floor is dropped rather than offered with Pathfinder's number or a
  // silent zero. That is the same fail-closed rule the floor itself uses, and
  // `dev-aflr-audit-chastity-floor.js` already reports the disagreement as a
  // finding. (This is NOT the rule for the number a GM TYPES - see the note above:
  // a GM declaring a floor on their own item is the authority. It is only the rule
  // for what AFLR claims one of its own pieces does.)
  //
  // ROWS THAT CARRY NOTHING ARE NOT OFFERED. Measured 14 Sept 2026 in dh-test:
  // five of the 29 `ITEMS` rows - `codpiece`, `cursed-codpiece`, `living-codpiece`,
  // `living-cock-cage`, `living-femboy-cage` - hold no holes, no drain, no coat
  // wipe, and have no entry in `DENIED`. Copying one fills the fields with zeroes,
  // and Save then DELETES the row, because a row of zeroes is an absence. A menu
  // entry that does nothing is how a GM learns to distrust the panel, so they are
  // filtered out rather than shipped as dead options.
  //
  // GOES STALE IF: one of them gains a rule - a `DENIED` entry for the living
  // cages would do it - at which point it reappears here on its own.
  // Has the world-key set been built? Undefined means the packs have not been read
  // yet, which is NOT the same as "this world holds nothing" - the two produce an
  // identical empty menu and mean opposite things, so the panel says which.
  function presetsReady() {
    return AFLP.chastityGear?._worldKeys instanceof Set;
  }

  function presets() {
    const CG = AFLP.chastityGear;
    if (!CG?.ITEMS || !presetsReady()) return [];
    const here = CG._worldKeys;
    const denied = CG._deniedActive ?? {};
    return Object.keys(CG.ITEMS).sort().filter(key => {
      if (!here.has(key)) return false;                            // another system's piece
      // In the shared intent table, but this world's card does not confirm it.
      if (Object.hasOwn(CG.DENIED, key) && !Object.hasOwn(denied, key)) return false;
      return true;
    }).map(key => {
      const r = CG.ITEMS[key] ?? {};
      return {
        key,
        // THE PACK'S OWN NAME, falling back to the key only when this world has no
        // document for it - which the filter above has already made impossible, so
        // the fallback is for a caller reaching in with a key of its own. Deriving
        // the label got seven of PF2e's twenty-four wrong: "Tattoo Of Denial",
        // "Bagsluts Buttplug Type I", "Bitchsuit Living". A GM picking from this
        // menu is looking for the item they know by name.
        label: CG._worldNames?.get(key) ?? key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        holes: Array.isArray(r.holes) ? [...r.holes] : [],
        drain: Number(r.drain) || 0,
        coatWipe: r.coatWipe === true,
        holesUnless: typeof r.holesUnless === "string" ? r.holesUnless : null,
        denied: Number(denied[key]) || 0,
      };
    }).filter(rowUsed);
  }

  // THE ATTACHED LIST IS THE READBACK, and it replaced a stored-then-checked
  // `preset` key that shipped earlier the same day.
  //
  // 14 Sept 2026: a user who copied a preset, saved and closed the item came back
  // to a cleared selection, with no way to tell whether the preset had saved as
  // hidden data or been lost. The first answer stored WHICH preset was copied and read it back
  // into the select. The list answers the same question better and answers the next
  // one too - it names every piece attached, says what each contributes, and gives
  // each an X.
  //
  // WHAT THE FIRST ATTEMPT TAUGHT, kept because it rules out an obvious "simpler"
  // rewrite: the attachment CANNOT be derived from the values. Measured in dh-test:
  // `ITEMS` holds 29 rows and only SIX distinct ones - fourteen plugs are all
  // `[anal]`, five chastity pieces are all `[vaginal,anal] + Denied 3`. A derived
  // answer named the wrong piece 23 times in 29. So `presets` is stored, and it is
  // the only thing that says what this item was built from.
  //
  // It is a set of LABELS AND CONTRIBUTIONS, never an identity: `worn()` still keys
  // the item `homebrew:<id>`, so an item with a Chastity Belt attached is not a
  // Chastity Belt to the curse tables, the audits or the conformance checks.
  //
  // GOES STALE IF: an attached key stops being offered here - another system's
  // world, or a card that no longer confirms its floor. `contribution` skips what it
  // cannot find, so the item keeps the rules it last computed and the line says the
  // piece is not in this world. It does not silently recompute them away.

  // ── The sheet panel ──────────────────────────────────────────────────────
  function inject(app, html) {
    if (!game.user?.isGM) return;
    const item = app?.item ?? app?.document;
    // MUST BE AN ITEM. `renderDocumentSheetV2` (bound below for D&D 5e) fires for
    // actor, journal and every other document sheet as well, and all of them have
    // an `app.document`. Without this the panel would try to graft itself onto an
    // actor sheet.
    if (!item || !(item instanceof Item)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".aflp-homebrew-panel")) return;
    // ANCHOR TO THE FORM, NOT THE SHEET BODY. Measured 13 Sept 2026 on the PF2e
    // armor sheet, which is what caught it: `.sheet-body` is 464px wide and
    // starts 220px in from the window edge AFTER a re-render, but spans the whole
    // sheet on the first render - so a panel anchored there moves, and the Save
    // and Clear buttons are not where a GM last saw them. `form` is a flex COLUMN
    // the full width of the sheet in both states, so the panel lands across the
    // bottom either way.
    //
    // Our inputs carry no `name`, so Foundry's form serialisation ignores them
    // and being inside the form does not submit anything.
    // AND `root` IS ALREADY THE FORM on a PF2e V1 item sheet - the jQuery handed to
    // `renderItemSheet` is the form, not the window - so `root.querySelector("form")`
    // finds nothing and the old fallback landed back in `.sheet-body`. Measured,
    // after three failed guesses at CSS: ask the root what it is.
    const anchor = (root.matches?.("form") ? root : null)
      ?? root.querySelector("form")
      ?? root.querySelector(".sheet-body")
      ?? root;

    const box = document.createElement("div");
    box.className = "aflp-homebrew-panel";
    // FULL WIDTH AND LAST, ALWAYS. Found 13 Sept 2026 by clicking rather than by
    // script: on the FIRST render the panel sat across the bottom of the sheet,
    // and after a save-and-re-render it moved into the right-hand column - so the
    // Save and Clear buttons were somewhere else the second time a GM used them.
    // A click aimed where they had just been landed on empty sheet.
    //
    // `.sheet-body` is a flex container whose direction and wrapping vary by sheet
    // and by which tab is active, so the box states its own width and its own
    // place rather than inheriting either.
    //
    // NOT `flex: 1 0 100%`, which was the first attempt and was WORSE: in a
    // COLUMN flex container - which `.sheet-body` measured as - flex-basis is the
    // MAIN axis, so 100% means full HEIGHT, and grow:1 squeezed the sheet's own
    // Quantity/Bulk/Size fields to nothing. `align-self:stretch` is the one that
    // means full width in a column, and `flex:0 0 auto` keeps the natural height.
    //
    // GOES STALE IF: a sheet anchors this somewhere that is not a flex child.
    // The cheap check is the one that caught both of these - open a sheet, press
    // Save, and see whether the buttons are still where they were and the sheet's
    // own fields are still on screen.
    box.style.cssText = "width:100%;flex:0 0 auto;align-self:stretch;box-sizing:border-box;order:99;"
      + "padding:6px 8px;border-top:1px solid rgba(200,160,80,0.3);font-size:11px;";

    // An item AFLR already knows is not editable here - its rules come from the
    // table, and `worn()` would ignore anything written on the item.
    const ownKey = AFLP.chastityGear?._keyOf?.(item) ?? null;
    if (ownKey) {
      box.innerHTML = `<div style="opacity:.75;"><strong>AFLR</strong> - this is AFLR's
        <code>${ownKey}</code>. Its rules come from AFLR's own table and cannot be
        overridden on the item.</div>`;
      anchor.append(box);
      return;
    }

    const d = readRow(item);
    const open = isDeclared(d);
    const PRE = presets();
    // A GM who opens a sheet in the second before the packs finish loading must not
    // be shown an empty menu that looks like the answer. Say so, and re-render once
    // when the gate is built - `_deniedReady` is the same promise the floor waits on.
    const ready = presetsReady();

    // THE PANEL'S LIVE STATE, and the only thing the controls mutate. Save writes
    // it; every render rebuilds it from the item. Held here rather than read back
    // off the DOM so that removing an attachment can re-tick the boxes it owned.
    let attached = [...d.presets];
    let own = { holes: [...d.own.holes], denied: d.own.denied, drain: d.own.drain, coatWipe: d.own.coatWipe };

    // EVERY PLAYER-FACING WORD COMES FROM THE ADAPTER, not from this file.
    // The language matches the system - "tokens" on DH, "levels" on PF2e
    // (13 Sept 2026). The vocabulary is measured off each
    // system's own cards - see `unitWord` on the base adapter - and the fallbacks
    // here are only for a system with no adapter loaded at all.
    const V = {
      unit:  AFLP.system?.unitWord  ?? "level",
      units: AFLP.system?.unitsWord ?? "levels",
      mark:  AFLP.system?.markVerb  ?? "gain",
      // A SYSTEM MAY WANT NO FOOTER. Daggerheart's own items never state that an
      // item in inventory applies, so ours should not either - `wornNote` returns
      // null there and the line is not rendered. `??` would defeat that, so this
      // takes the adapter's answer as given, including null.
      worn:  AFLP.system ? AFLP.system.wornNote : "Gear counts only while worn; effects count on presence.",
      // "at daily preparations" on PF2e, "on each rest, short or long" on
      // Daggerheart. PF2e HAS NO REST to speak of and Daggerheart has no daily
      // preparations, so one sentence cannot serve both.
      upkeep: AFLP.system?.gearUpkeepPhrase ?? "at daily preparations",
    };
    // "the wearer gains" on PF2e, "the wearer marks" on Daggerheart. markVerb is
    // the bare stem, so the third person needs the s.
    const marks = `${V.mark}s`;

    // The KEY is the flag name and never changes; the LABEL is what a GM reads
    // and is per-system. Keeping them apart is what lets the wording move without
    // breaking the panel's own tests, which address controls by `data-aflp`.
    const num = (key, label, val, title) =>
      `<label title="${title}" style="display:flex;align-items:center;gap:4px;">
         <span style="opacity:.8;">${label}</span>
         <input type="number" data-aflp="${key}" value="${val}" step="1"
                style="width:52px;height:20px;line-height:20px;font-size:11px;padding:0 4px;">
       </label>`;

    box.innerHTML = `
      <details ${open ? "open" : ""}>
        <summary style="cursor:pointer;font-weight:bold;">AFLR${open ? " - active" : ""}</summary>
        <div style="display:flex;flex-direction:column;gap:6px;padding-top:6px;">

          <div style="display:flex;align-items:center;gap:6px;">
            <span style="opacity:.8;" title="Attach one of AFLR's own pieces. Its rules are added below and listed under Attached, where an X takes them back off again.">Preset</span>
            <select data-aflp="preset" ${ready ? "" : "disabled"} style="flex:1;height:20px;font-size:11px;">
              <option value="" selected>${ready ? "(pick one)" : "(reading this world's items)"}</option>
              ${PRE.map(p => `<option value="${p.key}">${p.label}${p.denied ? ` - Denied ${p.denied} ${p.denied === 1 ? V.unit : V.units}` : ""}</option>`).join("")}
            </select>
            <button type="button" data-aflp="copy" ${ready ? "" : "disabled"} style="width:auto;height:20px;line-height:1;font-size:11px;padding:0 8px;">Copy in</button>
          </div>

          <div data-aflp="attached" style="display:flex;flex-direction:column;gap:2px;"></div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="opacity:.8;">While worn, seals</span>
            ${HOLES.map(h => `<label data-aflp="lbl-hole-${h}" style="display:flex;align-items:center;gap:3px;">
                <input type="checkbox" data-aflp="hole-${h}">${h}</label>`).join("")}
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${num("denied", `Denied ${V.units}`, 0,
              `The Denied floor this piece holds while it is worn. Floors do not stack - the wearer holds the highest one, and gets their own ${V.units} back when it comes off.`)}
            ${num("drain", `Cumflation drained ${V.upkeep}`, 0,
              `Tiers of Cumflation taken from every hole ${V.upkeep}.`)}
            <label data-aflp="lbl-coatWipe" title="Empties the chest cum coat ${V.upkeep}, so the wearer starts dry." style="display:flex;align-items:center;gap:3px;">
              <input type="checkbox" data-aflp="coatWipe">wipes the cum coat</label>
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${num("loadsBonus", "Loads bonus", d.loadsBonus, "Added to the wearer's Loads while worn.")}
            ${num("cumShotBonus", "Cum Shot bonus", d.cumShotBonus, "Added to the wearer's Cum Shot while worn.")}
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${num("arousalBonus", "Arousal to the wearer", d.arousalBonus,
              `Arousal the WEARER ${marks} from a sexual act.`)}
            ${num("arousalBonusPartner", "Arousal to their partner", d.arousalBonusPartner,
              `Arousal the creature performing on them ${marks}.`)}
            <label title="Restrict both Arousal riders to acts in this hole. A hole-gated rider pays out only while that hole is in use." style="display:flex;align-items:center;gap:3px;">
              <span style="opacity:.8;">in hole</span>
              <select data-aflp="arousalBonusHole" style="height:20px;font-size:11px;">
                <option value="" ${d.arousalBonusHole ? "" : "selected"}>(any)</option>
                ${HOLES.map(h => `<option value="${h}" ${d.arousalBonusHole === h ? "selected" : ""}>${h}</option>`).join("")}
              </select>
            </label>
          </div>

          <div data-aflp="unless" style="opacity:.7;"></div>

          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" data-aflp="save" style="width:auto;height:22px;line-height:1;font-size:11px;padding:0 10px;">Save</button>
            <button type="button" data-aflp="clearall" style="width:auto;height:22px;line-height:1;font-size:11px;padding:0 10px;">Clear</button>
            <span data-aflp="msg" style="opacity:.7;"></span>
          </div>
          ${V.worn ? `<div style="opacity:.55;">${V.worn}</div>` : ""}
        </div>
      </details>`;

    // THE PANEL'S OWN EDITS MUST NOT REACH THE SHEET'S FORM HANDLER.
    // Found 13 Sept 2026 by clicking, on a WEAPON sheet: type a Denied floor,
    // move to Loads bonus, and the first value is gone. A Foundry V1 sheet
    // submits on any `change` inside its form and then re-renders, which rebuilds
    // this panel from the item - discarding everything not yet saved. The armor
    // sheet happened to survive it; the weapon sheet did not, which is why one
    // item type is not a test.
    //
    // Our inputs carry no `name`, so they were never part of the submitted data -
    // the damage was the re-render alone. Stopping `change` and `input` at the box
    // keeps the sheet from submitting for edits that are not its own.
    //
    // GOES STALE IF: the panel gains a control the sheet SHOULD see, or Foundry
    // stops submitting V1 sheets on change.
    for (const ev of ["change", "input"]) {
      box.addEventListener(ev, (e) => e.stopPropagation());
    }

    const q = sel => box.querySelector(`[data-aflp="${sel}"]`);
    const msg = (t) => { const m = q("msg"); if (m) m.textContent = t; };
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    // What one attached piece contributes, in the words a GM reads on the card.
    const describe = (p) => {
      const bits = [];
      if (p.holes.length) bits.push(`seals ${p.holes.join(", ")}`);
      if (p.denied) bits.push(`Denied ${p.denied} ${p.denied === 1 ? V.unit : V.units}`);
      if (p.drain) bits.push(`drains ${p.drain} ${V.upkeep}`);
      if (p.coatWipe) bits.push(`wipes the cum coat ${V.upkeep}`);
      // THE RIDER WITH NO CONTROL OF ITS OWN. This line is the only place a GM can
      // see that a suspension came with the piece - which could not previously be
      // seen or removed, and is the reason the list exists.
      if (p.holesUnless) bits.push(`seal suspended while ${p.holesUnless}`);
      // The conditions half, and it has no control of its own either.
      const g = grantsFor(p.key);
      if (g) {
        const say = (o) => Object.entries(o).map(([s, n]) => `${s} ${n}`).join(", ");
        const parts = [];
        if (g.conditions) parts.push(say(g.conditions));
        if (g.conditionsIfCock) parts.push(`${say(g.conditionsIfCock)} with a cock`);
        if (g.conditionsIfPussy) parts.push(`${say(g.conditionsIfPussy)} with a pussy`);
        if (parts.length) bits.push(`applies ${parts.join(", ")}`);
        if (g.conditionsUnless && g.conditionsUnless !== p.holesUnless) bits.push(`lifted while ${g.conditionsUnless}`);
      }
      // AND WHAT IT DOES NOT COPY, said out loud. A GM who knows the Throat Sleeve
      // Slave fits four other pieces would otherwise be waiting for four items that
      // are never coming, and silence would read as a bug rather than a rule.
      for (const n of notCopied(p.key)) bits.push(`NOT copied: ${n}`);
      return bits.length ? bits.join(" - ") : "no rules of its own";
    };

    // EVERY CONTROL IS PAINTED FROM `own` + `attached`, never read back out of the
    // DOM as the source of truth. Removing an attachment has to re-tick the boxes it
    // owned and drop the ones it does not, and a panel that trusted its own
    // checkboxes could not tell those apart.
    const paint = () => {
      const contrib = contribution(attached, PRE);
      const eff = compose(own, contrib);

      // The attached list.
      const host = q("attached");
      if (host) {
        if (!attached.length) host.innerHTML = "";
        else host.innerHTML = `<div style="opacity:.8;">Attached</div>` + attached.map(key => {
          const p = PRE.find(x => x.key === key);
          const label = p ? p.label : key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          // A KEY THIS WORLD DOES NOT OFFER IS NAMED, NOT SWALLOWED. It contributes
          // nothing (see `contribution`), so saying so is the difference between a
          // GM seeing why a rule went missing and hunting for it.
          const what = p ? describe(p) : "not in this world - contributing nothing";
          return `<div style="display:flex;align-items:center;gap:6px;">
              <span style="flex:1;${p ? "" : "opacity:.6;"}"><strong>${esc(label)}</strong> - ${esc(what)}</span>
              <button type="button" data-aflp="drop" data-key="${esc(key)}" title="Remove ${esc(label)} and everything it brought with it"
                      style="width:auto;height:18px;line-height:1;font-size:11px;padding:0 6px;">x</button>
            </div>`;
        }).join("");
      }

      // A HOLE OR A COAT WIPE IS A BOOLEAN AN ATTACHMENT EITHER OWNS OR DOES NOT.
      // There is nothing to add on top of "sealed", so a box an attachment owns is
      // ticked and DISABLED, and its tooltip says which piece to remove. A NUMBER is
      // different - a GM can want more than the piece gives - so those stay editable
      // and only a value ABOVE the attachment counts as theirs. That asymmetry is
      // deliberate: it is the difference between a set and a quantity.
      for (const h of HOLES) {
        const c = q(`hole-${h}`), lbl = q(`lbl-hole-${h}`);
        if (!c) continue;
        const bound = contrib.holes.includes(h);
        c.checked = eff.holes.includes(h);
        c.disabled = bound;
        if (lbl) lbl.title = bound
          ? `Sealed by ${attached.map(k => PRE.find(x => x.key === k)).filter(p => p?.holes.includes(h)).map(p => p.label).join(", ")} - remove it above to unseal`
          : "";
      }
      const cw = q("coatWipe"), cwl = q("lbl-coatWipe");
      if (cw) { cw.checked = eff.coatWipe; cw.disabled = contrib.coatWipe; }
      if (cwl && contrib.coatWipe) cwl.title = "Wiped by an attached piece - remove it above to stop";

      if (q("denied")) q("denied").value = eff.denied;
      if (q("drain")) q("drain").value = eff.drain;

      const un = q("unless");
      if (un) un.innerHTML = eff.holesUnless
        ? `Seal suspended while <code>${esc(eff.holesUnless)}</code>.` : "";

      const sum = box.querySelector("summary");
      if (sum) sum.textContent = `AFLR${rowUsed(eff) || d.loadsBonus || d.cumShotBonus || d.arousalBonus || d.arousalBonusPartner ? " - active" : ""}`;
    };

    const collect = () => ({
      presets: [...attached],
      own: { holes: [...own.holes], denied: own.denied, drain: own.drain, coatWipe: own.coatWipe },
      loadsBonus: Number(q("loadsBonus")?.value) || 0,
      cumShotBonus: Number(q("cumShotBonus")?.value) || 0,
      arousalBonus: Number(q("arousalBonus")?.value) || 0,
      arousalBonusPartner: Number(q("arousalBonusPartner")?.value) || 0,
      arousalBonusHole: q("arousalBonusHole")?.value ?? "",
    });

    q("copy")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const key = q("preset")?.value;
      const p = PRE.find(x => x.key === key);
      if (!p) return msg("pick a preset first");
      if (attached.includes(p.key)) return msg(`${p.label} is already attached`);
      // REFUSED RATHER THAN SILENTLY DROPPED. `_holesSuspended` reads ONE condition
      // slug, so two pieces suspending on different conditions cannot both be
      // honoured - and the one that lost would be invisible.
      const already = contribution(attached, PRE).holesUnless;
      if (p.holesUnless && already && already !== p.holesUnless)
        return msg(`cannot attach ${p.label}: its seal suspends while ${p.holesUnless}, and this item already suspends while ${already}`);
      attached.push(p.key);
      paint();
      msg(`${p.label} attached - press Save`);
    });

    // Removing an attachment takes back everything it brought, including the rider
    // that has no control of its own. Delegated because the list is repainted.
    q("attached")?.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.('[data-aflp="drop"]');
      if (!btn) return;
      ev.preventDefault();
      const key = btn.dataset.key;
      attached = attached.filter(k => k !== key);
      paint();
      msg(`removed - press Save`);
    });

    // A BOX THE GM CAN TICK IS THEIRS; a disabled one belongs to an attachment and
    // never reaches `own`.
    for (const h of HOLES) {
      q(`hole-${h}`)?.addEventListener("change", (e) => {
        own.holes = e.target.checked ? [...new Set([...own.holes, h])] : own.holes.filter(x => x !== h);
        paint();
      });
    }
    q("coatWipe")?.addEventListener("change", (e) => { own.coatWipe = !!e.target.checked; paint(); });

    // ON `change`, NOT `input`. Repainting mid-keystroke would fight the GM's typing:
    // "12" passes through "1", which may be below an attached floor and would snap
    // back before they reached the 2.
    for (const k of ["denied", "drain"]) {
      q(k)?.addEventListener("change", (e) => {
        const typed = Number(e.target.value) || 0;
        const floor = contribution(attached, PRE)[k];
        own[k] = typed > floor ? typed : 0;
        // Said out loud rather than swallowed - a number that looks accepted and
        // does nothing is the shape of every silent bug in this panel's history.
        if (typed < floor) msg(`an attached piece already gives ${floor} - ${typed} is below it and changes nothing`);
        paint();
      });
    }

    q("save")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        await write(item, collect());
        msg("saved");
        item.sheet?.render(false);
      } catch (e) { msg(`failed: ${e}`); console.error("AFLP | homebrew panel save failed", e); }
    });

    q("clearall")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try { await clear(item); msg("cleared"); item.sheet?.render(false); }
      catch (e) { msg(`failed: ${e}`); console.error("AFLP | homebrew panel clear failed", e); }
    });

    paint();
    anchor.append(box);

    // ONE re-render, once, when the gate finishes building. Guarded on `ready` so a
    // panel rendered after the packs are read schedules nothing - without that this
    // would re-render every open sheet on every open, forever.
    if (!ready && AFLP.chastityGear?._deniedReady) {
      AFLP.chastityGear._deniedReady.then(() => {
        if (presetsReady() && item.sheet?.rendered) item.sheet.render(false);
      }).catch(() => { /* the floor build logs its own failure */ });
    }
  }

  // THREE HOOKS, BECAUSE THREE SYSTEMS ANSWER DIFFERENTLY. Measured, not guessed:
  //
  //   PF2e   ApplicationV1 - fires `renderItemSheet` (pf2e-dev, 12 Sept 2026:
  //          EquipmentSheetPF2e, jQuery html, and the root IS the form)
  //   DH     fires `renderItemSheet` too; the panel reaches all 12 of its types
  //   5e     fires NEITHER of those. Measured in dnd-test, 14 Sept 2026:
  //          `ItemSheet5e` extends PrimarySheet5e -> DragDropApplication ->
  //          DocumentSheet5e -> BaseApplication5e -> DocumentSheetV2 ->
  //          ApplicationV2, so the hooks that fire are `renderItemSheet5e`,
  //          `renderDocumentSheetV2` and `renderApplicationV2`. It never passes
  //          through `ItemSheetV2`, which is what this file used to bind - so on
  //          5e the panel appeared on nothing at all.
  //
  // `renderDocumentSheetV2` is the one to bind: it is the narrowest hook 5e
  // actually fires, and it costs nothing on the other two. It fires for EVERY
  // document sheet, which is why `inject` checks the document is an Item.
  //
  // GOES STALE IF: a system's item sheet stops passing through any of these. The
  // suite's type-walk leg is what would catch it - it renders one sheet of every
  // type the system declares and asserts the panel is there.
  for (const hook of ["renderItemSheet", "renderItemSheetV2", "renderDocumentSheetV2"]) {
    Hooks.on(hook, (app, html) => { try { inject(app, html); } catch (e) { console.error("AFLP | homebrew panel", e); } });
  }

  // Programmatic API. The suite drives THIS rather than the DOM for the rules,
  // and checks the DOM separately for the trigger - a test that only calls
  // `write` proves the engine and says nothing about whether the panel appears.
  AFLP.HomebrewPanel = { readRow, write, clear, presets, contribution, compose, grantsFor, grantContribution, notCopied, liveGearTable, rowUsed, isDeclared, LOOSE, HOLES, inject };

  console.log("AFLP | Homebrew item panel loaded");
})();
