// ===============================
// AFLP Macro — Struggle Snuggle (and Snuggle variants)
// ===============================
// Usage: Select the attacker token, target the victim token, run macro.
//
// If the attacker has skill feats granting Sly Snuggle, Sneaky Snuggle, or
// Sex Toy Expertise, a variant-selection dialog appears first.
//
// Variants:
//   Struggle Snuggle  — Strike (melee) + Athletics vs Fortitude
//   Sly Snuggle       — Stride + Diplomacy vs Will
//   Sneaky Snuggle    — Sneak + Deception vs Perception DC
//   Sex Toy Snuggle   — Recall Knowledge (highest modifier) vs Will DC
//
// All successful variants apply: Dominating (source), Submitting + Exposed 1 (target).
//
// ESCAPE MODE — activates automatically when the source has Submitting and is
// the target of an active H-Scene. Uses the Struggle Escape action:
//   Struggle Escape   — Athletics vs Fortitude DC (no Strike required)
//   Sly Escape        — Diplomacy vs Will DC          (requires Sly Snuggle feat)
//   Sneaky Escape     — Deception vs Perception DC    (requires Sneaky Snuggle feat)
//   Sex Toy Escape    — Recall Knowledge vs Will DC   (requires Sex Toy Snuggle feat)
// Failure while Grabbed: becomes Restrained. Success: exit scene. Crit (1 dom): Escape or Reversal.
// Pin mode (target already Submitting): skip first action, attempt check to pin.

(async () => {
  // Daggerheart replaces this PF2e grapple minigame with the Carnal interaction
  // layer: make a Carnal action and have the target resist with a Presence or
  // Instinct Reaction Roll (their choice) vs your Difficulty - out-dom via
  // Presence, out-will via Instinct. So this macro is PF2e-only on DH.
  if (AFLP.system?.id === "daggerheart") {
    ui.notifications.info("AFLR | In Daggerheart, Struggle Snuggle is a Carnal action: make your move and have the target resist with a Presence or Instinct Reaction Roll vs your Difficulty. A failure feeds the spiral (a token).");
    return;
  }
  // Everything below is the PF2e grapple minigame (game.pf2e actions, Fortitude
  // DCs, flat-footed). Guard any non-PF2e system so the macro informs rather than
  // throwing on, e.g., 5e. DH is already handled above with a tailored message.
  if (game.system.id !== "pf2e") {
    ui.notifications.info("AFLR | Struggle Snuggle's grapple minigame is PF2e-specific. On this system, use your system's Carnal action / resist flow instead.");
    return;
  }
  if (!AFLP.Settings.allows("struggleSnuggle")) {
    ui.notifications.warn("AFLR | Struggle Snuggle is a Lewd 4 feature. Raise the Lewd Level (Session Zero) to use it.");
    return;
  }

  const SOCKET = "module.ardisfoxxs-lewd-pf2e";

  // Non-GM players can't create items on other actors directly.
  // We delegate condition application and scene start to the GM via socket.
  // The player still runs the roll dialogs locally; only the write operations go to GM.
  async function delegateToGM(payload) {
    game.socket.emit(SOCKET, { type: "hscene-player-ss", ...payload });
    // Brief delay so conditions are applied before the player sees the result message
    await new Promise(r => setTimeout(r, 600));
  }

  const FLAG = AFLP.FLAG_SCOPE;

  const UUID_DOMINATING   = AFLP.conditions["dominating"].uuid;
  const UUID_SUBMITTING   = AFLP.conditions["submitting"].uuid;
  const UUID_EXPOSED      = AFLP.conditions["exposed"].uuid;
  const UUID_EXPOSED_NUDE = AFLP.conditions["exposed-nude"].uuid;

  // UUIDs for variant feats - actual IDs from the pack
  const UUID_SLY_FEAT    = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.SlySng1e00000001";
  const UUID_SNEAKY_FEAT = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.F4gYvzs4zXj2tOtH";
  const UUID_SEXTOY_FEAT = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.svOYfYAX5tN5WH2i";

  // Resolve sex toys dynamically from the pack so adding new toys in future just works
  const _pack = game.packs.get("ardisfoxxs-lewd-pf2e.aflp-lewd-items");
  const _idx  = await _pack.getIndex();

  function findToy(name) {
    const e = _idx.contents.find(i => i.name === name);
    return e ? { id: e._id, uuid: `Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.${e._id}` } : null;
  }

  const TOY_DEFS = [
    { name: "Nipple Clamps",     price: { sp: 3  }, effect: "nipple-clamps" },
    { name: "Monster Dildo",     price: { sp: 5  }, effect: "dildo"         },
    { name: "Vibrator",          price: { gp: 3  }, effect: "vibrator"      },
    { name: "Vibrating Buttplug",price: { gp: 75 }, effect: "anal-plug"     },
  ];

  // Resolve IDs at runtime, skip any toy not yet in the pack
  const SEX_TOYS = TOY_DEFS.map(t => {
    const resolved = findToy(t.name);
    return resolved ? { ...t, id: resolved.id, uuid: resolved.uuid } : null;
  }).filter(Boolean);

  function priceStr(p) {
    if (p.gp) return `${p.gp} gp`;
    if (p.sp) return `${p.sp} sp`;
    if (p.cp) return `${p.cp} cp`;
    return "free";
  }

  function getItemSourceId(item) {
    return item.flags?.core?.sourceId ?? item.sourceId ?? "";
  }

  function isExposedNudeItem(item) {
    return getItemSourceId(item) === UUID_EXPOSED_NUDE
        || (item.name ?? "").toLowerCase() === "exposed (nude)";
  }

  function findExposedAny(tokenActor) {
    const items = tokenActor.items ?? [];
    let best = null;
    for (const item of items) {
      const slug = item.slug ?? item.system?.slug ?? "";
      const src  = getItemSourceId(item);
      const name = (item.name ?? "").toLowerCase();
      const isEither = slug === "exposed" || src === UUID_EXPOSED || src === UUID_EXPOSED_NUDE
                    || name === "exposed" || name === "exposed (nude)";
      if (!isEither) continue;
      const val = item.system?.badge?.value ?? 0;
      if (!best || val > (best.system?.badge?.value ?? 0)) best = item;
    }
    return best;
  }

  function waitForCheckOutcome(timeoutMs = 30_000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        Hooks.off("createChatMessage", hookId);
        resolve(null);
      }, timeoutMs);
      let hookId;
      hookId = Hooks.on("createChatMessage", (msg) => {
        const outcome = msg.flags?.pf2e?.context?.outcome;
        if (!outcome) return;
        clearTimeout(timer);
        Hooks.off("createChatMessage", hookId);
        resolve(outcome);
      });
    });
  }

  const STACKABLE_CAPS = { "exposed": 2, "horny": 3, "mind-break": null, "creature-fetish": 9 };
  const SINGULAR       = new Set(["dominating", "submitting", "defeated", "restrained", "grabbed"]);

  async function applyCondition(actor, slug, sourceId, value = null) {
    const liveActor = actor.token?.actor ?? actor;
    // Binary AFLR role/state conditions go through the unified flag-aware API
    // (PF2e item / DH flag). Valued conditions (exposed/horny/mind-break) keep
    // the local caps-aware item path below until the 2c adapter flip handles
    // their value semantics.
    if (slug === "dominating" || slug === "submitting" || slug === "defeated") {
      if (AFLP.cond.has(liveActor, slug)) return;
      return AFLP.cond.apply(liveActor, slug, value, actor.token?.id ?? null);
    }
    const existing = slug === "exposed"
      ? findExposedAny(liveActor)
      : liveActor.items?.find(c => {
          const src   = c.flags?.core?.sourceId ?? c.sourceId ?? "";
          const cSlug = c.slug ?? c.system?.slug ?? "";
          return cSlug === slug || (sourceId && src === sourceId);
        });
    if (existing) {
      if (slug in STACKABLE_CAPS) {
        const cap     = STACKABLE_CAPS[slug];
        const current = existing.system?.badge?.value ?? 0;
        const next    = value !== null ? Math.max(current, value) : current + 1;
        const capped  = cap !== null ? Math.min(next, cap) : next;
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
      if (value !== null && itemData.system?.badge !== undefined) {
        itemData.system.badge.value = value;
      }
      await actor.createEmbeddedDocuments("Item", [itemData]);
    } catch (e) {
      if (typeof actor.increaseCondition === "function") {
        await actor.increaseCondition(slug);
      } else {
        console.warn(`AFLR | Could not apply condition ${slug} to ${actor.name}:`, e);
      }
    }
  }

  function formatOutcome(outcome) {
    return {
      criticalSuccess: "Critical Success",
      success:         "Success",
      failure:         "Failure",
      criticalFailure: "Critical Failure",
    }[outcome] ?? outcome;
  }

  async function applySuccessConditions(srcTokenActor, tgtTokenActor, srcActor, tgtActor, tgtHasMonstrousProwess, currentExposedItem, extraConditions = [], toyUuid = null, arousalGain = 0) {
    if (!game.user.isGM) {
      // Delegate all item writes to the GM via socket
      await delegateToGM({
        srcTokenId:      sourceToken.id,
        tgtTokenId:      targetToken.id,
        extraConditions,
        toyUuid,
        arousalGain,
      });
      return;
    }
    window._aflpSSInProgress = true;
    await applyCondition(srcTokenActor, "dominating", UUID_DOMINATING);
    await applyCondition(tgtTokenActor, "submitting",  UUID_SUBMITTING);
    if (!tgtHasMonstrousProwess) {
      await applyCondition(tgtTokenActor, "exposed", UUID_EXPOSED, null);
    }
    window._aflpSSInProgress = false;
  }

  async function startHScene(srcToken, tgtToken, proseFn) {
    if (!AFLP.Settings.hsceneEnabled) return;
    const srcActor = srcToken.actor?.getWorldActor?.() ?? srcToken.actor;
    const tgtActor = tgtToken.actor?.getWorldActor?.() ?? tgtToken.actor;
    const atkData = {
      id: srcToken.id, actorId: srcActor?.id, name: srcActor?.name ?? srcToken.name,
      img: srcActor?.img ?? srcToken.document?.texture?.src ?? "", tokenDoc: srcToken.document ?? null,
    };
    const tgtData = {
      id: tgtToken.id, actorId: tgtActor?.id, name: tgtActor?.name ?? tgtToken.name,
      img: tgtActor?.img ?? tgtToken.document?.texture?.src ?? "", tokenDoc: tgtToken.document ?? null,
    };
    AFLP.HScene.startScene(atkData, tgtData);
    if (AFLP.Settings.proseFlavor && proseFn) {
      AFLP.HScene.generateAndShowProse(tgtToken.id, "struggle-snuggle", srcActor, tgtActor);
    } else {
      AFLP.HScene.addProse(tgtToken.id, proseFn ? proseFn() : `${srcActor?.name} initiates an H-Scene with ${tgtActor?.name}.`, "action");
    }
  }

  // ── Token setup ──────────────────────────────────────────────────────────
  const sourceTokens = canvas.tokens.controlled;
  const targets      = [...game.user.targets];

  if (!sourceTokens.length) { ui.notifications.warn("AFLR | Select the attacker token."); return; }
  if (targets.length !== 1) { ui.notifications.warn("AFLR | Target exactly one token."); return; }

  const sourceToken      = sourceTokens[0];
  const sourceTokenActor = sourceToken.actor;
  const sourceActor      = sourceTokenActor?.getWorldActor?.() ?? sourceTokenActor;
  const targetToken      = targets[0];
  const targetTokenActor = targetToken.actor;
  const targetActor      = targetTokenActor?.getWorldActor?.() ?? targetTokenActor;

  if (!sourceActor || !targetActor) { ui.notifications.warn("AFLR | Could not resolve actors."); return; }

  await AFLP.ensureCoreFlags(sourceActor);
  await AFLP.ensureCoreFlags(targetActor);

  // ── Detect Snuggle variant feats early (needed for escape mechanic too) ──
  function actorHasFeat(actor, uuid) {
    return actor?.items?.some(i =>
      (i.flags?.core?.sourceId ?? i.sourceId ?? "") === uuid ||
      i.slug === uuid.split(".").pop().toLowerCase().replace(/[^a-z]/g,"-")
    );
  }
  const hasSlyFeat    = actorHasFeat(sourceActor, UUID_SLY_FEAT)
    || sourceActor?.items?.some(i => i.slug === "sly-snuggle-technique");
  const hasSneakyFeat = actorHasFeat(sourceActor, UUID_SNEAKY_FEAT)
    || sourceActor?.items?.some(i => i.slug === "sneaky-snuggle-technique");
  const hasSexToyFeat = actorHasFeat(sourceActor, UUID_SEXTOY_FEAT)
    || sourceActor?.items?.some(i => i.slug === "sex-toy-snuggle-technique" || i.slug === "sex-toy-expertise");

  // ── Guard: source is Submitting ────────────────────────────────────────
  // If they're in an active H-Scene as the target, this becomes an escape attempt.
  // Otherwise hard-stop (Submitting from another source with no scene context).
  const sourceIsSubmitting = AFLP.cond.has(sourceTokenActor, "submitting");
  if (sourceIsSubmitting) {
    // Check if they're the TARGET in an active scene
    const escapeScene = AFLP.Settings.hsceneEnabled
      ? AFLP.HScene._getSceneWhereTarget?.(sourceToken.id, sourceActor.id) ?? null
      : null;

    if (!escapeScene) {
      ui.notifications.error(
        "You are Submitting. You must free yourself of that condition before you can use Struggle Snuggle.",
        { permanent: false }
      );
      return;
    }

    // ── ESCAPE ATTEMPT ─────────────────────────────────────────────────
    // Resolve the Dominating attackers acting on THIS escapee specifically
    // (participants whose intentional partner is the source), so escaping one
    // pairing in a multi-pair scene doesn't pull in unrelated dominators.
    const domAttackers = (escapeScene.participants ?? [])
      .filter(p => p.partnerId === sourceToken.id && !p._facing)
      .map(p => canvas?.tokens?.get(p.tokenId)?.actor
             ?? game.actors?.get(p.actorId ?? p.tokenId)
             ?? null)
      .filter(a => AFLP.cond.has(a, "dominating"));

    // Beat the highest Fortitude DC among all Dominating attackers
    const escapeTargetActor = domAttackers.reduce((best, a) => {
      const aFort = a.system?.saves?.fortitude?.value ?? 0;
      const bFort = best?.system?.saves?.fortitude?.value ?? -99;
      return aFort >= bFort ? a : best;
    }, domAttackers[0]);

    if (!escapeTargetActor) {
      ui.notifications.warn("AFLR | Could not find a Dominating creature to escape from.");
      return;
    }

    const escapeDC      = 10 + (escapeTargetActor.system?.saves?.fortitude?.value ?? 0);
    const escapeWillDC  = 10 + (escapeTargetActor.system?.saves?.will?.value ?? 0);
    const escapePercDC  = 10 + (escapeTargetActor.system?.perception?.value ?? 0);
    const isSingleDominator = domAttackers.length === 1;

    // Variant selection for escape (same feats apply)
    const escapeVariants = [{ id: "ss", label: "Struggle Escape", sub: "Athletics vs Fortitude DC " + escapeDC }];
    if (hasSlyFeat)    escapeVariants.push({ id: "sly",    label: "Sly Escape",     sub: "Diplomacy vs Will DC " + escapeWillDC });
    if (hasSneakyFeat) escapeVariants.push({ id: "sneaky", label: "Sneaky Escape",  sub: "Deception vs Perception DC " + escapePercDC });
    if (hasSexToyFeat) escapeVariants.push({ id: "sextoy", label: "Sex Toy Escape", sub: "Recall Knowledge vs Will DC " + escapeWillDC });

    const gangbangNote = domAttackers.length > 1
      ? `<p style="font-size:11px;color:#c9a96e;"><em>Gangbang: beat the highest Fortitude DC (${escapeDC}) among all ${domAttackers.length} Dominators. Will-based variants use that creature's Will DC (${escapeWillDC}), Deception uses Perception DC (${escapePercDC}).</em></p>`
      : "";

    let escapeVariantId = "ss";
    if (escapeVariants.length > 1) {
      const variantBtns = escapeVariants.map(v =>
        `<button type="button" value="${v.id}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;">${v.label}<span style="color:#aaa;font-size:11px;float:right;">${v.sub}</span></button>`
      ).join("");
      const escResult = await foundry.applications.api.DialogV2.wait({
        window: { title: "Escape Attempt — Choose Action" },
        content: `<div style="padding:4px">
          <p><strong>${sourceActor.name}</strong> attempts to break free from <strong>${escapeTargetActor.name}</strong>.</p>
          <p style="font-size:11px;color:#888;">Using the <em>Struggle Escape</em> action.</p>
          ${gangbangNote}
          ${variantBtns}
        </div>`,
        buttons: [{ action: "cancel", label: "Cancel", default: true }],
        close: () => null,
      });
      if (!escResult || escResult === "cancel") return;
      escapeVariantId = escResult;
    }

    // Run the escape roll (same mechanics as regular SS variants)
    let escapeOutcome = null;

    if (escapeVariantId === "ss") {
      // Struggle Escape: Athletics check vs Fortitude DC (no Strike required)
      const checkP = waitForCheckOutcome();
      const athleticsStat = sourceActor.getStatistic?.("athletics") ?? sourceActor.skills?.athletics;
      if (athleticsStat?.roll) {
        athleticsStat.roll({ dc: { value: escapeDC, label: "Escape DC" }, createMessage: true });
      } else {
        // Fallback: use PF2e grapple action (Athletics-based) without Strike
        game.pf2e.actions.get("grapple")?.use?.({ actors: [sourceActor], event: syntheticEvent });
      }
      escapeOutcome = await checkP;
    } else if (escapeVariantId === "sly") {
      // Sly Escape: Diplomacy check vs Will DC
      const checkP = waitForCheckOutcome();
      const diplomacyStat = sourceActor.getStatistic?.("diplomacy") ?? sourceActor.skills?.diplomacy;
      if (diplomacyStat?.roll) {
        diplomacyStat.roll({ dc: { value: escapeWillDC, label: "Escape DC (Will)" }, createMessage: true });
      } else {
        game.pf2e.actions.get("demoralize")?.use?.({ actors: [sourceActor], event: syntheticEvent });
      }
      escapeOutcome = await checkP;
    } else if (escapeVariantId === "sneaky") {
      // Sneaky Escape: Deception check vs Perception DC
      const checkP = waitForCheckOutcome();
      const deceptionStat = sourceActor.getStatistic?.("deception") ?? sourceActor.skills?.deception;
      if (deceptionStat?.roll) {
        deceptionStat.roll({ dc: { value: escapePercDC, label: "Escape DC (Perception)" }, createMessage: true });
      } else {
        game.pf2e.actions.get("feint")?.use?.({ actors: [sourceActor], event: syntheticEvent });
      }
      escapeOutcome = await checkP;
    } else if (escapeVariantId === "sextoy") {
      // Sex Toy Escape: Recall Knowledge check vs Will DC
      const checkP = waitForCheckOutcome();
      const rkStat = sourceActor.getStatistic?.("recall-knowledge") ?? null;
      if (rkStat?.roll) {
        rkStat.roll({ dc: { value: escapeWillDC, label: "Escape DC (Will)" }, createMessage: true });
      } else {
        game.pf2e.actions.get("recall-knowledge")?.use?.({ actors: [sourceActor], event: syntheticEvent });
      }
      escapeOutcome = await checkP;
    }

    if (!escapeOutcome) { ui.notifications.warn("AFLR | Escape roll timed out."); return; }

    const escapeHit = escapeOutcome === "success" || escapeOutcome === "criticalSuccess";
    if (!escapeHit) {
      // If currently Grabbed, failure tightens to Restrained
      if (game.user.isGM) {
        const isGrabbed = sourceTokenActor.items?.some(c => c.slug === "grabbed");
        if (isGrabbed) {
          const grabbedItem = sourceTokenActor.items?.find(c => c.slug === "grabbed");
          if (grabbedItem) await grabbedItem.delete().catch(() => {});
          await sourceTokenActor.increaseCondition?.("restrained").catch(() => {});
        }
      }
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> tries to escape — and fails (${formatOutcome(escapeOutcome)}). The hold tightens.</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }

    // ── On success: offer Escape vs Flip (crit + single dominator only) ─
    let escapeChoice = "escape";
    if (escapeOutcome === "criticalSuccess" && isSingleDominator) {
      escapeChoice = await foundry.applications.api.DialogV2.wait({
        window: { title: "Critical Escape — What Next?" },
        content: `<div style="padding:4px">
          <p><strong>${sourceActor.name}</strong> breaks free with overwhelming force.</p>
          <p>Choose what happens next:</p>
        </div>`,
        buttons: [
          { action: "escape", label: "🏃 Escape — exit scene, move your Speed", default: true },
          { action: "flip",   label: "🔄 Reversal — seize control, switch Dominating/Submitting" },
        ],
        close: () => "escape",
      }) ?? "escape";
    }

    // ── Apply escape ────────────────────────────────────────────────────
    if (escapeChoice === "escape") {
      if (game.user.isGM) {
        // Remove Submitting from source
        await AFLP.cond.remove(sourceTokenActor, "submitting");
        // Remove Grabbed/Restrained from source
        for (const slug of ["grabbed","restrained"]) {
          const item = sourceTokenActor.items?.find(c => c.slug === slug);
          if (item) await item.delete().catch(() => {});
        }
        // Remove Dominating from all scene attackers
        for (const domAtk of domAttackers) {
          await AFLP.cond.remove(domAtk, "dominating");
        }
        // End the scene for the source (they leave)
        AFLP.HScene.removeParticipant?.(escapeScene.targetId, sourceToken.id);
      }
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${sourceActor.name}</strong> breaks free! (${formatOutcome(escapeOutcome)})</p>
          <ul style="margin:4px 0 0 16px;">
            <li>${sourceActor.name} removes <strong>Submitting</strong> and all grapple conditions</li>
            <li>${domAttackers.map(a => a.name).join(", ")} loses <strong>Dominating</strong></li>
            <li>${sourceActor.name} can move their Speed</li>
          </ul>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }

    // ── Apply flip ──────────────────────────────────────────────────────
    if (escapeChoice === "flip") {
      const flipTarget = domAttackers[0]; // single dominator guaranteed here
      const flipTargetToken = canvas?.tokens?.placeables?.find(t => t.actor?.id === flipTarget.id);

      if (game.user.isGM) {
        // Remove Submitting from source; apply Dominating
        await AFLP.cond.remove(sourceTokenActor, "submitting");
        await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);

        // Remove Dominating from former attacker; apply Submitting + Grabbed
        await AFLP.cond.remove(flipTarget, "dominating");
        // Grabbled/Restrained swap
        for (const slug of ["grabbed","restrained"]) {
          const fromSrc = sourceTokenActor.items?.find(c => c.slug === slug);
          if (fromSrc) await fromSrc.delete().catch(() => {});
        }
        if (!flipTarget.items?.some(c => c.slug === "grabbed"))
          await flipTarget.increaseCondition?.("grabbed").catch(() => {});
        await applyCondition(flipTarget, "submitting", UUID_SUBMITTING);

        // Flip the pairing in place: the source becomes the performer acting on
        // flipTarget, who becomes the receiver. Re-points only this pair and
        // leaves any other pairings on the battlemap intact (no scene close).
        if (flipTargetToken) {
          AFLP.HScene.repointPairing?.(escapeScene.id, sourceToken.id, flipTargetToken.id);
        }
      }

      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${sourceActor.name}</strong> turns the tables on <strong>${flipTarget.name}</strong>! (${formatOutcome(escapeOutcome)})</p>
          <ul style="margin:4px 0 0 16px;">
            <li>${sourceActor.name} gains <strong>Dominating</strong></li>
            <li>${flipTarget.name} gains <strong>Submitting</strong> and <strong>Grabbed</strong></li>
            <li>Scene roles reversed — position prompt follows</li>
          </ul>
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }

    return; // safety
  }
  // ── End escape block ──────────────────────────────────────────────────

  // ── Info: source already Dominating → warn but continue ──────────────
  const sourceIsDominating = AFLP.cond.has(sourceTokenActor, "dominating");
  if (sourceIsDominating) {
    ui.notifications.info(
      "Check with your GM if you can Dominate more than one creature at once.",
      { permanent: false }
    );
    // Do not return — allow the action to proceed
  }

  const targetHasMonstrousProwess = AFLP.actorHasMonstrousProwess?.(targetActor) ?? false;
  const currentExposedItem = findExposedAny(targetTokenActor);
  const currentExposed     = currentExposedItem?.system?.badge?.value ?? 0;
  const hasExposedNude     = !!currentExposedItem && isExposedNudeItem(currentExposedItem);

  const isAlreadySubmitting = AFLP.cond.has(targetTokenActor, "submitting");
  const isAlreadyGrabbed = targetTokenActor.items?.some(c => c.slug === "grabbed");
  const syntheticEvent = new MouseEvent("click", { bubbles: true, cancelable: true });

  const variants = [{ id: "ss",  label: "Struggle Snuggle",  sub: "Strike → Athletics vs Fortitude" }];
  if (hasSlyFeat)    variants.push({ id: "sly",    label: "Sly Snuggle",    sub: "Stride → Diplomacy vs Will"    });
  if (hasSneakyFeat) variants.push({ id: "sneaky", label: "Sneaky Snuggle", sub: "Sneak → Deception vs Perception" });
  if (hasSexToyFeat) variants.push({ id: "sextoy", label: "Sex Toy Snuggle", sub: "Recall Knowledge vs Will" });

  // ── Choose variant ────────────────────────────────────────────────────────
  let chosenVariant = "ss";
  if (variants.length > 1) {
    const btnStyle = "display:flex;flex-direction:column;width:100%;background:rgba(255,255,255,0.06);" +
      "border:1px solid rgba(200,160,80,0.3);border-radius:5px;color:#f0e8d0;cursor:pointer;" +
      "padding:8px 12px;margin-bottom:6px;text-align:left;";
    const btns = variants.map(v =>
      `<button type="button" data-choice="${v.id}" style="${btnStyle}">` +
      `<strong style="font-size:12px;color:#c9a96e;">${v.label}</strong>` +
      `<span style="font-size:10px;color:#888;margin-top:2px;">${v.sub}</span></button>`
    ).join("");

    chosenVariant = await new Promise(resolve => {
      foundry.applications.api.DialogV2.wait({
        window: { title: "Choose Approach" },
        content: `<div style="padding:4px 0;">${btns}</div>`,
        buttons: [{ action: "cancel", label: "Cancel", default: true, callback: () => resolve(null) }],
        close: () => resolve(null),
        rejectClose: false,
        render: (ev, dlg) => {
          dlg.element.querySelectorAll("[data-choice]").forEach(b => {
            b.addEventListener("click", () => {
              resolve(b.dataset.choice);
              dlg.close();
            });
          });
        },
      });
    });

    if (!chosenVariant) { ui.notifications.info("AFLR | Cancelled."); return; }
  }

  // ============================================================
  // OUROBOROS — self-targeting
  // ============================================================
  const isSelfTarget = sourceActor.id === targetActor.id;
  if (isSelfTarget) {
    const hasOuroboros = AFLP.actorHasKink?.(sourceActor, "ouroboros") ||
      sourceActor.items?.some(i =>
        i.slug === "ouroboros" ||
        (i.flags?.core?.sourceId ?? i.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.QvwGGnxQotq1giao"
      );
    if (!hasOuroboros) {
      ui.notifications.warn("AFLR | Targeting yourself requires the Ouroboros feat.");
      return;
    }
    if (!game.user.isGM) {
      await delegateToGM({ srcTokenId: sourceToken.id, tgtTokenId: targetToken.id, extraConditions: [] });
    } else {
      window._aflpSSInProgress = true;
      await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
      await applyCondition(sourceTokenActor, "submitting",  UUID_SUBMITTING);
      if (!targetHasMonstrousProwess) await applyCondition(sourceTokenActor, "exposed", UUID_EXPOSED, 1);
      window._aflpSSInProgress = false;
    }
    await startHScene(sourceToken, targetToken);
    return;
  }

  // ============================================================
  // Shared PIN MODE helper (target already Submitting)
  // ============================================================
  async function runPinMode(checkLabel, checkFn) {
    const outcome = await checkFn();
    if (!outcome) { ui.notifications.warn("AFLR | Roll timed out or cancelled."); return; }
    const hit = outcome === "success" || outcome === "criticalSuccess";
    if (!hit) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> tries to pin <strong>${targetActor.name}</strong> but fails (${formatOutcome(outcome)}).</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }
    window._aflpSSInProgress = true;
    await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
    const grabbedPin = targetTokenActor.items?.find(c => c.slug === "grabbed");
    if (grabbedPin) await grabbedPin.delete().catch(() => {});
    if (!targetTokenActor.items?.some(c => c.slug === "restrained"))
      await targetTokenActor.increaseCondition("restrained");
    if (!targetHasMonstrousProwess) await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, 2);
    window._aflpSSInProgress = false;
    await startHScene(sourceToken, targetToken);
    const exposedLine = targetHasMonstrousProwess
      ? `<li>${targetActor.name} is immune to Exposed (Monstrous Prowess)</li>`
      : `<li>${targetActor.name} becomes <strong>Restrained</strong> and <strong>Exposed 2</strong></li>`;
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> pins <strong>${targetActor.name}</strong>! (${checkLabel}: ${formatOutcome(outcome)})</p><ul style="margin:4px 0 0 16px;">${exposedLine}</ul></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
  }

  // Shared success handler (first application)
  async function handleSuccess(checkLabel, outcome, grappleLabel) {
    const extraConds = [];
    if (grappleLabel) {
      const critOrHeld = outcome === "criticalSuccess" || isAlreadyGrabbed;
      if (critOrHeld) {
        extraConds.push({ slug: "restrained", onSource: false });
      } else {
        extraConds.push({ slug: "grabbed", onSource: false });
      }
    }

    if (game.user.isGM) {
      window._aflpSSInProgress = true;
      if (grappleLabel) {
        const critOrHeld = outcome === "criticalSuccess" || isAlreadyGrabbed;
        if (critOrHeld) {
          const grabbedItem = targetTokenActor.items?.find(c => c.slug === "grabbed");
          if (grabbedItem) await grabbedItem.delete().catch(() => {});
          if (!targetTokenActor.items?.some(c => c.slug === "restrained"))
            await targetTokenActor.increaseCondition("restrained");
        } else {
          if (!targetTokenActor.items?.some(c => c.slug === "grabbed"))
            await targetTokenActor.increaseCondition("grabbed");
        }
      }
      await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
      await applyCondition(targetTokenActor, "submitting",  UUID_SUBMITTING);
      if (!targetHasMonstrousProwess) await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, null);
      window._aflpSSInProgress = false;
    } else {
      await delegateToGM({ srcTokenId: sourceToken.id, tgtTokenId: targetToken.id, extraConditions: extraConds });
    }

    await startHScene(sourceToken, targetToken);
    const grappleLine = grappleLabel ? `<li>${targetActor.name} is <strong>${grappleLabel}</strong></li>` : "";
    const exposedLine = targetHasMonstrousProwess
      ? `<li>${targetActor.name} is immune to Exposed (Monstrous Prowess)</li>`
      : hasExposedNude
        ? `<li>${targetActor.name} already has Exposed (Nude) 2</li>`
        : `<li>${targetActor.name} gains <strong>Exposed ${Math.min(currentExposed+1,2)}</strong></li>`;
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> uses <strong>${checkLabel}</strong> on <strong>${targetActor.name}</strong>! (${formatOutcome(outcome)})</p><ul style="margin:4px 0 0 16px;"><li>${sourceActor.name} gains <strong>Dominating</strong></li><li>${targetActor.name} gains <strong>Submitting</strong></li>${grappleLine}${exposedLine}</ul></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
  }

  // ============================================================
  // VARIANT: Struggle Snuggle (Strike + Athletics vs Fortitude)
  // ============================================================
  if (chosenVariant === "ss") {
    if (isAlreadySubmitting) {
      await runPinMode("Grapple", async () => {
        const p = waitForCheckOutcome();
        game.pf2e.actions.get("grapple").use({ actors: [sourceActor], event: syntheticEvent });
        return p;
      });
      return;
    }
    const strike = sourceActor.system?.actions?.find(a => a.type === "strike" && (a.item?.isMelee ?? true))
                ?? sourceActor.system?.actions?.[0];
    if (!strike?.variants?.[0]) {
      ui.notifications.warn(`AFLR | ${sourceActor.name} has no usable strike actions.`);
      return;
    }
    const strikeP = waitForCheckOutcome();
    strike.variants[0].roll({ event: syntheticEvent });
    const strikeOutcome = await strikeP;
    if (!strikeOutcome) { ui.notifications.warn("AFLR | Strike roll timed out."); return; }
    if (strikeOutcome === "failure" || strikeOutcome === "criticalFailure") {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> attempts Struggle Snuggle on <strong>${targetActor.name}</strong> — Strike misses (${formatOutcome(strikeOutcome)}).</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }
    // Struggle Snuggle has the Sexual trait: the Strike deals sexual damage, so a
    // hit raises the TARGET's Arousal by 1 (2 on a crit). This is sexual damage,
    // not a Sexual Advance, so only the target gains Arousal - never the attacker.
    // Applies on the Strike hit, independent of the following Grapple's result.
    {
      const sexAmt = strikeOutcome === "criticalSuccess" ? 2 : 1;
      if (game.user.isGM) {
        await AFLP_Arousal.increment(targetTokenActor, sexAmt, "Struggle Snuggle (sexual)", targetToken.id);
      } else {
        game.socket.emit(SOCKET, { type: "aflp-apply-arousal", tgtTokenId: targetToken.id, amount: sexAmt, source: "Struggle Snuggle (sexual)" });
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const grappleP = waitForCheckOutcome();
    game.pf2e.actions.get("grapple").use({ actors: [sourceActor], event: syntheticEvent });
    const grappleOutcome = await grappleP;
    if (!grappleOutcome) { ui.notifications.warn("AFLR | Grapple roll timed out."); return; }
    if (grappleOutcome === "failure" || grappleOutcome === "criticalFailure") {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> hit (${formatOutcome(strikeOutcome)}) but failed the Grapple (${formatOutcome(grappleOutcome)}) on <strong>${targetActor.name}</strong>.</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }
    const critOrHeld    = grappleOutcome === "criticalSuccess" || isAlreadyGrabbed;
    const grappleLabel  = critOrHeld ? (isAlreadyGrabbed ? "Restrained (escalated)" : "Restrained (crit)") : "Grabbed";
    await handleSuccess("Struggle Snuggle", grappleOutcome, grappleLabel);
    return;
  }

  // ============================================================
  // VARIANT: Sly Snuggle (Stride + Diplomacy vs Will)
  // ============================================================
  if (chosenVariant === "sly") {
    if (isAlreadySubmitting) {
      await runPinMode("Diplomacy", async () => {
        const p = waitForCheckOutcome();
        game.pf2e.actions.get("demoralize").use({ actors: [sourceActor], event: syntheticEvent });
        return p;
      });
      return;
    }
    // Stride (no roll needed — player just moves), then Diplomacy check vs Will
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> uses <strong>Sly Snuggle</strong> — stride toward <strong>${targetActor.name}</strong> and roll a Diplomacy check.</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
    const dipP = waitForCheckOutcome();
    game.pf2e.actions.get("demoralize").use({ actors: [sourceActor], event: syntheticEvent });
    const dipOutcome = await dipP;
    if (!dipOutcome) { ui.notifications.warn("AFLR | Diplomacy roll timed out."); return; }
    if (dipOutcome === "failure" || dipOutcome === "criticalFailure") {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> attempts Sly Snuggle on <strong>${targetActor.name}</strong> — Diplomacy fails (${formatOutcome(dipOutcome)}).</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }
    await handleSuccess("Sly Snuggle", dipOutcome, null);
    return;
  }

  // ============================================================
  // VARIANT: Sneaky Snuggle (Sneak + Deception vs Perception)
  // ============================================================
  if (chosenVariant === "sneaky") {
    if (isAlreadySubmitting) {
      await runPinMode("Deception", async () => {
        const p = waitForCheckOutcome();
        game.pf2e.actions.get("create-a-diversion").use({ actors: [sourceActor], event: syntheticEvent });
        return p;
      });
      return;
    }
    // Sneak (no roll for the movement), then Deception vs Perception DC
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> uses <strong>Sneaky Snuggle</strong> — sneak toward <strong>${targetActor.name}</strong> and roll a Deception check.</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
    const decP = waitForCheckOutcome();
    game.pf2e.actions.get("create-a-diversion").use({ actors: [sourceActor], event: syntheticEvent });
    const decOutcome = await decP;
    if (!decOutcome) { ui.notifications.warn("AFLR | Deception roll timed out."); return; }
    if (decOutcome === "failure" || decOutcome === "criticalFailure") {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> attempts Sneaky Snuggle on <strong>${targetActor.name}</strong> — Deception fails (${formatOutcome(decOutcome)}).</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }
    // Crit success: target also flat-footed (apply to description only, PF2e system handles ff)
    await handleSuccess("Sneaky Snuggle", decOutcome, null);
    if (decOutcome === "criticalSuccess" && !targetTokenActor.items?.some(c => c.slug === "flat-footed")) {
      await targetTokenActor.increaseCondition("flat-footed").catch(() => {});
    }
    return;
  }

  // ============================================================
  // VARIANT: Sex Toy Snuggle (Recall Knowledge vs Will DC)
  // ============================================================
  if (chosenVariant === "sextoy") {
    if (!SEX_TOYS.length) {
      ui.notifications.warn("AFLR | No sex toy items found in the compendium. Add Nipple Clamps, Monster Dildo, or Magical Vibrator to the pack first.");
      return;
    }

    // Find highest knowledge modifier on the source actor
    const KNOWLEDGE_SKILLS = ["arcana","nature","occultism","religion","society","crafting"];
    let bestSkill = "arcana";
    let bestMod   = -999;
    for (const sk of KNOWLEDGE_SKILLS) {
      const mod = sourceActor.system?.skills?.[sk]?.totalModifier
               ?? sourceActor.system?.skills?.[sk]?.value ?? -999;
      if (mod > bestMod) { bestMod = mod; bestSkill = sk; }
    }

    // Toy picker dialog
    const toyBtnStyle = `display:flex;align-items:center;justify-content:space-between;width:100%;
      background:rgba(255,255,255,0.06);border:1px solid rgba(200,160,80,0.3);border-radius:4px;
      color:#f0e8d0;cursor:pointer;padding:8px 12px;margin-bottom:6px;font-size:12px;text-align:left;`;

    const toyButtons = SEX_TOYS.map(t =>
      `<button type="button" data-toy="${t.id}" style="${toyBtnStyle}">
        <span style="color:#c9a96e;font-weight:600;">${t.name}</span>
        <span style="color:#888;">${priceStr(t.price)}</span>
      </button>`
    ).join("");

    const toyResult = await new Promise(resolve => {
      foundry.applications.api.DialogV2.wait({
        window: { title: "Sex Toy Snuggle — Choose Item" },
        content: `
          <div style="padding:6px 0;">
            <p style="font-size:11px;color:#888;margin:0 0 10px;">
              Using: <strong style="color:#c9a96e;">${bestSkill.charAt(0).toUpperCase()+bestSkill.slice(1)}</strong>
              (${bestMod >= 0 ? "+" : ""}${bestMod}) vs target Will DC
            </p>
            ${toyButtons}
            <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:#aaa;margin-top:8px;cursor:pointer;">
              <input type="checkbox" id="sxts-deduct" checked/>
              Deduct gold automatically
            </label>
          </div>`,
        buttons: [{ action: "cancel", label: "Cancel", default: true, callback: () => resolve(null) }],
        close: () => resolve(null),
        rejectClose: false,
        render: (ev, dlg) => {
          dlg.element.querySelectorAll("[data-toy]").forEach(b => {
            b.addEventListener("click", () => {
              const toyId  = b.dataset.toy;
              const deduct = dlg.element.querySelector("#sxts-deduct")?.checked ?? false;
              resolve({ toyId, deduct });
              dlg.close();
            });
          });
        },
      });
    });

    if (!toyResult) { ui.notifications.info("AFLR | Cancelled."); return; }

    const chosenToy = SEX_TOYS.find(t => t.id === toyResult.toyId);
    if (!chosenToy) return;

    // Deduct gold if requested
    if (toyResult.deduct) {
      const currency = foundry.utils.deepClone(sourceActor.system?.currency ?? {});
      const gpCost = chosenToy.price.gp ?? 0;
      const spCost = chosenToy.price.sp ?? 0;
      if (gpCost > 0) {
        if ((currency.gp ?? 0) >= gpCost) {
          currency.gp -= gpCost;
          await sourceActor.update({ "system.currency": currency });
        } else {
          const confirm = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Insufficient Gold" },
            content: `<p>${sourceActor.name} only has ${currency.gp ?? 0} gp but needs ${gpCost} gp. Proceed anyway?</p>`,
          });
          if (!confirm) return;
        }
      } else if (spCost > 0) {
        if ((currency.sp ?? 0) >= spCost) {
          currency.sp -= spCost;
          await sourceActor.update({ "system.currency": currency });
        } else {
          const confirm = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Insufficient Silver" },
            content: `<p>${sourceActor.name} only has ${currency.sp ?? 0} sp but needs ${spCost} sp. Proceed anyway?</p>`,
          });
          if (!confirm) return;
        }
      }
    }

    // Post flavour and run the Recall Knowledge check
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> reaches into their pack and produces a <em>${chosenToy.name}</em> — roll ${bestSkill.charAt(0).toUpperCase()+bestSkill.slice(1)} vs ${targetActor.name}'s Will DC.</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });

    const rkP = waitForCheckOutcome();
    game.pf2e.actions.get("recall-knowledge").use({ actors: [sourceActor], event: syntheticEvent });
    const rkOutcome = await rkP;
    if (!rkOutcome) { ui.notifications.warn("AFLR | Roll timed out."); return; }

    if (rkOutcome === "failure" || rkOutcome === "criticalFailure") {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> misjudged what <strong>${targetActor.name}</strong> needed — the ${chosenToy.name} has no effect (${formatOutcome(rkOutcome)}).</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      });
      return;
    }

    // Success — apply conditions and grant the toy item to the target
    const toyExtraConditions = [];
    if (chosenToy.effect === "vibrator")      toyExtraConditions.push({ slug: "horny", onSource: false, value: 2 });
    if (chosenToy.effect === "dildo")         toyExtraConditions.push({ slug: "horny", onSource: false, value: 1 });
    if (chosenToy.effect === "nipple-clamps") toyExtraConditions.push({ slug: "exposed", onSource: false });
    if (chosenToy.effect === "anal-plug")     toyExtraConditions.push({ slug: "horny", onSource: false, value: 1 });
    const critArousal = rkOutcome === "criticalSuccess" ? (chosenToy.effect === "vibrator" ? 3 : 1) : (chosenToy.effect === "vibrator" ? 2 : 0);

    if (!game.user.isGM) {
      await delegateToGM({
        srcTokenId:      sourceToken.id,
        tgtTokenId:      targetToken.id,
        extraConditions: toyExtraConditions,
        toyUuid:         chosenToy.uuid,
        arousalGain:     critArousal,
      });
    } else {
      window._aflpSSInProgress = true;
      await applyCondition(sourceTokenActor, "dominating", UUID_DOMINATING);
      await applyCondition(targetTokenActor, "submitting",  UUID_SUBMITTING);
      if (!targetHasMonstrousProwess) await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, null);

      // Grant toy to target
      try {
        const toyCompendiumDoc = await fromUuid(chosenToy.uuid);
        if (toyCompendiumDoc) {
          const toyData = toyCompendiumDoc.toObject();
          toyData.system.equipped = { carryType: "worn", inSlot: true };
          await targetActor.createEmbeddedDocuments("Item", [toyData]);
        }
      } catch(e) { console.warn("AFLR | Could not grant toy item:", e); }

      // Toy-specific bonus effects
      if (chosenToy.effect === "vibrator") {
        await AFLP_Arousal?.increment?.(targetActor, critArousal, "Sex Toy Snuggle (Vibrator)");
        await applyCondition(targetTokenActor, "horny", null, 2);
      } else if (chosenToy.effect === "dildo") {
        await applyCondition(targetTokenActor, "horny", null, 1);
      } else if (chosenToy.effect === "nipple-clamps") {
        await applyCondition(targetTokenActor, "exposed", UUID_EXPOSED, null);
      } else if (chosenToy.effect === "anal-plug") {
        await applyCondition(targetTokenActor, "horny", null, 1);
      }
      if (rkOutcome === "criticalSuccess" && chosenToy.effect !== "vibrator") {
        await AFLP_Arousal?.increment?.(targetActor, 1, "Sex Toy Snuggle (critical)");
      }
      window._aflpSSInProgress = false;
    }

    await startHScene(sourceToken, targetToken);

    const critLine = rkOutcome === "criticalSuccess"
      ? `<li>${sourceActor.name} chose <em>exactly</em> the right toy — ${targetActor.name} gains bonus Arousal.</li>` : "";
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${sourceActor.name}</strong> equips the <em>${chosenToy.name}</em> on <strong>${targetActor.name}</strong>. (${formatOutcome(rkOutcome)})</p><ul style="margin:4px 0 0 16px;"><li>${sourceActor.name} gains <strong>Dominating</strong></li><li>${targetActor.name} gains <strong>Submitting</strong> and <strong>Exposed</strong></li><li><em>${chosenToy.name}</em> added to ${targetActor.name}'s inventory</li>${critLine}</ul></div>`,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    });
  }

})();
