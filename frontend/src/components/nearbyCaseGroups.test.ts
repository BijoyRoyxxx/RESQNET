import { expect, it } from "vitest";
import { groupNearbyCases } from "./nearbyCaseGroups";

const report = (
  id: string,
  category: string,
  latitude: number | null,
  longitude: number | null = 0,
) => ({ category, report: { id, latitude, longitude } });

it("groups the same category within 100 m and keeps every report in the group", () => {
  const cases = [
    report("fire-one", "fire", 0),
    report("fire-two", "fire", 0.0005),
    report("fire-three", "fire", 0.00089),
  ];

  const groups = groupNearbyCases(cases);

  expect(groups).toHaveLength(1);
  expect(groups[0].cases.map((item) => item.report.id)).toEqual([
    "fire-one",
    "fire-two",
    "fire-three",
  ]);
});

it("keeps reports apart when they have different categories or are more than 100 m away", () => {
  const groups = groupNearbyCases([
    report("fire", "fire", 0),
    report("medical", "medical", 0.0001),
    report("far-fire", "fire", 0.0011),
  ]);

  expect(
    groups.map((group) => group.cases.map((item) => item.report.id)),
  ).toEqual([["fire"], ["medical"], ["far-fire"]]);
});

it("does not chain a cluster beyond 100 m from its first report", () => {
  const groups = groupNearbyCases([
    report("first", "fire", 0),
    report("middle", "fire", 0.0007),
    report("last", "fire", 0.0014),
  ]);

  expect(
    groups.map((group) => group.cases.map((item) => item.report.id)),
  ).toEqual([["first", "middle"], ["last"]]);
});

it("leaves reports without coordinates as individual records", () => {
  const groups = groupNearbyCases([
    report("one", "fire", null, null),
    report("two", "fire", null, null),
  ]);

  expect(groups).toHaveLength(2);
});
