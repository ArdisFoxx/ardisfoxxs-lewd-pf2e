let socketlibSocket = undefined;
// Taken by Reference from Pf2e Action Support
async function logMessage(message) {
  console.log(message);
}
export const setupSocket = () => {
  if (globalThis.socketlib) {
    socketlibSocket = globalThis.socketlib.registerModule("ardisfoxxs-lewd-pf2e");
    socketlibSocket.register("logMessage", logMessage);
  }
  return !!globalThis.socketlib;
};
