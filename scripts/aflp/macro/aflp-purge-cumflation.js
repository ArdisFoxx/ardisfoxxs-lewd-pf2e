// ===============================
// AFLP – Purge Cumflation Macro (updated for facial + cumOverflow reset)
// ===============================
if (!token?.actor) {
  ui.notifications.warn("Please select a token to purge cumflation.");
  return;
}
const actor = token.actor;
const FLAG = AFLP.FLAG_SCOPE;

// Early check: ensure actor has any cumflation
const cumflation = actor.getFlag(FLAG, "cumflation") ?? { oral: 0, anal: 0, vaginal: 0, facial: 0 };
if (!cumflation.oral && !cumflation.anal && !cumflation.vaginal && !cumflation.facial) {
  ui.notifications.info(`${actor.name} isn't cumflated right now.`);
  return;
}

const actorLevel = actor.system.details.level?.value ?? 1;

// PF2e Normal DC by level (0–20)
const getNormalDC = (level) => {
  const dcByLevel = [
    14, 15, 16, 18, 19, 20, 22, 23, 24, 26,
    27, 28, 30, 31, 32, 34, 35, 36, 38, 39,
    40
  ];
  return dcByLevel[Math.min(level, 20)];
};

// Remove an applied "Cumflated <Hole>" effect item, if present
const clearCumflationEffect = async (holeLabel) => {
  const effects = actor.items.filter(i => i.name.startsWith(`Cumflated ${holeLabel}`));
  if (effects.length) await actor.deleteEmbeddedDocuments("Item", effects.map(e => e.id), { noHook: true });
};

// Remove any residual total Cumflation effect
const clearTotalCumflationEffect = async () => {
  const totalEffects = actor.items.filter(i =>
    i.name.startsWith("Cumflated") &&
    !["Oral", "Anal", "Vaginal"].some(h => i.name.includes(h))
  );
  if (totalEffects.length) {
    await actor.deleteEmbeddedDocuments("Item", totalEffects.map(e => e.id), { noHook: true });
  }
};

// Core Roll Logic
const rollPurge = async () => {
  const dc = getNormalDC(actorLevel);
  const flavor = `<strong>${actor.name}</strong>: Purge Cum (Fortitude DC ${dc})`;
  let roll;

  if (actor.hasPlayerOwner && actor.saves?.fortitude?.roll) {
    roll = await actor.saves.fortitude.roll({ dc, flavor });
  } else {
    const fortMod = actor.system.saves.fortitude?.value ?? 0;
    roll = await new Roll(`1d20 + ${fortMod}`).roll({ async: true });
    roll.toMessage({ flavor });
  }

  const die = roll.dice?.[0]?.results?.[0]?.result;
  const isNat1 = die === 1;
  const total = roll.total;

  // Success
  if (total >= dc) {
    await Promise.all([
      clearCumflationEffect("Oral"),
      clearCumflationEffect("Anal"),
      clearCumflationEffect("Vaginal")
    ]);
    await clearTotalCumflationEffect();

    // Reset cumflation AND cumOverflow
    await actor.setFlag(FLAG, "cumflation", { oral: 0, anal: 0, vaginal: 0, facial: 0 });
    await actor.setFlag(FLAG, "cumOverflow", { oral: 0, anal: 0, vaginal: 0, facial: 0 });

    ChatMessage.create({
      content: `<em>${actor.name} successfully purges the cum from all of their holes.</em>`
    });
    return "success";
  }

  // Critical Failure
  if (total <= dc - 10 || (total < dc && isNat1)) {
    const pack = game.packs.get("pf2e.conditionitems");
    const fatigued = await pack?.getDocument("HL2l2VRSaQHu9lUw");
    if (fatigued) await actor.createEmbeddedDocuments("Item", [fatigued.toObject()]);
    ChatMessage.create({
      content: `<em>${actor.name} strains painfully and cannot attempt another purge until they rest.</em>`
    });
    return "critfail";
  }

  // Normal Failure
  ChatMessage.create({
    content: `<em>${actor.name} fails to push the cum out.</em>`
  });
  return "fail";
};

await rollPurge();
