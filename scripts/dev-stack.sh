#!/usr/bin/env bash
# Local backend stack for the autonomous simulator loop.
# Usage: scripts/dev-stack.sh up|down|status|logs
# Exit codes (up): 0 api answers, 1 precondition failure (nothing started), 2 api timeout (stopped again).
# Never writes .env; overrides go through the environment of the processes it starts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATE=".dev-stack"
API_PORT=3333
METRO_PORT=8081
CONTAINER="proxy"
API_URL="http://localhost:${API_PORT}"

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

pid_of() { [ -f "$STATE/$1.pid" ] && cat "$STATE/$1.pid" || true; }

pgid_of() { ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ' || true; }

comm_of() { ps -o comm= -p "$1" 2>/dev/null || true; }

lstart_of() { ps -o lstart= -p "$1" 2>/dev/null || true; }

group_alive() { [ -n "${1:-}" ] && kill -0 -- "-$1" 2>/dev/null; }

# Record pid, process group id, command name and start time, so a stale pid file is never trusted
# blindly. comm alone is not enough: the api (npm) and other node tools all report `node`.
record() {
  echo "$2" >"$STATE/$1.pid"
  echo "$2" >"$STATE/$1.pgid"
  comm_of "$2" >"$STATE/$1.comm"
  lstart_of "$2" >"$STATE/$1.lstart"
}

# True when live process <pid> has BOTH the recorded command name and the recorded start time of <name>.
same_process() { # same_process <name> <pid>
  local comm lstart
  comm="$(cat "$STATE/$1.comm" 2>/dev/null || true)"
  lstart="$(cat "$STATE/$1.lstart" 2>/dev/null || true)"
  [ -n "$comm" ] && [ -n "$lstart" ] &&
    [ "$(comm_of "$2")" = "$comm" ] && [ "$(lstart_of "$2")" = "$lstart" ]
}

# True when the leader pid is alive AND still the process we started (guards against pid reuse).
leader_ours() {
  local pid
  pid="$(pid_of "$1")"
  alive "$pid" && same_process "$1" "$pid"
}

http_code() { curl -s -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || true; }

container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" = "true" ]; }

# Listener pids on a port.
listeners() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; }

# True if pid belongs to a process group we started (recorded pgid, leader not reused by a foreign command).
is_ours() {
  local g name rg
  g="$(pgid_of "$1")"
  for name in api stripe; do
    rg="$(cat "$STATE/$name.pgid" 2>/dev/null || true)"
    [ -n "$rg" ] && [ "$rg" = "$g" ] || continue
    if ! alive "$(pid_of "$name")"; then return 0; fi
    leader_ours "$name" && return 0
    echo "warning: pid $(pid_of "$name") ($name) is now '$(comm_of "$(pid_of "$name")")' started $(lstart_of "$(pid_of "$name")"), not ours; skipping" >&2
  done
  return 1
}

check_port() {
  local port="$1" fatal="$2" pid
  for pid in $(listeners "$port"); do
    is_ours "$pid" && continue
    echo "port $port is held by pid $pid ($(ps -o comm= -p "$pid")); not starting"
    [ "$fatal" = "1" ] && exit 1
  done
  return 0
}

wait_for() { # wait_for <seconds> <interval> <command...>
  local max="$1" step="$2" waited=0
  shift 2
  until "$@"; do
    [ "$waited" -ge "$max" ] && return 1
    sleep "$step"
    waited=$((waited + step))
  done
}

# bitnami runs a temporary init server first: require pg_isready AND the host port answering,
# and a real query over TCP, so migrations never hit the init phase.
postgres_ready() {
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 &&
    nc -z localhost 5432 >/dev/null 2>&1 &&
    docker exec -e PGPASSWORD=docker "$CONTAINER" psql -h 127.0.0.1 -U postgres -d proxy -c 'select 1' >/dev/null 2>&1
}

# Non-destructive probe: an empty body is rejected by Zod (400) when hooks are on; 404 when off.
hooks_code() {
  http_code -X POST -H 'Content-Type: application/json' -d '{}' "$API_URL/__test/seed-user"
}

hooks_label() {
  local code
  code="$(hooks_code)"
  if [ "$code" = "400" ]; then echo "on (http $code)"; else echo "off (http $code)"; fi
}

dump_logs() {
  local f
  for f in api stripe; do
    echo "--- $f.log (last 40 lines) ---"
    tail -n 40 "$STATE/$f.log" 2>/dev/null || true
  done
}

api_ready() { [ "$(http_code "$API_URL/card/fetch")" = "401" ]; }

summary() {
  echo "api $API_PORT pid $(pid_of api)"
  echo "stripe pid $(pid_of stripe)"
  if [ -f "$STATE/started-postgres" ]; then
    echo "postgres $CONTAINER (started by us)"
  else
    echo "postgres $CONTAINER (pre-existing)"
  fi
  echo "test hooks: $(hooks_label)"
}

cmd_up() {
  # Already running: do not start a second api.
  if leader_ours api && leader_ours stripe; then
    echo "stack already running"
    summary
    return 0
  fi
  if leader_ours api || leader_ours stripe; then
    echo "stack is partially running (see status); run 'down' first"
    exit 1
  fi

  check_port "$API_PORT" 1
  check_port "$METRO_PORT" 0 | sed 's/^/warning: /'

  mkdir -p "$STATE"

  if ! container_running; then
    docker compose up -d postgres
    touch "$STATE/started-postgres"
  fi
  if ! wait_for 60 1 postgres_ready; then
    echo "postgres did not become ready within 60s"
    rm -rf "$STATE"
    exit 1
  fi

  npx prisma migrate deploy

  local secret api_pid stripe_pid
  secret="$(stripe listen --print-secret 2>/dev/null | tr -d '[:space:]' || true)"
  case "$secret" in
    whsec_*) ;;
    *)
      echo "could not obtain a Stripe webhook secret (is the stripe CLI logged in?)"
      rm -rf "$STATE"
      exit 1
      ;;
  esac

  # Job control on: each background job becomes its own process group leader (pid == pgid),
  # so `down` can kill the whole npm -> nest -> node tree.
  set -m
  # DEV_STACK_TEST_HOOKS=0 starts the api without the loop hooks (throttler active, /__test/* 404).
  # The owner's .env may lack these; the env schema requires them (fallbacks only, .env is never written).
  # MAIL_PROVIDER/MAIL_FROM: .env does not go through this shell (the api loads it), so a fallback is
  # exported only when neither the environment nor .env defines the key (names checked, values never read).
  # Default is ses because an older .env carries the AWS SES keys; MAIL_FROM reuses AWS_SES_FROM_EMAIL from
  # the environment when present.
  local env_file="$ROOT/.env"
  env_defined() { [[ -n "${!1:-}" ]] || grep -q "^$1=" "$env_file" 2>/dev/null; }
  env_defined MAIL_PROVIDER || export MAIL_PROVIDER=ses
  env_defined MAIL_FROM || export MAIL_FROM="${AWS_SES_FROM_EMAIL:-no-reply@proxy.local}"
  NODE_ENV="${NODE_ENV:-development}" \
    STRIPE_CONNECT_RETURN_URL="${STRIPE_CONNECT_RETURN_URL:-http://localhost:3000/callback}" \
    LOOP_TEST_HOOKS="${DEV_STACK_TEST_HOOKS:-1}" STRIPE_WEBHOOK_SECRET="$secret" \
    nohup npm run start:dev:api >"$STATE/api.log" 2>&1 &
  api_pid=$!
  nohup stripe listen --forward-to "localhost:${API_PORT}/stripe/webhook" \
    --forward-connect-to "localhost:${API_PORT}/stripe/webhook" >"$STATE/stripe.log" 2>&1 &
  stripe_pid=$!
  set +m
  sleep 1 # let nohup exec into the real command before recording its name
  record api "$api_pid"
  record stripe "$stripe_pid"

  local timeout="${DEV_STACK_API_TIMEOUT:-90}" waited=0
  until api_ready; do
    if ! alive "$api_pid"; then
      echo "api process exited before answering"
      dump_logs
      cmd_down
      exit 2
    fi
    if [ "$waited" -ge "$timeout" ]; then
      echo "api did not answer within ${timeout}s; stopping what was started"
      dump_logs
      cmd_down
      exit 2
    fi
    sleep 1
    waited=$((waited + 1))
  done

  summary
}

cmd_down() {
  local name pid pgid i own
  own="$(pgid_of $$)"
  for name in api stripe; do
    [ -f "$STATE/$name.pgid" ] || continue
    pid="$(pid_of "$name")"
    pgid="$(cat "$STATE/$name.pgid")"
    # Pid-reuse guard: a live leader whose command name or start time differs is not ours.
    if alive "$pid" && ! same_process "$name" "$pid"; then
      echo "warning: pid $pid ($name) is now '$(comm_of "$pid")' started $(lstart_of "$pid"), not ours; skipping"
      continue
    fi
    if [ -z "$pgid" ] || [ "$pgid" = "$own" ]; then continue; fi
    group_alive "$pgid" || continue
    kill -- "-$pgid" 2>/dev/null || true
    for i in 1 2 3 4 5; do
      group_alive "$pgid" || break
      sleep 1
    done
    if group_alive "$pgid"; then
      kill -9 -- "-$pgid" 2>/dev/null || true
    fi
  done
  rm -rf "$STATE"
  echo "stack stopped (postgres container left as found)"
}

cmd_status() {
  local name pid
  for name in api stripe; do
    pid="$(pid_of "$name")"
    if leader_ours "$name"; then echo "$name: alive (pid $pid)"; else echo "$name: dead"; fi
  done
  if [ -n "$(listeners "$API_PORT")" ]; then echo "listener on $API_PORT: yes"; else echo "listener on $API_PORT: no"; fi
  if leader_ours api && [ -n "$(listeners "$API_PORT")" ]; then
    echo "test hooks: $(hooks_label)"
  else
    echo "test hooks: unknown (our api is not running)"
  fi
  if container_running; then echo "container $CONTAINER: running"; else echo "container $CONTAINER: not running"; fi
}

cmd_logs() {
  tail -n 50 "$STATE/api.log" "$STATE/stripe.log"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  *)
    echo "usage: $0 up|down|status|logs"
    exit 1
    ;;
esac
