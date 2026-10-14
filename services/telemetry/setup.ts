function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("SETUP_CONFIG_REQUIRED");
  return value;
}
async function call(base: string, path: string, method: string, body: unknown, user: string, password: string, allowed: number[] = []) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", "kbn-xsrf": "cardo-setup", Authorization: "Basic " + Buffer.from(user + ":" + password).toString("base64") }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok && !allowed.includes(response.status)) throw new Error("SETUP_HTTP_" + response.status);
  return response.status === 204 ? null : await response.json() as Record<string, unknown>;
}
const elastic = required("ELASTIC_URL");
const password = required("ELASTIC_ADMIN_PASSWORD");
const es = (path: string, method: string, body: unknown, allowed: number[] = []) => call(elastic, path, method, body, "elastic", password, allowed);

if (process.argv[2] === "elastic") {
  await es("/_security/user/kibana_system/_password", "POST", { password: required("KIBANA_SYSTEM_PASSWORD") });
  await es("/_security/role/cardo_writer", "PUT", { cluster: ["monitor"], indices: [{ names: ["cardo-logs", "cardo-logs-*"], privileges: ["create_doc"] }] });
  await es("/_security/role/cardo_reader", "PUT", { cluster: [], indices: [{ names: ["cardo-logs-*"], privileges: ["read", "view_index_metadata"] }], applications: [{ application: "kibana-.kibana", privileges: ["feature_discover.read", "feature_dashboard.read"], resources: ["space:cardo"] }] });
  await es("/_security/user/cardo_writer", "PUT", { password: required("ELASTIC_WRITER_PASSWORD"), roles: ["cardo_writer"] });
  await es("/_security/user/cardo_reader", "PUT", { password: required("ELASTIC_READER_PASSWORD"), roles: ["cardo_reader"] });
  await es("/_security/user/student", "PUT", { password: required("TOOLS_STUDENT_PASSWORD"), roles: ["cardo_reader"] });
  await es("/_ilm/policy/cardo-logs", "PUT", { policy: { phases: { hot: { actions: { rollover: { max_primary_shard_size: "256mb", max_age: "1d" } } }, delete: { min_age: "3d", actions: { delete: {} } } } } });
  const properties: Record<string, unknown> = { "@timestamp": { type: "date" } };
  for (const field of ["service", "level", "message", "requestId", "eventId", "operationId", "topic", "group", "errorCode", "offset", "currency", "method", "type", "route", "amount"]) properties[field] = { type: "keyword", ignore_above: 200 };
  for (const field of ["status", "durationMs", "partition", "attempt"]) properties[field] = { type: "long" };
  await es("/_index_template/cardo-logs", "PUT", { index_patterns: ["cardo-logs-*"], template: { settings: { number_of_shards: 1, number_of_replicas: 0, "index.lifecycle.name": "cardo-logs", "index.lifecycle.rollover_alias": "cardo-logs" }, mappings: { dynamic: "strict", properties } } });
  await es("/cardo-logs-000001", "PUT", { aliases: { "cardo-logs": { is_write_index: true } } }, [400]);
} else if (process.argv[2] === "views") {
  const kibana = required("KIBANA_URL");
  await call(kibana, "/api/spaces/space", "POST", { id: "cardo", name: "Cardo", description: "Логи учебного банка Cardo", disabledFeatures: ["dev_tools", "advancedSettings", "stackAlerts", "savedObjectsManagement"] }, "elastic", password, [409]);
  await call(kibana, "/s/cardo/api/data_views/data_view", "POST", { override: true, data_view: { id: "cardo-logs", name: "Cardo logs", title: "cardo-logs-*", timeFieldName: "@timestamp", allowNoIndex: false } }, "elastic", password);
  const grafana = required("GRAFANA_URL");
  const admin = required("GRAFANA_ADMIN_PASSWORD");
  const existing = await call(grafana, "/api/users/lookup?loginOrEmail=student", "GET", undefined, "operator", admin, [404]);
  let id = existing?.id;
  if (!id) id = (await call(grafana, "/api/admin/users", "POST", { name: "Cardo student", login: "student", email: "student@cardo.local", password: required("TOOLS_STUDENT_PASSWORD"), OrgId: 1 }, "operator", admin))?.id;
  else await call(grafana, "/api/admin/users/" + String(id) + "/password", "PUT", { password: required("TOOLS_STUDENT_PASSWORD") }, "operator", admin);
  if (!id) throw new Error("SETUP_USER_REQUIRED");
  await call(grafana, "/api/org/users/" + String(id), "PATCH", { role: "Viewer" }, "operator", admin);
} else throw new Error("SETUP_COMMAND_REQUIRED");
console.log(JSON.stringify({ status: "ok", setup: process.argv[2] }));
