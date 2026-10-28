CREATE VIEW banking.operation_history AS
SELECT id::text AS event_id,
  (payload->>'occurredAt')::timestamptz AS occurred_at,
  payload->>'type' AS type,
  CASE WHEN payload->'payload'->>'amount' ~ '^\d{1,10}(\.\d{1,2})?$'
    THEN (payload->'payload'->>'amount')::numeric(14,2) END AS amount,
  payload->'payload'->>'currency' AS currency,
  COALESCE(payload->'payload'->>'operationId',payload->'payload'->>'senderOperationId',payload->'payload'->>'transferId') AS operation_id,
  payload->>'requestId' AS request_id
FROM banking.outbox
WHERE payload->>'type' IN ('banking.transfer.completed','banking.external-transfer.completed','banking.top-up.completed');
GRANT SELECT ON banking.operation_history TO cardo_grafana;
