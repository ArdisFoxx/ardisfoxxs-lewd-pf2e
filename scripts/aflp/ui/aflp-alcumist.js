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

  // Grant a typed cum bottle to an actor (stacks quantity). Every system now
  // names it Bottled Cum; the aflrKey stays "vial-of-cum" because that is the
  // identifier DH has always used and existing characters carry. Typed names
  // derive from the base item's NAME, so renaming the pack item is enough.
  async grantTypedVial(targetActor, creatureType) {
    const liveActor = targetActor.getWorldActor?.() ?? targetActor;
    const baseUuid = AFLP.system?.contentUuid?.("vial-of-cum") ?? AFLP_Alcumist.VIAL_BASE_UUID;
    const baseDoc = await fromUuid(baseUuid).catch(() => null);
    if (!baseDoc) { console.warn("AFLP | Alcumist: base cum bottle item not found"); return; }
    const vialName = `${baseDoc.name} (${creatureType})`;
    const typeKey  = creatureType.toLowerCase();

    // Check if they already have one of this type (flag first, name fallback)
    const existing = liveActor.items?.find(i =>
      i.flags?.["ardisfoxxs-lewd-pf2e"]?.cumType === typeKey || i.name === vialName
    );
    if (existing) {
      await existing.update({ "system.quantity": (existing.system?.quantity ?? 1) + 1 });
    } else {
      const itemData = baseDoc.toObject();
      itemData.name = vialName;
      itemData.system.quantity = 1;
      // Store the type in a flag for matching during crafting
      if (!itemData.flags) itemData.flags = {};
      if (!itemData.flags["ardisfoxxs-lewd-pf2e"]) itemData.flags["ardisfoxxs-lewd-pf2e"] = {};
      itemData.flags["ardisfoxxs-lewd-pf2e"].cumType = typeKey;
      await liveActor.createEmbeddedDocuments("Item", [itemData]);
    }

    await ChatMessage.create({
      content: `<div class="aflp-chat-card"><p><strong>${liveActor.name}</strong> collects a sample into a vial: <strong>${vialName}</strong>.</p></div>`,
      speaker: { alias: "AFLP" },
    });
  },

  // How high an item level this Alcumist can reach.
  //
  // Two ceilings, and the lower wins. Character level is PF2e's own rule for
  // Advanced Alchemy. The Cumcraft feats are the other: they grant "access to all
  // uncommon Alcumical items of level N and lower", and since EVERY craftable in
  // the pack is uncommon or rarer, that access line is the real gate rather than a
  // side condition. Without a Cumcraft feat you are limited to the Dedication's
  // three starting formulas, so the floor is deliberately low.
  //
  // Deliberately NOT gated on the consumable trait, even though Advanced Alchemy
  // requires it: a third of the list is bombs, which are weapons, and the
  // Dedication names them as craftable.
  ACCESS: { "Greater Cumcraft": 99, "Advanced Cumcraft": 10, "Basic Cumcraft": 4 },
  STARTER_FORMULAS: ["Willpower Elixir (Lesser)", "Arousal Suppressor", "Aphrodisiac Charge"],

  accessLevel(actor) {
    let best = 0;
    for (const it of (actor?.items ?? [])) {
      const n = this.ACCESS[it?.name];
      if (n && n > best) best = n;
    }
    return best;
  },

  maxCraftLevel(actor) {
    return Math.min(Number(actor?.level ?? 0), this.accessLevel(actor));
  },

  // Refined Formula lets you spend 2 distillates to exceed your access by 2.
  hasRefinedFormula(actor) {
    return (actor?.items ?? []).some(it => it?.name === "Refined Formula");
  },

  canCraft(actor, entry) {
    return this.craftTier(actor, entry) !== null;
  },

  // null = out of reach, "normal" = one distillate, "reach" = two, via Refined
  // Formula's "an item of a level up to 2 higher than your current maximum".
  craftTier(actor, entry) {
    const lvl = Number(entry?.system?.level?.value ?? 0);
    // Two independent gates: you must KNOW the formula, and it must be within
    // your access level. Knowing a high-level formula does not let you make it.
    if (!AFLP.alcumy.knownFormulas(actor).includes(entry?.name)) return null;
    if (this.STARTER_FORMULAS.includes(entry?.name)) return "normal";
    const cap = this.maxCraftLevel(actor);
    if (lvl <= cap) return "normal";
    if (this.hasRefinedFormula(actor) && lvl <= cap + 2) return "reach";
    return null;
  },

  // The craft and learn gates filter on system.level, which only exists in the
  // compendium index if some earlier call happened to request it. Relying on
  // that made the LEVEL GATE FAIL OPEN - every item read as level undefined,
  // which is 0, which passes. Both entry points await this first.
  INDEX_FIELDS: ["name", "type", "folder", "system.level", "system.traits"],
  async ensureIndex() {
    const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
    await pack.getIndex({ fields: this.INDEX_FIELDS });
    return pack;
  },

  // Formulas the character could still choose to learn: within access, not
  // already known. Offered when they have unspent picks from a Cumcraft feat.
  learnableFormulas(actor) {
    const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
    const known = AFLP.alcumy.knownFormulas(actor);
    const cap = this.maxCraftLevel(actor);
    return [...pack.index]
      .filter(e => (e.folder === this.ALCUM_FOLDER_ID || e.folder === this.BOMB_FOLDER_ID) && e.type !== "feat")
      .filter(e => !known.includes(e.name))
      .filter(e => Number(e.system?.level?.value ?? 0) <= cap)
      .sort((a, b) => (a.system?.level?.value ?? 0) - (b.system?.level?.value ?? 0));
  },

  // Refined Formula is usable Intelligence-modifier times per day, minimum 1.
  reachUsesMax(actor) {
    const mod = Number(actor?.system?.abilities?.int?.mod ?? 0);
    return Math.max(1, mod);
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
  // Offered before crafting when a Cumcraft feat has granted picks that have not
  // been spent. Existing characters land here on their next daily preparations,
  // which is what makes the formula gate safe to switch on mid-campaign.
  async showLearnDialog(actor) {
    const picks = AFLP.alcumy.picksRemaining(actor);
    if (picks <= 0) return 0;
    await this.ensureIndex();
    const options = this.learnableFormulas(actor);
    if (!options.length) return 0;
    const rows = options.map(e => `
      <label style="display:block;padding:2px 0;">
        <input type="checkbox" name="learn-${e._id}" data-name="${e.name}" style="accent-color:#c8a050;"/>
        ${e.name} <span style="opacity:.6;font-size:11px;">(Level ${e.system?.level?.value ?? 0})</span>
      </label>`).join("");
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: "Alcumist Formulas" },
      content: `<p><strong>${actor.name}</strong> can learn <strong>${picks}</strong> more formula${picks !== 1 ? "s" : ""}.</p>
        <div style="max-height:320px;overflow:auto;">${rows}</div>
        <p id="learn-err" style="color:#b04040;display:none;margin-top:4px;"></p>`,
      buttons: [
        { action: "ok", label: "Learn", default: true, callback: (ev, btn) => {
            const el = btn.form ?? btn.element ?? document;
            const sel = [...el.querySelectorAll("input[name^='learn-']:checked")].map(i => i.dataset.name);
            return sel.slice(0, picks);
          } },
        { action: "skip", label: "Later", callback: () => [] },
      ],
      rejectClose: false,
    });
    const names = Array.isArray(picked) ? picked : [];
    if (!names.length) return 0;
    return await AFLP.alcumy.learn(actor, names);
  },

  async showCraftingDialog(actor, vialCount) {
    if (!vialCount || vialCount <= 0) return;

    // Load all Alcumical items from the compendium
    const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
    await AFLP_Alcumist.ensureIndex();
    const alcumItems = [...pack.index]
      .filter(e => (e.folder === AFLP_Alcumist.ALCUM_FOLDER_ID || e.folder === AFLP_Alcumist.BOMB_FOLDER_ID) && e.type !== "feat")
      // Item level ceiling: the lower of character level and Cumcraft access.
      // This is what makes Basic/Advanced/Greater Cumcraft do anything at all -
      // they have been inert because nothing read their access lines.
      .filter(e => AFLP_Alcumist.canCraft(actor, e))
      .map(e => { e = { ...e }; e._reach = AFLP_Alcumist.craftTier(actor, e) === "reach"; return e; })
      .sort((a, b) => (a.system?.level?.value ?? 0) - (b.system?.level?.value ?? 0));

    // Get typed cum bottles in actor's inventory (flag first, legacy names fallback)
    const typedVials = actor.items?.filter(i =>
      i.flags?.["ardisfoxxs-lewd-pf2e"]?.cumType ||
      // "Vial of Cum" is the PRE-RENAME name, kept so characters created before
      // PF2e's Vial of Cum became Bottled Cum still have their typed bottles
      // recognised. Do not remove it as dead - it is legacy data support.
      /^(Bottled Cum|Vial of Cum) \(.+\)$/.test(i.name ?? "")
    ) ?? [];
    const vialsByType = {};
    for (const v of typedVials) {
      const type = v.flags?.["ardisfoxxs-lewd-pf2e"]?.cumType
        ?? (v.name.match(/\((.+)\)$/)?.[1]?.toLowerCase() ?? null);
      if (type) {
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
      // Renamed from "Cum Volume Enhancer" when Cum Volume was retired in 1.0.12.
      // THIS MAP IS KEYED BY ITEM NAME, so the rename left a dead entry here: the
      // pack item has been called Load Restorative ever since and matched
      // nothing, while a key nothing carries sat in its place. Neither reads as
      // broken - the lookup just quietly returns undefined. Found 17 Aug 2026 by
      // checking the shipped pack for the old name rather than trusting the map.
      // WHAT WOULD MAKE THIS STALE: another rename. A name-keyed map has to be
      // swept on every one; the aflrKey path does not.
      "Load Restorative":                 ["dragon","giant","beast"],
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

    // A Bottle of Milky Cum is the wildcard ingredient: too mixed to name a
    // single source, so it stands in for whichever specific creature's cum a
    // recipe wanted. It is not stronger than a typed vial, just universal.
    const milkyBottles = AFLP.cumBottle?.count?.(actor) ?? 0;
    // Bottle of Milky Cum is both an ingredient and a product: cut a Bottled Cum
    // with a Bottled Milk and you get the wildcard. It lives in Ingredients rather
    // than Alcumical, so it is added to the list explicitly rather than by folder.
    const bottledMilk = AFLP.milkBottle?.count?.(actor) ?? 0;
    const milkyRecipe = (() => {
      const u = AFLP.cumBottle?.uuid?.();
      if (!u || bottledMilk <= 0) return null;
      const id = String(u).split(".").pop();
      return { _id: id, name: "Bottle of Milky Cum", type: "consumable", system: { level: { value: 0 } }, _needsMilk: true };
    })();
    if (milkyRecipe) alcumItems.push(milkyRecipe);

    // Check which items can be augmented. A typed vial always wins, so the
    // wildcard is saved for a recipe that has nothing else to satisfy it.
    function canAugment(itemName) {
      const types = ITEM_TYPES[itemName];
      if (!types) return null;
      for (const type of types) {
        if ((vialsByType[type] ?? 0) > 0) return type;
      }
      return milkyBottles > 0 ? "milky" : null;
    }

    // Build dialog content
    const itemRows = alcumItems.map(entry => {
      const augType = canAugment(entry.name);
      const hasAug = augType !== null;
      const levelBadge = `<span style="font-size:10px;color:#888;margin-left:4px;">L${entry.system?.level?.value ?? "?"}</span>`;
      const reachBadge = entry._reach
        ? `<span style="font-size:10px;color:#b06a9a;margin-left:6px;" title="Above your normal access - Refined Formula, costs 2 distillates">[Reach, 2]</span>`
        : "";
      const augBadge = entry._needsMilk
        ? `<span style="font-size:10px;color:#c8a050;margin-left:6px;" title="Consumes a Bottled Milk as well as the vial">[+ Bottled Milk]</span>`
        : hasAug
        ? `<span style="font-size:10px;color:#c8a050;margin-left:6px;" title="You have ${augType} cum">[Augmentable]</span>`
        : "";
      return `<tr>
        <td style="padding:4px 4px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;">
            <input type="number" min="0" step="1" value="0" style="width:44px;margin-right:6px;"
                   name="craft-${entry._id}" data-name="${entry.name}"
                   data-aug-type="${augType ?? ""}" data-needs-milk="${entry._needsMilk ? "1" : ""}"
                   data-reach="${entry._reach ? "1" : ""}"
                   style="accent-color:#c8a050;width:13px;height:13px;"/>
            <span>${entry.name}${levelBadge}${reachBadge}${augBadge}</span>
          </label>
        </td>
        <td style="padding:4px;text-align:center;">
          <input type="checkbox" name="augment-${entry._id}"
                 data-for="${entry._id}"
                 ${(!hasAug || entry._needsMilk) ? 'disabled style="opacity:0.3;"' : 'style="accent-color:#c8a050;"'}
                 title="${hasAug ? `Use a ${augType.charAt(0).toUpperCase()+augType.slice(1)} cum bottle to Augment` : 'No matching sample'}"
          />
        </td>
      </tr>`;
    }).join("");

    const milkySummary = milkyBottles ? `${milkyBottles}x Milky (wildcard)` : "";
    const vialSummary = Object.entries(vialsByType).length
      ? Object.entries(vialsByType).map(([t, n]) => `${n}x ${t.charAt(0).toUpperCase()+t.slice(1)}`).join(", ")
      : "None";
    const samplesLine = [vialSummary === "None" ? "" : vialSummary, milkySummary].filter(Boolean).join(", ") || "None";

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
          <strong>${actor.name}</strong> has <strong id="alcumist-remaining">${vialCount}</strong> distillate${vialCount !== 1 ? "s" : ""} today.
          <div style="font-size:11px;color:#aaa;margin-top:2px;">Samples in inventory: ${samplesLine}</div>
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
            const checked = [...el.querySelectorAll("input[name^='craft-']")]
              .reduce((n, i) => n + Math.max(0, Number(i.value) || 0), 0);
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
            const craftChecks = [...el.querySelectorAll("input[name^='craft-']")]
              .filter(i => (Number(i.value) || 0) > 0);
            const totalQty = craftChecks.reduce((n, i) => n + Math.max(0, Number(i.value) || 0), 0);
            if (totalQty > vialCount) {
              const errEl = el.querySelector("#alcumist-error");
              if (errEl) { errEl.textContent = `You only have ${vialCount} distillate${vialCount !== 1 ? "s" : ""}.`; errEl.style.display = ""; }
              return false;
            }
            const selections = craftChecks.map(cb => {
              const id = cb.name.replace("craft-","");
              const augCb = el.querySelector(`input[name='augment-${id}']`);
              return { id, name: cb.dataset.name, augType: cb.dataset.augType || null,
                       augment: augCb?.checked ?? false, needsMilk: cb.dataset.needsMilk === "1",
                       reach: cb.dataset.reach === "1",
                       qty: Math.max(1, Number(cb.value) || 1) };
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
    const pack = game.packs.get(AFLP.CONTENT_ITEMS_PACK);
    const createdItems = [];
    let reachUsed = 0;

    for (const sel of selections) {
      const entry = pack.index.find(e => e._id === sel.id);
      if (!entry) continue;
      const doc = await pack.getDocument(sel.id);
      const itemData = doc.toObject();
      const qty = Math.max(1, Number(sel.qty) || 1);

      // One distillate per copy, or two for a Refined Formula reach. Taken up
      // front so a partial pool yields a partial batch rather than crafting on
      // credit. Reach crafts are also capped per day at the Intelligence modifier.
      const cost = sel.reach ? 2 : 1;
      let want = qty;
      if (sel.reach) {
        const left = Math.max(0, AFLP_Alcumist.reachUsesMax(actor) - reachUsed);
        want = Math.min(want, left);
      }
      // Cap against EVERY cost before paying any of them. Spending distillates
      // first and discovering the milk ran out afterwards produced free bottles:
      // a partial milk spend still passed the old "took < 1" guard and created
      // the full batch.
      if (sel.needsMilk) want = Math.min(want, AFLP.milkBottle?.count?.(actor) ?? 0);
      if (want < 1) continue;

      const paid = await AFLP.alcumy.spend(actor, want * cost);
      const made = Math.floor(paid / cost);
      if (made < 1) continue;
      if (sel.reach) reachUsed += made;
      itemData.system.quantity = made;

      // Milky cum costs a Bottled Milk per copy, on top of the distillate.
      if (sel.needsMilk) {
        const took = await AFLP.milkBottle?.spend?.(actor, made) ?? 0;
        if (took < 1) continue;   // no milk, no bottle
      }

      if (sel.augment && sel.augType) {
        // Mark as augmented
        itemData.name = itemData.name + " (Augmented)";
        if (!itemData.flags["ardisfoxxs-lewd-pf2e"]) itemData.flags["ardisfoxxs-lewd-pf2e"] = {};
        itemData.flags["ardisfoxxs-lewd-pf2e"].augmented = true;
        itemData.flags["ardisfoxxs-lewd-pf2e"].augType = sel.augType;

        // Consume one matching typed cum bottle from inventory (flag first,
        // legacy names fallback)
        if (sel.augType === "milky") {
          await AFLP.cumBottle?.spend?.(actor, 1);
          createdItems.push(itemData);
          continue;
        }
        const typeCap = sel.augType.charAt(0).toUpperCase() + sel.augType.slice(1);
        const vial = actor.items?.find(i =>
          i.flags?.["ardisfoxxs-lewd-pf2e"]?.cumType === sel.augType ||
          i.name === `Bottled Cum (${typeCap})` || i.name === `Vial of Cum (${typeCap})`);
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
