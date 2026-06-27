// ===============================
// AFLR Macro — Carnal Press
// ===============================
// (Formerly "Sexual Advance" - renamed for Daggerheart.)
// Usage: Select the acting token, target the victim (or self for masturbation), run.
// Handles arousal increments, Submitting bonus, Dominating passive,
// H-Scene prose/shake, and auto-triggers cum macro when arousal hits max.
//
// Save to: scripts/aflp/macro/aflp-sexual-advance.js

(async () => {
  const FLAG      = AFLP.FLAG_SCOPE;
  const AUTOMATE  = AFLP.Settings.automation;

  if (!AFLP.Settings.allows("sexualAdvance")) {
    ui.notifications.warn("AFLR | Carnal Press is a Lewd 4 feature. Raise the Lewd Level (Session Zero) to use it.");
    return;
  }

  const sourceTokens = canvas.tokens.controlled;
  const targets      = [...game.user.targets];

  if (!sourceTokens.length) {
    ui.notifications.warn("AFLR | Select the acting token.");
    return;
  }

  const sourceToken = sourceTokens[0];
  const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
  if (!sourceActor) { ui.notifications.warn("AFLR | Source actor not found."); return; }

  await AFLP.ensureCoreFlags(sourceActor);

  // Self-target = masturbation
  // Compare token IDs, not actor IDs.
  // Two tokens of the same NPC world actor share actor.id but are different tokens.
  const isSelf = !targets.length || (targets.length === 1 && targets[0].id === sourceToken.id);

  if (isSelf) {
    // Masturbation: source gains 1 Arousal
    if (AUTOMATE) {
      window._aflpMasturbationActor = sourceActor.id;
      await AFLP_Arousal.increment(sourceActor, 1, "Masturbation", sourceToken.id);
      window._aflpMasturbationActor = null;
    }

    // Start or join a solo H-Scene for this actor
    if (AFLP.Settings.hsceneEnabled) {
      const selfData = {
        id: sourceToken.id, actorId: sourceActor.id,
        name: sourceActor.name, img: sourceActor.img,
        tokenDoc: sourceToken.document ?? null,
      };
      let soloScene = AFLP.HScene._getSceneWhereTarget?.(sourceToken.id, sourceActor.id);
      if (!soloScene) {
        // fromSocket=true suppresses internal position prompt; we handle it below
        AFLP.HScene.startScene(selfData, selfData, true);
        soloScene = AFLP.HScene._getSceneWhereTarget?.(sourceToken.id, sourceActor.id);
      }

      // Show masturbation activity picker and log prose
      if (AFLP.Settings.positionTracking && window.AFLP?.HScene?._showMasturbationDialog) {
        const masturbChoice = await AFLP.HScene._showMasturbationDialog(sourceActor);
        if (masturbChoice) {
          const proseType = `masturbation:${masturbChoice}`;
          if (AFLP.Settings.proseFlavor) {
            const prose = AFLP.HScene._generateProse
              ? AFLP.HScene._generateProse(proseType, sourceActor, sourceActor)
              : null;
            if (prose && soloScene) {
              AFLP.HScene.addProse(soloScene.targetId, prose, "action");
            }
          }
        } else if (AFLP.Settings.proseFlavor && soloScene) {
          // Skipped the picker - still add generic prose
          const prose = `${sourceActor.name} takes a quiet moment for themselves.`;
          AFLP.HScene.addProse(soloScene.targetId, prose, "action");
        }
      } else if (AFLP.Settings.proseFlavor && soloScene) {
        const prose = `${sourceActor.name} takes a quiet moment for themselves.`;
        AFLP.HScene.addProse(soloScene.targetId, prose, "action");
      }

      if (soloScene) AFLP.HScene.triggerShake?.(soloScene.targetId);
    }

    const chatContent = `<div class="aflp-chat-card">
      <p><strong>${sourceActor.name}</strong> takes a moment to take care of themselves.</p>
      <p>${sourceActor.name} gains <strong>1 Arousal</strong>.</p>
    </div>`;
    await ChatMessage.create({
      content: chatContent,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
    return;
  }

  // ── Auto-target from H-Scene if no target selected ────────────────────
  // If the user forgot to target someone but the source actor is in an active
  // scene, derive the target from the scene data automatically.
  if (targets.length === 0 && AFLP.Settings.hsceneEnabled) {
    const activeScene = AFLP.HScene._getScene?.(sourceActor.id);
    if (activeScene) {
      const sceneTargetToken = canvas.tokens.get(activeScene.targetId);
      if (sceneTargetToken) {
        targets.push(sceneTargetToken);
        ui.notifications.info(`AFLR | Auto-targeting ${sceneTargetToken.name} from active H-Scene.`);
      }
    }
  }

  if (targets.length !== 1) {
    ui.notifications.warn("AFLR | Target exactly one token (or none for masturbation).");
    return;
  }

  const targetToken = targets[0];
  const targetActor = targetToken.actor?.getWorldActor?.() ?? targetToken.actor;
  if (!targetActor) { ui.notifications.warn("AFLR | Target actor not found."); return; }

  await AFLP.ensureCoreFlags(targetActor);

  const targetId = targetToken.id;  // scene key is token ID, not world actor ID

  // ── Auto-start / join / re-point H-Scene (unified model) ────────────────
  // startScene resolves the ONE battlemap scene and create-or-joins-or-repoints:
  // it ensures both participants and sets the SOURCE's partnerId to the TARGET
  // (the re-point). This single call replaces the old start/join/skip branching
  // and fixes the cases where a source advancing on a new partner - or the
  // projected target SA'ing its own attacker - failed to re-point partnerId.
  // _aflpMacroHandlingPosition suppresses startScene's own role/position prompts
  // so SA can drive them here in the right order.
  let saHandledScene = false;
  if (AFLP.Settings.hsceneEnabled) {
    window._aflpMacroHandlingPosition = true;

    // Establish/keep scene roles. AFLP roles (dominating/submitting) are CUSTOM
    // items, not PF2e core conditions, so they must be detected by item slug -
    // hasCondition() never sees them and would re-prompt on every SA. Rule:
    //  - Brand-new pairing, nobody has a role -> PROMPT once (who's in control).
    //  - Joining an already-controlled scene (target roled, newcomer not) ->
    //    default the newcomer to Dominating, no prompt (legacy addAttacker behavior).
    //  - Roles already established, or a consensual scene (exists, no roles) -> do nothing.
    // Only the SS struggle-escape changes control after it is established.
    const hasRole = (a) => AFLP.cond.has(a, "dominating") || AFLP.cond.has(a, "submitting");
    const srcRoled = hasRole(sourceActor);
    const tgtRoled = hasRole(targetActor);
    const preexisting = AFLP.HScene.getSceneForToken?.(targetToken.id, targetActor.id)
                     ?? AFLP.HScene.getSceneForToken?.(sourceToken.id, sourceActor.id);
    if (!srcRoled && !tgtRoled && !preexisting) {
      if (game.user.isGM && AFLP.HScene._promptRoleSelection && !window._aflpSSInProgress) {
        await AFLP.HScene._promptRoleSelection(sourceActor, targetActor);
      }
    } else if (!srcRoled && tgtRoled && game.user.isGM && !window._aflpSSInProgress) {
      // Newcomer joining an established scene - inherit the Dominating role.
      await AFLP.HScene.establishRole?.(sourceActor, "dominating");
    }

    AFLP.HScene.startScene(
      { id: sourceToken.id, actorId: sourceActor.id, name: sourceActor.name, img: sourceActor.img, tokenDoc: sourceToken.document ?? null },
      { id: targetToken.id, actorId: targetActor.id, name: targetActor.name, img: targetActor.img, tokenDoc: targetToken.document ?? null }
    );
    if (AFLP.Settings.proseFlavor) {
      AFLP.HScene.generateAndShowProse(targetToken.id, "sexual-advance", sourceActor, targetActor);
    }
    window._aflpMacroHandlingPosition = false;
    saHandledScene = true;
  }

  // ── Position prompt — for the SOURCE (the one advancing) ─────────────────
  // Uses participantHandle so the source's position is set whether they project
  // as target or attacker. Hole is derived from this position at cum time.
  if (AFLP.Settings.positionTracking && AFLP.Settings.hsceneEnabled) {
    const hscene = AFLP.HScene.getSceneForToken?.(sourceToken.id, sourceActor.id);
    const handle = AFLP.HScene.participantHandle?.(sourceToken.id);
    if (hscene && handle) {
      if (!handle.position) {
        await AFLP.HScene._promptGroupPosition(hscene, handle);
        if (!handle.position) {
          // Dismissed without picking — reveal card anyway, cancel SA
          AFLP.HScene.revealCard?.(hscene.id);
          return;
        }
        // Position prose is posted by _promptGroupPosition / _promptAndSetPosition,
        // named against the source's actual partner (partner-aware), so we do not
        // re-log it here (doing so used hscene.targetName, the projected target).
        AFLP.HScene.refreshScene?.(hscene.id);
        AFLP.HScene.refreshArousalForActor(sourceActor.id);
      }
      AFLP.HScene.revealCard?.(hscene.id);
    }
  } else if (AFLP.Settings.hsceneEnabled) {
    const hscene = AFLP.HScene.getSceneForToken?.(sourceToken.id, sourceActor.id);
    if (hscene) AFLP.HScene.revealCard?.(hscene.id);
  }

  // ── H-Scene card prose ──
  if (AFLP.Settings.hsceneEnabled) {
    AFLP.HScene.triggerShake(targetId);
    if (AFLP.Settings.proseFlavor) {
      AFLP.HScene.generateAndShowProse(targetId, "sexual-advance", sourceActor, targetActor);
    } else {
      AFLP.HScene.addProse(targetId, `${sourceActor.name} uses Sexual Advance on ${targetActor.name}`, "action");
    }
  }

  // ── Arousal increments first — the breakdown returned drives the chat card ──
  let sourceGain = null;
  let targetGain = null;
  if (AUTOMATE) {
    // Ouroboros self-scene: source and target are the same actor.
    // Arousal is doubled (they feel it from both ends) - apply 2 total as one increment
    // so Submitting bonus applies once, then duplicate gain appears in both card slots.
    const isSelfScene = sourceActor.id === targetActor.id;
    if (isSelfScene) {
      sourceGain = await AFLP_Arousal.increment(sourceActor, 2, "Sexual Advance (self)", sourceToken.id);
      targetGain = sourceGain; // same result shown on both sides of the card
    } else {
      sourceGain = await AFLP_Arousal.increment(sourceActor, 1, "Sexual Advance", sourceToken.id);
      targetGain = await AFLP_Arousal.increment(targetActor, 1, "Sexual Advance", targetToken.id);
    }
  }

  // ── Voyeurism base: +1 Arousal when observed during SA ──
  if (AUTOMATE && AFLP.actorHasKink(sourceActor, "voyeurism")) {
    const observerCount = AFLP.Kinks._countObservers(sourceToken.id, sourceActor);
    if (observerCount >= 1) {
      await AFLP_Arousal.increment(sourceActor, 1, `Voyeurism (${observerCount} observer${observerCount !== 1 ? "s" : ""})`, sourceToken.id);
    }
  }

  // ── Build and post chat card via module function ──
  // Keeping display logic in AFLP_Arousal.postSAChat (always-current module code)
  // rather than inline here prevents stale world macro copies from showing wrong values.
  await AFLP_Arousal.postSAChat(sourceActor, targetActor, sourceGain, targetGain);
})();