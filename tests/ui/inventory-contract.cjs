// Static interaction contract for the administrator inventory surface.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "src/NetworkPortAnalyzer.Web/wwwroot/index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "src/NetworkPortAnalyzer.Web/wwwroot/app.js"), "utf8");

for (const id of ["inventorySearch", "inventoryStatusFilter", "inventoryChangesFilter", "inventoryPendingFilter", "inventoryFiltersToggle", "inventoryFilters", "refreshInventoryBtn", "switchInventory"]) {
  assert(html.includes(`id="${id}"`), `inventory control exists: ${id}`);
}
for (const id of ["reportSearch", "historyFiltersToggle", "historyFilters", "timelineSwitchFilter", "timelinePortFilter", "timelineStatusFilter"]) {
  assert(html.includes(`id="${id}"`), `history filter control exists: ${id}`);
}
for (const token of ["data-inventory-report", "inventory-port-link", "/api/reports/", "/package", "/reports/", "renderSwitchInventory", "inventoryPendingFilter"]) {
  assert(js.includes(token), `inventory interaction exists: ${token}`);
}
assert(js.includes("addEventListener(\"input\", renderSwitchInventory)"), "search filters update without reload");
assert(js.includes('setupResponsiveFilters("inventoryFiltersToggle", "inventoryFilters")'), "inventory filters collapse on compact layouts");
assert(js.includes('setupResponsiveFilters("historyFiltersToggle", "historyFilters")'), "history filters collapse on compact layouts");
console.log("PASS inventory filters, expansion, port selection, refresh, and evidence actions contract");
