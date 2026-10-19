# Live captions and translation in live classes

Status: **proposal, not approved** (revision 1, 2026-10-19). Nothing is built.
It needs OD-30 to OD-33 (§7). Speech from students is out of scope (OD-13).

Goal: the coach's speech becomes live captions in the room, translated into
the language each student picks. The English transcript is kept as evidence
for after-class summaries (PHASE3_SPEC.md §4). It gives summaries the actual
teaching, which the 2026-10-19 benchmark showed they lack
(INFRASTRUCTURE_DECISION.md §4.2).

Labels:

- **[V]** verified (repo, installed packages or LiveKit's docs/repos, 2026-10-19)
- **[U]** unverified
- **[R]** a recommendation

---

## 1. What LiveKit already provides [V]

| Piece | What it is | Source |
|---|---|---|
| **LiveKit Agents** | Open-source Python/Node framework. A server-side "agent" joins a room as a participant and subscribes to tracks. It works with a self-hosted server | [Agents docs](https://docs.livekit.io/agents/) |
| **Agent dispatch** | The API asks LiveKit to send an agent into a specific room. `AgentDispatchClient` is in our installed `livekit-server-sdk` 2.17.0 | `node_modules/livekit-server-sdk/dist/AgentDispatchClient.d.ts` |
| **Transcription text streams** | Agents publish transcripts on the `lk.transcription` text-stream topic. A `lk.transcribed_track_id` attribute names the speaker's track. Clients read them with `registerTextStreamHandler`, which our `livekit-client` 2.20.0 has | [Text and transcriptions](https://docs.livekit.io/agents/multimodality/text/) |
| **Reference app** | `livekit-examples/live-translated-captioning`. An agent subscribes to the **host's** mic, transcribes it, and translates per listener-chosen language; captions render in the client. It uses Deepgram STT + GPT-4o, both cloud. It's a demo with known bugs (one host only) | [GitHub](https://github.com/livekit-examples/live-translated-captioning) |
| **Local Whisper** | No official local-Whisper STT plugin was found. The suggested pattern is Whisper behind an OpenAI-compatible server, used through the OpenAI plugin with a custom base URL. Whisper isn't streaming, so it's wrapped with VAD (`StreamAdapter`). This is a community answer; verify it against the current plugin | [LiveKit forum](https://community.livekit.io/t/installing-whisper-piper-selfhosted-help/1672) |

**What's missing:** there's no built-in room-level "captions on" switch. An
agent has to do the speech-to-text
([forum](https://community.livekit.io/t/livekit-approach-for-live-captions-meeting-transcripts/1815)).

---

## 2. Design [R]

```text
Class starts ─▶ API: AgentDispatch(room, "nexa-captions") when captions are enabled
Coach mic track ─▶ captions agent (hidden participant, own identity prefix)
  VAD (Silero) ─▶ STT: faster-whisper via an OpenAI-compatible server, chess vocabulary prompt
              ─▶ final English segment ─▶ translator (IndicTrans2) per language in use
              ─▶ lk.transcription text stream: one per language, attribute lang=<code>
              ─▶ POST /internal/live-class/:id/transcript (segments, English only)
Student UI ◀── caption overlay; language picker; only the agent's identity is trusted
```

- **Coach's microphone only.** The agent subscribes to the coach's audio
  track, never a student's. This keeps minors' voices out (OD-13 stays
  closed). It also means one stream per class.
- **Self-hosted models.**
  - faster-whisper (MIT) for speech-to-text.
  - IndicTrans2 (MIT) for English → Hindi, Tamil and other Indian languages.
  - **Not** NLLB-200, whose licence (CC-BY-NC) bars commercial use [V on
    licence family; re-check the model card at pull time].
  - Audio stays on hardware the academy controls, consistent with OD-4.
- **Trust.**
  - The client renders captions only when the sender identity has the
    agent prefix.
  - That follows the LIVE_CLASS.md rule that data packets are untrusted.
  - Attendance and roster code skip the agent identity, the same way
    `isSpectatorIdentity` is skipped.
- **Storage.**
  - A `LiveClassTranscriptSegment` table holds the coach's English text
    segments only, keyed by class and time. No audio is stored.
  - Segments go into the summary evidence as a `TRANSCRIPT` item and into the
    coach's privacy export.
  - Retention matches `evidenceJson` (30 days) unless decided otherwise
    (OD-33).
- **Settings.** `captionsEnabled` and `captionLanguages` join the pre-class
  settings resolver (`live-class-settings.ts`), per batch with a system
  default of off.

## 3. Hardware

Live speech-to-text plus translation **can't share the production box**
with classes. The 2026-10-19 benchmark showed the 2 cores are already
working hard for one 3B model. Options, in order:

1. **An OCI A1 limit increase** (OD-6 c) for a second ARM VM; cost to be
   confirmed with Oracle.
2. **A separate CPU machine with ≥ 8 cores**, or a small GPU machine.
3. **Cloud STT** (Deepgram, as in LiveKit's example). Fastest to build, but
   the coach's audio, in a room of minors, leaves the box. This needs OD-4
   revisited with a provider review. **Not recommended.**

Latency target: captions ≤ 3 s after the coach finishes a phrase. Whether
self-hosted Whisper can hit this on the candidate hardware is **[U]**, which
is what the timing test (§5) answers.

## 4. Consent and privacy

- **Coach consent** to having their speech transcribed (staff terms).
- **A student-facing notice** that captions are machine-generated.
- **A privacy-page update** (`features/legal/content.ts`): what is
  transcribed (the coach only), where it runs, and how long text is kept.
- **Leakage.** A student who speaks while the coach's mic picks them up
  (same room, open speaker) could leak into the transcript.
  - The mic is the coach's device, but this risk isn't zero.
  - It's covered by the notice and the 30-day retention.

## 5. Next step: timing test (no class data)

Extend `scripts/ai/benchmark/` with a speech pass and run it the same way as
the summary benchmark (off-hours, throwaway container, cleanup):

- **Speech-to-text.** faster-whisper `small` and `distil` models (int8) over
  public-domain English lecture audio, e.g. LibriVox, with chess
  vocabulary added.
- **Translation.** IndicTrans2 over the resulting text.
- **Measured:**
  - real-time factor (processing time ÷ audio time; must be well under 1);
  - phrase latency;
  - peak RAM;
  - word error rate on chess terms.

Run it first on this box for the relative numbers, then on the candidate
machine once one exists.

## 6. Effort (once approved)

| Item | Size |
|---|---|
| Captions agent (Python, LiveKit Agents) + STT/translation servers + compose | M |
| Dispatch from `LiveClassService` start, settings, identity skipping | S |
| Caption overlay + language picker (web) | S–M |
| Transcript table, internal ingest route, summary evidence, export, retention | S–M |
| Hardware (§3) | Depends on OD-31 |

## 7. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| OD-30 | Build live captions at all, coach-only | Yes, after the timing test |
| OD-31 | Where captions run | A second machine (OCI limit increase first); not the production box; not cloud |
| OD-32 | Languages at launch | English + the two most-requested Indian languages |
| OD-33 | Transcript retention | 30 days, like summary evidence |
