// ===============================
// AFLP – Cum Macro (World Actor Version)
// ===============================
(async () => {
  if (!window.AFLP || !window.AFLP_PROSE) {
    ui.notifications.error("AFLP schema or prose not loaded!");
    return;
  }

  const FLAG            = AFLP.FLAG_SCOPE;
  const HOLE_MESSAGES   = AFLP_PROSE.holes;
  const GANGBANG_MESSAGES = AFLP_PROSE.gangbangs;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const sourceTokens = canvas.tokens.controlled;
  if (!sourceTokens.length) return ui.notifications.warn("Select at least one source token.");
  const targets = Array.from(game.user.targets);
  if (targets.length !== 1) return ui.notifications.warn("Target exactly one token.");

  const targetActor = targets[0].actor?.getWorldActor?.() ?? targets[0].actor;
  await AFLP.ensureCoreFlags(targetActor);
  const hasPussy = targetActor.getFlag(FLAG, "pussy") === true;
  const targetHasCock = targetActor.getFlag(FLAG, "cock") === true;

  // ── Read stored positions from H scene (position tracking) ──────────────
  // Build a map of sourceToken.id → holeId for cock-having sources that have
  // a penile position assigned in the active scene.
  // If ALL cock-having sources have a penile position, skip the dialog entirely.
  const _storedPositions = new Map(); // token.id → holeId
  if (AFLP.Settings.positionTracking && AFLP.Settings.hsceneEnabled) {
    const hscene = AFLP.HScene._getScene?.(targetActor.id);
    if (hscene) {
      for (const atk of (hscene.attackers ?? [])) {
        const posEntry = atk.position ? AFLP.getPosition(atk.position) : null;
        if (posEntry?.holeId) {
          // Penile position with a hole mapping — use it
          _storedPositions.set(atk.id, posEntry.holeId);
        }
        // Non-penile position → holeId is null → will show dialog for this source
      }
    }
  }

  // Single-source both-have-cocks: target may cum into source too
  const sourceActor0 = sourceTokens[0]?.actor?.getWorldActor?.() ?? sourceTokens[0]?.actor;
  const sourceHasCock = sourceTokens.length === 1 && (sourceActor0?.getFlag(FLAG, "cock") === true);
  const bothHaveCocks = sourceHasCock && targetHasCock;

  const isMultiSource = sourceTokens.length > 1;
  const sourceCount   = sourceTokens.length;

  // -----------------------------------------------
  // Only show hole dialog if at least one source actor has a cock.
  // If no source has a cock, there is nothing to cumflate into the target.
  // Both-have-pussies case: skip straight to a simple chat message.
  // -----------------------------------------------
  const anySourceHasCock = sourceTokens.some(t => {
    const a = t.actor?.getWorldActor?.() ?? t.actor;
    return a?.getFlag(FLAG, "cock") === true;
  });

  if (!anySourceHasCock) {
    // No cock present — nothing to cumflate. Post a simple chat message and exit.
    const srcNames = sourceTokens.map(t => t.name).join(", ");
    ChatMessage.create({
      content: `<strong>${srcNames}</strong> and <strong>${targetActor.name}</strong> reach mutual satisfaction.`
    });
    return;
  }

  // ── Check if we can skip the dialog entirely ─────────────────────────────
  // All cock-having sources have a penile position stored → skip dialog.
  // Exception: the bothHaveCocks reverse direction still needs a dialog.
  const _cockSources = sourceTokens.filter(t => {
    const a = t.actor?.getWorldActor?.() ?? t.actor;
    return a?.getFlag(FLAG, "cock") === true;
  });
  const _allHaveStoredPosition = _cockSources.length > 0 &&
    _cockSources.every(t => _storedPositions.has(t.id));

  let dialogResult;

  if (_allHaveStoredPosition && !bothHaveCocks) {
    // Build holeAssignments directly from stored positions — no dialog
    const autoHoles = {};
    for (const t of _cockSources) {
      const holeId = _storedPositions.get(t.id);
      autoHoles[holeId] = (autoHoles[holeId] ?? 0) + 1;
    }
    dialogResult = { sourceHoles: autoHoles, targetHoles: null };
  } else {
  // -----------------------------------------------
  // Hole selection dialog (fallback / bothHaveCocks)
  // Returns { sourceHoles, targetHoles }
  // -----------------------------------------------
  dialogResult = await new Promise(resolve => {
    // Holes available to cum INTO the target
    const targetHoleOptions = [
      { value: "oral",   label: "Mouth" },
      ...(hasPussy ? [{ value: "vaginal", label: "Pussy" }] : []),
      { value: "anal",   label: "Ass" },
      { value: "facial", label: "Facial" }
    ];
    // Holes available to cum INTO the source (when target also has a cock)
    const sourceActor0Pussy = sourceActor0?.getFlag(FLAG, "pussy") === true;
    const sourceHoleOptions = [
      { value: "oral",   label: "Mouth" },
      ...(sourceActor0Pussy ? [{ value: "vaginal", label: "Pussy" }] : []),
      { value: "anal",   label: "Ass" },
      { value: "facial", label: "Facial" }
    ];
    // Legacy alias for single-source single-direction path
    const holeOptions = targetHoleOptions;

    // ── Styled cum dialog ──────────────────────────────────────────────────
    // Actor portraits header + H-scene-card styling throughout.
    const sourceActor0Name = sourceActor0?.name ?? "Source";
    const sourceActor0Img  = sourceActor0?.img  ?? "";
    const targetActorImg   = targetActor?.img   ?? "";

    const makeHoleBtn = (h, prefix) =>
      `<label style="display:flex;align-items:center;gap:8px;
                     background:rgba(255,255,255,0.06);
                     border:1px solid rgba(200,160,80,0.25);
                     border-radius:4px;padding:5px 10px;
                     margin-bottom:4px;cursor:pointer;
                     font-size:12px;font-family:var(--font-primary,serif);
                     color:#f0e8d0;">
        <input type="checkbox" name="${prefix}${h.value}" value="${h.value}"
               style="accent-color:#c8a050;width:13px;height:13px;flex-shrink:0;"/>
        ${h.label}
      </label>`;

    const portraitStyle = (border) =>
      `width:44px;height:44px;border-radius:4px;overflow:hidden;
       border:1px solid ${border};flex-shrink:0;`;
    const portraitImg = (src, name) =>
      `<div style="${portraitStyle("rgba(200,160,80,0.4)")}">
         <img src="${src}" alt="${name}" style="width:100%;height:100%;object-fit:cover;object-position:top;"/>
       </div>`;
    const targetPortraitImg = (src, name) =>
      `<div style="${portraitStyle("rgba(200,100,100,0.6)")}">
         <img src="${src}" alt="${name}" style="width:100%;height:100%;object-fit:cover;object-position:top;"/>
       </div>`;

    let formContent = "";

    if (!isMultiSource && bothHaveCocks) {
      const mkCol = (opts, prefix, actorName, actorImg, isSrc) =>
        `<div style="flex:1;min-width:120px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            ${isSrc ? portraitImg(actorImg, actorName) : targetPortraitImg(actorImg, actorName)}
            <div>
              <div style="font-size:12px;font-weight:bold;color:#f0e8d0;">${actorName}</div>
              <div style="font-size:10px;color:#aaa;">cums into…</div>
            </div>
          </div>
          ${opts.map(h => makeHoleBtn(h, prefix)).join("")}
        </div>`;
      formContent = `
        <div style="display:flex;gap:12px;">
          ${mkCol(targetHoleOptions, "src-", sourceActor0Name, sourceActor0Img, true)}
          <div style="width:1px;background:rgba(200,160,80,0.2);flex-shrink:0;margin:0 2px;"></div>
          ${mkCol(sourceHoleOptions, "tgt-", targetActor.name, targetActorImg, false)}
        </div>
        <p style="margin:8px 0 0;font-size:10px;color:#888;font-style:italic;">Leave a column empty if that actor doesn't cum.</p>`;
    } else if (!isMultiSource) {
      formContent = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                    border-bottom:1px solid rgba(200,160,80,0.2);padding-bottom:8px;">
          ${portraitImg(sourceActor0Img, sourceActor0Name)}
          <div style="font-size:16px;color:rgba(200,160,80,0.5);">→</div>
          ${targetPortraitImg(targetActorImg, targetActor.name)}
          <div>
            <div style="font-size:12px;font-weight:bold;color:#f0e8d0;">${sourceActor0Name}</div>
            <div style="font-size:10px;color:#aaa;">is cumming — where?</div>
          </div>
        </div>
        ${holeOptions.map(h => makeHoleBtn(h, "hole-")).join("")}`;
    } else {
      const srcNamesShort = sourceTokens.slice(0,3).map(t=>t.name).join(", ")
        + (sourceTokens.length > 3 ? ` +${sourceTokens.length-3}` : "");
      formContent = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                    border-bottom:1px solid rgba(200,160,80,0.2);padding-bottom:8px;">
          ${targetPortraitImg(targetActorImg, targetActor.name)}
          <div>
            <div style="font-size:12px;font-weight:bold;color:#f0e8d0;">${targetActor.name}</div>
            <div style="font-size:10px;color:#aaa;">${sourceCount} partners — assign each to a hole</div>
            <div style="font-size:10px;color:rgba(200,160,80,0.6);">${srcNamesShort}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;padding:3px 4px;font-size:10px;
                       color:rgba(200,160,80,0.7);font-weight:normal;
                       text-transform:uppercase;letter-spacing:0.06em;">Hole</th>
            <th style="text-align:center;padding:3px 4px;font-size:10px;
                       color:rgba(200,160,80,0.7);font-weight:normal;
                       text-transform:uppercase;letter-spacing:0.06em;">Partners</th>
          </tr>
          ${holeOptions.map(h => `
          <tr>
            <td style="padding:3px 4px;">
              <label style="display:flex;align-items:center;gap:6px;
                            font-size:12px;color:#f0e8d0;cursor:pointer;">
                <input type="checkbox" name="hole-${h.value}" class="aflp-hole-check"
                       data-hole="${h.value}" style="accent-color:#c8a050;"/>
                ${h.label}
              </label>
            </td>
            <td style="text-align:center;padding:3px 4px;">
              <input type="number" name="count-${h.value}" value="0" min="0" max="${sourceCount}"
                style="width:48px;text-align:center;
                       background:rgba(255,255,255,0.07);
                       border:1px solid rgba(200,160,80,0.3);
                       border-radius:3px;color:#f0e8d0;
                       font-size:12px;padding:2px 4px;"
                data-hole="${h.value}"/>
            </td>
          </tr>`).join("")}
        </table>
        <div id="aflp-assign-total" style="margin-top:8px;font-size:11px;font-weight:bold;color:#c8a050;">
          Partners assigned: 0 / ${sourceCount}
        </div>
        <div id="aflp-assign-error" style="color:#e05050;margin-top:4px;font-size:11px;display:none;"></div>`;
    }

    const d = new Dialog({
      title: "Select Holes",
      content: `
        <style>
          .aflp-cum-dialog label:hover {
            background:rgba(200,160,80,0.16) !important;
            border-color:rgba(200,160,80,0.55) !important;
          }
        </style>
        <div style="background:rgba(10,8,6,0.5);border-radius:4px;padding:10px;"
             class="aflp-cum-dialog">
          <form id="aflp-hole-form">${formContent}</form>
        </div>`,
      buttons: {
        ok: {
          label: "Cum",
          callback: html => {
            if (!isMultiSource && bothHaveCocks) {
              const srcHoles = {};
              const tgtHoles = {};
              html[0].querySelectorAll("input[type=checkbox][name^='src-']:checked").forEach(el => {
                srcHoles[el.value] = 1;
              });
              html[0].querySelectorAll("input[type=checkbox][name^='tgt-']:checked").forEach(el => {
                tgtHoles[el.value] = 1;
              });
              if (!Object.keys(srcHoles).length && !Object.keys(tgtHoles).length) {
                ui.notifications.warn("Select at least one hole for at least one actor.");
                return false;
              }
              resolve({ sourceHoles: srcHoles, targetHoles: tgtHoles });
              return;
            }
            const result = {};
            if (!isMultiSource) {
              html[0].querySelectorAll("input[type=checkbox]:checked").forEach(el => {
                result[el.name.replace("hole-", "")] = 1;
              });
              if (!Object.keys(result).length) { ui.notifications.warn("Select at least one hole."); return false; }
            } else {
              let total = 0;
              holeOptions.forEach(h => {
                const cb    = html[0].querySelector(`input[name="hole-${h.value}"]`);
                const count = parseInt(html[0].querySelector(`input[name="count-${h.value}"]`)?.value ?? "0", 10) || 0;
                if (cb?.checked && count > 0) { result[h.value] = count; total += count; }
              });
              if (!Object.keys(result).length) {
                const msg = "AFLP | Select at least one hole with at least one partner.";
                const err = html[0].querySelector("#aflp-assign-error");
                if (err) { err.textContent = msg; err.style.display = "block"; }
                ui.notifications.error(msg);
                console.error(msg);
                return false;
              }
              if (total !== sourceCount) {
                const msg = `AFLP | Total partners assigned (${total}) must equal source count (${sourceCount}).`;
                const err = html[0].querySelector("#aflp-assign-error");
                if (err) { err.textContent = msg; err.style.display = "block"; }
                ui.notifications.error(msg);
                console.error(msg);
                return false;
              }
            }
            resolve({ sourceHoles: result, targetHoles: null });
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      render: html => {
        if (!isMultiSource) return;
        html.find(".aflp-hole-check").on("change", function() {
          html.find(`input[name="count-${this.dataset.hole}"]`).val(this.checked ? 1 : 0).trigger("input");
        });
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
  } // end else (dialog path)

  if (!dialogResult) return;

  // Normalise: single-direction paths resolve({ sourceHoles, targetHoles:null }) or plain object
  // bothHaveCocks path resolves { sourceHoles, targetHoles }
  // legacy single-direction resolve(result) gave a plain holes object — wrap it
  const holeAssignments  = dialogResult.sourceHoles ?? dialogResult;
  const targetCumsIntoSource = dialogResult.targetHoles ?? null; // non-null only for bothHaveCocks path

  if (!Object.keys(holeAssignments).length && !Object.keys(targetCumsIntoSource ?? {}).length) return;

  const selectedHoles = Object.keys(holeAssignments);

  // -----------------------------------------------
  // Build source → hole map
  // -----------------------------------------------
  const sourceHoleMap = [];
  if (!isMultiSource) {
    for (const hole of selectedHoles) sourceHoleMap.push({ sourceToken: sourceTokens[0], hole });
  } else {
    let idx = 0;
    for (const [hole, count] of Object.entries(holeAssignments)) {
      for (let i = 0; i < count; i++) {
        if (idx < sourceTokens.length) { sourceHoleMap.push({ sourceToken: sourceTokens[idx], hole }); idx++; }
      }
    }
  }

  // -----------------------------------------------
  // Load target state
  // -----------------------------------------------
  const sexualStatsDialog = new AFLP.UI.SexualStatsDialog(targetActor);
  await sexualStatsDialog.load();

  const cumFlags   = AFLP_Cumflation.getCumflation(targetActor);
  const cumOverflow = AFLP_Cumflation.getCumOverflow(targetActor);

  const POTION_OF_BREEDING_UUID = AFLP.items?.["potion-of-breeding-effect"]?.uuid ?? null;
  const BIRTH_CONTROL_UUID      = AFLP.items?.["birth-control"]?.uuid ?? null;

  const hasPotionOfBreeding = POTION_OF_BREEDING_UUID ? targetActor.items.some(i => i.sourceId === POTION_OF_BREEDING_UUID) : false;
  const hasBirthControl     = BIRTH_CONTROL_UUID ? targetActor.items.some(i => i.sourceId === BIRTH_CONTROL_UUID) : false;
  const pregnancies         = structuredClone(await targetActor.getFlag(FLAG, "pregnancy") ?? {});
  // Only count pregnancies that are actively gestating (positive days remaining).
  // Completed entries (gestationRemaining === "Complete" or <= 0) are kept for display
  // but must not block new impregnation after birth.
  const hasExistingPregnancy = Object.values(pregnancies).some(p =>
    typeof p.gestationRemaining === "number" && p.gestationRemaining > 0
  );
  const pregnancyBlocked    = hasExistingPregnancy && !hasPotionOfBreeding;

  const impregnationEvents = [];

  // -----------------------------------------------
  // Process each source → hole
  // -----------------------------------------------
  const sourceCumSpent = new Map(); // token.id → cumUnitsSpent
  // Track per-source which holes they contributed to (for history)
  const sourceHolesMap = new Map(); // token.id → Set of holes
  // Track per-source their pregnancy result (for history)
  const sourcePregnancyResult = new Map(); // token.id → { offspring, deliveryType } | null

  let totalCumReceivedThisEvent = 0;

  // sourceSexualDeltas: accumulate per-source stat changes across all holes before writing.
  // Without this, a source cumming into multiple holes would re-read a stale flag on the
  // second iteration and overwrite the first hole's write, losing cumGiven and act counts.
  const sourceSexualDeltas = new Map(); // token.id → { sexual (live clone), mlThisShot }

  for (const { sourceToken, hole } of sourceHoleMap) {
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    const hasCock     = sourceActor.getFlag(FLAG, "cock") === true;
    const cockTypes   = sourceActor.getFlag(FLAG, "genitalTypes") ?? {};
    if (!hasCock) continue;

    // Only spend cum once per source
    let cumUnitsSpent = sourceCumSpent.get(sourceToken.id);
    if (cumUnitsSpent === undefined) {
      const cum = sourceActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
      cumUnitsSpent = Math.floor(cum.current / 2);
      if (cumUnitsSpent <= 0) continue;
      await sourceActor.setFlag(FLAG, "cum", { current: cum.current - cumUnitsSpent, max: cum.max });
      sourceCumSpent.set(sourceToken.id, cumUnitsSpent);
      sourcePregnancyResult.set(sourceToken.id, null);
    }

    // Track holes per source
    if (!sourceHolesMap.has(sourceToken.id)) sourceHolesMap.set(sourceToken.id, new Set());
    sourceHolesMap.get(sourceToken.id).add(hole);

    // Accumulate stats for this source — read once from flag or reuse existing delta object
    if (!sourceSexualDeltas.has(sourceToken.id)) {
      const base = structuredClone(sourceActor.getFlag(FLAG, "sexual") ?? {});
      if (!base.lifetime) base.lifetime = {};
      if (!base.lifetime.mlGiven) base.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!base.lifetime.given)   base.lifetime.given   = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!base.lifetime.cumGiven) base.lifetime.cumGiven = 0;
      const mlThisShot = cumUnitsSpent * AFLP.CUM_UNIT_ML;
      // cumGiven incremented once per source (not per hole)
      base.lifetime.cumGiven = (base.lifetime.cumGiven ?? 0) + cumUnitsSpent;
      if (isMultiSource) {
        base.lifetime.mlGiven.gangbang = (base.lifetime.mlGiven.gangbang ?? 0) + mlThisShot;
        base.lifetime.given.gangbang   = (base.lifetime.given.gangbang   ?? 0) + 1;
      }
      sourceSexualDeltas.set(sourceToken.id, { sexual: base, mlThisShot });
    }
    const { sexual: sourceSexual, mlThisShot } = sourceSexualDeltas.get(sourceToken.id);

    // Per-hole stats (safe to accumulate across iterations since we're mutating the same object)
    sourceSexual.lifetime.mlGiven[hole] = (sourceSexual.lifetime.mlGiven[hole] ?? 0) + mlThisShot;
    sourceSexual.lifetime.given[hole]   = (sourceSexual.lifetime.given[hole]   ?? 0) + 1;

    totalCumReceivedThisEvent += mlThisShot;

    // Apply cumflation (gated by setting)
    if (AFLP.Settings.cumflationInHscene) {
      AFLP_Cumflation.applyCumflation(targetActor, cumFlags, cumOverflow, sexualStatsDialog, [hole], cumUnitsSpent);
    }

    // Impregnation
    if (!pregnancyBlocked && hole === "vaginal" && hasPussy && !hasBirthControl) {
      const pregResult = await AFLP_Pregnancy.attemptImpregnation(targetActor, sourceActor, cockTypes, hasPotionOfBreeding);
      if (pregResult) {
        pregResult.source = pregResult.sourceName || sourceActor.name || "Unknown";
        impregnationEvents.push(pregResult);
        sourcePregnancyResult.set(sourceToken.id, { offspring: pregResult.offspring, deliveryType: pregResult.deliveryType });
      }
    } else if (pregnancyBlocked && hole === "vaginal") {
      impregnationEvents.push({ source: sourceActor.name, sourceName: sourceActor.name, blocked: true });
    }
  }

  // -----------------------------------------------
  // TARGET cums into SOURCE (bothHaveCocks path only)
  // Mirrors the source loop above but with actors swapped.
  // -----------------------------------------------
  const targetCumGivenMl = {}; // hole → ml, for source's history entry
  if (targetCumsIntoSource && Object.keys(targetCumsIntoSource).length && bothHaveCocks) {
    const tgtCum = targetActor.getFlag(FLAG, "cum") ?? { current: 0, max: 0 };
    const tgtCumUnitsSpent = Math.floor(tgtCum.current / 2);

    if (tgtCumUnitsSpent > 0) {
      await targetActor.setFlag(FLAG, "cum", { current: tgtCum.current - tgtCumUnitsSpent, max: tgtCum.max });

      const tgtSexual = structuredClone(targetActor.getFlag(FLAG, "sexual") ?? {});
      if (!tgtSexual.lifetime) tgtSexual.lifetime = {};
      if (!tgtSexual.lifetime.mlGiven) tgtSexual.lifetime.mlGiven = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!tgtSexual.lifetime.given)   tgtSexual.lifetime.given   = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
      if (!tgtSexual.lifetime.cumGiven) tgtSexual.lifetime.cumGiven = 0;

      const srcHasPussy = sourceActor0?.getFlag(FLAG, "pussy") === true;
      const tgtHolesSelected = Object.keys(targetCumsIntoSource);
      const tgtMlThisShot = tgtCumUnitsSpent * AFLP.CUM_UNIT_ML;

      for (const hole of tgtHolesSelected) {
        tgtSexual.lifetime.mlGiven[hole]  = (tgtSexual.lifetime.mlGiven[hole]  ?? 0) + tgtMlThisShot;
        tgtSexual.lifetime.given[hole]    = (tgtSexual.lifetime.given[hole]    ?? 0) + 1;
        targetCumGivenMl[hole]            = tgtMlThisShot;

        // mlReceived on source (source is receiving here)
        const srcSexual = structuredClone(sourceActor0.getFlag(FLAG, "sexual") ?? {});
        if (!srcSexual.lifetime) srcSexual.lifetime = {};
        if (!srcSexual.lifetime.mlReceived) srcSexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
        if (!srcSexual.lifetime.cumReceived) srcSexual.lifetime.cumReceived = 0;
        srcSexual.lifetime.mlReceived[hole] = (srcSexual.lifetime.mlReceived[hole] ?? 0) + tgtMlThisShot;
        srcSexual.lifetime.cumReceived      = (srcSexual.lifetime.cumReceived      ?? 0) + tgtCumUnitsSpent;
        srcSexual.lifetime[hole]            = (srcSexual.lifetime[hole]             ?? 0) + 1;
        await sourceActor0.setFlag(FLAG, "sexual", srcSexual);

        // Cumflation on source
        if (AFLP.Settings.cumflationInHscene && srcHasPussy) {
          const srcCumFlags    = AFLP_Cumflation.getCumflation(sourceActor0);
          const srcCumOverflow = AFLP_Cumflation.getCumOverflow(sourceActor0);
          // SexualStatsDialog needed for cumflation helper
          const srcStatsDialog = new AFLP.UI.SexualStatsDialog(sourceActor0);
          await srcStatsDialog.load();
          AFLP_Cumflation.applyCumflation(sourceActor0, srcCumFlags, srcCumOverflow, srcStatsDialog, [hole], tgtCumUnitsSpent);
          await AFLP_Cumflation.saveCumflation(sourceActor0, srcCumFlags, srcCumOverflow);
          await AFLP_Cumflation.applyCumflationEffects(sourceActor0);
          await sourceActor0.setFlag(FLAG, "sexual", srcStatsDialog.sexual);
        }

        // Impregnation — target's cock into source's pussy
        if (hole === "vaginal" && srcHasPussy) {
          const srcPregnancies = structuredClone(await sourceActor0.getFlag(FLAG, "pregnancy") ?? {});
          const srcHasExistingPreg = Object.values(srcPregnancies).some(p =>
            typeof p.gestationRemaining === "number" && p.gestationRemaining > 0
          );
          const srcHasBirthControl = sourceActor0.items.some(i => i.sourceId === BIRTH_CONTROL_UUID);
          const srcHasPotionBreed  = sourceActor0.items.some(i => i.sourceId === POTION_OF_BREEDING_UUID);
          if (!srcHasExistingPreg || srcHasPotionBreed) {
            if (!srcHasBirthControl) {
              const tgtCockTypes = targetActor.getFlag(FLAG, "genitalTypes") ?? {};
              const pregResult = await AFLP_Pregnancy.attemptImpregnation(sourceActor0, targetActor, tgtCockTypes, srcHasPotionBreed);
              if (pregResult) impregnationEvents.push({ ...pregResult, source: targetActor.name, sourceName: targetActor.name, onSource: true });
            }
          }
        }
      }

      tgtSexual.lifetime.cumGiven = (tgtSexual.lifetime.cumGiven ?? 0) + tgtCumUnitsSpent;
      await targetActor.setFlag(FLAG, "sexual", tgtSexual);
    }
  }

  // ── Write accumulated source sexual stats (once per source, not per hole) ──
  for (const [tokenId, { sexual }] of sourceSexualDeltas.entries()) {
    const sourceToken = sourceTokens.find(t => t.id === tokenId);
    if (!sourceToken) continue;
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    await sourceActor.setFlag(FLAG, "sexual", sexual);
  }

  // -----------------------------------------------
  // Increment target lifetime act counters
  // -----------------------------------------------
  for (const [hole, count] of Object.entries(holeAssignments)) {
    if (hole in sexualStatsDialog.sexual.lifetime) {
      sexualStatsDialog.sexual.lifetime[hole] = (sexualStatsDialog.sexual.lifetime[hole] ?? 0) + count;
    }
  }

  if (isMultiSource) {
    sexualStatsDialog.sexual.lifetime.gangbang = (sexualStatsDialog.sexual.lifetime.gangbang ?? 0) + 1;
    if (!sexualStatsDialog.sexual.lifetime.mlReceived) {
      sexualStatsDialog.sexual.lifetime.mlReceived = { oral: 0, vaginal: 0, anal: 0, facial: 0, gangbang: 0 };
    }
    sexualStatsDialog.sexual.lifetime.mlReceived.gangbang =
      (sexualStatsDialog.sexual.lifetime.mlReceived.gangbang ?? 0) + totalCumReceivedThisEvent;
  }

  // -----------------------------------------------
  // Write partner history entries on TARGET
  // -----------------------------------------------
  // Write partner history — one entry per source on TARGET, one entry on SOURCE
  // -----------------------------------------------
  const targetPartnerHistory = structuredClone(await targetActor.getFlag(FLAG, "partnerHistory") ?? []);
  const eventDate = game.time.worldTime;

  for (const [tokenId, cumUnitsSpent] of sourceCumSpent.entries()) {
    const sourceToken = sourceTokens.find(t => t.id === tokenId);
    if (!sourceToken) continue;
    const sourceActor = sourceToken.actor?.getWorldActor?.() ?? sourceToken.actor;
    const holes = Array.from(sourceHolesMap.get(tokenId) ?? []);
    const mlGiven = cumUnitsSpent * AFLP.CUM_UNIT_ML;

    // Increment lifetime cumReceived unit counter on target
    sexualStatsDialog.sexual.lifetime.cumReceived =
      (sexualStatsDialog.sexual.lifetime.cumReceived ?? 0) + cumUnitsSpent;

    // Target's entry: they received cum from sourceActor
    // mlReceived only — target has a pussy, they didn't give anything in this flow
    targetPartnerHistory.unshift({
      sourceUuid:      sourceActor.uuid ?? "",
      sourceName:      sourceActor.name ?? "Unknown",
      date:            eventDate,
      holes,
      mlReceived:      mlGiven,
      pregnancyResult: sourcePregnancyResult.get(tokenId) ?? null
    });

    // Source's entry: they gave cum to targetActor
    // Also record mlReceived if target came back into them (bothHaveCocks path)
    const sourcePartnerHistory = structuredClone(await sourceActor.getFlag(FLAG, "partnerHistory") ?? []);
    const srcReceivedMl = bothHaveCocks && targetCumsIntoSource
      ? Object.values(targetCumGivenMl).reduce((a, b) => a + b, 0)
      : undefined;
    const srcEntry = {
      sourceUuid:      targetActor.uuid ?? "",
      sourceName:      targetActor.name ?? "Unknown",
      date:            eventDate,
      holes,
      mlGiven,
      pregnancyResult: sourcePregnancyResult.get(tokenId) ?? null
    };
    if (srcReceivedMl > 0) srcEntry.mlReceived = srcReceivedMl;
    sourcePartnerHistory.unshift(srcEntry);
    if (sourcePartnerHistory.length > 100) sourcePartnerHistory.splice(100);
    await sourceActor.setFlag(FLAG, "partnerHistory", sourcePartnerHistory);
  }

  // If target came into source (bothHaveCocks), write that as a separate entry on target's history
  if (bothHaveCocks && targetCumsIntoSource && Object.keys(targetCumsIntoSource).length) {
    const tgtGivenTotal = Object.values(targetCumGivenMl).reduce((a, b) => a + b, 0);
    if (tgtGivenTotal > 0) {
      // Add entry to target's own history showing what they gave
      targetPartnerHistory.unshift({
        sourceUuid:      sourceActor0.uuid ?? "",
        sourceName:      sourceActor0.name ?? "Unknown",
        date:            eventDate,
        holes:           Object.keys(targetCumsIntoSource),
        mlGiven:         tgtGivenTotal,
        pregnancyResult: null
      });
    }
  }

  // Cap history at 100 entries
  if (targetPartnerHistory.length > 100) targetPartnerHistory.splice(100);
  await targetActor.setFlag(FLAG, "partnerHistory", targetPartnerHistory);

  // -----------------------------------------------
  // Save all target state
  // -----------------------------------------------
  if (AFLP.Settings.cumflationInHscene) {
    await AFLP_Cumflation.saveCumflation(targetActor, cumFlags, cumOverflow);
    await AFLP_Cumflation.applyCumflationEffects(targetActor);
  }
  await targetActor.setFlag(FLAG, "sexual", sexualStatsDialog.sexual);

  // Check and award any newly-earned titles
  await AFLP_Titles.checkAndAward(targetActor);

  // ── Kink: Cum Slut — Horny 2 when cum lands on/in target ─────────────
  if (AFLP.Settings.automation && AFLP.actorHasKink(targetActor, "cum-slut")) {
    const liveTarget = game.actors?.get(targetActor.id) ?? targetActor;
    const horny = structuredClone(liveTarget.getFlag(FLAG, "horny") ?? AFLP.hornyDefaults);
    const current = (horny.temp ?? 0) + (horny.permanent ?? 0);
    horny.temp = Math.min(6 - (horny.permanent ?? 0), (horny.temp ?? 0) + 2);
    if (horny.temp > (liveTarget.getFlag(FLAG, "horny")?.temp ?? 0)) {
      await targetActor.setFlag(FLAG, "horny", horny);
      await ChatMessage.create({
        content: `<div class="aflp-chat-card"><p><strong>${targetActor.name}</strong>'s Cum Slut kink triggers — Horny +2.</p></div>`,
        speaker: { alias: "AFLP" },
      });
    }
  }

  // -----------------------------------------------
  // Prose output
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
      if (ev.blocked)                 return `<strong>${ev.source}</strong> tries to breed <strong>${targetActor.name}</strong>, but they are already pregnant.`;
      if (ev.deliveryType === "egg")  return `<strong>${ev.source}</strong> oviposited ${ev.offspring} eggs inside <strong>${targetActor.name}</strong>!`;
      return `<strong>${ev.source}</strong> impregnated <strong>${targetActor.name}</strong> with ${ev.offspring} offspring!`;
    })
  ];

  ChatMessage.create({ content: sections.join("<br><br>") });
})();