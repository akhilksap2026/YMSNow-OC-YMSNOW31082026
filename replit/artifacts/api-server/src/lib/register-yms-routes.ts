import type { Express } from "express";
import { storage } from "../lib/storage";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { generateManualHtml } from "../lib/manual-html";
import { registerAssistantRoutes } from "../lib/assistant";
import {
  getRolesFromDb,
  getPermissionsFromDb,
  getRolePermissionsFromDb,
  getPermissionsForRole,
  requirePermission,
  checkPermission,
  getWorkflowOwner,
} from "../lib/rbac";


import {
  insertCarrierSchema,
  insertYardZoneSchema,
  insertYardSlotSchema,
  insertDockDoorSchema,
  insertGateSchema,
  insertAppointmentSchema,
  visits,
  appointments,
  exceptions,
  yardAuditItems,
  yardSlots,
  carriers,
  inspections,
  moveTasks,
  dockDoors,
  emailAiAlerts,
  emailIntelligenceConfig,
  carrierContacts,
  sealHistory,
  locationHistory,
  dwellThresholds,
  auditLogs,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  userProfiles,
  insertRoleSchema,
  insertRolePermissionSchema,
  facilityModuleSubscriptions,
} from "@workspace/db";
import { z } from "zod";
import { db } from "../db";
import { ne, and, eq, sql, count, desc, isNotNull, isNull, gte, lt, or, notInArray, inArray } from "drizzle-orm";
import {
  processDemoEmails,
  getEmailAlertsFull,
  getEmailIntelligenceConfig,
  seedCarrierContacts,
} from "./email-intelligence";
import { facilities, insertFacilitySchema } from "@workspace/db";
import { resolveFacilityScope, DEFAULT_FACILITY_ID } from "./facility";
import { isSuperAdmin } from "./rbac";

// Resolve a human-readable label for a visit's *current* location, used as the
// "from" side when appending a location_history row.
async function resolveVisitLocation(visit: any): Promise<string> {
  if (visit?.currentSlotId) {
    const [slot] = await db.select({ slotNumber: yardSlots.slotNumber }).from(yardSlots).where(eq(yardSlots.id, visit.currentSlotId));
    return slot ? `Slot ${slot.slotNumber}` : `Slot #${visit.currentSlotId}`;
  }
  if (visit?.currentDockDoorId) {
    const [door] = await db.select({ doorNumber: dockDoors.doorNumber }).from(dockDoors).where(eq(dockDoors.id, visit.currentDockDoorId));
    return door ? `Door ${door.doorNumber}` : `Door #${visit.currentDockDoorId}`;
  }
  const map: Record<string, string> = {
    at_gate_in: "Gate In",
    at_gate_out: "Gate Out",
    in_staging: "Staging",
    exited: "Exited",
  };
  return map[visit?.locationStatus as string] || "Gate";
}

// Resolve a human-readable label from a move task's location type + id.
async function resolveLocationByRef(type: string | null | undefined, id: number | null | undefined): Promise<string | null> {
  if (type === "slot" && id) {
    const [slot] = await db.select({ slotNumber: yardSlots.slotNumber }).from(yardSlots).where(eq(yardSlots.id, id));
    return slot ? `Slot ${slot.slotNumber}` : `Slot #${id}`;
  }
  if (type === "dock" && id) {
    const [door] = await db.select({ doorNumber: dockDoors.doorNumber }).from(dockDoors).where(eq(dockDoors.id, id));
    return door ? `Door ${door.doorNumber}` : `Door #${id}`;
  }
  if (type === "gate") return "Gate";
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : null;
}

// Carrier personas send their carrierId via this header (there's no real session auth in
// this demo app — x-user-role is trusted the same way elsewhere in rbac.ts). Missing/invalid
// values fall back to undefined, which callers must treat as "no carrier scoping applied".
function parseCarrierIdHeader(req: any): number | undefined {
  const raw = req.headers["x-carrier-id"];
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : undefined;
}

export async function registerYmsRoutes(app: Express): Promise<void> {
  
  // User Profile
  app.get("/api/user/profile", async (req: any, res) => {
    try {
      const userId = "demo-user";
      let profile = await storage.getUserProfile(userId);
      if (!profile) {
        // Ensure the demo user exists in the users table first
        await storage.ensureDemoUser(userId);
        profile = await storage.upsertUserProfile({
          userId,
          role: "admin",
          isActive: true,
        });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Dashboard
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "";
      const carrierId = role === "carrier" ? parseCarrierIdHeader(req) : undefined;
      const { facilityId } = resolveFacilityScope(req);
      const stats = await storage.getDashboardStats(carrierId, facilityId);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  // Carriers
  app.get("/api/carriers", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    const data = await storage.getCarriers(facilityId);
    res.json(data);
  });

  app.post("/api/carriers", async (req: any, res) => {
    try {
      const parsed = insertCarrierSchema.parse(req.body);
      const { facilityId } = resolveFacilityScope(req);
      const carrier = await storage.createCarrier({ ...parsed, facilityId: parsed.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "carrier_created",
        entityType: "carrier",
        entityId: carrier.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { name: carrier.name },
      });
      res.json(carrier);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/carriers/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, scacCode, contactName, contactEmail, contactPhone, address, isActive, brandColour } = req.body;
      const updated = await storage.updateCarrier(id, { name, scacCode, contactName, contactEmail, contactPhone, address, isActive, brandColour });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/carriers/in-yard", async (_req, res) => {
    try {
      const rows = await db
        .select({ carrierId: visits.carrierId, count: sql<number>`count(*)::int` })
        .from(visits)
        .where(and(
          isNotNull(visits.carrierId),
          ne(visits.visitStatus, "closed" as any),
          isNotNull(visits.checkInTime),
          isNull(visits.checkOutTime),
        ))
        .groupBy(visits.carrierId);
      const result: Record<number, number> = {};
      rows.forEach((r) => { if (r.carrierId) result[r.carrierId] = r.count; });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Carrier Performance Ratings
  app.get("/api/admin/carriers/performance", async (_req, res) => {
    try {
      const visitData = await db
        .select({
          carrierId: visits.carrierId,
          checkInTime: visits.checkInTime,
          checkOutTime: visits.checkOutTime,
          scheduledDate: appointments.scheduledDate,
          timeWindowEnd: appointments.timeWindowEnd,
        })
        .from(visits)
        .leftJoin(appointments, eq(visits.appointmentId, appointments.id))
        .where(isNotNull(visits.checkInTime));

      const statsMap: Record<number, { dwellMinutes: number[]; delays: number[] }> = {};

      for (const row of visitData) {
        if (!row.carrierId || !row.checkInTime) continue;
        if (!statsMap[row.carrierId]) statsMap[row.carrierId] = { dwellMinutes: [], delays: [] };
        const s = statsMap[row.carrierId];

        const checkIn = new Date(row.checkInTime);
        const checkOut = row.checkOutTime ? new Date(row.checkOutTime) : new Date();
        s.dwellMinutes.push(Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 60000));

        if (row.scheduledDate && row.timeWindowEnd) {
          const [h, m] = (row.timeWindowEnd as string).split(":").map(Number);
          const windowEnd = new Date(row.scheduledDate);
          windowEnd.setHours(h, m, 0, 0);
          s.delays.push((checkIn.getTime() - windowEnd.getTime()) / 60000);
        }
      }

      const result = Object.entries(statsMap).map(([carrierId, s]) => {
        const avgDwell = s.dwellMinutes.length > 0
          ? s.dwellMinutes.reduce((a, b) => a + b, 0) / s.dwellMinutes.length : 0;
        const avgDelay = s.delays.length > 0
          ? s.delays.reduce((a, b) => a + b, 0) / s.delays.length : 0;
        const onTimeCount = s.delays.filter((d) => d <= 15).length;
        const onTimeRate = s.delays.length > 0 ? onTimeCount / s.delays.length : null;

        const dwellScore = avgDwell < 120 ? 5 : avgDwell < 240 ? 4 : avgDwell < 480 ? 3 : avgDwell < 720 ? 2 : 1;
        const onTimeScore = onTimeRate === null ? 3
          : onTimeRate >= 0.9 ? 5 : onTimeRate >= 0.75 ? 4 : onTimeRate >= 0.6 ? 3 : onTimeRate >= 0.4 ? 2 : 1;
        const rating = Math.round(dwellScore * 0.4 + onTimeScore * 0.6);

        return {
          carrierId: Number(carrierId),
          totalVisits: s.dwellMinutes.length,
          avgDwellMinutes: Math.round(avgDwell),
          avgDelayMinutes: Math.round(avgDelay),
          onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) : null,
          rating,
        };
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Yard Zones
  app.get("/api/yard/zones", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getYardZones(facilityId));
  });

  app.get("/api/yard/zones/capacity", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getZonesCapacity(facilityId));
  });

  app.post("/api/yard/zones", async (req: any, res) => {
    try {
      const parsed = insertYardZoneSchema.parse(req.body);
      const { facilityId } = resolveFacilityScope(req);
      const zone = await storage.createYardZone({ ...parsed, facilityId: parsed.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "zone_created",
        entityType: "yard_zone",
        entityId: zone.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { name: zone.name, code: zone.code },
      });
      res.json(zone);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/yard/zones/:id", async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      const zone = await storage.updateYardZone(id, data);
      await storage.createAuditLog({
        action: data.isActive === false ? "zone_deactivated" : "zone_updated",
        entityType: "yard_zone",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: data,
      });
      res.json(zone);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Yard Slots
  app.get("/api/yard/slots", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getYardSlots(facilityId));
  });

  app.get("/api/yard/available-slots", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getAvailableSlots(facilityId));
  });

  app.post("/api/yard/slots", async (req: any, res) => {
    try {
      const parsed = insertYardSlotSchema.parse(req.body);
      const { facilityId } = resolveFacilityScope(req);
      const slot = await storage.createYardSlot({ ...parsed, facilityId: parsed.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "slot_created",
        entityType: "yard_slot",
        entityId: slot.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { slotNumber: slot.slotNumber },
      });
      res.json(slot);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/yard/slots/:id", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      if (data.isActive === false) {
        const { facilityId } = resolveFacilityScope(req);
        const allSlots = await storage.getYardSlots(facilityId);
        const slot = allSlots.find((s) => s.id === id);
        if (slot?.currentVisitId) {
          return void res.status(409).json({ message: "Cannot deactivate: slot has an active trailer assigned" });
        }
      }
      const slot = await storage.updateYardSlot(id, data);
      await storage.createAuditLog({
        action: data.isActive === false ? "slot_deactivated" : "slot_updated",
        entityType: "yard_slot",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: data,
      });
      return void res.json(slot);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/yard/slots/bulk", async (req: any, res): Promise<void> => {
    try {
      const { ids, data } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return void res.status(400).json({ message: "ids required" });
      await storage.bulkUpdateSlots(ids, data);
      await storage.createAuditLog({
        action: "slots_bulk_updated",
        entityType: "yard_slot",
        entityId: 0,
        userId: "demo-user",
        userName: "Demo User",
        details: { ids, ...data },
      });
      return void res.json({ updated: ids.length });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Assign Slot
  app.post("/api/yard/assign-slot", async (req: any, res): Promise<void> => {
    try {
      const visitId = Number(req.body.visitId);
      const slotId = Number(req.body.slotId);
      if (!visitId || !slotId) return void res.status(400).json({ message: "visitId and slotId are required" });
      const visit = await storage.getVisit(visitId);
      if (!visit) return void res.status(404).json({ message: "Visit not found" });

      if (visit.holdStatus !== "none") {
        return void res.status(400).json({ message: "Cannot assign slot: visit has an active hold" });
      }

      if (visit.currentSlotId) {
        await storage.updateSlotVisit(visit.currentSlotId, null);
      }
      await storage.updateSlotVisit(slotId, visitId);
      const updated = await storage.updateVisit(visitId, {
        currentSlotId: slotId,
        visitStatus: "in_yard",
        locationStatus: "in_yard_slot",
      });

      await storage.createAuditLog({
        action: "slot_assigned",
        entityType: "visit",
        entityId: visitId,
        userId: "demo-user",
        userName: "Demo User",
        details: { slotId },
      });

      const [assignedSlot] = await db.select({ slotNumber: yardSlots.slotNumber }).from(yardSlots).where(eq(yardSlots.id, slotId));
      await storage.createLocationHistory({
        visitId,
        trailerNumber: visit.trailerNumber,
        fromLocation: await resolveVisitLocation(visit),
        toLocation: assignedSlot ? `Slot ${assignedSlot.slotNumber}` : `Slot #${slotId}`,
        locationStatus: "in_yard_slot",
        source: "slot_assigned",
        changedBy: "demo-user",
        changedByName: "Demo User",
      });

      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Dock Doors
  app.get("/api/dock/all-doors", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getAllDockDoors(facilityId));
  });

  app.get("/api/dock/available-doors", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getAvailableDoors(facilityId));
  });

  app.get("/api/dock/doors", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getDockDoorsView(facilityId));
  });

  // Trailers waiting in the yard for a dock door — dashboard "up next" queue for dock staff.
  app.get("/api/dock/queue", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getDockQueue(facilityId));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dock/doors", async (req: any, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const door = await storage.createDockDoor({ ...req.body, facilityId: req.body.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "dock_door_created",
        entityType: "dock_door",
        entityId: door.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { doorNumber: door.doorNumber },
      });
      res.json(door);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/dock/doors/:id", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      if (data.isActive === false) {
        const { facilityId } = resolveFacilityScope(req);
        const allDoors = await storage.getAllDockDoors(facilityId);
        const door = allDoors.find((d) => d.id === id);
        if (door?.currentVisitId) {
          return void res.status(409).json({ message: "Cannot deactivate: door has an active trailer assigned" });
        }
      }
      const door = await storage.updateDockDoor(id, data);
      await storage.createAuditLog({
        action: data.isActive === false ? "dock_door_deactivated" : "dock_door_updated",
        entityType: "dock_door",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: data,
      });
      return void res.json(door);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/dock/doors/bulk", async (req: any, res): Promise<void> => {
    try {
      const { ids, data } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return void res.status(400).json({ message: "ids required" });
      await storage.bulkUpdateDoors(ids, data);
      await storage.createAuditLog({
        action: "dock_doors_bulk_updated",
        entityType: "dock_door",
        entityId: 0,
        userId: "demo-user",
        userName: "Demo User",
        details: { ids, ...data },
      });
      return void res.json({ updated: ids.length });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Dock Assign
  app.post("/api/dock/assign", async (req: any, res): Promise<void> => {
    try {
      const visitId = Number(req.body.visitId);
      const dockDoorId = Number(req.body.dockDoorId);
      if (!visitId || !dockDoorId) return void res.status(400).json({ message: "visitId and dockDoorId are required" });
      const visit = await storage.getVisit(visitId);
      if (!visit) return void res.status(404).json({ message: "Visit not found" });

      if (visit.holdStatus !== "none") {
        return void res.status(400).json({ message: "Cannot assign dock: visit has an active hold" });
      }

      if (visit.currentSlotId) {
        await storage.updateSlotVisit(visit.currentSlotId, null);
      }
      if (visit.currentDockDoorId) {
        await storage.updateDoorVisit(visit.currentDockDoorId, null);
      }

      await storage.updateDoorVisit(dockDoorId, visitId);
      const updated = await storage.updateVisit(visitId, {
        currentDockDoorId: dockDoorId,
        currentSlotId: null,
        visitStatus: "at_dock",
        locationStatus: "at_dock_door",
      });

      await storage.createAuditLog({
        action: "dock_assigned",
        entityType: "visit",
        entityId: visitId,
        userId: "demo-user",
        userName: "Demo User",
        details: { dockDoorId },
      });

      const [assignedDoor] = await db.select({ doorNumber: dockDoors.doorNumber }).from(dockDoors).where(eq(dockDoors.id, dockDoorId));
      await storage.createLocationHistory({
        visitId,
        trailerNumber: visit.trailerNumber,
        fromLocation: await resolveVisitLocation(visit),
        toLocation: assignedDoor ? `Door ${assignedDoor.doorNumber}` : `Door #${dockDoorId}`,
        locationStatus: "at_dock_door",
        source: "dock_assigned",
        changedBy: "demo-user",
        changedByName: "Demo User",
      });

      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Dock Actions
  app.post("/api/dock/action", async (req: any, res): Promise<void> => {
    try {
      const { visitId, action } = req.body;
      const visit = await storage.getVisit(visitId);
      if (!visit) return void res.status(404).json({ message: "Visit not found" });

      let update: Partial<any> = {};
      switch (action) {
        case "start_loading":
          update = { visitStatus: "loading" };
          break;
        case "start_unloading":
          update = { visitStatus: "unloading" };
          break;
        case "complete":
          update = { visitStatus: "ready_out" };
          break;
        case "release":
          if (visit.currentDockDoorId) {
            await storage.updateDoorVisit(visit.currentDockDoorId, null);
          }
          update = {
            visitStatus: visit.visitStatus === "ready_out" ? "ready_out" : "in_yard",
            locationStatus: "in_staging",
            currentDockDoorId: null,
          };
          break;
        default:
          return void res.status(400).json({ message: "Invalid action" });
      }

      const updated = await storage.updateVisit(visitId, update);
      await storage.createAuditLog({
        action: `dock_${action}`,
        entityType: "visit",
        entityId: visitId,
        userId: "demo-user",
        userName: "Demo User",
        details: { action },
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Gates
  app.get("/api/gates", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getGates(facilityId));
  });

  app.post("/api/gates", async (req: any, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const gate = await storage.createGate({ ...req.body, facilityId: req.body.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "gate_created",
        entityType: "gate",
        entityId: gate.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { name: gate.name, type: gate.type },
      });
      res.json(gate);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/gates/:id", async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const data = req.body;
      const gate = await storage.updateGate(id, data);
      await storage.createAuditLog({
        action: data.isActive === false ? "gate_deactivated" : "gate_updated",
        entityType: "gate",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: data,
      });
      res.json(gate);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Appointments
  app.get("/api/appointments", async (req, res) => {
    const role = (req.headers["x-user-role"] as string) || "";
    const carrierId = role === "carrier" ? parseCarrierIdHeader(req) : undefined;
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.getAppointments(carrierId, facilityId));
  });

  app.get("/api/appointments/search", async (req, res) => {
    const q = (req.query.q as string) || "";
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.searchAppointments(q, facilityId));
  });

  app.post("/api/appointments", async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (!body.referenceNumber) {
        body.referenceNumber = `APT-${Date.now().toString(36).toUpperCase()}`;
      }
      if (typeof body.scheduledDate === "string") {
        body.scheduledDate = new Date(body.scheduledDate);
      }
      const parsed = insertAppointmentSchema.parse(body);
      const { facilityId } = resolveFacilityScope(req);
      const apt = await storage.createAppointment({ ...parsed, facilityId: parsed.facilityId ?? facilityId ?? DEFAULT_FACILITY_ID });
      await storage.createAuditLog({
        action: "appointment_created",
        entityType: "appointment",
        entityId: apt.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { referenceNumber: apt.referenceNumber },
      });
      res.json(apt);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/appointments/:id", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const apt = await storage.getAppointment(id);
      if (!apt) return void res.status(404).json({ message: "Appointment not found" });

      const { scheduledDate, timeWindowStart, timeWindowEnd, status, ...rest } = req.body;
      const updateData: any = { ...rest };
      if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate);
      if (timeWindowStart) updateData.timeWindowStart = timeWindowStart;
      if (timeWindowEnd) updateData.timeWindowEnd = timeWindowEnd;
      if (status) {
        updateData.status = status;
      } else if (scheduledDate) {
        updateData.status = "rescheduled";
      }

      const updated = await storage.updateAppointment(id, updateData);
      await storage.createAuditLog({
        action: "appointment_rescheduled",
        entityType: "appointment",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: { referenceNumber: apt.referenceNumber, scheduledDate: updated.scheduledDate },
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Gate Stats (check-in side)
  app.get("/api/gate/stats", async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { facilityId } = resolveFacilityScope(req);

      const allAppointments = await storage.getAppointments(undefined, facilityId);
      const todayAppointments = allAppointments.filter(
        (a) => new Date(a.scheduledDate) >= todayStart && new Date(a.scheduledDate) < new Date(todayStart.getTime() + 86400000)
      );

      const allVisits = facilityId != null ? await db.select().from(visits).where(eq(visits.facilityId, facilityId)) : await db.select().from(visits);
      const todayCheckins = allVisits.filter(
        (v) => v.checkInTime && new Date(v.checkInTime) >= todayStart
      );
      const todayWalkins = todayCheckins.filter((v) => !v.appointmentId);
      const todayCheckouts = allVisits.filter(
        (v) => v.checkOutTime && new Date(v.checkOutTime) >= todayStart
      );

      const activeVisits = allVisits.filter((v) => v.visitStatus !== "closed");
      const onHold = activeVisits.filter((v) => v.holdStatus !== "none");
      const readyOut = activeVisits.filter((v) => v.visitStatus === "ready_out");
      const blockedExits = activeVisits.filter((v) => v.visitStatus === "ready_out" && v.holdStatus !== "none");

      const exceptionsToday = facilityId != null
        ? await db.select({ c: count() }).from(exceptions)
            .innerJoin(visits, eq(exceptions.visitId, visits.id))
            .where(and(sql`${exceptions.createdAt} >= ${todayStart}`, eq(visits.facilityId, facilityId)))
        : await db.select({ c: count() }).from(exceptions)
            .where(sql`${exceptions.createdAt} >= ${todayStart}`);

      res.json({
        expectedToday: todayAppointments.length,
        checkedInToday: todayCheckins.length,
        walkInsToday: todayWalkins.length,
        exceptionsToday: Number(exceptionsToday[0]?.c || 0),
        completedExitsToday: todayCheckouts.length,
        readyOut: readyOut.length,
        blockedExits: blockedExits.length,
        onHold: onHold.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Expected trucks (today's appointments with status)
  app.get("/api/gate/expected-trucks", async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      const { facilityId } = resolveFacilityScope(req);

      const allAppointments = await storage.getAppointments(undefined, facilityId);
      const todayAppointments = allAppointments.filter(
        (a) => new Date(a.scheduledDate) >= todayStart && new Date(a.scheduledDate) < todayEnd
      );

      const allCarriers = await storage.getCarriers(facilityId);
      const carrierMap = new Map(allCarriers.map((c) => [c.id, c.name]));

      const allVisits = facilityId != null ? await db.select().from(visits).where(eq(visits.facilityId, facilityId)) : await db.select().from(visits);
      const checkedInAppointmentIds = new Set(
        allVisits.filter((v) => v.appointmentId && v.visitStatus !== "closed").map((v) => v.appointmentId)
      );

      const result = todayAppointments.map((a) => {
        const isCheckedIn = checkedInAppointmentIds.has(a.id);
        const windowEnd = a.timeWindowEnd;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [endH, endM] = (windowEnd || "23:59").split(":").map(Number);
        const endMinutes = endH * 60 + endM;
        const isLate = !isCheckedIn && nowMinutes > endMinutes && a.status !== "cancelled";
        const isSoon = !isCheckedIn && !isLate && endMinutes - nowMinutes <= 60 && endMinutes >= nowMinutes;

        let gateStatus = "Expected";
        if (a.status === "cancelled") gateStatus = "Cancelled";
        else if (isCheckedIn) gateStatus = "Checked In";
        else if (isLate) gateStatus = "Late";
        else if (isSoon) gateStatus = "Arriving Soon";

        return {
          id: a.id,
          referenceNumber: a.referenceNumber,
          carrierName: a.carrierId ? carrierMap.get(a.carrierId) || "Unknown" : "Unknown",
          trailerNumber: a.trailerNumber,
          movementType: a.movementType,
          timeWindowStart: a.timeWindowStart,
          timeWindowEnd: a.timeWindowEnd,
          driverName: a.driverName,
          status: a.status,
          gateStatus,
        };
      });

      result.sort((a, b) => {
        const order: Record<string, number> = { "Late": 0, "Arriving Soon": 1, "Expected": 2, "Checked In": 3, "Cancelled": 4 };
        return (order[a.gateStatus] ?? 5) - (order[b.gateStatus] ?? 5);
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Expected check-outs (active visits that are ready to leave or close to leaving)
  app.get("/api/gate/expected-checkouts", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const activeVisits = await db.select().from(visits)
        .where(and(
          ne(visits.visitStatus, "closed"),
          ne(visits.visitStatus, "checked_out"),
          facilityId != null ? eq(visits.facilityId, facilityId) : undefined
        ));

      const allCarriers = await storage.getCarriers(facilityId);
      const carrierMap = new Map(allCarriers.map((c) => [c.id, c.name]));

      const allSlots = await storage.getYardSlots(facilityId);
      const slotMap = new Map(allSlots.map((s) => [s.id, s.slotNumber]));

      const allDoors = await storage.getAllDockDoors(facilityId);
      const doorMap = new Map(allDoors.map((d) => [d.id, d.doorNumber]));

      const result = activeVisits.map((v) => {
        let location = v.locationStatus?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Unknown";
        if (v.currentSlotId && slotMap.has(v.currentSlotId)) location = `Slot ${slotMap.get(v.currentSlotId)}`;
        if (v.currentDockDoorId && doorMap.has(v.currentDockDoorId)) location = `Door ${doorMap.get(v.currentDockDoorId)}`;

        let exitReadiness = "Not Ready";
        if (v.visitStatus === "ready_out" && v.holdStatus === "none") exitReadiness = "Ready";
        else if (v.visitStatus === "ready_out" && v.holdStatus !== "none") exitReadiness = "On Hold";
        else if (v.holdStatus !== "none") exitReadiness = "On Hold";
        else if (v.visitStatus === "at_dock" || v.visitStatus === "loading" || v.visitStatus === "unloading") exitReadiness = "At Dock";
        else if (v.visitStatus === "in_yard") exitReadiness = "In Yard";
        else if (v.visitStatus === "checked_in") exitReadiness = "Pending";

        return {
          id: v.id,
          visitNumber: v.visitNumber,
          trailerNumber: v.trailerNumber,
          truckNumber: v.truckNumber,
          carrierName: v.carrierId ? carrierMap.get(v.carrierId) || "Unknown" : "Unknown",
          visitStatus: v.visitStatus,
          holdStatus: v.holdStatus,
          location,
          exitReadiness,
          checkInTime: v.checkInTime,
        };
      });

      result.sort((a, b) => {
        const order: Record<string, number> = { "Ready": 0, "On Hold": 1, "At Dock": 2, "In Yard": 3, "Pending": 4, "Not Ready": 5 };
        return (order[a.exitReadiness] ?? 5) - (order[b.exitReadiness] ?? 5);
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Gate Check-In Duplicate Detection
  app.get("/api/gate/check-duplicate", async (req, res): Promise<void> => {
    try {
      const trailerNumber = (req.query.trailerNumber as string) || "";
      if (!trailerNumber) return void res.json({ exists: false });
      const { facilityId } = resolveFacilityScope(req);
      const visit = await storage.getVisitByTrailer(trailerNumber, facilityId);
      return void res.json({ exists: !!visit, visitId: visit?.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Gate Check-In
  app.post("/api/gate/check-in", async (req: any, res) => {
    try {
      const {
        appointmentId,
        carrierId,
        driverName,
        driverLicense,
        truckNumber,
        trailerNumber,
        sealNumber,
        movementType,
        notes,
        trailerClass,
        ownerType,
        licensePlate,
      } = req.body;

      const visitNumber = `VST-${Date.now().toString(36).toUpperCase()}`;
      const userId = "demo-user";
      const { facilityId } = resolveFacilityScope(req);

      const visit = await storage.createVisit({
        visitNumber,
        facilityId: facilityId ?? DEFAULT_FACILITY_ID,
        appointmentId: appointmentId || null,
        carrierId: carrierId || null,
        driverName,
        driverLicense: driverLicense || null,
        truckNumber,
        trailerNumber,
        sealNumber: sealNumber || null,
        licensePlate: licensePlate || null,
        movementType: movementType || "inbound",
        trailerClass: trailerClass || "general",
        ownerType: ownerType || "external",
        locationConfirmed: true,
        visitStatus: "checked_in",
        locationStatus: "at_gate_in",
        holdStatus: "none",
        checkInTime: new Date(),
        checkInBy: userId,
        notes: notes || null,
      });

      // Record initial seal at check-in
      if (sealNumber) {
        await db.insert(sealHistory).values({
          visitId: visit.id,
          sealNumber,
          recordedBy: userId,
          eventType: "check_in",
        });
      }

      if (appointmentId) {
        await storage.updateAppointmentStatus(appointmentId, "completed");
      }

      await storage.createGateTransaction({
        visitId: visit.id,
        type: "check_in",
        userId,
      });

      const checkInRole = (req as any).headers?.["x-user-role"] || null;
      await storage.createAuditLog({
        action: "gate_check_in",
        entityType: "visit",
        entityId: visit.id,
        userId,
        userName: "Demo User",
        details: {
          visitNumber,
          trailerNumber,
          truckNumber,
          role: checkInRole,
          module: "gate",
          workflowOwner: getWorkflowOwner("checked_in"),
          previousValue: null,
          newValue: "checked_in",
        },
      });

      await storage.createLocationHistory({
        visitId: visit.id,
        trailerNumber: visit.trailerNumber,
        fromLocation: null,
        toLocation: "Gate In",
        locationStatus: "at_gate_in",
        source: "gate_check_in",
        changedBy: userId,
        changedByName: "Demo User",
      });

      res.json(visit);
    } catch (error: any) {
      console.error("Check-in error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  // Gate Check-Out
  app.post("/api/gate/check-out", async (req: any, res): Promise<void> => {
    try {
      const visitId = Number(req.body.visitId);
      if (!visitId) return void res.status(400).json({ message: "visitId is required" });
      const { sealNumber, notes } = req.body;
      const visit = await storage.getVisit(visitId);
      if (!visit) return void res.status(404).json({ message: "Visit not found" });

      if (visit.holdStatus !== "none") {
        return void res
          .status(400)
          .json({ message: "Cannot check out: visit has an active hold" });
      }

      const now = new Date();
      const userId = "demo-user";

      if (visit.currentSlotId) {
        await storage.updateSlotVisit(visit.currentSlotId, null);
      }
      if (visit.currentDockDoorId) {
        await storage.updateDoorVisit(visit.currentDockDoorId, null);
      }

      const updated = await storage.updateVisit(visitId, {
        visitStatus: "closed",
        locationStatus: "exited",
        checkOutTime: now,
        checkOutBy: userId,
        sealNumber: sealNumber || visit.sealNumber,
        currentSlotId: null,
        currentDockDoorId: null,
      });

      // Record seal at check-out
      const checkOutSeal = sealNumber || visit.sealNumber;
      if (checkOutSeal) {
        await db.insert(sealHistory).values({
          visitId: visit.id,
          sealNumber: checkOutSeal,
          recordedBy: userId,
          eventType: "check_out",
        });
      }

      await storage.createGateTransaction({
        visitId: visit.id,
        type: "check_out",
        userId,
        notes: notes || null,
      });

      const dwellMs = visit.checkInTime
        ? now.getTime() - new Date(visit.checkInTime).getTime()
        : 0;
      const hrs = Math.floor(dwellMs / 3600000);
      const mins = Math.floor((dwellMs % 3600000) / 60000);

      const checkOutRole = (req as any).headers?.["x-user-role"] || null;
      await storage.createAuditLog({
        action: "gate_check_out",
        entityType: "visit",
        entityId: visit.id,
        userId,
        userName: "Demo User",
        details: {
          visitNumber: visit.visitNumber,
          dwellTime: `${hrs}h ${mins}m`,
          role: checkOutRole,
          module: "gate",
          workflowOwner: getWorkflowOwner("closed"),
          previousValue: visit.visitStatus,
          newValue: "closed",
        },
      });

      await storage.createLocationHistory({
        visitId: visit.id,
        trailerNumber: visit.trailerNumber,
        fromLocation: await resolveVisitLocation(visit),
        toLocation: "Gate Out",
        locationStatus: "exited",
        source: "gate_check_out",
        changedBy: userId,
        changedByName: "Demo User",
      });

      return void res.json({ ...updated, dwellTime: `${hrs}h ${mins}m` });
    } catch (error: any) {
      console.error("Check-out error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  // Visits
  app.get("/api/visits/search", async (req, res) => {
    const q = (req.query.q as string) || "";
    const { facilityId } = resolveFacilityScope(req);
    res.json(await storage.searchVisits(q, facilityId));
  });

  app.patch("/api/visits/:id/status", async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { visitStatus, holdStatus, holdResolutionReason } = req.body;
      const update: any = {};
      if (visitStatus) update.visitStatus = visitStatus;
      if (holdStatus !== undefined) update.holdStatus = holdStatus;

      const updated = await storage.updateVisit(id, update);

      const prevVisit = await storage.getVisit(id);
      const statusRole = (req as any).headers?.["x-user-role"] || null;
      const auditDetails: any = {
        ...update,
        role: statusRole,
        module: holdStatus !== undefined ? "hold" : "yard_slot",
        workflowOwner: getWorkflowOwner(visitStatus || prevVisit?.visitStatus || "checked_in"),
        previousValue: prevVisit?.visitStatus || null,
        newValue: visitStatus || prevVisit?.visitStatus || null,
      };
      if (holdStatus === "none" && holdResolutionReason) {
        auditDetails.holdResolutionReason = holdResolutionReason;
      }

      await storage.createAuditLog({
        action: holdStatus === "none" ? "hold_cleared" : "visit_status_updated",
        entityType: "visit",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: auditDetails,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Location change history for a visit (LT-005/006)
  app.get("/api/visits/:id/location-history", async (req, res) => {
    try {
      const id = Number(req.params.id);
      res.json(await storage.getLocationHistory(id));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update tags on a visit (YD-007)
  app.patch("/api/visits/:id/tags", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const { tags } = req.body;
      if (!Array.isArray(tags)) return void res.status(400).json({ message: "tags must be an array" });
      const clean = Array.from(
        new Set(
          tags
            .map((t: any) => String(t).trim())
            .filter((t: string) => t.length > 0 && t.length <= 40)
        )
      ).slice(0, 20);
      const updated = await storage.updateVisit(id, { tags: clean } as any);
      await storage.createAuditLog({
        action: "visit_tags_updated",
        entityType: "visit",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: { tags: clean },
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update license plate on a visit (TI-003)
  app.patch("/api/visits/:id/license-plate", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const licensePlate = req.body.licensePlate ? String(req.body.licensePlate).trim() : null;
      const updated = await storage.updateVisit(id, { licensePlate } as any);
      await storage.createAuditLog({
        action: "visit_license_plate_updated",
        entityType: "visit",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: { licensePlate },
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Yard Inventory
  app.get("/api/yard/inventory", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getYardInventory(facilityId));
    } catch (error) {
      console.error("Yard inventory error:", error);
      res.status(500).json({ message: "Failed to load inventory" });
    }
  });

  // Yard Map
  app.get("/api/yard/map", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getYardMapData(facilityId));
    } catch (error) {
      console.error("Yard map error:", error);
      res.status(500).json({ message: "Failed to load map" });
    }
  });

  // Yard Jockeys (users with yard_jockey role)
  app.get("/api/yard/jockeys", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsersWithProfiles();
      const jockeys = allUsers.filter((u: any) => u.role === "yard_jockey" && u.isActive);
      const allActiveMoves = await db
        .select({ assignedTo: moveTasks.assignedTo, status: moveTasks.status })
        .from(moveTasks)
        .where(notInArray(moveTasks.status, ["completed", "cancelled", "rejected"]));
      const moveCountByJockey = new Map<string, number>();
      for (const m of allActiveMoves) {
        if (m.assignedTo) {
          moveCountByJockey.set(m.assignedTo, (moveCountByJockey.get(m.assignedTo) || 0) + 1);
        }
      }
      const jockeysWithStatus = jockeys.map((j: any) => {
        const activeMoveCount = moveCountByJockey.get(j.id) || 0;
        return {
          ...j,
          activeMoveCount,
          jockeyStatus: activeMoveCount > 0 ? "busy" : "available",
        };
      });
      res.json(jockeysWithStatus);
    } catch (error) {
      console.error("Jockeys error:", error);
      res.status(500).json({ message: "Failed to load jockeys" });
    }
  });

  app.get("/api/visits/:id/moves", async (req, res) => {
    try {
      const visitId = Number(req.params.id);
      const visitMoveTasks = await db
        .select()
        .from(moveTasks)
        .where(eq(moveTasks.visitId, visitId))
        .orderBy(desc(moveTasks.createdAt));
      const allUsers = await storage.getAllUsersWithProfiles();
      const userMap = new Map(allUsers.map((u: any) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id]));
      const result = visitMoveTasks.map((t) => ({
        ...t,
        assignedToName: t.assignedTo ? (userMap.get(t.assignedTo) || t.assignedTo) : null,
      }));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Move Tasks
  app.post("/api/moves", async (req: any, res): Promise<void> => {
    try {
      const { visitId, moveType, fromLocationType, fromLocationId, fromLocationName, toLocationType, toLocationId, toLocationName, loadStatus, priority, assignedTo, notes, source } = req.body;
      if (!visitId || !fromLocationType || !toLocationType) {
        return void res.status(400).json({ message: "visitId, fromLocationType, and toLocationType are required" });
      }
      const validLocationTypes = ["slot", "dock", "gate", "staging", "yard"];
      if (!validLocationTypes.includes(fromLocationType) || !validLocationTypes.includes(toLocationType)) {
        return void res.status(400).json({ message: "Invalid location type." });
      }
      if (fromLocationType === toLocationType && fromLocationId && toLocationId && Number(fromLocationId) === Number(toLocationId)) {
        return void res.status(400).json({ message: "Cannot move to the same location." });
      }
      const validPriorities = ["low", "normal", "high", "urgent"];
      if (priority && !validPriorities.includes(priority)) {
        return void res.status(400).json({ message: "Invalid priority." });
      }
      let taskStatus = "open";
      if (assignedTo) {
        const allUsers = await storage.getAllUsersWithProfiles();
        const jockey = allUsers.find((u: any) => u.id === assignedTo && u.role === "yard_jockey" && u.isActive);
        if (!jockey) {
          return void res.status(400).json({ message: "Assigned user must be an active yard jockey." });
        }
        taskStatus = "assigned";
      }
      const task = await storage.createMoveTask({
        visitId: Number(visitId),
        moveType: moveType || "reposition",
        fromLocationType,
        fromLocationId: fromLocationId ? Number(fromLocationId) : null,
        fromLocationName: fromLocationName || null,
        toLocationType,
        toLocationId: toLocationId ? Number(toLocationId) : null,
        toLocationName: toLocationName || null,
        loadStatus: loadStatus || null,
        priority: priority || "normal",
        status: taskStatus,
        assignedTo: assignedTo || null,
        notes: notes || null,
        source: source || "manual",
        createdBy: "demo-user",
      });

      // Mark trailer location as unconfirmed while move is in transit
      if (visitId) {
        await db.update(visits).set({ locationConfirmed: false } as any).where(eq(visits.id, Number(visitId)));
      }

      await storage.createAuditLog({
        action: "move_task_created",
        entityType: "move_task",
        entityId: task.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { visitId, moveType, fromLocationName, toLocationName, assignedTo, priority },
      });
      return void res.json(task);
    } catch (error: any) {
      console.error("Create move task error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  // Combined sidebar stats — replaces 3 separate polling calls with 1
  app.get("/api/sidebar/stats", async (_req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Use COUNT queries instead of fetching all rows
      const [checkinRows, moveRows, exceptionRows] = await Promise.all([
        db
          .select({ c: count() })
          .from(visits)
          .where(
            and(
              sql`${visits.checkInTime} >= ${todayStart}`,
            )
          ),
        db
          .select({ status: moveTasks.status, c: count() })
          .from(moveTasks)
          .where(
            inArray(moveTasks.status, ["open", "assigned", "in_progress", "escalated", "accepted"])
          )
          .groupBy(moveTasks.status),
        db
          .select({ c: count() })
          .from(exceptions)
          .where(eq(exceptions.status, "open")),
      ]);

      const todayCheckinCount = Number(checkinRows[0]?.c ?? 0);
      const moveCountMap = new Map(moveRows.map((r) => [r.status, Number(r.c)]));

      const gateStats = {
        expectedToday: todayCheckinCount,
        checkedInToday: todayCheckinCount,
      };
      const moveSummary = {
        available: moveCountMap.get("open") ?? 0,
        assigned: (moveCountMap.get("assigned") ?? 0) + (moveCountMap.get("accepted") ?? 0),
        inProgress: (moveCountMap.get("in_progress") ?? 0) + (moveCountMap.get("escalated") ?? 0),
      };

      res.set("Cache-Control", "private, max-age=30");
      res.json({ gateStats, moveSummary, exceptionsOpen: Number(exceptionRows[0]?.c ?? 0) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/moves/summary", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const allTasks = await storage.getMoveTasks("all", facilityId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const CLOSED = ["completed", "cancelled", "rejected"];
      const summary = {
        available: allTasks.filter((t) => t.status === "open").length,
        assigned: allTasks.filter((t) => ["assigned", "accepted"].includes(t.status)).length,
        inProgress: allTasks.filter((t) => ["in_progress", "escalated"].includes(t.status)).length,
        highPriority: allTasks.filter((t) => (t.priority === "high" || t.priority === "urgent") && !CLOSED.includes(t.status)).length,
        overdue: allTasks.filter((t) => {
          if (CLOSED.includes(t.status)) return false;
          const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
          return Date.now() - created > 2 * 60 * 60 * 1000;
        }).length,
        completedToday: allTasks.filter((t) => t.status === "completed" && t.completedAt && new Date(t.completedAt) >= today).length,
        rejected: allTasks.filter((t) => t.status === "rejected").length,
      };
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Helper: enrich move tasks with visit/carrier/user data — no N+1
  async function enrichMoveTasks(tasks: any[]) {
    if (tasks.length === 0) return [];
    const [allUsers, allCarriersRaw] = await Promise.all([
      storage.getAllUsersWithProfiles(),
      db.select({ id: carriers.id, name: carriers.name }).from(carriers),
    ]);
    const userMap = new Map(allUsers.map((u: any) => [u.id, u]));
    const carrierMap = new Map(allCarriersRaw.map((c) => [c.id, c.name]));

    const visitIds = [...new Set(tasks.map((t) => t.visitId).filter(Boolean))];
    const visitRows = visitIds.length > 0
      ? await db
          .select({ id: visits.id, visitNumber: visits.visitNumber, trailerNumber: visits.trailerNumber, carrierId: visits.carrierId })
          .from(visits)
          .where(inArray(visits.id, visitIds))
      : [];
    const visitMap = new Map(visitRows.map((v) => [v.id, v]));

    return tasks.map((t) => {
      const visit = visitMap.get(t.visitId);
      const assignedUser = t.assignedTo ? userMap.get(t.assignedTo) : null;
      const createdUser = t.createdBy ? userMap.get(t.createdBy) : null;
      return {
        ...t,
        visitNumber: visit?.visitNumber || "Unknown",
        trailerNumber: visit?.trailerNumber || null,
        carrierName: visit?.carrierId ? (carrierMap.get(visit.carrierId) ?? null) : null,
        assignedToName: assignedUser ? `${assignedUser.firstName || ""} ${assignedUser.lastName || ""}`.trim() || assignedUser.id : null,
        createdByName: createdUser ? `${createdUser.firstName || ""} ${createdUser.lastName || ""}`.trim() || "System" : "System",
      };
    });
  }

  app.get("/api/moves", async (req, res) => {
    // Auto-escalate open/assigned tasks older than 90 minutes
    const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
    await db.update(moveTasks).set({ status: "escalated" }).where(
      and(
        or(eq(moveTasks.status, "open"), eq(moveTasks.status, "assigned")),
        lt(moveTasks.createdAt, ninetyMinsAgo)
      )
    );
    const filter = (req.query.filter as string) || (req.query["0"] as string) || "active";
    const { facilityId } = resolveFacilityScope(req);
    const tasks = await storage.getMoveTasks(filter, facilityId);
    res.json(await enrichMoveTasks(tasks));
  });

  app.get("/api/moves/all", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const tasks = await storage.getMoveTasks("all", facilityId);
      res.json(await enrichMoveTasks(tasks));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/moves/:id", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const { status, priority, assignedTo, rejectionReason, notes } = req.body;
      const update: any = {};

      if (status) update.status = status;
      if (priority) update.priority = priority;
      if (assignedTo !== undefined) update.assignedTo = assignedTo;
      if (notes !== undefined) update.notes = notes;

      // Check for holds when accepting or starting a move
      if (status === "accepted" || status === "in_progress") {
        const move = await storage.getMoveTask(id);
        if (move) {
          const visit = await storage.getVisit(move.visitId);
          if (visit && visit.holdStatus !== "none") {
            return void res.status(400).json({ message: "Cannot process move: visit has active hold" });
          }
        }
      }

      if (status === "accepted") update.acceptedAt = new Date();
      if (status === "in_progress") update.startedAt = new Date();
      // "Reject" from the jockey UI means "I won't do this — re-queue it".
      // The task is intentionally set back to "open" (not terminal "rejected") so it
      // can be reassigned to another jockey. The rejection reason is stored for audit.
      // Terminal "rejected" status only exists in seed data for demo display purposes.
      if (status === "rejected") {
        update.rejectionReason = rejectionReason || "No reason given";
        update.assignedTo = null;
        update.status = "open";
      }

      if (status === "completed") {
        update.completedAt = new Date();
        const task = await storage.getMoveTask(id);
        if (task && task.visitId) {
          // All completion side-effects run in a single transaction so that a
          // failure mid-sequence cannot leave slot/dock/visit state inconsistent
          // (e.g. origin vacated but destination never assigned).
          await db.transaction(async (tx) => {
            // 1. Vacate origin location
            if (task.fromLocationId && task.fromLocationType === "slot") {
              await tx.update(yardSlots).set({ currentVisitId: null }).where(eq(yardSlots.id, task.fromLocationId));
            }
            if (task.fromLocationId && task.fromLocationType === "dock") {
              await tx.update(dockDoors).set({ currentVisitId: null }).where(eq(dockDoors.id, task.fromLocationId));
            }
            // 2. Assign destination and update visit status
            if (task.toLocationType === "slot" && task.toLocationId) {
              await tx.update(yardSlots).set({ currentVisitId: task.visitId }).where(eq(yardSlots.id, task.toLocationId));
              await tx.update(visits).set({
                currentSlotId: task.toLocationId,
                currentDockDoorId: null,
                visitStatus: "in_yard" as any,
                locationStatus: "in_yard_slot" as any,
                locationConfirmed: true as any,
              }).where(eq(visits.id, task.visitId));
            } else if (task.toLocationType === "dock" && task.toLocationId) {
              await tx.update(dockDoors).set({ currentVisitId: task.visitId }).where(eq(dockDoors.id, task.toLocationId));
              await tx.update(visits).set({
                currentDockDoorId: task.toLocationId,
                currentSlotId: null,
                visitStatus: "at_dock" as any,
                locationStatus: "at_dock_door" as any,
                locationConfirmed: true as any,
              }).where(eq(visits.id, task.visitId));
            } else if (task.toLocationType === "gate") {
              await tx.update(visits).set({
                currentSlotId: null,
                currentDockDoorId: null,
                visitStatus: "ready_out" as any,
                locationStatus: "at_gate_out" as any,
                locationConfirmed: true as any,
              }).where(eq(visits.id, task.visitId));
            } else {
              // For any other destination type, confirm the location
              await tx.update(visits).set({ locationConfirmed: true as any }).where(eq(visits.id, task.visitId));
            }
            // 3. Mark task complete — inside the same transaction
            await tx.update(moveTasks).set(update).where(eq(moveTasks.id, id));
          });
          await storage.createAuditLog({
            action: "move_task_updated",
            entityType: "move_task",
            entityId: id,
            userId: "demo-user",
            userName: "Demo User",
            details: { status: "completed", priority, assignedTo },
          });

          const movedVisit = await storage.getVisit(task.visitId);
          await storage.createLocationHistory({
            visitId: task.visitId,
            trailerNumber: movedVisit?.trailerNumber ?? null,
            fromLocation: await resolveLocationByRef(task.fromLocationType, task.fromLocationId),
            toLocation: await resolveLocationByRef(task.toLocationType, task.toLocationId),
            locationStatus: movedVisit?.locationStatus ?? null,
            source: "move_completed",
            changedBy: "demo-user",
            changedByName: "Demo User",
          });
          return void res.json(await storage.getMoveTask(id));
        }
      }

      if (assignedTo && !status) {
        update.status = "assigned";
      }

      const updated = await storage.updateMoveTask(id, update);
      await storage.createAuditLog({
        action: status === "rejected" ? "move_task_returned_to_queue" : "move_task_updated",
        entityType: "move_task",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: { status: update.status, priority, assignedTo, rejectionReason },
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Exceptions
  app.get("/api/exceptions/all", async (req, res) => {
    const { facilityId } = resolveFacilityScope(req);
    const excs = await storage.getExceptions("all", facilityId);
    const allUsers = await storage.getAllUsersWithProfiles();
    const userMap = new Map(allUsers.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]));

    const excsWithDetails = await Promise.all(
      excs.map(async (e) => {
        const visit = await storage.getVisit(e.visitId);
        return {
          ...e,
          visitNumber: visit?.visitNumber || "Unknown",
          trailerNumber: visit?.trailerNumber || null,
          assignedToName: e.assignedTo ? userMap.get(e.assignedTo) || e.assignedTo : null,
        };
      })
    );
    res.json(excsWithDetails);
  });

  app.get("/api/exceptions", async (req, res) => {
    const filter = (req.query["0"] as string) || (req.query.filter as string) || "open";
    const { facilityId } = resolveFacilityScope(req);
    const excs = await storage.getExceptions(filter, facilityId);

    const allUsers = await storage.getAllUsersWithProfiles();
    const userMap = new Map(allUsers.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]));

    const excsWithDetails = await Promise.all(
      excs.map(async (e) => {
        const visit = await storage.getVisit(e.visitId);
        return {
          ...e,
          visitNumber: visit?.visitNumber || "Unknown",
          trailerNumber: visit?.trailerNumber || null,
          assignedToName: e.assignedTo ? userMap.get(e.assignedTo) || e.assignedTo : null,
        };
      })
    );
    res.json(excsWithDetails);
  });

  app.post("/api/exceptions", async (req: any, res) => {
    try {
      const { visitId, type, severity, description } = req.body;
      const userId = "demo-user";

      const exception = await storage.createException({
        visitId: Number(visitId),
        type,
        severity: severity || "medium",
        description,
        status: "open",
        createdBy: userId,
      });

      // Auto-set hold based on type mapping (manual_modification never triggers a hold — it only needs supervisor review)
      const noHoldTypes = ["manual_modification"];
      if (!noHoldTypes.includes(type)) {
        const visit = await storage.getVisit(Number(visitId));
        if (visit && visit.holdStatus === "none") {
          const typeMapping: Record<string, string> = {
            damage: "damage_hold",
            seal_mismatch: "seal_mismatch",
            documentation: "documentation_hold",
            security: "security_hold",
            customs: "customs_hold",
            driver: "driver_issue",
          };
          const holdStatus = typeMapping[type] || "yard_block";
          await storage.updateVisit(visit.id, { holdStatus });
        }
      }

      await storage.createAuditLog({
        action: "exception_created",
        entityType: "exception",
        entityId: exception.id,
        userId,
        userName: "Demo User",
        details: { type, severity, visitId },
      });

      res.json(exception);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/exceptions/:id/resolve", async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = "demo-user";
      const resolved = await storage.resolveException(
        id,
        userId,
        req.body.resolutionNotes
      );

      const exc = await storage.getExceptions("all");
      const matchingExc = exc.find((e) => e.id === id);
      if (matchingExc) {
        const visit = await storage.getVisit(matchingExc.visitId);
        if (visit) {
          const remaining = exc.filter(
            (e) => e.visitId === visit.id && e.status === "open" && e.id !== id
          );
          if (remaining.length === 0) {
            await storage.updateVisit(visit.id, { holdStatus: "none" });
          }
        }
      }

      await storage.createAuditLog({
        action: "exception_resolved",
        entityType: "exception",
        entityId: id,
        userId,
        userName: "Demo User",
        details: { resolutionNotes: req.body.resolutionNotes },
      });
      res.json(resolved);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Individual GET for move task (B-4)
  app.get("/api/moves/:id", async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const task = await storage.getMoveTask(id);
      if (!task) return void res.status(404).json({ message: "Move task not found" });
      const enriched = await enrichMoveTasks([task]);
      return void res.json(enriched[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Individual GET / PATCH for exception (B-3)
  app.get("/api/exceptions/:id", async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const excs = await storage.getExceptions("all");
      const exc = excs.find((e) => e.id === id);
      if (!exc) return void res.status(404).json({ message: "Exception not found" });
      const visit = await storage.getVisit(exc.visitId);
      const allUsers = await storage.getAllUsersWithProfiles();
      const userMap = new Map(allUsers.map((u) => [u.id, `${u.firstName || ""} ${u.lastName || ""}`.trim()]));
      return void res.json({
        ...exc,
        visitNumber: visit?.visitNumber || "Unknown",
        trailerNumber: visit?.trailerNumber || null,
        assignedToName: exc.assignedTo ? userMap.get(exc.assignedTo) || exc.assignedTo : null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/exceptions/:id", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const { assignedTo, severity, description, status } = req.body;
      const update: Record<string, any> = {};
      if (assignedTo !== undefined) update.assignedTo = assignedTo;
      if (severity !== undefined) update.severity = severity;
      if (description !== undefined) update.description = description;
      if (status !== undefined) update.status = status;
      const [updated] = await db.update(exceptions).set(update).where(eq(exceptions.id, id)).returning();
      if (!updated) return void res.status(404).json({ message: "Exception not found" });
      await storage.createAuditLog({
        action: "exception_updated",
        entityType: "exception",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: update,
      });
      return void res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Audit Logs
  app.get("/api/audit-logs", async (_req, res) => {
    res.json(await storage.getAuditLogs());
  });

  // Admin Users — super_admin sees every user; everyone else sees only users
  // in their own facility.
  app.get("/api/admin/users", async (req, res) => {
    try {
      const { facilityId, isSuperAdmin: superAdmin } = resolveFacilityScope(req);
      const all = await storage.getAllUsersWithProfiles();
      // super_admin personas (facilityId === null) are always included, even when
      // scoped to a specific facility, so a super_admin never disappears from their
      // own persona list after picking a facility (see facility-scoping memory notes).
      res.json(
        superAdmin && facilityId == null
          ? all
          : all.filter((u: any) => u.facilityId === (facilityId ?? DEFAULT_FACILITY_ID) || u.role === "super_admin")
      );
    } catch (error) {
      console.error("Admin users error:", error);
      res.status(500).json({ message: "Failed to load users" });
    }
  });

  // Facilities — list/create/update is gated to super_admin (facility_mgmt module).
  // Every role can hit /api/facilities/mine to see which facilities they may access,
  // which powers the facility selector in the frontend.
  app.get("/api/facilities", async (req: any, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "";
      if (!checkPermission(role, "facility_mgmt", "canView")) {
        return void res.status(403).json({ message: "Not authorized to view facilities" });
      }
      res.json(await storage.getFacilities());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/facilities/mine", async (req: any, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "";
      if (isSuperAdmin(role)) {
        return void res.json(await storage.getFacilities());
      }
      const { facilityId } = resolveFacilityScope(req);
      const facility = facilityId != null ? await storage.getFacility(facilityId) : undefined;
      res.json(facility ? [facility] : []);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/facilities", async (req: any, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "";
      if (!checkPermission(role, "facility_mgmt", "canCreate")) {
        return void res.status(403).json({ message: "Only super admins can create facilities" });
      }
      const parsed = insertFacilitySchema.parse(req.body);
      const facility = await storage.createFacility(parsed);
      await storage.createAuditLog({
        action: "facility_created",
        entityType: "facility",
        entityId: facility.id,
        userId: "demo-user",
        userName: "Demo User",
        details: { name: facility.name, code: facility.code },
      });
      res.json(facility);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/facilities/:id", async (req: any, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "";
      if (!checkPermission(role, "facility_mgmt", "canModify")) {
        return void res.status(403).json({ message: "Only super admins can modify facilities" });
      }
      const id = Number(req.params.id);
      const facility = await storage.updateFacility(id, req.body);
      await storage.createAuditLog({
        action: "facility_updated",
        entityType: "facility",
        entityId: id,
        userId: "demo-user",
        userName: "Demo User",
        details: req.body,
      });
      res.json(facility);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Yard Audit
  app.get("/api/yard-audit/work-queue", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const queue = await storage.generateAuditWorkQueue(facilityId);
      res.json(queue);
    } catch (error: any) {
      console.error("Audit work queue error:", error);
      res.status(500).json({ message: "Failed to generate audit work queue" });
    }
  });

  app.get("/api/yard-audit/items", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getYardAuditItems(facilityId));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load audit items" });
    }
  });

  app.get("/api/yard-audit/summary", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const queue = await storage.generateAuditWorkQueue(facilityId);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const items = await storage.getYardAuditItems(facilityId);
      const todayItems = items.filter(
        (a) => a.createdAt && new Date(a.createdAt) >= todayStart
      );

      res.json({
        totalAssets: queue.length,
        matched: todayItems.filter((i) => i.auditResult === "matched").length,
        mismatched: todayItems.filter((i) => i.auditResult === "mismatched").length,
        missing: todayItems.filter((i) => i.auditResult === "missing").length,
        extra: todayItems.filter((i) => i.auditResult === "extra").length,
        reconciled: todayItems.filter((i) => i.auditResult === "reconciled").length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load audit summary" });
    }
  });

  app.post("/api/yard-audit/mark", async (req: any, res) => {
    try {
      const { visitId, trailerNumber, systemLocation, systemSlotId, systemDockDoorId, auditResult, physicalLocation, notes } = req.body;
      const userId = "demo-user";
      const userName = "Demo User";

      const item = await storage.createYardAuditItem({
        visitId: visitId || null,
        trailerNumber: trailerNumber || null,
        systemLocation: systemLocation || null,
        systemSlotId: systemSlotId || null,
        systemDockDoorId: systemDockDoorId || null,
        physicalLocation: physicalLocation || null,
        auditResult: auditResult || "matched",
        notes: notes || null,
        auditedBy: userId,
        auditedByName: userName,
      });

      await storage.createAuditLog({
        action: "yard_audit_marked",
        entityType: "yard_audit",
        entityId: item.id,
        userId,
        userName,
        details: { visitId, trailerNumber, auditResult, systemLocation, physicalLocation },
      });

      res.json(item);
    } catch (error: any) {
      console.error("Audit mark error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/yard-audit/virtual-move", async (req: any, res): Promise<void> => {
    try {
      const { visitId, systemLocation, systemSlotId, physicalLocation, physicalSlotId, reason, notes } = req.body;
      const userId = "demo-user";
      const userName = "Demo User";

      if (!visitId || !reason) {
        return void res.status(400).json({ message: "visitId and reason are required" });
      }

      const visit = await storage.getVisit(visitId);
      if (!visit) return void res.status(404).json({ message: "Visit not found" });

      if (systemSlotId && visit.currentSlotId) {
        await storage.updateSlotVisit(visit.currentSlotId, null);
      }

      if (physicalSlotId) {
        await storage.updateSlotVisit(physicalSlotId, visitId);
        await storage.updateVisit(visitId, {
          currentSlotId: physicalSlotId,
          visitStatus: "in_yard",
          locationStatus: "in_yard_slot",
        });
      }

      const auditItem = await storage.createYardAuditItem({
        visitId,
        trailerNumber: visit.trailerNumber || null,
        systemLocation: systemLocation || null,
        systemSlotId: systemSlotId || null,
        physicalLocation: physicalLocation || null,
        physicalSlotId: physicalSlotId || null,
        auditResult: "reconciled",
        virtualMoveReason: reason,
        virtualMoveNotes: notes || null,
        reconciledAt: new Date(),
        auditedBy: userId,
        auditedByName: userName,
      });

      await storage.createAuditLog({
        action: "virtual_move_audit_reconciliation",
        entityType: "yard_audit",
        entityId: auditItem.id,
        userId,
        userName,
        details: {
          visitId,
          trailerNumber: visit.trailerNumber,
          visitNumber: visit.visitNumber,
          fromLocation: systemLocation,
          toLocation: physicalLocation,
          reason,
          notes,
          physicalSlotId,
        },
      });

      await storage.createLocationHistory({
        visitId,
        trailerNumber: visit.trailerNumber,
        fromLocation: systemLocation || (await resolveVisitLocation(visit)),
        toLocation: physicalLocation || null,
        locationStatus: physicalSlotId ? "in_yard_slot" : (visit.locationStatus ?? null),
        source: "virtual_move",
        reason,
        changedBy: userId,
        changedByName: userName,
      });

      return void res.json(auditItem);
    } catch (error: any) {
      console.error("Virtual move error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/yard/available-slots-all", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getAvailableSlots(facilityId));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load available slots" });
    }
  });

  // Inspections
  app.get("/api/inspections", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      res.json(await storage.getInspections(facilityId));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load inspections" });
    }
  });

  app.get("/api/inspections/:id", async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const inspection = await storage.getInspection(id);
      if (!inspection) return void res.status(404).json({ message: "Inspection not found" });
      return void res.json(inspection);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load inspection" });
    }
  });

  app.post("/api/inspections", async (req: any, res) => {
    try {
      const userId = "demo-user";
      const userName = "Demo User";
      const { visitId, inspectionType, trailerNumber, containerNumber, carrierName, currentLocation, checklist, remarks, result, equipmentType, shipmentType, weather, sealNumber } = req.body;

      const inspection = await storage.createInspection({
        visitId: visitId || null,
        inspectionType: inspectionType || "gate_inbound",
        trailerNumber: trailerNumber || null,
        containerNumber: containerNumber || null,
        carrierName: carrierName || null,
        currentLocation: currentLocation || null,
        equipmentType: equipmentType || null,
        shipmentType: shipmentType || null,
        weather: weather || null,
        sealNumber: sealNumber || null,
        checklist: checklist || null,
        remarks: remarks || null,
        result: result || "draft",
        inspectorId: userId,
        inspectorName: userName,
      });

      await storage.createAuditLog({
        action: "inspection_created",
        entityType: "inspection",
        entityId: inspection.id,
        userId,
        userName,
        details: { inspectionType, trailerNumber, result: inspection.result },
      });

      res.json(inspection);
    } catch (error: any) {
      console.error("Create inspection error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/inspections/:id", async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const userId = "demo-user";
      const userName = "Demo User";
      const { checklist, remarks, result, issueSeverity, photoUrls, submittedAt, equipmentType, shipmentType, weather, sealNumber } = req.body;

      const update: any = {};
      if (checklist !== undefined) update.checklist = checklist;
      if (remarks !== undefined) update.remarks = remarks;
      if (result !== undefined) update.result = result;
      if (issueSeverity !== undefined) update.issueSeverity = issueSeverity;
      if (photoUrls !== undefined) update.photoUrls = photoUrls;
      if (submittedAt !== undefined) update.submittedAt = new Date(submittedAt);
      if (equipmentType !== undefined) update.equipmentType = equipmentType;
      if (shipmentType !== undefined) update.shipmentType = shipmentType;
      if (weather !== undefined) update.weather = weather;
      if (sealNumber !== undefined) update.sealNumber = sealNumber;

      const updated = await storage.updateInspection(id, update);

      if (result && result !== "draft") {
        await storage.createAuditLog({
          action: "inspection_submitted",
          entityType: "inspection",
          entityId: id,
          userId,
          userName,
          details: { result, trailerNumber: updated.trailerNumber, inspectionType: updated.inspectionType },
        });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Update inspection error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/inspections/:id/raise-exception", async (req: any, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const userId = "demo-user";
      const userName = "Demo User";
      const { severity, description } = req.body;

      const inspection = await storage.getInspection(id);
      if (!inspection) return void res.status(404).json({ message: "Inspection not found" });
      if (!inspection.visitId) return void res.status(400).json({ message: "Cannot raise exception without a linked visit" });

      const exception = await storage.createException({
        visitId: inspection.visitId,
        type: "inspection_failure",
        severity: severity || "medium",
        description: description || `Inspection failed: ${inspection.inspectionType}`,
        status: "open",
        createdBy: userId,
      });

      // Auto-set hold for inspection failures
      const visit = await storage.getVisit(inspection.visitId);
      if (visit && visit.holdStatus === "none") {
        await storage.updateVisit(visit.id, { holdStatus: "yard_block" });
      }

      await storage.updateInspection(id, {
        result: "exception_raised",
        exceptionId: exception.id,
        issueSeverity: severity || "medium",
        submittedAt: new Date(),
      });

      await storage.createAuditLog({
        action: "inspection_exception_raised",
        entityType: "inspection",
        entityId: id,
        userId,
        userName,
        details: { exceptionId: exception.id, severity, trailerNumber: inspection.trailerNumber },
      });

      return void res.json({ inspection: await storage.getInspection(id), exception });
    } catch (error: any) {
      console.error("Raise exception error:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/inspections-upload-url", async (_req, res) => {
    res.status(501).json({ message: "File upload not configured" });
  });

  app.patch("/api/admin/users/:userId/role", async (req: any, res): Promise<void> => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const validRoles = ["super_admin", "admin", "yard_manager", "gate_guard", "yard_jockey", "dock_user", "carrier"];
      if (!role || !validRoles.includes(role)) {
        return void res.status(400).json({ message: "Invalid role" });
      }
      await storage.updateUserRole(userId, role);
      await storage.createAuditLog({
        action: "user_role_changed",
        entityType: "user",
        userId: "demo-user",
        userName: "Demo User",
        details: { targetUserId: userId, newRole: role },
      });
      return void res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/reports/summary", async (req, res) => {
    try {
      const { facilityId } = resolveFacilityScope(req);
      const [allVisitsRaw, allAppointments, allMoveTasks, allExceptions, dockDoors, allCarriers, yardSlots, allZones] =
        await Promise.all([
          facilityId != null ? db.select().from(visits).where(eq(visits.facilityId, facilityId)) : db.select().from(visits),
          storage.getAppointments(undefined, facilityId),
          storage.getMoveTasks("all", facilityId),
          storage.getExceptions("all", facilityId),
          storage.getDockDoorsView(facilityId),
          storage.getCarriers(facilityId),
          storage.getYardSlots(facilityId),
          storage.getYardZones(facilityId),
        ]);
      const carrierById = Object.fromEntries(allCarriers.map((c) => [c.id, c.name]));
      const zoneNameById = Object.fromEntries(allZones.map((z) => [z.id, z.name]));
      const allVisits = allVisitsRaw.map((v) => ({ ...v, carrierName: v.carrierId ? carrierById[v.carrierId] || null : null }));
      const allMoves = allMoveTasks;

      // ── KPIs ──────────────────────────────────────────────────────────────
      const activeVisits = allVisits.filter((v) => v.visitStatus !== "closed");
      // Compute avg dwell from ALL visits (active + closed) for consistency with carrier summary
      const now = new Date();
      const dwellMinutes = allVisits
        .filter((v) => v.checkInTime)
        .map((v) => {
          const end = v.checkOutTime ? new Date(v.checkOutTime) : now;
          return (end.getTime() - new Date(v.checkInTime!).getTime()) / 60000;
        })
        .filter((d) => d > 0 && d < 10080); // cap at 7 days to filter stale data
      const avgDwellMinutes = dwellMinutes.length
        ? Math.round(dwellMinutes.reduce((a, b) => a + b, 0) / dwellMinutes.length)
        : 0;

      const totalSlots = yardSlots.filter((s) => s.isActive).length;
      const occupiedSlots = allVisits.filter((v) => v.currentSlotId && v.visitStatus !== "closed").length;
      const yardOccupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

      const activeDockCount = dockDoors.filter((d) => d.visitId != null).length;
      const dockUtilizationRate = dockDoors.length > 0 ? Math.round((activeDockCount / dockDoors.length) * 100) : 0;

      const completedMoves = allMoves.filter((m) => m.status === "completed" && m.startedAt && m.completedAt);
      const moveTimes = completedMoves
        .map((m) => (new Date(m.completedAt!).getTime() - new Date(m.startedAt!).getTime()) / 60000)
        .filter((t) => t > 0);
      const avgMoveTimeMinutes = moveTimes.length
        ? Math.round(moveTimes.reduce((a, b) => a + b, 0) / moveTimes.length)
        : 0;

      // On-time rate: use definitive appointment statuses (completed = on-time, no_show = late)
      const definitiveApts = allAppointments.filter((a) => a.status === "completed" || a.status === "no_show");
      const onTimeApts = definitiveApts.filter((a) => a.status === "completed");
      const onTimeArrivalRate = definitiveApts.length > 0
        ? Math.round((onTimeApts.length / definitiveApts.length) * 100)
        : 72;

      const onHoldVisits = activeVisits.filter((v) => v.holdStatus && v.holdStatus !== "none");
      const holdPercentage = activeVisits.length > 0
        ? Math.round((onHoldVisits.length / activeVisits.length) * 100)
        : 0;

      // ── Trend data (7-day synthetic, seeded from real KPIs) ───────────────
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"];
      const occ = yardOccupancyRate;
      const yardOccupancyTrend = days.map((day, i) => ({
        day,
        occupancy: Math.min(95, Math.max(20, occ + (i - 3) * 3 + (i % 2 === 0 ? 5 : -3))),
      }));

      const baseDwell = avgDwellMinutes || 240;
      const dwellTimeTrend = days.map((day, i) => ({
        day,
        avgDwell: Math.max(30, baseDwell + (i - 3) * 20 + (i % 2 === 0 ? 15 : -10)),
      }));

      const completedCounts = [8, 11, 7, 14, 9, 5, completedMoves.length || 2];
      const openCounts = [3, 2, 4, 1, 3, 2, allMoves.filter((m) => m.status === "open").length];
      const moveTaskTrend = days.map((day, i) => ({
        day,
        completed: completedCounts[i],
        open: openCounts[i],
      }));

      // ── Dock utilization chart ─────────────────────────────────────────────
      const dockUtilizationChart = dockDoors.map((d) => ({
        door: d.doorNumber,
        active: d.visitId ? 1 : 0,
        available: d.visitId ? 0 : 1,
        status: d.status,
        trailer: d.trailerNumber || null,
        visitStatus: d.visitStatus || null,
      }));

      // ── Carrier on-time performance ───────────────────────────────────────
      // Use actual appointment statuses: completed = on-time, no_show = late
      const carrierMap: Record<string, { name: string; onTime: number; late: number; total: number }> = {};
      for (const apt of allAppointments) {
        const name = (apt.carrierId ? carrierById[apt.carrierId] : null) || "Unknown";
        if (!carrierMap[name]) carrierMap[name] = { name, onTime: 0, late: 0, total: 0 };
        if (apt.status === "completed") {
          carrierMap[name].total++;
          carrierMap[name].onTime++;
        } else if (apt.status === "no_show" || apt.status === "cancelled") {
          carrierMap[name].total++;
          carrierMap[name].late++;
        }
        // booked/confirmed are still pending — don't count yet
      }
      const carrierOnTime = Object.values(carrierMap)
        .map((c) => ({ carrier: c.name.split(" ").slice(0, 2).join(" "), onTime: c.onTime, late: c.late, total: c.total, rate: c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 0 }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 8);

      // ── Hold distribution ─────────────────────────────────────────────────
      const holdCounts: Record<string, number> = {};
      for (const v of allVisits) {
        if (v.holdStatus && v.holdStatus !== "none") {
          holdCounts[v.holdStatus] = (holdCounts[v.holdStatus] || 0) + 1;
        }
      }
      for (const e of allExceptions) {
        if (e.status !== "resolved") {
          const key = e.type || "other";
          holdCounts[key] = (holdCounts[key] || 0) + 1;
        }
      }
      const holdDistribution = Object.entries(holdCounts).map(([type, count]) => ({
        type: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        count,
      }));

      // ── Carrier summary table ─────────────────────────────────────────────
      const carrierVisitMap: Record<string, { visits: number; dwells: number[]; holds: number }> = {};
      for (const v of allVisits) {
        const name = v.carrierName || "Unknown";
        if (!carrierVisitMap[name]) carrierVisitMap[name] = { visits: 0, dwells: [], holds: 0 };
        carrierVisitMap[name].visits++;
        if (v.checkInTime) {
          const end = v.checkOutTime ? new Date(v.checkOutTime) : new Date();
          const dwell = (end.getTime() - new Date(v.checkInTime).getTime()) / 60000;
          if (dwell > 0) carrierVisitMap[name].dwells.push(dwell);
        }
        if (v.holdStatus && v.holdStatus !== "none") carrierVisitMap[name].holds++;
      }
      const carrierSummary = allCarriers
        .map((c) => {
          const data = carrierVisitMap[c.name] || { visits: 0, dwells: [], holds: 0 };
          const onTimeEntry = carrierMap[c.name];
          return {
            carrier: c.name,
            visits: data.visits,
            avgDwell: data.dwells.length ? Math.round(data.dwells.reduce((a, b) => a + b, 0) / data.dwells.length) : 0,
            onTimeRate: onTimeEntry ? Math.round((onTimeEntry.onTime / Math.max(onTimeEntry.total, 1)) * 100) : 0,
            holds: data.holds,
          };
        })
        .filter((c) => c.visits > 0)
        .sort((a, b) => b.visits - a.visits);

      // ── Dock summary table ────────────────────────────────────────────────
      const dockSummary = dockDoors.map((d) => ({
        door: d.doorNumber,
        status: d.visitStatus || d.status,
        trailer: d.trailerNumber || "—",
        carrier: d.carrierName || "—",
        utilization: d.visitId ? 100 : 0,
      }));

      // ── Yard zone summary table ───────────────────────────────────────────
      const zoneMap: Record<string, { total: number; occupied: number; holds: number }> = {};
      for (const slot of yardSlots.filter((s) => s.isActive)) {
        const zone = (slot.zoneId ? zoneNameById[slot.zoneId] : null) || "Unknown";
        if (!zoneMap[zone]) zoneMap[zone] = { total: 0, occupied: 0, holds: 0 };
        zoneMap[zone].total++;
        const occupyingVisit = allVisits.find(
          (v) => v.currentSlotId === slot.id && v.visitStatus !== "closed"
        );
        if (occupyingVisit) {
          zoneMap[zone].occupied++;
          if (occupyingVisit.holdStatus && occupyingVisit.holdStatus !== "none") zoneMap[zone].holds++;
        }
      }
      const yardZoneSummary = Object.entries(zoneMap).map(([zone, data]) => ({
        zone,
        total: data.total,
        occupied: data.occupied,
        holds: data.holds,
        rate: data.total > 0 ? Math.round((data.occupied / data.total) * 100) : 0,
      }));

      // ── Move productivity table ───────────────────────────────────────────
      const moveTypeMap: Record<string, { completed: number; inProgress: number; open: number; assigned: number }> = {};
      for (const m of allMoves) {
        const type = m.moveType || "other";
        if (!moveTypeMap[type]) moveTypeMap[type] = { completed: 0, inProgress: 0, open: 0, assigned: 0 };
        if (m.status === "completed") moveTypeMap[type].completed++;
        else if (m.status === "in_progress") moveTypeMap[type].inProgress++;
        else if (m.status === "open") moveTypeMap[type].open++;
        else if (m.status === "assigned" || m.status === "accepted") moveTypeMap[type].assigned++;
      }
      const moveProductivity = Object.entries(moveTypeMap).map(([type, data]) => ({
        type: type.replace(/_/g, " → ").replace(/\b\w/g, (c) => c.toUpperCase()),
        ...data,
        total: data.completed + data.inProgress + data.open + data.assigned,
      }));

      // ── Average dwell by trailer class (DT-005) ───────────────────────────
      const classLabels: Record<string, string> = {
        general: "General",
        internal_network: "Internal Network",
        empty: "Empty",
        non_mail_storage: "Non-Mail Storage",
      };
      const dwellClassMap: Record<string, number[]> = {};
      for (const v of allVisits) {
        if (!v.checkInTime) continue;
        const end = v.checkOutTime ? new Date(v.checkOutTime) : now;
        const dwell = (end.getTime() - new Date(v.checkInTime).getTime()) / 60000;
        if (dwell <= 0 || dwell >= 10080) continue;
        const cls = (v.trailerClass as string) || "general";
        (dwellClassMap[cls] ||= []).push(dwell);
      }
      const dwellByType = Object.keys(classLabels).map((cls) => {
        const dwells = dwellClassMap[cls] || [];
        return {
          trailerClass: cls,
          label: classLabels[cls],
          visits: dwells.length,
          avgDwellMinutes: dwells.length ? Math.round(dwells.reduce((a, b) => a + b, 0) / dwells.length) : 0,
        };
      });

      res.json({
        kpis: { avgDwellMinutes, yardOccupancyRate, dockUtilizationRate, avgMoveTimeMinutes, onTimeArrivalRate, holdPercentage },
        yardOccupancyTrend,
        dwellTimeTrend,
        dockUtilizationChart,
        carrierOnTime,
        moveTaskTrend,
        holdDistribution,
        carrierSummary,
        dockSummary,
        yardZoneSummary,
        moveProductivity,
        dwellByType,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/manual/download", (_req, res) => {
    const html = generateManualHtml();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="YMSNOW-Product-Manual.html"');
    res.send(html);
  });

  app.get("/api/screenshots/download-all", (_req, res) => {
    const screenshotsDir = path.join(process.cwd(), "..", "yms", "public", "screenshots");
    let files: string[] = [];
    try {
      files = fs.readdirSync(screenshotsDir).filter((f: string) => f.endsWith(".png"));
    } catch {
      res.status(404).json({ message: "Screenshots directory not found" });
      return;
    }
    if (files.length === 0) {
      res.status(404).json({ message: "No screenshots found" });
      return;
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="YMSNOW-Screenshots.zip"');

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ message: err.message });
    });
    archive.pipe(res);

    for (const file of files) {
      const label = file
        .replace(".png", "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      archive.file(path.join(screenshotsDir, file), { name: `${label}.png` });
    }

    archive.finalize();
  });

  app.post("/api/admin/reset-to-seed", async (_req, res) => {
    try {
      const { resetAndReseed } = await import("./seed");
      await resetAndReseed();
      res.json({ success: true, message: "Database reset to seed state" });
    } catch (error: any) {
      console.error("Reset failed:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai-config", async (_req, res) => {
    try {
      const config = await storage.getAiConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/ai-config", async (req, res) => {
    try {
      const config = await storage.updateAiConfig(req.body);
      await storage.createAiAuditLog({
        userId: "demo-user",
        userRole: "admin",
        moduleContext: "ai_config",
        eventType: "config_change",
        actionTaken: `AI configuration updated: ${Object.keys(req.body).join(", ")}`,
      });
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai-audit-logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getAiAuditLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai-audit-logs", async (req, res) => {
    try {
      const log = await storage.createAiAuditLog(req.body);
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai-performance-stats", async (_req, res) => {
    try {
      const stats = await storage.getAiPerformanceStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── REVENUE & FINANCIAL INTELLIGENCE ─────────────────────────────────────

  async function computeBillingEvents() {
    const rates = await storage.getRevenueRates();
    const rateMap = new Map(rates.map((r) => [r.serviceType, r]));
    const now = new Date();

    const visitRows = await db
      .select({
        id: visits.id,
        visitNumber: visits.visitNumber,
        carrierId: visits.carrierId,
        carrierName: carriers.name,
        checkInTime: visits.checkInTime,
        checkOutTime: visits.checkOutTime,
        visitStatus: visits.visitStatus,
        currentSlotId: visits.currentSlotId,
        currentDockDoorId: visits.currentDockDoorId,
        trailerNumber: visits.trailerNumber,
        appointmentId: visits.appointmentId,
      })
      .from(visits)
      .leftJoin(carriers, eq(visits.carrierId, carriers.id))
      .where(isNotNull(visits.checkInTime))
      .orderBy(desc(visits.checkInTime));

    const slotRows = await db.select().from(yardSlots);
    const slotMap = new Map(slotRows.map((s) => [s.id, s]));

    const apptRows = await db
      .select({
        id: appointments.id,
        carrierId: appointments.carrierId,
        carrierName: carriers.name,
        status: appointments.status,
        scheduledDate: appointments.scheduledDate,
        timeWindowEnd: appointments.timeWindowEnd,
      })
      .from(appointments)
      .leftJoin(carriers, eq(appointments.carrierId, carriers.id));

    const apptMap = new Map(apptRows.map((a) => [a.id, a]));
    const noShowAppts = apptRows.filter((a) => a.status === "no_show");

    const inspRows = await db
      .select({
        id: inspections.id,
        carrierName: inspections.carrierName,
        result: inspections.result,
        createdAt: inspections.createdAt,
        visitId: inspections.visitId,
      })
      .from(inspections)
      .where(ne(inspections.result, "draft"));

    const events: any[] = [];
    let eid = 1;

    for (const v of visitRows) {
      if (!v.checkInTime) continue;
      const checkIn = new Date(v.checkInTime as unknown as string);
      const checkOut = v.checkOutTime ? new Date(v.checkOutTime as unknown as string) : now;
      const dwellHours = Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000);
      const carrierName = v.carrierName || "Unknown Carrier";
      const status = v.checkOutTime ? "billed" : "pending";

      const slot = v.currentSlotId ? slotMap.get(v.currentSlotId) : null;
      // Resolve storage rate — try canonical keys first, fall back to seeded names
      const storageRateKey = slot?.isReefer
        ? (rateMap.has("reefer_premium") ? "reefer_premium" : "detention_reefer")
        : slot?.isHazmat
        ? (rateMap.has("hazmat_premium") ? "hazmat_premium" : "storage_general")
        : (rateMap.has("yard_storage") ? "yard_storage" : "storage_general");
      const storageRate = rateMap.get(storageRateKey);
      if (storageRate?.isActive && dwellHours > 0) {
        const days = dwellHours / 24;
        events.push({ id: `E${eid++}`, visitId: v.id, visitNumber: v.visitNumber, carrierId: v.carrierId, carrierName, serviceType: storageRateKey, displayName: storageRate.displayName, description: `${v.trailerNumber || v.visitNumber} — ${days.toFixed(1)} day(s)`, quantityDisplay: `${days.toFixed(1)} days`, ratePerUnit: storageRate.ratePerUnit, totalAmount: Math.round(days * storageRate.ratePerUnit), status, eventDate: v.checkInTime });
      }

      if (v.currentDockDoorId || ["at_dock", "loading", "unloading"].includes(v.visitStatus || "")) {
        const isHourlyDock = rateMap.has("dock_usage");
        const dockRateKey = isHourlyDock ? "dock_usage" : "yard_move";
        const dockRate = rateMap.get(dockRateKey);
        if (dockRate?.isActive) {
          if (isHourlyDock) {
            // Hourly dock-usage rate — bill for estimated dwell time at dock
            const dockHours = Math.min(dwellHours * 0.35, 8);
            const billable = Math.max(0, dockHours - (dockRate.freeHours || 0));
            if (billable > 0) events.push({ id: `E${eid++}`, visitId: v.id, visitNumber: v.visitNumber, carrierId: v.carrierId, carrierName, serviceType: dockRateKey, displayName: dockRate.displayName, description: `${v.trailerNumber || v.visitNumber} — est. ${billable.toFixed(1)}h dock`, quantityDisplay: `${billable.toFixed(1)} hrs`, ratePerUnit: dockRate.ratePerUnit, totalAmount: Math.round(billable * dockRate.ratePerUnit), status, eventDate: v.checkInTime });
          } else {
            // Per-move spotting rate — one charge per dock assignment
            events.push({ id: `E${eid++}`, visitId: v.id, visitNumber: v.visitNumber, carrierId: v.carrierId, carrierName, serviceType: dockRateKey, displayName: dockRate.displayName, description: `${v.trailerNumber || v.visitNumber} — dock spot move`, quantityDisplay: "1 move", ratePerUnit: dockRate.ratePerUnit, totalAmount: dockRate.ratePerUnit, status, eventDate: v.checkInTime });
          }
        }
      }

      const detRateKey = rateMap.has("detention") ? "detention" : (slot?.isReefer ? "detention_reefer" : "detention_dry");
      const detRate = rateMap.get(detRateKey);
      const freeH = detRate?.freeHours ?? 48;
      if (detRate?.isActive && dwellHours > freeH) {
        const excess = dwellHours - freeH;
        events.push({ id: `E${eid++}`, visitId: v.id, visitNumber: v.visitNumber, carrierId: v.carrierId, carrierName, serviceType: detRateKey, displayName: detRate.displayName, description: `${v.trailerNumber || v.visitNumber} — ${excess.toFixed(1)}h excess dwell`, quantityDisplay: `${excess.toFixed(1)} hrs overage`, ratePerUnit: detRate.ratePerUnit, totalAmount: Math.round(excess * detRate.ratePerUnit), status, eventDate: v.checkInTime });
      }

      if (v.appointmentId) {
        const appt = apptMap.get(v.appointmentId);
        const lateRate = rateMap.get("late_arrival");
        if (appt?.scheduledDate && lateRate?.isActive) {
          const deadline = new Date(appt.scheduledDate as unknown as string);
          if (appt.timeWindowEnd) {
            const [h, m] = (appt.timeWindowEnd as string).split(":").map(Number);
            deadline.setHours((h || 0) + 1, m || 0, 0, 0);
          }
          if (checkIn > deadline) {
            events.push({ id: `E${eid++}`, visitId: v.id, visitNumber: v.visitNumber, carrierId: v.carrierId, carrierName, serviceType: "late_arrival", displayName: lateRate.displayName, description: `${v.trailerNumber || v.visitNumber} — arrived after window`, quantityDisplay: "1 event", ratePerUnit: lateRate.ratePerUnit, totalAmount: lateRate.ratePerUnit, status: "billed", eventDate: v.checkInTime });
          }
        }
      }
    }

    const noShowRate = rateMap.get("no_show");
    if (noShowRate?.isActive) {
      for (const a of noShowAppts) {
        events.push({ id: `E${eid++}`, visitId: null, visitNumber: null, carrierId: a.carrierId, carrierName: a.carrierName || "Unknown Carrier", serviceType: "no_show", displayName: noShowRate.displayName, description: `Appointment #${a.id} — no check-in recorded`, quantityDisplay: "1 event", ratePerUnit: noShowRate.ratePerUnit, totalAmount: noShowRate.ratePerUnit, status: "billed", eventDate: a.scheduledDate });
      }
    }

    const inspRate = rateMap.get("inspection_service");
    if (inspRate?.isActive) {
      for (const ins of inspRows) {
        events.push({ id: `E${eid++}`, visitId: ins.visitId, visitNumber: null, carrierId: null, carrierName: ins.carrierName || "Yard Operations", serviceType: "inspection_service", displayName: inspRate.displayName, description: `Inspection — ${ins.result}`, quantityDisplay: "1 inspection", ratePerUnit: inspRate.ratePerUnit, totalAmount: inspRate.ratePerUnit, status: "billed", eventDate: ins.createdAt });
      }
    }

    return { events, rates };
  }

  app.get("/api/revenue/rates", async (_req, res) => {
    try {
      const rates = await storage.getRevenueRates();
      res.json(rates);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/revenue/rates/:serviceType", async (req, res) => {
    try {
      const { serviceType } = req.params;
      const { ratePerUnit, freeHours, isActive } = req.body;
      const rate = await storage.upsertRevenueRate(serviceType, { ratePerUnit: ratePerUnit != null ? parseInt(ratePerUnit) : undefined, freeHours: freeHours != null ? parseInt(freeHours) : undefined, isActive });
      res.json(rate);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/revenue/events", async (_req, res) => {
    try {
      const { events } = await computeBillingEvents();
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/revenue/dashboard", async (_req, res) => {
    try {
      const { events, rates } = await computeBillingEvents();
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const totalRevenue = events.reduce((s, e) => s + e.totalAmount, 0);
      const todayRevenue = events.filter((e) => e.eventDate && new Date(e.eventDate) >= todayStart).reduce((s, e) => s + e.totalAmount, 0);
      const weekRevenue = events.filter((e) => e.eventDate && new Date(e.eventDate) >= weekStart).reduce((s, e) => s + e.totalAmount, 0);
      const monthRevenue = events.filter((e) => e.eventDate && new Date(e.eventDate) >= monthStart).reduce((s, e) => s + e.totalAmount, 0);

      const byType: Record<string, { displayName: string; amount: number; count: number }> = {};
      for (const e of events) {
        if (!byType[e.serviceType]) byType[e.serviceType] = { displayName: e.displayName, amount: 0, count: 0 };
        byType[e.serviceType].amount += e.totalAmount;
        byType[e.serviceType].count += 1;
      }

      const byCarrier: Record<string, { carrierName: string; amount: number; count: number }> = {};
      for (const e of events) {
        const key = String(e.carrierId || e.carrierName);
        if (!byCarrier[key]) byCarrier[key] = { carrierName: e.carrierName, amount: 0, count: 0 };
        byCarrier[key].amount += e.totalAmount;
        byCarrier[key].count += 1;
      }

      const trend: { date: string; revenue: number; savings: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now); day.setDate(now.getDate() - i); day.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
        const dateStr = day.toISOString().slice(0, 10);
        const dayRevenue = events.filter((e) => { if (!e.eventDate) return false; const d = new Date(e.eventDate); return d >= day && d <= dayEnd; }).reduce((s, e) => s + e.totalAmount, 0);
        trend.push({ date: dateStr, revenue: dayRevenue, savings: Math.round(dayRevenue * 0.22) });
      }

      const [dockTotal] = await db.select({ count: count() }).from(dockDoors).where(eq(dockDoors.isActive, true));
      const [dockOccupied] = await db.select({ count: count() }).from(dockDoors).where(and(eq(dockDoors.isActive, true), isNotNull(dockDoors.currentVisitId)));
      const totalDocks = Number(dockTotal?.count ?? 10);
      const occupiedDocks = Number(dockOccupied?.count ?? 4);
      const currentUtilPct = totalDocks > 0 ? (occupiedDocks / totalDocks) * 100 : 0;
      const baselinePct = 55;
      const dockGainPct = Math.max(0, currentUtilPct - baselinePct);
      const dockGainValue = Math.round(dockGainPct * totalDocks * 3000 * 8 / 100);

      const completedVisits = await db.select({ checkInTime: visits.checkInTime, checkOutTime: visits.checkOutTime }).from(visits).where(and(isNotNull(visits.checkInTime), isNotNull(visits.checkOutTime)));
      let avgDwellHours = 28;
      if (completedVisits.length > 0) {
        const total = completedVisits.reduce((s, v) => { const ci = new Date(v.checkInTime as unknown as string); const co = new Date(v.checkOutTime as unknown as string); return s + Math.max(0, (co.getTime() - ci.getTime()) / 3600000); }, 0);
        avgDwellHours = total / completedVisits.length;
      }
      const benchmarkDwell = 42;
      const dwellSavingHours = Math.max(0, benchmarkDwell - avgDwellHours);
      const dwellSavingValue = Math.round(dwellSavingHours * completedVisits.length * 3500);

      const [resolvedExceptions] = await db.select({ count: count() }).from(exceptions).where(eq(exceptions.status, "resolved"));
      const exceptionValue = Math.round(Number(resolvedExceptions?.count ?? 0) * 25000);

      const [completedMoves] = await db.select({ count: count() }).from(moveTasks).where(eq(moveTasks.status, "completed"));
      const moveValue = Math.round(Number(completedMoves?.count ?? 0) * 4500);

      const totalSavings = dockGainValue + dwellSavingValue + exceptionValue + moveValue;

      const pendingCount = events.filter((e) => e.status === "pending").length;
      const billedCount = events.filter((e) => e.status === "billed").length;

      res.json({
        summary: {
          totalRevenue,
          todayRevenue,
          weekRevenue,
          monthRevenue,
          totalSavings,
          activeEvents: pendingCount,
          billedEvents: billedCount,
          avgRevenuePerVisit: events.length > 0 ? Math.round(totalRevenue / new Set(events.map((e) => e.visitId).filter(Boolean)).size) : 0,
          currentUtilPct: Math.round(currentUtilPct),
          avgDwellHours: parseFloat(avgDwellHours.toFixed(1)),
        },
        byType: Object.entries(byType).map(([k, v]) => ({ serviceType: k, ...v })).sort((a, b) => b.amount - a.amount),
        byCarrier: Object.values(byCarrier).sort((a, b) => b.amount - a.amount).slice(0, 10),
        trend,
        savings: {
          total: totalSavings,
          dockUtilizationGain: dockGainValue,
          dwellTimeReduction: dwellSavingValue,
          exceptionResolution: exceptionValue,
          moveEfficiency: moveValue,
          avgDwellHours: parseFloat(avgDwellHours.toFixed(1)),
          benchmarkDwell,
          dwellSavingHours: parseFloat(dwellSavingHours.toFixed(1)),
        },
        rates,
      });
    } catch (e: any) {
      console.error("Revenue dashboard error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ── Email Intelligence ──────────────────────────────────────────────────────
  {
    app.get("/api/email-intelligence/alerts", async (_req, res) => {
      try {
        const alerts = await getEmailAlertsFull();
        res.json(alerts);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });

    app.post("/api/email-intelligence/process-demo", async (_req, res) => {
      try {
        const result = await processDemoEmails();
        res.json({ processed: result.processed, alertCount: result.alerts.length });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });

    app.patch("/api/email-intelligence/alerts/:id/status", async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const { alertStatus } = req.body;
        const [updated] = await db
          .update(emailAiAlerts)
          .set({ alertStatus })
          .where(eq(emailAiAlerts.id, id))
          .returning();
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });

    app.get("/api/email-intelligence/config", async (_req, res) => {
      try {
        const config = await getEmailIntelligenceConfig();
        res.json(config);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });

    app.patch("/api/email-intelligence/config", async (req, res) => {
      try {
        const existing = await getEmailIntelligenceConfig();
        const [updated] = await db
          .update(emailIntelligenceConfig)
          .set(req.body)
          .where(eq(emailIntelligenceConfig.id, existing.id))
          .returning();
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });

    app.get("/api/email-intelligence/carrier-contacts", async (_req, res) => {
      try {
        await seedCarrierContacts();
        const contacts = await db.select().from(carrierContacts).orderBy(carrierContacts.carrierName);
        res.json(contacts);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    });
  }

  // ── Notifications Center ─────────────────────────────────────────────────
  app.get("/api/notifications", async (_req, res) => {
    try {
      // Auto-escalate before reading
      const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000);
      await db.update(moveTasks).set({ status: "escalated" }).where(
        and(or(eq(moveTasks.status, "open"), eq(moveTasks.status, "assigned")), lt(moveTasks.createdAt, ninetyMinsAgo))
      );

      const [escalatedTasks, openExceptions, newEmailAlerts] = await Promise.all([
        db.select().from(moveTasks).where(eq(moveTasks.status, "escalated")).orderBy(desc(moveTasks.createdAt)),
        db.select().from(exceptions).where(eq(exceptions.status, "open")).orderBy(desc(exceptions.createdAt)),
        db.select().from(emailAiAlerts).where(eq(emailAiAlerts.alertStatus, "new")).orderBy(desc(emailAiAlerts.createdAt)),
      ]);

      const notifications = [
        ...escalatedTasks.map((t) => ({
          id: `move-${t.id}`,
          type: "escalated_task",
          severity: "high",
          title: `Move Task #${t.id} Escalated`,
          message: `Task has been open for over 90 minutes without action — supervisor attention required.`,
          entityId: t.id,
          route: "/moves",
          createdAt: t.createdAt,
        })),
        ...openExceptions.map((e) => ({
          id: `exc-${e.id}`,
          type: "exception",
          severity: e.severity || "medium",
          title: `Exception: ${(e.type || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
          message: e.description || "Exception requires attention.",
          entityId: e.id,
          route: "/exceptions",
          createdAt: e.createdAt,
        })),
        ...newEmailAlerts.map((a) => ({
          id: `email-${a.id}`,
          type: a.conflictFlag ? "email_conflict" : "email_alert",
          severity: a.conflictFlag ? "high" : "medium",
          title: a.alertTitle,
          message: a.alertMessage,
          entityId: a.id,
          route: "/email-intelligence",
          createdAt: a.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

      res.json(notifications);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/notifications/dismiss/:type/:id", async (req, res) => {
    try {
      const { type, id } = req.params;
      const numId = Number(id);
      if (type === "exception") {
        await db.update(exceptions).set({ status: "acknowledged" } as any).where(eq(exceptions.id, numId));
      } else if (type === "email_alert" || type === "email_conflict") {
        await db.update(emailAiAlerts).set({ alertStatus: "acknowledged" } as any).where(eq(emailAiAlerts.id, numId));
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Mark all notifications as read (B-6)
  app.post("/api/notifications/mark-all-read", async (_req, res) => {
    try {
      await Promise.all([
        db.update(exceptions)
          .set({ status: "acknowledged" } as any)
          .where(eq(exceptions.status, "open")),
        db.update(emailAiAlerts)
          .set({ alertStatus: "acknowledged" } as any)
          .where(eq(emailAiAlerts.alertStatus, "new")),
      ]);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Carrier Self-Service Portal ───────────────────────────────────────────
  app.get("/api/portal/available-slots", async (req, res) => {
    try {
      const dateStr = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const movementType = (req.query.movementType as string) || "all";

      const targetDate = new Date(dateStr);
      const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

      const existing = await db.select({
        timeWindowStart: appointments.timeWindowStart,
        timeWindowEnd: appointments.timeWindowEnd,
        movementType: appointments.movementType,
      }).from(appointments).where(
        and(gte(appointments.scheduledDate, dayStart), lt(appointments.scheduledDate, dayEnd))
      );

      const TIME_WINDOWS = [
        { start: "06:00", end: "08:00", label: "6:00 AM – 8:00 AM" },
        { start: "08:00", end: "10:00", label: "8:00 AM – 10:00 AM" },
        { start: "10:00", end: "12:00", label: "10:00 AM – 12:00 PM" },
        { start: "12:00", end: "14:00", label: "12:00 PM – 2:00 PM" },
        { start: "14:00", end: "16:00", label: "2:00 PM – 4:00 PM" },
        { start: "16:00", end: "18:00", label: "4:00 PM – 6:00 PM" },
        { start: "18:00", end: "20:00", label: "6:00 PM – 8:00 PM" },
      ];

      const MAX_PER_SLOT = 3;
      const slots = TIME_WINDOWS.map((w) => {
        const booked = existing.filter((e) => e.timeWindowStart === w.start).length;
        const available = Math.max(0, MAX_PER_SLOT - booked);
        return { ...w, booked, available, isFull: available === 0 };
      });

      res.json(slots);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/portal/book", async (req, res): Promise<void> => {
    try {
      const { carrierName, driverName, truckNumber, trailerNumber, movementType, scheduledDate, timeWindowStart, timeWindowEnd, notes } = req.body;
      if (!carrierName || !movementType || !scheduledDate || !timeWindowStart) {
        return void res.status(400).json({ message: "Carrier name, movement type, date and time window are required." });
      }

      let carrierId: number | null = null;
      const existingCarrier = await db.select().from(carriers).where(
        eq(sql`lower(${carriers.name})`, carrierName.toLowerCase())
      ).limit(1);
      if (existingCarrier.length > 0) {
        carrierId = existingCarrier[0].id;
      } else {
        const [newCarrier] = await db.insert(carriers).values({
          name: carrierName, scacCode: carrierName.toUpperCase().replace(/\s+/g, "").slice(0, 6), isActive: true,
        }).returning();
        carrierId = newCarrier.id;
      }

      const refNum = `PORT-${Date.now().toString().slice(-6)}`;
      const [apt] = await db.insert(appointments).values({
        carrierId,
        referenceNumber: refNum,
        movementType: movementType || "inbound",
        scheduledDate: new Date(scheduledDate),
        timeWindowStart,
        timeWindowEnd: timeWindowEnd || "23:59",
        driverName: driverName || null,
        truckNumber: truckNumber || null,
        trailerNumber: trailerNumber || null,
        status: "scheduled",
        notes: notes || "Booked via carrier portal",
        source: "carrier_portal",
      } as any).returning();

      return void res.json({ success: true, referenceNumber: apt.referenceNumber, appointmentId: apt.id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── RBAC API Routes ───────────────────────────────────────────────────────────

  // Get all roles
  app.get("/api/admin/rbac/roles", async (req, res) => {
    try {
      const allRoles = await getRolesFromDb();
      // Enrich with user count
      const enriched = await Promise.all(
        allRoles.map(async (r) => {
          const [row] = await db.select({ c: count() }).from(userRoles).where(eq(userRoles.roleId, r.id));
          return { ...r, userCount: Number(row?.c ?? 0) };
        })
      );
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Create role
  app.post("/api/admin/rbac/roles", async (req, res) => {
    try {
      const body = insertRoleSchema.parse(req.body);
      const [created] = await db.insert(roles).values(body).returning();
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Update role
  app.patch("/api/admin/rbac/roles/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { roleName, roleDescription, roleLevel, isActive } = req.body;
      const [updated] = await db
        .update(roles)
        .set({ roleName, roleDescription, roleLevel, isActive })
        .where(eq(roles.id, id))
        .returning();
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Get all permission modules
  app.get("/api/admin/rbac/permissions", async (req, res) => {
    try {
      const allPerms = await getPermissionsFromDb();
      res.json(allPerms);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get permission matrix for a role
  app.get("/api/admin/rbac/role-permissions/:roleId", async (req, res) => {
    try {
      const roleId = Number(req.params.roleId);
      const matrix = await getRolePermissionsFromDb(roleId);
      res.json(matrix);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Upsert permission matrix for a role (full replace)
  app.put("/api/admin/rbac/role-permissions/:roleId", async (req, res) => {
    try {
      const roleId = Number(req.params.roleId);
      const entries: Array<{
        permissionId: number;
        canView: boolean; canCreate: boolean; canModify: boolean;
        canExecute: boolean; canApprove: boolean;
      }> = req.body;

      // Delete existing, then insert new
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (entries.length > 0) {
        await db.insert(rolePermissions).values(entries.map((e) => ({ roleId, ...e })));
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Get permissions for the current user's role (for frontend enforcement)
  app.get("/api/admin/rbac/my-permissions", async (req, res) => {
    try {
      const role = (req.headers["x-user-role"] as string) || "viewer";
      const matrix = await getPermissionsForRole(role);
      res.json({ role, permissions: matrix });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get user role assignments
  app.get("/api/admin/rbac/user-roles", async (req, res) => {
    try {
      const assignments = await db
        .select({
          id: userRoles.id,
          userId: userRoles.userId,
          roleId: userRoles.roleId,
          roleName: roles.roleName,
          roleLevel: roles.roleLevel,
          assignedAt: userRoles.assignedAt,
          isPrimary: userRoles.isPrimary,
        })
        .from(userRoles)
        .leftJoin(roles, eq(userRoles.roleId, roles.id))
        .orderBy(roles.roleLevel);
      res.json(assignments);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Assign role to user
  app.post("/api/admin/rbac/user-roles", async (req, res) => {
    try {
      const { userId, roleId, isPrimary } = req.body;
      const [created] = await db
        .insert(userRoles)
        .values({ userId, roleId, isPrimary: isPrimary ?? true })
        .onConflictDoNothing()
        .returning();
      res.json(created ?? { message: "Already assigned" });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Remove user role assignment
  app.delete("/api/admin/rbac/user-roles/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(userRoles).where(eq(userRoles.id, id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Workflow ownership for a visit
  app.get("/api/admin/rbac/workflow-owner/:visitId", async (req, res): Promise<void> => {
    try {
      const visitId = Number(req.params.visitId);
      const [visit] = await db.select({ visitStatus: visits.visitStatus, visitNumber: visits.visitNumber }).from(visits).where(eq(visits.id, visitId));
      if (!visit) return void res.status(404).json({ message: "Visit not found" });
      return void res.json({ visitId, visitStatus: visit.visitStatus, workflowOwner: getWorkflowOwner(visit.visitStatus) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── End RBAC Routes ───────────────────────────────────────────────────────────

  // ── DHL: Seal History ─────────────────────────────────────────────────────────
  app.get("/api/seal-history/:visitId", async (req, res) => {
    try {
      const visitId = Number(req.params.visitId);
      const records = await db
        .select()
        .from(sealHistory)
        .where(eq(sealHistory.visitId, visitId))
        .orderBy(desc(sealHistory.recordedAt));
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── DHL: Dwell Thresholds ─────────────────────────────────────────────────────
  app.get("/api/dwell-thresholds", async (_req, res) => {
    try {
      const defaults = [
        { trailerClass: "general", warningHours: 8, alertHours: 24 },
        { trailerClass: "internal_network", warningHours: 6, alertHours: 12 },
        { trailerClass: "empty", warningHours: 48, alertHours: 72 },
        { trailerClass: "non_mail_storage", warningHours: 72, alertHours: 168 },
      ];
      const existing = await db.select().from(dwellThresholds);
      const merged = defaults.map((d) => {
        const found = existing.find((e) => e.trailerClass === d.trailerClass);
        return found ? { ...d, ...found } : d;
      });
      res.json(merged);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/dwell-thresholds/:trailerClass", async (req, res) => {
    try {
      const { trailerClass: tc } = req.params;
      const { warningHours, alertHours } = req.body;
      const wh = Number(warningHours);
      const ah = Number(alertHours);
      const validClasses = ["general", "internal_network", "empty", "non_mail_storage"];
      if (!validClasses.includes(tc)) {
        return void res.status(400).json({ message: `Invalid trailer class. Valid values: ${validClasses.join(", ")}.` });
      }
      if (!Number.isFinite(wh) || !Number.isFinite(ah) || wh < 1 || ah < 1) {
        return void res.status(400).json({ message: "warningHours and alertHours must be positive numbers." });
      }
      if (ah <= wh) {
        return void res.status(400).json({ message: "alertHours must be greater than warningHours." });
      }
      const existing = await db.select().from(dwellThresholds).where(eq(dwellThresholds.trailerClass, tc));
      if (existing.length > 0) {
        const [updated] = await db
          .update(dwellThresholds)
          .set({ warningHours: wh, alertHours: ah, updatedAt: new Date(), updatedBy: "demo-user" })
          .where(eq(dwellThresholds.trailerClass, tc))
          .returning();
        res.json(updated);
      } else {
        const [created] = await db
          .insert(dwellThresholds)
          .values({ trailerClass: tc, warningHours: wh, alertHours: ah, updatedBy: "demo-user" })
          .returning();
        res.json(created);
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── DHL: Move Anomalies ───────────────────────────────────────────────────────
  app.get("/api/move-anomalies", async (_req, res) => {
    try {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      const activeMoves = await db
        .select({
          id: moveTasks.id,
          visitId: moveTasks.visitId,
          status: moveTasks.status,
          createdAt: moveTasks.createdAt,
          assignedTo: moveTasks.assignedTo,
          fromLocationName: moveTasks.fromLocationName,
          toLocationName: moveTasks.toLocationName,
        })
        .from(moveTasks)
        .where(notInArray(moveTasks.status, ["completed", "cancelled", "rejected"]));

      const moveCountByVisit = new Map<number, number>();
      activeMoves.forEach((m) => {
        moveCountByVisit.set(m.visitId, (moveCountByVisit.get(m.visitId) || 0) + 1);
      });

      const seen = new Set<string>();
      const anomalies: any[] = [];

      for (const m of activeMoves) {
        const createdAt = m.createdAt ? new Date(m.createdAt as any) : null;

        if (m.status === "open" && !m.assignedTo && createdAt && createdAt < fourHoursAgo) {
          const key = `${m.id}-stalled`;
          if (!seen.has(key)) {
            seen.add(key);
            anomalies.push({
              moveId: m.id, visitId: m.visitId, type: "stalled",
              description: `Move created ${Math.round((now.getTime() - createdAt.getTime()) / 3600000)}h ago with no jockey assigned`,
              severity: "high", createdAt: m.createdAt,
            });
          }
        }

        if (["assigned", "accepted", "in_progress"].includes(m.status) && createdAt && createdAt < twoHoursAgo) {
          const key = `${m.id}-delayed`;
          if (!seen.has(key)) {
            seen.add(key);
            anomalies.push({
              moveId: m.id, visitId: m.visitId, type: "delayed",
              description: `Move in status "${m.status}" for ${Math.round((now.getTime() - createdAt.getTime()) / 3600000)}h`,
              severity: "medium", createdAt: m.createdAt,
            });
          }
        }

        if ((moveCountByVisit.get(m.visitId) || 0) > 2) {
          const key = `${m.id}-repeated`;
          if (!seen.has(key)) {
            seen.add(key);
            anomalies.push({
              moveId: m.id, visitId: m.visitId, type: "repeated",
              description: `Visit has ${moveCountByVisit.get(m.visitId)} concurrent active moves`,
              severity: "medium", createdAt: m.createdAt,
            });
          }
        }
      }

      res.json(anomalies);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── DHL: Dwell Breach Summary ──────────────────────────────────────────────────
  app.get("/api/dwell-breaches", async (_req, res) => {
    try {
      const activeVisits = await db
        .select({
          id: visits.id,
          visitNumber: visits.visitNumber,
          trailerNumber: visits.trailerNumber,
          trailerClass: visits.trailerClass,
          ownerType: visits.ownerType,
          checkInTime: visits.checkInTime,
        })
        .from(visits)
        .where(ne(visits.visitStatus, "closed"));

      const thresholds = await db.select().from(dwellThresholds);
      const getThreshold = (tc: string) => {
        const t = thresholds.find((x) => x.trailerClass === tc);
        return { warningHours: t?.warningHours ?? 8, alertHours: t?.alertHours ?? 24 };
      };

      const now = Date.now();
      const byClass: Record<string, number> = { general: 0, internal_network: 0, empty: 0, non_mail_storage: 0 };
      const byOwner: Record<string, number> = { dhl_owned: 0, external: 0 };
      const breaches: any[] = [];

      for (const v of activeVisits) {
        const tc = (v.trailerClass as string) || "general";
        const ot = (v.ownerType as string) || "external";
        byClass[tc] = (byClass[tc] || 0) + 1;
        byOwner[ot] = (byOwner[ot] || 0) + 1;
        if (v.checkInTime) {
          const dwellHours = (now - new Date(v.checkInTime as any).getTime()) / 3600000;
          const { warningHours, alertHours } = getThreshold(tc);
          if (dwellHours >= warningHours) {
            breaches.push({
              visitId: v.id, visitNumber: v.visitNumber, trailerNumber: v.trailerNumber,
              trailerClass: tc, ownerType: ot,
              dwellHours: Math.round(dwellHours * 10) / 10,
              severity: dwellHours >= alertHours ? "alert" : "warning",
            });
          }
        }
      }

      res.json({ byClass, byOwner, breaches, total: activeVisits.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Module Subscription Routes ─────────────────────────────────────────────
  const ALL_MODULE_KEYS = [
    "core_operations",
    "dock_management",
    "compliance",
    "analytics",
    "notifications",
    "ai_suite",
  ];

  // GET /api/subscriptions — enabled modules for the current facility
  app.get("/api/subscriptions", async (req: any, res) => {
    try {
      const role = req.headers["x-user-role"] as string;
      // super_admin always has access to all modules
      if (isSuperAdmin(role)) {
        res.json({ enabledModules: ALL_MODULE_KEYS });
        return;
      }
      const { facilityId } = resolveFacilityScope(req);
      const fid = facilityId ?? DEFAULT_FACILITY_ID;
      const subs = await db
        .select()
        .from(facilityModuleSubscriptions)
        .where(
          and(
            eq(facilityModuleSubscriptions.facilityId, fid),
            eq(facilityModuleSubscriptions.isEnabled, true),
          ),
        );
      // If no rows exist yet (before seeding), fall back to all enabled
      if (subs.length === 0) {
        res.json({ enabledModules: ALL_MODULE_KEYS });
        return;
      }
      res.json({ enabledModules: subs.map((s) => s.moduleKey) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/platform/facilities — all facilities with subscription matrix (super_admin only)
  app.get("/api/platform/facilities", async (req: any, res) => {
    try {
      const role = req.headers["x-user-role"] as string;
      if (!isSuperAdmin(role)) { res.status(403).json({ error: "Forbidden" }); return; }

      const allFacilities = await db
        .select()
        .from(facilities)
        .where(eq(facilities.isActive, true));
      const allSubs = await db.select().from(facilityModuleSubscriptions);

      const result = allFacilities.map((f) => {
        const facilitySubs = allSubs.filter((s) => s.facilityId === f.id);
        const subscriptions: Record<
          string,
          { isEnabled: boolean; updatedBy: string | null; updatedAt: Date | null }
        > = {};
        for (const moduleKey of ALL_MODULE_KEYS) {
          const sub = facilitySubs.find((s) => s.moduleKey === moduleKey);
          subscriptions[moduleKey] = {
            isEnabled: sub ? sub.isEnabled : true,
            updatedBy: sub?.updatedBy ?? null,
            updatedAt: sub?.updatedAt ?? null,
          };
        }
        return { ...f, subscriptions };
      });

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/platform/facilities/:facilityId/modules — toggle a module (super_admin only)
  app.put("/api/platform/facilities/:facilityId/modules", async (req: any, res) => {
    try {
      const role = req.headers["x-user-role"] as string;
      if (!isSuperAdmin(role)) { res.status(403).json({ error: "Forbidden" }); return; }

      const facilityId = parseInt(req.params.facilityId, 10);
      if (isNaN(facilityId)) { res.status(400).json({ error: "Invalid facility ID" }); return; }

      const { moduleKey, isEnabled } = req.body;
      if (!moduleKey || !ALL_MODULE_KEYS.includes(moduleKey)) {
        res.status(400).json({ error: "Invalid module key" });
        return;
      }

      const updatedBy = (req.headers["x-user-id"] as string) || "platform-admin";

      await db
        .insert(facilityModuleSubscriptions)
        .values({
          facilityId,
          moduleKey,
          isEnabled: Boolean(isEnabled),
          updatedBy,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [facilityModuleSubscriptions.facilityId, facilityModuleSubscriptions.moduleKey],
          set: {
            isEnabled: Boolean(isEnabled),
            updatedBy,
            updatedAt: new Date(),
          },
        });

      res.json({ success: true, facilityId, moduleKey, isEnabled: Boolean(isEnabled) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  registerAssistantRoutes(app);
}
