# CONTINUITY1 WILLIANE — apply gate runbook (not authorized for execution)

This runbook documents the separately reviewed production operation. It does not authorize a
deployment, restart, preparation, cancellation, provider call, or database mutation.

## Fixed scope

- predecessor: `6a036f89-1c18-49de-83af-addf589ebf5c`
- target connection: `dd2efa35-9274-4043-bddc-4de246dd9cdd`
- future Billing dispatch: `1f85cf0d-acfe-4154-a1ee-a6dc9c6e644f`
- batch key: `continuity1-williane-pilot-20261114`

The two independent write gates must both be satisfied:

```dotenv
WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED=true
WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST=6a036f89-1c18-49de-83af-addf589ebf5c
```

The future Billing exception remains restricted by its separate predecessor/dispatch pair.
An empty or missing apply predecessor allowlist blocks every `apply=true` request. `apply=false`
does not consult the apply predecessor allowlist.

## Configuration backup and restoration

Discover the service's single environment file instead of assuming its path. Do not print its
contents because it contains secrets.

```bash
set -Eeuo pipefail
set +x
umask 077
SERVICE='crm-novo-api.service'
mapfile -t ENV_FILES < <(
  systemctl show "$SERVICE" -p EnvironmentFiles --value |
    tr ' ' '\n' | grep '^/'
)
(( ${#ENV_FILES[@]} == 1 )) || { echo 'BLOCKED_ENV_FILE_COUNT'; exit 1; }
ENV_FILE="${ENV_FILES[0]}"
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo 'BLOCKED_ENV_FILE'; exit 1; }
EVIDENCE="/opt/crm-novo/evidence/williane-prepare-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$EVIDENCE"
cp --preserve=all -- "$ENV_FILE" "$EVIDENCE/api.env.before"
sha256sum "$EVIDENCE/api.env.before" > "$EVIDENCE/api.env.before.sha256"
```

The operator must install the exact two gate values atomically, restart only the API, and prove
the values from `/proc/$MainPID/environ` without printing any other environment entry. A trap must
restore `api.env.before`, restart only the API, require health HTTP 200, compare the restored file
byte-for-byte, and verify `APPLY_ENABLED` is absent or `false`. The trap remains installed until
the gate has been restored successfully.

The following skeleton is for the separately authorized execution gate. It deliberately restores
the original environment on normal exit as well as on failure. It never prints environment file
contents.

```bash
set -Eeuo pipefail
set +x

RESTORED=0
restore_original_environment() (
  trap - EXIT HUP INT TERM
  local restore_tmp owner group mode
  owner="$(stat -c '%u' "$ENV_FILE")"
  group="$(stat -c '%g' "$ENV_FILE")"
  mode="$(stat -c '%a' "$ENV_FILE")"
  restore_tmp="$(mktemp "$(dirname "$ENV_FILE")/.williane-restore.XXXXXX")"
  install -o "$owner" -g "$group" -m "$mode" -- \
    "$EVIDENCE/api.env.before" "$restore_tmp"
  mv -fT -- "$restore_tmp" "$ENV_FILE"
  systemctl restart "$SERVICE"
  for _ in {1..30}; do
    curl --fail --silent --show-error --max-time 2 \
      'http://127.0.0.1:3001/health' >/dev/null && break
    sleep 1
  done
  curl --fail --silent --show-error --max-time 2 \
    'http://127.0.0.1:3001/health' >/dev/null
  cmp --silent -- "$EVIDENCE/api.env.before" "$ENV_FILE"
  local pid apply_value allowlist_value
  pid="$(systemctl show "$SERVICE" -p MainPID --value)"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]]
  apply_value="$(tr '\0' '\n' < "/proc/$pid/environ" |
    sed -n 's/^WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED=//p')"
  allowlist_value="$(tr '\0' '\n' < "/proc/$pid/environ" |
    sed -n 's/^WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST=//p')"
  [[ -z "$apply_value" || "$apply_value" == 'false' ]]
  [[ -z "$allowlist_value" ]]
)
trap 'status=$?; if (( RESTORED == 0 )); then restore_original_environment || status=1; fi; trap - EXIT; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM

ENV_TMP="$(mktemp "$(dirname "$ENV_FILE")/.williane-gates.XXXXXX")"
python3 - "$ENV_FILE" "$ENV_TMP" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
values = {
    "WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED": "true",
    "WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST":
        "6a036f89-1c18-49de-83af-addf589ebf5c",
}
pattern = re.compile(r"^\s*(" + "|".join(map(re.escape, values)) + r")\s*=")
lines = source.read_text().splitlines()
filtered = [line for line in lines if not pattern.match(line)]
filtered.extend(f"{key}={value}" for key, value in values.items())
destination.write_text("\n".join(filtered) + "\n")
PY
chown "$(stat -c '%u' "$ENV_FILE"):$(stat -c '%g' "$ENV_FILE")" "$ENV_TMP"
chmod "$(stat -c '%a' "$ENV_FILE")" "$ENV_TMP"
mv -fT -- "$ENV_TMP" "$ENV_FILE"
systemctl restart "$SERVICE"
```

After the one-item request and post-write evidence are captured, call
`restore_original_environment && RESTORED=1` explicitly. The `EXIT` trap is a second line of
defense. Any failed restore, failed health check, file mismatch, or residual gate value makes the
operation fail.

## Pre-write gates

1. Require R2 identity, stable service, health HTTP 200, and an authenticated ADMIN session.
2. In a read-only transaction, fingerprint the exact Billing dispatch fields (status, schedule,
   next attempt, attempts, receivable, provider result/error/sent fields) and historical counts.
3. Require the target connection to remain `CONNECTED`, `connected=true`, and `loggedIn=true`.
4. Require no existing preparation, successor, continuity link, or active attendance.
5. Execute the exact one-item `apply=false` request and require `ELIGIBLE`.
6. Confirm no second administrative operator is using the prepare endpoint during the window.

## One-item apply

```json
{
  "targetConnectionId": "dd2efa35-9274-4043-bddc-4de246dd9cdd",
  "batchKey": "continuity1-williane-pilot-20261114",
  "predecessorConversationIds": ["6a036f89-1c18-49de-83af-addf589ebf5c"],
  "apply": true
}
```

Require HTTP 201 and exactly one `PREPARED` (or `ALREADY_PREPARED` on a verified retry), with no
conflict or manual review. Restore both gates immediately after the response, before post-write
inspection. Never retry blindly after an uncertain HTTP outcome; inspect by predecessor ID first.

## Post-write gates

- exact preparation is `PREPARED` with the expected predecessor, target, batch, and actor;
- successor exists on the expected client/connection with zero messages and zero attendances;
- no continuity link exists yet and historical rows remain on the predecessor;
- the Billing dispatch fingerprint is unchanged;
- a new `apply=false` request returns `ALREADY_PREPARED`;
- apply gates are absent/false/empty in the new API process, service is stable, and health is 200.

## Reversal boundary

Configuration restoration is automatic and does not remove an already committed preparation. If
the successor remains empty and `PREPARED`, a separately authorized call to the administrative
cancel endpoint may remove only the empty successor and retain the `CANCELLED` audit tombstone.
Never cancel automatically after a message, attendance, continuity link, `ACTIVATED`, or `FAILED`.
Never use direct SQL to reverse the pilot, and never alter the financial dispatch.
