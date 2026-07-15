const state = {
  lists: [],
  currentListId: null,
  currentList: null,
  items: [],
  filter: "all",
  query: "",
  groupFilter: "",
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
    return candidate.name || candidate.title || groupLabelForId(normalizeGroupId(candidate.id ?? candidate.group_id)) || "Other";
  }
  const groupId = itemGroupId(item);
  if (groupId !== null) return groupLabelForId(groupId);
  return "Ungrouped";
}

function itemGroupId(item) {
  return normalizeGroupId(item.group_id ?? item.groupId ?? item.group?.id ?? item.category_id ?? item.section_id ?? item.department_id);
}

function normalizeGroupId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function groupLabelForId(groupId) {
  if (groupId === null) return null;
  const definitions = groupDefinitionMap();
  if (definitions.has(groupId)) return definitions.get(groupId);
  return groupId === "0" ? "Ungrouped" : `Group ${groupId}`;
}

function groupDefinitionMap() {
  const definitions = new Map();
  collectGroupDefinitions(state.currentList, "", definitions);
  return definitions;
}

function collectGroupDefinitions(value, key, definitions) {
  if (!value || typeof value !== "object") return;
  const groupKey = /group|categor|section|department/i.test(key);
  if (Array.isArray(value)) {
    if (groupKey) {
      value.forEach((entry) => addGroupDefinition(entry, definitions));
    }
    value.forEach((entry) => collectGroupDefinitions(entry, key, definitions));
    return;
  }
  if (groupKey) {
    addGroupDefinition(value, definitions);
    Object.entries(value).forEach(([entryKey, entry]) => {
      if (typeof entry === "string" && entry.trim()) {
        definitions.set(entryKey, entry.trim());
      } else {
        addGroupDefinition(entry, definitions);
      }
    });
  }
  Object.entries(value).forEach(([childKey, childValue]) => collectGroupDefinitions(childValue, childKey, definitions));
}

function addGroupDefinition(value, definitions) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const id = normalizeGroupId(value.id ?? value.group_id ?? value.groupId ?? value.value);
  const name = value.name ?? value.title ?? value.label ?? value.text;
  if (id !== null && typeof name === "string" && name.trim()) {
    definitions.set(id, name.trim());
  }
}

function itemId(item) {
  return item.id || item.uuid || item.item_id || itemTitle(item);
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
  $("#current-list-title").textContent = state.currentList ? listName(state.currentList) : "Shopping lists";
  renderSummary();
  renderGroupSuggestions();
  renderFilterGroups();
  renderItems();
}

function renderItems() {
  itemList.innerHTML = "";
  const normalizedQuery = state.query.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const purchased = itemPurchased(item);
    const haystack = `${itemTitle(item)} ${itemAmount(item)} ${itemGroup(item)} ${JSON.stringify(item)}`.toLowerCase();
    const matchesFilter = state.filter === "all" || (state.filter === "open" && !purchased) || (state.filter === "purchased" && purchased);
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    return matchesFilter && matchesQuery && matchesGroup(item);
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
  row.className = `item-row ${purchased ? "purchased" : ""}`;
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
  row.querySelector(".edit").addEventListener("click", () => editItem(item));
  row.querySelector(".remove").addEventListener("click", () => deleteItem(item));
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

async function loadLists(selectFirst = false, force = false) {
  state.lists = await api("/api/lists", { force });
  if (selectFirst && !state.currentListId && state.lists[0]) {
    state.currentListId = state.lists[0].id;
  }
  renderLists();
}

async function selectList(listId, force = false) {
  state.currentListId = listId;
  state.currentList = null;
  state.items = [];
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
  const groups = availableGroupLabels()
    .filter((group) => group && group !== "Ungrouped")
    .sort((a, b) => a.localeCompare(b));
  $("#group-suggestions").innerHTML = groups
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

function renderFilterGroups() {
  const select = $("#filter-group");
  const groups = availableGroupLabels()
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

function availableGroupLabels() {
  const labels = new Set(state.items.map(itemGroup).filter(Boolean));
  groupDefinitionMap().forEach((name) => labels.add(name));
  return [...labels];
}

function groupInputPayload(value) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const match = [...groupDefinitionMap().entries()]
    .find(([, name]) => name.toLowerCase() === trimmed.toLowerCase());
  if (match && /^-?\d+$/.test(match[0])) return { groupId: Number(match[0]) };
  if (match) return { group: match[1] };
  const fallbackMatch = trimmed.match(/^group\s+(-?\d+)$/i);
  if (fallbackMatch) return { groupId: Number(fallbackMatch[1]) };
  if (/^\d+$/.test(trimmed)) return { groupId: Number(trimmed) };
  return { group: trimmed };
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
      body: JSON.stringify({ title: title.trim(), amount, ...groupInputPayload(group) })
    });
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteItem(item) {
  if (!confirm(`Delete "${itemTitle(item)}"?`)) return;
  try {
    await api(`/api/lists/${state.currentListId}/items/${itemId(item)}`, { method: "DELETE" });
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
}

async function afterMutation() {
  state.cache.clear();
  await loadLists(false, true);
  await selectList(state.currentListId, true);
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
      body: JSON.stringify({ title: title.value.trim(), amount: amount.value.trim(), ...groupInputPayload(group.value), purchased: false })
    });
    title.value = "";
    amount.value = "";
    group.value = "";
    await afterMutation();
  } catch (error) {
    showToast(error.message);
  }
});

$("#refresh-button").addEventListener("click", refresh);

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

$("#clear-filters").addEventListener("click", () => {
  state.groupFilter = "";
  $("#filter-group").value = "";
  renderItems();
});

refresh();
