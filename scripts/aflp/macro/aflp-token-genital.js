(async () => {
  if (!canvas.tokens.controlled.length) return ui.notifications.warn("No tokens selected.");
  
  const choice = await new Promise(resolve => {
    new Dialog({
      title: "Assign Genital Flag",
      content: `<p>Which genital do you want to assign?</p>`,
      buttons: {
        pussy: { label: "Pussy", callback: () => resolve("pussy") },
        cock: { label: "Cock", callback: () => resolve("cock") },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "cancel"
    }).render(true);
  });
  
  if (!choice) return;
  
  const FLAG = AFLP.FLAG_SCOPE; // adjust if AFLP.FLAG_SCOPE is different
  for (let token of canvas.tokens.controlled) {
    const actor = token.actor;
    if (!actor) continue;
    await actor.setFlag(FLAG, choice, true);
    ui.notifications.info(`${actor.name} now has ${choice}.`);
  }
})();