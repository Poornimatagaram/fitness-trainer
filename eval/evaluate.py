"""Measure rep-count accuracy on labelled videos.

Pipeline per video:
  1. Run MediaPipe PoseLandmarker on every frame (the slow part) and cache the
     landmarks to eval/cache/<video>.<model>.json.
  2. Replay the cached landmarks through the rep counter: the Python reference,
     the web app's JavaScript engine (via Node), or both.
  3. Compare the counted reps with the human label.

labels.csv columns: video,exercise,true_reps,view,notes   (lines starting with # are ignored)

Usage:
  python eval/evaluate.py                       # Python engine, lite model
  python eval/evaluate.py --engine both         # also score the shipped JS engine
  python eval/evaluate.py --model full --refresh
"""

import argparse
import csv
import shutil
import sys
import time
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR.parent / "python"))

from spotter.exercises import EXERCISES  # noqa: E402
from spotter.session import count_reps_js, count_reps_python, frame_to_json, load_session, save_session  # noqa: E402


def read_labels(path):
    with open(path, newline="") as f:
        lines = [line for line in f if line.strip() and not line.lstrip().startswith("#")]
    rows = list(csv.DictReader(lines))
    for row in rows:
        row["true_reps"] = int(row["true_reps"])
        if row["exercise"] not in EXERCISES:
            raise ValueError(f"{row['video']}: unknown exercise {row['exercise']!r}")
    return rows


def extract_landmarks(video_path, cache_path, model):
    """Run the pose model over a video and save a session file. Returns frames/second processed."""
    import cv2  # imported here so --help works without OpenCV installed

    from spotter.pose_model import PoseDetector

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frames, started = [], time.time()
    with PoseDetector(model) as detector:
        index = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t_ms = index * 1000.0 / fps  # frame clock: reliable for every container format
            landmarks = detector.detect(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), t_ms)
            frames.append(frame_to_json(t_ms, landmarks))
            index += 1
    cap.release()
    save_session(cache_path, width, height, frames)
    return len(frames) / max(time.time() - started, 1e-6)


def metrics(pairs):
    """pairs: list of (true, predicted). Returns summary statistics."""
    n = len(pairs)
    errors = [p - t for t, p in pairs]
    total_true = sum(t for t, _ in pairs)
    return {
        "videos": n,
        "exact": sum(e == 0 for e in errors) / n,
        "within1": sum(abs(e) <= 1 for e in errors) / n,
        "mae": sum(abs(e) for e in errors) / n,
        "bias": sum(errors) / n,  # > 0 over-counts, < 0 under-counts
        "count_accuracy": max(0.0, 1 - sum(abs(e) for e in errors) / total_true) if total_true else 0.0,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--labels", default=EVAL_DIR / "labels.csv", type=Path)
    parser.add_argument("--videos", default=EVAL_DIR / "videos", type=Path)
    parser.add_argument("--cache", default=EVAL_DIR / "cache", type=Path)
    parser.add_argument("--model", choices=["lite", "full", "heavy"], default="lite")
    parser.add_argument("--engine", choices=["python", "js", "both"], default="python")
    parser.add_argument("--refresh", action="store_true", help="re-run the pose model even if cached")
    parser.add_argument("--out", default=EVAL_DIR / "results.md", type=Path, help="markdown report path")
    args = parser.parse_args()

    engines = ["python", "js"] if args.engine == "both" else [args.engine]
    if "js" in engines and not shutil.which("node"):
        sys.exit("The JS engine needs Node.js (https://nodejs.org).")

    rows = read_labels(args.labels)
    args.cache.mkdir(parents=True, exist_ok=True)
    results, speeds = [], []

    for row in rows:
        video = args.videos / row["video"]
        if not video.exists():
            print(f"skip  {row['video']}: not found in {args.videos}")
            continue
        cache = args.cache / f"{video.stem}.{args.model}.json"
        if args.refresh or not cache.exists():
            print(f"pose  {row['video']} ...", end=" ", flush=True)
            speed = extract_landmarks(video, cache, args.model)
            speeds.append(speed)
            print(f"{speed:.0f} frames/s")

        session = load_session(cache)
        predicted = {}
        for engine in engines:
            out = count_reps_python(session, row["exercise"]) if engine == "python" else \
                count_reps_js(cache, row["exercise"])
            predicted[engine] = out
        results.append({**row, "predicted": predicted, "frames": len(session["frames"]),
                        "detected": sum(f["landmarks"] is not None for f in session["frames"])})

    if not results:
        print("\nNo labelled videos found. Put clips in eval/videos/ and list them in eval/labels.csv")
        print("(or run: python eval/download_samples.py).")
        return

    # ---- Report ----
    lines = [f"# Rep-count evaluation ({args.model} model)", ""]
    header = "| Video | Exercise | View | True | " + " | ".join(f"Pred ({e})" for e in engines) + \
             " | Not counted | Pose detected |"
    lines += [header, "|" + "---|" * (header.count("|") - 1)]
    for r in results:
        preds = " | ".join(str(r["predicted"][e]["reps"]) for e in engines)
        partials = r["predicted"][engines[0]]["partials"]
        detected = f"{100 * r['detected'] / max(r['frames'], 1):.0f}%"
        lines.append(f"| {r['video']} | {r['exercise']} | {r['view']} | {r['true_reps']} | {preds} | "
                     f"{partials} | {detected} |")

    lines += ["", "| Engine | Videos | Exact match | Within ±1 | MAE (reps) | Bias | Count accuracy |",
              "|---|---|---|---|---|---|---|"]
    for engine in engines:
        m = metrics([(r["true_reps"], r["predicted"][engine]["reps"]) for r in results])
        lines.append(f"| {engine} | {m['videos']} | {m['exact']:.0%} | {m['within1']:.0%} | {m['mae']:.2f} | "
                     f"{m['bias']:+.2f} | {m['count_accuracy']:.1%} |")
    if speeds:
        lines += ["", f"Pose model throughput on this machine: {sum(speeds) / len(speeds):.0f} frames/s (average)."]
    lines += ["", "Count accuracy = 1 − Σ|predicted − true| / Σ true. Bias > 0 means over-counting."]

    report = "\n".join(lines) + "\n"
    print("\n" + report)
    args.out.write_text(report)
    print(f"Report written to {args.out}")


if __name__ == "__main__":
    main()
