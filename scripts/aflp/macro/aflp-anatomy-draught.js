// AFLP - Anatomy Draught. Drink it, choose one special anatomy, and wear that body
// until your next daily preparations.
//
// Only ungated features are offered: the six that carry the incapacitation trait
// (Paralyzing, Pacifying x2, Electric x2, Honeyed) are deliberately absent, because
// a drunk transformation makes YOU the source of the effect - which puts the
// incapacitation threshold at your own level and gates nothing. Those six come only
// from their tattoos, where the item's level does the gating. See AFLP.ANATOMY_GATED.
(async () => {
  const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!actor) { ui.notifications.warn("Select your token, or set a character."); return; }
  if (!AFLP?.anatomy?.grant) { ui.notifications.error("AFLP anatomy API missing - update the module."); return; }

  const gated = new Set(AFLP.ANATOMY_GATED ?? []);
  const af = actor.getFlag(AFLP.FLAG_SCOPE, "anatomyFeatures") ?? {};
  const grants = actor.getFlag(AFLP.FLAG_SCOPE, AFLP.anatomy.GRANT_FLAG) ?? {};

  // Group the offer by body part so the list reads like the sheet's doll.
  const REGION = { pussy: "Lower body", cock: "Lower body", tits: "Torso", throat: "Head", maw: "Head", tongue: "Head" };
  const buckets = {};
  for (const [key, def] of Object.entries(AFLP.anatomyFeatures ?? {})) {
    if (gated.has(key)) continue;
    if (af[key] === true) continue;                   // already have it
    const base = String(key).split("-")[0];
    const region = REGION[base] ?? "Other";
    (buckets[region] ??= []).push({ key, name: def.name ?? key, parent: def.parent });
  }
  const regions = Object.keys(buckets).sort();
  if (!regions.length) { ui.notifications.info(`${actor.name} already has every anatomy this draught can give.`); return; }

  const opts = regions.map(r =>
    `<optgroup label="${r}">` +
    buckets[r].sort((a, b) => a.name.localeCompare(b.name))
      .map(o => `<option value="${o.key}">${o.name}${o.parent ? ` (${o.parent})` : ""}</option>`).join("") +
    `</optgroup>`).join("");

  const key = await foundry.applications.api.DialogV2.wait({
    window: { title: "Anatomy Draught" },
    position: { width: 360 },
    content: `<p style="margin:2px 0 6px;font-size:11px;color:#aaa">The draught reshapes you until your next daily preparations.</p>
              <select name="pick" style="width:100%">${opts}</select>`,
    buttons: [
      { action: "ok", label: "Drink", default: true,
        callback: (ev, btn, dlg) => dlg.element.querySelector("select[name=pick]")?.value ?? null },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    rejectClose: false,
  });
  if (!key) return;

  // A parent part has to exist before its subtype means anything - a Lactating
  // chest on someone with no tits does nothing.
  const parent = AFLP.anatomyFeatures?.[key]?.parent;
  if (parent && af[parent] !== true && grants[parent] === undefined) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Anatomy Draught" },
      content: `<p>${actor.name} has no <strong>${AFLP.anatomyFeatures[parent]?.name ?? parent}</strong>, which this feature needs. Grow that too?</p>`,
    });
    if (!ok) return;
    await AFLP.anatomy.grant(actor, parent, { kind: "elixir" });
  }

  const done = await AFLP.anatomy.grant(actor, key, { kind: "elixir" });
  if (!done) { ui.notifications.warn("Nothing changed - that feature is already granted."); return; }

  const name = AFLP.anatomyFeatures?.[key]?.name ?? key;
  ChatMessage.create({
    speaker: { alias: actor.name },
    content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> drains the draught. The change takes hold - <strong>${name}</strong> - and holds until their next daily preparations.</p></div>`,
  }).catch(() => {});
})();
