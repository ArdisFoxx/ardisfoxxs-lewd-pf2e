// ===============================
// AFLP Cumflation Helper (cumflation.js)
// ===============================
// Per-hole cumflation tiers (anal/oral/vaginal/facial) are now stored as
// flags only. Only the total cumflation effect is applied as an item,
// as it carries actual mechanical status penalties.

if (!window.AFLP.Macros) window.AFLP.Macros = {};

window.AFLP_Cumflation = {

  getCumflation: actor => {
    const cf = structuredClone(
      actor.getFlag(AFLP.FLAG_SCOPE, "cumflation") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0, bodyCoat: 0 }
    );
    // Slime tits: the chest cum coat never drops below 1.
    if ((actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-slime"]) {
      cf.bodyCoat = Math.max(1, Number(cf.bodyCoat) || 0);
    }
    return cf;
  },

  getCumOverflow: actor => structuredClone(
    actor.getFlag(AFLP.FLAG_SCOPE, "cumOverflow") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 }
  ),

  // Distribute cumUnitsSpent across the given holes on the target.
  // Mutates cumFlags and sexualStatsDialog.sexual in place.
  // Caller is responsible for saving afterward.
  applyCumflation: async (actor, cumFlags, cumOverflow, sexualStatsDialog, selectedHoles, cumUnitsSpent, attackerName) => {
    const receivingHoles = selectedHoles.filter(h => ["oral", "anal", "vaginal", "facial", "paizuri", "bodyCoat", "nipples", "onahole"].includes(h));
    if (!receivingHoles.length) return;

    const perHole  = Math.floor(cumUnitsSpent / receivingHoles.length);
    const remainder = cumUnitsSpent % receivingHoles.length;
    let _voiceFired = false;   // fire the cumflation voice at most once per resolution
    let _sceneRefreshed = false;   // schedule the H-Scene card refresh at most once per resolution

    // Token-shake feedback: capture the pre-resolution state so we can fire an
    // escalating cosmetic shake (base < tier < hole-max < overall-tier-8).
    const MAX = AFLP.CUMFLATION_MAX ?? 8;
    const _before = { anal: cumFlags.anal ?? 0, oral: cumFlags.oral ?? 0, vaginal: cumFlags.vaginal ?? 0 };
    const _beforeTotal = Math.min(MAX, Math.floor((_before.anal + _before.oral + _before.vaginal) / 3));
    let _raised = false, _tierCrossed = false, _holeMaxed = false, _sloshHole = false;

    // Deepthroat: no gag, so the oral pool absorbs one extra tier of cum before it
    // overflows (splashes back). The displayed tier still caps at 8.
    const _hasThroatDeep = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["throat-deep"] === true;
    const _hasSlime      = (actor?.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {})["tits-slime"] === true;

    for (const [i, hole] of receivingHoles.entries()) {
      // Paizuri IS the chest coat (one bodyCoat pool). Nipple-fucking an onahole
      // pumps cum INTO the tit - the internal onahole reservoir, distinct from the
      // external coat - so nipples routes to its own pool.
      let poolKey = hole === "paizuri" ? "bodyCoat" : hole === "nipples" ? "onahole" : hole;
      // THE DRY EXOSKELETON TAKES THE LOAD FOR ITSELF. Ardis, 28 Aug 2026: while
      // the suit needs lubricating it "smears the cum over the body to lubricate
      // itself", so a deposit anywhere on a Dry-suited wearer routes to the chest
      // coat and greases the joints instead of filling a hole.
      //
      // This is the SAME KIND OF LINE as the two remaps above - one pool key
      // becoming another before anything reads it - which is why it sits here
      // rather than in a branch of its own.
      //
      // It only fires while the suit is worn AND under-greased; `exoDry.isDry`
      // answers false for a creature with no exoskeleton, so nothing else in the
      // module is affected.
      if (poolKey !== "bodyCoat" && AFLP.exoDry?.isDry?.(actor)) poolKey = "bodyCoat";
      const prevUnits  = cumFlags[poolKey] ?? 0;
      let unitsToAdd = perHole + (i === 0 ? remainder : 0);
      // Slime tits: any cum shot on the tits is treated as 1 higher.
      if (poolKey === "bodyCoat" && _hasSlime && unitsToAdd > 0) unitsToAdd += 1;

      // Tier clamped to the cumflation max for all holes including facial
      cumFlags[poolKey] = Math.min(MAX, prevUnits + unitsToAdd);

      // Track overflow for all holes. Deepthroat raises the oral overflow point by
      // one tier, so a maxed deepthroat swallows more before it splashes back.
      // AFLP.holeCumCap is the shared answer - recordCumSpill asks the same
      // question and the two used to disagree. _hasThroatDeep is kept only for
      // the comment above; the cap itself comes from the helper.
      const overflowCap = AFLP.holeCumCap(actor, poolKey);
      const overflow = Math.max(0, (prevUnits + unitsToAdd) - overflowCap);
      if (overflow > 0) cumOverflow[poolKey] = (cumOverflow[poolKey] ?? 0) + overflow;

      // Fire tier message when the tier increases
      // poolKey, not hole: paizuri writes into bodyCoat and nipples into onahole,
      // so reading cumFlags[hole] was undefined for exactly those two acts and the
      // tier message, the maxed check and the tier voice all silently did nothing.
      const newTier = cumFlags[poolKey];
      if (unitsToAdd > 0) _raised = true;                     // any deposit (incl. overflow on a maxed hole)
      if (newTier > prevUnits) _tierCrossed = true;           // a hole's tier went up
      if (newTier === MAX && prevUnits < MAX) _holeMaxed = true;  // a hole hit its per-hole max
      // Cum going into a hole at its per-hole max (reached now, or already full and
      // overflowing) -> internal sloshing. Internal holes only (not facial).
      if (unitsToAdd > 0 && newTier === MAX && ["anal","oral","vaginal"].includes(hole)) _sloshHole = true;
      if (newTier > prevUnits && game.user.isGM) {
        if (!_voiceFired) {
          // Big loads sound bigger: the big-load set fires on the load size
          // deposited this resolution (cumUnitsSpent), regardless of creature.
          window.AFLP?.Voice?.play?.("cumflation", actor, { units: cumUnitsSpent });
          _voiceFired = true;
        }
        // Cumflation word message
        if (newTier >= 1 && AFLP.Messages) {
          const msgKey = `cumflated-${hole}-${newTier}`;
          const msg = AFLP.Messages.get(msgKey, {
            target:   actor.name,
            attacker: attackerName ?? "",
          });
          if (msg) {
            const scenes = AFLP.HScene?._scenes;
            const sceneEntry = scenes
              ? [...scenes.entries()].find(([, sc]) => sc.targetActorId === actor.id)
              : null;
            if (sceneEntry) AFLP.HScene.addProse?.(sceneEntry[0], msg, "flavor");
          }
        }

        // Refresh the H-Scene portrait to update the cumflation status pill
        if (game.user.isGM) {
          const scenes = AFLP.HScene?._scenes;
          const sceneEntry = scenes
            ? [...scenes.entries()].find(([, sc]) => sc.targetActorId === actor.id)
            : null;
          if (sceneEntry && !_sceneRefreshed) {
            _sceneRefreshed = true;
            // Short defer so cumflation flags are flushed before the refresh reads them
            setTimeout(() => AFLP.HScene.refreshScene?.(sceneEntry[0]), 200);
          }
        }
        // Speed penalty at tier 8 is handled automatically via FlatModifier rule elements
        // on the Cumflated [Hole] 8 condition items in the compendium - no direct actor update needed.
        if (newTier === MAX && ["anal","oral","vaginal"].includes(hole)) {
          const updatedFlags = { ...cumFlags };
          const allFull = (updatedFlags.anal ?? 0) >= MAX &&
                          (updatedFlags.oral ?? 0) >= MAX &&
                          (updatedFlags.vaginal ?? 0) >= MAX;
          const allFullMsg = allFull
            ? ` Every hole is completely packed - ${actor.name} can barely move.`
            : "";
          const speedMsgs = {
            anal:    `${actor.name}'s distended belly and leaking ass make every step a struggle.`,
            oral:    `Cum overflows from ${actor.name}'s mouth with every movement, belly grotesquely swollen.`,
            vaginal: `${actor.name} staggers, thighs coated in thick ropes of cum leaking from their stuffed pussy.`,
          };
          ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><em>${speedMsgs[hole] ?? `${actor.name} is heavily cumflated.`}${allFullMsg}</em></p></div>`,
            speaker: { alias: "AFLP" },
          }).catch(() => {});
        }
      }

      // Lifetime mlReceived per hole
      // Guard against mlReceived being stored as a number (legacy data) or missing entirely.
      if (typeof sexualStatsDialog.sexual.lifetime.mlReceived !== "object" ||
          sexualStatsDialog.sexual.lifetime.mlReceived === null) {
        sexualStatsDialog.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      }
      sexualStatsDialog.sexual.lifetime.mlReceived[hole] =
        (sexualStatsDialog.sexual.lifetime.mlReceived[hole] ?? 0) + (unitsToAdd * AFLP.CUM_UNIT_ML);
    }

    // Escalating token-shake feedback (GM fires locally + broadcasts to all clients).
    if (game.user.isGM) {
      const afterTotal = Math.min(MAX, Math.floor(((cumFlags.anal ?? 0) + (cumFlags.oral ?? 0) + (cumFlags.vaginal ?? 0)) / 3));
      const shakeLevel = (_beforeTotal < MAX && afterTotal === MAX) ? "max8"
                       : _holeMaxed   ? "holemax"
                       : _tierCrossed ? "tier"
                       : _raised      ? "base" : null;
      if (shakeLevel) AFLP.HScene?.shakeToken?.(actor.id, shakeLevel);
      // A maxed hole taking more cum sloshes internally - fire the slosh SFX
      // (broadcast to all clients) once per resolution.
      if (_sloshHole) window.AFLP?.Voice?.playSfx?.("slosh");
    }

    // Lifetime total cumReceived, in Cum Shots (units) - NOT ml. The cum macro
    // writes the same field in units; multiplying by CUM_UNIT_ML here put ml into
    // a unit field, so a Fantasy-setting player hit the Cum Shot titles hundreds
    // of times too early and the number changed meaning by setting.
    if (sexualStatsDialog?.sexual?.lifetime !== undefined) {
      sexualStatsDialog.sexual.lifetime.cumReceived =
        (sexualStatsDialog.sexual.lifetime.cumReceived ?? 0) + cumUnitsSpent;
    }
  },

  saveCumflation: async (actor, cumFlags, cumOverflow) => {
    // THE GM PROXY, at the choke point. A player's PC climaxing inside a monster
    // writes cumflation onto the MONSTER, and Foundry answers "User <name> lacks
    // permission to update Actor". This whole function is data work with nothing
    // on screen, so handing it to the GM costs the player no dialog.
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("saveCumflation", actor, cumFlags, cumOverflow);
    // Single document update instead of two setFlag writes: one updateActor cycle
    // (and one pass of downstream hooks: splatter coat, H-Scene bars) instead of two.
    await actor.update({
      [`flags.${AFLP.FLAG_SCOPE}.cumflation`]:  cumFlags,
      [`flags.${AFLP.FLAG_SCOPE}.cumOverflow`]: cumOverflow,
    });
    // Effects layer: cumflation is a predicate input (e.g. Size Difference
    // Mastery activates at tier 4+), so every write re-syncs managed effects.
    await AFLP.effects?.sync?.(actor);
  },

  // Applies the per-hole cumflation effects (anal/oral/vaginal, graded 1-8 for
  // the icons + lewd descriptions, with a -1 dex penalty on each hole's tier-8
  // item) plus one overall "Cumflated N" effect graded by the average fill,
  // which carries the speed penalty. Total = floor((anal+oral+vaginal)/3), cap 8.
  applyCumflationEffects: async actor => {
    // THE GM PROXY, at the choke point - see saveCumflation. This one guards
    // TWELVE writes below it, including two `deleteEmbeddedDocuments` and two
    // adapter `applyEffect` calls in _applyInflationPenalty / _applyFacialVision /
    // _applySlick, none of which had a gate of their own.
    // GOES STALE IF: any of those three grows a dialog - then it must run on the
    // player's client and be proxied write by write instead.
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("cumflationEffects", actor);
    const FLAG      = AFLP.FLAG_SCOPE;
    const cumFlags  = actor.getFlag(FLAG, "cumflation") ?? {};

    // Daggerheart AND D&D 5e: the penalty is not a PF2e item stack but the
    // flag-backed "cumflation" valued condition - one disadvantage/marker for
    // each hole filled to bursting (tier 8), capped at 3. The Cumflation
    // condition (aflrKey "cumflation") mirrors the count for display.
    //
    // Counts the same four holes PF2e does, tits (the onahole reservoir)
    // included - a maxed hole is a maxed hole wherever it is. Coats never count:
    // cum ON you isn't cum IN you.
    if (AFLP.system?.id === "daggerheart" || AFLP.system?.id === "dnd5e") {
      const holes = [cumFlags.anal ?? 0, cumFlags.oral ?? 0, cumFlags.vaginal ?? 0, cumFlags.onahole ?? 0];
      const maxedHoles = Math.min(3, holes.filter(t => t >= (AFLP.CUMFLATION_MAX ?? 8)).length);
      try { await AFLP.system.setConditionValue(actor, "cumflation", maxedHoles); }
      catch (e) { console.warn("AFLP | DH cumflation set failed", e); }
      // Being covered still makes you Horny outside PF2e. Coats are correctly
      // excluded from the disadvantage-die count above ("cum ON you isn't cum IN
      // you"), but that early return also skipped the slick effects entirely, so a
      // Daggerheart character could be drenched and feel nothing. The Escape
      // easing already worked here, since it reads slickTier at roll time.
      //
      // _applyFacialVision is deliberately NOT called: it applies PF2e condition
      // items by uuid and has no Daggerheart equivalent yet.
      await _applySlick(actor, cumFlags.bodyCoat ?? 0);
      // Same reason as the PF2e tail below: the coat is the suit's lubricant on
      // every system, so this branch has to reconcile it too. Leaving it out of the
      // early return is exactly how the slick came to be dead on Daggerheart.
      try { await AFLP.exoDry?.sync?.(actor); } catch (e) { /* non-fatal */ }
      return;
    }

    const MAX     = AFLP.CUMFLATION_MAX ?? 8;
    const anal    = Math.min(MAX, cumFlags.anal    ?? 0);
    const oral    = Math.min(MAX, cumFlags.oral    ?? 0);
    const vaginal = Math.min(MAX, cumFlags.vaginal ?? 0);

    // Cumflated (X) is ONE item per hole, applied ONLY at the cumflation max - its
    // presence IS the filled-to-capacity state, which is why there is no badge and
    // no partial marker.
    // The penalty itself lives on the inflation carrier (_applyInflationPenalty),
    // not on these; they are the visible statement of WHICH holes are full, and
    // the click-through for the rule.
    const _holes = [
      { key: "anal",    tier: anal,    uuid: AFLP.cumflationItems?.anal },
      { key: "oral",    tier: oral,    uuid: AFLP.cumflationItems?.oral },
      { key: "vaginal", tier: vaginal, uuid: AFLP.cumflationItems?.vaginal },
      { key: "onahole", tier: Math.min(MAX, cumFlags.onahole ?? 0), uuid: AFLP.cumflationItems?.onahole },
    ];
    for (const h of _holes) {
      const maxed = h.tier >= MAX;
      const old = actor.items.filter(i => i.getFlag("world", "aflpCumflationHole") === h.key);
      if (maxed && old.length === 1) continue;                 // already marked
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id), { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
      if (maxed && h.uuid) {
        await AFLP.system.applyEffect(actor, h.uuid, {
          noHook: true,
          flagProps: { "flags.world.aflpCumflationHole": h.key },
        });
      }
    }

    // Belly cumflation is retired. It was floor((anal+oral+vaginal)/3) applied as
    // one of 8 items that carried NO rules at all - a number that fed only its own
    // art. The penalty now comes from _applyInflationPenalty (per maxed hole), and
    // the belly icons have moved to reporting gestation. Sweep any legacy copy off
    // actors that still carry one.
    const oldTotal = actor.items.filter(i => i.getFlag("world", "aflpCumflationTotal") === true);
    if (oldTotal.length) {
      await actor.deleteEmbeddedDocuments("Item", oldTotal.map(i => i.id), { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
    }

    await _applyFacialVision(actor, cumFlags.facial ?? 0);
    await _applyInflationPenalty(actor);
    await _applySlick(actor, cumFlags.bodyCoat ?? 0);
    // The chest coat is the exoskeleton's lubricant, so every cumflation write can
    // move the suit between greased and dry. Computed, never toggled - see AFLP.exoDry.
    try { await AFLP.exoDry?.sync?.(actor); } catch (e) { /* non-fatal */ }
  }
};

// ── Bodily inflation penalty (PF2e) ─────────────────────────────────────────
// A packed body is ONE source whose penalty scales, so it owns ONE Clumsy whose
// value is the count of things inflating it (each maxed hole, plus a pregnancy
// past half term). Not one Clumsy per hole: PF2e resolves multiple instances of a
// valued condition to the HIGHEST, so four holes each granting Clumsy 1 would
// still be Clumsy 1.
//
// Why we create our own instance instead of actor.increaseCondition():
// increaseCondition ADDS. On a creature already at Clumsy 1, asking for 3 yields
// Clumsy 4 - it mutates one shared counter, which would silently inflate a
// spell's Clumsy and could never be cleanly withdrawn. A separate flagged
// instance coexists with anyone else's and resolves to the highest, and deleting
// it leaves theirs untouched. Verified live: raw 2 and 5 -> active 5; remove ours
// -> 2 survives.
//
// The value shape MUST be { isValued: true, value: N }. Omit isValued and PF2e
// silently treats it as valueless - the condition renders but does nothing.
const CLUMSY_UUID = "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm";
const INFLATE_FLAG = "aflpInflation";
// Holes that pack the body. Note bodyCoat/facial are COATS - cum ON you, not IN
// you - so they never inflate. `onahole` is the tits' internal reservoir and does.
const INFLATE_HOLES = ["oral", "vaginal", "anal", "onahole"];

AFLP.inflationValue = (actor) => {
  try {
    const cf = actor?.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    const maxed = INFLATE_HOLES.filter(h => (Number(cf[h]) || 0) >= (AFLP.CUMFLATION_MAX ?? 8)).length;
    return maxed + (AFLP.pregnancyPastHalfTerm(actor) ? 1 : 0);
  } catch (e) { return 0; }
};

async function _applyInflationPenalty(actor) {
  if (!actor || AFLP.system?.id === "daggerheart") return;   // DH uses its own disadvantage dice
  const want = AFLP.inflationValue(actor);
  const mine = actor.items.filter(i => i.getFlag("world", INFLATE_FLAG) === true);
  const cur = mine.find(i => i.slug === "clumsy");
  const curSpeed = mine.find(i => i.slug !== "clumsy");
  const curVal = Number(cur?.system?.value?.value) || 0;
  if (want === curVal && (want === 0 || curSpeed)) return;    // already correct

  if (mine.length) await actor.deleteEmbeddedDocuments("Item", mine.map(i => i.id), { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
  if (want <= 0) return;

  const src = (await fromUuid(CLUMSY_UUID))?.toObject();
  if (src) {
    delete src._id;
    src.system.value = { isValued: true, value: want };
    src.flags = { ...(src.flags ?? {}), world: { [INFLATE_FLAG]: true } };
    await actor.createEmbeddedDocuments("Item", [src], { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
  }
  // -5 ft per inflating source, untyped so it stacks the way the holes should.
  await actor.createEmbeddedDocuments("Item", [{   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
    name: `Bodily Inflation (-${5 * want} ft)`,
    type: "effect",
    img: AFLP.lewdTokenPath?.("Cumflated8.webp") ?? "icons/svg/downgrade.svg",
    system: {
      description: { value: `<p>A body this full is hard to carry: -${5 * want} feet Speed, and Clumsy ${want}.</p>` },
      duration: { value: -1, unit: "unlimited", sustained: false, expiry: null },
      rules: [{ key: "FlatModifier", selector: "land-speed", type: "untyped", value: -5 * want }],
      level: { value: 1 }, tokenIcon: { show: false },
    },
    flags: { world: { [INFLATE_FLAG]: true } },
  }], { noHook: true });
}

async function _applyFacialVision(actor, facialTier) {
    // Cum Slut L7: immune to Dazzled and Blinded caused by facials
    if (AFLP.actorHasKink?.(actor, "cum-slut") && (AFLP.getKinkLevel?.(actor, "cum-slut") ?? 0) >= 7) return;

    const DAZZLED_UUID = AFLP.sysUuid?.("Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh") ?? "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh";
    const BLINDED_UUID = AFLP.sysUuid?.("Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2") ?? "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2";

    // Remove any existing facial-vision conditions applied by AFLP
    const oldVision = actor.items.filter(i => i.getFlag("world", "aflpFacialVision") === true);

    // Desired vision condition for this facial tier.
    // Blinded at the cumflation max only. A half-way Dazzled was dropped so every
    // pool reads the same way: nothing until full, one effect when full.
    const desired = facialTier >= (AFLP.CUMFLATION_MAX ?? 8) ? "blinded" : "none";
    // Current applied kind (legacy items without the kind flag force one swap to tag them).
    const current = oldVision.length
      ? (oldVision[0].getFlag("world", "aflpFacialVisionKind") ?? "__legacy__")
      : "none";
    if (current === desired && oldVision.length <= 1) return;   // unchanged -> nothing to do

    if (oldVision.length) {
      await actor.deleteEmbeddedDocuments("Item", oldVision.map(i => i.id), { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
    }

    if (desired !== "none") {
      const condUuid = desired === "blinded" ? BLINDED_UUID : DAZZLED_UUID;
      await AFLP.system.applyEffect(actor, condUuid, {
        noHook: true,
        flagProps: {
          "flags.world.aflpFacialVision": true,
          "flags.world.aflpFacialVisionKind": desired,
        },
      });
    }
};

// THE ESCAPE BONUS CARRIER, PF2e ONLY.
//
// Ardis, 29 Aug 2026: the slick grants a circumstance bonus to Escape - +1 at
// half chest coat, +2 at full - rather than lowering AFLR's own escape DC.
//
// PF2e's Escape action is the system's roll, not ours: it is whichever of
// Athletics, Acrobatics or an unarmed attack the creature picks, tagged with the
// `action:escape` roll option. Nothing in AFLR code can reach it, so the bonus has
// to be a rule element on an item the creature is carrying. MEASURED, 29 Aug: the
// same selector/predicate pair PF2e's own Restrained condition uses for its escape
// note - selector ["attack","skill-check"], predicate ["action:escape"] - lands on
// all three statistics, and stays out of every other Athletics or Acrobatics check.
//
// THE VALUE IS A FORMULA, NOT A NUMBER, and that is load-bearing: it reads the
// coat pool at roll time, so the item is applied ONCE and never needs replacing as
// the coat rises from 4 to 8. Measured on a live character: coat 0 and 3 -> 0,
// 4 and 7 -> 1, 8 -> 2. Bake it to a number and this reconcile becomes wrong.
//
// The carrier is the coat's OWN card, so a coated creature can click through to
// the rule. It is applied at tier 1, not at the first drop: below half coverage
// the bonus is 0 and an item carrying nothing is noise.
//
// DAGGERHEART DELIBERATELY GETS NOTHING HERE. It has no rule elements and no
// Escape action; its escape is AFLR's own roll, which adds AFLP.slickEscapeBonus
// directly. Wiring this branch to DH would grant nothing and imply otherwise.
const SLICK_CARRIER_FLAG = "aflpSlickCoat";
async function _applySlickCarrier(actor, tier) {
  const sysId = AFLP.system?.id;
  if (sysId !== "pf2e" && sysId !== "sf2e") return;
  const uuid = AFLP.coatItems?.["cumcoat-tits"];
  const held = actor.items?.filter?.(i => i.getFlag("world", SLICK_CARRIER_FLAG) === true) ?? [];
  const want = tier > 0;
  if (want && held.length === 1) return;                       // already carried
  if (held.length) {
    await actor.deleteEmbeddedDocuments("Item", held.map(i => i.id), { noHook: true });   // AFLR-GM-OK: behind applyCumflationEffects' canWrite gate
  }
  if (!want || !uuid) return;
  // Refuses rather than applies a dead uuid - a missing card would otherwise fail
  // silently and the bonus would never exist, which is the hardest way to lose it.
  if (AFLP.uuidIsReal && !AFLP.uuidIsReal(uuid)) {
    console.error("AFLP | slick carrier: coat card uuid does not resolve -", uuid);
    return;
  }
  try {
    await AFLP.system.applyEffect(actor, uuid, {
      noHook: true,
      flagProps: { [`flags.world.${SLICK_CARRIER_FLAG}`]: true },
    });
  } catch (e) { console.warn("AFLP | slick carrier apply failed", e); }
}

// Slick: a cum-coated body radiates arousal. The body-coat pool scales at 4 / 8
// pips (tier 1 / 2) and applies Horny at that tier to the coated creature and to
// anyone performing on them. The self-side is tracked via a flag so it rises with
// the coat and clears when it dries (lowering Horny only when it was the slick-
// driven value). Performers get a Horny floor at the same tier (they got splashed);
// that decays normally like any Horny. Does not wear off on its own - only a
// dropping body-coat pool clears it.
async function _applySlick(actor, bodyCoatTier) {
  const _MAX = AFLP.CUMFLATION_MAX ?? 8;
  // Two steps: fully coated, and half coated. The half point tracks the max.
  const tier = bodyCoatTier >= _MAX ? 2 : bodyCoatTier >= Math.ceil(_MAX / 2) ? 1 : 0;
  await _applySlickCarrier(actor, tier);
  const prev = Number(actor.getFlag?.("world", "aflpSlickHorny")) || 0;
  // Horny is GRANTED by getting coated and is not taken back when you clean up -
  // it lasts until you rest like any other Horny. This used to remove it as soon
  // as the coat came off, so wiping yourself down cured your own arousal.
  //
  // The flag records the highest tier already granted so a recompute does not
  // stack more, and it resets once the coat is gone so a fresh coat grants again.
  if (tier > prev) {
    // grantHorny, not cond.setValue - horny lives in a { temp, permanent } world
    // flag and setValue never reached it. Grant the DIFFERENCE so the coat tops up
    // to `tier` without stacking past it on a recompute.
    const cur = Number(AFLP.hornyTotal?.(actor)) || 0;
    if (cur < tier) { try { await AFLP.gm.run("grantHorny", actor, tier - cur); } catch (e) {} }
    // Was a raw setFlag beside a proxied grantHorny - half-routed, so on an
    // unowned target the Horny landed and the marker did not, and the next
    // recompute granted it all over again because `prev` still read 0.
    try { await AFLP.gm.run("setFlag", actor, "aflpSlickHorny", tier); } catch (e) {}
  } else if (tier === 0 && prev > 0) {
    try { await AFLP.gm.run("setFlag", actor, "aflpSlickHorny", null); } catch (e) {}
  }
  if (tier > 0 && AFLP.HScene?.sceneForActor) {
    try {
      const scene = AFLP.HScene.sceneForActor(actor.id);
      const myTok = (scene?.participants ?? []).find(p => p.actorId === actor.id)?.tokenId;
      if (myTok) {
        for (const p of (scene.participants ?? [])) {
          if (p.partnerId !== myTok) continue;
          const pa = canvas?.tokens?.get?.(p.tokenId)?.actor ?? game.actors?.get?.(p.actorId);
          if (!pa || pa.id === actor.id) continue;
          const cur = Number(AFLP.hornyTotal?.(pa)) || 0;
          if (cur < tier) { try { await AFLP.gm.run("grantHorny", pa, tier - cur); } catch (e) {} }
        }
      }
    } catch (e) {}
  }

  // Contact subtypes: the actor's coated holes work on scene partners. Chest coat
  // (paizuri) carries the tit effects; oral coat carries the throat effects.
  const af = actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  const oralTier = Number(actor.getFlag?.(AFLP.FLAG_SCOPE, "cumflation")?.oral) || 0;
  const chestActive = bodyCoatTier > 0 && (af["tits-honeyed"] || af["tits-numbing"] || af["tits-electric"] || af["tits-gripping"]);
  const oralActive = oralTier > 0 && (af["throat-venomous"] || af["maw"] || af["throat-numbing"]);
  if ((chestActive || oralActive) && AFLP.HScene?.sceneForActor) {
    try {
      const scene = AFLP.HScene.sceneForActor(actor.id);
      const myTok = (scene?.participants ?? []).find(p => p.actorId === actor.id)?.tokenId;
      if (myTok) for (const p of (scene.participants ?? [])) {
        if (p.partnerId !== myTok) continue;
        const pa = canvas?.tokens?.get?.(p.tokenId)?.actor ?? game.actors?.get?.(p.actorId);
        if (!pa || pa.id === actor.id) continue;
        // grantHorny is the real, GM-routed API and it branches per system -
        // Daggerheart's Horny is a valued condition, PF2e's a {temp,permanent}
        // flag. Do not write either store directly from here.
        const _isDH = AFLP.system?.id === "daggerheart";
        if (chestActive && (af["tits-honeyed"] || af["tits-electric"])) { try { await AFLP.gm.run("grantHorny", pa, 1); } catch (e) {} }
        if (chestActive && af["tits-numbing"] && !AFLP.cond.has(pa, "toasted")) { try { await AFLP.cond.apply(pa, "toasted", 1); } catch (e) {} }
        // BOTH CARDS ARE CANON AND THEY NAME DIFFERENT PENALTIES.
        //   Tits (Electric)    PF2e "left Horny 1 and Clumsy 1"
        //                      DH   "is Vulnerable and marks 1 Horny token"
        //   Throat (Venomous)  PF2e "each partner using it is left Sickened 1"
        //                      DH   "marks 1 Stress"
        // Daggerheart has no clumsy and no sickened - measured 18 Aug 2026, both
        // return a null conditionSlug and neither is in CONFIG.statusEffects, so
        // cond.apply wrote an invisible flag key and rendered nothing. DH's
        // Vulnerable is reachable as `off-guard`, which conditionSlug maps to the
        // native vulnerable status.
        // STALE WHEN: either card is reworded, or DH gains those keys.
        if (chestActive && af["tits-electric"]) {
          if (_isDH) { if (!AFLP.cond.has(pa, "off-guard")) { try { await AFLP.cond.apply(pa, "off-guard", 1); } catch (e) {} } }
          else if (!AFLP.cond.has(pa, "clumsy")) { try { await AFLP.cond.apply(pa, "clumsy", 1); } catch (e) {} }
        }
        if (chestActive && af["tits-gripping"] && !AFLP.cond.has(pa, "grabbed")) { try { await AFLP.cond.apply(pa, "grabbed", 1); } catch (e) {} }
        if (oralActive && af["throat-venomous"]) {
          if (_isDH) { try { await AFLP.system?.markStress?.(pa, 1); } catch (e) {} }
          else if (!AFLP.cond.has(pa, "sickened")) { try { await AFLP.cond.apply(pa, "sickened", 1); } catch (e) {} }
        }
        // Throat (Numbing) is the twin of Tits (Numbing) and both items describe
        // the same effect, but only the tits half was ever implemented - the
        // throat subtype existed in the registry and did nothing.
        if (oralActive && af["throat-numbing"] && !AFLP.cond.has(pa, "toasted")) { try { await AFLP.cond.apply(pa, "toasted", 1); } catch (e) {} }
        if (oralActive && af["maw"] && !AFLP.cond.has(pa, "grabbed")) { try { await AFLP.cond.apply(pa, "grabbed", 1); } catch (e) {} }
      }
    } catch (e) {}
  }
}
// ===============================
// Cumflation -> Agility "move" disadvantage (Daggerheart)
// ===============================
// A body packed with cum is weighed down. Each hole packed to its limit (mouth,
// pussy, ass) gives one disadvantage die on the creature's Agility rolls to move,
// to a maximum of three. Daggerheart represents advantage/disadvantage as a
// chosen direction plus a die count rolled keep-highest (e.g. 3 disadvantage =
// -3d6kh), so cumflation prepopulates the d20 roll dialog with the disadvantage
// direction and a die count equal to the number of maxed holes. We drive the
// same controls a player would - selecting disadvantage, then setting the
// advantageNumber control - because the count cannot be set through the roll
// config. It is applied once per dialog so the player can still adjust the dice
// up or down for their other sources of advantage/disadvantage, and it lifts
// automatically when cumflation clears, because the detected count drops to 0.
(() => {
  if (window.AFLP && window.AFLP._cumflationRollHook) return;
  if (window.AFLP) window.AFLP._cumflationRollHook = true;

  // How cumflated the actor is (0-3), detected however cumflation was set: the
  // Cumflation condition value (set by cum deposits and the sheet pip control)
  // OR a direct count of holes packed to their limit on the per-hole flag,
  // whichever is higher. Taking the max means manual pips, an adversary cumming,
  // or a programmatic fill all register, even if one mirror lags the other.
  const cumflationDice = (actor) => {
    if (!actor) return 0;
    const cond = AFLP.cond?.value?.(actor, "cumflation")
              ?? AFLP.system?.conditionValue?.(actor, "cumflation")
              ?? 0;
    const cf = actor.getFlag?.(AFLP.FLAG_SCOPE, "cumflation") ?? {};
    const maxed = [cf.anal, cf.oral, cf.vaginal].filter(t => (t ?? 0) >= (AFLP.CUMFLATION_MAX ?? 8)).length;
    return Math.min(3, Math.max(0, Number(cond) || 0, maxed));
  };

  // Cumflation hampers moving, not swinging: Agility rolls that are not attacks.
  // Broaden (drop the type check) or narrow here if the design shifts.
  const qualifies = (roll) =>
    !!roll && roll.trait === "agility" && roll.type !== "attack";

  // Set the disadvantage direction, then the die count, the way the player would.
  // The count select cannot be driven through the roll config - only its change
  // handler rebuilds the dice - so we set the control's value and dispatch its
  // change event. Sequenced so the count lands after the direction's re-render.
  const applyDisadvantage = (app, n) => {
    const setCount = () => {
      const sel = app.element?.querySelector('select[name="roll.dice.advantageNumber"]');
      if (sel && Number(sel.value) !== n) {
        sel.value = String(n);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    const dis = app.element?.querySelector(".disadvantage-chip");
    if (dis && !dis.classList.contains("selected")) {
      dis.click();                 // pick the disadvantage direction (re-renders)
      setTimeout(setCount, 60);    // then set the die count
    } else {
      setCount();                  // already disadvantage; just set the count
    }
  };

  Hooks.on("renderD20RollDialog", (app) => {
    try {
      const actor = app?.actor;
      const roll  = app?.config?.roll;
      if (!actor || !roll || !qualifies(roll)) return;
      const n = cumflationDice(actor);
      if (n <= 0) return;
      if (app._aflrCumflationApplied) return; // idempotent per dialog
      app._aflrCumflationApplied = true;
      // Defer so the dialog's initial render settles before we drive its controls.
      setTimeout(() => { try { applyDisadvantage(app, n); } catch (e) {} }, 0);
    } catch (e) {
      console.warn("AFLR | cumflation roll-dialog disadvantage hook failed", e);
    }
  });
})();
