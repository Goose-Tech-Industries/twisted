#!/usr/bin/env bash
"/root/.local/bin/claude" "$@" < /dev/null 2> "/root/twisted/.stderr" &
echo $! > "/root/twisted/.pid"
wait $!
exit $?
