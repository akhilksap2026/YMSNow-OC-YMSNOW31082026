import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  startTestServer,
  stopTestServer,
  api,
  cleanupVisits,
} from "../test/helpers";

const createdVisitIds: number[] = [];

async function createTestVisit(): Promise<number> {
  const res = await api("POST", "/api/gate/check-in", {
    driverName: "Meta Driver",
    truckNumber: "META-TRUCK",
    trailerNumber: `META-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
    movementType: "inbound",
    trailerClass: "general",
    ownerType: "external",
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const id = res.body.id as number;
  createdVisitIds.push(id);
  return id;
}

before(async () => {
  await startTestServer();
});

after(async () => {
  await cleanupVisits(createdVisitIds);
  await stopTestServer();
});

describe("PATCH /api/visits/:id/tags", () => {
  test("adds cleaned, de-duplicated, trimmed tags", async () => {
    const id = await createTestVisit();
    const res = await api("PATCH", `/api/visits/${id}/tags`, {
      tags: ["  priority  ", "priority", "reefer", ""],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.tags, ["priority", "reefer"]);
  });

  test("rejects a non-array payload with 400", async () => {
    const id = await createTestVisit();
    const res = await api("PATCH", `/api/visits/${id}/tags`, { tags: "not-an-array" });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /array/i);
  });

  test("rejects a missing tags field with 400", async () => {
    const id = await createTestVisit();
    const res = await api("PATCH", `/api/visits/${id}/tags`, {});
    assert.equal(res.status, 400);
  });

  test("drops tags longer than 40 characters", async () => {
    const id = await createTestVisit();
    const longTag = "x".repeat(41);
    const okTag = "y".repeat(40);
    const res = await api("PATCH", `/api/visits/${id}/tags`, { tags: [longTag, okTag] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(!res.body.tags.includes(longTag), "41-char tag must be dropped");
    assert.ok(res.body.tags.includes(okTag), "40-char tag must be kept");
  });

  test("caps the number of tags at 20", async () => {
    const id = await createTestVisit();
    const many = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const res = await api("PATCH", `/api/visits/${id}/tags`, { tags: many });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.tags.length, 20);
  });

  test("a non-numeric visit id does not corrupt data and never 500s", async () => {
    const res = await api("PATCH", "/api/visits/not-a-number/tags", { tags: ["x"] });
    // Route coerces id with Number(); an invalid id must fail cleanly, not crash.
    assert.notEqual(res.status, 500, JSON.stringify(res.body));
    assert.ok(res.status === 400 || res.status === 404, `unexpected status ${res.status}`);
  });
});

describe("PATCH /api/visits/:id/license-plate", () => {
  test("stores a trimmed license plate", async () => {
    const id = await createTestVisit();
    const res = await api("PATCH", `/api/visits/${id}/license-plate`, { licensePlate: "  OH-1234A  " });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.licensePlate, "OH-1234A");
  });

  test("clears the plate when given an empty value", async () => {
    const id = await createTestVisit();
    await api("PATCH", `/api/visits/${id}/license-plate`, { licensePlate: "OH-9999Z" });
    const res = await api("PATCH", `/api/visits/${id}/license-plate`, { licensePlate: "" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.licensePlate, null);
  });

  test("a non-numeric visit id never 500s", async () => {
    const res = await api("PATCH", "/api/visits/not-a-number/license-plate", { licensePlate: "OH-1234A" });
    assert.notEqual(res.status, 500, JSON.stringify(res.body));
    assert.ok(res.status === 400 || res.status === 404, `unexpected status ${res.status}`);
  });
});
