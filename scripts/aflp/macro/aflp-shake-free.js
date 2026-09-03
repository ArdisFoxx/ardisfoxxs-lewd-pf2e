// AFLR - Shake Free
// PF2e / AFLP.
//
// An adjacent ally spends an action to shake, slap, or shout a Hypnotized creature
// back to itself. The creature attempts a Will save against the DC of the effect
// that hypnotised it.
//
// The DC is stored on the target as `mindHoldDC` when the hold is applied, because
// "the originating effect's DC" is not a static number and cannot be expressed as an
// inline @Check. If it is missing (a hold applied by hand, or before this existed),
// we fall back to a hard DC for the entrancer's level, and say so.
//
//   Success            the hold ends.
//   Critical failure   they cannot be shaken free again for 1 minute.
//
// A Persona Overridden creature cannot be shaken free at all - the conditioning is
// not a trance, it is who they are now.

(async () => {
  const FLAG = AFLP.FLAG_SCOPE;

  const target = game.user.targets.first()?.actor ?? canvas.tokens.controlled[0]?.actor;
  if (!target) { ui.notifications.warn("AFLR | Target the hypnotized creature (or select their token)."); return; }

  const overridden = AFLP.cond?.has?.(target, "persona-overridden")
    || target.items?.some?.(i =>
    i.slug === "persona-overridden" || /^Persona Overridden$/i.test(i.name ?? ""));
  if (overridden) {
    await ChatMessage.create({ speaker: { alias: "AFLR" },
      content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> cannot be shaken free.</p>
        <p><em>Their persona has been overridden. There is no trance to break - this is simply who they are now.</em></p></div>` });
    return;
  }

  if (!AFLP.cond.has(target, "hypnotized")) {
    ui.notifications.warn(`AFLR | ${target.name} is not Hypnotized.`);
    return;
  }

  // Immune from a previous critical failure?
  const immuneUntil = Number(target.getFlag(FLAG, "shakeFreeImmuneUntil")) || 0;
  if (immuneUntil && game.time.worldTime < immuneUntil) {
    await ChatMessage.create({ speaker: { alias: "AFLR" },
      content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> cannot be shaken free yet - the last attempt only pushed them deeper.</p></div>` });
    return;
  }

  // The DC of the effect that took them.
  let dc = Number(target.getFlag(FLAG, "mindHoldDC")) || 0;
  let dcNote = "";
  if (!dc) {
    const byId = target.getFlag(FLAG, "entrancedBy") ?? target.getFlag(FLAG, "hypnoConditionerId");
    const by = byId ? game.actors.get(byId) : null;
    const lvl = by?.system?.details?.level?.value ?? 1;
    dc = 14 + Math.floor(lvl * 1.2);
    dcNote = " <em>(no recorded DC; estimated from the entrancer's level)</em>";
  }

  const roll = await target.saves.will.roll({
    dc: { value: dc, label: "Shake Free (originating DC)" },
    extraRollOptions: ["action:shake-free"],
    createMessage: true,
  });
  const deg = roll?.degreeOfSuccess; // 0 critFail, 1 fail, 2 success, 3 critSuccess

  if (deg >= 2) {
    await AFLP.cond.remove(target, "hypnotized");
    await ChatMessage.create({ speaker: { alias: "AFLR" },
      content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> shakes free. The room comes back in a rush.</p></div>` });
  } else if (deg === 0) {
    await AFLP.gm.run("setFlag", target, "shakeFreeImmuneUntil", game.time.worldTime + 60);
    await ChatMessage.create({ speaker: { alias: "AFLR" },
      content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> barely stirs, then sinks deeper.</p>
        <p><em>They cannot be shaken free again for 1 minute.</em></p></div>` });
  } else {
    await ChatMessage.create({ speaker: { alias: "AFLR" },
      content: `<div class="aflp-chat-card"><p><strong>${target.name}</strong> does not respond.${dcNote}</p></div>` });
  }
})();
