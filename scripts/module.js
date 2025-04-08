import { setupSocket } from "./socket.js";

Hooks.once("init", async function () {});

Hooks.once("setup", function () {
  if (!setupSocket())
    console.error("Error: Unable to set up socket lib for Ardis Lewd Stuff");
});

Hooks.once("ready", async function () {
  Hooks.on("preCreateItem", async (item) => {
    if (item.type !== "condition" && item.type !== "effect") return;
    logEffect(item);
  });

  Hooks.on("updateItem", async (item, changes, _diff, userid) => {
    if (item.type !== "condition" && item.type !== "effect") return;
    if (userid !== game.user.id) return;
    if (
      isNaN(changes?.system?.badge?.value) &&
      isNaN(changes?.system?.value?.value)
    )
      return;
    logEffect(item);
  });

  Hooks.on("createChatMessage", async function (msg, _status, userid) {
    if (!msg.flags?.pf2e?.appliedDamage) return;
    if (userid !== game.user.id) return;
    //const split_type = "none";
    const dmg = msg?.rolls?.total ?? msg?.flags?.pf2e?.appliedDamage?.updates?.reduce((accumulator, value) => accumulator + value, 0);
    const actor = game.actors.get(foundry.utils.parseUuid(msg?.flags?.pf2e?.origin?.actor)?.id ?? msg?.flags?.pf2e?.context?.actor);
    const now = new Date();
    logForEveryone(
      `${getFormattedDateTime(now)} ${actor.name}, damage${
        msg?.flags?.pf2e?.context?.options?.includes(
          "check:outcome:critical-success"
        )
          ? " Critical"
          : ""
      }`
    );
  });

  function logEffect(item) {
    const actor = item.actor;
    let itemName = item.name;
    if (item?.system?.badge?.value) {
      itemName += ` (${
        item?.system?.badge?.label || item?.system?.badge?.value
      })`;
    }
    const now = new Date();
    logForEveryone(`${getFormattedDateTime(now)} ${actor.name}, ${itemName}`);
  }

  function getFormattedDateTime(now) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
    const day = String(now.getDate()).padStart(2, "0");

    const timeString = now
      .toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
      .replace(" ", "");

    return `[${month}/${day}/${year} - ${timeString}]`;
  }

  /* chasarooni special   ≽^•⩊•^≼  */
  // This can be used to get the damage split by type later if that seems relevant
  function getDamageList(rolls, split_type) {
    switch (split_type) {
      case "by-damage-type":
        return extractDamageInfoCombined(rolls);
      case "all":
        return extractDamageInfoAll(rolls);
      case "none":
      default:
        return extractDamageInfoSimple(rolls);
    }
  }

  function extractDamageInfoCombined(rolls) {
    return rolls.flatMap(
      (inp) =>
        inp?.terms?.flatMap(
          (term) =>
            term?.rolls?.map((roll) => ({
              type: roll.type,
              value: roll.total,
            })) || []
        ) || []
    );
  }

  function extractDamageInfoAll(rolls) {
    return rolls.flatMap(
      (inp) => inp?.terms?.flatMap((term) => extractTerm(term)) || []
    );
  }

  function extractDamageInfoSimple(rolls) {
    return [{ type: "", value: rolls.total }];
  }

  function extractTerm(term, flavor = "") {
    let result = [];
    const termName = term.constructor.name;

    if (termProcessors[termName]) {
      result = termProcessors[termName](term, result, flavor);
    } else {
      console.error("Unrecognized Term when extracting parts", term);
      result.push({ value: term.total, type: term.flavor || flavor });
    }

    return result;
  }

  const termProcessors = {
    InstancePool: processInstancePool,
    DamageInstance: processDamageInstance,
    Grouping: processGrouping,
    ArithmeticExpression: processArithmeticExpression,
    Die: processDie,
    NumericTerm: processNumericTerm,
  };

  function processGrouping(term, result, flavor) {
    return result.concat(extractTerm(term.term, term.flavor || flavor));
  }

  function processInstancePool(term, result, flavor) {
    return result.concat(
      term.rolls.flatMap((roll) => extractTerm(roll, term.flavor || flavor))
    );
  }

  function processDamageInstance(term, result, flavor) {
    result = term.terms.flatMap((item) =>
      extractTerm(item, term.types || flavor)
    );
    const keepPersistent = !!term.options.evaluatePersistent;
    return result
      .filter((res) =>
        res?.type?.startsWith("persistent,") ? keepPersistent : true
      )
      .map((r) => ({
        value: r.value,
        type: r.type.replace(/persistent,/g, ""),
      }));
  }

  function processArithmeticExpression(term, result, flavor) {
    const operands = term.operands
      .map((op) => extractTerm(op, term.flavor || flavor))
      .flat();
    if (term.operator === "+") {
      return result.concat(operands);
    }
    if (term.operator === "-") {
      const [first, second] = operands;
      second.value = -second.value;
      return result.concat(first, second);
    }
    if (term.operator === "*") {
      // This works on the assumption of times 2
      const [first, second] = operands;
      // add a way to figure out which is number
      return result.concat(...Array(second).fill(first));
    }
    return result;
  }

  function processDie(term, result, flavor) {
    return result.concat(
      term.results.map((dice) => ({
        value: dice.result,
        type: term.flavor || flavor,
      }))
    );
  }

  function processNumericTerm(term, result, flavor) {
    result.push({ value: term.number, type: term.flavor || flavor });
    return result;
  }
});

async function logForEveryone(msg) {
  socketlib.modules
    .get("ardisfoxxs-lewd-pf2e")
    .executeForEveryone("logMessage", msg);
}
