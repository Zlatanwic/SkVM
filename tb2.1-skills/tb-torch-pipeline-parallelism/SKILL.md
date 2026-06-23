---
name: tb-torch-pipeline-parallelism
description: Implement pipeline parallel training for LLaMA using PyTorch distributed with all-forward-all-backward (AFAB) scheduling. Use this skill when the task mentions pipeline parallelism, AFAB scheduling, `train_step_pipeline_afab`, `/app/pipeline_parallel.py`, `LlamaForCausalLM`, `torch.distributed.P2POp`, microbatches of hidden states, or partitioning model layers across processes. Also trigger when the user references `get_rank()`/`get_world_size()`, cross-entropy loss scaling by microbatches, or the constraint of not using hooks in the implementation.
---

# tb-torch-pipeline-parallelism

Implement a single training step with pipeline parallelism for LLaMA using
PyTorch distributed communication primitives and all-forward-all-backward (AFAB)
scheduling. This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/torch-pipeline-parallelism/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `torch-pipeline-parallelism` Docker
container and needs to write `/app/pipeline_parallel.py` with the
`train_step_pipeline_afab` function. Do **not** use it for general distributed
training, data parallelism, FSDP, tensor parallelism, or any scheduling scheme
other than AFAB.

## Goal (one sentence)

Implement `train_step_pipeline_afab(model, inputs, targets, device, dtype)` that
runs forward passes for all microbatches followed by backward passes for all
microbatches across multiple pipeline stages using P2P communication.

## Required outputs

| File | Purpose |
|---|---|
| `/app/pipeline_parallel.py` | Defines `train_step_pipeline_afab(model, inputs, targets, device, dtype)`. |

## Recommended workflow

### 1. Understand the AFAB schedule (≈ 5 min)

AFAB (All-Forward-All-Backward) is the simplest pipeline schedule:
1. **Forward phase**: Each rank processes all its microbatches in order,
   sending hidden states to the next rank via P2P sends, receiving from the
   previous rank.
2. **Backward phase**: Each rank processes all microbatches in reverse order,
   sending gradients to the previous rank, receiving from the next rank.

Contrast with 1F1B (one-forward-one-backward), which interleaves forward and
backward passes to reduce activation memory.

### 2. Partition the model layers (≈ 10 min)

- Determine `rank = torch.distributed.get_rank()` and
  `world_size = torch.distributed.get_world_size()`.
- `model` is a `LlamaForCausalLM` instance. Access its layers (likely
  `model.model.layers` or `model.transformer.h`).
- Split the layers evenly: `num_layers_per_rank = total_layers // world_size`.
  Handle remainder by assigning one extra layer to early ranks.
- Each rank extracts its slice:
  ```python
  start_layer = rank * layers_per_rank + min(rank, remainder)
  end_layer = start_layer + layers_per_rank + (1 if rank < remainder else 0)
  ```
- Move the layer slice to `device` and `dtype`.

### 3. Implement forward pass (≈ 15 min)

For each microbatch in `inputs` (on rank 0, these are input IDs; on other ranks,
they are received hidden states):

- **Rank 0**: Embed input IDs, then pass through local layers. Send output hidden
  states to rank 1 via `torch.distributed.P2POp`.
- **Rank 1 to world_size-2**: Receive hidden states from rank-1, run through local
  layers, send to rank+1.
- **Last rank**: Receive hidden states from rank-1, run through local layers +
  final LM head (if on this rank), compute cross-entropy loss against `targets`,
  scale loss by `1 / len(inputs)` (number of microbatches).

```python
from torch.distributed import P2POp

# Send: P2POp(op, tensor, peer)
send_op = P2POp(torch.distributed.isend, tensor, peer)
# Receive first to allocate buffer
recv_op = P2POp(torch.distributed.irecv, buffer, peer)
reqs = [recv_op, send_op]
[req.wait() for req in reqs]
```

### 4. Implement backward pass (≈ 15 min)

For each microbatch in **reverse order**:

- **Last rank**: Compute loss gradient, backpropagate through local layers.
  Send gradients (hidden state grads) to rank-1.
- **Middle ranks**: Receive gradients from rank+1, backpropagate through local
  layers, send input-side gradients to rank-1.
- **Rank 0**: Receive gradients from rank 1, backpropagate through local layers
  to complete the graph.

Key: the backward tensor shape is `[microbatch, seq_len, hidden_size]` -- same
shape as the forward hidden states.

### 5. Verify shape and device conventions (≈ 5 min)

- Rank 0 input: `[microbatch_size, seq_len]` (token IDs).
- Forward hidden states: `[microbatch_size, seq_len, hidden_size]` at `dtype`.
- Backward tensors: same shape as forward hidden states.
- Everything on `device` and cast to `dtype`.
- Loss scaling: divide total loss by number of microbatches (`len(inputs)`).
- Do **not** use hooks -- the verifier uses hooks for validation and will fail
  if your code also registers hooks.

## Verifier checklist (must all pass)

- [ ] `/app/pipeline_parallel.py` exists with `train_step_pipeline_afab` defined.
- [ ] Function signature matches: `train_step_pipeline_afab(model, inputs, targets, device, dtype)`.
- [ ] Model layers are partitioned roughly evenly across ranks.
- [ ] All forward passes run before any backward passes (AFAB scheduling).
- [ ] Microbatches are processed in the same order forward and reverse order backward.
- [ ] P2P communication uses `torch.distributed.P2POp`.
- [ ] Loss is scaled by `1 / num_microbatches`.
- [ ] No hooks are registered inside the implementation.
- [ ] Works with `world_size` of 1 and 2.
- [ ] Forward activations and backward gradients match reference.

## Common pitfalls

1. **Wrong communication pattern.** Forward sends hidden states to `rank+1`;
   backward sends gradients to `rank-1`. Reversing these (sending backward to
   `rank+1`) breaks the gradient chain. The sender and receiver must agree on
   the peer rank for each step.
2. **Not handling rank 0 input format.** Rank 0 receives token IDs (integers)
   and must embed them. Other ranks receive floating-point hidden states. If
   you run the embedding layer on rank 0 but also try to embed on other ranks,
   you get a shape or type mismatch.
3. **Forgetting loss scaling.** The loss on the last rank must be divided by
   `len(inputs)`. Without this, gradients are N times too large (N = number of
   microbatches), and the verifier's gradient comparison will fail.
4. **Using blocking sends/receives without proper ordering.** P2P communication
   requires careful ordering to avoid deadlocks. With blocking ops, ranks must
   alternate send/receive order. Using `isend`/`irecv` (non-blocking) with
   `wait()` is safer. A common deadlock: rank 0 sends to rank 1 while rank 1
   sends to rank 0 -- both wait forever. Use `irecv` first, then `isend`.
5. **Processing microbatches in the wrong order for backward.** The backward pass
   must go through microbatches in reverse order (last microbatch first). This
   matches autograd's expectation. Forward order on backward can cause subtle
   numerical differences.

## Reference pointers

- PyTorch distributed P2P ops: `torch.distributed.P2POp` and `isend`/`irecv`.
- Pipeline parallelism papers: GPipe (Huang et al., 2019) for the AFAB schedule;
  PipeDream (Narayanan et al., 2019) for 1F1B as contrast.
- LLaMA architecture: transformer layers are typically in `model.model.layers`
  (HuggingFace LLaMA) or `model.layers`.
- Process group is pre-initialized; use `torch.distributed.get_rank()` and
  `torch.distributed.get_world_size()` directly.
