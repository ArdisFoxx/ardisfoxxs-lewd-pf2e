// ===============================
// AFLP Kink Automation (aflp-kinks.js)
// ===============================
// On-cum callbacks called directly from _onArousalMax in aflp-arousal.js:
//   Edge Master:      block Afterglow, apply Sickened 2
//   Purity:           Sickened 1 if cumming while Submitting
//   Aphrodisiac Junkie L7: re-enforce permanent Horny 3 after cum
//
// Loaded in index.js "ready" hook. Exposed as AFLP.Kinks.

if (!window.AFLP) window.AFLP = {};

AFLP.Kinks = {

  register() {
    console.log("AFLP | Kink system ready");

    // Bimbo: sync active toggle when Bimbofied is gained/removed
    Hooks.on("createItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug === "bimbofied" || (item.flags?.core?.sourceId ?? item.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V") {
        AFLP.Kinks.syncBimboActive(item.actor);
      }
    });
    Hooks.on("deleteItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug === "bimbofied" || (item.flags?.core?.sourceId ?? item.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V") {
        AFLP.Kinks.syncBimboActive(item.actor);
      }
    });

    // Gangslut: sync Dominator count toggles on combat turn change
    Hooks.on("combatTurnChange", async (combat, _prior, current) => {
      if (!game.user.isGM) return;
      const combatant = combat.combatants.get(current.combatantId);
      if (!combatant?.actor) return;
      const actor = game.actors?.get(combatant.actor.id) ?? combatant.actor;
      await AFLP.Kinks.syncGangslutDominators(actor);
      // Creature Fetish per-turn arousal
      await AFLP.Kinks.onCombatTurnCreatureFetish(actor, combatant.tokenId ?? null);
      // Aphrodisiac Junkie L2 per-turn arousal to Dominators/Submitting
      await AFLP.Kinks.onCombatTurnAphrodisiacJunkieL2(actor);
    });

    // Purity L3: save CF level when Mind Break is gained, restore when it ends
    Hooks.on("createItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.conditions?.["mind-break"]?.uuid;
      if (isMindBreak) AFLP.Kinks.onMindBreakGainedPurity(item.actor);
    });
    Hooks.on("deleteItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug === "bimbofied" || (item.flags?.core?.sourceId ?? item.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V") {
        AFLP.Kinks.syncBimboActive(item.actor);
      }
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.conditions?.["mind-break"]?.uuid;
      if (isMindBreak) AFLP.Kinks.onMindBreakEndPurity(item.actor);
    });
  },

  // -----------------------------------------------
  // Edge Master: on cum, Sickened 2 instead of Afterglow.
  // Returns true if Edge Master handled the post-cum effect.
  // -----------------------------------------------
  async onCumPostEffect(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "edge-master")) return false;

    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

    // Remove Afterglow if it was applied
    const afterglow = liveActor.items?.find(c =>
      c.slug === "afterglow" ||
      c.sourceId?.includes(AFLP.conditions?.["afterglow"]?.uuid ?? "NOMATCH")
    );
    if (afterglow) {
      await afterglow.delete().catch(() => {});
    }

    // Apply Sickened 2 via PF2e condition system
    if (typeof liveActor.increaseCondition === "function") {
      const existing = liveActor.items?.find(c => c.slug === "sickened");
      if (existing) {
        const current = existing.system?.badge?.value ?? existing.system?.value?.value ?? 0;
        if (current < 2) {
          await existing.update({ "system.badge.value": 2 });
        }
      } else {
        await liveActor.increaseCondition("sickened");
        const sickened = liveActor.items?.find(c => c.slug === "sickened");
        if (sickened) {
          const val = sickened.system?.badge?.value ?? sickened.system?.value?.value ?? 1;
          if (val < 2) await sickened.update({ "system.badge.value": 2 });
        }
      }
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong>'s Edge Master kink replaces Afterglow with <strong>Sickened 2</strong>.</p>
        <p><em>Satisfaction breeds weakness...</em></p>
      </div>`,
      speaker: { alias: "AFLP" },
    });

    console.log(`AFLP | ${actor.name} Edge Master: Sickened 2 applied instead of Afterglow`);
    return true;
  },

  // -----------------------------------------------
  // Purity: on cum while Submitting, Sickened 1.
  // -----------------------------------------------
  async onCumPurityCheck(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "purity")) return;

    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

    const isSubmitting = liveActor.items?.some(c =>
      c.slug === "submitting" ||
      c.sourceId?.includes(AFLP.conditions?.["submitting"]?.uuid ?? "NOMATCH")
    );
    if (!isSubmitting) return;

    if (typeof liveActor.increaseCondition === "function") {
      const existing = liveActor.items?.find(c => c.slug === "sickened");
      if (!existing) {
        await liveActor.increaseCondition("sickened");
      }
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong>'s Purity kink triggers: <strong>Sickened 1</strong> from non-consensual orgasm.</p>
      </div>`,
      speaker: { alias: "AFLP" },
    });

    console.log(`AFLP | ${actor.name} Purity: Sickened 1 (cummed while Submitting)`);
  },

  // -----------------------------------------------
  // Aphrodisiac Junkie L7: re-apply Horny (Always) 3 after cum.
  // Regular Horny gets cleared on cum. If the actor has Aphrodisiac
  // Junkie L7, ensure Horny (Always) is at least 3.
  // -----------------------------------------------
  async enforceAphrodisiacJunkieL7(actor) {
    if (!AFLP.actorHasKink(actor, "aphrodisiac-junkie")) return;
    const level = actor.system?.details?.level?.value ?? 0;
    if (level < 7) return;

    // Aphrodisiac Junkie L7 grants permanent Horny 3 via the world flag.
    // permanent is never cleared on cum; we only write if it needs bumping up.
    const horny = structuredClone(actor.getFlag(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
    if ((horny.permanent ?? 0) < 3) {
      horny.permanent = 3;
      await actor.setFlag(AFLP.FLAG_SCOPE, "horny", horny);
      console.log(`AFLP | ${actor.name} Aphrodisiac Junkie L7: permanent Horny raised to 3`);
    }
  },

  // -----------------------------------------------
  // tryEdge — called from _onArousalMax before cum resolves.
  //
  // Returns true  → Edge succeeded; cum should be cancelled.
  // Returns false → Edge failed, skipped, or declined; cum proceeds.
  //
  // context.isMasturbation = true enables Edge Master L3 auto-succeed.
  // -----------------------------------------------
  async tryEdge(actor, tokenId = null, context = {}) {
    if (!AFLP.Settings.automation) return false;
    if (!AFLP.Settings.edgeAuto)   return false;

    // Animated Bitchsuit: blocks Edge entirely
    if (window.AFLP_Bitchsuit?.blocksEdge?.(actor)) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> cannot Edge — the Animated Bitchsuit does not permit denial.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      return false;
    }

    const isNPC = actor.type === "npc" || actor.type === "hazard";
    if (isNPC && !AFLP.Settings.edgeIncludeNpc) return false;

    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorLevel = actor.system?.details?.level?.value ?? 1;
    const actorName  = actor.name;

    // ── Edge Master L3: auto-succeed if cum was triggered by masturbation (Sexual Advance) ──
    const edgeMasterLevel = AFLP.getKinkLevel(actor, "edge-master");
    if (edgeMasterLevel >= 3 && context.isMasturbation) {
      await AFLP.Kinks._resolveEdgeSuccess(actor, liveActor, tokenId, actorName, actorLevel, "auto (Edge Master L3)");
      return true;
    }

    // ── If skip-dialog is on, roll immediately ──
    if (AFLP.Settings.edgeSkipDialog) {
      return await AFLP.Kinks._rollEdge(actor, liveActor, tokenId, actorName, actorLevel);
    }

    // ── Confirmation dialog ──
    const dc = AFLP.Kinks._normalDC(actorLevel);
    const emNote = edgeMasterLevel >= 2
      ? `<p style="font-size:11px;color:#8060a0;"><strong>Edge Master:</strong> Success grants +${edgeMasterLevel >= 7 ? 4 : 2} to weapon and unarmed damage until end of next turn.</p>`
      : "";

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `${actorName} — Attempt to Edge?` },
      content: `<div style="margin-bottom:8px;">
        <p><strong>${actorName}</strong> is about to Cum.</p>
        <p>Attempt the <strong>Edge</strong> reaction? (Fortitude DC ${dc})</p>
        <p style="font-size:11px;color:#666;margin-top:6px;">
          <em>Edge uses your reaction. Success: Cum does not occur; gain Denied 1.<br>
          Failure: Cum proceeds normally.</em>
        </p>${emNote}
      </div>`,
      buttons: [
        { action: "roll", label: "Roll Edge",       icon: "fa-solid fa-dice-d20", default: true, callback: async () => true  },
        { action: "skip", label: "Don't Edge — Cum", icon: "fa-solid fa-times",                  callback: async () => false },
      ],
      close: () => false,
    });

    if (result === true) {
      return await AFLP.Kinks._rollEdge(actor, liveActor, tokenId, actorName, actorLevel);
    }
    return false;
  },

  // Roll Fortitude vs normal DC; apply results. Returns true on success.
  async _rollEdge(actor, liveActor, tokenId, actorName, actorLevel) {
    const dc = AFLP.Kinks._normalDC(actorLevel);

    // Use PF2e's built-in save roll
    const rollOptions = ["action:edge"];
    let roll;
    try {
      // PF2e system: actor.saves.fortitude.roll({ ...options })
      roll = await actor.saves?.fortitude?.roll({
        dc: { value: dc },
        rollMode: "publicroll",
        extraRollOptions: rollOptions,
      });
    } catch (e) {
      console.warn("AFLP | Edge: Fortitude roll failed, defaulting to manual.", e);
      roll = null;
    }

    if (!roll) {
      // Fallback: plain d20 roll posted to chat
      roll = await new Roll("1d20").evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor:  `<strong>${actorName}</strong> attempts to Edge (Fortitude DC ${dc})`,
      });
    }

    // Determine outcome from roll total vs DC
    const total = roll.total ?? roll._total ?? 0;
    const succeeded = total >= dc;
    const crit = total >= dc + 10;

    if (succeeded) {
      await AFLP.Kinks._resolveEdgeSuccess(actor, liveActor, tokenId, actorName, actorLevel, crit ? "critical success" : "success");
      return true;
    } else {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actorName}</strong> fails to Edge (${total} vs DC ${dc}) — Cum proceeds.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      return false;
    }
  },

  // Apply the effects of a successful Edge: no cum, Denied 1, Edge Master L2 bonus.
  async _resolveEdgeSuccess(actor, liveActor, tokenId, actorName, actorLevel, outcomeLabel) {
    const FLAG            = AFLP.FLAG_SCOPE;
    const edgeMasterLevel = AFLP.getKinkLevel(actor, "edge-master");

    // Apply Denied 1 to the flag (stackable, no cap per rules)
    const denied = structuredClone(actor.getFlag(FLAG, "denied") ?? AFLP.deniedDefaults);
    denied.value = Math.min(6, (denied.value ?? 0) + 1);
    await actor.setFlag(FLAG, "denied", denied);

    // Purity kink: when successfully Edging, gain 2 Denied instead of 1
    if (AFLP.actorHasKink(actor, "purity")) {
      denied.value = Math.min(6, denied.value + 1);
      await actor.setFlag(FLAG, "denied", denied);
    }

    // Edge Master L2+: +2 damage bonus until end of next turn (chat reminder only)
    const emBonus = edgeMasterLevel >= 7 ? 4 : edgeMasterLevel >= 2 ? 2 : 0;
    const deniedTotal = denied.value;

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actorName}</strong> successfully Edges! (${outcomeLabel})</p>
        <p>The Cum does not occur. <strong>${actorName}</strong> gains <strong>Denied 1</strong> (now Denied ${deniedTotal}).</p>
        ${emBonus > 0 ? `<p><em>Edge Master: +${emBonus} to weapon and unarmed damage until end of next turn.</em></p>` : ""}
      </div>`,
      speaker: { alias: "AFLP" },
    });

    // Sentient item reaction to Edge success
    if (window.AFLP_SentientItems) {
      await AFLP_SentientItems.onActorEdge(actor);
    }

    console.log(`AFLP | ${actorName} Edge: succeeded (${outcomeLabel}), Denied now ${deniedTotal}`);
  },

  // Normal DC by level — matches PF2e Simple DC table (GMG p.503 / remaster).
  _normalDC(level) {
    const table = [14,15,15,16,17,17,18,19,19,20,21,21,22,23,23,24,25,25,26,27,27,28,29,29];
    const idx   = Math.max(0, Math.min(level, table.length - 1));
    return table[idx] ?? 14;
  },

  // -----------------------------------------------
  // Bimbo kink — fires on SA and on each arousal increment while Bimbofied.
  // L1: Toggle aflp:bimbo-active RollOption when Bimbofied is present.
  // -----------------------------------------------
  async syncBimboActive(actor) {
    if (!AFLP.actorHasKink(actor, "bimbo")) return;
    const liveActor    = game.actors?.get(actor.id) ?? actor;
    const isBimbofied  = liveActor.items?.some(i =>
      i.slug === "bimbofied" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V"
    );
    // Find the Bimbo kink item on the actor and flip its RollOption toggle
    const bimboItem = liveActor.items?.find(i =>
      i.slug === "bimbo" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.kinks["bimbo"]?.uuid
    );
    if (!bimboItem) return;
    const rules = foundry.utils.deepClone(bimboItem.system?.rules ?? []);
    let changed = false;
    for (const r of rules) {
      if (r.key === "RollOption" && r.option === "aflp:bimbo-active") {
        if (r.value !== !!isBimbofied) { r.value = !!isBimbofied; changed = true; }
      }
    }
    if (changed) await bimboItem.update({ "system.rules": rules });
  },

  // -----------------------------------------------
  // Gangslut kink — sync Dominator count toggles on the kink item.
  // Called from combatTurnChange or when scene attackers change.
  // -----------------------------------------------
  async syncGangslutDominators(actor) {
    if (!AFLP.actorHasKink(actor, "gangslut")) return;
    const liveActor = game.actors?.get(actor.id) ?? actor;

    // Count how many scene attackers have Dominating condition
    let domCount = 0;
    if (AFLP.Settings.hsceneEnabled && AFLP.HScene._getScene) {
      const scene = AFLP.HScene._getScene(actor.id);
      if (scene) {
        for (const atk of (scene.attackers ?? [])) {
          const atkActor = canvas?.tokens?.get(atk.id)?.actor
                        ?? game.actors?.get(atk.actorId ?? atk.id);
          if (!atkActor) continue;
          const isDom = atkActor.items?.some(i =>
            i.slug === "dominating" ||
            (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.conditions["dominating"]?.uuid
          );
          if (isDom) domCount++;
        }
      }
    }

    const gangItem = liveActor.items?.find(i =>
      i.slug === "gangslut" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.kinks["gangslut"]?.uuid
    );
    if (!gangItem) return;
    const rules = foundry.utils.deepClone(gangItem.system?.rules ?? []);
    let changed = false;
    for (const r of rules) {
      if (r.key !== "RollOption") continue;
      let target = null;
      if (r.option === "aflp:gangslut-dom-1plus") target = domCount >= 1;
      if (r.option === "aflp:gangslut-dom-2plus") target = domCount >= 2;
      if (r.option === "aflp:gangslut-dom-3plus") target = domCount >= 3;
      if (target !== null && r.value !== target) { r.value = target; changed = true; }
    }
    if (changed) await gangItem.update({ "system.rules": rules });
  },

  // -----------------------------------------------
  // Creature Fetish — per-turn arousal when fetish creature within 30ft.
  // -----------------------------------------------
  async onCombatTurnCreatureFetish(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "creature-fetish")) return;
    const cfLevel = AFLP.getKinkLevel(actor, "creature-fetish");
    if (cfLevel <= 0) return;
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const sexual = worldActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? AFLP.sexualDefaults;
    const fetchType = (sexual.kinkNotes?.["creature-fetish"] ?? "").toLowerCase().trim();
    if (!fetchType) return;
    const token = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;
    const nearby = canvas?.tokens?.placeables?.some(t => {
      if (t.id === token.id || !t.actor) return false;
      if (canvas.grid.measureDistance(token, t, { gridSpaces: true }) > 30) return false;
      const type = (t.actor.system?.details?.creatureType ?? t.actor.system?.traits?.value?.join(" ") ?? "").toLowerCase();
      return type.includes(fetchType) || (t.actor.name ?? "").toLowerCase().includes(fetchType);
    });
    if (!nearby) return;
    await AFLP.ensureCoreFlags(actor);
    const gain = await AFLP_Arousal.increment(actor, cfLevel, `Creature Fetish (${fetchType})`, tokenId);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Creature Fetish triggers — +${gain?.applied ?? cfLevel} Arousal from nearby ${fetchType}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Aphrodisiac Junkie L2 — per-turn +1 Arousal to Dominators/Submitting creatures
  // while this actor is affected by an aphrodisiac.
  // -----------------------------------------------
  async onCombatTurnAphrodisiacJunkieL2(actor) {
    if (!AFLP.actorHasKink(actor, "aphrodisiac-junkie")) return;
    if ((actor.system?.details?.level?.value ?? 0) < 2) return;
    const liveActor = game.actors?.get(actor.id) ?? actor;
    const hasAphrodisiac = liveActor.items?.some(i =>
      i.system?.traits?.value?.includes("aphrodisiac") ||
      (i.name ?? "").toLowerCase().includes("aphrodisiac")
    );
    if (!hasAphrodisiac) return;
    const sceneData = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
    if (!sceneData) return;
    const affected = [];
    for (const p of [...(sceneData.attackers ?? []), { actorId: sceneData.targetActorId }]) {
      const pActor = game.actors?.get(p.actorId ?? p.id);
      if (!pActor || pActor.id === actor.id) continue;
      const domUUID = AFLP.conditions["dominating"]?.uuid;
      const subUUID = AFLP.conditions["submitting"]?.uuid;
      const isDom = pActor.items?.some(i => i.slug === "dominating"  || (i.flags?.core?.sourceId ?? i.sourceId) === domUUID);
      const isSub = pActor.items?.some(i => i.slug === "submitting"  || (i.flags?.core?.sourceId ?? i.sourceId) === subUUID);
      if (isDom || isSub) affected.push(pActor);
    }
    if (!affected.length) return;
    for (const pActor of affected) {
      await AFLP.ensureCoreFlags(pActor);
      await AFLP_Arousal.increment(pActor, 1, `Aphrodisiac Junkie L2 (${actor.name})`, null);
    }
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s aphrodisiac sweat affects ${affected.map(a => a.name).join(", ")} (+1 Arousal each).</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Aphrodisiac Junkie L7 — on cum, Stunned 2 to Dominators/Submitting creatures.
  // -----------------------------------------------
  async onCumAphrodisiacJunkieL7(actor) {
    if (!AFLP.actorHasKink(actor, "aphrodisiac-junkie")) return;
    if ((actor.system?.details?.level?.value ?? 0) < 7) return;
    const sceneData = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
    if (!sceneData) return;
    const stunned = [];
    const domUUID = AFLP.conditions["dominating"]?.uuid;
    const subUUID = AFLP.conditions["submitting"]?.uuid;
    for (const p of [...(sceneData.attackers ?? []), { actorId: sceneData.targetActorId }]) {
      const pActor = game.actors?.get(p.actorId ?? p.id);
      if (!pActor || pActor.id === actor.id) continue;
      const isDom = pActor.items?.some(i => i.slug === "dominating" || (i.flags?.core?.sourceId ?? i.sourceId) === domUUID);
      const isSub = pActor.items?.some(i => i.slug === "submitting" || (i.flags?.core?.sourceId ?? i.sourceId) === subUUID);
      if (!isDom && !isSub) continue;
      try { await pActor.increaseCondition("stunned", { value: 2 }); } catch { /* no-op */ }
      stunned.push(pActor.name);
    }
    if (stunned.length) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s orgasm stuns ${stunned.join(", ")} (Stunned 2 — Aphrodisiac Junkie L7).</p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },

  // -----------------------------------------------
  // Purity L3 — save CF level when Mind Break is gained; restore on removal.
  // -----------------------------------------------
  onMindBreakGainedPurity(actor) {
    if (!AFLP.actorHasKink(actor, "purity")) return;
    if ((actor.system?.details?.level?.value ?? 0) < 3) return;
    const liveActor = game.actors?.get(actor.id) ?? actor;
    const cfItem = liveActor.items?.find(i =>
      i.slug === "creature-fetish" || (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.kinks["creature-fetish"]?.uuid
    );
    const savedLevel = cfItem?.system?.badge?.value ?? 0;
    actor.setFlag(AFLP.FLAG_SCOPE, "puritySavedCFLevel", savedLevel);
    console.log(`AFLP | Purity L3: saved CF level ${savedLevel} for ${actor.name}`);
  },

  async onMindBreakEndPurity(actor) {
    if (!AFLP.actorHasKink(actor, "purity")) return;
    if ((actor.system?.details?.level?.value ?? 0) < 3) return;
    const liveActor = game.actors?.get(actor.id) ?? actor;
    const savedCFLevel = liveActor.getFlag(AFLP.FLAG_SCOPE, "puritySavedCFLevel");
    if (savedCFLevel === undefined) return;
    await actor.unsetFlag(AFLP.FLAG_SCOPE, "puritySavedCFLevel");
    const cfItem = liveActor.items?.find(i =>
      i.slug === "creature-fetish" || (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.kinks["creature-fetish"]?.uuid
    );
    if (!cfItem) return;
    const current = cfItem.system?.badge?.value ?? 1;
    if (current <= savedCFLevel) return;
    if (savedCFLevel === 0) await cfItem.delete().catch(() => {});
    else await cfItem.update({ "system.badge.value": savedCFLevel });
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Purity kink: Creature Fetish reverted to ${savedCFLevel} (Mind Break ended).</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },
};
