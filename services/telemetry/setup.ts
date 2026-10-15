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

async function setupDiscover(kibana: string) {
  const path = "/s/cardo/api/saved_objects/search/cardo-actions";
  const saved = await call(kibana, path, "GET", undefined, "elastic", password, [404]);
  const defaults = {
    columns: ["service", "message", "type", "method", "route", "status", "requestId", "eventId"],
    sort: [["@timestamp", "desc"]],
    timeRestore: true,
    timeRange: { from: "now-15m", to: "now" },
    refreshInterval: { pause: false, value: 10000 },
  };
  const previous = saved?.attributes as Record<string, unknown> | undefined;
  const tabs = previous?.tabs as { id: string; label: string; attributes: Record<string, unknown> }[] | undefined;
  const attributes = tabs?.length ? {
    ...previous,
    tabs: tabs.map((tab, index) => index === 0 ? { ...tab, attributes: { ...tab.attributes, ...defaults } } : tab),
  } : {
    title: "Действия и ошибки Cardo",
    description: "Действия пользователя, ошибки и обработка событий. Успешные фоновые обновления списков исключены.",
    tabs: [{
      id: "60f39e60-e83e-58ab-ae2f-46a5c465798f", label: "Действия и ошибки", attributes: {
        ...defaults,
        kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({
          indexRefName: "kibanaSavedObjectMeta.searchSourceJSON.index",
          query: { language: "kuery", query: 'not (message : "http.request" and status < 400 and (method : (GET or HEAD) or route : "/internal/session" or route : "/unmatched"))' },
          filter: [],
        }) },
      },
    }],
  };
  const references = saved?.references || [{ type: "index-pattern", id: "cardo-logs", name: "kibanaSavedObjectMeta.searchSourceJSON.index" }];
  await call(kibana, path, previous ? "PUT" : "POST", { attributes, references, ...(saved?.version ? { version: saved.version } : {}) }, "elastic", password);
}

if (process.argv[2] === "elastic") {
  await es("/_security/user/kibana_system/_password", "POST", { password: required("KIBANA_SYSTEM_PASSWORD") });
  await es("/_security/role/cardo_writer", "PUT", { cluster: ["monitor"], indices: [{ names: ["cardo-logs", "cardo-logs-*"], privileges: ["create_doc"] }] });
  await es("/_security/role/cardo_reader", "PUT", { cluster: [], indices: [{ names: ["cardo-logs-*"], privileges: ["read", "view_index_metadata"] }], applications: [{ application: "kibana-.kibana", privileges: ["feature_discover.read", "feature_dashboard.read"], resources: ["space:cardo"] }] });
  await es("/_security/user/cardo_writer", "PUT", { password: required("ELASTIC_WRITER_PASSWORD"), roles: ["cardo_writer"] });
  await es("/_security/user/cardo_reader", "PUT", { password: required("ELASTIC_READER_PASSWORD"), roles: ["cardo_reader"] });
  await es("/_security/user/student", "PUT", { password: required("TOOLS_STUDENT_PASSWORD"), roles: ["cardo_reader"] });
  await es("/_ilm/policy/cardo-logs", "PUT", { policy: { phases: { hot: { actions: { rollover: { max_primary_shard_size: "256mb", max_age: "1d" } } }, delete: { min_age: "3d", actions: { delete: {} } } } } });
  const properties: Record<string, unknown> = { "@timestamp": { type: "date" } };
  for (const field of ["service", "level", "message", "requestId", "eventId", "causationId", "notificationId", "operationId", "topic", "group", "errorCode", "offset", "currency", "method", "type", "route", "amount", "kind", "category"]) properties[field] = { type: "keyword", ignore_above: 200 };
  for (const field of ["status", "durationMs", "partition", "attempt"]) properties[field] = { type: "long" };
  await es("/_index_template/cardo-logs", "PUT", { index_patterns: ["cardo-logs-*"], template: { settings: { number_of_shards: 1, number_of_replicas: 0, "index.lifecycle.name": "cardo-logs", "index.lifecycle.rollover_alias": "cardo-logs" }, mappings: { dynamic: "strict", properties } } });
  await es("/cardo-logs-000001", "PUT", { aliases: { "cardo-logs": { is_write_index: true } } }, [400]);
  // The template governs future indices; existing strict indices need the same
  // additive fields before producers start sending notification correlations.
  await es("/cardo-logs-*/_mapping", "PUT", { properties: Object.fromEntries(["causationId", "notificationId", "kind", "category"].map(field => [field, properties[field]])) });
} else if (process.argv[2] === "discover") {
  await setupDiscover(required("KIBANA_URL"));
} else if (process.argv[2] === "views") {
  const kibana = required("KIBANA_URL");
  await call(kibana, "/api/spaces/space", "POST", { id: "cardo", name: "Cardo", description: "Логи учебного банка Cardo", disabledFeatures: ["dev_tools", "advancedSettings", "stackAlerts", "savedObjectsManagement"] }, "elastic", password, [409]);
  await call(kibana, "/s/cardo/api/data_views/data_view", "POST", { override: true, data_view: { id: "cardo-logs", name: "Cardo logs", title: "cardo-logs-*", timeFieldName: "@timestamp", allowNoIndex: false } }, "elastic", password);
  await setupDiscover(kibana);
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
