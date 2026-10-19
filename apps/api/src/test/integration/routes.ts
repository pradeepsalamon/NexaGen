import type { TestApp } from "./app";

export type RegisteredRoute = { method: string; path: string };

type RouteLayer = { route?: { methods: Record<string, boolean>; path: unknown } };

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * Every route the app mounts, read off Express's route table (`router` in
 * Express 5, `_router` before it). Only concrete paths: a middleware wildcard
 * such as `{/*splat}` is not a route a client can call.
 */
export function registeredRoutes(t: TestApp): RegisteredRoute[] {
  const express = t.app.getHttpAdapter().getInstance() as {
    router?: { stack: RouteLayer[] };
    _router?: { stack: RouteLayer[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack.flatMap((layer) => {
    const route = layer.route;
    if (!route || typeof route.path !== "string" || route.path.includes("*")) return [];
    return Object.keys(route.methods)
      .filter((method) => HTTP_METHODS.has(method))
      .map((method) => ({ method: method.toUpperCase(), path: route.path as string }));
  });
}
