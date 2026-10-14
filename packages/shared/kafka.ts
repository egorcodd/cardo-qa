import { Kafka, logLevel } from "kafkajs";
import { log } from "./telemetry.ts";

export const topics = {
  legacyBanking: "cardo.banking.events.v1",
  internalTransfers: "cardo.internal.transfers.v1",
  internalTopups: "cardo.internal.topups.v1",
  transfers: "cardo.transfers.v1",
  topups: "cardo.topups.v1",
  notifications: "cardo.notifications.v1",
  deadLetter: "cardo.processing-errors.v1",
};
export const bankingTopics = [topics.legacyBanking, topics.internalTransfers, topics.internalTopups];
export const practiceTopics = [topics.transfers, topics.topups, topics.notifications, topics.deadLetter];
export function operationTopics(type: unknown) {
  if (type === "banking.top-up.completed") return { internal: topics.internalTopups, public: topics.topups };
  if (type === "banking.transfer.completed" || type === "banking.external-transfer.completed") return { internal: topics.internalTransfers, public: topics.transfers };
  throw new Error("UNKNOWN_OPERATION_EVENT");
}
export function kafkaEnabled() { return process.env.EVENT_TRANSPORT === "kafka"; }
export function kafkaClient(service: string) {
  const brokers = process.env.KAFKA_BROKERS?.split(",").filter(Boolean);
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;
  if (!brokers?.length || !username || !password) throw new Error("KAFKA_CONFIG_REQUIRED");
  return new Kafka({ clientId: "cardo-" + service, brokers, sasl: { mechanism: "plain", username, password }, connectionTimeout: 5000, requestTimeout: 10000, retry: { retries: 5, initialRetryTime: 500 }, logLevel: logLevel.ERROR, logCreator: () => () => log(service, "error", "kafka.connection", { errorCode: "KAFKA_CONNECTION" }) });
}
