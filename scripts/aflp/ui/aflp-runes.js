// ===============================
// AFLR - Rune Etching (PF2e)
// ===============================
// PF2e 8.x has no supported path for custom property runes: the rune tables
// (RUNE_DATA / WEAPON_PROPERTY_RUNES) are closed module-scope constants, the
// drag-attach subitem flow accepts only attached-to-* weapon attachments and
// installed-in-* SF2e upgrades on graded gear, and etched-onto-* usage parses
// as plain "worn". So AFLR runes carry their own etch flow:
//
//   - A rune item (identified by flags.ardisfoxxs-lewd-pf2e.rune, with a
//     name+usage fallback for copies imported before the pack was tagged)
//     gets an "Etch onto..." button on its item sheet while owned by an actor.
//   - Etching writes the rune slug into flags.ardisfoxxs-lewd-pf2e.etchedRunes
//     on the chosen weapon/armor and deletes the rune item (it is now part of
//     the gear). The weapon/armor trait patch in index.js injects the rune's
//     traits during data prep.
//   - The etched weapon/armor sheet shows the rune with an "Un-etch" button,
//     which removes the flag and recreates the rune item in the inventory.
//
// Registry lives on window.AFLP.RUNES so the index.js trait patch and this
// file share one source of truth.
(() => {
  const MOD = "ardisfoxxs-lewd-pf2e";

  window.AFLP = window.AFLP || {};
  AFLP.RUNES = {
    sadomasochistic: {
      label: "Sadomasochistic",
      targets: "weapon",              // etches onto weapons (item type)
      targetLabel: "a weapon",        // display noun phrase
      traits: ["sexual"],             // injected into the host's traits
      itemName: "Sadomasochistic",    // pack item name (recreation on un-etch)
    },
    nude: {
      label: "Nude",
      targets: "armor",
      targetLabel: "armor",
      traits: ["sexual"],
      itemName: "Nude",
    },
  };

  // Resolve which AFLR rune (if any) an item IS.
  // Prefer the pack tag; fall back to name + etched usage for stale imports.
  function runeSlugOf(item) {
    const tagged = item?.getFlag?.(MOD, "rune");
    if (tagged && AFLP.RUNES[tagged]) return tagged;
    const byName = Object.entries(AFLP.RUNES)
      .find(([, def]) => def.itemName === item?.name);
    if (byName && /^etched-onto/.test(item?.system?.usage?.value ?? "")) return byName[0];
    return null;
  }

  // Etched runes carried by a weapon/armor item.
  function etchedRunesOf(item) {
    const arr = item?.getFlag?.(MOD, "etchedRunes");
    return Array.isArray(arr) ? arr.filter(r => AFLP.RUNES[r]) : [];
  }

  // Eligible host items on the actor for a given rune.
  function eligibleHosts(actor, slug) {
    const def = AFLP.RUNES[slug];
    if (!def) return [];
    return (actor?.items ?? []).filter(i =>
      i.type === def.targets && !etchedRunesOf(i).includes(slug));
  }

  async function etch(runeItem, slug, hostIdArg = null) {
    const actor = runeItem.actor;
    const def = AFLP.RUNES[slug];
    if (!actor || !def) return;
    const hosts = eligibleHosts(actor, slug);
    if (!hosts.length) {
      return ui.notifications.warn(`AFLR | ${actor.name} has no ${def.targetLabel ?? def.targets} the ${def.label} rune can be etched onto.`);
    }

    const options = hosts.map(h => `<option value="${h.id}">${h.name}</option>`).join("");
    const hostId = hostIdArg ?? await foundry.applications.api.DialogV2.wait({
      window: { title: `Etch ${def.label} Rune` },
      position: { width: 320 },
      content: `
        <p style="font-size:12px;">Etch the <strong>${def.label}</strong> rune onto which ${def.targets === "armor" ? "suit of armor" : def.targets}?</p>
        <select name="aflp-rune-host" style="width:100%;margin-bottom:6px;">${options}</select>`,
      buttons: [
        { action: "etch", label: "Etch", default: true,
          callback: (ev, btn, dlg) => dlg.element.querySelector('select[name="aflp-rune-host"]')?.value ?? null },
        { action: "cancel", label: "Cancel", callback: () => null },
      ],
      close: () => null,
      rejectClose: false,
    });
    // DialogV2 quirk: a null-returning callback resolves to the action string.
    if (!hostId || hostId === "cancel" || hostId === "etch") {
      if (hostId === "etch") ui.notifications.warn("AFLR | No target selected.");
      return;
    }

    const host = actor.items.get(hostId);
    if (!host) return;
    const current = etchedRunesOf(host);
    await host.setFlag(MOD, "etchedRunes", [...current, slug]);
    // Preserve the rune's source uuid so un-etch can recreate the exact item.
    const srcUuid = runeItem.flags?.core?.sourceId ?? runeItem.sourceId ?? null;
    if (srcUuid) {
      const map = foundry.utils.deepClone(host.getFlag(MOD, "etchedRuneSources") ?? {});
      map[slug] = srcUuid;
      await host.setFlag(MOD, "etchedRuneSources", map);
    }
    await runeItem.delete();

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> rune is etched onto <strong>${host.name}</strong>${def.traits.length ? ` - it gains the ${def.traits.join(", ")} trait${def.traits.length > 1 ? "s" : ""}` : ""}.</p></div>`,
    });
  }

  async function unetch(hostItem, slug) {
    const actor = hostItem.actor;
    const def = AFLP.RUNES[slug];
    if (!actor || !def) return;

    const remaining = etchedRunesOf(hostItem).filter(r => r !== slug);
    if (remaining.length) await hostItem.setFlag(MOD, "etchedRunes", remaining);
    else await hostItem.update({ [`flags.${MOD}.-=etchedRunes`]: null });

    // Recreate the rune item: stored source uuid first, pack lookup fallback.
    const sources = hostItem.getFlag(MOD, "etchedRuneSources") ?? {};
    let created = false;
    const srcUuid = sources[slug];
    if (srcUuid) {
      const doc = await fromUuid(srcUuid).catch(() => null);
      if (doc) { await actor.createEmbeddedDocuments("Item", [doc.toObject()]); created = true; }
    }
    if (!created) {
      const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
      const entry = pack?.index?.find(e => e.name === def.itemName);
      const doc = entry ? await pack.getDocument(entry._id) : null;
      if (doc) { await actor.createEmbeddedDocuments("Item", [doc.toObject()]); created = true; }
    }
    if (Object.keys(sources).length) {
      const map = foundry.utils.deepClone(sources); delete map[slug];
      if (Object.keys(map).length) await hostItem.setFlag(MOD, "etchedRuneSources", map);
      else await hostItem.update({ [`flags.${MOD}.-=etchedRuneSources`]: null });
    }

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="aflp-chat-card"><p>The <strong>${def.label}</strong> rune is removed from <strong>${hostItem.name}</strong>${created ? " and returned to the inventory" : ""}.</p></div>`,
    });
  }

  // ── Sheet integration (PF2e item sheets are ApplicationV1) ───────────────
  Hooks.on("renderItemSheet", (app, html, data) => {
    const item = app.item ?? app.document;
    if (!item?.actor) return;   // etching needs an owner with gear
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".aflp-rune-row")) return;

    const rows = [];

    // Rune item: offer Etch.
    const slug = runeSlugOf(item);
    if (slug) {
      rows.push({ label: `Etch this ${AFLP.RUNES[slug].label} rune onto ${AFLP.RUNES[slug].targetLabel ?? AFLP.RUNES[slug].targets}`, btn: "Etch onto...", act: () => etch(item, slug) });
    }

    // Host item: offer Un-etch per carried rune.
    for (const r of etchedRunesOf(item)) {
      rows.push({ label: `${AFLP.RUNES[r].label} rune etched`, btn: "Un-etch", act: () => unetch(item, r) });
    }

    if (!rows.length) return;
    const anchor = root.querySelector(".sheet-body, form") ?? root;
    const box = document.createElement("div");
    box.className = "aflp-rune-row";
    box.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-top:1px solid rgba(200,160,80,0.3);";
    for (const r of rows) {
      const line = document.createElement("div");
      line.style.cssText = "display:flex;align-items:center;gap:8px;";
      const span = document.createElement("span");
      span.style.cssText = "flex:1;font-size:11px;";
      span.textContent = r.label;
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "flex:0 0 auto;font-size:11px;padding:2px 10px;line-height:1.4;width:auto;";
      b.textContent = r.btn;
      b.addEventListener("click", ev => { ev.preventDefault(); r.act(); });
      line.append(span, b);
      box.append(line);
    }
    anchor.append(box);
  });

  // Programmatic API (macros, verification, future sheet-panel integration).
  AFLP.Runes = { etch, unetch, runeSlugOf, etchedRunesOf, eligibleHosts };

  console.log("AFLP | Rune etching integration loaded");
})();
