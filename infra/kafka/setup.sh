#!/bin/bash
set -euo pipefail
umask 077
printf 'security.protocol=SASL_PLAINTEXT\nsasl.mechanism=PLAIN\nsasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="%s";\n' "$KAFKA_ADMIN_PASSWORD" > /tmp/cardo-admin.properties
internal_topics=(cardo.banking.events.v1 cardo.internal.transfers.v1 cardo.internal.topups.v1)
public_topics=(cardo.transfers.v1 cardo.topups.v1 cardo.notifications.v1 cardo.processing-errors.v1)
for topic in "${internal_topics[@]}" "${public_topics[@]}"; do
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --create --if-not-exists --topic "$topic" --partitions 3 --replication-factor 1 --config retention.ms=259200000 --config retention.bytes=268435456 --config segment.bytes=16777216 --config segment.ms=3600000 >/dev/null
  /opt/kafka/bin/kafka-configs.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --entity-type topics --entity-name "$topic" --alter --add-config retention.ms=259200000,retention.bytes=268435456,segment.bytes=16777216,segment.ms=3600000 >/dev/null
done
acl() {
  /opt/kafka/bin/kafka-acls.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --add --allow-principal "User:$1" "${@:2}" >/dev/null
}
for topic in "${internal_topics[@]}" cardo.transfers.v1 cardo.topups.v1; do
  acl banking --operation Write --operation Describe --topic "$topic"
done
acl banking --operation Write --operation Describe --transactional-id cardo-banking-outbox
acl banking --operation IdempotentWrite --cluster
for topic in "${internal_topics[@]}"; do
  acl engagement --operation Read --operation Describe --topic "$topic"
  acl metrics --operation Describe --topic "$topic"
done
for topic in cardo.notifications.v1 cardo.processing-errors.v1; do
  acl engagement --operation Write --operation Describe --topic "$topic"
done
acl engagement --operation Write --operation Describe --transactional-id cardo-engagement-notifications
acl engagement --operation IdempotentWrite --cluster
acl engagement --operation Read --operation Describe --group cardo-engagement
for topic in "${public_topics[@]}"; do
  acl observer --operation Read --operation Describe --topic "$topic"
  acl metrics --operation Read --operation Describe --topic "$topic"
done
acl observer --operation Read --operation Describe --group cardo-ui --resource-pattern-type prefixed
acl observer --operation Describe --group '*'
acl observer --operation Describe --cluster
acl metrics --operation Read --operation Describe --group cardo-practice-audit
acl metrics --operation Describe --group cardo-engagement
acl metrics --operation Describe --cluster
# Retain legacy records for operators and rollback, but show only current topics
# to learners. No topic or consumer offset is deleted during this upgrade.
for topic in cardo.practice.events.v1 cardo.practice.dead-letter.v1; do
  /opt/kafka/bin/kafka-acls.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --remove --force --allow-principal User:observer --operation Read --operation Describe --topic "$topic" >/dev/null
  /opt/kafka/bin/kafka-configs.sh --bootstrap-server kafka:9092 --command-config /tmp/cardo-admin.properties --entity-type topics --entity-name "$topic" --alter --add-config retention.ms=259200000,retention.bytes=268435456,segment.bytes=16777216,segment.ms=3600000 >/dev/null
done
printf 'Cardo topics and least-privilege ACLs prepared\n'
