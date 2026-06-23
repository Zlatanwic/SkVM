---
name: tb-kv-store-grpc
description: Build a gRPC key-value store server with Protocol Buffers. Create a .proto service definition, generate Python stubs with grpcio-tools, implement a server class that stores int values by string keys in a Python dict, and run the server on port 5328 in the background. Use this skill whenever the task mentions gRPC, protobuf, grpcio 1.73.0, generating _pb2.py and _pb2_grpc.py files, implementing a KVStore service with GetVal/SetVal RPCs, or creating /app/kv-store.proto, /app/server.py. Also trigger when the user references kv-store-grpc, port 5328, SetValRequest/GetValRequest message types, or running a gRPC server as a background process.
---

# tb-kv-store-grpc

Build a gRPC-based key-value store that stores integer values by string keys
in a Python dict, served over port 5328 using generated protobuf stubs. This
is one of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/kv-store-grpc/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `kv-store-grpc` Docker container
and needs to deliver a working proto definition, generated Python stubs, and
a running gRPC server. Do **not** use it for generic REST APIs, Redis-like
stores, or any non-gRPC key-value store.

## Goal (one sentence)

Define a `KVStore` gRPC service with `GetVal` and `SetVal` RPCs in a
`kv-store.proto` file, generate Python stubs, implement the server using a
Python dict as the backing store on port 5328, and keep it running in the
background.

## Required outputs

| File | Purpose |
|---|---|
| `/app/kv-store.proto` | Protocol Buffer service definition with `KVStore` service and `GetVal`/`SetVal` RPCs |
| `/app/kv_store_pb2.py` | Generated protobuf message classes (from `protoc` or `grpcio-tools`) |
| `/app/kv_store_pb2_grpc.py` | Generated gRPC client/server stub classes |
| `/app/server.py` | Python gRPC server implementation with a `Server` class |
| Running process on port 5328 | Background gRPC server process |

The verifier makes gRPC calls to `GetVal` and `SetVal` and checks that the
server correctly stores and retrieves integer values by string key.

## Recommended workflow

### 1. Install the exact versions of grpcio (≈ 3 min)

```bash
pip install grpcio==1.73.0 grpcio-tools==1.73.0 --system
```

The task requires these specific versions. Verify with:
```bash
pip show grpcio grpcio-tools | grep Version
```

### 2. Write the proto definition (≈ 5 min)

```protobuf
// /app/kv-store.proto
syntax = "proto3";

service KVStore {
    rpc GetVal(GetValRequest) returns (GetValResponse);
    rpc SetVal(SetValRequest) returns (SetValResponse);
}

message GetValRequest {
    string key = 1;
}

message GetValResponse {
    int32 val = 1;
}

message SetValRequest {
    string key = 1;
    int32 value = 2;
}

message SetValResponse {
    int32 val = 1;
}
```

Key details:
- The service name must be exactly `KVStore`.
- The RPC names are case-sensitive: `GetVal` and `SetVal`.
- `GetValRequest` has a single `key` field (string).
- `GetValResponse` has a single `val` field (int — use `int32`).
- `SetValRequest` has a `key` (string) and `value` (int).
- `SetValResponse` has a single `val` field (int).
- Use `syntax = "proto3"`.

### 3. Generate Python stubs (≈ 2 min)

```bash
cd /app
python3 -m grpc_tools.protoc \
  -I. \
  --python_out=. \
  --grpc_python_out=. \
  kv-store.proto
```

This produces:
- `kv_store_pb2.py` — message classes
- `kv_store_pb2_grpc.py` — service stub and servicer classes

Note: the generated filenames use underscores, matching the proto filename
`kv-store.proto` -> `kv_store_pb2.py`.

### 4. Implement the server (≈ 10 min)

```python
# /app/server.py
import grpc
from concurrent import futures
import kv_store_pb2
import kv_store_pb2_grpc


class Server(kv_store_pb2_grpc.KVStoreServicer):
    def __init__(self):
        self._store = {}

    def GetVal(self, request, context):
        key = request.key
        if key not in self._store:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"Key '{key}' not found")
            return kv_store_pb2.GetValResponse()
        return kv_store_pb2.GetValResponse(val=self._store[key])

    def SetVal(self, request, context):
        key = request.key
        value = request.value
        self._store[key] = value
        return kv_store_pb2.SetValResponse(val=self._store[key])


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    kv_store_pb2_grpc.add_KVStoreServicer_to_server(Server(), server)
    server.add_insecure_port('[::]:5328')
    server.start()
    server.wait_for_termination()


if __name__ == '__main__':
    serve()
```

Important details:
- The server class must be named `Server` (the task specifies this).
- It extends the generated `KVStoreServicer` class.
- The backing store is a plain `dict`.
- `SetVal` creates or updates the key; the response returns the stored value.
- `GetVal` returns the stored value. Handle missing keys gracefully
  (return a default or gRPC error status).
- Listen on `[::]:5328` to accept both IPv4 and IPv6 connections.
- Use an insecure port (no TLS) unless the task specifies otherwise.

### 5. Run the server in the background (≈ 2 min)

```bash
nohup python3 /app/server.py > /app/server.log 2>&1 &
```

Verify it is running:
```bash
sleep 2
ss -tlnp | grep 5328
```

## Verifier checklist (must all pass)

- [ ] `/app/kv-store.proto` exists with `KVStore` service and
  `GetVal`/`SetVal` RPCs.
- [ ] `/app/kv_store_pb2.py` and `/app/kv_store_pb2_grpc.py` are
  generated from the proto file.
- [ ] `/app/server.py` exists with a `Server` class implementing the
  gRPC servicer.
- [ ] Server is running and listening on port 5328.
- [ ] `SetVal` RPC stores an integer value for a string key.
- [ ] `GetVal` RPC retrieves the stored value for a given key.

## Common pitfalls

1. **Wrong protobuf field types.** The task uses `int` for values. In
   protobuf, this is `int32` (or `int64`). Using `string` or `float`
   will cause type mismatches at the verifier. The response `val` field
   should be `int32`, not `string`.
2. **Generated filenames not matching the proto filename.** If your proto
   is named `kv-store.proto`, protoc generates `kv_store_pb2.py` (dashes
   become underscores). Do not manually rename the generated files — the
   import paths must match.
3. **Server class named incorrectly.** The task specifies the class must
   be called `Server` inside `server.py`. Naming it `KVStoreServer`,
   `MyServer`, or anything else will cause the verifier's import to fail.
4. **Server not running in the background.** If `server.py` runs in the
   foreground, the setup script will hang. Always background with
   `nohup ... &` or equivalent.
5. **grpcio version mismatch.** The task requires grpcio 1.73.0
   specifically. Different versions may have incompatible generated code
   or API changes. Always install the exact version.

## Quick sanity test (run after starting the server)

```python
# test_client.py
import grpc
import kv_store_pb2
import kv_store_pb2_grpc

channel = grpc.insecure_channel('localhost:5328')
stub = kv_store_pb2_grpc.KVStoreStub(channel)

# Set a value
resp = stub.SetVal(kv_store_pb2.SetValRequest(key='foo', value=42))
print(f"SetVal returned: {resp.val}")  # Should be 42

# Get the value
resp = stub.GetVal(kv_store_pb2.GetValRequest(key='foo'))
print(f"GetVal returned: {resp.val}")  # Should be 42
```

## Reference pointers

- gRPC Python quickstart: https://grpc.io/docs/languages/python/quickstart/
- Protocol Buffers proto3 language guide: https://protobuf.dev/programming-guides/proto3/
- The `grpcio-tools` package provides `python3 -m grpc_tools.protoc`.
- Inside the task container, the verifier at the task root is the ground
  truth for what is scored.
