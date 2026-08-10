import { db } from "../db";
import {
  carriers,
  yardZones,
  yardSlots,
  dockDoors,
  gates,
  appointments,
  visits,
  gateTransactions,
  moveTasks,
  exceptions,
  auditLogs,
  userProfiles,
  users,
  inspections,
  yardAuditItems,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  sealHistory,
  dwellThresholds,
  revenueRates,
  aiConfig,
  locationHistory,
  facilities,
  facilityModuleSubscriptions,
} from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";

function hoursAgo(h: number, m = 0): Date {
  return new Date(Date.now() - (h * 60 + m) * 60000);
}
function minutesAgo(m: number): Date {
  return new Date(Date.now() - m * 60000);
}
function daysAgoAt(d: number, hour: number, minute = 0): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}
function todayAt(hour: number, minute = 0): Date {
  const dt = new Date();
  dt.setHours(hour, minute, 0, 0);
  return dt;
}
function daysFromNowAt(d: number, hour: number, minute = 0): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
}

let _visitSeq = 1;
function visitNum(): string {
  const n = String(_visitSeq++).padStart(4, "0");
  return `VST-CMH26-${n}`;
}
let _aptSeq = 1000;
function aptRef(): string {
  return `APT-CMH-${_aptSeq++}`;
}

export async function seedDatabase() {
  const [carrierCount] = await db.select({ c: count() }).from(carriers);
  if (Number(carrierCount.c) > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("Seeding database with hyper-realistic Columbus Hub data...");

  // ── Facility ──────────────────────────────────────────────────────────────────
  // This seed builds out a single facility (the Columbus Hub). Additional
  // facilities/yards are seeded separately — see task #6.
  const [defaultFacility] = await db.insert(facilities).values({
    name: "Columbus, OH Hub",
    code: "CMH",
    city: "Columbus",
    state: "OH",
    timezone: "America/New_York",
  }).returning();
  const facilityId = defaultFacility.id;

  // ── Carriers ─────────────────────────────────────────────────────────────────
  const RED = "#D40511";
  const YLW = "#FFCC00";
  const insertedCarriers = await db.insert(carriers).values([
    { name: "Nexus Express",            scacCode: "NXSE", contactName: "Petra Vogel",      contactEmail: "hub.ops@ymsnow.com",          contactPhone: "(800) 225-5345", address: "1200 S Pine Island Rd, Plantation FL 33324",         brandColour: RED },
    { name: "Nexus Supply Chain",       scacCode: "NXSS", contactName: "Andre Laurent",    contactEmail: "supplychain@ymsnow.com",      contactPhone: "(614) 865-8500", address: "570 Polaris Pkwy, Westerville OH 43082",             brandColour: RED },
    { name: "Nexus eCommerce",          scacCode: "NXEC", contactName: "Nadia Khoury",     contactEmail: "ecommerce@ymsnow.com",        contactPhone: "(800) 805-9306", address: "2700 S Commerce Pkwy, Weston FL 33331",              brandColour: YLW },
    { name: "Nexus Freight",            scacCode: "NXSF", contactName: "Markus Bauer",     contactEmail: "freight@ymsnow.com",          contactPhone: "(855) 345-7447", address: "1210 S Pine Island Rd, Plantation FL 33324",         brandColour: RED },
    { name: "Nexus Global Forwarding",  scacCode: "NGFF", contactName: "Sofia Reyes",      contactEmail: "forwarding@ymsnow.com",       contactPhone: "(866) 393-4585", address: "1210 S Pine Island Rd, Plantation FL 33324",         brandColour: RED },
    { name: "Nexus Parcel",             scacCode: "NXSP", contactName: "Liam O'Connor",    contactEmail: "parcel@ymsnow.com",           contactPhone: "(800) 542-9908", address: "1013 Centre Rd, Wilmington DE 19805",                brandColour: YLW },
    { name: "Swift Transportation",   scacCode: "SWFT", contactName: "Mike Johnson",     contactEmail: "dispatch@swift.com",       contactPhone: "(602) 269-9700", address: "2200 S 75th Ave, Phoenix AZ 85043",                  brandColour: "#FF6B00" },
    { name: "J.B. Hunt Transport",    scacCode: "JBHT", contactName: "Sarah Williams",   contactEmail: "ops@jbhunt.com",           contactPhone: "(479) 820-0000", address: "615 JB Hunt Corporate Dr, Lowell AR 72745",          brandColour: "#2D6A2E" },
    { name: "Schneider National",     scacCode: "SNDR", contactName: "Lisa Chen",        contactEmail: "logistics@schneider.com",  contactPhone: "(920) 592-2000", address: "3101 S Packerland Dr, Green Bay WI 54313",           brandColour: "#FF6600" },
    { name: "Werner Enterprises",     scacCode: "WERN", contactName: "Tom Davis",        contactEmail: "yard@werner.com",          contactPhone: "(402) 895-6640", address: "14507 Frontier Rd, Omaha NE 68138",                  brandColour: "#006633" },
    { name: "XPO Logistics",          scacCode: "XPOL", contactName: "James Brown",      contactEmail: "operations@xpo.com",       contactPhone: "(855) 976-6427", address: "Five American Lane, Greenwich CT 06831",             brandColour: "#E31837" },
    { name: "Estes Express Lines",    scacCode: "EXLA", contactName: "Maria Santos",     contactEmail: "dispatch@estes-express.com",contactPhone: "(804) 353-1900", address: "3901 W Broad St, Richmond VA 23230",                 brandColour: "#003DA5" },
  ].map(r => ({ ...r, facilityId }))).returning();

  const c = (scac: string) => insertedCarriers.find(x => x.scacCode === scac)!;

  // ── Zones ─────────────────────────────────────────────────────────────────────
  const insertedZones = await db.insert(yardZones).values([
    { name: "Inbound Staging",       code: "STG-A", type: "staging",  description: "Primary inbound staging for arriving network & partner trailers (near Main Gate)" },
    { name: "Outbound Staging",      code: "STG-B", type: "staging",  description: "Outbound build & departure prep for line-haul and parcel loads" },
    { name: "Cold Chain Yard",       code: "RFR",   type: "reefer",   description: "Temperature-controlled parking for Nexus Medical Express & pharma reefers" },
    { name: "Network Trailer Pool",  code: "PKG-C", type: "parking",  description: "NXS-owned internal-network line-haul trailers and empty/storage pool" },
    { name: "Hazmat Isolation",      code: "HAZ",   type: "hazmat",   description: "DGR-rated isolated parking for dangerous-goods shipments" },
  ].map(r => ({ ...r, facilityId }))).returning();

  const z = (code: string) => insertedZones.find(x => x.code === code)!;

  // ── Slots ─────────────────────────────────────────────────────────────────────
  type SlotRow = { zoneId: number; slotNumber: string; slotType: string; slotSize: string; isReefer: boolean; isHazmat: boolean; gridRow: number; gridCol: number };
  const slotsToCreate: SlotRow[] = [];
  for (let i = 1; i <= 15; i++) slotsToCreate.push({ zoneId: z("STG-A").id, slotNumber: `A-${String(i).padStart(2,"0")}`, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false, gridRow: Math.floor((i-1)/5), gridCol: (i-1)%5 });
  for (let i = 1; i <= 12; i++) slotsToCreate.push({ zoneId: z("STG-B").id, slotNumber: `B-${String(i).padStart(2,"0")}`, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false, gridRow: Math.floor((i-1)/4), gridCol: (i-1)%4 });
  for (let i = 1; i <= 8;  i++) slotsToCreate.push({ zoneId: z("RFR").id,   slotNumber: `R-${String(i).padStart(2,"0")}`, slotType: "reefer",   slotSize: "standard", isReefer: true,  isHazmat: false, gridRow: Math.floor((i-1)/4), gridCol: (i-1)%4 });
  for (let i = 1; i <= 10; i++) slotsToCreate.push({ zoneId: z("PKG-C").id, slotNumber: `C-${String(i).padStart(2,"0")}`, slotType: i > 8 ? "oversized" : "standard", slotSize: i > 8 ? "large" : "standard", isReefer: false, isHazmat: false, gridRow: Math.floor((i-1)/5), gridCol: (i-1)%5 });
  for (let i = 1; i <= 4;  i++) slotsToCreate.push({ zoneId: z("HAZ").id,   slotNumber: `H-${String(i).padStart(2,"0")}`, slotType: "hazmat",   slotSize: "standard", isReefer: false, isHazmat: true,  gridRow: 0,                    gridCol: i-1 });
  const insertedSlots = await db.insert(yardSlots).values(slotsToCreate.map(r => ({ ...r, facilityId }))).returning();
  const slot = (num: string) => insertedSlots.find(s => s.slotNumber === num)!;

  // ── Dock Doors ────────────────────────────────────────────────────────────────
  const insertedDoors = await db.insert(dockDoors).values([
    { doorNumber: "D-01", compatibleType: "all",    status: "available" },
    { doorNumber: "D-02", compatibleType: "all",    status: "available" },
    { doorNumber: "D-03", compatibleType: "all",    status: "available" },
    { doorNumber: "D-04", compatibleType: "all",    status: "available" },
    { doorNumber: "D-05", compatibleType: "dry",    status: "available" },
    { doorNumber: "D-06", compatibleType: "dry",    status: "available" },
    { doorNumber: "D-07", compatibleType: "reefer", status: "available" },
    { doorNumber: "D-08", compatibleType: "reefer", status: "available" },
    { doorNumber: "D-09", compatibleType: "all",    status: "available" },
    { doorNumber: "D-10", compatibleType: "all",    status: "available" },
  ].map(r => ({ ...r, facilityId }))).returning();
  const door = (num: string) => insertedDoors.find(d => d.doorNumber === num)!;

  // ── Gates ─────────────────────────────────────────────────────────────────────
  const insertedGates = await db.insert(gates).values([
    { name: "Gate 1 - Main",      type: "both" },
    { name: "Gate 2 - Inbound",   type: "in"   },
    { name: "Gate 3 - Outbound",  type: "out"  },
  ].map(r => ({ ...r, facilityId }))).returning();

  // ── Users ─────────────────────────────────────────────────────────────────────
  // Every demo user is pinned to this facility except super_admin, whose profile
  // has no facilityId (they can select any facility from the switcher).
  const demoUsers = [
    { id: "demo-superadmin-001", firstName: "Elena",  lastName: "Vasquez",   email: "e.vasquez@ymsnow.com",   role: "super_admin",  carrierId: null as number|null, facilityId: null as number|null },
    { id: "demo-admin-001", firstName: "Sandra",   lastName: "Mitchell",   email: "s.mitchell@ymsnow.com",     role: "admin",        carrierId: null as number|null },
    { id: "demo-admin-002", firstName: "Kevin",    lastName: "Huang",      email: "k.huang@ymsnow.com",        role: "admin",        carrierId: null },
    { id: "demo-ym-001",    firstName: "Robert",   lastName: "Chen",       email: "r.chen@ymsnow.com",         role: "yard_manager", carrierId: null },
    { id: "demo-ym-002",    firstName: "Alicia",   lastName: "Fernandez",  email: "a.fernandez@ymsnow.com",    role: "yard_manager", carrierId: null },
    { id: "demo-gg-001",    firstName: "Maria",    lastName: "Gonzalez",   email: "m.gonzalez@ymsnow.com",     role: "gate_guard",   carrierId: null },
    { id: "demo-gg-002",    firstName: "Jamal",    lastName: "Williams",   email: "j.williams@ymsnow.com",     role: "gate_guard",   carrierId: null },
    { id: "demo-gg-003",    firstName: "Priya",    lastName: "Sharma",     email: "p.sharma@ymsnow.com",       role: "gate_guard",   carrierId: null },
    { id: "demo-yj-001",    firstName: "Tommy",    lastName: "Kowalski",   email: "t.kowalski@ymsnow.com",     role: "yard_jockey",  carrierId: null },
    { id: "demo-yj-002",    firstName: "DeShawn",  lastName: "Carter",     email: "d.carter@ymsnow.com",       role: "yard_jockey",  carrierId: null },
    { id: "demo-yj-003",    firstName: "Jose",     lastName: "Martinez",   email: "j.martinez@ymsnow.com",     role: "yard_jockey",  carrierId: null },
    { id: "demo-yj-004",    firstName: "Brendan",  lastName: "Walsh",      email: "b.walsh@ymsnow.com",        role: "yard_jockey",  carrierId: null },
    { id: "demo-du-001",    firstName: "Lisa",     lastName: "Park",       email: "l.park@ymsnow.com",         role: "dock_user",    carrierId: null },
    { id: "demo-du-002",    firstName: "Kevin",    lastName: "O'Malley",   email: "k.omalley@ymsnow.com",      role: "dock_user",    carrierId: null },
    { id: "demo-du-003",    firstName: "Tanya",    lastName: "Brooks",     email: "t.brooks.dock@ymsnow.com",  role: "dock_user",    carrierId: null },
    { id: "demo-cr-001",    firstName: "Tyler",    lastName: "Brooks",     email: "t.brooks@swift.com",     role: "carrier",      carrierId: c("SWFT").id },
    { id: "demo-cr-002",    firstName: "Amy",      lastName: "Chen",       email: "a.chen@jbhunt.com",      role: "carrier",      carrierId: c("JBHT").id },
    { id: "demo-cr-003",    firstName: "Marcus",   lastName: "Rivera",     email: "m.rivera@werner.com",    role: "carrier",      carrierId: c("WERN").id },
  ];
  for (const u of demoUsers) {
    await db.insert(users).values({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }).onConflictDoNothing();
    const userFacilityId = "facilityId" in u ? (u as any).facilityId : facilityId;
    await db.insert(userProfiles).values({ userId: u.id, role: u.role, carrierId: u.carrierId, facilityId: userFacilityId }).onConflictDoNothing();
  }

  // ── Appointments ──────────────────────────────────────────────────────────────
  const demoAppointments = await db.insert(appointments).values([
    // ── Past (completed) ─────────────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysAgoAt(7,6),   timeWindowStart: "06:00", timeWindowEnd: "08:00", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-537100", truckNumber: "NXS-4401", driverName: "Carlos Mendez",      driverPhone: "(312)555-0147", poNumber: "LH-CMH-ORD-00801", bolNumber: "AWB-NXS-90101", sealNumber: "NXS-77001", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("JBHT").id, scheduledDate: daysAgoAt(7,8),   timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "JBHU-832001", truckNumber: "JB-7701",  driverName: "Marcus Thompson",    driverPhone: "(469)555-0201", poNumber: "PO-2026-00802",    bolNumber: "BOL-JB-41001", sealNumber: "SL-88002", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSS").id, scheduledDate: daysAgoAt(7,10),  timeWindowStart: "10:00", timeWindowEnd: "12:00", movementType: "live_unload", loadType: "mail",    trailerNumber: "NXSU-490001", truckNumber: "NXS-3301", driverName: "Brandon Miller",     driverPhone: "(614)555-0189", poNumber: "LH-CMH-CVG-00803", bolNumber: "MNF-NXS-55001", sealNumber: "NXS-99003", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("SNDR").id, scheduledDate: daysAgoAt(6,7),   timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "SNDR-R41001", truckNumber: "SN-6001",  driverName: "Ryan O'Brien",       driverPhone: "(920)555-0312", poNumber: "PO-2026-00810",    bolNumber: "BOL-SN-63001", sealNumber: "SL-11004", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXEC").id, scheduledDate: daysAgoAt(6,14),  timeWindowStart: "14:00", timeWindowEnd: "16:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-715001", truckNumber: "NXS-2201", driverName: "David Kim",          driverPhone: "(503)555-0421", poNumber: "LH-CMH-IND-00816", bolNumber: "MNF-NXS-78001", sealNumber: "NXS-22005", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSP").id, scheduledDate: daysAgoAt(5,10),  timeWindowStart: "10:30", timeWindowEnd: "12:30", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-289001", truckNumber: "NXS-8801", driverName: "Nathan Cruz",        driverPhone: "(901)555-0178", poNumber: "LH-CMH-CLE-00841", bolNumber: "MNF-NXS-82901", sealNumber: "NXS-33006", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("XPOL").id, scheduledDate: daysAgoAt(5,7),   timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "live_load",   loadType: "dry",     trailerNumber: "XPOU-614001", truckNumber: "XP-5501",  driverName: "Patrick Sullivan",   driverPhone: "(540)555-0295", poNumber: "PO-2026-00847",    bolNumber: "BOL-XP-14003", sealNumber: "SL-44007", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSF").id, scheduledDate: daysAgoAt(4,11),  timeWindowStart: "11:30", timeWindowEnd: "13:30", movementType: "inbound",     loadType: "freight", trailerNumber: "NXSU-330001", truckNumber: "NXS-1201", driverName: "Trevor Hall",        driverPhone: "(330)555-0364", poNumber: "LH-CMH-PIT-00853", bolNumber: "MNF-NXS-33001", sealNumber: "NXS-55008", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("EXLA").id, scheduledDate: daysAgoAt(4,8),   timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "EXLA-R19001", truckNumber: "EX-9001",  driverName: "Anthony Reyes",      driverPhone: "(804)555-0437", poNumber: "PO-2026-00859",    bolNumber: "BOL-EX-19004", sealNumber: "SL-66009", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("WERN").id, scheduledDate: daysAgoAt(3,9),   timeWindowStart: "09:00", timeWindowEnd: "11:00", movementType: "live_unload", loadType: "dry",     trailerNumber: "WERN-440001", truckNumber: "WE-7701",  driverName: "Tyler Richardson",   driverPhone: "(479)555-0348", poNumber: "PO-2026-00865",    bolNumber: "BOL-WE-44001", sealNumber: "SL-99012", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysAgoAt(3,14),  timeWindowStart: "14:30", timeWindowEnd: "16:30", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-535001", truckNumber: "NXS-4471", driverName: "Leo Castillo",       driverPhone: "(210)555-0574", poNumber: "LH-CMH-ORD-00874", bolNumber: "MNF-NXS-90003", sealNumber: "NXS-33724", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSS").id, scheduledDate: daysAgoAt(3,15),  timeWindowStart: "15:00", timeWindowEnd: "17:00", movementType: "inbound",     loadType: "mail",    trailerNumber: "NXSU-493001", truckNumber: "NXS-3341", driverName: "Alan Fisher",        driverPhone: "(531)555-0249", poNumber: "LH-CMH-CVG-00880", bolNumber: "MNF-NXS-55048", sealNumber: "NXS-55026", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NGFF").id, scheduledDate: daysAgoAt(2,7),   timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "freight", trailerNumber: "NXSU-615001", truckNumber: "NXS-5501", driverName: "Samuel Price",       driverPhone: "(336)555-0184", poNumber: "LH-CMH-INTL-00890",bolNumber: "AWB-NXS-14031", sealNumber: "NXS-99030", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("SWFT").id, scheduledDate: daysAgoAt(2,10),  timeWindowStart: "10:00", timeWindowEnd: "12:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "SWFT-220001", truckNumber: "SW-3301",  driverName: "Craig Patterson",    driverPhone: "(602)555-0455", poNumber: "PO-2026-00896",    bolNumber: "BOL-SW-22001", sealNumber: "SL-70001", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSF").id, scheduledDate: daysAgoAt(2,15),  timeWindowStart: "15:00", timeWindowEnd: "17:00", movementType: "outbound",    loadType: "freight", trailerNumber: "NXSU-613001", truckNumber: "NXS-5491", driverName: "Ian Montgomery",     driverPhone: "(330)555-0311", poNumber: "LH-CMH-PIT-00900", bolNumber: "MNF-NXS-14001", sealNumber: "NXS-50006", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysAgoAt(1,8),   timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-872001", truckNumber: "NXS-6641", driverName: "Jason Lee",          driverPhone: "(417)555-0518", poNumber: "LH-CMH-DAY-00910", bolNumber: "MNF-NXS-87002", sealNumber: "NXS-77010", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("SNDR").id, scheduledDate: daysAgoAt(1,7),   timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "SNDR-R05001", truckNumber: "SN-3301",  driverName: "William Foster",     driverPhone: "(601)555-0276", poNumber: "PO-2026-00920",    bolNumber: "BOL-SN-05001", sealNumber: "SL-88211", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSS").id, scheduledDate: daysAgoAt(1,13),  timeWindowStart: "13:00", timeWindowEnd: "15:00", movementType: "live_unload", loadType: "mail",    trailerNumber: "NXSU-494001", truckNumber: "NXS-3361", driverName: "Omar Haddad",        driverPhone: "(614)555-0330", poNumber: "LH-CMH-CVG-00930", bolNumber: "MNF-NXS-55149", sealNumber: "NXS-55930", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("EXLA").id, scheduledDate: daysAgoAt(1,16),  timeWindowStart: "16:00", timeWindowEnd: "18:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "EXLA-R19501", truckNumber: "EX-9011",  driverName: "Grant Kelley",       driverPhone: "(804)555-0688", poNumber: "PO-2026-00940",    bolNumber: "BOL-EX-19501", sealNumber: "SL-50505", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysAgoAt(1,16),  timeWindowStart: "16:00", timeWindowEnd: "18:00", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-871001", truckNumber: "NXS-6611", driverName: "Curtis Palmer",      driverPhone: "(816)555-0199", poNumber: "LH-CMH-ORD-00950", bolNumber: "MNF-NXS-87101", sealNumber: "NXS-50707", status: "no_show" },

    // ── Today completed ───────────────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: todayAt(6),      timeWindowStart: "06:00", timeWindowEnd: "08:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-872010", truckNumber: "NXS-6640", driverName: "Jason Lee",          driverPhone: "(417)555-0518", poNumber: "LH-CMH-DAY-00964", bolNumber: "MNF-NXS-87202", sealNumber: "NXS-77011", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("SNDR").id, scheduledDate: todayAt(8),      timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "SNDR-R05540", truckNumber: "SN-3302",  driverName: "William Foster",     driverPhone: "(601)555-0276", poNumber: "PO-2026-00976",    bolNumber: "BOL-SN-05541", sealNumber: "SL-88212", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("WERN").id, scheduledDate: todayAt(8,30),   timeWindowStart: "08:30", timeWindowEnd: "10:30", movementType: "live_unload", loadType: "dry",     trailerNumber: "WERN-440280", truckNumber: "WE-7710",  driverName: "Tyler Richardson",   driverPhone: "(479)555-0348", poNumber: "PO-2026-00982",    bolNumber: "BOL-WE-44029", sealNumber: "SL-99312", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NGFF").id, scheduledDate: todayAt(7),      timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "freight", trailerNumber: "NXSU-615700", truckNumber: "NXS-5535", driverName: "Samuel Price",       driverPhone: "(336)555-0184", poNumber: "LH-CMH-INTL-00990",bolNumber: "AWB-NXS-14531", sealNumber: "NXS-99530", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSS").id, scheduledDate: todayAt(9),      timeWindowStart: "09:00", timeWindowEnd: "11:00", movementType: "inbound",     loadType: "mail",    trailerNumber: "NXSU-493300", truckNumber: "NXS-3340", driverName: "Alan Fisher",        driverPhone: "(531)555-0249", poNumber: "LH-CMH-CVG-00996", bolNumber: "MNF-NXS-55148", sealNumber: "NXS-55926", status: "completed" },

    // ── Today active / in-progress ────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("NXSF").id, scheduledDate: todayAt(11),     timeWindowStart: "11:00", timeWindowEnd: "13:00", movementType: "inbound",     loadType: "freight", trailerNumber: "NXSU-324000", truckNumber: "NXS-7780", driverName: "Paul Jenkins",       driverPhone: "(870)555-0245", poNumber: "LH-CMH-PIT-01026", bolNumber: "MNF-NXS-41244", sealNumber: "NXS-55035", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("JBHT").id, scheduledDate: todayAt(10),     timeWindowStart: "10:00", timeWindowEnd: "12:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "JBHU-832145", truckNumber: "JB-7721",  driverName: "Marcus Thompson",    driverPhone: "(469)555-0233", poNumber: "PO-2026-01032",    bolNumber: "BOL-JB-41205", sealNumber: "SL-88302", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXEC").id, scheduledDate: todayAt(12),     timeWindowStart: "12:00", timeWindowEnd: "14:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-715530", truckNumber: "NXS-2205", driverName: "David Kim",          driverPhone: "(503)555-0421", poNumber: "LH-CMH-IND-01036", bolNumber: "MNF-NXS-78055", sealNumber: null,          status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: todayAt(14,30),  timeWindowStart: "14:30", timeWindowEnd: "16:30", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-535000", truckNumber: "NXS-4470", driverName: "Leo Castillo",       driverPhone: "(210)555-0574", poNumber: "LH-CMH-ORD-01054", bolNumber: "MNF-NXS-90383", sealNumber: "NXS-33724", status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("XPOL").id, scheduledDate: todayAt(13),     timeWindowStart: "13:00", timeWindowEnd: "15:00", movementType: "live_load",   loadType: "dry",     trailerNumber: "XPOU-614500", truckNumber: "XP-5508",  driverName: "Patrick Sullivan",   driverPhone: "(540)555-0295", poNumber: "PO-2026-01060",    bolNumber: "BOL-XP-14503", sealNumber: null,          status: "completed" },
    { referenceNumber: aptRef(), carrierId: c("NXSP").id, scheduledDate: todayAt(15),     timeWindowStart: "15:00", timeWindowEnd: "17:00", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-290500", truckNumber: "NXS-8875", driverName: "Wayne Phillips",     driverPhone: "(865)555-0291", poNumber: "LH-CMH-CLE-01066", bolNumber: "MNF-NXS-82943", sealNumber: "NXS-11740", status: "completed" },

    // ── Today upcoming / booked ───────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("SWFT").id, scheduledDate: todayAt(18),     timeWindowStart: "18:00", timeWindowEnd: "20:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "SWFT-220500", truckNumber: "SW-3310",  driverName: "Larry Henderson",    driverPhone: "(971)555-0189", poNumber: "PO-2026-01072",    bolNumber: "BOL-SW-22050", sealNumber: "SL-72001", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NXSP").id, scheduledDate: todayAt(18,30),  timeWindowStart: "18:30", timeWindowEnd: "20:30", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-291000", truckNumber: "NXS-8890", driverName: "Eddie Morales",      driverPhone: "(901)555-0344", poNumber: "LH-CMH-CLE-01078", bolNumber: "MNF-NXS-83001", sealNumber: "NXS-11741", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: todayAt(20),     timeWindowStart: "20:00", timeWindowEnd: "22:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-875100", truckNumber: "NXS-6691", driverName: "Dustin Black",       driverPhone: "(417)555-0878", poNumber: "LH-CMH-DAY-01084", bolNumber: "MNF-NXS-87501", sealNumber: "NXS-61111", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NGFF").id, scheduledDate: todayAt(22),     timeWindowStart: "22:00", timeWindowEnd: "23:59", movementType: "live_load",   loadType: "freight", trailerNumber: "NXSU-056100", truckNumber: "NXS-3322", driverName: "Jerome Davis",       driverPhone: "(866)555-0744", poNumber: "LH-CMH-INTL-01090",bolNumber: "AWB-NXS-05601", sealNumber: "NXS-60909", status: "booked" },

    // ── Tomorrow ──────────────────────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("JBHT").id, scheduledDate: daysFromNowAt(1,7),  timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "JBHU-832500", truckNumber: "JB-7790", driverName: "Derek Walsh",        driverPhone: "(469)555-0301", poNumber: "PO-2026-01100",    bolNumber: "BOL-JB-41300", sealNumber: "SL-60101", status: "confirmed" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysFromNowAt(1,10), timeWindowStart: "10:00", timeWindowEnd: "12:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-536000", truckNumber: "NXS-4490", driverName: "Hector Ramirez",     driverPhone: "(312)555-0488", poNumber: "LH-CMH-ORD-01106", bolNumber: "MNF-NXS-90400", sealNumber: "NXS-60202", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("WERN").id, scheduledDate: daysFromNowAt(1,14), timeWindowStart: "14:00", timeWindowEnd: "16:00", movementType: "live_unload", loadType: "dry",     trailerNumber: "WERN-495000", truckNumber: "WE-3370", driverName: "Kevin Schultz",      driverPhone: "(402)555-0377", poNumber: "PO-2026-01112",    bolNumber: "BOL-WE-55200", sealNumber: "SL-60303", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("SNDR").id, scheduledDate: daysFromNowAt(1,6),  timeWindowStart: "06:00", timeWindowEnd: "08:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "SNDR-R42100", truckNumber: "SN-6200", driverName: "Craig Patterson",    driverPhone: "(920)555-0455", poNumber: "PO-2026-01118",    bolNumber: "BOL-SN-63100", sealNumber: "SL-60404", status: "confirmed" },
    { referenceNumber: aptRef(), carrierId: c("NXSS").id, scheduledDate: daysFromNowAt(1,11), timeWindowStart: "11:00", timeWindowEnd: "13:00", movementType: "inbound",     loadType: "mail",    trailerNumber: "NXSU-617000", truckNumber: "NXS-5560", driverName: "Victor Nguyen",      driverPhone: "(614)555-0512", poNumber: "LH-CMH-CVG-01124", bolNumber: "MNF-NXS-14600", sealNumber: "NXS-60505", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("XPOL").id, scheduledDate: daysFromNowAt(1,15), timeWindowStart: "15:00", timeWindowEnd: "17:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "XPOU-716500", truckNumber: "XP-2240", driverName: "Larry Henderson",    driverPhone: "(971)555-0189", poNumber: "PO-2026-01130",    bolNumber: "BOL-XP-78083", sealNumber: "SL-99639", status: "booked" },

    // ── Day after tomorrow ────────────────────────────────────────────────────
    { referenceNumber: aptRef(), carrierId: c("NXSP").id, scheduledDate: daysFromNowAt(2,8),  timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-291500", truckNumber: "NXS-8892", driverName: "Eddie Morales",      driverPhone: "(901)555-0344", poNumber: "LH-CMH-CLE-01136", bolNumber: "MNF-NXS-83050", sealNumber: "NXS-60606", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NXSF").id, scheduledDate: daysFromNowAt(2,13), timeWindowStart: "13:00", timeWindowEnd: "15:00", movementType: "inbound",     loadType: "freight", trailerNumber: "NXSU-332000", truckNumber: "NXS-1220", driverName: "Franklin Boyd",      driverPhone: "(330)555-0601", poNumber: "LH-CMH-PIT-01142", bolNumber: "MNF-NXS-33201", sealNumber: "NXS-60707", status: "confirmed" },
    { referenceNumber: aptRef(), carrierId: c("EXLA").id, scheduledDate: daysFromNowAt(2,9),  timeWindowStart: "09:00", timeWindowEnd: "11:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "EXLA-R19600", truckNumber: "EX-9025", driverName: "Shane Cooper",       driverPhone: "(804)555-0688", poNumber: "PO-2026-01148",    bolNumber: "BOL-EX-19601", sealNumber: "SL-60808", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("SWFT").id, scheduledDate: daysFromNowAt(3,7),  timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "SWFT-221000", truckNumber: "SW-3320", driverName: "Randy Castillo",     driverPhone: "(602)555-0511", poNumber: "PO-2026-01160",    bolNumber: "BOL-SW-22100", sealNumber: "SL-73001", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NGFF").id, scheduledDate: daysFromNowAt(3,12), timeWindowStart: "12:00", timeWindowEnd: "14:00", movementType: "live_load",   loadType: "freight", trailerNumber: "NXSU-056200", truckNumber: "NXS-3325", driverName: "Jerome Davis",       driverPhone: "(866)555-0744", poNumber: "LH-CMH-INTL-01154",bolNumber: "AWB-NXS-05701", sealNumber: "NXS-61009", status: "confirmed" },
    { referenceNumber: aptRef(), carrierId: c("NXEC").id, scheduledDate: daysFromNowAt(4,9),  timeWindowStart: "09:00", timeWindowEnd: "11:00", movementType: "inbound",     loadType: "parcel",  trailerNumber: "NXSU-441000", truckNumber: "NXS-7730", driverName: "Raymond Ortiz",      driverPhone: "(800)555-0801", poNumber: "LH-CMH-IND-01160", bolNumber: "MNF-NXS-44101", sealNumber: "NXS-61110", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NXSE").id, scheduledDate: daysFromNowAt(4,15), timeWindowStart: "15:00", timeWindowEnd: "17:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-875200", truckNumber: "NXS-6692", driverName: "Dustin Black",       driverPhone: "(417)555-0878", poNumber: "LH-CMH-DAY-01170", bolNumber: "MNF-NXS-87601", sealNumber: "NXS-61211", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("JBHT").id, scheduledDate: daysFromNowAt(5,7),  timeWindowStart: "07:00", timeWindowEnd: "09:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "JBHU-833000", truckNumber: "JB-7800", driverName: "Derek Walsh",        driverPhone: "(469)555-0301", poNumber: "PO-2026-01200",    bolNumber: "BOL-JB-41400", sealNumber: "SL-61201", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("WERN").id, scheduledDate: daysFromNowAt(5,11), timeWindowStart: "11:00", timeWindowEnd: "13:00", movementType: "inbound",     loadType: "dry",     trailerNumber: "WERN-496000", truckNumber: "WE-3380", driverName: "Kevin Schultz",      driverPhone: "(402)555-0377", poNumber: "PO-2026-01210",    bolNumber: "BOL-WE-55300", sealNumber: "SL-61301", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("SNDR").id, scheduledDate: daysFromNowAt(6,6),  timeWindowStart: "06:00", timeWindowEnd: "08:00", movementType: "inbound",     loadType: "reefer",  trailerNumber: "SNDR-R42200", truckNumber: "SN-6210", driverName: "William Foster",     driverPhone: "(601)555-0276", poNumber: "PO-2026-01220",    bolNumber: "BOL-SN-63200", sealNumber: "SL-61401", status: "booked" },
    { referenceNumber: aptRef(), carrierId: c("NXSP").id, scheduledDate: daysFromNowAt(6,8),  timeWindowStart: "08:00", timeWindowEnd: "10:00", movementType: "outbound",    loadType: "parcel",  trailerNumber: "NXSU-537500", truckNumber: "NXS-4506", driverName: "Oscar Pena",         driverPhone: "(210)555-0922", poNumber: "LH-CMH-ORD-01230", bolNumber: "MNF-NXS-90550", sealNumber: "NXS-61501", status: "booked" },
  ].map(r => ({ ...r, facilityId }))).returning();

  const apt = (i: number) => demoAppointments[i];

  // ── Visits ────────────────────────────────────────────────────────────────────
  type VisitRow = {
    visitNumber: string; appointmentId: number|null; carrierId: number; driverName: string;
    driverLicense: string; truckNumber: string; trailerNumber: string; sealNumber: string|null;
    movementType: string; visitStatus: string; locationStatus: string; holdStatus: string;
    currentSlotId: number|null; currentDockDoorId: number|null; checkInTime: Date;
    checkOutTime: Date|null; checkInBy: string; notes: string|null;
    trailerClass: string; ownerType: string; locationConfirmed: boolean;
  };

  const demoVisits: VisitRow[] = [
    // ── Active: just arrived at gate ────────────────────────────────────────
    { visitNumber: visitNum(), appointmentId: apt(25).id, carrierId: c("NXSF").id,  driverName: "Paul Jenkins",       driverLicense: "CDL-OH-770340", truckNumber: "NXS-7780",  trailerNumber: "NXSU-324000", sealNumber: "NXS-770088",  movementType: "inbound",     visitStatus: "checked_in",  locationStatus: "at_gate_in",    holdStatus: "none",              currentSlotId: null,           currentDockDoorId: null,       checkInTime: minutesAgo(6),   checkOutTime: null, checkInBy: "demo-gg-002", notes: "Nexus Freight line-haul from PIT — awaiting slot assignment", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("WERN").id,  driverName: "Brian Russell",      driverLicense: "CDL-NE-550100", truckNumber: "WE-3355",   trailerNumber: "WERN-494100", sealNumber: "SL-550223",    movementType: "inbound",     visitStatus: "checked_in",  locationStatus: "at_gate_in",    holdStatus: "documentation_hold",currentSlotId: null,           currentDockDoorId: null,       checkInTime: minutesAgo(14),  checkOutTime: null, checkInBy: "demo-gg-001", notes: "Walk-in — missing BOL, documentation hold placed", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("SWFT").id,  driverName: "Derek Monroe",       driverLicense: "CDL-AZ-661100", truckNumber: "SW-3312",   trailerNumber: "SWFT-220200", sealNumber: "SL-661009",    movementType: "inbound",     visitStatus: "checked_in",  locationStatus: "at_gate_in",    holdStatus: "security_hold",     currentSlotId: null,           currentDockDoorId: null,       checkInTime: minutesAgo(9),   checkOutTime: null, checkInBy: "demo-gg-003", notes: "Random security screening initiated — all traffic hold", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },

    // ── In-yard: parked in yard slots (waiting for dock) ─────────────────────
    { visitNumber: visitNum(), appointmentId: apt(0).id,  carrierId: c("NXSE").id,  driverName: "Carlos Mendez",      driverLicense: "CDL-FL-123456", truckNumber: "NXS-4410",  trailerNumber: "NXSU-537201", sealNumber: "NXS-887401",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("A-01").id, currentDockDoorId: null,      checkInTime: hoursAgo(9),     checkOutTime: null, checkInBy: "demo-gg-001", notes: "Express parcel from ORD — awaiting dock assignment (D-05 prepped)", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(3).id,  carrierId: c("SNDR").id,  driverName: "Ryan O'Brien",       driverLicense: "CDL-WI-456789", truckNumber: "SN-6100",   trailerNumber: "SNDR-R42001", sealNumber: "SL-662010",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("R-01").id, currentDockDoorId: null,      checkInTime: hoursAgo(7),     checkOutTime: null, checkInBy: "demo-gg-002", notes: "Cold-chain reefer — temp verified 34°F on arrival, monitoring active", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(5).id,  carrierId: c("NXSP").id,  driverName: "Nathan Cruz",        driverLicense: "CDL-DE-334455", truckNumber: "NXS-8832",  trailerNumber: "NXSU-289001", sealNumber: "NXS-889077",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("A-02").id, currentDockDoorId: null,      checkInTime: hoursAgo(6),     checkOutTime: null, checkInBy: "demo-gg-001", notes: "Nexus Parcel network trailer from CLE — dock D-06 assigned pending crew", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(7).id,  carrierId: c("NXSF").id,  driverName: "Trevor Hall",        driverLicense: "CDL-PA-667788", truckNumber: "NXS-1204",  trailerNumber: "NXSU-330087", sealNumber: "NXS-331120",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("A-03").id, currentDockDoorId: null,      checkInTime: hoursAgo(5,5),   checkOutTime: null, checkInBy: "demo-gg-002", notes: "Freight consolidation from PIT — mixed pallets, dock crew ETA 30 min", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(8).id,  carrierId: c("EXLA").id,  driverName: "Anthony Reyes",      driverLicense: "CDL-VA-112233", truckNumber: "EX-9011",   trailerNumber: "EXLA-R19503", sealNumber: "SL-119088",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("R-02").id, currentDockDoorId: null,      checkInTime: hoursAgo(5),     checkOutTime: null, checkInBy: "demo-gg-001", notes: "Reefer — temp verified 36°F, unit running. Physical check pending", trailerClass: "general",          ownerType: "external",   locationConfirmed: false },
    { visitNumber: visitNum(), appointmentId: apt(1).id,  carrierId: c("JBHT").id,  driverName: "Marcus Thompson",    driverLicense: "CDL-AR-789012", truckNumber: "JB-7721",   trailerNumber: "JBHU-832145", sealNumber: "SL-778320",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_staging",    holdStatus: "none",              currentSlotId: null,            currentDockDoorId: null,      checkInTime: hoursAgo(1,5),   checkOutTime: null, checkInBy: "demo-gg-001", notes: "Waiting for slot — jockey en route. Physical location not yet confirmed", trailerClass: "general",          ownerType: "external",   locationConfirmed: false },
    { visitNumber: visitNum(), appointmentId: apt(6).id,  carrierId: c("XPOL").id,  driverName: "Patrick Sullivan",   driverLicense: "CDL-CT-778899", truckNumber: "XP-5510",   trailerNumber: "XPOU-614505", sealNumber: "SL-778550",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("A-07").id, currentDockDoorId: null,      checkInTime: hoursAgo(2),     checkOutTime: null, checkInBy: "demo-gg-002", notes: "XPO live load pending — load crew on break until 15:00", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSE").id,  driverName: "Maria Santos",       driverLicense: "CDL-FL-445566", truckNumber: "NXS-4415",  trailerNumber: "NXSU-537350", sealNumber: "NXS-537360",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("A-08").id, currentDockDoorId: null,      checkInTime: hoursAgo(3),     checkOutTime: null, checkInBy: "demo-gg-003", notes: "Unscheduled Nexus Express arrival — added to dock queue for D-09", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },

    // ── At dock: loading / unloading / spotted ────────────────────────────────
    { visitNumber: visitNum(), appointmentId: apt(2).id,  carrierId: c("NXSS").id,  driverName: "Brandon Miller",     driverLicense: "CDL-OH-345678", truckNumber: "NXS-3315",  trailerNumber: "NXSU-490087", sealNumber: "NXS-449087",  movementType: "live_unload", visitStatus: "unloading",   locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-01").id, checkInTime: hoursAgo(8), checkOutTime: null, checkInBy: "demo-gg-001", notes: "Live mail unload in progress — 72% complete, 3 pallets remaining", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(27).id, carrierId: c("NXEC").id,  driverName: "David Kim",          driverLicense: "CDL-FL-567890", truckNumber: "NXS-2205",  trailerNumber: "NXSU-715530", sealNumber: null,           movementType: "outbound",    visitStatus: "loading",     locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-02").id, checkInTime: hoursAgo(6), checkOutTime: null, checkInBy: "demo-gg-002", notes: "Loading outbound parcel to IND — 55% loaded, 18 packages remaining", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(29).id, carrierId: c("XPOL").id,  driverName: "Patrick Sullivan",   driverLicense: "CDL-CT-778899", truckNumber: "XP-5508",   trailerNumber: "XPOU-614500", sealNumber: null,           movementType: "live_load",   visitStatus: "loading",     locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-03").id, checkInTime: hoursAgo(5), checkOutTime: null, checkInBy: "demo-gg-001", notes: "XPO live load — driver at break room, expected back 14:45", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(20).id, carrierId: c("NXSE").id,  driverName: "Jason Lee",          driverLicense: "CDL-FL-990011", truckNumber: "NXS-6640",  trailerNumber: "NXSU-872010", sealNumber: null,           movementType: "outbound",    visitStatus: "at_dock",     locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-04").id, checkInTime: hoursAgo(4,5),checkOutTime: null, checkInBy: "demo-gg-002", notes: "Spotted D-04, load crew ETA 30 min — departure window 17:00", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSP").id,  driverName: "Lena Carter",        driverLicense: "CDL-OH-223344", truckNumber: "NXS-8845",  trailerNumber: "NXSU-291100", sealNumber: "NXS-291105",  movementType: "inbound",     visitStatus: "unloading",   locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-05").id, checkInTime: hoursAgo(3), checkOutTime: null, checkInBy: "demo-gg-003", notes: "Parcel inbound from CLE — unload in progress, sorter running", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(9).id,  carrierId: c("WERN").id,  driverName: "Tyler Richardson",   driverLicense: "CDL-NE-445500", truckNumber: "WE-7711",   trailerNumber: "WERN-440290", sealNumber: "NXS-440295",  movementType: "live_unload", visitStatus: "unloading",   locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-06").id, checkInTime: hoursAgo(4), checkOutTime: null, checkInBy: "demo-gg-001", notes: "Werner live unload — freight being deconsolidated at D-06", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSS").id,  driverName: "George Watts",       driverLicense: "CDL-OH-556677", truckNumber: "NXS-3350",  trailerNumber: "NXSU-495000", sealNumber: "NXS-495010",  movementType: "inbound",     visitStatus: "at_dock",     locationStatus: "at_dock_door",  holdStatus: "none",              currentSlotId: null,            currentDockDoorId: door("D-09").id, checkInTime: hoursAgo(2), checkOutTime: null, checkInBy: "demo-gg-002", notes: "Supply chain inbound — D-09 leveler engaged, crew preparing", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },

    // ── Ready-out: completed, awaiting checkout ───────────────────────────────
    { visitNumber: visitNum(), appointmentId: apt(22).id, carrierId: c("WERN").id,  driverName: "Tyler Richardson",   driverLicense: "CDL-NE-445500", truckNumber: "WE-7710",   trailerNumber: "WERN-440280", sealNumber: "NXS-440280",  movementType: "live_unload", visitStatus: "ready_out",   locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("B-01").id, currentDockDoorId: null,      checkInTime: hoursAgo(11),    checkOutTime: null, checkInBy: "demo-gg-001", notes: "Empty after unload — ready for departure, driver notified", trailerClass: "empty",            ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(30).id, carrierId: c("NXEC").id,  driverName: "Michael Barnes",     driverLicense: "CDL-FL-223300", truckNumber: "NXS-6120",  trailerNumber: "NXSU-420150", sealNumber: "NXS-420150",  movementType: "outbound",    visitStatus: "ready_out",   locationStatus: "at_gate_out",   holdStatus: "none",              currentSlotId: null,            currentDockDoorId: null,      checkInTime: hoursAgo(9),     checkOutTime: null, checkInBy: "demo-gg-002", notes: "Outbound parcel sealed and at exit gate — awaiting driver sign-off", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("JBHT").id,  driverName: "Derek Walsh",        driverLicense: "CDL-AR-445500", truckNumber: "JB-7725",   trailerNumber: "JBHU-832200", sealNumber: "SL-662500",   movementType: "inbound",     visitStatus: "ready_out",   locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("B-02").id, currentDockDoorId: null,      checkInTime: hoursAgo(8),     checkOutTime: null, checkInBy: "demo-gg-003", notes: "J.B. Hunt inbound completed — driver doing paperwork, ready shortly", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },

    // ── In-yard with holds ────────────────────────────────────────────────────
    { visitNumber: visitNum(), appointmentId: apt(28).id, carrierId: c("NXSE").id,  driverName: "Leo Castillo",       driverLicense: "CDL-FL-334455", truckNumber: "NXS-4470",  trailerNumber: "NXSU-535000", sealNumber: "NXS-535001",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "security_hold",     currentSlotId: slot("A-04").id, currentDockDoorId: null,      checkInTime: hoursAgo(7),     checkOutTime: null, checkInBy: "demo-gg-001", notes: "Random Nexus security screening — agricultural inspection ordered", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: apt(24).id, carrierId: c("NXSS").id,  driverName: "Alan Fisher",        driverLicense: "CDL-OH-889911", truckNumber: "NXS-3340",  trailerNumber: "NXSU-493300", sealNumber: "NXS-493300",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "damage_hold",       currentSlotId: slot("A-05").id, currentDockDoorId: null,      checkInTime: hoursAgo(5,5),   checkOutTime: null, checkInBy: "demo-gg-002", notes: "Rear door hinge bent on arrival — right door not flush. Photos taken, carrier notified", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: false },
    { visitNumber: visitNum(), appointmentId: apt(23).id, carrierId: c("NGFF").id,  driverName: "Samuel Price",       driverLicense: "CDL-NC-776600", truckNumber: "NXS-5535",  trailerNumber: "NXSU-615700", sealNumber: "NXS-615700",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "customs_hold",      currentSlotId: slot("A-06").id, currentDockDoorId: null,      checkInTime: hoursAgo(10),    checkOutTime: null, checkInBy: "demo-gg-001", notes: "DGF bonded international — Customs Form 7501 pending, CBP review ETA 4h", trailerClass: "general",          ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("SNDR").id,  driverName: "Craig Patterson",    driverLicense: "CDL-WI-557700", truckNumber: "SN-6105",   trailerNumber: "SNDR-R42010", sealNumber: "SL-557701",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "seal_discrepancy",  currentSlotId: slot("R-03").id, currentDockDoorId: null,      checkInTime: hoursAgo(3,5),   checkOutTime: null, checkInBy: "demo-gg-003", notes: "Seal number on trailer (SL-557810) differs from BOL (SL-557701) — supervisor review required", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("EXLA").id,  driverName: "Grant Kelley",       driverLicense: "CDL-VA-334500", truckNumber: "EX-9015",   trailerNumber: "EXLA-R19510", sealNumber: "SL-667200",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("R-04").id, currentDockDoorId: null,      checkInTime: hoursAgo(2,5),   checkOutTime: null, checkInBy: "demo-gg-001", notes: "Estes reefer — temp 37°F, borderline for pharma load, monitoring closely", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSF").id,  driverName: "Franklin Boyd",      driverLicense: "CDL-OH-443300", truckNumber: "NXS-1215",  trailerNumber: "NXSU-325000", sealNumber: "NXS-325010",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "documentation_hold",currentSlotId: slot("A-09").id, currentDockDoorId: null,      checkInTime: hoursAgo(1),     checkOutTime: null, checkInBy: "demo-gg-002", notes: "Missing HAWB — freight forwarder contacted, 30 min ETA for document", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },

    // ── Aged trailers (>24h dwell) ────────────────────────────────────────────
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSP").id,  driverName: "George Flores",      driverLicense: "CDL-DE-556677", truckNumber: "NXS-6670",  trailerNumber: "NXSU-874000", sealNumber: "NXS-874000",  movementType: "empty_drop",  visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("C-01").id, currentDockDoorId: null,      checkInTime: hoursAgo(30),    checkOutTime: null, checkInBy: "demo-gg-001", notes: "Storage trailer — overflow equipment, classified non_mail_storage >24h dwell", trailerClass: "non_mail_storage", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSE").id,  driverName: "Danielle Wu",        driverLicense: "CDL-OH-101122", truckNumber: "NXS-4460",  trailerNumber: "NXSU-538800", sealNumber: null,           movementType: "empty_drop",  visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("C-02").id, currentDockDoorId: null,      checkInTime: hoursAgo(36),    checkOutTime: null, checkInBy: "demo-gg-002", notes: "Empty pool trailer — available for outbound builds, dwell alert triggered", trailerClass: "empty",            ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSS").id,  driverName: "Omar Haddad",        driverLicense: "CDL-OH-334400", truckNumber: "NXS-3360",  trailerNumber: "NXSU-491100", sealNumber: null,           movementType: "empty_drop",  visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("C-03").id, currentDockDoorId: null,      checkInTime: hoursAgo(22),    checkOutTime: null, checkInBy: "demo-gg-001", notes: "Empty pool — reserved for next CVG mail run tonight", trailerClass: "empty",            ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("WERN").id,  driverName: "Randy Wallace",      driverLicense: "CDL-NE-778800", truckNumber: "WE-3365",   trailerNumber: "WERN-441000", sealNumber: "SL-779300",   movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "damage_hold",       currentSlotId: slot("B-03").id, currentDockDoorId: null,      checkInTime: hoursAgo(26),    checkOutTime: null, checkInBy: "demo-gg-002", notes: ">24h dwell + damage hold — side panel buckled, Werner claim form filed", trailerClass: "general",          ownerType: "external",   locationConfirmed: true },

    // ── Hazmat isolation ──────────────────────────────────────────────────────
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NGFF").id,  driverName: "Jerome Davis",       driverLicense: "CDL-NC-554400", truckNumber: "NXS-5540",  trailerNumber: "NXSU-055100", sealNumber: "NXS-055110",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "customs_hold",      currentSlotId: slot("H-01").id, currentDockDoorId: null,      checkInTime: hoursAgo(6),     checkOutTime: null, checkInBy: "demo-gg-001", notes: "DGR Class 3 flammable — HAZ zone parking, MSDS on file, customs pending", trailerClass: "general",          ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: visitNum(), appointmentId: null,        carrierId: c("NXSF").id,  driverName: "Victor Nguyen",      driverLicense: "CDL-OH-667700", truckNumber: "NXS-1216",  trailerNumber: "NXSU-327000", sealNumber: "NXS-327010",  movementType: "inbound",     visitStatus: "in_yard",     locationStatus: "in_yard_slot",  holdStatus: "none",              currentSlotId: slot("H-02").id, currentDockDoorId: null,      checkInTime: hoursAgo(4),     checkOutTime: null, checkInBy: "demo-gg-003", notes: "DGR Class 9 misc hazmat — paperwork verified, HAZ isolation standard", trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },

    // ── Closed (checked out, historical) ─────────────────────────────────────
    { visitNumber: "VST-CMH26-HIST01", appointmentId: null, carrierId: c("NXSE").id, driverName: "Mike Torres",       driverLicense: "CDL-FL-990011", truckNumber: "NXS-4401",  trailerNumber: "NXSU-531000", sealNumber: "NXS-531001",  movementType: "inbound",     visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(14),  checkOutTime: hoursAgo(5),  checkInBy: "demo-gg-001", notes: "Completed — parcel unloaded, departed via Gate 3",              trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST02", appointmentId: null, carrierId: c("SNDR").id, driverName: "Ray Washington",    driverLicense: "CDL-WI-880099", truckNumber: "SN-3302",   trailerNumber: "SNDR-R05540", sealNumber: "SL-770001",   movementType: "inbound",     visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(12),  checkOutTime: hoursAgo(4),  checkInBy: "demo-gg-002", notes: "Reefer fully unloaded, temp maintained throughout — released",  trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST03", appointmentId: null, carrierId: c("JBHT").id, driverName: "Victor Nguyen",     driverLicense: "CDL-AR-334400", truckNumber: "JB-7715",   trailerNumber: "JBHU-830100", sealNumber: "SL-889900",   movementType: "inbound",     visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(18),  checkOutTime: hoursAgo(8),  checkInBy: "demo-gg-003", notes: "Dry van unloaded — departed ahead of schedule",                trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST04", appointmentId: null, carrierId: c("NXSF").id, driverName: "Ian Montgomery",    driverLicense: "CDL-PA-443300", truckNumber: "NXS-5491",  trailerNumber: "NXSU-613001", sealNumber: "NXS-613010",  movementType: "outbound",    visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(20),  checkOutTime: hoursAgo(6),  checkInBy: "demo-gg-001", notes: "Outbound freight loaded and sealed — departed Gate 3",         trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST05", appointmentId: null, carrierId: c("XPOL").id, driverName: "Wesley Reid",       driverLicense: "CDL-CT-220011", truckNumber: "XP-5502",   trailerNumber: "XPOU-614010", sealNumber: "SL-441001",   movementType: "live_load",   visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(16),  checkOutTime: hoursAgo(7),  checkInBy: "demo-gg-002", notes: "Live load completed and sealed — driver departed on schedule",  trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST06", appointmentId: null, carrierId: c("NXSE").id, driverName: "Carlos Mendez",     driverLicense: "CDL-FL-123456", truckNumber: "NXS-4412",  trailerNumber: "NXSU-537210", sealNumber: "NXS-537215",  movementType: "inbound",     visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(22),  checkOutTime: hoursAgo(9),  checkInBy: "demo-gg-001", notes: "Nexus Express inbound — unloaded and returned to network pool",   trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST07", appointmentId: null, carrierId: c("NXSS").id, driverName: "Brandon Miller",    driverLicense: "CDL-OH-345678", truckNumber: "NXS-3318",  trailerNumber: "NXSU-490100", sealNumber: "NXS-490105",  movementType: "live_unload", visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(24),  checkOutTime: hoursAgo(10), checkInBy: "demo-gg-002", notes: "Mail unload completed — sorted and departed",                  trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST08", appointmentId: null, carrierId: c("SWFT").id, driverName: "Craig Patterson",   driverLicense: "CDL-WI-557700", truckNumber: "SW-3305",   trailerNumber: "SWFT-220010", sealNumber: "SL-700101",   movementType: "inbound",     visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(26),  checkOutTime: hoursAgo(11), checkInBy: "demo-gg-003", notes: "Swift dry van unloaded and released",                          trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST09", appointmentId: null, carrierId: c("WERN").id, driverName: "Tyler Richardson",  driverLicense: "CDL-NE-445500", truckNumber: "WE-7705",   trailerNumber: "WERN-440010", sealNumber: "SL-885001",   movementType: "live_unload", visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(28),  checkOutTime: hoursAgo(12), checkInBy: "demo-gg-001", notes: "Werner live unload completed",                                 trailerClass: "general",          ownerType: "external",   locationConfirmed: true },
    { visitNumber: "VST-CMH26-HIST10", appointmentId: null, carrierId: c("NXSP").id, driverName: "Nathan Cruz",       driverLicense: "CDL-DE-334455", truckNumber: "NXS-8808",  trailerNumber: "NXSU-289010", sealNumber: "NXS-289015",  movementType: "outbound",    visitStatus: "closed",      locationStatus: "exited",        holdStatus: "none",              currentSlotId: null, currentDockDoorId: null, checkInTime: hoursAgo(30),  checkOutTime: hoursAgo(13), checkInBy: "demo-gg-002", notes: "Nexus Parcel outbound — fully loaded, sealed, departed",         trailerClass: "internal_network", ownerType: "dhl_owned",  locationConfirmed: true },
  ];

  const insertedVisits = await db.insert(visits).values(demoVisits.map(v => ({ ...v, facilityId }))).returning();

  // Update slot + door occupancy
  for (const v of insertedVisits) {
    if (v.currentSlotId) await db.update(yardSlots).set({ currentVisitId: v.id }).where(eq(yardSlots.id, v.currentSlotId));
    if (v.currentDockDoorId) await db.update(dockDoors).set({ currentVisitId: v.id }).where(eq(dockDoors.id, v.currentDockDoorId));
  }

  // Gate transactions
  for (const v of insertedVisits) {
    await db.insert(gateTransactions).values({ visitId: v.id, type: "check_in", gateId: insertedGates[0].id, userId: v.checkInBy });
    if (v.visitStatus === "closed") await db.insert(gateTransactions).values({ visitId: v.id, type: "check_out", gateId: insertedGates[2].id, userId: v.checkInBy });
  }

  const visit = (i: number) => insertedVisits[i];

  // License plates
  const usStates = ["OH", "PA", "IN", "IL", "KY", "MI", "WI", "TN", "VA", "NC"];
  for (let i = 0; i < insertedVisits.length; i++) {
    const st = usStates[i % usStates.length];
    const plate = `${st}-${(1000 + i * 137).toString().slice(0, 4)}${String.fromCharCode(65 + (i % 26))}`;
    await db.update(visits).set({ licensePlate: plate }).where(eq(visits.id, insertedVisits[i].id));
  }

  // Tags
  const tagMap: Record<number, string[]> = {
    4:  ["priority"],
    5:  ["reefer"],
    8:  ["reefer", "priority"],
    11: ["unscheduled"],
    21: ["security"],
    22: ["damage"],
    23: ["customs", "bonded"],
    24: ["seal_discrepancy"],
    27: ["aged", "dwell_alert"],
    28: ["empty", "dwell_alert"],
    29: ["empty"],
    30: ["aged", "damage"],
    31: ["hazmat"],
    32: ["hazmat"],
  };
  for (const [i, tags] of Object.entries(tagMap)) {
    const v = insertedVisits[Number(i)];
    if (v) await db.update(visits).set({ tags }).where(eq(visits.id, v.id));
  }

  // ── Location history ──────────────────────────────────────────────────────────
  const locHistRows: Array<typeof locationHistory.$inferInsert> = [];
  for (const v of insertedVisits) {
    locHistRows.push({ visitId: v.id, trailerNumber: v.trailerNumber, fromLocation: null, toLocation: "Gate In", locationStatus: "at_gate_in", source: "gate_check_in", reason: null, changedBy: v.checkInBy, changedByName: null, createdAt: v.checkInTime ?? hoursAgo(6) });
    if (v.currentSlotId) {
      const s = insertedSlots.find(x => x.id === v.currentSlotId);
      locHistRows.push({ visitId: v.id, trailerNumber: v.trailerNumber, fromLocation: "Gate In", toLocation: s ? `Slot ${s.slotNumber}` : "Yard Slot", locationStatus: "in_yard_slot", source: "slot_assigned", reason: null, changedBy: "demo-ym-001", changedByName: "Robert Chen", createdAt: new Date((v.checkInTime ?? hoursAgo(6)).getTime() + 22 * 60000) });
    }
    if (v.currentDockDoorId) {
      const d = insertedDoors.find(x => x.id === v.currentDockDoorId);
      locHistRows.push({ visitId: v.id, trailerNumber: v.trailerNumber, fromLocation: "Gate In", toLocation: d ? `Dock ${d.doorNumber}` : "Dock Door", locationStatus: "at_dock_door", source: "dock_assigned", reason: null, changedBy: "demo-ym-001", changedByName: "Robert Chen", createdAt: new Date((v.checkInTime ?? hoursAgo(6)).getTime() + 35 * 60000) });
    }
    if (v.visitStatus === "closed") {
      locHistRows.push({ visitId: v.id, trailerNumber: v.trailerNumber, fromLocation: "Yard", toLocation: "Gate Out", locationStatus: "exited", source: "gate_check_out", reason: null, changedBy: v.checkInBy, changedByName: null, createdAt: v.checkOutTime ?? hoursAgo(3) });
    }
  }
  if (locHistRows.length > 0) await db.insert(locationHistory).values(locHistRows);

  // ── Seal history ──────────────────────────────────────────────────────────────
  const sealRows: Array<{ visitId: number; sealNumber: string; recordedAt: Date; recordedBy: string; eventType: string }> = [];
  for (const v of insertedVisits) {
    if (v.sealNumber) sealRows.push({ visitId: v.id, sealNumber: v.sealNumber, recordedAt: v.checkInTime ?? hoursAgo(6), recordedBy: v.checkInBy || "demo-gg-001", eventType: "check_in" });
    if (v.visitStatus === "closed" && v.sealNumber) sealRows.push({ visitId: v.id, sealNumber: v.sealNumber, recordedAt: v.checkOutTime ?? hoursAgo(3), recordedBy: "demo-gg-001", eventType: "check_out" });
  }
  // Mid-visit inspection seals
  sealRows.push({ visitId: visit(3).id, sealNumber: visit(3).sealNumber!, recordedAt: hoursAgo(8), recordedBy: "demo-gg-001", eventType: "inspection" });
  sealRows.push({ visitId: visit(23).id, sealNumber: visit(23).sealNumber!, recordedAt: hoursAgo(9), recordedBy: "demo-ym-001", eventType: "inspection" });
  sealRows.push({ visitId: visit(31).id, sealNumber: visit(31).sealNumber!, recordedAt: hoursAgo(5), recordedBy: "demo-gg-003", eventType: "inspection" });
  sealRows.push({ visitId: visit(10).id, sealNumber: visit(10).sealNumber!, recordedAt: hoursAgo(1), recordedBy: "demo-gg-002", eventType: "inspection" });
  // Seal mismatch event
  sealRows.push({ visitId: visit(24).id, sealNumber: "SL-557810", recordedAt: hoursAgo(3), recordedBy: "demo-gg-003", eventType: "check_in" });
  if (sealRows.length > 0) await db.insert(sealHistory).values(sealRows);

  // ── Dwell thresholds ──────────────────────────────────────────────────────────
  await db.insert(dwellThresholds).values([
    { trailerClass: "internal_network", warningHours: 4,   alertHours: 12,  updatedBy: "demo-admin-001" },
    { trailerClass: "general",          warningHours: 8,   alertHours: 24,  updatedBy: "demo-admin-001" },
    { trailerClass: "empty",            warningHours: 24,  alertHours: 72,  updatedBy: "demo-admin-001" },
    { trailerClass: "non_mail_storage", warningHours: 72,  alertHours: 168, updatedBy: "demo-admin-001" },
  ]).onConflictDoNothing();

  // ── Revenue rates ─────────────────────────────────────────────────────────────
  await db.insert(revenueRates).values([
    { serviceType: "detention_dry",    displayName: "Dry Van Detention",      description: "Per-day charge after free time for standard dry trailers",             ratePerUnit: 50, unit: "per_day",  freeHours: 24, isActive: true },
    { serviceType: "detention_reefer", displayName: "Reefer Detention",       description: "Per-day charge after free time for temperature-controlled trailers",   ratePerUnit: 75, unit: "per_day",  freeHours: 24, isActive: true },
    { serviceType: "storage_empty",    displayName: "Empty Trailer Storage",  description: "Per-day storage for empty trailers in the network pool",               ratePerUnit: 15, unit: "per_day",  freeHours: 72, isActive: true },
    { serviceType: "storage_general",  displayName: "Loaded Trailer Storage", description: "Per-day storage for loaded external trailers",                         ratePerUnit: 30, unit: "per_day",  freeHours: 48, isActive: true },
    { serviceType: "yard_move",        displayName: "Yard Move (Spotting)",   description: "Per-move jockey spotting fee",                                          ratePerUnit: 25, unit: "per_move", freeHours: 0,  isActive: true },
  ]).onConflictDoNothing();

  // ── AI config ─────────────────────────────────────────────────────────────────
  await db.insert(aiConfig).values({ copilotEnabled: true, chatAssistantEnabled: true, predictiveOpsEnabled: true, smartSuggestionsEnabled: true, proactiveAlertsEnabled: true, automationLevel: "assistive", aiCanTriggerActions: true, requireSupervisorApproval: true, allowedModules: ["gate","yard_slot","move","dock","dwell","reports"], showExplanations: "supervisors", showDataSignals: true, showConfidenceScores: true, showContributingFactors: true, predictionWindow: "1hour", thresholds: { dwellWarningHours: 4, dwellAlertHours: 12, dockCongestion: 0.8 }, alertTypes: ["dwell_breach","move_stalled","seal_mismatch","unconfirmed_location"], alertChannels: ["in_app","email"], updatedBy: "demo-admin-001" });

  // ── Move tasks ────────────────────────────────────────────────────────────────
  await db.insert(moveTasks).values([
    // Open — need action now
    { visitId: visit(0).id,  fromLocationType: "gate",    fromLocationId: insertedGates[0].id,  fromLocationName: "Gate 1 - Main",    toLocationType: "slot",  toLocationId: slot("A-10").id,          toLocationName: "A-10",        moveType: "gate_to_slot",  priority: "high",   status: "open",        source: "gate",          notes: "New arrival NXSU-324000 — needs immediate slot placement",                         createdBy: "demo-gg-002", createdAt: minutesAgo(40) },
    { visitId: visit(2).id,  fromLocationType: "gate",    fromLocationId: insertedGates[0].id,  fromLocationName: "Gate 1 - Main",    toLocationType: "slot",  toLocationId: slot("A-11").id,          toLocationName: "A-11",        moveType: "gate_to_slot",  priority: "urgent", status: "open",        source: "gate",          notes: "URGENT: Swift trailer on security hold — park isolated, do not queue for dock",    createdBy: "demo-ym-001", createdAt: minutesAgo(20) },
    { visitId: visit(3).id,  fromLocationType: "slot",    fromLocationId: slot("A-01").id,      fromLocationName: "A-01",             toLocationType: "dock",  toLocationId: door("D-08").id,          toLocationName: "Door D-08",   moveType: "slot_to_dock",  priority: "high",   status: "open",        notes: "Nexus Express to dock — crew waiting at D-08",                                      createdBy: "demo-ym-001", createdAt: minutesAgo(25) },
    { visitId: visit(5).id,  fromLocationType: "slot",    fromLocationId: slot("A-02").id,      fromLocationName: "A-02",             toLocationType: "dock",  toLocationId: door("D-06").id,          toLocationName: "Door D-06",   moveType: "slot_to_dock",  priority: "normal", status: "open",        notes: "Nexus Parcel to D-06 for inbound unload",                                           createdBy: "demo-ym-001", createdAt: minutesAgo(50) },
    { visitId: visit(6).id,  fromLocationType: "slot",    fromLocationId: slot("A-03").id,      fromLocationName: "A-03",             toLocationType: "slot",  toLocationId: slot("C-04").id,          toLocationName: "C-04",        moveType: "reposition",    priority: "low",    status: "open",        notes: "Reposition Nexus Freight trailer from inbound staging to network pool",             createdBy: "demo-ym-001", createdAt: minutesAgo(60) },
    { visitId: visit(4).id,  fromLocationType: "slot",    fromLocationId: slot("R-01").id,      fromLocationName: "R-01",             toLocationType: "dock",  toLocationId: door("D-07").id,          toLocationName: "Door D-07",   moveType: "slot_to_dock",  priority: "high",   status: "open",        notes: "Schneider reefer to D-07 — temp-sensitive, expedite",                             createdBy: "demo-ym-001", createdAt: minutesAgo(55) },
    { visitId: visit(26).id, fromLocationType: "slot",    fromLocationId: slot("A-06").id,      fromLocationName: "A-06",             toLocationType: "slot",  toLocationId: slot("H-03").id,          toLocationName: "H-03",        moveType: "reposition",    priority: "normal", status: "open",        notes: "DGF bonded goods reposition to HAZ zone pending customs clearance",               createdBy: "demo-ym-002", createdAt: minutesAgo(30) },

    // Assigned — jockeys en route or working
    { visitId: visit(8).id,  fromLocationType: "staging", fromLocationId: null,                 fromLocationName: "Staging Area",     toLocationType: "slot",  toLocationId: slot("A-12").id,          toLocationName: "A-12",        moveType: "gate_to_slot",  priority: "normal", status: "assigned",    assignedTo: "demo-yj-001", notes: "Park J.B. Hunt in inbound staging A-12",                                          createdBy: "demo-ym-001", createdAt: minutesAgo(45) },
    { visitId: visit(4).id,  fromLocationType: "slot",    fromLocationId: slot("R-01").id,      fromLocationName: "R-01",             toLocationType: "dock",  toLocationId: door("D-05").id,          toLocationName: "Door D-05",   moveType: "slot_to_dock",  priority: "high",   status: "assigned",    assignedTo: "demo-yj-002", notes: "Schneider reefer D-05 backup — if D-07 blocked use D-05",                        createdBy: "demo-ym-001", createdAt: minutesAgo(50) },
    { visitId: visit(9).id,  fromLocationType: "slot",    fromLocationId: slot("A-07").id,      fromLocationName: "A-07",             toLocationType: "dock",  toLocationId: door("D-09").id,          toLocationName: "Door D-09",   moveType: "slot_to_dock",  priority: "normal", status: "assigned",    assignedTo: "demo-yj-003", notes: "XPO live load to D-09 — load crew confirmed ready",                               createdBy: "demo-ym-001", createdAt: minutesAgo(35) },
    { visitId: visit(10).id, fromLocationType: "slot",    fromLocationId: slot("A-08").id,      fromLocationName: "A-08",             toLocationType: "dock",  toLocationId: door("D-10").id,          toLocationName: "Door D-10",   moveType: "slot_to_dock",  priority: "normal", status: "assigned",    assignedTo: "demo-yj-004", notes: "Unscheduled Nexus Express to D-10 — priority queue",                               createdBy: "demo-ym-002", createdAt: minutesAgo(40) },

    // Accepted — jockeys acknowledged
    { visitId: visit(7).id,  fromLocationType: "slot",    fromLocationId: slot("R-02").id,      fromLocationName: "R-02",             toLocationType: "dock",  toLocationId: door("D-07").id,          toLocationName: "Door D-07",   moveType: "slot_to_dock",  priority: "normal", status: "accepted",    assignedTo: "demo-yj-001", acceptedAt: minutesAgo(10), notes: "Estes reefer to D-07 for inspection — acknowledged by Tommy",                    createdBy: "demo-ym-001", createdAt: minutesAgo(35) },
    { visitId: visit(25).id, fromLocationType: "slot",    fromLocationId: slot("R-03").id,      fromLocationName: "R-03",             toLocationType: "dock",  toLocationId: door("D-08").id,          toLocationName: "Door D-08",   moveType: "slot_to_dock",  priority: "normal", status: "accepted",    assignedTo: "demo-yj-002", acceptedAt: minutesAgo(8),  notes: "Schneider reefer 2 to D-08 — pharma load, DeShawn en route",                    createdBy: "demo-ym-002", createdAt: minutesAgo(30) },

    // In-progress — currently executing
    { visitId: visit(18).id, fromLocationType: "slot",    fromLocationId: slot("B-01").id,      fromLocationName: "B-01",             toLocationType: "gate",  toLocationId: insertedGates[2].id,      toLocationName: "Gate 3 - Outbound", moveType: "slot_to_gate", priority: "normal", status: "in_progress", assignedTo: "demo-yj-001", acceptedAt: minutesAgo(18), startedAt: minutesAgo(12), notes: "Move empty Werner trailer to exit gate — driver waiting",                        createdBy: "demo-ym-001", createdAt: minutesAgo(28) },
    { visitId: visit(19).id, fromLocationType: "slot",    fromLocationId: null,                 fromLocationName: "Gate Out Area",    toLocationType: "gate",  toLocationId: insertedGates[2].id,      toLocationName: "Gate 3 - Outbound", moveType: "slot_to_gate", priority: "normal", status: "in_progress", assignedTo: "demo-yj-002", acceptedAt: minutesAgo(22), startedAt: minutesAgo(14), notes: "Move Nexus eCommerce ready-out to exit — Jose trailing with spotter",              createdBy: "demo-ym-001", createdAt: minutesAgo(32) },
    { visitId: visit(27).id, fromLocationType: "slot",    fromLocationId: slot("C-01").id,      fromLocationName: "C-01",             toLocationType: "slot",  toLocationId: slot("C-05").id,          toLocationName: "C-05",        moveType: "reposition",    priority: "low",    status: "in_progress", assignedTo: "demo-yj-004", acceptedAt: minutesAgo(16), startedAt: minutesAgo(10), notes: "Reposition aged storage trailer to free C-01 for incoming parcel run",           createdBy: "demo-ym-002", createdAt: minutesAgo(25) },

    // Escalated
    { visitId: visit(1).id,  fromLocationType: "gate",    fromLocationId: insertedGates[0].id,  fromLocationName: "Gate 1 - Main",    toLocationType: "slot",  toLocationId: slot("A-13").id,          toLocationName: "A-13",        moveType: "gate_to_slot",  priority: "high",   status: "escalated",   assignedTo: "demo-yj-002", notes: "ESCALATED: Werner DOC HOLD — park isolated A-13, supervisor alerted, do NOT dock", createdBy: "demo-ym-001", createdAt: hoursAgo(2,5) },

    // Completed
    { visitId: visit(33).id, fromLocationType: "dock",    fromLocationId: door("D-01").id,      fromLocationName: "Door D-01",        toLocationType: "gate",  toLocationId: insertedGates[2].id,      toLocationName: "Gate 3 - Outbound", moveType: "dock_to_gate", priority: "normal", status: "completed",   assignedTo: "demo-yj-001", acceptedAt: hoursAgo(5,5), startedAt: hoursAgo(5), completedAt: hoursAgo(4,5), notes: "Completed — NXSU-531000 exited", createdBy: "demo-ym-001", createdAt: hoursAgo(6) },
    { visitId: visit(34).id, fromLocationType: "dock",    fromLocationId: door("D-03").id,      fromLocationName: "Door D-03",        toLocationType: "slot",  toLocationId: slot("B-05").id,          toLocationName: "B-05",        moveType: "dock_to_yard",  priority: "normal", status: "completed",   assignedTo: "demo-yj-002", acceptedAt: hoursAgo(3), startedAt: hoursAgo(2,8), completedAt: hoursAgo(2,5), notes: "Returned SNDR reefer to yard after unload", createdBy: "demo-du-001", source: "dock_request", createdAt: hoursAgo(3,5) },
    { visitId: visit(27).id, fromLocationType: "gate",    fromLocationId: insertedGates[0].id,  fromLocationName: "Gate 1 - Main",    toLocationType: "slot",  toLocationId: slot("C-01").id,          toLocationName: "C-01",        moveType: "gate_to_slot",  priority: "low",    status: "completed",   assignedTo: "demo-yj-001", acceptedAt: hoursAgo(28), startedAt: hoursAgo(27,5), completedAt: hoursAgo(27), notes: "Parked aged storage trailer on arrival", createdBy: "demo-gg-002", source: "gate", createdAt: hoursAgo(29) },
    { visitId: visit(11).id, fromLocationType: "dock",    fromLocationId: door("D-05").id,      fromLocationName: "Door D-05",        toLocationType: "slot",  toLocationId: slot("B-06").id,          toLocationName: "B-06",        moveType: "dock_to_yard",  priority: "normal", status: "completed",   assignedTo: "demo-yj-003", acceptedAt: hoursAgo(3), startedAt: hoursAgo(2,7), completedAt: hoursAgo(2,2), notes: "Nexus supply chain moved from dock to staging",      createdBy: "demo-du-002", source: "dock_request", createdAt: hoursAgo(3,5) },

    // Rejected
    { visitId: visit(13).id, fromLocationType: "dock",    fromLocationId: door("D-04").id,      fromLocationName: "Door D-04",        toLocationType: "slot",  toLocationId: slot("B-07").id,          toLocationName: "B-07",        moveType: "dock_to_yard",  priority: "normal", status: "rejected",    assignedTo: "demo-yj-001", rejectionReason: "Dock D-04 crew not finished — trailer still spotted, cannot pull", notes: "Move Nexus Express from D-04 to yard", createdBy: "demo-du-001", source: "dock_request", createdAt: hoursAgo(2) },
  ]);

  // ── Exceptions ────────────────────────────────────────────────────────────────
  await db.insert(exceptions).values([
    { visitId: visit(1).id,  type: "documentation_hold",  severity: "medium",   description: "Walk-in Werner trailer WERN-494100 missing Bill of Lading. Driver has no copy; carrier dispatch contacted. Ticket #DOC-2026-0714 raised.",                                                    status: "open",     createdBy: "demo-gg-001" },
    { visitId: visit(2).id,  type: "security_hold",       severity: "high",     description: "Random Nexus CBP/TSA screening selected for SWFT-220200. Agricultural inspection required — K-9 unit ETA 45 minutes. Trailer isolated at gate.",                                              status: "open",     assignedTo: "demo-ym-001", createdBy: "demo-gg-003" },
    { visitId: visit(21).id, type: "security_hold",       severity: "high",     description: "Random security screening selected for NXSU-535000 inbound from ORD. Agricultural hold auto-flagged by Nexus system. Inspector en route.",                                                     status: "open",     assignedTo: "demo-ym-001", createdBy: "demo-gg-001" },
    { visitId: visit(22).id, type: "damage_hold",         severity: "medium",   description: "Rear door hinge bent on NXSU-493300 arriving from CVG. Right door does not seal flush — risk of moisture. Photos documented at check-in gate (14 images). Fleet notified.",               status: "open",     createdBy: "demo-gg-002" },
    { visitId: visit(23).id, type: "customs_hold",        severity: "critical", description: "NXSU-615700 contains bonded international freight (DGF). CBP Form 7501 pending — filing submitted 09:42, CBP review ETA 4–6 hours. CANNOT unload or move until CBP releases. Bond #2026-CMH-0714.", status: "open", assignedTo: "demo-ym-001", createdBy: "demo-gg-001" },
    { visitId: visit(24).id, type: "seal_mismatch",       severity: "high",     description: "Seal on trailer SNDR-R42010 reads SL-557810 but BOL shows SL-557701. Chain-of-custody discrepancy — Schneider dispatch contacted. Waiting for driver affidavit. Contents cannot be verified without supervisor approval.", status: "open", assignedTo: "demo-ym-002", createdBy: "demo-gg-003" },
    { visitId: visit(25).id, type: "documentation_hold",  severity: "medium",   description: "Nexus Freight NXSU-325000 missing HAWB for 3 HU pieces. Freight forwarder (DGF CMH team) contacted — document ETA 30 minutes. Hold placed to prevent premature unload.",                       status: "open",     createdBy: "demo-gg-002" },
    { visitId: visit(30).id, type: "damage_hold",         severity: "medium",   description: "Werner WERN-441000 has buckled side panel (driver-side, mid-body) — reported by gate guard on arrival 26h ago. Werner insurance claim #CLM-WE-2026-0714 filed. Adjuster scheduled tomorrow.",  status: "open",     assignedTo: "demo-ym-002", createdBy: "demo-gg-002" },
    { visitId: visit(31).id, type: "customs_hold",        severity: "critical", description: "NXSU-055100 contains DGR Class 3 flammable liquids (UN1263). Customs import permit under review, MSDS on file. Trailer must remain in HAZ zone — no move orders without supervisor + CBP sign-off.", status: "open", assignedTo: "demo-ym-001", createdBy: "demo-gg-001" },
    { visitId: visit(28).id, type: "dwell_alert",         severity: "medium",   description: "Empty trailer NXSU-538800 has exceeded 36-hour dwell in network pool (C-02). Alert auto-generated by YMS dwell monitor. Dispatch has been notified to schedule pickup or assign outbound build.",  status: "open",   assignedTo: "demo-ym-002", createdBy: "demo-ym-001" },
    { visitId: visit(7).id,  type: "unconfirmed_location", severity: "low",     description: "Physical location of EXLA-R19503 not confirmed since slot R-02 assignment. Last yard scan 4.5 hours ago. Jockey walkthrough scheduled next round (ETA 20 min).",                               status: "open",     createdBy: "demo-ym-001" },
    { visitId: visit(8).id,  type: "unconfirmed_location", severity: "low",     description: "JBHU-832145 in staging area — physical location not confirmed, jockey DeShawn dispatched to park and confirm slot.",                                                                           status: "open",     createdBy: "demo-gg-001" },
    // Resolved
    { visitId: visit(33).id, type: "seal_mismatch",       severity: "medium",   description: "Previous seal exception on NXSU-531000 (check-in seal read vs AWB). Confirmed admin entry error by driver — AWB updated.", status: "resolved", resolvedBy: "demo-ym-001", resolutionNotes: "Driver confirmed correct seal. Records corrected by ym-001 at 11:32.", createdBy: "demo-gg-001", resolvedAt: hoursAgo(6) },
    { visitId: visit(34).id, type: "documentation_hold",  severity: "low",      description: "Schneider SNDR-R05540 originally arrived without signed delivery receipt. Carrier faxed documents within 1 hour, hold released.",                                                              status: "resolved", resolvedBy: "demo-ym-002", resolutionNotes: "Documents received and verified by a.fernandez.", createdBy: "demo-gg-002", resolvedAt: hoursAgo(4) },
    { visitId: visit(35).id, type: "damage_hold",         severity: "medium",   description: "J.B. Hunt JBHU-830100 arrived with broken tail light. Carrier notified, repair approved — portable light bar fitted by JBH roadside team.", status: "resolved", resolvedBy: "demo-ym-001", resolutionNotes: "Roadside repair completed at 10:15. Photos on file. Cleared for departure.", createdBy: "demo-gg-003", resolvedAt: hoursAgo(9) },
  ]);

  // ── Audit logs ────────────────────────────────────────────────────────────────
  const auditEntries: Array<{ action: string; entityType: string; entityId: number; userId: string; userName: string; details: Record<string, unknown> }> = [];
  for (let i = 0; i < insertedVisits.length; i++) {
    const v = insertedVisits[i];
    const guardId = v.checkInBy || "demo-gg-001";
    const guardName = guardId === "demo-gg-001" ? "Maria Gonzalez" : guardId === "demo-gg-002" ? "Jamal Williams" : "Priya Sharma";
    auditEntries.push({ action: "gate_check_in", entityType: "visit", entityId: v.id, userId: guardId, userName: guardName, details: { visitNumber: v.visitNumber, trailerNumber: v.trailerNumber, truckNumber: v.truckNumber, trailerClass: v.trailerClass, ownerType: v.ownerType } });
  }
  for (const v of insertedVisits.filter(x => x.visitStatus === "closed")) {
    auditEntries.push({ action: "gate_check_out", entityType: "visit", entityId: v.id, userId: v.checkInBy || "demo-gg-001", userName: "Maria Gonzalez", details: { visitNumber: v.visitNumber } });
  }
  auditEntries.push(
    { action: "slot_assigned",         entityType: "visit",         entityId: visit(3).id,  userId: "demo-ym-001",    userName: "Robert Chen",      details: { slotId: slot("A-01").id, slotNumber: "A-01" } },
    { action: "slot_assigned",         entityType: "visit",         entityId: visit(4).id,  userId: "demo-ym-001",    userName: "Robert Chen",      details: { slotId: slot("R-01").id, slotNumber: "R-01" } },
    { action: "slot_assigned",         entityType: "visit",         entityId: visit(5).id,  userId: "demo-ym-001",    userName: "Robert Chen",      details: { slotId: slot("A-02").id, slotNumber: "A-02" } },
    { action: "dock_assigned",         entityType: "visit",         entityId: visit(11).id, userId: "demo-ym-001",    userName: "Robert Chen",      details: { dockDoorId: door("D-01").id, doorNumber: "D-01" } },
    { action: "dock_start_unloading",  entityType: "visit",         entityId: visit(11).id, userId: "demo-du-001",    userName: "Lisa Park",        details: { action: "start_unloading", note: "Mail sort line active" } },
    { action: "dock_assigned",         entityType: "visit",         entityId: visit(12).id, userId: "demo-ym-001",    userName: "Robert Chen",      details: { dockDoorId: door("D-02").id, doorNumber: "D-02" } },
    { action: "dock_start_loading",    entityType: "visit",         entityId: visit(12).id, userId: "demo-du-001",    userName: "Lisa Park",        details: { action: "start_loading", note: "Outbound IND build" } },
    { action: "dock_assigned",         entityType: "visit",         entityId: visit(15).id, userId: "demo-ym-002",    userName: "Alicia Fernandez", details: { dockDoorId: door("D-06").id, doorNumber: "D-06" } },
    { action: "dock_start_unloading",  entityType: "visit",         entityId: visit(15).id, userId: "demo-du-002",    userName: "Kevin O'Malley",   details: { action: "start_unloading", note: "Werner live unload" } },
    { action: "seal_recorded",         entityType: "visit",         entityId: visit(3).id,  userId: "demo-gg-001",    userName: "Maria Gonzalez",   details: { sealNumber: visit(3).sealNumber, eventType: "inspection" } },
    { action: "seal_recorded",         entityType: "visit",         entityId: visit(23).id, userId: "demo-ym-001",    userName: "Robert Chen",      details: { sealNumber: visit(23).sealNumber, eventType: "inspection" } },
    { action: "hold_placed",           entityType: "visit",         entityId: visit(1).id,  userId: "demo-gg-001",    userName: "Maria Gonzalez",   details: { holdType: "documentation_hold", reason: "Missing BOL" } },
    { action: "hold_placed",           entityType: "visit",         entityId: visit(23).id, userId: "demo-gg-001",    userName: "Maria Gonzalez",   details: { holdType: "customs_hold",        reason: "Form 7501 pending" } },
    { action: "hold_placed",           entityType: "visit",         entityId: visit(21).id, userId: "demo-gg-001",    userName: "Maria Gonzalez",   details: { holdType: "security_hold",       reason: "Random screening" } },
    { action: "exception_resolved",    entityType: "exception",     entityId: 13,           userId: "demo-ym-001",    userName: "Robert Chen",      details: { resolutionNotes: "Seal confirmed correct by driver" } },
    { action: "dwell_threshold_updated",entityType:"dwell_threshold",entityId: 1,           userId: "demo-admin-001", userName: "Sandra Mitchell",  details: { trailerClass: "internal_network", warningHours: 4, alertHours: 12 } },
    { action: "move_task_escalated",   entityType: "move_task",     entityId: 17,           userId: "demo-ym-001",    userName: "Robert Chen",      details: { reason: "Werner DOC hold — isolated parking required" } },
    { action: "virtual_move_initiated",entityType: "visit",         entityId: visit(7).id,  userId: "demo-ym-002",    userName: "Alicia Fernandez", details: { reason: "Unconfirmed location — audit mismatch, jockey dispatched" } },
    { action: "config_updated",        entityType: "ai_config",     entityId: 1,            userId: "demo-admin-001", userName: "Sandra Mitchell",  details: { change: "enabled predictive ops and proactive alerts" } },
  );
  await db.insert(auditLogs).values(auditEntries);

  // ── Inspections ───────────────────────────────────────────────────────────────
  await db.insert(inspections).values([
    {
      visitId: visit(3).id, inspectionType: "gate_inbound", trailerNumber: visit(3).trailerNumber, carrierName: "Nexus Express",
      currentLocation: "Inbound Staging A-01", equipmentType: "dry_van", sealNumber: visit(3).sealNumber,
      result: "passed",
      checklist: { groups: [
        { name: "Exterior", items: [{ label: "Roof condition", status: "pass" },{ label: "Side panels", status: "pass" },{ label: "Rear doors", status: "pass" },{ label: "Landing gear", status: "pass" }] },
        { name: "Safety",   items: [{ label: "Lights operational", status: "pass" },{ label: "Reflective tape", status: "pass" },{ label: "Mud flaps", status: "pass" }] },
        { name: "Seal",     items: [{ label: "Seal intact", status: "pass" },{ label: "Seal number matches BOL", status: "pass" }] },
      ]},
      remarks: "Nexus Express inbound cleared. Seal verified against AWB-NXS-90101. Good condition throughout.", inspectorId: "demo-gg-001", inspectorName: "Maria Gonzalez", submittedAt: hoursAgo(8),
    },
    {
      visitId: visit(22).id, inspectionType: "damage_assessment", trailerNumber: visit(22).trailerNumber, carrierName: "Nexus Supply Chain",
      currentLocation: "Inbound Staging A-05", equipmentType: "dry_van", result: "failed", issueSeverity: "medium",
      checklist: { groups: [
        { name: "Exterior", items: [{ label: "Roof condition", status: "pass" },{ label: "Side panels", status: "pass" },{ label: "Rear doors", status: "fail", notes: "Right door hinge bent, does not close flush — gap ~1.5 inches" }] },
        { name: "Safety",   items: [{ label: "Lights operational", status: "pass" },{ label: "Reflective tape", status: "pass" }] },
        { name: "Interior", items: [{ label: "Floor condition", status: "pass" },{ label: "Wall condition", status: "pass" },{ label: "Odor/contamination", status: "pass" }] },
      ]},
      remarks: "Rear door hinge damaged — right door gap 1.5 in. Moisture risk if raining. Fleet notified. 14 photos on file. Carrier claim initiated.",
      inspectorId: "demo-gg-002", inspectorName: "Jamal Williams", submittedAt: hoursAgo(4),
    },
    {
      visitId: visit(11).id, inspectionType: "yard_spot_check", trailerNumber: visit(11).trailerNumber, carrierName: "Nexus Supply Chain",
      currentLocation: "Dock Door D-01", equipmentType: "dry_van", result: "passed",
      checklist: { groups: [
        { name: "Dock Check", items: [{ label: "Trailer secured at dock", status: "pass" },{ label: "Wheel chocks in place", status: "pass" },{ label: "Dock leveler engaged", status: "pass" }] },
        { name: "Load",       items: [{ label: "Load condition acceptable", status: "pass" },{ label: "No shifting cargo", status: "pass" }] },
      ]},
      remarks: "Dock spot check passed. Mail unload proceeding normally at 72% completion.", inspectorId: "demo-du-001", inspectorName: "Lisa Park", submittedAt: hoursAgo(2),
    },
    {
      visitId: visit(4).id, inspectionType: "gate_inbound", trailerNumber: visit(4).trailerNumber, carrierName: "Schneider National",
      currentLocation: "Cold Chain Yard R-01", equipmentType: "reefer", sealNumber: visit(4).sealNumber,
      result: "passed_with_notes",
      checklist: { groups: [
        { name: "Reefer Unit", items: [{ label: "Unit running on arrival", status: "pass" },{ label: "Set point verified (34°F)", status: "pass" },{ label: "Actual temp on arrival (34°F)", status: "pass" },{ label: "Fuel level (>1/4 tank)", status: "pass" }] },
        { name: "Exterior",    items: [{ label: "Roof/walls sealed", status: "pass" },{ label: "Rear doors closed flush", status: "pass" }] },
        { name: "Seal",        items: [{ label: "Seal intact", status: "pass" },{ label: "Seal matches BOL", status: "pass" }] },
      ]},
      remarks: "Reefer approved. Temp 34°F matches set point. NOTE: reefer unit fuel at 28% — carrier notified to top off before next leg. Continuous temp monitor linked.",
      inspectorId: "demo-gg-002", inspectorName: "Jamal Williams", submittedAt: hoursAgo(6),
    },
    {
      visitId: visit(24).id, inspectionType: "gate_inbound", trailerNumber: visit(24).trailerNumber, carrierName: "Schneider National",
      currentLocation: "Cold Chain Yard R-03", equipmentType: "reefer", sealNumber: "SL-557810",
      result: "failed", issueSeverity: "high",
      checklist: { groups: [
        { name: "Reefer Unit", items: [{ label: "Unit running on arrival", status: "pass" },{ label: "Set point verified (35°F)", status: "pass" },{ label: "Actual temp on arrival (35°F)", status: "pass" }] },
        { name: "Seal",        items: [{ label: "Seal intact", status: "pass" },{ label: "Seal matches BOL", status: "fail", notes: "Trailer seal SL-557810 does not match BOL SL-557701" }] },
      ]},
      remarks: "FAILED — seal mismatch detected at gate. Trailer seal SL-557810 vs BOL SL-557701. Chain-of-custody exception raised. Supervisor notified immediately. Driver has no explanation.",
      inspectorId: "demo-gg-003", inspectorName: "Priya Sharma", submittedAt: hoursAgo(3),
    },
    {
      visitId: visit(31).id, inspectionType: "gate_inbound", trailerNumber: visit(31).trailerNumber, carrierName: "Nexus Global Forwarding",
      currentLocation: "Hazmat Isolation H-01", equipmentType: "dry_van", sealNumber: visit(31).sealNumber,
      result: "passed_with_notes",
      checklist: { groups: [
        { name: "DGR Compliance", items: [{ label: "MSDS available", status: "pass" },{ label: "Class 3 placards displayed", status: "pass" },{ label: "Quantity within permit limits", status: "pass" },{ label: "Emergency contact on doc", status: "pass" }] },
        { name: "Containment",    items: [{ label: "No visible leaks", status: "pass" },{ label: "Secondary containment intact", status: "pass" }] },
      ]},
      remarks: "DGR cleared at gate. Moved to HAZ zone per SOPs. NOTE: customs import permit under active review — cannot unload until CBP releases. MSDS file ref CMH-HAZ-2026-0714.",
      inspectorId: "demo-gg-001", inspectorName: "Maria Gonzalez", submittedAt: hoursAgo(5),
    },
    {
      visitId: visit(12).id, inspectionType: "dock_inspection", trailerNumber: visit(12).trailerNumber, carrierName: "Nexus eCommerce",
      currentLocation: "Dock Door D-02", equipmentType: "dry_van",
      result: "passed",
      checklist: { groups: [
        { name: "Load Integrity", items: [{ label: "No damaged parcels visible", status: "pass" },{ label: "Weight distribution even", status: "pass" },{ label: "Load matches manifest count", status: "pass" }] },
        { name: "Dock Safety",    items: [{ label: "Chocks in place", status: "pass" },{ label: "Leveler seated", status: "pass" }] },
      ]},
      remarks: "D-02 loading inspection passed. Parcel count matches manifest (1,847 pieces). Loading 55% complete — ETA departure 16:30.", inspectorId: "demo-du-001", inspectorName: "Lisa Park", submittedAt: hoursAgo(1),
    },
    {
      visitId: visit(30).id, inspectionType: "damage_assessment", trailerNumber: visit(30).trailerNumber, carrierName: "Werner Enterprises",
      currentLocation: "Outbound Staging B-03", equipmentType: "dry_van", sealNumber: visit(30).sealNumber,
      result: "failed", issueSeverity: "medium",
      checklist: { groups: [
        { name: "Exterior", items: [{ label: "Roof condition", status: "pass" },{ label: "Driver-side panel (mid)", status: "fail", notes: "Buckled inward ~3 inches, likely dock impact on previous run" },{ label: "Curb-side panel", status: "pass" },{ label: "Rear doors", status: "pass" }] },
        { name: "Interior", items: [{ label: "Floor condition", status: "pass" },{ label: "Interior walls", status: "pass" }] },
      ]},
      remarks: "Side panel damage documented — 26h into dwell. Werner claim #CLM-WE-2026-0714 filed. Insurance adjuster scheduled 07/11. Trailer remains on damage hold — cannot dispatch.",
      inspectorId: "demo-gg-002", inspectorName: "Jamal Williams", submittedAt: hoursAgo(24),
    },
  ]);

  // ── Yard audit items ──────────────────────────────────────────────────────────
  await db.insert(yardAuditItems).values([
    { visitId: visit(3).id,  trailerNumber: visit(3).trailerNumber,  systemLocation: "A-01", systemSlotId: slot("A-01").id, physicalLocation: "A-01", physicalSlotId: slot("A-01").id, auditResult: "matched",    notes: "Physical confirmed A-01 — matches system.",                              auditedBy: "demo-yj-001", auditedByName: "Tommy Kowalski",  reconciledAt: hoursAgo(3) },
    { visitId: visit(7).id,  trailerNumber: visit(7).trailerNumber,  systemLocation: "R-02", systemSlotId: slot("R-02").id, physicalLocation: "R-04", physicalSlotId: slot("R-04").id, auditResult: "mismatched", notes: "Trailer found R-04, system shows R-02. Awaiting supervisor before correcting.", virtualMoveReason: "audit_mismatch", virtualMoveNotes: "Pending supervisor confirmation of physical find.", auditedBy: "demo-yj-002", auditedByName: "DeShawn Carter" },
    { visitId: visit(27).id, trailerNumber: visit(27).trailerNumber, systemLocation: "C-01", systemSlotId: slot("C-01").id, physicalLocation: "C-01", physicalSlotId: slot("C-01").id, auditResult: "matched",    notes: "Aged storage trailer confirmed in place C-01.",                          auditedBy: "demo-yj-003", auditedByName: "Jose Martinez",  reconciledAt: hoursAgo(6) },
    { visitId: visit(28).id, trailerNumber: visit(28).trailerNumber, systemLocation: "C-02", systemSlotId: slot("C-02").id, physicalLocation: "C-02", physicalSlotId: slot("C-02").id, auditResult: "matched",    notes: "Empty NXSU-538800 confirmed C-02, dwell alert active.",                  auditedBy: "demo-yj-004", auditedByName: "Brendan Walsh",  reconciledAt: hoursAgo(2) },
    { visitId: visit(23).id, trailerNumber: visit(23).trailerNumber, systemLocation: "A-06", systemSlotId: slot("A-06").id, physicalLocation: "A-06", physicalSlotId: slot("A-06").id, auditResult: "matched",    notes: "Customs hold trailer confirmed in A-06. Customs seal intact.",           auditedBy: "demo-yj-001", auditedByName: "Tommy Kowalski", reconciledAt: hoursAgo(8) },
    { visitId: visit(31).id, trailerNumber: visit(31).trailerNumber, systemLocation: "H-01", systemSlotId: slot("H-01").id, physicalLocation: "H-01", physicalSlotId: slot("H-01").id, auditResult: "matched",    notes: "HAZ zone Class 3 DGR confirmed isolated in H-01.",                      auditedBy: "demo-gg-001", auditedByName: "Maria Gonzalez", reconciledAt: hoursAgo(4) },
    { visitId: visit(8).id,  trailerNumber: visit(8).trailerNumber,  systemLocation: "Staging", systemSlotId: null,         physicalLocation: null,   physicalSlotId: null,            auditResult: "missing",    notes: "JBHU-832145 in staging — jockey dispatched but slot not yet confirmed. Record pending.", auditedBy: "demo-yj-002", auditedByName: "DeShawn Carter" },
  ]);

  // ── RBAC ──────────────────────────────────────────────────────────────────────
  const systemRoles = [
    { roleName: "Yard Admin",       roleDescription: "Full system access and configuration",        roleLevel: 100, isSystem: true },
    { roleName: "Yard Supervisor",  roleDescription: "Operational oversight and task assignments",   roleLevel: 80,  isSystem: true },
    { roleName: "Gate Operator",    roleDescription: "Gate check-in and check-out operations only",  roleLevel: 60,  isSystem: true },
    { roleName: "Dock Operator",    roleDescription: "Dock door management and ready-to-go actions", roleLevel: 60,  isSystem: true },
    { roleName: "Yard Marshal",     roleDescription: "Yard slot assignment and move task execution",  roleLevel: 50,  isSystem: true },
    { roleName: "Carrier User",     roleDescription: "Appointment visibility and status tracking",    roleLevel: 20,  isSystem: true },
  ];
  const insertedRoles = await db.insert(roles).values(systemRoles).onConflictDoNothing().returning();
  const role = (name: string) => insertedRoles.find(r => r.roleName === name)!;

  const moduleList = [
    { moduleName: "appointments", actionName: "access", description: "Appointment scheduling and management" },
    { moduleName: "gate",         actionName: "access", description: "Gate check-in and check-out operations" },
    { moduleName: "dock",         actionName: "access", description: "Dock door assignment and management" },
    { moduleName: "yard_slot",    actionName: "access", description: "Yard slot assignment and management" },
    { moduleName: "move",         actionName: "access", description: "Yard move task creation and execution" },
    { moduleName: "hold",         actionName: "access", description: "Hold placement and removal approval" },
    { moduleName: "ready_to_go",  actionName: "access", description: "Ready-to-go approval and dispatch" },
    { moduleName: "reports",      actionName: "access", description: "Reports and analytics access" },
    { moduleName: "user_mgmt",    actionName: "access", description: "User account management" },
    { moduleName: "role_mgmt",    actionName: "access", description: "Role and permission configuration" },
  ];
  const insertedPerms = await db.insert(permissions).values(moduleList).onConflictDoNothing().returning();
  const perm = (mod: string) => insertedPerms.find(p => p.moduleName === mod)!;

  type P = { canView: boolean; canCreate: boolean; canModify: boolean; canExecute: boolean; canApprove: boolean };
  const ALL: P  = { canView: true,  canCreate: true,  canModify: true,  canExecute: true,  canApprove: true  };
  const VIEW: P = { canView: true,  canCreate: false, canModify: false, canExecute: false, canApprove: false };
  const NONE: P = { canView: false, canCreate: false, canModify: false, canExecute: false, canApprove: false };
  const VC: P   = { canView: true,  canCreate: true,  canModify: false, canExecute: false, canApprove: false };
  const VCM: P  = { canView: true,  canCreate: true,  canModify: true,  canExecute: false, canApprove: false };
  const VCME: P = { canView: true,  canCreate: true,  canModify: true,  canExecute: true,  canApprove: false };
  const VME: P  = { canView: true,  canCreate: false, canModify: true,  canExecute: true,  canApprove: false };
  const VE: P   = { canView: true,  canCreate: false, canModify: false, canExecute: true,  canApprove: false };

  const rbacMatrix: Array<{ roleId: number; permissionId: number } & P> = [];
  function addPerms(roleName: string, entries: Record<string, P>) {
    const r = role(roleName); if (!r) return;
    for (const [mod, p] of Object.entries(entries)) {
      const pm = perm(mod); if (!pm) continue;
      rbacMatrix.push({ roleId: r.id, permissionId: pm.id, ...p });
    }
  }
  addPerms("Yard Admin",      { appointments: ALL,  gate: ALL,  dock: ALL,  yard_slot: ALL,  move: ALL,  hold: ALL,  ready_to_go: ALL,  reports: ALL,  user_mgmt: ALL,  role_mgmt: ALL  });
  addPerms("Yard Supervisor", { appointments: ALL,  gate: ALL,  dock: ALL,  yard_slot: ALL,  move: ALL,  hold: ALL,  ready_to_go: ALL,  reports: VIEW, user_mgmt: VIEW, role_mgmt: VIEW });
  addPerms("Gate Operator",   { appointments: VIEW, gate: VCME, dock: VIEW, yard_slot: VIEW, move: VIEW, hold: VC,   ready_to_go: VIEW, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  addPerms("Dock Operator",   { appointments: VIEW, gate: VIEW, dock: VCM,  yard_slot: VIEW, move: VC,   hold: VIEW, ready_to_go: VE,   reports: VIEW, user_mgmt: NONE, role_mgmt: NONE });
  addPerms("Yard Marshal",    { appointments: VIEW, gate: VIEW, dock: VIEW, yard_slot: VME,  move: VME,  hold: VIEW, ready_to_go: VIEW, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  addPerms("Carrier User",    { appointments: VIEW, gate: NONE, dock: NONE, yard_slot: NONE, move: NONE, hold: NONE, ready_to_go: NONE, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  if (rbacMatrix.length > 0) await db.insert(rolePermissions).values(rbacMatrix).onConflictDoNothing();

  const roleKeyToName: Record<string, string> = { admin: "Yard Admin", yard_manager: "Yard Supervisor", gate_guard: "Gate Operator", dock_user: "Dock Operator", yard_jockey: "Yard Marshal", carrier: "Carrier User" };
  const userRoleEntries = demoUsers.map(u => {
    const roleName = roleKeyToName[u.role];
    const r = insertedRoles.find(ir => ir.roleName === roleName);
    if (!r) return null;
    return { userId: u.id, roleId: r.id, assignedBy: "demo-admin-001", isPrimary: true };
  }).filter(Boolean) as Array<{ userId: string; roleId: number; assignedBy: string; isPrimary: boolean }>;
  if (userRoleEntries.length > 0) await db.insert(userRoles).values(userRoleEntries).onConflictDoNothing();

  const activeCount = insertedVisits.filter(v => v.visitStatus !== "closed").length;
  const closedCount = insertedVisits.filter(v => v.visitStatus === "closed").length;
  console.log("Database seeded successfully with hyper-realistic Columbus Hub data!");
  console.log(`  - ${insertedCarriers.length} carriers (6 Nexus business units + 6 partners)`);
  console.log(`  - ${insertedZones.length} zones, ${slotsToCreate.length} slots, ${insertedDoors.length} dock doors, ${insertedGates.length} gates`);
  console.log(`  - ${demoAppointments.length} appointments (past/today/future)`);
  console.log(`  - ${insertedVisits.length} visits: ${activeCount} active, ${closedCount} closed/historical`);
  console.log(`  - ${sealRows.length} seal-history events`);
  console.log(`  - 4 dwell thresholds, 5 revenue rates, 1 AI config`);
  console.log(`  - 25 move tasks, 15 exceptions, 8 inspections, 7 yard-audit items`);
  console.log(`  - ${auditEntries.length} audit log entries`);
  console.log(`  - ${demoUsers.length} user profiles`);
}

// ── Additional demo facilities (multi-yard demo) ──────────────────────────────
// Adds two more distinctly-themed yards alongside the Columbus hub above so a
// super_admin can switch facilities and immediately see different carriers,
// yard layouts, and operational data. Reuses the same tables/relations and
// resolveFacilityScope() plumbing — no schema or API changes required.
interface FacilityTheme {
  name: string; code: string; city: string; state: string; timezone: string;
  carriers: Array<{ name: string; scacCode: string; contactName: string; contactEmail: string; contactPhone: string; address: string; brandColour: string }>;
  zones: Array<{ name: string; code: string; type: string; description: string }>;
  slotPlan: Array<{ zoneCode: string; prefix: string; count: number; slotType: string; slotSize: string; isReefer: boolean; isHazmat: boolean }>;
  doors: Array<{ doorNumber: string; compatibleType: string }>;
  gates: Array<{ name: string; type: string }>;
  personas: Array<{ id: string; firstName: string; lastName: string; email: string; role: string }>;
}

async function seedFacilityTheme(theme: FacilityTheme, seqOffset: number) {
  const [facility] = await db.insert(facilities).values({
    name: theme.name, code: theme.code, city: theme.city, state: theme.state, timezone: theme.timezone,
  }).returning();
  const facilityId = facility.id;

  const insertedCarriers = await db.insert(carriers).values(
    theme.carriers.map(r => ({ ...r, facilityId })),
  ).returning();
  const c = (scac: string) => insertedCarriers.find(x => x.scacCode === scac)!;

  const insertedZones = await db.insert(yardZones).values(
    theme.zones.map(r => ({ ...r, facilityId })),
  ).returning();
  const z = (code: string) => insertedZones.find(x => x.code === code)!;

  const slotsToCreate: Array<{ zoneId: number; slotNumber: string; slotType: string; slotSize: string; isReefer: boolean; isHazmat: boolean; gridRow: number; gridCol: number }> = [];
  for (const plan of theme.slotPlan) {
    for (let i = 1; i <= plan.count; i++) {
      slotsToCreate.push({
        zoneId: z(plan.zoneCode).id, slotNumber: `${plan.prefix}-${String(i).padStart(2, "0")}`,
        slotType: plan.slotType, slotSize: plan.slotSize, isReefer: plan.isReefer, isHazmat: plan.isHazmat,
        gridRow: Math.floor((i - 1) / 5), gridCol: (i - 1) % 5,
      });
    }
  }
  const insertedSlots = await db.insert(yardSlots).values(slotsToCreate.map(r => ({ ...r, facilityId }))).returning();
  const slot = (num: string) => insertedSlots.find(s => s.slotNumber === num)!;

  const insertedDoors = await db.insert(dockDoors).values(
    theme.doors.map(r => ({ ...r, status: "available", facilityId })),
  ).returning();
  const door = (num: string) => insertedDoors.find(d => d.doorNumber === num)!;

  const insertedGates = await db.insert(gates).values(
    theme.gates.map(r => ({ ...r, facilityId })),
  ).returning();

  for (const u of theme.personas) {
    await db.insert(users).values({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }).onConflictDoNothing();
    await db.insert(userProfiles).values({ userId: u.id, role: u.role, carrierId: null, facilityId }).onConflictDoNothing();
  }

  const scacs = theme.carriers.map(cc => cc.scacCode);
  const aptSeq0 = 5000 + seqOffset * 1000;
  let aptSeq = aptSeq0;
  const nextApt = () => `APT-${theme.code}-${aptSeq++}`;
  const movementTypes = ["inbound", "outbound", "live_load", "live_unload"];
  const loadTypes = ["dry", "reefer", "freight", "parcel"];
  const statuses = ["completed", "completed", "completed", "booked", "confirmed"];

  const demoAppointments = await db.insert(appointments).values(
    Array.from({ length: 12 }, (_, i) => {
      const scac = scacs[i % scacs.length];
      const dayOffset = i < 6 ? -(6 - i) : i - 6; // past 6, then today/future
      return {
        referenceNumber: nextApt(),
        carrierId: c(scac).id,
        scheduledDate: daysAgoAt(-dayOffset, 7 + (i % 6) * 2),
        timeWindowStart: `${String(7 + (i % 6) * 2).padStart(2, "0")}:00`,
        timeWindowEnd: `${String(9 + (i % 6) * 2).padStart(2, "0")}:00`,
        movementType: movementTypes[i % movementTypes.length],
        loadType: loadTypes[i % loadTypes.length],
        trailerNumber: `${scac}U-${(seqOffset * 100000) + i * 137}`,
        truckNumber: `${scac.slice(0, 2)}-${5000 + i}`,
        driverName: `Driver ${theme.code}-${i + 1}`,
        driverPhone: `(${200 + i}) 555-01${String(i).padStart(2, "0")}`,
        poNumber: `PO-${theme.code}-${1000 + i}`,
        bolNumber: `BOL-${theme.code}-${2000 + i}`,
        sealNumber: `SL-${theme.code}-${3000 + i}`,
        status: statuses[i % statuses.length],
        facilityId,
      };
    }),
  ).returning();
  const apt = (i: number) => demoAppointments[i];

  const gateGuardId = theme.personas.find(p => p.role === "gate_guard")?.id ?? theme.personas[0].id;
  const yardManagerId = theme.personas.find(p => p.role === "yard_manager")?.id ?? theme.personas[0].id;

  const availableSlotNumbers = slotsToCreate.map(s => s.slotNumber);
  const visitConfigs = [
    { statusKind: "gate" as const },
    { statusKind: "yard" as const, slot: availableSlotNumbers[0] },
    { statusKind: "yard" as const, slot: availableSlotNumbers[1] },
    { statusKind: "yard" as const, slot: availableSlotNumbers[2] },
    { statusKind: "dock" as const, door: theme.doors[0].doorNumber },
    { statusKind: "dock" as const, door: theme.doors[1]?.doorNumber ?? theme.doors[0].doorNumber },
    { statusKind: "yard" as const, slot: availableSlotNumbers[3] ?? availableSlotNumbers[0] },
    { statusKind: "closed" as const },
    { statusKind: "closed" as const },
    { statusKind: "hold" as const },
  ];

  const demoVisits = visitConfigs.map((cfg, i) => {
    const aptRow = apt(i % demoAppointments.length);
    const scac = scacs[i % scacs.length];
    const checkIn = cfg.statusKind === "closed" ? hoursAgo(20 - i) : hoursAgo(1 + i);
    const base = {
      visitNumber: `VST-${theme.code}${seqOffset}-${String(i + 1).padStart(4, "0")}`,
      appointmentId: aptRow?.id ?? null,
      carrierId: c(scac).id,
      driverName: `Driver ${theme.code}-${i + 1}`,
      driverLicense: `CDL-${theme.state}-${100000 + i}`,
      truckNumber: `${scac.slice(0, 2)}-${5000 + i}`,
      trailerNumber: `${scac}U-${(seqOffset * 100000) + i * 137}`,
      sealNumber: `SL-${theme.code}-${3000 + i}`,
      movementType: movementTypes[i % movementTypes.length],
      checkInBy: gateGuardId,
      trailerClass: "general",
      ownerType: "external",
      locationConfirmed: true,
      notes: null as string | null,
    };
    if (cfg.statusKind === "gate") {
      return { ...base, visitStatus: "checked_in", locationStatus: "at_gate_in", holdStatus: "none", currentSlotId: null, currentDockDoorId: null, checkInTime: checkIn, checkOutTime: null };
    }
    if (cfg.statusKind === "yard") {
      return { ...base, visitStatus: "in_yard", locationStatus: "in_yard_slot", holdStatus: "none", currentSlotId: slot(cfg.slot!).id, currentDockDoorId: null, checkInTime: checkIn, checkOutTime: null };
    }
    if (cfg.statusKind === "dock") {
      return { ...base, visitStatus: "unloading", locationStatus: "at_dock_door", holdStatus: "none", currentSlotId: null, currentDockDoorId: door(cfg.door!).id, checkInTime: checkIn, checkOutTime: null };
    }
    if (cfg.statusKind === "hold") {
      return { ...base, visitStatus: "in_yard", locationStatus: "in_yard_slot", holdStatus: "documentation_hold", currentSlotId: slot(availableSlotNumbers[4] ?? availableSlotNumbers[0]).id, currentDockDoorId: null, checkInTime: checkIn, checkOutTime: null, notes: `${theme.code} hold — missing paperwork, dispatch contacted` };
    }
    // closed
    return { ...base, visitStatus: "closed", locationStatus: "exited", holdStatus: "none", currentSlotId: null, currentDockDoorId: null, checkInTime: checkIn, checkOutTime: hoursAgo(20 - i - 2) };
  });

  const insertedVisits = await db.insert(visits).values(demoVisits.map(v => ({ ...v, facilityId }))).returning();

  for (const v of insertedVisits) {
    await db.insert(gateTransactions).values({ visitId: v.id, type: "check_in", gateId: insertedGates[0].id, userId: v.checkInBy });
    if (v.visitStatus === "closed") await db.insert(gateTransactions).values({ visitId: v.id, type: "check_out", gateId: insertedGates[insertedGates.length - 1].id, userId: v.checkInBy });
  }

  const visit = (i: number) => insertedVisits[i];

  // A handful of move tasks and one exception so the operational screens
  // (yard map, move queue, exceptions) aren't empty for this facility either.
  await db.insert(moveTasks).values([
    { visitId: visit(0).id, fromLocationType: "gate", fromLocationId: insertedGates[0].id, fromLocationName: insertedGates[0].name, toLocationType: "slot", toLocationId: slot(availableSlotNumbers[5] ?? availableSlotNumbers[0]).id, toLocationName: availableSlotNumbers[5] ?? availableSlotNumbers[0], moveType: "gate_to_slot", priority: "high", status: "open", notes: `${theme.name}: new arrival needs slot placement`, createdBy: yardManagerId, createdAt: minutesAgo(30) },
    { visitId: visit(1).id, fromLocationType: "slot", fromLocationId: slot(availableSlotNumbers[0]).id, fromLocationName: availableSlotNumbers[0], toLocationType: "dock", toLocationId: door(theme.doors[0].doorNumber).id, toLocationName: `Door ${theme.doors[0].doorNumber}`, moveType: "slot_to_dock", priority: "normal", status: "assigned", assignedTo: gateGuardId, notes: `${theme.name}: staged for dock`, createdBy: yardManagerId, createdAt: minutesAgo(45) },
  ]);

  await db.insert(exceptions).values([
    { visitId: visit(9).id, type: "documentation_hold", severity: "medium", description: `${theme.name}: trailer missing BOL, carrier dispatch contacted.`, status: "open", createdBy: gateGuardId },
  ]);

  console.log(`  - Seeded facility "${theme.name}" (${theme.code}): ${insertedCarriers.length} carriers, ${insertedZones.length} zones, ${slotsToCreate.length} slots, ${insertedDoors.length} doors, ${demoAppointments.length} appointments, ${insertedVisits.length} visits`);
}

export async function seedAdditionalFacilities() {
  const [existing] = await db.select({ c: count() }).from(facilities).where(eq(facilities.code, "DFW"));
  if (Number(existing.c) > 0) {
    console.log("Additional demo facilities already seeded, skipping.");
    return;
  }

  console.log("Seeding additional demo facilities (Dallas + Chicago) for multi-yard demo...");

  const dallas: FacilityTheme = {
    name: "Dallas–Fort Worth Gateway", code: "DFW", city: "Fort Worth", state: "TX", timezone: "America/Chicago",
    carriers: [
      { name: "Prime Inc.",            scacCode: "PRME", contactName: "Hannah Ruiz",     contactEmail: "dispatch@primeinc.com",   contactPhone: "(417) 866-2251", address: "2740 N Mayfair Ave, Springfield MO 65803", brandColour: "#7A1F2B" },
      { name: "Knight-Swift Transport",scacCode: "KNGT", contactName: "Derrick Osei",    contactEmail: "ops@knight-swift.com",    contactPhone: "(602) 269-2000", address: "2002 W Wahalla Ln, Phoenix AZ 85027",    brandColour: "#00539B" },
      { name: "CRST International",   scacCode: "CRST", contactName: "Belinda Cross",   contactEmail: "dispatch@crst.com",       contactPhone: "(319) 396-4000", address: "3930 16th Ave SW, Cedar Rapids IA 52404", brandColour: "#F2A900" },
      { name: "Border Express Logistics", scacCode: "BXPL", contactName: "Rafael Ibarra", contactEmail: "ops@borderexpress.com",  contactPhone: "(915) 555-0134", address: "1400 Airway Blvd, El Paso TX 79925",     brandColour: "#2E7D32" },
      { name: "Daylight Transport",    scacCode: "DYLT", contactName: "Susan Marsh",     contactEmail: "dispatch@daylighttrans.com", contactPhone: "(800) 723-5654", address: "13040 S Spring St, Los Angeles CA 90061", brandColour: "#F57C00" },
    ],
    zones: [
      { name: "Reefer / Produce Yard", code: "RFR-D", type: "reefer",  description: "Temperature-controlled parking for produce and cold-chain trailers" },
      { name: "Container Yard",        code: "CTR-D", type: "parking", description: "Intermodal container chassis parking" },
      { name: "General Staging",       code: "STG-D", type: "staging", description: "General inbound/outbound staging" },
    ],
    slotPlan: [
      { zoneCode: "RFR-D", prefix: "RD", count: 10, slotType: "reefer",   slotSize: "standard", isReefer: true,  isHazmat: false },
      { zoneCode: "CTR-D", prefix: "CD", count: 8,  slotType: "oversized", slotSize: "large",    isReefer: false, isHazmat: false },
      { zoneCode: "STG-D", prefix: "SD", count: 10, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false },
    ],
    doors: [
      { doorNumber: "DFW-01", compatibleType: "reefer" }, { doorNumber: "DFW-02", compatibleType: "reefer" },
      { doorNumber: "DFW-03", compatibleType: "all" },    { doorNumber: "DFW-04", compatibleType: "all" },
      { doorNumber: "DFW-05", compatibleType: "dry" },    { doorNumber: "DFW-06", compatibleType: "dry" },
    ],
    gates: [{ name: "Gate 1 - Main", type: "both" }, { name: "Gate 2 - Outbound", type: "out" }],
    personas: [
      { id: "demo-admin-dfw-001", firstName: "Marisol", lastName: "Trevino", email: "m.trevino@ymsnow.com", role: "admin" },
      { id: "demo-ym-dfw-001",    firstName: "Colton",  lastName: "Baird",   email: "c.baird@ymsnow.com",   role: "yard_manager" },
      { id: "demo-gg-dfw-001",    firstName: "Esteban", lastName: "Salas",   email: "e.salas@ymsnow.com",   role: "gate_guard" },
    ],
  };

  const chicago: FacilityTheme = {
    name: "Chicago O'Hare Crossdock", code: "ORD", city: "Chicago", state: "IL", timezone: "America/Chicago",
    carriers: [
      { name: "FedEx Ground",        scacCode: "FDXG", contactName: "Denise Palmer",   contactEmail: "ops@fedex.com",       contactPhone: "(800) 463-3339", address: "1000 FedEx Dr, Moon Township PA 15108", brandColour: "#4D148C" },
      { name: "UPS Freight",         scacCode: "UPSF", contactName: "Grant Michaels",  contactEmail: "dispatch@ups.com",    contactPhone: "(800) 333-7400", address: "55 Glenlake Pkwy NE, Atlanta GA 30328",  brandColour: "#351C15" },
      { name: "Old Dominion Freight",scacCode: "ODFL", contactName: "Renee Castillo",  contactEmail: "ops@odfl.com",        contactPhone: "(800) 235-5569", address: "500 Old Dominion Way, Thomasville NC 27360", brandColour: "#005EB8" },
      { name: "Saia LTL Freight",    scacCode: "SAIA", contactName: "Kyle Patterson",  contactEmail: "dispatch@saia.com",   contactPhone: "(800) 765-7242", address: "11465 Johns Creek Pkwy, Johns Creek GA 30097", brandColour: "#003DA5" },
      { name: "ArcBest / ABF Freight", scacCode: "ABFS", contactName: "Monica Diaz",  contactEmail: "ops@arcb.com",         contactPhone: "(800) 610-5544", address: "8401 McClure Dr, Fort Smith AR 72916",  brandColour: "#E4002B" },
    ],
    zones: [
      { name: "Inbound Staging",  code: "STG-O", type: "staging", description: "Crossdock inbound staging" },
      { name: "Outbound Staging", code: "OUT-O", type: "staging", description: "Crossdock outbound build lanes" },
      { name: "Trailer Pool",     code: "PKG-O", type: "parking", description: "Empty and network trailer pool" },
    ],
    slotPlan: [
      { zoneCode: "STG-O", prefix: "SI", count: 8, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false },
      { zoneCode: "OUT-O", prefix: "SO", count: 8, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false },
      { zoneCode: "PKG-O", prefix: "PO", count: 6, slotType: "standard", slotSize: "standard", isReefer: false, isHazmat: false },
    ],
    doors: [
      { doorNumber: "ORD-01", compatibleType: "all" }, { doorNumber: "ORD-02", compatibleType: "all" },
      { doorNumber: "ORD-03", compatibleType: "all" }, { doorNumber: "ORD-04", compatibleType: "all" },
      { doorNumber: "ORD-05", compatibleType: "all" }, { doorNumber: "ORD-06", compatibleType: "all" },
      { doorNumber: "ORD-07", compatibleType: "dry" }, { doorNumber: "ORD-08", compatibleType: "dry" },
    ],
    gates: [{ name: "Gate 1 - Main", type: "both" }, { name: "Gate 2 - Outbound", type: "out" }],
    personas: [
      { id: "demo-admin-ord-001", firstName: "Wendell", lastName: "Ashford", email: "w.ashford@ymsnow.com", role: "admin" },
      { id: "demo-ym-ord-001",    firstName: "Bethany",  lastName: "Kowalczyk", email: "b.kowalczyk@ymsnow.com", role: "yard_manager" },
      { id: "demo-gg-ord-001",    firstName: "Marcus",   lastName: "Delgado", email: "m.delgado@ymsnow.com", role: "gate_guard" },
    ],
  };

  await seedFacilityTheme(dallas, 1);
  await seedFacilityTheme(chicago, 2);

  console.log("Additional demo facilities seeded.");
}

export async function seedRbacIfEmpty() {
  const [roleCount] = await db.select({ c: count() }).from(roles);
  if (Number(roleCount.c) > 0) {
    console.log("RBAC tables already seeded, skipping.");
    return;
  }
  console.log("Seeding RBAC data...");

  const systemRoles = [
    { roleName: "Yard Admin",      roleDescription: "Full system access and configuration",        roleLevel: 100, isSystem: true },
    { roleName: "Yard Supervisor", roleDescription: "Operational oversight and task assignments",   roleLevel: 80,  isSystem: true },
    { roleName: "Gate Operator",   roleDescription: "Gate check-in and check-out operations only",  roleLevel: 60,  isSystem: true },
    { roleName: "Dock Operator",   roleDescription: "Dock door management and ready-to-go actions", roleLevel: 60,  isSystem: true },
    { roleName: "Yard Marshal",    roleDescription: "Yard slot assignment and move task execution",  roleLevel: 50,  isSystem: true },
    { roleName: "Carrier User",    roleDescription: "Appointment visibility and status tracking",    roleLevel: 20,  isSystem: true },
  ];
  const insertedRoles = await db.insert(roles).values(systemRoles).onConflictDoNothing().returning();
  const findRole = (name: string) => insertedRoles.find(r => r.roleName === name)!;

  const moduleList = [
    { moduleName: "appointments", actionName: "access", description: "Appointment scheduling and management" },
    { moduleName: "gate",         actionName: "access", description: "Gate check-in and check-out operations" },
    { moduleName: "dock",         actionName: "access", description: "Dock door assignment and management" },
    { moduleName: "yard_slot",    actionName: "access", description: "Yard slot assignment and management" },
    { moduleName: "move",         actionName: "access", description: "Yard move task creation and execution" },
    { moduleName: "hold",         actionName: "access", description: "Hold placement and removal approval" },
    { moduleName: "ready_to_go",  actionName: "access", description: "Ready-to-go approval and dispatch" },
    { moduleName: "reports",      actionName: "access", description: "Reports and analytics access" },
    { moduleName: "user_mgmt",    actionName: "access", description: "User account management" },
    { moduleName: "role_mgmt",    actionName: "access", description: "Role and permission configuration" },
  ];
  const insertedPerms = await db.insert(permissions).values(moduleList).onConflictDoNothing().returning();
  const findPerm = (mod: string) => insertedPerms.find(p => p.moduleName === mod)!;

  type P = { canView: boolean; canCreate: boolean; canModify: boolean; canExecute: boolean; canApprove: boolean };
  const ALL: P  = { canView: true,  canCreate: true,  canModify: true,  canExecute: true,  canApprove: true  };
  const VIEW: P = { canView: true,  canCreate: false, canModify: false, canExecute: false, canApprove: false };
  const NONE: P = { canView: false, canCreate: false, canModify: false, canExecute: false, canApprove: false };
  const VC: P   = { canView: true,  canCreate: true,  canModify: false, canExecute: false, canApprove: false };
  const VCM: P  = { canView: true,  canCreate: true,  canModify: true,  canExecute: false, canApprove: false };
  const VCME: P = { canView: true,  canCreate: true,  canModify: true,  canExecute: true,  canApprove: false };
  const VME: P  = { canView: true,  canCreate: false, canModify: true,  canExecute: true,  canApprove: false };
  const VE: P   = { canView: true,  canCreate: false, canModify: false, canExecute: true,  canApprove: false };

  const rbacMatrix: Array<{ roleId: number; permissionId: number } & P> = [];
  function ap(roleName: string, entries: Record<string, P>) {
    const r = findRole(roleName); if (!r) return;
    for (const [mod, p] of Object.entries(entries)) {
      const pm = findPerm(mod); if (!pm) continue;
      rbacMatrix.push({ roleId: r.id, permissionId: pm.id, ...p });
    }
  }
  ap("Yard Admin",      { appointments: ALL,  gate: ALL,  dock: ALL,  yard_slot: ALL,  move: ALL,  hold: ALL,  ready_to_go: ALL,  reports: ALL,  user_mgmt: ALL,  role_mgmt: ALL  });
  ap("Yard Supervisor", { appointments: ALL,  gate: ALL,  dock: ALL,  yard_slot: ALL,  move: ALL,  hold: ALL,  ready_to_go: ALL,  reports: VIEW, user_mgmt: VIEW, role_mgmt: VIEW });
  ap("Gate Operator",   { appointments: VIEW, gate: VCME, dock: VIEW, yard_slot: VIEW, move: VIEW, hold: VC,   ready_to_go: VIEW, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  ap("Dock Operator",   { appointments: VIEW, gate: VIEW, dock: VCM,  yard_slot: VIEW, move: VC,   hold: VIEW, ready_to_go: VE,   reports: VIEW, user_mgmt: NONE, role_mgmt: NONE });
  ap("Yard Marshal",    { appointments: VIEW, gate: VIEW, dock: VIEW, yard_slot: VME,  move: VME,  hold: VIEW, ready_to_go: VIEW, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  ap("Carrier User",    { appointments: VIEW, gate: NONE, dock: NONE, yard_slot: NONE, move: NONE, hold: NONE, ready_to_go: NONE, reports: NONE, user_mgmt: NONE, role_mgmt: NONE });
  if (rbacMatrix.length > 0) await db.insert(rolePermissions).values(rbacMatrix).onConflictDoNothing();

  const roleKeyToName: Record<string, string> = { admin: "Yard Admin", yard_manager: "Yard Supervisor", gate_guard: "Gate Operator", dock_user: "Dock Operator", yard_jockey: "Yard Marshal", carrier: "Carrier User" };
  const allUserProfiles = await db.select().from(userProfiles);
  const userRoleEntries = allUserProfiles.map(u => {
    const roleName = roleKeyToName[u.role];
    const r = insertedRoles.find(ir => ir.roleName === roleName);
    if (!r) return null;
    return { userId: u.userId, roleId: r.id, assignedBy: "demo-admin-001", isPrimary: true };
  }).filter(Boolean) as Array<{ userId: string; roleId: number; assignedBy: string; isPrimary: boolean }>;
  if (userRoleEntries.length > 0) await db.insert(userRoles).values(userRoleEntries).onConflictDoNothing();

  console.log(`RBAC seeded: ${insertedRoles.length} roles, ${insertedPerms.length} permissions, ${rbacMatrix.length} role-permission mappings, ${userRoleEntries.length} user role assignments.`);
}

export async function seedModuleSubscriptions() {
  const [{ count: existing }] = await db.select({ count: count() }).from(facilityModuleSubscriptions);
  if (Number(existing) > 0) {
    console.log("Module subscriptions already seeded, skipping.");
    return;
  }
  const MODULE_KEYS = [
    "core_operations",
    "dock_management",
    "compliance",
    "analytics",
    "notifications",
    "ai_suite",
  ];
  const allFacilities = await db.select({ id: facilities.id }).from(facilities);
  const rows = allFacilities.flatMap((f) =>
    MODULE_KEYS.map((moduleKey) => ({
      facilityId: f.id,
      moduleKey,
      isEnabled: true,
      updatedBy: "system",
    }))
  );
  if (rows.length > 0) {
    await db.insert(facilityModuleSubscriptions).values(rows).onConflictDoNothing();
    console.log(`Module subscriptions seeded: ${rows.length} entries (all enabled by default).`);
  }
}

export async function resetAndReseed() {
  console.log("Resetting database to seed state...");
  await db.delete(locationHistory);
  await db.delete(sealHistory);
  await db.delete(yardAuditItems);
  await db.delete(inspections);
  await db.delete(auditLogs);
  await db.delete(moveTasks);
  await db.delete(exceptions);
  await db.delete(gateTransactions);
  await db.delete(visits);
  await db.delete(appointments);
  await db.execute(sql`UPDATE ${dockDoors} SET current_visit_id = NULL`);
  await db.execute(sql`UPDATE ${yardSlots} SET current_visit_id = NULL`);
  await db.delete(dockDoors);
  await db.delete(yardSlots);
  await db.delete(yardZones);
  await db.delete(gates);
  await db.delete(dwellThresholds);
  await db.delete(revenueRates);
  await db.delete(aiConfig);
  await db.delete(userRoles);
  await db.delete(rolePermissions);
  await db.delete(permissions);
  await db.delete(roles);
  await db.delete(userProfiles);
  await db.delete(carriers);
  await db.delete(users);
  await db.delete(facilityModuleSubscriptions);
  await db.delete(facilities);
  // Facility ids are used as stable demo keys on the frontend (see
  // demo-users.ts) — restart the sequence so a reset always reproduces
  // Columbus=1, Dallas=2, Chicago=3 instead of drifting upward forever.
  await db.execute(sql`ALTER SEQUENCE facilities_id_seq RESTART WITH 1`);
  console.log("All tables cleared. Re-seeding...");
  await seedDatabase();
  await seedAdditionalFacilities();
  await seedModuleSubscriptions();
}
