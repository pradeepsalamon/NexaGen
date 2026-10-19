import { test, expect, type APIRequestContext } from "@playwright/test";
import { api, cookieHeader, login, loginContext, scheduleClass, seededBatchId } from "./fixtures";

/**
 * Cancel/end the coach's leftover E2E classes (stuck SCHEDULED/LIVE from earlier
 * runs on the shared dev DB) so approving a new class doesn't 409 on the
 * scheduling-conflict check.
 */
async function clearCoachSchedule(request: APIRequestContext, cookies: string) {
  for (const path of ["/coach/classes/upcoming", "/coach/classes"]) {
    const res = await api(request, "GET", path, cookies);
    if (!res.ok()) continue;
    const data = await res.json();
    const list: Array<{ id: string; topic?: string; status?: string }> = Array.isArray(data?.classes)
      ? data.classes
      : Array.isArray(data)
        ? data
        : [];
    for (const c of list) {
      if (!/E2E/i.test(c.topic || "")) continue;
      if (c.status === "LIVE") await api(request, "POST", `/live-class/${c.id}/end`, cookies);
      else await api(request, "PATCH", `/coach/classes/${c.id}/cancel`, cookies);
    }
  }
}

test.describe("Pre-class settings — layered resolution & authz", () => {
  test("system policy: admin reads & writes, coach cannot write", async ({ request }) => {
    const admin = cookieHeader(await login(request, "admin"));
    const coach = cookieHeader(await login(request, "coach"));

    const get = await api(request, "GET", "/live-class-settings/policy", admin);
    expect(get.status()).toBe(200);
    const policy = await get.json();
    expect(policy.settings.student.mic).toBeTruthy();

    const coachWrite = await api(request, "PUT", "/live-class-settings/policy", coach, {
      settings: { student: { chat: "DISABLED" } },
    });
    expect(coachWrite.status()).toBe(403);

    const adminWrite = await api(request, "PUT", "/live-class-settings/policy", admin, {
      settings: { student: { mic: policy.settings.student.mic } },
    });
    expect(adminWrite.status()).toBe(200);
  });

  test("presets: coach makes a personal one, only admin makes an org one", async ({ request }) => {
    const coach = cookieHeader(await login(request, "coach"));
    const admin = cookieHeader(await login(request, "admin"));

    const personal = await api(request, "POST", "/live-class-presets", coach, {
      name: `E2E personal ${Date.now()}`,
      scope: "PERSONAL",
      settings: { student: { camera: "JOIN_ON" } },
    });
    expect(personal.status()).toBe(201);
    const personalId = (await personal.json()).id;

    const coachOrg = await api(request, "POST", "/live-class-presets", coach, {
      name: "E2E org attempt",
      scope: "ORG",
      settings: {},
    });
    expect(coachOrg.status()).toBe(403);

    const adminOrg = await api(request, "POST", "/live-class-presets", admin, {
      name: `E2E org ${Date.now()}`,
      scope: "ORG",
      settings: { student: { screenShare: "ALLOWED" } },
    });
    expect(adminOrg.status()).toBe(201);
    const orgId = (await adminOrg.json()).id;

    // The coach can see the org preset in their list.
    const list = await (await api(request, "GET", "/live-class-presets", coach)).json();
    const ids = list.presets.map((p: { id: string }) => p.id);
    expect(ids).toContain(orgId);
    expect(ids).toContain(personalId);

    // Cleanup.
    await api(request, "DELETE", `/live-class-presets/${personalId}`, coach);
    await api(request, "DELETE", `/live-class-presets/${orgId}`, admin);
  });

  test("batch → class inheritance and the pre-join settings preview", async ({ request }) => {
    const admin = cookieHeader(await login(request, "admin"));
    const coach = cookieHeader(await login(request, "coach"));

    const batches = await (await api(request, "GET", "/coach/batches", coach)).json();
    const batchId = seededBatchId(batches);

    // Admin sets a batch default; the coach may read it but not write it.
    const coachBatchWrite = await api(
      request,
      "PUT",
      `/live-class-settings/batch/${batchId}`,
      coach,
      { liveClassSettings: { student: { screenShare: "ALLOWED" } } },
    );
    expect(coachBatchWrite.status()).toBe(403);

    const adminBatchWrite = await api(
      request,
      "PUT",
      `/live-class-settings/batch/${batchId}`,
      admin,
      { liveClassSettings: { student: { screenShare: "ALLOWED" } } },
    );
    expect(adminBatchWrite.status()).toBe(200);

    // New class in that batch inherits the batch default until overridden.
    await clearCoachSchedule(request, coach);
    const now = Date.now();
    let classId: string | undefined;
    try {
      classId = await scheduleClass(
        (method, path, body) => api(request, method, path, coach, body),
        (method, path, body) => api(request, method, path, admin, body),
        {
          batchId,
          topic: "E2E pre-class settings",
          startsAt: new Date(now + 5 * 60_000).toISOString(),
          endsAt: new Date(now + 65 * 60_000).toISOString(),
        },
      );
      const classWrite = await api(request, "PUT", `/live-class-settings/class/${classId}`, coach, {
        liveClassSettings: { student: { mic: "FORCED_OFF" } },
      });
      expect(classWrite.status(), `class settings: ${await classWrite.text()}`).toBe(200);

      const forClass = await (
        await api(request, "GET", `/live-class-settings/class/${classId}`, coach)
      ).json();
      expect(forClass.resolved.student.screenShare).toBe("ALLOWED"); // from batch
      expect(forClass.resolved.student.mic).toBe("FORCED_OFF"); // from class override
      expect(forClass.classOverride.student.mic).toBe("FORCED_OFF");

      // The student-visible class fetch carries the resolved preview.
      const student = cookieHeader(await login(request, "student"));
      const liveClass = await (await api(request, "GET", `/live-class/${classId}`, student)).json();
      expect(liveClass.preClassSettings.student.mic).toBe("FORCED_OFF");
    } finally {
      // Leave nothing behind for the next run, even when an assertion failed.
      if (classId) await api(request, "PATCH", `/coach/classes/${classId}/cancel`, coach);
      await api(request, "PUT", `/live-class-settings/batch/${batchId}`, admin, {
        liveClassSettings: null,
      });
    }
  });

  test("audit log: admin only, records the change", async ({ request }) => {
    const admin = cookieHeader(await login(request, "admin"));
    const student = cookieHeader(await login(request, "student"));

    expect((await api(request, "GET", "/live-class-settings/audit", student)).status()).toBe(403);

    // Flip student chat so the write is a real change, then put it back.
    const policy = await (await api(request, "GET", "/live-class-settings/policy", admin)).json();
    const originalChat: "ENABLED" | "DISABLED" = policy.settings.student.chat;
    const flipped = originalChat === "ENABLED" ? "DISABLED" : "ENABLED";
    try {
      const write = await api(request, "PUT", "/live-class-settings/policy", admin, {
        settings: { student: { chat: flipped } },
      });
      expect(write.status(), `policy write: ${await write.text()}`).toBe(200);

      const audit = await (await api(request, "GET", "/live-class-settings/audit", admin)).json();
      const newest = audit.entries[0];
      expect(newest.entity).toBe("LiveClassPolicy");
      expect(newest.scope).toBe("SYSTEM");
      expect(newest.before?.student?.chat).toBe(originalChat);
      expect(newest.after?.student?.chat).toBe(flipped);
    } finally {
      await api(request, "PUT", "/live-class-settings/policy", admin, {
        settings: { student: { chat: originalChat } },
      });
    }
  });
});

test.describe("Pre-class settings — admin UI", () => {
  test("the admin live-class settings page renders its sections", async ({ page }) => {
    // API login backs off on the 5/min throttle the earlier tests use up.
    await loginContext(page.context(), "admin");
    await page.goto("/admin/live-class");
    await expect(page.getByRole("heading", { name: /Live class settings/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Platform defaults", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Organisation presets", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Recent changes/i })).toBeVisible();
  });
});
