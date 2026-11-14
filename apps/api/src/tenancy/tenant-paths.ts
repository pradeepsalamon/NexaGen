import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { requireTenantId } from "./tenant-sql";

/**
 * Where an academy's files live in Cloudinary (docs/SAAS_MULTI_TENANCY.md §E,
 * "Files"; Phase 3 slice 6). Nexa keeps `nexa_chess/…`, so every existing
 * asset and stored key stays valid; every other academy gets `tenants/<id>/…`.
 * Upload checks compare against the current academy's root, so one academy
 * can't attach (or later delete) another's file by pasting its URL.
 */
export function tenantStorageRoot(tenantId: string = requireTenantId("storage")): string {
  return tenantId === DEFAULT_TENANT_ID ? "nexa_chess" : `tenants/${tenantId}`;
}

/**
 * The LiveKit room for a class. Nexa keeps `class_<id>`; another academy's
 * rooms are `t_<tenantId>_class_<id>`, so room names (and the recording files
 * named after them) say which academy they belong to. The webhook still takes
 * the academy from the room's `LiveSession` row, never from the name.
 */
export function liveRoomName(classId: string, tenantId: string = requireTenantId("liveRoom")): string {
  return tenantId === DEFAULT_TENANT_ID ? `class_${classId}` : `t_${tenantId}_class_${classId}`;
}
