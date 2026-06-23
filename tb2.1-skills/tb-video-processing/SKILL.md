---
name: tb-video-processing
description: Build a computer vision script to detect hurdle jump takeoff and landing frames in MP4 videos. Use this skill when the task mentions video analysis, hurdle jumping, `/app/jump_analyzer.py`, takeoff/landing frame detection, OpenCV, or producing `/app/output.toml` with `jump_takeoff_frame_number` and `jump_land_frame_number`. Also trigger when the user references monocular video analysis, motion detection, background subtraction, athlete tracking, or the example video at `/app/example_video.mp4`.
---

# tb-video-processing

Write a Python script that analyzes hurdle jump MP4 videos and outputs the
frame numbers for takeoff and landing in a TOML file. This is a Terminal-Bench
2.1 task; the full task lives at `tasks/video-processing/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `video-processing` Docker container
and needs to produce `/app/jump_analyzer.py` and `/app/output.toml`. Do **not**
use it for general video editing, object detection with deep learning models,
or analysis of non-hurdle sports videos.

## Goal (one sentence)

Detect the exact frame numbers where the athlete takes off for the jump and
where they land, using only OpenCV and numpy.

## Required outputs

| File | Purpose |
|---|---|
| `/app/jump_analyzer.py` | Python script taking an MP4 path as CLI argument, outputting `/app/output.toml`. |
| `/app/output.toml` | TOML file with `jump_takeoff_frame_number` (int) and `jump_land_frame_number` (int). |

## Recommended workflow

### 1. Study the example video (≈ 5 min)

- Load `/app/example_video.mp4` and extract metadata:
  ```python
  import cv2
  cap = cv2.VideoCapture('/app/example_video.mp4')
  fps = cap.get(cv2.CAP_PROP_FPS)
  total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
  width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
  height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
  ```
- Watch the video frame-by-frame to visually identify:
  - The first frame with no runner (given: frame 0 has no runner).
  - The frame where the athlete's foot leaves the ground (takeoff).
  - The frame where the athlete lands.

### 2. Design a motion-based detection approach (≈ 10 min)

Since the camera is stationary and the background is fixed:

1. **Background subtraction**: Use the first frame (no runner) as a reference.
   ```python
   bg = cv2.imread(first_frame)  # or capture frame 0
   for frame_num in range(total_frames):
       ret, frame = cap.read()
       diff = cv2.absdiff(frame, bg)
       gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
       _, thresh = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)
       motion_pixels = cv2.countNonZero(thresh)
   ```

2. **Region of Interest (ROI)**: The athlete occupies a specific region of the
   frame. Focus analysis on the track/hurdle area to avoid false signals from
   peripheral motion.

3. **Track motion over time**: Plot `motion_pixels` vs frame number. The jump
   creates a characteristic pattern:
   - Motion increases as the runner approaches.
   - Motion peaks or changes character at takeoff (vertical motion).
   - Motion changes again at landing (impact with ground).

### 3. Detect the takeoff frame (≈ 10 min)

Takeoff strategies:
- **Vertical motion onset**: Track the runner's bounding box centroid. When
  the vertical position suddenly increases (or the bounding box bottom edge
  rises), takeoff has occurred.
- **Optical flow direction change**: Compute dense optical flow. Before takeoff,
  flow is primarily horizontal. At takeoff, a vertical component appears.
- **Hurdle-relative position**: If the hurdle location is known (fixed camera),
  detect when the runner's leading point crosses a line just before the hurdle --
  takeoff occurs in nearby frames.

```python
# Simple approach: track centroid of foreground mask
contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
if contours:
    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)
    centroid_y = y + h  # bottom of bounding box
```

### 4. Detect the landing frame (≈ 10 min)

Landing strategies:
- **Rapid downward acceleration**: The centroid or bounding box bottom drops
  suddenly.
- **Motion spike on landing**: When the athlete hits the ground, there is a brief
  spike in frame-to-frame difference (impact vibration/body compression).
- **Velocity direction change**: After the parabola of flight, downward velocity
  suddenly stops (or changes to horizontal-only).

```python
# Track frame-to-frame difference
diffs = []
for i in range(1, total_frames):
    diff_score = cv2.norm(frames[i], frames[i-1], cv2.NORM_L2)
    diffs.append(diff_score)
# Landing often coincides with a local peak in diffs after the jump phase
```

### 5. Assemble and output (≈ 5 min)

```python
import sys
import toml
import cv2

def analyze_jump(video_path):
    # ... detection logic ...
    return takeoff_frame, land_frame

if __name__ == "__main__":
    video_path = sys.argv[1]
    takeoff, land = analyze_jump(video_path)
    output = {
        "jump_takeoff_frame_number": takeoff,
        "jump_land_frame_number": land
    }
    with open("/app/output.toml", "w") as f:
        toml.dump(output, f)
```

Test on the example:
```bash
python3 /app/jump_analyzer.py /app/example_video.mp4
cat /app/output.toml
```

## Verifier checklist (must all pass)

- [ ] `/app/jump_analyzer.py` exists and accepts a video path argument.
- [ ] Script runs without errors on MP4 files with the same dimensions/scale.
- [ ] `/app/output.toml` is produced with correct keys and integer values.
- [ ] `jump_takeoff_frame_number` is within ±N frames of the ground truth.
- [ ] `jump_land_frame_number` is within ±N frames of the ground truth.
- [ ] Only `toml`, `cv2`, and `numpy` are used as dependencies.

## Common pitfalls

1. **Hardcoding frame numbers from the example video.** The verifier tests on
   different videos. Your script must generalize -- use relative motion analysis,
   not absolute pixel positions or frame counts from the example.
2. **Confusing takeoff with approach motion.** The runner is moving before the
   jump, and simple motion detection flags the entire approach as activity. You
   need to distinguish the jump phase specifically -- look for the transition
   from running (horizontal motion) to jumping (vertical motion + clearance of
   the hurdle).
3. **Using deep learning or extra libraries.** Only `toml`, `cv2`, and `numpy`
   are available. Do not import `torch`, `tensorflow`, `ultralytics`, or other
   ML frameworks. They are not installed and will cause import errors.
4. **Ignoring the no-overlap assumption for first frame.** Frame 0 has no runner.
   Use it as the background reference and don't look for a jump before the
   runner enters the frame. If your algorithm somehow returns frame 0 or 1 as
   takeoff, it is wrong.
5. **Not handling video dimensions.** While all test videos have the same
   dimensions, your code should not hardcode specific coordinates. Use relative
   positioning (e.g., the hurdle is at roughly 2/3 of frame width, the track is
   the bottom third of the frame) based on proportions rather than absolute
   pixel values.

## Reference pointers

- OpenCV background subtraction: `cv2.absdiff`, `cv2.createBackgroundSubtractorMOG2`.
- OpenCV motion tracking: `cv2.findContours`, `cv2.boundingRect`, `cv2.calcOpticalFlowFarneback`.
- TOML output: `pip install toml`, then `toml.dump(dict, file)`.
- Example video: `/app/example_video.mp4` for development and testing.
