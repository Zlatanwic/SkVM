---
name: tb-caffe-cifar-10
description: Install BVLC Caffe 1.0.0 and train a CNN on CIFAR-10 for exactly 500 iterations in CPU-only mode. Use this skill whenever the task mentions installing Caffe from source, building Caffe with CPU_ONLY, training on CIFAR-10, running the `cifar10_quick` solver, achieving test accuracy > 45% and within 5% of training accuracy, producing `cifar10_quick_iter_500.caffemodel`, or capturing training output to `/app/caffe/training_output.txt`. The skill covers: cloning the BVLC/caffe repository at v1.0.0, installing build dependencies (protobuf, BLAS, OpenCV, Boost, HDF5, glog, gflags, lmdb, leveldb, snappy), configuring CMake with `-DCPU_ONLY=ON`, fixing protobuf/Boost compatibility issues, downloading CIFAR-10 data, adjusting solver config for exactly 500 iterations, running training, and verifying accuracy thresholds.
---

# tb-caffe-cifar-10

Install BVLC Caffe 1.0.0 from source, configure for CPU-only, and train a
convolutional neural network on CIFAR-10 for exactly 500 iterations, achieving
test accuracy above 45% and within 5% of training accuracy.

## When this skill triggers

Use it when the user is dropped into the `caffe-cifar-10` Docker container and
needs to install the exact BVLC Caffe 1.0.0, train the CIFAR-10 quick model, and
meet specific accuracy thresholds. Do **not** use it for other Caffe versions
(like Caffe2, NVCaffe, or Intel Caffe) or other datasets -- this is specifically
about BVLC Caffe 1.0.0 + CIFAR-10 + 500 iterations + CPU-only mode.

## Goal (one sentence)

Clone Caffe 1.0.0 to `/app/caffe`, build it for CPU-only, download CIFAR-10,
train the `cifar10_quick` network for exactly 500 iterations, and verify that
test accuracy exceeds 45% and differs from train accuracy by no more than 5%.

## Required outputs

| File | Purpose |
|---|---|
| `/app/caffe/` | Built Caffe installation at version 1.0.0. |
| `/app/caffe/training_output.txt` | Captured stdout/stderr from the training run. |
| `/app/caffe/examples/cifar10/cifar10_quick_iter_500.caffemodel` | Trained model weights at iteration 500. |
| `/app/caffe/examples/cifar10/cifar10_quick_solver.prototxt` | Solver config, possibly adjusted for 500 iterations. |

## Recommended workflow

### 1. Clone Caffe and install dependencies (≈ 10 min)

```bash
git clone --depth 1 --branch 1.0 https://github.com/BVLC/caffe.git /app/caffe
cd /app/caffe
```

Install build dependencies (Ubuntu 24.04 base):
```bash
apt-get update && apt-get install -y \
  libprotobuf-dev protobuf-compiler \
  libopenblas-dev libatlas-base-dev \
  libboost-all-dev \
  libhdf5-serial-dev \
  libgflags-dev libgoogle-glog-dev \
  liblmdb-dev libleveldb-dev libsnappy-dev \
  libopencv-dev \
  cmake build-essential
```

### 2. Configure and build Caffe (CPU-only) (≈ 15 min)

```bash
mkdir build && cd build
cmake .. -DCPU_ONLY=ON -DBLAS=Open
make -j$(nproc)
make pycaffe   # optional but useful
```

Common issues:
- **Protobuf version mismatch**: Caffe 1.0 expects protobuf 2.x; Ubuntu 24.04
  ships protobuf 3.x. May need to set `-Dprotobuf_BUILD_SHARED_LIBS=ON` or
  install `libprotobuf-dev` from an older source.
- **HDF5 library naming**: Some distros use `libhdf5_serial.so` instead of
  `libhdf5.so`. Set `-DHDF5_LIBRARIES` in CMake or create symlinks.
- **Boost filesystem**: Caffe may link against `libboost_filesystem` instead of
  the expected variant. Adjust CMakeLists or symlink.

### 3. Download and prepare CIFAR-10 (≈ 5 min)

```bash
cd /app/caffe
./data/cifar10/get_cifar10.sh
./examples/cifar10/create_cifar10.sh
```

This downloads the CIFAR-10 binary dataset and converts it to LMDB format
under `examples/cifar10/cifar10_train_lmdb` and `cifar10_test_lmdb`.

### 4. Adjust solver for exactly 500 iterations (≈ 3 min)

Edit `examples/cifar10/cifar10_quick_solver.prototxt`:
```prototxt
# The default max_iter is often 4000 or 5000. Set it to 500:
max_iter: 500
# Ensure test_iter covers all 10,000 test images:
# 10,000 / batch_size = test_iter. If batch_size=100, test_iter=100.
test_iter: 100
# Test every 100 iterations (or adjust as needed):
test_interval: 100
# Snapshot at the final iteration:
snapshot: 500
snapshot_prefix: "examples/cifar10/cifar10_quick"
```

### 5. Train the model (≈ 20 min with 4 CPUs)

```bash
cd /app/caffe
./build/tools/caffe train \
  --solver=examples/cifar10/cifar10_quick_solver.prototxt \
  2>&1 | tee /app/caffe/training_output.txt
```

### 6. Verify outputs (≈ 3 min)

Check the training output file:
- Look for `Test net output` lines showing accuracy values.
- Confirm `test_accuracy > 0.45` (45%).
- Confirm `|train_accuracy - test_accuracy| <= 0.05` (5% gap).
- Confirm the model file exists:
  ```bash
  ls -la /app/caffe/examples/cifar10/cifar10_quick_iter_500.caffemodel
  ```

## Verifier checklist

- [ ] `/app/caffe/` exists and is a built Caffe 1.0.0 installation.
- [ ] Caffe is built in CPU-only mode (no CUDA dependency).
- [ ] CIFAR-10 data is downloaded and converted to LMDB.
- [ ] `cifar10_quick_solver.prototxt` has `max_iter: 500`.
- [ ] Training completed with exactly 500 iterations.
- [ ] Training output captured to `/app/caffe/training_output.txt`.
- [ ] `cifar10_quick_iter_500.caffemodel` exists in `examples/cifar10/`.
- [ ] Test accuracy > 45%.
- [ ] |train_accuracy - test_accuracy| <= 5%.

## Common pitfalls

1. **Training for the wrong number of iterations.** The default solver config
   may have 4000 or 5000 iterations. The verifier checks for exactly 500. If
   you don't edit `max_iter`, the model filename will be wrong and the verifier
   fails.
2. **GPU mode enabled.** Caffe defaults to GPU mode. Without `-DCPU_ONLY=ON`,
   the build tries to link CUDA and fails in a headless container. Always pass
   the CPU_ONLY CMake flag.
3. **Protobuf version conflict.** Caffe 1.0.0 is old and expects protobuf 2.x.
   Modern systems ship 3.x or newer. The `caffe.pb.h` header may fail to
   compile. Solutions: install an older protobuf or patch the protobuf usage
   in Caffe's C++ code.
4. **Not capturing stderr.** Some Caffe log output goes to stderr, not stdout.
   Use `2>&1 | tee` to capture everything, not just `>`.
5. **Wrong model filename.** The verifier expects
   `cifar10_quick_iter_500.caffemodel` (snake_case numbering matching
   `max_iter`). If you override `snapshot_prefix` or the iteration count,
   the filename changes.

## Reference pointers

- BVLC Caffe repository: https://github.com/BVLC/caffe (tag 1.0).
- Caffe CIFAR-10 tutorial: https://caffe.berkeleyvision.org/gathered/examples/cifar10.html
- Inside the task container, the verifier parses `training_output.txt` for
  accuracy values, checks the model file, and verifies the CPU-only build.
