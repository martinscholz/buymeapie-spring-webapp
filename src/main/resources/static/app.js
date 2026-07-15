const state = {
  lists: [],
  currentListId: null,
  currentList: null,
  selectedItemId: null,
  items: [],
  filter: "all",
  query: "",
  groupFilter: "",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
  account: null,
  restrictions: null,
  cache: new Map()
};

const CACHE_TTL_MS = 45_000;
const $ = (selector) => document.querySelector(selector);
const listNav = $("#list-nav");
const itemList = $("#item-list");
const toast = $("#toast");

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const cacheKey = `${method}:${path}`;
  const cached = state.cache.get(cacheKey);
  if (method === "GET" && !options.force && cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return structuredClone(cached.data);
  }

  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || response.statusText);
  }
  const data = await response.json();
  if (method === "GET") {
    state.cache.set(cacheKey, { time: Date.now(), data });
  } else {
    state.cache.clear();
  }
  return data;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function itemPurchased(item) {
  return Boolean(item.is_purchased ?? item.purchased);
}

function itemTitle(item) {
  return item.title || item.name || item.text || "Untitled item";
}

function itemAmount(item) {
  return item.amount || item.quantity || "";
}

function itemGroup(item) {
  const candidate = item.group || item.group_name || item.groupName || item.category || item.section || item.department;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === "object") {
    return candidate.name || candidate.title || candidate.id || "Other";
  }
  return "Ungrouped";
}

function itemId(item) {
  return item.id || item.uuid || item.item_id || itemTitle(item);
}

function itemCreatedAt(item) {
  return item.created_at ?? item.createdAt ?? item.created ?? item.created_on ?? item.createdOn;
}

function itemUpdatedAt(item) {
  return item.updated_at ?? item.updatedAt ?? item.modified_at ?? item.modifiedAt ?? item.updated_on ?? item.updatedOn;
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return parseTimestamp(Number(value));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseTimestamp(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function filterBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function listName(list) {
  return list.name || "Untitled list";
}

function listOpenCount(list) {
  return Number(list.items_not_purchased ?? list.not_purchased ?? 0);
}

function renderLists() {
  listNav.innerHTML = "";
  if (!state.lists.length) {
    listNav.innerHTML = `<p class="empty-copy">No lists yet.</p>`;
    return;
  }
  for (const list of state.lists) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-button ${list.id === state.currentListId ? "active" : ""}`;
    button.innerHTML = `<strong></strong><span class="count-pill"></span>`;
    button.querySelector("strong").textContent = listName(list);
    button.querySelector(".count-pill").textContent = listOpenCount(list);
    button.addEventListener("click", () => selectList(list.id));
    listNav.append(button);
  }
}

function renderSummary() {
  const open = state.items.filter((item) => !itemPurchased(item)).length;
  const done = state.items.length - open;
  $("#summary-open").textContent = open;
  $("#summary-done").textContent = done;
  $("#summary-total").textContent = state.items.length;
}

function renderCurrentList() {
  const hasList = Boolean(state.currentListId && state.currentList);
  $("#empty-state").hidden = hasList;
  $("#items-panel").hidden = !hasList;
  $("#add-item-form").querySelectorAll("input,button").forEach((element) => element.disabled = !hasList);
  $("#rename-list-name").value = state.currentList ? listName(state.currentList) : "";
  $("#share-emails").value = Array.isArray(state.currentList?.emails) ? state.currentList.emails.join(", ") : "";
  $("#current-list-title").textContent = state.currentList ? listName(state.currentList) : "Shopping lists";
  renderSummary();
  renderGroupSuggestions();
  renderFilterGroups();
  renderItems();
  renderSelectedItem();
}

function renderItems() {
  itemList.innerHTML = "";
  const normalizedQuery = state.query.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const purchased = itemPurchased(item);
    const haystack = `${itemTitle(item)} ${itemAmount(item)} ${itemGroup(item)} ${JSON.stringify(item)}`.toLowerCase();
    const matchesFilter = state.filter === "all" || (state.filter === "open" && !purchased) || (state.filter === "purchased" && purchased);
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    return matchesFilter && matchesQuery && matchesGroup(item) && matchesDateRange(itemCreatedAt(item), state.createdFrom, state.createdTo) &&
      matchesDateRange(itemUpdatedAt(item), state.updatedFrom, state.updatedTo);
  });

  if (!filtered.length) {
    itemList.innerHTML = `<li class="empty-state"><h3>No matching items</h3><p>Try another filter or add something new.</p></li>`;
    return;
  }

  for (const [group, items] of groupedItems(filtered)) {
    const section = document.createElement("li");
    section.className = "group-section";
    section.innerHTML = `<div class="group-heading"></div><ul class="item-list"></ul>`;
    section.querySelector(".group-heading").textContent = group;
    const nested = section.querySelector("ul");
    for (const item of items) {
      nested.append(renderItemRow(item));
    }
    itemList.append(section);
  }
}

function renderItemRow(item) {
  const row = document.createElement("li");
  const purchased = itemPurchased(item);
  const id = itemId(item);
  row.className = `item-row ${purchased ? "purchased" : ""} ${id === state.selectedItemId ? "selected" : ""}`;
  row.innerHTML = `
    <button class="check-button" type="button" title="Toggle purchased">✓</button>
    <div class="item-main">
      <strong class="item-title"></strong>
      <span class="item-meta">
        <span class="amount"></span>
        <span class="group-pill"></span>
      </span>
    </div>
    <div class="item-actions">
      <button class="small-button inspect" type="button">Details</button>
      <button class="small-button edit" type="button">Edit</button>
      <button class="small-button danger remove" type="button">Delete</button>
    </div>
  `;
  row.querySelector(".item-title").textContent = itemTitle(item);
  const amount = row.querySelector(".amount");
  amount.textContent = itemAmount(item);
  amount.hidden = !itemAmount(item);
  row.querySelector(".group-pill").textContent = itemGroup(item);
  row.querySelector(".check-button").addEventListener("click", () => setPurchased(item, !purchased));
  row.querySelector(".inspect").addEventListener("click", () => selectItem(item));
  row.querySelector(".edit").addEventListener("click", () => editItem(item));
  row.querySelector(".remove").addEventListener("click", () => deleteItem(item));
  row.addEventListener("dblclick", () => selectItem(item));
  return row;
}

function groupedItems(items) {
  const groups = new Map();
  for (const item of items) {
    const group = itemGroup(item);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "Ungrouped") return 1;
    if (b === "Ungrouped") return -1;
    return a.localeCompare(b);
  });
}

function matchesGroup(item) {
  return !state.groupFilter || itemGroup(item) === state.groupFilter;
}

function matchesDateRange(rawValue, from, to) {
  const date = parseTimestamp(rawValue);
  if (!from && !to) return true;
  if (!date) return false;
  const start = filterBoundary(from);
  const end = filterBoundary(to, true);
  return (!start || date >= start) && (!end || date <= end);
}

function selectItem(item) {
  state.selectedItemId = itemId(item);
  renderItems();
  renderSelectedItem();
  if (window.innerWidth <= 1100) {
    $("#details-drawer").classList.add("open");
  }
}

function renderSelectedItem() {
  const item = state.items.find((candidate) => itemId(candidate) === state.selectedItemId);
  const summary = $("#selected-item-summary");
  const fields = $("#selected-item-fields");
  const json = $("#selected-item-json");
  if (!item) {
    summary.className = "detail-summary muted-box";
    summary.textContent = "Select an item to inspect its attributes.";
    fields.innerHTML = "";
    json.textContent = "{}";
    return;
  }
  summary.className = "detail-summary";
  summary.innerHTML = `<strong></strong><span></span><span></span><span></span><span></span>`;
  summary.querySelector("strong").textContent = itemTitle(item);
  const spans = summary.querySelectorAll("span");
  spans[0].textContent = `Group: ${itemGroup(item)}`;
  spans[1].textContent = itemPurchased(item) ? "Purchased" : "Open";
  spans[2].textContent = formatDateTime(itemCreatedAt(item)) ? `Created: ${formatDateTime(itemCreatedAt(item))}` : "Created: n/a";
  spans[3].textContent = formatDateTime(itemUpdatedAt(item)) ? `Updated: ${formatDateTime(itemUpdatedAt(item))}` : "Updated: n/a";
  fields.innerHTML = "";
  Object.entries(flattenObject(item)).forEach(([key, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = formatAttributeValue(key, value);
    fields.append(dt, dd);
  });
  json.textContent = JSON.stringify(item, null, 2);
}

function flattenObject(value, prefix = "", result = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    result[prefix || "value"] = value;
    return result;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      flattenObject(nested, nextKey, result);
    } else {
      result[nextKey] = nested;
    }
  }
  return result;
}

function formatAttributeValue(key, value) {
  if (looksLikeTimestampKey(key)) {
    return formatDateTime(value) || String(value ?? "");
  }
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function looksLikeTimestampKey(key) {
  return /(^|[._-])(created|updated|modified)(_|-|$|at|on)/i.test(key || "");
}

async function loadLists(selectFirst = false, force = false) {
  state.lists = await api("/api/lists", { force });
  if (selectFirst && !state.currentListId && state.lists[0]) {
    state.currentListId = state.lists[0].id;
  }
  renderLists();
}

async function selectList(listId, force = false, preserveSelectedItem = false) {
  state.currentListId = listId;
  state.currentList = null;
  state.items = [];
  if (!preserveSelectedItem) {
    state.selectedItemId = null;
  }
  renderLists();
  renderCurrentList();
  const data = await api(`/api/lists/${encodeURIComponent(listId)}`, { force });
  state.currentList = data.list;
  state.items = Array.isArray(data.items) ? data.items : [];
  renderCurrentList();
}

async function refresh() {
  try {
    state.cache.clear();
    await Promise.all([loadLists(true, true), loadAccount(true), loadUniqueItems(true)]);
    if (state.currentListId) {
      await selectList(state.currentListId, true);
    } else {
      renderCurrentList();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAccount(force = false) {
  const [account, restrictions] = await Promise.all([
    api("/api/account", { force }),
    api("/api/restrictions", { force })
  ]);
  state.account = account;
  state.restrictions = restrictions;
  $("#account-label").textContent = account.email || account.login || account.name || "Connected account";
  $("#account-json").textContent = JSON.stringify(account, null, 2);
  $("#restrictions-json").textContent = JSON.stringify(restrictions, null, 2);
}

async function loadUniqueItems(force = false) {
  const data = await api("/api/unique-items", { force }).catch(() => []);
  const values = [...extractStrings(data)].sort((a, b) => a.localeCompare(b));
  $("#unique-items").innerHTML = values
    .slice(0, 500)
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

function renderGroupSuggestions() {
  const groups = [...new Set(state.items.map(itemGroup))]
    .filter((group) => group && group !== "Ungrouped")
    .sort((a, b) => a.localeCompare(b));
  $("#group-suggestions").innerHTML = groups
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

function renderFilterGroups() {
  const select = $("#filter-group");
  const groups = [...new Set(state.items.map(itemGroup))]
    .filter(Boolean)
    .sort((a, b) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b);
    });
  const current = state.groupFilter;
  select.innerHTML = `<option value="">All groups</option>` + groups
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
  select.value = groups.includes(current) ? current : "";
  state.groupFilter = select.value;
}

function extractStrings(value, result = new Set()) {
  if (typeof value === "string" && value.trim()) {
    result.add(value.trim());
  } else if (Array.isArray(value)) {
    value.forEach((entry) => extractStrings(entry, result));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      if (["title", "name", "text", "value", "label"].includes(key) || typeof entry !== "object") {
        extractStrings(entry, result);
      }
    });
  }
  return result;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function setPurchased(item, purchased) {
  try {
    await api(`/api/lists/${state.currentListId}/items/${itemId(item)}/purchased`, {
      method: "PUT",
      body: JSON.stringify({ purchased })
    });
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
}

async function editItem(item) {
  const title = prompt("Item name", itemTitle(item));
  if (title === null || !title.trim()) return;
  const amount = prompt("Amount", itemAmount(item));
  if (amount === null) return;
  const group = prompt("Group", itemGroup(item) === "Ungrouped" ? "" : itemGroup(item));
  if (group === null) return;
  try {
    await api(`/api/lists/${state.currentListId}/items/${itemId(item)}`, {
      method: "PATCH",
      body: JSON.stringify({ title: title.trim(), amount, group })
    });
    await afterMutation(itemId(item));
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteItem(item) {
  if (!confirm(`Delete "${itemTitle(item)}"?`)) return;
  try {
    await api(`/api/lists/${state.currentListId}/items/${itemId(item)}`, { method: "DELETE" });
    state.selectedItemId = null;
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
}

async function afterMutation(selectedItemId = state.selectedItemId) {
  state.cache.clear();
  await loadLists(false, true);
  state.selectedItemId = selectedItemId;
  await selectList(state.currentListId, true, true);
}

$("#create-list-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#new-list-name");
  try {
    const created = await api("/api/lists", { method: "POST", body: JSON.stringify({ name: input.value.trim() }) });
    input.value = "";
    await loadLists(false, true);
    await selectList(created.id || state.lists.at(-1)?.id, true);
  } catch (error) {
    showToast(error.message);
  }
});

$("#add-item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentListId) return;
  const title = $("#item-title");
  const amount = $("#item-amount");
  const group = $("#item-group");
  try {
    const created = await api(`/api/lists/${state.currentListId}/items`, {
      method: "POST",
      body: JSON.stringify({ title: title.value.trim(), amount: amount.value.trim(), group: group.value.trim(), purchased: false })
    });
    title.value = "";
    amount.value = "";
    group.value = "";
    await afterMutation(created.id);
  } catch (error) {
    showToast(error.message);
  }
});

$("#rename-list-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentListId) return;
  try {
    await api(`/api/lists/${state.currentListId}`, {
      method: "PUT",
      body: JSON.stringify({ name: $("#rename-list-name").value.trim(), emails: state.currentList?.emails || [] })
    });
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
});

$("#save-share-button").addEventListener("click", async () => {
  if (!state.currentListId) return;
  const emails = $("#share-emails").value.split(/[\n,;]/).map((email) => email.trim()).filter(Boolean);
  try {
    await api(`/api/lists/${state.currentListId}`, {
      method: "PUT",
      body: JSON.stringify({ name: $("#rename-list-name").value.trim(), emails })
    });
    await afterMutation();
    showToast("Sharing updated");
  } catch (error) {
    showToast(error.message);
  }
});

$("#delete-list-button").addEventListener("click", async () => {
  if (!state.currentListId || !confirm(`Delete "${listName(state.currentList)}" permanently?`)) return;
  try {
    await api(`/api/lists/${state.currentListId}`, { method: "DELETE" });
    state.currentListId = null;
    state.currentList = null;
    state.selectedItemId = null;
    state.items = [];
    state.cache.clear();
    await loadLists(true, true);
    if (state.currentListId) await selectList(state.currentListId, true);
    renderCurrentList();
  } catch (error) {
    showToast(error.message);
  }
});

$("#refresh-button").addEventListener("click", refresh);
$("#details-button").addEventListener("click", () => $("#details-drawer").classList.add("open"));
$("#close-details").addEventListener("click", () => $("#details-drawer").classList.remove("open"));

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((other) => other.classList.toggle("active", other === button));
    renderItems();
  });
});

$("#search-items").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderItems();
});

$("#filter-group").addEventListener("change", (event) => {
  state.groupFilter = event.target.value;
  renderItems();
});

[
  ["#filter-created-from", "createdFrom"],
  ["#filter-created-to", "createdTo"],
  ["#filter-updated-from", "updatedFrom"],
  ["#filter-updated-to", "updatedTo"]
].forEach(([selector, key]) => {
  $(selector).addEventListener("change", (event) => {
    state[key] = event.target.value;
    renderItems();
  });
});

$("#clear-filters").addEventListener("click", () => {
  state.groupFilter = "";
  state.createdFrom = "";
  state.createdTo = "";
  state.updatedFrom = "";
  state.updatedTo = "";
  $("#filter-group").value = "";
  $("#filter-created-from").value = "";
  $("#filter-created-to").value = "";
  $("#filter-updated-from").value = "";
  $("#filter-updated-to").value = "";
  renderItems();
});

refresh();
