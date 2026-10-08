import * as fs from "fs";
import * as path from "path";

/**
 * There are no auth guards (CLAUDE.md §3.2): each handler must hand its request
 * to an auth helper. This catches a new route that forgets to. A handler that
 * never touches `request`/`req` can't be reading the access cookie, so it must
 * be listed here as deliberately public.
 */
const PUBLIC_ROUTES = new Set([
  "auth/auth.controller.ts#forgotPassword",
  "auth/auth.controller.ts#resetPassword",
  "auth/auth.controller.ts#verifyEmail",
  "health/health.controller.ts#live",
  "health/health.controller.ts#ready",
  "live-class/live-class.controller.ts#getDemoInfo",
  "live-class/live-class.controller.ts#joinDemoClass"
]);

const SRC = path.resolve(__dirname, "../..");

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith(".controller.ts") ? [full] : [];
  });
}

function routesNotUsingRequest(): string[] {
  const offenders: string[] = [];
  for (const file of controllerFiles(SRC)) {
    const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const decorators = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)];
    decorators.forEach((match, index) => {
      const end = index + 1 < decorators.length ? decorators[index + 1].index : source.length;
      const chunk = source.slice(match.index, end);
      const handler = /\n\s*(?:async\s+)?(\w+)\(/.exec(chunk)?.[1] ?? "?";
      const bodyStart = chunk.search(/\)(?::[^{\n]*)?\s*\{\n/);
      const body = bodyStart >= 0 ? chunk.slice(bodyStart) : "";
      if (!/\b(request|req)\b/.test(body)) {
        offenders.push(`${path.relative(SRC, file).replace(/\\/g, "/")}#${handler}`);
      }
    });
  }
  return offenders;
}

describe("route authentication coverage", () => {
  const offenders = routesNotUsingRequest();

  it("every route reads the request (auth cookie) unless it is listed as public", () => {
    expect(offenders.filter((route) => !PUBLIC_ROUTES.has(route))).toEqual([]);
  });

  it("the public allow-list has no stale entries", () => {
    expect([...PUBLIC_ROUTES].filter((route) => !offenders.includes(route))).toEqual([]);
  });
});
