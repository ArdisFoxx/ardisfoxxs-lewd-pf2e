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

  ChatMessage.create({ content: message });
}
