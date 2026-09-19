# Sound theme licenses

| NexaChess theme | Files in `apps/web/public/sounds/<id>/` | Source | Author | License |
|---|---|---|---|---|
| `nexa-classic` | `move.wav capture.wav check.wav gameEnd.wav` | Original, first-party | NexaChess | Proprietary (NexaChess) |
| `futuristic` | `move.mp3 capture.mp3 check.mp3 gameEnd.mp3` | [lichess-org/lila](https://github.com/lichess-org/lila) `public/sound/futuristic` (`Move`/`Capture`/`Check`/`Victory`) | Enigmahack | AGPLv3+ |
| `nes` | `move.mp3 capture.mp3 check.mp3 gameEnd.mp3` | `lichess-org/lila public/sound/nes` | Enigmahack | AGPLv3+ |
| `piano` | `move.mp3 capture.mp3 check.mp3 gameEnd.mp3` | `lichess-org/lila public/sound/piano` | Enigmahack | AGPLv3+ |
| `sfx` | `move.mp3 capture.mp3 check.mp3 gameEnd.mp3` | `lichess-org/lila public/sound/sfx` | Enigmahack | AGPLv3+ |

Every lichess sound pack besides these four is either explicitly non-commercial
(`lisp` is CC BY-NC-SA 4.0) or undocumented/non-free (lichess's own
`COPYING.md` lists "the other sounds in `public/sound`" — including their
default "Standard" pack — under "Exceptions (non-free)"), so only these four
were vendored. `gameEnd` maps to each pack's `Victory` cue — NexaChess doesn't
distinguish win/loss/draw when a game ends, so one generic "the game is over"
sound is used for all of them, matching how `nexa-classic/gameEnd.wav` already
behaves.

AGPLv3+ is a stronger copyleft than the GPLv2+/Apache-2.0/MIT/CC0 licenses
used for the vendored piece sets (see `apps/web/public/chess/pieces/LICENSES.md`)
— notably its network-use clause, the reason AGPL exists. That clause reaches
software conveyed or made available as a modified *program*; these are
unmodified audio *media assets* bundled with, not modifying, this
application's code, so they don't bring the rest of NexaChess under AGPL —
the same "independent media asset" reasoning already applied to the GPL piece
sets. This document is the attribution AGPLv3+ requires for redistributing
these specific files.
