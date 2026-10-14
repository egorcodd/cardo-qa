#!/bin/bash
set -euo pipefail
umask 077
printf 'security.protocol=SASL_PLAINTEXT\nsasl.mechanism=PLAIN\nsasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="%s";\n' "$KAFKA_ADMIN_PASSWORD" > /tmp/cardo-admin.properties
/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties >/dev/null 2>&1
