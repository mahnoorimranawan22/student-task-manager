/* ============================================================
   StudyFlow — script.js  (Sage & Cream edition)
   ============================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────
const STORAGE_KEY = 'studyflow_tasks_v3';
const THEME_KEY = 'studyflow_theme';
const PRIORITY_ORD = { high: 0, medium: 1, low: 2 };

// ─── STATE ────────────────────────────────────────────────────
let tasks = [];
let editingId = null;
let deleteTargetId = null;
let activeFilter = 'all';
let activeCategoryFilter = 'all';
let activeSort = 'default';
let searchQuery = '';
let dragSrcId = null;

// ─── DOM ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const taskListEl = $('taskList');
const emptyEl = $('emptyState');
const totalCountEl = $('totalCount');
const completedEl = $('completedCount');
const pendingEl = $('pendingCount');
const overdueHdrEl = $('overdueCountHeader');
const searchInput = $('searchInput');
const sortSelect = $('sortSelect');

const taskModal = $('taskModal');
const modalTitleEl = $('modalTitle');
const taskForm = $('taskForm');
const taskNameInput = $('taskName');
const taskCategory = $('taskCategory');
const taskDueDateEl = $('taskDueDate');
const taskDescEl = $('taskDesc');
const saveTaskBtn = $('saveTaskBtn');
const nameError = $('nameError');

const deleteModal = $('deleteModal');
const confirmDelBtn = $('confirmDelete');

// ─── UTILS ────────────────────────────────────────────────────
function uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(s) {
  if (!s) return null;
  return new Date(s + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function isOverdue(t) { return !t.completed && !!t.dueDate && t.dueDate < today(); }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function getPriority() {
  const el = document.querySelector('input[name="priority"]:checked');
  return el ? el.value : 'medium';
}

// ─── STORAGE ──────────────────────────────────────────────────
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function load() {
  try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { tasks = []; }
}

// ─── THEME ────────────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const lbl = $('themeLabel');
  if (lbl) lbl.textContent = dark ? 'Dark' : 'Light';
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}

$('darkModeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
});

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) { applyTheme(saved === 'dark'); }
  else { applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches); }
})();

// ─── STATS ────────────────────────────────────────────────────
function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const overdue = tasks.filter(t => isOverdue(t)).length;
  totalCountEl.textContent = total;
  completedEl.textContent = completed;
  pendingEl.textContent = pending;
  overdueHdrEl.textContent = overdue;
}

// ─── FILTER / SORT ────────────────────────────────────────────
function getVisible() {
  let list = [...tasks];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q)
    );
  }
  if (activeFilter === 'completed') list = list.filter(t => t.completed);
  else if (activeFilter === 'pending') list = list.filter(t => !t.completed);
  if (activeCategoryFilter !== 'all') list = list.filter(t => t.category === activeCategoryFilter);
  if (activeSort === 'dueDate') {
    list.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  } else if (activeSort === 'priority') {
    list.sort((a, b) => PRIORITY_ORD[a.priority] - PRIORITY_ORD[b.priority]);
  } else if (activeSort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
}

// ─── CATEGORY CSS CLASS MAP ───────────────────────────────────
const CAT_CLASS = { Homework: 'cat-hw', Assignment: 'cat-as', Exam: 'cat-ex', Personal: 'cat-pe' };

// ─── RENDER ───────────────────────────────────────────────────
function render() {
  updateStats();
  const list = getVisible();

  taskListEl.innerHTML = '';

  if (list.length === 0) {
    emptyEl.hidden = false;
    if (typeof renderDashboard === 'function') renderDashboard();
    return;
  }
  emptyEl.hidden = true;

  list.forEach(task => {
    const over = isOverdue(task);
    const li = document.createElement('li');
    li.className = ['task-card', task.completed ? 'done' : '', over ? 'overdue' : ''].filter(Boolean).join(' ');
    li.dataset.id = task.id;
    li.draggable = true;

    li.innerHTML = `
      <div class="drag-handle" aria-hidden="true"><span></span><span></span><span></span></div>

      <div class="t-check ${task.completed ? 'checked' : ''}"
           role="checkbox" aria-checked="${task.completed}"
           tabindex="0" data-action="toggle" data-id="${task.id}"
           aria-label="Mark as ${task.completed ? 'pending' : 'completed'}"></div>

      <div class="t-body">
        <div class="t-top">
          <span class="t-name">${esc(task.name)}</span>
          <div class="t-badges">
            <span class="cat-badge ${CAT_CLASS[task.category] || ''}">${esc(task.category)}</span>
            <span class="prio-badge prio-${esc(task.priority)}">${cap(task.priority)}</span>
            ${over ? '<span class="overdue-badge">Overdue</span>' : ''}
          </div>
        </div>
        ${task.desc ? `<p class="t-desc">${esc(task.desc)}</p>` : ''}
        <div class="t-meta">
          ${task.dueDate
        ? `<span class="t-meta-item ${over ? 'late' : ''}">📅 ${fmtDate(task.dueDate)}</span>`
        : ''}
          <span class="t-meta-item">Added ${fmtDate(task.created.split('T')[0])}</span>
        </div>
      </div>

      <div class="t-actions">
        <button class="t-btn edit" data-action="edit" data-id="${task.id}" title="Edit" aria-label="Edit task">✏️</button>
        <button class="t-btn del"  data-action="delete" data-id="${task.id}" title="Delete" aria-label="Delete task">🗑</button>
      </div>`;

    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragover', onDragOver);
    li.addEventListener('dragleave', onDragLeave);
    li.addEventListener('drop', onDrop);
    li.addEventListener('dragend', onDragEnd);

    taskListEl.appendChild(li);
  });

  taskListEl.onclick = handleClick;
  taskListEl.onkeydown = handleKeydown;

  if (typeof renderDashboard === 'function') renderDashboard();
}

// ─── EVENT DELEGATION ─────────────────────────────────────────
function handleClick(e) {
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const id = action.dataset.id;
  switch (action.dataset.action) {
    case 'toggle': toggleTask(id); break;
    case 'edit': openEditModal(id); break;
    case 'delete': openDeleteModal(id); break;
  }
}
function handleKeydown(e) {
  if (e.key === ' ' || e.key === 'Enter') {
    const cb = e.target.closest('[data-action="toggle"]');
    if (cb) { e.preventDefault(); toggleTask(cb.dataset.id); }
  }
}

// ─── CRUD ─────────────────────────────────────────────────────
function addTask(name, category, priority, dueDate, desc) {
  tasks.unshift({
    id: uuid(), name: name.trim(), category, priority,
    dueDate: dueDate || null, desc: desc ? desc.trim() : '',
    completed: false, created: new Date().toISOString()
  });
  save(); render();
}
function editTask(id, name, category, priority, dueDate, desc) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx] = {
    ...tasks[idx], name: name.trim(), category, priority,
    dueDate: dueDate || null, desc: desc ? desc.trim() : ''
  };
  save(); render();
}
function toggleTask(id) {
  const t = tasks.find(t => t.id === id);
  if (t) { t.completed = !t.completed; save(); render(); }
}
function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  save(); render();
}

// ─── MODAL: ADD / EDIT ────────────────────────────────────────
function openAddModal() {
  editingId = null;
  modalTitleEl.textContent = 'New Task';
  saveTaskBtn.textContent = 'Add Task';
  taskForm.reset();
  document.querySelector('input[name="priority"][value="medium"]').checked = true;
  nameError.classList.remove('show');
  taskModal.hidden = false;
  taskNameInput.focus();
}
function openEditModal(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  editingId = id;
  modalTitleEl.textContent = 'Edit Task';
  saveTaskBtn.textContent = 'Save Changes';
  taskNameInput.value = t.name;
  taskCategory.value = t.category;
  document.querySelector(`input[name="priority"][value="${t.priority}"]`).checked = true;
  taskDueDateEl.value = t.dueDate || '';
  taskDescEl.value = t.desc || '';
  nameError.classList.remove('show');
  taskModal.hidden = false;
  taskNameInput.focus();
}
function closeEditModal() { taskModal.hidden = true; editingId = null; }

// ─── MODAL: DELETE ────────────────────────────────────────────
function openDeleteModal(id) { deleteTargetId = id; deleteModal.hidden = false; }
function closeDeleteModal() { deleteModal.hidden = true; deleteTargetId = null; }

// ─── FORM SUBMIT ──────────────────────────────────────────────
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = taskNameInput.value.trim();
  if (!name) { nameError.classList.add('show'); taskNameInput.focus(); return; }
  nameError.classList.remove('show');
  const cat = taskCategory.value;
  const prio = getPriority();
  const due = taskDueDateEl.value;
  const desc = taskDescEl.value;
  if (editingId) editTask(editingId, name, cat, prio, due, desc);
  else addTask(name, cat, prio, due, desc);
  closeEditModal();
});

taskNameInput.addEventListener('input', () => {
  if (taskNameInput.value.trim()) nameError.classList.remove('show');
});

// ─── MODAL EVENTS ─────────────────────────────────────────────
$('openAddModal').addEventListener('click', openAddModal);
$('closeModal').addEventListener('click', closeEditModal);
$('cancelModal').addEventListener('click', closeEditModal);
$('closeDeleteModal').addEventListener('click', closeDeleteModal);
$('cancelDelete').addEventListener('click', closeDeleteModal);

confirmDelBtn.addEventListener('click', () => {
  if (deleteTargetId) deleteTask(deleteTargetId);
  closeDeleteModal();
});

taskModal.addEventListener('click', e => { if (e.target === taskModal) closeEditModal(); });
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!taskModal.hidden) closeEditModal();
    if (!deleteModal.hidden) closeDeleteModal();
  }
});

// ─── SEARCH ───────────────────────────────────────────────────
let searchTimer;
searchInput.addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); render(); }, 200);
});

// ─── FILTER TABS ──────────────────────────────────────────────
$$('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.ftab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    activeFilter = btn.dataset.filter;
    render();
  });
});

// ─── CATEGORY CHIPS ───────────────────────────────────────────
$$('.cat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $$('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCategoryFilter = chip.dataset.category;
    render();
  });
});

// ─── SORT ─────────────────────────────────────────────────────
sortSelect.addEventListener('change', () => { activeSort = sortSelect.value; render(); });

// ─── DRAG & DROP ──────────────────────────────────────────────
function onDragStart(e) {
  dragSrcId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this.dataset.id !== dragSrcId) this.classList.add('drag-over');
}
function onDragLeave() { this.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  const targetId = this.dataset.id;
  if (!dragSrcId || dragSrcId === targetId) return;
  const si = tasks.findIndex(t => t.id === dragSrcId);
  const ti = tasks.findIndex(t => t.id === targetId);
  if (si === -1 || ti === -1) return;
  const [moved] = tasks.splice(si, 1);
  tasks.splice(ti, 0, moved);
  save();
  if (activeSort === 'default') render();
}
function onDragEnd() {
  this.classList.remove('dragging');
  $$('.task-card').forEach(c => c.classList.remove('drag-over'));
  dragSrcId = null;
}

// ─── PAGE SWITCHING ───────────────────────────────────────────
const dashboardPage = $('dashboardPage');
const tasksPage = $('tasksPage');
const addBtn = $('openAddModal');

function showPage(page) {
  if (page === 'dashboard') {
    dashboardPage.classList.remove('hidden');
    tasksPage.classList.add('hidden');
    addBtn.style.display = 'none';
    $('tabDashboard').classList.add('active');
    $('tabTasks').classList.remove('active');
    renderDashboard();
  } else {
    tasksPage.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
    addBtn.style.display = '';
    $('tabTasks').classList.add('active');
    $('tabDashboard').classList.remove('active');
  }
}

$('tabDashboard').addEventListener('click', () => showPage('dashboard'));
$('tabTasks').addEventListener('click', () => showPage('tasks'));

// ─── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pending = total - completed;
  const overdueList = tasks.filter(t => isOverdue(t));

  $('dashCompleted').textContent = completed;
  $('dashPending').textContent = pending;
  $('dashOverdue').textContent = overdueList.length;

  // Progress ring
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  $('ringPct').textContent = pct + '%';
  const C = 2 * Math.PI * 50;          // circumference ≈ 314
  const ring = $('ringFill');
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { ring.style.strokeDashoffset = C - (pct / 100) * C; });
  });

  // Category bars
  const cats = ['Homework', 'Assignment', 'Exam', 'Personal'];
  const catColors = { Homework: 'var(--cat-hw-fg)', Assignment: 'var(--p-low)', Exam: 'var(--p-mid)', Personal: 'var(--cat-pe-fg)' };
  $('catBars').innerHTML = cats.map(cat => {
    const n = tasks.filter(t => t.category === cat).length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-lbl"><span>${cat}</span><span>${n}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${catColors[cat]}"></div></div>
    </div>`;
  }).join('');

  // Priority bars
  const prios = ['high', 'medium', 'low'];
  const prioColors = { high: 'var(--p-high)', medium: 'var(--p-mid)', low: 'var(--p-low)' };
  const prioLabel = { high: 'High', medium: 'Medium', low: 'Low' };
  $('prioBars').innerHTML = prios.map(p => {
    const n = tasks.filter(t => t.priority === p).length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-lbl"><span>${prioLabel[p]}</span><span>${n}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${prioColors[p]}"></div></div>
    </div>`;
  }).join('');

  // Upcoming (next 7 days)
  const t0 = today();
  const t7 = new Date(); t7.setDate(t7.getDate() + 7);
  const t7s = t7.toISOString().split('T')[0];
  const upcoming = tasks
    .filter(t => !t.completed && t.dueDate && t.dueDate >= t0 && t.dueDate <= t7s)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const upcomingList = $('upcomingList');
  const upcomingEmpty = $('upcomingEmpty');
  if (upcoming.length === 0) {
    upcomingList.innerHTML = '';
    upcomingEmpty.hidden = false;
  } else {
    upcomingEmpty.hidden = true;
    upcomingList.innerHTML = upcoming.map(t => `
      <li class="dash-item">
        <span class="cat-badge ${CAT_CLASS[t.category] || ''}">${esc(t.category)}</span>
        <span class="dash-item-name">${esc(t.name)}</span>
        <span class="dash-item-due">${fmtDate(t.dueDate)}</span>
      </li>`).join('');
  }

  // Overdue
  const overdueListEl = $('overdueList');
  const overdueEmptyEl = $('overdueEmpty');
  if (overdueList.length === 0) {
    overdueListEl.innerHTML = '';
    overdueEmptyEl.hidden = false;
  } else {
    overdueEmptyEl.hidden = true;
    overdueListEl.innerHTML = overdueList
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map(t => `
        <li class="dash-item is-overdue">
          <span class="cat-badge ${CAT_CLASS[t.category] || ''}">${esc(t.category)}</span>
          <span class="dash-item-name">${esc(t.name)}</span>
          <span class="dash-item-due late">${fmtDate(t.dueDate)}</span>
        </li>`).join('');
  }
}

// ─── INIT ─────────────────────────────────────────────────────
load();
render();
showPage('dashboard');
