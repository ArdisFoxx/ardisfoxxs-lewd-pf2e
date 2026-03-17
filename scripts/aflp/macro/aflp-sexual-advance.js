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
      // Flag the actor so _onArousalMax knows this cum (if triggered) was from masturbation.
      // Edge Master L3 auto-succeeds in this context.
      window._aflpMasturbationActor = sourceActor.id;
      await AFLP_Arousal.increment(sourceActor, 1, "Masturbation", sourceToken.id);
      window._aflpMasturbationActor = null; // clear if no cum triggered
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

  if (targets.length !== 1) {
    ui.notifications.warn("AFLP | Target exactly one token (or none for masturbation).");
    return;
  }

  const targetToken = targets[0];
  const targetActor = targetToken.actor?.getWorldActor?.() ?? targetToken.actor;
  if (!targetActor) { ui.notifications.warn("AFLP | Target actor not found."); return; }

  await AFLP.ensureCoreFlags(targetActor);

  const targetId = targetToken.id;  // scene key is token ID, not world actor ID

  // ── Position tracking ──────────────────────────────────────────────────
  // If position tracking is on, ensure a position is set for this attacker
  // before SA fires. Check the active H scene first; prompt if unset.
  if (AFLP.Settings.positionTracking && AFLP.Settings.hsceneEnabled) {
    const hscene = AFLP.HScene._getScene?.(sourceActor.id);
    if (hscene) {
      const atkData = hscene.attackers?.find(a =>
        a.id === sourceToken.id || (a.actorId ?? a.id) === sourceActor.id
      );
      if (atkData && !atkData.position) {
        // No position set — prompt before proceeding
        const hasCock = !!sourceActor.getFlag(FLAG, "cock");
        const targetPronouns = AFLP.getPronouns(targetActor);
        const positionId = await AFLP.HScene._showPositionDialog(sourceActor, targetActor, hasCock, targetPronouns);
        if (!positionId) return; // user dismissed — cancel SA
        atkData.position = positionId;
        atkData._prevPosition = positionId;

        // Post to scene log
        const posEntry = AFLP.getPosition(positionId);
        if (posEntry) {
          const phrase = posEntry.logPhrase(atkData.name, hscene.targetName, targetPronouns);
          AFLP.HScene.addProse(hscene.targetId, phrase, "action");
        }
        // Refresh card so pill updates
        AFLP.HScene.refreshArousalForActor(sourceActor.id);
      }
    }
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
    sourceGain = await AFLP_Arousal.increment(sourceActor, 2, "Sexual Advance", sourceToken.id);
    targetGain = await AFLP_Arousal.increment(targetActor, 2, "Sexual Advance", targetToken.id);
  }

  // ── Build and post chat card via module function ──
  // Keeping display logic in AFLP_Arousal.postSAChat (always-current module code)
  // rather than inline here prevents stale world macro copies from showing wrong values.
  await AFLP_Arousal.postSAChat(sourceActor, targetActor, sourceGain, targetGain);
})();