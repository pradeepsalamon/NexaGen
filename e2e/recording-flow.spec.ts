import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  API_URL,
  apiCall,
  apiCallOk,
  loginContext,
  scheduleClass,
  seededBatchId,
  sendLiveKitWebhook,
} from "./fixtures";

/**
 * Locate a row by text in a client-paginated DataTable, walking pages with the
 * "Next" button. The shared dev DB carries hundreds of leftover E2E classes, so
 * a freshly-created one is rarely on page 1 of a date-sorted history list.
 */
async function findInDataTable(page: Page, text: string, maxPages = 15) {
  const firstRow = page.locator("tbody tr").first();
  for (let i = 0; i < maxPages; i += 1) {
    await firstRow.waitFor({ state: "visible" });
    const cell = page.getByText(text).first();
    if (await cell.isVisible().catch(() => false)) return cell;
    const next = page.getByRole("button", { name: /^next$/i });
    if (!(await next.isEnabled().catch(() => false))) break;
    const before = await firstRow.innerText();
    await next.click();
    await expect.poll(() => firstRow.innerText()).not.toBe(before);
  }
  return page.getByText(text).first();
}

/**
 * Host-side path of the directory the API container exposes as
 * `RECORDING_STORAGE_DIR`. The suite drops a real MP4 there so the *local file*
 * branch of `downloadRecording` is exercised — that is the path production
 * actually serves (`/live-class/:id/recording/stream`), not the OCI fallback.
 */
const RECORDINGS_DIR = path.resolve(
  process.env.E2E_RECORDINGS_DIR || path.join(__dirname, "..", "recordings")
);
const FIXTURE_MP4 = path.join(__dirname, "fixtures", "sample-recording.mp4");


async function jsonOf<T = Record<string, unknown>>(res: {
  json: () => Promise<unknown>;
}): Promise<T> {
  return (await res.json()) as T;
}

/**
 * This suite forges signed egress webhooks and drops a fixture MP4 into the
 * recordings volume, so the rows and files it leaves behind are indistinguishable
 * from real class recordings. Pointed at a deployment it therefore fills the
 * Watch/Download UI with a 35 KB stand-in video — which is exactly what happened
 * once, and why the guard exists. Local API only, unless the operator explicitly
 * opts in with `E2E_ALLOW_RECORDING_WRITES=1`.
 */
const API_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL);
const RECORDING_WRITES_ALLOWED =
  API_IS_LOCAL || process.env.E2E_ALLOW_RECORDING_WRITES === "1";

test.describe("Full Recording Lifecycle & Video Player Flow", () => {
  test.skip(
    !RECORDING_WRITES_ALLOWED,
    `Refusing to write recording fixtures to a non-local API (${API_URL}). ` +
      "Set E2E_ALLOW_RECORDING_WRITES=1 to override."
  );

  const runId = Date.now();
  const uniqueTopic = `Recording E2E - Endgame Strategy - ${runId}`;

  let coachCtx: BrowserContext;
  let studentCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let coach: APIRequestContext;
  let student: APIRequestContext;
  let admin: APIRequestContext;

  let classId: string;
  let recordingKey: string;

  test.beforeAll(async ({ browser }) => {
    // One login per role, reused for both API calls and page navigation:
    // `/auth/login` is throttled at 5/min and a per-step login blows that budget.
    coachCtx = await browser.newContext();
    studentCtx = await browser.newContext();
    adminCtx = await browser.newContext();
    await loginContext(coachCtx, "coach");
    await loginContext(studentCtx, "student");
    await loginContext(adminCtx, "admin");
    coach = coachCtx.request;
    student = studentCtx.request;
    admin = adminCtx.request;
  });

  test.afterAll(async () => {
    // The fixture MP4 is deliberately left on disk. The session row keeps its
    // `recordingUrl`, and there is no endpoint to clear it (a completed class
    // cannot be cancelled), so deleting the file would leave a Watch button that
    // 404s. It is ~35 KB and falls out under the normal retention prune.
    await Promise.all([coachCtx?.close(), studentCtx?.close(), adminCtx?.close()]);
  });

  test("recording start → egress webhooks → local stream, range seek, download and player", async ({
    browser,
  }) => {
    // ── 1. A class to record ────────────────────────────────────────────────
    const batchId = seededBatchId(await jsonOf(await apiCallOk(coach, "GET", "/coach/batches")));

    // Starts inside the early-start window so it can be started right away.
    const now = Date.now();
    classId = await scheduleClass(
      (method, path, body) => apiCall(coach, method, path, body),
      (method, path, body) => apiCall(admin, method, path, body),
      {
        batchId,
        topic: uniqueTopic,
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 61 * 60_000).toISOString(),
      }
    );

    const roomName = `class_${classId}`;
    await apiCallOk(coach, "POST", `/live-class/${classId}/start`);

    // ── 2. A real recording file on disk ────────────────────────────────────
    const filename = `${roomName}-${runId}.mp4`;
    recordingKey = `recordings/${filename}`;
    const diskPath = path.join(RECORDINGS_DIR, filename);
    await fs.promises.mkdir(RECORDINGS_DIR, { recursive: true });
    await fs.promises.copyFile(FIXTURE_MP4, diskPath);
    const fixtureSize = (await fs.promises.stat(diskPath)).size;
    expect(fixtureSize).toBeGreaterThan(0);

    // ── 3. Egress lifecycle webhooks ────────────────────────────────────────
    const egressId = `egress_e2e_${runId}`;

    const started = await sendLiveKitWebhook(coach, {
      event: "egress_started",
      id: `evt_start_${runId}`,
      egressInfo: { egressId, roomName, status: 1 }, // EGRESS_ACTIVE
    });
    expect(
      started.ok(),
      `egress_started rejected: ${started.status()} ${await started.text()}`
    ).toBeTruthy();
    // A rejected signature must not read as success — the API returns 200 with a
    // body for processing errors, so assert on the body too.
    expect(await jsonOf<{ ok: boolean }>(started)).toMatchObject({ ok: true });

    const ended = await sendLiveKitWebhook(coach, {
      event: "egress_ended",
      id: `evt_end_${runId}`,
      egressInfo: {
        egressId,
        roomName,
        status: 3, // EGRESS_COMPLETE
        fileResults: [{ filename: `/out/${recordingKey}`, location: recordingKey }],
      },
    });
    expect(
      ended.ok(),
      `egress_ended rejected: ${ended.status()} ${await ended.text()}`
    ).toBeTruthy();
    expect(await jsonOf<{ ok: boolean }>(ended)).toMatchObject({ ok: true });

    await apiCallOk(coach, "POST", `/live-class/${classId}/end`);

    // ── 4. An unsigned webhook is rejected ──────────────────────────────────
    const forged = await coach.post(`${API_URL}/webhooks/livekit`, {
      data: JSON.stringify({
        event: "egress_ended",
        id: `evt_forged_${runId}`,
        egressInfo: { egressId, roomName, status: 2 },
      }),
      headers: {
        "Content-Type": "application/webhook+json",
        Authorization: "TEST_BYPASS_SIGNATURE",
      },
    });
    expect(
      forged.status(),
      "an unsigned webhook must be rejected, not silently accepted"
    ).toBe(401);

    // ── 5. Recording metadata was promoted onto the session ─────────────────
    // The details API exposes only `hasRecording`; the byte count is checked
    // against the downloaded body in step 6.
    const details = await jsonOf<{ class: { hasRecording?: boolean } }>(
      await apiCallOk(coach, "GET", `/coach/classes/${classId}/details`)
    );
    expect(details.class.hasRecording).toBe(true);

    // ── 6. Download URL resolves to the local stream endpoint for every role ─
    for (const [label, ctx] of [
      ["coach", coach],
      ["student", student],
      ["admin", admin],
    ] as const) {
      const { url } = await jsonOf<{ url: string }>(
        await apiCallOk(ctx, "GET", `/live-class/${classId}/recording/download`)
      );
      expect(url, `${label} download url`).toBeTruthy();
      expect(
        url,
        `${label} should get the local stream endpoint, not the OCI fallback`
      ).toContain(`/live-class/${classId}/recording/stream`);
      expect(url, `${label} stream url carries a signed token`).toMatch(/[?&]st=/);
    }

    const { url: streamUrl } = await jsonOf<{ url: string }>(
      await apiCallOk(student, "GET", `/live-class/${classId}/recording/download`)
    );

    // ── 7. The stream itself: whole file, byte range, and attachment ────────
    const whole = await student.get(streamUrl);
    expect(whole.status()).toBe(200);
    expect(whole.headers()["content-type"]).toContain("video/mp4");
    expect(whole.headers()["accept-ranges"]).toBe("bytes");
    expect((await whole.body()).length).toBe(fixtureSize);

    // Seeking in the player issues a Range request; without 206 the video is
    // unseekable in Chrome.
    const ranged = await student.get(streamUrl, { headers: { Range: "bytes=0-1023" } });
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()["content-range"]).toBe(`bytes 0-1023/${fixtureSize}`);
    expect((await ranged.body()).length).toBe(1024);

    const unsatisfiable = await student.get(streamUrl, {
      headers: { Range: `bytes=${fixtureSize + 10}-` },
    });
    expect(unsatisfiable.status()).toBe(416);

    const { url: downloadUrl } = await jsonOf<{ url: string }>(
      await apiCallOk(student, "GET", `/live-class/${classId}/recording/download?download=1`)
    );
    const attachment = await student.get(downloadUrl);
    expect(attachment.status()).toBe(200);
    expect(attachment.headers()["content-disposition"]).toContain("attachment");

    // ── 8. The stream token is required ─────────────────────────────────────
    const anonymousCtx = await browser.newContext();
    const anonymous = await anonymousCtx.request.get(
      `${API_URL}/live-class/${classId}/recording/stream`
    );
    await anonymousCtx.close();
    expect(anonymous.status()).toBe(401);

    // ── 9. Coach history renders the class and a download control ───────────
    const coachPage = await coachCtx.newPage();
    await coachPage.goto("/coach/history");
    await coachPage.waitForLoadState("networkidle");
    await expect(await findInDataTable(coachPage, uniqueTopic)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      coachPage.getByRole("button", { name: /download recording/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    await coachPage.close();

    // ── 10. Student dashboard → Watch → the player fetches the media ────────
    const studentPage = await studentCtx.newPage();

    // Capture what the <video> element itself pulls off the network. This is the
    // assertion that matters: it proves the minted URL, the stream token and the
    // range handling all work from inside the browser, not just from the API
    // client.
    const mediaResponses: number[] = [];
    studentPage.on("response", (res) => {
      if (res.url().includes(`/live-class/${classId}/recording/stream`)) {
        mediaResponses.push(res.status());
      }
    });

    await studentPage.goto("/student");
    const row = studentPage.getByTestId(`past-class-${classId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /^watch$/i }).click();

    const dialog = studentPage.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      studentPage.getByRole("heading", { name: new RegExp(uniqueTopic) })
    ).toBeVisible();

    const video = studentPage.locator("video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute(
      "src",
      new RegExp(`/live-class/${classId}/recording/stream`)
    );

    await expect
      .poll(() => mediaResponses.length, {
        message: "the <video> element never fetched the recording",
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    expect(mediaResponses.every((status) => status === 200 || status === 206)).toBe(
      true
    );

    // Playwright's bundled Chromium ships without proprietary codecs, so it can
    // fetch the MP4 but not decode it. Only assert on decoding where H.264 is
    // actually available (a real Chrome channel, or a CI image that has it).
    const canDecodeH264 = await studentPage.evaluate(
      () =>
        document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"') !==
        ""
    );
    if (canDecodeH264) {
      await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState), {
          message: "video never reached HAVE_METADATA",
          timeout: 20_000,
        })
        .toBeGreaterThanOrEqual(1);
      expect(
        await video.evaluate((el: HTMLVideoElement) => el.duration)
      ).toBeGreaterThan(0);
    } else {
      test.info().annotations.push({
        type: "skipped-assertion",
        description:
          "H.264 decode not asserted: this browser build has no proprietary codecs.",
      });
    }

    await studentPage.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await studentPage.close();
  });

  test("admin recordings & storage page reports the recording", async () => {
    const adminPage = await adminCtx.newPage();
    await adminPage.goto("/admin/analytics/recordings");

    await expect(
      adminPage.getByRole("heading", { name: /recordings & storage/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Disk usage panel is driven by the same directory the recording landed in.
    // ("disk usage" also appears in two panel descriptions, so match the label.)
    await expect(
      adminPage.getByText("Disk usage", { exact: true }).first()
    ).toBeVisible();
    await expect(adminPage.getByText(/of\s+\d/i).first()).toBeVisible();

    // The recording log lists the class this run recorded.
    await expect(await findInDataTable(adminPage, uniqueTopic)).toBeVisible({
      timeout: 15_000,
    });
    await adminPage.close();
  });
});
