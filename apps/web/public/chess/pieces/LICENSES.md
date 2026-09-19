# Piece set licenses

Every piece set below is vendored from [lichess-org/lila](https://github.com/lichess-org/lila)
(`public/piece/<id>`), filtered to licenses that permit use in a commercial
product. Lichess bundles many piece sets under `CC BY-NC-SA` (non-commercial),
which NexaChess — a paid chess-academy product — cannot use; those were
excluded. Files are unmodified except for the directory rename shown below.

| NexaChess set | Files in `apps/web/public/chess/pieces/<id>/` | Source (lichess `public/piece/<id>`) | Author | License |
|---|---|---|---|---|
| `classic` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `cburnett` | Colin M.L. Burnett | GPLv2+ |
| `modern` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `chessnut` | Alexis Luengas | Apache-2.0 |
| `minimal` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `spatial` | Maurizio Monge | MIT |
| `tournament` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `merida` | Armando Hernandez Marroquin | GPLv2+ |
| `wooden` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `rhosgfx` | RhosGFX | CC0 1.0 |
| `bold` | `wP.svg wN.svg wB.svg wR.svg wQ.svg wK.svg` + `b*` | `mpchess` | Maxime Chupin | GPLv3+ |

Note: lichess's own `mono` set (which "Minimal" was originally mapped to) only
ships 6 shape files with no white/black split (color is applied via CSS), which
doesn't fit NexaChess's per-file-per-color piece rendering — `spatial` (MIT)
was used instead, and fits the "simple flat pieces" brief just as well.

GPLv2+ requires that redistributions of these specific files remain available
under GPLv2+ terms (this document is that notice); it does not require the
rest of the NexaChess application to be GPL-licensed, since the pieces are
used as independent media assets, not linked/derived software. Apache-2.0, MIT
and CC0 carry no share-alike obligation. Attribution above satisfies every
license's author-credit expectation even where not strictly required (CC0).
