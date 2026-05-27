// ===============================
// AFLP Macro — Token Genital
// ===============================
// Opens a genital configuration dialog for all selected tokens.
// Sets genital flags (pussy, cock, cock subtypes) used by AFLP macros.
// Run after AFLP Token Initialize.

if (!canvas.tokens.controlled.length) {
  ui.notifications.warn("Select at least one token.");
  return;
}

if (!window.AFLP) {
  ui.notifications.error("AFLP not loaded.");
  return;
}

const FLAG = AFLP.FLAG_SCOPE;

// Build genital picker content
const cockSubtypes = [
  { key: "cock-breeder",      label: "Breeder" },
  { key: "cock-electrifying", label: "Electrifying" },
  { key: "cock-fertile",      label: "Fertile" },
  { key: "cock-flared",       label: "Flared" },
  { key: "cock-girthy",       label: "Girthy" },
  { key: "cock-hemipenis",    label: "Hemipenis" },
  { key: "cock-knot",         label: "Knotted" },
  { key: "cock-ovidepositor", label: "Ovidepositor" },
  { key: "cock-pacifying",    label: "Pacifying" },
  { key: "cock-paralyzing",   label: "Paralyzing" },
  { key: "cock-slime",        label: "Slime" },
];

// Read from first selected token as defaults
const firstActor  = canvas.tokens.controlled[0].actor?.getWorldActor?.() ?? canvas.tokens.controlled[0].actor;
const existing    = firstActor?.getFlag(FLAG, "genitalTypes") ?? {};
const hasPussy    = firstActor?.getFlag(FLAG, "pussy") ?? false;
const hasCock     = firstActor?.getFlag(FLAG, "cock")  ?? false;

const subtypeChecks = cockSubtypes.map(s => `
  <li style="font-size:12px;display:flex;justify-content:space-between;align-items:center;padding:2px 0;">
    <label for="gt-${s.key}">${s.label}</label>
    <input type="checkbox" id="gt-${s.key}" name="${s.key}" ${existing[s.key] ? "checked" : ""}/>
  </li>`).join("");

const content = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#ddd;min-width:260px;">
  ${canvas.tokens.controlled.length > 1
    ? `<div style="font-size:11px;color:#f0a04a;margin-bottom:10px;">Configuring ${canvas.tokens.controlled.length} tokens; settings will apply to all selected.</div>`
    : ""}
  <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
    <label style="display:flex;align-items:center;gap:6px;font-weight:600;">
      <input type="checkbox" id="gt-pussy" ${hasPussy ? "checked" : ""}/> Pussy
    </label>
    <label style="display:flex;align-items:center;gap:6px;font-weight:600;">
      <input type="checkbox" id="gt-cock" ${hasCock ? "checked" : ""}/> Cock
    </label>
  </div>
  <div id="gt-cock-subtypes" style="border:1px solid #c9a96e33;border-radius:4px;padding:6px 10px;margin-bottom:4px;${hasCock ? "" : "display:none"}">
    <div style="font-size:11px;color:#c9a96e;margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;">Cock Type</div>
    <ul style="list-style:none;margin:0;padding:0;">${subtypeChecks}</ul>
  </div>
</div>`;

const result = await foundry.applications.api.DialogV2.wait({
  window:   { title: "AFLP Token Genital", resizable: false },
  position: { width: 300 },
  content,
  buttons: [
    { action: "save",   label: "Apply",  default: true, callback: async (ev, btn, dlg) => {
      const el = dlg.element;
      return {
        pussy: el.querySelector("#gt-pussy")?.checked ?? false,
        cock:  el.querySelector("#gt-cock")?.checked  ?? false,
        subtypes: Object.fromEntries(
          cockSubtypes.map(s => [s.key, el.querySelector(`#gt-${s.key}`)?.checked ?? false])
        ),
      };
    }},
    { action: "cancel", label: "Cancel", callback: async () => null },
  ],
  close: async () => null,
  render(ev, dlg) {
    const cockCheck    = dlg.element.querySelector("#gt-cock");
    const subtypesDiv  = dlg.element.querySelector("#gt-cock-subtypes");
    cockCheck?.addEventListener("change", () => {
      subtypesDiv.style.display = cockCheck.checked ? "" : "none";
    });
  },
});

if (!result) return;

const names = [];
for (const token of canvas.tokens.controlled) {
  const actor = token.actor?.getWorldActor?.() ?? token.actor;
  if (!actor) continue;

  const genitalTypes = structuredClone(actor.getFlag(FLAG, "genitalTypes") ?? {});

  genitalTypes["pussy"] = result.pussy;
  genitalTypes["cock"]  = result.cock;
  for (const [key, val] of Object.entries(result.subtypes)) {
    genitalTypes[key] = val;
  }

  // Clear subtypes if cock is unchecked
  if (!result.cock) {
    for (const s of cockSubtypes) genitalTypes[s.key] = false;
  }

  await actor.setFlag(FLAG, "pussy",        result.pussy);
  await actor.setFlag(FLAG, "cock",         result.cock);
  await actor.setFlag(FLAG, "genitalTypes", genitalTypes);
  names.push(actor.name);
}

if (names.length === 1) {
  ui.notifications.info(`AFLP: Genitalia set for ${names[0]}.`);
} else {
  ui.notifications.info(`AFLP: Genitalia set for ${names.length} tokens: ${names.join(", ")}.`);
}
