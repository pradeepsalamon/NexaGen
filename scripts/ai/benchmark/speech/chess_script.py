# Invented coach speech for the chess-vocabulary pass (LIVE_CAPTIONS.md §5).
# Spoken with Piper's public-domain LJSpeech voice, so the reference text is
# exact. Each line is (sentence, chess terms that must survive transcription).
# No class audio or student data is used.

CHESS_LINES = [
    ("Today we start with the Sicilian Defence, one of Black's sharpest replies to e4.", ["sicilian", "e 4"]),
    ("After knight f3 and d4, Black takes on d4 and we reach the open Sicilian.", ["knight", "f 3", "d 4"]),
    ("The Najdorf is the move a6, which stops a knight or bishop from landing on b5.", ["najdorf", "a 6", "b 5", "bishop"]),
    ("Remember, White usually castles queenside in the English Attack.", ["castles", "queenside", "english attack"]),
    ("In the Ruy Lopez, the bishop on b5 puts pressure on the knight defending e5.", ["ruy lopez", "bishop", "b 5", "e 5"]),
    ("Black can fianchetto the bishop on g7 and aim it at the long diagonal.", ["fianchetto", "g 7", "diagonal"]),
    ("The Caro-Kann starts with c6, preparing d5 without blocking the light-squared bishop.", ["caro kann", "c 6", "d 5"]),
    ("If the pawn on f7 is pinned, the knight jump to g5 becomes very strong.", ["pinned", "f 7", "g 5"]),
    ("This is a fork: the knight attacks the king and the rook at the same time.", ["fork", "knight", "rook"]),
    ("A skewer is like a pin in reverse, because the more valuable piece is in front.", ["skewer", "pin"]),
    ("Now Black has an en passant capture, so the pawn on e5 can take on d6.", ["en passant", "e 5", "d 6"]),
    ("Which piece is overloaded here? The queen is defending both the rook and the back rank.", ["overloaded", "queen", "back rank"]),
    ("In this endgame the side to move is in zugzwang, so any move loses.", ["endgame", "zugzwang"]),
    ("Put the rook behind the passed pawn, not in front of it.", ["rook", "passed pawn"]),
    ("The king must use the opposition to escort the pawn to the eighth rank.", ["opposition", "eighth rank"]),
    ("This bishop sacrifice on h7 is the classic Greek gift.", ["sacrifice", "h 7", "greek gift"]),
    ("Check every capture and every check before you make a quiet move.", ["capture", "check"]),
    ("White is threatening a discovered attack once the knight moves away from d5.", ["discovered attack", "d 5"]),
    ("The isolated queen's pawn gives activity but becomes a target in the endgame.", ["isolated queens pawn", "endgame"]),
    ("Rook to the seventh rank, and the pawns on b7 and f7 are both attacked.", ["seventh rank", "b 7", "f 7"]),
    ("Promote to a knight here, because a new queen would be stalemate.", ["promote", "knight", "stalemate"]),
    ("The Queen's Gambit offers a pawn on c4 to win control of the centre.", ["queens gambit", "c 4"]),
    ("Black should not grab the poisoned pawn on b2 with the queen.", ["poisoned pawn", "b 2"]),
    ("Write down your candidate moves, then calculate the forcing lines first.", ["candidate moves", "forcing"]),
]

# The vocabulary a captions agent would pass to Whisper as initial_prompt.
CHESS_PROMPT = (
    "Chess lesson. Sicilian, Najdorf, Ruy Lopez, Caro-Kann, Queen's Gambit, English Attack, "
    "fianchetto, zugzwang, en passant, Greek gift, opposition, skewer, fork, pin, stalemate. "
    "Knight to f3, bishop to b5, e4, d5, castles queenside."
)
