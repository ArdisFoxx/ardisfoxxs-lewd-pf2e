// ===============================
// AFLP Macro — Struggle Snuggle
// ===============================
// Usage: Select the attacker token, target the victim token, run macro.
//
// Flow:
//   1. Detect if target is already Submitting (pin mode — skip strike, grapple only)
//   2. Normal mode: roll a melee Strike. If it hits, roll Grapple at MAP -5.
//      Pin mode: roll Grapple (no MAP penalty since no prior Strike).
//   3. Read degree of success from chat message flags (flags.pf2e.context.outcome).
//   4. Apply conditions and start/join H scene card.
//
// Rolls use the PF2e system's own action macros so all modifiers, MAP, and
// target roll options are handled natively and appear in chat as normal.
//
// Save to: scripts/aflp/macro/aflp-struggle-snuggle.js

(async () => {
  const FLAG = AFLP.FLAG_SCOPE;

  const UUID_DOMINATING   = AFLP.conditions["dominating"].uuid;
  const UUID_SUBMITTING   = AFLP.conditions["submitting"].uuid;
  const UUID_EXPOSED      = AFLP.conditions["exposed"].uuid;
  const UUID_EXPOSED_NUDE = AFLP.conditions["exposed-nude"].uuid;

  // Both Exposed and Exposed (Nude) now share slug "exposed".
  // The ONLY reliable differentiator is the compendium sourceId (flags.core.sourceId).
  // Item name is a secondary fallback for items not yet re-imported from the compendium.
  function getItemSourceId(item) {
    return item.flags?.core?.sourceId ?? item.sourceId ?? "";
  }

  function isExposedNudeItem(item) {
    return getItemSourceId(item) === UUID_EXPOSED_NUDE
        || (item.name ?? "").toLowerCase() === "exposed (nude)";
  }

  // Find any Exposed or Exposed (Nude) item. Returns the one with the highest badge value.
  function findExposedAny(tokenActor) {
    const items = tokenActor.items ?? [];
    let best = null;
    for (const item of items) {
      const slug = item.slug ?? item.system?.slug ?? "";
      const src  = getItemSourceId(item);
      const name = (item.name ?? "").toLowerCase();
      // Match either variant: same slug "exposed", or sourceId match, or name match
      const isEither = slug === "exposed" || src === UUID_EXPOSED || src === UUID_EXPOSED_NUDE
                    || name === "exposed" || name === "exposed (nude)";
      if (!isEither) continue;
      const val = item.system?.badge?.value ?? 0;
      if (!best || val > (best.system?.badge?.value ?? 0)) best = item;
    }
    // Diagnostic log
    const candidates = [...items].filter(i => (i.name ?? "").toLowerCase().includes("expos") || (i.slug ?? "").includes("expos"));
    console.log(`AFLP | findExposedAny on ${tokenActor.name}: found="${best?.name ?? "NONE"}" src="${getItemSourceId(best ?? {})}" nude=${isExposedNudeItem(best ?? {})}`, candidates.map(i => ({ name: i.name, slug: i.slug, src: getItemSourceId(i), badge: i.system?.badge?.value })));
    return best;
  }

  // -----------------------------------------------
  // Helper: wait for the next createChatMessage that
  // contains a PF2e check outcome, then return it.
  // Resolves null on timeout (user cancelled the dialog).
  // -----------------------------------------------
  function waitForCheckOutcome(timeoutMs = 30_000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        Hooks.off("createChatMessage", hookId);
        resolve(null);
      }, timeoutMs);

      // Keep a reference so we can remove the specific listener
      let hookId;
      hookId = Hooks.on("createChatMessage", (msg) => {
        const outcome = msg.flags?.pf2e?.context?.outcome;
        if (!outcome) return; // not a check roll  -  keep waiting
        clearTimeout(timer);
        Hooks.off("createChatMessage", hookId);
        resolve(outcome); // "criticalSuccess"|"success"|"failure"|"criticalFailure"
      });
    });
  }

  // -----------------------------------------------
  // Helper: apply or upgrade a valued condition
  // Stackable conditions (exposed, horny, mind-break) increment; singular ones skip if present.
  // -----------------------------------------------
  const STACKABLE_CAPS = { "exposed": 2, "horny": 3, "mind-break": null, "creature-fetish": 9 };
  const SINGULAR       = new Set(["dominating", "submitting", "defeated", "restrained", "grabbed"]);

  async function applyCondition(actor, slug, sourceId, value = null) {
    const liveActor = actor.token?.actor ?? actor;
    // For "exposed", check for any exposed variant (including exposed-nude) to avoid double-stacking.
    const existing = slug === "exposed"
      ? findExposedAny(liveActor)
      : liveActor.items?.find(c => {
          const src  = c.flags?.core?.sourceId ?? c.sourceId ?? "";
          const cSlug = c.slug ?? c.system?.slug ?? "";
          return cSlug === slug || (sourceId && src === sourceId);
        });
    if (existing) {
      if (slug in STACKABLE_CAPS) {
        const cap     = STACKABLE_CAPS[slug];
        const current = existing.system?.badge?.value ?? 0;
        const next    = value !== null ? Math.max(current, value) : current + 1;
        const capped  = cap !== null ? Math.min(next, cap) : next;
        // Never write to Exposed (Nude) — it's permanent and self-managed by the rune.
        if (capped > current && !isExposedNudeItem(existing)) {
          await existing.update({ "system.badge.value": capped });
        }
      }
      return;
    }
    try {
      const conditionDoc = sourceId ? await fromUuid(sourceId) : null;
      if (!conditionDoc) throw new Error("Not found");
      const itemData = conditionDoc.toObject();
      if (value !== null && itemData.system?.value !== undefined) {
        if (itemData.system?.badge !== undefined) { itemData.system.badge.value = value; }
      }
      await actor.createEmbeddedDocuments("Item", [itemData]);
    } catch (e) {
      if (typeof actor.increaseCondition === "function") {
        await actor.increaseCondition(slug);
      } else {
        console.warn(`AFLP | Could not apply condition ${slug} to ${actor.name}:`, e);
      }
    }
  }

  // -----------------------------------------------
  // Helper: human-readable outcome label
  // -----------------------------------------------
  function formatOutcome(outcome) {
    return {
      criticalSuccess: "Critical Success",
      success:         "Success",
      failure:         "Failure",
      criticalFailure: "Critical Failure",
    }[outcome] ?? outcome;
  }

  // -----------------------------------------------
  // Helper: H scene + chat card after a success
  // -----------------------------------------------
  async function postSuccess(srcToken, tgtToken, chatBody) {
    const srcActor   = srcToken.actor?.getWorldActor?.() ?? srcToken.actor;
    const tgtActor   = tgtToken.actor?.getWorldActor?.() ?? tgtToken.actor;
    const tgtTokenId = tgtToken.id;
    if (AFLP.Settings.hsceneEnabled) {
      const attackerData = {
        id: srcToken.id, actorId: srcToken.actor?.id, name: srcToken.actor?.name ?? srcToken.name,
        img: srcToken.actor?.img ?? srcToken.document?.texture?.src ?? "", tokenDoc: srcToken.document ?? null,
      };
      const targetData = {
        id: tgtToken.id, actorId: tgtToken.actor?.id, name: tgtToken.actor?.name ?? tgtToken.name,
        img: tgtToken.actor?.img ?? tgtToken.document?.texture?.src ?? "", tokenDoc: tgtToken.document ?? null,
      };
      AFLP.HScene.startScene(attackerData, targetData);
      if (AFLP.Settings.proseFlavor) {
        AFLP.HScene.generateAndShowProse(tgtTokenId, "struggle-snuggle", srcActor, tgtActor);
      } else {
        AFLP.HScene.addProse(tgtTokenId, `${srcActor.name} uses Struggle Snuggle on ${tgtActor.name}`, "action");
      }
    }
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">${chatBody}</div>`,
      speaker: ChatMessage.getSpeaker({ actor: srcActor }),
    });
  }

  // -----------------------------------------------
  // Token setup
  // -----------------------------------------------
  const sourceTokens = canvas.tokens.controlled;
  const targets      = [...game.user.targets];

  if (!sourceTokens.length) {
    ui.notifications.warn("AFLP | Select the attacker token.");
    return;
  }
  if (targets.length !== 1) {
    ui.notifications.warn("AFLP | Target exactly one token.");
    return;
  }

  const sourceToken      = sourceTokens[0];
  const sourceTokenActor = sourceToken.actor;
  const sourceActor      = sourceTokenActor?.getWorldActor?.() ?? sourceTokenActor;
  const targetToken      = targets[0];
  const targetTokenActor = targetToken.actor;
  const targetActor      = targetTokenActor?.getWorldActor?.() ?? targetTokenActor;

  if (!sourceActor || !targetActor) {
    ui.notifications.warn("AFLP | Could not resolve actors.");
    return;
  }

  await AFLP.ensureCoreFlags(sourceActor);
  await AFLP.ensureCoreFlags(targetActor);

  const targetId = targetActor.id;
  const targetHasMonstrousProwess = AFLP.actorHasMonstrousProwess(targetActor);
  // Read current effective Exposed value — covers exposed AND exposed-nude variants.
  const currentExposedItem = findExposedAny(targetTokenActor);
  const currentExposed     = currentExposedItem?.system?.badge?.value ?? 0;
  const hasExposedNude = !!currentExposedItem && isExposedNudeItem(currentExposedItem);

  const isAlreadySubmitting = targetTokenActor.items?.some(c =>
    c.slug === "submitting" || c.sourceId === UUID_SUBMITTING
  );
  const isAlreadyGrabbed = targetTokenActor.items?.some(c => c.slug === "grabbed");

  // Synthetic mouse event required by the PF2e action API
  const syntheticEvent = new MouseEvent("click", { bubbles: true, cancelable: true });

  // =================================================
  // PIN MODE — target already Submitting
  // Forego the Strike; just Grapple (no MAP penalty)
  // =================================================
  if (isAlreadySubmitting) {
    const grappleOutcomePromise = waitForCheckOutcome();

    // Fire PF2e's native Grapple action — targets the targeted token automatically
    game.pf2e.actions.get("grapple").use({
      actors: [sourceActor],
      event:  syntheticEvent,
      // No multipleAttackPenalty — no prior Strike this turn
    });

    const grappleOutcome = await grappleOutcomePromise;
    if (!grappleOutcome) {
      ui.notifications.warn("AFLP | Grapple roll timed out or was cancelled.");
      return;
    }

    const grappleHit = grappleOutcome === "success" || grappleOutcome === "criticalSuccess";

    if (!grappleHit) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${sourceActor.name}</strong> tries to pin <strong>${targetActor.name}</strong>
          but the Grapple fails (${formatOutcome(grappleOutcome)}).</p>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }

    // Pin success: Dominating, Restrained, Exposed 2
    await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
    const grabbedPin = targetTokenActor.items?.find(c => c.slug === "grabbed");
    if (grabbedPin) await grabbedPin.delete().catch(() => {});
    if (!targetTokenActor.items?.some(c => c.slug === "restrained")) {
      await targetTokenActor.increaseCondition("restrained");
    }
    if (!targetHasMonstrousProwess) {
      await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, 2);
    }

    await postSuccess(sourceToken, targetToken, `
      <p><strong>${sourceActor.name}</strong> pins <strong>${targetActor.name}</strong> down!
      (Grapple: ${formatOutcome(grappleOutcome)})</p>
      <ul style="margin:4px 0 0 16px;padding:0">
        <li>${sourceActor.name} gains <strong>Dominating</strong></li>
        <li>${targetActor.name} becomes <strong>Restrained</strong></li>
        ${targetHasMonstrousProwess
          ? `<li>${targetActor.name} is immune to <strong>Exposed</strong> (Monstrous Prowess)</li>`
          : hasExposedNude
            ? `<li>${targetActor.name} already has <strong>Exposed (Nude) 2</strong> - no additional Exposed applied</li>`
            : `<li>${targetActor.name} gains <strong>Exposed 2</strong></li>`
        }
      </ul>`);
    return;
  }

  // =================================================
  // NORMAL MODE — Strike first, then Grapple at MAP
  // =================================================

  // Find first melee strike action
  const strike = sourceActor.system?.actions?.find(a =>
    a.type === "strike" && (a.item?.isMelee ?? true)
  ) ?? sourceActor.system?.actions?.[0];

  if (!strike || !strike.variants?.[0]) {
    ui.notifications.warn(
      `AFLP | ${sourceActor.name} has no usable strike actions. Cannot perform Struggle Snuggle.`
    );
    return;
  }

  // --- Strike ---
  const strikeOutcomePromise = waitForCheckOutcome();
  strike.variants[0].roll({ event: syntheticEvent });
  const strikeOutcome = await strikeOutcomePromise;

  if (!strikeOutcome) {
    ui.notifications.warn("AFLP | Strike roll timed out or was cancelled.");
    return;
  }

  // Miss — nothing happens
  if (strikeOutcome === "failure" || strikeOutcome === "criticalFailure") {
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${sourceActor.name}</strong> attempts <strong>Struggle Snuggle</strong>
        on <strong>${targetActor.name}</strong>  -  the Strike misses
        (${formatOutcome(strikeOutcome)}).</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
    return;
  }

  // Strike hit — proceed to Grapple at second MAP (-5)
  const grappleOutcomePromise = waitForCheckOutcome();

  game.pf2e.actions.get("grapple").use({
    actors: [sourceActor],
    event:  syntheticEvent,
    // No MAP penalty — both attacks count toward MAP but neither increases it until after.
    // Any third action this turn would be at -10.
  });

  const grappleOutcome = await grappleOutcomePromise;

  if (!grappleOutcome) {
    ui.notifications.warn("AFLP | Grapple roll timed out or was cancelled.");
    return;
  }

  const grappleHit = grappleOutcome === "success" || grappleOutcome === "criticalSuccess";

  if (!grappleHit) {
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${sourceActor.name}</strong> hit with the Strike
        (${formatOutcome(strikeOutcome)}) but failed the Grapple
        (${formatOutcome(grappleOutcome)}) on <strong>${targetActor.name}</strong>.</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
    return;
  }

  // Both succeeded — apply grapple conditions, then AFLP conditions
  // Crit success OR target already Grabbed → escalate to Restrained
  const normalGrappleCrit = grappleOutcome === "criticalSuccess";
  const applyRestrained   = normalGrappleCrit || isAlreadyGrabbed;

  if (applyRestrained) {
    const grabbedItem = targetTokenActor.items?.find(c => c.slug === "grabbed");
    if (grabbedItem) await grabbedItem.delete().catch(() => {});
    if (!targetTokenActor.items?.some(c => c.slug === "restrained")) {
      await targetTokenActor.increaseCondition("restrained");
    }
  } else {
    if (!targetTokenActor.items?.some(c => c.slug === "grabbed")) {
      await targetTokenActor.increaseCondition("grabbed");
    }
  }

  await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
  await applyCondition(targetTokenActor, "submitting",  UUID_SUBMITTING);
  if (!targetHasMonstrousProwess) {
    await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, null); // increment by 1 (cap 2)
  }

  const grappleCondLabel = applyRestrained
    ? (isAlreadyGrabbed ? "Restrained (escalated from Grabbed)" : "Restrained (critical)")
    : "Grabbed";

  await postSuccess(sourceToken, targetToken, `
    <p><strong>${sourceActor.name}</strong> successfully Struggle Snuggles
    <strong>${targetActor.name}</strong>!
    (Strike: ${formatOutcome(strikeOutcome)}, Grapple: ${formatOutcome(grappleOutcome)})</p>
    <ul style="margin:4px 0 0 16px;padding:0">
      <li>${sourceActor.name} gains <strong>Dominating</strong></li>
      <li>${targetActor.name} gains <strong>Submitting</strong> and <strong>${grappleCondLabel}</strong></li>
      ${targetHasMonstrousProwess
        ? `<li>${targetActor.name} is immune to <strong>Exposed</strong> (Monstrous Prowess)</li>`
        : hasExposedNude
          ? `<li>${targetActor.name} already has <strong>Exposed (Nude) 2</strong> - no additional Exposed applied</li>`
          : `<li>${targetActor.name} gains <strong>Exposed ${Math.min(currentExposed + 1, 2)}</strong>${currentExposed >= 2 ? " (already at cap)" : currentExposed >= 1 ? " (upgraded from 1)" : ""}</li>`
      }
    </ul>`);

})();