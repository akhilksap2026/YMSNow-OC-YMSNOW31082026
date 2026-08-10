import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../app";
import { db, pool } from "../db";
import {
  locationHistory,
  gateTransactions,
  sealHistory,
  moveTasks,
  visits,
  yardSlots,
  dockDoors,
  auditLogs,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

let server: Server | undefined;
let baseUrl = "";

/** Boot the Express app on an ephemeral port for the test file. */
export async function startTestServer(): Promise<string> {
  if (server) return baseUrl;
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

export async function stopTestServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server!.close((err) => (err ? reject(err) : resolve())),
  );
  server = undefined;
  // Drain the DB pool so the test process exits promptly instead of hanging
  // on the open connection handle until the runner's force-exit timeout.
  try {
    await pool.end();
  } catch {
    // pool may already be closed; ignore.
  }
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** Minimal JSON fetch helper against the booted test server. */
export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

/**
 * Remove all rows a test created for the given visit ids, in FK-safe order,
 * so tests never disturb the shared seed data they run alongside.
 */
export async function cleanupVisits(visitIds: number[]): Promise<void> {
  const ids = visitIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;

  // Release any slots/docks still pointing at these visits.
  await db.update(yardSlots).set({ currentVisitId: null }).where(inArray(yardSlots.currentVisitId, ids));
  await db.update(dockDoors).set({ currentVisitId: null }).where(inArray(dockDoors.currentVisitId, ids));

  // Child rows referencing the visit (no cascade in schema).
  await db.delete(locationHistory).where(inArray(locationHistory.visitId, ids));
  await db.delete(gateTransactions).where(inArray(gateTransactions.visitId, ids));
  await db.delete(sealHistory).where(inArray(sealHistory.visitId, ids));
  await db.delete(moveTasks).where(inArray(moveTasks.visitId, ids));
  // Scope audit-log cleanup to *visit* rows only. entityId is not an FK and is
  // reused across entity types (slots, doors, moves), so an unscoped delete
  // could remove unrelated records in the shared dev database.
  await db.delete(auditLogs).where(and(eq(auditLogs.entityType, "visit"), inArray(auditLogs.entityId, ids)));

  await db.delete(visits).where(inArray(visits.id, ids));
}

/** Sort location-history rows chronologically (endpoint returns them desc). */
export function chronological<T extends { id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id - b.id);
}
