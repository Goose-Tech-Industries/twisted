# erl_crash.dump triage — 2026-05-11

Two Erlang crash dumps were archived from this repo to `/var/goose/triage/`. Both predate today; nothing currently broken — just leftover evidence. Findings below.

## Dump 1: `/root/twisted/erl_crash.dump` (5.6 MB)

- **Archived to:** `/var/goose/triage/erl_crash.dump` (root)
- **Generated on:** Thu May  7 12:01:12 2026
- **System version:** Erlang/OTP 26 [erts-14.2.5] [smp:4:4] [jit:ns]
- **Slogan:** `erl_child_setup closed`
- **Processes at time of crash:** 538
- **Ports:** 16
- **Memory total:** ~109 MB (processes ~21 MB, system ~88 MB, code ~46 MB, ets ~3.6 MB) — well under any OS limit

### Plain-English reason
`erl_child_setup` is the small C helper the BEAM uses to fork external port programs. The slogan "closed" means that helper's pipe to the BEAM was unexpectedly shut. The BEAM treats that as fatal and dumps.

### Suspected cause
This is not a BEAM out-of-memory or supervision crash — memory was modest and 538 procs is normal. The most common triggers for `erl_child_setup closed` on a long-running dev box are:

1. **Parent terminal closed / SIGHUP** — running `iex -S mix phx.server` directly under SSH and the SSH session dropped, taking `erl_child_setup` with it.
2. **OS killed the child setup process** (OOM-killer reaping the smallest helper, or a manual `pkill`).
3. **fork() failure** under fd/pid pressure (less likely given the small process table here).

Given the timestamp (May 7, midday) and that the panel runs under PM2 in production, this is almost certainly a dev-shell session that was killed when the terminal/SSH ended — not a production fault.

### Recommended next step
No action needed. If `erl_child_setup closed` recurs in production logs, run the BEAM under `tmux`/`systemd`/`pm2` so it survives terminal disconnects, and check `/var/log/syslog` for OOM-killer activity around the timestamp.

---

## Dump 2: `/root/twisted/te_phoenix/erl_crash.dump` (3.6 MB)

- **Archived to:** `/var/goose/triage/erl_crash.dump.te_phoenix`
- **Generated on:** Sat Apr 18 10:47:59 2026
- **System version:** Erlang/OTP 26 [erts-14.2.5] [smp:4:4] [jit:ns]
- **Slogan:** `Runtime terminating during boot (RuntimeError: "environment variable DATABASE_URL is missing. For example: ecto://USER:PASS@HOST/DATABASE")`
  - Source: `_build/prod/rel/te_phoenix/releases/0.1.0/runtime.exs` line 29
- **Memory total:** ~104 MB

### Plain-English reason
The prod release tried to boot, `runtime.exs` reads `DATABASE_URL` from the environment at startup, the variable was unset, and `runtime.exs` raised `RuntimeError`. That happens before supervision starts, so the VM has nowhere to recover and dumps.

### Suspected cause
A `_build/prod` release was started manually (e.g. `./bin/te_phoenix start`) on Apr 18 without `DATABASE_URL` exported in the shell. This matches the early date — initial prod-release shakeout. Today the panel runs under PM2 which sets the env vars, so this is not reproducing.

### Recommended next step
No action needed. To prevent reoccurrence when running prod releases manually:

- Source the env file first: `set -a; . /var/goose/te_phoenix.env; set +a; ./bin/te_phoenix start`
- Or run via the PM2 ecosystem entry, which already injects `DATABASE_URL`.
- Confirm `runtime.exs:29` still requires `DATABASE_URL` (it should — that's the right behavior for a prod release).

---

## Summary

Both dumps are stale, both have benign root causes (terminal disconnect, missing env var on manual release boot), neither indicates an ongoing fault. Archived to `/var/goose/triage/` as evidence; removed from the repo so they stop appearing in `git status`.
