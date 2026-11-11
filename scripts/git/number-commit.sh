#!/bin/sh
# Prefixa a mensagem com o número sequencial do commit: 0001, 0002, ...
MSG_FILE="$1"
SOURCE="$2"
case "$SOURCE" in merge|squash) exit 0 ;; esac
head -n 1 "$MSG_FILE" | grep -Eq '^[0-9]{4} ' && exit 0      # já numerado (ex.: --amend)
COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
N=$((COUNT + 1))
{ printf '%04d ' "$N"; cat "$MSG_FILE"; } > "$MSG_FILE.tmp" && mv "$MSG_FILE.tmp" "$MSG_FILE"
