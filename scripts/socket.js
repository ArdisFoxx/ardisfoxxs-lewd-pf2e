let socketlibSocket = undefined;
// Handler names already bound. socketlib does NOT throw when a function name is
// registered twice - it logs "Function 'x' is already registered for
// 'module.<id>'. Ignoring registration request." and returns. The try/catch around
// each register() therefore never fired, and because setupSocket runs twice by
// design (init, then socketlib.ready) every load printed that warning. Track the
// names rather than waiting for an exception that does not come.
const boundHandlers = new Set();
// Taken by Reference from Pf2e Action Support
async function logMessage(message) {
  console.log(message);
}

// Players cannot update actors they do not own, and AFLR writes constantly land
// on monsters: Sexual Advance and Carnal Press push Arousal and conditions onto
// the target. Foundry answers "User <name> lacks permission to update Actor",
// the macro dies half-finished, and the player goes looking for a setting that
// does not exist. Those calls are forwarded here and executed on the GM's client.
//
// AFLP.gm owns the op registry; this file owns only the wire.
async function aflrGmOp(name, actorUuid, ...args) {
  const gm = globalThis.AFLP?.gm;
  if (!gm) return null;
  return gm._handle(name, actorUuid, ...args);
}

// Register a handler once. The catch still stands: another path (the carnal dock
// shares this module id) may have bound the name first, and that counts as bound.
const bind = (name, fn) => {
  if (boundHandlers.has(name)) return;
  try { socketlibSocket.register(name, fn); } catch (e) { /* bound elsewhere */ }
  boundHandlers.add(name);
};

// Idempotent: called from init (where socketlib may not exist yet) and again
// from socketlib.ready. socketlib throws when a module registers twice, and the
// carnal dock registers the same module id, so reuse any existing socket.
export const setupSocket = () => {
  if (!globalThis.socketlib) return false;
  if (!socketlibSocket) {
    socketlibSocket = globalThis.socketlib.modules?.get("ardisfoxxs-lewd-pf2e")
      ?? globalThis.socketlib.registerModule("ardisfoxxs-lewd-pf2e");
  }
  bind("logMessage", logMessage);
  bind("aflrGmOp", aflrGmOp);
  if (globalThis.AFLP?.gm) globalThis.AFLP.gm.socket = socketlibSocket;
  return true;
};

// socketlib fires this during init; the ordering against our own init hook is
// not guaranteed, so bind here too.
Hooks.once("socketlib.ready", () => setupSocket());
