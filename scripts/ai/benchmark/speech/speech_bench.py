#!/usr/bin/env python3
"""Speech timing test for live captions (docs/ai/architecture/LIVE_CAPTIONS.md §5).

Normally started by run-speech-benchmark.sh inside a throwaway container:

    python -I speech_bench.py --self-test          # normaliser + WER checks, no models
    python -I speech_bench.py --work /work --out /out [--models base.en,small.en,distil-small.en]
                              [--clips 40] [--threads 2] [--smoke]

Data, none of it from a class:
  - LibriSpeech test-clean (CC BY 4.0, read LibriVox audiobooks): real speech, exact
    transcripts. Gives the real-time factor and general word error rate.
  - chess_script.py spoken by Piper's public-domain LJSpeech voice: chess-term recall,
    with and without the vocabulary prompt.

Translation: IndicTrans2 (en -> hin_Deva, tam_Taml) when /run/secrets/hf_token exists (the
model is gated on Hugging Face), otherwise opus-mt-en-hi (Apache-2.0) as a latency proxy.

Each model runs in its own subprocess so its peak RSS is its own.
Exit codes: 0 at least one STT model passes, 2 none does, 1 error.
"""

import argparse
import importlib.util
import json
import os
import re
import resource
import statistics
import subprocess
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
# The ELDA mirror ran ~15x faster than www.openslr.org (3.7 vs 0.25 MB/s) on 2026-10-19.
LIBRISPEECH_URLS = [
    "https://openslr.elda.org/resources/12/test-clean.tar.gz",
    "https://www.openslr.org/resources/12/test-clean.tar.gz",
]
PIPER_VOICE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx"
HF_TOKEN_FILE = Path("/run/secrets/hf_token")

# Coach finishes a phrase -> caption on screen. VAD needs ~0.5 s of silence to close a phrase.
VAD_TAIL_S = 0.5
PASS = {"captionLatencyP95S": 3.0, "chessTermRecall": 0.90, "peakRssGiB": 4.0, "rtfP95": 0.5, "wer": 0.08}


def load_chess_script():
    spec = importlib.util.spec_from_file_location("chess_script", HERE / "chess_script.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------- text scoring

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + ("" if rest == 0 else " " + number_words(rest))
    if n < 10000:
        rest = n % 1000
        return number_words(n // 1000) + " thousand" + ("" if rest == 0 else " " + number_words(rest))
    return " ".join(ONES[int(d)] for d in str(n))


def normalize(text):
    """Lowercase words; squares split ("f3" -> "f three"); digits spelled out; no punctuation."""
    t = text.lower().replace("’", "'").replace("'", "")
    t = re.sub(r"[^a-z0-9]+", " ", t)
    t = re.sub(r"([a-z])(\d)", r"\1 \2", t)
    t = re.sub(r"(\d)([a-z])", r"\1 \2", t)
    t = re.sub(r"\d+", lambda m: " " + number_words(int(m.group())) + " ", t)
    t = t.replace("defense", "defence").replace("center", "centre")
    # "end game" and "endgame" are the same word to a reader.
    return re.sub(r"\bend game\b", "endgame", " ".join(t.split()))


def word_errors(reference, hypothesis):
    ref, hyp = normalize(reference).split(), normalize(hypothesis).split()
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1], len(ref)


def wer(pairs):
    errors = words = 0
    for reference, hypothesis in pairs:
        e, n = word_errors(reference, hypothesis)
        errors, words = errors + e, words + n
    return errors / max(words, 1)


def term_hits(terms, hypothesis):
    hyp = f" {normalize(hypothesis)} "
    return sum(1 for term in terms if f" {normalize(term)} " in hyp)


def p95(values):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))]


def peak_rss_bytes():
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024


def self_test():
    checks = [
        (normalize("Knight to F3, then e4!") == "knight to f three then e four", "squares split and spelled"),
        (normalize("The Caro-Kann") == "the caro kann", "hyphen splits"),
        (normalize("Queen's Gambit") == "queens gambit", "apostrophe dropped"),
        (normalize("1890 games") == "one thousand eight hundred ninety games", "numbers spelled"),
        (word_errors("a b c d", "a x c") == (2, 4), "WER counts substitution + deletion"),
        (wer([("Knight to f3", "knight to F3.")]) == 0, "WER ignores case and punctuation"),
        (term_hits(["en passant", "d 6"], "an en passant capture on d6") == 2, "terms found"),
        (term_hits(["pin"], "a spin") == 0, "terms match whole words"),
        (term_hits(["endgame"], "In this end game") == 1, "end game == endgame"),
        (p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) == 10, "p95"),
    ]
    script = load_chess_script()
    for sentence, terms in script.CHESS_LINES:
        checks.append((term_hits(terms, sentence) == len(terms), f"reference contains its terms: {sentence[:40]}"))
    failed = [name for ok, name in checks if not ok]
    for name in failed:
        print(f"FAIL {name}")
    print(f"{len(checks) - len(failed)}/{len(checks)} self-test checks passed")
    return 1 if failed else 0


# ---------------------------------------------------------------- data

def download(urls, dest):
    """Tries each mirror in turn; a mirror that fails or stalls for 60 s is skipped."""
    if dest.exists():
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    for url in [urls] if isinstance(urls, str) else urls:
        print(f"  downloading {url}", flush=True)
        try:
            with urllib.request.urlopen(url, timeout=60) as response, open(tmp, "wb") as out:
                while chunk := response.read(1 << 20):
                    out.write(chunk)
            tmp.rename(dest)
            return dest
        except OSError as error:
            print(f"    failed: {error}", flush=True)
    raise RuntimeError(f"could not download {dest.name}")


def prepare(work, clips):
    """LibriSpeech: the first utterance of 8-30 words per speaker, speakers in id order."""
    from faster_whisper.audio import decode_audio

    libri_dir = work / "librispeech"
    manifest = work / "manifest.json"
    if manifest.exists():
        data = json.loads(manifest.read_text())
        if len(data["libri"]) >= clips:
            data["libri"] = data["libri"][:clips]
            return data

    tarball = download(LIBRISPEECH_URLS, work / "test-clean.tar.gz")
    if not libri_dir.exists():
        print("  extracting LibriSpeech test-clean", flush=True)
        with tarfile.open(tarball) as tar:
            tar.extractall(libri_dir, filter="data")
    tarball.unlink(missing_ok=True)

    per_speaker = {}
    for trans in sorted(libri_dir.rglob("*.trans.txt")):
        speaker = trans.name.split("-")[0]
        if speaker in per_speaker:
            continue
        for line in trans.read_text().splitlines():
            utt, text = line.split(" ", 1)
            if 8 <= len(text.split()) <= 30:
                per_speaker[speaker] = {"id": utt, "path": str(trans.parent / f"{utt}.flac"), "text": text}
                break
    libri = [per_speaker[s] for s in sorted(per_speaker, key=int)][:clips]
    for item in libri:
        item["seconds"] = len(decode_audio(item["path"])) / 16000

    print("  synthesising chess script (Piper, LJSpeech voice)", flush=True)
    from piper import PiperVoice
    import wave

    voice_path = download(PIPER_VOICE, work / "ljspeech.onnx")
    download(PIPER_VOICE + ".json", work / "ljspeech.onnx.json")
    voice = PiperVoice.load(str(voice_path))
    chess_dir = work / "chess"
    chess_dir.mkdir(exist_ok=True)
    chess = []
    for i, (sentence, terms) in enumerate(load_chess_script().CHESS_LINES):
        path = chess_dir / f"chess-{i:02d}.wav"
        with wave.open(str(path), "wb") as wav:
            voice.synthesize_wav(sentence, wav)
        chess.append({"path": str(path), "seconds": len(decode_audio(str(path))) / 16000, "terms": terms, "text": sentence})

    data = {"chess": chess, "libri": libri}
    manifest.write_text(json.dumps(data, indent=2))
    return data


# ---------------------------------------------------------------- STT

def run_stt(model_name, manifest, threads, work):
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio

    prompt = load_chess_script().CHESS_PROMPT
    started = time.perf_counter()
    model = WhisperModel(model_name, compute_type="int8", cpu_threads=threads, device="cpu", download_root=str(work / "models"))
    load_s = time.perf_counter() - started

    def transcribe(audio, initial_prompt=None):
        t0 = time.perf_counter()
        segments, _ = model.transcribe(
            audio, beam_size=1, condition_on_previous_text=False, initial_prompt=initial_prompt,
            language="en", vad_filter=False, without_timestamps=True,
        )
        text = "".join(s.text for s in segments).strip()  # the generator does the work
        return text, time.perf_counter() - t0

    transcribe(decode_audio(manifest["libri"][0]["path"]))  # warm-up, not counted

    libri = []
    for item in manifest["libri"]:
        text, seconds = transcribe(decode_audio(item["path"]))
        libri.append({"audioS": item["seconds"], "hyp": text, "id": item["id"], "procS": seconds, "ref": item["text"]})
        print(f"    {model_name} {item['id']}: {item['seconds']:.1f}s audio in {seconds:.2f}s", flush=True)

    chess = []
    for item in manifest["chess"]:
        audio = decode_audio(item["path"])
        plain, plain_s = transcribe(audio)
        prompted, prompted_s = transcribe(audio, prompt)
        chess.append({
            "audioS": item["seconds"], "plain": plain, "plainS": plain_s, "prompted": prompted,
            "promptedS": prompted_s, "ref": item["text"], "terms": item["terms"],
        })
        print(f"    {model_name} chess {len(chess)}/{len(manifest['chess'])}: {plain_s:.2f}s / {prompted_s:.2f}s (no prompt / prompt)", flush=True)
    return {"chess": chess, "libri": libri, "loadS": load_s, "model": model_name, "peakRssBytes": peak_rss_bytes()}


# ---------------------------------------------------------------- translation

def run_translate(sentences, threads, work):
    import torch

    torch.set_num_threads(threads)
    os.environ.setdefault("HF_HOME", str(work / "hf"))
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    token = HF_TOKEN_FILE.read_text().strip() if HF_TOKEN_FILE.exists() else None
    started = time.perf_counter()
    if token:
        from IndicTransToolkit.processor import IndicProcessor

        name = "ai4bharat/indictrans2-en-indic-dist-200M"
        tokenizer = AutoTokenizer.from_pretrained(name, token=token, trust_remote_code=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(name, token=token, trust_remote_code=True).eval()
        processor = IndicProcessor(inference=True)
        langs = ["hin_Deva", "tam_Taml"]

        def translate(sentence, lang):
            batch = processor.preprocess_batch([sentence], src_lang="eng_Latn", tgt_lang=lang)
            inputs = tokenizer(batch, padding="longest", return_tensors="pt", truncation=True)
            with torch.inference_mode():
                out = model.generate(**inputs, max_new_tokens=128, num_beams=1, use_cache=True)
            decoded = tokenizer.batch_decode(out, clean_up_tokenization_spaces=True, skip_special_tokens=True)
            return processor.postprocess_batch(decoded, lang=lang)[0]
    else:
        name = "Helsinki-NLP/opus-mt-en-hi"
        tokenizer = AutoTokenizer.from_pretrained(name)
        model = AutoModelForSeq2SeqLM.from_pretrained(name).eval()
        langs = ["hin_Deva"]

        def translate(sentence, _lang):
            inputs = tokenizer([sentence], return_tensors="pt", truncation=True)
            with torch.inference_mode():
                out = model.generate(**inputs, max_new_tokens=128, num_beams=1)
            return tokenizer.batch_decode(out, skip_special_tokens=True)[0]
    load_s = time.perf_counter() - started

    translate(sentences[0], langs[0])  # warm-up
    rows = []
    for sentence in sentences:
        row = {"en": sentence, "perLang": {}}
        for lang in langs:
            t0 = time.perf_counter()
            text = translate(sentence, lang)
            row["perLang"][lang] = {"s": time.perf_counter() - t0, "text": text}
        rows.append(row)
    return {"langs": langs, "loadS": load_s, "model": name, "peakRssBytes": peak_rss_bytes(), "proxy": not token, "rows": rows}


# ---------------------------------------------------------------- report

def summarize(stt, translation):
    libri, chess = stt["libri"], stt["chess"]
    rtf = [r["procS"] / r["audioS"] for r in libri]
    terms_total = sum(len(c["terms"]) for c in chess)
    trans_s = [sum(v["s"] for v in row["perLang"].values()) for row in translation["rows"]] if translation else []
    caption = [VAD_TAIL_S + c["promptedS"] + (trans_s[i] if i < len(trans_s) else 0) for i, c in enumerate(chess)]
    s = {
        "captionLatencyP50S": statistics.median(caption),
        "captionLatencyP95S": p95(caption),
        "chessTermRecall": sum(term_hits(c["terms"], c["prompted"]) for c in chess) / terms_total,
        "chessTermRecallNoPrompt": sum(term_hits(c["terms"], c["plain"]) for c in chess) / terms_total,
        "chessWer": wer([(c["ref"], c["prompted"]) for c in chess]),
        "chessWerNoPrompt": wer([(c["ref"], c["plain"]) for c in chess]),
        "loadS": stt["loadS"],
        "model": stt["model"],
        "peakRssGiB": (stt["peakRssBytes"] + (translation["peakRssBytes"] if translation else 0)) / 1024**3,
        "rtfMedian": statistics.median(rtf),
        "rtfP95": p95(rtf),
        "sttLatencyP95S": p95([c["promptedS"] for c in chess]),
        "sttOnlyRssGiB": stt["peakRssBytes"] / 1024**3,
        "wer": wer([(r["ref"], r["hyp"]) for r in libri]),
    }
    s["checks"] = {
        "captionLatencyP95S": s["captionLatencyP95S"] <= PASS["captionLatencyP95S"],
        "chessTermRecall": s["chessTermRecall"] >= PASS["chessTermRecall"],
        "peakRssGiB": s["peakRssGiB"] <= PASS["peakRssGiB"],
        "rtfP95": s["rtfP95"] <= PASS["rtfP95"],
        "wer": s["wer"] <= PASS["wer"],
    }
    s["pass"] = all(s["checks"].values())
    return s


def write_report(out, summaries, translation, meta, stt_results):
    ok = lambda b: "ok" if b else "**FAIL**"
    lines = [
        "# Speech timing test (live captions)",
        "",
        f"Run {meta['startedUtc']} UTC, {meta['threads']} threads, container limit {meta['cpus']} CPUs / {meta['memory']}. "
        f"{meta['libriClips']} LibriSpeech test-clean clips ({meta['libriAudioS']:.0f} s of audio), "
        f"{meta['chessClips']} synthetic chess sentences. faster-whisper int8, beam 1.",
        "",
        "Targets: real-time factor p95 ≤ 0.5, caption latency p95 ≤ 3 s (0.5 s VAD tail + STT + translation, "
        "all languages in sequence), LibriSpeech WER ≤ 8%, chess-term recall ≥ 90% (with the vocabulary prompt), "
        "peak RSS (STT + translator) ≤ 4 GiB.",
        "",
        "| Model | RTF p50 / p95 | Caption latency p50 / p95 | WER (LibriSpeech) | Chess terms (prompt / none) | Chess WER (prompt / none) | Peak RSS | Verdict |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for s in summaries:
        c = s["checks"]
        lines.append(
            f"| {s['model']} | {s['rtfMedian']:.2f} / {s['rtfP95']:.2f} {ok(c['rtfP95'])} "
            f"| {s['captionLatencyP50S']:.2f} / {s['captionLatencyP95S']:.2f} s {ok(c['captionLatencyP95S'])} "
            f"| {s['wer']:.1%} {ok(c['wer'])} "
            f"| {s['chessTermRecall']:.0%} / {s['chessTermRecallNoPrompt']:.0%} {ok(c['chessTermRecall'])} "
            f"| {s['chessWer']:.1%} / {s['chessWerNoPrompt']:.1%} "
            f"| {s['peakRssGiB']:.2f} GiB {ok(c['peakRssGiB'])} | {'PASS' if s['pass'] else 'FAIL'} |"
        )
    lines.append("")
    if translation:
        per_lang = {lang: [row["perLang"][lang]["s"] for row in translation["rows"]] for lang in translation["langs"]}
        lines += [
            f"Translation: `{translation['model']}`{' (**proxy**: IndicTrans2 is gated; pass a Hugging Face token to measure it)' if translation['proxy'] else ''}, "
            f"loaded in {translation['loadS']:.1f} s, peak RSS {translation['peakRssBytes'] / 1024**3:.2f} GiB.",
            "",
            "| Language | Per-sentence p50 / p95 |",
            "|---|---|",
        ]
        lines += [f"| {lang} | {statistics.median(v):.2f} / {p95(v):.2f} s |" for lang, v in per_lang.items()]
        lines += ["", "Sample translations (for a human to judge; quality isn't scored):", ""]
        for row in translation["rows"][:3]:
            lines.append(f"- {row['en']}")
            lines += [f"  - {lang}: {v['text']}" for lang, v in row["perLang"].items()]
    else:
        lines.append("Translation: **not measured** (the translator failed; see run.log).")
    lines += ["", "Missed chess terms (prompted run of the model with the best recall):", ""]
    best_name = max(summaries, key=lambda s: s["chessTermRecall"])["model"]
    best = next(r for r in stt_results if r["model"] == best_name)
    for c in best["chess"]:
        missed = [t for t in c["terms"] if term_hits([t], c["prompted"]) == 0]
        if missed:
            lines.append(f"- {best['model']}: {', '.join(missed)} — heard “{c['prompted']}”")
    lines += [
        "",
        "Limits of this test: the chess sentences are a synthetic US voice (an Indian-accented coach, a laptop mic and "
        "room noise will all score worse); clips are pre-cut phrases, so a live VAD's mis-cuts aren't measured; "
        "this box is not the hardware captions would run on (LIVE_CAPTIONS.md §3).",
    ]
    (out / "report.md").write_text("\n".join(lines) + "\n")


def child(argv):
    """Runs one model in a fresh process; prints its JSON result on the last line."""
    kind, payload_path, threads, work = argv
    payload = json.loads(Path(payload_path).read_text())
    if kind == "stt":
        result = run_stt(payload["model"], payload["manifest"], int(threads), Path(work))
    else:
        result = run_translate(payload["sentences"], int(threads), Path(work))
    print("RESULT " + json.dumps(result), flush=True)


def spawn(kind, payload, threads, work):
    payload_path = work / f"payload-{kind}.json"
    payload_path.write_text(json.dumps(payload))
    # Streams the child's progress lines as they come, so a long model run isn't silent.
    result = None
    with subprocess.Popen(
        [sys.executable, "-I", __file__, "--child", kind, str(payload_path), str(threads), str(work)],
        stdout=subprocess.PIPE, text=True,
    ) as proc:
        for line in proc.stdout:
            if line.startswith("RESULT "):
                result = json.loads(line[len("RESULT "):])
            else:
                print(line, end="", flush=True)
    if proc.returncode != 0 or result is None:
        raise RuntimeError(f"{kind} child exited {proc.returncode}")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--child", nargs=4)
    parser.add_argument("--work", default="/work")
    parser.add_argument("--out", default="/out")
    parser.add_argument("--models", default="base.en,small.en,distil-small.en")
    parser.add_argument("--clips", type=int, default=40)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--cpus", default="?")
    parser.add_argument("--memory", default="?")
    parser.add_argument("--smoke", action="store_true", help="base.en, 4 clips, 4 chess sentences")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.child:
        child(args.child)
        return 0

    work, out = Path(args.work), Path(args.out)
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    models = ["base.en"] if args.smoke else args.models.split(",")
    started = time.strftime("%Y-%m-%d %H:%M", time.gmtime())

    print("Preparing audio", flush=True)
    manifest = prepare(work, 4 if args.smoke else args.clips)
    if args.smoke:
        manifest["chess"] = manifest["chess"][:4]

    print("Translation", flush=True)
    try:
        translation = spawn("translate", {"sentences": [c["text"] for c in manifest["chess"]]}, args.threads, work)
    except RuntimeError as error:
        print(f"  translation failed: {error}", flush=True)
        translation = None

    stt_results, summaries = [], []
    for model in models:
        print(f"STT {model}", flush=True)
        result = spawn("stt", {"manifest": manifest, "model": model}, args.threads, work)
        stt_results.append(result)
        summaries.append(summarize(result, translation))

    meta = {
        "chessClips": len(manifest["chess"]), "cpus": args.cpus, "libriAudioS": sum(i["seconds"] for i in manifest["libri"]),
        "libriClips": len(manifest["libri"]), "memory": args.memory, "startedUtc": started, "threads": args.threads,
    }
    (out / "results.json").write_text(json.dumps({"meta": meta, "pass": PASS, "stt": stt_results, "summaries": summaries,
                                                   "translation": translation}, ensure_ascii=False, indent=2))
    write_report(out, summaries, translation, meta, stt_results)
    print((out / "report.md").read_text(), flush=True)
    return 0 if any(s["pass"] for s in summaries) else 2


if __name__ == "__main__":
    sys.exit(main())
