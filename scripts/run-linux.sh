#!/bin/sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -m)" in
  x86_64|amd64) arch=x86_64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unsupported Linux CPU architecture.' >&2; exit 1 ;;
esac

set -- "$here"/*-linux-"$arch".AppImage "$@"
if [ ! -f "$1" ]; then
  echo 'The Linux AppImage is missing from this archive.' >&2
  exit 1
fi
exec "$@"
