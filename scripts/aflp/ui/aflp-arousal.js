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
    if (!actor) return;
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
    // Historical/persistent data (titles, pregnancy, partner history) only ever
    // lives on linked/named actors — mooks are disposable, so they don't track it.
    // ════════════════════════════════════════════════════════════════════════

    await AFLP.ensureCoreFlags(actor);
    const arousal = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
    const max     = AFLP.HScene.calcArousalMax(actor);

    let total          = amount;
    let submittingBonus = 0;
    let hornyBonus      = 0;

    if (AFLP.Settings.automation) {
      const hasMonstrousProwess = AFLP.actorHasMonstrousProwess(actor);

      const liveActorForBonus = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
      // Submitting bonus: +1 per Arousal increase while Submitting.
      const isSubmitting = liveActorForBonus.items?.some(c =>
        c.slug === "submitting" ||
        c.sourceId === AFLP.conditions["submitting"].uuid
      );
      if (isSubmitting) {
        submittingBonus = 1;
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
              if (atkActor?.items?.some(c => c.slug === "dominating" || (c.flags?.core?.sourceId ?? c.sourceId) === AFLP.conditions["dominating"]?.uuid)) domCount++;
            }
            if (domCount > 1) submittingBonus += (domCount - 1);
          }
        }
        // Cock (Girthy) or Cock (Flared): +1 additional Submitting arousal.
        // Stacks on top of the base Submitting +1 bonus.
        // Scans canvas for any Dominating token with either cock type.
        const domUUID = AFLP.conditions?.["dominating"]?.uuid ?? "";
        const FLAG_S  = AFLP.FLAG_SCOPE;
        const girthyOrFlaredDom = canvas?.tokens?.placeables?.find(t => {
          if (!t.actor || t.actor.id === (liveActorForBonus.id ?? actor.id)) return false;
          const isDom = t.actor.items?.some(i =>
            i.slug === "dominating" ||
            (i.flags?.core?.sourceId ?? i.sourceId) === domUUID
          );
          if (!isDom) return false;
          const gt = t.actor.getFlag(FLAG_S, "genitalTypes") ?? {};
          return gt["cock-girthy"] === true || gt["cock-flared"] === true;
        });
        if (girthyOrFlaredDom) {
          submittingBonus += 1;
          const cockTypeName = (girthyOrFlaredDom.actor.getFlag(FLAG_S, "genitalTypes") ?? {})["cock-girthy"]
            ? "Girthy" : "Flared";
          console.log(`AFLP | ${actor.name} Submitting to ${cockTypeName} cock — +1 bonus arousal`);
        }
        total += submittingBonus;
        console.log(`AFLP | ${actor.name} is Submitting — +${submittingBonus} bonus arousal (total +${total} from ${source})`);
      }

      // Horny bonus: add Horny value (temp + permanent) to the arousal increase.
      // Skipped entirely for actors with Monstrous Prowess.
      if (!hasMonstrousProwess) {
        // Read Horny from liveActorForBonus (token-first resolved instance — see
        // the FOUNDRY ACTOR-RESOLUTION RULE block at the top of this function).
        // Previously this used game.actors.get(actor.id), which returns the
        // shared base template for UNLINKED tokens and so ignored a monster
        // mook's own per-token Horny value. liveActorForBonus is correct for
        // both linked PCs and unlinked mooks.
        const hornyRaw   = liveActorForBonus.getFlag(FLAG, "horny");
        const horny      = (hornyRaw != null) ? hornyRaw : AFLP.hornyDefaults;
        const hornyValue = (horny.temp ?? 0) + (horny.permanent ?? 0);
        if (hornyValue > 0) {
          hornyBonus = hornyValue;
          total += hornyValue;
          console.log(`AFLP | ${actor.name} is Horny ${hornyValue} — +${hornyValue} bonus arousal (total +${total} from ${source})`);
        }
      } else {
        console.log(`AFLP | ${actor.name} has Monstrous Prowess — Horny bonus skipped`);
      }

      // ── Defeated flat check ─────────────────────────────────────────
      // Rule: "When your Arousal increases, Defeated's duration resets and
      // you roll a DC 11 Flat Check. On a failure, this condition ends and
      // you gain Mind Break 1."
      // Fires on every arousal increment, not just at cum.
      await AFLP_Arousal._checkDefeatedFlatCheck(actor, tokenId);
    }

    const prev    = arousal.current ?? 0;
    arousal.current = Math.min(prev + total, max);
    arousal.max     = max;
    await actor.setFlag(FLAG, "arousal", arousal);

    console.log(`AFLP | ${actor.name} arousal: ${prev} → ${arousal.current}/${max} (+${total} from ${source})`);

    // Lovense: emit arousal tier event
    if (window.AFLP_Lovense) AFLP_Lovense.emitArousal(actor, arousal.current, max);

    // Refresh H scene card arousal bars — after flag write so bars read updated value
    if (AFLP.Settings.hsceneEnabled) {
      // Small timeout ensures the flag has propagated before we re-read it for the bar
      setTimeout(() => AFLP.HScene.refreshArousalForActor(actor.id), 50);
    }

    // Auto-trigger cum sequence if max reached
    if (arousal.current >= max) {
      await AFLP_Arousal._onArousalMax(actor, tokenId);
    }

    return { current: arousal.current, applied: total, base: amount, submittingBonus, hornyBonus };
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

    // Girthy / Flared note: shown when source has either cock type and target is Submitting
    const FLAG = AFLP.FLAG_SCOPE;
    const sourceGT = sourceActor.getFlag(FLAG, "genitalTypes") ?? {};
    const targetIsSubmitting = targetActor.items?.some(i =>
      i.slug === "submitting" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === (AFLP.conditions?.["submitting"]?.uuid ?? "")
    );
    const activeCockType = (sourceGT["cock-girthy"] && targetIsSubmitting) ? "Girthy"
      : (sourceGT["cock-flared"] && targetIsSubmitting) ? "Flared"
      : null;
    const girthyNote = activeCockType
      ? `<p style="font-size:11px;color:#806040;"><em>Cock (${activeCockType}): +1 bonus Arousal stacked with Submitting bonus.</em></p>`
      : "";

    const content = `<div class="aflp-chat-card">
      <p><strong>${sourceActor.name}</strong> uses <strong>Sexual Advance</strong> on <strong>${targetActor.name}</strong>!</p>
      ${sameSimple
        ? `<p>Both gain <strong>${sourceGain?.applied ?? 2} Arousal</strong>.</p>`
        : `<ul style="margin:2px 0 4px 16px;padding:0">
            <li>${sourceActor.name} gains ${gainLine(sourceGain)}</li>
            <li>${targetActor.name} gains ${gainLine(targetGain)}</li>
          </ul>`
      }
      ${girthyNote}
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
    const FLAG = AFLP.FLAG_SCOPE;

    await AFLP.ensureCoreFlags(actor);
    const arousal   = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
    const prev      = arousal.current ?? 0;
    arousal.current = Math.max(0, prev - amount);
    await actor.setFlag(FLAG, "arousal", arousal);

    console.log(`AFLP | ${actor.name} arousal: ${prev} → ${arousal.current} (-${amount} from ${source})`);

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.refreshArousalForActor(actor.id);
    }

    return arousal.current;
  },

  // -----------------------------------------------
  // Set arousal to a specific value
  // -----------------------------------------------
  async set(actor, value, source = "", tokenId = null) {
    if (!actor) return;
    const FLAG    = AFLP.FLAG_SCOPE;
    const max     = AFLP.HScene.calcArousalMax(actor);
    const arousal = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);

    arousal.current = Math.max(0, Math.min(value, max));
    arousal.max     = max;
    await actor.setFlag(FLAG, "arousal", arousal);

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.refreshArousalForActor(actor.id);
    }

    if (arousal.current >= max) {
      await AFLP_Arousal._onArousalMax(actor, tokenId);
    }

    return arousal.current;
  },

  // -----------------------------------------------
  // Reset arousal to 0 (daily prep, rest, etc.)
  // -----------------------------------------------
  async reset(actor, source = "reset", tokenId = null) {
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
  async _checkDefeatedFlatCheck(actor, tokenId = null) {
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const defeatedCond = liveActor.items?.find(c =>
      c.slug === "defeated" ||
      c.sourceId?.includes(AFLP.conditions?.["defeated"]?.uuid ?? "NOMATCH")
    );
    if (!defeatedCond) return;

    // Debounce: only one flat check per actor per event loop tick
    const debounceKey = `_aflpDefeatedCheck_${actor.id}`;
    if (window[debounceKey]) return;
    window[debounceKey] = true;
    setTimeout(() => { delete window[debounceKey]; }, 100);

    const roll    = await new Roll("1d20").evaluate();
    const success = roll.total >= 11;

    await roll.toMessage({
      flavor: `<strong>${actor.name}</strong>  -  Defeated Flat Check (DC 11): ${success ? "Success  -  holds on" : "Failure  -  Mind Break!"}`,
      speaker: { alias: actor.name },
    });

    if (!success) {
      // Remove Defeated
      await liveActor.deleteEmbeddedDocuments("Item", [defeatedCond.id]);

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

      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> fails the Defeated flat check  -  Mind Break!</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Defeated flat check failed — Mind Break applied`);
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
    const isNPC = actor.type === "npc" || actor.type === "hazard";
    if (isNPC && !AFLP.Settings.edgeIncludeNpc) return false;
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
      if (edged) return; // Edge succeeded — no cum this time
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
        try { const _vp = game.actors.get(partner.id); if (_vp) AFLP.Voice?.play?.("climax", _vp); } catch (_) {}

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
      // No H scene — solo message (only for actors with cocks; no-cock path posts its own below)
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
    const arousal   = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
    arousal.current = 0;
    const _batchedFlags = { [`flags.${FLAG}.arousal`]: arousal };

    if (AFLP.Settings.hsceneEnabled) {
      AFLP.HScene.incrementSceneOrgasm(actor.id, tokenId);
    }

    // ── Clear temp Horny on cum (permanent Horny survives) ────────────────
    // Reads/writes via `actor`, which is the correctly-resolved per-token
    // instance (synthetic for unlinked mooks, world actor for linked PCs —
    // see the FOUNDRY ACTOR-RESOLUTION RULE in increment()). Zeros temp,
    // leaves permanent intact.
    if (AFLP.Settings.automation) {
      const horny = structuredClone(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
      if ((horny.temp ?? 0) > 0) {
        horny.temp = 0;
        _batchedFlags[`flags.${FLAG}.horny`] = horny;
        console.log(`AFLP | ${actor.name} temp Horny cleared on cum (permanent ${horny.permanent ?? 0} preserved)`);
      }
    }

    // ── Lifetime counter: timesCummed ──────────────────────────────────
    const sexual = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
    sexual.lifetime                = sexual.lifetime ?? {};
    sexual.lifetime.timesCummed    = (sexual.lifetime.timesCummed ?? 0) + 1;

    if (AFLP.Settings.automation) {
      // Resolve the live token actor so condition reads/writes hit the synthetic
      // instance for unlinked tokens rather than the world actor template.
      const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

      // ── Mind Break escalation ────────────────────────────────────────
      // Rule: "When you cum your Mind Break level increases by 1."
      const mindBreakCond = liveActor.items?.find(c =>
        c.slug === "mind-break" ||
        c.sourceId?.includes(AFLP.conditions?.["mind-break"]?.uuid ?? "NOMATCH")
      );
      if (mindBreakCond) {
        const currentMBValue = mindBreakCond.system?.badge?.value ?? 1;
        const newMBValue     = currentMBValue + 1;
        // Update whichever path is populated
        await mindBreakCond.update({ "system.badge.value": newMBValue });
        await ChatMessage.create({
          content: `<div class="aflp-chat-card">
            <p><strong>${actor.name}</strong>'s Mind Break deepens to ${newMBValue}!</p>
          </div>`,
          speaker: { alias: "AFLP" },
        });
        console.log(`AFLP | ${actor.name} Mind Break escalated to ${newMBValue} (cummed while mind-broken)`);
      }

      // ── Apply Defeated if a Dominator caused this cum ───────────────
      // Rule: Dominating — "if you cause it to Cum it is Defeated."
      // Partner-aware: applies when the CUMMER is Submitting and at least one
      // Dominating participant is directed at them (their dom partner, or any
      // attacker pointing at them in a gangbang). Mind Break supersedes Defeated.
      const cummerTok = cummerP?.tokenId ?? tokenId;
      const cummerIsSubmitting = liveActor.items?.some(c =>
        c.slug === "submitting" ||
        c.sourceId?.includes(AFLP.conditions?.["submitting"]?.uuid ?? "NOMATCH")
      );
      const isAlreadyDefeated = liveActor.items?.some(c =>
        c.slug === "defeated" ||
        c.sourceId?.includes(AFLP.conditions?.["defeated"]?.uuid ?? "NOMATCH")
      );
      const hasMindBreak = liveActor.items?.some(c =>
        c.slug === "mind-break" ||
        c.sourceId?.includes(AFLP.conditions?.["mind-break"]?.uuid ?? "NOMATCH")
      );

      if (scene && cummerIsSubmitting && !isAlreadyDefeated && !hasMindBreak) {
        // The cummer's dominators: participants directed at the cummer (or the
        // cummer's own partner) who currently have the Dominating condition.
        const isDomActor = (a) => a?.items?.some(c =>
          c.slug === "dominating" ||
          c.sourceId?.includes(AFLP.conditions?.["dominating"]?.uuid ?? "NOMATCH"));
        const dominators = [];
        for (const p of (scene.participants ?? [])) {
          if (p.tokenId === cummerTok) continue;
          const directedAtCummer = p.partnerId === cummerTok || cummerP?.partnerId === p.tokenId;
          if (!directedAtCummer) continue;
          const pa = canvas?.tokens?.get(p.tokenId)?.actor ?? game.actors.get(p.actorId ?? p.tokenId);
          if (isDomActor(pa)) dominators.push(p);
        }
        let dominatorFound = dominators.length > 0;

        // Gangslut L5: immune to Defeated while 2+ Dominators target them (level 5+).
        const _actorLevel = actor.system?.details?.level?.value ?? 0;
        if (dominatorFound && _actorLevel >= 5 && AFLP.actorHasKink(actor, "gangslut") && dominators.length >= 2) {
          dominatorFound = false;
          console.log(`AFLP | ${actor.name} Gangslut L5: Defeated blocked (${dominators.length} Dominators)`);
        }

        if (dominatorFound) {
          // Mark so createItem hook skips the counter (we're counting here)
          AFLP_Arousal._setCounterDebounce(actor, "defeated");

          await AFLP_Arousal._applyCondition(liveActor, "defeated", AFLP.conditions["defeated"]?.uuid, null);
          sexual.lifetime.timesDefeated = (sexual.lifetime.timesDefeated ?? 0) + 1;

          await ChatMessage.create({
            content: `<div class="aflp-chat-card">
              <p><strong>${actor.name}</strong> is Defeated!</p>
              <p><em>Completely dominated sexually, starting to lose the will to fight back.</em></p>
            </div>`,
            speaker: { alias: "AFLP" },
          });
          console.log(`AFLP | ${actor.name} Defeated — cummed while Dominated`);
        }
      }
    }

    // ── Save updated lifetime stats — flush ALL pending flag writes in one update ─────
    _batchedFlags[`flags.${FLAG}.sexual`] = sexual;
    await actor.update(_batchedFlags);

    // ── Apply base Afterglow ─────────────────────────────────────────────
    // Applied before kink post-effects so Edge Master can remove and replace it.
    if (AFLP.Settings.automation) {
      const afterglowUUID = AFLP.conditions?.["afterglow"]?.uuid;
      if (afterglowUUID) {
        const liveActorAg = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
        const alreadyHas  = liveActorAg.items?.some(c =>
          c.slug === "afterglow" || (c.flags?.core?.sourceId ?? c.sourceId) === afterglowUUID
        );
        if (!alreadyHas) {
          await AFLP_Arousal._applyCondition(liveActorAg, "afterglow", afterglowUUID, null);
        }
      }
    }

    // ── Kink post-cum effects ────────────────────────────────────────────
    if (AFLP.Settings.automation && AFLP.Kinks) {
      // Edge Master: block Afterglow, apply Sickened 2 + Edge Master's Afterglow
      await AFLP.Kinks.onCumPostEffect(actor, tokenId);
      // Purity: Sickened 1 if cumming while Submitting (non-consensual)
      await AFLP.Kinks.onCumPurityCheck(actor, tokenId);
      // Aphrodisiac Junkie L7: re-enforce permanent Horny 3 (Horny was just removed above)
      await AFLP.Kinks.enforceAphrodisiacJunkieL7(actor);
      // Aphrodisiac Junkie L7: Stunned 2 to Dominators/Submitting creatures
      await AFLP.Kinks.onCumAphrodisiacJunkieL7(actor);
      // Brood Sow: apply Brood Sow's Afterglow
      await AFLP.Kinks.onCumBroodSow(actor, tokenId);
      // Voyeurism L5: observers must save vs 2 Arousal
      await AFLP.Kinks.onCumVoyeurism(actor, tokenId);
      // Stretch King: L3/L7 Coomer reminder on cumming inside smaller target
      await AFLP.Kinks.onCumStretchKing?.(actor, tokenId);
      // Hypno L3: suppress Afterglow and gain 1 Arousal while Fascinated (once/day)
      await AFLP.Kinks.onCumHypnoSlave?.(actor, tokenId);
      // Hypno L7: AoE Will-save Fascinated pulse while Fascinated + Submitting
    }

    // ── Sentient item reactions to cum ───────────────────────────────────
    if (AFLP.Settings.automation && window.AFLP_SentientItems) {
      await AFLP_SentientItems.onActorCum(actor);
    }

    // ── Lovense: peak cum event ──────────────────────────────────────────
    if (window.AFLP_Lovense) AFLP_Lovense.emitCum(actor);

    // ── Fire cum macro ──────────────────────────────────────────────────
    // Only fire if automation is on, an H scene exists, AND this actor is the
    // designated macro runner for this cum event.
    // _aflpCumMacroActor is set to actor.id by the first actor in the pending-cum
    // window, and cleared after the macro fires. The second (combined-message)
    // actor skips the macro entirely.
    if (!AFLP.Settings.automation) return;

    if (!scene) {
      ui.notifications.info(`AFLP | ${actor.name} has reached max arousal  -  run the cum macro manually.`);
      return;
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
      const cumUnitsSpent = Math.ceil(cum.current / 2);
      if (cumUnitsSpent > 0) {
        const sexualNoCock = structuredClone(actor.getFlag(FLAG, "sexual") ?? AFLP.sexualDefaults);
        sexualNoCock.lifetime = sexualNoCock.lifetime ?? {};
        if (!sexualNoCock.lifetime.mlGiven) sexualNoCock.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
        const mlSpray = cumUnitsSpent * AFLP.CUM_UNIT_ML;
        sexualNoCock.lifetime.mlGiven.vaginal = (sexualNoCock.lifetime.mlGiven.vaginal ?? 0) + mlSpray;
        sexualNoCock.lifetime.cumGiven = (sexualNoCock.lifetime.cumGiven ?? 0) + cumUnitsSpent;
        // Batch cum + sexual into one write — skip cum deduction for NPCs with infinite cum on
        const isNPCNoCock = actor.type === "npc";
        const cumUpdate   = (isNPCNoCock && AFLP.Settings.infiniteCum)
          ? {}
          : { [`flags.${FLAG}.cum`]: { current: cum.current - cumUnitsSpent, max: cum.max } };
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

    const cumMacro = game.macros.find(m => m.name === "AFLP Cum" || m.slug === "aflp-cum");
    if (cumMacro) {
      // Hand the cummer (source) and partner (target) to the cum macro via
      // globals so it can resolve them WITHOUT us changing the GM's on-screen
      // selection or targets. This keeps the user's UI untouched and avoids any
      // race between restoring the selection and the macro reading tokens.
      if (game.user.isGM) {
        const cummingToken = canvas.tokens.get(tokenId)
          ?? canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
        const partnerToken = partnerTokenId
          ? (canvas.tokens.get(partnerTokenId)
             ?? canvas.tokens.placeables.find(t => t.actor?.id === partnerActorId))
          : null;
        if (cummingToken && partnerToken) {
          window._aflpCumSourceTokenIds = [cummingToken.id];
          window._aflpCumTargetTokenId  = partnerToken.id;
        }
      }
      await cumMacro.execute();
    } else {
      ui.notifications.warn(`AFLP | ${actor.name} reached max arousal but no 'AFLP Cum' macro found. Run manually.`);
    }
    } catch(e) {
      console.error("AFLP | Error during cum macro execution:", e);
    } finally {
      _cleanupCumGlobals();
    }
  },

  // -----------------------------------------------
  // Stack Mind Break on an existing condition, or apply a fresh one.
  // If the actor already has Mind Break, increments its value by `amount`.
  // If not, applies a fresh condition at value `amount`.
  // -----------------------------------------------
  async _stackOrApplyMindBreak(actor, amount = 1, tokenId = null) {
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const existing = liveActor.items?.find(c =>
      c.slug === "mind-break" ||
      c.sourceId?.includes(AFLP.conditions?.["mind-break"]?.uuid ?? "NOMATCH")
    );
    if (existing) {
      const currentVal = existing.system?.badge?.value ?? 1;
      const newVal = currentVal + amount;
      await existing.update({ "system.badge.value": newVal });
    } else {
      await AFLP_Arousal._applyCondition(liveActor, "mind-break", AFLP.conditions["mind-break"]?.uuid, amount, tokenId);
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
  // Falls back to PF2e ConditionManager if UUID fails.
  // -----------------------------------------------
  // slug-based caps: conditions that increment instead of duplicating
  // and their max value (null = no cap)
  _STACKABLE: {
    "horny":           3,    // Horny caps at 3 in practice (kinks go higher but base is 3)
    "mind-break":      null, // No cap
    "exposed":         2,    // 1-2
    "creature-fetish": 9,    // Up to 9
  },

  // Conditions that are singular — never stack, silently skip if already present
  _SINGULAR: new Set(["dominating", "submitting", "defeated", "restrained", "grabbed"]),

  async _applyCondition(actor, slug, uuid, value = null, tokenId = null) {
    // Always check conditions on the live token actor (synthetic instance for unlinked tokens).
    // actor.token?.actor gives the token's synthetic actor; safe fallback for linked actors.
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const existing = liveActor.items?.find(c =>
      c.slug === slug || (uuid && c.sourceId === uuid)
    );

    if (existing) {
      if (slug in this._STACKABLE) {
        // Increment valued condition, respecting cap
        const cap = this._STACKABLE[slug];
        const current = existing.system?.badge?.value ?? 0;
        const next = current + (value ?? 1);
        const capped = cap !== null ? Math.min(next, cap) : next;
        if (capped > current) {
          await existing.update({ "system.badge.value": capped });
        }
      }
      // Singular or already-present stackable at cap — do nothing
      return;
    }

    // Not present — apply fresh
    try {
      if (uuid) {
        const condDoc = await fromUuid(uuid);
        if (condDoc) {
          const itemData = condDoc.toObject();
          if (value !== null && itemData.system?.badge !== undefined) {
            itemData.system.badge.value = value;
          }
          await actor.createEmbeddedDocuments("Item", [itemData]);
          return;
        }
      }
    } catch(e) {
      console.warn(`AFLP | _applyCondition UUID path failed for ${slug}:`, e);
    }
    // Fallback: use PF2e actor.increaseCondition for core conditions
    if (typeof actor.increaseCondition === "function") {
      await actor.increaseCondition(slug);
    } else {
      console.warn(`AFLP | Could not apply condition ${slug} to ${actor.name}`);
    }
  },
};