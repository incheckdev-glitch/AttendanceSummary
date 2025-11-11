// issues.js
// =========== ISSUES MODULE ===========
// Handles data loading, filtering, pagination, and table rendering.
// Optimized for performance and modular imports.

import { debounce, createFragment, showToast } from './utils.js';

let issues = [];
let filteredIssues = [];
let currentPage = 1;
const pageSize = 25;

// ---------- INITIALIZATION ----------
export function initIssues() {
  console.log('Issues view initialized.');

  // DOM elements
  const searchInput = document.querySelector('#searchInput');
  const tableBody = document.querySelector('#issuesTableBody');
  const pagination = document.querySelector('#paginationControls');

  // Fetch & render issues once
  loadIssues().then(() => {
    applyFilters();
    renderPage();
  });

  // Search input (debounced)
  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      const term = e.target.value.trim().toLowerCase();
      filterIssues({ search: term });
    }, 300));
  }

  // Pagination events
  if (pagination) {
    pagination.addEventListener('click', handlePagination);
  }
}

// ---------- DATA LOADING ----------
async function loadIssues() {
  try {
    const response = await fetch('./data/issues.json');
    if (!response.ok) throw new Error('Failed to load issues data');
    issues = await response.json();
    showToast(`Loaded ${issues.length} issues`);
  } catch (err) {
    console.error('❌ Error loading issues:', err);
    showToast('Error loading issues data', 'error');
  }
}

// ---------- FILTERING ----------
function filterIssues(options = {}) {
  const { search } = options;
  filteredIssues = issues.filter(issue => {
    const matchesSearch =
      !search ||
      issue.title.toLowerCase().includes(search) ||
      issue.module.toLowerCase().includes(search) ||
      issue.status.toLowerCase().includes(search);
    return matchesSearch;
  });

  currentPage = 1;
  renderPage();
}

// ---------- PAGINATION ----------
function handlePagination(e) {
  const btn = e.target.closest('[data-page]');
  if (!btn) return;

  const page = btn.dataset.page;
  if (page === 'next') currentPage++;
  else if (page === 'prev') currentPage--;
  else currentPage = parseInt(page);

  renderPage();
}

function renderPage() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filteredIssues.slice(start, end);
  renderTable(pageItems);
  updatePagination();
}

// ---------- TABLE RENDER ----------
function renderTable(rows) {
  const tbody = document.querySelector('#issuesTableBody');
  if (!tbody) return;

  const frag = createFragment();

  rows.forEach(issue => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${issue.id}</td>
      <td>${issue.module}</td>
      <td>${issue.title}</td>
      <td><span class="pill status-${issue.status.replace(/\s+/g, '-')}">${issue.status}</span></td>
      <td><span class="pill priority-${issue.priority}">${issue.priority}</span></td>
      <td>${issue.owner}</td>
      <td>${issue.log || ''}</td>
    `;
    frag.appendChild(tr);
  });

  tbody.replaceChildren(frag);
}

// ---------- PAGINATION RENDER ----------
function updatePagination() {
  const pagination = document.querySelector('#paginationControls');
  if (!pagination) return;

  const totalPages = Math.ceil(filteredIssues.length / pageSize);
  const frag = createFragment();

  const prevBtn = makePageButton('Prev', 'prev', currentPage === 1);
  frag.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const btn = makePageButton(i, i, i === currentPage);
    frag.appendChild(btn);
  }

  const nextBtn = makePageButton('Next', 'next', currentPage === totalPages);
  frag.appendChild(nextBtn);

  pagination.replaceChildren(frag);
}

function makePageButton(label, page, disabled = false) {
  const btn = document.createElement('button');
  btn.className = `chip-btn ${disabled ? 'disabled' : ''}`;
  btn.textContent = label;
  btn.dataset.page = page;
  if (disabled) btn.disabled = true;
  return btn;
}

// ---------- CHART CONNECTION ----------
async function updateCharts() {
  const { renderCharts } = await import('./charts.js');
  renderCharts(filteredIssues);
}

// Re-render charts whenever filters update
function applyFilters() {
  filterIssues({});
  updateCharts();
}
