const ICONS = ["📘", "⚡", "💻", "🔬", "📊", "📚"];

const COLORS = ["#7c4dff", "#ff9800", "#2f80ed", "#2fb67c", "#ec407a", "#f5b400", "#00acc1", "#ef5350"];

const GROUPS = [
  { key: "lectures", label: "🎥 Lectures", icon: "🎥", short: "محاضرات", single: "محاضرة", dateField: "date", dateLabel: "التاريخ", hasFile: true, prefix: "l" },
  { key: "sheets", label: "📄 Sheets", icon: "📄", short: "Sheets", single: "Sheet", dateField: "date", dateLabel: "التاريخ", hasFile: true, prefix: "sh" },
  { key: "assignments", label: "📝 Assignments", icon: "📝", short: "Assignments", single: "Assignment", dateField: "dueDate", dateLabel: "موعد التسليم", hasFile: true, prefix: "a" },
  { key: "exams", label: "🧪 Exams", icon: "🧪", short: "Exams", single: "Exam", dateField: "examDate", dateLabel: "موعد الامتحان", hasFile: false, prefix: "e" },
];

const STORAGE_KEY = "study-dashboard-v1";

let currentTermId = terms[0].id;
let currentView = "home";
let openSubjectId = null;
let modalView = "closed";
let modalTab = GROUPS[0].key;
let modalStatus = "all";
let editing = null;
let editingSubjectId = null;

const $ = (id) => document.getElementById(id);

const searchPanel = document.createElement("div");
searchPanel.className = "search-results hidden";
document.querySelector(".search").appendChild(searchPanel);

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects, termId: currentTermId }));
  } catch (error) {}
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.subjects)) {
      subjects.splice(0, subjects.length, ...saved.subjects);
      if (terms.some((t) => t.id === saved.termId)) currentTermId = saved.termId;
    }
  } catch (error) {}
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function groupByKey(key) {
  return GROUPS.find((g) => g.key === key);
}

function termName(termId) {
  const term = terms.find((t) => t.id === termId);
  return term ? term.name : "";
}

function currentSubject() {
  return subjects.find((s) => s.id === openSubjectId);
}

function allItems(subject) {
  return GROUPS.flatMap((g) => subject[g.key]);
}

function percent(list) {
  if (!list.length) return 0;
  return Math.round((list.filter((i) => i.completed).length / list.length) * 100);
}

function calculateProgress(subject) {
  return percent(allItems(subject));
}

function termSubjects() {
  return subjects.filter((s) => s.termId === currentTermId);
}

function calculateOverallProgress() {
  return percent(termSubjects().flatMap(allItems));
}

function defaultTab(subject) {
  const withPending = GROUPS.find((g) => subject[g.key].some((i) => !i.completed));
  if (withPending) return withPending.key;
  const withItems = GROUPS.find((g) => subject[g.key].length);
  return withItems ? withItems.key : GROUPS[0].key;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

function formatDate(dateStr, options) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("ar-EG", options);
}

function dueInfo(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0) return { text: `متأخر ${-d} يوم`, cls: "late" };
  if (d === 0) return { text: "النهاردة", cls: "soon" };
  if (d === 1) return { text: "بكرة", cls: "soon" };
  if (d <= 3) return { text: `بعد ${d} أيام`, cls: "soon" };
  return { text: formatDate(dateStr, { day: "numeric", month: "long" }), cls: "" };
}

function getUpcoming() {
  const list = [];
  termSubjects().forEach((subject) => {
    GROUPS.forEach((group) => {
      subject[group.key].forEach((item) => {
        const date = item[group.dateField];
        if (date && !item.completed) {
          list.push({ item, group, subject, date });
        }
      });
    });
  });
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

function computeStats() {
  const list = termSubjects();
  const items = list.flatMap(allItems);
  const completed = items.filter((i) => i.completed).length;
  const overdue = getUpcoming().filter((u) => daysUntil(u.date) < 0);

  const perSubject = list.map((subject) => ({
    subject,
    total: allItems(subject).length,
    progress: calculateProgress(subject),
    overdue: overdue.filter((u) => u.subject.id === subject.id).length,
  }));

  const withItems = perSubject.filter((s) => s.total > 0);

  let best = null;
  withItems.forEach((s) => {
    if (!best || s.progress > best.progress) best = s;
  });

  let mostLate = null;
  perSubject.forEach((s) => {
    if (s.overdue > 0 && (!mostLate || s.overdue > mostLate.overdue)) mostLate = s;
  });

  const done = (key) => list.flatMap((s) => s[key]).filter((i) => i.completed).length;
  const total = (key) => list.flatMap((s) => s[key]).length;

  const upcomingExams = list
    .flatMap((s) => s.exams)
    .filter((e) => e.examDate && !e.completed && daysUntil(e.examDate) >= 0).length;

  return {
    overall: percent(items),
    completed,
    pending: items.length - completed,
    overdue: overdue.length,
    perSubject,
    best,
    mostLate,
    lectures: { done: done("lectures"), total: total("lectures") },
    sheets: { done: done("sheets"), total: total("sheets") },
    assignments: { done: done("assignments"), total: total("assignments") },
    upcomingExams,
  };
}

function searchAll(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  subjects.forEach((subject) => {
    if (subject.name.toLowerCase().includes(q)) {
      results.push({ kind: "subject", subject });
    }
    GROUPS.forEach((group) => {
      subject[group.key].forEach((item) => {
        const text = `${item.title} ${item.notes || ""}`.toLowerCase();
        if (text.includes(q)) {
          results.push({ kind: "item", subject, group, item });
        }
      });
    });
  });
  return results.slice(0, 12);
}

function addSubject(data) {
  subjects.push({
    id: "sub" + Date.now(),
    termId: data.termId,
    name: data.name,
    color: data.color,
    lectures: [],
    sheets: [],
    assignments: [],
    exams: [],
  });
  saveData();
}

function editSubject(id, data) {
  const subject = subjects.find((s) => s.id === id);
  if (!subject) return;
  subject.name = data.name;
  subject.color = data.color;
  subject.termId = data.termId;
  saveData();
}

function deleteSubject(id) {
  const index = subjects.findIndex((s) => s.id === id);
  if (index === -1) return;
  subjects.splice(index, 1);
  saveData();
}

function addSubjectItem(groupKey, data) {
  const group = groupByKey(groupKey);
  const item = {
    id: group.prefix + Date.now(),
    title: data.title,
    completed: false,
    notes: data.notes,
  };
  item[group.dateField] = data.date;
  if (group.hasFile) item.fileUrl = "";
  currentSubject()[groupKey].push(item);
  saveData();
}

function editItem(groupKey, itemId, data) {
  const group = groupByKey(groupKey);
  const item = currentSubject()[groupKey].find((i) => i.id === itemId);
  if (!item) return;
  item.title = data.title;
  item[group.dateField] = data.date;
  item.notes = data.notes;
  saveData();
}

function deleteItem(groupKey, itemId) {
  const subject = currentSubject();
  subject[groupKey] = subject[groupKey].filter((i) => i.id !== itemId);
  saveData();
}

function toggleComplete(groupKey, itemId) {
  const item = currentSubject()[groupKey].find((i) => i.id === itemId);
  if (!item) return;
  item.completed = !item.completed;
  saveData();
}

function backupData() {
  const payload = { app: "study-dashboard", version: 1, termId: currentTermId, subjects };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeId(value) {
  return typeof value === "string" && /^[\w-]+$/.test(value);
}

function normalizeSubject(raw) {
  if (!raw || !safeId(raw.id) || typeof raw.name !== "string") return null;
  if (!terms.some((t) => t.id === raw.termId)) return null;

  const subject = {
    id: raw.id,
    termId: raw.termId,
    name: raw.name,
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : COLORS[0],
  };

  GROUPS.forEach((group) => {
    const list = Array.isArray(raw[group.key]) ? raw[group.key] : [];
    subject[group.key] = list
      .filter((i) => i && safeId(i.id) && typeof i.title === "string")
      .map((i) => {
        const item = {
          id: i.id,
          title: i.title,
          completed: Boolean(i.completed),
          notes: typeof i.notes === "string" ? i.notes : "",
        };
        item[group.dateField] = /^\d{4}-\d{2}-\d{2}$/.test(i[group.dateField]) ? i[group.dateField] : "";
        if (group.hasFile) item.fileUrl = "";
        return item;
      });
  });

  return subject;
}

function restoreData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.subjects)) throw new Error("invalid");
      const list = data.subjects.map(normalizeSubject);
      if (list.some((s) => !s)) throw new Error("invalid");
      if (!confirm("هيتم استبدال بياناتك الحالية بالنسخة الاحتياطية. متأكد؟")) return;
      subjects.splice(0, subjects.length, ...list);
      if (terms.some((t) => t.id === data.termId)) currentTermId = data.termId;
      closeModal();
      saveData();
      renderAll();
      alert("تم استرجاع البيانات ✅");
    } catch (error) {
      alert("الملف مش صالح. اتأكد إنه نسخة احتياطية طالعة من الموقع.");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm("هتمسح كل بياناتك من المتصفح وترجع للمواد الأصلية. متأكد؟")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {}
  location.reload();
}

function openDrawer() {
  hideNotif();
  $("drawer").classList.add("open");
  $("backdrop").classList.remove("hidden");
}

function closeDrawer() {
  $("drawer").classList.remove("open");
  $("backdrop").classList.add("hidden");
}

function renderTerms() {
  $("termSwitch").innerHTML = terms
    .map(
      (t) =>
        `<button class="term-btn ${t.id === currentTermId ? "active" : ""}" data-term="${t.id}">${esc(t.name)}</button>`
    )
    .join("");
  $("termLabel").textContent = termName(currentTermId);
}

function renderOverall() {
  const p = calculateOverallProgress();
  $("overallText").textContent = p + "%";
  $("overallBar").style.width = p + "%";
}

function renderSubjects() {
  const list = termSubjects();

  const cards = list
    .map((s) => {
      const items = allItems(s);
      const done = items.filter((i) => i.completed).length;
      const icon = ICONS[subjects.indexOf(s) % ICONS.length];
      return `
        <div class="subject-card" style="--c:${s.color}" data-subject="${s.id}">
          <div class="subject-icon">${icon}</div>
          <h3>${esc(s.name)}</h3>
          <div class="card-foot">
            <span class="meta">${done}/${items.length}</span>
            <span class="chevron">‹</span>
          </div>
          <div class="bar"><span style="width:${calculateProgress(s)}%"></span></div>
        </div>`;
    })
    .join("");

  const addCard = `
    <div class="subject-card add-card" data-add-subject>
      <div class="subject-icon">+</div>
      <h3>إضافة مادة</h3>
    </div>`;

  const empty = list.length ? "" : `<div class="empty">مفيش مواد في الترم ده لسه</div>`;

  $("subjectGrid").innerHTML = empty + cards + addCard;
}

function upcomingRowHTML({ item, group, subject, date }) {
  const info = dueInfo(date);
  return `
    <div class="up-item" style="--c:${subject.color}" data-subject="${subject.id}">
      <div class="date-box">
        <small>${formatDate(date, { month: "short" })}</small>
        <strong>${formatDate(date, { day: "numeric" })}</strong>
        <small>${formatDate(date, { weekday: "short" })}</small>
      </div>
      <div class="up-body">
        <div class="up-title">${esc(item.title)}</div>
        <div class="up-sub">${group.label} • ${esc(subject.name)}</div>
      </div>
      <span class="pill ${info.cls}">${esc(info.text)}</span>
    </div>`;
}

function renderUpcoming() {
  const all = getUpcoming();
  const overdue = all.filter((u) => daysUntil(u.date) < 0);
  const upcoming = all.filter((u) => daysUntil(u.date) >= 0).slice(0, 6);

  if (!overdue.length && !upcoming.length) {
    $("upcomingList").innerHTML = `<div class="empty">مفيش مواعيد قادمة 🎉</div>`;
    return;
  }

  let html = "";
  if (overdue.length) {
    html += `<div class="list-label late">⚠️ Overdue</div>` + overdue.map(upcomingRowHTML).join("");
  }
  if (upcoming.length) {
    html += `<div class="list-label">🗓️ Upcoming</div>` + upcoming.map(upcomingRowHTML).join("");
  }
  $("upcomingList").innerHTML = html;
}

function notifItems() {
  return getUpcoming().filter((u) => daysUntil(u.date) <= 1);
}

function renderBadge() {
  const count = notifItems().length;
  $("notifBadge").textContent = count;
  $("notifBadge").classList.toggle("hidden", count === 0);
}

function renderNotif() {
  const list = notifItems();
  const overdue = list.filter((u) => daysUntil(u.date) < 0);
  const soon = list.filter((u) => daysUntil(u.date) >= 0);

  let html = `<div class="notif-title">🔔 التنبيهات</div>`;
  if (!list.length) {
    html += `<div class="empty">مفيش تنبيهات 🎉</div>`;
  }
  if (overdue.length) {
    html += `<div class="list-label late">⚠️ متأخر</div>` + overdue.map(upcomingRowHTML).join("");
  }
  if (soon.length) {
    html += `<div class="list-label">⏰ النهاردة وبكرة</div>` + soon.map(upcomingRowHTML).join("");
  }
  $("notifPanel").innerHTML = html;
}

function hideNotif() {
  $("notifPanel").classList.add("hidden");
}

function toggleNotif() {
  const willOpen = $("notifPanel").classList.contains("hidden");
  if (!willOpen) return hideNotif();
  closeDrawer();
  renderNotif();
  $("notifPanel").classList.remove("hidden");
}

function statCardHTML(value, label, cls) {
  return `
    <div class="stat-card ${cls || ""}">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>`;
}

function highlightHTML(title, entry, text, cls) {
  if (!entry) {
    return `
      <div class="highlight">
        <small>${title}</small>
        <p class="muted-text">لسه مفيش بيانات</p>
      </div>`;
  }
  return `
    <div class="highlight ${cls}" style="--c:${entry.subject.color}">
      <small>${title}</small>
      <strong>${esc(entry.subject.name)}</strong>
      <span>${text}</span>
    </div>`;
}

function renderStats() {
  const s = computeStats();

  const rows = s.perSubject.length
    ? s.perSubject
        .map(
          (e) => `
        <div class="stat-row" style="--c:${e.subject.color}">
          <div class="stat-row-head">
            <span>${esc(e.subject.name)}</span>
            <strong>${e.progress}%</strong>
          </div>
          <div class="bar"><span style="width:${e.progress}%"></span></div>
        </div>`
        )
        .join("")
    : `<div class="empty">مفيش مواد في الترم ده لسه</div>`;

  $("statsView").innerHTML = `
    <div class="term-switch">
      ${terms
        .map(
          (t) =>
            `<button class="term-btn ${t.id === currentTermId ? "active" : ""}" data-term="${t.id}">${esc(t.name)}</button>`
        )
        .join("")}
    </div>

    <section class="overall">
      <div class="overall-head">
        <span>Overall Progress</span>
        <strong>${s.overall}%</strong>
      </div>
      <div class="bar"><span style="width:${s.overall}%"></span></div>
    </section>

    <section>
      <div class="stat-grid">
        ${statCardHTML(s.completed, "Completed", "ok")}
        ${statCardHTML(s.pending, "Pending", "")}
        ${statCardHTML(s.overdue, "Overdue", "bad")}
      </div>
    </section>

    <section>
      <div class="section-head"><h2>أبرز المواد</h2></div>
      <div class="highlight-grid">
        ${highlightHTML("🏆 أكتر مادة متقدم فيها", s.best, s.best ? `${s.best.progress}% مكتمل` : "", "good")}
        ${highlightHTML("⚠️ أكتر مادة متأخر فيها", s.mostLate, s.mostLate ? `${s.mostLate.overdue} عنصر متأخر` : "", "warn")}
      </div>
    </section>

    <section>
      <div class="section-head"><h2>تفاصيل</h2></div>
      <div class="stat-grid four">
        ${statCardHTML(`${s.lectures.done}/${s.lectures.total}`, "🎥 محاضرات", "")}
        ${statCardHTML(`${s.sheets.done}/${s.sheets.total}`, "📄 Sheets", "")}
        ${statCardHTML(`${s.assignments.done}/${s.assignments.total}`, "📝 Assignments", "")}
        ${statCardHTML(s.upcomingExams, "🧪 امتحانات قادمة", "")}
      </div>
    </section>

    <section>
      <div class="section-head"><h2>تقدم كل مادة</h2></div>
      <div class="card stat-rows">${rows}</div>
    </section>`;
}

function setView(view) {
  currentView = view;
  $("homeView").classList.toggle("hidden", view === "stats");
  $("statsView").classList.toggle("hidden", view !== "stats");
  document.querySelectorAll(".nav-btn[data-nav]").forEach((btn) => {
    const nav = btn.dataset.nav;
    const active = nav === "stats" ? view === "stats" : nav === "home" ? view === "home" : false;
    btn.classList.toggle("active", active);
  });
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSearch() {
  const query = $("searchInput").value;
  if (!query.trim()) {
    searchPanel.classList.add("hidden");
    searchPanel.innerHTML = "";
    return;
  }

  const results = searchAll(query);
  if (!results.length) {
    searchPanel.innerHTML = `<div class="no-results">مفيش نتائج</div>`;
  } else {
    searchPanel.innerHTML = results
      .map((r) => {
        const title = r.kind === "subject" ? r.subject.name : r.item.title;
        const sub =
          r.kind === "subject"
            ? `📚 مادة • ${termName(r.subject.termId)}`
            : `${r.group.label} • ${r.subject.name} • ${termName(r.subject.termId)}`;
        return `
          <button class="result" style="--c:${r.subject.color}" data-result="${r.subject.id}">
            <span class="dot"></span>
            <span class="result-body">
              <strong>${esc(title)}</strong>
              <small>${esc(sub)}</small>
            </span>
          </button>`;
      })
      .join("");
  }
  searchPanel.classList.remove("hidden");
}

function hideSearch() {
  searchPanel.classList.add("hidden");
}

function clearSearch() {
  $("searchInput").value = "";
  searchPanel.innerHTML = "";
  hideSearch();
}

function itemHTML(item, group) {
  const date = item[group.dateField];
  const info = date && !item.completed ? dueInfo(date) : null;
  const ref = `${group.key}:${item.id}`;
  return `
    <div class="item ${item.completed ? "done" : ""}">
      <input type="checkbox" data-toggle="${ref}" ${item.completed ? "checked" : ""} aria-label="تم" />
      <button type="button" class="item-main" data-edit="${ref}">
        <span class="item-title">${esc(item.title)}</span>
        ${item.notes ? `<span class="item-sub">${esc(item.notes)}</span>` : ""}
      </button>
      ${info ? `<span class="pill ${info.cls}">${esc(info.text)}</span>` : ""}
      <span class="item-go">‹</span>
    </div>`;
}

function listViewHTML() {
  const subject = currentSubject();
  const group = groupByKey(modalTab);
  const all = subject[group.key];
  const visible = all.filter((i) => modalStatus === "all" || (modalStatus === "completed") === i.completed);
  const total = allItems(subject).length;
  const done = allItems(subject).filter((i) => i.completed).length;
  const progress = calculateProgress(subject);

  const tabs = GROUPS.map(
    (g) => `
      <button class="tab ${g.key === modalTab ? "active" : ""}" data-tab="${g.key}">
        <span class="tab-icon">${g.icon}</span>
        <span class="tab-label">${g.short}</span>
        <span class="tab-count">${subject[g.key].length}</span>
      </button>`
  ).join("");

  const counts = {
    all: all.length,
    pending: all.filter((i) => !i.completed).length,
    completed: all.filter((i) => i.completed).length,
  };

  const statuses = [
    ["all", "الكل"],
    ["pending", "⏳ لسه"],
    ["completed", "✅ خلصت"],
  ]
    .map(
      ([key, label]) =>
        `<button class="seg ${key === modalStatus ? "active" : ""}" data-status="${key}">${label} (${counts[key]})</button>`
    )
    .join("");

  const dateField =
    group.dateField !== "date"
      ? `<label class="quick-date"><span>${group.dateLabel}</span><input type="date" name="date" /></label>`
      : "";

  let body;
  if (visible.length) {
    body = `<div class="list-card">${visible.map((i) => itemHTML(i, group)).join("")}</div>`;
  } else if (all.length) {
    body = `<div class="list-card"><div class="empty-state">مفيش عناصر بالفلتر ده</div></div>`;
  } else {
    body = `
      <div class="list-card">
        <div class="empty-state">
          <strong>لسه مفيش ${group.short}</strong>
          اكتب الاسم في الخانة اللي فوق واضغط إضافة
        </div>
      </div>`;
  }

  return `
    <div class="modal-content">
      <div class="modal-head">
        <div class="subject-title">
          <span class="color-dot" style="background:${subject.color}"></span>
          <h2>${esc(subject.name)}</h2>
        </div>
        <div class="head-actions">
          <button class="mini-btn big" data-edit-subject aria-label="تعديل المادة">✏️</button>
          <button class="close-btn" data-close aria-label="إغلاق">✕</button>
        </div>
      </div>

      <div class="progress-line">
        <div class="bar" style="--c:${subject.color}"><span style="width:${progress}%"></span></div>
        <span class="meta">${done}/${total} • ${progress}%</span>
      </div>

      <div class="tabs">${tabs}</div>
      <div class="status-row">${statuses}</div>

      <form class="quick-add" id="quickForm" autocomplete="off">
        <input type="text" id="quickTitle" name="title" placeholder="اكتب اسم ${group.single} جديد..." />
        <button type="submit">+ إضافة</button>
        ${dateField}
      </form>

      ${body}
    </div>`;
}

function formViewHTML() {
  const group = groupByKey(editing ? editing.groupKey : modalTab);
  const item = editing ? currentSubject()[group.key].find((i) => i.id === editing.itemId) : null;
  const options = GROUPS.map(
    (g) => `<option value="${g.key}" ${g.key === group.key ? "selected" : ""}>${g.label}</option>`
  ).join("");

  return `
    <form class="modal-content" id="itemForm">
      <div class="modal-head">
        <h2>${editing ? "تعديل العنصر" : "إضافة عنصر جديد"}</h2>
        <button type="button" class="close-btn" data-back aria-label="رجوع">✕</button>
      </div>

      <label class="field">
        <span>النوع</span>
        <select name="type" disabled>${options}</select>
      </label>

      <label class="field">
        <span>الاسم</span>
        <input type="text" name="title" required placeholder="مثلاً: Lecture 3" value="${item ? esc(item.title) : ""}" />
      </label>

      <label class="field">
        <span>${group.dateLabel} (اختياري)</span>
        <input type="date" name="date" value="${item ? esc(item[group.dateField] || "") : ""}" />
      </label>

      <label class="field">
        <span>ملاحظات (اختياري)</span>
        <textarea name="notes" rows="3">${item ? esc(item.notes || "") : ""}</textarea>
      </label>

      <div class="form-actions">
        <button type="submit" class="add-btn">حفظ</button>
        <button type="button" class="ghost-btn" data-back>إلغاء</button>
      </div>

      ${
        editing
          ? `<button type="button" class="danger-btn" data-delete="${editing.groupKey}:${editing.itemId}">🗑️ حذف العنصر</button>`
          : ""
      }
    </form>`;
}

function subjectFormHTML() {
  const subject = editingSubjectId ? subjects.find((s) => s.id === editingSubjectId) : null;
  const color = subject ? subject.color : COLORS[subjects.length % COLORS.length];
  const termId = subject ? subject.termId : currentTermId;
  const palette = COLORS.includes(color) ? COLORS : [color, ...COLORS];

  const swatches = palette
    .map(
      (c) => `
        <label class="swatch" style="--c:${c}">
          <input type="radio" name="color" value="${c}" ${c === color ? "checked" : ""} />
          <span></span>
        </label>`
    )
    .join("");

  const termOptions = terms
    .map((t) => `<option value="${t.id}" ${t.id === termId ? "selected" : ""}>${esc(t.name)}</option>`)
    .join("");

  return `
    <form class="modal-content" id="subjectForm">
      <div class="modal-head">
        <h2>${subject ? "تعديل المادة" : "إضافة مادة جديدة"}</h2>
        <button type="button" class="close-btn" data-back aria-label="رجوع">✕</button>
      </div>

      <label class="field">
        <span>اسم المادة</span>
        <input type="text" name="name" required placeholder="مثلاً: جافا" value="${subject ? esc(subject.name) : ""}" />
      </label>

      <div class="group-field">
        <span>اللون</span>
        <div class="swatches">${swatches}</div>
      </div>

      <label class="field">
        <span>الترم</span>
        <select name="termId">${termOptions}</select>
      </label>

      <div class="form-actions">
        <button type="submit" class="add-btn">حفظ</button>
        <button type="button" class="ghost-btn" data-back>إلغاء</button>
      </div>

      ${subject ? `<button type="button" class="danger-btn" data-delete-subject>🗑️ حذف المادة</button>` : ""}
    </form>`;
}

function renderModal() {
  const box = $("subjectModal");
  const prev = box.querySelector(".modal-content");
  const top = prev ? prev.scrollTop : 0;
  const keepScroll = box.dataset.view === modalView;

  if (modalView === "subjectForm") {
    box.innerHTML = subjectFormHTML();
  } else if (modalView === "form") {
    box.innerHTML = formViewHTML();
  } else {
    box.innerHTML = listViewHTML();
  }

  box.dataset.view = modalView;
  const next = box.querySelector(".modal-content");
  if (next && keepScroll) next.scrollTop = top;
}

function renderAll() {
  renderTerms();
  renderOverall();
  renderSubjects();
  renderUpcoming();
  renderBadge();
  if (!$("notifPanel").classList.contains("hidden")) renderNotif();
  if (currentView === "stats") renderStats();
  if (modalView !== "closed") renderModal();
}

function showModal(view) {
  const box = $("subjectModal");
  const wasHidden = box.classList.contains("hidden");
  modalView = view;
  renderModal();
  box.classList.remove("hidden");
  if (wasHidden) {
    box.classList.add("opening");
    setTimeout(() => box.classList.remove("opening"), 300);
  }
}

function openSubject(id) {
  const subject = subjects.find((s) => s.id === id);
  if (!subject) return;
  openSubjectId = id;
  modalTab = defaultTab(subject);
  modalStatus = "all";
  editing = null;
  editingSubjectId = null;
  showModal("list");
}

function closeModal() {
  openSubjectId = null;
  modalView = "closed";
  modalStatus = "all";
  editing = null;
  editingSubjectId = null;
  $("subjectModal").dataset.view = "";
  $("subjectModal").classList.add("hidden");
}

function parseRef(value) {
  const [groupKey, itemId] = value.split(":");
  return { groupKey, itemId };
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) hideSearch();

  if (e.target.closest("#bellBtn")) return toggleNotif();
  if (!e.target.closest("#notifPanel") || e.target.closest("[data-subject]")) hideNotif();

  if (e.target.closest("#menuBtn")) return openDrawer();
  if (e.target.closest("[data-drawer-close]") || e.target.id === "backdrop") return closeDrawer();

  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    closeDrawer();
    const action = actionBtn.dataset.action;
    if (action === "backup") return backupData();
    if (action === "restore") return $("restoreInput").click();
    if (action === "reset") return resetData();
    return;
  }

  const navBtn = e.target.closest("[data-nav]");
  if (navBtn) {
    const nav = navBtn.dataset.nav;
    closeDrawer();
    if (nav === "more") return openDrawer();
    if (nav === "stats") return setView("stats");
    setView("home");
    if (nav === "upcoming") {
      return $("upcomingList").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  const resultBtn = e.target.closest("[data-result]");
  if (resultBtn) {
    const subject = subjects.find((s) => s.id === resultBtn.dataset.result);
    if (!subject) return;
    currentTermId = subject.termId;
    saveData();
    clearSearch();
    renderAll();
    return openSubject(subject.id);
  }

  const termBtn = e.target.closest("[data-term]");
  if (termBtn) {
    currentTermId = termBtn.dataset.term;
    saveData();
    return renderAll();
  }

  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) {
    modalTab = tabBtn.dataset.tab;
    modalStatus = "all";
    return renderModal();
  }

  const statusBtn = e.target.closest("[data-status]");
  if (statusBtn) {
    modalStatus = statusBtn.dataset.status;
    return renderModal();
  }

  if (e.target.closest("[data-add-subject]")) {
    openSubjectId = null;
    editingSubjectId = null;
    return showModal("subjectForm");
  }

  const card = e.target.closest("[data-subject]");
  if (card) return openSubject(card.dataset.subject);

  if (e.target.closest("[data-edit-subject]")) {
    editingSubjectId = openSubjectId;
    return showModal("subjectForm");
  }

  if (e.target.closest("[data-delete-subject]")) {
    if (!confirm("هتمسح المادة وكل اللي جواها. متأكد؟")) return;
    deleteSubject(openSubjectId);
    closeModal();
    return renderAll();
  }

  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) {
    editing = parseRef(editBtn.dataset.edit);
    return showModal("form");
  }

  const deleteBtn = e.target.closest("[data-delete]");
  if (deleteBtn) {
    if (!confirm("متأكد إنك عايز تمسح العنصر ده؟")) return;
    const { groupKey, itemId } = parseRef(deleteBtn.dataset.delete);
    deleteItem(groupKey, itemId);
    editing = null;
    modalView = "list";
    return renderAll();
  }

  if (e.target.closest("[data-back]")) {
    editing = null;
    editingSubjectId = null;
    if (openSubjectId) return showModal("list");
    return closeModal();
  }

  if (e.target.closest("[data-close]")) return closeModal();

  if (e.target.id === "subjectModal" && modalView === "list") return closeModal();
});

document.addEventListener("input", (e) => {
  if (e.target.id === "searchInput") renderSearch();
});

document.addEventListener("focusin", (e) => {
  if (e.target.id === "searchInput") renderSearch();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("drawer").classList.contains("open")) return closeDrawer();
  if (!$("notifPanel").classList.contains("hidden")) return hideNotif();
  if (!searchPanel.classList.contains("hidden")) return hideSearch();
  if (modalView === "list") closeModal();
});

document.addEventListener("change", (e) => {
  if (e.target.id === "restoreInput") {
    const file = e.target.files[0];
    if (file) restoreData(file);
    e.target.value = "";
    return;
  }

  const value = e.target.dataset.toggle;
  if (!value) return;
  const { groupKey, itemId } = parseRef(value);
  toggleComplete(groupKey, itemId);
  renderAll();
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "quickForm") {
    e.preventDefault();
    const form = new FormData(e.target);
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    addSubjectItem(modalTab, { title, date: String(form.get("date") || ""), notes: "" });
    modalStatus = "all";
    renderAll();
    const input = $("quickTitle");
    if (input) input.focus();
    return;
  }

  if (e.target.id === "subjectForm") {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = String(form.get("name") || "").trim();
    if (!name) return;

    const data = {
      name,
      color: String(form.get("color") || COLORS[0]),
      termId: String(form.get("termId")),
    };

    const wasEditing = Boolean(editingSubjectId);
    if (wasEditing) {
      editSubject(editingSubjectId, data);
    } else {
      addSubject(data);
    }

    currentTermId = data.termId;
    saveData();
    editingSubjectId = null;

    if (wasEditing) {
      modalView = "list";
    } else {
      closeModal();
    }
    return renderAll();
  }

  if (e.target.id !== "itemForm") return;
  e.preventDefault();

  const form = new FormData(e.target);
  const title = String(form.get("title") || "").trim();
  if (!title) return;

  const data = {
    title,
    date: String(form.get("date") || ""),
    notes: String(form.get("notes") || "").trim(),
  };

  if (editing) {
    editItem(editing.groupKey, editing.itemId, data);
  } else {
    addSubjectItem(modalTab, data);
  }

  editing = null;
  modalStatus = "all";
  modalView = "list";
  renderAll();
});

loadData();
renderAll();