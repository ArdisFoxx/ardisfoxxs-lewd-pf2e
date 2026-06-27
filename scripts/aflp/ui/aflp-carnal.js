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
    return (cf.anal ?? 0) >= 8 || (cf.oral ?? 0) >= 8 || (cf.vaginal ?? 0) >= 8 || (cf.facial ?? 0) >= 8;
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
    return ["presence", "instinct"];
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
  function _targetDefense(actor) {
    if (!actor) return { value: 15, label: "Difficulty" };
    if (AFLP.system?.isNPC?.(actor)) return { value: actor.system?.difficulty ?? 15, label: "Difficulty" };
    return { value: actor.system?.evasion ?? 10, label: "Evasion" };
  }

  // The Difficulty to beat when contesting an actor's HOLD (Carnal Escape, Carnal
  // Rescue): an adversary's Difficulty, or - for a PC captor, who has none - a
  // derived grip DC of 10 + their Proficiency.
  function _holdDC(actor) {
    if (!actor) return 15;
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
    await actor.update({ "system.resources.stress.value": sVal });
    let lastHp = false, hpVal = hp?.value ?? null;
    if (overflow > 0 && hp) {
      const hMax = hp.max ?? 6;
      const hpBefore = hp.value ?? 0;
      hpVal = Math.min(hMax, hpBefore + overflow);
      await actor.update({ [_hpPath(actor)]: hpVal });
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
      await AFLP.system?.setArousalCurrent?.(actor, 0, max);
      await _markDefeat(actor, 1);
      return { climaxed: true, arousal: 0, max };
    }
    await AFLP.system?.setArousalCurrent?.(actor, next, max);
    return { climaxed: false, arousal: next, max };
  }

  async function _coolArousal(actor, n = 1) {
    const cur = AFLP.system?.getArousalCurrent?.(actor) ?? 0;
    const next = Math.max(0, cur - n);
    await AFLP.system?.setArousalCurrent?.(actor, next, _arousalMax(actor));
    return next;
  }

  // Carnal actions ARE the Arousal engine (replacing the old Sexual Advance step):
  // a landed action advances Arousal by n for BOTH the target and the source
  // adversary. Routed through AFLP_Arousal.increment so a climax on either side
  // resolves fully - Horny/Defeat/Purity and the cum macro - "as normal". Returns
  // the target's result { arousal, climaxed, max }.
  async function _carnalArousal(target, sourceTokenId, n = 1) {
    const inc = window.AFLP_Arousal?.increment;
    const max = _arousalMax(target);
    const before = AFLP.system?.getArousalCurrent?.(target) ?? 0;
    if (inc) await inc(target, n, "Carnal action", null);
    else await _markArousal(target, n);
    // The source adversary shares the heat - their own climax breeds the target.
    const src = sourceTokenId ? (canvas?.tokens?.get(sourceTokenId)?.actor) : null;
    if (src) {
      try { if (inc) await inc(src, n, "Carnal action", sourceTokenId); else await _markArousal(src, n); }
      catch (e) { /* non-fatal */ }
    }
    const after = AFLP.system?.getArousalCurrent?.(target) ?? 0;
    return { arousal: after, climaxed: after <= before && n > 0, max };
  }

  // Defeat past the cap (3) doesn't stack - each further Defeat instead marks 3
  // Stress, which follows the normal DH cascade (Stress full -> overflow into HP
  // -> the last HP triggers Mind Break). This keeps a creature left in a scene
  // and pressed past Defeat 3 sliding inevitably toward Mind Break rather than
  // plateauing. Returns { stressMarked, brokeMind, ... }.
  async function _defeatOverflow(actor, n = 1) {
    if (n <= 0) return { stressMarked: 0, brokeMind: false };
    const res = await _markStress(actor, n * 3);
    let brokeMind = false;
    if (res?.lastHp) { await AFLP_Carnal._mindBreak(actor); brokeMind = true; }
    return { stressMarked: n * 3, brokeMind, ...res };
  }

  async function _markDefeat(actor, n = 1) {
    // Defeat and Bimbofied are independent tracks - a character can carry both at
    // once. Bimbofied adds resist disadvantage dice; Defeat raises the power-through
    // cost. Marking Defeat is no longer blocked by Bimbofied.
    const cur = _defeat(actor);
    const next = Math.min(3, cur + n);   // cap at 3, like the token track
    const overflow = (cur + n) - next;   // Defeat that would exceed the cap
    await AFLP.system?.setConditionValue?.(actor, "defeat", next);
    // Keep the compendium-feature resource track (if the actor carries the
    // Defeat feature) visually in step with the flag count.
    try {
      const feat = actor.items?.find?.(i => i.getFlag?.(SCOPE(), "aflrKey") === "defeat"
        || /^defeat$/i.test(i.name ?? ""));
      if (feat?.system?.resource?.type) {
        await feat.update({ "system.resource.value": next });
      }
    } catch (e) { /* feature not present; flag is source of truth */ }
    // Overflow rule: at Defeat 3, the excess becomes Stress (3 per token).
    let over = { stressMarked: 0, brokeMind: false };
    if (overflow > 0) over = await _defeatOverflow(actor, overflow);
    return { defeat: next, overflow, ...over };
  }

  async function _markHopeOrFear(actor, withHope) {
    if (withHope) {
      const hope = _res(actor, "hope");
      if (hope) {
        const nv = Math.min(hope.max ?? 6, (hope.value ?? 0) + 1);
        await actor.update({ "system.resources.hope.value": nv });
        return { hope: nv };
      }
      return {};
    }
    if (game.user?.isGM) {
      try {
        const cur = Number(game.settings.get("daggerheart", "ResourcesFear") ?? 0);
        await game.settings.set("daggerheart", "ResourcesFear", cur + 1);
        return { fear: cur + 1 };
      } catch (e) { /* ignore */ }
    }
    return { fear: "+1" };
  }

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
      try { await AFLP.system?.applyCondition?.(pcActor, "submitting"); } catch (e) { /* role nicety */ }
      try { if (srcTok.actor) await AFLP.system?.applyCondition?.(srcTok.actor, "dominating"); } catch (e) { /* role nicety */ }
      // Start the scene WITHOUT its own position prompt: ensureAttackerPosition
      // below is the single authoritative prompt (it also locks the hole for a
      // penetrative landing). Letting startScene ALSO prompt opened two dialogs,
      // because its prompt is fire-and-forget and the position is still unset
      // when the awaited ensureAttackerPosition runs a moment later.
      AFLP.HScene.startScene(_tokenData(srcTok), _tokenData(pcTok), false, { promptPosition: false });
      await _card(pcActor, "is pulled into an H-Scene", [
        `${sourceName ? `<strong>${sourceName}</strong>` : "The adversary"} has them now - the encounter becomes an H-Scene. The adversary presses with its H-Scene Action each round until they break free or break.`,
      ]);
      // Bullified urge: a Bull within Close range of an ally being made to Submit to
      // an ADVERSARY feels a near-irresistible pull to join in and top the ally too,
      // or to fight the adversary for dominance. Surfaced as a GM reminder (the urge
      // is fiction the GM adjudicates - no forced mechanic).
      try {
        if (srcTok.actor && AFLP.system?.isNPC?.(srcTok.actor)) {
          const CLOSE = 30; // ft - Close range band approximation; adjust per table
          const bulls = (canvas?.tokens?.placeables ?? []).filter(t =>
            t.actor && t.id !== pcTok.id && !AFLP.system.isNPC?.(t.actor)
            && (AFLP.system?.conditionValue?.(t.actor, "bullified") ?? 0) > 0
            && canvas.grid.measureDistance(t, pcTok, { gridSpaces: true }) <= CLOSE);
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
      // (non-penetrative actions get the foreplay/pain-play list). For a
      // penetrative action the pick is AWAITED before depositing, so the load
      // lands in the chosen hole and impregnation only rolls on a vaginal pick -
      // never on a default while the picker is still open.
      await AFLP.HScene.ensureAttackerPosition?.(srcTok.id, { nonPenetrative: !deposit });
      if (deposit) await _depositLoad(pcActor, sourceTokenId);
      return true;
    } catch (e) { console.warn("AFLP | startHScene from carnal failed", e); return false; }
  }

  // Resolve which hole an adversary is using from its H-Scene position. The
  // source (cummer) carries its own position on its scene participant, and each
  // position maps to a hole (AFLP.getPosition(id).hole) - doggy -> vaginal,
  // facefuck -> oral, and so on. Mirrors the PF2e cum flow's auto-hole-from-
  // position. Returns null when no position is set on the scene.
  function _holeFromScene(sourceTokenId) {
    try {
      for (const s of (AFLP.HScene?._scenes?.values?.() ?? [])) {
        const p = (s.participants ?? []).find(pp => pp.tokenId === sourceTokenId);
        if (!p) continue;
        const posEntry = p.position ? AFLP.getPosition(p.position) : null;
        return posEntry?.hole ?? posEntry?.holeId ?? null;
      }
    } catch (e) { /* fall through to fallback */ }
    return null;
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

  // Deposit a load from the adversary into the PC after a failed/given-in H
  // Scene Action: a cum amount sized to the adversary (AFLP.BASE_CUM_BY_SIZE)
  // goes into the active hole, accumulating cumflation (DH-aware as of B1), and
  // a load in the pussy rolls the Brood Roll. Adversaries are effectively
  // infinite-cum, so no pool is tracked. Gated by the cumflationInHscene
  // setting. Hole defaults to vaginal until position-derived hole lands.
  async function _depositLoad(pcActor, sourceTokenId) {
    try {
      if (AFLP.Settings?.cumflationInHscene === false) return;
      if (!window.AFLP_Cumflation?.applyCumflation) return;
      const srcTok = sourceTokenId ? canvas?.tokens?.get(sourceTokenId) : null;
      const srcActor = srcTok?.actor;
      if (!srcActor) return;
      const SCOPE = AFLP.FLAG_SCOPE;
      // Designer item flags (carnal / hSceneAction / penetrates) live under the
      // MODULE-ID namespace (flags.ardisfoxxs-lewd-pf2e.*), NOT FLAG_SCOPE
      // ("world", which is for per-actor runtime state like cumflation). These
      // must be read under the module id or the lookup silently fails closed.
      const MID = AFLP.ID ?? "ardisfoxxs-lewd-pf2e";
      // The adversary's H-Scene Action declares only WHETHER it penetrates via
      // its `penetrates` flag; non-penetrative actions (a voyeur's compulsion,
      // frottage) carry no flag and deposit nothing - they have still built
      // Arousal and tokens through the carnal resolution. WHICH hole is filled
      // comes from the scene position (vaginal is the fallback if none is set).
      const hsaFeat = srcActor.items?.find(i => i.getFlag?.(MID, "hSceneAction"));
      if (!hsaFeat?.getFlag?.(MID, "penetrates")) return;
      const hole = _holeFromScene(sourceTokenId) ?? "vaginal";
      const cumUnitsSpent = AFLP.cumPerShot?.(srcActor) ?? 2;
      // Spend one load from the giver's pool (Coomer = loads before a rest).
      try {
        const gc = srcActor.getFlag(SCOPE, "cum");
        if (gc?.max) await srcActor.setFlag(SCOPE, "cum", { max: gc.max, current: Math.max(0, (gc.current ?? gc.max) - cumUnitsSpent) });
      } catch (e) { /* token/read-only actor */ }
      const cumFlags    = structuredClone(pcActor.getFlag(SCOPE, "cumflation")  ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 });
      const cumOverflow = structuredClone(pcActor.getFlag(SCOPE, "cumOverflow") ?? { anal: 0, oral: 0, vaginal: 0, facial: 0 });
      const _prevTier   = cumFlags[hole] ?? 0;   // hole fill before this shot (for spill calc)
      const sexual      = structuredClone(pcActor.getFlag(SCOPE, "sexual") ?? {});
      if (!sexual.lifetime) sexual.lifetime = {};
      await AFLP_Cumflation.applyCumflation(pcActor, cumFlags, cumOverflow, { sexual }, [hole], cumUnitsSpent, srcActor.name);
      await AFLP_Cumflation.saveCumflation(pcActor, cumFlags, cumOverflow);
      // Cum past the hole's capacity floods the ground (shared with the pf2e path).
      await AFLP.recordCumSpill?.(pcActor, srcActor, _prevTier, cumUnitsSpent);
      try { await pcActor.setFlag(SCOPE, "sexual", sexual); } catch (e) { /* read-only */ }
      await AFLP_Cumflation.applyCumflationEffects(pcActor);
      // A load in the pussy rolls the Brood Roll (DH branch of attemptImpregnation).
      if (hole === "vaginal" && window.AFLP_Pregnancy?.attemptImpregnation) {
        const cockTypes = srcActor.getFlag(SCOPE, "genitalTypes") ?? {};
        await window.AFLP_Pregnancy.attemptImpregnation(pcActor, srcActor, cockTypes, false);
      }
      // Slick/Milking pussy trains the cummer to cum harder (one-time Coomer).
      if (hole === "vaginal") await AFLP.pussyTrainCoomer?.(srcActor, pcActor);
    } catch (e) { console.warn("AFLP | DH cum deposit failed", e); }
  }

  // Roll a Duality resist and classify into the five rungs. `adv` adds (or, if
  // negative, subtracts) advantage d6s to the total - used by Struggle Escape
  // when a prior success-with-Hope resist banked advantage.
  async function _dualityResist(actor, dc, adv = 0, flatMod = 0) {
    let formula = "1d12 + 1d12";
    if (adv > 0) formula += ` + ${adv}d6`;
    else if (adv < 0) formula += ` - ${Math.abs(adv)}d6`;
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

  const AFLP_Carnal = {
    // The three approaches. `actor` is the PC; `opts.dc` the source Difficulty.
    // A critical resist now breaks free outright; a success-with-Hope banks
    // advantage on the next Struggle Escape (see struggleEscape).
    async resolve(actor, opts = {}) {
      if (!isDH()) return null;
      const approach = opts.approach ?? "roll";
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
      const lines = res.climaxed
        ? [`gives in and climaxes. Arousal resets; the climax resolves as normal.`]
        : [`gives in to the Carnal action - it lands. Both <strong>${_aro(opts.arousal ?? 1)}</strong>, now <strong>${res.arousal}/${res.max}</strong>; no Stress spent.`];
      await _card(actor, "gives in", lines);
      return { approach: "give-in", ...res };
    },

    // A Carnal Action against a PC already caught (Submitting) in a scene with the
    // presser auto-lands - no Resist. Arousal advances on both, exactly as if the
    // press had landed; the PC's recourse is a Carnal Escape on their own turn.
    // The INITIAL press (target not yet caught) still calls for a Carnal Resist.
    async autoLand(actor, opts = {}) {
      const res = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
      const lines = res.climaxed
        ? [`is already caught, so the Carnal action lands as a <strong>Carnal Press</strong> - and tips them over. Arousal resets; the climax resolves as normal.`]
        : [`is already caught, so the Carnal action lands as a <strong>Carnal Press</strong> - no Resist. Both <strong>${_aro(opts.arousal ?? 1)}</strong>, now <strong>${res.arousal}/${res.max}</strong>. (They break free with a Carnal Escape on their turn.)`];
      await _card(actor, "takes a Carnal Press", lines);
      return { approach: "auto", ...res };
    },

    // APPROACH 2: mark Stress to power through. Cost = 1 + Defeat tokens. No roll,
    // no Arousal. Overflows to HP; last HP -> Mind Break.
    async markStressApproach(actor, opts = {}) {
      const cost = 1 + _defeat(actor);
      const res = await _markStress(actor, cost);
      const lines = [`grits through the Carnal action, marking <strong>${cost}</strong> Stress` +
        (cost > 1 ? ` (1 + ${_defeat(actor)} Defeat).` : `.`)];
      if (res.lastHp) lines.push(`That was their last Hit Point - they make their only available death move: <strong>Mind Break</strong>.`);
      else if (res.hp != null && res.stress != null) lines.push(`Stress overflowed into HP (HP now affected).`);
      await _card(actor, "marks Stress to resist", lines);
      if (res.lastHp) await this._mindBreak(actor);
      return { approach: "stress", cost, ...res };
    },

    // APPROACH 3: roll the Duality resist. Five rungs -> consequences.
    async rollApproach(actor, opts = {}) {
      const dc = opts.dc ?? 15;
      const hasDefeat = _defeat(actor) > 0;
      // Auto-applied resist dice. Bimbofied contributes one disadvantage die per
      // token (additive); cumflation contributes one per hole at its limit (1-3);
      // Purity grants one advantage die. Defeat does NOT add dice (it raises the
      // power-through cost).
      const cfDice   = _cumflationDice(actor);
      const disDice  = _bimbo(actor) + cfDice;
      const advDice  = _purity(actor);
      // Carnal Resist trait: if the adversary's Carnal Action NAMES a trait, the
      // GM is pressing a specific weakness - roll that (best of the named pair).
      // If the action names no trait, the player resists with a trait of their
      // own choice (opts.trait) and narrates how. A silent Presence/Instinct
      // fallback only covers the edge of no named trait and no choice.
      const chosen   = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : null;
      const bt       = (opts.traits && opts.traits.length) ? _bestTraitMod(actor, opts.traits)
                      : (chosen ? { trait: chosen, mod: _traitMod(actor, chosen) }
                                : _bestTraitMod(actor, ["presence", "instinct"]));
      const res = await _dualityResist(actor, dc, advDice - disDice, bt.mod);
      // Reaction roll: read Duality for the result, but generate no Hope/Fear,
      // trigger no GM move, and do not move the spotlight.

      const lines = [];
      let escape = false, arousal = null, stressed = null;

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
        lines.push(`Succeeded, with Fear - they hold the line; the action does not land (the GM banks the Fear).`);
      } else if (res.rung === "fail-hope") {
        if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
        const ar = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
        arousal = ar.arousal;
        lines.push(`Failed, with Hope - the Carnal action lands. Both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar.climaxed ? " - they climax (resolves as normal)" : `, now ${ar.arousal}`}.`);
      } else { // fail-fear
        if (opts.sourceTokenId) await _startHScene(actor, opts.sourceTokenId, opts.sourceName, { deposit: !!opts.hsa });
        const ar = await _carnalArousal(actor, opts.sourceTokenId, opts.arousal ?? 1);
        const sres = await _markStress(actor, 1);
        arousal = ar.arousal; stressed = sres;
        lines.push(`Failed, with Fear - the action lands hard. Both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar.climaxed ? " - they climax (resolves as normal)" : ` (now ${ar.arousal})`}, and they mark a Stress.`);
        if (sres.lastHp) lines.push(`That marked their last Hit Point: <strong>Mind Break</strong>.`);
        if (_purity(actor)) {
          const pg = await _markDefeat(actor, 1);
          if (pg.overflow > 0) lines.push(`Their Purity shatters - already at <strong>Defeat 3/3</strong>, it overflows into <strong>+${pg.stressMarked} Stress</strong>${pg.brokeMind ? " and <strong>Mind Break</strong>" : ""}.`);
          else lines.push(`Their Purity cracks under the fear - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
        }
      }

      const netDice = advDice - disDice;
      if (netDice !== 0) {
        const srcs = [];
        if (advDice > 0)       srcs.push(`+${advDice} from Purity`);
        if (_bimbo(actor) > 0) srcs.push(`-${_bimbo(actor)} from Bimbofied`);
        if (cfDice)            srcs.push(`-${cfDice} from cumflation (${cfDice} hole${cfDice > 1 ? "s" : ""} at the limit)`);
        const dir = netDice > 0 ? "advantage" : "disadvantage";
        lines.push(`<em style="font-size:11px;color:#a05050;">(Rolled at ${dir} - net ${netDice > 0 ? "+" : ""}${netDice} d6: ${srcs.join(", ")}.)</em>`);
      }

      const tag = res.isCrit ? "critical" : (res.withHope ? "with Hope" : "with Fear");
      const traitNote = bt.trait
        ? ` <span style="font-size:11px;opacity:0.8;">(${_cap(bt.trait)} ${bt.mod >= 0 ? "+" : ""}${bt.mod})</span>`
        : "";
      await _card(actor, `Carnal Resist (DC ${dc})`,
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
      return { approach: "roll", ...res, escape, arousal, stressed };
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
      if (!isDH()) return null;
      const dc = opts.dc ?? 15;
      const trait = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : null;
      const tMod = trait ? _traitMod(actor, trait) : 0;
      let hadAdv = false;
      try { hadAdv = !!actor.getFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* none */ }
      if (hadAdv) { try { await actor.unsetFlag?.(SCOPE(), "struggleAdvantage"); } catch (e) { /* non-fatal */ } }
      const res = await _dualityResist(actor, dc, (hadAdv ? 1 : 0) + _purity(actor), tMod);
      await _markHopeOrFear(actor, res.withHope);

      const lines = [];
      let escaped = false, arousal = null;
      if (res.rung === "crit") {
        escaped = true;
        await AFLP.system?.setArousalCurrent?.(actor, 0, _arousalMax(actor));
        arousal = 0;
        lines.push(`Critical Carnal Escape - they tear free and the heat drains away completely. <strong>${_aroReset()}</strong>. They gain a Hope and clear a Stress.`);
      } else if (res.rung === "success-hope") {
        escaped = true;
        arousal = await _coolArousal(actor, 2);
        lines.push(`They break free with Hope - and the wrench of it wrings them out. They <strong>${_aro(-2)}</strong>, now <strong>${arousal}</strong>.`);
      } else if (res.rung === "success-fear") {
        escaped = true;
        const ar = await _markArousal(actor, 2); arousal = ar.arousal;
        lines.push(`They wrench free, but the GM gains a Fear and the friction works them up` +
          (ar.climaxed ? ` - and tips them into a climax (Defeat token).` : ` to <strong>${ar.arousal}</strong>.`));
      } else if (res.rung === "fail-hope") {
        const ar = await _markArousal(actor, 2); arousal = ar.arousal;
        lines.push(`They stay caught and gain a Hope, but writhing only stokes them` +
          (ar.climaxed ? ` into a climax (Defeat token).` : ` - Arousal climbs to <strong>${ar.arousal}</strong>.`));
      } else { // fail-fear
        const ar = await _markArousal(actor, 4); arousal = ar.arousal;
        lines.push(`They stay caught, the GM gains a Fear, and struggling only makes it worse` +
          (ar.climaxed ? ` - they climax (Defeat token).` : ` - Arousal spikes to <strong>${ar.arousal}</strong>.`));
        if (_purity(actor)) {
          const pg = await _markDefeat(actor, 1);
          if (pg.overflow > 0) lines.push(`Their Purity shatters - already at <strong>Defeat 3/3</strong>, it overflows into <strong>+${pg.stressMarked} Stress</strong>${pg.brokeMind ? " and <strong>Mind Break</strong>" : ""}.`);
          else lines.push(`Their Purity cracks under the fear - they mark a <strong>Defeat</strong> token (now ${pg.defeat}/3).`);
        }
      }

      const tag = res.isCrit ? "critical, with Hope" : (res.withHope ? "with Hope" : "with Fear");
      await _card(actor, `attempts Carnal Escape (${trait ? _cap(trait) + ", " : ""}DC ${dc}${hadAdv ? ", advantage" : ""})`,
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
    async actorPress(bullActor, opts = {}) {
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

      const res = await _dualityResist(bullActor, dc, adv, tMod);
      await _markHopeOrFear(bullActor, res.withHope);

      const advNote = adv > 0
        ? `<em style="font-size:11px;color:#806040;">(Rolled with ${adv} Bullified advantage die${adv > 1 ? "s" : ""}.)</em>`
        : "";
      const lines = [];

      if (res.success) {
        if (bullTokenId) await _startHScene(targetActor, bullTokenId, bullActor.name, { deposit: !!opts.deposit });
        const tgtGain = await _carnalArousal(targetActor, bullTokenId, opts.arousal ?? 1);
        if (res.rung === "crit") {
          lines.push(`Critical - <strong>${bullActor.name}</strong> overpowers <strong>${targetActor.name}</strong> outright, tops them and gains a Hope. They are Submitting now. Both <strong>${_aro(opts.arousal ?? 1)}</strong>.`);
        } else {
          lines.push(`<strong>${bullActor.name}</strong> tops <strong>${targetActor.name}</strong>` +
            (res.withHope ? ` and holds a Hope` : ` (the GM gains a Fear)`) +
            ` - they are pulled in Submitting, both <strong>${_aro(opts.arousal ?? 1)}</strong>${tgtGain.climaxed ? " (they climax)" : `, now ${tgtGain.arousal}`}.`);
        }
      } else {
        lines.push(`<strong>${bullActor.name}</strong>'s Carnal action falls short of <strong>${targetActor.name}</strong>` +
          (res.withHope ? ` - but they keep a Hope.` : ` - and the GM gains a Fear.`) +
          ` No hold is established.`);
      }
      if (advNote) lines.push(advNote);

      const tag = res.isCrit ? "critical" : (res.withHope ? "with Hope" : "with Fear");
      await _card(bullActor, `presses a Carnal Action on ${targetActor.name} (${trait ? _cap(trait) + " " : ""}action roll vs ${def.label} ${dc})`,
        [`Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.`, ...lines]);
      return { approach: "actor-press", ...res };
    },

    // Public: at Defeat 3, a further Defeat overflows into 3 Stress (per token),
    // which follows the DH cascade toward Mind Break. The climax handler calls
    // this so a trapped, repeatedly pressed creature breaks instead of plateauing
    // at Defeat 3. Returns { stressMarked, brokeMind, ... }.
    async defeatOverflow(actor, n = 1) { return _defeatOverflow(actor, n); },

    async _mindBreak(actor) {
      await AFLP.system?.applyCondition?.(actor, "mind-break", null, 1);
      const uuid = AFLP.system?.contentUuid?.("mind-break");
      const link = uuid ? `@UUID[${uuid}]{Mind Break}` : "Mind Break";
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
        `Their mind gives out under the pleasure and they stop fighting - pliant and eager, wanting the next climax more than escape. ${link} as Avoid Death: ${tail}`,
      ]);
    },

    // Ally intervention: a rescuer steps in to free a target pinned by a Carnal
    // predicament. The campaign frame governs the outcome:
    //   - default:  clean rescue. The target's Carnal pressure eases (Arousal
    //               cools, and one Defeat token clears if opts.clearDefeat) and
    //               the rescuer takes no risk.
    //   - lustHaze: "rescue contagion". The rescuer must resist being pulled in -
    //               a Presence OR Instinct Duality roll vs the source Difficulty.
    //               On success they free the target and stay clean. On failure the
    //               target is still eased a little, but the rescuer is pulled in:
    //               their Arousal climbs and they take a Defeat token, becoming a
    //               target themselves. A crit additionally clears a target Defeat;
    //               a fail-with-fear gives the GM a Fear.
    // opts: { dc, sourceName, clearDefeat, coolBy }. Returns a result object.
    async allyIntervene(rescuer, target, opts = {}) {
      if (!isDH()) return null;
      if (!rescuer || !target) return null;
      const dc = opts.dc ?? 15;
      const lustHaze = _isLustHaze();
      const trait = _DH_TRAITS.includes(String(opts.trait || "").toLowerCase()) ? String(opts.trait).toLowerCase() : "presence";
      const tMod = _traitMod(rescuer, trait);
      const domAdv = AFLP.actorHasKink?.(rescuer, "dominant") ? 1 : 0;

      // Carnal Rescue is a trait roll vs the adversary's Difficulty, resolving like
      // Struggle Escape but to free the ALLY. Any trait works (player narrates the
      // fiction) - that free choice is the edge over Struggle Escape's Str/Agility.
      const res = await _dualityResist(rescuer, dc, domAdv, tMod);
      await _markHopeOrFear(rescuer, res.withHope);
      const tag = res.isCrit ? "critical, with Hope" : (res.withHope ? "with Hope" : "with Fear");
      const lines = [`${_cap(trait)} Carnal Rescue (DC ${dc}${domAdv ? ", advantage" : ""}${tMod ? `, ${tMod > 0 ? "+" : ""}${tMod}` : ""}) - Duality: Hope <strong>${res.hopeDie}</strong> / Fear <strong>${res.fearDie}</strong> - <strong>${tag}</strong>.`];

      let rescued = false, rescuerPulledIn = false, targetArousal = null, rescuerArousal = null, rescuerStress = false;

      if (res.rung === "crit") {
        rescued = true;
        await AFLP.system?.setArousalCurrent?.(target, 0, _arousalMax(target)); targetArousal = 0;
        const d = _defeat(target);
        if (d > 0) await AFLP.system?.setConditionValue?.(target, "defeat", Math.max(0, d - 1));
        try { const rs = rescuer.system?.resources?.stress; if (rs && (rs.value ?? 0) > 0) await rescuer.update({ "system.resources.stress.value": Math.max(0, (rs.value ?? 0) - 1) }); } catch (e) {}
        lines.push(`Critical Carnal Rescue - <strong>${rescuer.name}</strong> tears <strong>${target.name}</strong> loose clean. ${target.name}'s <strong>${_aroReset()}</strong>${d > 0 ? ` and a Defeat token clears (now ${Math.max(0, d - 1)}/3)` : ""}. ${rescuer.name} gains a Hope and clears a Stress.`);
      } else if (res.rung === "success-hope") {
        rescued = true;
        targetArousal = await _coolArousal(target, 2);
        lines.push(`<strong>${rescuer.name}</strong> pulls <strong>${target.name}</strong> free with Hope - the wrench of it wrings them out. They <strong>${_aro(-2)}</strong>, now <strong>${targetArousal}</strong>.`);
      } else if (res.rung === "success-fear") {
        rescued = true;
        const ar = await _markArousal(target, 2); targetArousal = ar.arousal;
        lines.push(`<strong>${rescuer.name}</strong> drags <strong>${target.name}</strong> out, but the GM gains a Fear and the rough pull works ${target.name} up` +
          (ar.climaxed ? ` - tipping them into a climax (Defeat token).` : ` to <strong>${ar.arousal}</strong>.`));
      } else if (res.rung === "fail-hope") {
        lines.push(`The rescue slips - <strong>${target.name}</strong> stays caught, but <strong>${rescuer.name}</strong> finds an opening and gains a Hope. They can try again.`);
      } else { // fail-fear
        if (!lustHaze) {
          await _markStress(rescuer, 1); rescuerStress = true;
          lines.push(`The rescue fails, the GM gains a Fear, and the effort costs <strong>${rescuer.name}</strong> - mark a <strong>Stress</strong>. <strong>${target.name}</strong> stays caught.`);
        } else {
          rescuerPulledIn = true;
          const puller = _rescuePuller(rescuer, opts.sourceTokenId, opts.sourceName);
          if (puller?.tokenId) {
            await _startHScene(rescuer, puller.tokenId, puller.name, {});
            const ar = await _carnalArousal(rescuer, puller.tokenId, 1);
            rescuerArousal = ar?.arousal ?? null;
            lines.push(`The pull takes <strong>${rescuer.name}</strong> instead: ${puller.same ? `<strong>${puller.name}</strong> hauls them into the same scene` : `<strong>${puller.name}</strong> seizes the opening and drags them into a scene of its own`}. They are <strong>Submitting</strong> now, both <strong>${_aro(opts.arousal ?? 1)}</strong>${ar?.climaxed ? " (they climax)" : (rescuerArousal != null ? `, now ${rescuerArousal}` : "")}. <strong>${target.name}</strong> stays caught and the GM gains a Fear.`);
          } else {
            await _markStress(rescuer, 1); rescuerStress = true;
            lines.push(`The rescue fails and the GM gains a Fear; with no adversary free to seize them, <strong>${rescuer.name}</strong> just takes a <strong>Stress</strong>. <strong>${target.name}</strong> stays caught.`);
          }
        }
      }

      // A freed ally leaves the H-Scene (mirrors Struggle Escape's own exit).
      if (rescued) {
        try { const loc = _sceneSlotFor(target); if (loc) await AFLP.HScene?.removeParticipant?.(loc.sceneId, loc.tokenId); }
        catch (e) { console.warn("AFLP | Carnal Rescue: ally scene exit failed", e); }
      }

      await _card(rescuer, `Carnal Rescue for ${target.name}${lustHaze ? " (Lust Haze)" : ""}`, lines);
      return { frame: lustHaze ? "lustHaze" : "default", rescued, rescuerPulledIn, targetArousal, rescuerArousal, rescuerStress, rung: res.rung, trait };
    },

    // Prompt the actor's player to pick a trait for a Carnal Resist or Carnal
    // Rescue (any trait; the fiction is theirs to narrate). Returns the trait key
    // or null if the dialog is dismissed.
    async promptCarnalTrait(actor, kind = "rescue") {
      if (!actor) return null;
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
      const stk = opts.sourceTokenId ?? "";
      const hsa = opts.hsa ? "1" : "";
      const content = `<div class="aflp-chat-card aflp-carnal-prompt" data-actor-id="${aid}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}">
        <p>${src} presses on <strong>${actor.name}</strong> (Difficulty ${dc}).</p>
        <p style="font-size:12px;">Arousal ${st.arousal}/${st.arousalMax} - choose how to meet it:</p>${_isLustHaze() ? `<p style="font-size:10px;color:#a05050;opacity:0.85;">Lust Haze: the way out is to free yourself.</p>` : ""}
        <div class="aflp-carnal-approaches" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
          <button type="button" class="aflp-carnal-approach" data-approach="roll" data-actor-id="${aid}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}">Carnal Resist (choose trait)</button>
          <button type="button" class="aflp-carnal-approach" data-approach="stress" data-actor-id="${aid}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}">Mark ${stressCost} Stress</button>
          <button type="button" class="aflp-carnal-approach" data-approach="give-in" data-actor-id="${aid}" data-dc="${dc}" data-source-token="${stk}" data-hsa="${hsa}">Give in</button>
        </div>${defNote}
        <div class="aflp-carnal-escape" style="margin-top:6px;border-top:1px solid rgba(80,80,160,0.25);padding-top:5px;">
          <button type="button" class="aflp-carnal-struggle" data-actor-id="${aid}" data-dc="${dc}" title="On your turn: a single action to break free">Carnal Escape (your action)</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">A single action on your turn: any success frees you; a crit wrings you out, a failure stokes your Arousal.</span>
        </div>${stk ? `
        <div class="aflp-carnal-hsa" style="margin-top:6px;border-top:1px solid rgba(120,40,120,0.3);padding-top:5px;">
          <button type="button" class="aflp-carnal-hsa-btn" data-actor-id="${aid}" data-source-token="${stk}" title="GM: the adversary presses again with its H-Scene Action">${src} uses its H-Scene Action</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">GM control: re-presses with the adversary's H-Scene Action to continue the scene.</span>
        </div>` : ""}
        <div class="aflp-carnal-rescue" style="margin-top:6px;border-top:1px solid rgba(160,80,80,0.25);padding-top:5px;">
          <button type="button" class="aflp-carnal-intervene" data-actor-id="${aid}" data-dc="${dc}" title="Select your character's token first, then click to step in">Intervene (selected token steps in)</button>
          <span style="font-size:10px;opacity:0.7;display:block;margin-top:2px;">${_isLustHaze() ? "Lust Haze: the rescuer rolls or risks being pulled in." : "An ally pulls them free, no risk in this frame."}</span>
        </div></div>`;
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
    },

    // Fire an adversary's designated H-Scene Action against a pinned PC: read the
    // adversary's hSceneAction-flagged feature (its main fuck ability), then
    // re-post the Carnal prompt at the adversary's Difficulty. This is the GM's
    // one-click "the adversary presses again" that drives the H-Scene loop.
    async useHSceneAction(sourceTokenId, pcActor) {
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
      return this.postPrompt(pcActor, { dc, sourceName: srcName, sourceTokenId, hsa: true });
    },

    // Bind the approach buttons on a rendered chat card. Idempotent per element.
    _bindCard(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll(".aflp-carnal-approach").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const aid = btn.dataset.actorId;
          const approach = btn.dataset.approach;
          const dc = Number(btn.dataset.dc) || 15;
          const actor = game.actors?.get(aid);
          if (!actor) { ui.notifications?.warn("AFLR | Target actor not found."); return; }
          // Only the actor's owner (or GM) may act through the card.
          if (!actor.isOwner && !game.user?.isGM) { ui.notifications?.warn("AFLR | You don't own that character."); return; }
          let trait = null;
          if (approach === "roll") { trait = await AFLP.Carnal.promptCarnalTrait(actor, "resist"); if (!trait) return; }
          // Disable the approaches once chosen, to mark the beat as resolved.
          const wrap = btn.closest(".aflp-carnal-prompt");
          wrap?.querySelectorAll(".aflp-carnal-approach").forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
          const sourceTokenId = btn.dataset.sourceToken || undefined;
          const hsa = btn.dataset.hsa === "1";
          await AFLP.Carnal.resolve(actor, { approach, dc, trait, escapeOffered: true, sourceTokenId, hsa });
        });
      });

      // Struggle Escape button: the card's actor takes the single action.
      root.querySelectorAll(".aflp-carnal-struggle").forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const dc = Number(btn.dataset.dc) || 15;
          const actor = game.actors?.get(btn.dataset.actorId);
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
          const pc = game.actors?.get(btn.dataset.actorId);
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
          const target = game.actors?.get(btn.dataset.actorId);
          if (!target) { ui.notifications?.warn("AFLR | Target actor not found."); return; }
          // rescuer = the controlled/selected token's actor
          const tok = canvas.tokens?.controlled?.[0];
          const rescuer = tok?.actor ?? null;
          if (!rescuer) { ui.notifications?.warn("AFLR | Select your character's token first, then click Intervene."); return; }
          if (rescuer.id === target.id) { ui.notifications?.warn("AFLR | The rescuer and the target are the same character."); return; }
          if (!rescuer.isOwner && !game.user?.isGM) { ui.notifications?.warn("AFLR | You don't own the selected character."); return; }
          const trait = await AFLP.Carnal.promptRescueTrait(rescuer);
          if (!trait) return;
          const stk = btn.closest(".aflp-carnal-prompt")?.dataset?.sourceToken || "";
          await AFLP.Carnal.allyIntervene(rescuer, target, { dc, trait, sourceTokenId: stk, escapeOffered: true });
        });
      });
    },
  };

  window.AFLP = window.AFLP || {};
  AFLP.Carnal = AFLP_Carnal;

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
      li.dataset.tooltip = "Give fully in to the lust and let your mind break - a surrender, not a death. You sink into the scene, undone.";
      li.innerHTML =
        '<div class="label" data-tooltip-direction="LEFT">' +
        '<i class="fa-solid fa-heart-crack fa-xl"></i>' +
        '<span class="label">Mind Break</span></div><input type="radio">';
      li.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Mind Break" },
          content: `<p>Let ${actor.name}'s mind break and give fully in to the lust? This is a surrender, not a death.</p>`
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
