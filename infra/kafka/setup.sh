#!/bin/bash
set -euo pipefail
umask 077
printf 'security.protocol=SASL_PLAINTEXT\nsasl.mechanism=PLAIN\nsasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="%s";\n' "$KAFKA_ADMIN_PASSWORD" > /tmp/cardo-admin.properties
for topic in cardo.banking.events.v1 cardo.practice.events.v1 cardo.practice.dead-letter.v1; do
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --create --if-not-exists --topic "$topic" --partitions 3 --replication-factor 1 --config retention.ms=259200000 --config retention.bytes=268435456 --config segment.bytes=16777216 >/dev/null
done
acl() {
  /opt/kafka/bin/kafka-acls.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --add --allow-principal "User:$1" "${@:2}" >/dev/null
}
for topic in cardo.banking.events.v1 cardo.practice.events.v1; do
  acl banking --operation Write --operation Describe --topic "$topic"
done
acl banking --operation Write --operation Describe --transactional-id cardo-banking-outbox
acl banking --operation IdempotentWrite --cluster
acl engagement --operation Read --operation Describe --topic cardo.banking.events.v1
acl engagement --operation Write --operation Describe --topic cardo.practice.dead-letter.v1
acl engagement --operation Read --operation Describe --group cardo-engagement
for topic in cardo.practice.events.v1 cardo.practice.dead-letter.v1; do
  acl observer --operation Read --operation Describe --topic "$topic"
  acl metrics --operation Read --operation Describe --topic "$topic"
done
acl observer --operation Read --operation Describe --group cardo-ui --resource-pattern-type prefixed
acl observer --operation Describe --group '*'
acl observer --operation Describe --cluster
acl metrics --operation Read --operation Describe --group cardo-practice-audit
acl metrics --operation Describe --group cardo-engagement
acl metrics --operation Describe --topic cardo.banking.events.v1
acl metrics --operation Describe --cluster
printf 'Cardo topics and least-privilege ACLs prepared\n'
