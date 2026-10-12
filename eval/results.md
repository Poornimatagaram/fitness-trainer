# Rep-count evaluation (lite model)

| Video | Exercise | View | True | Pred (python) | Pred (js) | Not counted | Pose detected |
|---|---|---|---|---|---|---|---|
| squat_demo.webm | squat | rear-3/4 | 2 | 2 | 2 | 0 | 100% |
| pushups_side.webm | pushup | side | 6 | 6 | 6 | 0 | 100% |

| Engine | Videos | Exact match | Within ±1 | MAE (reps) | Bias | Count accuracy |
|---|---|---|---|---|---|---|
| python | 2 | 100% | 100% | 0.00 | +0.00 | 100.0% |
| js | 2 | 100% | 100% | 0.00 | +0.00 | 100.0% |

Pose model throughput on this machine: 106 frames/s (average).

Count accuracy = 1 − Σ|predicted − true| / Σ true. Bias > 0 means over-counting.
