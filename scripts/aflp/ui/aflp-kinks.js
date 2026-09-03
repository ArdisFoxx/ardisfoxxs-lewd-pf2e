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
    this._bindBimboChatButtons();
    // _registerBimbomancyDomainGrant() retired 2026-07: bimbomancy/skyclad are no
    // longer DH domains (their cards live in native domains now). See the stub below.

    // Bimbomancer Dedication: intercept Stupified and convert to Bimbofied.
    //
    // THIS HOOK MUST STAY SYNCHRONOUS. Foundry dispatches preCreateItem through
    // `Hooks.call`, which tests each callback's return value for `=== false`.
    // An `async` callback returns a PROMISE, which is truthy, so `return false`
    // inside one never cancels anything. This was async until 18 Aug 2026 and
    // the result was the worst of both: Bimbofied was granted AND Stupefied
    // still landed. Measured that day on core 14.365 - a sync hook returning
    // false blocks the create, an async one returning false does not.
    //
    // So the CANCEL decision is made synchronously by canInterceptStupified,
    // and the conversion, which is async and cannot be awaited here, is fired
    // without awaiting. GOES STALE IF: Foundry starts awaiting preCreate hooks.
    Hooks.on("preCreateItem", (item, data, options, userId) => {
      if (!game.user.isGM || !item.parent) return;
      const slug = data?.system?.slug ?? item.slug ?? "";
      if (slug !== "stupefied") return;
      if (!AFLP.Kinks.canInterceptStupified(item.parent, data)) return;
      AFLP.Kinks.interceptStupified(item.parent, data)
        .catch(e => console.error("AFLP | Stupefied interception failed after cancelling the create:", e));
      return false;   // cancel the Stupefied create - Bimbofied replaces it
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

    // DH (and any system): our authored Bimbomancy items carry an aflrKey flag.
    const AFLR_KEY_FLAGS = {
      bimbomancer:             "bimbomancerDedication",
      myBodyIsAWeapon:         "myBodyIsAWeapon",
      likeOhmigawd:            "likeOhmigawd",
      saturationAura:          "saturationAura",
      permanentTransformation: "permanentTransformation",
      skycladIdol:             "skycladIdolDedication",
      bareNakedThreat:         "bareNakedThreat",
      nakedDiplomacy:          "nakedDiplomacy",
      luckyPervert:            "luckyPervert",
      showMustGoOn:            "showMustGoOn",
      oathOfNudity:            "oathOfNudity",
      sharedPerversion:        "sharedPerversion",
    };

    const getFeatFlagKey = (item) => {
      if (!item.actor) return null;
      // DH/native: match our authored items by their aflrKey designer flag.
      const ak = item.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey")
              ?? item.flags?.["ardisfoxxs-lewd-pf2e"]?.aflrKey;
      if (ak && AFLR_KEY_FLAGS[ak]) return AFLR_KEY_FLAGS[ak];
      // PF2e: match dedication/feat items by compendium source ID.
      if (item.type !== "feat") return null;
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
      // DH Bimbomancer access feature: seed the Bimbo/Bull path and offer the toggle.
      if (flagKey === "bimbomancerDedication" && AFLP.system?.id === "daggerheart") {
        const path = item.getFlag?.("ardisfoxxs-lewd-pf2e", "bimbomancerPath")
                  || item.actor.getFlag(AFLP.FLAG_SCOPE, "bimbomancerPath") || "bimbo";
        await item.actor.setFlag(AFLP.FLAG_SCOPE, "bimbomancerPath", path);
        try { await AFLP.Kinks._postBimbomancerPathCard(item.actor, path); } catch (e) {}
      }
      // DH Skyclad Idol access feature: seed the Nudist/Stripper path and offer the toggle.
      if (flagKey === "skycladIdolDedication" && AFLP.system?.id === "daggerheart") {
        const path = item.getFlag?.("ardisfoxxs-lewd-pf2e", "skycladPath")
                  || item.actor.getFlag(AFLP.FLAG_SCOPE, "skycladPath") || "nudist";
        await item.actor.setFlag(AFLP.FLAG_SCOPE, "skycladPath", path);
        try { await AFLP.Kinks._postSkycladPathCard(item.actor, path); } catch (e) {}
      }
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
      const actor = AFLP.system.liveActor(combatant.actor, combatant.tokenId ?? null);
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
        const actor = canvas?.tokens?.get(combatant.tokenId)?.actor ?? combatant.actor;
        if (!actor) continue;
        const snap = actor.getFlag(FLAG, "_arousalAtTurnStart");
        if (snap != null) await actor.unsetFlag(FLAG, "_arousalAtTurnStart");
      }
    });

    // Mind Break gained: store the primary creature type of scene attackers,
    // and Purity L3 CF save. On PF2e MB is a condition item, so this fires from
    // createItem; flag-based systems (Daggerheart/5e) run the same logic from the
    // aflpConditions flag transition handled by the updateActor hook below.
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.system.contentUuid("mind-break");
      if (!isMindBreak) return;

      AFLP.Kinks.onMindBreakGainedPurity(item.actor);

      // Prompt GM to choose the CF creature type. Only on first application
      // (badge value 1); the method itself skips if a type is already chosen.
      const isFirst = (item.system?.badge?.value ?? 1) === 1;
      if (isFirst) await AFLP.Kinks._promptMBCreatureType(item.actor);
    });
    Hooks.on("deleteItem", (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (item.slug === "bimbofied" || (item.flags?.core?.sourceId ?? item.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V") {
        AFLP.Kinks.syncBimboActive(item.actor);
      }
      const isMindBreak = item.slug === "mind-break" || (item.flags?.core?.sourceId ?? item.sourceId) === AFLP.system.contentUuid("mind-break");
      if (isMindBreak) AFLP.Kinks.onMindBreakEndPurity(item.actor);
      if (isMindBreak) AFLP.Kinks.onMindBreakEndCreatureFetish(item);  // pass full item - badge value read here
      if (isMindBreak) AFLP.Kinks.onMindBreakEndCumSlut(item);         // L7: long rest reminder
    });

    // Mind Break onset/end for flag-based systems (Daggerheart, 5e). There MB
    // lives in the aflpConditions flag, so no createItem/deleteItem hook fires;
    // watch the flag transition and run the identical onset/end automation. PF2e
    // keeps MB as a condition item and never writes it to this flag, so the two
    // paths are mutually exclusive and never double-fire. preUpdateActor captures
    // the pre-change MB value (the actor already reflects the new value by the
    // time updateActor runs).
    Hooks.on("preUpdateActor", (actor, changes) => {
      if (!game.user.isGM || !actor) return;
      const w = foundry.utils.getProperty(changes, `flags.${AFLP.FLAG_SCOPE}`);
      if (w && ("aflpConditions" in w)) {
        AFLP.Kinks._mbPrevByActor.set(actor.id, AFLP.Kinks._mbFlagValue(actor));
      }
    });
    Hooks.on("updateActor", async (actor) => {
      if (!game.user.isGM || !actor) return;
      if (!AFLP.Kinks._mbPrevByActor.has(actor.id)) return;
      const prevVal = AFLP.Kinks._mbPrevByActor.get(actor.id);
      AFLP.Kinks._mbPrevByActor.delete(actor.id);
      const newVal = AFLP.Kinks._mbFlagValue(actor);
      if (newVal === prevVal) return;

      if (prevVal === 0 && newVal > 0) {
        AFLP.Kinks.onMindBreakGainedPurity(actor);
        if (newVal === 1) await AFLP.Kinks._promptMBCreatureType(actor);
      } else if (prevVal > 0 && newVal === 0) {
        // Shim carries the last-known badge value the end handlers read off `item`.
        const shim = { actor, system: { badge: { value: prevVal } } };
        await AFLP.Kinks.onMindBreakEndPurity(actor);
        await AFLP.Kinks.onMindBreakEndCreatureFetish(shim);
        await AFLP.Kinks.onMindBreakEndCumSlut(shim);
      }
    });

    // Pain Slut: taking damage feeds arousal. preUpdateActor snapshots the HP
    // track (DH hitPoints.value counts UP as damage marks; PF2e attributes.hp
    // .value counts DOWN); updateActor compares and fires when damage landed.
    Hooks.on("preUpdateActor", (actor, changes) => {
      if (!game.user.isGM || !actor) return;
      if (!AFLP.actorHasKink?.(actor, "pain-slut")) return;
      const dhNew = foundry.utils.getProperty(changes, "system.resources.hitPoints.value");
      const pfNew = foundry.utils.getProperty(changes, "system.attributes.hp.value");
      if (dhNew == null && pfNew == null) return;
      AFLP.Kinks._painPrevByActor.set(actor.id, {
        dh: actor.system?.resources?.hitPoints?.value ?? null,
        pf: actor.system?.attributes?.hp?.value ?? null,
      });
    });
    Hooks.on("updateActor", async (actor) => {
      if (!game.user.isGM || !actor) return;
      if (!AFLP.Kinks._painPrevByActor.has(actor.id)) return;
      const prev = AFLP.Kinks._painPrevByActor.get(actor.id);
      AFLP.Kinks._painPrevByActor.delete(actor.id);
      // Damage landed if DH HP rose or PF2e HP fell.
      const dhNow = actor.system?.resources?.hitPoints?.value ?? null;
      const pfNow = actor.system?.attributes?.hp?.value ?? null;
      const dhDmg = prev.dh != null && dhNow != null && dhNow > prev.dh;
      const pfDmg = prev.pf != null && pfNow != null && pfNow < prev.pf;
      if (!dhDmg && !pfDmg) return;
      await AFLP.Kinks.onDamagePainSlut(actor);
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
      // "loot" is Daggerheart's gear type and was missing, so all 74 DH bondage
      // items failed this check before ever reaching the trait test - which they
      // would also have failed, since DH has no traits. Both halves now go
      // through AFLP.itemIsBondage, which asks each system in its own terms.
      const physicalTypes = ["equipment", "weapon", "armor", "shield", "consumable", "backpack", "loot"];
      if (!physicalTypes.includes(item.type)) return;
      if (!AFLP.itemIsBondage(item)) return;
      if (!AFLP.actorHasKink(item.actor, "bondage-princess")) return;
      await AFLP.Kinks.onBondageItemEquippedBondagePrincess(item.actor);
    });

    // ...and the other half of the WHILE clause. The card grants Horny *while*
    // affected by a Bondage effect, so something has to take it back when the
    // rope comes off - and until 19 Aug 2026 nothing did, because the grant was
    // a fire-once +1 on createItem with no counterpart.
    //
    // A RECONCILIATION PASS, NOT AN EVENT HANDLER. It re-derives from the
    // actor's current items the way AFLP.anatomy.sync does, so it is also
    // correct for the routes a create hook never sees: an actor imported with
    // the gear already on, a duplicate, a GM deleting an item straight off the
    // sheet, or gear merely unequipped rather than removed.
    // GOES STALE IF: the sustained floor stops being keyed "bondage-princess".
    const _bpSync = async (item) => {
      if (!game.user.isGM || !item?.actor) return;
      if (!AFLP.Settings.automation) return;
      if (!AFLP.itemIsBondage(item)) return;
      if (!AFLP.actorHasKink(item.actor, "bondage-princess")) return;
      await AFLP.Kinks.syncBondagePrincessHorny(item.actor);
    };
    Hooks.on("deleteItem", _bpSync);
    Hooks.on("updateItem", _bpSync);

    // Exhibitionist L2: "When you become Frightened, reduce the level of Frightened by 1
    // and are Horny 1 instead."
    // Hooks on Frightened being applied (createItem) or increased (updateItem).
    Hooks.on("createItem", async (item) => {
      if (!game.user.isGM || !item.actor) return;
      if (!AFLP.Settings.automation) return;
      if (item.slug !== "frightened") return;
      if ((AFLP.getKinkTier(item.actor, "exhibitionist") ?? 0) < 1) return; // Signature beat
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
      if ((AFLP.getKinkTier(item.actor, "exhibitionist") ?? 0) < 1) return; // Signature beat
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

    // DH: the Edge Master keeps the normal Afterglow outcome (a Horny token, or
    // a Defeat token while Submitting - applied by the climax resolution) and
    // marks an extra Stress on top: for the Edge Master, release itself is
    // failure. (Previously swapped in a Defeat token + Hope; retired 2026-06 to
    // match the card "your afterglow also marks a Stress".)
    const emStress = await AFLP.system.markStress(liveActor, 1);
    if (emStress != null) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card">
          <p><strong>${liveActor.name}</strong>'s Edge Master climax: release is failure - the afterglow also marks <strong>1 Stress</strong>.</p>
        </div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Edge Master (DH): afterglow + 1 Stress`);
      return true;
    }

    // Remove Afterglow if it was applied
    const afterglow = liveActor.items?.find(c =>
      c.slug === "afterglow" ||
      c.sourceId?.includes(AFLP.system.contentUuid("afterglow") ?? "NOMATCH")
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
        await AFLP.system.applyNativeCondition(liveActor, "sickened");
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
    await AFLP.system.applyEffect(liveActor, emAfterglowUUID, {
      noHook: true,
      systemMerge: { level: { value: liveActor.level ?? 1 } },
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

    const isSubmitting = AFLP.cond.has(liveActor, "submitting", tokenId);
    if (!isSubmitting) return;

    // DH-native: non-consensual orgasm marks 1 Stress + a disadvantage token.
    const purStress = await AFLP.system.markStress(liveActor, 1);
    if (purStress != null) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Purity recoils: a non-consensual climax marks <strong>1 Stress</strong>. No Defeat - their Defeat only comes from failing a resist with Fear.</p></div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Purity (DH): +1 Stress on climax (no Defeat)`);
      return;
    }

    if (typeof liveActor.increaseCondition === "function") {
      const existing = liveActor.items?.find(c => c.slug === "sickened");
      if (!existing) {
        await AFLP.system.applyNativeCondition(liveActor, "sickened");
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

    // DH-native: afterglow maps to Hope.
    const dhHope = await AFLP.system.gainHope(liveActor, 1);
    if (dhHope != null) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong>'s Brood Sow afterglow: gains <strong>1 Hope</strong> (now ${dhHope}).</p></div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Brood Sow (DH): +1 Hope (afterglow)`);
      return;
    }

    // Remove any existing Brood Sow's Afterglow before applying fresh
    const existing = liveActor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId) === bsAfterglowUUID
    );
    if (existing) await existing.delete().catch(() => {});

    await AFLP.system.applyEffect(liveActor, bsAfterglowUUID, {
      noHook: true,
      systemMerge: { level: { value: liveActor.level ?? 1 } },
    });

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
    // Both systems agree on the NUMBER; only the delivery differs. PF2e ships two
    // items sharing the `exposed` slug - a 1-2 counter and a Nude copy pinned at
    // min 2 - while DH tracks the same 1-2 in tokens. So read the value, and only
    // check exposed-nude as the PF2e shortcut for "pinned at 2".
    //
    // The old DH branch read the native Vulnerable status and capped at 1, which
    // is stale: Exposed is no longer mapped to Vulnerable, and Vulnerable is now
    // a CONSEQUENCE of Exposed 2 rather than the condition itself.
    //
    // This returning 2 for a Nude holder whose plain `exposed` value is below 2 is
    // the DESIGNED case, not a leak. The Nude copy carries no FlatModifier rules at
    // all (Exposed proper carries -1 * badge to ac and fortitude), because the nude
    // rune's whole selling point is being Exposed WITHOUT the AC / Fortitude sting.
    // So a rune wearer is level 2 here - Skyclad Engine, Exhibitionist, the exposure
    // art and every other kink gate fire off that - while PF2e applies no penalty.
    // See the Exposed (Nude) note in schema.js `conditions` before changing this.
    const lvl = Number(AFLP.cond.value(actor, "exposed")) || 0;
    if (lvl >= 2) return 2;
    if (AFLP.cond.has(actor, "exposed-nude")) return 2;
    return lvl;
  },

  // -----------------------------------------------
  // Skyclad Idol: Skyclad Engine — while Exposed 1+ and observed,
  // gain 1 Arousal at turn start (2 if Exposed 2).
  // -----------------------------------------------
  async onCombatTurnSkycladEngine(actor, tokenId = null) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = AFLP.system.liveActor(actor, tokenId);
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
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Skyclad Engine: ${AFLP.system.deltaText(gain)} (Exposed ${exposedLevel}, ${observerCount} observer${observerCount !== 1 ? "s" : ""}).</p></div>`,
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
      // 120 scene units. On a 5ft grid that is 24 squares, which the DH core
      // rules put in Very Far (13+ squares) - so this reads the same on both
      // systems and does NOT need a band. Re-express it as a band only once the
      // squares-vs-units question on AFLP.dhRanges is settled.
      return AFLP.withinRange(token, t, { pf2e: 120, daggerheart: 120, dnd5e: 120 });
    }).length;
  },

  // -----------------------------------------------
  // Voyeurism L5: when cumming while 2+ creatures observe, each must save or gain 2 Arousal.
  // -----------------------------------------------
  async onCumVoyeurism(actor, tokenId = null) {
    // PATHFINDER ONLY, two ways. It computes a Will DC from `abilities.cha`,
    // which Daggerheart actors do not have - so on DH it announced a DC built
    // from a modifier of 0 - and Daggerheart says Difficulty, never DC.
    //
    // The DH card runs the OTHER WAY ROUND: the Signature beat is "when you
    // watch a creature climax, mark 2 Arousal" - the WATCHER gains it, not the
    // audience. That is a different hook, not a re-gate of this one, and it is
    // NOT BUILT. See the queue.
    if (AFLP.system?.id === "daggerheart") return;
    if (!AFLP.actorHasKink(actor, "voyeurism")) return;
    if ((AFLP.getKinkTier(actor, "voyeurism") ?? 0) < 2) return; // Greater beat

    const observerCount = AFLP.Kinks._countObservers(tokenId, actor);
    if (observerCount < 2) return;

    // Get the character's Will DC: 10 + Cha mod + level (as written in the kink)
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const chaMod = liveActor.system?.abilities?.cha?.mod ?? 0;
    const level  = AFLP.actorLevel(liveActor);
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
  // Pain Slut: taking damage feeds arousal. Fires from the damage-watch hooks.
  // PF2e (symmetrical, levels 2/3/5):
  //   Base L2  - first damage each turn -> +1 Arousal.
  //   Greater L3 - if Horny when hit -> chat prompt for a +1 circumstance bonus
  //                to the next attack/skill this round (no penalty ladder exists
  //                to reduce, so pain sharpens instead).
  //   Mastery L5 - handled at cum time (edge through the crash), not here.
  // DH (three-beat 1/5/8):
  //   Signature - Major/Severe damage -> +1 Arousal (all damage on DH is a mark;
  //               we fire on any damage the hook caught, the "Major/Severe" framing
  //               is the fiction).
  //   Greater L5 - once/scene, mark a Stress to gain a Hope (prompted).
  //   Mastery L8 - handled at 0-HP time, not here.
  // -----------------------------------------------
  async onDamagePainSlut(actor) {
    if (!AFLP.actorHasKink(actor, "pain-slut")) return;
    const tokenId = actor.getActiveTokens?.()[0]?.id ?? null;
    const isDH = game.system?.id === "daggerheart";

    // Base beat: first hit each turn grants +1 Arousal. Out of combat there is
    // no turn structure, so every caught damage event counts as a fresh "turn".
    const turnKey = game.combat
      ? `${game.combat.round}.${game.combat.turn}`
      : `t${Date.now()}`;
    const lastKey = AFLP.Kinks._painTurnFired.get(actor.id);
    if (game.combat && lastKey === turnKey) {
      // already fired the base beat this turn; upper beats may still prompt
    } else {
      AFLP.Kinks._painTurnFired.set(actor.id, turnKey);
      try { await AFLP_Arousal.increment(actor, 1, "Pain Slut (took damage)", tokenId); }
      catch (e) { console.warn("AFLP | Pain Slut base:", e?.message); }
    }

    const level = AFLP.getKinkLevel(actor, "pain-slut");

    if (isDH) {
      // Greater (L5): once/scene, offer to mark a Stress for a Hope.
      if (level >= 5) {
        const sceneKey = actor.getActiveTokens?.()[0]?.scene?.id ?? "noscene";
        AFLP.Kinks._painDHScene ??= new Map();
        const seen = AFLP.Kinks._painDHScene.get(actor.id);
        if (seen !== sceneKey) {
          AFLP.Kinks._painDHScene.set(actor.id, sceneKey);
          await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s <em>Pain Slut</em> (Greater): once this scene, you may mark a Stress to gain a Hope - you get off on it. <em>GM: apply if taken.</em></p></div>`,
            speaker: { alias: "AFLR" },
          });
        }
      }
      return;
    }

    // PF2e Greater (L3): if Horny when hit, offer a +1 circumstance to next roll.
    if (level >= 3 && (AFLP.cond?.has?.(actor, "horny") || AFLP.cond?.has?.(actor, "horny-always"))) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s <em>Pain Slut</em> (Greater): hit while Horny - take a <strong>+1 circumstance bonus</strong> to your next attack roll or skill check this round.</p></div>`,
        speaker: { alias: "AFLR" },
      });
    }
  },

  // Pain Slut Mastery: called from the cum crash (PF2e) / 0-HP path. Chat-prompt
  // form so the GM applies the trade; no silent HP edits.
  async onCumCrashPainSlut(actor) {
    if (!AFLP.actorHasKink(actor, "pain-slut")) return;
    const level = AFLP.getKinkLevel(actor, "pain-slut");
    if (game.system?.id !== "daggerheart" && level >= 5) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s <em>Pain Slut</em> (Mastery): once/encounter, you may take <strong>1d6 damage</strong> to stay at 1 Arousal instead of crashing to 0 - edge through it.</p></div>`,
        speaker: { alias: "AFLR" },
      });
    }
  },


  // Removed by removeBroodSowEndurance when last pregnancy completes.
  // -----------------------------------------------
  async applyBroodSowEndurance(actor) {
    if (!AFLP.actorHasKink(actor, "brood-sow")) return;

    // DH-native: the brood sow's stamina manifests as relief - clear 1 Stress.
    const dhEndStress = await AFLP.system.clearStress(actor, 1);
    if (dhEndStress != null) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s Brood Sow endurance: clears <strong>1 Stress</strong> (now ${dhEndStress}).</p></div>`,
        speaker: { alias: "AFLP" },
      });
      console.log(`AFLP | ${actor.name} Brood Sow (DH): cleared 1 Stress (endurance)`);
      return;
    }

    const bsEnduranceUUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.hImH05z16v9vh9Ob";

    // Don't stack — only apply if not already present
    const existing = actor.items?.find(i =>
      (i.flags?.core?.sourceId ?? i.sourceId) === bsEnduranceUUID
    );
    if (existing) return;

    await AFLP.system.applyEffect(actor, bsEnduranceUUID, {
      noHook: true,
      systemMerge: { level: { value: actor.level ?? 1 } },
    });
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
    const worldActor = AFLP.system.liveActor(actor);
    const current = AFLP.horny.total(worldActor);
    // ORPHANED READERS FIXED HERE AND IN BONDAGE PRINCESS BELOW. Both chat cards
    // and both console lines read `horny.temp` against a `const horny` bag that
    // the door pass deleted, so every Party Animal drug advance and every Bondage
    // Princess equip threw ReferenceError - AFTER the Horny had landed, so the
    // grant worked and the announcement never posted. Found 19 Aug 2026 by
    // eslint no-undef, not by the suite. Report the TOTAL, which is what the
    // player sees on the panel; `temp` was never the right number on Daggerheart.
    const after   = await AFLP.horny.add(worldActor, stagesGained);
    const gain    = after - current;
    if (gain <= 0) return; // already at cap
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Party Animal kink triggers: +${gain} Horny from drug stage advance (Horny ${after}/3).</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Party Animal: +${gain} Horny (now ${after})`);
  },

  // -----------------------------------------------
  // Exhibitionist. The two systems say different things and this must not be one
  // rule with one number:
  //
  //   PF2e  "while Exposed, you gain an equal value of Horny."
  //         Raise temp Horny TO the Exposed value, if higher than current, cap 3.
  //   DH    "Becoming Exposed causes you to mark a Horny token."
  //         ONE token, per becoming-Exposed. Not the level.
  //
  // Applying PF2e's number to Daggerheart is a documented regression - it is the
  // third example in the "waking a dead read is not a neutral act" section: the
  // trigger was made to fire on DH and kept PF2e's arithmetic, so Exposed 2 handed
  // out Horny 2 against a card that says mark A token. Fixed 7 August 2026, with a
  // harness test either side.
  // -----------------------------------------------
  async onExposedChangeExhibitionist(actor, exposedVal) {
    const worldActor = AFLP.system.liveActor(actor);
    // AFLP.horny.total, not `horny.temp`. Reading the legacy bag here was the
    // same dual-store bug one level up: on Daggerheart the bag is always 0, so
    // "current" was blind to a creature that was already Horny and the DH branch
    // computed its +1 from the wrong base.
    const current = AFLP.horny.total(worldActor);
    const isDH = AFLP.system?.id === "daggerheart";
    // DH marks one token each time; PF2e raises to the level. Both clamp through
    // the shared ceiling rather than a literal, so the cap lives in one place.
    const target = isDH
      ? AFLP.capCondition("horny", current + 1)
      : AFLP.capCondition("horny", Math.min(exposedVal, 3));
    if (target <= current) return; // already at or above what this would grant
    await AFLP.horny.raiseTo(worldActor, target);
    const line = isDH
      ? `<strong>${worldActor.name}</strong>'s Exhibitionist kink triggers: marks a Horny token (now ${target}).`
      : `<strong>${worldActor.name}</strong>'s Exhibitionist kink triggers: Exposed ${exposedVal} grants Horny ${target}.`;
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p>${line}</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Exhibitionist: ${isDH ? `+1 token -> Horny ${target}` : `Exposed ${exposedVal} -> Horny ${target}`}`);
  },

  // -----------------------------------------------
  // Bondage Princess: "While affected by an item, spell or effect with the
  // Bondage trait, you gain one level of Horny to a maximum of Horny 3."
  // Fires on bondage item creation.
  // -----------------------------------------------
  // Re-derive the Bondage Princess floor from what the actor is actually wearing.
  // Worn-and-active, not merely carried: `_active` is what stops a harness in a
  // backpack counting, which on PF2e is a real case (system.equipped is an
  // object and a fresh item defaults to carryType "worn").
  async syncBondagePrincessHorny(actor) {
    const live = AFLP.system.liveActor(actor);
    if (!live) return 0;
    const bound = (live.items?.contents ?? live.items ?? []).some(
      i => AFLP.itemIsBondage?.(i) && AFLP.anatomy?._active?.(i));
    return AFLP.horny.setSustained(live, "bondage-princess", bound ? 1 : 0);
  },

  async onBondageItemEquippedBondagePrincess(actor) {
    const worldActor = AFLP.system.liveActor(actor);
    // The card is a WHILE clause on both systems - PF2e "While affected by an
    // item, spell or effect with the Bondage trait, you gain one level of Horny",
    // DH "While affected by a Bondage or restraining Carnal effect, gain a Horny
    // token". So it is a SUSTAINED floor, not a one-off +1: it must survive a
    // rest while the gear is still on, and come back off when it is removed.
    // AFLP.Kinks.syncBondagePrincessHorny below withdraws it.
    const before = AFLP.horny.total(worldActor);
    await AFLP.horny.setSustained(worldActor, "bondage-princess", 1);
    if (AFLP.horny.total(worldActor) <= before) return; // already at or above the floor
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bondage Princess kink triggers: +1 Horny from bondage item (Horny ${AFLP.horny.total(worldActor)}/3).</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Bondage Princess: +1 Horny floor (now ${AFLP.horny.total(worldActor)})`);
  },

  // -----------------------------------------------
  // Exhibitionist L2: "When you become Frightened, reduce the level of Frightened
  // by 1 and are Horny 1 instead."
  // Reduces the Frightened condition badge value by 1 (removing it if it hits 0)
  // and grants Horny 1.
  // -----------------------------------------------
  async onFrightenedExhibitionistL2(actor, frightenedItem) {
    const worldActor = AFLP.system.liveActor(actor);
    const liveItem = worldActor.items?.get(frightenedItem.id) ?? frightenedItem;
    const currentVal = liveItem.system?.badge?.value ?? 1;

    if (currentVal <= 1) {
      // Remove the condition entirely
      await liveItem.delete().catch(() => {});
    } else {
      await liveItem.update({ "system.badge.value": currentVal - 1 });
    }

    // Grant Horny 1 if not already at cap
    await AFLP.horny.add(worldActor, 1);

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Exhibitionist L2 triggers: Frightened reduced by 1, gains Horny 1.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Exhibitionist L2: Frightened -1, Horny +1`);
  },

  async enforceAphrodisiacJunkieL7(actor) {
    if (!AFLP.actorHasKink(actor, "aphrodisiac-junkie")) return;
    if ((AFLP.getKinkTier(actor, "aphrodisiac-junkie") ?? 0) < 3) return; // Mastery beat

    // Aphrodisiac Junkie L7 grants permanent Horny 3 via the world flag.
    // permanent is never cleared on cum; we only write if it needs bumping up.
    if (AFLP.horny.permanent(actor) < 3) {
      await AFLP.horny.setSustained(actor, "aphrodisiac-junkie", 3);
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
    const actorLevel = AFLP.actorLevel(actor);
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
    // PATHFINDER ONLY. Daggerheart's Edge Master card has no auto-success clause
    // at any beat, and this gate is a raw LEVEL 3 - which on the shared 1/5/8
    // fold is still SIGNATURE, so on DH it handed a first-beat kink a guaranteed
    // Edge. Everything else here reads tiers; this one never moved.
    const edgeMasterLevel = AFLP.getKinkLevel(actor, "edge-master");
    if (AFLP.system?.id !== "daggerheart" && edgeMasterLevel >= 3 && context.isMasturbation) {
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

    const isNPC = AFLP.system.isNPC(actor);
    if (isNPC && !AFLP.Settings.edgeIncludeNpc) return false;
    // At Lewd 4 (edgeSkipDialog=true) monsters never Edge — auto-rolling edge on
    // monsters creates an unfun denial loop. Monsters at Lewd 3 (edgeSkipDialog=false)
    // still get the confirmation prompt so the GM can choose.
    if (isNPC && AFLP.Settings.edgeSkipDialog) return false;

    const liveActor  = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const actorLevel = AFLP.actorLevel(actor);
    const actorName  = actor.name;

    // ── Edge Master L3: auto-succeed if cum was triggered by masturbation (Sexual Advance) ──
    // PATHFINDER ONLY. Daggerheart's Edge Master card has no auto-success clause
    // at any beat, and this gate is a raw LEVEL 3 - which on the shared 1/5/8
    // fold is still SIGNATURE, so on DH it handed a first-beat kink a guaranteed
    // Edge. Everything else here reads tiers; this one never moved.
    const edgeMasterLevel = AFLP.getKinkLevel(actor, "edge-master");
    if (AFLP.system?.id !== "daggerheart" && edgeMasterLevel >= 3 && context.isMasturbation) {
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
    // PATHFINDER ONLY - the damage rider is PF2e's, and "next turn" is an economy
    // Daggerheart does not have. DH's Edge Master gets its own note.
    const _emTierNow = AFLP.getKinkTier?.(actor, "edge-master") ?? 0;
    const emNote = (AFLP.system?.id === "daggerheart")
      ? (_emTierNow >= 2
          ? `<p style="font-size:11px;color:#8060a0;"><strong>Edge Master:</strong> Denied caps at 4 for you, and the first Edge this scene gains a Hope.</p>`
          : "")
      : (edgeMasterLevel >= 2
          ? `<p style="font-size:11px;color:#8060a0;"><strong>Edge Master:</strong> Success grants +${_emTierNow >= 3 ? 4 : 2} to weapon and unarmed damage until end of next turn.</p>`
          : "");
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

    // Resist roll via the active system adapter. PF2e rolls a Fortitude save
    // (posting its own card); other systems map "fortitude" to their own
    // resist mechanic. The d20 fallback flavor is preserved for any system
    // whose native roll is unavailable.
    const rollOptions = ["action:edge"];
    // NAME THE ROLL THE SYSTEM ACTUALLY MAKES. This said "Fortitude DC" on every
    // system, while the line below dispatches through AFLP.system.rollResist -
    // so a Daggerheart player was told they were making a Fortitude save against
    // a DC for what is a Duality roll against a Difficulty, and a 5e player was
    // told the same about a Constitution save. Two wrong words in one string,
    // found by the 17 Aug 2026 vocabulary sweep. `resistKind` is the adapter's
    // own declaration of what it rolls, so the label cannot drift from it.
    const _rk = AFLP.system?.capabilities?.resistKind;
    const _resistLabel = _rk === "duality" ? "Duality" : _rk === "con" ? "Constitution" : "Fortitude";
    const flavor = `<strong>${actorName}</strong> attempts to Edge `
      + `(${_resistLabel} vs ${AFLP.system?.dcWord ?? "DC"} ${dc})`;
    const _res = await AFLP.system.rollResist(actor, {
      dc,
      kind: "fortitude",
      flavor,
      options: rollOptions,
    });
    // A DISMISSED ROLL DIALOG IS NOT A FAILED EDGE. Since the Daggerheart Edge was
    // ported onto the system's own roller (23 Aug 2026) the player can close the
    // dialog, and the system's contract for that is that no roll happened and
    // nobody is paid. Returning false here would resolve their climax for them.
    // `null` is the third answer, and every caller must treat it as "nothing
    // happened" rather than as a failure - see `resolveEdge`, which puts the
    // ready-to-cum gate back.
    if (_res?.cancelled) return null;
    const { total } = _res ?? {};

    // Determine outcome from roll total vs DC
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
  // The Denied ceiling for THIS actor. Normally the registry's cap, but the
  // Daggerheart Edge Master's Greater beat states "your Denied tokens cap at 4
  // instead of 3 - you hold the brink longer than anyone", which nothing
  // implemented: both raises below hardcoded a literal 3. PF2e's card carries no
  // such line, so the override is DH-only.
  // Stale when: either card's Denied ceiling changes, or PF2e gains the beat.
  _deniedCap(actor) {
    const base = AFLP.capCondition("denied", 99);
    if (AFLP.system?.id !== "daggerheart") return base;
    return (AFLP.getKinkTier?.(actor, "edge-master") ?? 0) >= 2 ? Math.max(base, 4) : base;
  },

  async _resolveEdgeSuccess(actor, liveActor, tokenId, actorName, actorLevel, outcomeLabel) {
    const FLAG            = AFLP.FLAG_SCOPE;
    const isDH            = AFLP.system?.id === "daggerheart";
    const cap             = AFLP.Kinks._deniedCap(actor);

    // Denied 1, through AFLP.denied. This wrote the legacy `{value}` bag by
    // hand, which on Daggerheart is not the store - measured 19 Aug 2026, an
    // edged DH character gained nothing the status panel or a rest could see.
    // AFLP.denied.add clamps through the per-actor ceiling itself, which is why
    // `cap` is no longer applied here.
    await AFLP.denied.add(actor, 1);

    // Purity kink: when successfully Edging, gain 2 Denied instead of 1
    if (AFLP.actorHasKink(actor, "purity")) await AFLP.denied.add(actor, 1);

    // The +2/+4 damage rider is PATHFINDER'S Edge Master. The Daggerheart card
    // says nothing about damage, and "until end of next turn" is an economy
    // Daggerheart does not have. Its Greater beat is a Hope instead, granted
    // below.
    const emTier  = AFLP.getKinkTier?.(actor, "edge-master") ?? 0;
    const emBonus = isDH ? 0 : (emTier >= 3 ? 4 : emTier >= 1 ? 2 : 0); // Signature +2 / Mastery +4
    // ORPHANED READER, FIXED. This was `denied.value` against a `const denied`
    // bag that the edit above deleted when the writes moved to AFLP.denied.add -
    // so it threw ReferenceError on EVERY successful Edge, after the Denied had
    // landed but before the chat card, the DH Edge Master Hope, the Voyeurism
    // bonus, the sentient-item hook and the Lovense emit, none of which ran.
    // Introduced 19 Aug 2026 by my own Denied-door pass; found by the
    // actions-feats audit, NOT by the suite - nothing drives _resolveEdgeSuccess.
    // Read through the door, so it reports the store this system actually uses.
    const deniedTotal = AFLP.denied.total(actor);

    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${actorName}</strong> successfully Edges! (${outcomeLabel})</p>
        <p>The Cum does not occur. <strong>${actorName}</strong> ${AFLP.system?.markVerb ?? "gain"}s <strong>Denied 1</strong> (now Denied ${deniedTotal}${deniedTotal >= cap ? `, at their maximum of ${cap}` : ""}).</p>
        ${emBonus > 0 ? `<p><em>Edge Master: +${emBonus} to weapon and unarmed damage until end of next turn.</em></p>` : ""}
      </div>`,
      speaker: { alias: "AFLP" },
    });

    // DH Edge Master, Greater: "The first time you successfully Edge each scene,
    // gain a Hope." Scoped to an H-Scene because "each scene" is the card's own
    // unit and the marker is cleared at scene close beside afterglowScene; an
    // Edge with no scene open grants nothing rather than paying out per Edge.
    if (isDH && emTier >= 2) {
      try {
        const sc = AFLP.HScene?.sceneForActor?.(actor.id);
        const world = actor.getWorldActor?.() ?? actor;
        if (sc?.id && world.getFlag(FLAG, "edgeHopeScene") !== sc.id) {
          await world.setFlag(FLAG, "edgeHopeScene", sc.id);
          const hope = await AFLP.system.gainHope(world, 1);
          if (hope != null) await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${actorName}</strong>'s Edge Master: denial is fuel - the first Edge this scene gains <strong>a Hope</strong>.</p></div>`,
            speaker: { alias: "AFLP" },
          });
        }
      } catch (e) { console.warn("AFLP | Edge Master Hope:", e?.message); }
    }

    // Voyeurism L3: +2 status to attacks and skills until end of next turn when edging while observed.
    // PATHFINDER ONLY. Daggerheart's Voyeurism card has no such bonus - its
    // Greater beat is a Hope when a creature climaxes unaware you are watching,
    // plus adversaries marking a Stress to target you, neither of which is this
    // and neither of which is built. Do not re-widen this to DH; see the queue.
    if (!isDH && AFLP.actorHasKink(actor, "voyeurism") && (AFLP.getKinkTier(actor, "voyeurism") ?? 0) >= 2) { // Greater beat
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

  // Normal DC by level. Ardis, 20 Aug 2026: "the edge card says it uses a normal
  // dc" - so the CONCEPT was always right and only the numbers were wrong.
  //
  // This used to carry its own table, [14,15,15,16,17,17,18,19,19,20,21,21,...],
  // under a comment claiming it "matches PF2e Simple DC table (GMG p.503)". It
  // matches nothing. MEASURED against the shipped system, pf2e 8.4.0, by reading
  // the DCs-by-Level array straight out of `systems/pf2e/pf2e.mjs`:
  //
  //     system:  [0,15,16,18,19,20,22,23,24,26,27,28,30,31,32,34,35,36,38,39,40]
  //                 ^ index IS the level; index 0 is a placeholder, level 0 is 14
  //
  // `_HS_DC_BY_LEVEL` below is that table exactly, with 14 at level 0 and a
  // continuation past 20. So there is now ONE table in this file instead of two,
  // which is the point - two DC tables is how they drift apart.
  //
  // "Normal" is the +0 rung of CONFIG.PF2E.dcAdjustments (incredibly-easy ..
  // incredibly-hard), so a normal DC IS the by-level DC unadjusted. That is also
  // why _hsHardDC adds +2 to the same table: "hard" is the +2 rung.
  //
  // THIS MAKES EDGING HARDER at most levels - level 3 was 16 and is 18, level 5
  // was 17 and is 20. That is a balance consequence of a conformance fix, and it
  // is stated here rather than discovered at a table.
  // GOES STALE IF: the card stops saying "normal DC", or Paizo reprints the table.
  _normalDC(level) {
    const lvl = Math.max(0, Math.min(_HS_DC_BY_LEVEL.length - 1, Number(level) || 0));
    return _HS_DC_BY_LEVEL[lvl] ?? 14;
  },

  // -----------------------------------------------
  // Bimbo kink — fires on SA and on each arousal increment while Bimbofied.
  // L1: Toggle aflp:bimbo-active RollOption when Bimbofied is present.
  // -----------------------------------------------
  async syncBimboActive(actor) {
    if (!AFLP.actorHasKink(actor, "bimbo")) return;
    const liveActor    = AFLP.system.liveActor(actor);
    const isBimbofied  = liveActor.items?.some(i =>
      i.slug === "bimbofied" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.9ySsqXnpfZkhmp2V"
    );
    // Find the Bimbo kink item on the actor and flip its RollOption toggle
    const bimboItem = liveActor.items?.find(i =>
      i.slug === "bimbo" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.system.contentUuid("bimbo")
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
    const liveActor = AFLP.system.liveActor(actor);

    // Count how many scene attackers have Dominating condition
    let domCount = 0;
    if (AFLP.Settings.hsceneEnabled && AFLP.HScene._getScene) {
      const scene = AFLP.HScene._getScene(actor.id);
      if (scene) {
        for (const atk of (scene.attackers ?? [])) {
          const atkActor = canvas?.tokens?.get(atk.id)?.actor
                        ?? game.actors?.get(atk.actorId ?? atk.id);
          if (!atkActor) continue;
          if (AFLP.cond.has(atkActor, "dominating")) domCount++;
        }
      }
    }

    const gangItem = liveActor.items?.find(i =>
      i.slug === "gangslut" ||
      (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.system.contentUuid("gangslut")
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
    const subLink = AFLP.contentLinkText("submitting", "Submitting");
    if (!AFLP.cond.has(liveActor, "submitting")) return;

    // Find any token on scene with cock-pacifying: true that is Dominating
    const pacifyingSource = canvas?.tokens?.placeables?.find(t => {
      if (!t.actor || t.actor.id === liveActor.id) return false;
      const isDominating = AFLP.cond.has(t.actor, "dominating");
      if (!isDominating) return false;
      const gt = t.actor.getFlag(FLAG, "anatomyFeatures") ?? {};
      return gt["cock-pacifying"] === true;
    });
    if (!pacifyingSource) return;

    // Enforce the stated Horny 2 minimum. raiseTo, not add: the card says
    // "minimum", so a creature already at 3 must not be pushed anywhere.
    await AFLP.horny.raiseTo(liveActor, 2);

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong> is ${subLink} to <strong>${pacifyingSource.name}</strong>'s pacifying cock. ${liveActor.name} is ${AFLP.contentLinkText("horny", "Horny 2")} (minimum) and cannot make hostile actions or attempt to Escape.</p></div>`,
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
    if ((cumflation.bodyCoat ?? 0) < 4) return;

    const token = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;

    // Collect all tokens within 30ft (including self)
    const nearby = canvas.tokens.placeables.filter(t => {
      if (!t.actor) return false;
      // 30 scene units = 6 squares on a 5ft grid = Close, per the DH core rules.
      return AFLP.withinRange(token, t, { pf2e: 30, daggerheart: 30, dnd5e: 30 });
    });

    for (const t of nearby) {
      const liveActor = t.actor;
      // THROUGH THE DOOR. This used to read the ITEM badge and then branch on the
      // system to write - `applyCondition` on Daggerheart, `applyEffect`
      // otherwise. `applyEffect` on PF2e creates an item unconditionally, with no
      // existing check and no cap, so on Pathfinder this aura stacked a fresh
      // uncapped Horny item EVERY combat turn into a store no AFLR reader looks
      // at: the arousal bonus, the status panel and the sheet all read
      // AFLP.horny. Neither the count nor the grant was reaching the player.
      // raiseTo is the right verb - the aura says "gain Horny 1", a floor to
      // reach, not a stack to add. Found 19 Aug 2026 by the dual-store sweep.
      if (AFLP.horny.total(liveActor) < 1) await AFLP.horny.raiseTo(liveActor, 1);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Paizuri Aura is active (${cumflation.bodyCoat} ml). All creatures within 30 feet gain ${AFLP.contentLinkText("horny", "Horny 1")}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Bimbomancy domain: Bimbo/Bull path toggle + My Body is a Weapon.
  // -----------------------------------------------
  _bimboPathLabel(path) { return path === "bull" ? "Bull" : "Bimbo"; },

  // The Bimbomancer feature grants vault access to the Bimbomancy domain.
  // DH derives a character's domains from their class, so we wrap the character
  // model's `domains` getter to append "bimbomancy" whenever the actor carries
  // the bimbomancerDedication flag. libWrapper if present; safe monkeypatch else.
  _registerBimbomancyDomainGrant() {
    // RETIRED 2026-07 (AFLR/DH only): bimbomancy and skyclad are no longer DH
    // domains. Their cards were migrated into native DH domains (grace, codex,
    // etc.) and are reached normally through class domains, so the domains-getter
    // grant and the domainCard _preCreate loadout gate below are obsolete. This is
    // now a no-op; register() no longer calls it. "Dedications" are a PF2e concept,
    // not DH - and this change does NOT touch the PF2e module, where bimbomancy and
    // skyclad remain real dedications.
    return;
    // --- obsolete implementation retained below for reference; unreachable ---
    // eslint-disable-next-line no-unreachable
    if (this._bimboDomainWrapped || AFLP.system?.id !== "daggerheart") return;
    const SCOPE = AFLP.FLAG_SCOPE;
    const ARCHETYPE_DOMAINS = {
      bimbomancerDedication: "bimbomancy",
      skycladIdolDedication: "skyclad",
    };
    const addBimbo = (base, model) => {
      try {
        const a = model?.parent;
        if (!a?.getFlag) return base;
        let arr = null;
        for (const [flag, domain] of Object.entries(ARCHETYPE_DOMAINS)) {
          if (a.getFlag(SCOPE, flag)) {
            arr = arr ?? (Array.isArray(base) ? base.slice() : [...(base || [])]);
            if (!arr.includes(domain)) arr.push(domain);
          }
        }
        return arr ?? base;
      } catch (e) { /* never break data prep */ }
      return base;
    };
    const doWrap = () => {
      if (this._bimboDomainWrapped) return;
      const proto = CONFIG.Actor?.dataModels?.character?.prototype;
      if (!proto) return;
      if (game.modules.get("lib-wrapper")?.active) {
        libWrapper.register("ardisfoxxs-lewd-pf2e",
          "CONFIG.Actor.dataModels.character.prototype.domains",
          function (wrapped, ...args) { return addBimbo(wrapped(...args), this); },
          "WRAPPER");
        this._bimboDomainWrapped = true;
      } else {
        const desc = Object.getOwnPropertyDescriptor(proto, "domains");
        if (desc?.get) {
          const orig = desc.get;
          Object.defineProperty(proto, "domains", {
            configurable: true, enumerable: desc.enumerable,
            get() { return addBimbo(orig.call(this), this); },
          });
          this._bimboDomainWrapped = true;
        }
      }

      // Loadout-add gate. The domainCard model's _preCreate returns false to
      // cancel any card whose domain is not one of the character's CLASS domains.
      // That blocks cards from an archetype-granted domain even though the vault
      // browser lists them (the browser reads the wrapped `domains` getter; the
      // gate reads the class). Wrap _preCreate so a card whose domain is
      // archetype-granted is allowed through when the actor holds the matching
      // dedication flag. Without this, players can browse the archetype cards but
      // cannot add them to a loadout. Proven live before shipping.
      const cardProto = CONFIG.Item?.dataModels?.domainCard?.prototype;
      if (cardProto && !this._bimboCardPreCreateWrapped) {
        if (game.modules.get("lib-wrapper")?.active) {
          libWrapper.register("ardisfoxxs-lewd-pf2e",
            "CONFIG.Item.dataModels.domainCard.prototype._preCreate",
            async function (wrapped, data, options, user) {
              const r = await wrapped(data, options, user);
              if (r === false) {
                try {
                  const domain = data?.system?.domain ?? this?.domain ?? this?.parent?.system?.domain;
                  const actor  = options?.parent ?? this?.parent?.parent ?? this?.parent?.actor;
                  if (actor && domain) {
                    for (const [flag, dom] of Object.entries(ARCHETYPE_DOMAINS)) {
                      if (dom === domain && actor.getFlag?.(SCOPE, flag)) return; // allow
                    }
                  }
                } catch (e) { /* never break creation */ }
              }
              return r;
            },
            "WRAPPER");
          this._bimboCardPreCreateWrapped = true;
        } else {
          const origPC = cardProto._preCreate;
          cardProto._preCreate = async function (data, options, user) {
            const r = await origPC.call(this, data, options, user);
            if (r === false) {
              try {
                const domain = data?.system?.domain ?? this?.domain ?? this?.parent?.system?.domain;
                const actor  = options?.parent ?? this?.parent?.parent ?? this?.parent?.actor;
                if (actor && domain) {
                  for (const [flag, dom] of Object.entries(ARCHETYPE_DOMAINS)) {
                    if (dom === domain && actor.getFlag?.(SCOPE, flag)) return; // allow
                  }
                }
              } catch (e) { /* never break creation */ }
            }
            return r;
          };
          this._bimboCardPreCreateWrapped = true;
        }
      }

      if (this._bimboDomainWrapped) console.log("AFLP | Bimbomancy domain grant wired (domains getter + loadout gate).");
    };
    if (CONFIG.Actor?.dataModels?.character?.prototype) doWrap();
    else Hooks.once("ready", doWrap);
  },

  async _postBimbomancerPathCard(actor, path = "bimbo") {
    const cur = this._bimboPathLabel(actor.getFlag(AFLP.FLAG_SCOPE, "bimbomancerPath") || path);
    const aid = actor.id;
    await ChatMessage.create({
      speaker: { alias: "AFLP" },
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong> is a <strong>Bimbomancer</strong>. Current path: <strong>${cur}</strong>.</p>
        <p>Choose a path - it shapes every Bimbomancy transformation:</p>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
          <button type="button" class="aflp-bimbo-path" data-actor="${aid}" data-path="bimbo">Bimbo (impose Bimbofied)</button>
          <button type="button" class="aflp-bimbo-path" data-actor="${aid}" data-path="bull">Bull (impose Bullified)</button>
        </div>
      </div>`,
    });
  },

  async setBimbomancerPath(actor, path) {
    if (!actor) return;
    const p = (path === "bull") ? "bull" : "bimbo";
    await actor.setFlag(AFLP.FLAG_SCOPE, "bimbomancerPath", p);
    await ChatMessage.create({
      speaker: { alias: "AFLP" },
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> takes the <strong>${this._bimboPathLabel(p)}</strong> path. Transformations now impose <strong>${p === "bull" ? "Bullified" : "Bimbofied"}</strong>.</p></div>`,
    });
    console.log(`AFLP | Bimbomancer path set to ${p} on ${actor.name}`);
  },

  async _postSkycladPathCard(actor, path = "nudist") {
    const cur = path === "stripper" ? "Stripper" : "Nudist";
    const aid = actor.id;
    await ChatMessage.create({
      speaker: { alias: "AFLP" },
      content: `<div class="aflp-chat-card">
        <p><strong>${actor.name}</strong> is a <strong>Skyclad Idol</strong>. Current path: <strong>${cur}</strong>.</p>
        <p>Choose a path - it shapes your Skyclad benefits:</p>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
          <button type="button" class="aflp-skyclad-path" data-actor="${aid}" data-path="nudist">Nudist (defensive)</button>
          <button type="button" class="aflp-skyclad-path" data-actor="${aid}" data-path="stripper">Stripper (reactive)</button>
        </div>
      </div>`,
    });
  },

  async setSkycladPath(actor, path) {
    if (!actor) return;
    const p = (path === "stripper") ? "stripper" : "nudist";
    await actor.setFlag(AFLP.FLAG_SCOPE, "skycladPath", p);
    await ChatMessage.create({
      speaker: { alias: "AFLP" },
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> takes the <strong>${p === "stripper" ? "Stripper" : "Nudist"}</strong> path.</p></div>`,
    });
    console.log(`AFLP | Skyclad path set to ${p} on ${actor.name}`);
  },

  // My Body is a Weapon: impose the actor's path condition on each targeted token.
  async bimbomancyMyBody(actor, targets = null) {
    if (!actor) return;
    const path = actor.getFlag(AFLP.FLAG_SCOPE, "bimbomancerPath") || "bimbo";
    const tks = targets ?? Array.from(game.user?.targets ?? []);
    if (!tks.length) { ui.notifications?.warn("AFLR | Target a token first (My Body is a Weapon)."); return; }
    const apply = path === "bull" ? "setBullified" : "setBimbofied";
    const cond  = path === "bull" ? "bullified" : "bimbofied";
    const label = path === "bull" ? "Bullified" : "Bimbofied";
    for (const t of tks) {
      const tgt = t.actor ?? t;
      if (!tgt) continue;
      const cur = AFLP.cond?.value?.(tgt, cond) ?? 0;
      // Return-value contract: the adapter setter is a null-returning stub on any
      // system without a native token track (PF2e), so route through cond.setTracked
      // which falls back to the generic condition write. The old direct call applied
      // nothing on PF2e while the chat card still announced the new level.
      const n = await AFLP.cond.setTracked(tgt, cond, apply, Math.min(3, cur + 1));
      await ChatMessage.create({
        speaker: { alias: "AFLP" },
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> presses in - <strong>${tgt.name}</strong> takes <strong>${label} ${n ?? cur + 1}/3</strong>.</p></div>`,
      });
    }
  },

  // When the "My Body is a Weapon" domain card is posted to chat by a
  // Bimbomancer, inject an Apply button (delegated handler does the work).
  _maybeInjectMyBodyButton(msg, root) {
    try {
      if (!root?.querySelector || root.querySelector(".aflp-mybody-apply")) return;
      if (!/My Body is a Weapon/i.test(root.textContent || "")) return;
      const aid = msg?.speaker?.actor;
      const actor = aid ? game.actors?.get(aid) : null;
      if (!actor?.getFlag?.(AFLP.FLAG_SCOPE, "bimbomancerDedication")) return;
      const path = actor.getFlag(AFLP.FLAG_SCOPE, "bimbomancerPath") || "bimbo";
      const label = path === "bull" ? "Bullified" : "Bimbofied";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "aflp-mybody-apply";
      btn.dataset.actor = actor.id;
      btn.textContent = `Apply ${label} to target`;
      btn.style.marginTop = "4px";
      (root.querySelector(".message-content") || root).appendChild(btn);
    } catch (e) { /* never break chat render */ }
  },

  // Delegated click handling for Bimbomancy chat buttons (bound once in register()).
  _bindBimboChatButtons() {
    if (this._bimboChatBound) return;
    this._bimboChatBound = true;
    const inject = (m, h) => {
      const root = h?.jquery ? h[0] : (h instanceof HTMLElement ? h : h?.[0]);
      AFLP.Kinks._maybeInjectMyBodyButton(m, root);
    };
    Hooks.on("renderChatMessageHTML", inject);
    Hooks.on("renderChatMessage", inject); // fallback for older cores
    document.addEventListener("click", async (e) => {
      const pathBtn = e.target?.closest?.(".aflp-bimbo-path");
      if (pathBtn) {
        e.preventDefault();
        const a = game.actors?.get(pathBtn.dataset.actor);
        if (a) await AFLP.Kinks.setBimbomancerPath(a, pathBtn.dataset.path);
        return;
      }
      const skyBtn = e.target?.closest?.(".aflp-skyclad-path");
      if (skyBtn) {
        e.preventDefault();
        const a = game.actors?.get(skyBtn.dataset.actor);
        if (a) await AFLP.Kinks.setSkycladPath(a, skyBtn.dataset.path);
        return;
      }
      const mbBtn = e.target?.closest?.(".aflp-mybody-apply");
      if (mbBtn) {
        e.preventDefault();
        const a = game.actors?.get(mbBtn.dataset.actor);
        if (a) await AFLP.Kinks.bimbomancyMyBody(a);
        return;
      }
    });
  },

  // -----------------------------------------------
  // The SYNCHRONOUS half of the Stupified interception. The preCreateItem hook
  // has to decide whether to cancel the create in the same tick (see the hook),
  // so every gate that decides "yes, we are converting this" lives here and
  // nothing in it may await. interceptStupified re-checks the same gates so it
  // stays safe to call on its own.
  // -----------------------------------------------
  canInterceptStupified(actor, itemData) {
    if (!AFLP.Settings.automation) return false;
    const worldActor = actor?.getWorldActor?.() ?? actor;
    if (!worldActor?.getFlag?.(AFLP.FLAG_SCOPE, "bimbomancerDedication")) return false;
    return itemData?.system?.slug === "stupefied"
      || itemData?.slug === "stupefied"
      || (itemData?.name ?? "").toLowerCase() === "stupefied";
  },

  // The level a native PF2e Stupefied arrives with.
  //
  // PF2e stores a valued condition at `system.value.value` ({isValued, value}),
  // NOT in a counter badge - measured 18 Aug 2026 on pf2e 8.4.0:
  // `actor.increaseCondition("stupefied", {value: 3})` yields
  // `system.value = {isValued:true, value:3}` and `system.badge = null`.
  // Reading only the badge meant every Stupefied converted as 1, so Stupefied 3
  // bought one level of Bimbofied. The badge read stays FIRST because AFLR's own
  // condition items do use a counter badge; the PF2e shape is the fallback.
  // GOES STALE IF: PF2e moves valued conditions onto a badge.
  _stupefiedLevel(itemData) {
    const badge = Number(itemData?.system?.badge?.value);
    if (Number.isFinite(badge) && badge > 0) return badge;
    const pf = Number(itemData?.system?.value?.value);
    if (Number.isFinite(pf) && pf > 0) return pf;
    return 1;
  },

  // -----------------------------------------------
  // Bimbomancer Dedication: Stupified → Bimbofied conversion.
  // Called from the preCreateItem hook, AFTER canInterceptStupified said yes.
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

    const stupLevel = AFLP.Kinks._stupefiedLevel(itemData);
    // Get current bimbofied item
    const bimbofiedUUID = AFLP.system.contentUuid("bimbofied") ?? "";

    // DH-native: route by path. Bimbo deepens into Bimbofied; Bull hardens into Bullified.
    const path = worldActor.getFlag(FLAG, "bimbomancerPath") || "bimbo";
    if (AFLP.system?.id === "daggerheart" && path === "bull") {
      const cur = AFLP.cond?.value?.(worldActor, "bullified") ?? 0;
      const dhBull = await AFLP.system.setBullified(worldActor, cur + stupLevel);
      if (dhBull != null) {
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bimbomancer (Bull path) turns Stupefied ${stupLevel} into raw dominance - <strong>Bullified ${dhBull}/3</strong>.</p></div>`,
          speaker: { alias: "AFLP" },
        });
        return true;
      }
    }

    // Bimbo path (and PF2e): Bimbofied is a valued token condition (cap 3), not an item.
    const dhBimbo = await AFLP.system.setBimbofied(worldActor, (AFLP.cond?.value?.(worldActor, "bimbofied") ?? 0) + stupLevel);
    if (dhBimbo != null) {
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bimbomancer Dedication converts Stupefied ${stupLevel} into <strong>Bimbofied ${dhBimbo}/3</strong> (token track; replaces the Defeat spiral while active).</p></div>`,
        speaker: { alias: "AFLP" },
      });
      return true;
    }

    const existing = worldActor.items?.find(i =>
      i.slug === "bimbofied" || (i.flags?.core?.sourceId ?? i.sourceId) === bimbofiedUUID
    );
    const currentLevel = existing?.system?.badge?.value ?? 0;
    // Through capCondition, not a literal: AFLP.CONDITION_CAPS.bimbofied is 3,
    // which is what the card and the journal both say. This line read
    // `Math.min(4, ...)` until 18 Aug 2026 and was the only path that could put
    // a fourth level on the track.
    const newLevel = AFLP.capCondition("bimbofied", currentLevel + stupLevel);

    if (existing) {
      await existing.update({"system.badge.value": newLevel});
    } else {
      await AFLP.system.applyEffect(worldActor, bimbofiedUUID, { badgeValue: newLevel });
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Bimbomancer Dedication converts Stupified ${stupLevel} into ${AFLP.contentLinkText("bimbofied", "Bimbofied")} ${newLevel}.</p></div>`,
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
    const worldActor = AFLP.system.liveActor(actor, tokenId);
    const sexual = worldActor.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? AFLP.sexualDefaults;
    const fetchTypesRaw = (sexual.kinkNotes?.["creature-fetish"] ?? "").toLowerCase().trim();
    if (!fetchTypesRaw) return;
    // Support comma-separated list of types e.g. "giant, aberration"
    const fetchTypes = fetchTypesRaw.split(",").map(t => t.trim()).filter(Boolean);
    if (fetchTypes.length === 0) return;
    // CF arousal gain = the value of the Creature Fetish condition on the actor, not kink level
    const cfCondUuid = AFLP.system.contentUuid("creature-fetish");
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const cfCond = liveActor.items?.find(i =>
      i.slug === "creature-fetish" ||
      (cfCondUuid && (i.flags?.core?.sourceId ?? i.sourceId) === cfCondUuid)
    );
    // PF2e ONLY, AND DELIBERATELY SO. Do not route this through AFLP.cond.
    //
    // This reads the CF value off a condition ITEM's counter badge, so on
    // Daggerheart it is 0 and the whole function returns. Two separate reasons
    // that is correct, both checked against the DH card on 8 Aug 2026:
    //
    //   1. WRONG TRIGGER. The DH Creature Fetish card says "While your fetish
    //      creature type is near, mark 1 Arousal each time you take the
    //      SPOTLIGHT." Daggerheart has no combat turns in PF2e's sense, and
    //      there is no Spotlight hook anywhere in this module - grep confirms
    //      two prose mentions and no listener. Waking this read would fire DH's
    //      rule on PF2e's trigger.
    //   2. WRONG NUMBER. DH marks a flat 1 Arousal; PF2e grants Arousal equal
    //      to the Creature Fetish value.
    //
    // The second read below has the same problem independently: creature type
    // is matched through `system.traits.value`, and DH items carry no traits at
    // all. Fixing either read alone achieves nothing. DH's Signature is
    // currently UNIMPLEMENTED and needs its own Spotlight-triggered build.
    const cfValue = cfCond?.system?.badge?.value ?? 0;
    if (cfValue <= 0) return;
    const token = canvas?.tokens?.get(tokenId) ?? canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id);
    if (!token) return;
    // Check if any nearby token matches ANY of the fetish types
    let matchedType = null;
    canvas?.tokens?.placeables?.some(t => {
      if (t.id === token.id || !t.actor) return false;
      // 30 scene units = Close on a 5ft grid. (DH's own Creature Fetish Signature
      // beat is still unbuilt, and the creature-type read below is dead on DH
      // because DH items carry no system.traits - that is a separate item.)
      if (!AFLP.withinRange(token, t, { pf2e: 30, daggerheart: 30, dnd5e: 30 })) return false;
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
    if ((AFLP.getKinkTier(actor, "aphrodisiac-junkie") ?? 0) < 1) return; // Signature beat
    const liveActor = AFLP.system.liveActor(actor);
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
      const isDom = AFLP.cond.has(pActor, "dominating");
      const isSub = AFLP.cond.has(pActor, "submitting");
      if (isDom || isSub) affected.push(pActor);
    }
    if (!affected.length) return;
    for (const pActor of affected) {
      await AFLP.ensureCoreFlags(pActor);
      await AFLP_Arousal.increment(pActor, 1, `Aphrodisiac Junkie L2 (${actor.name})`, null);
    }
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong>'s aphrodisiac sweat affects ${affected.map(a => a.name).join(", ")} (${AFLP.system.deltaText(1)} each).</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // -----------------------------------------------
  // Turn-start Arousal snapshot.
  //
  // REMOVED: the Dominating (+1) and Submitting (+2) idle Arousal passives that
  // fired at the start of a turn where Arousal had not moved. Standardised on
  // Daggerheart, where the two roles grant no Arousal at all and every point of
  // it comes from a Carnal action. The condition items must be reworded to match.
  //
  // The snapshot itself is kept: it is one flag write, and it is the only record
  // of whether Arousal moved during a turn.
  // -----------------------------------------------
  async onCombatTurnIdleArousal(actor) {
    if (!AFLP.Settings.automation) return;
    const FLAG = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const current = (worldActor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults).current ?? 0;
    await worldActor.setFlag(FLAG, "_arousalAtTurnStart", current);
  },

  // -----------------------------------------------
  // Aphrodisiac Junkie L7 — on cum, Stunned 2 to Dominators/Submitting creatures.
  // -----------------------------------------------
  async onCumAphrodisiacJunkieL7(actor) {
    if (!AFLP.actorHasKink(actor, "aphrodisiac-junkie")) return;
    if ((AFLP.getKinkTier(actor, "aphrodisiac-junkie") ?? 0) < 3) return; // Mastery beat
    const sceneData = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
    if (!sceneData) return;
    const stunned = [];
    for (const p of [...(sceneData.attackers ?? []), { actorId: sceneData.targetActorId }]) {
      const pActor = game.actors?.get(p.actorId ?? p.id);
      if (!pActor || pActor.id === actor.id) continue;
      const isDom = AFLP.cond.has(pActor, "dominating");
      const isSub = AFLP.cond.has(pActor, "submitting");
      if (!isDom && !isSub) continue;
      await AFLP.system.applyNativeCondition(pActor, "stunned", 2);
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
    if ((AFLP.getKinkTier(actor, "cum-slut") ?? 0) < 3) return; // Mastery beat
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
    const worldActor = AFLP.system.liveActor(actor);

    // Purity: a pure heart does not eroticise the ordeal - no Creature Fetish
    // develops when their Mind Break ends.
    if (AFLP.actorHasKink(actor, "purity")) {
      await worldActor.unsetFlag(FLAG, "mbCreatureType").catch(() => {});
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Purity holds through the Mind Break - it ends leaving no Creature Fetish behind.</p></div>`,
        speaker: { alias: "AFLP" },
      });
      return;
    }

    // Creature type was stored when MB was first applied (onMindBreakGained).
    let fetchType = worldActor.getFlag(FLAG, "mbCreatureType") ?? "";
    await worldActor.unsetFlag(FLAG, "mbCreatureType").catch(() => {});

    // Fallback: current H-Scene attackers (covers edge cases where gain hook didn't fire)
    if (!fetchType) {
      const isDH = AFLP.system?.id === "daggerheart";
      const CREATURE_TYPES = new Set(["aberration","animal","beast","celestial","construct","daemon","dragon","elemental","fey","fiend","fungus","giant","humanoid","monitor","ooze","petitioner","plant","spirit","undead"]);
      const hscene = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
      for (const atk of hscene?.attackers ?? []) {
        const atkActor = game.actors?.get(atk.actorId);
        if (!atkActor) continue;
        if (isDH) { fetchType = atkActor.name; break; }
        const traits = atkActor.system?.traits?.value ?? [];
        const match  = traits.find(t => CREATURE_TYPES.has(t)) ?? traits[0];
        if (match) { fetchType = match; break; }
      }
    }

    if (!fetchType) return; // No creature type to assign - nothing to do

    // The Mind Break card: "you gain a level of Creature Fetish equal to your
    // Mind Break value (up to 6)". Six is also the Creature Fetish condition
    // item's own counter badge max, and AFLP.CONDITION_CAPS now carries it - so
    // read it from there rather than keeping a third copy of the number. A local
    // constant here and a cap in the table is exactly how two numbers for one
    // condition drift apart.
    const CF_MAX = AFLP.CONDITION_CAPS?.["creature-fetish"] ?? 6;
    const cfKinkUUID = AFLP.system.contentUuid("creature-fetish");

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

    // Apply or update the Creature Fetish condition
    const liveActor = canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id)?.actor ?? worldActor;
    let cfDisplay;
    if (AFLP.system.id === "daggerheart") {
      // DH: creature-fetish is a binary flag (no token track) - the tracked-token
      // set stays small (Bimbofied / Defeat / Horny only).
      if (!AFLP.cond.has(liveActor, "creature-fetish")) {
        await AFLP.system.applyCondition(liveActor, "creature-fetish", cfKinkUUID, 1);
      }
      cfDisplay = "Creature Fetish";
    } else {
      const existingCF = liveActor.items?.find(i =>
        i.slug === "creature-fetish" ||
        (cfKinkUUID && (i.flags?.core?.sourceId ?? i.sourceId) === cfKinkUUID)
      );
      const currentCFLevel = existingCF?.system?.badge?.value ?? 0;
      const newCFLevel = Math.min(CF_MAX, currentCFLevel + mbLevel);

      if (existingCF) {
        await existingCF.update({ "system.badge.value": newCFLevel });
      } else if (cfKinkUUID) {
        await AFLP.system.applyEffect(liveActor, cfKinkUUID, {
          badgeValue: newCFLevel,
          flagProps: { "flags.core.sourceId": cfKinkUUID },
        });
      }
      cfDisplay = `Creature Fetish ${newCFLevel}`;
    }

    const typeLabel = existingTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Mind Break ends. They gain <strong>${cfDisplay} (${typeLabel})</strong> from their ordeal.</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name}: Mind Break ended at level ${mbLevel}, ${cfDisplay} (${typeLabel}) granted`);
  },

  // Purity L3 — save CF level when Mind Break is gained; restore on removal.
  // -----------------------------------------------
  // Session cache of the last-seen flag Mind Break value per actor id, written by
  // preUpdateActor and consumed by updateActor to detect onset/end transitions on
  // flag-based systems. Not persisted: each update cycle sets its own snapshot.
  _mbPrevByActor: new Map(),
  // Pain Slut: HP snapshot captured in preUpdateActor, consumed in updateActor to
  // detect that damage landed. Also tracks the "once per turn" gate by combat
  // round+turn key so the base beat fires only on the first hit each turn.
  _painPrevByActor: new Map(),
  _painTurnFired: new Map(),   // actorId -> "round.turn" key of last base fire
  _mbFlagValue(actor) {
    return Number(actor?.getFlag?.(AFLP.FLAG_SCOPE, "aflpConditions")?.["mind-break"] ?? 0);
  },

  // GM prompt to choose the creature type a broken actor will fetishize when Mind
  // Break ends. Shared by the PF2e createItem hook and the flag onset handler.
  // Skips if a type is already chosen.
  async _promptMBCreatureType(actor) {
    if (!actor || actor.getFlag(AFLP.FLAG_SCOPE, "mbCreatureType")) return;
    const isDH = AFLP.system?.id === "daggerheart";
    const CREATURE_TYPES = new Set(["aberration","animal","beast","celestial","construct","daemon","dragon","elemental","fey","fiend","fungus","giant","humanoid","monitor","ooze","petitioner","plant","spirit","undead"]);
    // Gather the fetish options from scene attackers. PF2e uses creature TYPES
    // (from traits); Daggerheart has no creature types, so it uses the NAME of
    // the creature(s) that fucked the PC into Mind Break.
    const hscene = AFLP.Settings.hsceneEnabled ? AFLP.HScene._getScene?.(actor.id) : null;
    const available = [];
    for (const atk of hscene?.attackers ?? []) {
      const atkActor = game.actors?.get(atk.actorId);
      if (!atkActor) continue;
      if (isDH) {
        if (atkActor.name && !available.includes(atkActor.name)) available.push(atkActor.name);
      } else {
        const traits = atkActor.system?.traits?.value ?? [];
        for (const t of traits) {
          if (CREATURE_TYPES.has(t) && !available.includes(t)) available.push(t);
        }
      }
    }
    const label = isDH ? "Creature" : "Creature type";

    const chooseType = await new Promise(resolve => {
      // DH: a free text field (creature names are arbitrary), pre-filled with the
      // attacker name(s). PF2e: a dropdown of creature types.
      let fieldHtml;
      if (isDH) {
        const def = available.join(", ");
        fieldHtml = `<input id="aflp-mb-type" type="text" style="flex:1;" value="${def}" placeholder="e.g. Goblin, Owlbear"/>`;
      } else {
        const typeList = available.length ? available : [...CREATURE_TYPES].sort();
        if (typeList.length === 1) { resolve(typeList[0]); return; }
        const optionsHtml = typeList.map(t =>
          `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
        ).join("");
        fieldHtml = `<select id="aflp-mb-type" style="flex:1;">${optionsHtml}</select>`;
      }
      foundry.applications.api.DialogV2.wait({
        window: { title: "Mind Break - Creature Fetish" },
        content: `
          <p style="margin-bottom:8px;">
            <strong>${actor.name}</strong> has broken. Choose the ${isDH ? "creature" : "creature type"}
            they will develop a fetish for when Mind Break ends.
          </p>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="flex-shrink:0;">${label}:</label>
            ${fieldHtml}
          </div>`,
        buttons: [
          {
            action: "ok",
            label: "Confirm",
            default: true,
            callback: (ev, btn, dlg) => resolve((dlg.element.querySelector("#aflp-mb-type")?.value ?? "").trim() || null),
          },
          { action: "none", label: "No Fetish", callback: () => resolve(null) },
        ],
        close: () => resolve(null),
        rejectClose: false,
      });
    });

    if (chooseType) {
      await actor.setFlag(AFLP.FLAG_SCOPE, "mbCreatureType", chooseType);
    }
  },

  onMindBreakGainedPurity(actor) {
    if (!AFLP.actorHasKink(actor, "purity")) return;
    if ((AFLP.getKinkTier(actor, "purity") ?? 0) < 2) return; // Greater beat
    const liveActor = AFLP.system.liveActor(actor);
    const cfItem = liveActor.items?.find(i =>
      i.slug === "creature-fetish" || (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.system.contentUuid("creature-fetish")
    );
    // PF2e ONLY, AND CORRECTLY SO - inert in both directions on Daggerheart.
    //
    // Creature Fetish is a condition ITEM on PF2e, so on DH this finds nothing,
    // saves 0, and onMindBreakEndPurity then returns early with no item to
    // restore. That is not an oversight: the Daggerheart Purity card carries NO
    // Mind Break clause at all. Its three tiers are advantage on Carnal Resists
    // and marking 1 less Arousal while Arousal is 0; a Hope on a successful
    // Resist and 2 Stress cleared for ending a scene unclimaxed; and immunity to
    // being made Exposed or Submitting at Arousal 0. Nothing about Mind Break,
    // nothing about Creature Fetish. Read from the pack 8 Aug 2026. Waking this
    // would give Daggerheart a rule its own card does not state.
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

    // Check actor is still Restrained. DH exposes Restrained as a native token
    // status; PF2e carries it as a condition item; AFLP flag-conditions too.
    // Grabbed is not a DH condition, so Restrained is the single gate.
    const isRestrained = (worldActor.statuses?.has?.("restrained"))
      || (worldActor.items?.some(c => c.slug === "restrained"))
      || (AFLP.system?.hasCondition?.(worldActor, "restrained") ?? false);
    if (!isRestrained || stickyData.remaining <= 0) {
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
    if ((AFLP.getKinkTier(actor, "purity") ?? 0) < 2) return; // Greater beat
    const liveActor = AFLP.system.liveActor(actor);
    const savedCFLevel = liveActor.getFlag(AFLP.FLAG_SCOPE, "puritySavedCFLevel");
    if (savedCFLevel === undefined) return;
    await actor.unsetFlag(AFLP.FLAG_SCOPE, "puritySavedCFLevel");
    const cfItem = liveActor.items?.find(i =>
      i.slug === "creature-fetish" || (i.flags?.core?.sourceId ?? i.sourceId) === AFLP.system.contentUuid("creature-fetish")
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

// Stretch King measures the SIZE GAP, not creature size.
//
// The card predated the size difference system and asked "is the target a smaller
// size category". That is PF2e's ladder, and Daggerheart PCs do not populate it -
// measured 7 Aug, all six DH player characters are `system.size: null` on a 1x1
// token, so every one of them is Medium forever. The comparison also failed OPEN:
// both sides took a "med" default, so `(2 + offset) > 2` was always TRUE at
// Greater and Mastery and a Medium PC read as larger than a Gargantuan.
//
// The gap asks the better question and asks it identically in every system:
//   AFLP.sizeGap(source, receiver, hole) = clamp(0..3, cockSizeOf - holeSizeOf)
// reading 1/2/3 as Stuffed / Stretched / Ruined.
//
// THE OFFSET IS ALREADY INSIDE THE GAP. `AFLP.cockSizeOf` adds +1 at level 5 and
// +2 at level 8 for this kink, and cock size is what `sizeGap` subtracts from.
// The old `_skVirtualOffset` helper was a SECOND copy of that bonus, applied to
// the creature-size comparison. Both are deleted deliberately: reintroducing an
// offset here would grant it twice and put every Mastery holder two gap tiers up.
//
// Body size still matters, emergently - cockSizeOf starts from bodySizeSteps, so
// a big creature still out-sizes a small one without anyone comparing categories.
// Two behaviours fall out of the gap that creature size could never express: a
// hole trained up to your size stops triggering the kink (holeSizeOf counts the
// trained Body Feature), and `Ass (Stretchy)` never triggers it at all, because
// sizeGap returns 0 for a body that gives to whatever is put in it.

// Resolve the gap for the source's live penile position in their current scene.
// Returns 0 when there is no scene, no penile position, or nothing to stretch.
function _skSceneGap(actor, tokenId = null) {
  try {
    if (!AFLP.Settings.hsceneEnabled || !AFLP.HScene?._getScene) return 0;
    const scene = AFLP.HScene._getScene(actor.id);
    if (!scene) return 0;
    const tToken = canvas?.tokens?.get(scene.targetId);
    const target = tToken?.actor ?? game.actors?.get(scene.targetActorId);
    if (!target) return 0;
    const part = (scene.participants ?? []).find(p => p.tokenId === (tokenId ?? scene.sourceTokenId));
    const posEntry = AFLP.getPosition?.(part?.position ?? scene.position);
    const hole = posEntry?.hole ?? posEntry?.holeId;
    if (!posEntry?.penile || !hole) return 0;
    const live = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    return AFLP.sizeGap(live, target, hole) || 0;
  } catch (e) { return 0; }
}

Object.assign(AFLP.Kinks, {

  // Signature: -2 circumstance on the Edge check when cumming inside a hole your
  // cock is too big for. Gap 1 or more - Stuffed, Stretched or Ruined.
  // Returns { dcModifier, label } or null.
  getStretchKingEdgePenalty(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "stretch-king")) return null;
    const gap = _skSceneGap(actor, tokenId);
    if (gap < 1) return null;
    const word = AFLP.gapLabel?.(gap)?.word ?? "";
    return { dcModifier: +2, label: `Stretch King (${word.toLowerCase()} hole, size gap ${gap} - -2 circumstance on Edge)` };
  },

  // Signature payout, called from AFLP.sizeGapOnAct on a landed penetrative act.
  //
  // The stretch itself is ALREADY paid by the size difference system - sizeGapOnAct
  // sets extraTarget 1 for any gap, which is exactly "the stretch marks them 1
  // Arousal". This kink does not grant that a second time. What it adds is the
  // Horny token on the source, and at Mastery it raises the stretch to 2 - the
  // card says "instead", so it REPLACES the 1 rather than stacking with it.
  //
  // Returns the Arousal the target should take, for sizeGapOnAct to apply.
  async onSizeGapStretchKing(sourceActor, gap = 0) {
    if (!sourceActor || gap < 1) return null;
    if (!AFLP.actorHasKink(sourceActor, "stretch-king")) return null;
    const worldActor = AFLP.system.liveActor(sourceActor);
    const hornyNow = await AFLP.horny.add(worldActor, 1);
    const mastery = (AFLP.getKinkLevel?.(sourceActor, "stretch-king") ?? 0) >= 8;
    return { arousal: mastery ? 2 : 1, horny: hornyNow, mastery };
  },

  // Post-cum GM reminder that the Bonus Loads grant should be on the sheet.
  //
  // Gated on the size gap now, not creature size, and on the card's real levels:
  // Greater is 5 and Mastery is 8. It previously read 3 and 7, so it nagged two
  // levels early at Greater and one early at Mastery, and quoted "Loads 3" and a
  // cap of 6 against a card that grants Bonus Loads 3 then Bonus Loads 10.
  //
  // The grant itself is CONTENT, not code - the card links the Bonus Loads item
  // and AFLP.effectiveLoads sums its `loadsBonus` flag. This only reminds a GM to
  // apply it; if it reads as noise, retiring it loses no mechanics.
  async onCumStretchKing(actor, tokenId = null) {
    if (!AFLP.actorHasKink(actor, "stretch-king")) return;
    const lvl = AFLP.getKinkLevel(actor, "stretch-king");
    if (lvl < 5) return;
    if (_skSceneGap(actor, tokenId) < 1) return;
    const liveActor = canvas?.tokens?.get(tokenId)?.actor ?? actor.token?.actor ?? actor;
    const bonus = lvl >= 8 ? 10 : 3;
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong>'s Stretch King: confirm <strong>Bonus Loads ${bonus}</strong> is on the sheet.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

});

// The Signature adjacency payout ("adjacent to a smaller creature, gain Horny 1")
// was RETIRED on 7 August 2026 along with its combatTurnChange hook. It could not
// be expressed as a size gap - there is no penetration to measure - it was the
// clause that produced the failing-open creature-size bug, and a per-turn movement
// hook is the shape this project prefers to delete rather than fix. Do not
// reinstate it without a rule the gap can answer.

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
// (core Fascinated retired from the hypnosis path - Entranced replaced it
// everywhere; constant kept for reference only)
// const _HS_FASC_UUID = "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg";
const _HS_STUP_UUID = window.AFLP?.sysUuid?.("Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg") ?? "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg";
const _HS_SLUG      = "hypno-slave";

// True while the creature is held at ANY depth of the hypnosis ladder:
// Entranced -> Hypnotized -> Persona Overridden. Each stage replaces the last, so a
// check for one specific stage silently misses the others.
const _underMindHold = (actor) => {
  if (!actor) return false;
  if (AFLP.cond.has(actor, "entranced")) return true;
  if (AFLP.cond.has(actor, "hypnotized")) return true;
  if (AFLP.cond.has(actor, "persona-overridden")) return true;
  return !!actor.items?.some?.(i =>
    i.slug === "persona-overridden" || /^Persona Overridden$/i.test(i.name ?? ""));
};
const _HS_MAX       = 3; // condensed from 7 (stages merged 1+2 / 3+5 / 7)

// Hard level-based DC for the conditioning creature (PF2e GM Core table +2).
// The item prose says "a Will save against a hard DC for your conditioner's
// level"; chat cards compute the number when the conditioner is known.
const _HS_DC_BY_LEVEL = [14,15,16,18,19,20,22,23,24,26,27,28,30,31,32,34,35,36,38,39,40,42,44,46,48,50];
function _hsHardDC(worldActor) {
  try {
    // FLAG_SCOPE is "world", never the module id - this read was ALWAYS undefined,
    // on both forks. Verified live: written under "world", read under the module id.
    const condId = worldActor.getFlag(AFLP.FLAG_SCOPE, "hypnoConditionerId");
    const cond = condId ? game.actors.get(condId) : null;
    const lvl = cond?.system?.details?.level?.value ?? cond?.system?.levelData?.level?.current ?? null;
    if (lvl === null) return null;
    return (_HS_DC_BY_LEVEL[Math.max(0, Math.min(25, lvl))] ?? 40) + 2;
  } catch (e) { return null; }
}
function _hsDCText(worldActor) {
  const dc = _hsHardDC(worldActor);
  return dc !== null ? `Will DC ${dc} (hard, conditioner's level)` : "a Will save against a hard DC for the conditioner's level";
}

function _hsItem(actor) {
  return actor.items?.find(i =>
    i.slug === _HS_SLUG ||
    i.getFlag?.(AFLP.MODULE_ID, "aflrKey") === _HS_SLUG ||
    /^Hypno Slave$/i.test(i.name ?? "") ||
    (i.flags?.core?.sourceId ?? i.sourceId) === "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC"
  ) ?? null;
}
// Counter storage lives in a per-actor module flag (sexual.hypnoSlaveCount) so it
// works in every system - PF2e and DH back the kink with an ITEM (carrying a
// system.badge), but 5e's condition model is flag-backed with no item at all, so
// the count cannot live on an item. Reads fall back to the legacy per-item badge so
// existing PF2e/DH conditioning survives the switch; writes set the actor flag AND
// mirror into the item badge wherever an item still exists (keeps the PF2e/DH sheet
// display in step). The presence flag (sexual.kinks["hypno-slave"]) is separate and
// unchanged.
function _hsGet(actor) {
  const wa = actor?.getWorldActor?.() ?? actor;
  const f = wa?.getFlag?.(AFLP.FLAG_SCOPE, "sexual")?.hypnoSlaveCount;
  if (typeof f === "number") return f;
  return _hsItem(actor)?.system?.badge?.value ?? 0;
}
async function _hsSet(actor, n) {
  const wa = actor?.getWorldActor?.() ?? actor;
  const sx = foundry.utils.duplicate(wa.getFlag(AFLP.FLAG_SCOPE, "sexual") ?? {});
  sx.hypnoSlaveCount = n;
  await wa.setFlag(AFLP.FLAG_SCOPE, "sexual", sx);
  const item = _hsItem(actor);
  if (item && item.system?.badge !== undefined) {
    try { await item.update({ "system.badge.value": n }); } catch (e) { /* systems without a badge field */ }
  }
}
function _hsCounters(actor) {
  return _hsGet(actor);
}
function _hsUnlockLabel(n) {
  if (n >= 3) return "Stage 3: total conditioning - Persona Overridden, bodyguard instinct, Mind Break immunity.";
  if (n >= 2) return "Stage 2: Stupefied 1, memory suppression, trigger-word personas.";
  if (n >= 1) return "Stage 1: active conditioning - Will penalty, no hostility toward the conditioner.";
  return "";
}

Object.assign(AFLP.Kinks, {

  // Increment counter after successful Hypnosis (the ability formerly named Induction). amount=1 for Failure, 2 for Critical Failure.
  async incrementHypnoSlave(targetActor, conditionerActorId, amount = 1) {
    if (!targetActor) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    // ONE instance, not two. These were a world-actor read and a token-actor
    // read of the same creature, so the kink flag and the counter item could
    // land on different stores for an unlinked mook. `.find(t => t.actor?.id
    // === targetActor.id)` was also wrong on its own terms: an unlinked token
    // actor's id EQUALS its base actor's, so it matched an arbitrary token of
    // that prototype rather than this one.
    const worldActor = AFLP.system.liveActor(targetActor);
    const liveActor  = worldActor;

    // Set kink presence flag
    const sexual = worldActor.getFlag(FLAG, "sexual") ?? {};
    if (!sexual.kinks) sexual.kinks = {};
    sexual.kinks[_HS_SLUG] = true;
    await worldActor.setFlag(FLAG, "sexual", sexual);
    if (conditionerActorId) await worldActor.setFlag(FLAG, "hypnoConditionerId", conditionerActorId);

    let hsItem = _hsItem(liveActor);
    const current = _hsGet(liveActor);

    if (!hsItem) {
      // Resolve per system: contentUuid returns this world's tagged copy (or the
      // canonical fallback). The old hardcoded PF2e UUID resolves in PF2e/DH but
      // not in 5e, whose condition model is flag-backed with no item. Item creation
      // is now NON-FATAL: 5e has no Hypno Slave item, but the counter lives on the
      // actor flag and the ladder conditions apply via cond.apply, so the whole
      // ladder must still run when there is no item to create.
      const _hsUuid = AFLP.system.contentUuid?.("hypno-slave")
        ?? "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.naEmpTaaGI3qYAeC";
      try {
        const created = await AFLP.system.applyEffect(liveActor, _hsUuid);
        if (created && created[0]) hsItem = created[0];
      } catch (e) { /* fall through - tracked on the actor flag */ }
      if (!hsItem) console.warn("AFLP | Hypno Slave: no effect item for this system - tracking the counter on the actor flag only.");
    }

    if (current >= _HS_MAX) {
      await ChatMessage.create({ content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave conditioning is at maximum (${_HS_MAX} / ${_HS_MAX}).</p></div>`, speaker: { alias: "AFLP" } });
      return;
    }
    const newCount = Math.min(current + amount, _HS_MAX);
    await _hsSet(liveActor, newCount);

    // The ladder is real, not prose. Stage 1 says "you are Hypnotized by your
    // conditioner permanently"; stage 3 says "permanently under Persona
    // Overridden". Neither was ever applied - both texts were fiction.
    //
    // Each stage OVERRIDES the last: Hypno Slave subsumes Hypnotized, which
    // subsumes Entranced. Never show two at once.
    try {
      if (newCount >= 1) {
        // Hypnotized replaces any shallower hold.
        if (!AFLP.cond.has(liveActor, "hypnotized")) {
          await AFLP.cond.apply(liveActor, "hypnotized", 1);
          await AFLP.bumpMindLadder(liveActor, "timesHypnotized");
          const _cn = conditionerActorId ? game.actors?.get(conditionerActorId) : null;
          if (_cn && _cn.id !== worldActor.id) await AFLP.bumpLifetime(_cn, "mindsHypnotized");
        }
        if (AFLP.cond.has(liveActor, "entranced")) await AFLP.cond.remove(liveActor, "entranced");
        // Keep the entrancer link pointed at the conditioner so Hypnotized's
        // predicated save penalty resolves against them.
        if (conditionerActorId) {
          const _c = game.actors?.get(conditionerActorId);
          await worldActor.setFlag(FLAG, "entrancedBy", conditionerActorId).catch(() => {});
          if (_c?.signature) await worldActor.setFlag(FLAG, "entrancerSignature", _c.signature).catch(() => {});
        }
      }
      if (newCount >= _HS_MAX) {
        // Stage 3: the persona is theirs. Persona Overridden replaces Hypnotized.
        // Apply through cond.apply so every system's model is honoured: PF2e/DH get
        // the effect item, 5e flag-backs it (its conditions have no items). Presence
        // is checked with cond.has for the same reason - an items.some() test only
        // ever sees the PF2e/DH item and would re-fire forever in 5e.
        const _has = AFLP.cond.has(liveActor, "persona-overridden");
        if (!_has) {
          await AFLP.cond.apply(liveActor, "persona-overridden", 1);
          await AFLP.bumpMindLadder(liveActor, "timesEnslaved");
          const _cn = conditionerActorId ? game.actors?.get(conditionerActorId) : null;
          if (_cn && _cn.id !== worldActor.id) await AFLP.bumpLifetime(_cn, "mindsEnslaved");
        }
        if (AFLP.cond.has(liveActor, "hypnotized")) await AFLP.cond.remove(liveActor, "hypnotized");
      }
    } catch (e) { console.warn("AFLP | Hypno Slave condition ladder:", e?.message); }

    const unlockMsg = (newCount >= 1 && newCount <= _HS_MAX)
      ? `<br><em style="color:#c9a96e;">${_hsUnlockLabel(newCount)}</em>` : "";
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave counter: <strong>${newCount} / ${_HS_MAX}</strong>.${unlockMsg}</p></div>`,
      speaker: { alias: "AFLP" },
    });
    console.log(`AFLP | ${worldActor.name} Hypno Slave: ${current} → ${newCount}`);
  },

  // Combat turn (condensed 1/2/3 ladder): Horny 1 (stage 1+), Stupefied/mind-fog
  // (stage 2+), protection instinct (stage 3).
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
      // 60 scene units = 12 squares on a 5ft grid = Far, per the DH core rules.
      if (AFLP.withinRange(myToken, condToken, { pf2e: 60, daggerheart: 60, dnd5e: 60 })) {
        const _hsBefore = AFLP.horny.total(worldActor);
        await AFLP.horny.add(worldActor, 1);
        if (AFLP.horny.total(worldActor) > _hsBefore) {
          await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave (stage ${counters}): within 60ft of conditioner - <strong>Horny 1</strong>.</p></div>`,
            speaker: { alias: "AFLP" },
          });
        }
      }
    }

    // Stage 2+: mind-fog. PF2e applies Stupefied 1; DH has no Stupefied, so
    // the conditioning fogs the mind into Bimbofied instead (spirit-ported - the
    // same dazed, pliable state the Bimbomancer mapping uses). (Was stage 3 pre-
    // condense; his prose puts Stupefied at stage 2.)
    if (counters >= 2) {
      if (AFLP.system.id === "daggerheart") {
        if ((AFLP.cond?.value?.(liveActor, "bimbofied") ?? 0) < 1) {
          await AFLP.system.setBimbofied(liveActor, 1);
          await ChatMessage.create({
            content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s conditioning (stage ${counters}): the fog sets in - <strong>Bimbofied 1</strong>.</p></div>`,
            speaker: { alias: "AFLP" },
          });
        }
      } else {
        const hasStup = liveActor.items?.some(i =>
          i.slug === "stupefied" || (i.flags?.core?.sourceId ?? i.sourceId) === _HS_STUP_UUID
        );
        if (!hasStup) {
          const created = await AFLP.system.applyEffect(liveActor, _HS_STUP_UUID, { systemMerge: { value: 1 } }).catch(() => null);
          if (created) {
            await ChatMessage.create({
              content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s conditioning (stage ${counters}): <strong>Stupefied 1</strong> reapplied.</p></div>`,
              speaker: { alias: "AFLP" },
            });
          }
        }
      }
    }

    // Stage 3: Protection instinct (was counter 7 pre-condense - the old gate
    // was unreachable with _HS_MAX 3)
    if (counters >= 3 && condToken && myToken) {
      const condUnderAttack = worldActor.getFlag(FLAG, "_hypnoConditionerUnderAttack");
      if (condUnderAttack) {
        await worldActor.setFlag(FLAG, "_hypnoConditionerUnderAttack", false);
        await ChatMessage.create({
          content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s Hypno Slave (stage 3): ${condToken.name} is under attack - <strong>${_hsDCText(worldActor)}</strong> or spend all actions shielding them.</p></div>`,
          speaker: { alias: "AFLP" },
        });
      }
    }
  },

  // GM-called: fires Trigger Word effects (speed 0, Entranced, 3 Arousal).
  async onTriggerWordHypnoSlave(actor, trigger) {
    if (!AFLP.Settings.automation) return;
    const FLAG       = AFLP.FLAG_SCOPE;
    const worldActor = actor.getWorldActor?.() ?? actor;
    const liveActor  = AFLP.system.liveActor(actor);
    const counters   = _hsCounters(actor);
    await worldActor.setFlag(FLAG, "_hypnoTriggerConsumed", true);
    // Both systems now use OUR Entranced condition (PF2e item created in the
    // hypno-condition pass; core Fascinated retired from this path - Entranced
    // carries the sink rule, Fascinated carries nothing).
    if ((AFLP.cond?.value?.(liveActor, "entranced") ?? 0) < 1) {
      // Same contract as every other entrance. AFLP.entrance stamps the condition,
      // entrancedBy, entrancerSignature, hypnoConditionerId and mindHoldDC, bumps
      // the lifetime counter, and refuses to regress a deeper hold. Hand-rolling
      // this is how a caller ends up forgetting one flag and quietly breaking a
      // different part of the ladder.
      const _condId = worldActor.getFlag(FLAG, "hypnoConditionerId");
      const _cond   = _condId ? game.actors?.get(_condId) : null;
      if (_cond) await AFLP.entrance(_cond, liveActor, _hsHardDC(worldActor));
    }
    await AFLP.ensureCoreFlags(liveActor);
    const gain = await AFLP_Arousal.increment(liveActor, 3, "Hypno Trigger Word", null);
    const condToken = canvas?.tokens?.placeables?.find(t => t.actor?.id === worldActor.getFlag(FLAG, "hypnoConditionerId"));
    await ChatMessage.create({
      content: `<div class="aflp-chat-card">
        <p><strong>${worldActor.name}</strong>'s Hypno Slave conditioning (stage ${counters}): Trigger Word - moved away from ${condToken?.name ?? "conditioner"}!</p>
        <ul style="margin:4px 0 4px 16px">
          <li>Speed reduced to 0 for this move <em>(apply manually)</em></li>
          <li>${AFLP.contentLinkText("entranced", "Entranced", AFLP.conditions?.entranced?.uuid)} for 1 round</li>
          <li>${AFLP_Arousal.gainBreakdownText(gain, 3)}</li>
        </ul>
        <p><em>${_hsDCText(worldActor)} to resist. Trigger spent until next daily prep.</em></p>
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
    // The mind-hold at ANY depth. Originally gated on core "fascinated" (which the
    // hypnosis path stopped applying, so it was dead). I then gated it on Entranced
    // - but the Hypno Slave ladder replaces Entranced with Hypnotized at stage 1
    // and with Persona Overridden at stage 3, so that could never open either, and
    // this benefit needs counter >= 3 to reach.
    //
    // Read the whole ladder: any of the three means they are held.
    if (!_underMindHold(liveActor)) return;
    const afterglowUUID = AFLP.system.contentUuid("afterglow") ?? "";
    const ag = liveActor.items?.find(i =>
      i.slug === "afterglow" || (i.flags?.core?.sourceId ?? i.sourceId) === afterglowUUID
    );
    if (ag) await ag.delete().catch(() => {});
    await AFLP.ensureCoreFlags(actor);
    const gain = await AFLP_Arousal.increment(actor, 1, "Hypno Slave (trance orgasm)", tokenId);
    await worldActor.setFlag(FLAG, "_hypnoSlaveL3Used", true);
    const counters = _hsCounters(actor);
    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${worldActor.name}</strong>'s conditioning (stage ${counters}): orgasm within trance - Afterglow suppressed, ${AFLP_Arousal.gainBreakdownText(gain, 1)}.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

});

// Hypno Slave combat turn hook
Hooks.on("combatTurnChange", async (combat, _prior, current) => {
  if (!game.user.isGM) return;
  const combatant = combat.combatants.get(current.combatantId);
  if (!combatant?.actor) return;
  const actor = AFLP.system.liveActor(combatant.actor, combatant.tokenId ?? null);
  await AFLP.Kinks.onCombatTurnHypnoSlave?.(actor, combatant.tokenId ?? null);
});

console.log("AFLP | Hypno Slave automation loaded (counter-based).");
