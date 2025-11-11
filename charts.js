// charts.js
// =========== CHARTS MODULE ===========
// Handles dashboard KPIs and Chart.js visualizations
// Loaded lazily when needed by issues.js or the Charts tab.

import { showToast } from './utils.js';

// Keep Chart.js instance references to allow efficient updates
let statusChart, priorityChart;

// ----------- INIT ENTRY POINT -----------
export function renderCharts(filteredIssues = []) {
  console.log('Charts rendering...');
  if (!filteredIssues || !filteredIssues.length) return;

  const statusData = aggregateBy(filteredIssues, 'status');
  const priorityData = aggregateBy(filteredIssues, 'priority');

  updateKpis(filteredIssues);
  drawStatusChart(statusData);
  drawPriorityChart(priorityData);

  showToast('Charts updated');
}

// ----------- KPI SUMMARY -----------
function updateKpis(data) {
  const total = data.length;
  const resolved = data.filter(i => i.status === 'Resolved').length;
  const open = total - resolved;

  setText('#kpiTotal', total);
  setText('#kpiResolved', resolved);
  setText('#kpiOpen', open);
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

// ----------- AGGREGATION UTILITY -----------
function aggregateBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'Unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

// ----------- CHART RENDERING -----------
async function drawStatusChart(data) {
  const { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } = await import('chart.js');

  const ctx = document.getElementById('statusChart');
  if (!ctx) return;

  const labels = Object.keys(data);
  const values = Object.values(data);

  if (statusChart) statusChart.destroy();

  statusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Issues by Status',
        data: values,
        backgroundColor: 'rgba(37, 99, 235, 0.6)',
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'var(--muted)' }, grid: { color: 'var(--border)' } },
        y: { ticks: { color: 'var(--muted)' }, grid: { color: 'var(--border)' } },
      },
    },
  });
}

async function drawPriorityChart(data) {
  const { Chart, PieController, ArcElement, Tooltip, Legend } = await import('chart.js');

  const ctx = document.getElementById('priorityChart');
  if (!ctx) return;

  const labels = Object.keys(data);
  const values = Object.values(data);

  if (priorityChart) priorityChart.destroy();

  priorityChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          'var(--priority-high)',
          'var(--priority-medium)',
          'var(--priority-low)',
        ],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: 'var(--muted)' },
        },
      },
    },
  });
}
