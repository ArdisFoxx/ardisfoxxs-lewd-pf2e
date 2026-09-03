// ===============================
// AFLP Living Gear - CORE ENGINE (no tables, no system knowledge)
// ===============================
// Split out of `aflp-living-gear.js` on 27 August 2026, on Ardis's instruction:
//
//   "it might be better to separate the tables in files that pertain to each
//    system if it means you're going to get confused by conflating pf2e things
//    with dh things... 90% of your blockages are from failed assumptions and
//    trying to force pf2e and dh to share one table."
//
// He was describing a measured failure, not a preference. The single shared
// table produced, in one week: `gemstone-plug` (DH) sealing nothing because the
// row was keyed to PF2e's `gemstone-buttplug`; `living-femboy-cage` (DH) nearly
// granted a Denied floor its card never promises, because PF2e's
// `living-cock-cage` does; and a header comment reading "PF2e ONLY, deliberately.
// Living bondage is a PF2e line" that was simply FALSE - Daggerheart is where
// living bondage was invented, and carries thirty-odd pieces and its own rules
// card. Every one of those was a PF2e reading reaching a DH item, and every fix
// I proposed was another gate on the shared table rather than un-sharing it.
//
// SO: this file holds the machinery, which is genuinely system-neutral because it
// only ever reads `this.GRANTS` and `this.FLAG_OWN`. The TABLES live in
// `aflp-living-gear-pf2e.js` and `aflp-living-gear-dh.js`, each gated to its own
// system, each built from ITS OWN cards. Neither can see the other's rows.
//
// A row in either table is a claim about a card in THAT system's pack. There is
// no longer any such thing as a row that is "the same item on both systems" -
// PF2e's Living Cock Cage and Daggerheart's Living Femboy Cage are different
// pieces with different text, and the file boundary is what says so.
//
// GOES STALE IF: a third system gains living bondage. Give it its own file; do
// not widen either of the existing two.

window.AFLP_LivingGearCore = {


  // Ownership flags. We restore EXACTLY what was there before and never take
  // away something we did not give - the `exposedVulnerable` lesson: AFLR only
  // removes the Vulnerable it granted, so a Vulnerable from another source
  // survives. Same rule here for a Bimbofied or a subtype the actor already had.
  FLAG_OWN: "livingGearGrants",


  _isGrantItem(item) {
    if (!item) return null;
    for (const key of Object.keys(this.GRANTS)) {
      if (AFLP.itemHasKey?.(item, key)) return key;
    }
    return null;
  },

  // Is this piece counting right now? `_active` reads all three equip shapes -
  // PF2e's object, Daggerheart's boolean, and loot with no equip block at all -
  // so the "is it worn" question is asked in one place rather than here.


  // Is this piece counting right now? `_active` reads all three equip shapes -
  // PF2e's object, Daggerheart's boolean, and loot with no equip block at all -
  // so the "is it worn" question is asked in one place rather than here.
  _isOn(item) {
    return !!item && !!AFLP.anatomy?._active?.(item);
  },

  // Which condition slugs are NOT kept in AFLP.cond on every system.
  //
  // Denied and Horny each have two stores - the valued condition on Daggerheart,
  // a legacy world flag on Pathfinder and 5e - and only AFLP.denied / AFLP.horny
  // know which one this system reads. Writing them through AFLP.cond here put a
  // chastity harness's Denied 3 where the H-Scene badge and the sheet tab never
  // looked. Everything else in a GRANTS `conditions` block is a plain condition
  // and still goes through AFLP.cond.
  // GOES STALE IF: a third key gains a second store, or these two are unified.


  // Which condition slugs are NOT kept in AFLP.cond on every system.
  //
  // Denied and Horny each have two stores - the valued condition on Daggerheart,
  // a legacy world flag on Pathfinder and 5e - and only AFLP.denied / AFLP.horny
  // know which one this system reads. Writing them through AFLP.cond here put a
  // chastity harness's Denied 3 where the H-Scene badge and the sheet tab never
  // looked. Everything else in a GRANTS `conditions` block is a plain condition
  // and still goes through AFLP.cond.
  // GOES STALE IF: a third key gains a second store, or these two are unified.
  _dualStore(slug) {
    if (slug === "denied") return AFLP.denied ?? null;
    if (slug === "horny")  return AFLP.horny  ?? null;
    return null;
  },


  // ── CONDITIONS THAT DEPEND ON WHAT THE BODY HAS ────────────────────────────
  //
  // Added 28 Aug 2026 for PF2e's Living Exoskeleton, whose card says: "You are
  // Plugged, and also Chaste and Caged if you have a pussy or cock respectively."
  //
  // A flat `conditions` block cannot say that, and the two shapes already here
  // could not either: `CURSES.requiresCock` REFUSES the whole grant on a body
  // without one, which is right for a cage that has nothing to lock onto and
  // wrong for a suit that still plugs and still binds you.
  //
  // `conditions` is unconditional; `conditionsIfCock` and `conditionsIfPussy` are
  // merged in only when the flag is exactly `true`. **Exactly true, not truthy** -
  // these flags are three-valued in practice (true / false / absent) and an
  // actor that has never been through the stats dialog reads `undefined`. Guessing
  // "absent means yes" would put a Chaste on a body with nothing to be chaste
  // about, which is the failing-OPEN direction.
  _conditionsFor(actor, def) {
    const F = AFLP.FLAG_SCOPE;
    // `conditionsUnless` NAMES A CONDITION THAT SUSPENDS THE WHOLE ROW. One piece
    // uses it - the exoskeleton, which grants nothing while it is Exoskeleton Dry,
    // because its own card says the pistons withdraw and leave you open. Returning
    // an EMPTY set rather than skipping the grant is what makes it reversible:
    // `_grant` records `record.granted`, and `_revoke` gives back exactly what was
    // recorded, so a suit that dries out mid-scene returns precisely the conditions
    // it gave and nothing else.
    if (def?.conditionsUnless) {
      try { if (AFLP.cond.has(actor, def.conditionsUnless) === true) return {}; } catch (e) { /* treat as not suspended */ }
    }
    const out = { ...(def?.conditions ?? {}) };
    if (def?.conditionsIfCock  && actor?.getFlag?.(F, "cock")  === true) Object.assign(out, def.conditionsIfCock);
    if (def?.conditionsIfPussy && actor?.getFlag?.(F, "pussy") === true) Object.assign(out, def.conditionsIfPussy);
    return out;
  },

  async _grant(actor, key) {
    const def = this.GRANTS[key];
    if (!actor || !def) return;
    const owned = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG_OWN) ?? {});
    if (owned[key]) return;                      // already granted, do not double

    const record = { anatomy: {}, conditions: {} };

    if (def.anatomy?.length) {
      const af = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
      for (const sub of def.anatomy) {
        // Record the PREVIOUS value, including "absent", so removal can put the
        // flag back exactly. Writing false where there was nothing leaves a key
        // a later read treats as a deliberate off.
        record.anatomy[sub] = Object.hasOwn(af, sub) ? af[sub] : null;
        af[sub] = true;
      }
      await actor.setFlag(AFLP.FLAG_SCOPE, "anatomyFeatures", af);
    }

    // The effective set for THIS body, recorded below so removal gives back
    // exactly what was given even if the anatomy changed while it was worn.
    const granted = this._conditionsFor(actor, def);
    record.granted = granted;
    for (const [slug, value] of Object.entries(granted)) {
      // DUAL-STORE KEYS DO NOT GO THROUGH AFLP.cond. Denied and Horny are kept
      // in the valued condition on Daggerheart and in a legacy world flag on
      // Pathfinder, so writing the condition here put a chastity harness's
      // Denied 3 somewhere the H-Scene badge and the sheet tab never looked -
      // measured 19 Aug 2026 in pf2e-dev, where a caged actor read Denied 0.
      //
      // And the cards say "You gain the Denied condition at 3 WHILE IT IS WORN",
      // which is a sustained floor: it must survive a rest and come off with the
      // gear. setSustained, keyed by the gear, does both - and _removeGrants
      // withdraws it rather than guessing what to subtract.
      const dual = this._dualStore(slug);
      if (dual) {
        // The wearer's OWN tokens, not the total - see the matching note in
        // `chastityGear.syncDeniedFloor`. `total` includes a floor another piece
        // is already holding, so a second piece records it as the wearer's and
        // gives it back on removal. Latent here until Daggerheart gained THREE
        // pieces each holding a Horny floor of 1 on 28 Aug 2026; the identical
        // arithmetic was live in the Denied owner and the suite caught it there.
        record.conditions[slug] = Math.max(0, dual.total(actor) - (dual.permanent?.(actor) ?? 0));
        await dual.setSustained(actor, `living-gear:${key}`, value);
        continue;
      }
      const before = Number(AFLP.cond?.value?.(actor, slug)) || 0;
      record.conditions[slug] = before;
      if (before < value) await AFLP.cond.raiseTo(actor, slug, value);
    }

    // Built-in pieces. Record the ids we create so removal takes back only
    // those - a victim who already owned a Slave Collar keeps their own.
    record.companions = [];
    for (const ckey of def.companions ?? []) {
      if (actor.items?.some(i => AFLP.itemHasKey?.(i, ckey))) continue;  // they already have one
      const made = await this._fit(actor, ckey);
      if (made) record.companions.push(made.id);
    }

    owned[key] = record;
    await actor.setFlag(AFLP.FLAG_SCOPE, this.FLAG_OWN, owned);
  },


  // `force` is used by ONE caller - `sync`, re-evaluating a gated row - and it
  // exists because of the guard three lines below. That guard makes `_revoke` mean
  // "the piece came off", so it refuses while any copy is still worn; a gated row
  // needs the opposite, to take back what it gave WITHOUT the gear moving. The
  // caller re-grants immediately, so the creature is never left stripped.
  async _revoke(actor, key, { force = false } = {}) {
    const def = this.GRANTS[key];
    if (!actor || !def) return;
    const owned = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG_OWN) ?? {});
    const record = owned[key];
    if (!record) return;                          // we never granted it

    // Another copy still on and counting? Then the grant stays.
    if (!force && actor.items?.some(i => this._isGrantItem(i) === key && this._isOn(i))) return;

    if (def.anatomy?.length) {
      const af = foundry.utils.deepClone(actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {});
      const del = {};
      for (const sub of def.anatomy) {
        const prev = record.anatomy?.[sub];
        if (prev === null || prev === undefined) { delete af[sub]; del[`-=${sub}`] = null; }
        else af[sub] = prev;
      }
      // setFlag MERGES, so deleting a key needs the `-=key: null` form. Setting
      // it false instead would leave the key present and read as a deliberate off.
      await actor.setFlag(AFLP.FLAG_SCOPE, "anatomyFeatures", { ...af, ...del });
    }

    // REVOKE WHAT WAS GRANTED, not what the def would grant NOW. With
    // anatomy-conditional rows the two can differ: a body that gained or lost a
    // part while the piece was worn would otherwise have a condition left behind,
    // or one taken away that this never gave. `record.granted` is written by
    // `_grant`; the `def.conditions` fallback is for ownership records written
    // before 28 Aug 2026, and can go once no such record is in play.
    for (const [slug, value] of Object.entries(record.granted ?? def.conditions ?? {})) {
      const dual = this._dualStore(slug);
      if (dual) {
        // WITHDRAWING THE FLOOR IS NOT THE WHOLE JOB. `setSustained(..., 0)`
        // drops the total by the floor it removes, so a wearer who already had
        // Denied 2 and put a belt on top came out at ZERO - the belt took back
        // two tokens it never lent. `_grant` has recorded the previous total all
        // along and this line was throwing it away.
        //
        // The absorbed total cannot be recovered arithmetically: a floor of 3
        // means "at least 3", so the wearer's own 2 is subsumed while it is on
        // and nothing in the bag distinguishes it afterwards. The record is the
        // only witness.
        //
        // Guarded the same way as the plain-condition branch below: restore only
        // when the total is still exactly the floor we lent. If something else
        // moved it in the meantime, that is not ours to reason about.
        const prev   = Number(record.conditions?.[slug]) || 0;
        const before = dual.total(actor);
        await dual.setSustained(actor, `living-gear:${key}`, 0);
        if (prev > 0 && before === value) await dual.raiseTo(actor, prev);
        continue;
      }
      const now  = Number(AFLP.cond?.value?.(actor, slug)) || 0;
      const prev = Number(record.conditions?.[slug]) || 0;
      // Only give back what we took the actor UP to. If something else raised it
      // further since, leave it alone entirely rather than guessing a share.
      if (now !== value) continue;
      if (prev > 0) await AFLP.cond.setExact(actor, slug, prev);
      else await AFLP.cond.remove(actor, slug);
    }

    // Take back only the built-in pieces this grant created, by id. Anything the
    // victim already owned was skipped at grant time and is not ours to remove.
    const ids = (record.companions ?? []).filter(id => actor.items?.get(id));
    if (ids.length) { try { await actor.deleteEmbeddedDocuments("Item", ids); } catch (e) { /* non-fatal */ } }

    // setFlag MERGES. Deleting the key from a clone and writing the clone back
    // puts it straight back, so ownership never cleared and the piece worked
    // exactly once: `_grant` returns early while `owned[key]` exists, so a
    // second wearing granted nothing. Key deletion needs the `-=key: null` form.
    await actor.update({ [`flags.${AFLP.FLAG_SCOPE}.${this.FLAG_OWN}.-=${key}`]: null });
  },

  // One reconcile pass, used by every hook. Cheaper to ask "what should be true
  // now" than to work out what each individual change implied - and it makes the
  // create/delete/equip/unequip paths impossible to get out of step.


  // One reconcile pass, used by every hook. Cheaper to ask "what should be true
  // now" than to work out what each individual change implied - and it makes the
  // create/delete/equip/unequip paths impossible to get out of step.
  async sync(actor) {
    if (!actor) return;
    // BEFORE the rows, not after: `_conditionsFor` reads `exoskeleton-dry`, so the
    // suit's greased/dry state has to be settled before the grants are computed
    // from it. Putting this after would apply a row against last write's state and
    // correct it only on the next sync.
    try { await AFLP.exoDry?.sync?.(actor); } catch (e) { /* non-fatal */ }
    const owned = actor.getFlag(AFLP.FLAG_SCOPE, this.FLAG_OWN) ?? {};
    for (const key of Object.keys(this.GRANTS)) {
      const on = actor.items?.some(i => this._isGrantItem(i) === key && this._isOn(i));
      if (!on) { await this._revoke(actor, key); continue; }

      // A GATED ROW HAS TO BE RE-EVALUATED, NOT JUST GRANTED ONCE.
      //
      // `_grant` returns early when a record already exists - correct for an
      // ordinary piece, whose grants never change while it is worn. A row carrying
      // `conditionsUnless` is different: its set changes when the gate flips, and
      // the first sync banks whatever was true then. MEASURED 29 Aug 2026 in
      // dh-test: a suit put on dry recorded `granted: {}`, and greasing it to 4
      // left the record standing, so Plugged / Chaste / Caged never landed while
      // the seal - which reads the table directly rather than a record - correctly
      // came back. Card said one thing, sheet said another.
      //
      // So when the computed set no longer matches what was banked, the row is
      // revoked and re-granted. `_revoke` gives back exactly `record.granted`, so
      // the round trip returns the creature to where it was before re-applying.
      const rec = owned[key];
      if (rec && this.GRANTS[key]?.conditionsUnless) {
        // Compared ORDER-INSENSITIVELY. `_conditionsFor` assembles its object by
        // spreading then Object.assign, so a plain JSON compare would treat the same
        // three conditions in a different insertion order as a change and revoke and
        // re-grant on every sync - churn nobody would see until something read the
        // record mid-flight.
        const norm = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).sort().join(",");
        if (norm(this._conditionsFor(actor, this.GRANTS[key])) !== norm(rec.granted)) {
          // FORCED, because the piece is still on - see `_revoke`. MEASURED 29 Aug
          // 2026: without it the plain call hit its still-worn guard, returned
          // without deleting the record, and `_grant`'s "already granted" early
          // return then refused too, so a suit greased after being put on dry
          // stayed at zero conditions while its seal came back. Two early returns
          // agreeing with each other, and neither one wrong on its own.
          await this._revoke(actor, key, { force: true });
        }
      }
      await this._grant(actor, key);
    }
  },

  // ---------------------------------------------------------------- traps ---
  //
  // A trap does not apply anything itself. It finds the right piece and PUTS IT
  // ON, which fires the ordinary createItem hook and runs the same curse and
  // grant paths a hand-equipped item runs. That is deliberate: the trap gets the
  // once-only guard, the ownership tracking, the creature-type prompt and the
  // no-cock refusal for free, and there is no second copy of the apply logic to
  // drift out of step.


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
  async _findByKey(key) {
    try {
      const u = AFLP.system?.contentUuid?.(key);
      if (u && AFLP.uuidIsReal?.(u)) {
        const d = await fromUuid(u);
        if (d && AFLP.itemHasKey?.(d, key)) return d;
      }
    } catch (e) { /* fall through to the scan */ }

    for (const p of game.packs.filter(x => /ardisfoxxs/.test(x.collection) && x.documentName === "Item")) {
      let docs; try { docs = await p.getDocuments(); } catch (e) { continue; }
      const d = docs.find(x => AFLP.itemHasKey?.(x, key));
      if (d) return d;
    }
    return null;
  },

  // Put one piece on the actor, worn. Returns the embedded item or null.


  // Put one piece on the actor, worn. Returns the embedded item or null.
  async _fit(actor, key) {
    if (!actor || !key) return null;
    const src = await this._findByKey(key);
    if (!src) { ui.notifications.warn(`AFLR | no item carries the key "${key}"`); return null; }
    const data = src.toObject();
    // A newly created item defaults to carryType "worn", but say it rather than
    // rely on it - that default is exactly what hid a bug in the _active gate.
    if (data.system?.equipped) data.system.equipped.carryType = "worn";
    const [made] = await actor.createEmbeddedDocuments("Item", [data]);
    // createEmbeddedDocuments can report success and create nothing. Confirm.
    return actor.items.get(made?.id) ?? null;
  },

  // Everything the victim was wearing comes off, so the bondage gear is what they
  // are wearing instead. PF2e does NOT do this on its own: measured 11 Aug 2026,
  // a worn Leather Armor stays `carryType: "worn", inSlot: true` after a second
  // armor is equipped, so both sit in the armor slot at once and the trap's own
  // fiction would have described something that never happened.
  //
  // STOWED, NEVER DELETED. This lands on player characters and their armour is
  // theirs; the glyph strips them, it does not destroy their gear. The GM hands
  // it back.
  //
  // WHAT COUNTS. Worn `armor`, plus worn `equipment` whose slug starts with
  // `clothing` - PF2e has exactly five of those (ordinary, fine, high fashion
  // fine, cold weather, desert). The obvious wider rule, "everything with
  // usage.value === worn", matches 365 items in the SRD including every ring and
  // pendant, which is not what "armor and clothes" means.
  //
  // AFLR's own gear is skipped so the piece being fitted, and any bondage the
  // victim already wore, survive the strip.
  // Is this document ours? `AFLP.isAflrOrigin` DOES NOT EXIST - the real global is
  // `AFLP.StatusPanel_isAflrOrigin`, and writing the optional call to the wrong
  // name would have returned undefined forever and quietly stripped AFLR's own
  // gear along with the victim's armour. Falls back to the same substring test
  // the panel uses, so this cannot go dark if the panel is not loaded.


  // Everything the victim was wearing comes off, so the bondage gear is what they
  // are wearing instead. PF2e does NOT do this on its own: measured 11 Aug 2026,
  // a worn Leather Armor stays `carryType: "worn", inSlot: true` after a second
  // armor is equipped, so both sit in the armor slot at once and the trap's own
  // fiction would have described something that never happened.
  //
  // STOWED, NEVER DELETED. This lands on player characters and their armour is
  // theirs; the glyph strips them, it does not destroy their gear. The GM hands
  // it back.
  //
  // WHAT COUNTS. Worn `armor`, plus worn `equipment` whose slug starts with
  // `clothing` - PF2e has exactly five of those (ordinary, fine, high fashion
  // fine, cold weather, desert). The obvious wider rule, "everything with
  // usage.value === worn", matches 365 items in the SRD including every ring and
  // pendant, which is not what "armor and clothes" means.
  //
  // AFLR's own gear is skipped so the piece being fitted, and any bondage the
  // victim already wore, survive the strip.
  // Is this document ours? `AFLP.isAflrOrigin` DOES NOT EXIST - the real global is
  // `AFLP.StatusPanel_isAflrOrigin`, and writing the optional call to the wrong
  // name would have returned undefined forever and quietly stripped AFLR's own
  // gear along with the victim's armour. Falls back to the same substring test
  // the panel uses, so this cannot go dark if the panel is not loaded.
  _isOurs(doc) {
    if (!doc) return false;
    if (typeof AFLP.StatusPanel_isAflrOrigin === "function") return AFLP.StatusPanel_isAflrOrigin(doc);
    const src = doc.flags?.core?.sourceId ?? doc.sourceId ?? doc._stats?.compendiumSource ?? "";
    if (String(src).includes("ardisfoxxs-lewd-")) return true;
    return !!(doc.flags?.["ardisfoxxs-lewd-pf2e"] || doc.flags?.["ardisfoxxs-lewd-pf2e"]);
  },
};
