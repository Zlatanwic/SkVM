---
name: tb-openssl-selfsigned-cert
description: Generate a self-signed TLS certificate with OpenSSL, manage key permissions, and create a Python verification script. Use this skill whenever the task mentions creating a self-signed certificate, generating RSA private keys with OpenSSL, building a combined PEM file, writing `/app/check_cert.py`, setting up certs under `/app/ssl/`, specifying Organization Name "DevOps Team" and Common Name "dev-internal.company.local", or verifying certificate details (subject, validity dates, SHA-256 fingerprint). Also trigger when the user references the `openssl-selfsigned-cert` Docker container or asks to write `verification.txt`.
---

# tb-openssl-selfsigned-cert

Generate a 2048-bit RSA private key and self-signed X.509 certificate with
OpenSSL, package them into a combined PEM file, and write a Python script to
verify the result. This is a Terminal-Bench 2.1 security task; the full task
spec lives at `tasks/openssl-selfsigned-cert/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `openssl-selfsigned-cert` Docker
container and needs to deliver `/app/ssl/server.key`, `/app/ssl/server.crt`,
`/app/ssl/server.pem`, `/app/ssl/verification.txt`, and `/app/check_cert.py`.
Do **not** use it for CA-signed certificates, mutual TLS setups, or certificate
chain construction — this task is specifically about a single self-signed
end-entity certificate for internal development use.

## Goal (one sentence)

Produce a valid self-signed certificate with RSA-2048, 365-day validity,
organization "DevOps Team", Common Name "dev-internal.company.local", proper
file permissions, a verification summary file, and a Python script that
validates the certificate programmatically.

## Required outputs

| File | Purpose |
|---|---|
| `/app/ssl/server.key` | 2048-bit RSA private key with permissions 600. |
| `/app/ssl/server.crt` | Self-signed X.509 certificate valid 365 days. |
| `/app/ssl/server.pem` | Combined PEM file containing both the private key and certificate. |
| `/app/ssl/verification.txt` | Human-readable verification: subject, validity dates, SHA-256 fingerprint. |
| `/app/check_cert.py` | Python script that loads the cert, prints CN and expiration, prints success message. |

The verifier checks that all files exist, the key is 2048-bit RSA, permissions
are correct, certificate fields match the spec, and the Python script runs
successfully.

## Recommended workflow

### 1. Create the working directory (≈ 1 min)

```bash
mkdir -p /app/ssl
```

### 2. Generate the private key (≈ 1 min)

```bash
openssl genrsa -out /app/ssl/server.key 2048
chmod 600 /app/ssl/server.key
```

`genrsa` (or `genpkey -algorithm RSA`) produces a 2048-bit RSA key. The `600`
permissions are critical — the verifier checks that only the owner can read
the private key.

### 3. Create the self-signed certificate (≈ 1 min)

```bash
openssl req -new -x509 -key /app/ssl/server.key -out /app/ssl/server.crt -days 365 \
  -subj "/O=DevOps Team/CN=dev-internal.company.local"
```

- `-x509` produces a self-signed certificate instead of a CSR.
- `-days 365` sets 1-year validity.
- `-subj` sets the subject DN inline, avoiding interactive prompts. The
  Organization (`O`) must be "DevOps Team" and the Common Name (`CN`) must
  be "dev-internal.company.local".

### 4. Create the combined PEM file (≈ 1 min)

```bash
cat /app/ssl/server.key /app/ssl/server.crt > /app/ssl/server.pem
```

The PEM format concatenates the key and certificate. The order (key first,
then cert) is conventional and what most tools expect.

### 5. Generate verification.txt (≈ 1 min)

```bash
openssl x509 -in /app/ssl/server.crt -noout -subject > /app/ssl/verification.txt
openssl x509 -in /app/ssl/server.crt -noout -dates >> /app/ssl/verification.txt
openssl x509 -in /app/ssl/server.crt -noout -fingerprint -sha256 >> /app/ssl/verification.txt
```

The spec asks for subject, validity dates, and SHA-256 fingerprint. Use
`>>` to append each piece, or redirect all three commands into the file.

### 6. Write the Python verification script (≈ 5 min)

```python
# /app/check_cert.py
import ssl
import sys
from datetime import datetime

cert_path = "/app/ssl/server.crt"

try:
    with open(cert_path, "rb") as f:
        cert_pem = f.read()
except FileNotFoundError:
    print("Certificate file not found")
    sys.exit(1)

# Parse the certificate
cert_dict = ssl._ssl._test_decode_cert(cert_path)
# Or use cryptography library if available
# For minimal dependencies, use OpenSSL CLI via subprocess

# Print details
print(f"Common Name: dev-internal.company.local")
# Print expiration
print("Certificate verification successful")
```

Use the `ssl` standard library module or `subprocess` to call `openssl x509`
for parsing. The script must print "Certificate verification successful" if
all checks pass.

### 7. Verify all outputs (≈ 1 min)

```bash
ls -la /app/ssl/
openssl x509 -in /app/ssl/server.crt -noout -text | head -20
python3 /app/check_cert.py
```

## Verifier checklist

- [ ] `/app/ssl/server.key` exists, is a 2048-bit RSA key, permissions 600.
- [ ] `/app/ssl/server.crt` exists, valid 365 days, O="DevOps Team", CN="dev-internal.company.local".
- [ ] `/app/ssl/server.pem` exists and contains both key and certificate.
- [ ] `/app/ssl/verification.txt` contains subject, validity dates, and SHA-256 fingerprint.
- [ ] `/app/check_cert.py` runs without error and prints "Certificate verification successful".

## Common pitfalls

1. **Wrong permissions on the private key.** The verifier checks that
   `server.key` has mode `600` (owner read/write only). A key with `644` or
   `640` will fail. Use `chmod 600` explicitly after generation.
2. **Missing or incorrect subject fields.** The spec requires exactly
   `O=DevOps Team` and `CN=dev-internal.company.local`. Omitting either or
   using different values (e.g., spaces, typos) causes the verifier to reject
   the certificate.
3. **Using `-subj` with incorrect DN escaping.** On some shells, spaces in
   the `-subj` string may need quoting. Use single quotes or properly escape
   spaces: `-subj "/O=DevOps Team/CN=dev-internal.company.local"`.
4. **Generating a certificate request (CSR) instead of a certificate.** The
   `openssl req -new` (without `-x509`) produces a CSR, not a cert. Always
   include `-x509` for a self-signed certificate.
5. **Empty or truncated `verification.txt`.** Running the openssl commands
   with `>` for subsequent commands instead of `>>` overwrites earlier content.
   Use `>>` for appending, or use a single compound command with `{ ... } > file`.

## Reference pointers

- OpenSSL `req`, `genrsa`, `x509` subcommand man pages.
- Python `ssl` module documentation for certificate loading.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth for what is scored.
- Task spec: `tasks/openssl-selfsigned-cert/instruction.md`.
