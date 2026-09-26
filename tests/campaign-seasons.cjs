const { test } = require("node:test");
const assert = require("node:assert/strict");
const Seasons = require("../public/game/campaign-seasons.js");

test("Day 1 to 121 (three full cycles plus one) each resolve to the expected season", () => {
  const expected = [];
  for (let day = 1; day <= 121; day++) {
    const cycleIndex = Math.floor((day - 1) / Seasons.DAYS_PER_SEASON) % Seasons.SEASONS.length;
    expected.push(Seasons.SEASONS[cycleIndex]);
  }
  for (let day = 1; day <= 121; day++) {
    assert.equal(
      Seasons.seasonForDay(day),
      expected[day - 1],
      `day ${day} expected ${expected[day - 1]}`,
    );
  }
});

test("Each season boundary within the first cycle lands on the right season", () => {
  assert.equal(Seasons.seasonForDay(1), "printemps");
  assert.equal(Seasons.seasonForDay(10), "printemps");
  assert.equal(Seasons.seasonForDay(11), "ete");
  assert.equal(Seasons.seasonForDay(20), "ete");
  assert.equal(Seasons.seasonForDay(21), "automne");
  assert.equal(Seasons.seasonForDay(30), "automne");
  assert.equal(Seasons.seasonForDay(31), "hiver");
  assert.equal(Seasons.seasonForDay(40), "hiver");
});

test("The cycle reboucles after day 40 into a new spring, identically at each later cycle", () => {
  assert.equal(Seasons.seasonForDay(41), "printemps");
  assert.equal(Seasons.seasonForDay(50), "printemps");
  assert.equal(Seasons.seasonForDay(51), "ete");
  assert.equal(Seasons.seasonForDay(81), "printemps"); // start of the third cycle
  assert.equal(Seasons.seasonForDay(121), "printemps"); // start of the fourth cycle
});

test("The cycle length is exactly forty days, named and derived from the season count", () => {
  assert.equal(Seasons.DAYS_PER_SEASON, 10);
  assert.equal(Seasons.SEASONS.length, 4);
  assert.equal(Seasons.CYCLE_DAYS, 40);
});

test("seasonForDay is pure: repeated calls with the same day never change the result", () => {
  for (const day of [1, 17, 40, 41, 87, 121]) {
    const first = Seasons.seasonForDay(day);
    for (let i = 0; i < 5; i++) assert.equal(Seasons.seasonForDay(day), first);
  }
});
