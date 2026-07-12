# Security model

## Principles

1. **Local-first, offline by design.** The application runs entirely on the
   user's machine. Configuration content is stored in a local SQLite database
   and shared only with the local Batfish container. There are **no** cloud
   endpoints, telemetry, license checks or update pings in the data path.
2. **Read-only.** The application never connects to network devices and has
   no code paths that push, deploy or modify configurations. It requires no
   SSH, SNMP or API credentials — do not enter any.
3. **Loopback-only exposure.** `docker-compose.yml` binds every published
   port to `127.0.0.1`. Nothing is reachable from the network by default. If
   you change this, you are exposing configuration data — treat the frontend
   and API as unauthenticated (single-user MVP; see Limitations).
4. **AI is optional and subordinate.** The core product functions with no
   Anthropic API key and no internet. If AI assistance is added later it will
   be opt-in, and an LLM-generated statement will never override
   deterministic analysis results (architecture rule 6).

## Handling of configuration files

Configuration backups routinely contain sensitive material: password hashes
(`enable secret`, `username ... secret`), SNMP community strings, TACACS/
RADIUS keys, pre-shared keys, and addressing that maps your attack surface.

* Uploaded files are hashed (SHA-256), parsed and stored verbatim in the local
  database volume (`ne_data`). Nothing is written outside `NE_DATA_DIR` except
  a temporary directory used to hand a snapshot to the local Batfish
  container, which is deleted afterwards.
* Delete a snapshot or workspace in the UI and the stored configurations are
  removed with it (SQLite cascade). Use `docker volume rm` to destroy all data.
* The MVP does **not** redact secrets on display. Anyone with access to the
  machine (or to exported screenshots) can read what the configs contain.
  Sanitize archives before import if that is a concern; redaction-on-ingest
  is on the roadmap.

## Upload safety

Imports parse untrusted files, so the importer:

* never extracts archives to disk (in-memory reading only),
* rejects path traversal (zip-slip) member names,
* caps archive members (5 000) and member size (20 MiB) and upload size
  (200 MiB, configurable),
* treats all content as text to parse — configuration files are never
  executed, evaluated or templated.

## Dependencies

* Batfish runs as a pinned-version local container with no outbound needs.
* Backend and frontend dependencies are ordinary supply-chain surface; pin
  and review updates as with any project. `pip`/`npm` lockfiles are committed.

## Known limitations (MVP)

* **No authentication/authorization**: the app assumes a single trusted user
  on a trusted machine. Do not port-forward or reverse-proxy it as-is.
* **No encryption at rest**: the SQLite database is plaintext inside the
  Docker volume. Use OS-level disk encryption (e.g. BitLocker) if required.
* **No secret redaction** on display (see above).

## Reporting

This is an early-stage project; report suspected vulnerabilities via the
repository issue tracker (mark as security) or privately to the maintainer.
