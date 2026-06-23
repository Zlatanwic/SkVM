---
name: tb-torch-tensor-parallelism
description: Implement tensor parallelism for PyTorch linear layers with column-wise and row-wise weight sharding. Use this skill when the task mentions tensor parallelism, `ColumnParallelLinear`, `RowParallelLinear`, `/app/parallel_linear.py`, splitting weights by columns or rows, `master_weight`, `all_gather`, `all_reduce`, or sharding linear layer parameters across distributed processes. Also trigger when the user references `torch.distributed.get_world_size()`/`get_rank()`, bias sharding patterns, or gradient correctness for sharded weights.
---

# tb-torch-tensor-parallelism

Implement two tensor-parallel linear layer classes -- `ColumnParallelLinear`
and `RowParallelLinear` -- with correct weight sharding, forward/backward
computation, and gradient aggregation. This is a Terminal-Bench 2.1 task; the
full task lives at `tasks/torch-tensor-parallelism/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `torch-tensor-parallelism` Docker
container and needs to write `/app/parallel_linear.py` with the two classes.
Do **not** use it for general PyTorch `nn.Linear`, data parallelism (DDP),
or Megatron-LM-style full model parallelism -- this is specifically about
two linear layer sharding primitives.

## Goal (one sentence)

Implement `ColumnParallelLinear` (split by output columns, all-gather outputs)
and `RowParallelLinear` (split by input rows, all-reduce partial sums) with
correct weight/bias sharding and gradient propagation.

## Required outputs

| File | Purpose |
|---|---|
| `/app/parallel_linear.py` | Defines `ColumnParallelLinear` and `RowParallelLinear`, both inheriting from `torch.nn.Module`. |

## Recommended workflow

### 1. Understand the two sharding patterns (≈ 5 min)

**ColumnParallelLinear**: Weight matrix `W` of shape `[out_features, in_features]`
is split by columns (output dimension). Each rank gets
`W_chunk = W[start_out:end_out, :]` with shape `[out_features/world_size, in_features]`.
- Forward: each rank computes `y_chunk = input @ W_chunk.T + bias_chunk`.
  Outputs are concatenated via `all_gather`.
- Bias sharding: split along output dimension, same as weight.

**RowParallelLinear**: Weight matrix `W` is split by rows (input dimension).
Each rank gets `W_chunk = W[:, start_in:end_in]` with shape
`[out_features, in_features/world_size]`.
- Forward: **Input is pre-scattered** -- each rank receives only its slice of
  the input. Compute `y_chunk = input_chunk @ W_chunk.T + bias` (bias is full).
  Partial outputs summed via `all_reduce`.
- Bias: kept full on each rank (not sharded).

### 2. Implement ColumnParallelLinear (≈ 15 min)

```python
class ColumnParallelLinear(nn.Module):
    def __init__(self, in_features, out_features, bias, master_weight):
        super().__init__()
        self.world_size = torch.distributed.get_world_size()
        self.rank = torch.distributed.get_rank()
        local_out = out_features // self.world_size
        
        # Shard master_weight (shape: [out_features, in_features])
        start = self.rank * local_out
        end = start + local_out
        self.weight = nn.Parameter(master_weight[start:end, :].clone())
        
        # Bias: shard along output dimension
        if bias:
            self.bias = nn.Parameter(torch.zeros(local_out))
        else:
            self.bias = None
    
    def forward(self, x):
        y_local = F.linear(x, self.weight, self.bias)
        # Gather outputs from all ranks
        y_list = [torch.empty_like(y_local) for _ in range(self.world_size)]
        torch.distributed.all_gather(y_list, y_local)
        return torch.cat(y_list, dim=-1)
```

### 3. Implement RowParallelLinear (≈ 15 min)

```python
class RowParallelLinear(nn.Module):
    def __init__(self, in_features, out_features, bias, master_weight):
        super().__init__()
        self.world_size = torch.distributed.get_world_size()
        self.rank = torch.distributed.get_rank()
        local_in = in_features // self.world_size
        
        # Shard master_weight (shape: [out_features, in_features]) by columns
        start = self.rank * local_in
        end = start + local_in
        self.weight = nn.Parameter(master_weight[:, start:end].clone())
        
        # Bias: full (not sharded)
        if bias:
            self.bias = nn.Parameter(torch.zeros(out_features))
        else:
            self.bias = None
    
    def forward(self, x):
        # x is already pre-scattered: shape [batch, in_features/world_size]
        y_local = F.linear(x, self.weight, self.bias)
        torch.distributed.all_reduce(y_local)
        return y_local
```

### 4. Handle world_size=1 edge case (≈ 3 min)

When `world_size == 1`:
- ColumnParallelLinear: `local_out = out_features`, take the full `master_weight`.
  `all_gather` with one rank is a no-op (just returns the tensor).
- RowParallelLinear: `local_in = in_features`, take the full `master_weight`.
  `all_reduce` with one rank is a no-op.
- Both should produce numerically identical results to a regular `nn.Linear`.

### 5. Verify gradients (≈ 10 min)

- Check that `weight.grad` is correctly computed for both classes.
- For ColumnParallelLinear, each rank's weight chunk gets the gradient for its
  output columns only.
- For RowParallelLinear, `all_reduce` in forward means the gradient is already
  correct for each rank's weight chunk (the backward of `all_reduce` is also
  `all_reduce`, distributing the full gradient).

## Verifier checklist (must all pass)

- [ ] `/app/parallel_linear.py` exists with both classes defined.
- [ ] Both classes inherit from `torch.nn.Module`.
- [ ] `ColumnParallelLinear`: weight split by output dimension, bias sharded.
- [ ] `ColumnParallelLinear`: output is concatenated via `all_gather`.
- [ ] `RowParallelLinear`: weight split by input dimension, bias full.
- [ ] `RowParallelLinear`: input is pre-scattered; partial outputs summed via `all_reduce`.
- [ ] Both classes accept and split `master_weight` in `__init__`.
- [ ] Weights and biases produce correct gradients.
- [ ] Works with `world_size` of 1, 2, and 4.

## Common pitfalls

1. **Confusing which dimension is the output dimension for column vs row.**
   `ColumnParallelLinear` splits the output dimension: each rank computes a
   subset of output features. `RowParallelLinear` splits the input dimension:
   each rank processes a subset of input features. Swapping these gives wrong
   shapes.
2. **Misunderstanding the RowParallelLinear bias.** The bias is NOT sharded for
   `RowParallelLinear` -- it stays full on every rank. This is because each rank
   computes partial contributions to ALL output features (not a subset). The
   `all_reduce` sums these partial contributions.
3. **Incorrect weight sharding for RowParallelLinear.** The `master_weight` is
   `[out_features, in_features]`. You split `in_features` (dimension 1) for
   RowParallelLinear, not `out_features`. Each rank gets `W[:, start:end]`.
4. **Forgetting to clone the weight slice.** `master_weight[start:end, :]`
   creates a view. If you don't `.clone()`, the later `nn.Parameter()` wrapper
   may share storage with the master weight or behave unexpectedly during
   autograd. Always clone.
5. **Not testing with world_size=1.** The verifier tests `world_size=1`. If your
   dimension calculations use integer division and don't handle the case where
   `local_out == out_features`, tests will fail.

## Reference pointers

- Megatron-LM paper (Shoeybi et al., 2019) for the theoretical basis of tensor
  parallelism with ColumnParallelLinear and RowParallelLinear.
- `torch.distributed.all_gather` and `torch.distributed.all_reduce` documentation.
- `F.linear(input, weight, bias)` for the forward computation.
- Process group is pre-initialized; use `torch.distributed.get_rank()` and
  `torch.distributed.get_world_size()`.
