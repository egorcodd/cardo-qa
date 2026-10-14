import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const folder = path.resolve(".local");
mkdirSync(folder, { recursive: true });
const target = path.join(folder, "observability.env");
if (existsSync(target)) throw new Error("Private environment already exists; refusing to replace credentials");
const keys = ["KAFKA_BROKER_PASSWORD", "KAFKA_ADMIN_PASSWORD", "KAFKA_BANKING_PASSWORD", "KAFKA_ENGAGEMENT_PASSWORD", "KAFKA_OBSERVER_PASSWORD", "KAFKA_METRICS_PASSWORD", "ELASTIC_ADMIN_PASSWORD", "ELASTIC_WRITER_PASSWORD", "ELASTIC_READER_PASSWORD", "KIBANA_SYSTEM_PASSWORD", "GRAFANA_ADMIN_PASSWORD", "GRAFANA_SECRET_KEY", "KIBANA_SECURITY_KEY", "KIBANA_SAVED_OBJECTS_KEY", "KIBANA_REPORTING_KEY", "TOOLS_STUDENT_PASSWORD"];
const lines = keys.map(key => key + "=" + randomBytes(32).toString("base64url"));
writeFileSync(target, lines.join("\n") + "\nCARDO_TOOLS_ORIGIN=https://cardo.egorcod.com\n", { flag: "wx", mode: 0o600 });
console.log("Private observability environment created: .local/observability.env");
