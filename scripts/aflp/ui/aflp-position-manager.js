// =====================================================
// AFLP Custom Position Manager
// Allows GMs to define custom positions for the H Scene
// position picker, stored as world data.
// =====================================================

const MOD = "ardisfoxxs-lewd-pf2e";
const KEY = "customPositions";

const HOLES = [
  { value: "vaginal", label: "Vaginal" },
  { value: "anal",    label: "Anal" },
  { value: "oral",    label: "Oral" },
  { value: "facial",  label: "Facial" },
  { value: "none",    label: "None (Foreplay)" },
];

const TRAITS = [
  { value: "biped",       label: "Biped (humanoid)" },
  { value: "massive",     label: "Massive (large humanoid)" },
  { value: "quadruped",   label: "Quadruped (beast)" },
  { value: "serpentine",  label: "Serpentine" },
  { value: "winged",      label: "Winged" },
  { value: "tentacled",   label: "Tentacled / Aberration" },
  { value: "plant",       label: "Plant" },
  { value: "incorporeal", label: "Incorporeal" },
];

// Default position for a given hole — used when a custom group position
// is applied and a concrete positionId is needed per slot.
function _defaultPositionForHole(hole) {
  return hole === "vaginal" ? "doggy-style-pussy"
       : hole === "oral"    ? "facefuck"
       : hole === "facial"  ? "facial"
       :                      "doggy-style-anal";
}

// ── Data access ──────────────────────────────────────────────────────────

function _read() {
  try { return JSON.parse(game.settings.get(MOD, KEY) || "[]"); }
  catch { return []; }
}

async function _write(positions) {
  await game.settings.set(MOD, KEY, JSON.stringify(positions));
  mergeCustomPositions();
}

// ── Schema merge ─────────────────────────────────────────────────────────
// Call this on ready (after schema is loaded) and after saving custom positions.
// Future: could accept additional positions from external sources (macros, modules).

export function mergeCustomPositions() {
  const raw = _read();

  // Remove previous custom entries so we don't accumulate duplicates
  if (Array.isArray(AFLP?.positions))
    AFLP.positions = AFLP.positions.filter(p => !p.isCustom);
  if (Array.isArray(AFLP?.gangbangPresets))
    AFLP.gangbangPresets = AFLP.gangbangPresets.filter(p => !p.isCustom);

  for (const p of raw) {
    if (!p.id || !p.name) continue;

    if (p.posType === "individual") {
      // Individual (2p) position — appears in categorised individual section
      const hole  = (p.hole === "none" || !p.hole) ? null : p.hole;
      const penile = ["vaginal", "anal", "oral", "facial"].includes(hole);
      const trait  = p.positionTrait || "biped";
      AFLP?.positions?.push({
        id: p.id,
        uuid: null,
        desc: p.desc || "",
        isCustom: true,
        label:     () => p.name,
        logPhrase: (a, t) => `${a} is in ${p.name} with ${t}`,
        hole,
        positionTrait: trait,
        penile,
      });
      // Add to the default pool for this trait so it appears in the picker
      const pool = AFLP?.positionTraitDefaults?.[trait];
      if (pool && !pool.includes(p.id)) pool.push(p.id);
      // Populate description cache
      if (AFLP?._positionDescCache) AFLP._positionDescCache[p.id] = p.desc || "";

    } else {
      // Group position — appears in Group Positions section when 2+ tops are in scene
      AFLP?.gangbangPresets?.push({
        id:           p.id,
        name:         p.name,
        desc:         p.desc || "",
        uuid:         null,
        isCustom:     true,
        minActors:    p.minActors || 2,
        maxActors:    p.maxActors || null,
        needsPussy:   !!p.needsPussy,
        requiredTraits: [],
        slots: (p.slots || []).map((s, i) => ({
          label:    s.label || `Slot ${i + 1}`,
          position: _defaultPositionForHole(s.hole || "anal"),
          hole:     s.hole || "anal",
        })),
      });
    }
  }
}

// ── ApplicationV2 ────────────────────────────────────────────────────────

export class AFLPPositionManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:       "aflp-position-manager",
    window:   { title: "Custom H Scene Positions", resizable: true },
    position: { width: 740, height: 560 },
    classes:  ["aflp-app"],
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async _renderHTML() {
    // Return a placeholder — real content is built in _onRender
    const el = document.createElement("div");
    el.style.cssText = "height:100%;";
    return el;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender() {
    this._buildContent();
  }

  // ── Content builder ────────────────────────────────────────────────────

  _buildContent() {
    const root = this.element.querySelector(".window-content") ?? this.element;
    root.style.cssText = "display:flex;flex-direction:column;padding:10px;box-sizing:border-box;gap:10px;font-family:var(--font-primary,serif);color:#f0e8d0;height:100%;";

    const positions = _read();
    const iStyle = "display:block;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(200,160,80,0.8);font-weight:normal;padding:7px 10px;text-align:left;";

    const rows = !positions.length
      ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:#555;font-style:italic;">No custom positions yet. Click a button below to create one.</td></tr>`
      : positions.map((p, i) => {
          const holeText = p.posType === "group"
            ? (p.slots || []).map(s => s.hole).join(", ")
            : (p.hole || "none");
          const typeText = p.posType === "group"
            ? `Group (${p.minActors}-${p.maxActors ?? "∞"})`
            : "Individual";
          const creature = p.positionTrait || (p.posType === "group" ? "any" : "biped");
          return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:6px 10px">${p.name}</td>
            <td style="padding:6px 10px;color:#888;font-size:11px">${typeText}</td>
            <td style="padding:6px 10px;color:#888;font-size:11px">${holeText}</td>
            <td style="padding:6px 10px;color:#888;font-size:11px">${creature}</td>
            <td style="padding:6px 10px;text-align:right;white-space:nowrap">
              <button class="aflp-pm-edit" data-idx="${i}" style="padding:2px 10px;cursor:pointer;border-radius:3px;margin-right:4px;font-size:11px">Edit</button>
              <button class="aflp-pm-del"  data-idx="${i}" style="padding:2px 10px;cursor:pointer;border-radius:3px;font-size:11px;color:#e86">Delete</button>
            </td>
          </tr>`;
        }).join("");

    root.innerHTML = `
      <p style="margin:0;font-size:11px;color:#888">Custom positions appear in the H Scene position picker alongside built-in options. Individual positions appear per-actor; Group positions appear in the shared Group Positions section.</p>
      <div style="flex:1;overflow-y:auto;border:1px solid rgba(200,160,80,0.15);border-radius:4px">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:rgba(200,160,80,0.06);border-bottom:1px solid rgba(200,160,80,0.2)">
            <tr>
              <th style="${iStyle}">Name</th>
              <th style="${iStyle}">Type</th>
              <th style="${iStyle}">Hole(s)</th>
              <th style="${iStyle}">Creature</th>
              <th style="${iStyle};text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="aflp-pm-add-i" style="padding:6px 16px;cursor:pointer;background:rgba(200,160,80,0.1);border:1px solid rgba(200,160,80,0.35);border-radius:4px;color:#f0e8d0">+ Individual Position (2p)</button>
        <button class="aflp-pm-add-g" style="padding:6px 16px;cursor:pointer;background:rgba(200,160,80,0.1);border:1px solid rgba(200,160,80,0.35);border-radius:4px;color:#f0e8d0">+ Group Position (3p+)</button>
      </div>`;

    // Event listeners
    root.querySelector(".aflp-pm-add-i")?.addEventListener("click", () => this._openEdit(null, "individual"));
    root.querySelector(".aflp-pm-add-g")?.addEventListener("click", () => this._openEdit(null, "group"));

    root.querySelectorAll(".aflp-pm-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const pos = _read()[+btn.dataset.idx];
        if (pos) this._openEdit(pos, pos.posType);
      });
    });

    root.querySelectorAll(".aflp-pm-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        const positions = _read();
        const p = positions[+btn.dataset.idx];
        if (!p) return;
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Delete Custom Position" },
          content: `<p>Delete <strong>${p.name}</strong>? This cannot be undone.</p>`,
        });
        if (!ok) return;
        positions.splice(+btn.dataset.idx, 1);
        await _write(positions);
        this._buildContent();
      });
    });
  }

  // ── Edit dialog ────────────────────────────────────────────────────────

  async _openEdit(existing, posType) {
    const isGroup = posType === "group";
    const iS = "width:100%;padding:6px;box-sizing:border-box;background:#1a1a2e;color:#f0e8d0;border:1px solid rgba(200,160,80,0.3);border-radius:3px;font-size:12px;";
    const lS = "display:block;font-size:11px;color:#888;margin-bottom:4px;";
    const fS = "margin-bottom:10px;";

    const holeOpts  = HOLES.map( h => `<option value="${h.value}"${(existing?.hole||"vaginal")===h.value?" selected":""}>${h.label}</option>`).join("");
    const traitOpts = TRAITS.map(t => `<option value="${t.value}"${(existing?.positionTrait||"biped")===t.value?" selected":""}>${t.label}</option>`).join("");

    const existingSlots = isGroup
      ? (existing?.slots || [{ label: "Top 1", hole: "oral" }, { label: "Top 2", hole: "anal" }])
      : [];

    const slotRow = (s, i) => {
      const holeOps = HOLES.map(h => `<option value="${h.value}"${s.hole===h.value?" selected":""}>${h.label}</option>`).join("");
      return `<div class="slot-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
        <input type="text" class="slot-label" value="${s.label || `Slot ${i+1}`}" placeholder="e.g. Front, Back, Above"
          style="flex:1;padding:5px 7px;background:#1a1a2e;color:#f0e8d0;border:1px solid rgba(200,160,80,0.3);border-radius:3px;font-size:11px"/>
        <select class="slot-hole" style="padding:5px 7px;background:#1a1a2e;color:#f0e8d0;border:1px solid rgba(200,160,80,0.3);border-radius:3px;font-size:11px">${holeOps}</select>
        <button class="slot-rm" type="button" style="padding:3px 8px;cursor:pointer;border:1px solid rgba(220,130,80,0.5);border-radius:3px;background:transparent;color:#e86;font-size:11px">✕</button>
      </div>`;
    };

    const indivFields = !isGroup ? `
      <div style="display:flex;gap:12px;${fS}">
        <div style="flex:1"><label style="${lS}">Hole</label><select id="pm-hole" style="${iS}">${holeOpts}</select></div>
        <div style="flex:1"><label style="${lS}">Creature Type</label><select id="pm-trait" style="${iS}">${traitOpts}</select></div>
      </div>` : "";

    const groupFields = isGroup ? `
      <div style="display:flex;gap:12px;${fS}">
        <div style="flex:1"><label style="${lS}">Min Tops</label>
          <input type="number" id="pm-min" value="${existing?.minActors||2}" min="2" max="10" style="${iS}"/></div>
        <div style="flex:1"><label style="${lS}">Max Tops (0 = unlimited)</label>
          <input type="number" id="pm-max" value="${existing?.maxActors??0}" min="0" max="20" style="${iS}"/></div>
        <div style="display:flex;align-items:flex-end;padding-bottom:4px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#aaa">
            <input type="checkbox" id="pm-pussy" ${existing?.needsPussy?"checked":""}/>Requires pussy
          </label>
        </div>
      </div>
      <div style="${fS}">
        <label style="${lS}">Slots (one row per top)</label>
        <div id="pm-slots">${existingSlots.map(slotRow).join("")}</div>
        <button class="slot-add" type="button" style="padding:3px 10px;cursor:pointer;font-size:11px;border-radius:3px;margin-top:4px">+ Add Slot</button>
      </div>` : "";

    const content = `<div style="font-family:var(--font-primary,serif);color:#f0e8d0;padding:4px 0">
      <div style="${fS}"><label style="${lS}">Position Name</label>
        <input type="text" id="pm-name" value="${existing?.name||""}" placeholder="e.g. Rear Chokehold" style="${iS}"/></div>
      <div style="${fS}"><label style="${lS}">Description (one short sentence)</label>
        <input type="text" id="pm-desc" value="${existing?.desc||""}" placeholder="How are the actors positioned?" style="${iS}"/></div>
      ${indivFields}${groupFields}
    </div>`;

    let formData = null;

    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: existing ? `Edit: ${existing.name}` : (isGroup ? "New Group Position" : "New Individual Position") },
      position: { width: 520 },
      content,
      buttons: [
        {
          action: "save",
          label:  "Save Position",
          default: true,
          callback: (ev, btn, dlg) => {
            const e = dlg.element;
            formData = {
              id:      existing?.id || ("custom-" + foundry.utils.randomID(8)),
              posType,
              name:    e.querySelector("#pm-name")?.value?.trim() || "",
              desc:    e.querySelector("#pm-desc")?.value?.trim() || "",
            };
            if (isGroup) {
              const maxV = parseInt(e.querySelector("#pm-max")?.value) || 0;
              Object.assign(formData, {
                minActors:  Math.max(2, parseInt(e.querySelector("#pm-min")?.value) || 2),
                maxActors:  maxV === 0 ? null : maxV,
                needsPussy: e.querySelector("#pm-pussy")?.checked || false,
                slots: [...e.querySelectorAll(".slot-row")].map(row => ({
                  label: row.querySelector(".slot-label")?.value?.trim() || "Top",
                  hole:  row.querySelector(".slot-hole")?.value || "anal",
                })),
              });
            } else {
              Object.assign(formData, {
                hole:          e.querySelector("#pm-hole")?.value || "vaginal",
                positionTrait: e.querySelector("#pm-trait")?.value || "biped",
              });
            }
          },
        },
        { action: "cancel", label: "Cancel" },
      ],
      close: () => "cancel",
      render: (ev, dlg) => {
        if (!isGroup) return;
        const slotsDiv = dlg.element.querySelector("#pm-slots");

        const reAttach = () => {
          dlg.element.querySelectorAll(".slot-rm").forEach(b => {
            const fresh = b.cloneNode(true);
            b.replaceWith(fresh);
            fresh.addEventListener("click", () => fresh.closest(".slot-row")?.remove());
          });
        };
        reAttach();

        dlg.element.querySelector(".slot-add")?.addEventListener("click", () => {
          const n = slotsDiv?.querySelectorAll(".slot-row").length || 0;
          const tmp = document.createElement("div");
          tmp.innerHTML = slotRow({ label: `Slot ${n + 1}`, hole: "anal" }, n);
          slotsDiv?.appendChild(tmp.firstChild);
          reAttach();
        });
      },
    });

    if (action !== "save" || !formData?.name) {
      if (action === "save") ui.notifications.warn("AFLP | Please enter a position name.");
      return;
    }

    const positions = _read();
    const idx = positions.findIndex(p => p.id === formData.id);
    if (idx >= 0) positions[idx] = formData;
    else positions.push(formData);

    await _write(positions);
    this._buildContent();
  }
}
