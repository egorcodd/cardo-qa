import { Kafka, logLevel } from "kafkajs";
import { log } from "./telemetry.ts";

export const topics = { banking: "cardo.banking.events.v1", practice: "cardo.practice.events.v1", deadLetter: "cardo.practice.dead-letter.v1" };
export function kafkaEnabled() { return process.env.EVENT_TRANSPORT === "kafka"; }
export function kafkaClient(service: string) {
  const brokers = process.env.KAFKA_BROKERS?.split(",").filter(Boolean);
  const username = process.env.KAFKA_USERNAME;
  const password = process.env.KAFKA_PASSWORD;
  if (!brokers?.length || !username || !password) throw new Error("KAFKA_CONFIG_REQUIRED");
  return new Kafka({ clientId: "cardo-" + service, brokers, sasl: { mechanism: "plain", username, password }, connectionTimeout: 5000, requestTimeout: 10000, retry: { retries: 5, initialRetryTime: 500 }, logLevel: logLevel.ERROR, logCreator: () => () => log(service, "error", "kafka.connection", { errorCode: "KAFKA_CONNECTION" }) });
}
