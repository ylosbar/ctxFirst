#!/usr/bin/env bash
# Lance `yarn dev` en s'assurant que toute instance précédente
# (et toute sa descendance : electron-vite, vite, electron, …) est tuée d'abord.
# Utilisé par la tâche VSCode "dev" pour permettre un relaunch fiable via F6.

set -u

PID_FILE=""

kill_group() {
  local pgid="$1"
  [ -n "$pgid" ] || return 0
  kill -0 -"$pgid" 2>/dev/null || return 0

  kill -TERM -"$pgid" 2>/dev/null || true
  for _ in $(seq 1 40); do
    kill -0 -"$pgid" 2>/dev/null || return 0
    sleep 0.1
  done
  kill -KILL -"$pgid" 2>/dev/null || true
}

if [ -f "$PID_FILE" ]; then
  kill_group "$(cat "$PID_FILE" 2>/dev/null)"
  rm -f "$PID_FILE"
fi

# setsid -> nouvelle session, l'inner shell devient leader du process group.
# echo $$ capture ce PGID dans le fichier, puis exec yarn dev pour que les
# signaux atteignent yarn/electron-vite directement.
exec setsid bash -c "echo \$\$ > '$PID_FILE'; exec yarn dev"
