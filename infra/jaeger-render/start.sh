#!/bin/sh
set -e

# Start Jaeger in the background, then run nginx in the foreground so the container
# stays alive as long as nginx does (Render/Docker track the foreground process).
/jaeger-root/go/bin/all-in-one-linux &
nginx -g "daemon off;"