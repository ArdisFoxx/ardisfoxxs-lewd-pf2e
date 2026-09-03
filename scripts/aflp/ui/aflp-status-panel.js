// ===============================
// AFLR - Status Panel (hex variant)
// ===============================
// Immersive stacked status list: hexagonal icon tile (compendium art with a
// colored glyph fallback), glowing colored label, roman numeral levels,
// severity-band ordering. One registry drives four surfaces:
//   1. The sheet tab strip (replaces the old condition chip row).
//   2. A hover dock beside open character sheets  (setting: statusPanelSheet).
//   3. A screen-edge HUD, left or right            (setting: statusPanelHud).
//   4. Native hiding: AFLR-origin effects/conditions removed from Foundry's
//      own displays (token icons + system effects panel) so statuses are not
//      shown twice                                 (setting: statusHideNative).
// All three settings are client-scope: every user chooses their own layout.
//
// Icons resolve per render, in order: explicit asset path on the def ->
// compendium item art (registry uuid or item name, via the world's content
// pack so pf2e/sf2e/DH all work) -> colored glyph tile. Giving a condition
// item real art in the pack is therefore all it takes to upgrade its tile.
(() => {
  const MOD = "ardisfoxxs-lewd-pf2e";
  const ASSETS = `modules/${MOD}/assets/Lewd%20Tokens/`;
  window.AFLP = window.AFLP || {};

  // Roman up to XXX; anything past that reverts to the plain number.
  const _R1 = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const rom = (n) => {
    n = Math.max(0, n | 0);
    if (n === 0) return "";
    if (n > 30) return String(n);
    return "X".repeat(Math.floor(n / 10)) + _R1[n % 10];
  };

  // ── Derived-state readers ─────────────────────────────────────────────────
  const F = () => AFLP.FLAG_SCOPE;
  // Icon style: when on, the panel uses its built-in colored glyph placeholders
  // for every row instead of per-item compendium art - a cleaner, consistent
  // look some GMs prefer (client setting statusGlyphIcons).
  function _glyphMode() {
    try { return game.settings.get(MOD, "statusGlyphIcons") === true; } catch { return false; }
  }

  // Band visibility is PER USER, kept on a user flag rather than a world setting -
  // a player hiding kit rows must not hide them for everybody else at the table.
  const BANDS = [
    { n: 0, key: "identity",  label: "Identity"  },
    { n: 1, key: "body",      label: "Body"      },
    { n: 2, key: "training",  label: "Training"  },
    { n: 3, key: "state",     label: "State"     },
    { n: 4, key: "drives",    label: "Drives"    },
    { n: 5, key: "roles",     label: "Roles"     },
    { n: 6, key: "transient", label: "Transient" },
    { n: 7, key: "kit",       label: "Kit"       },
  ];
  const BAND_ORDER_FLAG = "statusBandOrder";
  // Open/closed is deliberately NOT persisted. Which groups you hide and how you
  // order them are preferences worth keeping; leaving the menu open is not, and a
  // saved `true` meant the panel came back every session with the menu already
  // unfolded. Session-scoped, so every load starts collapsed.
  let _bandsOpenNow = false;
  function _bandsOpen() { return _bandsOpenNow === true; }
  function _toggleBandsOpen() {
    _bandsOpenNow = !_bandsOpenNow;
    _refreshAllPanels();
  }
  // A user can drag the chips to reorder. The saved order is a list of band
  // numbers; anything missing falls back to its natural position.
  function _bandOrder() {
    const nat = BANDS.map(b => b.n);
    try {
      const v = game.user?.getFlag?.(MOD, BAND_ORDER_FLAG);
      if (!Array.isArray(v) || !v.length) return nat;
      const seen = new Set();
      const out = v.map(Number).filter(n => nat.includes(n) && !seen.has(n) && seen.add(n));
      for (const n of nat) if (!seen.has(n)) out.push(n);
      return out;
    } catch { return nat; }
  }
  function _bandRank(n) {
    const i = _bandOrder().indexOf(Number(n));
    return i < 0 ? 99 : i;
  }
  async function _setBandOrder(list) {
    try { await game.user.setFlag(MOD, BAND_ORDER_FLAG, list.map(Number)); } catch (e) {}
    _refreshAllPanels();
  }
  async function _resetBands() {
    try {
      await game.user.unsetFlag(MOD, BAND_ORDER_FLAG);
      await game.user.unsetFlag(MOD, BAND_FLAG);
      // Clear the legacy persisted open flag from before this was session-scoped.
      await game.user.unsetFlag(MOD, "statusBandsOpen");
    } catch (e) {}
    _refreshAllPanels();
  }
  function _refreshAllPanels() {
    try { _refreshDocksFor(null); } catch (e) {}
    try { refreshSceneDocks(); } catch (e) {}
    try { refreshHud(); } catch (e) {}
  }
  const BAND_FLAG = "statusBands";
  function _hiddenBands() {
    try {
      const v = game.user?.getFlag?.(MOD, BAND_FLAG);
      return Array.isArray(v) ? v.map(Number) : [];
    } catch { return []; }
  }
  async function _toggleBand(n) {
    const cur = new Set(_hiddenBands());
    if (cur.has(Number(n))) cur.delete(Number(n)); else cur.add(Number(n));
    try { await game.user.setFlag(MOD, BAND_FLAG, [...cur]); } catch (e) {}
    _refreshAllPanels();
  }
  // Lustful numeral = the arousal pip count itself (1:1 with the sheet's
  // arousal track), not a quartile - Lustful III means arousal 3.
  function arousalPips(actor) {
    const a = actor.getFlag?.(F(), "arousal") ?? {};
    return Math.max(0, Number(a.current ?? 0) | 0);
  }
  const CF_MAX = 8;
  // Per-hole tier art. Filled holes use the Cumflated* sets; coated areas use the
  // Coated* sets. Tits appear on BOTH sides and need DIFFERENT art:
  //   onahole  = the nipple reservoir, tits filled from inside -> CumflatedTits
  //   bodyCoat = cum over the chest, on a body with tits       -> CoatedTits
  // These used to share one CumflatedTits set. Without a part the path falls
  // through to the OVERALL belly art, so a wrong key shows a cumflated belly.
  const _cfArt = (hole, tier, hasTits = true) => {
    const n = Math.max(0, Math.min(AFLP.CUMFLATION_MAX ?? 8, tier));
    // Only the tits CHEST-COAT art was renamed to CoatedTits; every other set is
    // still Cumflated*. CumflatedTits is now the nipple-reservoir art instead.
    // Coated areas that HAVE their own art use the Coated* sets: the facial coat,
    // and the chest coat on a body with tits. Everything else is still Cumflated*.
    if (hole === "facial") return `${ASSETS}CoatedFacial${n}.webp`;
    if (hole === "bodyCoat") return `${ASSETS}${hasTits ? "CoatedTits" : "CoatedChest"}${n}.webp`;
    const part = { anal: "Anal", oral: "Oral", vaginal: "Vaginal",
                   bodyCoat: "BodyCoat", tits: "Tits", onahole: "Tits" }[hole] ?? "";
    return `${ASSETS}Cumflated${part}${n}.webp`;
  };
  // AFLP.horny.total, not the bag. This summed temp + permanent, which is the
  // total only on Pathfinder and 5e; on Daggerheart it read 0 for a Horny 3
  // character and the row fell through to its unvalued branch, showing a heart
  // with no number.
  function hornyPips(actor) {
    return Math.max(0, Number(AFLP.horny?.total?.(actor)) || 0);
  }
  // How many young and how many eggs is this body carrying RIGHT NOW, summed
  // across every running pregnancy. Two pregnancies of two young each read 4, not
  // "pregnant" twice - the number the panel shows is the brood, not the count of
  // records.
  //
  // Live young and eggs are counted separately because they are separate rows.
  // One row that switched its own label could only ever show one of them, so a
  // body carrying both a litter and a clutch reported just the clutch.
  //
  // Finished pregnancies are marked by recordBirth as gestationRemaining
  // "Complete" (or <= 0); there is no born/delivered flag on the record, so
  // testing for those never excluded anything and the status stuck after birth.
  //
  // A record with no `offspring` counts as ONE, not zero. addPregnancy defaults
  // it to 1, but a hand-edited or legacy record can be missing it, and counting
  // zero would hide the row from someone who is visibly pregnant.
  function pregnancySums(actor) {
    const p = actor.getFlag?.(F(), "pregnancy") ?? {};
    const isDone = (e) => e?.gestationRemaining === "Complete"
      || (typeof e?.gestationRemaining === "number" && e.gestationRemaining <= 0);
    let live = 0, eggs = 0;
    for (const e of Object.values(p)) {
      if (!e || isDone(e)) continue;
      const n = Math.max(1, Number(e.offspring) || 0);
      if (e.deliveryType === "egg") eggs += n; else live += n;
    }
    return { live, eggs };
  }
  function hasKink(actor, slug) {
    const sexual = actor.getFlag?.(F(), "sexual") ?? {};
    return !!(sexual.kinks?.[slug]);
  }

  // ── Status registry ───────────────────────────────────────────────────────
  // Row order, most permanent first so a glance reads top-down as "who they are,
  // what their body is, what is happening right now, and what they are carrying".
  //
  //   0  identity        lasting mental change - Mind Break, Bimbofied, Hypno Slave
  //   1  body            anatomy, body features, size training - what they ARE
  //   2  state           what is in or on them now - cumflation, pregnancy, Exposed
  //   3  drives          Arousal, Horny, Denied, Fertility
  //   4  roles           Dominating, Submitting, Swallowed - this scene only
  //   5  transient       Afterglow, Toasted, Birth Control - wears off
  //   6  kit             kinks, items, custom rows
  // value(actor): 0/false hides the row; true shows unvalued; n>0 shows numeral.
  // icon: string asset path, {cond:key} registry-uuid art, {item:name} pack
  //       art by name, or a function(actor) returning any of those.
  const isDH = () => game.system?.id === "daggerheart";

  // Creature Fetish types, parsed exactly as aflp-kinks does: a comma-separated
  // list in sexual.kinkNotes, resolved TOKEN-FIRST.
  //
  // The comment here used to say the world actor was read "because an unlinked
  // token's synthetic actor does not carry the sheet's kink notes", and that
  // claim was FALSE - it was also quoted as justification at several other
  // sites. A synthetic actor is the base actor's source with the token's
  // ActorDelta applied over it, so it returns the base actor's flags for any key
  // the delta does not override. Measured 18 Aug 2026 in `pf2e-dev`: a flag set
  // on the base actor read back correctly through an unlinked token of it, and a
  // write through that token overrode it without touching the base.
  //
  // So a token-first read is never worse than a world-first one, and a
  // world-first read is wrong the moment a mook has its own value.
  function _cfTypes(actor) {
    try {
      const w = AFLP.system.liveActor(actor);
      const raw = w?.getFlag?.(F(), "sexual")?.kinkNotes?.["creature-fetish"] ?? "";
      return String(raw).split(",").map(t => t.trim()).filter(Boolean);
    } catch (e) { return []; }
  }

  // Is this actor wearing the piece keyed `key`, right now? actorItemByKey asks
  // aflrKey first, so it survives a rename of the item or its slug - both of
  // which happened to the Throat Sleeve harness on 11 Aug 2026. It deliberately
  // does not gate on _active (a feat counts on presence), so the worn test is
  // ours to make.
  const _wornKey = (actor, key) => {
    try {
      const it = AFLP.actorItemByKey?.(actor, key);
      return !!(it && AFLP.anatomy?._active?.(it));
    } catch (e) { return false; }
  };

  AFLP.STATUS_DEFS = [
    // Afflictions
    { key: "mind-break", label: "Mind Break", color: "#e14fd2", glyph: "\u2732", band: 0,
      icon: { cond: "mind-break" },
      value: a => isDH() ? AFLP.cond.has(a, "mind-break") : AFLP.cond.value(a, "mind-break") },
    { key: "bimbofied", label: "Bimbofied", color: "#ff7ad9", glyph: "\u2740", band: 0,
      icon: { cond: "bimbofied" }, value: a => AFLP.cond.value(a, "bimbofied") },
    { key: "bullified", label: "Bullified", color: "#e0607a", glyph: "\u2642", band: 0,
      icon: { cond: "bullified" }, value: a => AFLP.cond.value(a, "bullified") },
    // Strict precedence: Hypno Slave > Hypnotized > Entranced. Each stage subsumes
    // the last, so exactly one ever renders. Previously hypno-slave read the KINK
    // flag independently, so a conditioned slave also displayed as Hypnotized -
    // and, worse, could display as merely Entranced by someone else.
    { key: "hypno-slave", label: "Hypno Slave", color: "#c95fb8", glyph: "\u26AD", band: 0,
      icon: { cond: "hypnotized" }, value: a => hasKink(a, "hypno-slave") },
    { key: "hypnotized", label: "Hypnotized", color: "#d264c0", glyph: "\u25C9", band: 0,
      icon: { cond: "hypnotized" },
      value: a => AFLP.cond.has(a, "hypnotized") && !hasKink(a, "hypno-slave") },
    { key: "entranced", label: "Entranced", color: "#c877c8", glyph: "\u25CE", band: 0,
      icon: { cond: "entranced" },
      value: a => AFLP.cond.has(a, "entranced")
        && !AFLP.cond.has(a, "hypnotized") && !hasKink(a, "hypno-slave") },
    { key: "exposed", color: "#ef7fa6", glyph: "\u2726", band: 3,
      icon: { cond: "exposed" },
      label: a => AFLP.cond.value(a, "exposed") >= 2 ? "Nude" : "Exposed",
      value: a => AFLP.cond.value(a, "exposed") },
    // TWO KEYS, because the two systems call this different things: Daggerheart
    // has DEFEAT (a token track) and Pathfinder has DEFEATED. _uuidFor takes the
    // first that resolves in the running world.
    //
    // Without them this row had NO tooltip and NO click on Daggerheart, which is
    // how Ardis found it on 17 Aug 2026. With no ckey it fell back to
    // AFLP.conditions.defeated.uuid - the canonical PATHFINDER uuid, in
    // aflp-lewd-items, a pack a Daggerheart world does not load - so _uuidFor
    // resolved nothing, the row got no data-uuid, and a row without one is both
    // unhoverable and unclickable.
    //
    // WHY contentUuid COULD NOT SELF-HEAL IT: it redirects a canonical uuid to
    // the system's own copy when that system's index carries THE SAME KEY. Here
    // the key itself differs, so there was nothing for it to match. That is the
    // general trap - a shared concept under two names needs both listed.
    { key: "defeated", color: "#e06682", glyph: "\u2620", band: 3,
      icon: { cond: "defeated" }, ckey: ["defeat", "defeated"],
      label: () => isDH() ? "Defeat" : "Defeated",
      value: a => isDH() ? AFLP.cond.value(a, "defeat") : AFLP.cond.has(a, "defeated") },
    // The VALUE, through AFLP.denied - not `cond.has`. Denied lives in a legacy
    // world flag on Pathfinder and 5e, so `cond.has` was false for every denied
    // PF2e character and **this row had never once lit there**. It also shows the
    // number now, matching the Horny row rather than being a bare on/off.
    { key: "denied", label: "Denied", color: "#6fc6d8", glyph: "\u26D4", band: 4,
      icon: { cond: "denied" },
      value: a => {
        const n = Number(AFLP.denied?.total?.(a)) || 0;
        return n > 0 ? n : AFLP.cond.has(a, "denied");
      } },
    // Gear states. Band 2 (state) - they describe what is on or in the body right
    // now, and vanish with the item, so they belong beside cumflation and Exposed
    // rather than in identity or body.
    // `ckey` added 17 Aug 2026. Chaste carried one and its two siblings did not,
    // so Plugged had a tooltip (from the `desc` below) but no CLICK, and no route
    // to its own card. There is a real Plugged card in the Daggerheart pack; the
    // row just never asked for it. The desc stays as the fallback for a world
    // where the card does not resolve.
    { key: "plugged", label: "Plugged", color: "#c98fd0", glyph: "\u25CF", band: 2,
      icon: { cond: "plugged" }, ckey: "plugged",
      desc: "Something is seated in a hole - nothing else can go in or out, and you cannot purge Cumflation from it.",
      value: a => AFLP.cond.has(a, "plugged") },
    // NEW 17 Aug 2026. Caged is the third of the gear trio with Chaste and
    // Plugged and it has a real card in the pack, but it had NO ROW HERE AT ALL,
    // so the panel stayed silent about a condition the creature was carrying.
    //
    // CORRECTION 18 Aug 2026: this comment used to claim Caged "is registered on
    // the Daggerheart token HUD so a GM can mark it". MEASURED IN dh-test AND
    // FALSE - `CONFIG.statusEffects` carries `chaste` and `plugged` and does NOT
    // carry `caged`, so unlike its two siblings a GM cannot mark it at all, and
    // no code path applies it either. This row therefore cannot light on
    // Daggerheart today. The fix is a `caged` entry in the adapter's
    // AFLR_HUD_CONDS; until then the row is correct but unreachable.
    // I wrote the wrong sentence the day before - a comment is a claim to CHECK.
    // Found by auditing every row for a tooltip and a click, which is also how
    // the two above were found. The desc is only the fallback for a world where
    // the card does not resolve, so it states the seal and no system's numbers.
    { key: "caged", label: "Caged", color: "#b8a0d8", glyph: "⛓", band: 2,
      icon: { cond: "caged" }, ckey: "caged",
      desc: "A cage is locked over the cock - it cannot be used while the cage is on.",
      value: a => AFLP.cond.has(a, "caged") },
    // Live on BOTH systems as of 11 Aug 2026. It was Daggerheart-only for most of
    // that day: an audit found PF2e had no Chaste condition at all - the only
    // three "chaste" strings in its packs were prose - so the row read a slug
    // nothing carried and never showed. A PF2e Chaste was then built so its
    // chastity gear could link one condition instead of restating the seal in
    // every card, and the row went live there too.
    //
    // Kept as a warning: that audit was correct when it ran and wrong two hours
    // later. Re-check rather than trusting this paragraph.
    //
    // `ckey` so the hover pulls THIS system's own Chaste card rather than a
    // sentence hardcoded here. The two systems' cards diverged on 11 Aug 2026 -
    // Daggerheart's Chaste seals the lower holes and explicitly still lets you
    // climax - and a hardcoded rules line is how the panel once read "Clumsy",
    // "AC" and "3 actions" to Daggerheart GMs. The `desc` below is now only the
    // fallback for a world where the card does not resolve, so it states the seal
    // and nothing a system might disagree about.
    { key: "chaste", label: "Chaste", color: "#9fb6e0", glyph: "\u26BF", band: 2,
      icon: { cond: "chaste" }, ckey: "chaste",
      desc: "A lock or shell covers you - nothing can get past the seal in either direction.",
      value: a => AFLP.cond.has(a, "chaste") },
    { key: "gagged", label: "Gagged", color: "#d9a48f", glyph: "\u2298", band: 2,
      icon: { cond: "gagged" },
      desc: "You cannot speak clearly, and have disadvantage on rolls that rely on talking.",
      value: a => AFLP.cond.has(a, "gagged") },
    { key: "blindfolded", label: "Blindfolded", color: "#8f8fb0", glyph: "\u25D1", band: 2,
      icon: { cond: "blindfolded" },
      desc: "You cannot see. Rolls relying on sight fail, and rolls targeting you have advantage.",
      value: a => AFLP.cond.has(a, "blindfolded") },
    { key: "hobbled", label: "Hobbled", color: "#b0a07a", glyph: "\u26D3", band: 2,
      icon: { cond: "hobbled" },
      desc: "You can move no farther than Close range, and cannot run or leap.",
      value: a => AFLP.cond.has(a, "hobbled") },
    { key: "cuffed", label: "Cuffed", color: "#a89b8c", glyph: "\u26D2", band: 2,
      icon: { cond: "cuffed" },
      desc: "Your hands or arms are bound - disadvantage on rolls that use your hands.",
      value: a => AFLP.cond.has(a, "cuffed") },
    // The two cursed pieces from the Feminizer Glyph. These are the ONLY rows in
    // STATUS_DEFS driven by a worn ITEM rather than a condition, and they have to
    // be: the curse leaves no condition of its own behind. What it grants -
    // anatomy subtypes, Bimbofied, a kink swap - each already has its own row,
    // and none of them says "this body is locked in cursed bondage right now".
    //
    // Gated on `_wornKey`, which asks AFLP.anatomy._active. customRows does NOT
    // do this, so a GM-mapped item lights its row from inside a backpack; do not
    // copy that shape here. A cage in a pack is not a cage on a cock.
    //
    // The label is the STATE, not the item - the item name is one hover away
    // through `ckey`, and the row exists to say what the body has become.
    { key: "cumdump-femboy", label: "Bimbofied Bondage Anal Slave", color: "#c76fd0", glyph: "\u26B2", band: 2,
      ckey: "cock-cage-of-the-cumdump-femboy",
      icon: a => AFLP.actorItemByKey?.(a, "cock-cage-of-the-cumdump-femboy")?.img ?? null,
      desc: "Locked into the Cock Cage of the Cumdump Femboy. The cock is caged and capped, every climax is anal, and the body changes are kept even after the cage comes off.",
      value: a => _wornKey(a, "cock-cage-of-the-cumdump-femboy") },
    { key: "throat-sleeve-slave", label: "Bimbofied Bondage Throat Sleeve", color: "#d97ac0", glyph: "\u26A7", band: 2,
      ckey: "chastity-harness-of-the-throat-sleeve-slave",
      icon: a => AFLP.actorItemByKey?.(a, "chastity-harness-of-the-throat-sleeve-slave")?.img ?? null,
      desc: "Belted into the Chastity Harness of the Throat Sleeve Slave. Everything below the waist is sealed, the throat is a sleeve, and the body changes are kept even after the harness comes off.",
      value: a => _wornKey(a, "chastity-harness-of-the-throat-sleeve-slave") },
    { key: "toasted", label: "Toasted", color: "#ec7a8e", glyph: "\u2668", band: 6,
      icon: { cond: "toasted" },
      desc: "Pacified by aphrodisiacs - disadvantage on non-Carnal damaging actions until the scene ends.",
      value: a => AFLP.cond.has(a, "toasted") },
    { key: "dubious-consent", label: "Dubious Consent", color: "#e08a9a", glyph: "\u2049", band: 3,
      // Reads the EFFECT, not the action. "dubious-consent" is the reaction card's
      // own slug, and _legacyItem matches any item on the actor by slug, so the old
      // check lit this row for anyone who merely owned the reaction. value() rather
      // than has() so the row shows which tier is running: 1 is Defeated DC 9,
      // 2 is cannot gain Defeated.
      icon: { cond: "dubious-consent" }, value: a => AFLP.cond.value(a, "effect-dubious-consent") },
    { key: "masturbating", label: "Masturbating", color: "#e88ac0", glyph: "\u264B", band: 3,
      icon: { cond: "masturbating" }, uuidFrom: { cond: "masturbating" },
      desc: "Lost in self-pleasure - self-absorbed and vulnerable. Pressers, Sexual Advances, and grapples land more easily.",
      value: a => AFLP.HScene?.isSelfAbsorbed?.(a.id) },

    // Derived carnal states
    // Creampied / Covered in Cum retired: each filled hole now gets its own row
    // (see cumflationRows), labelled with its tier word and carrying that tier's
    // penalty on mouseover. Two aggregates could only ever show one word for
    // three different holes.
    // Two rows, because a body can carry both at once. The numeral is the BROOD -
    // every young or egg across every running pregnancy added together - so two
    // pregnancies of two young each read Impregnated IV.
    //
    // Second icon on both: the TERM, a flat belly before half term and a full one
    // after, which is exactly when the Impregnated items grant Clumsy. The belly
    // ladder is used at its two ends only, 0 and 8, not as a gestation slider.
    { key: "impregnated", label: "Impregnated", color: "#e79ec2", glyph: "\u2695", band: 3,
      icon: `${ASSETS}Pregnant.webp`,
      icon2: a => `${ASSETS}Cumflated${AFLP.pregnancyPastHalfTerm?.(a) ? 8 : 0}.webp`,
      // Plain and specific: say what is true and what it does, not how it feels.
      desc: a => AFLP.pregnancyPastHalfTerm?.(a)
        ? (AFLP.system?.pregnancyLateText?.() ?? "Past half term and showing.")
        : (AFLP.system?.pregnancyEarlyText?.() ?? "Carrying, but not showing yet."),
      value: a => pregnancySums(a).live },
    // "Egg Host", not "Ovideposited": `deliveryType: "egg"` is set by an
    // ovidepositor sire OR by the host's own Clutch anatomy
    // (sexual-stats-dialog.js, "Clutch converts ANY pregnancy into an egg clutch
    // ... regardless of the sire's cock type"). The record does not store which,
    // so a Clutch bearer bred by an ordinary cock would have read as having been
    // ovideposited when nothing was deposited. If that distinction is ever wanted
    // on the panel, it needs an `eggSource` field written at creation - both
    // facts are in scope there - not a guess made at render time from anatomy the
    // host might have gained since.
    { key: "egg-host", label: "Egg Host", color: "#c9d67a", glyph: "\u2698", band: 3,
      // Art follows the size of the clutch, not the term - a big clutch reads big
      // from the moment it is laid in.
      icon: a => `${ASSETS}${pregnancySums(a).eggs > 4 ? "PregnantEggsBig" : "PregnantEggsSmall"}.webp`,
      icon2: a => `${ASSETS}Cumflated${AFLP.pregnancyPastHalfTerm?.(a) ? 8 : 0}.webp`,
      desc: a => AFLP.pregnancyPastHalfTerm?.(a)
        ? (AFLP.system?.pregnancyLateText?.() ?? "Past half term and showing.")
        : (AFLP.system?.pregnancyEarlyText?.() ?? "Carrying, but not showing yet."),
      value: a => pregnancySums(a).eggs },
    { key: "arousal", label: "Arousal", color: "#ff5f9e", glyph: "\u2665", band: 4,
      icon: { cond: "arousal" }, uuidFrom: { cond: "arousal" }, value: a => arousalPips(a) },

    // Drives
    { key: "horny", color: "#ff7a86", glyph: "\u2661", band: 4,
      icon: { cond: "horny" }, uuidFrom: { cond: "horny" },
      label: a => AFLP.cond.has(a, "horny-always") ? "Horny (Always)" : "Horny",
      // Numeral = the sheet's Horny pips (temp + permanent); the row also
      // shows unvalued when only the condition is present.
      value: a => {
        const pips = hornyPips(a);
        if (pips > 0) return pips;
        return AFLP.cond.has(a, "horny") || AFLP.cond.has(a, "horny-always");
      } },
    { key: "breeding", label: "Fertility", color: "#ec7ab0", glyph: "\u26B8", band: 4,
      icon: { cond: "breeding" }, uuidFrom: { cond: "breeding" },
      // I = Potion of Breeding, II = the Permanent effect (kept in sync by the
      // effect->condition hooks); a bare condition with no value shows as I.
      value: a => AFLP.cond.value(a, "breeding") || (AFLP.cond.has(a, "breeding") ? 1 : 0) },

    // Roles
    { key: "dominating", label: "Dominating", color: "#ec7a7a", glyph: "\u25B2", band: 5,
      icon: { cond: "dominating" }, value: a => AFLP.cond.has(a, "dominating") },
    { key: "submitting", label: "Submitting", color: "#e08aae", glyph: "\u25BC", band: 5,
      icon: { cond: "submitting" }, value: a => AFLP.cond.has(a, "submitting") && !AFLP.cond.has(a, "stuck-submitting") },
    { key: "stuck-submitting", label: "Stuck Submitting", color: "#d47ab0", glyph: "\u26D3", band: 5,
      icon: { cond: "stuck-submitting" }, value: a => AFLP.cond.has(a, "stuck-submitting") },
    { key: "swallowed", label: "Swallowed", color: "#c98a6a", glyph: "\u21A7", band: 5,
      icon: { cond: "swallowed" }, value: a => AFLP.cond.has(a, "swallowed") },

    // Buffs
    { key: "afterglow", label: "Afterglow", color: "#ffd97a", glyph: "\u2600", band: 6,
      icon: { cond: "afterglow" }, value: a => AFLP.cond.has(a, "afterglow") },
    { key: "birth-control", label: "Birth Control", color: "#5fb478", glyph: "\u2298", band: 6,
      icon: { cond: "birth-control" }, uuidFrom: { cond: "birth-control" },
      value: a => AFLP.cond.has(a, "birth-control") },
  ];

  // Temporary effects the GM can clear straight from the panel via the hover X.
  // Permanent/structural things (kinks, titles, anatomy features, pregnancy, and
  // cumflation-derived rows) are intentionally excluded - those change on the
  // sheet's edit menu, not here.
  const REMOVABLE_STATUS = new Set([
    "mind-break", "bimbofied", "bullified", "hypnotized", "entranced", "exposed",
    "defeated", "denied", "toasted", "dubious-consent", "masturbating", "horny",
    "dominating", "submitting", "stuck-submitting", "swallowed", "afterglow", "breeding",
  ]);

  // Clear one temporary status from an actor. stuck-submitting and swallowed run
  // their own teardown; everything else goes through the cond layer.
  //
  // EXCEPT the two keys with two stores. `horny` and `denied` live in the valued
  // condition on Daggerheart and in a legacy world flag on Pathfinder and 5e, so
  // `AFLP.cond.remove` cleared nothing at all on PF2e - the X did visibly
  // nothing. They clear to their FLOOR rather than to zero, which is deliberate:
  // a sustained floor means the reason is still true - a chastity harness still
  // worn, Aphrodisiac Junkie Mastery's permanent 3 - and an X that silently
  // repealed those would be worse than one that appears to do nothing. Remove
  // the gear, or edit the floor on the sheet's status editor.
  // GOES STALE IF: a third key gains a second store.
  async function _removeStatus(actor, key) {
    if (!actor || !key) return;
    try {
      if (key === "stuck-submitting") { await AFLP.stuckSubmitting?.free?.(actor); return; }
      if (key === "swallowed") { await AFLP.swallowed?.free?.(actor); return; }
      if (key === "horny")  { await AFLP.horny.clearTemp(actor);  return; }
      if (key === "denied") { await AFLP.denied.settleTo(actor);  return; }
      await AFLP.cond?.remove?.(actor, key);
    } catch (e) { console.warn("AFLP | status remove failed:", key, e?.message); }
  }

  // ── Icon resolution ───────────────────────────────────────────────────────
  // Resolve a canonical (registry / PF2e-shaped) content UUID to the UUID that
  // exists in the RUNNING world:
  //  - sf2e: pack-segment + Compendium.pf2e -> sf2e twins (AFLP.sysUuid).
  //  - Daggerheart (and any future adapter): the adapter maps the canonical
  //    key to its own content pack item (aflr-dh-items) via resolveContentUuid.
  //  - pf2e: passthrough.
  // Both the icon index lookup and click/hover resolution go through this so
  // every surface agrees on one id per world.
  function _resolveContentUuid(uuid) {
    if (!uuid) return uuid;
    let u = AFLP.sysUuid?.(uuid) ?? uuid;              // sf2e (no-op elsewhere)
    try { u = AFLP.system?.resolveContentUuid?.(u) ?? u; } catch (_) {}  // DH/5e
    return u;
  }
  // Cache the world content pack's index once (name -> img, id -> img). On DH
  // the module content lives in aflr-dh-items (via the adapter), not the
  // absent pf2e pack CONTENT_ITEMS_PACK names - so index every pack the active
  // adapter declares plus the resolved content pack, and de-dupe by pack id.
  let _iconIndex = null;
  function _contentPackIds() {
    const ids = new Set();
    const cip = AFLP.CONTENT_ITEMS_PACK;
    if (game.packs.get(cip)) ids.add(cip);
    try {
      for (const name of AFLP.system?.contentPackIds?.() ?? []) {
        const full = `${MOD}.${name}`;
        if (game.packs.get(full)) ids.add(full);
      }
    } catch (_) {}
    // Fallbacks by system when the adapter does not enumerate.
    for (const name of ["aflp-lewd-items", "aflr-dh-items", "aflr-sf2e-items"]) {
      const full = `${MOD}.${name}`;
      if (game.packs.get(full)) ids.add(full);
    }
    return [...ids];
  }
  async function _buildIconIndex() {
    if (_iconIndex) return _iconIndex;
    _iconIndex = { byName: new Map(), byId: new Map() };
    for (const packId of _contentPackIds()) {
      try {
        const pack = game.packs.get(packId);
        const idx = await pack?.getIndex({ fields: ["img"] });
        for (const e of idx ?? []) {
          if (!e.img) continue;
          if (!_iconIndex.byName.has(e.name)) _iconIndex.byName.set(e.name, e.img);
          _iconIndex.byId.set(e._id, e.img);
        }
      } catch (e) { console.warn("AFLP | status icon index failed:", packId, e?.message); }
    }
    return _iconIndex;
  }
  function _iconFor(def, actor, key = "icon") {
    // Glyph-set mode: the user prefers the clean colored placeholders over
    // per-item compendium art. Return null so the tile falls back to its glyph.
    if (_glyphMode()) return null;
    let spec = def[key];
    if (typeof spec === "function") spec = spec(actor);
    if (!spec) return null;
    if (typeof spec === "string") return spec;
    if (spec.item) return _iconIndex?.byName.get(spec.item) ?? null;
    const uuid = spec.uuid ?? (spec.cond ? AFLP.conditions?.[spec.cond]?.uuid : null);
    if (uuid) {
      const id = _resolveContentUuid(uuid).split(".").pop();
      return (id && _iconIndex?.byId.get(id)) ?? null;
    }
    return null;
  }
  // The document a status row opens / summarizes: explicit uuid on the row def,
  // else the registry condition it displays, resolved to the running world.
  // Does this uuid point at an item that exists in THIS world?
  function _uuidIsReal(u) {
    if (!u) return false;
    const q = String(u).split(".");
    if (q[0] !== "Compendium") return true;          // world documents: assume live
    return !!game.packs.get(q[1] + "." + q[2])?.index?.get(q[q.length - 1]);
  }

  function _uuidFor(def) {
    // Prefer the content KEY. Registry entries such as BODY_FEATURES carry a
    // hardcoded PF2e uuid plus a key, and outside PF2e that uuid points into a
    // pack the world has not loaded - which is why the four Training rows and the
    // Pussy row had no tooltip in Daggerheart while Tits did: Tits happens to
    // carry no raw uuid, so it fell through to a path that worked.
    // `ckey` may be a STRING or an ARRAY of candidate keys, and the array form is
    // load-bearing: a concept the two systems name differently has no single key
    // to ask for. Defeat/Defeated is the worked case - Daggerheart's card is
    // `defeat`, Pathfinder's is `defeated`, and contentUuid cannot bridge that
    // because it only redirects a canonical uuid to a copy under THE SAME KEY.
    //
    // First that RESOLVES wins. Never `?? ` down a list of uuids - a dead uuid is
    // a truthy string and would win over a live one behind it.
    for (const k of (Array.isArray(def.ckey) ? def.ckey : (def.ckey ? [def.ckey] : []))) {
      const byKey = AFLP.system?.contentUuid?.(k);
      if (_uuidIsReal(byKey)) return byKey;
    }
    const raw = def.uuid
      ?? (def.uuidFrom?.cond ? AFLP.conditions?.[def.uuidFrom.cond]?.uuid : null)
      ?? (def.icon?.cond ? AFLP.conditions?.[def.icon.cond]?.uuid : null);
    if (!raw) return null;
    const resolved = _resolveContentUuid(raw);
    // A dead uuid produces an empty tooltip rather than none at all, which reads
    // as a broken row. Better to report nothing to show.
    return _uuidIsReal(resolved) ? resolved : null;
  }

  // ── Row evaluation ────────────────────────────────────────────────────────
  const HOLE_LABELS = { pussy: "Pussy", oral: "Throat", anal: "Ass", onahole: "Tits" };
  const _pretty = (slug) => String(slug).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  // Title-case a free-text creature type. The kink notes are typed by hand and
  // read lowercase ("animal", "giant ooze"), but the panel shows them beside
  // registry names like "Clutch" and "Fertile", so they need to match.
  // Creature Fetish shows its types the way anatomy shows genital subtypes
  // ("Pussy - Clutch, Fertile"), because the kink is inert until one is listed:
  // the per-turn Arousal only fires when a matching creature is within 30ft.
  // The numeral is the effect's value (the Arousal per tick), NOT the kink flag,
  // and it folds into the label so the row reads "Creature Fetish VI - Animal"
  // instead of "Creature Fetish - Animal VI".
  function _cfRow(actor, label, num) {
    const v = Number(AFLP.cond?.value?.(actor, "creature-fetish")) || 0;
    const n = v > 0 ? rom(v) : num;
    const types = _cfTypes(actor).map(_titleCase);
    if (!types.length) return { label, num: n };
    return { label: `${label}${n ? ` ${n}` : ""} - ${types.join(", ")}`, num: "" };
  }

  const _titleCase = (s) => String(s).trim().split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  // Panel display names for catch-all effect items: strip the "Effect: "
  // prefix and parentheticals, then apply fun short forms. The full item name
  // stays on the document itself (mouseover summary / click-through).
  const _STATUS_NAMES = {
    "Smother": "Smothered",
    "Flirt": "Flirting",
    "Scaroused": "Scaroused",
    "Lusty Milk Maid Immunity": "Milk Maid's Blessing",
    "Tail of the Moon-Hunted": "Moon-Hunted",
    "Portal Sex Monster Cock": "Portal Cocked",
  };
  function _statusName(raw) {
    let n = String(raw).replace(/^Effect:\s*/i, "").replace(/\s*\((?:Permanent|Temporary)\)\s*$/i, "").trim();
    return _STATUS_NAMES[n] ?? n;
  }

  // Everything beyond the static registry: size training tracks, granted body
  // features, kinks, and a catch-all for any other AFLR-origin effect or
  // condition item on the actor, so the panel really does show ALL of it.
  function dynamicRows(actor) {
    const rows = [];
    const knownIds = new Set();
    const _idOf = (uuid) => String(uuid ?? "").split(".").pop();
    for (const c of Object.values(AFLP.conditions ?? {})) if (c?.uuid) knownIds.add(_idOf(c.uuid));
    // Effects already represented by a registry status row: both Potion of
    // Breeding effects (-> Breeding Fertility I/II) and the Birth Control
    // effect (-> Birth Control).
    for (const k of ["potion-of-breeding-effect", "potion-of-breeding-effect-permanent"]) {
      const u = AFLP.items?.[k]?.uuid; if (u) knownIds.add(_idOf(u));
    }
    for (const id of _customSourceIds()) knownIds.add(id);

    // Size training pips (Pussy / Throat / Ass). Once a hole maxes out it grants
    // its Body Feature, and the row names both - "Pussy Training VI - Size Queen"
    // - the same shape anatomy uses for genital subtypes. The pip count is read
    // live rather than assumed to be the cap, because Body Features persist
    // through long-rest decay: a rested Size Queen honestly reads as V.
    const train = AFLP.sizeTrainingOf?.(actor) ?? {};
    const bf = actor.getFlag?.(F(), "bodyFeatures") ?? {};
    for (const [key, fdef] of Object.entries(AFLP.BODY_FEATURES ?? {})) {
      knownIds.add(_idOf(fdef.uuid));
      const pips = Math.max(0, Number(train[key] ?? 0) | 0);
      const hole = HOLE_LABELS[key] ?? _pretty(key);
      if (bf[key]) {
        const num = pips > 0 ? ` ${rom(pips)}` : "";
        // Body features are EARNED by training - Size Queen, Gape Glutton, Throat
        // Goat, Paizuri Slut - so they belong in the training band with the pips
        // that produced them, not in the body band with the anatomy itself.
        rows.push({ def: { key: `bf-${key}`, color: "#e88fb0", glyph: "\u2726", band: 2,
          icon: { cond: null, uuid: fdef.uuid }, uuid: fdef.uuid, ckey: fdef.slug },
          label: `${hole} Training${num} - ${fdef.name}`, num: "" });
      } else {
        if (pips > 0) rows.push({ def: { key: `train-${key}`, color: "#e79a86", glyph: "\u25D4", band: 2,
          icon: { cond: null, uuid: fdef.uuid }, uuid: fdef.uuid, ckey: fdef.slug }, label: `${hole} Training`, num: rom(pips) });
      }
    }

    // Anatomy: one row per genital the actor has, subtypes folded into the
    // label ("Pussy - Clutch, Fertile"). Icons, click-through, and mouseover
    // come from the base genital's registry item; band 6 keeps anatomy at the
    // bottom of the stack under kinks.
    const gt = actor.getFlag?.(F(), "anatomyFeatures") ?? {};
    // ALL FIVE REGISTRY BASES, not three. `ass` and `throat` are bases with
    // `parent: null` exactly like the others and carry the two LONGEST subtype
    // lists in the registry - 17 ass-* and 7 throat-* - and none of it could
    // render here until 16 Aug 2026, because this array said pussy/cock/tits.
    //
    // THE BASES USE THREE DIFFERENT DETECTION RULES, and getting that wrong is
    // how a row silently disappears:
    //   pussy, cock   top-level actor flags, default OFF -> test === true
    //   tits          anatomyFeatures, default OFF, but ALSO true when any
    //                 tits-* subtype is set without the base key
    //   ass, throat   anatomyFeatures, default ON -> test !== false
    //
    // That last one is the trap. `sheet-tab.js` reads both as `!== false`
    // everywhere - the read-only render, the edit toggles, and the save's
    // explicit `?? true` - because everyone has an ass and a throat unless a GM
    // removed it. Written as a truthiness test, both rows would vanish on every
    // actor whose flag bag has never been written, which is most of them.
    //
    // WHAT WOULD MAKE THIS STALE: a sixth base gaining `parent: null` in
    // AFLP.anatomyFeatures. The list stays hand-maintained because the detection
    // rule is per-base and cannot be derived from the registry.
    const _hasBase = (base) => {
      if (base === "tits") return gt["tits"] === true
        || Object.keys(gt).some(k => k.startsWith("tits-") && gt[k]);
      if (base === "ass" || base === "throat") return gt[base] !== false;
      return actor.getFlag?.(F(), base) === true;
    };
    for (const base of ["pussy", "cock", "tits", "ass", "throat"]) {
      if (!_hasBase(base)) continue;
      const bdef = AFLP.anatomyFeatures?.[base];
      const subs = Object.entries(AFLP.anatomyFeatures ?? {})
        .filter(([k, d]) => d?.parent === base && gt[k])
        .map(([, d]) => d.name);
      const label = (bdef?.name ?? _pretty(base)) + (subs.length ? ` - ${subs.join(", ")}` : "");
      // Tooltip and click-through source, in order: the registry uuid, then the
      // content index by key, then the first subtype the actor actually has.
      // Neither source covers everything - pussy and cock carry registry uuids
      // but are not in the index, while tits and throat are the reverse - so a
      // tits row had no uuid at all and could never open or hover. Resolving by
      // key also keeps this working in DH, where a hardcoded PF2e uuid is dead.
      const subKeys = Object.entries(AFLP.anatomyFeatures ?? {})
        .filter(([k, d]) => d?.parent === base && gt[k]).map(([k]) => k);
      // ?? only falls through on null, and a registry uuid is a truthy STRING even
      // when it points into a pack this world has not loaded. So pussy and cock
      // won with a dead PF2e uuid in DH and never reached the working fallback -
      // which is why those rows had no mouseover while tits, carrying no registry
      // uuid at all, did. Take the first candidate that actually resolves.
      const rowUuid = [
        bdef?.uuid,
        AFLP.system?.contentUuid?.(base),
        ...subKeys.map(k => AFLP.anatomyFeatures?.[k]?.uuid),
        ...subKeys.map(k => AFLP.system?.contentUuid?.(k)),
      ].find(u => _uuidIsReal(u)) ?? null;
      // Colour and glyph per base. Ass and throat get their own so five rows on
      // one creature stay tellable apart at a glance, which is the whole job of
      // this column - the label already carries the subtype list.
      const _COL = { pussy: "#ef8fb5", tits: "#efc99d", ass: "#e0a3c8", throat: "#a8d8cf" };
      const _GLY = { pussy: "\u2640", tits: "\u25C9", ass: "\u25D1", throat: "\u25CB" };
      rows.push({ def: { key: `gen-${base}`, color: _COL[base] ?? "#9db4ef",
        glyph: _GLY[base] ?? "\u2642", band: 1,
        icon: rowUuid ? { uuid: rowUuid } : null, uuid: rowUuid, ckey: base },
        label, num: "" });
    }

    // Kinks (sexual.kinks map; leveled kinks show their tier numeral).
    // Skip any kink that a static registry status already represents (e.g.
    // hypno-slave, which shows as a band-0 affliction), so it appears once.
    const kinks = actor.getFlag?.(F(), "sexual")?.kinks ?? {};
    const registryKeys = new Set(AFLP.STATUS_DEFS.map(d => d.key));
    for (const [slug, val] of Object.entries(kinks)) {
      if (!val) continue;
      if (registryKeys.has(slug)) continue;
      const kdef = AFLP.kinks?.[slug];
      if (kdef?.uuid) knownIds.add(_idOf(kdef.uuid));
      let kLabel = kdef?.name ?? _pretty(slug);
      let kNum = (typeof val === "number" && val > 1) ? rom(val) : "";
      if (slug === "creature-fetish") ({ label: kLabel, num: kNum } = _cfRow(actor, kLabel, kNum));
      rows.push({ def: { key: `kink-${slug}`, color: "#dca0d0", glyph: "\u2727", band: 7,
        icon: kdef?.uuid ? { uuid: kdef.uuid } : null, uuid: kdef?.uuid ?? null },
        label: kLabel, num: kNum });
    }

    // Catch-all: any other AFLR-origin effect/condition item on the actor
    // (potion effects, sentient gear auras, alcumical states...). Items whose
    // source is already represented by a registry status are skipped, as are
    // the cumflation tier effects (Creampied / Covered in Cum cover those).
    for (const item of actor.items ?? []) {
      if (!["effect", "condition"].includes(item.type)) continue;
      if (!isAflrOrigin(item)) continue;
      if (/^Cumflated/i.test(item.name)) continue;
      const srcId = _idOf(item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? "");
      if (srcId && knownIds.has(srcId)) continue;
      const badge = Number(item.system?.badge?.value ?? 0);
      let label = _statusName(item.name);
      let num   = badge > 0 ? rom(badge) : "";
      // Creature Fetish names its creature types the way anatomy names its
      // subtypes ("Pussy - Clutch, Fertile"), because the kink does nothing at
      // all until a type is listed: the per-turn Arousal only fires when one of
      // them is within 30ft. The numeral folds into the label so the row reads
      // "Creature Fetish VI - Animal" rather than "Creature Fetish - Animal VI".
      if (/^creature\s*fetish$/i.test(item.name)) ({ label, num } = _cfRow(actor, label, num));
      rows.push({ def: { key: `item-${item.id}`, color: "#d99aa8", glyph: "\u25C8", band: 7,
        icon: item.img || null, uuid: item.uuid }, label, num });
    }
    return rows;
  }

  // ── GM-defined custom statuses ────────────────────────────────────────────
  // World setting "statusCustomDefs": [{ label, uuid, color }]. A custom
  // status shows whenever the actor carries an item sourced from that UUID
  // (drag any effect/condition item - from any module or the world - onto the
  // actor). The row uses the embedded item's art and badge value, and the
  // UUID drives click-through and the mouseover summary like built-ins.
  function _customDefs() {
    try {
      const raw = game.settings.get(MOD, "statusCustomDefs") ?? [];
      return Array.isArray(raw) ? raw.filter(d => d && d.uuid && d.label) : [];
    } catch { return []; }
  }
  // Curated glyph palette offered in the custom-status editor.
  const CUSTOM_GLYPHS = ["\u25C8","\u2726","\u2727","\u2732","\u2740","\u2665","\u2661","\u2620",
    "\u26A1","\u2668","\u2603","\u2695","\u26AD","\u25C9","\u25CE","\u2298","\u26D4","\u2600",
    "\u263D","\u2744","\u2764","\u2691","\u269C","\u2698","\u2622","\u2604"];
  function customRows(actor) {
    const defs = _customDefs();
    if (!defs.length) return [];
    const rows = [];
    for (const cd of defs) {
      const item = (actor.items ?? []).find(i => {
        const src = String(i.flags?.core?.sourceId ?? i._stats?.compendiumSource ?? i.sourceId ?? "");
        return src === cd.uuid || i.uuid === cd.uuid;
      });
      if (!item) continue;
      const badge = Number(item.system?.badge?.value ?? 0);
      // Glyph mode (or no mapped art) uses the chosen custom glyph; otherwise
      // the mapped item's art, with the glyph as fallback.
      const glyph = cd.glyph || "\u25C8";
      rows.push({ def: { key: `custom-${cd.uuid.slice(-8)}`, color: cd.color || "#d99aa8",
        glyph, band: 7, icon: _glyphMode() ? null : (item.img || null), uuid: cd.uuid },
        label: cd.label, num: badge > 0 ? rom(badge) : "" });
    }
    return rows;
  }
  // Custom-mapped source items are excluded from the generic catch-all so a
  // mapped effect shows once, under the GM's chosen name.
  function _customSourceIds() {
    return new Set(_customDefs().map(d => String(d.uuid).split(".").pop()));
  }

  // Editor (GM): opened from the "Custom Status Effects" settings menu button.
  async function openCustomEditor() {
    if (!game.user.isGM) return;
    const defs = _customDefs();
    const glyphOpts = (sel) => CUSTOM_GLYPHS.map(g =>
      `<option value="${g}"${g === (sel || CUSTOM_GLYPHS[0]) ? " selected" : ""}>${g}</option>`).join("");
    const row = (d = {}) => `
      <div class="aflp-cse-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
        <input type="text" data-f="label" placeholder="Display name" value="${(d.label ?? "").replace(/"/g, "&quot;")}" style="flex:0 0 140px;"/>
        <input type="text" data-f="uuid" placeholder="Item UUID (Compendium.module.pack.Item.id)" value="${(d.uuid ?? "").replace(/"/g, "&quot;")}" style="flex:1;"/>
        <select data-f="glyph" title="Glyph icon" style="flex:0 0 46px;height:26px;text-align:center;">${glyphOpts(d.glyph)}</select>
        <input type="color" data-f="color" value="${d.color || "#d99aa8"}" style="flex:0 0 34px;height:26px;padding:1px;"/>
        <button type="button" class="aflp-cse-del" title="Remove" style="flex:0 0 26px;">\u2715</button>
      </div>`;
    const content = `
      <p style="font-size:11px;color:#8f7fb0;margin:0 0 8px;">Map any effect or condition item to a status row: paste the item's UUID (right-click its sheet header \u2192 Copy UUID). Pick a glyph and colour - the panel uses the glyph in its default glyph-icon mode (and as the fallback if the item art is missing). The row shows while an actor carries an item from that source, with badge value, click-through, and mouseover summary.</p>
      <div class="aflp-cse-rows">${defs.map(row).join("")}</div>
      <button type="button" class="aflp-cse-add" style="margin-top:2px;">+ Add status</button>`;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: "Custom Status Effects" },
      position: { width: 560 },
      content,
      buttons: [
        { action: "save", label: "Save", default: true,
          callback: (ev, btn, dlg) => {
            const out = [];
            for (const r of dlg.element.querySelectorAll(".aflp-cse-row")) {
              const v = (f) => r.querySelector(`[data-f="${f}"]`)?.value?.trim() ?? "";
              const label = v("label"), uuid = v("uuid"), color = v("color"), glyph = v("glyph");
              if (label && uuid) out.push({ label, uuid, color, glyph: glyph || undefined });
            }
            return out;
          } },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      close: () => null,
      rejectClose: false,
      render: (ev, dlg) => {
        const rowsEl = dlg.element.querySelector(".aflp-cse-rows");
        dlg.element.querySelector(".aflp-cse-add")?.addEventListener("click", () => {
          const tmp = document.createElement("div");
          tmp.innerHTML = row();
          rowsEl.append(tmp.firstElementChild);
        });
        dlg.element.addEventListener("click", (e) => {
          if (e.target.closest?.(".aflp-cse-del")) e.target.closest(".aflp-cse-row")?.remove();
        });
      },
    }, { classes: ["aflp-dialog"] });
    // DialogV2 quirk: null-returning callbacks resolve to the action string.
    if (!Array.isArray(result)) return;
    await game.settings.set(MOD, "statusCustomDefs", result);
    _refreshDocksFor(null); refreshSceneDocks(); refreshHud();
  }

  // One row per filled cumflation hole, replacing the old Creampied / Covered in
  // Cum aggregates. Each carries its own tier word, tier colour, tier art, the
  // pack item for that tier (click to read in full), and a generated rules line.
  //
  // The rules line is derived, not authored: per the Cumflated items, the overall
  // value is cosmetic and the penalty comes only from a hole filled to 8 - so any
  // "-1 Dex" text below tier 8 would be a lie, and a hand-written summary would
  // drift the moment the items change.
  // One item per pool now, not one per tier: `single` is its uuid and the tier
  // flavour rides on that item's tierFlavour flag (read at tooltip time).
  // Order is deliberate: everything FILLED first, then everything COATED, and
  // each group runs head to toe - the same split and the same top-to-bottom
  // reading as the sheet doll's Head / Torso / Lower body regions. The old order
  // interleaved the two (oral, vaginal, anal, tits, facial, chest), so a filled
  // hole and a coat sat next to each other with nothing to tell them apart.
  // Labels match the sheet: the tits HOLE reads "Tits", the chest SURFACE reads
  // "Chest". Two rows both saying Tits was the defect being fixed.
  const CF_ROW_HOLES = [
    // filled - cum inside
    { hole: "oral",     label: "Oral",    single: "oral",    coat: false },
    { hole: "onahole",  label: "Tits",    single: "onahole", coat: false },
    { hole: "vaginal",  label: "Vaginal", single: "vaginal", coat: false },
    { hole: "anal",     label: "Anal",    single: "anal",    coat: false },
    // coated - cum outside
    { hole: "facial",   label: "Facial Coat", single: "cumcoat-facial", coat: true },   // matches the sheet, 29 Aug 2026
    { hole: "bodyCoat", label: "Chest Coat", single: "cumcoat-tits", coat: true },   // matches the sheet and the cards, 29 Aug 2026
  ];
  // Each system states its own rule - see the adapters. This used to be PF2e text
  // shown in every world, so a Daggerheart GM read about Clumsy, AC and a
  // three-action Purge, none of which exist in that system.
  const CF_MECH = (tier) => tier >= CF_MAX
    ? (AFLP.system?.cumflationMaxText?.(CF_MAX) ?? "Filled to the brim.")
    : (AFLP.system?.cumflationBelowMaxText?.(CF_MAX) ?? `No penalty yet - penalties begin at ${CF_MAX}.`);

  function cumflationRows(actor) {
    const out = [];
    try {
      const cf = actor.getFlag?.(F(), "cumflation") ?? {};
      const hasTits = (actor.getFlag?.(F(), "anatomyFeatures") ?? {})["tits"] === true;
      for (const def of CF_ROW_HOLES) {
        const tier = Math.max(0, Math.min(CF_MAX, Number(cf[def.hole] ?? 0)));
        if (tier <= 0) continue;
        // The chest pool reads two ways: tits ladder for a tits-having actor.
        const wordHole = (def.hole === "bodyCoat" && hasTits) ? "tits" : def.hole;
        const w = AFLP.cumflationWordForTier?.(tier, wordHole);
        const label = w?.word ?? `${def.label} ${tier}`;
        const uuid = def.coat ? (AFLP.coatItems?.[def.single] ?? null)
                              : (AFLP.cumflationItems?.[def.single] ?? null);
        out.push({
          def: {
            key: `cf-${def.hole}`, band: 3,
            color: w?.color ?? "#f2e3ef",
            glyph: "\u25CF",
            icon: _cfArt(wordHole, tier, hasTits),
            uuid,
            // GATE THE FALLBACK ON THE UUID RESOLVING, NOT ON IT EXISTING.
            //
            // These uuids are hardcoded PATHFINDER items - there are no
            // cumflation tier items in the Daggerheart or 5e packs at all
            // (measured 17 Aug 2026: contentUuid returns null for every
            // candidate key). So outside Pathfinder `uuid` is a truthy string
            // pointing into a pack the world has not loaded, and `uuid ? ""` then
            // suppressed the fallback prose - leaving the row with no flavour at
            // all, only the mechanic line. A dead uuid is truthy; that is the
            // whole trap.
            desc: _uuidIsReal(uuid) ? "" : `${def.label} coating, tier ${tier}.`,
            mech: CF_MECH(tier),
            tierFlavour: { uuid, tier },
          },
          label, num: rom(tier),
        });
      }
    } catch (e) { console.warn("AFLP | cumflation status rows failed:", e?.message); }
    return out;
  }

  function activeRows(actor) {
    const rows = [];
    for (const def of AFLP.STATUS_DEFS) {
      let v;
      try { v = def.value(actor); } catch (e) { continue; }
      if (!v) continue;
      const label = typeof def.label === "function" ? def.label(actor) : def.label;
      const num = (typeof v === "number" && v > 0) ? rom(v) : "";
      rows.push({ def, label, num });
    }
    try { rows.push(...cumflationRows(actor)); } catch (e) { console.warn("AFLP | cumflation rows failed:", e?.message); }
    try { rows.push(...dynamicRows(actor)); } catch (e) { console.warn("AFLP | dynamic status rows failed:", e?.message); }
    try { rows.push(...customRows(actor)); } catch (e) { console.warn("AFLP | custom status rows failed:", e?.message); }
    // Chosen title row: sits at the very top (band -1) in red. Reads the actor's
    // displayed title, honoring the "__none__" opt-out sentinel and the
    // most-recent fallback the sheet uses. Suppressed when None/unset.
    try {
      const sx = actor.getFlag?.(F(), "sexual") ?? {};
      const raw = sx.displayTitle ?? null;
      if (raw !== "__none__") {
        const held = (sx.titles ?? []).filter(id => window.AFLP_Titles?.resolveTitle?.(id));
        let tid = raw && held.includes(raw) ? raw : (held.length ? held[held.length - 1] : null);
        const t = tid ? window.AFLP_Titles?.resolveTitle?.(tid) : null;
        if (t) {
          rows.push({
            def: { key: "chosen-title", color: "#e0607a", glyph: "\u2605", band: -1,
              icon: null, uuid: null, desc: t.desc ?? "", _titleActorId: actor.id },
            label: t.name, num: "",
          });
        }
      }
    } catch (e) { /* non-fatal */ }
    // Band first, then key, so rows inside a band keep a stable order instead of
    // shuffling between renders on whatever order they happened to be pushed in.
    rows.sort((a, b) =>
      (_bandRank(a.def.band ?? 9) - _bandRank(b.def.band ?? 9)) ||
      String(a.def.key ?? "").localeCompare(String(b.def.key ?? "")));
    return rows;
  }

  // ── Renderer (hex variant) ────────────────────────────────────────────────
  function renderRows(actor, rows) {
    return rows.map(({ def, label, num }) => {
      const icon = _iconFor(def, actor);
      const img = icon ? `<img src="${icon}" onerror="this.remove()" alt=""/>` : "";
      // A second tile, where one row states two facts (pregnancy: type + term).
      const icon2 = _iconFor(def, actor, "icon2");
      const tile2 = icon2 ? `<span class="aflp-sp-tile aflp-sp-tile2"><img src="${icon2}" onerror="this.remove()" alt=""/></span>` : "";
      const numHtml = num ? ` <span class="aflp-sp-num">${num}</span>` : "";
      const uuid = _uuidFor(def);
      const uuidAttr = uuid ? ` data-uuid="${uuid}"` : "";
      // The chosen-title row opens the owning actor's AFLR sheet on click.
      const titleAttr = def._titleActorId ? ` data-title-actor="${def._titleActorId}"` : "";
      // No document to open? A static summary still shows on mouseover.
      // desc may be a function of the actor (pregnancy reports a different line
      // before and after half term). String(fn) would dump the source into the DOM.
      const descVal = typeof def.desc === "function" ? def.desc(actor) : def.desc;
      const desc = descVal ? ` data-desc="${String(descVal).replace(/"/g, "&quot;")}"` : "";
      const mech = def.mech ? ` data-mech="${String(def.mech).replace(/"/g, "&quot;")}"` : "";
      // Cumflation rows read their prose from the item's tierFlavour[tier-1], so
      // one item can speak for all 8 pips.
      const tf = def.tierFlavour?.uuid ? ` data-flavour-uuid="${def.tierFlavour.uuid}" data-flavour-tier="${def.tierFlavour.tier}"` : "";
      return `<div class="aflp-sp-row${uuid || def._titleActorId ? " linked" : ""}${(desc || mech) && !uuid ? " tipped" : ""}${REMOVABLE_STATUS.has(def.key) ? " removable" : ""}" style="--c:${def.color}" data-status="${def.key}"${uuidAttr}${titleAttr}${desc}${mech}${tf}>
        <span class="aflp-sp-tile">${img}<span class="aflp-sp-glyph">${def.glyph}</span></span>
        <span class="aflp-sp-lab">${label}${numHtml}</span>
        ${tile2}
        ${REMOVABLE_STATUS.has(def.key) ? '<span class="aflp-sp-x" title="Remove this effect">\u2715</span>' : ""}
      </div>`;
    }).join("");
  }

  // Click a status -> open its document; hover -> short description summary.
  const _descCache = new Map();

  // Flatten pack HTML to the one-line tooltip string.
  //
  // The space matters. textContent concatenates with NO separator at a block
  // boundary, so `</p><p>` and `</li><li>` run the last word of one block into
  // the first word of the next: "instead of 1.You can use a reaction". That was
  // already true of paragraphs and it is why several tooltips read as typos; the
  // kink cards gained bullet lists on 8 Aug 2026, which would have multiplied it
  // by every list item. Both callers go through here so the next one cannot
  // drift - this logic was duplicated verbatim in _tierFlavour and _summaryFor.
  const _flatten = (raw) => {
    const div = document.createElement("div");
    div.innerHTML = String(raw ?? "").replace(/<(?:\/(?:p|li|ul|ol|div|h[1-6]|tr|td)|br\s*\/?|hr\s*\/?)>/gi, "$& ");
    let text = (div.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 240) text = text.slice(0, 240).replace(/\s+\S*$/, "") + "\u2026";
    return text;
  };
  // The tier line for a cumflation pip, off the item's tierFlavour flag. Same
  // cache/truncate contract as _summaryFor, keyed per uuid+tier.
  async function _tierFlavour(uuid, tier) {
    const key = `${uuid}#${tier}`;
    if (_descCache.has(key)) return _descCache.get(key);
    let text = "";
    try {
      const doc = await fromUuid(uuid);
      const arr = doc?.flags?.["ardisfoxxs-lewd-pf2e"]?.tierFlavour;
      const raw = Array.isArray(arr) ? (arr[Math.max(0, Math.min(7, tier - 1))] ?? "") : "";
      text = _flatten(raw);
    } catch (_) {}
    _descCache.set(key, text);
    return text;
  }

  async function _summaryFor(uuid) {
    if (_descCache.has(uuid)) return _descCache.get(uuid);
    let text = "";
    try {
      const doc = await fromUuid(uuid);
      const raw = doc?.system?.description?.value ?? doc?.system?.description ?? "";
      text = _flatten(raw);
    } catch (_) {}
    _descCache.set(uuid, text);
    return text;
  }
  // Self-owned tooltip. We do NOT use game.tooltip: some systems replace the
  // core TooltipManager (Daggerheart's DHPTooltipCardManager) with one that
  // ignores max-width - text never wraps - and rescales the font on alternate
  // activations (its rescaleTooltipIfNeeded), so every other hover shrinks.
  // Our own fixed-width, wrapping element sidesteps all of that everywhere.
  let _tipEl = null;
  let _tipAnchor = null;      // the row the tip is currently attached to
  let _tipToken = 0;          // invalidates in-flight async hovers
  let _tipDelay = null;       // pointerout -> start-of-fade timer
  let _tipFade = null;        // fade -> display:none timer
  let _tipWatch = null;       // failsafe poll while a tip is up

  function _tipClearTimers() {
    if (_tipDelay) { clearTimeout(_tipDelay); _tipDelay = null; }
    if (_tipFade)  { clearTimeout(_tipFade);  _tipFade  = null; }
  }
  function _tipStopWatch() { if (_tipWatch) { clearInterval(_tipWatch); _tipWatch = null; } }

  // A panel refresh replaces the hovered row outright, so pointerout never fires
  // on it and the tip used to sit on screen forever. Poll while a tip is visible:
  // if its anchor left the DOM, or the pointer is no longer over it, fade out.
  function _tipStartWatch() {
    if (_tipWatch) return;
    _tipWatch = setInterval(() => {
      if (!_tipEl || _tipEl.style.display === "none") { _tipStopWatch(); return; }
      const gone = !_tipAnchor || !_tipAnchor.isConnected;
      const away = _tipAnchor?.isConnected && !_tipAnchor.matches(":hover");
      if (gone || away) _hideTip(gone ? 0 : 400);
    }, 500);
  }

  function _showTip(anchor, text) {
    if (!text) return;
    _tipClearTimers();
    if (!_tipEl || !_tipEl.isConnected) {
      _tipEl = document.createElement("div");
      _tipEl.className = "aflp-sp-tip";
      document.body.append(_tipEl);
    }
    _tipAnchor = anchor;
    _tipEl.textContent = text;
    _tipEl.style.display = "block";
    _tipEl.style.opacity = "1";
    _tipStartWatch();
    const r = anchor.getBoundingClientRect();
    // Prefer left of the row (docks sit at the screen's right); flip if tight.
    const tw = _tipEl.offsetWidth, th = _tipEl.offsetHeight;
    let left = r.left - tw - 10;
    if (left < 6) left = Math.min(window.innerWidth - tw - 6, r.right + 10);
    let top = Math.round(r.top + r.height / 2 - th / 2);
    top = Math.max(6, Math.min(window.innerHeight - th - 6, top));
    _tipEl.style.left = `${Math.round(left)}px`;
    _tipEl.style.top = `${top}px`;
  }
  // delay: grace before the fade starts, so sliding between rows does not flicker.
  function _hideTip(delay = 0) {
    _tipClearTimers();
    if (!_tipEl) return;
    const fade = () => {
      if (!_tipEl) return;
      _tipEl.style.opacity = "0";
      _tipFade = setTimeout(() => {
        if (_tipEl) _tipEl.style.display = "none";
        _tipAnchor = null; _tipFade = null; _tipStopWatch();
      }, 260);   // matches the CSS transition
    };
    if (delay > 0) _tipDelay = setTimeout(fade, delay);
    else fade();
  }
  function _wireRowInteractions(container) {
    if (container.dataset.aflpSpWired) return;
    container.dataset.aflpSpWired = "1";

    // Drag a chip onto another to reorder the bands. Delegated like every other
    // handler here, because the panel is injected into sheets Foundry owns and
    // listeners bound at render time never reach this markup.
    let _dragBand = null;
    container.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.(".aflp-sp-band");
      if (!el) return;
      _dragBand = Number(el.dataset.band);
      el.classList.add("drag");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(_dragBand)); } catch (err) {}
    });
    container.addEventListener("dragend", (e) => {
      e.target.closest?.(".aflp-sp-band")?.classList.remove("drag");
      container.querySelectorAll(".aflp-sp-band.over").forEach(n => n.classList.remove("over"));
    });
    container.addEventListener("dragover", (e) => {
      const el = e.target.closest?.(".aflp-sp-band");
      if (!el || _dragBand === null) return;
      e.preventDefault();
      container.querySelectorAll(".aflp-sp-band.over").forEach(n => n.classList.remove("over"));
      el.classList.add("over");
    });
    container.addEventListener("drop", (e) => {
      const el = e.target.closest?.(".aflp-sp-band");
      if (!el || _dragBand === null) return;
      e.preventDefault();
      e.stopPropagation();
      const target = Number(el.dataset.band);
      if (target === _dragBand) { _dragBand = null; return; }
      const order = _bandOrder().filter(n => n !== _dragBand);
      const at = order.indexOf(target);
      order.splice(at < 0 ? order.length : at, 0, _dragBand);
      _dragBand = null;
      _setBandOrder(order);
    });
    container.addEventListener("click", (e) => {
      // Band chip toggles that band for THIS user only. Delegated, because the
      // panel is injected into foreign sheets and Foundry never binds listeners
      // to markup it did not render itself.
      const tgl = e.target.closest?.(".aflp-sp-bandtoggle");
      if (tgl) { e.preventDefault(); e.stopPropagation(); _toggleBandsOpen(); return; }
      const rst = e.target.closest?.(".aflp-sp-bandreset");
      if (rst) { e.preventDefault(); e.stopPropagation(); _resetBands(); return; }
      const bandEl = e.target.closest?.(".aflp-sp-band");
      if (bandEl) {
        e.preventDefault();
        e.stopPropagation();
        _toggleBand(Number(bandEl.dataset.band));
        return;
      }
      // Hover-X clears a temporary status straight from the panel.
      const xEl = e.target.closest?.(".aflp-sp-x");
      if (xEl) {
        e.stopPropagation();
        const key = xEl.closest(".aflp-sp-row")?.dataset?.status;
        let actor = null;
        const did = container.dataset?.actorId;
        if (did) actor = game.actors.get(did) ?? canvas.tokens.get(did)?.actor ?? null;
        if (!actor) { for (const dk of _docks.values()) { if (dk.el === container) { actor = dk.actor; break; } } }
        if (actor && key) _removeStatus(actor, key).then(() => _refreshDocksFor(actor.id));
        return;
      }
      // Chosen-title row opens the owning actor's sheet.
      const titleRow = e.target.closest?.(".aflp-sp-row[data-title-actor]");
      if (titleRow) {
        e.stopPropagation();
        const actor = game.actors?.get(titleRow.dataset.titleActor);
        if (actor) (AFLP.UI?.SheetApp?.open?.(actor) ?? actor.sheet?.render(true));
        return;
      }
      const row = e.target.closest?.(".aflp-sp-row[data-uuid]");
      if (!row) return;
      e.stopPropagation();
      fromUuid(row.dataset.uuid).then(d => d?.sheet?.render(true)).catch(() => {});
    });
    container.addEventListener("pointerover", async (e) => {
      const row = e.target.closest?.(".aflp-sp-row");
      if (!row) return;
      _tipClearTimers();                 // cancel a pending fade: we are back
      const token = ++_tipToken;
      // Static desc rows carry their summary inline; uuid rows fetch (cached).
      let text = row.dataset.desc || "";
      // A cumflation row's prose is the tier line on its item, not the item's own
      // description (which is rules-only now). Falls back to the summary.
      if (row.dataset.flavourUuid) {
        const f = await _tierFlavour(row.dataset.flavourUuid, Number(row.dataset.flavourTier));
        if (f) text = f;
      }
      if (!text && row.dataset.uuid) text = await _summaryFor(row.dataset.uuid);
      // A row may carry a generated rules line alongside its flavour (cumflation
      // does). Flavour comes from the item, the mechanic line from the tier, so
      // the two can never drift apart the way hand-copied text would.
      const mech = row.dataset.mech || "";
      if (mech) text = text ? `${text}\n\n${mech}` : mech;
      // The await is where the lingering tooltip came from: the pointer could
      // leave, or the panel re-render, before fromUuid resolved - and the stale
      // continuation then drew a tip nobody was hovering. Only the newest hover,
      // over a row still in the DOM and still under the cursor, may draw.
      if (token !== _tipToken || !text || !row.isConnected || !row.matches(":hover")) return;
      _showTip(row, text);
    });
    container.addEventListener("pointerout", (e) => {
      const row = e.target.closest?.(".aflp-sp-row");
      const to = e.relatedTarget;
      if (row && (!to || !row.contains(to))) {
        _tipToken++;                     // invalidate any in-flight hover
        _hideTip(400);                   // grace, then fade
      }
    });
  }
  // The HUD puts the hamburger in its drag handle. Sheet and scene docks have no
  // header at all, so they get their own inline one - without it those surfaces
  // would show grouped rows with no way to reach the menu.
  function renderPanel(actor, { cols = "auto", header = true } = {}) {
    const all = activeRows(actor);
    if (!all.length) return "";
    // Only offer a toggle for bands this actor actually has rows in - a filter
    // full of dead buttons is worse than no filter.
    const present = new Set(all.map(r => Number(r.def?.band ?? 9)));
    const hidden  = new Set(_hiddenBands());
    const rows    = all.filter(r => !hidden.has(Number(r.def?.band ?? 9)));
    // Chips follow the user's own order, and only bands this actor has rows in
    // get one - a filter full of dead buttons is worse than no filter.
    const ordered = _bandOrder().map(n => BANDS.find(b => b.n === n)).filter(b => b && present.has(b.n));
    const chips = ordered.map(b =>
      `<span class="aflp-sp-band${hidden.has(b.n) ? " off" : ""}" data-band="${b.n}" draggable="true" title="${b.label} - click to hide, drag to reorder">${b.label}</span>`
    ).join("");
    // Collapsed by default: the filter is a thing you go and get, not a header.
    const open = _bandsOpen();
    // The control sits UNDER the rows, not above them: it is a thing you go and
    // get, and a header is the worst place for it. Chips stack vertically so a
    // drag is a short straight move rather than a wrap-aware guess.
    // The menu sits ABOVE the rows. Below, every toggle changed the panel height
    // and moved the button out from under the cursor, so a second click landed on
    // whatever had slid into its place. The toggle itself lives in the header as
    // a hamburger; this block only renders when it is open.
    const burger = (chips && header)
      ? `<div class="aflp-sp-bandhead"><span class="aflp-sp-bandtoggle${open ? " on" : ""}" title="Show or hide status groups">\u2630</span></div>`
      : "";
    const bar = burger + ((chips && open)
      ? `<div class="aflp-sp-bandwrap open">`
        + `<div class="aflp-sp-bands">${chips}<span class="aflp-sp-bandreset" title="Back to the default groups and order">reset</span></div>`
        + `</div>`
      : "");
    if (!rows.length) return bar;
    const useCols = cols === true || (cols === "auto" && rows.length > 8);
    return `${bar}<div class="aflp-sp-panel${useCols ? " cols" : ""}">${renderRows(actor, rows)}</div>`;
  }

  function _ensureCSS() {
    if (document.getElementById("aflp-sp-css")) return;
    const style = document.createElement("style");
    style.id = "aflp-sp-css";
    style.textContent = `
      .aflp-sp-bandhead { display:flex; justify-content:flex-end; pointer-events:auto; line-height:1; }
      .aflp-sp-bandwrap { margin-bottom:7px; pointer-events:auto; }
      .aflp-sp-bandtoggle { display:inline-block; margin-left:6px; font-size:11px; line-height:1;
        opacity:0.4; cursor:pointer; user-select:none; vertical-align:middle; }
      .aflp-sp-bandtoggle:hover { opacity:0.9; }
      .aflp-sp-bandtoggle.on { opacity:0.95; }
      .aflp-sp-bands { display:none; flex-direction:column; align-items:flex-start;
        gap:2px; pointer-events:auto; }
      .aflp-sp-bandwrap.open .aflp-sp-bands { display:flex; }
      .aflp-sp-bands .aflp-sp-band { cursor:grab; }
      .aflp-sp-bands .aflp-sp-band:active { cursor:grabbing; }
      .aflp-sp-band.over { box-shadow:inset 0 2px 0 #e8c2d4; }
      .aflp-sp-band.drag { opacity:0.5; }
      .aflp-sp-bandreset { font-size:9px; line-height:1; padding:2px 5px; border-radius:7px;
        cursor:pointer; opacity:0.45; user-select:none; color:#e8c2d4; }
      .aflp-sp-bandreset:hover { opacity:0.9; }
      .aflp-sp-band { font-size:9px; line-height:1; padding:2px 5px; border-radius:7px; cursor:pointer;
        border:1px solid rgba(220,160,190,0.45); color:#e8c2d4; background:rgba(220,160,190,0.10);
        user-select:none; transition:opacity 0.12s ease, background 0.12s ease; }
      .aflp-sp-band:hover { background:rgba(220,160,190,0.22); }
      .aflp-sp-band.off { opacity:0.35; text-decoration:line-through; }
      .aflp-sp-panel { display:flex; flex-direction:column; gap:5px; }
      .aflp-sp-panel.cols { display:grid; grid-template-columns:1fr 1fr; gap:5px 14px; }
      .aflp-sp-row { display:flex; align-items:center; gap:8px; }
      .aflp-sp-row.linked { pointer-events:auto; cursor:pointer; }
      .aflp-sp-row.tipped { pointer-events:auto; cursor:help; }
      .aflp-sp-row.removable { pointer-events:auto; }
      .aflp-sp-x { display:none; margin-left:auto; padding:0 3px; opacity:0.55; cursor:pointer;
        font-size:11px; line-height:1; color:#e06682; transition:opacity 0.12s ease, transform 0.12s ease; }
      .aflp-sp-row.removable:hover .aflp-sp-x { display:inline; }
      .aflp-sp-x:hover { opacity:1; transform:scale(1.2); }
      .aflp-sp-tip { position:fixed; z-index:120; display:none; box-sizing:border-box;
        opacity:1; transition:opacity 0.25s ease; pointer-events:none;
        width:240px; max-width:240px; padding:7px 10px; border-radius:7px;
        background:rgba(18,14,24,0.96); border:1px solid rgba(244,183,76,0.4);
        color:#e4d8c4; font-family:var(--aflr-serif, Georgia, serif); font-size:12px;
        line-height:1.4; white-space:normal; overflow-wrap:break-word; word-break:normal;
        pointer-events:none; box-shadow:0 6px 22px rgba(0,0,0,0.7); }
      .aflp-sp-row.linked:hover .aflp-sp-lab { filter:brightness(1.25); }
      .aflp-sp-lab { color:var(--c); font-size:13px; font-weight:700; letter-spacing:0.4px;
        font-family:var(--aflr-serif, Georgia, serif);
        text-shadow:0 0 7px color-mix(in srgb, var(--c) 65%, transparent), 0 1px 2px rgba(0,0,0,0.85); }
      .aflp-sp-lab::before { content:"+ "; opacity:0.8; }
      .aflp-sp-num { font-size:11px; }
      .aflp-sp-tile { position:relative; width:26px; height:28px; flex:0 0 auto;
        display:flex; align-items:center; justify-content:center; overflow:hidden;
        clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
        background:radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 38%, #1a1122), #17101f);
        filter:drop-shadow(0 0 5px color-mix(in srgb, var(--c) 60%, transparent)); }
      .aflp-sp-tile img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      /* Second tile sits at the end of the row - the term readout beside the type. */
      .aflp-sp-tile2 { margin-left:auto; opacity:.9; }
      .aflp-sp-glyph { position:relative; font-size:12px; color:var(--c); text-shadow:0 0 5px var(--c); }
      .aflp-sp-tile img ~ .aflp-sp-glyph { display:none; }

      .aflp-sp-dock { position:fixed; width:max-content; max-width:190px;
        pointer-events:none; z-index:101; }
      .aflp-sp-hud { position:fixed; z-index:60; width:max-content; max-width:200px;
        padding:4px 12px 10px; border-radius:10px; pointer-events:none;
        background:rgba(20,16,25,0.72); border:1px solid rgba(244,183,76,0.25);
        backdrop-filter:blur(2px); }
      .aflp-sp-hud-handle { pointer-events:auto; cursor:grab; user-select:none;
        font-size:9px; letter-spacing:2px; text-transform:uppercase; text-align:center;
        color:#c9a96e; opacity:0.6; padding:2px 0 5px; }
      .aflp-sp-hud-handle:active { cursor:grabbing; }
      .aflp-sp-dock:empty { display:none; }
    `;
    document.head.append(style);
  }

  // ── Surface 2: hover dock beside character sheets ─────────────────────────
  // Docks cascade down the RIGHT side of each open sheet, outside the window.
  // They are mounted on document.body as position:fixed and synced to the
  // sheet's rect every animation frame - V2 app windows clip their children
  // (overflow:hidden, verified live), so a child-element dock is not viable.
  // One rAF loop serves all open docks and stops when none remain.
  // Entries: key -> { el, actor, kind: "sheet"|"scene", app? (sheet), rootEl? (scene) }
  const _docks = new Map();
  let _dockLoop = false;
  function _dockRoot(d) {
    if (d.kind === "scene") return d.rootEl;
    return d.app?.element instanceof HTMLElement ? d.app.element : d.app?.element?.[0];
  }
  function _syncDocks() {
    if (!_docks.size) { _dockLoop = false; if (_hudEl) _hudEl.style.display = ""; return; }
    // Visible sheet docks win: the same actor's statuses never show twice.
    const sheetActorIds = new Set();
    for (const d of _docks.values()) {
      if (d.kind !== "sheet") continue;
      const root = _dockRoot(d);
      if (root?.isConnected && root.getBoundingClientRect().width > 0) sheetActorIds.add(d.actor?.id);
    }
    for (const [id, d] of _docks) {
      const root = _dockRoot(d);
      if (!root || !root.isConnected) { d.el.remove(); _docks.delete(id); continue; }
      const r = root.getBoundingClientRect();
      // Scene cards cast a 32px soft shadow (container z-index 100); the dock
      // sits above it (z-index 101) and clears the dense blur with extra gap.
      d.el.style.left = `${Math.round(r.right + (d.kind === "scene" ? 26 : 10))}px`;
      d.el.style.top = `${Math.round(r.top + (d.kind === "scene" ? 0 : 44))}px`;
      const hiddenDupe = d.kind === "scene" &&
        (sheetActorIds.has(d.actor?.id) || !_sceneDockEnabled() || _sceneSheetOpen());
      d.el.style.display = (r.width > 0 && !hiddenDupe) ? "" : "none";
    }
    // Floating HUD hides while any open sheet dock shows the same actor.
    if (_hudEl?.isConnected) {
      _hudEl.style.display = sheetActorIds.has(_hudEl.dataset.actorId) ? "none" : "";
    }
    requestAnimationFrame(_syncDocks);
  }
  function _sceneDockEnabled() {
    try { return game.settings.get(MOD, "hsceneStatusDock") !== false; } catch { return true; }
  }
  // World master switch: lets a GM turn the whole status display feature off
  // (e.g. a conflicting module). Native hiding is gated on it too, so "off"
  // restores fully stock behavior.
  function _panelEnabled() {
    try { return game.settings.get(MOD, "statusPanelEnabled") !== false; } catch { return true; }
  }
  // The h-scene "sidewindow" sheet (AFLP.UI.SceneDock, #aflp-scene-dock) docks
  // in the same space as the scene status stack; while it is open the stack
  // yields, returning the moment it closes.
  function _sceneSheetOpen() {
    const el = document.getElementById("aflp-scene-dock");
    return !!(el?.isConnected && el.getBoundingClientRect().width > 0);
  }
  // A dock belongs on real character SHEETS only, never on the always-present
  // token HUDs some systems ship (e.g. Daggerheart's DaggerheartActorHUD, a
  // bare ApplicationV2 that carries .actor and otherwise matches). Admit an app
  // when it is a Foundry DocumentSheet for an Actor, OR our own AFLP sheet app;
  // reject everything else. Verified live on DH: system sheet and AFLP app pass,
  // the HUD fails.
  function _isDockableSheet(app) {
    if (!app) return false;
    if (app.constructor?.name?.includes("AFLPSheetApp")) return true;
    try {
      const DS = foundry.applications.api.DocumentSheetV2;
      if (DS && app instanceof DS && (app.document ?? app.actor)?.documentName === "Actor") return true;
    } catch (_) {}
    // Legacy V1 ActorSheet path (renderActorSheet hook).
    if (app.actor?.documentName === "Actor" && (app.options?.sheetClass || app.isEditable !== undefined) && typeof app.close === "function"
        && app.constructor?.name?.endsWith("Sheet")) return true;
    return false;
  }
  async function _mountDock(app) {
    if (!_panelEnabled()) return;
    if (!_isDockableSheet(app)) return;
    const actor = app?.actor ?? app?.document;
    if (!actor || actor.documentName !== "Actor") return;
    const appId = app.id ?? app.appId ?? actor.id;
    if (!AFLP.Settings?.statusPanelSheet) {
      const d = _docks.get(appId);
      if (d) { d.el.remove(); _docks.delete(appId); }
      return;
    }
    _ensureCSS();
    await _buildIconIndex();
    let d = _docks.get(appId);
    if (!d) {
      const el = document.createElement("div");
      el.className = "aflp-sp-dock";
      document.body.append(el);
      _wireRowInteractions(el);
      d = { el, app, actor, kind: "sheet" };
      _docks.set(appId, d);
    }
    d.actor = actor;
    d.el.innerHTML = renderPanel(actor, { cols: false });
    if (!_dockLoop) { _dockLoop = true; requestAnimationFrame(_syncDocks); }
  }
  function _refreshDocksFor(actorId) {
    for (const d of _docks.values()) {
      if (!actorId || d.actor?.id === actorId) d.el.innerHTML = renderPanel(d.actor, { cols: false });
    }
  }
  function refreshSceneDocks() {
    for (const d of _docks.values()) {
      if (d.kind === "scene") d.el.innerHTML = renderPanel(d.actor, { cols: false });
    }
  }
  function _unmountDock(app) {
    const appId = app?.id ?? app?.appId;
    const d = appId != null ? _docks.get(appId) : null;
    if (d) { d.el.remove(); _docks.delete(appId); }
  }

  // H-scene card dock: the focused talent's status stack, anchored to the
  // right of the scene card. Per-frame dedupe in _syncDocks hides it whenever
  // an open sheet dock already shows the same actor, and the per-user
  // "hsceneStatusDock" toggle (the hex button in the card's top bar) gates it.
  async function mountSceneDock(cardEl, actor) {
    if (!_panelEnabled() || !cardEl || !actor) return;
    const key = "scene:" + (cardEl.dataset?.targetId ?? actor.id);
    _ensureCSS();
    await _buildIconIndex();
    let d = _docks.get(key);
    if (!d || d.rootEl !== cardEl) {
      d?.el?.remove();
      const el = document.createElement("div");
      el.className = "aflp-sp-dock";
      document.body.append(el);
      _wireRowInteractions(el);
      d = { el, rootEl: cardEl, actor, kind: "scene" };
      _docks.set(key, d);
    }
    d.actor = actor;
    d.el.innerHTML = renderPanel(actor, { cols: false });
    if (!_dockLoop) { _dockLoop = true; requestAnimationFrame(_syncDocks); }
  }

  // ── Surface 3: floating status HUD (draggable, position remembered) ──────
  let _hudEl = null;
  function _hudActor() {
    const controlled = canvas?.tokens?.controlled ?? [];
    const tok = controlled.find(t => t.actor?.isOwner) ?? controlled[0];
    return tok?.actor ?? game.user?.character ?? null;
  }
  function _hudPos() {
    try { return game.settings.get(MOD, "statusHudPos") ?? null; } catch { return null; }
  }
  function _saveHudPos(left, top) {
    try { game.settings.set(MOD, "statusHudPos", { left, top }); } catch (_) {}
  }
  function _wireHudDrag(handle) {
    handle.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const start = { x: ev.clientX, y: ev.clientY };
      const rect = _hudEl.getBoundingClientRect();
      const move = (e) => {
        const left = Math.max(0, Math.min(window.innerWidth - 60, rect.left + e.clientX - start.x));
        const top = Math.max(0, Math.min(window.innerHeight - 40, rect.top + e.clientY - start.y));
        _hudEl.style.left = `${left}px`;
        _hudEl.style.top = `${top}px`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const r = _hudEl.getBoundingClientRect();
        _saveHudPos(Math.round(r.left), Math.round(r.top));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  async function refreshHud() {
    const mode = AFLP.Settings?.statusPanelHud ?? "off";
    if (mode === "off" || !_panelEnabled()) { _hudEl?.remove(); _hudEl = null; return; }
    _ensureCSS();
    await _buildIconIndex();
    if (!_hudEl || !_hudEl.isConnected) {
      _hudEl = document.createElement("div");
      _hudEl.id = "aflp-sp-hud";
      _hudEl.className = "aflp-sp-hud";
      const pos = _hudPos();
      _hudEl.style.left = `${pos?.left ?? Math.max(0, window.innerWidth - 560)}px`;
      _hudEl.style.top = `${pos?.top ?? 120}px`;
      document.body.append(_hudEl);
      _wireRowInteractions(_hudEl);
    }
    const actor = _hudActor();
    const body = actor ? renderPanel(actor, { cols: false, header: false }) : "";
    _hudEl.dataset.actorId = actor?.id ?? "";
    // Hamburger in the header toggles the groups menu. It sits in the handle but
    // stops its own clicks from reaching the drag/condition-manager handlers.
    const _burger = `<span class="aflp-sp-bandtoggle${_bandsOpen() ? " on" : ""}" title="Show or hide status groups">\u2630</span>`;
    _hudEl.innerHTML = `<div class="aflp-sp-hud-handle" title="${game.user?.isGM ? "Drag to move \u00b7 click to manage conditions" : "Drag to move"}">\u2725 status${_burger}</div>${body}`;
    const _hudHandle = _hudEl.querySelector(".aflp-sp-hud-handle");
    // The hamburger lives INSIDE the drag handle, so it has to claim its own
    // pointer events or a click would start a drag and open the GM condition
    // manager instead of the menu.
    const _burgerEl = _hudHandle?.querySelector?.(".aflp-sp-bandtoggle");
    if (_burgerEl) {
      for (const ev of ["pointerdown", "pointerup", "mousedown", "click"]) {
        _burgerEl.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (ev === "click") _toggleBandsOpen();
        });
      }
    }
    _wireHudDrag(_hudHandle);
    // GM: click (not drag) the header opens the condition manager for the HUD's
    // actor. Distinguished from a drag by the pointer barely moving.
    if (game.user?.isGM && _hudHandle) {
      let _dn = null;
      _hudHandle.addEventListener("pointerdown", e => { _dn = { x: e.clientX, y: e.clientY }; });
      _hudHandle.addEventListener("pointerup", e => {
        if (!_dn) return;
        const moved = Math.hypot(e.clientX - _dn.x, e.clientY - _dn.y);
        _dn = null;
        if (moved < 4) {
          const a = _hudActor();
          if (a) AFLP.UI?.SheetTab?._openConditionManager?.(a, null);
        }
      });
    }
  }
  let _hudTimer = null;
  function _queueHud() { clearTimeout(_hudTimer); _hudTimer = setTimeout(() => refreshHud(), 60); }

  // ── Surface 4: hide AFLR effects from Foundry-native displays ─────────────
  // AFLR-origin embedded items are identified by source: the sourceId points
  // into an ardisfoxxs-lewd-* pack, or the item carries a module flag.
  // On Daggerheart the module applies its conditions as bare ActiveEffects
  // that carry NO source flags or origin (verified live), AND the DH SYSTEM
  // registers the very same status ids (defeated, submitting, mind-break...)
  // as its own native conditions - so a status-slug match is ambiguous and
  // wrongly caught DH-native effects too. The unambiguous tell is the actor's
  // own aflpConditions flag bag: AFLR-applied conditions are keyed there, DH's
  // native ones are not. An effect is ours only if its slug is in the bag of
  // the actor that carries it.
  function _aflrAppliedSlug(doc) {
    const actor = doc?.parent?.documentName === "Actor" ? doc.parent
      : (doc?.target?.documentName === "Actor" ? doc.target : null);
    if (!actor) return false;
    let bag = {};
    try { bag = actor.getFlag(AFLP.FLAG_SCOPE, "aflpConditions") ?? {}; } catch (_) {}
    if (!bag || typeof bag !== "object") return false;
    for (const s of doc.statuses ?? []) if (s in bag) return true;
    const nameSlug = String(doc.name ?? "").toLowerCase().replace(/\s+/g, "-");
    return nameSlug ? (nameSlug in bag) : false;
  }
  function isAflrOrigin(doc) {
    if (!doc) return false;
    const src = doc.flags?.core?.sourceId ?? doc.sourceId ?? doc._stats?.compendiumSource ?? "";
    if (String(src).includes("ardisfoxxs-lewd-")) return true;
    if (doc.flags?.["ardisfoxxs-lewd-pf2e"] || doc.flags?.["ardisfoxxs-lewd-pf2e"]) return true;
    // Daggerheart flagless conditions: ours only if in the actor's flag bag.
    if (doc.documentName === "ActiveEffect" && _aflrAppliedSlug(doc)) return true;
    return false;
  }
  AFLP.StatusPanel_isAflrOrigin = isAflrOrigin;
  let _nativeHidingRegistered = false;
  function _registerNativeHiding() {
    // Idempotent: re-running this replaced PF2e's own appliedEffects getter with
    // our shadow and lost the real implementation. Guard the whole thing.
    if (_nativeHidingRegistered) return;
    _nativeHidingRegistered = true;
    // Token status icons: Foundry v14 core Token#_drawEffects reads
    // actor.appliedEffects; on pf2e 8 the system synthesizes display-only
    // ActiveEffects (changes: []) from condition/effect ITEMS, and those AEs
    // inherit the item's module flags. Filtering AFLR-origin, zero-change AEs
    // out of appliedEffects removes the token icons without touching anything
    // mechanical (verified live: 2 icons -> 0, prototype chain intact).
    //
    // HAZARD: appliedEffects is defined on ActorPF2e.prototype, which IS the
    // prototype we shadow. defineProperty replaces it in place, so `delete
    // ActorPF2e.prototype.appliedEffects` destroys PF2e's implementation too and
    // everything falls through to core Actor's getter, which returns [] here -
    // wiping EVERY token icon, ours and the system's. Never delete the shadow;
    // the stashed original below is what makes a re-install safe.
    // The changes-length gate also protects any system where AFLR content
    // ever rides a mechanical ActiveEffect - those stay visible and active.
    // GM-mapped custom statuses hide from the native displays exactly like
    // AFLR's own: an item is custom-mapped when its source uuid matches a
    // statusCustomDefs entry. For ActiveEffects, the synthesized AE's origin
    // (Actor.X.Item.Y) is resolved back to the embedded item on the owning
    // actor. The zero-changes gate still applies - a third-party effect whose
    // AE carries real mechanical changes stays visible and active.
    const _customUuids = () => new Set(_customDefs().map(d => d.uuid));
    const _isCustomItem = (item, set) => {
      if (!item) return false;
      const u = set ?? _customUuids();
      if (!u.size) return false;
      const src = String(item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? item.sourceId ?? "");
      return u.has(src) || u.has(item.uuid);
    };
    const _aeIsCustom = (actor, e, set) => {
      const m = String(e?.origin ?? "").match(/Item\.(\w+)$/);
      return m ? _isCustomItem(actor?.items?.get?.(m[1]), set) : false;
    };
    // An effect counts as ours by its parent ONLY when that parent is an AFLR ITEM
    // (a pack condition/effect item granting the AE). When an AE lives directly on
    // the actor, `parent` IS the actor - and any actor imported from an AFLR pack
    // has an ardisfoxxs-lewd- compendiumSource, so testing the parent there matched
    // every bare effect on that actor, including Foundry/system-native ones. That
    // ate the PF2e "Dead" overlay (a changeless, origin-less AE with statuses:dead)
    // on every AFLR monster, so dead tokens lost their scratch-out.
    const _parentIsAflrItem = (e) =>
      e?.parent?.documentName === "Item" && isAflrOrigin(e.parent);
    const shouldHide = (actor, e, customSet) =>
      _panelEnabled() &&
      AFLP.Settings?.statusHideNative &&
      (e?.changes?.length ?? 0) === 0 &&
      (isAflrOrigin(e) || _parentIsAflrItem(e) || _aeIsCustom(actor, e, customSet));
    try {
      if (globalThis.libWrapper?.register) {
        libWrapper.register(MOD, "Actor.prototype.appliedEffects", function (wrapped, ...args) {
          const out = wrapped(...args);
          try { const cs = _customUuids(); return out.filter(e => !shouldHide(this, e, cs)); } catch (_) { return out; }
        }, "WRAPPER");
      } else {
        // Shadow the getter on the system's document class prototype.
        //
        // CRITICAL: sysProto IS ActorPF2e.prototype, and PF2e defines its OWN
        // appliedEffects there. defineProperty replaces it in place. If this ever
        // runs twice, the second pass walks the chain, finds OUR shadow as the
        // "original", and PF2e's real implementation is lost - after which the
        // getter falls through to core Actor's, which returns [] on PF2e, and
        // every token icon (ours AND the system's Grabbed/Off-Guard) disappears.
        //
        // So: install once, and stash the true original where a re-run can find
        // it rather than capturing the shadow.
        const sysProto = CONFIG.Actor.documentClass.prototype;
        const STASH = "__aflrOrigAppliedEffects";
        if (!sysProto[STASH]) {
          let p = sysProto, desc = null;
          while (p && !desc) { desc = Object.getOwnPropertyDescriptor(p, "appliedEffects"); if (!desc) p = Object.getPrototypeOf(p); }
          if (desc?.get) Object.defineProperty(sysProto, STASH, { value: desc.get, configurable: true, enumerable: false });
        }
        const orig = sysProto[STASH];
        if (orig) {
          Object.defineProperty(sysProto, "appliedEffects", {
            configurable: true,
            get() {
              const out = orig.call(this);
              try { const cs = _customUuids(); return out.filter(e => !shouldHide(this, e, cs)); } catch (_) { return out; }
            },
          });
        }
      }
    } catch (e) { console.warn("AFLP | appliedEffects filter failed:", e?.message); }

    // System effects panel (pf2e family: game.pf2e.effectPanel, hook
    // renderEffectsPanel, rows carry [data-item-id] - verified live): remove
    // AFLR-origin rows from the DOM on render.
    const domFilter = (app, html) => {
      if (!AFLP.Settings?.statusHideNative) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root) return;
      const actor = app?.actor
        ?? canvas?.tokens?.controlled?.[0]?.actor
        ?? game.user?.character;
      const cs = _customUuids();
      for (const el of root.querySelectorAll("[data-item-id]")) {
        const item = actor?.items?.get(el.dataset.itemId);
        if (item && (isAflrOrigin(item) || _isCustomItem(item, cs))) el.remove();
      }
    };
    Hooks.on("renderEffectsPanel", domFilter);

    // Daggerheart effect strip (DhEffectsDisplay, #effects-display, hook
    // renderDhEffectsDisplay - verified live). Rows carry [data-effect-id];
    // the effects are bare ActiveEffects with no source flags, so match via
    // the status-slug detector. Also covers Foundry-core status displays that
    // read from actor.statuses on any system.
    const dhEffFilter = (app, html) => {
      if (!AFLP.Settings?.statusHideNative || !_panelEnabled()) return;
      const root = html instanceof HTMLElement ? html : (html?.[0] ?? app?.element);
      if (!root) return;
      const actor = app?.actor ?? app?.document
        ?? canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character;
      const cs = _customUuids();
      for (const el of root.querySelectorAll("[data-effect-id]")) {
        const eff = actor?.effects?.get?.(el.dataset.effectId)
          ?? _findEffectAnywhere(el.dataset.effectId);
        if (!eff) continue;
        if (isAflrOrigin(eff)
            || (eff.parent?.documentName === "Item" && isAflrOrigin(eff.parent))
            || _effIsCustom(eff, cs)) el.remove();
      }
    };
    const _findEffectAnywhere = (id) => {
      for (const t of canvas?.tokens?.placeables ?? []) { const e = t.actor?.effects?.get?.(id); if (e) return e; }
      for (const a of game.actors ?? []) { const e = a.effects?.get?.(id); if (e) return e; }
      return null;
    };
    const _effIsCustom = (eff, set) => {
      if (!set?.size) return false;
      const src = String(eff.flags?.core?.sourceId ?? eff._stats?.compendiumSource ?? "");
      if (set.has(src)) return true;
      // custom AE by origin item, same resolution as the appliedEffects path
      const m = String(eff?.origin ?? "").match(/Item\.(\w+)$/);
      return m ? _isCustomItem(eff.parent?.items?.get?.(m[1]) ?? eff.parent, set) : false;
    };
    Hooks.on("renderDhEffectsDisplay", dhEffFilter);
  }

  // ── Public API + wiring ───────────────────────────────────────────────────
  AFLP.StatusPanel = { renderPanel, activeRows, refreshHud, mountSceneDock, refreshSceneDocks,
    refreshSheetDocks: () => _refreshDocksFor(null),
    openCustomEditor, ensureCSS: _ensureCSS, buildIconIndex: _buildIconIndex };

  _ensureCSS();
  _buildIconIndex();
  _registerNativeHiding();

  // The first token paint can happen before this module finishes importing, so
  // tokens render with AFLR icons and only lose them on the next redraw (which is
  // why switching scenes "fixed" it). Redraw once the canvas is up, and whenever a
  // scene is (re)activated, so the filtered state is what the user actually sees.
  const _redrawTokenEffects = () => {
    if (!AFLP.Settings?.statusHideNative) return;
    try { for (const t of (canvas?.tokens?.placeables ?? [])) t.drawEffects?.(); }
    catch (e) { console.warn("AFLP | token effect redraw:", e?.message); }
  };
  Hooks.on("canvasReady", _redrawTokenEffects);
  if (canvas?.ready) _redrawTokenEffects();

  // Docks on both V1 (system sheets) and V2 (AFLR sheet app) renders.
  Hooks.on("renderActorSheet", (app) => { _mountDock(app); });
  Hooks.on("renderApplicationV2", (app) => {
    // _mountDock re-checks _isDockableSheet; this pre-filter just avoids the
    // call for the majority of V2 apps that have no actor at all.
    if (app?.actor?.documentName === "Actor" || app?.document?.documentName === "Actor") _mountDock(app);
  });
  Hooks.on("closeActorSheet", (app) => _unmountDock(app));
  Hooks.on("closeApplicationV2", (app) => _unmountDock(app));
  const _queueDocks = (doc) => {
    const actorId = doc?.documentName === "Actor" ? doc.id : doc?.parent?.id;
    _refreshDocksFor(actorId ?? null);
  };
  Hooks.on("updateActor", _queueDocks);
  Hooks.on("createItem", _queueDocks);
  Hooks.on("deleteItem", _queueDocks);
  Hooks.on("updateItem", _queueDocks);

  // HUD refresh triggers.
  Hooks.on("controlToken", _queueHud);
  Hooks.on("updateActor", _queueHud);
  Hooks.on("createItem", _queueHud);
  Hooks.on("deleteItem", _queueHud);
  Hooks.on("updateItem", _queueHud);
  Hooks.on("canvasReady", _queueHud);
  refreshHud();

  console.log("AFLP | Status panel loaded");
})();
