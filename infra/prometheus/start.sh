#!/bin/sh
set -eu
umask 077
printf '%s' "$INTERNAL_TOKEN" >/tmp/cardo-token
exec /bin/prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus --storage.tsdb.retention.time=3d --storage.tsdb.retention.size=512MB
