// ===============================
// AFLP – Reactive Arousal UI Integration
// ===============================

Hooks.once("ready", async () => {

  // -------------------------------
  // Token Resource Bar: Arousal
  // -------------------------------
  if (CONFIG.Canvas?.tokens) {
    CONFIG.Canvas.tokens.bars["arousal"] = {
      attribute: "system.resources.arousal",
      color: "#FF69B4",
      overlay: true,
      label: "Arousal",
      hideIfEmpty: true
    };
  }

  // -------------------------------
  // Helper: Update arousal HTML elements
  // -------------------------------
  function updateArousalElements(actor) {
    const val = actor.system.resources.arousal?.value ?? 0;
    const max = actor.system.resources.arousal?.max ?? 6;

    // Update Character Sheet
    const sheetContainer = $(`.aflp-arousal[data-actor-id="${actor.id}"]`);
    sheetContainer.find("label").text(`Arousal: ${val}/${max}`);
    sheetContainer.find("progress").val(val).attr("max", max);

    // Update Sexual Stats Dialog
    const dialogContainer = $(`.aflp-dialog-arousal[data-actor-id="${actor.id}"]`);
    dialogContainer.find("label").text(`Arousal: ${val}/${max}`);
    dialogContainer.find("progress").val(val).attr("max", max);
  }

  // -------------------------------
  // Extend PF2E Character Sheet
  // -------------------------------
  Hooks.on("renderActorSheetPF2eCharacter", (sheet, html) => {
    const actor = sheet.actor;
    if (!actor?.system?.resources?.arousal) return;

    let container = html.find(".resources");
    if (!container.length || container.find(".aflp-arousal").length) return;

    const arousalValue = actor.system.resources.arousal.value ?? 0;
    const arousalMax = actor.system.resources.arousal.max ?? 6;

    const arousalHtml = $(`
      <div class="aflp-arousal" data-actor-id="${actor.id}" style="margin-top:5px;">
        <label>Arousal: ${arousalValue}/${arousalMax}</label>
        <progress value="${arousalValue}" max="${arousalMax}" style="width:100%; height:12px; background:#222; color:#FF69B4;"></progress>
      </div>
    `);

    container.append(arousalHtml);
  });

  // -------------------------------
  // Sexual Stats Dialog
  // -------------------------------
  Hooks.on("renderAFLPSexualStatsDialog", (dialog, html) => {
    const actor = dialog.actor;
    if (!actor?.system?.resources?.arousal) return;

    const arousalValue = actor.system.resources.arousal.value ?? 0;
    const arousalMax = actor.system.resources.arousal.max ?? 6;

    const barHtml = $(`
      <div class="aflp-dialog-arousal" data-actor-id="${actor.id}" style="margin:5px 0;">
        <label>Arousal: ${arousalValue}/${arousalMax}</label>
        <progress value="${arousalValue}" max="${arousalMax}" style="width:100%; height:12px; background:#222; color:#FF69B4;"></progress>
      </div>
    `);

    html.append(barHtml);
  });

  // -------------------------------
  // Listen for actor updates
  // -------------------------------
  Hooks.on("updateActor", (actor) => {
    if (actor.system?.resources?.arousal) {
      updateArousalElements(actor);
    }
  });

  // -------------------------------
  // Listen for token updates (if bar changes via token)
  // -------------------------------
  Hooks.on("updateToken", (token, changes) => {
    const actor = token.actor;
    if (actor?.system?.resources?.arousal) {
      updateArousalElements(actor);
    }
  });

  console.log("AFLP | Reactive Arousal UI initialized");
});
