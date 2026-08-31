---
name: YMS E2E coverage boundary
description: What the existing automated tests cover versus the live operational journey coverage needed for confidence
---

The repository's automated API tests cover focused data behaviors, but not the complete booking → gate → yard → dock → inspection → exception → checkout lifecycle. Confidence in that lifecycle requires a live database-backed smoke transaction using isolated records.

**Why:** A green unit/API test suite can coexist with broken cross-route state transitions, resource occupancy updates, or hold enforcement.

**How to apply:** When validating changes to core YMS workflows, run both the existing API test suite and an isolated live transaction that asserts response status, linked IDs, location/occupancy updates, hold blocking, resolution, and final checkout.