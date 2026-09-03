// EVERY DOCUMENT WRITE IN THIS FILE GOES THROUGH AFLP.gm OR AFLP.cond, and that
// is load-bearing. The Carnal Resist chat card is clicked by PLAYERS, and its
// resolution writes to the ADVERSARY (Dominating in _startHScene) and, on a
// Carnal Rescue, to ANOTHER PLAYER'S PC (arousal, Defeat, Stress in
// allyIntervene). This file used to call the ADAPTER API directly -
// AFLP.system.applyCondition / setConditionValue / setArousalCurrent - which is
// the layer BELOW the permission proxy and has no gating of its own, unlike the
// AFLP.cond.* / AFLP.gm.run wrappers that sit above it.
//
// Most of those calls were also wrapped in `catch (e) { /* non-fatal */ }`, so on
// a player's client Foundry's permission error was swallowed and the effect
// simply did not happen - Dominating never landed on the adversary on the most
// used Daggerheart path in the module. Found 19 Aug 2026 by the player-permission
// sweep, after users reported "you must be the GM to affect others".
//
// AFLP.gm.run asks canWrite itself and runs locally when allowed, so these are
// unconditional by design - the hop costs nothing when the caller owns the actor.
// WHAT MAKES THIS STALE: a new AFLP.system.* write added below, or a raw
// actor.update / setFlag. Prefer AFLP.cond.* for conditions; it is already gated.
// ===============================================================
// AFLP / AFLR - Carnal Resolution (Daggerheart H-Scene combat layer)
// ===============================================================
// The asymmetric, DH-native resolution for a Carnal action taken against a
// PC. Three approaches (the player chooses):
//   1. roll    - Presence OR Instinct Duality action roll (the rich path)
//   2. stress  - mark Stress to power through, no roll, no Arousal
//   3. give in - no roll, no Stress; Arousal climbs, climax -> Defeat token
//
// Stress = the will to resist (drains toward Mind Break). Arousal = a separate
// scene track that climbs toward climax. Defeat tokens are the Horny-like
// accelerant: while a creature has Defeat it resists at disadvantage and the
// stress-approach costs 1 + Defeat per use. Stress overflows into HP (DH rule), and
// a Carnal action marking the last HP triggers Mind Break (the in-scene death
// move). All currency (Hope/Fear/Stress/HP) is native DH; this layer only
// orchestrates the marks and owns Arousal + Defeat.
//
// No top-level import/export (loaded via dynamic import in index.js ready hook;
// must remain `new Function`-safe for in-browser syntax checks).

(() => {
  if (window.AFLP?.Carnal) return;

  const SCOPE = () => AFLP.FLAG_SCOPE;
  const isDH = () => game.system?.id === "daggerheart";

  // Campaign-frame dial: "default" (tense, survivable) or "lustHaze" (grim,
  // overwhelming bad-end lean). Read from settings; tolerate it being unregistered.
  function _frame() {
    try { return AFLP.Settings?.carnalFrame ?? "default"; }
    catch (e) { return "default"; }
  }
  const _isLustHaze = () => _frame() === "lustHaze";

  // True if the actor has a LOADED (non-vaulted) domain card by name. DH tracks
  // vaulted cards via system.inVault; we treat an undefined flag as loadout so
  // this stays correct even if the field name shifts. Used by the Nirvana path
  // (Ego Death / Living Prayer) so the effect only applies when actually loaded.
  const _hasLoadoutCard = (actor, name) => {
    const wanted = String(name).toLowerCase();
    return (actor?.items ?? []).some(i =>
      i.type === "domainCard" &&
      (i.name ?? "").toLowerCase() === wanted &&
      i.system?.inVault !== true
    );
  };

  // --- small resource helpers (DH actor) ---

  function _res(actor, key) {
    return actor?.system?.resources?.[key] ?? null;
  }

  function _arousalMax(actor) {
    // Adapter-aware: nativeArousalMax when a system caps it, else AFLP's own.
    const n = AFLP.system?.nativeArousalMax?.(actor);
    if (typeof n === "number" && n > 0) return n;
    return AFLP.system?.calcArousalMax?.(actor)
        ?? AFLP.HScene?.calcArousalMax?.(actor)
        ?? 6;
  }

  function _defeat(actor) {
    return AFLP.system?.conditionValue?.(actor, "defeat") ?? 0;
  }

  // Bimbofied is its own track, distinct from Defeat: each Bimbofied token adds
  // one disadvantage die to Carnal resist rolls (additive). Defeat instead raises
  // the power-through cost. They are independent - a character can carry both.
  function _bimbo(actor) {
    return AFLP.system?.conditionValue?.(actor, "bimbofied") ?? 0;
  }

  // Cumflation is "at bursting" when any site is maxed (8) - the body is so full
  // it can't take more, which adds one resist disadvantage die.
  function _cumflationBursting(actor) {
    const cf = actor.getFlag?.(SCOPE(), "cumflation") ?? {};
    const M = AFLP.CUMFLATION_MAX ?? 8;
    return (cf.anal ?? 0) >= M || (cf.oral ?? 0) >= M || (cf.vaginal ?? 0) >= M || (cf.facial ?? 0) >= M;
  }

  // Cumflation disadvantage dice: one die per hole packed to its limit, to a
  // maximum of three - the value the Cumflation condition tracks (cumflation.js
  // sets it to the count of maxed holes). This is the authoritative source of
  // truth and scales 1-3, unlike the old bursting boolean.
  function _cumflationDice(actor) {
    const n = AFLP.cond?.value?.(actor, "cumflation")
           ?? AFLP.system?.conditionValue?.(actor, "cumflation")
           ?? 0;
    return Math.min(3, Math.max(0, Number(n) || 0));
  }

  // Purity grants advantage on Carnal Resist and Carnal Escape rolls (the
  // character fights corruption harder). A resist failed with Fear marks Defeat.
  function _purity(actor) {
    return AFLP.actorHasKink?.(actor, "purity") ? 1 : 0;
  }

  // Bullified token count. Each token grants one advantage die on the Bull's own
  // Carnal ACTION rolls (when they press a target - see actorPress).
  function _bull(actor) {
    return AFLP.system?.conditionValue?.(actor, "bullified") ?? 0;
  }

  // --- Reaction-roll trait inference ---------------------------------------
  // DH carnal actions name their resist in prose, e.g. "Strength or Agility
  // Reaction Roll". Read an explicit `reactionTraits` flag if present (future-
  // proof), else parse the prose, else fall back to Presence/Instinct. The resist
  // roll then adds the best of the allowed traits' modifiers (DH "X or Y" = choose).
  const _DH_TRAITS = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];
  function _actionText(item) {
    if (!item) return "";
    let t = String(item.system?.description ?? "");
    const acts = item.system?.actions;
    const list = Array.isArray(acts) ? acts : (acts && typeof acts === "object" ? Object.values(acts) : []);
    for (const a of list) t += " " + String(a?.description ?? "");
    return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  function _reactionTraits(item) {
    const flag = item?.getFlag?.(SCOPE(), "reactionTraits");
    if (Array.isArray(flag) && flag.length) {
      const f = flag.map(x => String(x).toLowerCase()).filter(t => _DH_TRAITS.includes(t));
      if (f.length) return f;
    }
    const text = _actionText(item);
    const m = text.match(/((?:agility|strength|finesse|instinct|presence|knowledge)(?:\s*(?:,|or|\/|and)\s*(?:agility|strength|finesse|instinct|presence|knowledge))*)\s+reaction\s+roll/i);
    if (m) {
      const found = _DH_TRAITS.filter(t => new RegExp("\\b" + t + "\\b", "i").test(m[1]));
      if (found.length) return found;
    }
    // NO FALLBACK PAIR, and the empty array is the point.
    //
    // A Carnal Press IS "resist with any one trait you can justify" - the Press
    // card says so, and every h-scene action that opens a Carnal Press inherits
    // it. Only the earliest iteration named a pair. So "this feature names no
    // trait" is the NORMAL case, not an edge, and it means the PLAYER CHOOSES.
    //
    // This used to `return ["presence", "instinct"]`. That looked like a
    // harmless default and was not: every caller gates the trait prompt on the
    // list being EMPTY, so a list that was never empty made
    // AFLP.Carnal.promptCarnalTrait unreachable on every path - the dock's
    // player prompt and the GM override alike. rollApproach then took its
    // named-traits branch and silently rolled the better of Presence and
    // Instinct, which reads at the table as "it picked a trait at random".
    // Reported by Ardis 17 Aug 2026; reproduced in dh-test the same day, where
    // reactionTraits() on a feature naming nothing returned the pair.
    //
    // WHAT WOULD MAKE THIS STALE: a Daggerheart feature that legitimately
    // dictates the resisting trait. The reactionTraits flag and the
    // "<trait> reaction roll" text match above still serve that; this return is
    // only the "nobody named one" answer.
    return [];
  }

  // The Arousal a Carnal Action marks on both actors: an explicit `arousal` flag
  // if set, else the first "marks N Arousal" in the action text, else 1 (the
  // default). This is what the rule "raises it by that much, otherwise 1" reads.
  function _reactionArousal(item) {
    const flag = Number(item?.getFlag?.(SCOPE(), "arousal"));
    if (Number.isFinite(flag) && flag > 0) return flag;
    const text = _actionText(item);
    const m = text.match(/marks?\s+(\d+)\s+(?:bonus\s+)?Arousal/i);
    if (m) return Math.max(1, parseInt(m[1], 10) || 1);
    return 1;
  }
  function _traitMod(actor, trait) {
    const v = actor?.system?.traits?.[trait]?.value;
    return Number.isFinite(v) ? v : 0;
  }
  // Best (highest) modifier among the allowed traits.
  function _bestTraitMod(actor, traits) {
    const list = (traits && traits.length ? traits : ["presence", "instinct"]).filter(t => _DH_TRAITS.includes(t));
    if (!list.length) return { trait: null, mod: 0 };
    let best = { trait: list[0], mod: _traitMod(actor, list[0]) };
    for (const t of list) { const m = _traitMod(actor, t); if (m > best.mod) best = { trait: t, mod: m }; }
    return best;
  }
  const _cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const _traitLabel = (traits) => (traits && traits.length ? traits : ["presence", "instinct"]).map(_cap).join(" or ");

  // A Carnal Action is an action roll against the target's defence. Daggerheart
  // adversaries have a Difficulty; PCs have no Difficulty - they defend with
  // Evasion. So an actor pressing an adversary rolls vs its Difficulty, and an
  // actor pressing a PC rolls vs that PC's Evasion.
  const is5e = () => game.system?.id === "dnd5e";

  // Carnal Resist modifier (5e). Bimbofied, cumflation at the limit, and being
  // self-absorbed (Masturbating) each open the target up; Purity closes them.
  // 5e has one advantage/disadvantage grammar, so these collapse onto a single
  // +5 / -5 on the passive number and DO NOT stack - and advantage cancels
  // disadvantage, exactly as 5e demands. That is the correct answer here, not a
  // compromise: it sidesteps DH's dice pools and PF2e's typed bonuses entirely.
  function _carnalACMod(actor) {
    const dis = (_bimbo(actor) > 0)
             || (_cumflationDice(actor) > 0)
             || !!AFLP.HScene?.isSelfAbsorbed?.(actor.id);
    const adv = _purity(actor) > 0;
    if (adv && !dis) return 5;
    if (dis && !adv) return -5;
    return 0;
  }

  // A d20 test honouring 5e's advantage/disadvantage. Returns the ACTIVE natural
  // die so degreeOf can read crits off it.
  async function _d20Test(mod, { advantage = false, disadvantage = false } = {}) {
    const formula = (advantage && !disadvantage) ? "2d20kh"
                  : (disadvantage && !advantage) ? "2d20kl" : "1d20";
    const roll = await new Roll(`${formula} + @m`, { m: mod }).evaluate();
    const results = roll.dice?.[0]?.results ?? [];
    const die = (results.find(r => r.active) ?? results[0])?.result ?? null;
    return { roll, total: roll.total ?? 0, die };
  }

  function _targetDefense(actor) {
    if (!actor) return { value: 15, label: "Difficulty" };
    // D&D 5e: Carnal Resist IS the target's AC. Exposed lowers it, so the spiral
    // compounds in the system's most familiar number.
    if (is5e()) {
      const ac = actor.system?.attributes?.ac?.value ?? 10;
      return { value: ac + _carnalACMod(actor), label: "Carnal Resist" };
    }
    if (AFLP.system?.isNPC?.(actor)) return { value: actor.system?.difficulty ?? 15, label: "Difficulty" };
    return { value: actor.system?.evasion ?? 10, label: "Evasion" };
  }

  // The Difficulty to beat when contesting an actor's HOLD (Carnal Escape, Carnal
  // Rescue): an adversary's Difficulty, or - for a PC captor, who has none - a
  // derived grip DC of 10 + their Proficiency.
  function _holdDC(actor) {
    if (!actor) return 15;
    // D&D 5e: the Carnal DC a captor imposes - the standard monster/PC save-DC
    // shape, 8 + proficiency + Strength. Beaten by a Carnal Escape check.
    if (game.system?.id === "dnd5e") {
      const prof = actor.system?.attributes?.prof ?? 2;
      const str  = actor.system?.abilities?.str?.mod ?? 0;
      return 8 + prof + str;
    }
    if (AFLP.system?.isNPC?.(actor)) return actor.system?.difficulty ?? 15;
    const prof = actor.system?.proficiency?.value ?? actor.system?.proficiency ?? 1;
    return 10 + (Number(prof) || 1);
  }

  // System-aware resource phrasing: Daggerheart "mark/clear N Arousal"; PF2e
  // and 5e "gain/lose N Arousal". Falls back to mark/clear if no adapter.
  const _aro = (delta, label = "Arousal") => (AFLP.system?.deltaText?.(delta, label) ?? `${delta >= 0 ? "mark" : "clear"} ${Math.abs(delta)} ${label}`);
  const _aroReset = (label = "Arousal") => (AFLP.system?.resetText?.(label) ?? `${label} clears to 0`);

  // Mark n Stress, overflowing into HP per DH ("when you must mark Stress but
  // can't, mark 1 HP instead"). Returns { stress, hp, lastHp } where lastHp is
  // true if this mark filled the HP track (the Mind Break trigger).
  async function _markStress(actor, n = 1) {
    const s = _res(actor, "stress");
    const hp = _res(actor, "hitPoints") ?? _res(actor, "hp") ?? _res(actor, "health");
    if (!s) return { stress: null, hp: null, lastHp: false };
    const sMax = s.max ?? 6;
    let sVal = s.value ?? 0;
    let overflow = 0;
    for (let i = 0; i < n; i++) {
      if (sVal < sMax) sVal++;
      else overflow++;
    }
    await AFLP.gm.run("updateActor", actor, { "system.resources.stress.value": sVal });
    let lastHp = false, hpVal = hp?.value ?? null;
    if (overflow > 0 && hp) {
      const hMax = hp.max ?? 6;
      const hpBefore = hp.value ?? 0;
      hpVal = Math.min(hMax, hpBefore + overflow);
      await AFLP.gm.run("updateActor", actor, { [_hpPath(actor)]: hpVal });
      // Only the mark that FILLS the track triggers Mind Break. If HP was already
      // full (the character has already broken / is making death moves), further
      // Stress overflow must not re-fire it.
      lastHp = hpBefore < hMax && hpVal >= hMax;
    }
    return { stress: sVal, hp: hpVal, lastHp };
  }

  // DH stores HP under different keys across sheet versions; resolve the path
  // that actually exists on this actor so the update lands.
  function _hpPath(actor) {
    const r = actor?.system?.resources ?? {};
    if (r.hitPoints) return "system.resources.hitPoints.value";
    if (r.hp) return "system.resources.hp.value";
    if (r.health) return "system.resources.health.value";
    return "system.resources.hitPoints.value";
  }

  async function _markArousal(actor, n = 1) {
    const cur = AFLP.system?.getArousalCurrent?.(actor) ?? 0;
    const max = _arousalMax(actor);
    const next = cur + n;
    if (next >= max) {
      // Climax: reset Arousal and mark a Defeat token (the spiral accelerant).
      await AFLP.gm.run("setArousal", actor, 0, max);
      await _markDefeat(actor, 1);
      return { climaxed: true, arousal: 0, max };
    }
    await AFLP.gm.run("setArousal", actor, next, max);
    return { climaxed: false, arousal: next, max };
  }

  async function _coolArousal(actor, n = 1) {
    const cur = AFLP.system?.getArousalCurrent?.(actor) ?? 0;
    const next = Math.max(0, cur - n);
    await AFLP.gm.run("setArousal", actor, next, _arousalMax(actor));
    return next;
  }

  // Carnal actions ARE the Arousal engine (replacing the old Sexual Advance step):
  // a landed action advances Arousal by n for BOTH the target and the source
  // adversary. Routed through AFLP_Arousal.increment so a climax on either side
  // resolves fully - Horny/Defeat/Purity and the cum macro - "as normal". Returns
  // the target's result { arousal, climaxed, max }.
  // Conditions an adversary feature says it inflicts, applied when its Carnal
  // Press LANDS. Declared as pack DATA, not code:
  //
  //     flags["ardisfoxxs-lewd-pf2e"].applies = { horny: 1, bullified: 1 }
  //
  // WHY DATA. Eleven DH adversary features had text promising a condition and
  // carried NO ActiveEffect and no flag, so using them applied nothing - the
  // tester's "the effect it's applying seems blank". That is the same failure the
  // Loads and Cum Shot effects had: text that grants something with no mechanism
  // behind it. A flag means a new adversary feature needs no code at all.
  //
  // Applied through AFLP.cond.apply, so the ceiling from CONDITION_CAPS, the DH
  // status bridge, and Submitting's Restrained all come along for free rather
  // than being reimplemented here.
  //
  // WHERE IT FIRES: every branch where the press LANDS - giveIn, autoLand, and
  // rollApproach's two failure rungs. NOT markStressApproach: paying Stress to
  // power through IS resisting, so nothing should land.
  //
  // Restrained is deliberately NOT listed on features that say "becomes
  // Restrained" - Submitting carries it since 13 Aug 2026, so listing it would
  // apply it twice and, worse, leave a second claim on it after an Escape.
  //
  // Stale when: a feature needs a condition applied on a SUCCESSFUL resist, or at
  // a time other than the landing. Neither exists today.
  async function _applyFeatureApplies(target, applies, opts = {}) {
    if (!target || !applies || typeof applies !== "object") return [];
    const done = [];
    for (const [key, amount] of Object.entries(applies)) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) continue;
      try {
        // SWALLOWED IS A SUBSYSTEM, NOT JUST A CONDITION, and `cond.apply` only
        // writes the condition. A feature declaring `applies: {swallowed: 1}` used
        // to produce a creature Swallowed IN NAME ONLY: no escape DC, so
        // AFLP.swallowed.escapeDC read 0; no `by`, so the swallower's turn never
        // churned it; and none of the ownership bookkeeping, so freeing it gave
        // back nothing and left whatever Restrained it had. It was pulled from the
        // content pending this routing rather than shipped broken.
        //
        // AFLP.swallowed.apply is the one place that does the whole job - the
        // condition, Exposed and Restrained, and the flag recording which of those
        // two it actually GRANTED so free() returns only its own.
        if (key === "swallowed") {
          const swTok = opts.sourceTokenId ? canvas?.tokens?.get(opts.sourceTokenId) : null;
          const swallower = swTok?.actor?.getWorldActor?.() ?? swTok?.actor ?? null;
          // THE ESCAPE DC IS THE PRESS DIFFICULTY - the number they just failed
          // against. The hand-run macro asks the GM for one; a press already has it.
          //
          // AROUSAL PER ROUND IS 0, DELIBERATELY. The `1` in `applies: {swallowed: 1}`
          // is a condition VALUE, not a rate, and reading it as one would make every
          // swallowing adversary churn Arousal - against the swallow macro's own
          // default and its note: "0 for an ordinary gullet. Raise it only for a
          // swallower that works its captive over." A feature that wants a churn
          // rate needs its own authored number; there is nowhere in a flat
          // {key: value} map to put a second one.
          await AFLP.swallowed.apply(target, swallower, { dc: opts.dc ?? null, arousal: 0 });
          done.push("Swallowed");
          continue;
        }
        await AFLP.cond.apply(target, key, n);
        done.push(`${AFLP.conditions?.[key]?.name ?? key} ${n}`);
      } catch (e) { console.warn(`AFLR | feature applies ${key}:`, e?.message); }
    }
    return done;
  }

  async function _carnalArousal(target, sourceTokenId, n = 1) {
    const inc = window.AFLP_Arousal?.increment;
    const max = _arousalMax(target);
    const before = AFLP.system?.getArousalCurrent?.(target) ?? 0;
    // Size Difference: an oversized partner in the hole intensifies the act.
    // Shared engine (schema.js AFLP.sizeGapOnAct) - same code path the PF2e
    // Sexual Advance macro uses, so both systems stay in lockstep.
    const src0 = sourceTokenId ? (canvas?.tokens?.get(sourceTokenId)?.actor?.getWorldActor?.() ?? canvas?.tokens?.get(sourceTokenId)?.actor) : null;
    const _gapX = await (AFLP.sizeGapOnAct?.(src0, sourceTokenId, target) ?? { extraTarget: 0, extraSource: 0, scene: null });
    const nT = n + (_gapX.extraTarget ?? 0);
    const nS = n + (_gapX.extraSource ?? 0);
    if (inc) await inc(target, nT, "Carnal action", null);
    else await _markArousal(target, nT);
    // The source adversary shares the heat - their own climax breeds the target.
    //
    // RAISING THE SOURCE'S AROUSAL IS ALL THIS DOES, AND THAT IS DELIBERATE. The
    // deposit is NOT wired here. `AFLP_Arousal.increment` calls `_onArousalMax`
    // the moment the source tops out, and that runs the AFLR Cum macro, which is
    // the ONE deposit engine on every system: it spends exactly one Cum Shot from
    // the pool, routes it by the cummer's own scene position, applies cumflation,
    // spills the remainder, rolls the Brood Roll and resets Arousal.
    //
    // MEASURED IN dh-test, 16 Aug 2026, adversary source into a PC: pool 12 -> 11,
    // the PC's `anal` cumflation +1, routed from the source's `doggy-style-anal`
    // participant position with no dialog. It works on Daggerheart. It does NOT
    // need a second engine here.
    //
    // A SECOND ENGINE IS EXACTLY WHAT WAS HERE FOR ONE DAY, and it is worth saying
    // why it was wrong, because the mistake looks reasonable. On 15 Aug this block
    // called a local `depositOnClimax`, detecting the climax as
    // `arousalAfter <= arousalBefore` after a positive increment. That tell is not
    // a climax:
    //   - On the tip-over (5 -> 6 of 6) it reads FALSE, so it missed the one event
    //     it was written for.
    //   - Once the creature is PINNED at max it reads TRUE on every later action,
    //     so it deposited a load per round from a creature that never climaxed.
    // Arousal only returns to the floor inside `_onArousalMax` past the defer and
    // Edge gates (and again in the cum macro). While `_shouldDeferCum` is true -
    // the default - the creature sits at max waiting for a Cum click, and the pin
    // reads identically to a wrap.
    //
    // WHAT WOULD MAKE THIS COMMENT STALE: the cum macro ceasing to run on a
    // system (check `_onArousalMax`'s macro dispatch), or the source's climax
    // needing a destination the cummer's own position cannot express. Neither is
    // a reason to re-detect a climax by comparing Arousal - ask `_onArousalMax`.
    const src = sourceTokenId ? (canvas?.tokens?.get(sourceTokenId)?.actor) : null;
    if (src) {
      try { if (inc) await inc(src, nS, "Carnal action", sourceTokenId); else await _markArousal(src, nS); }
      catch (e) { /* non-fatal - the source's heat must never break the resolution */ }
    }
    const after = AFLP.system?.getArousalCurrent?.(target) ?? 0;
    const climaxed = after <= before && nT > 0;
    // Size training bookkeeping: if this act climaxed the receiver, flag their
    // training as earned this scene. Pips are applied at scene end (phase 4).
    if (climaxed && _gapX?.scene) {
      try {
        _gapX.scene.sizeClimaxed ??= {};
        _gapX.scene.sizeClimaxed[target.id] = true;
      } catch (e) { /* non-fatal */ }
    }
    return { arousal: after, climaxed, max };
  }

  // Defeat past the cap (3) doesn't stack - each further Defeat instead marks 3
  // Stress, which follows the normal DH cascade (Stress full -> overflow into HP
  // -> the last HP triggers Mind Break). This keeps a creature left in a scene
  // and pressed past Defeat 3 sliding inevitably toward Mind Break rather than
  // plateauing. Returns { stressMarked, brokeMind, ... }.
  // Per-actor Defeat cap. Mine Now (Top Mastery) lowers it to 2 while any
  // creature is Submitting to the character; the module does not reliably
  // track Submitting-to-whom, so feature presence governs and the GM
  // arbitrates the edge case of a Top with no thrall in the scene.
  function _defeatMax(actor) {
    try {
      if (actor.items?.some?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "mine-now"
        || i.name === "Mine Now")) return 2;
    } catch (e) { /* fall through */ }
    return 3;
  }

  async function _defeatOverflow(actor, n = 1) {
    if (n <= 0) return { stressMarked: 0, brokeMind: false };
    // Overflow rule: each Defeat token past the cap marks Stress equal to the
    // Defeat tokens the character is holding (their cap) - 3 at the standard
    // cap, 2 under Mine Now's lowered cap - not a flat 3.
    const perToken = _defeat(actor) || _defeatMax(actor);
    const res = await _markStress(actor, n * perToken);
    let brokeMind = false;
    if (res?.lastHp) { await AFLP_Carnal._mindBreak(actor); brokeMind = true; }
    return { stressMarked: n * perToken, brokeMind, ...res };
  }

  async function _markDefeat(actor, n = 1) {
    // Defeat and Bimbofied are independent tracks - a character can carry both at
    // once. Bimbofied adds resist disadvantage dice; Defeat raises the power-through
    // cost. Marking Defeat is no longer blocked by Bimbofied.
    const cur = _defeat(actor);
    const cap = _defeatMax(actor);
    const next = Math.min(cap, cur + n); // cap at 3 (2 under Mine Now), like the token track
    const overflow = (cur + n) - next;   // Defeat that would exceed the cap
    await AFLP.cond.setValue(actor, "defeat", next);
    // Keep the compendium-feature resource track (if the actor carries the
    // Defeat feature) visually in step with the flag count.
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "defeat"
        || /^defeat$/i.test(i.name ?? ""));
      if (feat?.system?.resource?.type) {
        await AFLP.gm.run("updateItem", actor, feat.id, { "system.resource.value": next });
      }
    } catch (e) { /* feature not present; flag is source of truth */ }
    // Overflow rule: at Defeat 3, the excess becomes Stress (3 per token).
    let over = { stressMarked: 0, brokeMind: false };
    if (overflow > 0) over = await _defeatOverflow(actor, overflow);
    return { defeat: next, overflow, ...over };
  }

  // `_markHopeOrFear` WAS HERE AND IS GONE, 22 Aug 2026. Recorded rather than just
  // deleted, because it existed for a real bug and someone will wonder where it went.
  //
  // It hand-applied the duality for the four carnal rolls, and it was fixed on 21 Aug
  // to bank a player's Fear through the GM proxy (the pool is a world SETTING, so a
  // player client cannot write one; measured across two clients, GM seat 0 -> 1,
  // Brakka's seat 0 -> 0 three times). Then Ardis ruled on 22 Aug: "both escape and
  // rescue should just have arousal changes be the extra aflr effect and otherwise
  // just offer whatever the dh native effects for the roll is" - and porting the
  // Bullified urge to the system roller the same day took its last caller.
  //
  // All four carnal duality rolls now go through `_systemDualityRoll`, so Daggerheart
  // owns the Hope, the Fear and the crit's Stress clear. AFLR owns Arousal.
  //
  // THE `bankFear` GM OP IS STILL REGISTERED and now has ZERO consumers. Left in
  // place deliberately rather than deleted: it works, it is asserted by the suite,
  // and it is the only route a player client has to the Fear pool if any future
  // carnal path needs one. Deleting it is Ardis's call, not a tidy-up.

  function _card(actor, title, lines, extra = "") {
    const body = lines.filter(Boolean).map(l => `<p>${l}</p>`).join("");
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="aflp-chat-card aflp-carnal-card">
        <p><strong>${actor.name}</strong> - ${title}</p>${body}${extra}</div>`,
    });
  }

  // Build the token-like data object AFLP.HScene.startScene expects.
  function _tokenData(tok) {
    return {
      id: tok.id,
      actorId: tok.actor?.id ?? null,
      name: tok.name,
      img: tok.document?.texture?.src ?? tok.actor?.img ?? "icons/svg/mystery-man.svg",
      tokenDoc: tok.document ?? null,
    };
  }

  // Start (or join) an H-Scene between the adversary token and the PC after the
  // PC fails to resist a Carnal action (failed roll or gave in). Marks the scene
  // roles so the card reads right and the role prompt does not fire. Idempotent:
  // startScene find-or-joins the one battlemap scene, so re-calling is safe.
  async function _startHScene(pcActor, sourceTokenId, sourceName, { deposit = false } = {}) {
    try {
      if (!AFLP.HScene?.startScene || !AFLP.Settings?.hsceneEnabled) return false;
      const srcTok = sourceTokenId ? canvas?.tokens?.get(sourceTokenId) : null;
      const pcTok = canvas?.tokens?.placeables?.find(t => t.actor?.id === pcActor.id);
      if (!srcTok || !pcTok) return false;
      try { await AFLP.cond.apply(pcActor, "submitting"); } catch (e) { /* role nicety */ }
      try { if (srcTok.actor) await AFLP.cond.apply(srcTok.actor, "dominating"); } catch (e) { /* role nicety */ }
      // Hypnosis sink rule B: failing a Carnal Resist against (or Giving In to)
      // your entrancer deepens Entranced to Hypnotized. Every failed-resist and
      // give-in path funnels through here.
      try { await AFLP.hypnoSink?.(pcActor, srcTok.actor ?? null); } catch (e) { /* sink is non-fatal */ }
      // Start the scene WITHOUT its own position prompt: ensureAttackerPosition
      // below is the single authoritative prompt (it also locks the hole for a
      // penetrative landing). Letting startScene ALSO prompt opened two dialogs,
      // because its prompt is fire-and-forget and the position is still unset
      // when the awaited ensureAttackerPosition runs a moment later.
      AFLP.HScene.startScene(_tokenData(srcTok), _tokenData(pcTok), false, { promptPosition: false });
      await _card(pcActor, "is pulled into an H-Scene", [
        `${sourceName ? `<strong>${sourceName}</strong>` : "The adversary"} has them now - the encounter becomes an H-Scene. The adversary presses with its H-Scene Action whenever it acts, until they break free or break.`,
      ]);
      // Bullified urge: a Bull within Close range of an ally being made to Submit to
      // an ADVERSARY feels a near-irresistible pull to join in and top the ally too,
      // or to fight the adversary for dominance. Surfaced as a GM reminder (the urge
      // is fiction the GM adjudicates - no forced mechanic).
      try {
        if (srcTok.actor && AFLP.system?.isNPC?.(srcTok.actor)) {
          // THE BULLIFIED CARD NAMES THE BAND: "When an ally within Close range
          // is Submitting to an adversary, you get a near irresistible urge to
          // join in". Per the DH core rules' optional grid guidance, Close is 6
          // squares - 30 scene units on a 5ft grid - so the original flat 30 was
          // already right and its "Close range band approximation" comment was
          // accurate. I briefly rerouted this through DH's `close` ladder entry
          // (10) on the mistaken reading that 30 meant Very Far; that would have
          // narrowed the card's Close to 2 squares.
          //
          // ASSUMES A 5FT GRID, which is what every scene in dh-test uses. A band
          // string is the grid-independent form, once the squares-vs-units
          // question on AFLP.dhRanges is settled.
          const bulls = (canvas?.tokens?.placeables ?? []).filter(t =>
            t.actor && t.id !== pcTok.id && !AFLP.system.isNPC?.(t.actor)
            && (AFLP.system?.conditionValue?.(t.actor, "bullified") ?? 0) > 0
            && AFLP.withinRange(t, pcTok, { pf2e: 30, daggerheart: 30, dnd5e: 30 }));
          for (const bt of bulls) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: bt.actor }),
              content: `<div class="aflp-chat-card aflp-carnal-card"><p><strong>${bt.actor.name}</strong> (Bull) sees <strong>${pcActor.name}</strong> Submitting to <strong>${sourceName ?? "an adversary"}</strong> within Close range. A near-irresistible urge takes them: join in and top the ally as well, or fight the adversary for dominance. (GM: they must act on it or fight the pull.)</p></div>`,
            });
          }
        }
      } catch (e) { /* urge reminder is non-fatal */ }
      // Position is set for ANY landing carnal action, penetrative or not, so the
      // UI supports the fiction: a tease or a branding still sets a scene position
      // (non-penetrative actions get the foreplay/pain-play list). `deposit` here
      // is the feature's `penetrates` flag, and it now chooses only WHICH LIST THE
      // PICKER OPENS ON.
      //
      // THE LANDING NO LONGER DEPOSITS. Until 15 Aug 2026 this line ran
      // `if (deposit) await _depositLoad(...)`, so a landed penetrative press
      // dumped a full load on contact - no climax involved - and that helper
      // justified it with "adversaries are effectively infinite-cum, so no pool
      // is tracked". Both were wrong: adversaries carry Cum Shot and Loads like
      // any creature (31 of 32 have a pool), and an H-Scene Action is a Carnal
      // Press with extra effects on a success, not a licence to breed on touch.
      //
      // THE DEPOSIT HAPPENS WHEN THE CREATURE CLIMAXES, and it is not this
      // layer's job: `AFLP_Arousal._onArousalMax` runs the AFLR Cum macro, which
      // reads the cummer's own scene position and fills from there. Setting the
      // position here is what makes that routing correct - position says WHERE,
      // the climax says WHEN. See the note in `_carnalArousal`.
      await AFLP.HScene.ensureAttackerPosition?.(srcTok.id, { nonPenetrative: !deposit });
      return true;
    } catch (e) { console.warn("AFLP | startHScene from carnal failed", e); return false; }
  }

  // Locate the scene + participant token id for a PC actor, so a successful
  // escape can actually pull them out of the H-Scene (removeParticipant closes
  // the scene when the last active pairing leaves). Matches on participant
  // actorId or the token's resolved actor id (covers unlinked tokens).
  function _sceneSlotFor(actor) {
    if (!actor) return null;
    try {
      for (const s of (AFLP.HScene?._scenes?.values?.() ?? [])) {
        const p = (s.participants ?? []).find(pp =>
          pp.actorId === actor.id ||
          canvas?.tokens?.get(pp.tokenId)?.actor?.id === actor.id);
        if (p) return { sceneId: s.id, tokenId: p.tokenId };
      }
    } catch (e) { /* none found */ }
    return null;
  }

  // For a Lust Haze Carnal Rescue that fails with Fear: decide who drags the
  // rescuer in. Prefer a DIFFERENT adversary (the nearest other NPC adversary
  // token to the rescuer); fall back to the ally's own captor when it is the
  // only adversary present. Returns { tokenId, name, same } or null.
  function _rescuePuller(rescuer, capTokenId, capName) {
    const rTok = rescuer?.getActiveTokens?.()?.[0] ?? null;
    const isAdv = (a) => a && ((AFLP.system?.isNPC?.(a)) ?? (a.type !== "character")) && !a.hasPlayerOwner;
    let best = null, bestD = Infinity;
    for (const t of (canvas?.tokens?.placeables ?? [])) {
      if (!isAdv(t.actor) || t.id === capTokenId) continue;
      let d = 0;
      if (rTok && t.center && rTok.center) d = Math.hypot(t.center.x - rTok.center.x, t.center.y - rTok.center.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) return { tokenId: best.id, name: best.actor.name, same: false };
    const capTok = capTokenId ? canvas?.tokens?.get(capTokenId) : null;
    if (capTok) return { tokenId: capTokenId, name: capName || capTok.actor?.name || "the adversary", same: true };
    return null;
  }

  // Roll a Duality resist and classify into the five rungs. `adv` adds (or, if
  // negative, subtracts) advantage d6s to the total - used by Struggle Escape
  // when a prior success-with-Hope resist banked advantage.
  // The word this system uses for the number you roll against: DC on
  // Pathfinder and 5e, DIFFICULTY on Daggerheart. Falls back to "DC" if the
  // adapter predates the getter, which is the safe direction on the two
  // systems that say DC anyway.
  const _dcWord = () => AFLP.system?.dcWord ?? "DC";

  // ── THE SYSTEM'S OWN DUALITY ROLL ────────────────────────────────────────
  //
  // Ardis, 21 Aug 2026: "we want the native roll dialog so the player can use all
  // those things on their sheet on the roll. they can add their trait bonus like
  // they would to any other roll, using the picker" - and "good that we leverage
  // the system's own roller system as much as possible. keeps the player
  // experience consistent."
  //
  // So a Carnal Rescue is an ordinary Daggerheart Action roll: the player gets
  // Experiences, Hope spends, Rally, advantage dice and the Trait Modifier picker,
  // and the system posts its own duality card. Everything below is MEASURED in
  // dh-test on daggerheart 2.6.4, 21 Aug 2026 - see
  // claude/system-duality-roll-draft-2026-08-21.md for the readings.
  //
  // Returns the same shape `_dualityResist` returns, so a call site swaps one line.
  // Returns null when this system has no such pipeline (the caller falls back),
  // and `{ cancelled: true }` when the player dismissed the dialog.
  //
  // GOES STALE IF: the system changes `shouldUseHopeFearAutomation`,
  // `addDualityResourceUpdates`, `applyAdvantage`'s `kh` branch, or where the
  // resource commit lives.
  function _sysWillPayDuality() {
    // THE NATIVE AUTOMATION IS OPT-IN AND DEFAULTS OFF. `DhAutomation`'s own model
    // default is {gm: false, players: false}. And `addDualityResourceUpdates` calls
    // `shouldUseHopeFearAutomation()` with NO ARGUMENTS, so `gmAsPlayer` is true and
    // it always reads the PLAYERS flag - the `gm` half is unreachable from that
    // path, whoever is rolling. Reading `players` here is not a simplification.
    //
    // FAILING OPEN HERE PAYS TWICE: a crit would grant two Hope and clear two
    // Stress. The read is strict-true for that reason.
    try {
      return game.settings.get("daggerheart", "Automation")?.hopeFear?.players === true;
    } catch (e) { return false; }
  }

  // Can this actor roll through the system's duality pipeline at all? Split out
  // so a caller can decide whether ITS OWN prompt is still needed before rolling.
  function _canSystemDuality(actor) {
    return isDH()
      && typeof actor?.rollTrait === "function"
      && !!CONFIG?.Dice?.daggerheart?.DualityRoll;
  }

  // `bonus` is a FLAT NUMBER added to the roll total - the slick's Escape bonus is
  // the only consumer today. It rides `extraFormula`, NOT `roll.modifiers`:
  //
  // MEASURED IN dh-test, 29 Aug 2026, on a throwaway rig:
  //   roll: { modifiers: [...] }        DISCARDED. `configureModifiers` REPLACES
  //                                     `options.roll.modifiers` with the return of
  //                                     `applyBaseBonus()`, so anything passed in is
  //                                     overwritten before the formula is built.
  //   pushing modifiers in the hook     ALSO DISCARDED, and the hook fires BEFORE
  //                                     `configureModifiers` - the array read empty
  //                                     inside it and the push never survived.
  //   extraFormula INSIDE `roll`        IGNORED - it is read off `options.extraFormula`.
  //   extraFormula AT THE TOP LEVEL     LANDS. "1d12 + 1d12 + 0 + 2", modifierTotal 2,
  //                                     and with "100": dice 2 and 10, total 112,
  //                                     success true against Difficulty 10. Both
  //                                     directions - with no extraFormula the total is
  //                                     the dice sum.
  //
  // THE NUMBER ARRIVES UNLABELLED. Daggerheart shows it as a bare `+ N` in the
  // breakdown, so whatever passes a bonus MUST name it in its own chat card, or a
  // GM sees a total two above the dice with nothing explaining it.
  //
  // STALE IF: `configureModifiers` stops reading `this.options.extraFormula`, or the
  // system grows a labelled modifier API - prefer the labelled one the day it exists.
  async function _systemDualityRoll(actor, { trait, dc, adv = 0, actionType = "action", hopeFaces = null, bonus = 0 } = {}) {
    if (!_canSystemDuality(actor)) return null;
    const tr = _DH_TRAITS.includes(String(trait || "").toLowerCase()) ? String(trait).toLowerCase() : "presence";

    // `roll.advantage` IS A TYPE FLAG, NOT A COUNT. Measured: 1 gives +1d6, -1
    // gives -1d6, and 2 gives NOTHING AT ALL (it lands as type 0). AFLR stacks
    // counts, so the count has to arrive through the system's own hook.
    const advType = adv > 0 ? 1 : adv < 0 ? -1 : 0;
    const advCount = Math.min(9, Math.abs(Math.trunc(adv)));
    // `hopeFaces` upgrades the Hope die, for the two Edge cards that promise it:
    // Edge Master's Signature ("roll your Hope Die as a d20 on your Edge rolls")
    // and the Edging Draught ("a d20 instead of a d12"). Measured 23 Aug 2026 in
    // `dh-test`: baseline d12, the hook takes it 12 -> 20, and the NEXT roll is a
    // d12 again - the mutation does not persist, so this cannot leak into anyone
    // else's dice.
    const wantHope = Number(hopeFaces) > 0 ? Number(hopeFaces) : null;
    let hookId = null;
    if (advCount > 1 || wantHope) {
      hookId = Hooks.on("daggerheart.postDualityRollConfiguration", (roll, cfg) => {
        // SCOPED TO OUR OWN ROLL. The hook is global and the await below spans the
        // dialog being open, so another client's duality roll can land inside it.
        try { if (cfg?.source?.actor && cfg.source.actor !== actor.uuid) return; } catch (e) { return; }
        // THE HOPE DIE UPGRADE, and it is applied before the advantage work so a
        // throw there cannot cost it. The DIALOG IS BUILT BEFORE THIS HOOK FIRES,
        // so the dialog will show the table's die while the card shows the
        // upgraded one - that mismatch is how a leaked probe hook was diagnosed on
        // 23 Aug, and it is expected here rather than a bug.
        if (wantHope) {
          try {
            if (roll.dHope && roll.dHope.faces !== wantHope) {
              roll.dHope.faces = wantHope;
              roll.resetFormula?.();
            }
          } catch (e) { console.warn("AFLP | Hope die upgrade could not be applied", e); }
        }
        if (advCount <= 1) return;
        try {
          roll.advantageNumber = advCount;
          roll.applyAdvantage?.();
          // THE `kh` LINE IS NOT OPTIONAL. `applyAdvantage` sets modifiers=['kh']
          // only on the branch that PUSHES a new advantage term (terms.length < 4).
          // When the term already exists - which it does whenever the TYPE came in
          // through the config, as it does here - it takes `terms[4] = advDie` and
          // never sets `kh`. MEASURED without this line, disadvantage 3, four rolls:
          // die totals 7, 10, 6, 4 against maxima of 5, 5, 3, 2 - it SUMS. With it:
          // 3d6kh, totals 5, 6, 5, 4, the max every time.
          //
          // This is the bug AFLR already fixed once in `_dualityResist` ("at 3 dice
          // that is -10.3 average instead of -5.0, roughly double"), and without
          // this line it comes back looking like the system's own behaviour.
          const die = roll.dDisadvantage ?? roll.dAdvantage;
          if (die) die.modifiers = ["kh"];
          roll.resetFormula?.();
        } catch (e) { console.warn("AFLP | duality advantage count could not be applied", e); }
      });
    }

    let cfg = null;
    try {
      // NO TRAIT MODIFIER IS PASSED. Measured on a rig with Strength 2:
      // rollTrait("strength") produced `1d12 + 1d12 + 2` with modifierTotal 2 -
      // THE SYSTEM ADDS THE TRAIT BONUS ITSELF. Passing AFLR's `_traitMod` as well
      // would double it, silently.
      cfg = await actor.rollTrait(tr, {
        actionType,
        // AN EVENT MUST BE PASSED OR THE SYSTEM SILENTLY SKIPS THE ROLL DIALOG,
        // WHICH IS THE ENTIRE POINT OF ROUTING THROUGH IT.
        //
        // `D20Roll.applyKeybindings` decides the dialog and OVERWRITES whatever
        // `dialog.configure` was passed:
        //     let keys = { normal: true, advantage: false, disadvantage: false };
        //     if (config.event) keys = { normal: shift||alt||ctrl, ... };
        //     config.dialog.configure = !Object.values(keys).some(k => k);
        // With NO event, `normal` stays true, so `configure` becomes FALSE and the
        // dialog never opens. `rollTrait` sets `event: event` - the bare global -
        // which is undefined by the time AFLR's async code calls it.
        //
        // MEASURED on Brakka's client, 21 Aug 2026, a card-driven Carnal Resist:
        // `hasEvent: false`, `dialog.configure` -> **false**, dialogs opened **0**,
        // while the roll itself went through the system. The player got no sheet:
        // no Experiences, no Hope spend, no Rally.
        //
        // A no-modifier event is the system's own "show me the dialog" contract -
        // measured: synthetic event -> 1 dialog, synthetic event with shiftKey ->
        // 0. Passing a REAL event here later would preserve the player's
        // shift-to-skip shortcut for free.
        event: { shiftKey: false, altKey: false, ctrlKey: false },
        // TOP LEVEL, not inside `roll` - measured, see the header. Omitted entirely
        // when there is no bonus so an ordinary roll's formula is unchanged.
        ...(Number(bonus) ? { extraFormula: String(Number(bonus)) } : {}),
        roll: { trait: tr, type: "trait", difficulty: dc, advantage: advType },
      });
    } catch (e) {
      console.warn("AFLP | system duality roll failed, falling back", e);
      return null;
    } finally {
      if (hookId !== null) { try { Hooks.off("daggerheart.postDualityRollConfiguration", hookId); } catch (e) {} }
    }

    // THE PLAYER DISMISSED THE DIALOG. Measured: `buildConfigure` returns null and
    // `build` resolves UNDEFINED - no roll happened, so nobody is paid and no card
    // posts, which is what dismissing any Daggerheart roll does.
    if (!cfg) return { cancelled: true };

    // THE COMMIT IS THE CALLER'S JOB. `diceRoll` only POPULATES
    // config.resourceUpdates; nothing in DHRoll.build writes it - the system's own
    // callers do `result.resourceUpdates.updateResources()` themselves. Omitting
    // this reads as "the automation does nothing" and writes nothing, silently.
    //
    // UNVERIFIED FROM A GM SEAT: this writes the actor's Hope and Stress AND the
    // world's Fear SETTING, and a Carnal Rescue is rolled by a PLAYER. Whether the
    // system proxies the setting write or throws on a player client needs a second
    // logged-in client to answer.
    const paid = _sysWillPayDuality();
    if (paid) {
      try { await cfg.resourceUpdates?.updateResources?.(); }
      catch (e) { console.warn("AFLP | native duality resources could not be committed", e); }
    }

    const r = cfg.roll ?? {};
    // `roll.hope` AND `roll.fear` ARE OBJECTS, NOT NUMBERS: `{dice: "d12", value: 5,
    // rerolled: {...}}`. Measured 21 Aug 2026. The first cut read them as numbers
    // with a `?? 0` guard, and `?? 0` NEVER FIRES ON A WRONG TYPE - the object is
    // not null - so `Number({...})` produced NaN and a real player's Carnal Rescue
    // card read "Duality: Hope NaN / Fear NaN". Caught by clicking the button on a
    // player client, not by the suite: the suite's stub returned plain numbers,
    // so the test agreed with the bug.
    // Falls back to the d12 entries in `roll.dice`, which carry the same values.
    const _dieVal = (v, idx) => {
      const n = Number(v?.value ?? v);
      if (Number.isFinite(n)) return n;
      const d12 = (Array.isArray(r.dice) ? r.dice : []).filter(x => x?.dice === "d12" || /\bd12\b/.test(String(x?.formula ?? "")));
      const alt = Number(d12[idx]?.total);
      return Number.isFinite(alt) ? alt : 0;
    };
    const isCrit = !!r.isCritical;
    const duality = Number(r.result?.duality ?? 0);
    const withHope = isCrit || duality === 1;
    // `success` comes from the SYSTEM, and its rule is the one AFLR already used:
    // `roll.isCritical || roll.total >= config.roll.difficulty`. Read, not assumed.
    const success = !!r.success;
    const rung = isCrit ? "crit"
      : success ? (withHope ? "success-hope" : "success-fear")
      : (withHope ? "fail-hope" : "fail-fear");
    return {
      duality: null, hopeDie: _dieVal(r.hope, 0), fearDie: _dieVal(r.fear, 1),
      isCrit, withHope, success, rung,
      // `paid` tells the caller whether the SYSTEM applied Hope/Fear/the crit's
      // Stress clear, so AFLR knows whether to apply its own.
      viaSystem: true, paid, trait: r.trait ?? tr, total: Number(r.total ?? 0), config: cfg,
    };
  }

  async function _dualityResist(actor, dc, adv = 0, flatMod = 0) {
    let formula = "1d12 + 1d12";
    // Daggerheart rolls advantage/disadvantage dice KEEP-HIGHEST, not summed: three
    // disadvantage is -3d6kh, not -3d6. This summed them, making every extra die a
    // full d6 worse - at 3 dice that is -10.3 average instead of -5.0, roughly
    // double. It applied to every Carnal resist, so Bimbofied and Bullified tokens
    // have been hitting about twice as hard as the design says. cumflation.js has
    // documented the keep-highest rule correctly the whole time.
    if (adv > 0) formula += ` + ${adv}d6kh`;
    else if (adv < 0) formula += ` - ${Math.abs(adv)}d6kh`;
    if (flatMod > 0) formula += ` + ${flatMod}`;
    else if (flatMod < 0) formula += ` - ${Math.abs(flatMod)}`;
    const duality = await new Roll(formula).evaluate();
    const d12 = duality.dice.filter(d => d.faces === 12).flatMap(d => d.results.map(x => x.result));
    const hopeDie = d12[0] ?? 0, fearDie = d12[1] ?? 0;
    const isCrit = hopeDie === fearDie;
    const withHope = isCrit || hopeDie > fearDie;
    const success = isCrit || duality.total >= dc; // crit always succeeds
    let rung;
    if (isCrit) rung = "crit";
    else if (success && withHope) rung = "success-hope";
    else if (success && !withHope) rung = "success-fear";
    else if (!success && withHope) rung = "fail-hope";
    else rung = "fail-fear";
    return { duality, hopeDie, fearDie, isCrit, withHope, success, rung };
  }

  // ── D&D 5e Carnal verbs ───────────────────────────────────────────────────
  // 5e front-loads difficulty on the ATTACKER (like PF2e, unlike DH): a bigger,
  // badder monster is a bigger threat, so the GM's CR choice is the loop's dial.
  // Carnal Resist is therefore a static number (AC), not a roll.

  // Carnal Press: the adversary's action. Attack roll vs the target's Carnal
  // Resist. Opening a scene applies Grappled + Exposed 1 on top of the Submitting
  // / Dominating that _startHScene sets. A natural 20 strips them outright
  // (Exposed 2). Once the presser holds Dominating the press auto-lands, no roll,
  // mirroring PF2e - Struggle Snuggle rolls to establish, Sexual Advance does not.
  async function _press5e(bullActor, opts = {}) {
    const targetActor = opts.targetActor;
    const bullTokenId = opts.sourceTokenId;
    if (!bullActor || !targetActor) return null;

    // NO POSED GATE HERE, and that is correct as of 14 Aug 2026: Posed is a
    // Daggerheart-only condition - one card in aflr-dh-items and a row in the DH
    // adapter's AFLR_HUD_CONDS, with nothing in the 5e packs. WHAT MAKES THIS
    // COMMENT STALE: a Posed card reaching aflr-5e-items. Then mirror the
    // `held || posed` gate from the DH press() below.
    const held = AFLP.cond?.has?.(targetActor, "submitting") && AFLP.cond?.has?.(bullActor, "dominating");
    if (held) return AFLP_Carnal.autoLand(targetActor, { ...opts, sourceTokenId: bullTokenId, sourceName: bullActor.name });

    const def  = _targetDefense(targetActor);
    const dc   = opts.dc ?? def.value;
    const prof = bullActor.system?.attributes?.prof ?? 2;
    const str  = bullActor.system?.abilities?.str?.mod ?? 0;
    const adv  = _bull(bullActor) > 0;

    const r = await _d20Test(prof + str, { advantage: adv });
    // degreeOf's crit tiers ARE 5e's attack rule: nat 20 always hits, nat 1 always
    // misses, regardless of modifiers.
    const degree = AFLP.system.degreeOf(r.total, dc, r.die);
    const hit = (degree === "success" || degree === "critSuccess");

    const lines = [];
    if (adv) lines.push(`<em style="font-size:11px;color:#806040;">(Rolled with advantage - Bullified.)</em>`);

    if (!hit) {
      lines.push(degree === "critFail"
        ? `Natural 1 - the press fumbles badly and they slip the grab entirely.`
        : `The press misses - <strong>${targetActor.name}</strong> keeps them off (Carnal Resist ${dc}).`);
      await _card(bullActor, `presses ${targetActor.name}`, [`Carnal Press: <strong>${r.total}</strong> vs Carnal Resist <strong>${dc}</strong>.`, ...lines]);
      return { verb: "press", hit: false, degree, total: r.total, dc };
    }

    await _startHScene(targetActor, bullTokenId, bullActor.name, { deposit: !!opts.deposit });
    try { await AFLP.cond.apply(targetActor, "grabbed"); } catch (e) { /* non-fatal */ }
    const expLevel = (degree === "critSuccess") ? 2 : 1;
    try { await AFLP.cond?.raiseTo?.(targetActor, "exposed", expLevel, opts.targetTokenId ?? null); }
    catch (e) { /* non-fatal */ }

    // "Grappled" is PF2e's word; DH maps grabbed -> Restrained, so name the
    // condition the reader's own system will show on their sheet.
    const _grabWord = AFLP.system?.id === "daggerheart" ? "Restrained" : "Grappled";
    lines.push(degree === "critSuccess"
      ? `Natural 20 - they are seized and stripped bare in one motion. <strong>${_grabWord}</strong>, <strong>Submitting</strong>, <strong>Exposed 2</strong>.`
      : `The press lands. <strong>${_grabWord}</strong>, <strong>Submitting</strong>, <strong>Exposed 1</strong>.`);
    await _card(bullActor, `presses ${targetActor.name}`, [`Carnal Press: <strong>${r.total}</strong> vs Carnal Resist <strong>${dc}</strong>.`, ...lines]);
    return { verb: "press", hit: true, degree, total: r.total, dc, exposed: expLevel };
  }

  // Carnal Escape: the target's action, and the one place they roll. A single
  // check against the Dominator's Carnal DC - not a contest, which would double
  // the dice. Athletics or Acrobatics, THEIR choice (5e's own grapple-escape
  // idiom, and it echoes DH's Presence-or-Instinct).
  async function _escape5e(actor, opts = {}) {
    const dc    = opts.dc ?? 15;
    // The dock passes the player's pick as `trait` (its DH name); accept either.
    const skill = (String(opts.skill || opts.trait || "").toLowerCase() === "acr") ? "acr" : "ath";
    const label = skill === "acr" ? "Acrobatics" : "Athletics";
    const mod   = actor.system?.skills?.[skill]?.total ?? 0;

    let hadAdv = false;
    try { hadAdv = !!actor.getFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* none */ }
    if (hadAdv) { try { await actor.unsetFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* non-fatal */ } }

    const r = await _d20Test(mod, { advantage: hadAdv || _purity(actor) > 0 });
    const degree = AFLP.system.degreeOf(r.total, dc, r.die);

    const lines = [];
    if (hadAdv) lines.push(`<em style="font-size:11px;color:#608060;">(Advantage from an ally's distraction.)</em>`);
    let escaped = false, arousal = null;

    if (degree === "critSuccess") {
      escaped = true;
      try { await AFLP.gm.run("setArousal", actor, 0, _arousalMax(actor)); arousal = 0; } catch (e) { /* non-fatal */ }
      lines.push(`Natural 20 - they tear free and the heat drains away completely. <strong>${_aroReset()}</strong>.`);
    } else if (degree === "success") {
      escaped = true;
      arousal = await _coolArousal(actor, 2);
      lines.push(`They break free - the wrench of it wrings them out. They <strong>${_aro(-2)}</strong>, now <strong>${arousal}</strong>.`);
    } else if (degree === "fail") {
      const ar = await _markArousal(actor, 2); arousal = ar.arousal;
      lines.push(`They stay caught, and writhing only stokes them` + (ar.climaxed ? ` into a climax.` : ` - Arousal climbs to <strong>${ar.arousal}</strong>.`));
    } else { // critFail
      const ar = await _markArousal(actor, 4); arousal = ar.arousal;
      lines.push(`Natural 1 - they struggle and only make it worse` + (ar.climaxed ? ` - they climax.` : ` - Arousal spikes to <strong>${ar.arousal}</strong>.`));
      if (_purity(actor)) {
        const pg = await _markDefeat(actor, 1);
        lines.push(pg.overflow > 0
          ? `Their Purity shatters - already at <strong>Defeat 3/3</strong>.`
          : `Their Purity cracks - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
      }
    }

    await _card(actor, "attempts a Carnal Escape", [`${label}: <strong>${r.total}</strong> vs Carnal ${_dcWord()} <strong>${dc}</strong>.`, ...lines]);

    if (escaped) {
      for (const slug of ["grabbed", "restrained", "submitting"]) {
        try { await AFLP.cond.remove(actor, slug); } catch (e) { /* non-fatal */ }
      }
      try {
        const loc = _sceneSlotFor(actor);
        if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
      } catch (e) { console.warn("AFLP | _escape5e: scene exit failed", e); }
    }
    return { verb: "escape", escaped, degree, total: r.total, dc, arousal };
  }

  // Ally intervention. 5e's action economy is tight, so spending a whole action
  // to help must matter. Two options, both real choices:
  //   "break"    - the ally makes the Carnal Escape check on the target's behalf.
  //                The bullish hero rips them out of danger.
  //   "distract" - the ally grants advantage on the target's NEXT Carnal Escape.
  //                The healer cracks the thing over the head so the hero can pull
  //                free on their own turn.
  async function _ally5e(rescuer, target, opts = {}) {
    if (!rescuer || !target) return null;
    // The dock hands the pick through as `trait`: "break:ath" / "break:acr" /
    // "distract". opts.mode / opts.skill win when called directly from the API.
    const raw  = String(opts.mode || opts.trait || "break").toLowerCase();
    const mode = raw.startsWith("distract") ? "distract" : "break";

    if (mode === "distract") {
      try { await target.setFlag?.(SCOPE(), "struggleAdvantage", true); } catch (e) { /* non-fatal */ }
      await _card(rescuer, `distracts the thing holding ${target.name}`, [
        `<strong>${target.name}</strong> has <strong>advantage</strong> on their next Carnal Escape.`,
      ]);
      return { verb: "intervene", mode, granted: true };
    }

    const dc    = opts.dc ?? 15;
    const pick  = String(opts.skill || (raw.includes(":") ? raw.split(":")[1] : "") || "ath").toLowerCase();
    const skill = pick === "acr" ? "acr" : "ath";
    const label = skill === "acr" ? "Acrobatics" : "Athletics";
    const mod   = rescuer.system?.skills?.[skill]?.total ?? 0;
    const r = await _d20Test(mod, { advantage: _bull(rescuer) > 0 });
    const degree = AFLP.system.degreeOf(r.total, dc, r.die);
    const freed  = (degree === "success" || degree === "critSuccess");

    const lines = [freed
      ? `They haul <strong>${target.name}</strong> free of the hold.`
      : `They cannot break the grip - <strong>${target.name}</strong> stays caught.`];
    await _card(rescuer, `tries to pull ${target.name} free`, [`${label}: <strong>${r.total}</strong> vs Carnal ${_dcWord()} <strong>${dc}</strong>.`, ...lines]);

    if (freed) {
      for (const slug of ["grabbed", "restrained", "submitting"]) {
        try { await AFLP.cond.remove(target, slug); } catch (e) { /* non-fatal */ }
      }
      try {
        const loc = _sceneSlotFor(target);
        if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
      } catch (e) { console.warn("AFLP | _ally5e: scene exit failed", e); }
    }
    return { verb: "intervene", mode, freed, degree, total: r.total, dc };
  }

  const AFLP_Carnal = {
    // The three approaches. `actor` is the PC; `opts.dc` the source Difficulty.
    // A critical resist now breaks free outright; a success-with-Hope banks
    // advantage on the next Struggle Escape (see struggleEscape).
    async resolve(actor, opts = {}) {
      const approach = opts.approach ?? "roll";
      // 5e front-loads the roll on the attacker (Carnal Press), so the defender
      // has no Resist roll to make - the press has already hit by the time this
      // runs. Giving in still means something: decline to be defended.
      if (is5e()) {
        if (approach === "give-in") return this.giveIn(actor, opts);
        return this.autoLand(actor, opts);
      }
      if (!isDH()) return null;
      if (approach === "give-in") return this.giveIn(actor, opts);
      if (approach === "stress")  return this.markStressApproach(actor, opts);
      return this.rollApproach(actor, opts);
    },

    // APPROACH 1: give in - let the action land. No Stress, no roll. The scene
    // starts first (so Submitting is set), then the Carnal action advances
    // Arousal +1 to both; a climax resolves as normal.
    async giveIn(actor, opts = {}) {
      if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
      const res = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
      const _appl = await _applyFeatureApplies(actor, opts.applies, opts);
      const _pos = await AFLP.Carnal._applyScenePosition(actor, opts);
      const lines = res.climaxed
        ? [`gives in and climaxes. Arousal resets; the climax resolves as normal.`]
        : [`gives in to the Carnal action - it lands. Both <strong>${_aro(opts.arousal ?? 1)}</strong>, now <strong>${res.arousal}/${res.max}</strong>; no Stress spent.`];
      if (_appl.length) lines.push(`The action leaves its mark: <strong>${_appl.join(", ")}</strong>.`);
      if (_pos) lines.push(`Every opening is lined up at once - <strong>${_pos.join(", ")}</strong> - and each takes a full load when it climaxes.`);
      await _card(actor, "gives in", lines);
      return { approach: "give-in", ...res, applied: _appl };
    },

    // A Carnal Action against a PC already caught (Submitting) in a scene with the
    // presser auto-lands - no Resist. Arousal advances on both, exactly as if the
    // press had landed; the PC's recourse is a Carnal Escape on their own turn.
    // The INITIAL press (target not yet caught) still calls for a Carnal Resist.
    async autoLand(actor, opts = {}) {
      // BEING SET IS NOT BEING CAUGHT. The held path arrives here from inside a
      // scene that _startHScene already opened; a Posed target may never have been
      // in one, so without this the press would land with no scene, no Submitting
      // and - on an hSceneAction - nowhere to deposit.
      // DIZZY arrives the same way and for the same reason: the Drone Stinger's
      // venom can catch someone who was never in a scene, so it needs the scene
      // opened here too. Ardis, 31 Aug 2026: "While Dizzy they are Vulnerable and
      // automatically Give In to Carnal Presses."
      const posed = opts.landReason === "posed";
      const dizzy = opts.landReason === "dizzy";
      if ((posed || dizzy) && opts.sourceTokenId) {
        await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
      }

      const res = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
      const _appl = await _applyFeatureApplies(actor, opts.applies, opts);
      const _pos = await AFLP.Carnal._applyScenePosition(actor, opts);
      // Posed says the opposite thing about recourse, so it cannot share the line:
      // struggleEscape refuses a Posed creature outright.
      const why = posed
        ? `is <strong>Posed</strong> - set everywhere that could resist, soft everywhere that cannot - so the Carnal action lands as a <strong>Carnal Press</strong> with no Resist`
        : dizzy
        ? `is <strong>Dizzy</strong> - too swimming-headed to gather a refusal - so the Carnal action lands as a <strong>Carnal Press</strong> with no Resist`
        : `is already caught, so the Carnal action lands as a <strong>Carnal Press</strong> - no Resist`;
      // DIZZY IS NOT POSED. A Posed creature cannot escape at all; a Dizzy one is
      // merely giving in while it lasts, and `struggleEscape` does not refuse it -
      // checked, not assumed. So Dizzy keeps the ordinary recourse line.
      const recourse = posed
        ? `(There is no Carnal Escape from this. Someone else has to free them.)`
        : `(They break free with a Carnal Escape.)`;
      const lines = res.climaxed
        ? [`${why} - and tips them over. Arousal resets; the climax resolves as normal.`]
        : [`${why}. Both <strong>${_aro(opts.arousal ?? 1)}</strong>, now <strong>${res.arousal}/${res.max}</strong>. ${recourse}`];
      if (_appl.length) lines.push(`The action leaves its mark: <strong>${_appl.join(", ")}</strong>.`);
      if (_pos) lines.push(`Every opening is lined up at once - <strong>${_pos.join(", ")}</strong> - and each takes a full load when it climaxes.`);
      await _card(actor, "takes a Carnal Press", lines);
      return { approach: "auto", ...res, applied: _appl };
    },

    // APPROACH 2: mark Stress to power through. Cost = 1 + Defeat tokens. No roll,
    // no Arousal. Overflows to HP; last HP -> Mind Break.
    async markStressApproach(actor, opts = {}) {
      const cost = 1 + _defeat(actor);

      // Lustful: "While Lustful, when a feature or move requires you to mark Stress
      // to activate it, you mark that much Arousal instead."
      //
      // The push-through is exactly that - a Stress cost you CHOOSE to pay to
      // activate something - so the currency changes and the size does not. Stress
      // inflicted as a consequence is untouched, which is why this sits here and
      // not inside _markStress.
      //
      // The price rising with Horny needs no rule of its own: AFLP_Arousal.increment
      // already grants bonus Arousal equal to the creature's Horny tokens, so the
      // same 1-Stress push-through costs 4 Arousal at the Horny 3 a Lustdraught
      // hands you. That is the whole point of the condition - it is not a discount.
      //
      // NOTE: opts.sourceTokenId is the PRESSER's token, not this actor's. Passing
      // it to increment would resolve the wrong actor's flags, so pass null and let
      // it fall back to this actor's own token.
      if (AFLP.cond?.has?.(actor, "lustful")) {
        const inc = window.AFLP_Arousal?.increment;
        const before = AFLP.system?.getArousalCurrent?.(actor) ?? 0;
        if (inc) await inc(actor, cost, "Lustful push-through", null);
        else await _markArousal(actor, cost);
        const after = AFLP.system?.getArousalCurrent?.(actor) ?? 0;
        const climaxed = after <= before && cost > 0;
        // Ardis's wording, 17 Aug 2026. "on appetite rather than grit" made it
        // sound like a choice the character is making; Lustful is something
        // happening TO them.
        const lines = [`is <strong>Lustful</strong> and pushes through despite their body betraying them, marking <strong>${cost}</strong> Arousal instead of Stress`
          + (cost > 1 ? ` (1 + ${_defeat(actor)} Defeat).` : `.`)];
        if (climaxed) lines.push(`That tipped them over - Arousal resets and the climax resolves as normal.`);
        await _card(actor, "aches through the Carnal action", lines);
        return { approach: "stress", lustful: true, cost, arousal: after, climaxed };
      }

      const res = await _markStress(actor, cost);
      const lines = [`grits through the Carnal action, marking <strong>${cost}</strong> Stress` +
        (cost > 1 ? ` (1 + ${_defeat(actor)} Defeat).` : `.`)];
      if (res.lastHp) lines.push(`That was their last Hit Point - they make their only available death move: <strong>Mind Break</strong>.`);
      // Ardis's wording, 17 Aug 2026. "Stress overflowed into HP" described the
      // plumbing; Daggerheart's name for the state is Stressed out, and the
      // rule a player needs is what happens NEXT, not what just moved.
      else if (res.hp != null && res.stress != null) lines.push(`They are now <strong>Stressed out</strong> (HP will be marked in lieu of Stress).`);
      await _card(actor, "marks Stress to resist", lines);
      if (res.lastHp) await this._mindBreak(actor);
      return { approach: "stress", cost, ...res };
    },

    // D&D 5e Carnal Resist. 5e has no Duality dice, so the resist is a saving
    // throw (Wisdom for the seduction layer - the target steels their mind) and
    // the four tiers come from the natural d20 per the adapter's degreeOf:
    //   nat 20  -> tear free of the scene outright (mirrors DH's critical)
    //   success -> hold the line; the action does not land
    //   fail    -> the action lands; both gain Arousal
    //   nat 1   -> it lands hard; Arousal, and Purity cracks into Defeat
    // The resist dice (Bimbofied / cumflation / self-absorbed as disadvantage,
    // Purity as advantage) collapse onto 5e's single advantage/disadvantage:
    // net positive = advantage, net negative = disadvantage, zero = straight.
    async _rollApproach5e(actor, opts = {}) {
      const dc = opts.dc ?? 15;
      const cfDice = _cumflationDice(actor);
      const selfAbsorbed = AFLP.HScene?.isSelfAbsorbed?.(actor.id) ? 1 : 0;
      const disDice = _bimbo(actor) + cfDice + selfAbsorbed;
      const advDice = _purity(actor);
      const net = advDice - disDice;

      // Roll the save. 5e resolves advantage/disadvantage by rolling twice and
      // taking the better/worse natural die, so run two saves when net != 0.
      const kind = opts.saveAbility ?? "wis";
      const rolls = [];
      rolls.push(await AFLP.system.rollResist(actor, { dc, kind }));
      if (net !== 0) rolls.push(await AFLP.system.rollResist(actor, { dc, kind }));
      let pick = rolls[0];
      if (rolls.length === 2) {
        const better = rolls[0].total >= rolls[1].total ? rolls[0] : rolls[1];
        const worse  = rolls[0].total <= rolls[1].total ? rolls[0] : rolls[1];
        pick = net > 0 ? better : worse;
      }
      const degree = AFLP.system.degreeOf(pick.total, dc, pick.die);

      const lines = [];
      let escape = false, arousal = null;

      if (degree === "critSuccess") {
        escape = true;
        lines.push(`Natural 20 - they ignore the Carnal action entirely and tear free of the scene.`);
      } else if (degree === "success") {
        lines.push(`Success - they hold the line; the action does not land.`);
      } else {
        // fail or critFail: the action lands.
        if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
        const ar = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
        arousal = ar.arousal;
        const hard = degree === "critFail";
        lines.push(`${hard ? "Natural 1 - the action lands hard" : "Failure - the Carnal action lands"}. Both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar.climaxed ? " - they climax (resolves as normal)" : `, now ${ar.arousal}`}.`);
        if (hard && _purity(actor)) {
          const pg = await _markDefeat(actor, 1);
          if (pg.overflow > 0) lines.push(`Their Purity shatters - already at <strong>Defeat 3/3</strong>, it overflows.`);
          else lines.push(`Their Purity cracks - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
        }
      }

      if (net !== 0) {
        const srcs = [];
        if (advDice > 0)       srcs.push(`Purity`);
        if (_bimbo(actor) > 0) srcs.push(`Bimbofied`);
        if (cfDice)            srcs.push(`cumflation (${cfDice} hole${cfDice > 1 ? "s" : ""} at the limit)`);
        if (selfAbsorbed)      srcs.push(`self-absorbed`);
        const dir = net > 0 ? "advantage" : "disadvantage";
        lines.push(`<em style="font-size:11px;color:#a05050;">(Rolled with ${dir}: ${srcs.join(", ")}.)</em>`);
      }

      await _card(actor, `Carnal Resist (${_dcWord()} ${dc})`,
        [`${kind.toUpperCase()} save: <strong>${pick.total}</strong> (natural ${pick.die ?? "?"}).`, ...lines]);

      if (escape) {
        try {
          const loc = _sceneSlotFor(actor);
          if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
        } catch (e) { console.warn("AFLP | _rollApproach5e: scene exit failed", e); }
      }
      return { approach: "roll", degree, total: pick.total, die: pick.die, escape, arousal, stressed: null };
    },

    // APPROACH 3: roll the Duality resist. Five rungs -> consequences.
    async rollApproach(actor, opts = {}) {
      // D&D 5e has no Duality dice, no Hope/Fear, and no presence/instinct
      // traits - the whole rung machinery below is Daggerheart-shaped. 5e
      // resists with a saving throw (WIS for the Carnal/seduction layer) and
      // synthesizes its tiers from the natural d20. Dispatch to the 5e path.
      if (AFLP.system?.id === "dnd5e") return this._rollApproach5e(actor, opts);

      const dc = opts.dc ?? 15;
      const hasDefeat = _defeat(actor) > 0;
      // Auto-applied resist dice. Bimbofied contributes one disadvantage die per
      // token (additive); cumflation contributes one per hole at its limit (1-3);
      // Purity grants one advantage die. Defeat does NOT add dice (it raises the
      // power-through cost).
      const cfDice   = _cumflationDice(actor);
      // Masturbating (self-absorbed): a target lost in their own pleasure resists
      // a Carnal action at one extra disadvantage die - an easy opening.
      const selfAbsorbed = AFLP.HScene?.isSelfAbsorbed?.(actor.id) ? 1 : 0;
      const disDice  = _bimbo(actor) + cfDice + selfAbsorbed;
      const advDice  = _purity(actor);
      // Carnal Resist trait: if the adversary's Carnal Action NAMES a trait, the
      // GM is pressing a specific weakness - roll that (best of the named pair).
      // If the action names no trait, the player resists with a trait of their
      // own choice (opts.trait) and narrates how. A silent Presence/Instinct
      // fallback only covers the edge of no named trait and no choice.
      let chosen     = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : null;
      // NOTHING IS ROLLED WITHOUT A TRAIT SOMEBODY CHOSE. A Carnal Press lets the
      // resisting character pick any one trait, so if the feature named none and
      // the caller passed none, ASK - do not quietly pick.
      //
      // The old line ended `: _bestTraitMod(actor, ["presence", "instinct"])`,
      // a silent best-of-two that fired on literally every Carnal Press, because
      // _reactionTraits never returned an empty list (see its comment). This is
      // the second half of that fix: even with the list now empty, a caller that
      // forgets to prompt must not fall into a default. It asks, and a declined
      // prompt aborts rather than rolling something the player did not choose.
      // THE SYSTEM'S DIALOG IS THE TRAIT PROMPT NOW, so AFLR only asks when it is
      // going to roll the dice itself. Ardis, 21 Aug 2026: "they can add their
      // trait bonus like they would to any other roll, using the picker."
      //
      // The old silent-default warning still stands and is why this is written the
      // way it is: a default trait that NOBODY SEES is the bug that comment
      // describes. A default the player is looking at, in a dialog they can change
      // before rolling, is a starting point - which is the whole reason for showing
      // it. When AFLR rolls (no system pipeline), the prompt is still mandatory and
      // a declined prompt still aborts.
      const _viaSys = _canSystemDuality(actor);
      if (!chosen && !(opts.traits && opts.traits.length) && !_viaSys) {
        const asked = await AFLP.Carnal.promptCarnalTrait?.(actor, "resist");
        chosen = _DH_TRAITS.includes(String(asked || "").toLowerCase()) ? String(asked).toLowerCase() : null;
        if (!chosen) {
          ui.notifications?.info(`AFLR | ${actor.name} did not choose a trait - the Carnal Resist was not rolled.`);
          return null;
        }
      }
      const bt       = (opts.traits && opts.traits.length) ? _bestTraitMod(actor, opts.traits)
                      : { trait: chosen, mod: chosen ? _traitMod(actor, chosen) : 0 };
      // CARNAL RESIST IS A REACTION, and passing that is what makes the SYSTEM
      // enforce the rule the guide already states: "it does not generate Hope or
      // Fear, does not trigger a GM move, and does not move the Spotlight."
      // `addDualityResourceUpdates` skips `actionType === "reaction"` outright -
      // measured, 0 resource updates - so the reaction rule is the system's job
      // now rather than a thing AFLR has to remember not to do.
      let res = await _systemDualityRoll(actor, {
        trait: bt.trait, dc, adv: advDice - disDice, actionType: "reaction",
      });
      if (res?.cancelled) return null;   // dialog dismissed: no roll, nothing resolved
      if (!res) res = await _dualityResist(actor, dc, advDice - disDice, bt.mod);
      // Reaction roll: read Duality for the result, but generate no Hope/Fear,
      // trigger no GM move, and do not move the spotlight.

      const lines = [];
      let escape = false, arousal = null, stressed = null, applied = [], _scenePos = null;

      if (res.rung === "crit") {
        // Critical resist: break free of the Carnal hold outright.
        escape = true;
        lines.push(`Critical Success - they ignore the Carnal action entirely and tear free of the scene. (Reaction roll: no Hope gained, no Stress cleared.)`);
      } else if (res.rung === "success-hope") {
        // Success with Hope: hold the line and find an opening - advantage on
        // the next Struggle Escape attempt (consumed by struggleEscape).
        try { await actor.setFlag?.(SCOPE(), "struggleAdvantage", true); } catch (e) { /* non-fatal */ }
        lines.push(`Succeeded, with Hope - they hold the line and find an opening: <strong>advantage on their next Carnal Escape</strong>. Arousal holds.`);
      } else if (res.rung === "success-fear") {
        // NO FEAR IS BANKED, AND SAYING SO WAS WRONG. The DH guide: "Carnal Resist
        // is a reaction roll, it does not generate Hope or Fear, does not trigger a
        // GM move, and does not move the Spotlight." The code has always agreed -
        // the resist has never called `_markHopeOrFear` - so this line was telling
        // the GM to bank a Fear that the rules forbid and the code never granted.
        // MEASURED from a player client 21 Aug 2026: five resists, Fear 4 before and
        // 4 after a with-Fear result.
        //
        // 22 Aug 2026: the resist is no longer the exception, it is the rule. Escape,
        // Rescue and the Bullified urge all stopped paying the duality the same day,
        // and `_markHopeOrFear` was deleted with its last caller. All four carnal
        // duality rolls now go through the system; AFLR's contribution is Arousal.
        // GOES STALE IF: Carnal Resist stops being a reaction roll.
        lines.push(`Succeeded, with Fear - they hold the line; the action does not land. A Carnal Resist is a reaction roll: no Hope, no Fear, no Spotlight move.`);
      } else if (res.rung === "fail-hope") {
        if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
        const ar = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
        arousal = ar.arousal;
        applied = await _applyFeatureApplies(actor, opts.applies, opts);
        _scenePos = await AFLP.Carnal._applyScenePosition(actor, opts);
        lines.push(`Failed, with Hope - the Carnal action lands. Both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar.climaxed ? " - they climax (resolves as normal)" : `, now ${ar.arousal}`}.`);
        if (applied.length) lines.push(`The action leaves its mark: <strong>${applied.join(", ")}</strong>.`);
      } else { // fail-fear
        if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
        const ar = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
        const sres = await _markStress(actor, 1);
        arousal = ar.arousal; stressed = sres;
        applied = await _applyFeatureApplies(actor, opts.applies, opts);
        _scenePos = await AFLP.Carnal._applyScenePosition(actor, opts);
        lines.push(`Failed, with Fear - the action lands hard. Both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar.climaxed ? " - they climax (resolves as normal)" : ` (now ${ar.arousal})`}, and they mark a Stress.`);
        if (applied.length) lines.push(`The action leaves its mark: <strong>${applied.join(", ")}</strong>.`);
        if (sres.lastHp) lines.push(`That marked their last Hit Point: <strong>Mind Break</strong>.`);
        if (_purity(actor)) {
          const pg = await _markDefeat(actor, 1);
          if (pg.overflow > 0) lines.push(`Their Purity shatters - already at <strong>Defeat 3/3</strong>, it overflows into <strong>+${pg.stressMarked} Stress</strong>${pg.brokeMind ? " and <strong>Mind Break</strong>" : ""}.`);
          else lines.push(`Their Purity cracks under the fear - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
        }
      }

      if (_scenePos) lines.push(`Every opening is lined up at once - <strong>${_scenePos.join(", ")}</strong> - and each takes a full load when it climaxes.`);

      const netDice = advDice - disDice;
      if (netDice !== 0) {
        const srcs = [];
        if (advDice > 0)       srcs.push(`+${advDice} from Purity`);
        if (_bimbo(actor) > 0) srcs.push(`-${_bimbo(actor)} from Bimbofied`);
        if (cfDice)            srcs.push(`-${cfDice} from cumflation (${cfDice} hole${cfDice > 1 ? "s" : ""} at the limit)`);
        if (selfAbsorbed)      srcs.push(`-1 for being lost in their own pleasure`);
        const dir = netDice > 0 ? "advantage" : "disadvantage";
        const n   = Math.abs(netDice);
        // SAY WHAT THE DICE DO, not the arithmetic that produced the count.
        // This read "net -3 d6", and "net" reads as a SUM to a player, so the
        // card looked like it was subtracting 3d6 added together. It never was:
        // _dualityResist rolls `- 3d6kh` and takes the HIGHEST single die. Ardis
        // reported it as suspected stacking on 17 Aug 2026, from this line
        // rather than from the roll. A chat card reporting a roll must name every
        // die that fed it, in the terms the dice were actually rolled in.
        lines.push(`<em style="font-size:11px;color:#a05050;">(Rolled at ${dir}: ${n}d6, `
          + `keeping the highest single die - ${srcs.join(", ")}. Extra dice widen the swing, they do not add up.)</em>`);
      }

      const tag = res.isCrit ? "critical" : (res.withHope ? "with Hope" : "with Fear");
      // On the system path the trait and its modifier are on the system's own roll
      // card, and `res.trait` is what was ACTUALLY rolled - the player may have
      // changed it in the dialog. Restating AFLR's `bt.mod` there would print a
      // number that had nothing to do with the roll.
      const _shownTrait = res.viaSystem ? (res.trait ?? bt.trait) : bt.trait;
      const traitNote = res.viaSystem
        ? (_shownTrait ? ` <span style="font-size:11px;opacity:0.8;">(${_cap(_shownTrait)})</span>` : "")
        : (bt.trait ? ` <span style="font-size:11px;opacity:0.8;">(${_cap(bt.trait)} ${bt.mod >= 0 ? "+" : ""}${bt.mod})</span>` : "");
      await _card(actor, `Carnal Resist (${_dcWord()} ${dc})`,
        [`Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.${traitNote}`, ...lines]);

      if (res.rung === "fail-fear" && stressed?.lastHp) await this._mindBreak(actor);
      // Critical resist tears free of the scene - if the PC was already pinned
      // (the adversary's HSA had been pressing), actually remove them now.
      if (escape) {
        try {
          const loc = _sceneSlotFor(actor);
          if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
        } catch (e) { console.warn("AFLP | rollApproach: scene exit failed", e); }
      }
      return { approach: "roll", ...res, escape, arousal, stressed, applied };
    },

    // Struggle Escape: a single action on the PC's own turn to break free.
    // Roll a Duality vs the source Difficulty (with advantage if a prior
    // success-with-Hope resist banked it). Any success frees them; the rung
    // sets how the struggle moves Arousal:
    //   crit         - escape; Arousal cools to 0
    //   success-hope - escape; cool Arousal by 2
    //   success-fear - escape; mark 2 Arousal
    //   fail-hope    - stay caught; mark 2 Arousal
    //   fail-fear    - stay caught; mark 4 Arousal
    async struggleEscape(actor, opts = {}) {
      // POSED IS CHECKED FIRST, before Cum Slut Mastery and before the system
      // split, because it is not a hold you slip - your body is set and does not
      // answer. The Doll-Maker set's whole point is that the exit is other people:
      // an ally's Carnal Rescue, solvent, or defeating whatever posed you.
      //
      // Deliberately in code rather than left to the table: the card says "cannot
      // make a Carnal Escape", and a rule that only exists in card text is a rule
      // the Escape button quietly ignores.
      if (AFLP.cond?.has?.(actor, "posed")) {
        await _card(actor, "cannot move", [
          `They are <strong>Posed</strong> - set everywhere that could resist and soft everywhere that cannot. There is no Carnal Escape from this. An ally must free them, or whatever posed them has to go down.`,
        ]);
        return { approach: "escape", escaped: false, posed: true };
      }

      if (is5e()) return _escape5e(actor, opts);

      // SLIP-FREE IS CHECKED BEFORE THE SYSTEM GUARD, on purpose.
      //
      // Cum Slut Mastery reads the same in both systems as of 10 Aug 2026 - the
      // escape succeeds without a roll and the coat is the price. The rest of
      // this function is Daggerheart's roll machinery and still bails below, but
      // a no-roll escape needs no machinery, so gating it behind `isDH()` made
      // the PF2e half unreachable: the Carnal Dock DOES render on PF2e and its
      // Escape button routes here, so the button would have returned null and
      // done nothing at all for a PF2e Cum Slut.
      //
      // Ungating AFLP.cumSlutSlipFree alone was NOT enough for exactly this
      // reason. If the two cards ever diverge again, put the system test back
      // inside cumSlutSlipFree, not here.

      // Cum Slut Mastery: too slick to hold. No roll, no rung, no Hope or Fear
      // and no Arousal swing - the coat is the whole price, and it comes off.
      //
      // THIS is the player's escape. The Carnal Dock's Escape button is shown to
      // `GM() || actor.isOwner` and routes here (players via socketlib's
      // carnalStruggle executeAsGM), so it is the one place the target rolls.
      // The mechanic was first wired into AFLP.stuckSubmitting.attemptEscape,
      // whose only caller is the leave control on the H-Scene card and which is
      // gated on game.user.isGM - so a player could never trigger their own
      // Mastery. The hook stays there too for the GM-clicks-leave route; the
      // coat is already spent by then, so it cannot fire twice.
      //
      // free() before removeParticipant: removeParticipant refuses to release a
      // Stuck Submitting participant and would bounce straight back into
      // attemptEscape.
      if (await AFLP.cumSlutSlipFree?.(actor)) {
        try { await AFLP.stuckSubmitting?.free?.(actor); } catch (e) { /* may not be stuck */ }
        for (const slug of ["grabbed", "restrained", "submitting"]) {
          try { await AFLP.cond.remove(actor, slug); } catch (e) { /* non-fatal */ }
        }
        await _card(actor, "slips free", [
          `Too slick to hold - <strong>no roll</strong>. The coat is wiped away in the process.`,
        ]);
        try {
          const loc = _sceneSlotFor(actor);
          if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
        } catch (e) { console.warn("AFLP | struggleEscape: slip-free scene exit failed", e); }
        return { action: "struggle-escape", escaped: true, slipFree: true, arousal: null };
      }

      // Everything past here is Daggerheart's roll machinery: duality dice,
      // rungs, Hope and Fear. PF2e escapes with its own Escape action on the
      // sheet, so there is nothing here for it and it stops.
      if (!isDH()) return null;

      const dc = opts.dc ?? 15;
      const trait = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : null;
      const tMod = trait ? _traitMod(actor, trait) : 0;
      let hadAdv = false;
      try { hadAdv = !!actor.getFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* none */ }
      if (hadAdv) { try { await actor.unsetFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* non-fatal */ } }
      // CARNAL ESCAPE IS AN ACTION - Ardis, 21 Aug 2026: "Carnal Escape and Carnal
      // Rescue are actions. Carnal Resist is the reaction." The guide says the same
      // four separate ways ("a single action on your turn ... make an Action roll"),
      // so this one DOES generate Hope and Fear.
      //
      // THE SLICK'S ESCAPE BONUS RIDES HERE - Ardis, 29 Aug 2026: it applies to "all
      // escape attempt rolls". Carnal Escape is Daggerheart's escape, so this is the
      // roll it has to reach on this system; the bare-Roll escapes in schema.js add
      // the same number by hand and PF2e gets it from a rule element instead.
      //
      // NOT ON allyIntervene, deliberately: a RESCUER is not escaping. A slick body
      // is harder for the thing holding IT to keep hold of, not easier for a third
      // party to pull free.
      //
      // The number is unlabelled in Daggerheart's own breakdown - see the header on
      // _systemDualityRoll - so the escape card below names it.
      const slick = AFLP.slickEscapeBonus?.(actor) ?? 0;
      let res = await _systemDualityRoll(actor, {
        trait, dc, adv: (hadAdv ? 1 : 0) + _purity(actor), actionType: "action",
        bonus: slick,
      });
      if (res?.cancelled) {
        // A DISMISSED DIALOG DID NOT SPEND THE ACTION, so the banked advantage from
        // a prior success-with-Hope must go back - it was consumed above on the
        // assumption that a roll was about to happen.
        if (hadAdv) { try { await actor.setFlag?.(SCOPE(), "struggleAdvantage", true); } catch (e) { /* non-fatal */ } }
        return null;
      }
      // THE FALLBACK TAKES THE SLICK TOO. `_dualityResist` is AFLR's own dice, used
      // when the system roller is unavailable, and its `tMod` is a flat number added
      // to the total - the same place the bonus belongs. Without this line a world
      // without the system dialog would silently lose the bonus on the one roll it
      // was built for.
      if (!res) res = await _dualityResist(actor, dc, (hadAdv ? 1 : 0) + _purity(actor), tMod + slick);
      // AFLR PAYS NOTHING OF THE DUALITY. Ardis, 22 Aug 2026: "both escape and
      // rescue should just have arousal changes be the extra aflr effect and
      // otherwise just offer whatever the dh native effects for the roll is."
      //
      // So the Arousal swing below is AFLR's whole contribution. The Hope, the
      // Fear and the crit's Stress clear are Daggerheart's own action-roll
      // effects, and AFLR neither applies them nor describes them:
      //
      //   automation ON   the system applies them, committed by
      //                   `_systemDualityRoll` through `cfg.resourceUpdates`
      //   automation OFF  the system posts its duality card and the TABLE applies
      //                   them by hand, exactly as for any other DH roll
      //
      // The content agrees and always has - MEASURED 22 Aug 2026: the guide
      // journal's Carnal Escape table and the `Carnal Escape` pack card both deal
      // ONLY in Arousal, with zero mentions of Hope, Fear or Stress between them.
      // The old `_markHopeOrFear` call here was AFLR half-emulating a system rule:
      // it paid the Hope and the Fear but never the crit's Stress, so a critical
      // Escape was a strictly worse critical success than any other roll in the game.
      //
      // GOES STALE IF: AFLR is ever asked to emulate the native payout when the
      // automation is off. Then it belongs in ONE place for all three duality
      // callers, not re-added here.

      const lines = [];
      // NAME THE NUMBER. Daggerheart prints the bonus as a bare `+ N` in the roll
      // breakdown with no label, and a total two above the dice with nothing saying
      // why is how a working feature gets reported as a bug.
      if (slick) lines.push(`Slick with cum - <strong>+${slick}</strong> to the Escape.`);
      let escaped = false, arousal = null;
      if (res.rung === "crit") {
        escaped = true;
        await AFLP.gm.run("setArousal", actor, 0, _arousalMax(actor));
        arousal = 0;
        lines.push(`Critical Carnal Escape - they tear free and the heat drains away completely. <strong>${_aroReset()}</strong>.`);
      } else if (res.rung === "success-hope") {
        escaped = true;
        arousal = await _coolArousal(actor, 2);
        lines.push(`They break free with Hope - and the wrench of it wrings them out. They <strong>${_aro(-2)}</strong>, now <strong>${arousal}</strong>.`);
      } else if (res.rung === "success-fear") {
        escaped = true;
        const ar = await _markArousal(actor, 2); arousal = ar.arousal;
        lines.push(`They wrench free, but the friction works them up` +
          (ar.climaxed ? ` - and tips them into a climax (Defeat token).` : ` to <strong>${ar.arousal}</strong>.`));
      } else if (res.rung === "fail-hope") {
        const ar = await _markArousal(actor, 2); arousal = ar.arousal;
        lines.push(`They stay caught, and writhing only stokes them` +
          (ar.climaxed ? ` into a climax (Defeat token).` : ` - Arousal climbs to <strong>${ar.arousal}</strong>.`));
      } else { // fail-fear
        const ar = await _markArousal(actor, 4); arousal = ar.arousal;
        lines.push(`They stay caught, and struggling only makes it worse` +
          (ar.climaxed ? ` - they climax (Defeat token).` : ` - Arousal spikes to <strong>${ar.arousal}</strong>.`));
        if (_purity(actor)) {
          const pg = await _markDefeat(actor, 1);
          if (pg.overflow > 0) lines.push(`Their Purity shatters - already at <strong>Defeat 3/3</strong>, it overflows into <strong>+${pg.stressMarked} Stress</strong>${pg.brokeMind ? " and <strong>Mind Break</strong>" : ""}.`);
          else lines.push(`Their Purity cracks under the fear - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
        }
      }

      const tag = res.isCrit ? "critical, with Hope" : (res.withHope ? "with Hope" : "with Fear");
      const _escTrait = res.viaSystem ? (res.trait ?? trait) : trait;
      await _card(actor, `attempts Carnal Escape (${_escTrait ? _cap(_escTrait) + ", " : ""}${_dcWord()} ${dc}${hadAdv ? ", advantage" : ""})`,
        [`Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.`, ...lines]);

      // Any successful escape pulls the PC out of the H-Scene. removeParticipant
      // closes the scene once no active pairing remains (1v1 -> the scene ends).
      if (escaped) {
        try {
          const loc = _sceneSlotFor(actor);
          if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId);
        } catch (e) { console.warn("AFLP | struggleEscape: scene exit failed", e); }
      }
      return { action: "struggle-escape", ...res, escaped, arousal };
    },

    // Bullified adversary mode: a Bullified PC takes a Carnal action ON a target,
    // rolling a Duality ACTION vs the target's Difficulty with advantage equal to
    // their Bullified tokens. On a success they top the target - starting/joining
    // an H-Scene with the Bull Dominating and the target Submitting - and press
    // Arousal into them. This is a real action roll, so it generates Hope/Fear.
    // opts: { targetActor, targetTokenId, sourceTokenId, dc, deposit, label }
    // THE CARNAL PRESS ROUTER. Six scenarios, straight from the guide journal,
    // which is canon for how the Carnal system works.
    //
    //   presser -> target          not yet caught            already Submitting to THIS presser
    //   Adversary -> PC            TARGET rolls Carnal        auto-lands, no roll, no approach
    //                              Resist (a REACTION, any
    //                              justifiable trait) vs the
    //                              adversary's Difficulty
    //   PC -> Adversary            PRESSER makes an ACTION    auto-lands
    //                              roll vs its Difficulty
    //   PC -> PC                   PRESSER makes an ACTION    auto-lands
    //                              roll vs their Evasion
    //
    // "It marks 1 Arousal on both unless it names more."
    //
    // WHY THIS EXISTS. actorPress implements the PC-presser row and is correct for
    // it - but the H-Scene press button called it for EVERY presser, so an
    // adversary pressing a PC rolled an action roll and banked Hope or Fear. Two
    // things wrong at once: the wrong side rolling, and a reaction generating Hope
    // or Fear when the journal says a reaction generates neither. That is the
    // "How does <adversary> press the Carnal Action? Pick a trait" dialog testers
    // hit. The defender path already existed - postPrompt posts the three
    // approaches and the target rolls - it simply was not being reached.
    //
    // Adversary -> adversary is not one of the journal's six. It falls through to
    // the presser-rolls branch, which is the sane reading and is flagged here so
    // the next person knows it was a decision rather than an oversight.
    //
    // Stale when: the journal changes how a Press resolves. It is canon; re-read
    // "The Core Mechanic: Carnal H-Scenes" and "The Carnal moves" before editing.
    // Read a feature's declared conditions. Public so the Scene Actions dock can
    // stash them on the prompt for the target to carry to their own resolution.
    featureApplies(feat) {
      const MID = "ardisfoxxs-lewd-pf2e";
      const a = feat?.getFlag?.(MID, "applies");
      return (a && typeof a === "object") ? a : null;
    },

    // Read a feature's declared scene position. A feature that names one is saying
    // "when this lands, the scene looks like THIS" - the four hordes' Every Hole at
    // Once declares `gangbang`, the same position startTroopScene sets. Validated
    // against the live position list so a typo fails loudly here rather than
    // silently depositing nothing later.
    featureScenePosition(feat) {
      const MID = "ardisfoxxs-lewd-pf2e";
      const id = feat?.getFlag?.(MID, "scenePosition");
      if (!id) return null;
      if (!AFLP.getPosition?.(id)) {
        console.warn(`AFLR | feature "${feat?.name}" declares scenePosition "${id}", which is not a position.`);
        return null;
      }
      return id;
    },

    // Apply a declared scene position and deposit into every hole it resolves to.
    // Called from every landing branch. No-op unless the feature declared one.
    // Set the scene position a landing feature RECOMMENDS. It picks the hole for
    // the next climax and nothing else.
    //
    // It used to deposit here as well. That made the position an EVENT, so a
    // feature declaring `scenePosition` filled every hole the instant it landed,
    // and picking a position by hand from the card chip filled nothing ever -
    // the two ways of choosing the same thing did opposite things. Since
    // 15 Aug 2026 the position is a SELECTION and the climax is the event, so
    // both routes behave the same: they choose where the next load goes.
    //
    // The returned hole list is still used for the chat line, which now describes
    // what the position MEANS rather than reporting a fill that already happened.
    async _applyScenePosition(pcActor, opts) {
      const posId = opts?.scenePosition; if (!posId || !opts?.sourceTokenId) return null;
      try {
        AFLP.HScene?.setParticipantPosition?.(opts.sourceTokenId, posId);
        const holes = AFLP.expandHoles(AFLP.getPosition(posId)?.hole, pcActor);
        return holes.length ? holes : null;
      } catch (e) { console.warn("AFLR | scenePosition apply failed:", e?.message); return null; }
    },

    // ── THERE IS NO CARNAL-LAYER DEPOSIT, BY DESIGN ─────────────────────────
    //
    // `depositOnClimax` and its `_depositLoad` helper lived here for one day
    // (15-16 Aug 2026) and were removed as a duplicate. THE DEPOSIT ENGINE IS
    // `aflp-cum`, reached from `AFLP_Arousal._onArousalMax`, on every system -
    // it already reads the cummer's own scene position, spends one Cum Shot,
    // cumflates, spills, rolls the Brood Roll and resets Arousal. Verified doing
    // exactly that for a Daggerheart adversary in dh-test on 16 Aug 2026.
    //
    // DO NOT ADD ONE BACK. Two engines cannot be kept in step, and the first
    // attempt shipped a load-per-round leak from creatures that never climaxed.
    // If a Carnal deposit needs behaviour the engine lacks, change the engine.
    async press(presser, opts = {}) {
      // 5e front-loads the roll on the attacker BY DESIGN - do not route it here.
      if (is5e()) return this.actorPress(presser, opts);
      if (!isDH()) return null;
      const target = opts.targetActor;
      if (!presser || !target) return null;

      // Already caught by THIS presser: lands automatically. Gate on the pair, not
      // on Submitting alone - a PC Submitting to someone else is still fair game
      // for a first Press from a new adversary.
      const held = AFLP.cond?.has?.(target, "submitting") && AFLP.cond?.has?.(presser, "dominating");

      // POSED lands the same way, and this is the mechanic three Doll-Maker-set
      // features state in their text: "Against a Posed creature, its Carnal Press
      // calls for no Carnal Resist." A set body has nothing to resist WITH.
      //
      // Unlike the held case it is NOT gated on the pair - Posed is a property of
      // the target, not of a hold this presser established, so any presser gets it.
      // That is the whole point of the set: the Glazier sets you and the Marionette
      // cashes it in.
      const posed = AFLP.cond?.has?.(target, "posed");
      // DIZZY, same gate and the same reason: it is a property of the TARGET, not
      // of a hold this presser established, so any presser gets it. The Drone
      // Stinger's venom is the only source today - `Dizzying Venom`, 31 Aug 2026.
      // Posed wins the label where both apply, because Posed also removes the
      // escape and Dizzy does not.
      const dizzy = AFLP.cond?.has?.(target, "dizzy");
      if (held || posed || dizzy) return this.autoLand(target, {
        ...opts,
        sourceName: opts.sourceName ?? presser.name,
        landReason: held ? "held" : (posed ? "posed" : "dizzy"),
      });

      const presserIsPC = presser.type === "character";
      const targetIsPC  = target.type === "character";

      // Adversary pressing a PC: the TARGET answers with one of three approaches.
      // No roll is made here and no trait is asked of the adversary.
      if (!presserIsPC && targetIsPC) {
        const dc = opts.dc ?? _targetDefense(presser).value ?? 15;
        return this.postPrompt(target, {
          dc,
          // THE TARGET'S TOKEN ID, WHICH THIS FUNCTION ALREADY RECEIVED. The dock
          // passes `targetTokenId` on every press and it was being dropped here,
          // so the card could only name the target by ACTOR id - and on an
          // unlinked token that is the template, not the creature being pressed.
          targetTokenId: opts.targetTokenId ?? null,
          sourceName: opts.sourceName ?? presser.name,
          sourceTokenId: opts.sourceTokenId,
          hsa: !!opts.hsa,
          applies: opts.applies ?? null,
          scenePosition: opts.scenePosition ?? null,
          arousal: opts.arousal ?? null,
        });
      }

      // PC pressing anything: the PRESSER makes an Action roll, and picks the trait
      // they are justifying it with. The target gets no approach step.
      //
      // ONE PICKER, NOT TWO. Since 22 Aug 2026 `actorPress` rolls through the
      // system, and the system's roll dialog carries its own Trait Modifier picker -
      // so asking here as well is two dialogs for one roll. That is the same bug
      // that shipped for part of a day on Carnal Resist and Carnal Rescue, arriving
      // by the same route: a prompt that was correct while AFLR rolled its own dice
      // and became a duplicate the moment the roll moved to the system.
      //
      // The prompt is still MANDATORY where AFLR rolls (5e, or a Daggerheart actor
      // with no `rollTrait`), and a declined prompt still aborts rather than
      // defaulting to a trait nobody chose.
      let trait = opts.trait;
      if (trait === undefined || trait === null) {
        if (_canSystemDuality(presser)) {
          trait = null;                       // the system dialog asks, and can be changed there
        } else {
          trait = await this.promptCarnalTrait(presser, "press");
          if (trait === null || trait === undefined) return null;   // cancelled
        }
      }
      return this.actorPress(presser, { ...opts, trait });
    },

    async actorPress(bullActor, opts = {}) {
      if (is5e()) return _press5e(bullActor, opts);
      if (!isDH()) return null;
      const targetActor   = opts.targetActor;
      const targetTokenId = opts.targetTokenId;
      const bullTokenId   = opts.sourceTokenId;
      if (!targetActor) return null;
      const def   = _targetDefense(targetActor);
      const dc    = opts.dc ?? def.value;
      const adv   = _bull(bullActor);
      const trait = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : null;
      const tMod  = trait ? _traitMod(bullActor, trait) : 0;

      // THE SYSTEM ROLLS IT, and this was the last carnal duality caller that did
      // not. Ardis, 22 Aug 2026: "port the bullified urge to the system roller."
      //
      // A Bullified press is an ACTION roll by the presser - a PC taking a Carnal
      // action on a target - so `actionType: "action"`, the same as Carnal Escape
      // and Carnal Rescue. The Bullified tokens are its advantage, and this is the
      // caller that most needs the count to arrive intact: `roll.advantage` is a
      // TYPE flag, so 3 Bullified tokens reach the dice through
      // `daggerheart.postDualityRollConfiguration` with `kh` set by hand. Without
      // that the dice SUM instead of keeping the highest, which is the doubled-swing
      // bug AFLR already fixed once in `_dualityResist`.
      //
      // AND IT PAYS NO DUALITY, by the rule the other two already follow. Ardis,
      // 22 Aug: "just offer whatever the dh native effects for the roll is."
      // Arousal is AFLR's contribution; the Hope, the Fear and the crit's Stress
      // clear are Daggerheart's, applied by its automation or by the table.
      //
      // MEASURED 22 Aug 2026, straight through `actor.rollTrait` with no AFLR in the
      // path, 29 rolls with the automation OFF and 6 with it ON:
      //   OFF   hope/fear/crit alike -> Hope 0, Stress 0, Fear 0; `resourceUpdates`
      //         is present on every roll and EMPTY
      //   ON    hope -> Hope +1; crit -> Hope +1 AND Stress -1; fear -> Fear +1
      // So the commit below is harmless when the automation is off and is the only
      // thing that makes it land when it is on.
      let res = await _systemDualityRoll(bullActor, { trait, dc, adv, actionType: "action" });
      if (res?.cancelled) return null;          // dialog dismissed: no roll, no card
      if (!res) res = await _dualityResist(bullActor, dc, adv, tMod);

      const advNote = adv > 0
        ? `<em style="font-size:11px;color:#806040;">(Rolled with ${adv} Bullified advantage die${adv > 1 ? "s" : ""}.)</em>`
        : "";
      const lines = [];

      if (res.success) {
        if (bullTokenId) await _startHScene(targetActor, bullTokenId, bullActor.name, { deposit: !!opts.deposit });
        const tgtGain = await _carnalArousal(targetActor, bullTokenId, opts.arousal ?? 1);
        // NO HOPE OR FEAR IN THE WORDING EITHER. These three lines announced a
        // payout AFLR no longer makes, and a card that narrates a rule it does not
        // apply is the exact failure the 21-22 Aug card sweep was chasing. The
        // duality result is still on the card - the "with Hope"/"with Fear" tag
        // below - and the system's own roll card carries the rest.
        if (res.rung === "crit") {
          lines.push(`Critical - <strong>${bullActor.name}</strong> overpowers <strong>${targetActor.name}</strong> outright and tops them. They are Submitting now. Both <strong>${_aro(opts.arousal ?? 1)}</strong>.`);
        } else {
          lines.push(`<strong>${bullActor.name}</strong> tops <strong>${targetActor.name}</strong>` +
            ` - they are pulled in Submitting, both <strong>${_aro(opts.arousal ?? 1)}</strong>${tgtGain.climaxed ? " (they climax)" : `, now ${tgtGain.arousal}`}.`);
        }
      } else {
        lines.push(`<strong>${bullActor.name}</strong>'s Carnal action falls short of <strong>${targetActor.name}</strong> - no hold is established.`);
      }
      if (advNote) lines.push(advNote);

      const tag = res.isCrit ? "critical" : (res.withHope ? "with Hope" : "with Fear");
      // NAME THE TRAIT THAT WAS ACTUALLY ROLLED. On the system path `trait` may be
      // null - AFLR deliberately stopped asking, so the player chose in the system's
      // own dialog and may have changed it there. `res.trait` is what the dice used.
      const shownTrait = res.viaSystem ? (res.trait ?? trait) : trait;
      await _card(bullActor, `presses a Carnal Action on ${targetActor.name} (${shownTrait ? _cap(shownTrait) + " " : ""}action roll vs ${def.label} ${dc})`,
        [`Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.`, ...lines]);
      return { approach: "actor-press", ...res };
    },

    // Public: at Defeat 3, a further Defeat overflows into 3 Stress (per token),
    // which follows the DH cascade toward Mind Break. The climax handler calls
    // this so a trapped, repeatedly pressed creature breaks instead of plateauing
    // at Defeat 3. Returns { stressMarked, brokeMind, ... }.
    async defeatOverflow(actor, n = 1) { return _defeatOverflow(actor, n); },

    async _mindBreak(actor) {
      // Ego Death (Splendor): a Submitting character with Ego Death loaded does
      // not break - their spirit ascends into Nirvana instead. Resolved at the
      // end of the scene (see resolveNirvana, called from HScene.closeScene).
      if (_hasLoadoutCard(actor, "Ego Death")) {
        return this._enterNirvana(actor);
      }
      await AFLP.cond.apply(actor, "mind-break", 1);
      // uuidIsReal, not truthiness - a dead uuid is a truthy string and took
      // the link branch, rendering a broken link instead of this plain-text fallback.
      const link = AFLP.contentLinkText("mind-break", "Mind Break");
      const lustHaze = _isLustHaze();
      // Record whether this break triggers a bad-end scene, so a later
      // recovery/rescue path can honor the frame. In Lust Haze the break starts
      // a bad end (the character is kept and used, the scene plays out); in the
      // default frame the fiction can pull them back.
      try { await actor.setFlag?.(SCOPE(), "mindBreakBadEnd", lustHaze); } catch (e) { /* non-fatal */ }
      const tail = lustHaze
        ? `They keep their Defeat and drop out of the fight, and their bad end begins - the scene of them being kept and used plays out from here.`
        : `They keep their Defeat and drop out of the fight. The fiction can pull them back.`;
      await _card(actor, "breaks", [
        `Their mind gives out and they stop fighting, pliant and eager, wanting the next climax more than escape. ${link} as Avoid Death: ${tail}`,
      ]);
    },

    // ── Nirvana (Splendor / Ego Death) ──────────────────────────────────────
    // Ego Death converts the Mind Break death move into Nirvana: the spirit
    // floats free (immune, casts freely) while the body is used. Each body
    // climax during Nirvana banks +1 to the eventual Avoid Death scar roll. At
    // scene end Nirvana resolves as Avoid Death (or, with Living Prayer loaded,
    // the character just clears 1 HP). The scar roll / HP clear are the player's
    // DH death-move actions - this code tracks the state and banked bonus and
    // prompts the resolution rather than rolling for them.
    async _enterNirvana(actor) {
      const SC = SCOPE();
      const livingPrayer = _hasLoadoutCard(actor, "Living Prayer");
      try { await actor.setFlag?.(SC, "nirvana", { active: true, climaxes: 0, livingPrayer }); }
      catch (e) { /* non-fatal */ }
      await AFLP.cond.apply(actor, "nirvana", 1);
      // uuidIsReal, not truthiness - a dead uuid is a truthy string and took
      // the link branch, rendering a broken link instead of this plain-text fallback.
      const link = AFLP.contentLinkText("nirvana", "Nirvana");
      await _card(actor, "ascends", [
        `Instead of breaking, ${actor.name}'s spirit slips free and rises into ${link}. The body stays behind, Submitting and open to be used, while the spirit acts on - immune to damage and effects, free to Spotlight and cast any loadout spell at no Hope or Stress cost, but taking no physical action. Each time the body climaxes, +1 banks to the scar roll to come.`,
      ]);
    },

    // Called on every climax; no-op unless the actor is currently in Nirvana.
    async bankNirvanaClimax(actor) {
      const SC = SCOPE();
      const n = actor?.getFlag?.(SC, "nirvana");
      if (!n?.active) return;
      const climaxes = (n.climaxes ?? 0) + 1;
      try { await AFLP.gm.run("setFlag", actor, "nirvana", { ...n, climaxes }); } catch (e) { return; }
      await _card(actor, "in Nirvana", [
        `The used body climaxes again - Nirvana banks <strong>+${climaxes}</strong> to the coming scar roll.`,
      ]);
    },

    // Called at scene end (HScene.closeScene) for each participant; resolves and
    // clears any active Nirvana.
    async resolveNirvana(actor) {
      const SC = SCOPE();
      const n = actor?.getFlag?.(SC, "nirvana");
      if (!n?.active) return;
      const climaxes = n.climaxes ?? 0;
      try { await AFLP.gm.run("setFlag", actor, "nirvana", null); } catch (e) { /* non-fatal */ }
      try { await AFLP.cond?.remove?.(actor, "nirvana"); } catch (e) { /* non-fatal */ }
      if (n.livingPrayer) {
        await _card(actor, "returns", [
          `Nirvana fades with the scene. <strong>Living Prayer</strong> holds ${actor.name} together: instead of the Avoid Death death move, they simply <strong>clear 1 HP</strong> and rise again.`,
        ]);
        return;
      }
      await _card(actor, "returns", [
        `Nirvana fades with the scene. ${actor.name} takes the <strong>Avoid Death</strong> death move${climaxes > 0 ? `, adding <strong>+${climaxes}</strong> to the scar roll for the ${climaxes} climax${climaxes === 1 ? "" : "es"} the body took while ascended` : ""}.`,
      ]);
    },

    // Ally intervention: a rescuer steps in to free a target pinned by a Carnal
    // predicament. The campaign frame governs the outcome:
    // THE CARD IS THE TABLE, and the rescuer carries the cost on three of the five
    // rungs in the BASE rules - Ardis, 20 Aug 2026: "lets make it a base rule."
    //
    //   crit           ally breaks free, ally's Arousal clears to 0
    //   success-hope   ally breaks free and clears 2 Arousal
    //   success-fear   ally breaks free, but the RESCUER marks 2 Arousal
    //   fail-hope      ally stays caught; the RESCUER marks 2 Arousal
    //   fail-fear      ally stays caught AND the captor seizes the rescuer too -
    //                  they are caught and mark 2 Arousal
    //
    // This block used to read the campaign frame instead: the default frame gave a
    // "clean rescue" where the rescuer took no risk and a fail-with-fear cost a
    // Stress, and only Lust Haze pulled the rescuer in (marking 1, not 2). Three
    // rungs disagreed with the card. The frame no longer changes this move.
    // GOES STALE IF: the card's table changes, or Lust Haze gains its own rescue
    // clause - at which point it modifies these outcomes rather than replacing them.
    // opts: { dc, sourceName, clearDefeat, coolBy }. Returns a result object.
    async allyIntervene(rescuer, target, opts = {}) {
      if (is5e()) return _ally5e(rescuer, target, opts);
      if (!isDH()) return null;
      if (!rescuer || !target) return null;
      const dc = opts.dc ?? 15;
      const lustHaze = _isLustHaze();
      const trait = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : "presence";
      const tMod = _traitMod(rescuer, trait);

      // Carnal Rescue is a trait roll vs the adversary's Difficulty, resolving like
      // Struggle Escape but to free the ALLY. Any trait works (player narrates the
      // fiction) - that free choice is the edge over Struggle Escape's Str/Agility.
      // No kink advantage here: Dominant/Submissive/Switch were removed from the
      // DH roster (the Carnal action set already covers both roles by default).
      // THE SYSTEM ROLLS IT, and falls back to AFLR's own roller only where the
      // pipeline is not there. Carnal Rescue is an ACTION - Ardis, 21 Aug 2026:
      // "Carnal Escape and Carnal Rescue are actions. Carnal Resist is the
      // reaction." The guide agrees, four separate ways.
      let res = await _systemDualityRoll(rescuer, { trait, dc, adv: 0, actionType: "action" });
      if (res?.cancelled) return null;          // dialog dismissed: no roll, no payout, no card
      if (!res) res = await _dualityResist(rescuer, dc, 0, tMod);
      // AFLR PAYS NOTHING OF THE DUALITY - the same rule as Carnal Escape, and for
      // the same reason. Ardis, 22 Aug 2026: "both escape and rescue should just
      // have arousal changes be the extra aflr effect and otherwise just offer
      // whatever the dh native effects for the roll is."
      //
      // MEASURED 22 Aug 2026: the guide journal's worked rescue example and the
      // `Carnal Rescue` pack card both deal ONLY in Arousal - "Coming free with
      // Hope cools her - clear 2 Arousal, from 4 down to 2/6" - with zero mentions
      // of Hope, Fear or Stress as a PAYOUT between them.
      //
      // All three carnal duality callers now agree: the Arousal swing is AFLR's,
      // the duality is Daggerheart's. (Carnal Resist reached this first, by being
      // a reaction, which generates none by rule.)
      const tag = res.isCrit ? "critical, with Hope" : (res.withHope ? "with Hope" : "with Fear");
      // NAME THE TRAIT THAT WAS ACTUALLY ROLLED, and do not restate a modifier the
      // system applied - on the system path the trait bonus is in its own card.
      const shownTrait = res.viaSystem ? (res.trait ?? trait) : trait;
      const modText = res.viaSystem ? "" : (tMod ? `, ${tMod > 0 ? "+" : ""}${tMod}` : "");
      const lines = [`${_cap(shownTrait)} Carnal Rescue (${_dcWord()} ${dc}${modText}) - Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.`];

      // `rescuerStress` is kept at false and still returned. Nothing outside this
      // file reads it (measured 20 Aug 2026) and no rung sets it any more - the
      // Stress cost belonged to the old default-frame rescue, which is on no card.
      // Left in the shape rather than removed so a caller that DOES appear gets a
      // defined false instead of undefined, which is the safer of the two lies.
      let rescued = false, rescuerPulledIn = false, targetArousal = null, rescuerArousal = null;
      const rescuerStress = false;

      if (res.rung === "crit") {
        rescued = true;
        await AFLP.gm.run("setArousal", target, 0, _arousalMax(target)); targetArousal = 0;
        const d = _defeat(target);
        if (d > 0) await AFLP.cond.setValue(target, "defeat", Math.max(0, d - 1));
        // NO STRESS CLEAR AND NO HOPE HERE. Ardis, 20 Aug 2026: "on a crit in dh
        // its native that they gain a hope and clear a stress so we shouldn't make
        // that clear 1 rescuer stress in the code as dh already has them clear 1."
        // The Stress half went then; the Hope half and the sentence describing both
        // went on 22 Aug under the wider ruling above. A critical success's Hope and
        // Stress clear are BASE Daggerheart, applied by the system or by the table,
        // and this card no longer narrates rules it does not apply.
        lines.push(`Critical Carnal Rescue - <strong>${rescuer.name}</strong> tears <strong>${target.name}</strong> loose clean. ${target.name}'s <strong>${_aroReset()}</strong>${d > 0 ? ` and a Defeat token clears (now ${Math.max(0, d - 1)}/3)` : ""}.`);
      } else if (res.rung === "success-hope") {
        rescued = true;
        targetArousal = await _coolArousal(target, 2);
        lines.push(`<strong>${rescuer.name}</strong> pulls <strong>${target.name}</strong> free with Hope - the wrench of it wrings them out. They <strong>${_aro(-2)}</strong>, now <strong>${targetArousal}</strong>.`);
      } else if (res.rung === "success-fear") {
        // THE RESCUER PAYS, NOT THE ALLY. Card: "Your ally breaks free, but YOU
        // mark 2 Arousal." This marked the TARGET - the creature being rescued -
        // so a success with Fear worked up the person you had just pulled out
        // and cost the rescuer nothing.
        rescued = true;
        const ar = await _markArousal(rescuer, 2); rescuerArousal = ar.arousal;
        lines.push(`<strong>${rescuer.name}</strong> drags <strong>${target.name}</strong> out, but the work of it tells on <strong>${rescuer.name}</strong> - they <strong>${_aro(2)}</strong>` +
          (ar.climaxed ? ` and tip into a climax (Defeat token).` : `, now <strong>${ar.arousal}</strong>.`));
      } else if (res.rung === "fail-hope") {
        // Card: "Your ally stays caught; YOU mark 2 Arousal." Nothing was marked
        // at all - this rung posted a line about gaining a Hope and moved on.
        const ar = await _markArousal(rescuer, 2); rescuerArousal = ar.arousal;
        lines.push(`The rescue slips - <strong>${target.name}</strong> stays caught, and the strain of it catches <strong>${rescuer.name}</strong>: they <strong>${_aro(2)}</strong>` +
          (ar.climaxed ? ` and tip into a climax (Defeat token).` : `, now <strong>${ar.arousal}</strong>.`) +
          ` They can try again.`);
      } else { // fail-fear
        // Card: "Your ally stays caught AND the captor seizes you too - you are
        // caught and mark 2 Arousal."
        //
        // RESCUE CONTAGION IS THE BASE RULE - Ardis, 20 Aug 2026: "lets make it a
        // base rule." It used to be gated on the Lust Haze frame, with the default
        // frame marking a Stress instead and the header comment promising that
        // "the rescuer takes no risk". The card puts the risk in the base rules on
        // three of five rungs, and the card is the specification.
        //
        // The frame no longer changes this rung. The Lust Haze branch also marked
        // ONE Arousal where the card says two; both frames now mark two.
        rescuerPulledIn = true;
        const puller = _rescuePuller(rescuer, opts.sourceTokenId, opts.sourceName);
        if (puller?.tokenId) {
          await _startHScene(rescuer, puller.tokenId, puller.name, {});
          const ar = await _carnalArousal(rescuer, puller.tokenId, 2);
          rescuerArousal = ar?.arousal ?? null;
          lines.push(`The pull takes <strong>${rescuer.name}</strong> instead: ${puller.same ? `<strong>${puller.name}</strong> hauls them into the same scene` : `<strong>${puller.name}</strong> seizes the opening and drags them into a scene of its own`}. They are <strong>Submitting</strong> now and <strong>${_aro(2)}</strong>${ar?.climaxed ? " (they climax)" : (rescuerArousal != null ? `, now ${rescuerArousal}` : "")}. <strong>${target.name}</strong> stays caught.`);
        } else {
          // NOTHING FREE TO SEIZE THEM. The card assumes a captor with a hand
          // spare; with none on the board the rescuer cannot be caught. Keep the
          // half that still applies - the 2 Arousal - rather than substituting a
          // Stress, which is what the old default frame did and is on no card.
          rescuerPulledIn = false;
          const ar = await _markArousal(rescuer, 2); rescuerArousal = ar.arousal;
          lines.push(`The rescue fails; with no adversary free to seize them, <strong>${rescuer.name}</strong> is left <strong>${_aro(2)}</strong>${ar.climaxed ? " and tips into a climax" : `, now <strong>${ar.arousal}</strong>`}. <strong>${target.name}</strong> stays caught.`);
        }
      }

      // A freed ally leaves the H-Scene (mirrors Struggle Escape's own exit).
      if (rescued) {
        try { const loc = _sceneSlotFor(target); if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId); }
        catch (e) { console.warn("AFLP | Carnal Rescue: ally scene exit failed", e); }
      }

      // NO "(Lust Haze)" SUFFIX ANY MORE. The frame no longer changes this move's
      // outcome, so labelling the card with it told the table a rule had applied
      // when none had. `frame` stays in the return value, where it is a statement
      // of which frame is active rather than a claim about what happened.
      await _card(rescuer, `Carnal Rescue for ${target.name}`, lines);
      return { frame: lustHaze ? "lustHaze" : "default", rescued, rescuerPulledIn, targetArousal, rescuerArousal, rescuerStress, rung: res.rung, trait };
    },

    // Prompt the actor's player to pick a trait for a Carnal Resist or Carnal
    // Rescue (any trait; the fiction is theirs to narrate). Returns the trait key
    // or null if the dialog is dismissed.
    // D&D 5e picker. The DH trait list (Presence/Instinct/...) is meaningless
    // here. Escape and Rescue offer the target's own choice of Athletics or
    // Acrobatics - 5e's grapple-escape idiom, and the echo of DH's two-trait
    // choice. Rescue additionally picks the intervention MODE. A Press needs no
    // prompt at all (the presser just rolls an attack), and a defender never
    // rolls to Resist on 5e, so both return a truthy sentinel so the caller
    // proceeds rather than reading it as a cancel.
    async _prompt5eCarnal(actor, kind = "escape") {
      if (kind === "press" || kind === "resist") return kind;
      const fmt = (m) => `${m >= 0 ? "+" : ""}${m}`;
      const ath = actor.system?.skills?.ath?.total ?? 0;
      const acr = actor.system?.skills?.acr?.total ?? 0;

      const isRescue = kind === "rescue";
      const buttons = isRescue
        ? [
            { action: "break:ath",  label: `Break them free - Athletics ${fmt(ath)}`,  callback: () => "break:ath" },
            { action: "break:acr",  label: `Break them free - Acrobatics ${fmt(acr)}`, callback: () => "break:acr" },
            { action: "distract",   label: `Distract - grant advantage on their next Carnal Escape`, callback: () => "distract" },
          ]
        : [
            { action: "ath", label: `Athletics ${fmt(ath)} - wrench free by force`, callback: () => "ath" },
            { action: "acr", label: `Acrobatics ${fmt(acr)} - twist loose and slip the grip`, callback: () => "acr" },
          ];

      const title  = isRescue ? "Carnal Rescue" : "Carnal Escape";
      const prompt = isRescue
        ? `How does <strong>${actor.name}</strong> step in? Haul the ally out yourself, or draw the adversary's attention so they can pull free themselves.`
        : `How does <strong>${actor.name}</strong> break free?`;
      try {
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: `<p>${prompt}</p>`,
          buttons,
          rejectClose: false,
        });
        return choice ?? null;
      } catch (e) { return null; }
    },

    async promptCarnalTrait(actor, kind = "rescue") {
      if (!actor) return null;
      if (is5e()) return this._prompt5eCarnal(actor, kind);
      const hints = {
        rescue: { strength: "haul them out by force", agility: "dart in and pull them clear", finesse: "distract the adversary", instinct: "read the moment", presence: "lure the adversary off", knowledge: "exploit a weakness" },
        resist: { strength: "shove them off", agility: "twist and slip the grip", finesse: "deflect and redirect", instinct: "steel yourself", presence: "stare them down", knowledge: "clinically detach" },
        escape: { strength: "wrench free by force", agility: "twist loose and bolt", finesse: "wriggle out of the hold", instinct: "find the opening", presence: "break their focus", knowledge: "work the leverage" },
        press:  { strength: "pin and overpower", agility: "move faster than they can answer", finesse: "tease and toy", instinct: "press the moment", presence: "command them down", knowledge: "play their body expertly" },
      };
      const hint = hints[kind] ?? hints.rescue;
      const fmt = (m) => `${m >= 0 ? "+" : ""}${m}`;
      const titles = { resist: "Carnal Resist", rescue: "Carnal Rescue", escape: "Carnal Escape", press: "Carnal Action" };
      const title  = `${titles[kind] ?? "Carnal Action"} - choose a trait`;
      const prompts = {
        resist: `How does <strong>${actor.name}</strong> resist? Pick a trait and describe how they hold out.`,
        rescue: `How does <strong>${actor.name}</strong> step in to save the ally? Pick a trait and describe the action.`,
        escape: `How does <strong>${actor.name}</strong> break free? Pick a trait and describe how.`,
        press:  `How does <strong>${actor.name}</strong> press the Carnal Action? Pick a trait and describe how.`,
      };
      const prompt = prompts[kind] ?? prompts.rescue;
      try {
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title },
          content: `<p>${prompt}</p>`,
          buttons: _DH_TRAITS.map(t => ({ action: t, label: `${_cap(t)} ${fmt(_traitMod(actor, t))} - ${hint[t]}`, callback: () => t })),
          rejectClose: false,
        });
        return choice ?? null;
      } catch (e) { return null; }
    },
    // Back-compat alias for the Carnal Rescue prompt.
    async promptRescueTrait(rescuer) { return this.promptCarnalTrait(rescuer, "rescue"); },
    holdDC(actor) { return _holdDC(actor); },
    targetDefense(actor) { return _targetDefense(actor); },

    // Whether allies may cleanly spring a pinned/Mind-Broken character in the
    // current frame. Default frame: yes. Lust Haze: no (self-rescue only).
    alliesCanFreeCleanly() {
      return !_isLustHaze();
    },

    // Convenience: read current scene-relevant state for an actor (for UI).
    state(actor) {
      return {
        arousal: AFLP.system?.getArousalCurrent?.(actor) ?? 0,
        arousalMax: _arousalMax(actor),
        defeat: _defeat(actor),
        bimbofied: _bimbo(actor),
        stress: _res(actor, "stress")?.value ?? null,
        stressMax: _res(actor, "stress")?.max ?? null,
      };
    },

    // Inferred resist trait(s) for a carnal action item (e.g. ["strength","agility"]
    // for "Strength or Agility Reaction Roll"). The dock passes the result into the
    // carnalPrompt so resolve()'s reaction roll adds the right trait modifier.
    reactionTraits(item) {
      return _reactionTraits(item);
    },
    reactionArousal(item) {
      return _reactionArousal(item);
    },

    // Post the three-approach prompt card targeting a PC. The GM (or a Carnal
    // ability) calls this; the targeted player clicks a approach. dc = source
    // Difficulty; sourceName = who/what is making the advance (flavor).
    async postPrompt(actor, opts = {}) {
      if (!isDH()) return null;
      const dc = opts.dc ?? 15;
      const src = opts.sourceName ? `<strong>${opts.sourceName}</strong>` : "A Carnal action";
      const st = this.state(actor);
      const stressCost = 1 + st.defeat;
      const defNote = st.bimbofied > 0
        ? `<p style="font-size:11px;color:#a05050;">Bimbofied ${st.bimbofied}/3: resist rolls at disadvantage (${st.bimbofied} die per token). No Defeat can be gained, so the Stress approach stays at ${1 + st.defeat}.</p>`
        : (st.defeat > 0
          ? `<p style="font-size:11px;color:#a05050;">Defeat ${st.defeat}/3: resist rolls at disadvantage; the Stress approach costs ${stressCost}.</p>`
          : "");
      const aid = actor.id;
      // THE CARD CARRIES A TOKEN ID NOW, AND THIS IS WHY.
      // Every button on this card resolved its actor with
      // `game.actors.get(dataset.actorId)`, which is ALWAYS the world actor. On an
      // unlinked token that is a DIFFERENT DOCUMENT with the same id, so the card's
      // buttons wrote one store while the H-Scene, the status panel and
      // `AFLP.system.liveActor` all read the other.
      //
      // MEASURED from a player client, 21 Aug 2026: an unlinked token pressed and
      // then sent through the card's own Carnal Escape read `token.actor` Arousal 2
      // against world-actor Arousal 1. The player's sheet did not move while the
      // card said it had.
      //
      // DERIVED, NEVER GUESSED. `opts.targetTokenId` is what the dock already
      // passes; `actor.token?.id` is exact when the caller handed us a synthetic
      // token actor. If neither is there the stamp is EMPTY and the handlers fall
      // back to the world actor exactly as before - `getActiveTokens()[0]` is not
      // used, because picking one of several mooks off a shared base actor is the
      // guess this whole class of bug is made of.
      const ttk = opts.targetTokenId ?? actor?.token?.id ?? "";
      const stk = opts.sourceTokenId ?? "";
      const hsa = opts.hsa ? "1" : "";
      // The feature's declared conditions ride the card as a URI-encoded JSON
      // blob. Encoded, not raw: a bare JSON string carries double quotes, which
      // would terminate the HTML attribute and silently truncate the payload.
      const apl = (opts.applies && typeof opts.applies === "object")
        ? encodeURIComponent(JSON.stringify(opts.applies)) : "";
      const spo = opts.scenePosition ? encodeURIComponent(String(opts.scenePosition)) : "";
      const aro = Number.isFinite(Number(opts.arousal)) ? Number(opts.arousal) : "";
      const content = `<div class="aflp-chat-card aflp-carnal-prompt" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}">
        <p>${src} presses on <strong>${actor.name}</strong> (Difficulty ${dc}).</p>
        <p style="font-size:12px;">Arousal ${st.arousal}/${st.arousalMax} - choose how to meet it:</p>${_isLustHaze() ? `<p style="font-size:10px;color:#a05050;opacity:0.85;">Lust Haze: the way out is to free yourself.</p>` : ""}
        <div class="aflp-carnal-approaches" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
          <button type="button" class="aflp-carnal-approach" data-approach="roll" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}" data-applies="${apl}" data-scenepos="${spo}" data-arousal="${aro}">Carnal Resist (choose trait)</button>
          <button type="button" class="aflp-carnal-approach" data-approach="stress" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}" data-applies="${apl}" data-scenepos="${spo}" data-arousal="${aro}">Mark ${stressCost} Stress</button>
          <button type="button" class="aflp-carnal-approach" data-approach="give-in" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}" data-applies="${apl}" data-scenepos="${spo}" data-arousal="${aro}">Give in</button>
        </div>${defNote}
        <div class="aflp-carnal-escape" style="margin-top:6px;border-top:1px solid rgba(80,80,160,0.25);padding-top:5px;">
          <button type="button" class="aflp-carnal-struggle" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" title="On your turn: a single action to break free">Carnal Escape (your action)</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">A single action on your turn: any success frees you; a crit wrings you out, a failure stokes your Arousal.</span>
        </div>${stk ? `
        <div class="aflp-carnal-hsa" style="margin-top:6px;border-top:1px solid rgba(120,40,120,0.3);padding-top:5px;">
          <button type="button" class="aflp-carnal-hsa-btn" data-actor-id="${aid}" data-token-id="${ttk}" data-source-token="${stk}" title="GM: the adversary presses again with its H-Scene Action">${src} uses its H-Scene Action</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">GM control: re-presses with the adversary's H-Scene Action to continue the scene.</span>
        </div>` : ""}
        <div class="aflp-carnal-rescue" style="margin-top:6px;border-top:1px solid rgba(160,80,80,0.25);padding-top:5px;">
          <button type="button" class="aflp-carnal-intervene" data-actor-id="${aid}" data-token-id="${ttk}" data-dc="${dc}" title="Select your character's token first, then click to step in">Intervene (selected token steps in)</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">An ally rolls to pull them free. On a success with Fear, or either failure, the rescuer marks 2 Arousal - and a failure with Fear gets them caught too.</span>
        </div></div>`;
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
    },

    // Fire an adversary's designated H-Scene Action against a pinned PC: read the
    // adversary's hSceneAction-flagged feature (its main fuck ability), then
    // re-post the Carnal prompt at the adversary's Difficulty. This is the GM's
    // one-click "the adversary presses again" that drives the H-Scene loop.
    async useHSceneAction(sourceTokenId, pcActor) {
      // 5e front-loads the roll on the attacker, so an adversary's H-Scene Action
      // IS a Carnal Press - there is no defender approach prompt to post.
      if (is5e()) {
        const srcTok = sourceTokenId ? canvas?.tokens?.get(sourceTokenId) : null;
        const srcActor = srcTok?.actor;
        if (!srcActor) { ui.notifications?.warn("AFLR | Adversary token not found - is it on the canvas?"); return null; }
        const pcTok = canvas?.tokens?.placeables?.find(t => t.actor?.id === pcActor?.id);
        return this.actorPress(srcActor, {
          targetActor: pcActor, targetTokenId: pcTok?.id ?? null,
          sourceTokenId, sourceName: srcActor.name, hsa: true,
        });
      }
      if (!isDH()) return null;
      const srcTok = sourceTokenId ? canvas?.tokens?.get(sourceTokenId) : null;
      const srcActor = srcTok?.actor;
      if (!srcActor) { ui.notifications?.warn("AFLR | Adversary token not found - is it on the canvas?"); return null; }
      // Designer item flags (hSceneAction / carnal) live under the MODULE-ID
      // namespace, not FLAG_SCOPE ("world"). Prefer the explicitly flagged H
      // Scene Action; fall back to a carnal feature whose name reads like a
      // fuck ability.
      const MID = AFLP.ID ?? "ardisfoxxs-lewd-pf2e";
      const feat = srcActor.items?.find(i => i.getFlag?.(MID, "hSceneAction"))
        ?? srcActor.items?.find(i => i.getFlag?.(MID, "carnal") && /pin and rut|bound and f|\brut\b|fuck|breed|mount|impale|ride|milk/i.test(i.name || ""));
      const dc = srcActor.system?.difficulty ?? 15;
      const clean = (feat?.name || "").replace(/\s*\((?:Mark a Stress|Spend a Fear|Action|Reaction|Passive)\)\s*$/i, "").trim();
      const srcName = clean ? `${srcActor.name}'s ${clean}` : `${srcActor.name}`;
      return this.postPrompt(pcActor, { dc, sourceName: srcName, sourceTokenId, hsa: true,
        applies: this.featureApplies(feat), scenePosition: this.featureScenePosition(feat) });
    },

    // Bind the approach buttons on a rendered chat card. Idempotent per element.
    // Resolve a card button's subject to the LIVE actor - the synthetic token
    // actor for an unlinked token, the world actor otherwise. Older cards carry no
    // `data-token-id`, so this degrades to exactly the previous behaviour rather
    // than breaking a card already sitting in the log.
    _cardActor(btn) {
      const base = game.actors?.get(btn?.dataset?.actorId);
      if (!base) return null;
      const tid = btn?.dataset?.tokenId || btn?.closest?.(".aflp-carnal-prompt")?.dataset?.tokenId || null;
      return AFLP.system?.liveActor?.(base, tid) ?? base;
    },

    _bindCard(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll(".aflp-carnal-approach").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const approach = btn.dataset.approach;
          const dc = Number(btn.dataset.dc) || 15;
          const actor = AFLP.Carnal._cardActor(btn);
          if (!actor) { ui.notifications?.warn("AFLR | Target actor not found."); return; }
          // Only the actor's owner (or GM) may act through the card.
          if (!actor.isOwner && !game.user?.isGM) { ui.notifications?.warn("AFLR | You don't own that character."); return; }
          // ONE DIALOG, NOT TWO - the same call Intervene already makes. On
          // Daggerheart the system's roll dialog carries the Trait Modifier
          // picker, so asking first is a second window asking the same question.
          // MEASURED on Brakka's client: a card-driven Resist opened AFLR's
          // "Carnal Resist - choose a trait" AND then rolled through the system.
          // 5e keeps AFLR's picker - it has no system dialog to inherit.
          let trait = null;
          if (approach === "roll" && game.system?.id !== "daggerheart") {
            trait = await AFLP.Carnal.promptCarnalTrait(actor, "resist");
            if (!trait) return;
          }
          // Disable the approaches once chosen, to mark the beat as resolved.
          const wrap = btn.closest(".aflp-carnal-prompt");
          wrap?.querySelectorAll(".aflp-carnal-approach").forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
          const sourceTokenId = btn.dataset.sourceToken || undefined;
          const hsa = btn.dataset.hsa === "1";
          let applies = null;
          if (btn.dataset.applies) {
            try { applies = JSON.parse(decodeURIComponent(btn.dataset.applies)); }
            catch (err) { console.warn("AFLR | carnal card applies unreadable:", err?.message); }
          }
          let scenePosition = null;
          if (btn.dataset.scenepos) {
            try { scenePosition = decodeURIComponent(btn.dataset.scenepos); }
            catch (err) { console.warn("AFLR | carnal card scenePosition unreadable:", err?.message); }
          }
          const arousal = btn.dataset.arousal === "" ? undefined : Number(btn.dataset.arousal);
          await AFLP.Carnal.resolve(actor, { approach, dc, trait, escapeOffered: true, sourceTokenId, hsa, applies, scenePosition, arousal });
        });
      });

      // Struggle Escape button: the card's actor takes the single action.
      root.querySelectorAll(".aflp-carnal-struggle").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const dc = Number(btn.dataset.dc) || 15;
          const actor = AFLP.Carnal._cardActor(btn);
          if (!actor) { ui.notifications?.warn("AFLR | Target actor not found."); return; }
          if (!actor.isOwner && !game.user?.isGM) { ui.notifications?.warn("AFLR | You don't own that character."); return; }
          await AFLP.Carnal.struggleEscape(actor, { dc });
        });
      });

      // "Begin Carnal H-Scene" button: posted inside a usable adversary H-Scene
      // Action card (DH). The GM targets a PC, uses the action on the sheet,
      // then clicks this to launch the carnal prompt. Source token comes from
      // the message speaker; the target is the GM's current target.
      root.querySelectorAll(".aflp-carnal-begin").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          if (!game.user?.isGM) { ui.notifications?.warn("AFLR | Only the GM begins a Carnal H-Scene."); return; }
          const msgId = btn.closest("[data-message-id]")?.dataset.messageId;
          const msg = msgId ? game.messages.get(msgId) : null;
          const srcTokenId = msg?.speaker?.token || btn.dataset.sourceToken || canvas?.tokens?.controlled?.[0]?.id;
          const pc = game.user.targets?.first?.()?.actor;
          if (!srcTokenId) { ui.notifications?.warn("AFLR | Select or identify the adversary token first."); return; }
          if (!pc) { ui.notifications?.warn("AFLR | Target a player character first, then click Begin."); return; }
          await AFLP.Carnal.useHSceneAction(srcTokenId, pc);
        });
      });

      // H-Scene Action button (GM): the adversary presses again with its
      // designated fuck ability, re-posting the prompt to continue the scene.
      root.querySelectorAll(".aflp-carnal-hsa-btn").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          if (!game.user?.isGM) { ui.notifications?.warn("AFLR | Only the GM fires the H-Scene Action."); return; }
          const pc = AFLP.Carnal._cardActor(btn);
          const stk = btn.dataset.sourceToken;
          if (!pc || !stk) { ui.notifications?.warn("AFLR | Missing target or adversary token."); return; }
          await AFLP.Carnal.useHSceneAction(stk, pc);
        });
      });

      // Intervene button: the rescuer is the user's selected token; the target
      // is the card's actor. Does not disable the approaches - the target still
      // chooses their own response if not freed.
      root.querySelectorAll(".aflp-carnal-intervene").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const dc = Number(btn.dataset.dc) || 15;
          const target = AFLP.Carnal._cardActor(btn);
          if (!target) { ui.notifications?.warn("AFLR | Target actor not found."); return; }
          // rescuer = the controlled/selected token's actor
          const tok = canvas.tokens?.controlled?.[0];
          const rescuer = tok?.actor ?? null;
          if (!rescuer) { ui.notifications?.warn("AFLR | Select your character's token first, then click Intervene."); return; }
          if (rescuer.id === target.id) { ui.notifications?.warn("AFLR | The rescuer and the target are the same character."); return; }
          if (!rescuer.isOwner && !game.user?.isGM) { ui.notifications?.warn("AFLR | You don't own the selected character."); return; }
          // ONE DIALOG, NOT TWO. On Daggerheart the system's own roll dialog
          // carries a Trait Modifier picker, so AFLR's trait prompt in front of it
          // would be a second window asking the same question - Ardis, 21 Aug 2026:
          // "they can add their trait bonus like they would to any other roll,
          // using the picker". 5e has no such dialog and keeps AFLR's, which also
          // picks the intervention MODE there.
          let trait = null;
          if (game.system?.id !== "daggerheart") {
            trait = await AFLP.Carnal.promptRescueTrait(rescuer);
            if (!trait) return;
          }
          const stk = btn.closest(".aflp-carnal-prompt")?.dataset?.sourceToken || "";
          await AFLP.Carnal.allyIntervene(rescuer, target, { dc, trait, sourceTokenId: stk, escapeOffered: true });
        });
      });
    },
  };

  window.AFLP = window.AFLP || {};
  AFLP.Carnal = AFLP_Carnal;

  // EXPOSED SO THE DAGGERHEART ADAPTER CAN ROLL AN EDGE THROUGH THE SAME PIPELINE.
  //
  // The alternative was a second copy of `rollTrait` inside the adapter, and this
  // function is ninety lines of hard-won contract - the synthetic event that is the
  // difference between a roll dialog and none, the `kh` fix, and `roll.hope` being
  // an OBJECT rather than a number. **A correct duplicate is how the wrong ones get
  // written here**, so there is one duality pipeline and every caller shares it.
  // GOES STALE IF: a second system gains a duality roll, at which point this stops
  // being a Daggerheart-only service and wants a home outside the carnal layer.
  AFLP.Carnal.systemDualityRoll = _systemDualityRoll;
  AFLP.Carnal.canSystemDuality  = _canSystemDuality;

  // Wire approach buttons on every chat render (chat re-renders, so bind each time).
  // v13+ passes the current hook name renderChatMessageHTML; html may be jQuery
  // or a raw element depending on system - normalize to an element.

  // Virtue/Lust relabel (DH): when the duality-labels setting is "virtue-lust",
  // swap the DISPLAYED words "Hope"/"Fear" for "Virtue"/"Lust" inside AFLR chat
  // cards. Walks text nodes only, so button bindings survive and only visible
  // text changes - data paths, gainHope, variable names, and the core DH
  // "ResourcesFear" setting key are never touched. Stored message content keeps
  // the canonical Hope/Fear, so toggling the setting and re-rendering reverts cleanly.
  function _dualityWords() {
    try {
      if (isDH() && AFLP.Settings?.dualityLabels === "virtue-lust")
        return { Hope: "Virtue", Fear: "Lust" };
    } catch (e) { /* default labels */ }
    return null;
  }
  function _relabelDuality(root) {
    if (!root?.querySelectorAll) return;
    const w = _dualityWords();
    if (!w) return;
    const cards = root.classList?.contains("aflp-chat-card")
      ? [root]
      : root.querySelectorAll(".aflp-chat-card");
    for (const card of cards) {
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) {
        if (/\b(?:Hope|Fear)\b/.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
      }
      for (const n of hits) {
        n.nodeValue = n.nodeValue.replace(/\bHope\b/g, w.Hope).replace(/\bFear\b/g, w.Fear);
      }
    }
  }

  const _bindHook = (msg, html) => {
    const root = html?.jquery ? html[0] : (html instanceof HTMLElement ? html : html?.[0]);
    try { AFLP.Carnal._bindCard(root); } catch (e) { /* never break chat render */ }
    try { _relabelDuality(root); } catch (e) { /* never break chat render */ }
  };
  Hooks.on("renderChatMessageHTML", _bindHook);
  Hooks.on("renderChatMessage", _bindHook); // fallback for older cores

  // ===============================
  // Mind Break death move (Daggerheart)
  // ===============================
  // When a Submitting character reaches a death move, AFLR offers Mind Break
  // alongside the system's options: a surrender to the lust rather than a death.
  // Choosing it applies the mind-break condition and posts the bad-end card via
  // AFLP.Carnal._mindBreak. Gated to the Submitting condition so it never shows
  // for a character dying in ordinary combat. The card is its own click handler
  // rather than a system move, so the system's move flow is untouched.
  const _aflrResolveDeathMoveActor = (app) => {
    let a = app?.actor ?? app?.options?.actor ?? app?.document;
    if (a && a.documentName !== "Actor" && a.actor) a = a.actor; // some builds wrap it
    return (a && a.documentName === "Actor") ? a : null;
  };
  Hooks.on("renderDhDeathMove", (app) => {
    try {
      const actor = _aflrResolveDeathMoveActor(app);
      if (!actor) return;
      if (!AFLP.cond?.has?.(actor, "submitting")) return; // only while Submitting
      const list = app.element?.querySelector("ul.moves-list");
      if (!list || list.querySelector(".aflr-mind-break")) return; // idempotent
      const li = document.createElement("li");
      li.className = "move-item aflr-mind-break";
      li.dataset.tooltip = "You give in to your lust. Your mind breaks: you stop fighting and become a willing sex slave for your adversary. Maybe they'll let you go...";
      li.innerHTML =
        '<div class="label" data-tooltip-direction="LEFT">' +
        '<i class="fa-solid fa-heart-crack fa-xl"></i>' +
        '<span class="label">Mind Break</span></div><input type="radio">';
      li.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Mind Break" },
          content: `<p>Let ${actor.name}'s mind break and give in to the lust? They stop fighting and drop out, keeping their Defeat. This is a surrender, not a death.</p>`
        });
        if (!ok) return;
        await app.close();
        await AFLP.Carnal._mindBreak(actor);
      });
      list.appendChild(li);
    } catch (e) {
      console.warn("AFLP | death-move Mind Break injection failed", e);
    }
  });

  console.log("AFLP | Carnal resolution layer loaded");
})();
