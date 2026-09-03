// ===============================
// AFLP – Cum Macro (World Actor Version)
// ===============================
(async () => {
  if (!window.AFLP || !window.AFLP_PROSE) {
    ui.notifications.error("AFLR schema or prose not loaded!");
    return;
  }

  const FLAG            = AFLP.FLAG_SCOPE;
  // EVERY DOCUMENT WRITE IN THIS FILE GOES THROUGH AFLP.gm, and that is not
  // decoration. This macro runs on whichever client owns the CUMMER - a player's
  // own PC - and then writes to the PARTNER, which is routinely a monster that
  // player does not own. Foundry answers "User <name> lacks permission to update
  // Actor <id>", and because line ~1490 is ONE batched update carrying the whole
  // event, the macro died there with cumflation, hero points and vials already
  // applied. Reported by players repeatedly as "you must be the GM to affect
  // others"; the file had ZERO AFLP.gm calls in it until 19 Aug 2026.
  //
  // AFLP.gm.run already asks canWrite itself and runs locally when allowed, so
  // these are unconditional by design - there is no `if (canWrite)` to forget.
  // The dialogs stay on the player's client; only the writes cross the wire.
  // WHAT MAKES THIS STALE: a new raw `actor.update(...)` / `.setFlag(...)` added
  // below. The harness lints this file for exactly that.

  // Loads are a real economy, but cumPerShot() is the SIZE of a full shot, not
  // what is left in the pool. Every site used it raw and only clamped the
  // SUBTRACTION, so an actor at 0 loads still flooded the target with a full
  // shot: cumflation, ground pool, token coat, hundreds of ml in the chat card.
  // Clamp the volume itself. Infinite-loads gear and the infiniteCum setting for
  // NPCs still fire at full size.
  const _shotFor = (actor) => {
    if (!actor) return { units: 0, dry: true };
    const shot  = Number(AFLP.cumPerShot?.(actor)) || 0;
    const isNPC = AFLP.system?.isNPC?.(actor) ?? (actor.type === "npc");
    if ((isNPC && AFLP.Settings.infiniteCum) || AFLP.hasInfiniteLoads?.(actor)) {
      return { units: shot, dry: shot <= 0, unlimited: true };
    }
    // Ass (Cumfinity): climaxing from something in your own ass still fires a full
    // Cum Shot, but the Load is not deducted. `unlimited` is the existing flag for
    // "shoot without paying", so this rides it - the difference is that it is
    // CONDITIONAL on where the stimulation is, not a property of the creature.
    if (AFLP.cumfinityAnal?.(actor)) {
      const af = actor.getFlag?.(FLAG, "anatomyFeatures") ?? {};
      if (af["ass-cumfinity"] === true) return { units: shot, dry: shot <= 0, unlimited: true };
    }
    const left  = Math.max(0, Number(actor.getFlag(FLAG, "cum")?.current) || 0);
    const units = Math.min(shot, left);
    return { units, dry: units <= 0, unlimited: false };
  };

  // Drained dry: the orgasm happens, nothing comes out. No cumflation, no pool,
  // no coat, no ml. Posted once per actor per event.
  // Narration belongs in the H-Scene log; chat is the fallback for when there is
  // no scene to write to. Kink triggers and other RULES notices stay in chat -
  // they are mechanics, not story. `plain` is the log line, `html` the chat card.
  const _narrate = async (plain, html, receiver = null) => {
    let scene = null;
    try {
      // Match ANY participant's scene, not just the receiver's. A performer who
      // climaxes (Amelia finishing while Leroy is the receiver) is in the scene
      // but is not its targetActorId, so a target-only lookup missed and the line
      // fell through to chat - while the hole prose still went to the scene log.
      // sceneForActor scans participants, which is the correct question.
      if (receiver) scene = AFLP.HScene?.sceneForActor?.(receiver.id) ?? null;
    } catch (e) { /* no scene */ }
    if (game.user.isGM && scene) AFLP.HScene.addProse(scene.id, plain, "flavor");
    else await ChatMessage.create({ content: html, speaker: { alias: "AFLR" } });
  };

  // Cum Shot UNITS are the canonical stat. ml is a presentation of units through
  // CUM_UNIT_ML, which is 250 on Fantasy and 4 on Realistic - a 62.5x swing. Any ml
  // written to a save is frozen at whatever setting was live that day, so switching
  // modes silently rewrites history. Store units; derive ml when displaying.
  const _bumpUnits = (sexual, bucket, hole, units) => {
    sexual.lifetime = sexual.lifetime ?? {};
    sexual.lifetime[bucket] = sexual.lifetime[bucket] ?? {};
    sexual.lifetime[bucket][hole] = (sexual.lifetime[bucket][hole] ?? 0) + units;
  };

  const _dryPosted = new Set();
  // The dry line belongs with the rest of the scene's narration. Post it to the
  // H-Scene log when the receiver is in a scene, and fall back to chat only when
  // there is no scene to write to - the same rule the hole prose follows.
  const _postDry = async (actor, receiver = null) => {
    if (!actor || _dryPosted.has(actor.id)) return;
    _dryPosted.add(actor.id);
    const part = actor.getFlag(FLAG, "cock") === true ? "cock" : "pussy";
    await _narrate(
      `${actor.name}'s ${part} twitches and pulses through the orgasm, but only a few thin drips leak out. They have been drained dry - rest to refill.`,
      `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s ${part} twitches and pulses through the orgasm, but only a few thin drips leak out. <em>They have been drained dry - rest to refill.</em></p></div>`,
      receiver ?? actor);
  };
  const HOLE_MESSAGES   = AFLP_PROSE.holes;
  const GANGBANG_MESSAGES = AFLP_PROSE.gangbangs;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // Source tokens: prefer the ids handed over by _onArousalMax (auto-cum flow)
  // so we never need to change the GM's on-screen selection. Fall back to the
  // controlled tokens for a manual macro run.
  const _autoSrcIds = Array.isArray(window._aflpCumSourceTokenIds) ? window._aflpCumSourceTokenIds : null;
  let sourceTokens = (_autoSrcIds && _autoSrcIds.length)
    ? _autoSrcIds.map(id => canvas.tokens.get(id)).filter(Boolean)
    : canvas.tokens.controlled;
  window._aflpCumSourceTokenIds = null; // consume
  if (!sourceTokens.length) return ui.notifications.warn("Select at least one source token.");

  // Target token: prefer the authoritative target id set by _onArousalMax;
  // otherwise require exactly one manually-targeted token.
  const _intendedTargetId = window._aflpCumTargetTokenId ?? null;
  const manualTargets = Array.from(game.user.targets);
  let resolvedTargetToken;
  if (_intendedTargetId) {
    resolvedTargetToken = canvas.tokens.get(_intendedTargetId) ?? manualTargets[0];
  } else if (manualTargets.length === 1) {
    resolvedTargetToken = manualTargets[0];
  } else if (manualTargets.length === 0) {
    // ── Solo cum (masturbation) ───────────────────────────────────────────
    // No target selected: the source(s) cum on their own to relieve Cum Volume.
    // No partner means no cumflation and no Afterglow (Afterglow comes only from
    // partnered sex - gated in _onArousalMax). Mirrors the ground special-hole
    // consume path: spend cum, log the lifetime stat, post a flavor line.
    window._aflpCumTargetTokenId = null; // consume
    let _soloDid = false;
    for (const stok of sourceTokens) {
      const sActor = stok.actor?.getWorldActor?.() ?? stok.actor;
      if (!sActor) continue;
      const sHasCock = sActor.getFlag(FLAG, "cock") === true;
      const cum   = sActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
      const isNPC = AFLP.system?.isNPC?.(sActor) ?? (sActor.type === "npc");
      const _soloShot = _shotFor(sActor);
      if (sHasCock && _soloShot.dry) { await _postDry(sActor); _soloDid = true; continue; }
      if (sHasCock && cum.current > 0) {
        const spent = _soloShot.units;   // clamped to what is actually left
        if (spent > 0 && !_soloShot.unlimited) {
          await AFLP.gm.run("setFlag", sActor, "cum", { current: Math.max(0, cum.current - spent), max: cum.max });
        }
        // THROUGH THE ONE DOOR. This read the whole `sexual` flag, bumped one field
        // and wrote the whole object back - which erases anything another writer
        // added to that flag in between. MEASURED 23 Aug 2026: a chained
        // `bumpLifetime` running concurrently with exactly this shape ended at
        // `chained: 0, batched: 1` - the bump was not merely lost, it was
        // overwritten. Serialised, both land.
        //
        // `bumpLifetime` serialises per actor on the GM's client and re-reads inside
        // its own chain, so routing this single-field bump through it costs nothing
        // and removes one unchained writer.
        //
        // THE OTHER THREE SITES IN THIS FILE ARE NOT FIXED BY THIS and are the
        // subject of `claude/sexual-flag-serialisation-2026-08-23.md`: they batch
        // several fields into one write on purpose, and a closure cannot cross the
        // socket, so they need a delta op rather than a per-key call.
        try {
          await AFLP.bumpLifetime(sActor, "cumGiven", spent);
        } catch (e) { /* read-only on some systems */ }
        await _narrate(
          `${sActor.name} gets themselves off, spilling their load and easing the pressure.`,
          // RETIRED VOCABULARY. This said "(Cum Volume relieved, no afterglow.)".
          // Cum Volume and Coomer were retired in 1.0.12 and the model is Cum
          // Shot x Loads; the changelog says so and the guide says so, and this
          // line was still saying the old word to every player who cums with no
          // target. Found live in dh-test, 17 Aug 2026, by reading the chat card
          // a verification run produced rather than by a grep - the term survives
          // in comments and settings hints too, which is why a name sweep that
          // only checks item names misses it.
          `<div class="aflp-chat-card"><p><strong>${sActor.name}</strong> gets themselves off, spilling their load and easing the pressure. <em>(A Load spent, no afterglow.)</em></p></div>`,
          sActor);
      } else {
        await _narrate(
          `${sActor.name} brings themselves to a quiet, shuddering finish.`,
          `<div class="aflp-chat-card"><p><strong>${sActor.name}</strong> brings themselves to a quiet, shuddering finish.</p></div>`,
          sActor);
      }
      _soloDid = true;
      // Climax relieves arousal: manual/solo cum resets the source to 0. (The
      // auto-cum-at-max flow resets in _onArousalMax; this covers the manual
      // and self-action paths that never reach that reset.)
      try { await AFLP_Arousal?.reset?.(sActor, "Cum (solo)", stok.id); } catch (_) {}
    }
    if (!_soloDid) ui.notifications.warn("Select a source token to cum solo.");
    return;
  } else {
    return ui.notifications.warn("Target exactly one token, or untarget to cum solo.");
  }
  if (!resolvedTargetToken) return ui.notifications.warn("Target exactly one token.");
  window._aflpCumTargetTokenId = null; // consume

  const targetActor = resolvedTargetToken.actor?.getWorldActor?.() ?? resolvedTargetToken.actor;
  await AFLP.ensureCoreFlags(targetActor);
  const hasPussy = targetActor.getFlag(FLAG, "pussy") === true;
  const targetHasCock = targetActor.getFlag(FLAG, "cock") === true;

  // ── Ouroboros self-cum gate ─────────────────────────────────────────────
  // A source cumming into ITS OWN body (target actor is the same actor) is
  // self-cum. Ouroboros unlocks it in beats: Greater = self-cumflation,
  // Mastery = self-impregnation (gated separately at the impregnation site).
  // Below the Greater beat (or without the kink) a self-cum is relief-only,
  // exactly like masturbation - the load is spent but nothing fills. Sources
  // that are OTHER actors are never affected. Filter ungated self-sources out
  // of the cumflating set here.
  const _ouroTier = (a) => AFLP.actorHasKink?.(a, "ouroboros") ? (AFLP.getKinkLevel?.(a, "ouroboros") ?? 0) : 0;
  const _ouroGreater = (a) => {
    const t = _ouroTier(a);
    // DH band floor 5 = Greater; PF2e feature level 3 = Greater.
    return game.system?.id === "daggerheart" ? t >= 5 : t >= 3;
  };
  {
    const _keep = [];
    let _blockedSelf = 0;
    for (const t of sourceTokens) {
      const sa = t.actor?.getWorldActor?.() ?? t.actor;
      const isSelf = sa && sa.id === targetActor.id;
      if (isSelf && !_ouroGreater(sa)) { _blockedSelf++; continue; }
      _keep.push(t);
    }
    if (_blockedSelf > 0) {
      if (_keep.length === 0) {
        await _narrate(
          `${targetActor.name} gets themselves off - the load is spent, but without the pull of Ouroboros nothing takes hold.`,
          `<div class="aflp-chat-card"><p><strong>${targetActor.name}</strong> gets themselves off - the load is spent, but without the pull of Ouroboros nothing takes hold. <em>(Relief only, no cumflation.)</em></p></div>`,
          targetActor);
        // Climax still relieves arousal even when nothing takes hold.
        try { await AFLP_Arousal?.reset?.(targetActor, "Cum (self)"); } catch (_) {}
        return;
      }
      sourceTokens = _keep;
    }
  }

  // ── Read stored positions from H-Scene (position tracking) ──────────────
  // Build a map of sourceToken.id → holeId for cock-having sources that have
  // a penile position assigned in the active scene.
  // If ALL cock-having sources have a penile position, skip the dialog entirely.
  const _storedPositions = new Map(); // token.id → holeId
  if (AFLP.Settings.positionTracking && AFLP.Settings.hsceneEnabled) {
    // Unified model: each SOURCE (cummer) carries its OWN position on its scene
    // participant - whether it projects as the legacy target or an attacker. So
    // read positions from the battlemap scene's participants by source token id,
    // not from the projected attackers list (which would miss a cummer that
    // happens to project as the scene target in a cross-pair).
    const sourceIds = new Set(sourceTokens.map(t => t.id));
    let hscene = null;
    for (const s of (AFLP.HScene._scenes?.values?.() ?? [])) {
      if ((s.participants ?? []).some(p => sourceIds.has(p.tokenId))) { hscene = s; break; }
    }
    if (hscene) {
      for (const t of sourceTokens) {
        const p = (hscene.participants ?? []).find(pp => pp.tokenId === t.id);
        const posEntry = p?.position ? AFLP.getPosition(p.position) : null;
        // Multi-hole positions (hemipenis, multipenis) store the POSITION id
        // marked "pos:" - the expansion below turns it into the per-hole list
        // against the actual bottom's anatomy. A receiverIsTop position (Cock
        // Ride, Clinging) is stored the same way so deposit routing can honor
        // the inversion.
        if (Array.isArray(posEntry?.holes) || posEntry?.receiverIsTop) {
          _storedPositions.set(t.id, "pos:" + posEntry.id);
        } else if (posEntry) {
          const hole = posEntry.hole ?? posEntry.holeId ?? null;
          // A POSITION THAT NAMES NO DESTINATION IS AN ANSWER, NOT A GAP. The
          // creature climaxed; the load exists and has to land. Ardis, 15 Aug:
          // "if they climax with no penetrative position it should still spend a
          // load - it just means that load goes onto the ground."
          //
          // Two shapes reach here and BOTH used to fall through to the manual
          // hole dialog, which is the wrong question - the GM already answered it
          // by picking a foreplay position:
          //   hole === null    groping, fingering, licking, teasing, pain play
          //   hole === "none"  assisting-hands, and any custom position built
          //                    with the manager's "None (Foreplay)" option
          //
          // "none" IS A TRUTHY STRING and that is the sharp edge. The old
          // `if (hole)` let it through as a real hole id, so a climax in
          // assisting-hands built `autoHoles["none"]` and the deposit loop tried
          // to cumflate a pool called "none" - a write to a key nothing reads,
          // which is a silent no-op wearing the costume of a deposit.
          //
          // "ground" is a destination the file already handles end to end: the
          // special-hole block spends the load, drops the drawn puddle through
          // AFLP_Splatter, and the AFLR Cum Cleaner can mop or bottle it.
          _storedPositions.set(t.id, (!hole || hole === "none") ? "ground" : hole);
        }
        // ── THE OTHER SIDE OF THE FICTION ──────────────────────────────────
        //
        // A source with NO position of its own is usually the BOTTOM. Only the
        // attacker gets a position picked for them today, so when the creature
        // being fucked climaxes it arrives here with nothing to read - and until
        // 16 Aug 2026 that meant the manual hole dialog, or on an unattended
        // adversary climax, nothing at all.
        //
        // Their partner's position IS the answer. It describes the fiction BOTH
        // creatures are in, and `bottomFills` is exactly the field that says
        // where the bottom's own load goes in it. Ardis authored all 86.
        //
        // NOTE THIS RUNS THROUGH THE ORDINARY FORWARD PATH. The climaxing
        // creature is always the SOURCE here - `_onArousalMax` hands the cummer
        // over as the source and their partner as the target - so a bottom's
        // climax is just a normal deposit pointed at the top. The dead
        // `bothHaveCocks` reverse block below is NOT involved and is not being
        // revived; it deducts one load and then deposits a full shot into every
        // selected hole, which is a bug waiting for a caller.
        //
        //   bottomFills   stored marker   what happens
        //   "oral"        "oral"          fills the TOP's mouth
        //   "coat-top"    "bodyCoat"      coats the TOP - a real pool key, see
        //                                 cumflation.js's receivingHoles list
        //   "coat-self"   "self-coat"     coats the BOTTOM themselves - handled
        //                                 beside ground/vial, because the normal
        //                                 path only ever deposits into the target
        //   "floor"       "ground"        the puddle
        //   null          (skipped)       a receiverIsTop position already
        //                                 answered this, and the block just above
        //                                 has copied it across. Reading it twice
        //                                 would deposit twice.
        else if (p?.partnerId) {
          const _pp = (hscene.participants ?? []).find(x => x.tokenId === p.partnerId);
          const _bf = _pp?.position ? AFLP.bottomFillsOf?.(_pp.position) : null;
          const _mark = _bf === "oral" ? "oral"
                      : _bf === "coat-top"  ? "bodyCoat"
                      : _bf === "coat-self" ? "self-coat"
                      : _bf === "floor"     ? "ground"
                      : null;
          if (_mark) _storedPositions.set(t.id, _mark);
        }
        // NO position on either side (never picked) → not set → the dialog
        // prompts, which is the right question when nobody has answered it.
        // Deliberately NOT defaulted to the floor: the picker is the single
        // source of truth, and an unset picker has no truth to read.
      }
    }
  }

  // Single-source both-have-cocks: target may cum into source too
  const sourceActor0 = sourceTokens[0]?.actor?.getWorldActor?.() ?? sourceTokens[0]?.actor;
  const sourceHasCock = sourceTokens.length === 1 && (sourceActor0?.getFlag(FLAG, "cock") === true);
  const bothHaveCocks = sourceHasCock && targetHasCock;

  const isMultiSource = sourceTokens.length > 1;
  const sourceCount   = sourceTokens.length;

  // -----------------------------------------------
  // Only show hole dialog if at least one source actor has a cock.
  // If no source has a cock, there is nothing to cumflate into the target.
  // Both-have-pussies case: skip straight to a simple chat message.
  // -----------------------------------------------
  const anySourceHasCock = sourceTokens.some(t => {
    const a = t.actor?.getWorldActor?.() ?? t.actor;
    return a?.getFlag(FLAG, "cock") === true;
  });

  if (!anySourceHasCock) {
    // No cock present — nothing to cumflate. Post a simple chat message and exit.
    const srcNames = sourceTokens.map(t => t.name).join(", ");
    await _narrate(
      `${srcNames} and ${targetActor.name} reach mutual satisfaction.`,
      `<strong>${srcNames}</strong> and <strong>${targetActor.name}</strong> reach mutual satisfaction.`,
      targetActor);
    return;
  }

  // ── Check if we can skip the dialog entirely ─────────────────────────────
  // Only when the GM has opted in via "Auto-Choose Cum Hole from Position".
  // All cock-having sources must have a penile position stored to skip.
  // Exception: the bothHaveCocks reverse direction still needs a dialog.
  const _cockSources = sourceTokens.filter(t => {
    const a = t.actor?.getWorldActor?.() ?? t.actor;
    return a?.getFlag(FLAG, "cock") === true;
  });
  // receiverIsTop inversion (Cock Ride, Clinging): the rider is a TOP whose
  // position marks them as the receiver of the carried partner's cock. The
  // carried partner - the climaxing source - has no position of their own, so
  // without this the pair fell through to the manual hole dialog. Copy the
  // rider's position marker onto the sourceless source: the normal pos:
  // expansion then derives the holes against the rider (the deposit target),
  // which is exactly where the shot belongs.
  try {
    // The rider's position lives in the scene participant, NOT in
    // _storedPositions (which is populated from SOURCE tokens only). Read it
    // from the battlemap scene by the target's token id.
    let _tPosId = null;
    if (resolvedTargetToken) {
      const _tMark = _storedPositions.get(resolvedTargetToken.id);
      _tPosId = (typeof _tMark === "string" && _tMark.startsWith("pos:")) ? _tMark.slice(4) : _tMark;
      if (!_tPosId) {
        for (const sc of (AFLP.HScene._scenes?.values?.() ?? [])) {
          const pp = (sc.participants ?? []).find(p => p.tokenId === resolvedTargetToken.id);
          if (pp?.position) { _tPosId = pp.position; break; }
        }
      }
    }
    if (_tPosId && AFLP.getPosition?.(_tPosId)?.receiverIsTop) {
      for (const t of _cockSources) {
        if (!_storedPositions.has(t.id)) _storedPositions.set(t.id, "pos:" + _tPosId);
      }
    }
  } catch (e) {}

  const _allHaveStoredPosition = _cockSources.length > 0 &&
    _cockSources.every(t => _storedPositions.has(t.id));

  let dialogResult;

  // If every cumming source has a known penile position, route straight to those
  // holes - no dialog - even when both partners have cocks. The cum macro is
  // always driven by ONE clicked cummer (or a resolved gangbang); the partner's
  // own climax is a separate event, so there is nothing to disambiguate here.
  if (AFLP.Settings.cumHoleFromPosition && _allHaveStoredPosition) {
    // Build holeAssignments directly from stored positions — no dialog
    const autoHoles = {};
    for (const t of _cockSources) {
      const holeId = _storedPositions.get(t.id);
      if (typeof holeId === "string" && holeId.startsWith("pos:")) {
        // Multi-hole position: one full shot lands in EACH hole in use and each
        // hole spends one load (hemipenis/multipenis design). Holes are the
        // position's list filtered by the bottom's anatomy; shortage priority
        // (vaginal first) is applied at spend time.
        const holes = AFLP.positionHolesFor?.(holeId.slice(4), targetActor) ?? [];
        for (const h of holes) autoHoles[h] = (autoHoles[h] ?? 0) + 1;
        if (!holes.length) autoHoles["facial"] = (autoHoles["facial"] ?? 0) + 1;
      } else if (holeId === "gangbang") {
        // A troop's Gangbang position fills everything at once. The expansion used
        // to live here as a local copy; it is now AFLP.expandHoles, shared with the
        // Daggerheart carnal deposit path so the two cannot disagree about what
        // "every hole" means.
        for (const h of AFLP.expandHoles("gangbang", targetActor)) autoHoles[h] = (autoHoles[h] ?? 0) + 1;
      } else {
        autoHoles[holeId] = (autoHoles[holeId] ?? 0) + 1;
      }
    }
    dialogResult = { sourceHoles: autoHoles, targetHoles: null };
  } else {
  // -----------------------------------------------
  // Hole selection dialog (fallback / bothHaveCocks)
  // Returns { sourceHoles, targetHoles }
  // -----------------------------------------------
  {
    // Holes available to cum INTO the target
    const targetHasPaizuri = targetActor?.getFlag(FLAG, "myBodyIsAWeapon") === true;
    const targetHoleOptions = [
      { value: "oral",   label: "Mouth" },
      ...(hasPussy ? [{ value: "vaginal", label: "Pussy" }] : []),
      { value: "anal",   label: "Ass" },
      { value: "facial", label: "Facial" },
      ...(targetHasPaizuri ? [{ value: "paizuri", label: "Paizuri" }] : []),
      { value: "ground", label: "On the ground" },
      { value: "vial",   label: "Into a Vial" },
    ];
    // Holes available to cum INTO the source (when target also has a cock)
    const sourceActor0Pussy = sourceActor0?.getFlag(FLAG, "pussy") === true;
    const sourceHoleOptions = [
      { value: "oral",   label: "Mouth" },
      ...(sourceActor0Pussy ? [{ value: "vaginal", label: "Pussy" }] : []),
      { value: "anal",   label: "Ass" },
      { value: "facial", label: "Facial" }
    ];
    // Legacy alias for single-source single-direction path
    const holeOptions = targetHoleOptions;

    // ── Styled cum dialog ──────────────────────────────────────────────────
    // Actor portraits header + H-Scene-card styling throughout.
    const sourceActor0Name = sourceActor0?.name ?? "Source";
    const sourceActor0Img  = sourceActor0?.img  ?? "";
    const targetActorImg   = targetActor?.img   ?? "";

    const makeHoleBtn = (h, prefix) =>
      `<label style="display:flex;align-items:center;gap:8px;
                     background:${h.special ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)"};
                     border:1px solid ${h.special ? "rgba(200,160,80,0.12)" : "rgba(200,160,80,0.25)"};
                     border-radius:4px;padding:5px 10px;
                     margin-bottom:4px;cursor:pointer;
                     font-size:12px;font-family:var(--font-primary,serif);
                     color:${h.special ? "#888" : "#f0e8d0"};">
        <input type="checkbox" name="${prefix}${h.value}" value="${h.value}"
               style="accent-color:#c8a050;width:13px;height:13px;flex-shrink:0;"/>
        ${h.label}
      </label>`;

    const portraitStyle = (border) =>
      `width:44px;height:44px;border-radius:4px;overflow:hidden;
       border:1px solid ${border};flex-shrink:0;`;
    const portraitImg = (src, name) =>
      `<div style="${portraitStyle("rgba(200,160,80,0.4)")}">
         <img src="${src}" alt="${name}" style="width:100%;height:100%;object-fit:cover;object-position:top;"/>
       </div>`;
    const targetPortraitImg = (src, name) =>
      `<div style="${portraitStyle("rgba(200,100,100,0.6)")}">
         <img src="${src}" alt="${name}" style="width:100%;height:100%;object-fit:cover;object-position:top;"/>
       </div>`;

    let formContent = "";

    if (!isMultiSource) {
      formContent = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                    border-bottom:1px solid rgba(200,160,80,0.2);padding-bottom:8px;">
          ${portraitImg(sourceActor0Img, sourceActor0Name)}
          <div style="font-size:16px;color:rgba(200,160,80,0.5);">→</div>
          ${targetPortraitImg(targetActorImg, targetActor.name)}
          <div>
            <div style="font-size:12px;font-weight:bold;color:#f0e8d0;">${sourceActor0Name}</div>
            <div style="font-size:10px;color:#aaa;">is cumming. Choose a hole:</div>
          </div>
        </div>
        ${holeOptions.map(h => makeHoleBtn(h, "hole-")).join("")}`;
    } else {
      const srcNamesShort = sourceTokens.slice(0,3).map(t=>t.name).join(", ")
        + (sourceTokens.length > 3 ? ` +${sourceTokens.length-3}` : "");
      formContent = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                    border-bottom:1px solid rgba(200,160,80,0.2);padding-bottom:8px;">
          ${targetPortraitImg(targetActorImg, targetActor.name)}
          <div>
            <div style="font-size:12px;font-weight:bold;color:#f0e8d0;">${targetActor.name}</div>
            <div style="font-size:10px;color:#aaa;">${sourceCount} partners. Assign each to a hole:</div>
            <div style="font-size:10px;color:rgba(200,160,80,0.6);">${srcNamesShort}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;padding:3px 4px;font-size:10px;
                       color:rgba(200,160,80,0.7);font-weight:normal;
                       text-transform:uppercase;letter-spacing:0.06em;">Hole</th>
            <th style="text-align:center;padding:3px 4px;font-size:10px;
                       color:rgba(200,160,80,0.7);font-weight:normal;
                       text-transform:uppercase;letter-spacing:0.06em;">Partners</th>
          </tr>
          ${holeOptions.map(h => `
          <tr>
            <td style="padding:3px 4px;">
              <label style="display:flex;align-items:center;gap:6px;
                            font-size:12px;color:#f0e8d0;cursor:pointer;">
                <input type="checkbox" name="hole-${h.value}" class="aflp-hole-check"
                       data-hole="${h.value}" style="accent-color:#c8a050;"/>
                ${h.label}
              </label>
            </td>
            <td style="text-align:center;padding:3px 4px;">
              <input type="number" name="count-${h.value}" value="0" min="0" max="${sourceCount}"
                style="width:48px;text-align:center;
                       background:rgba(255,255,255,0.07);
                       border:1px solid rgba(200,160,80,0.3);
                       border-radius:3px;color:#f0e8d0;
                       font-size:12px;padding:2px 4px;"
                data-hole="${h.value}"/>
            </td>
          </tr>`).join("")}
        </table>
        <div id="aflp-assign-total" style="margin-top:8px;font-size:11px;font-weight:bold;color:#c8a050;">
          Partners assigned: 0 / ${sourceCount}
        </div>
        <div id="aflp-assign-error" style="color:#e05050;margin-top:4px;font-size:11px;display:none;"></div>`;
    }

    // ── Hole selector (DialogV2) ──────────────────────────────────────
    // Validation is done inline in render; resolve is only called on valid input.
    let resolveDialog;
    const dialogPromise = new Promise(r => { resolveDialog = r; });

    foundry.applications.api.DialogV2.wait({
      window:   { title: "Select Holes" },
      position: { width: 340 },
      content: `
        <style>
          .aflp-cum-dialog label:hover {
            background:rgba(200,160,80,0.16) !important;
            border-color:rgba(200,160,80,0.55) !important;
          }
        </style>
        <div style="background:rgba(10,8,6,0.5);border-radius:4px;padding:10px;"
             class="aflp-cum-dialog">
          <form id="aflp-hole-form">${formContent}</form>
        </div>`,
      buttons: [
        { action: "cum",    label: "Cum",    default: true, callback: async () => {} },
        { action: "cancel", label: "Cancel",               callback: async () => resolveDialog(null) },
      ],
      close: async () => resolveDialog(null),
      render(ev, dlg) {
        const el = dlg.element;

        // Wire up live total tracking for multi-source
        if (isMultiSource) {
          const updateTotal = () => {
            let total = 0;
            holeOptions.forEach(h => {
              const cb = el.querySelector(`input[name="hole-${h.value}"]`);
              const ct = parseInt(el.querySelector(`input[name="count-${h.value}"]`)?.value || "0", 10);
              if (cb?.checked && ct > 0) total += ct;
            });
            const totalEl = el.querySelector("#aflp-assign-total");
            const errEl   = el.querySelector("#aflp-assign-error");
            if (totalEl) totalEl.textContent = `Partners assigned: ${total} / ${sourceCount}`;
            if (errEl)   errEl.style.display = "none";
          };
          el.querySelectorAll(".aflp-hole-check").forEach(cb => {
            cb.addEventListener("change", function() {
              const countInput = el.querySelector(`input[name="count-${this.dataset.hole}"]`);
              if (countInput) { countInput.value = this.checked ? 1 : 0; }
              updateTotal();
            });
          });
          el.querySelectorAll("input[type=number]").forEach(inp => {
            inp.addEventListener("input", updateTotal);
          });
        }

        // Intercept the Cum button to run validation before resolving
        const cumBtn = el.closest(".application.dialog")
          ?.querySelector("button[data-action='cum']");
        if (cumBtn) {
          cumBtn.addEventListener("click", async (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();

            const result = {};
            if (!isMultiSource) {
              el.querySelectorAll("input[type=checkbox]:checked").forEach(cb => {
                result[cb.name.replace("hole-", "")] = 1;
              });
              if (!Object.keys(result).length) {
                ui.notifications.warn("Select at least one hole.");
                return;
              }
            } else {
              let total = 0;
              holeOptions.forEach(h => {
                const cb    = el.querySelector(`input[name="hole-${h.value}"]`);
                const count = parseInt(el.querySelector(`input[name="count-${h.value}"]`)?.value ?? "0", 10) || 0;
                if (cb?.checked && count > 0) { result[h.value] = count; total += count; }
              });
              const errEl = el.querySelector("#aflp-assign-error");
              if (!Object.keys(result).length) {
                const msg = "Select at least one hole with at least one partner.";
                if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
                return;
              }
              if (total !== sourceCount) {
                const msg = `Partners assigned (${total}) must equal source count (${sourceCount}).`;
                if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
                return;
              }
            }

            resolveDialog({ sourceHoles: result, targetHoles: null });
            dlg.close();
          }, true);
        }
      },
    });

    dialogResult = await dialogPromise;
  }
  } // end else (dialog path)

  if (!dialogResult) return;

  // Normalise: single-direction paths resolve({ sourceHoles, targetHoles:null }) or plain object
  // bothHaveCocks path resolves { sourceHoles, targetHoles }
  // legacy single-direction resolve(result) gave a plain holes object — wrap it
  const holeAssignments  = dialogResult.sourceHoles ?? dialogResult;
  const targetCumsIntoSource = dialogResult.targetHoles ?? null; // non-null only for bothHaveCocks path

  if (!Object.keys(holeAssignments).length && !Object.keys(targetCumsIntoSource ?? {}).length) return;

  const allSelectedHoles = Object.keys(holeAssignments);

  // ── THE SPEND LEDGER, HOISTED ───────────────────────────────────────────
  //
  // `sourceCumSpent` is "this token has already paid for this climax". The main
  // deposit loop below reads it and only spends when the entry is undefined, so
  // a source filling two holes pays ONE Cum Shot and both holes receive it.
  //
  // IT IS DECLARED HERE, ABOVE THE GROUND/VIAL BLOCK, BECAUSE THAT BLOCK IS A
  // DEPOSIT TOO. It used to keep its own books: it read the `cum` flag, spent a
  // full shot and WROTE IT IMMEDIATELY, and then the main loop re-read the
  // freshly written flag and spent a second shot. Ticking "Pussy" and "On the
  // ground" in the same dialog cost two loads for one climax. Measured against
  // the file's own precedent: pussy + anal already costs ONE load and deposits
  // into both, so the floor is now accounted the same way.
  //
  // WHAT WOULD MAKE THIS STALE: a design decision that one climax may spend more
  // than one load. The multi-hole POSITIONS (hemipenis, multipenis) do exactly
  // that on purpose - but they do it by handing the loop several map entries with
  // an explicit per-hole allocation, not by two blocks writing the same flag.
  const sourceCumSpent = new Map(); // token.id → cumUnitsSpent
  // "This token has already paid for this climax." Deliberately a SEPARATE set
  // rather than pre-seeding sourceCumSpent: the loop's spend block also seeds the
  // per-hole allocation, the shot size and the pregnancy slot, and short-circuiting
  // it would skip those too. This gates the DEDUCTION only.
  const sourceAlreadyPaid = new Set();

  // Split the destinations before the map is built - both the map and the
  // ground/vial block below read these, and the map now runs first.
  // `node --check` does NOT catch a const used above its declaration; that is a
  // runtime TDZ ReferenceError, and moving the map without moving these was
  // exactly that bug for about ninety seconds.
  // THE SPECIAL FAMILY IS "DESTINATIONS THAT DO NOT TOUCH THE TARGET". ground and
  // vial were always that; `self-coat` joins them because a bottom folded into a
  // mating press finishes on their OWN chest, and the ordinary deposit path only
  // ever writes to the target.
  const _SPECIAL = new Set(["ground", "vial", "self-coat"]);
  const specialHoles  = allSelectedHoles.filter(h => _SPECIAL.has(h));
  const selectedHoles = allSelectedHoles.filter(h => !_SPECIAL.has(h));

  // -----------------------------------------------
  // Build source → hole map
  // -----------------------------------------------
  // BUILT BEFORE THE GROUND/VIAL BLOCK so that block knows WHICH sources are on
  // the floor. It used to charge `sourceTokens[0]` unconditionally.
  //
  // AND A SPECIAL HOLE NOW CONSUMES A SOURCE. The old builder `continue`d past
  // ground/vial without advancing `idx`, so in a multi-source scene the partner
  // "assigned" to the floor took no token AND token 0 was handed the first real
  // hole as well - charged once by the special block and again by the loop. The
  // dialog's own validator counts a ground assignment toward the source total
  // (`if (total !== sourceCount)`), so the assignment is meant to occupy someone.
  const sourceHoleMap = [];
  const specialSourceTokens = [];   // tokens whose assignment IS the floor or a vial
  if (!isMultiSource) {
    for (const hole of selectedHoles) sourceHoleMap.push({ sourceToken: sourceTokens[0], hole });
    if (specialHoles.length && sourceTokens[0]) specialSourceTokens.push(sourceTokens[0]);
  } else {
    let idx = 0;
    for (const [hole, count] of Object.entries(holeAssignments)) {
      for (let i = 0; i < count; i++) {
        if (idx >= sourceTokens.length) break;
        const tok = sourceTokens[idx];
        if (_SPECIAL.has(hole)) specialSourceTokens.push(tok);
        else sourceHoleMap.push({ sourceToken: tok, hole });
        idx++;
      }
    }
    // A special hole with no source left over still has to be paid by somebody,
    // or the floor pool draws from nothing. Fall back to the first source, which
    // is the old behaviour and is only reached now when the counts disagree.
    if (specialHoles.length && !specialSourceTokens.length && sourceTokens[0]) specialSourceTokens.push(sourceTokens[0]);
  }

  // ── Ground / Vial special cases ─────────────────────────────────────────
  // These consume cum from the source but don't affect the target at all.
  // Resolve the bottled-cum item per system: the DH Bottled Cum item (tagged
  // aflrKey "vial-of-cum") on DH, the canonical PF2e compendium item elsewhere.
  const VIAL_UUID = AFLP.system?.contentUuid?.("vial-of-cum")
    ?? "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rloXTr10gPd7Xh0J";

  for (const src of specialHoles.length ? specialSourceTokens : []) {
    const srcActor = src?.actor?.getWorldActor?.() ?? src?.actor;
    if (srcActor) {
      const cum = srcActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
      const _shot = _shotFor(srcActor);
      const cumUnitsSpent = _shot.units;
      // Drained dry: nothing to bottle, nothing to pool on the floor. Announce it
      // and fall through - normal holes (if any) handle their own dry check.
      if (_shot.dry) await _postDry(srcActor, targetActor);
      // RECORD THE SPEND IN THE SHARED LEDGER, and write it deferred rather than
      // immediately. The immediate write was the second half of the double-spend:
      // the main loop re-read the flag it had just changed. Recording it here
      // means the loop sees "already paid" and deposits without charging again.
      if (cumUnitsSpent > 0 && !_shot.unlimited) {
        await AFLP.gm.run("setFlag", srcActor, "cum", { current: Math.max(0, cum.current - cumUnitsSpent), max: cum.max });
        sourceAlreadyPaid.add(src.id);
      }
      if (!_shot.dry && specialHoles.includes("vial")) {
        // Grant 1 Bottled Cum to the source actor
        const vialDoc = await fromUuid(VIAL_UUID).catch(() => null);
        if (vialDoc) {
          // Check if they already have one and increment quantity, else create
          const existing = srcActor.items.find(i =>
            i.name === vialDoc.name ||
            i.slug === "vial-of-cum" ||
            (i.flags?.core?.sourceId ?? i.sourceId) === VIAL_UUID
          );
          if (existing && existing.system?.quantity !== undefined) {
            await AFLP.gm.run("updateItem", srcActor, existing.id, { "system.quantity": (existing.system.quantity ?? 1) + 1 });
          } else {
            const itemData = vialDoc.toObject();
            itemData.system.quantity = 1;
            await AFLP.gm.run("createItem", srcActor, itemData);
          }
          await _narrate(
            `${srcActor.name} bottles their cum.`,
            `<div class="aflp-chat-card"><p><strong>${srcActor.name}</strong> bottles their cum.</p></div>`,
            targetActor);
        } else {
          ui.notifications.warn("AFLR | bottled-cum item not found in compendium.");
        }
      }
      // SELF-COAT: the load lands on the creature that fired it. Same spend, same
      // clamp, but the cumflation goes to the SOURCE - which is why it cannot ride
      // the ordinary loop. It writes `bodyCoat`, the same pool a paizuri finish
      // fills, so it feeds slickTier and therefore the Horny grant and the Stuck
      // Submitting ease exactly like any other coat.
      if (!_shot.dry && specialHoles.includes("self-coat")) {
        try {
          const _cf  = AFLP_Cumflation.getCumflation(srcActor);
          const _ovf = AFLP_Cumflation.getCumOverflow(srcActor);
          const _sd  = new AFLP.UI.SexualStatsDialog(srcActor);
          await _sd.load();
          const _prev = _cf.bodyCoat ?? 0;
          await AFLP_Cumflation.applyCumflation(srcActor, _cf, _ovf, _sd, ["bodyCoat"], cumUnitsSpent, srcActor.name);
          await AFLP.recordCumSpill?.(srcActor, srcActor, _prev, cumUnitsSpent, "bodyCoat");
          await AFLP_Cumflation.saveCumflation(srcActor, _cf, _ovf);
          await AFLP_Cumflation.applyCumflationEffects(srcActor);
          await AFLP.gm.run("setFlag", srcActor, "sexual", _sd.sexual);
        } catch (e) { console.warn("AFLR | self-coat deposit failed:", e?.message ?? e); }
        await _narrate(
          `${srcActor.name} finishes across their own chest and belly.`,
          `<div class="aflp-chat-card"><p><strong>${srcActor.name}</strong> finishes across their own chest and belly.</p></div>`,
          targetActor);
      }
      if (!_shot.dry && specialHoles.includes("ground")) {
        // Pool it for real: the splatter layer draws it and the Cum Rag can
        // bottle it (spillUnits = the whole load).
        try { await window.AFLP_Splatter?.dropGroundPuddle?.(src, cumUnitsSpent); } catch (e) { /* no canvas */ }
        await _narrate(
          `${srcActor.name} cums onto the ground, leaving a pool at their feet.`,
          `<div class="aflp-chat-card"><p><strong>${srcActor.name}</strong> cums onto the ground, leaving a pool at their feet.</p></div>`,
          targetActor);
      }
    }
  }

  // If only special holes were selected, we're done
  if (!selectedHoles.length && !Object.keys(targetCumsIntoSource ?? {}).length) return;

  // -----------------------------------------------
  // Load target state
  // -----------------------------------------------
  const sexualStatsDialog = new AFLP.UI.SexualStatsDialog(targetActor);
  await sexualStatsDialog.load();

  const cumFlags   = AFLP_Cumflation.getCumflation(targetActor);
  const cumOverflow = AFLP_Cumflation.getCumOverflow(targetActor);

  // Snapshot pre-cum cumflation values to compute delta for history entries
  const cumflationBefore = { anal: cumFlags.anal ?? 0, oral: cumFlags.oral ?? 0, vaginal: cumFlags.vaginal ?? 0, facial: cumFlags.facial ?? 0 };

  const POTION_OF_BREEDING_UUID = AFLP.items?.["potion-of-breeding-effect"]?.uuid ?? null;
  const POTION_OF_BREEDING_PERM_UUID = AFLP.items?.["potion-of-breeding-effect-permanent"]?.uuid ?? null;
  const _hasPobItem = (a) => a.items.some(i =>
    i.sourceId === POTION_OF_BREEDING_UUID || i.sourceId === POTION_OF_BREEDING_PERM_UUID);
  const BIRTH_CONTROL_UUID      = AFLP.items?.["birth-control"]?.uuid ?? null;

  // Staged fertility model: derive the pre-checks from the shared helper so
  // they stay aligned with attemptImpregnation by construction. The PF2e
  // Potion of Breeding effect items and the PF2e Birth Control effect item are
  // folded in here (Daggerheart consumables can't run code; there the sheet
  // sets the conditions instead).
  const _bcItem = (a) => (BIRTH_CONTROL_UUID ? a.items.some(i => i.sourceId === BIRTH_CONTROL_UUID) : false);
  // BOTH MATES, per the Fertility card: "The highest Fertility between the two
  // mates governs the roll. Birth Control on either mate reduces the roll's
  // effective Fertility by its value, to a minimum of 0."
  //
  // This pre-check GATES the call to attemptImpregnation, so it has to agree with
  // it or the gate decides on its own and the authoritative calc never runs. Until
  // 14 Aug 2026 it read the bearer alone - not even the sire's cock anatomy, which
  // attemptImpregnation did read - so the two could and did disagree: a bearer on
  // Birth Control 1 with a Breeder sire is effective Fertility 2 by the card, and
  // this gate blocked it outright at stage 0.
  //
  // The legacy PF2e Birth Control effect ITEM is the old absolute block and now
  // counts from either mate for the same reason.
  const _effOf = (a, partner = null) => {
    const e = AFLP_Pregnancy.effectiveFertility?.(a, {
      hasPotion: _hasPobItem(a), partner,
    }) ?? { stage: 1 };
    return (_bcItem(a) || (partner && _bcItem(partner))) ? { ...e, stage: 0 } : e;
  };
  // Bearer-only view, for the reads that are genuinely about this body rather than
  // about a pairing: the occupancy override and the sheet's own display.
  const _effTarget = _effOf(targetActor);
  const hasPotionOfBreeding = _effTarget.stage >= 3;   // occupancy override + short gestation
  const pregnancies         = structuredClone(await targetActor.getFlag(FLAG, "pregnancy") ?? {});
  // Only count pregnancies that are actively gestating (positive days remaining).
  // Completed entries (gestationRemaining === "Complete" or <= 0) are kept for display
  // but must not block new impregnation after birth.
  const hasExistingPregnancy = Object.values(pregnancies).some(p =>
    typeof p.gestationRemaining === "number" && p.gestationRemaining > 0
  );
  // Block a new pregnancy while one is active, unless a Potion of Breeding
  // overrides it or the Pregnancy Stacking setting allows concurrent pregnancies.
  // Mirrors the occupancy gate in AFLP_Pregnancy.attemptImpregnation so PF2e and
  // Daggerheart resolve identically.
  const pregnancyBlocked    = hasExistingPregnancy && !hasPotionOfBreeding && !AFLP.Settings.pregnancyStacking;

  const impregnationEvents = [];

  // -----------------------------------------------
  // Process each source → hole
  // -----------------------------------------------
  const sourceShotUnits = new Map(); // token.id → single-shot unit size (per-hole allocation)
  const sourceHoleAlloc = new Map(); // token.id → { hole: allocated units } for multi-hole sources
  const _knotTied  = new Set();      // token.ids whose knot already locked this climax
  const _knotLines = [];             // knot narration, appended to the scene log
  // Track per-source which holes they contributed to (for history)
  const sourceHolesMap = new Map(); // token.id → Set of holes
  // Track per-source their pregnancy result (for history)
  const sourcePregnancyResult = new Map(); // token.id → { offspring, deliveryType } | null

  let totalCumReceivedThisEvent = 0;

  // sourceSexualDeltas: accumulate per-source stat changes across all holes before writing.
  // Without this, a source cumming into multiple holes would re-read a stale flag on the
  // second iteration and overwrite the first hole's write, losing cumGiven and act counts.
  const sourceSexualDeltas = new Map(); // token.id → { sexual (live clone), mlThisShot }
  const sourceCumDeferred  = new Map(); // token.id → { current, max } — written in one batch after loop

  for (const { sourceToken, hole } of sourceHoleMap) {
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    const hasCock     = sourceActor.getFlag(FLAG, "cock") === true;
    const cockTypes   = sourceActor.getFlag(FLAG, "anatomyFeatures") ?? {};
    if (!hasCock) continue;

    // Only spend cum once per source
    let cumUnitsSpent = sourceCumSpent.get(sourceToken.id);
    if (cumUnitsSpent === undefined) {
      const cum = sourceActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
      const _shot = _shotFor(sourceActor);
      // Drained dry: the orgasm still happens, but nothing comes out. Skip this
      // source entirely - no ml, no cumflation, no spill, no coat - and say so.
      if (_shot.dry) { await _postDry(sourceActor, targetActor); sourceCumSpent.set(sourceToken.id, 0); continue; }
      cumUnitsSpent = _shot.units;
      sourceShotUnits.set(sourceToken.id, _shot.units);
      // Multi-hole spend (hemipenis/multipenis): a FULL shot lands in each hole
      // in use, and each hole costs one load's worth of units. If the reservoir
      // cannot cover every hole, the spend caps at what is left (never below a
      // single shot) and the deposit allocation fills holes vaginal-first.
      try {
        const _mark = _storedPositions?.get?.(sourceToken.id);
        if (typeof _mark === "string" && _mark.startsWith("pos:") && !_shot.dry) {
          const _mh = AFLP.positionHolesFor?.(_mark.slice(4), targetActor) ?? [];
          const _shaftMap = AFLP.positionShaftsFor?.(_mark.slice(4), targetActor) ?? {};
          const _shaftTotal = _mh.reduce((n, h) => n + Math.max(1, Number(_shaftMap[h]) || 1), 0);
          if (_shaftTotal > 1) {
            const want = _shot.units * _shaftTotal;
            const have = _shot.unlimited ? want : Math.max(0, Number(cum.current) || 0);
            cumUnitsSpent = Math.max(_shot.units, Math.min(want, have));
            // Per-hole allocation, vaginal-first: each hole gets one full shot
            // until the spend runs out; the last funded hole may take a partial
            // and unfunded holes take NOTHING (no cumflation, no ml, no roll).
            const _PRI = ["vaginal", "anal", "oral", "paizuri", "nipples", "facial"];
            const _ordered = _mh.slice().sort((a, b) => {
              const ia = _PRI.indexOf(a), ib = _PRI.indexOf(b);
              return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
            // Each hole is owed a full shot PER SHAFT in it, so a triple-stacked
            // pussy is owed three. Shortage still fills vaginal first.
            const _alloc = {};
            let _rem = cumUnitsSpent;
            for (const h of _ordered) {
              const owed = _shot.units * Math.max(1, Number(_shaftMap[h]) || 1);
              const g = Math.min(owed, _rem);
              _alloc[h] = g; _rem -= g;
            }
            sourceHoleAlloc.set(sourceToken.id, _alloc);
          }
        }
      } catch (e) {}
      // Throat-Milking: a milking throat suctions an extra Cum Shot from whoever
      // finishes in its mouth (an oral position, or a gangbang that includes it).
      // Ass (Milking) is the same wringing effect on the other end.
      //
      // CLAMPED TO WHAT IS LEFT IN THE POOL. `cumUnitsSpent` arrives from
      // `_shot.units`, already clamped to the remaining loads at line ~34. Adding
      // 1 or 2 on top pushed it PAST the pool: the write below floors at 0, but
      // every DEPOSIT site downstream uses the raw number - cumflation, the spill,
      // the ml on the chat card, the lifetime stats - so a creature with one unit
      // left in a milking throat deposited two and paid one. The extra now comes
      // out of the pool or not at all, which is what "run the reservoir dry and
      // there is nothing left to give" means in the guide.
      //
      // An unlimited source (infiniteCum, infinite-loads gear, Ass (Cumfinity))
      // is deliberately NOT clamped - it has no pool to run down, and the milking
      // bonus is the whole point of the anatomy.
      //
      // WHAT WOULD MAKE THIS STALE: a third milking subtype, or the extra shot
      // becoming a deposit-only bonus that costs no load - which would be a
      // design decision, not a fix.
      //
      // `_srcHole` is the RAW `_storedPositions` marker, so a multi-hole position
      // stored as "pos:<id>" never matches "oral"/"anal" and the bonus does not
      // fire for it. Left as measured, not silently widened.
      try {
        const _tgtAF = targetActor?.getFlag(FLAG, "anatomyFeatures") ?? {};
        const _srcHole = (typeof _storedPositions !== "undefined" && _storedPositions?.get) ? _storedPositions.get(sourceToken.id) : null;
        let _milkBonus = 0;
        if (_tgtAF["throat-milking"] && (_srcHole === "oral" || _srcHole === "gangbang")) _milkBonus += 1;
        if (_tgtAF["ass-milking"]    && (_srcHole === "anal" || _srcHole === "gangbang")) _milkBonus += 1;
        if (_milkBonus > 0) {
          if (_shot.unlimited) cumUnitsSpent += _milkBonus;
          else {
            const _left = Math.max(0, (Number(cum.current) || 0) - cumUnitsSpent);
            cumUnitsSpent += Math.min(_milkBonus, _left);
          }
        }
      } catch (e) {}
      // Infinite cum: NPCs/adversaries don't deplete when the setting is on.
      //
      // AND NOT TWICE. A source that already paid in the ground/vial block above
      // is skipped here: it is the same climax, and the file's own rule is one
      // Cum Shot per source per event (a source filling two holes pays once and
      // both are filled). Ticking "Pussy" and "On the ground" together used to
      // cost two loads because that block wrote the flag immediately and this one
      // then re-read the value it had just written.
      if (!_shot.unlimited && !sourceAlreadyPaid.has(sourceToken.id)) {
        sourceCumDeferred.set(sourceToken.id, { current: Math.max(0, cum.current - cumUnitsSpent), max: cum.max });
      }
      sourceCumSpent.set(sourceToken.id, cumUnitsSpent);
      sourcePregnancyResult.set(sourceToken.id, null);
    }
    if (cumUnitsSpent <= 0) continue;   // dry source, already reported

    // Cock (Knot): cumming inside a creature locks the knot. Fires once per
    // source per climax, and only for a hole that is actually inside the body -
    // a facial or a load on the tits has nothing to lock into.
    try {
      const _srcAf = sourceActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
      // PF2e only for now. The knot's hold, release, and pop-free all run on
      // the native Grabbed condition, which Daggerheart does not have - in DH
      // this tied the flag, applied nothing, dragged the partner around and
      // could never be released. The DH version needs its own Carnal Escape
      // phrasing before it ships there.
      if (game.system?.id === "pf2e"
          && _srcAf["cock-knot"] && targetActor && sourceActor !== targetActor
          && ["vaginal", "anal", "oral"].includes(hole) && !_knotTied.has(sourceToken.id)) {
        _knotTied.add(sourceToken.id);
        await AFLP.knot?.tie?.(sourceActor, sourceToken.id, targetActor);
        const _kPlain = `${sourceActor.name}'s knot swells and locks inside ${targetActor.name} - they are held until something pulls them free.`;
        _knotLines.push(_kPlain);
        await _narrate(_kPlain, `<p>${_kPlain}</p>`, targetActor);
      }
    } catch (e) { console.warn("AFLP | knot tie failed", e); }

    // Multi-hole sources: this hole's allocated units (one full shot per funded
    // hole, vaginal-first). A zero-funded hole is skipped outright - no ml, no
    // cumflation, no stats, no roll. Single-hole sources keep the full spend,
    // exactly as before.
    const _holeAlloc = sourceHoleAlloc.get(sourceToken.id);
    const holeUnits = (_holeAlloc && Object.prototype.hasOwnProperty.call(_holeAlloc, hole)) ? _holeAlloc[hole] : cumUnitsSpent;
    if (holeUnits <= 0) continue;
    const holeMl = holeUnits * AFLP.CUM_UNIT_ML;

    // Track holes per source
    if (!sourceHolesMap.has(sourceToken.id)) sourceHolesMap.set(sourceToken.id, new Set());
    sourceHolesMap.get(sourceToken.id).add(hole);

    // Accumulate stats for this source — read once from flag or reuse existing delta object
    if (!sourceSexualDeltas.has(sourceToken.id)) {
      const base = structuredClone(sourceActor.getFlag(FLAG, "sexual") ?? {});
      if (!base.lifetime) base.lifetime = {};
      if (!base.lifetime.mlGiven) base.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!base.lifetime.given)   base.lifetime.given   = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!base.lifetime.cumGiven) base.lifetime.cumGiven = 0;
      const mlThisShot = cumUnitsSpent * AFLP.CUM_UNIT_ML;
      // cumGiven incremented once per source (not per hole)
      base.lifetime.cumGiven = (base.lifetime.cumGiven ?? 0) + cumUnitsSpent;
      if (isMultiSource) {
        base.lifetime.mlGiven.gangbang = (base.lifetime.mlGiven.gangbang ?? 0) + mlThisShot;
        base.lifetime.given.gangbang   = (base.lifetime.given.gangbang   ?? 0) + 1;
      }
      sourceSexualDeltas.set(sourceToken.id, { sexual: base, mlThisShot, unitsThisShot: cumUnitsSpent });
    }
    const { sexual: sourceSexual, mlThisShot } = sourceSexualDeltas.get(sourceToken.id);

    // Per-hole stats (safe to accumulate across iterations since we're mutating the same object)
    sourceSexual.lifetime.mlGiven[hole] = (sourceSexual.lifetime.mlGiven[hole] ?? 0) + holeMl;
    sourceSexual.lifetime.given[hole]   = (sourceSexual.lifetime.given[hole]   ?? 0) + 1;
    _bumpUnits(sourceSexual, "unitsGiven", hole, holeUnits);

    totalCumReceivedThisEvent += holeMl;

    // Apply cumflation (gated by setting)
    if (AFLP.Settings.cumflationInHscene) {
      const _spillPrevTier = cumFlags[hole] ?? 0;
      // Size Difference: a Stretched/Ruined (gap 2+) load packs the hole harder -
      // +1 deposited unit. Deposit only; the source's spent cum is unchanged.
      const _gapBonus = (AFLP.sizeGap?.(sourceActor, targetActor, hole) ?? 0) >= 2 ? 1 : 0;
      // cumOverflow is a RUNNING TOTAL on the actor (the "Monsters' Cum Dump"
      // title needs 40 accumulated units), so the station has to be handed the
      // difference this resolution made, not the total. It was handed the total
      // until 11 Aug 2026: measured, an actor sitting on 5 lifetime oral overflow
      // read 6 after a single overflowing unit, and a stationed captive banked six
      // vials for one unit of spill, again on every subsequent load.
      //
      // Awaited, because the delta is read immediately below. It was fire-and-
      // forget, which only worked because the mutation happens before the first
      // await inside.
      const _ovBefore = cumOverflow?.[hole] ?? 0;
      await AFLP_Cumflation.applyCumflation(targetActor, cumFlags, cumOverflow, sexualStatsDialog, [hole], holeUnits + _gapBonus, sourceActor.name);
      const _ovDelta = Math.max(0, (cumOverflow?.[hole] ?? 0) - _ovBefore);
      // A stationed captive leaves nothing on the floor: the bucket catches it, so
      // the Cum Cleaner has nothing to find and the two routes cannot double-dip.
      if (!AFLP.milkingStation?.on?.(targetActor))
        await AFLP.recordCumSpill?.(targetActor, sourceActor, _spillPrevTier, holeUnits + _gapBonus, hole);
      // Size Difference (Greater): an oversized load into a kinkster rewards
      // them, per the guide. Daggerheart: once per SCENE, clear a Stress.
      // PF2e: once per SESSION, gain a Hero Point (the flag resets at daily
      // preparations, the module's session boundary).
      try {
        if (_gapBonus && (AFLP.getKinkTier?.(targetActor, "size-difference") ?? 0) >= 2) {
          if (AFLP.system?.id === "daggerheart") {
            const scn = [...(AFLP.HScene?._scenes?.values() ?? [])]
              .find(s => (s.participants ?? []).some(p => (p.actorId === targetActor.id) || (canvas?.tokens?.get(p.tokenId)?.actor?.id === targetActor.id)));
            const gate = scn ? (scn.sizeGreaterCleared ??= {}) : null;
            if (!gate || !gate[targetActor.id]) {
              if (gate) gate[targetActor.id] = true;
              await AFLP.system?.clearStress?.(targetActor, 1);
            }
          } else if (AFLP.system?.id === "pf2e") {
            if (!targetActor.getFlag(AFLP.FLAG_SCOPE, "sizeGreaterUsed")) {
              await AFLP.gm.run("setFlag", targetActor, "sizeGreaterUsed", true);
              const hp = targetActor.system?.resources?.heroPoints;
              if (hp) {
                const next = Math.min(hp.max ?? 3, (hp.value ?? 0) + 1);
                if (next > (hp.value ?? 0)) {
                  await AFLP.gm.run("updateActor", targetActor, { "system.resources.heroPoints.value": next });
                  ChatMessage.create({
                    content: `<div class="aflp-chat-card"><p><strong>${targetActor.name}</strong>'s Size Difference kink turns the oversized load into clarity - <strong>+1 Hero Point</strong>.</p></div>`,
                    speaker: { alias: "AFLR" },
                  });
                }
              }
            }
          }
        }
      } catch (e) { /* non-fatal */ }
      // A Living Milking Station bottles the overflow that would have hit the floor,
      // typed by whoever most recently filled them.
      AFLP.milkingStation?.captureCum?.(targetActor, sourceActor, _ovDelta)
        ?.catch?.(e => console.warn("AFLR | milking station cum capture failed:", e));
      // Alcumist Dedication: auto-grant a typed Bottled Cum to the cumflated actor
      if (window.AFLP_Alcumist) {
        AFLP_Alcumist.onCumflation(targetActor, sourceActor).catch(e => console.warn("AFLR | Alcumist vial grant failed:", e));
      }
    }

    // Track scene loads stat
    AFLP.HScene?.incrementSceneLoads?.(targetActor.id, sourceActor.id, hole);

    // Impregnation
    // Ouroboros: self-impregnation (source is the same actor as the bearer) is
    // the Mastery beat - a self-cum breeds only at the top tier. Below Mastery
    // a self-cum still cumflates (Greater, gated above) but takes no pregnancy.
    const _isSelfBreed = sourceActor.id === targetActor.id;
    const _ouroMastery = (a) => {
      if (!AFLP.actorHasKink?.(a, "ouroboros")) return false;
      const t = AFLP.getKinkLevel?.(a, "ouroboros") ?? 0;
      return game.system?.id === "daggerheart" ? t >= 8 : t >= 5;
    };
    const _selfBreedOk = !_isSelfBreed || _ouroMastery(sourceActor);
    // A breeding ass carries in the gut. The four Ass fertility features say a load
    // finished there triggers a Brood Roll the same as a pussy would, so anal counts
    // as a breeding hole when the target has one of them - and only then.
    const _assBreeds = (() => {
      const af = targetActor?.getFlag?.(FLAG, "anatomyFeatures") ?? {};
      return !!(af["ass-fertile"] || af["ass-breeder"] || af["ass-clutch"] || af["ass-litter"]);
    })();
    const _breedingHole = (hole === "vaginal" && hasPussy) || (hole === "anal" && _assBreeds);
    // PER SOURCE, not once for the scene: the sire is half of the answer now, and
    // in a gangbang each sire is a different half.
    const fertilityBlocked = _effOf(targetActor, sourceActor).stage <= 0;
    if (!pregnancyBlocked && _breedingHole && !fertilityBlocked && _selfBreedOk) {
      const pregResult = await AFLP_Pregnancy.attemptImpregnation(targetActor, sourceActor, cockTypes, hasPotionOfBreeding);
      if (pregResult) {
        pregResult.source = pregResult.sourceName || sourceActor.name || "Unknown";
        impregnationEvents.push(pregResult);
        sourcePregnancyResult.set(sourceToken.id, { offspring: pregResult.offspring, deliveryType: pregResult.deliveryType });
      }
    } else if (pregnancyBlocked && _breedingHole) {
      impregnationEvents.push({ source: sourceActor.name, sourceName: sourceActor.name, blocked: true });
    }
    // Slick/Milking pussy OR ass trains the cummer to cum harder (one-time each).
    // The helper decides which keys apply; the hole gate here just stops an oral
    // or facial finish from training off an ass the cock never entered.
    if (hole === "vaginal" || hole === "anal") await AFLP.pussyTrainCoomer?.(sourceActor, targetActor, hole);
    // Honeyed / Electric / Venomous / Pacifying ass: what the hole does to whoever
    // just finished in it. Gripping is deliberately left to the GM.
    await AFLP.holeContactOnCum?.(sourceActor, targetActor, hole);
  }

  // -----------------------------------------------
  // TARGET cums into SOURCE (bothHaveCocks path only)
  // Mirrors the source loop above but with actors swapped.
  // -----------------------------------------------
  const targetCumGivenMl = {}; // hole → ml, for source's history entry
  if (targetCumsIntoSource && Object.keys(targetCumsIntoSource).length && bothHaveCocks) {
    const tgtCum = targetActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
    const _tgtShot = _shotFor(targetActor);
    const tgtCumUnitsSpent = _tgtShot.units;
    if (_tgtShot.dry) await _postDry(targetActor);

    if (tgtCumUnitsSpent > 0) {
      // Defer cum write — batched into final target actor.update() below
      const _tgtCumDeferred = _tgtShot.unlimited ? null
        : { current: Math.max(0, tgtCum.current - tgtCumUnitsSpent), max: tgtCum.max };

      // Merge tgtSexual changes directly into sexualStatsDialog.sexual to avoid a
      // double-write (a separate tgtSexual write would be overwritten at the end).
      const tgtSexual = sexualStatsDialog.sexual;
      if (!tgtSexual.lifetime) tgtSexual.lifetime = {};
      if (!tgtSexual.lifetime.mlGiven) tgtSexual.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!tgtSexual.lifetime.given)   tgtSexual.lifetime.given   = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!tgtSexual.lifetime.cumGiven) tgtSexual.lifetime.cumGiven = 0;

      const srcHasPussy = sourceActor0?.getFlag(FLAG, "pussy") === true;
      const tgtHolesSelected = Object.keys(targetCumsIntoSource);
      const tgtMlThisShot = tgtCumUnitsSpent * AFLP.CUM_UNIT_ML;

      for (const hole of tgtHolesSelected) {
        tgtSexual.lifetime.mlGiven[hole]  = (tgtSexual.lifetime.mlGiven[hole]  ?? 0) + tgtMlThisShot;
        tgtSexual.lifetime.given[hole]    = (tgtSexual.lifetime.given[hole]    ?? 0) + 1;
        _bumpUnits(tgtSexual, "unitsGiven", hole, tgtCumUnitsSpent);
        targetCumGivenMl[hole]            = tgtMlThisShot;

        // mlReceived on source (source is receiving here)
        const srcSexual = structuredClone(sourceActor0.getFlag(FLAG, "sexual") ?? {});
        if (!srcSexual.lifetime) srcSexual.lifetime = {};
        if (!srcSexual.lifetime.mlReceived) srcSexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
        if (!srcSexual.lifetime.cumReceived) srcSexual.lifetime.cumReceived = 0;
        srcSexual.lifetime.mlReceived[hole] = (srcSexual.lifetime.mlReceived[hole] ?? 0) + tgtMlThisShot;
        _bumpUnits(srcSexual, "unitsReceived", hole, tgtCumUnitsSpent);
        srcSexual.lifetime.cumReceived      = (srcSexual.lifetime.cumReceived      ?? 0) + tgtCumUnitsSpent;
        srcSexual.lifetime[hole]            = (srcSexual.lifetime[hole]             ?? 0) + 1;
        await AFLP.gm.run("setFlag", sourceActor0, "sexual", srcSexual);

        // Cumflation on source. NOT gated on srcHasPussy: oral/anal/facial cumflate
        // regardless of genitals (matching the main receiver loop), and the hole
        // dialog already withholds the vaginal option from pussy-less sources.
        if (AFLP.Settings.cumflationInHscene) {
          const srcCumFlags    = AFLP_Cumflation.getCumflation(sourceActor0);
          const srcCumOverflow = AFLP_Cumflation.getCumOverflow(sourceActor0);
          // SexualStatsDialog needed for cumflation helper
          const srcStatsDialog = new AFLP.UI.SexualStatsDialog(sourceActor0);
          await srcStatsDialog.load();
          const _spillPrevTier2 = srcCumFlags[hole] ?? 0;
          const _gapBonus2 = (AFLP.sizeGap?.(targetActor, sourceActor0, hole) ?? 0) >= 2 ? 1 : 0;
          await AFLP_Cumflation.applyCumflation(sourceActor0, srcCumFlags, srcCumOverflow, srcStatsDialog, [hole], tgtCumUnitsSpent + _gapBonus2, targetActor.name);
          await AFLP.recordCumSpill?.(sourceActor0, targetActor, _spillPrevTier2, tgtCumUnitsSpent + _gapBonus2, hole);
          // Alcumist Dedication: sourceActor0 is being cumflated by the target
          if (window.AFLP_Alcumist) {
            AFLP_Alcumist.onCumflation(sourceActor0, targetActor).catch(e => console.warn("AFLR | Alcumist vial grant failed:", e));
          }
          await AFLP_Cumflation.saveCumflation(sourceActor0, srcCumFlags, srcCumOverflow);
          await AFLP_Cumflation.applyCumflationEffects(sourceActor0);
          await AFLP.gm.run("setFlag", sourceActor0, "sexual", srcStatsDialog.sexual);
        }

        // Impregnation — target's cock into source's pussy
        if (hole === "vaginal" && srcHasPussy) {
          const srcPregnancies = structuredClone(await sourceActor0.getFlag(FLAG, "pregnancy") ?? {});
          const srcHasExistingPreg = Object.values(srcPregnancies).some(p =>
            typeof p.gestationRemaining === "number" && p.gestationRemaining > 0
          );
          // The REVERSE direction - the target's cock into the source's pussy - so
          // here the source is the bearer and the target is the sire. Same rule:
          // both mates govern, and Birth Control on either reduces it.
          const _effSrc = _effOf(sourceActor0, targetActor);
          // The occupancy override is about THIS body carrying, so it reads the
          // bearer alone rather than the pairing.
          const srcHasPotionBreed  = _effOf(sourceActor0).stage >= 3;
          if (!srcHasExistingPreg || srcHasPotionBreed) {
            if (_effSrc.stage > 0) {
              const tgtCockTypes = targetActor.getFlag(FLAG, "anatomyFeatures") ?? {};
              const pregResult = await AFLP_Pregnancy.attemptImpregnation(sourceActor0, targetActor, tgtCockTypes, srcHasPotionBreed);
              if (pregResult) impregnationEvents.push({ ...pregResult, source: targetActor.name, sourceName: targetActor.name, onSource: true });
            }
          }
        }
      }

      tgtSexual.lifetime.cumGiven = (tgtSexual.lifetime.cumGiven ?? 0) + tgtCumUnitsSpent;
      // tgtSexual IS sexualStatsDialog.sexual — written in the final batched update below.
      // Store deferred cum so the final flush can include it.
      sexualStatsDialog._tgtCumDeferred = _tgtCumDeferred;
    }
  }

  // ── Write accumulated source sexual stats (once per source, not per hole) ──
  for (const [tokenId, { sexual }] of sourceSexualDeltas.entries()) {
    const sourceToken = sourceTokens.find(t => t.id === tokenId);
    if (!sourceToken) continue;
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    // Batch sexual stats + cum deduction into one server round-trip per source.
    // partnerHistory is folded in below after the history loop builds it.
    const srcUpdate = { [`flags.${FLAG}.sexual`]: sexual };
    const srcCum = sourceCumDeferred.get(tokenId);
    if (srcCum) srcUpdate[`flags.${FLAG}.cum`] = srcCum;
    sourceSexualDeltas.get(tokenId)._update = srcUpdate; // stash for history merge
    sourceSexualDeltas.get(tokenId)._actor  = sourceActor;
  }

  // -----------------------------------------------
  // Increment target lifetime act counters
  // -----------------------------------------------
  // Initialise-or-increment: do NOT gate on the key already existing. A reset or
  // partially-seeded actor would otherwise never start counting, which silently
  // breaks lifetime tracking and the per-hole title automation.
  const COUNT_HOLES = new Set(["oral", "vaginal", "anal", "facial", "paizuri", "gangbang"]);
  // Units received per hole. lifetime[hole] counts LOADS (discrete fillings);
  // unitsReceived[hole] counts Cum Shot UNITS. Both are setting-independent, unlike
  // mlReceived. Each source that filled a hole delivered a full shot into it.
  const _unitsIntoHole = {};
  const _HOLE_PRIORITY = ["vaginal", "anal", "oral", "paizuri", "nipples", "facial"];
  for (const [tokenId, holes] of sourceHolesMap.entries()) {
    const u = sourceSexualDeltas.get(tokenId)?.unitsThisShot ?? 0;
    const hl = [...holes];
    if (hl.length <= 1) {
      for (const h of hl) _unitsIntoHole[h] = (_unitsIntoHole[h] ?? 0) + u;
      continue;
    }
    // Multi-hole source: one full shot per hole, allocated vaginal-first when
    // the spent units run short (breeding first, spillover after). The last
    // funded hole may take a partial shot; unfunded holes get nothing.
    const shotU = Math.max(1, Number(sourceShotUnits.get(tokenId)) || u);
    const ordered = hl.slice().sort((a, b) => {
      const ia = _HOLE_PRIORITY.indexOf(a), ib = _HOLE_PRIORITY.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    let remaining = u;
    for (const h of ordered) {
      const give = Math.min(shotU, remaining);
      if (give <= 0) break;
      _unitsIntoHole[h] = (_unitsIntoHole[h] ?? 0) + give;
      remaining -= give;
    }
  }
  for (const [hole, count] of Object.entries(holeAssignments)) {
    if (COUNT_HOLES.has(hole)) {
      sexualStatsDialog.sexual.lifetime[hole] = (sexualStatsDialog.sexual.lifetime[hole] ?? 0) + count;
      _bumpUnits(sexualStatsDialog.sexual, "unitsReceived", hole, _unitsIntoHole[hole] ?? 0);
    }
  }

  if (isMultiSource) {
    sexualStatsDialog.sexual.lifetime.gangbang = (sexualStatsDialog.sexual.lifetime.gangbang ?? 0) + 1;
    if (!sexualStatsDialog.sexual.lifetime.mlReceived) {
      sexualStatsDialog.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    }
    sexualStatsDialog.sexual.lifetime.mlReceived.gangbang =
      (sexualStatsDialog.sexual.lifetime.mlReceived.gangbang ?? 0) + totalCumReceivedThisEvent;
  }

  // -----------------------------------------------
  // Write partner history entries on TARGET
  // -----------------------------------------------
  // Write partner history — one entry per source on TARGET, one entry on SOURCE
  // -----------------------------------------------
  const targetPartnerHistory = structuredClone(await targetActor.getFlag(FLAG, "partnerHistory") ?? []);
  const eventDate = game.time.worldTime;

  for (const [tokenId, cumUnitsSpent] of sourceCumSpent.entries()) {
    const sourceToken = sourceTokens.find(t => t.id === tokenId);
    if (!sourceToken) continue;
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    const holes = Array.from(sourceHolesMap.get(tokenId) ?? []);
    const mlGiven = cumUnitsSpent * AFLP.CUM_UNIT_ML;

    // Increment lifetime cumReceived unit counter on target
    sexualStatsDialog.sexual.lifetime.cumReceived =
      (sexualStatsDialog.sexual.lifetime.cumReceived ?? 0) + cumUnitsSpent;

    // Target's entry: they received cum from sourceActor
    // mlReceived only — target has a pussy, they didn't give anything in this flow
    targetPartnerHistory.unshift({
      sourceUuid:      sourceActor.uuid ?? "",
      sourceName:      sourceActor.name ?? "Unknown",
      // Size and creature type behind the history titles (Size Queen, Beastmaster).
      // Both were read but never written, so those titles could never award.
      // Cross-system: size from the raw size word, type from the PF2e creature
      // trait or the actor type as a fallback (DH/5e).
      sourceSize:      String(sourceActor?.system?.size ?? sourceActor?.system?.traits?.size?.value ?? "med").toLowerCase(),
      sourceType:      (sourceActor?.system?.traits?.value ?? []).find?.(t => ["aberration","animal","astral","beast","celestial","construct","dragon","dream","elemental","ethereal","fey","fiend","fungus","giant","humanoid","monitor","ooze","plant","spirit","undead","vampire"].includes(t))
                        ?? sourceActor?.type ?? "creature",
      date:            eventDate,
      holes,
      mlReceived:      mlGiven,          // legacy: frozen at the then-current setting
      unitsReceived:   cumUnitsSpent,     // canonical: Cum Shot units, setting-independent
      pregnancyResult: sourcePregnancyResult.get(tokenId) ?? null
    });

    // Source's entry: they gave cum to targetActor
    // Also record mlReceived if target came back into them (bothHaveCocks path)
    const sourcePartnerHistory = structuredClone(await sourceActor.getFlag(FLAG, "partnerHistory") ?? []);
    const srcReceivedMl = bothHaveCocks && targetCumsIntoSource
      ? Object.values(targetCumGivenMl).reduce((a, b) => a + b, 0)
      : undefined;
    const srcEntry = {
      sourceUuid:      targetActor.uuid ?? "",
      sourceName:      targetActor.name ?? "Unknown",
      date:            eventDate,
      holes,
      mlGiven,
      pregnancyResult: sourcePregnancyResult.get(tokenId) ?? null
    };
    if (srcReceivedMl > 0) srcEntry.mlReceived = srcReceivedMl;
    sourcePartnerHistory.unshift(srcEntry);
    if (sourcePartnerHistory.length > 100) sourcePartnerHistory.splice(100);

    // Merge history into the stashed update and flush all source writes in one call
    const srcDelta = sourceSexualDeltas.get(tokenId);
    if (srcDelta?._update && srcDelta?._actor) {
      srcDelta._update[`flags.${FLAG}.partnerHistory`] = sourcePartnerHistory;
      await AFLP.gm.run("updateActor", srcDelta._actor, srcDelta._update);
      srcDelta._flushed = true;
    } else {
      // Fallback if this source wasn't in sexualDeltas (no cock, edge case)
      await AFLP.gm.run("setFlag", sourceActor, "partnerHistory", sourcePartnerHistory);
    }
  }

  // Flush any source actors that had sexual/cum updates but no history entry
  for (const [tokenId, delta] of sourceSexualDeltas.entries()) {
    if (!delta._flushed && delta._update && delta._actor) {
      await AFLP.gm.run("updateActor", delta._actor, delta._update);
    }
  }

  // If target came into source (bothHaveCocks), write that as a separate entry on target's history
  if (bothHaveCocks && targetCumsIntoSource && Object.keys(targetCumsIntoSource).length) {
    const tgtGivenTotal = Object.values(targetCumGivenMl).reduce((a, b) => a + b, 0);
    if (tgtGivenTotal > 0) {
      // Add entry to target's own history showing what they gave
      targetPartnerHistory.unshift({
        sourceUuid:      sourceActor0.uuid ?? "",
        sourceName:      sourceActor0.name ?? "Unknown",
        date:            eventDate,
        holes:           Object.keys(targetCumsIntoSource),
        mlGiven:         tgtGivenTotal,
        pregnancyResult: null
      });
    }
  }

  // Cap history at 100 entries
  if (targetPartnerHistory.length > 100) targetPartnerHistory.splice(100);

  // -----------------------------------------------
  // Save all target state — one batched actor.update() for the whole event.
  // Collect everything into _tgtUpdate first, then write once.
  // -----------------------------------------------
  const _tgtUpdate = {};

  if (AFLP.Settings.cumflationInHscene) {
    await AFLP_Cumflation.saveCumflation(targetActor, cumFlags, cumOverflow);
    await AFLP_Cumflation.applyCumflationEffects(targetActor);

    // Compute cumflation delta and backfill into the history entries we just wrote.
    // cumFlags has been mutated in-place by applyCumflation, so it now holds post-cum values.
    const cumflationAfter = { anal: cumFlags.anal ?? 0, oral: cumFlags.oral ?? 0, vaginal: cumFlags.vaginal ?? 0, facial: cumFlags.facial ?? 0, bodyCoat: cumFlags.bodyCoat ?? 0 };
    const cumflationDelta = {};
    for (const hole of ["anal", "oral", "vaginal", "facial", "paizuri"]) {
      const d = cumflationAfter[hole] - (cumflationBefore[hole] ?? 0);
      if (d !== 0) cumflationDelta[hole] = d;
    }
    if (Object.keys(cumflationDelta).length) {
      const addedCount = sourceCumSpent.size + (bothHaveCocks && targetCumsIntoSource ? 1 : 0);
      for (let i = 0; i < Math.min(addedCount, targetPartnerHistory.length); i++) {
        targetPartnerHistory[i].cumflationDelta = cumflationDelta;
      }
    }
  }

  _tgtUpdate[`flags.${FLAG}.partnerHistory`] = targetPartnerHistory;
  _tgtUpdate[`flags.${FLAG}.sexual`]         = sexualStatsDialog.sexual;

  // Include deferred target cum deduction if target also came (bothHaveCocks path)
  if (sexualStatsDialog._tgtCumDeferred) {
    _tgtUpdate[`flags.${FLAG}.cum`] = sexualStatsDialog._tgtCumDeferred;
  }

  // Cum Slut: +2 Horny when cum lands on/in target (all levels).
  // L7: Dazzled/Blinded from facials are suppressed in _applyFacialVision (cumflation.js).
  // L7: if Exposed 2 and Facial Cumflation >= 6, Escape attempts auto-succeed (reminder).
  if (AFLP.Settings.automation && AFLP.actorHasKink(targetActor, "cum-slut")) {
    const csLevel    = AFLP.getKinkLevel(targetActor, "cum-slut");
    const liveTarget = AFLP.system.liveActor(targetActor);
    // Through AFLP.horny, not a hand-rolled bag stashed in _tgtUpdate. Two bugs
    // in one line: the bag is not the store on Daggerheart, and batching the
    // write into _tgtUpdate meant the NEXT reader in this function computed
    // against a value that had not landed yet.
    const _csBefore = AFLP.horny.total(liveTarget);
    const _csAfter  = await AFLP.horny.add(liveTarget, 2);
    if (_csAfter > _csBefore) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${targetActor.name}</strong>'s Cum Slut kink triggers: Horny +2.</p></div>`,
        speaker: { alias: "AFLR" },
      });
    }
    if (csLevel >= 7) {
      const EXPOSED_UUID   = AFLP.system.contentUuid("exposed") ?? "";
      const EXPOSED_N_UUID = AFLP.system.contentUuid("exposed-nude") ?? "";
      const facialCF    = (liveTarget.getFlag(FLAG, "cumflation") ?? {}).facial ?? 0;
      const exposedItem = liveTarget.items?.find(i =>
        i.slug === "exposed" || (i.flags?.core?.sourceId ?? i.sourceId) === EXPOSED_UUID
      );
      const exposedNude = liveTarget.items?.some(i =>
        i.slug === "exposed-nude" || (i.flags?.core?.sourceId ?? i.sourceId) === EXPOSED_N_UUID
      );
      // PF2e ONLY, AND DELIBERATELY SO - do not route this through AFLP.cond.
      //
      // Exposed is a condition ITEM on PF2e and a flag on Daggerheart, so this
      // read is 0 on DH and the announcement below never fires there. That is
      // the correct behaviour, not an oversight: a past session DID wake this
      // read on DH, and the block then announced "Escape attempts automatically
      // succeed" against a Daggerheart Cum Slut card that grants ADVANTAGE on
      // the roll. The wording below is PF2e's rule. If DH ever needs its own
      // Mastery announcement it needs its own block with its own card's wording.
      const exposedLevel = exposedNude ? 2 : (exposedItem?.system?.badge?.value ?? 0);
      if (exposedLevel >= 2 && facialCF >= 6) {
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${targetActor.name}</strong>'s Cum Slut kink (L7): Exposed 2 and Facial Cumflation ${facialCF} — their body is so slick that <strong>Escape attempts automatically succeed</strong> until they clean up.</p></div>`,
          speaker: { alias: "AFLR" },
        });
      }
    }
  }

  // Single write for all target flag changes
  await AFLP.gm.run("updateActor", targetActor, _tgtUpdate);

  // -----------------------------------------------
  // Prose output
  // -----------------------------------------------
  const proseParts = [];
  // A source that ran dry delivers nothing, so the hole narration ("warmth
  // blooming inside...") would describe cum that never existed. The dry line
  // posted by _postDry is the whole story for that source. Only narrate the
  // holes when something was actually delivered this event.
  const _deliveredThisEvent = (totalCumReceivedThisEvent ?? 0) > 0;
  if (!_deliveredThisEvent) {
    // nothing to narrate: _postDry already said what happened.
  } else if (!isMultiSource) {
    for (const hole of selectedHoles) {
      if (HOLE_MESSAGES[hole]) proseParts.push(pick(HOLE_MESSAGES[hole]));
    }
  } else {
    const core = selectedHoles.filter(h => h !== "facial").sort().join("-");
    if (GANGBANG_MESSAGES[core]) proseParts.push(pick(GANGBANG_MESSAGES[core]));
    if (selectedHoles.includes("facial")) proseParts.push(pick(HOLE_MESSAGES.facial));
  }

  // Nothing delivered and nothing bred: _postDry already narrated the whole event,
  // so skip the "is used by" header too rather than pair it with a dry line.
  const _proseWorthPosting = _deliveredThisEvent || impregnationEvents.length > 0;
  const sections = !_proseWorthPosting ? [] : [
    `<strong>${targetActor.name}</strong> is used by <strong>${sourceTokens.map(t => t.name).join(", ")}</strong>.`,
    ...proseParts,
    ...impregnationEvents.map(ev => {
      if (ev.blocked)                 return `<strong>${ev.source}</strong> tries to breed <strong>${targetActor.name}</strong>, but they are already pregnant.`;
      if (ev.deliveryType === "egg") {
        // A Clutch womb converts any breeding to eggs; only call it oviposition
        // when the bearer isn't the one doing the converting.
        const _clAF = targetActor.getFlag(FLAG, "anatomyFeatures") ?? {};
        const _clutched = !!_clAF["pussy-clutch"] || !!_clAF["ass-clutch"];
        return _clutched
          ? `<strong>${ev.source}</strong> bred <strong>${targetActor.name}</strong> - their clutch quickens with ${ev.offspring} eggs!`
          : `<strong>${ev.source}</strong> oviposited ${ev.offspring} eggs inside <strong>${targetActor.name}</strong>!`;
      }
      return `<strong>${ev.source}</strong> impregnated <strong>${targetActor.name}</strong> with ${ev.offspring} offspring!`;
    })
  ];

  // Post hole narrative to scene log; fall back to chat only if no scene is active
  const proseText = sections.join(" ").replace(/<[^>]+>/g, "").trim();
  const proseLines = sections.map(s => s.replace(/<[^>]+>/g, "").trim()).filter(Boolean);

  if (game.user.isGM && window.AFLP?.HScene?._scenes) {
    // Find the scene by PARTICIPANT, not by targetActorId. When a performer with
    // no cock climaxes (Amelia finishing while Leroy is the scene's target), the
    // cum macro's targetActor is the OTHER creature - who is not the scene's
    // target - so a target-only match failed and this prose fell through to chat,
    // while the arousal climax prose (participant-aware) wrote to the scene log.
    // That is the duplicate: the same event described in two places.
    const sceneEntry = [...AFLP.HScene._scenes.entries()]
      .find(([, sc]) => (sc.participants ?? []).some(p => (p.actorId ?? p.tokenId) === targetActor.id))
      ?? [...AFLP.HScene._scenes.entries()]
        .find(([, sc]) => sourceTokens.some(t => (sc.participants ?? []).some(p => p.tokenId === t.id)));
    if (sceneEntry) {
      // Session titles (Airlock Angel: all three holes in one encounter; The
      // Hookup: encounters with no pregnancy) need a per-scene record, since the
      // cum macro resolves one source at a time and closeScene is the encounter
      // boundary. Accumulate the holes this receiver took, per receiver, on the
      // scene object; closeScene reads it.
      const sc = sceneEntry[1];
      sc._receiverHoles = sc._receiverHoles ?? {};
      const set = sc._receiverHoles[targetActor.id] ?? (sc._receiverHoles[targetActor.id] = new Set());
      for (const h of (selectedHoles ?? [])) set.add(h);
      // Post each line separately so they appear as distinct log entries in order
      for (const line of proseLines) {
        AFLP.HScene.addProse(sceneEntry[0], line, "flavor");
      }
    } else {
      // No active scene - fall back to chat
      if (sections.length) ChatMessage.create({ content: sections.join("<br><br>") });
    }
  } else if (!game.user.isGM) {
    // Non-GM clients: skip (GM handles the prose)
  } else {
    if (sections.length) ChatMessage.create({ content: sections.join("<br><br>") });
  }

  // ── Climax relieves arousal for every source that came ──────────────────
  // The auto-cum-at-max flow (_onArousalMax) already floors the runner's
  // arousal before firing this macro, so we only reset a source still sitting
  // at/above its max here - that catches the manual and self-action runs (no
  // scene, no auto-trigger) where nothing else resets it, without stomping the
  // flared-edge floor the auto-flow may have set.
  for (const stok of sourceTokens) {
    try {
      const sa = stok.actor?.getWorldActor?.() ?? stok.actor;
      if (!sa) continue;
      const ar = sa.getFlag(FLAG, "arousal") ?? {};
      const cur = ar.current ?? 0;
      const max = AFLP.HScene?.calcArousalMax?.(sa) ?? ar.max ?? 6;
      if (cur >= max) await AFLP_Arousal?.reset?.(sa, "Cum", stok.id);
    } catch (_) {}
  }
})();