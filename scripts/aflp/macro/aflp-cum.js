// ===============================
// AFLP – Cum Macro (World Actor Version)
// ===============================
(async () => {
  if (!window.AFLP || !window.AFLP_PROSE) {
    ui.notifications.error("AFLP schema or prose not loaded!");
    return;
  }

  const FLAG = AFLP.FLAG_SCOPE;
  const HOLE_MESSAGES = AFLP_PROSE.holes;
  const GANGBANG_MESSAGES = AFLP_PROSE.gangbangs;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const sourceTokens = canvas.tokens.controlled;
  if (!sourceTokens.length) return ui.notifications.warn("Select at least one source token.");
  const targets = Array.from(game.user.targets);
  if (targets.length !== 1) return ui.notifications.warn("Target exactly one token.");

  const targetActor = targets[0].actor?.getWorldActor?.() ?? targets[0].actor;
  await AFLP.ensureCoreFlags(targetActor);
  const hasPussy = targetActor.getFlag(FLAG, "pussy") === true;

  const isMultiSource = sourceTokens.length > 1;
  const sourceCount = sourceTokens.length;

  // -----------------------------------------------
  // Hole selection dialog
  // Returns: { holeAssignments: { oral: N, vaginal: N, anal: N, facial: N } }
  //   where N is number of partners assigned to that hole (0 = not selected)
  // -----------------------------------------------
  const holeAssignments = await new Promise(resolve => {
    const holeOptions = [
      { value: "oral",    label: "Mouth" },
      ...(hasPussy ? [{ value: "vaginal", label: "Pussy" }] : []),
      { value: "anal",    label: "Ass" },
      { value: "facial",  label: "Facial" }
    ];

    // Build dialog content
    let formContent = "";

    if (!isMultiSource) {
      // Single source: simple checkboxes
      formContent = holeOptions.map(h =>
        `<label style="display:block;margin-bottom:4px">
          <input type="checkbox" name="hole-${h.value}" value="${h.value}"/> ${h.label}
        </label>`
      ).join("");
    } else {
      // Multi-source: checkbox + number input per hole
      formContent = `
        <p style="margin:0 0 8px 0;color:#888"><em>${sourceCount} sources selected. Assign each partner to a hole.</em></p>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <th style="text-align:left;padding:4px">Hole</th>
            <th style="text-align:center;padding:4px">Partners</th>
          </tr>
          ${holeOptions.map(h => `
          <tr>
            <td style="padding:4px">
              <label><input type="checkbox" name="hole-${h.value}" class="aflp-hole-check" data-hole="${h.value}"/> ${h.label}</label>
            </td>
            <td style="text-align:center;padding:4px">
              <input
                type="number"
                name="count-${h.value}"
                value="0"
                min="0"
                max="${sourceCount}"
                style="width:50px;text-align:center"
                data-hole="${h.value}"
              />
            </td>
          </tr>`).join("")}
        </table>
        <div id="aflp-assign-total" style="margin-top:8px;font-weight:bold">Partners assigned: 0 / ${sourceCount}</div>
        <div id="aflp-assign-error" style="color:red;margin-top:4px;display:none"></div>
      `;
    }

    const d = new Dialog({
      title: "Select Holes",
      content: `<form id="aflp-hole-form">${formContent}</form>`,
      buttons: {
        ok: {
          label: "Cum",
          callback: html => {
            const result = {};

            if (!isMultiSource) {
              // Single source: checked holes each get count 1
              html[0].querySelectorAll("input[type=checkbox]:checked").forEach(el => {
                const hole = el.name.replace("hole-", "");
                result[hole] = 1;
              });
              if (!Object.keys(result).length) {
                ui.notifications.warn("Select at least one hole.");
                return false; // keep dialog open
              }
            } else {
              // Multi-source: read counts
              let total = 0;
              holeOptions.forEach(h => {
                const checkbox = html[0].querySelector(`input[name="hole-${h.value}"]`);
                const countInput = html[0].querySelector(`input[name="count-${h.value}"]`);
                const count = parseInt(countInput?.value ?? "0", 10) || 0;
                if (checkbox?.checked && count > 0) {
                  result[h.value] = count;
                  total += count;
                }
              });

              if (!Object.keys(result).length) {
                const errEl = html[0].querySelector("#aflp-assign-error");
                if (errEl) { errEl.textContent = "Select at least one hole with at least one partner."; errEl.style.display = "block"; }
                return false;
              }

              if (total !== sourceCount) {
                const errEl = html[0].querySelector("#aflp-assign-error");
                if (errEl) { errEl.textContent = `Total partners assigned (${total}) must equal source count (${sourceCount}).`; errEl.style.display = "block"; }
                return false;
              }
            }

            resolve(result);
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      render: html => {
        if (!isMultiSource) return;

        // Wire checkboxes to auto-set count to 1 when checked, 0 when unchecked
        html.find(".aflp-hole-check").on("change", function() {
          const hole = this.dataset.hole;
          const countInput = html.find(`input[name="count-${hole}"]`);
          countInput.val(this.checked ? 1 : 0).trigger("input");
        });

        // Update running total on any count/checkbox change
        const updateTotal = () => {
          let total = 0;
          holeOptions.forEach(h => {
            const cb = html.find(`input[name="hole-${h.value}"]`)[0];
            const ct = parseInt(html.find(`input[name="count-${h.value}"]`).val() || "0", 10);
            if (cb?.checked && ct > 0) total += ct;
          });
          html.find("#aflp-assign-total").text(`Partners assigned: ${total} / ${sourceCount}`);
          html.find("#aflp-assign-error").hide();
        };

        html.find("input[type=number]").on("input", updateTotal);
        html.find(".aflp-hole-check").on("change", updateTotal);
      }
    }, { width: 340 });

    d.render(true);
  });

  if (!holeAssignments || !Object.keys(holeAssignments).length) return;

  // selectedHoles array (for prose lookups)
  const selectedHoles = Object.keys(holeAssignments);

  // -----------------------------------------------
  // Build a map: sourceToken → assigned hole
  // For single source, all holes go to that source
  // For multi-source, distribute by partner count
  // -----------------------------------------------
  const sourceHoleMap = []; // [{ sourceToken, hole }]

  if (!isMultiSource) {
    for (const hole of selectedHoles) {
      sourceHoleMap.push({ sourceToken: sourceTokens[0], hole });
    }
  } else {
    let tokenIndex = 0;
    for (const [hole, count] of Object.entries(holeAssignments)) {
      for (let i = 0; i < count; i++) {
        if (tokenIndex < sourceTokens.length) {
          sourceHoleMap.push({ sourceToken: sourceTokens[tokenIndex], hole });
          tokenIndex++;
        }
      }
    }
  }

  // -----------------------------------------------
  // Load target state
  // -----------------------------------------------
  const sexualStatsDialog = new AFLP.UI.SexualStatsDialog(targetActor);
  await sexualStatsDialog.load();

  const cumFlags = AFLP_Cumflation.getCumflation(targetActor);
  const cumOverflow = AFLP_Cumflation.getCumOverflow(targetActor);

  const pregnancies = structuredClone(await targetActor.getFlag(FLAG, "pregnancy") ?? {});
  const POTION_1 = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.jQ3G8jwA2boYGVrr";
  const POTION_2 = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.n6N4vZCs6FvohMF8";
  const BIRTH_CONTROL = "Compendium.ardisfoxxs-lewd-pf2e.aflp-lewd-items.Item.ZHMYtfYLHQI1hHnX";

  const hasPotionOfBreeding = targetActor.items.some(i => [POTION_1, POTION_2].includes(i.sourceId));
  const hasBirthControl = targetActor.items.some(i => i.sourceId === BIRTH_CONTROL);

  const hasExistingPregnancy = Object.keys(pregnancies).length > 0;
  const pregnancyBlocked = hasExistingPregnancy && !hasPotionOfBreeding;

  const impregnationEvents = [];

  // -----------------------------------------------
  // Process each source → hole assignment
  // -----------------------------------------------
  // Track which sources have already spent cum this macro run
  const sourceCumSpent = new Map(); // sourceToken.id → cumUnitsSpent

  for (const { sourceToken, hole } of sourceHoleMap) {
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    const hasCock = sourceActor.getFlag(FLAG, "cock") === true;
    const cockTypes = sourceActor.getFlag(FLAG, "cockTypes") ?? sourceActor.getFlag(FLAG, "genitalTypes") ?? {};
    if (!hasCock) continue;

    // Only spend cum once per source actor across multiple hole assignments
    let cumUnitsSpent = sourceCumSpent.get(sourceToken.id);
    if (cumUnitsSpent === undefined) {
      const cum = sourceActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
      cumUnitsSpent = Math.floor(cum.current / 2);
      if (cumUnitsSpent <= 0) continue;

      await sourceActor.setFlag(FLAG, "cum", { current: cum.current - cumUnitsSpent, max: cum.max });

      const sourceSexual = structuredClone(sourceActor.getFlag(FLAG, "sexual"));
      sourceSexual.lifetime.cumGiven = (sourceSexual.lifetime.cumGiven || 0) + cumUnitsSpent;
      await sourceActor.setFlag(FLAG, "sexual", sourceSexual);

      sourceCumSpent.set(sourceToken.id, cumUnitsSpent);
    }

    // Apply cumflation for this specific hole
    AFLP_Cumflation.applyCumflation(targetActor, cumFlags, cumOverflow, sexualStatsDialog, [hole], cumUnitsSpent);

    // Impregnation check
    if (!pregnancyBlocked && hole === "vaginal" && hasPussy && !hasBirthControl) {
      const pregResult = await AFLP_Pregnancy.attemptImpregnation(targetActor, sourceActor, cockTypes, hasPotionOfBreeding);
      if (pregResult) {
        pregResult.source = pregResult.sourceName || sourceActor.name || "Unknown";
        impregnationEvents.push(pregResult);
      }
    } else if (pregnancyBlocked && hole === "vaginal") {
      impregnationEvents.push({ source: sourceActor.name, sourceName: sourceActor.name, blocked: true });
    }
  }

  // -----------------------------------------------
  // Increment lifetime act counters
  // -----------------------------------------------
  for (const [hole, count] of Object.entries(holeAssignments)) {
    if (hole in (sexualStatsDialog.sexual.lifetime)) {
      sexualStatsDialog.sexual.lifetime[hole] = (sexualStatsDialog.sexual.lifetime[hole] ?? 0) + count;
    }
  }

  // Increment gangbang counter if more than one source
  if (sourceCount > 1) {
    sexualStatsDialog.sexual.lifetime.gangbang = (sexualStatsDialog.sexual.lifetime.gangbang ?? 0) + 1;
  }

  // -----------------------------------------------
  // Save all state
  // -----------------------------------------------
  await AFLP_Cumflation.saveCumflation(targetActor, cumFlags, cumOverflow);
  await AFLP_Cumflation.applyCumflationEffects(targetActor);
  await targetActor.setFlag(FLAG, "sexual", sexualStatsDialog.sexual);

  // -----------------------------------------------
  // Build prose output
  // -----------------------------------------------
  const proseParts = [];
  if (!isMultiSource) {
    for (const hole of selectedHoles) {
      if (HOLE_MESSAGES[hole]) proseParts.push(pick(HOLE_MESSAGES[hole]));
    }
  } else {
    const core = selectedHoles.filter(h => h !== "facial").sort().join("-");
    if (GANGBANG_MESSAGES[core]) proseParts.push(pick(GANGBANG_MESSAGES[core]));
    if (selectedHoles.includes("facial")) proseParts.push(pick(HOLE_MESSAGES.facial));
  }

  const sections = [
    `<strong>${targetActor.name}</strong> is used by <strong>${sourceTokens.map(t => t.name).join(", ")}</strong>.`,
    ...proseParts,
    ...impregnationEvents.map(ev => {
      if (ev.blocked) return `<strong>${ev.source}</strong> tries to breed <strong>${targetActor.name}</strong>, but they are already pregnant.`;
      if (ev.deliveryType === "egg") return `<strong>${ev.source}</strong> oviposited ${ev.offspring} eggs inside <strong>${targetActor.name}</strong>!`;
      return `<strong>${ev.source}</strong> impregnated <strong>${targetActor.name}</strong> with ${ev.offspring} offspring!`;
    })
  ];

  ChatMessage.create({ content: sections.join("<br><br>") });
})();
