// ===============================
// AFLP — Alcumist Automation
// ===============================
// Handles:
// - Auto-granting typed Vials of Cum when cumflated (actors with Alcumist Dedication)
// - Crafting dialog for daily prep (produce Alcumical items from vials)
// - Augmented item creation when a matching typed vial is consumed

const AFLP_Alcumist = {

  DEDICATION_UUID: "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.xdklOfDJHXLwZf31",
  DEDICATION_SLUG: "alcumist-dedication",
  VIAL_BASE_UUID:  "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.rloXTr10gPd7Xh0J",
  ALCUM_FOLDER_ID: "Q16vSMzhEHZqktXy",
  BOMB_FOLDER_ID:  "TfZI5bZITuwLyDhh",

  // Priority list of creature traits → vial type name
  // More specific subtypes first, broad types last
  TRAIT_PRIORITY: [
    "vampire","werewolf","werebear","wereboar",
    "hag","naga","sphinx","harpy","medusa","mimic",
    "dragon","fiend","undead","aberration","ooze","fey","plant","fungus",
    "giant","troll","oni","demon","devil","daemon",
    "humanoid","goblin","orc","gnoll","kobold","lizardfolk","minotaur",
    "kitsune","garmyr","bugbear","hobgoblin","ratfolk",
    "beast","animal","construct","elemental",
  ],

  // Returns the best vial type string from a creature's trait array
  getCreatureType(traits = []) {
    const lower = traits.map(t => t.toLowerCase());
    for (const type of AFLP_Alcumist.TRAIT_PRIORITY) {
      if (lower.includes(type)) return type.charAt(0).toUpperCase() + type.slice(1);
    }
    return "Creature";
  },

  // Check if an actor has Alcumist Dedication
  hasDedication(actor) {
    if (!actor) return false;
    return actor.items?.some(i =>
      i.slug === AFLP_Alcumist.DEDICATION_SLUG ||
      (i.flags?.core?.sourceId ?? i.sourceId) === AFLP_Alcumist.DEDICATION_UUID
    ) ?? false;
  },

  // Grant a typed Vial of Cum to an actor (stacks quantity)
  async grantTypedVial(targetActor, creatureType) {
    const vialName = `Vial of Cum (${creatureType})`;
    const liveActor = targetActor.getWorldActor?.() ?? targetActor;

    // Check if they already have one of this type
    const existing = liveActor.items?.find(i =>
      i.name === vialName && (i.slug === "vial-of-cum" || i.type === "consumable")
    );
    if (existing) {
      await existing.update({ "system.quantity": (existing.system?.quantity ?? 1) + 1 });
    } else {
      // Clone from base Vial of Cum
      const baseDoc = await fromUuid(AFLP_Alcumist.VIAL_BASE_UUID).catch(() => null);
      if (!baseDoc) { console.warn("AFLP | Alcumist: base Vial of Cum not found"); return; }
      const itemData = baseDoc.toObject();
      itemData.name = vialName;
      itemData.system.quantity = 1;
      // Store the type in a flag for matching during crafting
      if (!itemData.flags) itemData.flags = {};
      if (!itemData.flags["ardisfoxxs-lewd-pf2e"]) itemData.flags["ardisfoxxs-lewd-pf2e"] = {};
      itemData.flags["ardisfoxxs-lewd-pf2e"].cumType = creatureType.toLowerCase();
      await liveActor.createEmbeddedDocuments("Item", [itemData]);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong> collects a sample into a vial: <strong>${vialName}</strong>.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // Called from applyCumflation when an Alcumist is cumflated by a creature
  async onCumflation(targetActor, sourceActor) {
    if (!game.user.isGM) return;
    if (!sourceActor || !targetActor) return;
    if (!AFLP_Alcumist.hasDedication(targetActor)) return;
    // Don't grant a vial if cumflated by self
    if (sourceActor.id === targetActor.id) return;

    const traits = sourceActor.system?.traits?.value ?? [];
    const creatureType = AFLP_Alcumist.getCreatureType(traits);
    await AFLP_Alcumist.grantTypedVial(targetActor, creatureType);
  },

  // Show crafting dialog during daily prep for Alcumist actors
  // Returns a promise that resolves when the player is done crafting
  async showCraftingDialog(actor, vialCount) {
    if (!vialCount || vialCount <= 0) return;

    // Load all Alcumical items from the compendium
    const pack = game.packs.get("ardisfoxxs-lewd-pf2e.aflp-lewd-items");
    await pack.getIndex({ fields: ["name","type","folder","system.level","system.traits"] });
    const alcumItems = [...pack.index]
      .filter(e => (e.folder === AFLP_Alcumist.ALCUM_FOLDER_ID || e.folder === AFLP_Alcumist.BOMB_FOLDER_ID) && e.type !== "feat")
      .sort((a, b) => (a.system?.level?.value ?? 0) - (b.system?.level?.value ?? 0));

    // Get typed vials in actor's inventory
    const typedVials = actor.items?.filter(i =>
      i.name.startsWith("Vial of Cum (") && i.name !== "Vial of Cum"
    ) ?? [];
    const vialsByType = {};
    for (const v of typedVials) {
      const match = v.name.match(/Vial of Cum \((.+)\)/);
      if (match) {
        const type = match[1].toLowerCase();
        vialsByType[type] = (vialsByType[type] ?? 0) + (v.system?.quantity ?? 1);
      }
    }

    // Perfect Sample type mapping for items (derived from description)
    const ITEM_TYPES = {
      "Willpower Elixir (Lesser)":        ["hag","fiend","aberration"],
      "Willpower Elixir (Moderate)":      ["hag","fiend","aberration"],
      "Willpower Elixir (Greater)":       ["hag","fiend","aberration"],
      "Arousal Suppressor":               ["plant","fey","beast"],
      "Fortitude Draught (Lesser)":       ["dragon","giant","ooze"],
      "Fortitude Draught (Moderate)":     ["dragon","giant","ooze"],
      "Arousal Catalyst":                 ["fiend","fey","hag"],
      "Cum Volume Enhancer":              ["dragon","giant","beast"],
      "Cum Resistance Tonic":             ["hag","aberration","undead"],
      "Cum Resistance Tonic (Greater)":   ["hag","aberration","fiend"],
      "Desensitizing Serum":              ["plant","ooze","fey"],
      "Potency Elixir":                   ["dragon","giant","fiend"],
      "Mind Break Inhibitor":             ["aberration","fiend","hag"],
      "Alcumist's Masterwork":            ["dragon","fiend","hag"],
      "Suppression Bomb":                 ["plant","beast","hag"],
      "Aphrodisiac Charge":               ["fiend","fey","hag"],
      "Aphrodisiac Charge (Moderate)":    ["fiend","fey","hag"],
      "Aphrodisiac Charge (Greater)":     ["fiend","fey","hag"],
      "Sticky Bomb (Lesser)":             ["ooze","fey","dragon"],
      "Sticky Bomb (Moderate)":           ["ooze","fey","dragon"],
      "Sticky Bomb (Greater)":            ["ooze","fey","dragon"],
      "Sticky Bomb (Major)":              ["ooze","fey","dragon"],
    };

    // Check which items can be augmented
    function canAugment(itemName) {
      const types = ITEM_TYPES[itemName];
      if (!types) return null;
      for (const type of types) {
        if ((vialsByType[type] ?? 0) > 0) return type;
      }
      return null;
    }

    // Build dialog content
    const itemRows = alcumItems.map(entry => {
      const augType = canAugment(entry.name);
      const hasAug = augType !== null;
      const levelBadge = `<span style="font-size:10px;color:#888;margin-left:4px;">L${entry.system?.level?.value ?? "?"}</span>`;
      const augBadge = hasAug
        ? `<span style="font-size:10px;color:#c8a050;margin-left:6px;" title="You have ${augType} cum">[Augmentable]</span>`
        : "";
      return `<tr>
        <td style="padding:4px 4px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;">
            <input type="checkbox" name="craft-${entry._id}" data-name="${entry.name}"
                   data-aug-type="${augType ?? ""}"
                   style="accent-color:#c8a050;width:13px;height:13px;"/>
            <span>${entry.name}${levelBadge}${augBadge}</span>
          </label>
        </td>
        <td style="padding:4px;text-align:center;">
          <input type="checkbox" name="augment-${entry._id}"
                 data-for="${entry._id}"
                 ${!hasAug ? 'disabled style="opacity:0.3;"' : 'style="accent-color:#c8a050;"'}
                 title="${hasAug ? `Use Vial of Cum (${augType.charAt(0).toUpperCase()+augType.slice(1)}) to Augment` : 'No matching vial'}"
          />
        </td>
      </tr>`;
    }).join("");

    const vialSummary = Object.entries(vialsByType).length
      ? Object.entries(vialsByType).map(([t, n]) => `${n}x ${t.charAt(0).toUpperCase()+t.slice(1)}`).join(", ")
      : "None";

    const content = `
      <style>
        .alcumist-table { width:100%; border-collapse:collapse; font-family:var(--font-primary,serif); }
        .alcumist-table th { font-size:10px; color:#c9a96e; text-transform:uppercase;
                              letter-spacing:0.06em; padding:3px 4px; border-bottom:1px solid #c9a96e44; }
        .alcumist-table tr:hover td { background:rgba(200,160,80,0.06); }
        #alcumist-remaining { font-weight:bold; color:#c9a96e; }
      </style>
      <div style="font-family:var(--font-primary,serif);color:#ddd;font-size:12px;">
        <div style="margin-bottom:8px;">
          <strong>${actor.name}</strong> has <strong id="alcumist-remaining">${vialCount}</strong> versatile vial${vialCount !== 1 ? "s" : ""} today.
          <div style="font-size:11px;color:#aaa;margin-top:2px;">Typed vials in inventory: ${vialSummary}</div>
        </div>
        <p style="font-size:11px;color:#aaa;margin:0 0 8px;">Select items to craft. Check Augment if you want to use a typed vial (consumes 1 vial of the matching type).</p>
        <table class="alcumist-table">
          <thead><tr><th style="text-align:left;">Item</th><th>Augment</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div id="alcumist-error" style="color:#e05050;font-size:11px;margin-top:6px;display:none;"></div>
      </div>`;

    return new Promise(resolve => {
      foundry.applications.api.DialogV2.wait({
        window: { title: `${actor.name} - Alcumist Daily Crafting` },
        position: { width: 440 },
        content,
        render(ev, dlg) {
          const el = dlg.element;
          const wc = el.querySelector(".window-content");
          if (wc) { wc.style.overflowY = "auto"; wc.style.maxHeight = "70vh"; }
          const updateRemaining = () => {
            const checked = el.querySelectorAll("input[name^='craft-']:checked").length;
            const rem = vialCount - checked;
            const remEl = el.querySelector("#alcumist-remaining");
            if (remEl) remEl.textContent = Math.max(0, rem);
          };
          el.querySelectorAll("input[name^='craft-']").forEach(cb => {
            cb.addEventListener("change", () => {
              // Uncheck augment if parent craft unchecked
              if (!cb.checked) {
                const augCb = el.querySelector(`input[name^='augment-'][data-for='${cb.name.replace("craft-","")}']`);
                if (augCb) augCb.checked = false;
              }
              updateRemaining();
            });
          });
        },
        buttons: [
          { action: "craft", label: "Craft Items", default: true, callback: async (ev, btn, dlg) => {
            const el = dlg.element;
            const craftChecks = [...el.querySelectorAll("input[name^='craft-']:checked")];
            if (craftChecks.length > vialCount) {
              const errEl = el.querySelector("#alcumist-error");
              if (errEl) { errEl.textContent = `You can only craft ${vialCount} item${vialCount !== 1 ? "s" : ""}.`; errEl.style.display = ""; }
              return false;
            }
            const selections = craftChecks.map(cb => {
              const id = cb.name.replace("craft-","");
              const augCb = el.querySelector(`input[name='augment-${id}']`);
              return { id, name: cb.dataset.name, augType: cb.dataset.augType || null, augment: augCb?.checked ?? false };
            });
            resolve(selections);
          }},
          { action: "skip", label: "Skip Crafting", callback: async () => resolve([]) },
        ],
        close: async () => resolve([]),
      });
    });
  },

  // Process crafting selections: create items in actor inventory, consume vials
  async processCrafting(actor, selections) {
    if (!selections?.length) return;
    const pack = game.packs.get("ardisfoxxs-lewd-pf2e.aflp-lewd-items");
    const createdItems = [];

    for (const sel of selections) {
      const entry = pack.index.find(e => e._id === sel.id);
      if (!entry) continue;
      const doc = await pack.getDocument(sel.id);
      const itemData = doc.toObject();
      itemData.system.quantity = 1;

      if (sel.augment && sel.augType) {
        // Mark as augmented
        itemData.name = itemData.name + " (Augmented)";
        if (!itemData.flags["ardisfoxxs-lewd-pf2e"]) itemData.flags["ardisfoxxs-lewd-pf2e"] = {};
        itemData.flags["ardisfoxxs-lewd-pf2e"].augmented = true;
        itemData.flags["ardisfoxxs-lewd-pf2e"].augType = sel.augType;

        // Consume one matching typed vial from inventory
        const vialName = `Vial of Cum (${sel.augType.charAt(0).toUpperCase() + sel.augType.slice(1)})`;
        const vial = actor.items?.find(i => i.name === vialName);
        if (vial) {
          const qty = vial.system?.quantity ?? 1;
          if (qty <= 1) await vial.delete().catch(() => {});
          else await vial.update({ "system.quantity": qty - 1 });
        }
      }

      createdItems.push(itemData);
    }

    if (createdItems.length) {
      await actor.createEmbeddedDocuments("Item", createdItems);
      const augCount = selections.filter(s => s.augment).length;
      const normCount = selections.length - augCount;
      const parts = [];
      if (normCount) parts.push(`${normCount} alcumical item${normCount !== 1 ? "s" : ""}`);
      if (augCount)  parts.push(`${augCount} Augmented item${augCount !== 1 ? "s" : ""}`);
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${actor.name}</strong> crafts ${parts.join(" and ")} using their versatile vials.</p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  },
};

window.AFLP_Alcumist = AFLP_Alcumist;
