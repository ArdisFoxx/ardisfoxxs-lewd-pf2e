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

    // Bimbomancer Dedication: intercept Stupified and convert to Bimbofied
    Hooks.on("preCreateItem", async (item, data, options, userId) => {
      if (!game.user.isGM || !item.parent) return;
      const slug = data?.system?.slug ?? item.slug ?? "";
      if (slug !== "stupefied") return;
      const intercepted = await AFLP.Kinks.interceptStupified(item.parent, data);
      if (intercepted) {
        // Prevent the Stupified item from being created
        return false;
      }
    });

    // -----------------------------------------------
    // Bimbomancer feat flags: set world flags when feat items
    // are added to or removed from an actor.
    //
    // Bimbomancer Dedication  → bimbomancerDedication: true
    // My Body is a Weapon     → myBodyIsAWeapon: true
    // Like, Ohmigawd!         → likeOhmigawd: true
    // -----------------------------------------------
    const BIMBO_FEAT_FLAGS = {
      "dRrGx7OimApgOJra": "bimbomancerDedication",  // Bimbomancer Dedication
      "kqE07yZqU3bcknug": "myBodyIsAWeapon",         // My Body is a Weapon
      "eKzve3m9LY1skzKB": "likeOhmigawd",            // Like, Ohmigawd!
      "XpL5afd2Zygfxkz2": "skycladIdolDedication",   // Skyclad Idol Dedication
    };

    const getFeatFlagKey = (item) => {
      if (!item.actor || item.type !== "feat") return null;
      // Match by compendium source ID or by direct _id if already embedded
      const src = item.flags?.core?.sourceId ?? item.sourceId ?? "";
      for (const [id, flagKey] of Object.entries(BIMBO_FEAT_FLAGS)) {
        if (src.endsWith(`.${id}`) || src.endsWith(`/${id}`)) return flagKey;
      }
      return null;
    };

    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM) return;
      const flagKey = getFeatFlagKey(item);
      if (!flagKey) return;
      await item.actor.setFlag(AFLP.FLAG_SCOPE, flagKey, true);
      console.log(`AFLP | Bimbomancer: set flag ${flagKey} on ${item.actor.name}`);
    });

    Hooks.on("deleteItem", async (item) => {
      if (!game.user.isGM) return;
      const flagKey = getFeatFlagKey(item);
      if (!flagKey) return;
      await item.actor.unsetFlag(AFLP.FLAG_SCOPE, flagKey);
      console.log(`AFLP | Bimbomancer: unset flag ${flagKey} on ${item.actor.name}`);
    });

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
      // Dominating/Submitting idle arousal passives
      await AFLP.Kinks.onCombatTurnIdleArousal(actor);
      // Pacifying cock: enforce Horny 2 on targets Submitting to a pacifying-cock source
      await AFLP.Kinks.onCombatTurnPacifying(actor, combatant.tokenId ?? null);
      // Bimbomancer: Paizuri aura (Horny 1 to nearby when paizuri cumflation >= 4)
      await AFLP.Kinks.onCombatTurnPaizuriAura(actor, combatant.tokenId ?? null);
      // Skyclad Idol: Engine — Arousal gain while Exposed and observed
      await AFLP.Kinks.onCombatTurnSkycladEngine(actor, combatant.tokenId ?? null);
      // Sticky Bomb: apply per-turn Arousal to actors Grabbed/Restrained by a sticky bomb
      await AFLP.Kinks.onCombatTurnStickyBomb(actor, combatant.tokenId ?? null);
    });

    // Clean up turn-start arousal snapshots when combat ends
    Hooks.on("deleteCombat", async (combat) => {
      if (!game.user.isGM) return;
      const FLAG = AFLP.FLAG_SCOPE;
      for (const combatant of combat.combatants) {
        const actor = game.actors?.get(combatant.actor?.id);
        if (!actor) continue;
        const snap = actor.getFlag(FLAG, "_arousalAtTurnStart");
        if (snap != null) await actor.unsetFlag(FLAG, "_arousalAtTurnStart");
      }
    });

    // Mind Break gained: store the primary creature type of scene attackers,
    // and Purity L3 CF save. Both fire from createItem.
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.conditions?.["mind-break"]?.uuid;
      if (!isMindBreak) return;

      AFLP.Kinks.onMindBreakGainedPurity(item.actor);

      // Prompt GM to choose which creature type to assign for CF grant at MB end.
      // Only fires on first application (badge value 1) — don't re-prompt on re-apply.
      const isFirst = (item.system?.badge?.value ?? 1) === 1;
      const alreadySet = !!item.actor.getFlag(AFLP.FLAG_SCOPE, "mbCreatureType");
      if (isFirst && !alreadySet) {
        const CREATURE_TYPES = new Set(["aberration","animal","beast","celestial","construct","daemon","dragon","elemental","fey","fiend","fungus","giant","humanoid","monitor","ooze","petitioner","plant","spirit","undead"]);
        // Gather all creature types present on scene attackers, preserving order
        const hscene = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(item.actor.id) : null;
        const availableTypes = [];
        for (const atk of hscene?.attackers ?? []) {
          const atkActor = game.actors?.get(atk.actorId);
          if (!atkActor) continue;
          const traits = atkActor.system?.traits?.value ?? [];
          for (const t of traits) {
            if (CREATURE_TYPES.has(t) && !availableTypes.includes(t)) availableTypes.push(t);
          }
        }
        // Fall back to full list if no scene / no typed attackers
        const typeList = availableTypes.length ? availableTypes : [...CREATURE_TYPES].sort();

        // Build dialog — auto-confirm if only one type available
        const chooseType = await new Promise(resolve => {
          if (typeList.length === 1) { resolve(typeList[0]); return; }
          const optionsHtml = typeList.map(t =>
            `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
          ).join("");
          foundry.applications.api.DialogV2.wait({
            window: { title: "Mind Break — Creature Fetish" },
            content: `
              <p style="margin-bottom:8px;">
                <strong>${item.actor.name}</strong> has broken. Choose the creature type
                they will develop a fetish for when Mind Break ends.
              </p>
              <div style="display:flex;align-items:center;gap:8px;">
                <label style="flex-shrink:0;">Creature type:</label>
                <select id="aflp-mb-type" style="flex:1;">${optionsHtml}</select>
              </div>`,
            buttons: [
              {
                action: "ok",
                label: "Confirm",
                default: true,
                callback: (ev, btn, dlg) => resolve(dlg.element.querySelector("#aflp-mb-type")?.value ?? null),
              },
              {
                action: "none",
                label: "No Fetish",
                callback: () => resolve(null),
              },
            ],
            close: () => resolve(null),
            rejectClose: false,
          });
        });

        if (chooseType) {
          await item.actor.setFlag(AFLP.FLAG_SCOPE, "mbCreatureType", chooseType);
        }
      }
    });
    Hooks.on("deleteItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug === "bimbofied" || (item.flags?.core?.sourceId ?? item.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V") {
        AFLP.Kinks.syncBimboActive(item.actor);
      }
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.conditions?.["mind-break"]?.uuid;
      if (isMindBreak) AFLP.Kinks.onMindBreakEndPurity(item.actor);
      if (isMindBreak) AFLP.Kinks.onMindBreakEndCreatureFetish(item);  // pass full item — badge value read here
      if (isMindBreak) AFLP.Kinks.onMindBreakEndCumSlut(item);         // L7: long rest reminder
    });

    // Party Animal: +1 Horny (max 3) when a drug affliction stage advances
    Hooks.on("updateItem", async (item, diff) => {
      if (!game.user.isGM) return;
      if (!item.actor) return;
      if (item.type !== "affliction") return;
      const newStage = diff?.system?.badge?.value;
      if (newStage == null) return;
      const oldStage = item.system?.badge?.value ?? 0;
      if (newStage <= oldStage) return; // only on advance, not on decrease
      if (!AFLP.actorHasKink(item.actor, "party-animal")) return;
      await AFLP.Kinks.onDrugStageAdvancePartyAnimal(item.actor, newStage - oldStage);
    });

    // Exhibitionist: while Exposed, gain Horny equal to Exposed value (max 3).
    // Fires when the Exposed condition is applied or its badge value increases.
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug !== "exposed") return;
      if (!AFLP.Settings.automation) return;
      if (!AFLP.actorHasKink(item.actor, "exhibitionist")) return;
      const exposedVal = item.system?.badge?.value ?? 1;
      await AFLP.Kinks.onExposedChangeExhibitionist(item.actor, exposedVal);
    });
    Hooks.on("updateItem", async (item, diff) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug !== "exposed") return;
      if (!AFLP.Settings.automation) return;
      const newVal = diff?.system?.badge?.value;
      if (newVal == null) return;
      const oldVal = item.system?.badge?.value ?? 0;
      if (newVal <= oldVal) return; // only on increase
      if (!AFLP.actorHasKink(item.actor, "exhibitionist")) return;
      await AFLP.Kinks.onExposedChangeExhibitionist(item.actor, newVal);
    });

    // Bondage Princess: +1 Horny (max 3) when an item with the bondage trait is equipped.
    // Only fires for physical items (equipment, weapon, armor, shield) — not effects or
    // conditions that happen to carry the bondage trait internally.
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (!AFLP.Settings.automation) return;
      const physicalTypes = ["equipment", "weapon", "armor", "shield", "consumable", "backpack"];
      if (!physicalTypes.includes(item.type)) return;
      const hasBondageTrait = item.system?.traits?.value?.includes("bondage");
      if (!hasBondageTrait) return;
      if (!AFLP.actorHasKink(item.actor, "bondage-princess")) return;
      await AFLP.Kinks.onBondageItemEquippedBondagePrincess(item.actor);
    });

    // Exhibitionist L2: "When you become Frightened, reduce the level of Frightened by 1
    // and are Horny 1 instead."
    // Hooks on Frightened being applied (createItem) or increased (updateItem).
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (!AFLP.Settings.automation) return;
      if (item.slug !== "frightened") return;
      if (AFLP.getKinkLevel(item.actor, "exhibitionist") < 2) return;
      await AFLP.Kinks.onFrightenedExhibitionistL2(item.actor, item);
    });
    Hooks.on("updateItem", async (item, diff) => {
      if (!game.user.isGM || !item.actor) return;
      if (!AFLP.Settings.automation) return;
      if (item.slug !== "frightened") return;
      const newVal = diff?.system?.badge?.value;
      if (newVal == null) return;
      const oldVal = item.system?.badge?.value ?? 0;
      if (newVal <= oldVal) return; // only on increase
      if (AFLP.getKinkLevel(item.actor, "exhibitionist") < 2) return;
      await AFLP.Kinks.onFrightenedExhibitionistL2(item.actor, item);
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

    // Apply Edge Master's Afterglow effect item (level-scaled bonus to attacks/saves/skills/perception)
    const emAfterglowUUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2ptIXXAZQMESJuuZ";
    const emAfterglowDoc  = await fromUuid(emAfterglowUUID);
    if (emAfterglowDoc) {
      const emEffect = emAfterglowDoc.toObject();
      emEffect.system = foundry.utils.mergeObject(emEffect.system ?? {}, {
        level: { value: liveActor.level ?? 1 }
      });
      await liveActor.createEmbeddedDocuments("Item", [emEffect], { noHook: true });
    }

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
  // Brood Sow: on cum, apply Brood Sow's Afterglow
  // (level-scaled status bonus to attacks/saves/skills/perception, 60 min).
  // -----------------------------------------------
  async onCumBroodSow(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "brood-sow")) return;
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

    const bsAfterglowUUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.PYSvYSzceLKvqwvb";
    const bsAfterglowDoc  = await fromUuid(bsAfterglowUUID);
    if (!bsAfterglowDoc) return;

    // Remove any existing Brood Sow's Afterglow before applying fresh
    const existing = liveActor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId) === bsAfterglowUUID
    );
    if (existing) await existing.delete().catch(() => {});

    const effect = bsAfterglowDoc.toObject();
    effect.system = foundry.utils.mergeObject(effect.system ?? {}, {
      level: { value: liveActor.level ?? 1 }
    });
    await liveActor.createEmbeddedDocuments("Item", [effect], { noHook: true });

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong>'s Brood Sow kink: <strong>Brood Sow's Afterglow</strong> applied.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${actor.name} Brood Sow: Afterglow applied`);
  },

  // -----------------------------------------------
  // Shared helper: returns effective Exposed level for an actor.
  // Exposed (Nude) always counts as 2. Regular Exposed uses badge value.
  // -----------------------------------------------
  _getEffectiveExposedLevel(actor) {
    const EXPNUDE_UUID = AFLP.conditions?.["exposed-nude"]?.uuid ?? "";
    const EXP_UUID     = AFLP.conditions?.["exposed"]?.uuid ?? "";
    // Exposed (Nude) is always level 2
    const hasNude = actor.items?.some(i =>
      i.slug === "exposed-nude" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === EXPNUDE_UUID
    );
    if (hasNude) return 2;
    // Regular Exposed — read badge value
    const expItem = actor.items?.find(i =>
      i.slug === "exposed" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === EXP_UUID
    );
    return expItem?.system?.badge?.value ?? 0;
  },

  // -----------------------------------------------
  // Skyclad Idol: Skyclad Engine — while Exposed 1+ and observed,
  // gain 1 Arousal at turn start (2 if Exposed 2).
  // -----------------------------------------------
  async onCombatTurnSkycladEngine(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = game.actors?.get(actor.id) ?? actor;
    if (!worldActor.getFlag(FLAG, "skycladIdolDedication")) return;

    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const exposedLevel = AFLP.Kinks._getEffectiveExposedLevel(liveActor);
    if (exposedLevel < 1) return;

    const observerCount = AFLP.Kinks._countObservers(tokenId, actor);
    if (observerCount < 1) return;

    const gain = exposedLevel >= 2 ? 2 : 1;
    await AFLP.ensureCoreFlags(actor);
    await AFLP_Arousal.increment(actor, gain, `Skyclad Engine (Exposed ${exposedLevel})`, tokenId);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Skyclad Engine: +${gain} Arousal (Exposed ${exposedLevel}, ${observerCount} observer${observerCount !== 1 ? "s" : ""}).</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Voyeurism: helper — counts creatures that can observe the actor's token.
  // Returns the number of other tokens on the same scene within 120 feet
  // that are not the actor itself and are not hidden/invisible.
  // -----------------------------------------------
  _countObservers(tokenId, actor) {
    const token = canvas?.tokens?.get(tokenId)
      ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return 0;
    return (canvas?.tokens?.placeables ?? []).filter(t => {
      if (t.id === token.id) return false;
      if (!t.actor) return false;
      if (t.document?.hidden) return false;
      // Within 120 feet
      return canvas.grid.measureDistance(token, t, { gridSpaces: true }) <= 120;
    }).length;
  },

  // -----------------------------------------------
  // Voyeurism L5: when cumming while 2+ creatures observe, each must save or gain 2 Arousal.
  // -----------------------------------------------
  async onCumVoyeurism(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "voyeurism")) return;
    if (AFLP.getKinkLevel(actor, "voyeurism") < 5) return;

    const observerCount = AFLP.Kinks._countObservers(tokenId, actor);
    if (observerCount < 2) return;

    // Get the character's Will DC: 10 + Cha mod + level (as written in the kink)
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const chaMod = liveActor.system?.abilities?.cha?.mod ?? 0;
    const level  = liveActor.level ?? liveActor.system?.details?.level?.value ?? 1;
    const dc     = 10 + chaMod + level;

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${liveActor.name}</strong>'s Voyeurism kink triggers: ${observerCount} observers must succeed at a <strong>Will DC ${dc}</strong> or gain <strong>2 Arousal Points</strong>.</p>
        <p><em>Roll saves for each observer and apply Arousal manually.</em></p>
      </div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${actor.name} Voyeurism L5: ${observerCount} observers, DC ${dc}`);
  },

  // -----------------------------------------------
  // Brood Sow: apply Endurance on impregnation (unlimited duration).
  // Removed by removeBroodSowEndurance when last pregnancy completes.
  // -----------------------------------------------
  async applyBroodSowEndurance(actor) {
    if (!AFLP.actorHasKink(actor, "brood-sow")) return;

    const bsEnduranceUUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hImH05z16v9vh9Ob";

    // Don't stack — only apply if not already present
    const existing = actor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId) === bsEnduranceUUID
    );
    if (existing) return;

    const bsEnduranceDoc = await fromUuid(bsEnduranceUUID);
    if (!bsEnduranceDoc) return;

    const effect = bsEnduranceDoc.toObject();
    effect.system = foundry.utils.mergeObject(effect.system ?? {}, {
      level: { value: actor.level ?? 1 }
    });
    await actor.createEmbeddedDocuments("Item", [effect], { noHook: true });
    console.log(`AFLP | ${actor.name} Brood Sow: Endurance applied`);
  },

  async removeBroodSowEndurance(actor) {
    const bsEnduranceUUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hImH05z16v9vh9Ob";
    const existing = actor.items?.filter(i =>
      (i.flags?.core?.sourceId ?? i.sourceId) === bsEnduranceUUID
    );
    if (existing?.length) {
      await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id), { noHook: true });
      console.log(`AFLP | ${actor.name} Brood Sow: Endurance removed (no active pregnancies)`);
    }
  },

  // -----------------------------------------------
  // Aphrodisiac Junkie L7: re-apply Horny (Always) 3 after cum.
  // Regular Horny gets cleared on cum. If the actor has Aphrodisiac
  // Junkie L7, ensure Horny (Always) is at least 3.
  // -----------------------------------------------
  // -----------------------------------------------
  // Party Animal: on drug affliction stage advance, +1 Horny per stage (max 3).
  // Uses temp Horny — reflects the intoxicated state, cleared on cum like normal Horny.
  // -----------------------------------------------
  async onDrugStageAdvancePartyAnimal(actor, stagesGained = 1) {
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const horny = structuredClone(worldActor.getFlag(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
    const current = horny.temp ?? 0;
    if (current >= 3) return; // already at cap
    const gain    = Math.min(stagesGained, 3 - current);
    horny.temp    = current + gain;
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "horny", horny);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Party Animal kink triggers: +${gain} Horny from drug stage advance (Horny ${horny.temp}/3).</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Party Animal: +${gain} temp Horny (now ${horny.temp})`);
  },

  // -----------------------------------------------
  // Exhibitionist: "while Exposed, you gain an equal value of Horny."
  // Sets temp Horny to the Exposed badge value if higher than current.
  // Capped at 3.
  // -----------------------------------------------
  async onExposedChangeExhibitionist(actor, exposedVal) {
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const horny = structuredClone(worldActor.getFlag(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
    const target = Math.min(exposedVal, 3);
    if ((horny.temp ?? 0) >= target) return; // already at or above
    horny.temp = target;
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "horny", horny);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Exhibitionist kink triggers: Exposed ${exposedVal} grants Horny ${target}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Exhibitionist: Exposed ${exposedVal} -> Horny ${target}`);
  },

  // -----------------------------------------------
  // Bondage Princess: "While affected by an item, spell or effect with the
  // Bondage trait, you gain one level of Horny to a maximum of Horny 3."
  // Fires on bondage item creation.
  // -----------------------------------------------
  async onBondageItemEquippedBondagePrincess(actor) {
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const horny = structuredClone(worldActor.getFlag(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
    if ((horny.temp ?? 0) >= 3) return; // already at cap
    horny.temp = (horny.temp ?? 0) + 1;
    await worldActor.setFlag(AFLP.FLAG_SCOPE, "horny", horny);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bondage Princess kink triggers: +1 Horny from bondage item (Horny ${horny.temp}/3).</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Bondage Princess: +1 temp Horny (now ${horny.temp})`);
  },

  // -----------------------------------------------
  // Exhibitionist L2: "When you become Frightened, reduce the level of Frightened
  // by 1 and are Horny 1 instead."
  // Reduces the Frightened condition badge value by 1 (removing it if it hits 0)
  // and grants Horny 1.
  // -----------------------------------------------
  async onFrightenedExhibitionistL2(actor, frightenedItem) {
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const liveItem = worldActor.items?.get(frightenedItem.id) ?? frightenedItem;
    const currentVal = liveItem.system?.badge?.value ?? 1;

    if (currentVal <= 1) {
      // Remove the condition entirely
      await liveItem.delete().catch(() => {});
    } else {
      await liveItem.update({ "system.badge.value": currentVal - 1 });
    }

    // Grant Horny 1 if not already at cap
    const horny = structuredClone(worldActor.getFlag(AFLP.FLAG_SCOPE, "horny") ?? AFLP.hornyDefaults);
    if ((horny.temp ?? 0) < 3) {
      horny.temp = Math.min((horny.temp ?? 0) + 1, 3);
      await worldActor.setFlag(AFLP.FLAG_SCOPE, "horny", horny);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Exhibitionist L2 triggers: Frightened reduced by 1, gains Horny 1.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Exhibitionist L2: Frightened -1, Horny +1`);
  },

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

  // buttonEdge — invoked by the in-card Edge button (no confirmation dialog).
  // Resolves the Edge reaction immediately and returns true on success.
  // Mirrors the resolution paths in tryEdge but skips the prompt, since the
  // click IS the confirmation. Honors Edge Master L3 masturbation auto-success
  // and the Animated Bitchsuit block.
  async buttonEdge(actor, tokenId = null, context = {}) {
    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorLevel = actor.system?.details?.level?.value ?? 1;
    const actorName  = actor.name;

    // Animated Bitchsuit: blocks Edge entirely
    if (window.AFLP_Bitchsuit?.blocksEdge?.(actor)) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> cannot Edge. The Animated Bitchsuit does not permit denial..</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      return false;
    }

    // Edge Master L3: auto-succeed if this cum was triggered by masturbation.
    const edgeMasterLevel = AFLP.getKinkLevel(actor, "edge-master");
    if (edgeMasterLevel >= 3 && context.isMasturbation) {
      await AFLP.Kinks._resolveEdgeSuccess(actor, liveActor, tokenId, actorName, actorLevel, "auto (Edge Master L3)");
      return true;
    }

    const skPenalty = AFLP.Kinks.getStretchKingEdgePenalty?.(actor, tokenId) ?? null;
    return await AFLP.Kinks._rollEdge(actor, liveActor, tokenId, actorName, actorLevel, skPenalty?.dcModifier ?? 0);
  },

  async tryEdge(actor, tokenId = null, context = {}) {
    if (!AFLP.Settings.automation) return false;
    if (!AFLP.Settings.edgeAuto)   return false;

    // Animated Bitchsuit: blocks Edge entirely
    if (window.AFLP_Bitchsuit?.blocksEdge?.(actor)) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${actor.name}</strong> cannot Edge. The Animated Bitchsuit does not permit denial..</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      return false;
    }

    const isNPC = actor.type === "npc" || actor.type === "hazard";
    if (isNPC && !AFLP.Settings.edgeIncludeNpc) return false;
    // At Lewd 4 (edgeSkipDialog=true) monsters never Edge — auto-rolling edge on
    // monsters creates an unfun denial loop. Monsters at Lewd 3 (edgeSkipDialog=false)
    // still get the confirmation prompt so the GM can choose.
    if (isNPC && AFLP.Settings.edgeSkipDialog) return false;

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
      const skP = AFLP.Kinks.getStretchKingEdgePenalty?.(actor, tokenId) ?? null;
      return await AFLP.Kinks._rollEdge(actor, liveActor, tokenId, actorName, actorLevel, skP?.dcModifier ?? 0);
    }

    // ── Confirmation dialog ──
    const skPenalty = AFLP.Kinks.getStretchKingEdgePenalty?.(actor, tokenId) ?? null;
    const dc = AFLP.Kinks._normalDC(actorLevel) + (skPenalty?.dcModifier ?? 0);
    const emNote = edgeMasterLevel >= 2
      ? `<p style="font-size:11px;color:#8060a0;"><strong>Edge Master:</strong> Success grants +${edgeMasterLevel >= 7 ? 4 : 2} to weapon and unarmed damage until end of next turn.</p>`
      : "";
    const skNote = skPenalty
      ? `<p style="font-size:11px;color:#a06040;"><strong>Stretch King:</strong> ${skPenalty.label}.</p>`
      : "";

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: `${actorName}: Attempt to Edge?` },
      content: `<div style="margin-bottom:8px;">
        <p><strong>${actorName}</strong> is about to Cum.</p>
        <p>Attempt the <strong>Edge</strong> reaction? (Fortitude DC ${dc})</p>
        <p style="font-size:11px;color:#666;margin-top:6px;">
          <em>Edge uses your reaction. Success: Cum does not occur; gain Denied 1.<br>
          Failure: Cum proceeds normally.</em>
        </p>${emNote}${skNote}
      </div>`,
      buttons: [
        { action: "roll", label: "Roll Edge",       icon: "fa-solid fa-dice-d20", default: true, callback: async () => true  },
        { action: "skip", label: "Don't Edge - Cum", icon: "fa-solid fa-times",                  callback: async () => false },
      ],
      close: () => false,
    });

    if (result === true) {
      return await AFLP.Kinks._rollEdge(actor, liveActor, tokenId, actorName, actorLevel, skPenalty?.dcModifier ?? 0);
    }
    return false;
  },

  // Roll Fortitude vs normal DC; apply results. Returns true on success.
  async _rollEdge(actor, liveActor, tokenId, actorName, actorLevel, dcModifier = 0) {
    const dc = AFLP.Kinks._normalDC(actorLevel) + dcModifier;

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
          <p><strong>${actorName}</strong> fails to Edge (${total} vs DC ${dc}): cum proceeds.</p>
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

    // Voyeurism L3: +2 status to attacks and skills until end of next turn when edging while observed
    if (AFLP.actorHasKink(actor, "voyeurism") && AFLP.getKinkLevel(actor, "voyeurism") >= 3) {
      const observerCount = AFLP.Kinks._countObservers(tokenId, actor);
      if (observerCount >= 1) {
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${actorName}</strong>'s Voyeurism kink triggers: +2 status bonus to attack rolls and skill checks until end of next turn (${observerCount} observer${observerCount !== 1 ? "s" : ""}).</p></div>`,
          speaker: { alias: "AFLP" },
        });
      }
    }

    // Sentient item reaction to Edge success
    if (window.AFLP_SentientItems) {
      await AFLP_SentientItems.onActorEdge(actor);
    }

    console.log(`AFLP | ${actorName} Edge: succeeded (${outcomeLabel}), Denied now ${deniedTotal}`);
    // Lovense: edge event
    if (window.AFLP_Lovense) AFLP_Lovense.emitEdge(actor);
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
  // Pacifying cock: at the start of a Submitting actor's turn, if any
  // token currently Dominating them has a pacifying cock, enforce Horny 2
  // and post a reminder that they cannot make hostile actions or Escape.
  // -----------------------------------------------
  async onCombatTurnPacifying(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;

    // Is this actor currently Submitting?
    const subUUID = AFLP.conditions?.["submitting"]?.uuid ?? "";
    const isSubmitting = liveActor.items?.some(i =>
      i.slug === "submitting" || (i.flags?.core?.sourceId ?? i.sourceId) === subUUID
    );
    if (!isSubmitting) return;

    // Find any token on scene with cock-pacifying: true that is Dominating
    const domUUID = AFLP.conditions?.["dominating"]?.uuid ?? "";
    const pacifyingSource = canvas?.tokens?.placeables?.find(t => {
      if (!t.actor || t.actor.id === liveActor.id) return false;
      const isDominating = t.actor.items?.some(i =>
        i.slug === "dominating" || (i.flags?.core?.sourceId ?? i.sourceId) === domUUID
      );
      if (!isDominating) return false;
      const gt = t.actor.getFlag(FLAG, "genitalTypes") ?? {};
      return gt["cock-pacifying"] === true;
    });
    if (!pacifyingSource) return;

    // Enforce Horny 2 minimum
    const horny = structuredClone(liveActor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
    const currentTemp = horny.temp ?? 0;
    if (currentTemp < 2) {
      horny.temp = 2;
      await liveActor.setFlag(FLAG, "horny", horny);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong> is @UUID[${subUUID}]{Submitting} to <strong>${pacifyingSource.name}</strong>'s pacifying cock. ${liveActor.name} is @UUID[${AFLP.conditions?.["horny"]?.uuid}]{Horny 2} (minimum) and cannot make hostile actions or attempt to Escape.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // -----------------------------------------------
  // Skyclad Idol: Engine — at the start of the actor's turn, while Exposed and
  // Bimbomancer: Paizuri Aura — while paizuri cumflation >= 4, grant Horny 1
  // to the actor and all tokens within 30ft at the start of their turn.
  // -----------------------------------------------
  async onCombatTurnPaizuriAura(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    if (!worldActor.getFlag(FLAG, "myBodyIsAWeapon")) return;
    const cumflation = worldActor.getFlag(FLAG, "cumflation") ?? {};
    if ((cumflation.paizuri ?? 0) < 4) return;

    const token = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;

    // Collect all tokens within 30ft (including self)
    const nearby = canvas.tokens.placeables.filter(t => {
      if (!t.actor) return false;
      const dist = canvas.grid.measureDistance(token, t, {gridSpaces: true});
      return dist <= 30;
    });

    const hornyUUID = AFLP.conditions?.["horny"]?.uuid ?? "";
    for (const t of nearby) {
      const liveActor = t.actor;
      const existingHorny = liveActor.items?.find(i =>
        i.slug === "horny" || (i.flags?.core?.sourceId ?? i.sourceId) === hornyUUID
      );
      const currentLevel = existingHorny?.system?.badge?.value ?? 0;
      if (currentLevel < 1) {
        // Apply Horny 1 via condition item
        const hornyItem = await fromUuid(hornyUUID).catch(() => null);
        if (hornyItem) {
          await liveActor.createEmbeddedDocuments("Item", [
            foundry.utils.mergeObject(hornyItem.toObject(), {"system.badge.value": 1})
          ]);
        }
      }
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Paizuri Aura is active (${cumflation.paizuri} ml). All creatures within 30 feet gain @UUID[${hornyUUID}]{Horny 1}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Bimbomancer Dedication: Stupified → Bimbofied conversion.
  // Called from the updateActor hook when Stupified is added.
  // -----------------------------------------------
  async interceptStupified(actor, itemData) {
    if (!AFLP.Settings.automation) return false;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    if (!worldActor.getFlag(FLAG, "bimbomancerDedication")) return false;

    const isStupified = itemData?.system?.slug === "stupefied" ||
      itemData?.slug === "stupefied" ||
      (itemData?.name ?? "").toLowerCase() === "stupefied";
    if (!isStupified) return false;

    const stupLevel = itemData?.system?.badge?.value ?? 1;
    // Get current bimbofied item
    const bimbofiedUUID = AFLP.conditions?.["bimbofied"]?.uuid ?? "";
    const existing = worldActor.items?.find(i =>
      i.slug === "bimbofied" || (i.flags?.core?.sourceId ?? i.sourceId) === bimbofiedUUID
    );
    const currentLevel = existing?.system?.badge?.value ?? 0;
    const newLevel = Math.min(4, currentLevel + stupLevel);

    if (existing) {
      await existing.update({"system.badge.value": newLevel});
    } else {
      const bimbofiedItem = await fromUuid(bimbofiedUUID).catch(() => null);
      if (bimbofiedItem) {
        await worldActor.createEmbeddedDocuments("Item", [
          foundry.utils.mergeObject(bimbofiedItem.toObject(), {"system.badge.value": newLevel})
        ]);
      }
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bimbomancer Dedication converts Stupified ${stupLevel} into @UUID[${bimbofiedUUID}]{Bimbofied} ${newLevel}.</p></div>`,
      speaker: { alias: "AFLP" },
    });

    return true; // signals the caller to suppress the Stupified item creation
  },

  // -----------------------------------------------
  // Creature Fetish — per-turn arousal when fetish creature within 30ft.
  // kinkNotes["creature-fetish"] is a comma-separated list of creature types.
  // -----------------------------------------------
  async onCombatTurnCreatureFetish(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "creature-fetish")) return;
    const worldActor = game.actors?.get(actor.id) ?? actor;
    const sexual = worldActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? AFLP.sexualDefaults;
    const fetchTypesRaw = (sexual.kinkNotes?.["creature-fetish"] ?? "").toLowerCase().trim();
    if (!fetchTypesRaw) return;
    // Support comma-separated list of types e.g. "giant, aberration"
    const fetchTypes = fetchTypesRaw.split(",").map(t => t.trim()).filter(Boolean);
    if (fetchTypes.length === 0) return;
    // CF arousal gain = the value of the Creature Fetish condition on the actor, not kink level
    const cfCondUuid = AFLP.kinks?.["creature-fetish"]?.uuid;
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const cfCond = liveActor.items?.find(i =>
      i.slug === "creature-fetish" ||
      (cfCondUuid && (i.flags?.core?.sourceId ?? i.sourceId) === cfCondUuid)
    );
    const cfValue = cfCond?.system?.badge?.value ?? 0;
    if (cfValue <= 0) return;
    const token = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;
    // Check if any nearby token matches ANY of the fetish types
    let matchedType = null;
    canvas?.tokens?.placeables?.some(t => {
      if (t.id === token.id || !t.actor) return false;
      if (canvas.grid.measureDistance(token, t, { gridSpaces: true }) > 30) return false;
      const traitStr = (t.actor.system?.traits?.value?.join(" ") ?? "").toLowerCase();
      const nameStr  = (t.actor.name ?? "").toLowerCase();
      const hit = fetchTypes.find(ft => traitStr.includes(ft) || nameStr.includes(ft));
      if (hit) { matchedType = hit; return true; }
      return false;
    });
    if (!matchedType) return;
    await AFLP.ensureCoreFlags(actor);
    const gain = await AFLP_Arousal.increment(actor, cfValue, `Creature Fetish (${matchedType})`, tokenId);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Creature Fetish triggers: +${gain?.applied ?? cfValue} Arousal from nearby ${matchedType}.</p></div>`,
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
  // Dominating / Submitting idle arousal passives.
  // Rules (from condition text):
  //   Dominating: "At the start of your turn, if your Arousal has not increased
  //               since the end of your previous turn, gain 1 Arousal."
  //   Submitting: "At the start of your turn, if your Arousal has not increased
  //               since the end of your previous turn, gain 2 Arousal."
  // Implementation: snapshot Arousal at turn-start into a per-actor world flag.
  // On the next turn-start, compare current Arousal to the snapshot; if equal,
  // the passive fires.
  // -----------------------------------------------
  async onCombatTurnIdleArousal(actor) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const arousal = worldActor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults;
    const current = arousal.current ?? 0;

    const isDominating = worldActor.items?.some(c =>
      c.slug === "dominating" ||
      (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.["dominating"]?.uuid ?? "NOMATCH")
    ) ?? false;
    const isSubmitting = worldActor.items?.some(c =>
      c.slug === "submitting" ||
      (c.flags?.core?.sourceId ?? c.sourceId) === (AFLP.conditions?.["submitting"]?.uuid ?? "NOMATCH")
    ) ?? false;

    if (!isDominating && !isSubmitting) {
      // Still snapshot for next turn
      await worldActor.setFlag(FLAG, "_arousalAtTurnStart", current);
      return;
    }

    const prevSnapshot = worldActor.getFlag(FLAG, "_arousalAtTurnStart");

    // First turn in combat — just snapshot, don't fire
    if (prevSnapshot == null) {
      await worldActor.setFlag(FLAG, "_arousalAtTurnStart", current);
      return;
    }

    // If Arousal has not increased since last snapshot, fire the passive
    if (current <= prevSnapshot) {
      const gain = isDominating ? 1 : 0;
      const gainSub = isSubmitting ? 2 : 0;
      const total = gain + gainSub;
      if (total > 0) {
        const label = [
          isDominating ? "Dominating (+1)" : null,
          isSubmitting ? "Submitting (+2)" : null,
        ].filter(Boolean).join(", ");
        console.log(`AFLP | ${worldActor.name} idle arousal: ${label}`);
        await AFLP_Arousal.increment(worldActor, total, `${label} idle passive`, null);
      }
    }

    // Snapshot current Arousal for next turn comparison
    // Re-read after applyArousal in case it changed
    const refreshed = (worldActor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults).current ?? 0;
    await worldActor.setFlag(FLAG, "_arousalAtTurnStart", refreshed);
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
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s orgasm stuns ${stunned.join(", ")} (Stunned 2, Aphrodisiac Junkie L7).</p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },

  // -----------------------------------------------
  // Mind Break end: grant Creature Fetish equal to the MB badge value
  // for the creature type stored in mbCreatureType when MB was first gained.
  // Fires from the deleteItem hook whenever a mind-break condition item is removed.
  // Covers both scene-close removal and early end via ally intervention.
  // -----------------------------------------------
  // Cum Slut L7: Mind Break 6+ hours while having sex = long rest (GM adjudicates).
  async onMindBreakEndCumSlut(item) {
    if (!AFLP.Settings.automation) return;
    const actor = item.actor;
    if (!actor || !AFLP.actorHasKink(actor, "cum-slut")) return;
    if (AFLP.getKinkLevel(actor, "cum-slut") < 7) return;
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Cum Slut kink (L7): Mind Break has ended. If they were Mind Broken for 6+ hours and spent most of that time having sex (including during a Bad End), they gain the benefits of a <strong>full night's sleep and long rest</strong>. GM adjudicates.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  async onMindBreakEndCreatureFetish(item) {
    if (!AFLP.Settings.automation) return;
    if (!game.user.isGM) return;

    // item is the MB condition document, still intact at hook time — read badge value now.
    const mbLevel = item?.system?.badge?.value ?? 1;
    const actor = item.actor;
    if (!actor) return;

    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = game.actors?.get(actor.id) ?? actor;

    // Creature type was stored when MB was first applied (onMindBreakGained).
    let fetchType = worldActor.getFlag(FLAG, "mbCreatureType") ?? "";
    await worldActor.unsetFlag(FLAG, "mbCreatureType").catch(() => {});

    // Fallback: current H-Scene attackers (covers edge cases where gain hook didn't fire)
    if (!fetchType) {
      const CREATURE_TYPES = new Set(["aberration","animal","beast","celestial","construct","daemon","dragon","elemental","fey","fiend","fungus","giant","humanoid","monitor","ooze","petitioner","plant","spirit","undead"]);
      const hscene = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
      for (const atk of hscene?.attackers ?? []) {
        const atkActor = game.actors?.get(atk.actorId);
        if (!atkActor) continue;
        const traits = atkActor.system?.traits?.value ?? [];
        const match  = traits.find(t => CREATURE_TYPES.has(t)) ?? traits[0];
        if (match) { fetchType = match; break; }
      }
    }

    if (!fetchType) return; // No creature type to assign — nothing to do

    const CF_MAX = 6;
    const cfKinkUUID = AFLP.kinks?.["creature-fetish"]?.uuid;

    // Mark kink active and append creature type to comma-separated list in kinkNotes.
    // Don't overwrite existing types — accumulate them.
    const sexual = worldActor.getFlag(FLAG, "sexual") ?? {};
    if (!sexual.kinks) sexual.kinks = {};
    sexual.kinks["creature-fetish"] = true;
    if (!sexual.kinkNotes) sexual.kinkNotes = {};
    const existingTypes = (sexual.kinkNotes["creature-fetish"] ?? "")
      .split(",").map(t => t.trim()).filter(Boolean);
    if (!existingTypes.includes(fetchType)) existingTypes.push(fetchType);
    sexual.kinkNotes["creature-fetish"] = existingTypes.join(", ");
    await worldActor.setFlag(FLAG, "sexual", sexual);

    // Apply or update the Creature Fetish condition item
    const liveActor = canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id)?.actor ?? worldActor;
    const existingCF = liveActor.items?.find(i =>
      i.slug === "creature-fetish" ||
      (cfKinkUUID && (i.flags?.core?.sourceId ?? i.sourceId) === cfKinkUUID)
    );
    const currentCFLevel = existingCF?.system?.badge?.value ?? 0;
    const newCFLevel = Math.min(CF_MAX, currentCFLevel + mbLevel);

    if (existingCF) {
      await existingCF.update({ "system.badge.value": newCFLevel });
    } else if (cfKinkUUID) {
      const cfTemplate = await fromUuid(cfKinkUUID).catch(() => null);
      if (cfTemplate) {
        await liveActor.createEmbeddedDocuments("Item", [
          foundry.utils.mergeObject(cfTemplate.toObject(), {
            "system.badge.value": newCFLevel,
            "flags.core.sourceId": cfKinkUUID,
          })
        ]);
      }
    }

    const typeLabel = existingTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Mind Break ends. They gain <strong>Creature Fetish ${newCFLevel} (${typeLabel})</strong> from their ordeal.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name}: Mind Break ended at level ${mbLevel}, Creature Fetish ${newCFLevel} (${typeLabel}) granted`);
  },

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

  // -----------------------------------------------
  // Sticky Bomb — per-turn Arousal while Grabbed/Restrained by the bomb.
  // The bomb sets a world flag "_stickyBombTurns" on the actor with the
  // number of Arousal to gain and turns remaining. Fires each turn start.
  // -----------------------------------------------
  async onCombatTurnStickyBomb(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const stickyData = worldActor.getFlag(FLAG, "_stickyBombTurns");
    if (!stickyData) return;

    // Check actor is still Grabbed or Restrained
    const isGrabbedOrRestrained = worldActor.items?.some(c =>
      c.slug === "grabbed" || c.slug === "restrained"
    );
    if (!isGrabbedOrRestrained || stickyData.remaining <= 0) {
      await worldActor.unsetFlag(FLAG, "_stickyBombTurns");
      return;
    }

    // Apply arousal
    const gain = stickyData.arousalPerTurn ?? 1;
    await AFLP_Arousal.increment(worldActor, gain, "Sticky Bomb", tokenId);
    await worldActor.setFlag(FLAG, "_stickyBombTurns", {
      ...stickyData,
      remaining: stickyData.remaining - 1,
    });
  },

  // Helper called when a Sticky Bomb lands — sets the flag to track turns.
  // arousalPerTurn: how much arousal per turn (1 lesser, 2 moderate, 3 greater)
  // duration: rounds (default 10 = 1 minute)
  async applyStickyBombEffect(actor, arousalPerTurn = 1, duration = 10) {
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    await worldActor.setFlag(FLAG, "_stickyBombTurns", {
      arousalPerTurn,
      remaining: duration,
    });
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

// -----------------------------------------------
// STRETCH KING AUTOMATION
// slug: stretch-king
// UUID: Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.2Kth26AcSdPDxkKa
// -----------------------------------------------

const _SK_SIZE_RANK = { tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5 };
function _skSizeRank(s) { return _SK_SIZE_RANK[s?.toLowerCase()] ?? 2; }
function _skActorIsLarger(actorSize, targetSize, offset = 0) {
  return (_skSizeRank(actorSize) + offset) > _skSizeRank(targetSize);
}
function _skVirtualOffset(actor) {
  const lvl = AFLP.getKinkLevel(actor, "stretch-king");
  if (lvl >= 7) return 2;
  if (lvl >= 5) return 1;
  return 0;
}

Object.assign(AFLP.Kinks, {

  // L1: -2 circumstance on Edge DC when cumming inside smaller target.
  // Returns { dcModifier, label } or null.
  getStretchKingEdgePenalty(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "stretch-king")) return null;
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorSize = liveActor.system?.traits?.size?.value ?? "med";
    const offset    = _skVirtualOffset(actor);
    let targetActor = null;
    if (AFLP.Settings.hsceneEnabled && AFLP.HScene._getScene) {
      const scene = AFLP.HScene._getScene(actor.id);
      if (scene) {
        const tToken = canvas?.tokens?.get(scene.targetId);
        targetActor  = tToken?.actor ?? game.actors?.get(scene.targetActorId);
      }
    }
    if (!targetActor) return null;
    const targetSize = targetActor.system?.traits?.size?.value ?? "med";
    if (!_skActorIsLarger(actorSize, targetSize, offset)) return null;
    return { dcModifier: +2, label: "Stretch King (smaller target, −2 circumstance on Edge)" };
  },

  // L3: Horny 1 when adjacent to smaller creature at start of turn.
  async onCombatTurnStretchKing(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    if (!AFLP.actorHasKink(actor, "stretch-king")) return;
    if (AFLP.getKinkLevel(actor, "stretch-king") < 3) return;
    const token = canvas?.tokens?.get(tokenId)
      ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;
    const actorSize    = actor.system?.traits?.size?.value ?? "med";
    const offset       = _skVirtualOffset(actor);
    const adjacentSmaller = canvas.tokens.placeables.some(t => {
      if (t.id === token.id || !t.actor) return false;
      const dist = canvas.grid.measureDistance(token, t, { gridSpaces: true });
      if (dist > 5) return false;
      return _skActorIsLarger(actorSize, t.actor.system?.traits?.size?.value ?? "med", offset);
    });
    if (!adjacentSmaller) return;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const FLAG       = AFLP.FLAG_SCOPE;
    const horny      = structuredClone(worldActor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
    if ((horny.temp ?? 0) >= 3) return;
    horny.temp = (horny.temp ?? 0) + 1;
    await worldActor.setFlag(FLAG, "horny", horny);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Stretch King kink (L3): adjacent to a smaller creature — gains <strong>Horny 1</strong>.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // Post-cum: Coomer reminder when cumming inside smaller target (L3/L7).
  async onCumStretchKing(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "stretch-king")) return;
    const lvl = AFLP.getKinkLevel(actor, "stretch-king");
    if (lvl < 3) return;
    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorSize  = liveActor.system?.traits?.size?.value ?? "med";
    const offset     = _skVirtualOffset(actor);
    let targetActor  = null;
    if (AFLP.Settings.hsceneEnabled && AFLP.HScene._getScene) {
      const scene = AFLP.HScene._getScene(actor.id);
      if (scene) {
        const tToken = canvas?.tokens?.get(scene.targetId);
        targetActor  = tToken?.actor ?? game.actors?.get(scene.targetActorId);
      }
    }
    if (!targetActor) return;
    const targetSize = targetActor.system?.traits?.size?.value ?? "med";
    if (!_skActorIsLarger(actorSize, targetSize, offset)) return;
    if (lvl >= 7) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong>'s Stretch King kink (L7): Coomer 10 should be active via Daily Prep.</p></div>`,
        speaker: { alias: "AFLP" },
      });
    } else if (lvl >= 3) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong>'s Stretch King kink (L3): cummed inside a smaller creature — ensure Coomer 3 is applied via Daily Prep.</p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },

});

// Stretch King combat turn hook
Hooks.on("combatTurnChange", async (combat, _prior, current) => {
  if (!game.user.isGM) return;
  const combatant = combat.combatants.get(current.combatantId);
  if (!combatant?.actor) return;
  const actor = game.actors?.get(combatant.actor.id) ?? combatant.actor;
  await AFLP.Kinks.onCombatTurnStretchKing?.(actor, combatant.tokenId ?? null);
});

console.log("AFLP | Stretch King automation loaded.");

// -----------------------------------------------
// HYPNO SLAVE AUTOMATION
// slug: hypno-slave
// UUID: Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC
//
// Counters live on system.badge.value of the Hypno Slave effect item on the actor.
// Presence tracked via sexual.kinks["hypno-slave"] = true (set by incrementHypnoSlave).
// conditionerId stored in world flag "hypnoConditionerId".
// -----------------------------------------------

const _HS_EH_UUID   = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.mHs3MtxY7CF4Uym9";
const _HS_FASC_UUID = "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg";
const _HS_STUP_UUID = "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg";
const _HS_SLUG      = "hypno-slave";
const _HS_MAX       = 7;

function _hsItem(actor) {
  return actor.items?.find(i =>
    i.slug === _HS_SLUG ||
    (i.flags?.core?.sourceId ?? i.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC"
  ) ?? null;
}
function _hsCounters(actor) {
  return _hsItem(actor)?.system?.badge?.value ?? 0;
}
function _hsUnlockLabel(n) {
  if (n >= 7) return "Counter 7: Full conditioning — protection instinct, Mind Break immunity.";
  if (n >= 5) return "Counter 5: Trigger word persona state unlocked.";
  if (n >= 3) return "Counter 3: Stupefied 1 passive, memory suppression.";
  if (n >= 2) return "Counter 2: Cannot take hostile actions against conditioner.";
  return "Counter 1: −2 Will vs conditioner, Horny 1 within 60ft.";
}

Object.assign(AFLP.Kinks, {

  // Increment counter after successful Induction. amount=1 for Failure, 2 for Critical Failure.
  async incrementHypnoSlave(targetActor, conditionerActorId, amount = 1) {
    if (!targetActor) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    const worldActor = targetActor.getWorldActor?.() ?? targetActor;
    const liveActor  = canvas?.tokens?.placeables?.find(t => t.actor?.id === targetActor.id)?.actor
      ?? game.actors?.get(targetActor.id) ?? targetActor;

    // Set kink presence flag
    const sexual = worldActor.getFlag(FLAG, "sexual") ?? {};
    if (!sexual.kinks) sexual.kinks = {};
    sexual.kinks[_HS_SLUG] = true;
    await worldActor.setFlag(FLAG, "sexual", sexual);
    if (conditionerActorId) await worldActor.setFlag(FLAG, "hypnoConditionerId", conditionerActorId);

    let hsItem = _hsItem(liveActor);
    const current = hsItem?.system?.badge?.value ?? 0;

    if (!hsItem) {
      const hsDoc = await fromUuid("Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC").catch(() => null);
      if (!hsDoc) { console.error("AFLP | Hypno Slave: kink item not found."); return; }
      const created = await liveActor.createEmbeddedDocuments("Item", [hsDoc.toObject()]);
      hsItem = created[0];
    }

    if (current >= _HS_MAX) {
      await ChatMessage.create({ content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave conditioning is at maximum (Counter 7).</p></div>`, speaker: { alias: "AFLP" } });
      return;
    }
    const newCount = Math.min(current + amount, _HS_MAX);
    await hsItem.update({ "system.badge.value": newCount });

    const unlockMsg = (newCount === 2 || newCount === 3 || newCount === 5 || newCount === 7)
      ? `<br><em style="color:#c9a96e;">${_hsUnlockLabel(newCount)}</em>` : "";
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave counter: <strong>${newCount} / ${_HS_MAX}</strong>.${unlockMsg}</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Hypno Slave: ${current} → ${newCount}`);
  },

  // Combat turn: Horny 1 (1+), Stupefied 1 (3+), protection instinct (7+).
  async onCombatTurnHypnoSlave(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    if (!AFLP.actorHasKink(actor, _HS_SLUG)) return;
    const counters   = _hsCounters(actor);
    if (counters < 1) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor;
    const condId     = worldActor.getFlag(FLAG, "hypnoConditionerId");
    const condToken  = condId ? canvas?.tokens?.placeables?.find(t => t.actor?.id === condId) : null;
    const myToken    = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);

    // Counter 1+: Horny 1 within 60ft of conditioner
    if (condToken && myToken) {
      const dist = canvas.grid.measureDistance(myToken, condToken, { gridSpaces: true });
      if (dist <= 60) {
        const horny = structuredClone(worldActor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
        if ((horny.temp ?? 0) < 3) {
          horny.temp = (horny.temp ?? 0) + 1;
          await worldActor.setFlag(FLAG, "horny", horny);
          await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave (counter ${counters}): within 60ft of conditioner — <strong>Horny 1</strong>.</p></div>`,
            speaker: { alias: "AFLP" },
          });
        }
      }
    }

    // Counter 3+: Stupefied 1 passive
    if (counters >= 3) {
      const hasStup = liveActor.items?.some(i =>
        i.slug === "stupefied" || (i.flags?.core?.sourceId ?? i.sourceId) === _HS_STUP_UUID
      );
      if (!hasStup) {
        const stupDoc = await fromUuid(_HS_STUP_UUID).catch(() => null);
        if (stupDoc) {
          await liveActor.createEmbeddedDocuments("Item",
            [{ ...stupDoc.toObject(), system: { ...stupDoc.toObject().system, value: 1 } }]
          ).catch(() => {});
          await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s conditioning (counter ${counters}): <strong>Stupefied 1</strong> reapplied.</p></div>`,
            speaker: { alias: "AFLP" },
          });
        }
      }
    }

    // Counter 7: Protection instinct
    if (counters >= 7 && condToken && myToken) {
      const condUnderAttack = worldActor.getFlag(FLAG, "_hypnoConditionerUnderAttack");
      if (condUnderAttack) {
        await worldActor.setFlag(FLAG, "_hypnoConditionerUnderAttack", false);
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave (counter 7): ${condToken.name} is under attack — <strong>Will DC 22</strong> or spend all actions shielding them.</p></div>`,
          speaker: { alias: "AFLP" },
        });
      }
    }
  },

  // GM-called: fires Trigger Word effects (speed 0, Fascinated, 3 Arousal).
  async onTriggerWordHypnoSlave(actor, trigger) {
    if (!AFLP.Settings.automation) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const liveActor  = game.actors?.get(actor.id) ?? actor;
    const counters   = _hsCounters(actor);
    await worldActor.setFlag(FLAG, "_hypnoTriggerConsumed", true);
    const fascDoc = await fromUuid(_HS_FASC_UUID).catch(() => null);
    if (fascDoc) {
      if (!liveActor.items?.some(i => i.slug === "fascinated")) {
        await liveActor.createEmbeddedDocuments("Item", [fascDoc.toObject()]).catch(() => {});
      }
    }
    await AFLP.ensureCoreFlags(liveActor);
    const gain = await AFLP_Arousal.increment(liveActor, 3, "Hypno Trigger Word", null);
    const condToken = canvas?.tokens?.placeables?.find(t => t.actor?.id === worldActor.getFlag(FLAG, "hypnoConditionerId"));
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${worldActor.name}</strong>'s Hypno Slave conditioning (counter ${counters}): Trigger Word — moved away from ${condToken?.name ?? "conditioner"}!</p>
        <ul style="margin:4px 0 4px 16px">
          <li>Speed reduced to 0 for this move <em>(apply manually)</em></li>
          <li>@UUID[${_HS_FASC_UUID}]{Fascinated} for 1 round</li>
          <li>${AFLP_Arousal.gainBreakdownText(gain, 3)}</li>
        </ul>
        <p><em>Will Save DC 22 to resist. Trigger spent until next daily prep.</em></p>
      </div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // Post-cum: trance orgasm suppresses Afterglow and grants 1 Arousal (counter 3+, once/day).
  async onCumHypnoSlave(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, _HS_SLUG)) return;
    if (_hsCounters(actor) < 3) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    if (worldActor.getFlag(FLAG, "_hypnoSlaveL3Used")) return;
    if (!liveActor.items?.some(i => i.slug === "fascinated")) return;
    const afterglowUUID = AFLP.conditions?.["afterglow"]?.uuid ?? "";
    const ag = liveActor.items?.find(i =>
      i.slug === "afterglow" || (i.flags?.core?.sourceId ?? i.sourceId) === afterglowUUID
    );
    if (ag) await ag.delete().catch(() => {});
    await AFLP.ensureCoreFlags(actor);
    const gain = await AFLP_Arousal.increment(actor, 1, "Hypno Slave (trance orgasm)", tokenId);
    await worldActor.setFlag(FLAG, "_hypnoSlaveL3Used", true);
    const counters = _hsCounters(actor);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s conditioning (counter ${counters}): orgasm within trance — Afterglow suppressed, ${AFLP_Arousal.gainBreakdownText(gain, 1)}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

});

// Hypno Slave combat turn hook
Hooks.on("combatTurnChange", async (combat, _prior, current) => {
  if (!game.user.isGM) return;
  const combatant = combat.combatants.get(current.combatantId);
  if (!combatant?.actor) return;
  const actor = game.actors?.get(combatant.actor.id) ?? combatant.actor;
  await AFLP.Kinks.onCombatTurnHypnoSlave?.(actor, combatant.tokenId ?? null);
});

console.log("AFLP | Hypno Slave automation loaded (counter-based).");
