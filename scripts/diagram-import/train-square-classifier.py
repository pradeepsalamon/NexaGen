#!/usr/bin/env python3
"""Trains the square classifier of the PDF diagram import.

    npx tsx scripts/diagram-import/real-books/real-books.mts export <work-dir> <data-dir> [extra-labels.json]
    node scripts/diagram-import/export-piece-images.mjs <data-dir>
    python scripts/diagram-import/train-square-classifier.py <data-dir> <model.pt> <held-out-book|none> <steps> <seed> [test-book ...]
    python scripts/diagram-import/export-square-model.py <model.pt>

40% of each batch is real labelled squares from public-domain books (real-books/
manifest.json), the rest synthetic squares drawn from the vendored piece sets on hatched,
flat and tinted backgrounds. Pass a book id as <held-out-book> to measure on a font the
model hasn't seen, and `none` to train the model that ships. Needs numpy and torch. A
CPU is enough: 14,000 steps takes about thirty minutes on one core.
"""
import json, math, os, sys, time
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
D, OUT, HOLD, STEPS, SEED, *TESTS = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), *sys.argv[6:]
np.random.seed(SEED); torch.manual_seed(SEED); rng = np.random.default_rng(SEED)
CL = ".KQRBNPkqrbnp"; IDX = {c: i for i, c in enumerate(CL)}; N = 32
# Keep in step with real-books/manifest.json.
BOOKS = ["chessfundamental00capa", "middlegameinches00znos", "commonsenseinche00laskrich", "artofchess00maso", "chesslyricscolle00mack", "modernchessinstr00steirich", "grandtacticsofch00younrich", "chessopeningsanc00freerich"]
def load(b):
    m = json.load(open(f"{D}/{b}.json")); X = np.fromfile(f"{D}/{b}.bin", dtype=np.float32).reshape(-1, N, N)
    return X, np.array([IDX[c] for c in m["labels"]]), m["names"]
train = [load(b) for b in BOOKS if b != HOLD]
Xr = np.concatenate([t[0] for t in train]); Yr = np.concatenate([t[1] for t in train])
print("real train", Xr.shape, "pieces", int((Yr > 0).sum()), flush=True)
byc = [np.where(Yr == i)[0] for i in range(13)]
P = np.fromfile(f"{D}/pieces.bin", dtype=np.uint8).reshape(-1, 64, 64, 4).astype(np.float32) / 255  # sets×12
G = P[..., :3].mean(-1); A = P[..., 3]
yy, xx = np.mgrid[0:64, 0:64].astype(np.float32)
def pool(a):
    return 0.25 * (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])
def blur(x, k):
    for _ in range(k):
        x = (x + np.roll(x, 1, 0) + np.roll(x, -1, 0) + np.roll(x, 1, 1) + np.roll(x, -1, 1)) / 5
    return x
def synth(c):
    dark = rng.random() < .5
    bg = np.ones((64, 64), np.float32)
    if not dark and rng.random() < .15:
        bg = bg * rng.uniform(.82, 1)  # a highlighted or tinted square
    if dark:
        if rng.random() < .5:
            a = rng.choice([45, 45, 45, 135, 0, 90]) * math.pi / 180 + rng.normal(0, .05)
            sp = rng.uniform(3, 8); th = rng.uniform(.25, .65); ink = rng.uniform(.5, 1)
            ph = rng.uniform(0, sp); t = (xx * math.cos(a) + yy * math.sin(a) + ph) % sp
            bg = 1 - ink * (t < sp * th)
        else:
            bg = bg * rng.uniform(.4, .88)
    img = bg.copy()
    if c > 0:
        i = rng.integers(0, A.shape[0] // 12) * 12 + (c - 1)
        # Other fonts draw the same piece taller, wider, leaning or heavier than these do.
        s = rng.uniform(.62, 1.0); sx = s * rng.uniform(.82, 1.18); shear = rng.uniform(-.08, .08)
        px = (xx - 32 + shear * (yy - 32)) / sx + 32; py = (yy - 32 + rng.uniform(-3, 3)) / s + 32
        ix = np.clip(px.astype(np.int32), 0, 63); iy = np.clip(py.astype(np.int32), 0, 63)
        mask = (px >= 0) & (px < 64) & (py >= 0) & (py < 64)
        al = A[i][iy, ix] * mask; gr = G[i][iy, ix]
        if rng.random() < .35:
            al = (blur(al, 2) > rng.uniform(.2, .65)).astype(np.float32)
        if dark and rng.random() < .45:  # a cut-out halo in the hatching
            h = blur((al > .5).astype(np.float32), 3) > .05; img = np.where(h, 1.0, img)
        if rng.random() < .3:  # poorly inked: the piece's ink prints gray
            gr = 1 - (1 - gr) * rng.uniform(.55, .95)
        img = img * (1 - al) + gr * al
    else:
        pass
    x = pool(img)
    x = blur(x, int(rng.choice([0, 0, 1, 2])))
    if rng.random() < .2:  # ink specks and smudges
        for _ in range(rng.integers(1, 5)):
            cx, cy, r = rng.uniform(0, 32), rng.uniform(0, 32), rng.uniform(.5, 2.2)
            x = np.where((np.mgrid[0:N, 0:N][1] - cx) ** 2 + (np.mgrid[0:N, 0:N][0] - cy) ** 2 < r * r, x * rng.uniform(.3, .8), x)
    return x
def aug(x):
    dx, dy = rng.integers(-2, 3, 2)
    x = np.roll(np.roll(x, dx, 1), dy, 0)
    if rng.random() < .5: x = x[:, ::-1]
    if rng.random() < .6:
        x = x ** rng.uniform(.75, 1.35)
        x = x * rng.uniform(.9, 1.0) + rng.normal(0, rng.uniform(0, .05), x.shape)
    return np.clip(x, 0, 1)
def batch(n):
    xs, ys = [], []
    for k in range(n):
        c = int(rng.integers(0, 13)) if rng.random() > .3 else 0
        if rng.random() < .4 and len(byc[c]):
            j = rng.choice(byc[c]); xs.append(aug(Xr[j].copy()))
        else:
            xs.append(aug(synth(c)))
        ys.append(c)
    return torch.tensor(np.stack(xs), dtype=torch.float32).unsqueeze(1), torch.tensor(ys)
class Net(nn.Module):
    def __init__(s):
        super().__init__()
        s.c1 = nn.Conv2d(1, 12, 3, padding=1); s.c2 = nn.Conv2d(12, 24, 3, padding=1); s.c3 = nn.Conv2d(24, 48, 3, padding=1)
        s.f1 = nn.Linear(768, 64); s.f2 = nn.Linear(64, 13)
    def forward(s, x):
        x = (x - .5) * 2
        x = F.max_pool2d(F.relu(s.c1(x)), 2); x = F.max_pool2d(F.relu(s.c2(x)), 2); x = F.max_pool2d(F.relu(s.c3(x)), 2)
        return s.f2(F.relu(s.f1(x.flatten(1))))
net = Net(); print("params", sum(p.numel() for p in net.parameters()), flush=True)
opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=STEPS)
def evaluate(b):
    X, Y, names = load(b); net.eval()
    with torch.no_grad(): pr = net(torch.tensor(X).unsqueeze(1)).softmax(1).numpy()
    net.train(); yh = pr.argmax(1); ok = yh == Y; conf = pr.max(1)
    bo = ok.reshape(-1, 64).all(1).sum(); pc = Y > 0
    return f"{b[:14]:15s} squares {ok.mean()*100:5.1f}% pieces {ok[pc].mean()*100:5.1f}% perfect {bo}/{len(names)} wrong {int((~ok).sum())} wrong<0.7 {int(((~ok)&(conf<.7)).sum())} right<0.7 {int((ok&(conf<.7)).sum())}"
t0 = time.time(); run = 0
for step in range(STEPS):
    x, y = batch(64); loss = F.cross_entropy(net(x), y, label_smoothing=.03)
    opt.zero_grad(); loss.backward(); opt.step(); sch.step(); run = .98 * run + .02 * loss.item()
    if (step + 1) % 500 == 0:
        print(step + 1, f"loss {run:.3f} {time.time()-t0:.0f}s", flush=True)
        if HOLD != "none": print("  hold", evaluate(HOLD), flush=True)
        for t in TESTS: print("  test", evaluate(t), flush=True)
torch.save(net.state_dict(), OUT)
for b in BOOKS + TESTS: print("FINAL", evaluate(b), flush=True)
