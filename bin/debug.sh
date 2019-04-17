#!/bin/sh

HOMEDIR="$(dirname "$(cd -- "$(dirname "$0")" && (pwd -P 2>/dev/null || pwd))")"
cd $HOMEDIR

$HOMEDIR/bin/control.sh debug
