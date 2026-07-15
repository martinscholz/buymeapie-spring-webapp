const state = {
  lists: [],
  currentListId: null,
  currentList: null,
  items: [],
  filter: "all",
  query: "",
  account: null,
  restrictions: null
};

const $ = (selector) => document.querySelector(selector);
const listNav = $("#list-nav");
const itemList = $("#item-list");
const toast = $("#toast");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || response.statusText);
  }
  return response.json();
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
  return item.title || item.name || "Untitled item";
}

function itemAmount(item) {
  return item.amount || "";
}

function listName(list) {
  return list.name || "Untitled list";
}

function listOpenCount(list) {
  return Number(list.items_not_purchased ?? list.not_purchased ?? 0);
}

function listPurchasedCount(list) {
  return Number(list.items_purchased ?? list.purchased ?? 0);
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
  const hasList = Boolean(state.currentListId);
  $("#empty-state").hidden = hasList;
  $("#items-panel").hidden = !hasList;
  $("#add-item-form").querySelectorAll("input,button").forEach((element) => element.disabled = !hasList);
  $("#rename-list-name").value = state.currentList ? listName(state.currentList) : "";
  $("#share-emails").value = Array.isArray(state.currentList?.emails) ? state.currentList.emails.join(", ") : "";
  $("#current-list-title").textContent = state.currentList ? listName(state.currentList) : "Shopping lists";
  renderSummary();
  renderItems();
}

function renderItems() {
  itemList.innerHTML = "";
  const normalizedQuery = state.query.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const purchased = itemPurchased(item);
    const matchesFilter = state.filter === "all" || (state.filter === "open" && !purchased) || (state.filter === "purchased" && purchased);
    const matchesQuery = !normalizedQuery || `${itemTitle(item)} ${itemAmount(item)}`.toLowerCase().includes(normalizedQuery);
    return matchesFilter && matchesQuery;
  });

  if (!filtered.length) {
    itemList.innerHTML = `<li class="empty-state"><h3>No matching items</h3><p>Try another filter or add something new.</p></li>`;
    return;
  }

  for (const item of filtered) {
    const row = document.createElement("li");
    const purchased = itemPurchased(item);
    row.className = `item-row ${purchased ? "purchased" : ""}`;
    row.innerHTML = `
      <button class="check-button" type="button" title="Toggle purchased">✓</button>
      <div class="item-main">
        <strong class="item-title"></strong>
        <span class="amount"></span>
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
    row.querySelector(".check-button").addEventListener("click", () => setPurchased(item, !purchased));
    row.querySelector(".edit").addEventListener("click", () => editItem(item));
    row.querySelector(".remove").addEventListener("click", () => deleteItem(item));
    itemList.append(row);
  }
}

async function loadLists(selectFirst = false) {
  state.lists = await api("/api/lists");
  if (selectFirst && !state.currentListId && state.lists[0]) {
    state.currentListId = state.lists[0].id;
  }
  renderLists();
}

async function selectList(listId) {
  state.currentListId = listId;
  renderLists();
  const data = await api(`/api/lists/${encodeURIComponent(listId)}`);
  state.currentList = data.list;
  state.items = Array.isArray(data.items) ? data.items : [];
  renderCurrentList();
}

async function refresh() {
  try {
    await Promise.all([loadLists(true), loadAccount(), loadUniqueItems()]);
    if (state.currentListId) {
      await selectList(state.currentListId);
    } else {
      renderCurrentList();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAccount() {
  const [account, restrictions] = await Promise.all([
    api("/api/account"),
    api("/api/restrictions")
  ]);
  state.account = account;
  state.restrictions = restrictions;
  $("#account-label").textContent = account.email || account.name || "Connected account";
  $("#account-json").textContent = JSON.stringify(account, null, 2);
  $("#restrictions-json").textContent = JSON.stringify(restrictions, null, 2);
}

async function loadUniqueItems() {
  const data = await api("/api/unique-items").catch(() => []);
  const values = Array.isArray(data) ? data : Object.values(data || {}).flat();
  $("#unique-items").innerHTML = values
    .filter((value) => typeof value === "string")
    .slice(0, 250)
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
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
    await api(`/api/lists/${state.currentListId}/items/${item.id}/purchased`, {
      method: "PUT",
      body: JSON.stringify({ purchased })
    });
    await selectList(state.currentListId);
  } catch (error) {
    showToast(error.message);
  }
}

async function editItem(item) {
  const title = prompt("Item name", itemTitle(item));
  if (title === null || !title.trim()) return;
  const amount = prompt("Amount", itemAmount(item));
  try {
    await api(`/api/lists/${state.currentListId}/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: title.trim(), amount: amount ?? "" })
    });
    await selectList(state.currentListId);
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteItem(item) {
  if (!confirm(`Delete "${itemTitle(item)}"?`)) return;
  try {
    await api(`/api/lists/${state.currentListId}/items/${item.id}`, { method: "DELETE" });
    await selectList(state.currentListId);
  } catch (error) {
    showToast(error.message);
  }
}

$("#create-list-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#new-list-name");
  try {
    const created = await api("/api/lists", { method: "POST", body: JSON.stringify({ name: input.value.trim() }) });
    input.value = "";
    await loadLists();
    await selectList(created.id || state.lists.at(-1)?.id);
  } catch (error) {
    showToast(error.message);
  }
});

$("#add-item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentListId) return;
  const title = $("#item-title");
  const amount = $("#item-amount");
  try {
    await api(`/api/lists/${state.currentListId}/items`, {
      method: "POST",
      body: JSON.stringify({ title: title.value.trim(), amount: amount.value.trim(), purchased: false })
    });
    title.value = "";
    amount.value = "";
    await selectList(state.currentListId);
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
    await loadLists();
    await selectList(state.currentListId);
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
    await selectList(state.currentListId);
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
    state.items = [];
    await loadLists(true);
    if (state.currentListId) await selectList(state.currentListId);
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

refresh();
