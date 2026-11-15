#!/usr/bin/env bash
set -Eeuo pipefail
set +x
export LC_ALL=C
export PATH='/usr/sbin:/usr/bin:/sbin:/bin'
umask 077

readonly EXPECTED_HOST='__AUTHORIZED_HOST__'
readonly SERVICE='crm-novo-api.service'
readonly CURRENT='/opt/crm-novo/current'
readonly EXPECTED_COMMIT='47e891ed7ffd40a532d61def97c93469d66ede49'
readonly HEALTH='http://127.0.0.1:4334/health'
readonly API_BASE='http://127.0.0.1:4334'
readonly PREDECESSOR_ID='__AUTHORIZED_PREDECESSOR_UUID__'
readonly TARGET_CONNECTION_ID='__AUTHORIZED_TARGET_CONNECTION_UUID__'
readonly CLIENT_ID='__AUTHORIZED_CLIENT_UUID__'
readonly DISPATCH_ID='__AUTHORIZED_DISPATCH_UUID__'
readonly RECEIVABLE_ID='__AUTHORIZED_RECEIVABLE_UUID__'
readonly EXPECTED_PHONE_E164='__AUTHORIZED_PHONE_E164__'
readonly EXPECTED_SCHEDULED_FOR='__AUTHORIZED_SCHEDULED_FOR_ISO__'
readonly FUTURE_BILLING_PAIR="${PREDECESSOR_ID}:${DISPATCH_ID}"
readonly BATCH_KEY='__AUTHORIZED_BATCH_KEY__'
readonly STATE_DIR='/var/lib/crm-novo-williane-prepare-executor-v1'
readonly STATE_SCRIPT="$STATE_DIR/executor.sh"
readonly BACKUP_ENV="$STATE_DIR/api.env.before"
readonly ENV_PATH_FILE="$STATE_DIR/env.path"
readonly ORIGINAL_HASH_FILE="$STATE_DIR/api.env.before.sha256"
readonly ARMED_FILE="$STATE_DIR/ARMED"
readonly RECOVERY_LOG="$STATE_DIR/recovery.log"
readonly UNIT='crm-novo-williane-prepare-recovery-v1.service'
readonly TIMER='crm-novo-williane-prepare-recovery-v1.timer'
readonly UNIT_PATH="/etc/systemd/system/$UNIT"
readonly TIMER_PATH="/etc/systemd/system/$TIMER"
readonly LOCK_FILE='/run/lock/crm-novo-williane-prepare-executor-v1.lock'

fail() { printf 'BLOCKED: %s\n' "$1" >&2; exit 1; }
safe_marker() { printf '%s\n' "$1"; }

health_ok() {
  [[ "$(curl --retry 0 --silent --show-error --max-time 3 -o /dev/null -w '%{http_code}' "$HEALTH" 2>/dev/null || true)" == '200' ]]
}

wait_health() {
  local attempt
  for attempt in {1..40}; do
    health_ok && return 0
    sleep 1
  done
  return 1
}

env_value_from_pid() {
  local pid="$1" key="$2"
  tr '\0' '\n' <"/proc/$pid/environ" | sed -n "s/^${key}=//p" | head -n 1
}

stable_service() {
  local previous='' sample current active sub pid restarts started key value
  for sample in 1 2 3; do
    active='' sub='' pid='' restarts='' started=''
    while IFS='=' read -r key value; do
      case "$key" in
        ActiveState) active="$value" ;;
        SubState) sub="$value" ;;
        MainPID) pid="$value" ;;
        NRestarts) restarts="$value" ;;
        ExecMainStartTimestampMonotonic) started="$value" ;;
      esac
    done < <(systemctl show "$SERVICE" -p ActiveState -p SubState -p MainPID -p NRestarts -p ExecMainStartTimestampMonotonic)
    current="$active|$sub|$pid|$restarts|$started"
    [[ "$active" == 'active' && "$sub" == 'running' ]] || return 1
    [[ "$pid" =~ ^[1-9][0-9]*$ && "$restarts" =~ ^[0-9]+$ && "$started" =~ ^[1-9][0-9]*$ ]] || return 1
    [[ -r "/proc/$pid/environ" ]] || return 1
    if [[ -n "$previous" && "$current" != "$previous" ]]; then return 1; fi
    previous="$current"
    (( sample < 3 )) && sleep 2
  done
  STABLE_PID="$pid"
  STABLE_NRESTARTS="$restarts"
}

discover_env_file() {
  local raw entry
  mapfile -t ENV_FILES < <(
    systemctl show "$SERVICE" -p EnvironmentFiles --value |
      tr ' ' '\n' | sed 's/^-//' | grep '^/'
  )
  (( ${#ENV_FILES[@]} == 1 )) || fail 'quantidade de EnvironmentFile diferente de um'
  ENV_FILE="${ENV_FILES[0]}"
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail 'EnvironmentFile invalido ou simbolico'
  [[ "$(realpath -e -- "$ENV_FILE")" == "$ENV_FILE" ]] || fail 'EnvironmentFile nao canonico'
}

verify_closed_process_gates() {
  stable_service || fail 'servico instavel ao verificar gates fechados'
  local apply allowlist billing_pair
  apply="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED)"
  allowlist="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST)"
  billing_pair="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_FUTURE_BILLING_PILOT_ALLOWLIST)"
  [[ -z "$apply" || "$apply" == 'false' ]] || fail 'gate global permaneceu aberto'
  [[ -z "$allowlist" ]] || fail 'allowlist apply permaneceu configurada'
  [[ "$billing_pair" == "$FUTURE_BILLING_PAIR" ]] || fail 'allowlist Billing futura divergente'
}

verify_open_process_gates() {
  stable_service || fail 'servico instavel ao verificar gates abertos'
  local apply allowlist billing_pair
  apply="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED)"
  allowlist="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST)"
  billing_pair="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_FUTURE_BILLING_PILOT_ALLOWLIST)"
  [[ "$apply" == 'true' ]] || fail 'gate global nao abriu no novo processo'
  [[ "$allowlist" == "$PREDECESSOR_ID" ]] || fail 'allowlist apply nao contem somente WILLIANE'
  [[ "$billing_pair" == "$FUTURE_BILLING_PAIR" ]] || fail 'allowlist Billing futura divergente'
}

restore_environment() {
  trap - EXIT HUP INT TERM
  [[ -f "$ARMED_FILE" ]] || return 0
  [[ -f "$BACKUP_ENV" && -f "$ENV_PATH_FILE" && -f "$ORIGINAL_HASH_FILE" ]] || return 1
  local env_file restore_tmp expected_hash actual_hash
  IFS= read -r env_file <"$ENV_PATH_FILE"
  [[ "$env_file" == /* && -f "$env_file" && ! -L "$env_file" ]] || return 1
  sha256sum --check --status "$ORIGINAL_HASH_FILE" || return 1
  restore_tmp="$(mktemp "$(dirname "$env_file")/.williane-restore.XXXXXX")"
  cp --preserve=all -- "$BACKUP_ENV" "$restore_tmp"
  mv -fT -- "$restore_tmp" "$env_file"
  cmp --silent -- "$BACKUP_ENV" "$env_file" || return 1
  systemctl restart "$SERVICE"
  wait_health || return 1
  stable_service || return 1
  local apply allowlist billing_pair
  apply="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED)"
  allowlist="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST)"
  billing_pair="$(env_value_from_pid "$STABLE_PID" WHATSAPP_SUCCESSOR_PREPARATION_FUTURE_BILLING_PILOT_ALLOWLIST)"
  [[ -z "$apply" || "$apply" == 'false' ]] || return 1
  [[ -z "$allowlist" ]] || return 1
  [[ "$billing_pair" == "$FUTURE_BILLING_PAIR" ]] || return 1
  rm -f -- "$ARMED_FILE"
  printf 'RECOVERY_OK utc=%s health=200 gates=closed env=restored\n' "$(date -u +%FT%TZ)" >>"$RECOVERY_LOG"
}

if [[ "${1:-}" == '--recover' ]]; then
  [[ ${EUID} -eq 0 ]] || fail 'recovery exige root'
  install -d -o root -g root -m 0700 "$STATE_DIR"
  restore_environment || fail 'recuperacao persistente falhou; intervencao manual obrigatoria'
  exit 0
fi

[[ $# -eq 0 ]] || fail 'argumento inesperado'
[[ ${EUID} -eq 0 ]] || fail 'execute como root'
readonly UUID_PATTERN='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
[[ "$PREDECESSOR_ID" =~ $UUID_PATTERN && "$TARGET_CONNECTION_ID" =~ $UUID_PATTERN && "$CLIENT_ID" =~ $UUID_PATTERN && "$DISPATCH_ID" =~ $UUID_PATTERN && "$RECEIVABLE_ID" =~ $UUID_PATTERN ]] || fail 'template de autorizacao nao materializado ou UUID invalido'
[[ "$EXPECTED_PHONE_E164" =~ ^\+[1-9][0-9]{7,14}$ ]] || fail 'telefone autorizado nao materializado ou invalido'
[[ "$EXPECTED_SCHEDULED_FOR" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]] || fail 'agendamento autorizado nao materializado ou invalido'
[[ "$BATCH_KEY" =~ ^[A-Za-z0-9._:-]{1,120}$ && "$BATCH_KEY" != __AUTHORIZED_BATCH_KEY__ ]] || fail 'batch autorizado nao materializado ou invalido'
[[ "$EXPECTED_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ && "$EXPECTED_HOST" != __AUTHORIZED_HOST__ ]] || fail 'host autorizado nao materializado ou invalido'
[[ "$(hostname -s)" == "$EXPECTED_HOST" ]] || fail 'host inesperado'
exec 9>"$LOCK_FILE"
flock -n 9 || fail 'outra operacao WILLIANE esta em andamento'

if [[ -f "$ARMED_FILE" ]]; then
  "$STATE_SCRIPT" --recover || fail 'estado anterior armado e recuperacao falhou'
  fail 'estado anterior foi recuperado; revise evidencias e execute novamente sob nova autorizacao'
fi

[[ -L "$CURRENT" ]] || fail 'current nao e symlink'
readonly ACTIVE_RELEASE="$(readlink -f -- "$CURRENT")"
[[ "$ACTIVE_RELEASE" == /opt/crm-novo/releases/* && -d "$ACTIVE_RELEASE" && ! -L "$ACTIVE_RELEASE" ]] || fail 'release ativa invalida'
readonly METADATA="$ACTIVE_RELEASE/runtime/RELEASE-METADATA.txt"
readonly API_ROOT="$ACTIVE_RELEASE/runtime/api"
[[ -r "$METADATA" && -d "$API_ROOT" ]] || fail 'runtime ativo incompleto'
readonly ACTIVE_COMMIT="$(sed -n 's/^CANDIDATE_COMMIT=//p' "$METADATA" | head -n 1)"
[[ "$ACTIVE_COMMIT" == "$EXPECTED_COMMIT" ]] || fail 'release ativa nao corresponde a 47e891e'
grep -q 'WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST' "$API_ROOT/dist/src/whatsapp/whatsapp.service.js" || fail 'runtime sem hardening apply'
stable_service || fail 'servico instavel antes da operacao'
health_ok || fail 'health inicial nao retornou HTTP 200'
verify_closed_process_gates
discover_env_file

readonly RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
readonly EVIDENCE="/opt/crm-novo/evidence/williane-prepare-$RUN_ID"
install -d -o root -g root -m 0700 "$EVIDENCE"
readonly REQUEST_DRY="$EVIDENCE/request-dry.json"
readonly REQUEST_APPLY="$EVIDENCE/request-apply.json"
readonly RESPONSE_DRY="$EVIDENCE/response-dry.json"
readonly RESPONSE_APPLY="$EVIDENCE/response-apply.json"
readonly DB_HELPER="$EVIDENCE/db-audit.js"
readonly PRE_SNAPSHOT="$EVIDENCE/db-before.json"
readonly POST_SNAPSHOT="$EVIDENCE/db-after.json"
readonly ACTOR_TEMP="$EVIDENCE/.auth-me.tmp"

cat >"$REQUEST_DRY" <<JSON
{"targetConnectionId":"$TARGET_CONNECTION_ID","batchKey":"$BATCH_KEY","predecessorConversationIds":["$PREDECESSOR_ID"],"apply":false}
JSON
cat >"$REQUEST_APPLY" <<JSON
{"targetConnectionId":"$TARGET_CONNECTION_ID","batchKey":"$BATCH_KEY","predecessorConversationIds":["$PREDECESSOR_ID"],"apply":true}
JSON

cat >"$DB_HELPER" <<'NODE'
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const [apiRoot, mode, beforePath, dispatchBaselinePath, actorId, predecessorId, targetId, clientId, dispatchId, receivableId, phoneE164, scheduledIso, batchKey] = process.argv.slice(2);
const { PrismaClient } = require(path.join(apiRoot, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stop = (message, details) => { const error = new Error(message); error.details = details; throw error; };
const normalize = value => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toJSON === 'function') return normalize(value.toJSON());
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const text = value.toString();
    if (text !== '[object Object]') return text;
  }
  return value;
};
const fieldHashes = (source, fields) => Object.fromEntries(fields.map(field => [field, hash(normalize(source[field]))]));
const CRITICAL_FIELDS = ['id','clientId','clientReferenceId','receivableId','whatsAppConnectionId','recoveryCampaignId','phone','origin','status','requestId','idempotencyKey','scheduledFor','nextAttemptAt','attempts','providerMessageId','errorCode','errorMessage','sentAt','createdAt'];
const CONTENT_FIELDS = ['templateId','body','renderedContent'];
const VOLATILE_FIELDS = ['updatedAt'];
const ITEM_FIELDS = ['receivableId','clientReferenceId','amount','dueDate','referenceSnapshot','statusSnapshot'];
const buildDispatchAudit = dispatch => {
  const semanticItems = dispatch.items.map(item => Object.fromEntries(ITEM_FIELDS.map(field => [field, normalize(item[field])]))).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    criticalFieldHashes: fieldHashes(dispatch, CRITICAL_FIELDS),
    contentFieldHashes: fieldHashes(dispatch, CONTENT_FIELDS),
    volatileFieldHashes: fieldHashes(dispatch, VOLATILE_FIELDS),
    semanticItemsFingerprint: hash(semanticItems),
    semanticItemsCount: semanticItems.length,
  };
};
const changedFields = (before = {}, current = {}, prefix) => [...new Set([...Object.keys(before), ...Object.keys(current)])].filter(field => before[field] !== current[field]).sort().map(field => `${prefix}.${field}`);
const compareDispatchAudits = (before, current) => {
  const blockingChanges = [
    ...changedFields(before.criticalFieldHashes, current.criticalFieldHashes, 'dispatch'),
    ...changedFields(before.contentFieldHashes, current.contentFieldHashes, 'dispatch'),
  ];
  if (before.semanticItemsFingerprint !== current.semanticItemsFingerprint || before.semanticItemsCount !== current.semanticItemsCount) blockingChanges.push('items.semantic');
  return {
    safe: blockingChanges.length === 0,
    blockingChanges,
    allowedVolatileChanges: changedFields(before.volatileFieldHashes, current.volatileFieldHashes, 'metadata'),
  };
};
async function inspect(tx) {
  const predecessor = await tx.whatsAppConversation.findUnique({
    where: { id: predecessorId },
    select: { id:true, clientId:true, whatsAppConnectionId:true, phone:true, phoneNormalized:true, phoneE164:true, status:true,
      client:{select:{id:true,phoneNormalized:true,phoneE164:true}},
      whatsAppConnection:{select:{id:true,phone:true,provider:true}},
      successorLink:{select:{successorConversationId:true}},
      attendances:{where:{status:{in:['PENDING','IN_PROGRESS']}},select:{id:true}},
      _count:{select:{messages:true,attendances:true}} }
  });
  if (!predecessor) stop('predecessor missing');
  if (predecessor.clientId !== clientId || predecessor.client?.id !== clientId) stop('client mismatch');
  if (predecessor.phoneE164 !== phoneE164 || predecessor.client?.phoneE164 !== phoneE164) stop('phone identity mismatch');
  if (predecessor.attendances.length || predecessor.successorLink) stop('predecessor already active/linked');
  const target = await tx.whatsAppConnection.findUnique({where:{id:targetId},select:{id:true,provider:true,phone:true,status:true,connected:true,loggedIn:true}});
  const digits = value => String(value ?? '').replace(/\D/g, '');
  const dispatch = await tx.messageDispatch.findUnique({where:{id:dispatchId},select:{id:true,clientId:true,clientReferenceId:true,receivableId:true,templateId:true,whatsAppConnectionId:true,recoveryCampaignId:true,phone:true,body:true,renderedContent:true,origin:true,status:true,requestId:true,idempotencyKey:true,scheduledFor:true,nextAttemptAt:true,attempts:true,providerMessageId:true,errorCode:true,errorMessage:true,sentAt:true,createdAt:true,updatedAt:true,items:{select:{receivableId:true,clientReferenceId:true,amount:true,dueDate:true,referenceSnapshot:true,statusSnapshot:true}}}});
  if (!dispatch) stop('dispatch missing', {changedFields:['dispatch.missing']});
  if (mode === 'pre') {
    if (!target || target.provider !== 'KIRAGO' || target.status !== 'CONNECTED' || !target.connected || !target.loggedIn) stop('target connection unavailable');
    if (!digits(target.phone) || digits(target.phone) !== digits(predecessor.whatsAppConnection.phone)) stop('business identity mismatch');
    if (dispatch.clientId !== clientId || dispatch.receivableId !== receivableId || dispatch.whatsAppConnectionId !== targetId) stop('dispatch identity mismatch');
    if (dispatch.origin !== 'BILLING' || dispatch.status !== 'SCHEDULED' || dispatch.attempts !== 0) stop('dispatch state mismatch');
    if (digits(dispatch.phone) !== digits(predecessor.phoneNormalized)) stop('dispatch destination mismatch');
    if (dispatch.scheduledFor?.toISOString() !== scheduledIso || dispatch.nextAttemptAt?.toISOString() !== scheduledIso) stop('dispatch schedule mismatch');
    if (dispatch.providerMessageId || dispatch.errorCode || dispatch.errorMessage || dispatch.sentAt) stop('dispatch has provider evidence');
  }
  const preparation = await tx.whatsAppConversationSuccessorPreparation.findUnique({where:{predecessorConversationId:predecessorId},select:{id:true,predecessorConversationId:true,successorConversationId:true,targetConnectionId:true,batchKey:true,status:true,createdByUserId:true,activationTrigger:true,activatedAt:true,cancelledAt:true,failedAt:true}});
  const existingSuccessor = await tx.whatsAppConversation.findUnique({where:{whatsAppConnectionId_phoneNormalized:{whatsAppConnectionId:targetId,phoneNormalized:predecessor.phoneNormalized}},select:{id:true}});
  if (!preparation && existingSuccessor) stop('successor already exists without preparation');
  let successor = null;
  if (preparation?.successorConversationId) {
    successor = await tx.whatsAppConversation.findUnique({where:{id:preparation.successorConversationId},select:{id:true,clientId:true,whatsAppConnectionId:true,phone:true,phoneNormalized:true,phoneE164:true,status:true,_count:{select:{messages:true,attendances:true}}}});
  }
  const links = await tx.whatsAppConversationContinuity.count({where:{OR:[{predecessorConversationId:predecessorId},{successorConversationId:predecessorId},...(successor ? [{predecessorConversationId:successor.id},{successorConversationId:successor.id}] : [])]}});
  const [historicalMessages, historicalAttendances] = await Promise.all([
    tx.whatsAppMessage.findMany({where:{conversationId:predecessorId},orderBy:{id:'asc'}}),
    tx.whatsAppAttendance.findMany({where:{conversationId:predecessorId},orderBy:{id:'asc'}}),
  ]);
  return {
    predecessor:{messageCount:predecessor._count.messages,attendanceCount:predecessor._count.attendances,status:predecessor.status,phoneNormalized:predecessor.phoneNormalized,historyFingerprint:hash({historicalMessages,historicalAttendances})},
    dispatchAudit:buildDispatchAudit(dispatch), preparation, successor, links,
    targetFingerprint:hash(target)
  };
}
async function main() {
  const state = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return inspect(tx);
  });
  if (mode === 'pre') {
    if (state.preparation) {
      if (state.preparation.status === 'PREPARED' && state.preparation.targetConnectionId === targetId && state.preparation.batchKey === batchKey && state.preparation.createdByUserId === actorId && !state.preparation.activationTrigger && !state.preparation.activatedAt && !state.preparation.cancelledAt && !state.preparation.failedAt && state.preparation.successorConversationId && state.successor && state.successor.clientId === clientId && state.successor.whatsAppConnectionId === targetId && state.successor.phoneE164 === phoneE164 && state.successor._count.messages === 0 && state.successor._count.attendances === 0 && state.links === 0) {
        process.stdout.write(JSON.stringify({...state, outcome:'ALREADY_PREPARED'})+'\n');
        return;
      }
      stop('existing preparation is not an exact safe PREPARED state');
    }
    if (state.links !== 0) stop('unexpected continuity link');
    process.stdout.write(JSON.stringify({...state, outcome:'ELIGIBLE_FOR_DRY_RUN'})+'\n');
    return;
  }
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const dispatchBaseline = JSON.parse(fs.readFileSync(dispatchBaselinePath, 'utf8'));
  if (!state.preparation || state.preparation.status !== 'PREPARED') stop('preparation is not PREPARED');
  if (state.preparation.predecessorConversationId !== predecessorId || state.preparation.targetConnectionId !== targetId || state.preparation.batchKey !== batchKey || state.preparation.createdByUserId !== actorId) stop('preparation identity mismatch');
  if (state.preparation.activationTrigger || state.preparation.activatedAt || state.preparation.cancelledAt || state.preparation.failedAt) stop('preparation is terminal/activated');
  if (!state.successor || state.successor.id !== state.preparation.successorConversationId || state.successor.clientId !== clientId || state.successor.whatsAppConnectionId !== targetId || state.successor.phoneE164 !== phoneE164) stop('successor identity mismatch');
  if (state.successor._count.messages !== 0 || state.successor._count.attendances !== 0 || state.links !== 0) stop('successor is not empty/unlinked');
  if (state.predecessor.messageCount !== before.predecessor.messageCount || state.predecessor.attendanceCount !== before.predecessor.attendanceCount || state.predecessor.status !== before.predecessor.status || state.predecessor.historyFingerprint !== before.predecessor.historyFingerprint) stop('predecessor history changed');
  const dispatchComparison = compareDispatchAudits(dispatchBaseline.dispatchAudit, state.dispatchAudit);
  const targetChanged = state.targetFingerprint !== dispatchBaseline.targetFingerprint;
  if (!dispatchComparison.safe || targetChanged) {
    stop('dispatch or target connection changed', {
      changedFields: [...dispatchComparison.blockingChanges, ...(targetChanged ? ['target.semantic'] : [])],
      allowedVolatileChanges: dispatchComparison.allowedVolatileChanges,
      comparedAgainst: 'db-immediately-before.json',
    });
  }
  process.stdout.write(JSON.stringify({...state,outcome:'PREPARED_VERIFIED',actorHash:hash(actorId),dispatchComparison,comparedAgainst:'db-immediately-before.json'})+'\n');
}
main().catch(e => {
  if (e.details) process.stdout.write(JSON.stringify({outcome:'BLOCKED',reason:e.message,...e.details})+'\n');
  process.stderr.write(`DB_AUDIT_BLOCKED: ${e.message}\n`);
  process.exitCode=1;
}).finally(()=>prisma.$disconnect());
NODE
chmod 0600 "$DB_HELPER"

printf 'Cole somente o valor JWT do cookie crm_novo_auth (entrada oculta): ' >/dev/tty
IFS= read -r -s AUTH_TOKEN </dev/tty
printf '\n' >/dev/tty
[[ "$AUTH_TOKEN" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || fail 'formato JWT invalido'

api_request() {
  local method="$1" url="$2" body_file="$3" output_file="$4"
  local -a args=(--config - --retry 0 --silent --show-error --max-time 20 --request "$method" --url "$url" --output "$output_file" --write-out '%{http_code}')
  if [[ -n "$body_file" ]]; then args+=(--header 'Content-Type: application/json' --data-binary "@$body_file"); fi
  printf 'header = "Cookie: crm_novo_auth=%s"\n' "$AUTH_TOKEN" | curl "${args[@]}"
}

auth_http="$(api_request GET "$API_BASE/auth/me" '' "$ACTOR_TEMP" || true)"
[[ "$auth_http" == '200' ]] || fail 'sessao ADMIN nao autenticada'
mapfile -t AUTH_FIELDS < <(node - "$ACTOR_TEMP" <<'NODE'
const fs=require('node:fs'); const crypto=require('node:crypto');
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const user=value?.user;
if(!user?.id || user.role!=='ADMIN') process.exit(1);
console.log(user.id); console.log(crypto.createHash('sha256').update(user.id).digest('hex'));
NODE
)
(( ${#AUTH_FIELDS[@]} == 2 )) || fail 'resposta /auth/me invalida ou usuario nao ADMIN'
readonly ACTOR_ID="${AUTH_FIELDS[0]}"
readonly ACTOR_HASH="${AUTH_FIELDS[1]}"
rm -f -- "$ACTOR_TEMP"
safe_marker "ADMIN_OK actor_hash=$ACTOR_HASH"

DATABASE_URL="$(env_value_from_pid "$STABLE_PID" DATABASE_URL)"
[[ -n "$DATABASE_URL" ]] || fail 'DATABASE_URL ausente no processo'
export DATABASE_URL
node "$DB_HELPER" "$API_ROOT" pre '' '' "$ACTOR_ID" "$PREDECESSOR_ID" "$TARGET_CONNECTION_ID" "$CLIENT_ID" "$DISPATCH_ID" "$RECEIVABLE_ID" "$EXPECTED_PHONE_E164" "$EXPECTED_SCHEDULED_FOR" "$BATCH_KEY" >"$PRE_SNAPSHOT"
readonly PRE_OUTCOME="$(node -e "const x=require(process.argv[1]);process.stdout.write(x.outcome)" "$PRE_SNAPSHOT")"
if [[ "$PRE_OUTCOME" == 'ALREADY_PREPARED' ]]; then
  unset AUTH_TOKEN DATABASE_URL
  safe_marker 'ALREADY_COMPLETED: preparacao PREPARED exata, sucessora vazia, sem links; nenhuma requisicao foi enviada'
  exit 0
fi
[[ "$PRE_OUTCOME" == 'ELIGIBLE_FOR_DRY_RUN' ]] || fail 'snapshot pre-operacao invalido'

dry_http="$(api_request POST "$API_BASE/whatsapp/conversation-successor-preparations/prepare" "$REQUEST_DRY" "$RESPONSE_DRY" || true)"
[[ "$dry_http" == '201' ]] || fail 'dry-run nao retornou HTTP 201'
node - "$RESPONSE_DRY" "$PREDECESSOR_ID" "$TARGET_CONNECTION_ID" "$BATCH_KEY" <<'NODE'
const fs=require('node:fs'); const [file,pred,target,batch]=process.argv.slice(2); const x=JSON.parse(fs.readFileSync(file,'utf8'));
if(x.apply!==false || x.targetConnectionId!==target || x.batchKey!==batch || x.summary?.scanned!==1 || x.summary?.eligible!==1 || x.summary?.conflicts!==0 || x.results?.length!==1 || x.results[0]?.predecessorConversationId!==pred || x.results[0]?.status!=='ELIGIBLE') process.exit(1);
NODE
safe_marker 'DRY_RUN_ELIGIBLE_OK scanned=1 eligible=1 conflicts=0'

install -d -o root -g root -m 0700 "$STATE_DIR"
cp --preserve=all -- "$ENV_FILE" "$BACKUP_ENV"
printf '%s\n' "$ENV_FILE" >"$ENV_PATH_FILE"
sha256sum "$BACKUP_ENV" >"$ORIGINAL_HASH_FILE"
install -o root -g root -m 0700 -- "$0" "$STATE_SCRIPT"
cat >"$UNIT_PATH" <<UNIT
[Unit]
Description=Fail-closed recovery for authorized WILLIANE preparation
After=local-fs.target

[Service]
Type=oneshot
ExecStart=$STATE_SCRIPT --recover
UNIT
cat >"$TIMER_PATH" <<TIMER
[Unit]
Description=Persistent watchdog for WILLIANE preparation gates

[Timer]
OnActiveSec=180s
OnUnitActiveSec=180s
Persistent=true
Unit=$UNIT

[Install]
WantedBy=timers.target
TIMER
chmod 0600 "$UNIT_PATH" "$TIMER_PATH"
systemctl daemon-reload
systemctl enable --now "$TIMER" >/dev/null
printf 'armed utc=%s run=%s\n' "$(date -u +%FT%TZ)" "$RUN_ID" >"$ARMED_FILE"

RESTORE_REQUIRED=1
cleanup_trap() {
  local status=$?
  trap - EXIT HUP INT TERM
  unset AUTH_TOKEN DATABASE_URL
  if (( RESTORE_REQUIRED == 1 )); then
    "$STATE_SCRIPT" --recover || status=1
  fi
  exit "$status"
}
trap cleanup_trap EXIT
trap 'exit 130' HUP INT TERM

ENV_TMP="$(mktemp "$(dirname "$ENV_FILE")/.williane-gates.XXXXXX")"
cp --preserve=all -- "$ENV_FILE" "$ENV_TMP"
python3 - "$ENV_TMP" "$PREDECESSOR_ID" <<'PY'
from pathlib import Path
import re, sys
p=Path(sys.argv[1]); predecessor=sys.argv[2]
values={
  'WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED':'true',
  'WHATSAPP_SUCCESSOR_PREPARATION_APPLY_PREDECESSOR_ALLOWLIST':predecessor,
}
pattern=re.compile(r'^\s*(?:'+'|'.join(map(re.escape,values))+r')\s*=')
lines=[line for line in p.read_text().splitlines() if not pattern.match(line)]
lines.extend(f'{k}={v}' for k,v in values.items())
p.write_text('\n'.join(lines)+'\n')
PY
mv -fT -- "$ENV_TMP" "$ENV_FILE"
systemctl restart "$SERVICE"
wait_health || fail 'health falhou apos abertura temporaria dos gates'
verify_open_process_gates

# Revalida banco e elegibilidade no novo processo imediatamente antes da unica escrita.
readonly DATABASE_URL_AFTER_RESTART="$(env_value_from_pid "$STABLE_PID" DATABASE_URL)"
[[ -n "$DATABASE_URL_AFTER_RESTART" && "$DATABASE_URL_AFTER_RESTART" == "$DATABASE_URL" ]] || fail 'DATABASE_URL mudou durante a janela'
node "$DB_HELPER" "$API_ROOT" pre '' '' "$ACTOR_ID" "$PREDECESSOR_ID" "$TARGET_CONNECTION_ID" "$CLIENT_ID" "$DISPATCH_ID" "$RECEIVABLE_ID" "$EXPECTED_PHONE_E164" "$EXPECTED_SCHEDULED_FOR" "$BATCH_KEY" >"$EVIDENCE/db-immediately-before.json"
[[ "$(node -e "const x=require(process.argv[1]);process.stdout.write(x.outcome)" "$EVIDENCE/db-immediately-before.json")" == 'ELIGIBLE_FOR_DRY_RUN' ]] || fail 'estado mudou antes do apply'
confirm_http="$(api_request POST "$API_BASE/whatsapp/conversation-successor-preparations/prepare" "$REQUEST_DRY" "$EVIDENCE/response-dry-immediately-before.json" || true)"
[[ "$confirm_http" == '201' ]] || fail 'dry-run imediatamente anterior nao retornou 201'
node - "$EVIDENCE/response-dry-immediately-before.json" <<'NODE'
const fs=require('node:fs');const x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(x.apply!==false||x.summary?.scanned!==1||x.summary?.eligible!==1||x.summary?.conflicts!==0||x.results?.[0]?.status!=='ELIGIBLE')process.exit(1);
NODE

# Exatamente uma tentativa HTTP apply=true. Nao ha retry automatico.
: >"$RESPONSE_APPLY"
set +e
apply_http="$(api_request POST "$API_BASE/whatsapp/conversation-successor-preparations/prepare" "$REQUEST_APPLY" "$RESPONSE_APPLY")"
apply_curl_rc=$?
set -e
printf 'APPLY_ATTEMPT_COMPLETED curl_rc=%s http=%s\n' "$apply_curl_rc" "${apply_http:-none}" >"$EVIDENCE/apply-transport.txt"

# Fecha gates antes de interpretar resposta ou fazer auditoria posterior.
"$STATE_SCRIPT" --recover
RESTORE_REQUIRED=0
cmp --silent -- "$BACKUP_ENV" "$ENV_FILE" || fail 'EnvironmentFile nao foi restaurado byte a byte'
verify_closed_process_gates
health_ok || fail 'health nao retornou 200 apos restauracao'

node "$DB_HELPER" "$API_ROOT" post "$PRE_SNAPSHOT" "$EVIDENCE/db-immediately-before.json" "$ACTOR_ID" "$PREDECESSOR_ID" "$TARGET_CONNECTION_ID" "$CLIENT_ID" "$DISPATCH_ID" "$RECEIVABLE_ID" "$EXPECTED_PHONE_E164" "$EXPECTED_SCHEDULED_FOR" "$BATCH_KEY" >"$POST_SNAPSHOT"
readonly POST_OUTCOME="$(node -e "const x=require(process.argv[1]);process.stdout.write(x.outcome)" "$POST_SNAPSHOT")"
[[ "$POST_OUTCOME" == 'PREPARED_VERIFIED' ]] || fail 'estado pos-operacao nao e PREPARED seguro'

response_valid=0
if [[ "$apply_curl_rc" -eq 0 && "$apply_http" == '201' ]]; then
  if node - "$RESPONSE_APPLY" "$PREDECESSOR_ID" "$TARGET_CONNECTION_ID" "$BATCH_KEY" <<'NODE'
const fs=require('node:fs');const [f,p,t,b]=process.argv.slice(2);const x=JSON.parse(fs.readFileSync(f,'utf8'));
if(x.apply!==true||x.targetConnectionId!==t||x.batchKey!==b||x.summary?.scanned!==1||x.summary?.prepared!==1||x.summary?.conflicts!==0||x.results?.length!==1||x.results[0]?.predecessorConversationId!==p||x.results[0]?.status!=='PREPARED')process.exit(1);
NODE
  then response_valid=1; fi
fi

systemctl disable --now "$TIMER" >/dev/null 2>&1 || true
rm -f -- "$UNIT_PATH" "$TIMER_PATH"
systemctl daemon-reload
rm -f -- "$BACKUP_ENV" "$ENV_PATH_FILE" "$ORIGINAL_HASH_FILE" "$STATE_SCRIPT"
sha256sum "$REQUEST_DRY" "$REQUEST_APPLY" "$RESPONSE_DRY" "$RESPONSE_APPLY" "$PRE_SNAPSHOT" "$POST_SNAPSHOT" >"$EVIDENCE/EVIDENCE-SHA256SUMS"
unset AUTH_TOKEN DATABASE_URL

if (( response_valid != 1 )); then
  safe_marker 'PREPARED_VERIFIED_WITH_UNCERTAIN_HTTP: banco confirma sucesso; NAO REPETIR apply=true; revisao manual obrigatoria'
  exit 2
fi
safe_marker "WILLIANE_PREPARATION_CONTROLLED_OK preparation=PREPARED successor=empty links=0 dispatch=unchanged health=200 gates=closed evidence=$EVIDENCE"
