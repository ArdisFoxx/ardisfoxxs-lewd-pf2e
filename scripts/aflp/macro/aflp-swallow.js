// AFLP - Swallow Whole (Carnal). The selected creature swallows its target(s): they
// gain the Swallowed condition (held, Exposed, Restrained) and are worked over for
// Arousal at the start of the swallower's turn instead of taking damage. Escape frees
// them. Drives Big Leroy's Swallow Whole / Latex Lynx's Engulf and any Carnal engulf.
(async () => {
  const tok = canvas.tokens.controlled[0];
  if (!tok?.actor) { ui.notifications.warn("Select the swallowing creature's token first."); return; }
  const targets = [...(game.user.targets ?? [])];
  if (!targets.length) { ui.notifications.warn("Target the creature(s) to swallow."); return; }

  // Swallowing needs the anatomy for it. Without this check the macro worked on
  // anybody, so Throat (Swallowing) and Maw granted nothing at all - the ability
  // they describe was already available to every creature in the game.
  {
    const af = tok.actor.getFlag?.(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
    if (!af["throat-swallowing"] && !af["maw"]) {
      ui.notifications.warn(`${tok.actor.name} has nothing to swallow with - that needs Throat (Swallowing) or a Maw.`);
      return;
    }
  }

  // Best-guess Escape DC from the swallower: class DC, then spell DC, then a
  // level-scaled fallback. The GM can override in the prompt.
  const sys = tok.actor.system ?? {};
  const guessDC = sys.attributes?.classDC?.value
    ?? sys.attributes?.spelldc?.value
    ?? (14 + Math.ceil((Number(sys.details?.level?.value ?? 1)) * 1.4));

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Swallow Whole" },
    position: { width: 320 },
    content: `<p style="margin:2px 0">Escape ${AFLP.system?.dcWord ?? "DC"}: <input type="number" name="dc" value="${guessDC}" style="width:60px"/></p>`
           + `<p style="margin:2px 0">Arousal per action taken on them: <input type="number" name="ar" value="0" min="0" style="width:50px"/></p>`
           + `<p style="margin:2px 0;font-size:11px;opacity:0.8">0 for an ordinary gullet. Raise it only for a swallower that works its captive over - a mimic presses with its own actions instead.</p>`,
    buttons: [
      { action: "ok", label: "Swallow", default: true, callback: (ev, btn, dlg) => {
        const el = dlg.element;
        return {
          dc: Number(el.querySelector("input[name=dc]")?.value) || 0,
          // `|| 1` here made 0 unenterable, so every swallow churned Arousal
          // whether or not the creature's fiction called for it.
          ar: Math.max(0, Number(el.querySelector("input[name=ar]")?.value) || 0),
        };
      } },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    rejectClose: false,
  });
  if (!choice) return;

  for (const t of targets) {
    if (!t.actor) continue;
    await AFLP.swallowed.apply(t.actor, tok.actor, { dc: choice.dc, arousal: choice.ar });
    ChatMessage.create({
      speaker: { alias: tok.name },
      content: `<div class="aflp-chat-card"><p><strong>${tok.name}</strong> swallows <strong>${t.name}</strong> whole - sealed in, held, and out of reach. Escape ${AFLP.system?.dcWord ?? "DC"} ${choice.dc}.${choice.ar > 0 ? ` They mark ${choice.ar} Arousal at the start of each of ${tok.name}'s turns.` : ""}</p></div>`
    }).catch(() => {});
  }
})();
