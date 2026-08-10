import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  startTestServer,
  stopTestServer,
  api,
  cleanupVisits,
  chronological,
} from "../test/helpers";

interface LocRow {
  id: number;
  source: string;
  fromLocation: string | null;
  toLocation: string | null;
  locationStatus: string | null;
  trailerNumber: string | null;
}

// Visits created during these tests, torn down in `after`.
const createdVisitIds: number[] = [];

before(async () => {
  await startTestServer();
});

after(async () => {
  await cleanupVisits(createdVisitIds);
  await stopTestServer();
});

describe("location history follows a trailer through its whole visit", () => {
  test("gate-in → slot → move to dock → gate-out records an ordered trail", async () => {
    const trailerNumber = `TEST-${Date.now().toString(36).toUpperCase()}`;

    // 1. Gate check-in
    const checkIn = await api("POST", "/api/gate/check-in", {
      driverName: "Test Driver",
      truckNumber: "TEST-TRUCK",
      trailerNumber,
      movementType: "inbound",
      trailerClass: "general",
      ownerType: "external",
    });
    assert.equal(checkIn.status, 200, JSON.stringify(checkIn.body));
    const visitId = checkIn.body.id as number;
    createdVisitIds.push(visitId);
    assert.equal(checkIn.body.visitStatus, "checked_in");
    assert.equal(checkIn.body.locationStatus, "at_gate_in");

    // History after check-in: exactly one gate_check_in row.
    let hist = chronological((await api<LocRow[]>("GET", `/api/visits/${visitId}/location-history`)).body);
    assert.equal(hist.length, 1);
    assert.equal(hist[0].source, "gate_check_in");
    assert.equal(hist[0].fromLocation, null);
    assert.equal(hist[0].toLocation, "Gate In");

    // 2. Assign a yard slot
    const slots = (await api("GET", "/api/yard/available-slots")).body as Array<{ id: number; slotNumber: string }>;
    assert.ok(slots.length > 0, "expected at least one available slot in seed data");
    const slot = slots[0];
    const assignSlot = await api("POST", "/api/yard/assign-slot", { visitId, slotId: slot.id });
    assert.equal(assignSlot.status, 200, JSON.stringify(assignSlot.body));

    // The visit's current location must reflect the slot.
    const afterSlot = (await api("GET", "/api/yard/inventory")).body.find((v: any) => v.id === visitId);
    assert.equal(afterSlot.currentSlotNumber, slot.slotNumber);
    assert.equal(afterSlot.locationStatus, "in_yard_slot");

    hist = chronological((await api<LocRow[]>("GET", `/api/visits/${visitId}/location-history`)).body);
    assert.equal(hist.length, 2);
    assert.equal(hist[1].source, "slot_assigned");
    assert.equal(hist[1].fromLocation, "Gate In");
    assert.equal(hist[1].toLocation, `Slot ${slot.slotNumber}`);

    // 3. Create + complete a move from the slot to a dock door
    const doors = (await api("GET", "/api/dock/available-doors")).body as Array<{ id: number; doorNumber: string }>;
    assert.ok(doors.length > 0, "expected at least one available dock door in seed data");
    const door = doors[0];
    const move = await api("POST", "/api/moves", {
      visitId,
      moveType: "reposition",
      fromLocationType: "slot",
      fromLocationId: slot.id,
      toLocationType: "dock",
      toLocationId: door.id,
    });
    assert.equal(move.status, 200, JSON.stringify(move.body));
    const moveId = move.body.id as number;

    const complete = await api("PATCH", `/api/moves/${moveId}`, { status: "completed" });
    assert.equal(complete.status, 200, JSON.stringify(complete.body));

    const afterMove = (await api("GET", "/api/yard/inventory")).body.find((v: any) => v.id === visitId);
    assert.ok(
      String(afterMove.currentDockDoor).includes(door.doorNumber),
      `expected current dock door to reference ${door.doorNumber}, got ${afterMove.currentDockDoor}`,
    );
    assert.equal(afterMove.locationStatus, "at_dock_door");

    hist = chronological((await api<LocRow[]>("GET", `/api/visits/${visitId}/location-history`)).body);
    assert.equal(hist.length, 3);
    assert.equal(hist[2].source, "move_completed");
    assert.equal(hist[2].fromLocation, `Slot ${slot.slotNumber}`);
    assert.equal(hist[2].toLocation, `Door ${door.doorNumber}`);

    // 4. Gate check-out
    const checkOut = await api("POST", "/api/gate/check-out", { visitId });
    assert.equal(checkOut.status, 200, JSON.stringify(checkOut.body));
    assert.equal(checkOut.body.visitStatus, "closed");
    assert.equal(checkOut.body.locationStatus, "exited");

    hist = chronological((await api<LocRow[]>("GET", `/api/visits/${visitId}/location-history`)).body);
    assert.equal(hist.length, 4);

    // Full ordered trail, verified end to end.
    assert.deepEqual(
      hist.map((h) => h.source),
      ["gate_check_in", "slot_assigned", "move_completed", "gate_check_out"],
    );
    assert.equal(hist[3].toLocation, "Gate Out");
    assert.equal(hist[3].locationStatus, "exited");

    // Every row carries the trailer number for traceability.
    for (const row of hist) {
      assert.equal(row.trailerNumber, trailerNumber);
    }
  });
});

describe("reports summary dwell-by-trailer-class", () => {
  test("returns one entry per class with non-negative averages", async () => {
    const res = await api("GET", "/api/reports/summary");
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const dwellByType = res.body.dwellByType;
    assert.ok(Array.isArray(dwellByType), "dwellByType must be an array");

    const expectedClasses = ["general", "internal_network", "empty", "non_mail_storage"];
    assert.deepEqual(
      dwellByType.map((d: any) => d.trailerClass),
      expectedClasses,
    );

    for (const entry of dwellByType) {
      assert.equal(typeof entry.label, "string");
      assert.ok(entry.label.length > 0);
      assert.equal(typeof entry.visits, "number");
      assert.ok(entry.visits >= 0);
      assert.equal(typeof entry.avgDwellMinutes, "number");
      assert.ok(entry.avgDwellMinutes >= 0, "avgDwellMinutes must never be negative");
      // A class with no qualifying visits must report a zero average, not NaN.
      if (entry.visits === 0) assert.equal(entry.avgDwellMinutes, 0);
    }
  });
});
