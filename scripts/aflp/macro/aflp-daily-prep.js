// ===============================
// AFLP – Daily Prep Macro
// ===============================
// Performs daily reset & upkeep for selected actors:
// - Ensures AFLP core flags exist
// - Resets arousal
// - Refills cum based on size + coomer level
// - Advances pregnancy timers by 1 day
// - Automatically records births when gestation completes (single chat message)
// ===============================

if (!window.AFLP) {
  // The module script defines window.AFLP at init; if it is missing the module
  // is not active in this world - there is no macro to bootstrap it from.
  ui.notifications.error("AFLR schema not loaded - enable the module and reload.");
  return;
}

const FLAG = AFLP.FLAG_SCOPE;
// A programmatic run - e.g. auto-fired by a Daggerheart Long Rest - hands the
// actor in via a global so we don't depend on the GM's on-screen token selection.
const _autoActor   = window._aflpDailyPrepActor   ?? null;
window._aflpDailyPrepActor   = null;
window._aflpDailyPrepContext = null;
const tokens = _autoActor ? [{ actor: _autoActor }] : canvas.tokens.controlled;
if (!tokens.length) return ui.notifications.warn("Select at least one token.");

for (const { actor } of tokens) {
  await AFLP.ensureCoreFlags(actor);

  // Reset arousal (preserve maxBase, reset current to 0)
  const arousal = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
  arousal.current = 0;
  await actor.setFlag(FLAG, "arousal", arousal);

  // Denied settles to its floor on full rest (daily preparations). It used to
  // write `{value: 0}` straight onto the legacy bag, which cleared nothing on
  // Daggerheart and wiped a sustained floor - a chastity harness still worn -
  // everywhere else.
  const _dFloor = AFLP.denied.permanent(actor);
  if (AFLP.denied.total(actor) > _dFloor) await AFLP.denied.settleTo(actor);

  // Bimbofied: decays by 1 at daily preparations if no sex in the last in-world day.
  // When it reaches 0, the condition item is deleted (no minimum).
  // Bimbomancer Dedication prevents all decay.
  // Like, Ohmigawd! raises the floor to 2.
  // We track "had sex" via the partnerHistory — if the most recent entry is within
  // the last in-world day (86400 seconds), sex occurred.
  //
  // PF2e ONLY, AND DELIBERATELY SO. This finds Bimbofied by `slug`, which
  // Daggerheart items do not have, and reads its counter badge, which they do
  // not carry either - so on DH the whole block is inert. Do NOT "fix" that.
  // Daggerheart already decays Bimbofied and Bullified at its long rest
  // (`aflp-rest.js` `_decayToken`), and that same rest path then EXECUTES this
  // macro. Routing this read through the adapter would decay twice a night.
  // Confirmed dead-by-design in the phase 2 system.badge sweep, 8 Aug 2026.
  const bimbofiedItem = actor.items?.find(i => i.slug === "bimbofied");
  if (bimbofiedItem) {
    // Bimbomancer Dedication: Bimbofied never decays
    const isBimbomancer = actor.getFlag(FLAG, "bimbomancerDedication") === true;
    // Like, Ohmigawd!: Bimbofied minimum 2
    const bimboFloor = actor.getFlag(FLAG, "likeOhmigawd") ? 2 : 0;

    if (!isBimbomancer) {
      const history = actor.getFlag(FLAG, "partnerHistory") ?? [];
      const now = game.time.worldTime;
      const dayInSeconds = 86400;
      const hadSexToday = history.some(e => (now - (e.date ?? 0)) < dayInSeconds);
      if (!hadSexToday) {
        const currentLevel = bimbofiedItem.system?.badge?.value ?? 1;
        const newLevel = currentLevel - 1;
        if (newLevel <= bimboFloor) {
          if (bimboFloor > 0) {
            await bimbofiedItem.update({ "system.badge.value": bimboFloor });
          } else {
            await bimbofiedItem.delete().catch(() => {});
          }
        } else {
          await bimbofiedItem.update({ "system.badge.value": newLevel });
        }
      }
    } else if (bimboFloor > 0) {
      // Bimbomancer with Ohmigawd floor — enforce minimum even if not decaying
      const currentLevel = bimbofiedItem.system?.badge?.value ?? 1;
      if (currentLevel < bimboFloor) {
        await bimbofiedItem.update({ "system.badge.value": bimboFloor });
      }
    }
  }

  // Reset temp Horny — clears on daily preparations; permanent Horny persists.
  const _hFloor = AFLP.horny.permanent(actor);
  if (AFLP.horny.total(actor) > _hFloor) {
    await AFLP.horny.clearTemp(actor);
  }

  // Cum refill — use schema values via recalculateCum.
  // PINEAPPLE DIET. THE CARD IS THE SPEC: "You gain a number of Loads equal to
  // your character level. This is your natural baseline: however many Loads you
  // spend, your daily preparations refill you to at least this many."
  //
  // This feat is the ONE thing that ties a PC's Loads to their level - Ardis's
  // ruling, 5 Sept 2026. Tier scaling is for adversaries (see
  // AFLP.defaultLoadsForActor); a PC without this feat gains no Loads from
  // levelling at all.
  //
  // DETECTED BY CONTENT KEY, and it has to be. This read `i.slug` with the PF2e
  // uuid as its only fallback: Daggerheart items have NO slug, and the DH
  // Pineapple Diet is a different document, so both arms failed and the feat did
  // nothing whatsoever on Daggerheart. Measured in dh-test 5 Sept 2026 - a level
  // 7 character carrying it came out of this macro unchanged. The absence of a
  // system gate is not the same thing as working on both systems.
  //
  // SET, NOT FLOOR. It used to only ever raise, so Loads climbed with level and
  // never came back down - reported by Ardis after levelling a character down.
  // Setting is only safe now that size training writes `coomer.trained` instead
  // of the base (see AFLP.effectiveLoads); before that, lowering the base would
  // have thrown away training this code cannot tell apart from the feat's own
  // number.
  //
  // FLOORED AT SIX, which is the baseline plus two. This is a LEVEL 1 general
  // skill feat with no prerequisites, and "Loads equal to your character level"
  // is worth nothing until level 5 against a baseline of 4 - four dead levels on
  // a feat you can take at first. Ardis's ruling, 5 Sept 2026: floor it two
  // above baseline, and the card reads "set to your character level or 6,
  // whichever is higher". LOADS_BASE + 2 rather than a literal 6 so the two
  // move together if the baseline ever does; if you change one, change the card.
  //
  // The defaultLoadsForActor term keeps an ADVERSARY carrying this feat from
  // being pulled DOWN to 6 from its tier baseline - it only ever raises them.
  // For a PC, whose baseline is the flat 4, it resolves to exactly the card's 6.
  //
  // The GM's `coomer.bonus` and training's `coomer.trained` are untouched and
  // add on top of whatever this writes.
  //
  // Stale if the card stops saying "your character level or 6, whichever is
  // higher", or if AFLP.LOADS_BASE moves without the card following.
  const hasPineappleDiet = actor.items?.some(i =>
    i.getFlag?.("ardisfoxxs-lewd-pf2e", "aflrKey") === "pineapple-diet" ||
    i.slug === "pineapple-diet"
  );
  if (hasPineappleDiet) {
    const pdFloor = Math.max(AFLP.defaultLoadsForActor(actor), AFLP.LOADS_BASE + 2);
    const pdBase  = Math.max(pdFloor, AFLP.actorLevel(actor));
    const coomer  = structuredClone(actor.getFlag(FLAG, "coomer") ?? AFLP.coomerDefaults);
    if ((coomer.level ?? 0) !== pdBase) {
      coomer.level = pdBase;
      await actor.setFlag(FLAG, "coomer", coomer);
    }
  }

  await AFLP.recalculateCum(actor);


  // -------------------------------
  // Pregnancy progression & auto-birth
  // -------------------------------
  const pregnancies = structuredClone(await actor.getFlag(FLAG, "pregnancy") ?? {});
  const anyBirths = [];

  for (const [pregId, preg] of Object.entries(pregnancies)) {
    if (typeof preg.gestationRemaining !== "number") continue;
    preg.gestationRemaining -= 1;

    if (preg.gestationRemaining <= 0) {
      // recordBirth writes directly to the actor flag and handles its own save
      await AFLP_Pregnancy.recordBirth(actor, pregId, { suppressChat: true });
      preg.gestationRemaining = "Complete";
      anyBirths.push(preg);
    }
  }

  // Save the locally-advanced pregnancy data
  // Note: only non-birth entries need saving here; recordBirth already wrote birth entries
  // We save the full object to capture gestationRemaining decrements on non-complete pregnancies
  await actor.setFlag(FLAG, "pregnancy", pregnancies);

  // Brood Sow kink: remove Endurance if no active pregnancies remain after today's gestation tick
  if (AFLP.Settings.automation && AFLP.Kinks?.removeBroodSowEndurance) {
    const updatedPregnancies = actor.getFlag(FLAG, "pregnancy") ?? {};
    const stillActive = Object.values(updatedPregnancies).some(p => p.gestationRemaining !== "Complete");
    if (!stillActive) await AFLP.Kinks.removeBroodSowEndurance(actor);
  }

  // Hypno Slave kink: reset once-per-day flags.
  if (AFLP.actorHasKink?.(actor, "hypno-slave")) {
    await actor.setFlag(FLAG, "_hypnoSlaveL3Used",            false);
    await actor.setFlag(FLAG, "_hypnoTriggerConsumed",        false);
    await actor.setFlag(FLAG, "_hypnoConditionerUnderAttack", false);
  }

  // Alcumist Dedication: calculate and display vial count for today.
  // 1 load = 1 vial, so daily vials = the actor's Coomer (loads).
  const ALCUMIST_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xdklOfDJHXLwZf31";
  const hasAlcumist = actor.items?.some(i =>
    i.slug === "alcumist-dedication" ||
    (i.flags?.core?.sourceId ?? i.sourceId) === ALCUMIST_UUID
  );
  if (hasAlcumist) {
    const coomerV = actor.getFlag(FLAG, "coomer") ?? AFLP.coomerDefaults;
    // Half your Loads, floored at 1 and capped - see AFLP.alcumy.allowance.
    const vialCount = await AFLP.alcumy.refresh(actor);
  }

  // -------------------------------
  // Size Training: decay 1 pip per hole on rest; offer to shed unlocks that
  // have decayed to baseline (Body Feature per hole, then the kink once every
  // hole is baseline). Shedding is player choice - nothing is stripped silently.
  // -------------------------------
  let _sizeRestMsg = "";
  // PF2e Size Difference (Greater) is once per session; daily preparations is
  // the session boundary, so the used-flag resets here.
  if (actor.getFlag(FLAG, "sizeGreaterUsed")) {
    await actor.unsetFlag(FLAG, "sizeGreaterUsed").catch(() => {});
  }
  if (AFLP.restSizeTraining) {
    const rest = await AFLP.restSizeTraining(actor);
    if (rest.decayed.length) {
      _sizeRestMsg = `<br>Size Training relaxes overnight: ` +
        rest.decayed.map(d => `${d.hole} ${d.from}->${d.to}`).join(", ") + ".";
    }
    // Offer shedding for any Body Feature now at 0 pips.
    for (const hole of rest.shedFeatures) {
      const feat = AFLP.BODY_FEATURES?.[hole]?.name ?? hole;
      const keep = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Body Feature Faded?" },
        content: `<p><strong>${actor.name}</strong>'s ${hole} has relaxed all the way back to untrained. Keep the <strong>${feat}</strong> Body Feature, or let it fade back to normal?</p>`,
        yes: { default: true },
        rejectClose: false,
      });
      if (keep === false) {
        await AFLP.shedBodyFeature(actor, hole);
        _sizeRestMsg += `<br>${feat} has faded - ${hole} returns to its natural size.`;
      }
    }
    // Offer to shed the kink once no Body Features remain. Re-READ rather than
    // calling restSizeTraining again - that function DECAYS every track, and
    // calling it twice per rest took two pips off a journal that promises one.
    // The chat card above reports the FIRST call's from->to numbers, so the
    // second pip never appeared anywhere on screen.
    //
    // Bare call, not optional: a phantom here would answer "no" forever and the
    // kink would silently never become sheddable.
    if (AFLP.canShedSizeKink(actor)) {
      const keepKink = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Size Difference Fades?" },
        content: `<p><strong>${actor.name}</strong> is fully untrained again. Keep the <strong>Size Difference</strong> kink, or let the craving fade?</p>`,
        yes: { default: true },
        rejectClose: false,
      });
      if (keepKink === false) {
        await AFLP.shedSizeDifferenceKink(actor);
        _sizeRestMsg += `<br>The craving for size fades - Size Difference is gone.`;
      }
    }
  }

  // -------------------------------
  // Chat summary
  // -------------------------------
  // Daggerheart has no daily preparations - the same upkeep renews on a Long Rest,
  // so the summary speaks to the rest rather than to a daily prep.
  const _dhRest = AFLP.system?.id === "daggerheart";
  let message = _dhRest
    ? `<strong>${actor.name}</strong>'s AFLR effects renew after their Long Rest.`
    : `<strong>${actor.name}</strong> ${AFLP.system.dailyResetText?.() ?? "completes daily preparations"}.`;
  for (const b of anyBirths) {
    const sourceName = b.sourceName || "Unknown";
    const type = b.deliveryType === "egg" ? "eggs" : "offspring";
    const count = b.offspring ?? 1;
    message += `<br>${actor.name} gave birth to ${count} ${type} fathered by <strong>${sourceName}</strong>!`;
  }

  // Gear with moving parts burns lubricant. See AFLP.chastityGear. Placed after
  // `message` is declared - an earlier insert threw a temporal dead zone error
  // that node --check reports as valid syntax.
  try {
    const drained = await AFLP.chastityGear?.drainAtRest?.(actor);
    const holes = drained ? Object.keys(drained.took) : [];
    if (holes.length) message += `<br>The joints drink: ${actor.name} loses ${drained.rate} Cumflation from ${holes.join(", ")}.`;
  } catch (e) { console.warn("AFLR | chastity drain failed", e); }

  if (hasPineappleDiet) {
    // Reports what was ACTUALLY written, and the total after bonus, training and
    // gear. This used to print "(floor: N)" computed as `1 + actorLevel` - its
    // own formula, not the one applied above - so it could name a floor of 12
    // while the code had clamped the value to 6. A message that recomputes is a
    // message that can lie; both numbers here are read back from the actor.
    const baseNow = (actor.getFlag(FLAG, "coomer") ?? AFLP.coomerDefaults).level;
    const total   = AFLP.effectiveLoads?.(actor) ?? baseNow;
    message += `<br>Pineapple Diet: baseline Loads set to <strong>${baseNow}</strong>`
             + (total !== baseNow ? ` (<strong>${total}</strong> with bonuses).` : ".");
  }

  if (hasAlcumist) {
    const vialCount = AFLP.alcumy.count(actor);
    message += `<br>${actor.name} refines <strong>${vialCount} Distillate${vialCount !== 1 ? "s" : ""}</strong> for today.`;
  }

  message += _sizeRestMsg;

  // Effects layer: rest can change predicate inputs (kink shed, decay), so
  // re-sync managed effects as the final upkeep step.
  await AFLP.effects?.sync?.(actor);

  // Anatomy drunk from a draught lasts until these preparations - drop it before
  // the summary so the chat reflects the body they wake up in.
  await AFLP.anatomy?.expireTemporary?.(actor);

  ChatMessage.create({ content: message });

  // Alcumist crafting dialog — shown after the chat message so the summary lands first
  if (hasAlcumist && window.AFLP_Alcumist) {
    // Spend any unlearned formula picks first, so newly-learned formulas are
    // craftable in the same daily preparations rather than a day late.
    await AFLP_Alcumist.showLearnDialog(actor);
    const vialCount = AFLP.alcumy.count(actor);
    const selections = await AFLP_Alcumist.showCraftingDialog(actor, vialCount);
    await AFLP_Alcumist.processCrafting(actor, selections);
  }

  // This module's own daily-prep flow is the canonical trigger. The hook already
  // had a listener (titles) but nothing ever fired it, so that check never ran.
  try { Hooks.callAll("aflp.dailyPrep", actor); } catch (e) { console.warn("AFLP | dailyPrep hook failed:", e?.message); }
}
