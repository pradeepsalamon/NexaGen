// Edge-safe (imported by middleware): no React, no store, no Node APIs.
// Routing affordance only — the API enforces every role on every request.

export const AUTH_COOKIES = {
  accessToken: "nexa_access_token",
  refreshToken: "nexa_refresh_token"
} as const;

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

type RouteRule = {
  prefix: string;
  /** null = any signed-in user. */
  roles: readonly string[] | null;
};

// Most specific prefix first; the first match wins.
const ROUTE_RULES: readonly RouteRule[] = [
  { prefix: "/admin/backups", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/classes", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/demo-classes", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/trash", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin", roles: STAFF_ROLES },
  { prefix: "/coach", roles: ["COACH"] },
  { prefix: "/student", roles: ["STUDENT"] },
  { prefix: "/checkout", roles: null },
  // One class page for every role; it renders the view the role may use.
  { prefix: "/classes", roles: null },
  { prefix: "/chess-board", roles: null },
  { prefix: "/plans", roles: null },
  { prefix: "/profile", roles: null }
];

function matchRule(pathname: string): RouteRule | undefined {
  return ROUTE_RULES.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)
  );
}

export function isProtectedPath(pathname: string): boolean {
  return matchRule(pathname) !== undefined;
}

/** True when the path is public, or the role may open it. */
export function canAccessPath(pathname: string, role: string | undefined): boolean {
  const rule = matchRule(pathname);
  if (!rule || rule.roles === null) return true;
  return role !== undefined && rule.roles.includes(role);
}

export function isStaffRole(role?: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function getRoleDashboardHref(role?: string): string {
  if (isStaffRole(role)) return "/admin";
  if (role === "COACH") return "/coach";
  if (role === "STUDENT") return "/student";
  return "/";
}

/** Reads `role` from a JWT payload WITHOUT verifying it (routing only). */
export function readRoleFromJwt(token: string | undefined): string | undefined {
  const segment = token?.split(".")[1];
  if (!segment) return undefined;
  try {
    const payload = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}
