// insights.js
// =========== AI INSIGHTS MODULE ===========
// Handles AI-based risk scoring and per-module analysis
// Lazy-loaded when user switches to the Insights tab.

import { showToast, createFragment } from './utils.js';

let insightsData = [];

// ---------- INIT ENTRY POINT ----------
export async function initInsights() {
  console.log('AI Insights view initialized');

  const tableBody = document.querySelector('#aiModulesTableBody');
  if (!tableBody) {
    console.warn('AI Insights table missing');
    return;
  }

  // Simulate loading or fetch from your backend later
  await loadInsights();
  renderInsightsTable();
  showToast('AI module insights ready');
}

// ---------- LOAD DATA ----------
async function loadInsights() {
  try {
    const response = await fetch('./data/ai_modules.json');
    if (!response.ok) throw new Error('Failed to load AI insights');
    insightsData = await response.json();
  } catch (err) {
    console.error('❌ Error loading AI insights:', err);
    showToast('Error loading AI insights data', 'error');

    // Fallback (dummy example data)
    insightsData = [
      { module: 'Payments', reliability: 0.87, coverage: 0.72, risk: 0.15 },
      { module: 'Bookings', reliability: 0.76, coverage: 0.80, risk: 0.22 },
      { module: 'Inventory', reliability: 0.93, coverage: 0.88, risk: 0.08 },
    ];
  }
}

// ---------- RENDER TABLE ----------
function renderInsightsTable() {
  const tbody = document.querySelector('#aiModulesTableBody');
  if (!tbody) return;

  const frag = createFragment();

  insightsData.forEach(row => {
    const tr = document.createElement('tr');
    const riskLevel = riskCategory(row.risk);

    tr.innerHTML = `
      <td>${row.module}</td>
      <td>${(row.reliability * 100).toFixed(1)}%</td>
      <td>${(row.coverage * 100).toFixed(1)}%</td>
      <td>${(row.risk * 100).toFixed(1)}%</td>
      <td>
        <div class="risk-bar-wrap">
          <div class="risk-bar" style="transform:scaleX(${row.risk});"></div>
        </div>
      </td>
      <td><span class="chip ${riskLevel.class}">${riskLevel.label}</span></td>
    `;
    frag.appendChild(tr);
  });

  tbody.replaceChildren(frag);
}

// ---------- RISK LOGIC ----------
function riskCategory(score) {
  if (score >= 0.4) return { label: 'Critical', class: 'risk-crit' };
  if (score >= 0.25) return { label: 'High', class: 'risk-high' };
  if (score >= 0.15) return { label: 'Medium', class: 'risk-med' };
  return { label: 'Low', class: 'risk-low' };
}

// ---------- RE-RUN ANALYSIS ----------
export function refreshInsights() {
  renderInsightsTable();
  showToast('Insights refreshed');
}
