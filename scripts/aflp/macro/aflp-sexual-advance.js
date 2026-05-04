// ===============================
// AFLP Macro — Sexual Advance
// ===============================
// Usage: Select the acting token, target the victim (or self for masturbation), run.
// Handles arousal increments, Submitting bonus, Dominating passive,
// H scene prose/shake, and auto-triggers cum macro when arousal hits max.
//
// Save to: scripts/aflp/macro/aflp-sexual-advance.js

(async () => {
  const FLAG      = AFLP.FLAG_SCOPE;
  const AUTOMATE  = AFLP.Settings.automation;

  const sourceTokens = canvas.tokens.controlled;
  const targets      = [...game.user.targets];

  if (!sourceTokens.length) {
    ui.notifications.warn("AFLP | Select the acting token.");
    return;
  }

  const sourceToken = sourceTokens[0];
  const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
  if (!sourceActor) { ui.notifications.warn("AFLP | Source actor not found."); return; }

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

    // Start or join a solo H scene for this actor
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

  // ── Auto-target from H scene if no target selected ────────────────────
  // If the user forgot to target someone but the source actor is in an active
  // scene, derive the target from the scene data automatically.
  if (targets.length === 0 && AFLP.Settings.hsceneEnabled) {
    const activeScene = AFLP.HScene._getScene?.(sourceActor.id);
    if (activeScene) {
      const sceneTargetToken = canvas.tokens.get(activeScene.targetId);
      if (sceneTargetToken) {
        targets.push(sceneTargetToken);
        ui.notifications.info(`AFLP | Auto-targeting ${sceneTargetToken.name} from active H scene.`);
      }
    }
  }

  if (targets.length !== 1) {
    ui.notifications.warn("AFLP | Target exactly one token (or none for masturbation).");
    return;
  }

  const targetToken = targets[0];
  const targetActor = targetToken.actor?.getWorldActor?.() ?? targetToken.actor;
  if (!targetActor) { ui.notifications.warn("AFLP | Target actor not found."); return; }

  await AFLP.ensureCoreFlags(targetActor);

  const targetId = targetToken.id;  // scene key is token ID, not world actor ID

  // ── Auto-start or join H scene if hscene is enabled ─────────────────────
  // If the target is already in a scene, add this attacker to it.
  // If neither actor is in any scene, start a new one.
  // _aflpMacroHandlingPosition suppresses startScene/addAttacker's own position prompts
  // so SA can await it in the right order (before arousal, not as a fire-and-forget).
  let saHandledScene = false;
  if (AFLP.Settings.hsceneEnabled) {
    const attackerScene  = AFLP.HScene._getScene?.(sourceActor.id);
    const targetScene    = AFLP.HScene._getSceneWhereTarget?.(targetToken.id, targetActor.id);
    const existingScene  = targetScene ?? attackerScene;

    window._aflpMacroHandlingPosition = true;
    if (existingScene) {
      // Target (or attacker) is already in a scene. Add this attacker if not already there.
      const alreadyIn = existingScene.attackers?.some(a =>
        a.id === sourceToken.id || (a.actorId ?? a.id) === sourceActor.id
      );
      if (!alreadyIn) {
        AFLP.HScene.addAttacker(existingScene.targetId, {
          id: sourceToken.id, actorId: sourceActor.id,
          name: sourceActor.name, img: sourceActor.img,
          tokenDoc: sourceToken.document ?? null,
        });
        saHandledScene = true;
      }
    } else {
      // No scene yet — check if we need a role prompt (willing target: no conditions set).
      // SS sets conditions automatically; SA on a willing target needs to ask.
      const atkHasRole = sourceActor.hasCondition?.("dominating") || sourceActor.hasCondition?.("submitting");
      const tgtHasRole = targetActor.hasCondition?.("dominating") || targetActor.hasCondition?.("submitting");
      if (!atkHasRole && !tgtHasRole && game.user.isGM && AFLP.HScene._promptRoleSelection && !window._aflpSSInProgress) {
        // Await so roles are set before the scene card renders
        await AFLP.HScene._promptRoleSelection(sourceActor, targetActor);
      }

      // Start a fresh scene.
      const sourceData = {
        id: sourceToken.id, actorId: sourceActor.id,
        name: sourceActor.name, img: sourceActor.img,
        tokenDoc: sourceToken.document ?? null,
      };
      const targetData = {
        id: targetToken.id, actorId: targetActor.id,
        name: targetActor.name, img: targetActor.img,
        tokenDoc: targetToken.document ?? null,
      };
      AFLP.HScene.startScene(sourceData, targetData);
      if (AFLP.Settings.proseFlavor) {
        AFLP.HScene.generateAndShowProse(targetToken.id, "sexual-advance", sourceActor, targetActor);
      }
      saHandledScene = true;
    }
    window._aflpMacroHandlingPosition = false;
  }

  // ── Position prompt — BEFORE arousal so hole can be derived from position ─
  // Covers: new scene, joining existing scene, or attacker already in scene with no position set.
  if (AFLP.Settings.positionTracking && AFLP.Settings.hsceneEnabled) {
    const hscene = AFLP.HScene._getScene?.(sourceActor.id)
                ?? AFLP.HScene._getSceneWhereTarget?.(targetToken.id, targetActor.id);
    if (hscene) {
      const atkData = hscene.attackers?.find(a =>
        a.id === sourceToken.id || (a.actorId ?? a.id) === sourceActor.id
      );
      if (atkData && !atkData.position) {
        const hasCock = !!sourceActor.getFlag(FLAG, "cock");
        const targetPronouns = AFLP.getPronouns(targetActor);
        const positionId = await AFLP.HScene._showPositionDialog(sourceActor, targetActor, hasCock, targetPronouns);
        if (!positionId) {
          // User dismissed — reveal card anyway so the scene is visible, then cancel SA
          AFLP.HScene.revealCard?.(hscene.targetId);
          return;
        }
        atkData.position = positionId;
        atkData._prevPosition = positionId;

        // Post to scene log
        const posEntry = AFLP.getPosition(positionId);
        if (posEntry) {
          const phrase = posEntry.logPhrase(atkData.name, hscene.targetName, targetPronouns);
          AFLP.HScene.addProse(hscene.targetId, phrase, "action");
        }
        // Refresh card so position pill + portraits update
        AFLP.HScene.refreshScene?.(hscene.targetId);
        AFLP.HScene.refreshArousalForActor(sourceActor.id);
      }
      // Reveal the H Scenes card now that position is resolved
      AFLP.HScene.revealCard?.(hscene.targetId);
    }
  } else if (AFLP.Settings.hsceneEnabled) {
    // No position tracking — still reveal the card
    const hscene = AFLP.HScene._getScene?.(sourceActor.id)
                ?? AFLP.HScene._getSceneWhereTarget?.(targetToken.id, targetActor.id);
    if (hscene) AFLP.HScene.revealCard?.(hscene.targetId);
  }

  // ── H Scene card prose ──
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
    // Arousal is doubled (they feel it from both ends) — apply 4 total as one increment
    // so Submitting bonus applies once, then duplicate gain appears in both card slots.
    const isSelfScene = sourceActor.id === targetActor.id;
    if (isSelfScene) {
      sourceGain = await AFLP_Arousal.increment(sourceActor, 4, "Sexual Advance (self)", sourceToken.id);
      targetGain = sourceGain; // same result shown on both sides of the card
    } else {
      sourceGain = await AFLP_Arousal.increment(sourceActor, 2, "Sexual Advance", sourceToken.id);
      targetGain = await AFLP_Arousal.increment(targetActor, 2, "Sexual Advance", targetToken.id);
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