// ===============================
// AFLP Arousal Helper
// ===============================
// Central arousal management. Handles:
//   - increment / decrement with condition bonuses
//   - Submitting +1 bonus automation
//   - Defeated flat check (DC 11) on every arousal increase while Defeated
//   - max calculation (base + Denied + flag overrides)
//   - auto-trigger cum macro when arousal hits max
//
// Exposed as: AFLP_Arousal

window.AFLP_Arousal = {

  // -----------------------------------------------
  // Increment arousal on an actor by amount.
  // Applies Submitting/Horny bonuses if automation enabled.
  // Runs Defeated flat check if actor is Defeated.
  // Triggers cum sequence if max reached.
  // -----------------------------------------------
  async increment(actor, amount, source = "", tokenId = null) {
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("arousalIncrement", actor, amount, source, tokenId);
    if (!actor) return;
    if (!AFLP.Settings.allows("arousal")) return;   // Lewd 3+ only
    const FLAG = AFLP.FLAG_SCOPE;

    // ════════════════════════════════════════════════════════════════════════
    // FOUNDRY ACTOR-RESOLUTION RULE (read this before touching flag reads/writes)
    // ────────────────────────────────────────────────────────────────────────
    // Foundry has TWO kinds of actor instance, and AFLP per-token state
    // (arousal, cum, cumflation, horny, denied, genitalia) must always be
    // read AND written on the SAME one, or values silently desync:
    //
    //   • LINKED token (PCs, named NPCs): token.actor IS the world actor.
    //     canvas.tokens.get(id).actor === game.actors.get(actorId) — same object.
    //
    //   • UNLINKED token (monster mooks, copy-pasted enemies): each placed token
    //     has its OWN synthetic actor (token.actor, .isToken === true). Its id
    //     equals the BASE actor's id, so game.actors.get(actorId) returns the
    //     shared *template*, NOT this token's instance. They are DIFFERENT
    //     objects with DIFFERENT flag stores.
    //
    // THEREFORE: to get the instance whose flags actually drive this token, use
    // token-FIRST resolution:
    //     canvas.tokens.get(tokenId)?.actor ?? actor.token?.actor ?? actor
    // NEVER `game.actors.get(actor.id)` for per-token state — that grabs the
    // template and your write vanishes for unlinked mooks (the bug that made
    // monsters stick at max arousal). `liveActorForBonus` below is the resolved
    // instance; reuse it for all per-token reads in this function.
    //
    // AND THE SAME GOES FOR HISTORICAL DATA. This block used to end by saying
    // titles, pregnancy and partner history "only ever live on linked/named
    // actors - mooks are disposable, so they don't track it." That is not the
    // design. Ardis, 18 Aug 2026: "unlinked tokens are things like monsters,
    // where the lifetime stats need to be saved against the token not the actor.
    // because we might have a scene with several of the same actor duplicated in
    // a scene to make a group of goblins ... and we need their arousal and what
    // not to be tracked separately."
    //
    // Measured the same day on two unlinked tokens built from ONE base: both
    // report the SAME `id`, so `game.actors.get(id)` collapses them onto the
    // shared template; writing through token A left token B and the base reading
    // `undefined`. A flag set on the base WAS readable through both tokens, so
    // token-first is never worse for a read either.
    // ════════════════════════════════════════════════════════════════════════

    await AFLP.ensureCoreFlags(actor);
    // Arousal current/max go through the system adapter (AFLP.system) so a
    // bridged system (Daggerheart Stress) reads/writes its native resource.
    // calcArousalMax is already adapter-aware via nativeArousalMax.
    const max = AFLP.HScene.calcArousalMax(actor);

    let total          = amount;
    let submittingBonus = 0;
    let hornyBonus      = 0;

    if (AFLP.Settings.automation) {

      const liveActorForBonus = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
      // Submitting is a scene role - bottoming to the dominant - and grants NO
      // Arousal on its own, on any system. It used to hand PF2e a flat +1 on
      // every gain; that is gone, standardised on the Daggerheart reading.
      //
      // Gangslut L1 keeps its rider: it is a kink beat, not a property of the
      // condition, and it still only functions while Submitting.
      const isSubmitting = AFLP.cond.has(liveActorForBonus, "submitting");
      if (!isSubmitting && liveActorForBonus.getFlag(AFLP.FLAG_SCOPE, "_gangslutHorny")) {
        await liveActorForBonus.unsetFlag(AFLP.FLAG_SCOPE, "_gangslutHorny");
      }
      if (isSubmitting) {
        // Gangslut L1: +1 per Dominator past the first (Dominators directed at
        // this Submitting actor in the unified battlemap scene).
        if (AFLP.actorHasKink(liveActorForBonus, "gangslut") && AFLP.Settings.hsceneEnabled) {
          let scene = null;
          for (const s of (AFLP.HScene._scenes?.values?.() ?? [])) {
            if ((s.participants ?? []).some(p => p.tokenId === tokenId || p.actorId === actor.id)) { scene = s; break; }
          }
          if (scene) {
            const me = scene.participants.find(p => p.tokenId === tokenId || p.actorId === actor.id);
            const myTok = me?.tokenId;
            let domCount = 0;
            for (const p of scene.participants) {
              if (p.tokenId === myTok) continue;
              const directedAtMe = p.partnerId === myTok || me?.partnerId === p.tokenId;
              if (!directedAtMe) continue;
              const atkActor = canvas?.tokens?.get(p.tokenId)?.actor ?? game.actors?.get(p.actorId ?? p.tokenId);
              if (AFLP.cond.has(atkActor, "dominating")) domCount++;
            }
            // Gangslut: being outnumbered leaves you Horny rather than handing you
            // Arousal. Submitting grants nothing now, so the kink no longer scales
            // a bonus that does not exist - it makes the crowd itself the source.
            //
            // +1, so it stacks with Horny from anywhere else. But this scan runs on
            // EVERY Arousal gain, so a plain += would ratchet a Gangslut to the cap
            // within one scene. A latch flag grants it once per gangbang: set when
            // the second Dominator arrives, released when the crowd thins or the
            // character stops Submitting, so a fresh gangbang grants again.
            //
            // It lands before the Horny bonus is read below, so it counts toward
            // this very gain.
            const HF    = AFLP.FLAG_SCOPE;
            const latch = !!liveActorForBonus.getFlag(HF, "_gangslutHorny");
            if (domCount > 1) {
              if (!latch) {
                const _before = AFLP.horny.total(liveActorForBonus);
                const _after  = await AFLP.horny.add(liveActorForBonus, 1);
                const granted = _after > _before;
                // Latch even at the cap, so we stop retrying on every single gain.
                await liveActorForBonus.setFlag(HF, "_gangslutHorny", true);
                console.log(`AFLP | ${actor.name} Gangslut: ${domCount} Dominators - `
                  + (granted ? `Horny +1 (now ${_after}/3)` : `already at Horny ${_after}/3, nothing to add`));
              }
            } else if (latch) {
              await liveActorForBonus.unsetFlag(HF, "_gangslutHorny");
            }
          }
        }
        // (Cock (Girthy) no longer adds here: per the item text it is a Sexual
        // Advance rider from the acting source, so it lives in the SA paths via
        // AFLP.girthyArousalBonus - the old canvas scan fired on EVERY gain and
        // could not tell which token was actually acting.)
        // submittingBonus stays 0 and stays in the return shape: gainBreakdownText
        // and postSAChat still destructure it, and a future beat may want it back.
      }

      // Horny bonus: each Horny token adds extra Arousal whenever Arousal climbs.
      // Independent track — Defeat and Bimbofied no longer feed this.
      {
        let hornyValue;
        // This was a correct hand-rolled copy of AFLP.horny.total - the same
        // per-system branch, written out again. Correct duplicates are how the
        // other eight sites came to be wrong: one of them gets edited.
        hornyValue = AFLP.horny.total(liveActorForBonus);
        if (hornyValue > 0) {
          hornyBonus = hornyValue;
          total += hornyValue;
          console.log(`AFLP | ${actor.name} is Horny ${hornyValue} - +${hornyValue} bonus arousal (total +${total} from ${source})`);
        }
      }

      // ── Defeated flat check ─────────────────────────────────────────
      // Rule: "When your Arousal increases, Defeated's duration resets and
      // you roll a DC 11 Flat Check. On a failure, this condition ends and
      // you gain Mind Break 1."
      // Fires on every arousal increment, not just at cum.
      await AFLP_Arousal._checkDefeatedFlatCheck(actor, tokenId);
    }

    const prev = AFLP.system.getArousalCurrent(actor);
    const next = Math.min(prev + total, max);
    await AFLP.system.setArousalCurrent(actor, next, max);

    console.log(`AFLP | ${actor.name} arousal: ${prev} → ${next}/${max} (+${total} from ${source})`);

    // Lovense: emit arousal tier event
    if (window.AFLP_Lovense) AFLP_Lovense.emitArousal(actor, next, max);

    // Refresh H-Scene card arousal bars — after flag write so bars read updated value
    if (AFLP.Settings.hsceneEnabled) {
      // Small timeout ensures the flag has propagated before we re-read it for the bar
      setTimeout(() => AFLP.HScene.refreshArousalForActor(actor.id), 50);
    }

    // Self-scene: if this actor's Arousal rose while they are NOT in any scene,
    // they are pleasuring themselves - open a one-participant self-scene so they
    // get the Cum / Edge buttons and the Masturbating (self-absorbed) status. A
    // partnered advance always starts its scene first, so being scene-less here
    // means the gain is self-directed.
    //
    // IT NOW OPENS AT MAX TOO, WHICH IS THE WHOLE POINT. This used to read
    // `next < max`, so the one case that most needed the buttons - the tip-over
    // itself - was the one case that got no scene. markReadyToCum then found no
    // scene, force-resolved, and the run ended at "run the cum macro manually",
    // which is a macro nobody otherwise touches. A climax while not Submitting IS
    // a solo scene; now it looks like one.
    //
    // THE ORIGINAL GUARD'S WORRY IS KEPT, not discarded: "must not spawn a scene
    // it would immediately close". That is only true when the climax resolves in
    // the same tick, which is exactly what _shouldDeferCum answers - false when
    // automation or Edge automation is off, when the Edge dialog is skipped, or
    // for an NPC below the Lewd level that lets NPCs edge. When it DEFERS, the
    // scene is not closed at all: _onArousalMax marks readyToCum, lights the
    // buttons and returns to wait for a click.
    //
    // NOT A NEW CLIMAX PATH. Nothing here resolves a cum - it only makes sure the
    // one existing resolution has a card to land on.
    //
    // Still bails for an actor with no token on the canvas: startSelfScene
    // requires one, so that case keeps the notification fallback.
    // NO LONGER GM-ONLY. It read `game.user.isGM` until 23 Aug 2026, and since
    // `increment` runs on whichever client owns the actor, that meant A PLAYER
    // RAISING THEIR OWN AROUSAL NEVER GOT A SELF-SCENE - measured on one actor
    // and one token: player seat 0 scenes and no card, GM seat scene + card +
    // Masturbating. Their solo climax then auto-resolved instead of offering
    // Cum/Edge, because `markReadyToCum` force-resolves when it finds no scene.
    //
    // Ardis, 23 Aug 2026: "a player should be able to open their own self-scene."
    // The start is routed to the GM (see the `startSelfScene` op registration at
    // the foot of this file) because scene state is GM-authoritative; the sync
    // brings the card back to every client including the player's.
    if (AFLP.Settings.hsceneEnabled && total > 0
        && (next < max || AFLP_Arousal._shouldDeferCum(actor))
        && !AFLP.HScene?.sceneForActor?.(actor.id)) {
      // AWAITED ON PURPOSE - the `_onArousalMax` call below depends on the scene
      // existing. See the op's comment.
      try { await AFLP.gm.runOnGM("startSelfScene", actor, tokenId); } catch (_) {}
    }

    // Auto-trigger cum sequence if max reached
    if (next >= max) {
      await AFLP_Arousal._onArousalMax(actor, tokenId);
    }

    return { current: next, applied: total, base: amount, submittingBonus, hornyBonus };
  },

  // -----------------------------------------------
  // Post the SA chat card from module code so the display logic is
  // always current regardless of which version of the macro is running.
  // Called from aflp-sexual-advance.js after both increments complete.
  // -----------------------------------------------
  async postSAChat(sourceActor, targetActor, sourceGain, targetGain) {
    function gainLine(g, baseName) {
      if (!g) return `<strong>2 Arousal</strong>`;
      const { applied, base, submittingBonus, hornyBonus } = g;
      if (submittingBonus === 0 && hornyBonus === 0) return `<strong>${applied} Arousal</strong>`;
      const parts = [`${base ?? 2} base`];
      if (submittingBonus > 0) parts.push(`+${submittingBonus} Submitting`);
      if (hornyBonus      > 0) parts.push(`+${hornyBonus} Horny`);
      return `<strong>${applied} Arousal</strong> (${parts.join(", ")})`;
    }

    const noBonuses = g => !g || (g.submittingBonus === 0 && g.hornyBonus === 0);
    const sameSimple = noBonuses(sourceGain) && noBonuses(targetGain)
      && (sourceGain?.applied ?? 2) === (targetGain?.applied ?? 2);

    // Girthy note: the Sexual Advance rider (+1 to a Submitting target, +2 with
    // Stretch King L5+). Recomputed here so the card shows the amount actually
    // applied by the SA paths via AFLP.girthyArousalBonus.
    const _girthyAmt = AFLP.girthyArousalBonus?.(sourceActor, targetActor) ?? 0;
    const girthyNote = _girthyAmt > 0
      ? `<p style="font-size:11px;color:#806040;"><em>Cock (Girthy): ${AFLP.system.deltaText(_girthyAmt, "bonus Arousal")} to the Submitting target.</em></p>`
      : "";

    // Worn gear riders. A chat card reporting a roll must name every die that
    // fed it, and the same goes for a gain: three synchronous pieces stacking
    // with Horny is a big number arriving with no explanation otherwise.
    const _gearT = AFLP.gearArousalBonus?.(targetActor) ?? 0;
    const _gearS = AFLP.gearArousalBonus?.(targetActor, { forPartner: true }) ?? 0;
    const gearNote = (_gearT > 0 || _gearS > 0)
      ? `<p style="font-size:11px;color:#806040;"><em>Worn gear: ${_gearT > 0 ? `${AFLP.system.deltaText(_gearT, "bonus Arousal")} to ${targetActor.name}` : ""}${_gearT > 0 && _gearS > 0 ? ", " : ""}${_gearS > 0 ? `${AFLP.system.deltaText(_gearS, "bonus Arousal")} to ${sourceActor.name}` : ""}.</em></p>`
      : "";

    const content = `<div class="aflp-chat-card">
      <p><strong>${sourceActor.name}</strong> uses <strong>${AFLP.system?.id === "daggerheart" ? "Carnal Press" : "Sexual Advance"}</strong> on <strong>${targetActor.name}</strong>!</p>
      ${sameSimple
        ? `<p>Both <strong>${AFLP.system.deltaText(sourceGain?.applied ?? 2)}</strong>.</p>`
        : `<ul style="margin:2px 0 4px 16px;padding:0">
            <li>${sourceActor.name} ${AFLP.system.markVerb}s ${gainLine(sourceGain)}</li>
            <li>${targetActor.name} ${AFLP.system.markVerb}s ${gainLine(targetGain)}</li>
          </ul>`
      }
      ${girthyNote}
      ${gearNote}
    </div>`;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
  },

  // -----------------------------------------------
  // Decrement arousal
  // -----------------------------------------------
  // -----------------------------------------------
  // Shared helper: format an arousal gain breakdown string for chat messages.
  // g = return value from increment() { applied, base, submittingBonus, hornyBonus }
  // Returns e.g. "+4 Arousal (2 base, +2 Submitting, +1 Horny 1)"
  // If no bonuses, returns "+N Arousal".
  // -----------------------------------------------
  gainBreakdownText(g, baseFallback = 2) {
    if (!g) return `+${baseFallback} Arousal`;
    const { applied, base, submittingBonus, hornyBonus } = g;
    if (!submittingBonus && !hornyBonus) return `+${applied} Arousal`;
    const parts = [`${base ?? baseFallback} base`];
    if (submittingBonus > 0) parts.push(`+${submittingBonus} Submitting`);
    if (hornyBonus      > 0) parts.push(`+${hornyBonus} Horny`);
    return `+${applied} Arousal (${parts.join(", ")})`;
  },

  async decrement(actor, amount, source = "") {    if (!actor) return;
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("arousalDecrement", actor, amount, source);
    await AFLP.ensureCoreFlags(actor);
    const prev = AFLP.system.getArousalCurrent(actor);
    const next = Math.max(0, prev - amount);
    await AFLP.system.setArousalCurrent(actor, next);

    console.log(`AFLP | ${actor.name} arousal: ${prev} → ${next} (-${amount} from ${source})`);

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.refreshArousalForActor(actor.id);
    }

    return next;
  },

  // -----------------------------------------------
  // Set arousal to a specific value
  // -----------------------------------------------
  async set(actor, value, source = "", tokenId = null) {
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("arousalSet", actor, value, source, tokenId);
    if (!actor) return;
    const max  = AFLP.HScene.calcArousalMax(actor);
    const next = Math.max(0, Math.min(value, max));
    await AFLP.system.setArousalCurrent(actor, next, max);

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.refreshArousalForActor(actor.id);
    }

    if (next >= max) {
      await AFLP_Arousal._onArousalMax(actor, tokenId);
    }

    return next;
  },

  // -----------------------------------------------
  // Reset arousal to 0 (daily prep, rest, etc.)
  // -----------------------------------------------
  async reset(actor, source = "reset", tokenId = null) {
    if (!AFLP.gm.canWrite(actor)) return AFLP.gm.run("arousalReset", actor, source, tokenId);
    return AFLP_Arousal.set(actor, 0, source, tokenId);
  },

  // -----------------------------------------------
  // Defeated flat check — fires on every arousal increment while actor
  // has the Defeated condition.
  // Rule: DC 11 flat check. Failure → remove Defeated, apply Mind Break 1.
  // Increments timesMindBroken if it fails.
  // Uses a per-actor debounce so rapid arousal bumps in the same tick
  // only roll once (e.g. Submitting bonus granting +2 in one call).
  // -----------------------------------------------
  // Find the Dominator pressing this actor in their current H-Scene: a
  // participant directed at them who holds Dominating (the reliable signal - a
  // successful Carnal Press grants it), falling back to Bullified or a raw
  // adversary/NPC. Returns null outside a scene, or when nobody is dominating
  // them (an environmental effect, say), which sends the DC to its flat fallback.
  _findDominatorFor(actor, tokenId = null) {
    try {
      const scene = AFLP.HScene?.sceneForActor?.(actor.id);
      if (!scene) return null;
      const parts = scene.participants ?? [];
      const myTok = tokenId ?? parts.find(p => p.actorId === actor.id)?.tokenId;
      const meP   = parts.find(p => p.tokenId === myTok);
      let fallback = null;
      for (const p of parts) {
        if (p.tokenId === myTok) continue;
        const directed = p.partnerId === myTok || meP?.partnerId === p.tokenId;
        if (!directed) continue;
        const pa = canvas?.tokens?.get(p.tokenId)?.actor ?? game.actors.get(p.actorId ?? p.tokenId);
        if (!pa) continue;
        if (AFLP.cond?.has?.(pa, "dominating")) return pa;
        if (!fallback && (AFLP.cond?.has?.(pa, "bullified")
          || pa.type === "adversary" || pa.type === "npc")) fallback = pa;
      }
      return fallback;
    } catch (e) { return null; }
  },

  async _checkDefeatedFlatCheck(actor, tokenId = null) {
    if (!AFLP.Settings.allows("sexualDefeat")) return;   // Lewd 4+ only
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    if (!AFLP.cond.has(liveActor, "defeated", tokenId)) return;

    // THE DURATION RESET, which was a comment and nothing else. The card: "When
    // your Arousal increases, defeat's duration resets AND you roll a DC 11 Flat
    // Check." Only the roll half existed - and it could not have worked anyway,
    // because the flag migration deleted the effect that carried the clock. PF2e
    // now mirrors timed conditions as real effects (pf2e-adapter._syncTimedMirror)
    // and this re-stamps the start, so a creature under continuous pressure stays
    // Defeated while one left alone expires after a minute. No-op on Daggerheart,
    // which has no Defeated and no durations. Added 20 Aug 2026.
    await AFLP.cond.refresh(liveActor, "defeated", tokenId);

    // Debounce: only one flat check per actor per event loop tick
    const debounceKey = `_aflpDefeatedCheck_${actor.id}`;
    if (window[debounceKey]) return;
    window[debounceKey] = true;
    setTimeout(() => { delete window[debounceKey]; }, 100);

    // PF2e keeps its DC 11 flat check - an established idiom of that system.
    // 5e uses a real Wisdom saving throw against the Dominator's DC, so the
    // character sheet decides: a wise character genuinely resists corruption, a
    // witless one is genuinely prey.
    //
    // 5e RAW does NOT auto-fail a save on a natural 1 (only attack rolls and
    // death saves do that), which would leave a high-Wisdom character permanently
    // immune to Mind Break. AFLR's own degreeOf treats a natural 1 as a critical
    // failure, imposing a 5% failure floor per Arousal increment regardless of
    // modifier - fortitude buys time, not invulnerability. Deliberate deviation
    // from RAW; documented in the guide.
    let success;
    if (AFLP.system?.id === "dnd5e") {
      const dominator = AFLP_Arousal._findDominatorFor(actor, tokenId);
      const dc     = AFLP.mindBreakSaveDC(liveActor, dominator);
      const res    = await AFLP.system.rollResist(liveActor, { dc, kind: "wis" });
      const degree = AFLP.system.degreeOf(res.total, dc, res.die);
      success = (degree === "success" || degree === "critSuccess");

      const crit = res.die === 1  ? " (natural 1 - critical failure)"
                 : res.die === 20 ? " (natural 20)" : "";
      const via  = dominator ? ` vs ${dominator.name}` : "";
      const tail = success ? `<p><em>They hold on.</em></p>` : "";
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> - Mind Break save (WIS vs DC ${dc}${via}): <strong>${res.total}</strong>${crit}</p>
          ${tail}
        </div>`,
        speaker: { alias: "AFLP" },
      });
    } else {
      // DUBIOUS CONSENT LOWERS THIS DC, AND NOTHING READ IT. The card and the PF2e
      // guide journal both say so - "Success: your flat check against Defeated is
      // DC 9 instead of 11 while Submitting lasts. Critical success: ... you are
      // immune to Defeat until Submitting ends." The DC was hardcoded 11 and the
      // effect had no reader anywhere in the tree except the status panel, which
      // only DISPLAYS it. So giving in on your own terms bought exactly nothing.
      // Found 20 Aug 2026 by the S4 number sweep; journal-backed, so this is a
      // code defect rather than a card question.
      //
      // The effect's VALUE carries the rung: 1 = success (DC 9), 2 = critical
      // success (immune until Submitting ends). Read through AFLP.cond so it
      // works on whichever store this system keeps it in.
      const _dcRung = Number(AFLP.cond.value(liveActor, "effect-dubious-consent", tokenId)) || 0;
      if (_dcRung >= 2) {
        // Immune. Announced rather than silent: a check that does not happen has
        // to say why, or it reads as the automation failing.
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> gave in on their own terms - <strong>immune to Defeat</strong> while Submitting lasts (Dubious Consent, critical success). No flat check.</p></div>`,
          speaker: { alias: "AFLP" },
        });
        success = true;
      } else {
        const dc = _dcRung >= 1 ? 9 : 11;
        const roll = await new Roll("1d20").evaluate();
        success = roll.total >= dc;
        await roll.toMessage({
          flavor: `<strong>${actor.name}</strong>  -  Defeated Flat Check (DC ${dc}${_dcRung >= 1 ? ", eased by Dubious Consent" : ""}): ${success ? "Success  -  holds on" : "Failure  -  Mind Break!"}`,
          speaker: { alias: actor.name },
        });
      }
    }

    if (!success) {
      // Remove Defeated
      await AFLP.cond.remove(liveActor, "defeated", tokenId);

      // Apply Mind Break (stack if already present, otherwise apply fresh MB 1)
      await AFLP_Arousal._stackOrApplyMindBreak(liveActor, 1, tokenId);

      // Increment timesMindBroken — mark so createItem hook skips the counter
      // (the hook fires when _stackOrApplyMindBreak creates the item)
      AFLP_Arousal._setCounterDebounce(actor, "mind-break");

      const FLAG   = AFLP.FLAG_SCOPE;
      const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
      sexual.lifetime          = sexual.lifetime ?? {};
      sexual.lifetime.timesMindBroken = (sexual.lifetime.timesMindBroken ?? 0) + 1;
      await actor.setFlag(FLAG, "sexual", sexual);

      // Top-side credit: the tops who Defeated this actor (stashed on the defeat)
      // broke the mind. System-agnostic path - PF2e reaches Mind Break here; DH
      // credits at the defeat overflow instead.
      try {
        const _byIds = actor.getFlag(FLAG, "_defeatedByIds") ?? [];
        for (const _id of _byIds) {
          const _da = game.actors?.get(_id);
          if (_da && _da.id !== actor.id) await AFLP.bumpLifetime(_da, "mindsBroken");
        }
        if (_byIds.length) await actor.update({ [`flags.${FLAG}.-=_defeatedByIds`]: null }).catch(() => {});
      } catch (e) { console.warn("AFLP | mindsBroken credit:", e?.message); }

      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> fails the Defeated check  -  Mind Break!</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Defeated flat check failed - Mind Break applied`);
    } else {
      console.log(`AFLP | ${actor.name} Defeated flat check passed`);
    }
  },

  // -----------------------------------------------
  // Decide whether reaching max Arousal should DEFER the cum (showing the
  // in-card Cum/Edge buttons and waiting for a click) or AUTO-RESOLVE it
  // immediately (the legacy behavior).
  //
  // The interactive button flow applies whenever cum is NOT configured to
  // fire automatically for this actor:
  //   - automation must be on (otherwise nothing fires at all)
  //   - edgeAuto must be on   (edgeAuto off = cum just fires, no choice)
  //   - edgeSkipDialog must be off (on = auto-roll edge then auto-cum)
  //   - if the actor is an NPC, edgeIncludeNpc must be on (else NPCs auto-cum)
  // When any of those fail, cum auto-resolves and the buttons stay hidden.
  // -----------------------------------------------
  _shouldDeferCum(actor) {
    if (!AFLP.Settings.automation) return false;
    if (!AFLP.Settings.edgeAuto) return false;
    if (AFLP.Settings.edgeSkipDialog) return false;
    const isNPC = AFLP.system.isNPC(actor);
    if (isNPC && !AFLP.Settings.edgeIncludeNpc) return false;
    if (isNPC && !AFLP.Settings.allows("npcEdge")) return false;   // Lewd 4+ only
    return true;
  },

  // -----------------------------------------------
  // Called when arousal hits max — full cum sequence:
  //   1. Chat notice
  //   2. Reset arousal
  //   3. Increment timesCummed
  //   4. Mind Break escalation (cumming while mind-broken worsens it)
  //   5. Apply Defeated if a Dominator caused this cum (and not already Defeated)
  //   6. Save flag
  //   7. Fire cum macro (which handles partner history, cumflation, title check)
  //
  // `opts.forceResolve` skips the defer gate (used when the player/GM clicks
  // the in-card Cum button — the cum should resolve immediately).
  // -----------------------------------------------
  async _onArousalMax(actor, tokenId = null, opts = {}) {
    const FLAG = AFLP.FLAG_SCOPE;

    // ── Deferred cum flow ─────────────────────────────────────────────────
    // If interactive buttons apply and this isn't a forced resolve, mark the
    // actor as ready-to-cum, light the in-card buttons, log it, and wait.
    if (!opts.forceResolve && AFLP_Arousal._shouldDeferCum(actor)) {
      const isMasturbation = !!window._aflpMasturbationActor && window._aflpMasturbationActor === actor.id;
      AFLP.HScene?.markReadyToCum?.(actor, tokenId, { isMasturbation });
      return; // wait for an in-card Cum or Edge click
    }

    // ── Edge reaction — attempt before cum resolves ───────────────────────
    // If Edge succeeds the cum is cancelled; return early.
    // Skipped when forceResolve is set (the player already chose Cum, or Edge
    // was already resolved separately via the in-card Edge button).
    if (!opts.forceResolve && AFLP.Settings.automation && AFLP.Kinks?.tryEdge) {
      const isMasturbation = !!window._aflpMasturbationActor && window._aflpMasturbationActor === actor.id;
      window._aflpMasturbationActor = null; // consume immediately
      const edged = await AFLP.Kinks.tryEdge(actor, tokenId, { isMasturbation });
      if (edged) return; // Edge succeeded - no cum this time
    }

    // A lactating climax lets the milk down - produce into the milk pool. Past the
    // defer/edge gates above, so it only fires on an actual climax, not an edge.
    // 2 per climax, and capacity is 2 per point of tits size, so a full pool always
    // takes exactly tits-size climaxes to fill - 4 at size 4, 8 at Hyper.
    // Systems with a pool bank the climax milk and the station catches the
    // spill. Daggerheart has no pool: its milk comes from resting in a harness
    // or station at a flat rate, so a climax banks nothing and the station must
    // not treat the whole offering as overflow - that would turn every climax
    // into two free bottles, which is not what the item promises.
    if (AFLP.milk?.isLactating?.(actor) && AFLP.system?.usesMilkPool?.() !== false) {
      try {
        const offered = AFLP.milk.PER_CLIMAX;
        const landed  = await AFLP.milk.produce(actor, offered);
        // A Living Milking Station takes whatever the pool refused to hold.
        await AFLP.milkingStation?.captureMilk?.(actor, offered, landed);
      } catch (e) { console.warn("AFLP | milk produce failed:", e?.message); }
    }

    // Check if another actor is already mid-cum-sequence this tick (simultaneous cum).
    // We use a shared window map keyed by scene targetId so the second actor to trigger
    // can detect the first and fire a single combined message instead of two dry ones.
    // Find the scene this actor is in, and determine their role.
    // If they're an ATTACKER, the cum goes INTO the scene target (they're the source).
    // If they're the TARGET, the attackers are the sources as normal.
    // Find the unified battlemap scene CONTAINING this cummer, and resolve
    // their current partner from participant.partnerId. The cum routes INTO the
    // partner (the actor this cummer is directed at right now), regardless of
    // who projects as the legacy scene target. This is the cross-pair fix:
    // previously an attacker's cum always went to the projected scene target.
    let scene = null, cummerP = null, partnerTokenId = null, partnerActorId = null;
    if (AFLP.Settings.hsceneEnabled) {
      for (const s of (AFLP.HScene._scenes?.values?.() ?? [])) {
        const p = (s.participants ?? []).find(pp => pp.tokenId === tokenId || pp.actorId === actor.id);
        if (p) { scene = s; cummerP = p; break; }
      }
      if (cummerP?.partnerId) {
        partnerTokenId = cummerP.partnerId;
        const partnerP = scene.participants.find(pp => pp.tokenId === partnerTokenId);
        partnerActorId = partnerP?.actorId ?? null;
      }
    }
    // Pair-specific dedup key for the simultaneous-cum combined message, so two
    // DIFFERENT couples cumming on the same battlemap are not merged. Both
    // partners compute the same key (sorted token-id pair).
    const sceneKey = scene
      ? (partnerTokenId ? [tokenId, partnerTokenId].sort().join("|") : (tokenId ?? actor.id))
      : null;
    const liveActorForCock = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorHasCock = liveActorForCock.getFlag(FLAG, "cock") === true;

    if (sceneKey) {
      if (!window._aflpPendingCum) window._aflpPendingCum = new Map();
      if (window._aflpPendingCum.has(sceneKey)) {
        // Second actor cumming — fire combined message.
        // The first actor (partner) will be the macro runner.
        const partner = window._aflpPendingCum.get(sceneKey);
        window._aflpPendingCum.delete(sceneKey);
        // Designate the first actor as macro runner so only one macro fires.
        window._aflpCumMacroActor = partner.id;
        AFLP.Voice?.play?.("climax", actor);
        try { const _vp = AFLP.system.liveActor(partner); if (_vp) AFLP.Voice?.play?.("climax", _vp); } catch (_) {}

        const combinedLines = [
          `<p>Both <strong>${partner.name}</strong> and <strong>${actor.name}</strong> reach their peak at the same time  -  a shuddering, breathless climax that leaves them tangled and trembling.</p>`,
          `<p><strong>${partner.name}</strong> and <strong>${actor.name}</strong> cum together in a desperate, messy finish  -  neither able to hold back a moment longer.</p>`,
          `<p>The tension snaps all at once. <strong>${partner.name}</strong> and <strong>${actor.name}</strong> go over the edge together, voices breaking, bodies shaking.</p>`,
          `<p><strong>${actor.name}</strong> feels <strong>${partner.name}</strong> cum at the same moment they do  -  it pushes them both that last inch over, helpless and undone.</p>`,
        ];
        const combined = combinedLines[Math.floor(Math.random() * combinedLines.length)];

        // Post combined orgasm narrative to scene log only
        if (game.user.isGM && scene) {
          const combinedPlain = combined.replace(/<[^>]+>/g, "");
          AFLP.HScene.addProse(scene.id, combinedPlain, "flavor");
        }
      } else {
        // First actor — register and post individual message after brief delay
        // so the second actor (if any) can cancel it
        window._aflpPendingCum.set(sceneKey, { name: actor.name, id: actor.id });
        await new Promise(r => setTimeout(r, 80));

        // Still in the map? Nobody else came — fire solo message
        if (window._aflpPendingCum.has(sceneKey) && window._aflpPendingCum.get(sceneKey).id === actor.id) {
          window._aflpPendingCum.delete(sceneKey);
          // Mark this actor as the macro runner for this cum event
          window._aflpCumMacroActor = actor.id;
          AFLP.Voice?.play?.("climax", actor);

          if (actorHasCock) {
            const soloLines = [
              `<p><strong>${actor.name}</strong> can't hold back any longer  -  they cum, hard, with a broken moan they couldn't suppress even if they wanted to.</p>`,
              `<p><strong>${actor.name}</strong> goes over the edge, body shuddering through a climax that leaves them flushed and breathless.</p>`,
              `<p>The arousal finally becomes too much. <strong>${actor.name}</strong> cums with a desperate, gasping cry.</p>`,
              `<p><strong>${actor.name}</strong> tips over, undone  -  a helpless, shaking orgasm that leaves them limp.</p>`,
            ];
            const solo = soloLines[Math.floor(Math.random() * soloLines.length)];
            // Post solo orgasm narrative to scene log only
            if (game.user.isGM && scene) {
              const soloPlain = solo.replace(/<[^>]+>/g, "");
              AFLP.HScene.addProse(scene.id, soloPlain, "flavor");
            }
          }
        }
      }
    } else {
      // No H-Scene — solo message (only for actors with cocks; no-cock path posts its own below)
      if (actorHasCock) {
        const soloLines = [
          `<p><strong>${actor.name}</strong> can't hold back any longer  -  they cum, hard, with a broken moan they couldn't suppress even if they wanted to.</p>`,
          `<p><strong>${actor.name}</strong> goes over the edge, body shuddering through a climax that leaves them flushed and breathless.</p>`,
          `<p>The arousal finally becomes too much. <strong>${actor.name}</strong> cums with a desperate, gasping cry.</p>`,
        ];
        const solo = soloLines[Math.floor(Math.random() * soloLines.length)];
        await ChatMessage.create({
          content: `<div class="aflp-chat-card">${solo}</div>`,
          speaker: { alias: "AFLP" },
        });
      }
    }

    // Reset arousal immediately so we don't re-trigger.
    // Collect all flag writes to this actor into one batched update at the end.
    //
    // Cock (Flared) edging: a creature that climaxes while Submitting to a
    // Dominating creature with a Flared cock floors its Arousal at 3 instead of
    // 0, kept simmering at the edge. It still has to climb back to max to cum
    // again, so this is a faster re-cum, not an instant-repeat loop.
    // Hypnosis sink rule C: climaxing at the entrancer's hands deepens
    // Entranced to Hypnotized. "At their hands" = the climaxer is Submitting
    // and the entrancer (tracked, or any Dominating creature when untracked)
    // is Dominating on the canvas. Solo or unrelated climaxes never sink.
    try {
      if ((AFLP.cond?.value?.(actor, "entranced") ?? 0) >= 1 && AFLP.cond.has(actor, "submitting")) {
        const _by = actor.getFlag?.(AFLP.FLAG_SCOPE, "entrancedBy") ?? null;
        const dom = canvas?.tokens?.placeables?.find(t =>
          t.actor && t.actor.id !== actor.id && AFLP.cond.has(t.actor, "dominating")
          && (!_by || t.actor.id === _by));
        if (dom) await AFLP.hypnoSink?.(actor, dom.actor);
      }
    } catch (e) { /* sink is non-fatal */ }
    let _floor = 0;
    // Ass (Cumfinity): a climax that came from anal stimulation - fucked, fingered,
    // a toy, foreplay, anything - leaves you still on the edge instead of spent.
    // Arousal floors one below max, so the next climax is a step away rather than a
    // climb. Modelled on Cock (Flared) below, which is the same shape at floor 3.
    try {
      const _af = actor.getFlag(FLAG, "anatomyFeatures") ?? {};
      if (_af["ass-cumfinity"] === true && AFLP.cumfinityAnal?.(actor, tokenId, opts)) {
        _floor = Math.max(_floor, (actor.getFlag(FLAG, "arousal")?.max ?? 6) - 1);
      }
    } catch (e) { /* non-fatal */ }
    try {
      if (AFLP.cond.has(actor, "submitting")) {
        const FLAG_S = AFLP.FLAG_SCOPE;
        const flaredDom = canvas?.tokens?.placeables?.find(t =>
          t.actor && t.actor.id !== actor.id && AFLP.cond.has(t.actor, "dominating")
          && (t.actor.getFlag(FLAG_S, "anatomyFeatures") ?? {})["cock-flared"] === true);
        if (flaredDom) _floor = 3;
      }
    } catch (e) { /* canvas unavailable */ }
    const arousal = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
    const _resetMax = arousal.max ?? 6;
    if (_floor > _resetMax - 1) _floor = Math.max(0, _resetMax - 1);
    arousal.current = _floor;
    const _batchedFlags = { [`flags.${FLAG}.arousal`]: arousal };

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.incrementSceneOrgasm(actor.id, tokenId);
    }

    // ── Horny persists through cum ────────────────────────────────────────
    // Horny no longer clears on orgasm. Temp Horny is shed when the character
    // completes daily preparations (the AFLP Daily Preparations macro clears it).
    // Permanent Horny always persists.

    // ── Lifetime counter: timesCummed ──────────────────────────────────
    const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
    sexual.lifetime                = sexual.lifetime ?? {};
    sexual.lifetime.timesCummed    = (sexual.lifetime.timesCummed ?? 0) + 1;

    if (AFLP.Settings.automation) {
      // Resolve the live token actor so condition reads/writes hit the synthetic
      // instance for unlinked tokens rather than the world actor template.
      const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

      // ── Mind Break escalation - PATHFINDER AND 5e ONLY ───────────────
      // Rule, on the systems that HAVE a Mind Break track: "When you cum your
      // Mind Break level increases by 1."
      //
      // DAGGERHEART IS EXCLUDED AND THAT IS NOT AN OVERSIGHT. On Daggerheart
      // Mind Break is a death move - the thing that happens when your last Hit
      // Point is marked - not a badged condition with a level to deepen. It is
      // listed in the DH adapter's AFLR_HUD_CONDS so a GM can mark it on the
      // token HUD, which means AFLP.cond.value returns a NUMBER for it there,
      // which is exactly why this block used to fire on Daggerheart: it gated on
      // the value being above zero and never asked which system it was on.
      //
      // Measured in dh-test, 17 Aug 2026: one climax on a mind-broken DH PC
      // announced "Mind Break deepens to 2" - Pathfinder's rule, in Pathfinder's
      // words - and opened TWO "Mind Break - Creature Fetish" dialogs, a
      // Pathfinder subsystem, on a Daggerheart character. Reported by Ardis the
      // same day: "not a thing in dh... pf2e code leaking?". It was.
      //
      // Daggerheart's own answer to "you climax while mind-broken" is NOT YET
      // DESIGNED. Suppressing the wrong behaviour is deliberate and is not the
      // same as building the right one. WHAT WOULD MAKE THIS STALE: a Daggerheart
      // Mind Break rule being written; put it in the else branch, not here.
      const _mbSystemHasTrack = AFLP.system?.id !== "daggerheart";
      const mindBreakVal = _mbSystemHasTrack ? AFLP.cond.value(liveActor, "mind-break", tokenId) : 0;
      if (mindBreakVal > 0) {
        const newMBValue = mindBreakVal + 1;
        await AFLP.cond.setValue(liveActor, "mind-break", newMBValue, tokenId);
        await ChatMessage.create({
          content: `<div class="aflp-chat-card">
            <p><strong>${actor.name}</strong>'s Mind Break deepens to ${newMBValue}!</p>
          </div>`,
          speaker: { alias: "AFLP" },
        });
        console.log(`AFLP | ${actor.name} Mind Break escalated to ${newMBValue} (cummed while mind-broken)`);
      }

      // ── Horny: a climax while NOT Submitting adds a Horny token ──────
      // The climax rule, now shared by every system: a Submitting climax marks
      // Defeat (below); any other climax marks Horny instead. Gating on
      // !Submitting keeps the two mutually exclusive and preserves Defeat-immunity
      // benefits (e.g. Gangslut L5) rather than handing out a consolation token.
      // Horny persists until a long rest, so indulgence between fights is what
      // makes a character fragile in the next one.
      //
      // The write path differs: DH keeps Horny as a valued condition, PF2e and 5e
      // as a {temp, permanent} flag whose SUM the arousal bonus reads, capped at 3.
      if (!AFLP.cond.has(liveActor, "submitting", tokenId)) {
        const F = AFLP.FLAG_SCOPE;
        if (AFLP.system.id === "daggerheart") {
          const hv = AFLP.cond.value(liveActor, "horny", tokenId) ?? 0;
          if (hv < 3) {
            await AFLP.cond.setValue(liveActor, "horny", Math.min(3, hv + 1), tokenId);
            console.log(`AFLP | ${actor.name} Horny token on climax (${Math.min(3, hv + 1)}/3)`);
          }
        } else {
          const _before = AFLP.horny.total(liveActor);
          const _after  = await AFLP.horny.add(liveActor, 1);
          if (_after > _before) console.log(`AFLP | ${actor.name} Horny on climax (${_after}/3)`);
        }
      }

      // ── Apply Defeated when a Submitting creature climaxes ──────────
      // Rule: "climax while Submitting and you are Defeated." No Dominator is
      // required - yielding to a willing partner costs what yielding to a monster
      // costs. Dominators are still counted, but only to drive Gangslut L5's
      // immunity. Mind Break supersedes Defeated.
      const cummerTok = cummerP?.tokenId ?? tokenId;
      const cummerIsSubmitting = AFLP.cond.has(liveActor, "submitting", tokenId);
      const isAlreadyDefeated  = AFLP.cond.has(liveActor, "defeated", tokenId);
      const hasMindBreak       = AFLP.cond.has(liveActor, "mind-break", tokenId);
      const isDH = AFLP.system.id === "daggerheart";
      // DH: Defeat is its own 0-3 track, gained on climax while Submitting to an
      // adversary — independent of Mind Break and Bimbofied. PF2e keeps the
      // single Defeated state (blocked once already Defeated or Mind Broken).
      const defeatNow = isDH ? (AFLP.cond.value(liveActor, "defeat", tokenId) ?? 0) : 0;
      // DUBIOUS CONSENT RUNG 2 BLOCKS THE GAIN ITSELF, which is where the card puts
      // it: badge label 2 is literally "Cannot gain Defeated", and the guide says
      // "you are immune to Defeat until Submitting ends". Rung 1 only eases the
      // flat check and is read in _checkDefeatedFlatCheck; rung 2 has to act HERE,
      // because a creature that cannot gain Defeated never reaches that check.
      // Nothing read the effect at either point until 20 Aug 2026 - the whole
      // reaction, which costs a player their reaction to use, did nothing.
      const _dubCon = Number(AFLP.cond.value(liveActor, "effect-dubious-consent", tokenId)) || 0;
      const canDefeat = (_dubCon < 2)
        && (isDH ? !hasMindBreak : (!isAlreadyDefeated && !hasMindBreak));

      // A silent block reads as the automation failing. Say it happened, once.
      if (scene && cummerIsSubmitting && _dubCon >= 2 && AFLP.Settings.allows("sexualDefeat")) {
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> climaxed while Submitting, but gave in on their own terms - <strong>immune to Defeat</strong> while Submitting lasts (Dubious Consent, critical success).</p></div>`,
          speaker: { alias: "AFLP" },
        }).catch(() => {});
      }

      if (scene && cummerIsSubmitting && canDefeat && AFLP.Settings.allows("sexualDefeat")) {
        // The party the cummer submits to: a participant directed at the cummer
        // who is an adversary, a Bullified PC (adversary mode), or Dominating.
        const isDomActor = (a) => a && (a.type === "adversary" || AFLP.cond.has(a, "bullified") || AFLP.cond.has(a, "dominating"));
        const dominators = [];
        for (const p of (scene.participants ?? [])) {
          if (p.tokenId === cummerTok) continue;
          const directedAtCummer = p.partnerId === cummerTok || cummerP?.partnerId === p.tokenId;
          if (!directedAtCummer) continue;
          const pa = canvas?.tokens?.get(p.tokenId)?.actor ?? game.actors.get(p.actorId ?? p.tokenId);
          if (isDomActor(pa)) dominators.push(p);
        }
        // Submitting IS the trigger. A Dominator is no longer required - yielding
        // to a willing partner costs the same as yielding to a monster, which is
        // what the DH glossary always said and what the code never did. The
        // Dominator scan survives only to drive Gangslut's immunity.
        const dominated = dominators.length > 0;

        // Gangslut L5: immune to Defeated while 2+ Dominators target them (level 5+).
        const _gsLevel = AFLP.getKinkLevel(actor, "gangslut");
        let defeatBlocked = false;
        if (_gsLevel >= 5 && AFLP.actorHasKink(actor, "gangslut") && dominators.length >= 2) {
          defeatBlocked = true;
          console.log(`AFLP | ${actor.name} Gangslut L5: Defeated blocked (${dominators.length} Dominators)`);
        }

        if (!defeatBlocked) {
          // Top-side credit, shared by both system branches. Resolve the
          // dominator ACTORS once. A willing-partner submission has no dominator
          // (dominators is empty), so nobody is credited - correct, nobody
          // dominated them. Stash the ids so the PF2e Mind Break flat check,
          // which fires on a LATER climax in _checkDefeatedFlatCheck, can credit
          // the same tops when it breaks the mind.
          const _domActors = dominators
            .map(p => canvas?.tokens?.get(p.tokenId)?.actor ?? game.actors.get(p.actorId ?? p.tokenId))
            .filter(a => a && a.id !== actor.id);
          const _creditDoms = async (key) => { for (const da of _domActors) await AFLP.bumpLifetime(da, key); };
          if (_domActors.length) await AFLP.gm.run("setFlag", actor, "_defeatedByIds", _domActors.map(a => a.id));
          if (AFLP.system.id === "daggerheart") {
            // DH: Defeat is its own 0-3 track. Climax while Submitting to an
            // adversary marks one Defeat token. Past Defeat 3 it overflows into
            // 3 Stress (DH cascade -> HP -> Mind Break), so a trapped creature
            // keeps sliding toward a break instead of plateauing at Defeat 3.
            if (defeatNow < 3) {
              const dn = await AFLP.system.markSpiralToken(liveActor, 1);
              sexual.lifetime.timesDefeated = (sexual.lifetime.timesDefeated ?? 0) + 1;
              await _creditDoms("foesDefeated");
              await ChatMessage.create({
                content: `<div class="aflp-chat-card">
                  <p><strong>${actor.name}</strong> is worn down - <strong>Defeat ${dn ?? "+1"}/3</strong>.</p>
                  <p><em>${dominated ? "Dominated to climax" : "Submitted to climax"}, losing the will to fight back.</em></p>
                </div>`,
                speaker: { alias: "AFLP" },
              });
              console.log(`AFLP | ${actor.name} Defeat token (DH) - climaxed while Submitting${dominated ? " (Dominated)" : ""}`);
            } else {
              const ov = (AFLP.Carnal?.defeatOverflow)
                ? await AFLP.Carnal.defeatOverflow(liveActor, 1)
                : { stressMarked: 0, brokeMind: false };
              // The DH overflow breaks the mind directly (no flat check), so the
              // victim-side counter must be bumped HERE - the shared timesMindBroken
              // write lives only in the PF2e flat-check path, so DH breaks went
              // uncounted. Credit the tops that broke them in the same breath.
              if (ov.brokeMind) {
                sexual.lifetime.timesMindBroken = (sexual.lifetime.timesMindBroken ?? 0) + 1;
                await _creditDoms("mindsBroken");
              }
              await ChatMessage.create({
                content: `<div class="aflp-chat-card">
                  <p><strong>${actor.name}</strong> is already broken down to <strong>Defeat 3/3</strong> - the climax overflows into <strong>+${ov.stressMarked} Stress</strong>${ov.brokeMind ? " and triggers <strong>Mind Break</strong>" : ""}.</p>
                  <p><em>Nothing left to wear down but the mind.</em></p>
                </div>`,
                speaker: { alias: "AFLP" },
              });
              console.log(`AFLP | ${actor.name} Defeat overflow -> +${ov.stressMarked} Stress${ov.brokeMind ? " (Mind Break)" : ""}`);
            }
          } else {
            // Mark so createItem hook skips the counter (we're counting here)
            AFLP_Arousal._setCounterDebounce(actor, "defeated");

            await AFLP_Arousal._applyCondition(liveActor, "defeated", AFLP.system.contentUuid("defeated"), null);
            sexual.lifetime.timesDefeated = (sexual.lifetime.timesDefeated ?? 0) + 1;
            await _creditDoms("foesDefeated");

            await ChatMessage.create({
              content: `<div class="aflp-chat-card">
                <p><strong>${actor.name}</strong> is Defeated!</p>
                <p><em>${dominated ? "Completely dominated sexually" : "Wholly given over to another"}, starting to lose the will to fight back.</em></p>
              </div>`,
              speaker: { alias: "AFLP" },
            });
            console.log(`AFLP | ${actor.name} Defeated - climaxed while Submitting${dominated ? " (Dominated)" : ""}`);
          }
        }
      }
    }

    // ── Save updated lifetime stats — flush ALL pending flag writes in one update ─────
    _batchedFlags[`flags.${FLAG}.sexual`] = sexual;
    await actor.update(_batchedFlags);

    // ── Apply base Afterglow (first partnered climax of a scene only) ────
    // Kept shared across systems. On DH the adapter now treats applyCondition
    // ("afterglow") as a NO-OP (the Hope grant is retired 2026-06 - see
    // DaggerheartAdapter.applyCondition), so this does nothing on DH; the DH
    // on-climax outcome is the Horny/Defeat handled above, and "Afterglow" is
    // just its name. On PF2e this still applies the +1 status-bonus Afterglow
    // item, which is unchanged. Gated per scene via the `afterglowScene` flag,
    // cleared when the scene closes (HScene.closeScene).
    const _partneredClimax = !!partnerTokenId
      || (!!scene && (scene.participants ?? []).some(p => p.tokenId !== tokenId && p.actorId !== actor.id));
    const _afterglowSceneId = scene?.id ?? null;
    const _glowedThisScene  = _afterglowSceneId != null
      && actor.getFlag(FLAG, "afterglowScene") === _afterglowSceneId;
    // NOT ON DAGGERHEART AT ALL, from 4 Sept 2026. Afterglow was retired as a DH
    // condition by Ardis's ruling - on DH the on-climax outcome is the Horny or
    // Defeat token, and Afterglow was only a second name for it. The adapter has
    // no-opped applyCondition("afterglow") since June, so this block already did
    // nothing there; the explicit gate means the DH card can be deleted from the
    // pack without this quietly starting to depend on `contentUuid` returning
    // null. PF2e is unchanged - the +1 status item is real and still applies.
    if (AFLP.system?.id !== "daggerheart" && AFLP.Settings.automation && _partneredClimax && !_glowedThisScene) {
      const afterglowUUID = AFLP.system.contentUuid("afterglow");
      if (afterglowUUID) {
        const liveActorAg = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
        const alreadyHas  = AFLP.cond.has(liveActorAg, "afterglow", tokenId);
        if (!alreadyHas) {
          await AFLP_Arousal._applyCondition(liveActorAg, "afterglow", afterglowUUID, null);
        }
        // Mark this scene so later partnered climaxes don't grant Afterglow again.
        if (_afterglowSceneId != null) {
          await actor.setFlag(FLAG, "afterglowScene", _afterglowSceneId);
        }
      }
    }

    // ── Kink post-cum effects ────────────────────────────────────────────
    if (AFLP.Settings.automation && AFLP.Kinks) {
      // Edge Master (DH): keeps the normal Afterglow and marks an extra Stress.
      // (PF2e path still swaps Afterglow for Sickened 2.)
      await AFLP.Kinks.onCumPostEffect(actor, tokenId);
      // Aphrodisiac Junkie L7: re-enforce permanent Horny 3 (Horny was just removed above)
      await AFLP.Kinks.enforceAphrodisiacJunkieL7(actor);
      // Aphrodisiac Junkie L7: Stunned 2 to Dominators/Submitting creatures
      await AFLP.Kinks.onCumAphrodisiacJunkieL7(actor);
      // Brood Sow: grants its own Hope on climax (its perk, independent of Afterglow)
      await AFLP.Kinks.onCumBroodSow(actor, tokenId);
      // Voyeurism L5: observers must save vs 2 Arousal
      await AFLP.Kinks.onCumVoyeurism(actor, tokenId);
      // Stretch King: L3/L7 Coomer reminder on cumming inside smaller target
      await AFLP.Kinks.onCumStretchKing?.(actor, tokenId);
      // Hypno L3: suppress Afterglow and gain 1 Arousal while Entranced (once/day)
      await AFLP.Kinks.onCumHypnoSlave?.(actor, tokenId);
      // Pain Slut Mastery (PF2e L5): offer to edge through the arousal crash.
      await AFLP.Kinks.onCumCrashPainSlut?.(actor);
      // Hypno L7: AoE Will-save Entranced pulse while Entranced + Submitting
    }

    // ── Nirvana (Ego Death): a body climaxing while its owner floats in Nirvana
    // banks +1 to the eventual Avoid Death scar roll. No-op otherwise. ─────────
    if (AFLP.Settings.automation && actor.getFlag(FLAG, "nirvana")?.active) {
      await AFLP.Carnal?.bankNirvanaClimax?.(actor);
    }

    // ── Sentient item reactions to cum ───────────────────────────────────
    if (AFLP.Settings.automation && window.AFLP_SentientItems) {
      await AFLP_SentientItems.onActorCum(actor);
    }

    // ── Lovense: peak cum event ──────────────────────────────────────────
    if (window.AFLP_Lovense) AFLP_Lovense.emitCum(actor);

    // ── Fire cum macro ──────────────────────────────────────────────────
    // Only fire if automation is on, an H-Scene exists, AND this actor is the
    // designated macro runner for this cum event.
    // _aflpCumMacroActor is set to actor.id by the first actor in the pending-cum
    // window, and cleared after the macro fires. The second (combined-message)
    // actor skips the macro entirely.
    if (!AFLP.Settings.automation) return;

    // NO SCENE: RESOLVE IT, do not tell the GM to go and find a macro. Reaching
    // here with no scene means the cum was NOT deferred to the in-card buttons -
    // auto-cum, the Edge dialog skipped, or the player already clicked Cum - so
    // there is nothing to wait for and nothing to route through. The cum macro
    // has its own solo path for a climax with no partner, and its narration falls
    // back to chat when there is no scene log to write to, so the resolution
    // posts exactly as it would in a scene.
    //
    // Ardis, 14 Aug 2026: "it should just auto resolve and post the cum resolution
    // to the chat output like normal."
    //
    // The one case that still cannot resolve is an actor with NO TOKEN on the
    // canvas: the macro resolves its cummer from a token, and with none it falls
    // back to whatever the GM happens to have selected - which would climax the
    // wrong creature. That keeps the notification.
    if (!scene) {
      const soloTok = canvas?.tokens?.get(tokenId)
        ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
      if (!soloTok) {
        ui.notifications.info(`AFLP | ${actor.name} has reached max arousal, and has no token on the canvas  -  run the cum macro manually.`);
        return;
      }
      // The pending-cum window is keyed by sceneKey, which is null without a
      // scene, so the macro-runner designation below never happened. Do it here.
      window._aflpCumMacroActor = actor.id;
    }

    if (!window._aflpCumMacroActor || window._aflpCumMacroActor !== actor.id) return;
    window._aflpCumMacroActor = null;

    // Wrap macro execution in try/finally so globals are always cleaned up
    // even if the macro or token setup throws.
    // NOTE: the cum macro reads AND clears _aflpCumSourceTokenIds /
    // _aflpCumTargetTokenId at its very top, so we deliberately do NOT delete
    // them here. Macro.execute() does not reliably await the macro body before
    // this finally runs, so deleting them here could race the macro's read.
    const _cleanupCumGlobals = () => {
      delete window._aflpCumMacroActor;
      if (window._aflpPendingCum) window._aflpPendingCum.delete(sceneKey);
    };
    try {

    // ── No-cock orgasm: record mlGiven (pussy squirt) and post chat, skip macro ──
    if (!actorHasCock) {
      const cum = actor.getFlag(FLAG, "cum") ?? { current: 0, max: 10 };
      // cumPerShot always returns a number (>= 1 on every path), so there is no
      // fallback here. There used to be one - Math.ceil(cum.current / 2) - which
      // was the RETIRED half-your-Cum-Volume formula, unreachable but a trapdoor
      // back to the old system if the guard above ever changed.
      const cumUnitsSpent = AFLP.cumPerShot(actor);
      if (cumUnitsSpent > 0) {
        const sexualNoCock = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
        sexualNoCock.lifetime = sexualNoCock.lifetime ?? {};
        if (!sexualNoCock.lifetime.mlGiven) sexualNoCock.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
        const mlSpray = cumUnitsSpent * AFLP.CUM_UNIT_ML;
        sexualNoCock.lifetime.mlGiven.vaginal = (sexualNoCock.lifetime.mlGiven.vaginal ?? 0) + mlSpray;
        sexualNoCock.lifetime.cumGiven = (sexualNoCock.lifetime.cumGiven ?? 0) + cumUnitsSpent;
        // Batch cum + sexual into one write — skip cum deduction for NPCs with infinite cum on
        const isNPCNoCock = actor.type === "npc";
        const cumUpdate   = ((isNPCNoCock && AFLP.Settings.infiniteCum) || AFLP.hasInfiniteLoads(actor))
          ? {}
          : { [`flags.${FLAG}.cum`]: { current: Math.max(0, cum.current - cumUnitsSpent), max: cum.max } };
        await actor.update({
          ...cumUpdate,
          [`flags.${FLAG}.sexual`]: sexualNoCock,
        });
      }
      const noCockLines = [
        `<p><strong>${actor.name}</strong> cums  -  a hot rush of slick lust, thighs trembling as they soak through.</p>`,
        `<p><strong>${actor.name}</strong> goes over the edge, pussy clenching through the orgasm, soaking wet and shaking.</p>`,
        `<p>A helpless, gushing climax takes <strong>${actor.name}</strong>  -  legs slick, body wrung out and trembling.</p>`,
        `<p><strong>${actor.name}</strong> cums hard, a slippery flood of arousal leaving them boneless and flushed.</p>`,
      ];
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">${noCockLines[Math.floor(Math.random() * noCockLines.length)]}</div>`,
        speaker: { alias: "AFLP" },
      });
      return;
    }

    // Module-aware: prefer a valid world macro (current name first), fall back
    // to this module's own compendium copy. A stale sibling-module stub (old
    // "AFLP Cum" pointing at ardisfoxxs-lewd-pf2e packs in an AFLR world) is
    // detected and skipped by AFLP.getModuleMacro.
    const cumMacro = await AFLP.getModuleMacro({
      world: ["AFLR Cum", "AFLP Cum"], engine: "aflp-cum" });
    if (cumMacro) {
      // Hand the cummer (source) and partner (target) to the cum macro via
      // globals so it can resolve them WITHOUT us changing the GM's on-screen
      // selection or targets. This keeps the user's UI untouched and avoids any
      // race between restoring the selection and the macro reading tokens.
      // NOT GM-ONLY, and it never should have been. This whole chain runs on
      // whichever client owns the CUMMER - a player's own PC - so on a player's
      // client the globals were left unset and `cumMacro.execute()` below fired
      // anyway, dropping the macro onto its fallback: `canvas.tokens.controlled`
      // and `game.user.targets`. That is how a player's climax came to resolve
      // against whatever they happened to have selected, and then wrote to it.
      //
      // The gate's stated reason was not to disturb the GM's selection - but a
      // `window` global disturbs no selection on any client. The guard was wider
      // than the thing it was guarding. Found 19 Aug 2026 from a player report of
      // "you must be the GM to affect others"; the writes themselves are proxied
      // in aflp-cum.js, and this is what makes them write to the RIGHT actor.
      {
        const cummingToken = canvas.tokens.get(tokenId)
          ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
        const partnerToken = partnerTokenId
          ? (canvas.tokens.get(partnerTokenId)
             ?? canvas.tokens.placeables.find(t => t.actor?.id === partnerActorId))
          : null;
        // A PARTNER IS OPTIONAL. This used to require BOTH, so a partnerless
        // climax - a scene-less one, or a lone participant in a self-scene -
        // handed the macro nothing and it fell back to `canvas.tokens.controlled`:
        // whatever the GM had selected, which is not necessarily the creature that
        // just came. Naming the cummer is the whole point of these globals.
        //
        // The target is left unset when there is no partner, which is what puts
        // the macro on its solo-cum path. If the GM happens to have exactly one
        // token targeted at that moment the macro treats it as the partner - that
        // is its documented manual behaviour, and identical to what would have
        // happened when the GM ran the macro by hand, which is what this replaces.
        if (cummingToken) {
          window._aflpCumSourceTokenIds = [cummingToken.id];
          if (partnerToken) window._aflpCumTargetTokenId = partnerToken.id;
        }
      }
      await cumMacro.execute();
    } else {
      ui.notifications.warn(`AFLR | ${actor.name} reached max arousal but no 'AFLR Cum' macro found. Run manually.`);
    }
    } catch(e) {
      console.error("AFLP | Error during cum macro execution:", e);
    } finally {
      _cleanupCumGlobals();
      // A self-scene (lone participant) ends when its owner climaxes - close it
      // so the Masturbating status lifts and the card clears. Partnered scenes
      // stay open (they end via removeParticipant / manual close).
      try {
        if (game.user.isGM && scene && (scene.participants ?? []).length <= 1) {
          AFLP.HScene.closeScene(scene.id);
          game.socket.emit("module.ardisfoxxs-lewd-pf2e", { type: "hscene-close", sceneId: scene.id });
        }
      } catch (_) {}
    }
  },

  // -----------------------------------------------
  // Stack Mind Break on an existing condition, or apply a fresh one.
  // If the actor already has Mind Break, increments its value by `amount`.
  // If not, applies a fresh condition at value `amount`.
  // -----------------------------------------------
  async _stackOrApplyMindBreak(actor, amount = 1, tokenId = null) {
    if (!AFLP.Settings.allows("mindBreak")) return;   // Lewd 4+ only
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    if (AFLP.cond.has(liveActor, "mind-break", tokenId)) {
      const newVal = AFLP.cond.value(liveActor, "mind-break", tokenId) + amount;
      await AFLP.cond.setValue(liveActor, "mind-break", newVal, tokenId);
    } else {
      await AFLP_Arousal._applyCondition(liveActor, "mind-break", AFLP.system.contentUuid("mind-break"), amount, tokenId);
    }
  },

  // -----------------------------------------------
  // Set the debounce key used to prevent double-counting in the
  // createItem hook when _onArousalMax or _checkDefeatedFlatCheck
  // is the one applying the condition.
  // -----------------------------------------------
  _setCounterDebounce(actor, slug) {
    const key = `_aflpCondDebounce_${actor.id}_${slug}`;
    window[key] = true;
    setTimeout(() => { delete window[key]; }, 500);
  },

  // -----------------------------------------------
  // Helper: apply an AFLP condition from UUID, with
  // value override for valued conditions (Mind Break).
  // Delegates to the active system adapter (AFLP.system);
  // the condition caps / singular handling and the UUID-vs-
  // fallback logic now live in the adapter so every system
  // shares one path. Signature preserved for existing callers.
  // -----------------------------------------------
  async _applyCondition(actor, slug, uuid, value = null, tokenId = null) {
    return AFLP.system.applyCondition(actor, slug, uuid, value, tokenId);
  },
};

// A player pressing Sexual Advance writes Arousal onto a monster they do not own.
// These four are forwarded to the GM's client rather than throwing a permission
// error and leaving the macro half-finished.
AFLP.gm?.register?.("arousalIncrement", (a, amount, source, tokenId) => AFLP_Arousal.increment(a, amount, source, tokenId));
AFLP.gm?.register?.("arousalSet",       (a, value, source, tokenId) => AFLP_Arousal.set(a, value, source, tokenId));
AFLP.gm?.register?.("arousalReset",     (a, source, tokenId) => AFLP_Arousal.reset(a, source, tokenId));
AFLP.gm?.register?.("arousalDecrement", (a, amount, source) => AFLP_Arousal.decrement(a, amount, source));

// A player raising their OWN Arousal must get the self-scene too.
//
// Ardis, 23 Aug 2026: "a player should be able to open their own self-scene."
//
// It cannot simply be started on their client: scene state is GM-authoritative
// (`_saveSceneState` returns early for a non-GM, and `startScene` only broadcasts
// its sync when `game.user.isGM`), so a player-started scene would exist on
// exactly one screen - the wrong one. The GM starts it and the sync brings it
// back to everyone, which is how the player's card, Cum/Edge buttons and
// Masturbating status all arrive.
//
// It goes through `runOnGM` rather than a raw socket emit because the CALLER
// AWAITS IT. `increment` starts the scene and then, at max, marks ready-to-cum -
// and `markReadyToCum` force-resolves when it finds no scene. A fire-and-forget
// emit races those two and turns a climax that should offer Cum/Edge into one
// that silently auto-resolves.
// The "already in a scene" check is re-made HERE, on the GM, because the caller
// made it against a synced COPY. A player whose sync has not landed yet would
// otherwise ask for a second scene over one that already exists.
AFLP.gm?.register?.("startSelfScene", (a, tokenId) => {
  if (AFLP.HScene?.sceneForActor?.(a?.id)) return false;
  return AFLP.HScene?.startSelfScene?.(a, tokenId);
});
