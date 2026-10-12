"""Download two openly licensed sample clips so the evaluation can be reproduced.

The clips come from Wikimedia Commons and are NOT committed to this repo
(eval/videos/ is gitignored). Their labels are already in eval/labels.csv.

Usage: python eval/download_samples.py
"""

import urllib.request
from pathlib import Path

VIDEOS = Path(__file__).resolve().parent / "videos"

SAMPLES = [
    {
        "file": "squat_demo.webm",
        "url": "https://upload.wikimedia.org/wikipedia/commons/5/5c/Squat_-_exercise_demonstration_video.webm",
        "credit": "FitnessScape, CC BY 3.0",
        "page": "https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm",
    },
    {
        "file": "pushups_side.webm",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/98/Interval_Push-ups.webm",
        "credit": "Taco fleur, CC BY-SA 4.0",
        "page": "https://commons.wikimedia.org/wiki/File:Interval_Push-ups.webm",
    },
]


def main():
    VIDEOS.mkdir(exist_ok=True)
    for sample in SAMPLES:
        target = VIDEOS / sample["file"]
        if target.exists():
            print(f"have  {target.name}")
            continue
        print(f"fetch {target.name}  ({sample['credit']}, {sample['page']})")
        request = urllib.request.Request(sample["url"], headers={"User-Agent": "spotter-eval/1.0"})
        with urllib.request.urlopen(request) as response:
            target.write_bytes(response.read())
    print("Done. Now run: python eval/evaluate.py")


if __name__ == "__main__":
    main()
