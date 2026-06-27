// ===============================
// AFLP – Purge Cumflation Macro
// ===============================
// Per-hole cumflation is flag-only (no per-hole item effects beyond the graded
// overall effect, which is recomputed from the flags).
//
// Purge clears ONE hole at a time. A dialog asks which to clear, then:
//   - External cum (facial, paizuri) is surface, not a filled hole: it wipes
//           off for free - no save, no Stress, no Fatigue, no chance of failure.
//   - Internal holes (anal, oral, vaginal):
//     - PF2e: 3-action activity, Fortitude save vs a normal DC for your level.
//           Crit failure makes you Fatigued and locks out another purge until
//           you rest. You cannot purge while Fatigued (override by editing
//           Cumflation manually on the sheet).
//     - Daggerheart: mark 1 Stress to expel the chosen hole's load. If you are
//           Stressed out you cannot purge this turn.

if (!token?.actor) {
  ui.notifications.warn("Please select a token to purge cumflation.");
  return;
}

const actor = token.actor;
const FLAG  = AFLP.FLAG_SCOPE;
const isDH  = AFLP.system?.id === "daggerheart";

const cumflation = actor.getFlag(FLAG, "cumflation") ?? { oral: 0, anal: 0, vaginal: 0, facial: 0, paizuri: 0 };
if (!cumflation.oral && !cumflation.anal && !cumflation.vaginal && !cumflation.facial && !cumflation.paizuri) {
  ui.notifications.info(`${actor.name} isn't cumflated right now.`);
  return;
}

// ── Choose which hole to clear (one at a time) ────────────────────────────
const HOLES = [
  { key: "anal",    label: "Anal" },
  { key: "oral",    label: "Oral" },
  { key: "vaginal", label: "Vaginal" },
  { key: "facial",  label: "Facial" },
  { key: "paizuri", label: "Paizuri" },
];
const filled = HOLES.filter(h => (cumflation[h.key] ?? 0) > 0);

let hole;
if (filled.length === 1) {
  hole = filled[0].key;
} else {
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Purge Cumflation — Choose a Hole" },
    content: `<div style="padding:4px">
      <p><strong>${actor.name}</strong> can purge one hole. Which one?</p>
    </div>`,
    buttons: [
      ...filled.map((h, i) => ({
        action: h.key,
        label: `${h.label} (Cumflated ${cumflation[h.key]})`,
        default: i === 0,
      })),
      { action: "cancel", label: "Cancel" },
    ],
    close: () => "cancel",
  }) ?? "cancel";
  if (choice === "cancel") return;
  hole = choice;
}

const holeLabel = HOLES.find(h => h.key === hole)?.label ?? hole;
const external  = hole === "facial" || hole === "paizuri";
const where = hole === "facial" ? "their face"
            : hole === "paizuri" ? "their chest"
            : `their ${holeLabel.toLowerCase()}`;

// ── Clear a single purged hole + recompute effects ────────────────────────
// Zeroes only the chosen hole, then recomputes the per-hole + overall
// cumflation effects and facial vision from the remaining flags. The other
// holes keep their cumflation and effects.
const purgeHole = async () => {
  const cf = structuredClone(actor.getFlag(FLAG, "cumflation")  ?? { oral: 0, anal: 0, vaginal: 0, facial: 0 });
  const ov = structuredClone(actor.getFlag(FLAG, "cumOverflow") ?? { oral: 0, anal: 0, vaginal: 0, facial: 0 });
  cf[hole] = 0;
  ov[hole] = 0;
  await actor.setFlag(FLAG, "cumflation",  cf);
  await actor.setFlag(FLAG, "cumOverflow", ov);
  await AFLP_Cumflation.applyCumflationEffects(actor);
};

const getNormalDC = (level) => {
  const dcByLevel = [
    14, 15, 16, 18, 19, 20, 22, 23, 24, 26,
    27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40
  ];
  return dcByLevel[Math.min(level, 20)];
};

const rollPurge = async () => {
  const actorLevel = actor.system?.details?.level?.value ?? 1;
  const dc     = getNormalDC(actorLevel);
  const flavor = `<strong>${actor.name}</strong>: Purge Cum — ${holeLabel} (Fortitude DC ${dc})`;

  let roll;
  if (actor.hasPlayerOwner && actor.saves?.fortitude?.roll) {
    roll = await actor.saves.fortitude.roll({ dc, flavor });
  } else {
    const fortMod = actor.system.saves.fortitude?.value ?? 0;
    roll = await new Roll(`1d20 + ${fortMod}`).evaluate();
    roll.toMessage({ flavor });
  }

  const die    = roll.dice?.[0]?.results?.[0]?.result;
  const isNat1 = die === 1;
  const total  = roll.total;

  // Success
  if (total >= dc) {
    await purgeHole();
    ChatMessage.create({
      content: `<em>${actor.name} bears down and purges the cum from ${where}.</em>`
    });
    return "success";
  }

  // Critical Failure
  if (total <= dc - 10 || (total < dc && isNat1)) {
    const pack     = game.packs.get("pf2e.conditionitems");
    const fatigued = await pack?.getDocument("HL2l2VRSaQHu9lUw");
    if (fatigued) await actor.createEmbeddedDocuments("Item", [fatigued.toObject()]);
    ChatMessage.create({
      content: `<em>${actor.name} strains painfully and cannot attempt another purge until they rest.</em>`
    });
    return "critfail";
  }

  // Normal Failure
  ChatMessage.create({
    content: `<em>${actor.name} fails to push the cum out of ${where}.</em>`
  });
  return "fail";
};

// Daggerheart: native Stress-cost purge. DH has no Fortitude save, so purging is
// exertion - mark 1 Stress to expel the chosen hole's load. If you are already
// Stressed out (cannot mark), the spiral holds and you cannot purge this turn.
const purgeDH = async () => {
  const stress = actor.system?.resources?.stress;
  const cur = stress?.value ?? 0;
  const max = stress?.max ?? 6;
  if (stress && cur >= max) {
    ChatMessage.create({ content: `<em>${actor.name} is too overwhelmed to purge - no Stress left to spend, so the spiral holds.</em>` });
    return "fail";
  }
  if (stress) await actor.update({ "system.resources.stress.value": Math.min(max, cur + 1) });
  await purgeHole();
  ChatMessage.create({ content: `<em>${actor.name} bears down and expels the load from ${where}, marking a Stress.</em>` });
  return "success";
};

// External locations (facial, paizuri) are surface cum, not a filled hole.
// There is no way to fail at wiping yourself down, so they clear for free - no
// save, no Stress, no Fatigue - on either system.
if (external) {
  await purgeHole();
  ChatMessage.create({ content: `<em>${actor.name} wipes the cum from ${where} clean.</em>` });
  return;
}

// ── Internal holes: the real Purge ────────────────────────────────────────
// PF2e: can't purge while Fatigued. Crit-failing a purge applies Fatigued and
// locks out another attempt until rest. To override (e.g. a GM ruling), adjust
// Cumflation manually on the sheet.
if (!isDH) {
  const conditions = actor.itemTypes?.condition ?? actor.items.filter(i => i.type === "condition");
  const isFatigued = conditions.some(c => c.slug === "fatigued" || /^fatigued$/i.test(c.name ?? ""));
  if (isFatigued) {
    ui.notifications.warn(`${actor.name} is Fatigued and can't Purge Cumflation again until they rest. To override, adjust Cumflation manually on the sheet.`);
    return;
  }
  await rollPurge();
} else {
  await purgeDH();
}
