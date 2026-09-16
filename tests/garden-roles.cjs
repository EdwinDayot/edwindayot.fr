const { test } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../public/game/data.js");
const Roles = require("../public/game/data-roles.js");

test("Each visitor's role is set and roleOf resolves it back from the building data", () => {
  assert.equal(Roles.roleOf("lea"), "trader");
  assert.equal(Roles.roleOf("noe"), "vendor");
  assert.equal(Roles.roleOf("iris"), "botanist");
  assert.equal(Roles.roleOf("nobody"), undefined);
});

test("Trader context matches the exact pre-refactor Léa behaviour: a fulfillable request, then the fallback", () => {
  const s = {
    requests: [{ id: 7, item: "seed:pilea", quantity: 2 }],
    inventory: { "seed:pilea": 2 },
    discovered: [],
  };
  assert.deepEqual(Roles.context({ id: "lea" }, s), {
    label: "E · Échanger",
    status: "Léa · 2 graines de Pilea",
    command: "trade",
    request: 7,
  });
  s.inventory["seed:pilea"] = 0;
  assert.deepEqual(Roles.context({ id: "lea" }, s), {
    label: "E · Voir les demandes",
    status: "Léa · demandes",
    panel: "visitor",
  });
});

test("Vendor context opens the generic shop panel, driven entirely by roleData.wares", () => {
  assert.deepEqual(Roles.context({ id: "noe" }, {}), {
    label: "E · Acheter",
    status: "Noé · boutique · 1 article",
    panel: "shop",
  });
  assert.deepEqual(Roles.context({ id: "mira" }, {}), {
    label: "E · Acheter",
    status: "Mira · boutique · 2 articles",
    panel: "shop",
  });
});

test("Resident context is a flavour line with no command — E just announces it, no shop or quest", () => {
  assert.deepEqual(Roles.context({ id: "hugo" }, {}), {
    label: "E · Saluer",
    status: "Hugo · lit à l'ombre du grand arbre",
    command: null,
  });
});

test("Botanist context matches the exact pre-refactor Iris behaviour", () => {
  assert.deepEqual(
    Roles.context({ id: "iris" }, { discovered: ["pilea", "monstera"] }),
    {
      label: "E · Partager",
      status: "Iris · 2 espèces",
      command: "botany",
    },
  );
});

test("Every building carries a role, a personColor and a props list, so a new NPC needs no new code branch", () => {
  for (const b of D.buildings) {
    assert.ok(Roles.roles[b.role], `${b.visitorId} has a known role`);
    assert.equal(typeof b.personColor, "number");
    assert.ok(Array.isArray(b.props));
    assert.ok(typeof b.roleData === "object");
  }
});
