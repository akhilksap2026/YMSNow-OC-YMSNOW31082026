export const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  super_admin:  { label: "Super Admin",    color: "#F472B6", bg: "#500724" },
  admin:        { label: "Administrator",  color: "#818CF8", bg: "#312E81" },
  yard_manager: { label: "Yard Manager",   color: "#34D399", bg: "#064E3B" },
  gate_guard:   { label: "Gate Guard",     color: "#60A5FA", bg: "#1E3A5F" },
  yard_jockey:  { label: "Yard Jockey",    color: "#FBBF24", bg: "#431407" },
  dock_user:    { label: "Dock User",      color: "#F87171", bg: "#450A0A" },
  carrier:      { label: "Carrier",        color: "#A78BFA", bg: "#2D1B69" },
};

// facilityId pins a persona to a single facility (mirrors the demo carrierId
// pattern) so their session sends x-facility-id and the backend can scope
// data to that facility. super_admin has no facilityId — they can see/switch
// across every facility.
export const DEMO_USERS = [
  { id: "demo-superadmin-001", firstName: "Elena",  lastName: "Vasquez",  username: "e.vasquez",  role: "super_admin",  email: "e.vasquez@ymsnow.com",       facilityId: null as number | null },
  { id: "demo-admin-001", firstName: "Sandra",  lastName: "Mitchell", username: "s.mitchell", role: "admin",        email: "s.mitchell@yardnow.com",     facilityId: 1 },
  { id: "demo-ym-001",    firstName: "Robert",  lastName: "Chen",     username: "r.chen",     role: "yard_manager", email: "r.chen@yardnow.com",         facilityId: 1 },
  { id: "demo-gg-001",    firstName: "Maria",   lastName: "Gonzalez", username: "m.gonzalez", role: "gate_guard",   email: "m.gonzalez@yardnow.com",     facilityId: 1 },
  { id: "demo-gg-002",    firstName: "Jamal",   lastName: "Williams", username: "j.williams", role: "gate_guard",   email: "j.williams@yardnow.com",     facilityId: 1 },
  { id: "demo-yj-001",    firstName: "Tommy",   lastName: "Kowalski", username: "t.kowalski", role: "yard_jockey",  email: "t.kowalski@yardnow.com",     facilityId: 1 },
  { id: "demo-yj-002",    firstName: "DeShawn", lastName: "Carter",   username: "d.carter",   role: "yard_jockey",  email: "d.carter@yardnow.com",       facilityId: 1 },
  { id: "demo-du-001",    firstName: "Lisa",    lastName: "Park",     username: "l.park",     role: "dock_user",    email: "l.park@yardnow.com",         facilityId: 1 },
  { id: "demo-cr-001",    firstName: "Tyler",   lastName: "Brooks",   username: "t.brooks",   role: "carrier",      email: "t.brooks@swifttrans.com",    facilityId: 1 },

  // Dallas–Fort Worth Gateway (facility 2) — pinned personas so the
  // multi-yard demo can show a facility-scoped admin/user restricted to
  // their own yard. Facility ids are stable demo keys: seedAdditionalFacilities()
  // always creates Columbus=1, Dallas=2, Chicago=3 (resetAndReseed restarts
  // the facilities id sequence so this holds after a reset too).
  { id: "demo-admin-dfw-001", firstName: "Marisol", lastName: "Trevino", username: "m.trevino", role: "admin",       email: "m.trevino@yardnow.com", facilityId: 2 },
  { id: "demo-ym-dfw-001",    firstName: "Colton",  lastName: "Baird",   username: "c.baird",   role: "yard_manager",email: "c.baird@yardnow.com",   facilityId: 2 },
  { id: "demo-gg-dfw-001",    firstName: "Esteban", lastName: "Salas",   username: "e.salas",   role: "gate_guard",  email: "e.salas@yardnow.com",   facilityId: 2 },

  // Chicago O'Hare Crossdock (facility 3)
  { id: "demo-admin-ord-001", firstName: "Wendell", lastName: "Ashford",   username: "w.ashford",   role: "admin",       email: "w.ashford@yardnow.com",   facilityId: 3 },
  { id: "demo-ym-ord-001",    firstName: "Bethany",  lastName: "Kowalczyk", username: "b.kowalczyk", role: "yard_manager",email: "b.kowalczyk@yardnow.com", facilityId: 3 },
  { id: "demo-gg-ord-001",    firstName: "Marcus",   lastName: "Delgado",   username: "m.delgado",   role: "gate_guard",  email: "m.delgado@yardnow.com",   facilityId: 3 },
];

export type DemoUser = (typeof DEMO_USERS)[number];
