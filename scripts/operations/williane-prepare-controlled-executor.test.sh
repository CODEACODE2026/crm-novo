#!/usr/bin/env bash
set -Eeuo pipefail
set +x
export LC_ALL=C
umask 077

readonly SOURCE="${1:-$(dirname "$0")/williane-prepare-controlled-executor.sh}"
[[ -f "$SOURCE" ]] || { echo 'TEST_BLOCKED: executor ausente' >&2; exit 1; }
readonly ROOT="$(mktemp -d /tmp/williane-executor-test.XXXXXX)"
cleanup() {
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
  rm -rf -- "$ROOT"
}
trap cleanup EXIT
mkdir -p "$ROOT/bin" "$ROOT/state" "$ROOT/env"

cp -- "$SOURCE" "$ROOT/executor.sh"
sed -i \
  -e "s|export PATH='/usr/sbin:/usr/bin:/sbin:/bin'|export PATH='$ROOT/bin:/usr/sbin:/usr/bin:/sbin:/bin'|" \
  -e "s|readonly STATE_DIR='/var/lib/crm-novo-williane-prepare-executor-v1'|readonly STATE_DIR='$ROOT/state'|" \
  -e "s|readonly LOCK_FILE='/run/lock/crm-novo-williane-prepare-executor-v1.lock'|readonly LOCK_FILE='$ROOT/lock'|" \
  -e 's|__AUTHORIZED_HOST__|synthetic-host|g' \
  -e 's|__AUTHORIZED_PREDECESSOR_UUID__|11111111-1111-4111-8111-111111111111|g' \
  -e 's|__AUTHORIZED_TARGET_CONNECTION_UUID__|22222222-2222-4222-8222-222222222222|g' \
  -e 's|__AUTHORIZED_CLIENT_UUID__|33333333-3333-4333-8333-333333333333|g' \
  -e 's|__AUTHORIZED_DISPATCH_UUID__|44444444-4444-4444-8444-444444444444|g' \
  -e 's|__AUTHORIZED_RECEIVABLE_UUID__|55555555-5555-4555-8555-555555555555|g' \
  -e 's|__AUTHORIZED_PHONE_E164__|+5581999999999|g' \
  -e 's|__AUTHORIZED_SCHEDULED_FOR_ISO__|2027-01-10T12:00:00.000Z|g' \
  -e 's|__AUTHORIZED_BATCH_KEY__|synthetic-controlled-batch|g' \
  -e 's/for attempt in {1..40}/for attempt in {1..2}/' \
  -e 's/^    sleep 1$/    sleep 0.01/' \
  -e 's/^    (( sample < 3 )) && sleep 2$/    (( sample < 3 )) \&\& sleep 0.01/' \
  "$ROOT/executor.sh"
chmod 0700 "$ROOT/executor.sh"

cat >"$ROOT/bin/curl" <<'SH'
#!/usr/bin/env bash
if [[ "${MOCK_HEALTH_FAIL:-0}" == 1 ]]; then printf '500'; exit 0; fi
printf '200'
SH
cat >"$ROOT/bin/systemctl" <<'SH'
#!/usr/bin/env bash
case "${1:-}" in
  restart) exit 0 ;;
  show)
    count_file="${MOCK_COUNT_FILE:?}"
    count=0; [[ -f "$count_file" ]] && read -r count <"$count_file"
    count=$((count+1)); printf '%s\n' "$count" >"$count_file"
    pid="${MOCK_PID:?}"
    if [[ "${MOCK_RESTART_DURING_SAMPLE:-0}" == 1 && "$count" -ge 2 ]]; then pid=$((pid+1)); fi
    printf 'ActiveState=active\nSubState=running\nMainPID=%s\nNRestarts=14\nExecMainStartTimestampMonotonic=123456\n' "$pid"
    ;;
  *) exit 0 ;;
esac
SH
chmod 0700 "$ROOT/bin/curl" "$ROOT/bin/systemctl"

start_mock_process() {
  env \
    WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED=false \
    WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST= \
    WHATSAPP_SUCCESSOR_PREPARATION_FUTURE_BILLING_PILOT_ALLOWLIST='11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444' \
    sleep 300 &
  MOCK_PID=$!
  export MOCK_PID
  sleep 0.1
}

arm_fixture() {
  rm -f -- "$ROOT/state/ARMED" "$ROOT/count"
  printf 'ORIGINAL_SECRET_VALUE=preserved\n' >"$ROOT/state/api.env.before"
  chmod 0640 "$ROOT/state/api.env.before"
  printf 'MUTATED=true\n' >"$ROOT/env/api.env"
  printf '%s\n' "$ROOT/env/api.env" >"$ROOT/state/env.path"
  sha256sum "$ROOT/state/api.env.before" >"$ROOT/state/api.env.before.sha256"
  : >"$ROOT/state/ARMED"
  export MOCK_COUNT_FILE="$ROOT/count"
}

start_mock_process

# Recuperacao persistente apos perda do processo/SSH: restaura bytes e desarma.
arm_fixture
"$ROOT/executor.sh" --recover
cmp --silent "$ROOT/state/api.env.before" "$ROOT/env/api.env"
[[ ! -e "$ROOT/state/ARMED" ]]
echo 'TEST_RECOVERY_AFTER_INTERRUPTION_OK'

# Health ruim: o arquivo e restaurado, mas o estado permanece armado para intervencao/retry do watchdog.
arm_fixture
export MOCK_HEALTH_FAIL=1
if "$ROOT/executor.sh" --recover >/dev/null 2>&1; then
  echo 'TEST_BLOCKED: recovery deveria falhar com health ruim' >&2; exit 1
fi
cmp --silent "$ROOT/state/api.env.before" "$ROOT/env/api.env"
[[ -e "$ROOT/state/ARMED" ]]
unset MOCK_HEALTH_FAIL
echo 'TEST_HEALTH_FAILURE_FAIL_CLOSED_OK'

# Troca de PID durante as tres amostras: recuperacao nao e declarada concluida.
arm_fixture
export MOCK_RESTART_DURING_SAMPLE=1
if "$ROOT/executor.sh" --recover >/dev/null 2>&1; then
  echo 'TEST_BLOCKED: recovery deveria falhar com PID instavel' >&2; exit 1
fi
[[ -e "$ROOT/state/ARMED" ]]
unset MOCK_RESTART_DURING_SAMPLE
echo 'TEST_RESTART_DURING_SAMPLE_FAIL_CLOSED_OK'

# Contratos estaticos que evitam repeticao automatica e vazamento por tracing.
[[ "$(grep -c "api_request POST .*REQUEST_APPLY" "$SOURCE")" -eq 1 ]]
grep -q -- '--retry 0' "$SOURCE"
grep -q '^set +x$' "$SOURCE"
! grep -Eq 'echo .*AUTH_TOKEN|printf .*DATABASE_URL' "$SOURCE"
grep -q 'OnActiveSec=180s' "$SOURCE"
grep -q 'OnUnitActiveSec=180s' "$SOURCE"
echo 'TEST_SINGLE_APPLY_NO_RETRY_AND_SECRET_HYGIENE_OK'

# O pos-audit financeiro usa o snapshot imediatamente anterior; o snapshot original
# continua reservado para a prova de integridade do historico.
grep -Fq 'post "$PRE_SNAPSHOT" "$EVIDENCE/db-immediately-before.json"' "$SOURCE"
grep -Fq "comparedAgainst:'db-immediately-before.json'" "$SOURCE"
! grep -q 'dispatchFingerprint' "$SOURCE"
grep -Fq "allowedVolatileChanges" "$SOURCE"
grep -Fq "items.semantic" "$SOURCE"
echo 'TEST_IMMEDIATE_BASELINE_AND_SEMANTIC_AUDIT_WIRING_OK'

node --test "$(dirname "$SOURCE")/williane-dispatch-audit.test.mjs"
echo 'TEST_BILLING_RECONCILIATION_AND_REAL_MUTATIONS_OK'

echo 'WILLIANE_EXECUTOR_FAILURE_MATRIX_OK scenarios=6'
