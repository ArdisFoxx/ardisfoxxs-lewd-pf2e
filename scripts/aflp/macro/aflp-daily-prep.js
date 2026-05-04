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
  const schema = await fromUuid(
    "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-macros.Macro.onWnuWJsqNZH96fn"
  );
  await schema?.execute();
}

const FLAG = AFLP.FLAG_SCOPE;
const tokens = canvas.tokens.controlled;
if (!tokens.length) return ui.notifications.warn("Select at least one token.");

for (const { actor } of tokens) {
  await AFLP.ensureCoreFlags(actor);

  // Reset arousal (preserve maxBase, reset current to 0)
  const arousal = structuredClone(actor.getFlag(FLAG, "arousal") ?? AFLP.arousalDefaults);
  arousal.current = 0;
  await actor.setFlag(FLAG, "arousal", arousal);

  // Denied clears on full rest (daily preparations)
  const denied = actor.getFlag(FLAG, "denied") ?? { value: 0 };
  if ((denied.value ?? 0) > 0) {
    await actor.setFlag(FLAG, "denied", { value: 0 });
  }

  // Bimbofied: "When you complete your daily preparations, if you haven't had sex
  // in the last 24 hours, your Bimbofied level is lowered by 1."
  // We track "had sex" via the partnerHistory — if the most recent entry is within
  // the last in-world day (86400 seconds), sex occurred.
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
  const horny = structuredClone(actor.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
  if ((horny.temp ?? 0) > 0) {
    horny.temp = 0;
    await actor.setFlag(FLAG, "horny", horny);
  }

  // Cum refill — use schema values via recalculateCum
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

  // Alcumist Dedication: calculate and display vial count for today
  // Vials = floor(cum.current / 2), minimum 1
  const ALCUMIST_UUID = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xdklOfDJHXLwZf31";
  const hasAlcumist = actor.items?.some(i =>
    i.slug === "alcumist-dedication" ||
    (i.flags?.core?.sourceId ?? i.sourceId) === ALCUMIST_UUID
  );
  if (hasAlcumist) {
    const cumForVials = actor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
    const vialCount = Math.max(1, Math.floor((cumForVials.current ?? 0) / 2));
    await actor.setFlag(FLAG, "_alcumistVials", vialCount);
  }

  // -------------------------------
  // Chat summary
  // -------------------------------
  let message = `<strong>${actor.name}</strong> completes daily preparations.`;
  for (const b of anyBirths) {
    const sourceName = b.sourceName || "Unknown";
    const type = b.deliveryType === "egg" ? "eggs" : "offspring";
    const count = b.offspring ?? 1;
    message += `<br>${actor.name} gave birth to ${count} ${type} fathered by <strong>${sourceName}</strong>!`;
  }

  if (hasAlcumist) {
    const vialCount = actor.getFlag(FLAG, "_alcumistVials") ?? 1;
    message += `<br>${actor.name} prepares <strong>${vialCount} Alcumist Vial${vialCount !== 1 ? "s" : ""}</strong> for today.`;
  }

  ChatMessage.create({ content: message });

  // Alcumist crafting dialog — shown after the chat message so the summary lands first
  if (hasAlcumist && window.AFLP_Alcumist) {
    const vialCount = actor.getFlag(FLAG, "_alcumistVials") ?? 1;
    const selections = await AFLP_Alcumist.showCraftingDialog(actor, vialCount);
    await AFLP_Alcumist.processCrafting(actor, selections);
  }
}
