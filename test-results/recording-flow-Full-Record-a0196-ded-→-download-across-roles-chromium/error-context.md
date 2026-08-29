# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recording-flow.spec.ts >> Full Recording Lifecycle & Download Flow >> recording start → egress webhook → stop → egress ended → download across roles
- Location: e2e/recording-flow.spec.ts:86:7

# Error details

```
Error: Coach download failed: {"message":"Recording not found.","error":"Not Found","statusCode":404}

expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  69  | async function sendWebhook(
  70  |   request: APIRequestContext,
  71  |   event: Record<string, unknown>
  72  | ) {
  73  |   const body = JSON.stringify(event);
  74  |   const authHeader = createWebhookSignature(body);
  75  |   const res = await request.post(`${API_URL}/webhooks/livekit`, {
  76  |     data: event,
  77  |     headers: {
  78  |       "Content-Type": "application/json",
  79  |       Authorization: authHeader,
  80  |     },
  81  |   });
  82  |   return res;
  83  | }
  84  | 
  85  | test.describe("Full Recording Lifecycle & Download Flow", () => {
  86  |   test("recording start → egress webhook → stop → egress ended → download across roles", async ({
  87  |     request,
  88  |     browser,
  89  |   }) => {
  90  |     // 1. Login as Coach
  91  |     const coachCookies = await loginAs(request, COACH.email, COACH.password);
  92  |     expect(coachCookies).toBeTruthy();
  93  | 
  94  |     // 2. Get batch for Coach
  95  |     const batchesRes = await api(request, "GET", "/coach/batches", coachCookies);
  96  |     expect(batchesRes.ok()).toBeTruthy();
  97  |     const batchesData = await batchesRes.json();
  98  |     const batches = batchesData.batches || batchesData;
  99  |     expect(batches.length).toBeGreaterThan(0);
  100 |     const batchId = batches[0].id;
  101 | 
  102 |     // 3. Create a class
  103 |     const now = new Date();
  104 |     const startsAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  105 |     const endsAt = new Date(now.getTime() + 62 * 60 * 1000).toISOString();
  106 | 
  107 |     const createRes = await api(request, "POST", "/coach/classes", coachCookies, {
  108 |       batchId,
  109 |       topic: "Recording E2E Test Class - Endgame Strategy",
  110 |       title: "Recording Flow E2E Test",
  111 |       description: "Class to test recording start, stop, webhook, and download",
  112 |       startsAt,
  113 |       endsAt,
  114 |     });
  115 |     expect(createRes.ok(), `Create class failed: ${await createRes.text()}`).toBeTruthy();
  116 |     const createdData = await createRes.json();
  117 |     const classId = createdData.class?.id || createdData.id;
  118 |     const roomName = `class_${classId}`;
  119 |     expect(classId).toBeTruthy();
  120 | 
  121 |     // 4. Start Live Class
  122 |     const startRes = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
  123 |     expect(startRes.ok(), `Start class failed: ${await startRes.text()}`).toBeTruthy();
  124 | 
  125 |     // 5. Send egress_started webhook to simulate active recording
  126 |     const egressId = `egress_test_${Date.now()}`;
  127 |     const recordingPath = `recordings/${roomName}-${Date.now()}.mp4`;
  128 | 
  129 |     const egressStartedRes = await sendWebhook(request, {
  130 |       event: "egress_started",
  131 |       id: `evt_start_${Date.now()}`,
  132 |       egressInfo: {
  133 |         egressId,
  134 |         roomName,
  135 |         status: 1, // EGRESS_ACTIVE
  136 |       },
  137 |     });
  138 |     expect(egressStartedRes.ok()).toBeTruthy();
  139 | 
  140 |     // 6. Simulate egress_ended webhook with successful completion
  141 |     const egressEndedRes = await sendWebhook(request, {
  142 |       event: "egress_ended",
  143 |       id: `evt_end_${Date.now()}`,
  144 |       egressInfo: {
  145 |         egressId,
  146 |         roomName,
  147 |         status: 3, // EGRESS_COMPLETE
  148 |         fileResults: [
  149 |           {
  150 |             filename: recordingPath,
  151 |             location: `https://mock-oci-storage.test/${recordingPath}`,
  152 |           },
  153 |         ],
  154 |       },
  155 |     });
  156 |     expect(egressEndedRes.ok()).toBeTruthy();
  157 | 
  158 |     // 7. End Live Class
  159 |     const endRes = await api(request, "POST", `/live-class/${classId}/end`, coachCookies);
  160 |     expect(endRes.ok(), `End class failed: ${await endRes.text()}`).toBeTruthy();
  161 | 
  162 |     // 8. Verify Coach can fetch download URL
  163 |     const coachDownloadRes = await api(
  164 |       request,
  165 |       "GET",
  166 |       `/live-class/${classId}/recording/download`,
  167 |       coachCookies
  168 |     );
> 169 |     expect(coachDownloadRes.ok(), `Coach download failed: ${await coachDownloadRes.text()}`).toBeTruthy();
      |                                                                                              ^ Error: Coach download failed: {"message":"Recording not found.","error":"Not Found","statusCode":404}
  170 |     const coachDownloadData = await coachDownloadRes.json();
  171 |     expect(coachDownloadData.url).toBeTruthy();
  172 | 
  173 |     // 9. Verify Student in batch can fetch download URL
  174 |     const studentCookies = await loginAs(request, STUDENT.email, STUDENT.password);
  175 |     expect(studentCookies).toBeTruthy();
  176 | 
  177 |     const studentDownloadRes = await api(
  178 |       request,
  179 |       "GET",
  180 |       `/live-class/${classId}/recording/download`,
  181 |       studentCookies
  182 |     );
  183 |     expect(studentDownloadRes.ok(), `Student download failed: ${await studentDownloadRes.text()}`).toBeTruthy();
  184 |     const studentDownloadData = await studentDownloadRes.json();
  185 |     expect(studentDownloadData.url).toBeTruthy();
  186 | 
  187 |     // 10. Verify Super Admin can fetch download URL
  188 |     const adminCookies = await loginAs(request, ADMIN.email, ADMIN.password);
  189 |     expect(adminCookies).toBeTruthy();
  190 | 
  191 |     const adminDownloadRes = await api(
  192 |       request,
  193 |       "GET",
  194 |       `/live-class/${classId}/recording/download`,
  195 |       adminCookies
  196 |     );
  197 |     expect(adminDownloadRes.ok(), `Admin download failed: ${await adminDownloadRes.text()}`).toBeTruthy();
  198 |     const adminDownloadData = await adminDownloadRes.json();
  199 |     expect(adminDownloadData.url).toBeTruthy();
  200 | 
  201 |     // 11. Verify Coach History Page displays class with recording
  202 |     const coachCtx = await browser.newContext();
  203 |     for (const cookieStr of coachCookies.split("; ")) {
  204 |       const [name, value] = cookieStr.split("=");
  205 |       await coachCtx.addCookies([
  206 |         { name, value, domain: "localhost", path: "/", httpOnly: true },
  207 |       ]);
  208 |     }
  209 |     const coachPage = await coachCtx.newPage();
  210 |     await coachPage.goto("/coach/history");
  211 |     await coachPage.waitForLoadState("networkidle");
  212 | 
  213 |     // The created class should appear in history
  214 |     await expect(coachPage.getByText("Recording E2E Test Class - Endgame Strategy")).toBeVisible({ timeout: 10000 });
  215 |     // The download button should be rendered for this row
  216 |     await expect(coachPage.getByRole("button", { name: /download recording/i }).first()).toBeVisible({ timeout: 10000 });
  217 | 
  218 |     await coachCtx.close();
  219 |   });
  220 | });
  221 | 
```