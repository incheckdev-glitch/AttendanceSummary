(function initAccountingModule(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_accounting_phase1_v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = prefix => (global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const num = value => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = value => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : '—';
  const authProfile = () => global.Session?.authContext?.()?.profile || {};
  const authName = () => global.Session?.displayName?.() || authProfile()?.full_name || authProfile()?.email || 'Admin';

  function isAdmin() {
    const role = norm(authProfile()?.role_key || authProfile()?.role || authProfile()?.user_role || global.Session?.role?.() || '');
    return role === 'admin' || Boolean(global.Permissions?.hasAdminOverride?.());
  }

  const TABLES = {
    accounts: 'accounting_accounts',
    bankAccounts: 'accounting_bank_accounts',
    journals: 'accounting_journal_entries',
    journalLines: 'accounting_journal_lines',
    ledgerEntries: 'accounting_ledger_entries'
  };

  const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const state = {
    initialized: false,
    activeTab: 'dashboard',
    dataSource: 'local',
    loading: false,
    editingJournalId: '',
    journalLinesDraft: [],
    filters: { ledgerAccountId: 'all', ledgerFrom: '', ledgerTo: '', journalStatus: 'all' },
    accounts: [], bankAccounts: [], journals: [], journalLines: [], ledgerEntries: []
  };

  function client() {
    try { return global.SupabaseClient?.getClient?.() || null; }
    catch { return null; }
  }

  function toast(message) { global.UI?.toast?.(message); }

  function defaultAccounts() {
    const now = new Date().toISOString();
    return [
      { id: uid('acct'), account_code: '1000', account_name: 'Assets', account_type: 'Asset', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '1100', account_name: 'Cash on Hand', account_type: 'Asset', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '1200', account_name: 'Bank Account', account_type: 'Asset', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '1300', account_name: 'Accounts Receivable', account_type: 'Asset', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '2000', account_name: 'Liabilities', account_type: 'Liability', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '2100', account_name: 'Accounts Payable', account_type: 'Liability', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '2200', account_name: 'Payroll Payable', account_type: 'Liability', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '3000', account_name: 'Equity', account_type: 'Equity', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '4000', account_name: 'Revenue', account_type: 'Revenue', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '4100', account_name: 'SaaS Revenue', account_type: 'Revenue', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '4200', account_name: 'Setup Fees Revenue', account_type: 'Revenue', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '5000', account_name: 'Expenses', account_type: 'Expense', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '5100', account_name: 'Payroll Expense', account_type: 'Expense', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '5200', account_name: 'Outsourcing / Biners Expense', account_type: 'Expense', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now },
      { id: uid('acct'), account_code: '5300', account_name: 'Hosting & Software Expense', account_type: 'Expense', parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now }
    ];
  }

  function buildSampleData() {
    const accounts = defaultAccounts();
    const bankAccount = accounts.find(a => a.account_code === '1200') || accounts[1];
    return {
      accounts,
      bankAccounts: [{ id: uid('bank'), account_name: 'Main Bank USD', account_type: 'Bank', currency: 'USD', account_number: '', opening_balance: 0, current_balance: 0, linked_account_id: bankAccount?.id || null, is_active: true, notes: '', created_at: new Date().toISOString() }],
      journals: [], journalLines: [], ledgerEntries: []
    };
  }

  function plainState() {
    return { accounts: state.accounts, bankAccounts: state.bankAccounts, journals: state.journals, journalLines: state.journalLines, ledgerEntries: state.ledgerEntries };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plainState())); }
    catch (error) { console.warn('[Accounting] local save failed', error); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { Object.assign(state, buildSampleData(), JSON.parse(raw)); return; }
    } catch (error) { console.warn('[Accounting] local load failed', error); }
    Object.assign(state, buildSampleData());
    saveLocal();
  }

  async function fetchTable(tableName) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase client unavailable');
    const { data, error } = await supabase.from(tableName).select('*').limit(5000);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadRemote() {
    const [accounts, bankAccounts, journals, journalLines, ledgerEntries] = await Promise.all([
      fetchTable(TABLES.accounts), fetchTable(TABLES.bankAccounts), fetchTable(TABLES.journals), fetchTable(TABLES.journalLines), fetchTable(TABLES.ledgerEntries)
    ]);
    Object.assign(state, { accounts, bankAccounts, journals, journalLines, ledgerEntries, dataSource: 'supabase' });
  }

  async function upsertRemote(table, rowOrRows) {
    const supabase = client();
    if (!supabase) return rowOrRows;
    const payload = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    if (!payload.length) return rowOrRows;
    const { data, error } = await supabase.from(table).upsert(payload, { onConflict: 'id' }).select('*');
    if (error) throw error;
    state.dataSource = 'supabase';
    return Array.isArray(rowOrRows) ? (data || payload) : (data?.[0] || rowOrRows);
  }

  async function deleteRemote(table, column, value) {
    const supabase = client();
    if (!supabase) return;
    const { error } = await supabase.from(table).delete().eq(column, value);
    if (error) throw error;
  }

  async function persistRow(collection, table, row) {
    row.updated_at = new Date().toISOString();
    const idx = state[collection].findIndex(item => item.id === row.id);
    if (idx >= 0) state[collection][idx] = { ...state[collection][idx], ...row };
    else state[collection].push(row);
    try { await upsertRemote(table, row); }
    catch (error) { state.dataSource = 'local'; console.warn('[Accounting] remote save failed', error); toast('Accounting saved locally. Run Accounting Phase 1 SQL migration to enable Supabase sync.'); }
    saveLocal();
  }

  function accountById(id) { return state.accounts.find(account => account.id === id) || null; }
  function activeAccounts() { return state.accounts.filter(a => a.is_active !== false).sort((a,b) => String(a.account_code || '').localeCompare(String(b.account_code || ''))); }
  function accountOptions(selected = '', includeBlank = true) {
    const blank = includeBlank ? '<option value="">Select account</option>' : '';
    return blank + activeAccounts().map(a => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(a.account_code)} · ${esc(a.account_name)}</option>`).join('');
  }
  function parentAccountOptions(selected = '') {
    return '<option value="">No parent</option>' + activeAccounts().map(a => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(a.account_code)} · ${esc(a.account_name)}</option>`).join('');
  }
  function typeOptions(selected = 'Asset') {
    return ACCOUNT_TYPES.map(type => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type}</option>`).join('');
  }
  function nextJournalNo() {
    const year = new Date().getFullYear();
    const max = state.journals.reduce((acc, row) => {
      const match = String(row.journal_no || '').match(/(\d+)$/);
      return Math.max(acc, match ? Number(match[1]) : 0);
    }, 0);
    return `AJ/${year}/${String(max + 1).padStart(4, '0')}`;
  }

  function journalLinesFor(journalId) {
    return state.journalLines.filter(line => line.journal_id === journalId).sort((a,b) => num(a.line_no) - num(b.line_no));
  }

  function ledgerByAccount() {
    const map = new Map();
    state.accounts.forEach(account => map.set(account.id, { account, debit: 0, credit: 0, balance: num(account.opening_balance) }));
    state.ledgerEntries.forEach(entry => {
      const account = accountById(entry.account_id) || { id: entry.account_id, account_code: entry.account_code, account_name: entry.account_name, account_type: 'Asset', currency: entry.currency || 'USD' };
      const row = map.get(entry.account_id) || { account, debit: 0, credit: 0, balance: 0 };
      row.debit += num(entry.debit);
      row.credit += num(entry.credit);
      const naturalCredit = ['liability', 'equity', 'revenue'].includes(norm(account.account_type));
      row.balance = num(account.opening_balance) + (naturalCredit ? row.credit - row.debit : row.debit - row.credit);
      map.set(entry.account_id, row);
    });
    return [...map.values()].sort((a,b) => String(a.account.account_code || '').localeCompare(String(b.account.account_code || '')));
  }

  function dashboardMetrics() {
    const ledgerRows = ledgerByAccount();
    const totalDebit = state.ledgerEntries.reduce((sum,row) => sum + num(row.debit), 0);
    const totalCredit = state.ledgerEntries.reduce((sum,row) => sum + num(row.credit), 0);
    const bankCash = state.bankAccounts.filter(b => b.is_active !== false).reduce((sum,b) => sum + num(b.current_balance ?? b.opening_balance), 0);
    const posted = state.journals.filter(j => ['posted','locked'].includes(norm(j.status))).length;
    const draft = state.journals.filter(j => norm(j.status || 'draft') === 'draft').length;
    const assets = ledgerRows.filter(row => norm(row.account.account_type) === 'asset').reduce((sum,row) => sum + num(row.balance), 0);
    const liabilities = ledgerRows.filter(row => norm(row.account.account_type) === 'liability').reduce((sum,row) => sum + num(row.balance), 0);
    const revenue = ledgerRows.filter(row => norm(row.account.account_type) === 'revenue').reduce((sum,row) => sum + num(row.balance), 0);
    const expense = ledgerRows.filter(row => norm(row.account.account_type) === 'expense').reduce((sum,row) => sum + num(row.balance), 0);
    return { totalDebit, totalCredit, bankCash, posted, draft, assets, liabilities, revenue, expense, netProfit: revenue - expense };
  }

  function sourceChip() {
    return state.dataSource === 'supabase' ? '<span class="accounting-chip success">Supabase synced</span>' : '<span class="accounting-chip warning">Local mode · run Accounting SQL migration</span>';
  }

  function shell(content) {
    return `
      <div class="accounting-page-header">
        <div>
          <span class="accounting-eyebrow">Finance · Ledger · Controls</span>
          <h2>Accounting Phase 1</h2>
          <p class="muted">Admin-only accounting foundation: chart of accounts, journals, ledger, and bank/cash accounts.</p>
        </div>
        <div class="accounting-actions">
          ${sourceChip()}
          <button class="btn ghost sm" type="button" data-accounting-action="refresh">Refresh</button>
          <button class="btn sm" type="button" data-accounting-action="export-ledger">Export Ledger CSV</button>
        </div>
      </div>
      <div class="accounting-tabs" role="tablist">
        ${[
          ['dashboard','Dashboard'],['accounts','Chart of Accounts'],['journals','Journal Entries'],['ledger','General Ledger'],['bank','Bank & Cash'],['reports','Trial Balance']
        ].map(([key,label]) => `<button class="accounting-tab ${state.activeTab === key ? 'active' : ''}" type="button" data-accounting-tab="${key}">${label}</button>`).join('')}
      </div>
      ${content}
    `;
  }

  function renderDashboard() {
    const m = dashboardMetrics();
    const recentJournals = state.journals.slice().sort((a,b) => String(b.entry_date || '').localeCompare(String(a.entry_date || ''))).slice(0, 6);
    return `
      <div class="accounting-grid">
        <div class="accounting-kpi"><div class="label">Total Accounts</div><div class="value">${state.accounts.length}</div><div class="hint">Chart of accounts</div></div>
        <div class="accounting-kpi"><div class="label">Bank / Cash Balance</div><div class="value">${money(m.bankCash)}</div><div class="hint">Manual bank balances for Phase 1</div></div>
        <div class="accounting-kpi"><div class="label">Posted Journals</div><div class="value">${m.posted}</div><div class="hint">Posted or locked entries</div></div>
        <div class="accounting-kpi"><div class="label">Draft Journals</div><div class="value">${m.draft}</div><div class="hint">Need review/posting</div></div>
        <div class="accounting-kpi"><div class="label">Revenue</div><div class="value">${money(m.revenue)}</div><div class="hint">From posted ledger entries</div></div>
        <div class="accounting-kpi"><div class="label">Expenses</div><div class="value">${money(m.expense)}</div><div class="hint">From posted ledger entries</div></div>
        <div class="accounting-kpi"><div class="label">Net Profit</div><div class="value">${money(m.netProfit)}</div><div class="hint">Revenue minus expenses</div></div>
        <div class="accounting-kpi"><div class="label">Trial Balance</div><div class="value">${Math.abs(m.totalDebit - m.totalCredit) < 0.01 ? 'Balanced' : 'Mismatch'}</div><div class="hint">Debit ${money(m.totalDebit)} · Credit ${money(m.totalCredit)}</div></div>
      </div>
      <div class="accounting-card" style="margin-top:12px;">
        <div class="accounting-card-header"><div><h3>Recent Journal Entries</h3><p class="muted">Latest accounting activity.</p></div><button class="btn sm" data-accounting-tab="journals" type="button">New Journal</button></div>
        ${renderJournalTable(recentJournals, true)}
      </div>
    `;
  }

  function renderAccounts() {
    return `
      <div class="accounting-two-col">
        <div class="accounting-card">
          <div class="accounting-card-header"><div><h3>Chart of Accounts</h3><p class="muted">Admin can create, edit, deactivate, and organize accounts.</p></div></div>
          ${renderAccountsTable()}
        </div>
        <div class="accounting-card">
          <h3>Add / Edit Account</h3>
          <form id="accountingAccountForm" class="accounting-form-grid">
            <input type="hidden" id="accountingAccountId" />
            <label class="accounting-field">Code<input id="accountingAccountCode" required placeholder="e.g. 1100" /></label>
            <label class="accounting-field">Name<input id="accountingAccountName" required placeholder="Cash on Hand" /></label>
            <label class="accounting-field">Type<select id="accountingAccountType">${typeOptions()}</select></label>
            <label class="accounting-field">Parent<select id="accountingParentAccountId">${parentAccountOptions()}</select></label>
            <label class="accounting-field">Currency<input id="accountingAccountCurrency" value="USD" /></label>
            <label class="accounting-field">Opening Balance<input id="accountingOpeningBalance" type="number" step="0.01" value="0" /></label>
            <label class="accounting-field">Active<select id="accountingAccountActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
            <label class="accounting-field wide">Notes<textarea id="accountingAccountNotes"></textarea></label>
            <div class="accounting-toolbar wide">
              <button class="btn" type="submit">Save Account</button>
              <button class="btn ghost" type="button" data-accounting-action="reset-account-form">Clear</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderAccountsTable(rows = state.accounts) {
    const sorted = rows.slice().sort((a,b) => String(a.account_code || '').localeCompare(String(b.account_code || '')));
    if (!sorted.length) return '<div class="accounting-empty">No accounts yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th>Status</th><th class="num">Opening</th><th>Actions</th></tr></thead><tbody>${sorted.map(row => `
      <tr>
        <td><strong>${esc(row.account_code)}</strong></td>
        <td>${esc(row.account_name)}</td>
        <td>${esc(row.account_type)}</td>
        <td>${esc(row.currency || 'USD')}</td>
        <td><span class="accounting-badge">${row.is_active === false ? 'Inactive' : 'Active'}</span></td>
        <td class="num">${money(row.opening_balance, row.currency)}</td>
        <td><button class="btn ghost sm" type="button" data-accounting-edit-account="${esc(row.id)}">Edit</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function renderBank() {
    return `
      <div class="accounting-two-col">
        <div class="accounting-card">
          <div class="accounting-card-header"><div><h3>Bank & Cash Accounts</h3><p class="muted">Phase 1 manual balances. Later receipts/payments will update these automatically.</p></div></div>
          ${renderBankTable()}
        </div>
        <div class="accounting-card">
          <h3>Add / Edit Bank or Cash</h3>
          <form id="accountingBankForm" class="accounting-form-grid">
            <input type="hidden" id="accountingBankId" />
            <label class="accounting-field">Name<input id="accountingBankName" required placeholder="Main Bank USD" /></label>
            <label class="accounting-field">Type<select id="accountingBankType"><option>Bank</option><option>Cash</option><option>Wallet</option></select></label>
            <label class="accounting-field">Currency<input id="accountingBankCurrency" value="USD" /></label>
            <label class="accounting-field">Account Number<input id="accountingBankNumber" /></label>
            <label class="accounting-field">Opening Balance<input id="accountingBankOpening" type="number" step="0.01" value="0" /></label>
            <label class="accounting-field">Current Balance<input id="accountingBankCurrent" type="number" step="0.01" value="0" /></label>
            <label class="accounting-field">Linked GL Account<select id="accountingBankLinkedAccount">${accountOptions('', true)}</select></label>
            <label class="accounting-field">Active<select id="accountingBankActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
            <label class="accounting-field wide">Notes<textarea id="accountingBankNotes"></textarea></label>
            <div class="accounting-toolbar wide"><button class="btn" type="submit">Save Bank/Cash</button><button class="btn ghost" type="button" data-accounting-action="reset-bank-form">Clear</button></div>
          </form>
        </div>
      </div>
    `;
  }

  function renderBankTable() {
    if (!state.bankAccounts.length) return '<div class="accounting-empty">No bank or cash accounts yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Name</th><th>Type</th><th>Currency</th><th>Linked Account</th><th class="num">Opening</th><th class="num">Current</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.bankAccounts.map(row => {
      const linked = accountById(row.linked_account_id);
      return `<tr><td><strong>${esc(row.account_name)}</strong></td><td>${esc(row.account_type)}</td><td>${esc(row.currency || 'USD')}</td><td>${linked ? `${esc(linked.account_code)} · ${esc(linked.account_name)}` : '—'}</td><td class="num">${money(row.opening_balance,row.currency)}</td><td class="num">${money(row.current_balance,row.currency)}</td><td><span class="accounting-badge">${row.is_active === false ? 'Inactive' : 'Active'}</span></td><td><button class="btn ghost sm" type="button" data-accounting-edit-bank="${esc(row.id)}">Edit</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderJournals() {
    const rows = state.journals.filter(row => state.filters.journalStatus === 'all' || norm(row.status || 'draft') === state.filters.journalStatus).sort((a,b) => String(b.entry_date || '').localeCompare(String(a.entry_date || '')));
    return `
      <div class="accounting-two-col">
        <div class="accounting-card">
          <div class="accounting-card-header"><div><h3>Journal Entries</h3><p class="muted">Create balanced accounting journals. Posting creates ledger entries.</p></div><select id="accountingJournalStatusFilter" class="select"><option value="all">All statuses</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="locked">Locked</option></select></div>
          ${renderJournalTable(rows)}
        </div>
        <div class="accounting-card">
          <h3>${state.editingJournalId ? 'Edit Journal' : 'New Journal'}</h3>
          ${renderJournalForm()}
        </div>
      </div>
    `;
  }

  function renderJournalTable(rows, compact = false) {
    if (!rows.length) return '<div class="accounting-empty">No journal entries yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>No.</th><th>Date</th><th>Description</th><th>Status</th><th class="num">Debit</th><th class="num">Credit</th>${compact ? '' : '<th>Actions</th>'}</tr></thead><tbody>${rows.map(row => `<tr>
      <td><strong>${esc(row.journal_no)}</strong></td><td>${fmtDate(row.entry_date)}</td><td>${esc(row.description || '—')}<div class="muted">${esc(row.reference_no || '')}</div></td><td><span class="accounting-badge ${esc(norm(row.status || 'draft'))}">${esc(row.status || 'Draft')}</span></td><td class="num">${money(row.total_debit,row.currency || 'USD')}</td><td class="num">${money(row.total_credit,row.currency || 'USD')}</td>${compact ? '' : `<td><button class="btn ghost sm" type="button" data-accounting-edit-journal="${esc(row.id)}">Edit</button> <button class="btn sm" type="button" data-accounting-post-journal="${esc(row.id)}">Post</button> <button class="btn ghost sm" type="button" data-accounting-delete-journal="${esc(row.id)}">Delete</button></td>`}</tr>`).join('')}</tbody></table></div>`;
  }

  function currentDraftLines() {
    if (!state.journalLinesDraft.length) {
      state.journalLinesDraft = [{ account_id:'', debit:'', credit:'', description:'' }, { account_id:'', debit:'', credit:'', description:'' }];
    }
    return state.journalLinesDraft;
  }

  function renderJournalForm() {
    const journal = state.journals.find(j => j.id === state.editingJournalId) || {};
    const lines = currentDraftLines();
    const debit = lines.reduce((sum,line) => sum + num(line.debit), 0);
    const credit = lines.reduce((sum,line) => sum + num(line.credit), 0);
    const balanced = Math.abs(debit - credit) < 0.01 && debit > 0;
    return `<form id="accountingJournalForm">
      <input type="hidden" id="accountingJournalId" value="${esc(journal.id || '')}" />
      <div class="accounting-form-grid">
        <label class="accounting-field">Journal No.<input id="accountingJournalNo" value="${esc(journal.journal_no || nextJournalNo())}" /></label>
        <label class="accounting-field">Date<input id="accountingJournalDate" type="date" value="${esc(journal.entry_date || today())}" /></label>
        <label class="accounting-field">Currency<input id="accountingJournalCurrency" value="${esc(journal.currency || 'USD')}" /></label>
        <label class="accounting-field">Reference<input id="accountingJournalReference" value="${esc(journal.reference_no || '')}" /></label>
        <label class="accounting-field wide">Description<textarea id="accountingJournalDescription" required>${esc(journal.description || '')}</textarea></label>
      </div>
      <div class="accounting-toolbar"><strong>Lines</strong><button class="btn ghost sm" type="button" data-accounting-action="add-journal-line">+ Add Line</button></div>
      <div class="accounting-journal-lines">
        ${lines.map((line, index) => `<div class="accounting-journal-line" data-journal-line-index="${index}">
          <label class="accounting-field wide-mobile">Account<select data-journal-line-field="account_id">${accountOptions(line.account_id, true)}</select></label>
          <label class="accounting-field">Debit<input type="number" step="0.01" data-journal-line-field="debit" value="${esc(line.debit)}" /></label>
          <label class="accounting-field">Credit<input type="number" step="0.01" data-journal-line-field="credit" value="${esc(line.credit)}" /></label>
          <label class="accounting-field wide-mobile">Line Description<input data-journal-line-field="description" value="${esc(line.description || '')}" /></label>
          <button class="btn ghost sm" type="button" data-accounting-remove-line="${index}">Remove</button>
        </div>`).join('')}
      </div>
      <div class="accounting-journal-totals"><span class="accounting-total-pill">Debit ${money(debit)}</span><span class="accounting-total-pill">Credit ${money(credit)}</span><span class="accounting-total-pill ${balanced ? 'ok' : 'bad'}">${balanced ? 'Balanced' : 'Not Balanced'}</span></div>
      <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="reset-journal-form">New</button><button class="btn" type="button" data-accounting-action="save-journal-draft">Save Draft</button><button class="btn" type="button" data-accounting-action="post-journal-form">Post Journal</button></div>
    </form>`;
  }

  function renderLedger() {
    const rows = filteredLedgerRows();
    return `<div class="accounting-card"><div class="accounting-card-header"><div><h3>General Ledger</h3><p class="muted">Posted journal lines by account and date.</p></div></div>
      <div class="accounting-toolbar"><select id="accountingLedgerAccountFilter" class="select"><option value="all">All accounts</option>${accountOptions(state.filters.ledgerAccountId, false)}</select><input id="accountingLedgerFrom" class="input" type="date" value="${esc(state.filters.ledgerFrom)}" /><input id="accountingLedgerTo" class="input" type="date" value="${esc(state.filters.ledgerTo)}" /><button class="btn ghost sm" type="button" data-accounting-action="clear-ledger-filters">Clear</button></div>
      ${renderLedgerTable(rows)}
    </div>`;
  }

  function filteredLedgerRows() {
    return state.ledgerEntries.filter(row => {
      const date = String(row.entry_date || '').slice(0,10);
      if (state.filters.ledgerAccountId !== 'all' && row.account_id !== state.filters.ledgerAccountId) return false;
      if (state.filters.ledgerFrom && date < state.filters.ledgerFrom) return false;
      if (state.filters.ledgerTo && date > state.filters.ledgerTo) return false;
      return true;
    }).sort((a,b) => String(a.entry_date || '').localeCompare(String(b.entry_date || '')) || String(a.account_code || '').localeCompare(String(b.account_code || '')));
  }

  function renderLedgerTable(rows) {
    if (!rows.length) return '<div class="accounting-empty">No ledger entries yet. Post a journal to create ledger movement.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Journal</th><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.entry_date)}</td><td>${esc(row.journal_no || '')}</td><td><strong>${esc(row.account_code)}</strong> · ${esc(row.account_name)}</td><td>${esc(row.description || '')}<div class="muted">${esc(row.reference_no || '')}</div></td><td class="num">${money(row.debit,row.currency)}</td><td class="num">${money(row.credit,row.currency)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderReports() {
    const rows = ledgerByAccount();
    const totalDebit = rows.reduce((sum,row) => sum + num(row.debit), 0);
    const totalCredit = rows.reduce((sum,row) => sum + num(row.credit), 0);
    return `<div class="accounting-card"><div class="accounting-card-header"><div><h3>Trial Balance</h3><p class="muted">Opening balances plus posted ledger movement.</p></div><span class="accounting-total-pill ${Math.abs(totalDebit-totalCredit) < 0.01 ? 'ok' : 'bad'}">Debit ${money(totalDebit)} · Credit ${money(totalCredit)}</span></div>
      <div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Debit Movement</th><th class="num">Credit Movement</th><th class="num">Balance</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.account.account_code)}</strong></td><td>${esc(row.account.account_name)}</td><td>${esc(row.account.account_type)}</td><td class="num">${money(row.debit,row.account.currency)}</td><td class="num">${money(row.credit,row.account.currency)}</td><td class="num"><strong>${money(row.balance,row.account.currency)}</strong></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function render() {
    const root = $('accountingRoot');
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = '<div class="accounting-card"><h2>Accounting</h2><p class="muted">Accounting is admin-only for now.</p></div>';
      return;
    }
    let content = '';
    if (state.activeTab === 'dashboard') content = renderDashboard();
    else if (state.activeTab === 'accounts') content = renderAccounts();
    else if (state.activeTab === 'journals') content = renderJournals();
    else if (state.activeTab === 'ledger') content = renderLedger();
    else if (state.activeTab === 'bank') content = renderBank();
    else content = renderReports();
    root.innerHTML = shell(content);
    bindRenderedForms();
  }

  function bindRenderedForms() {
    const accountForm = $('accountingAccountForm');
    if (accountForm) accountForm.addEventListener('submit', event => { event.preventDefault(); saveAccountForm(); });
    const bankForm = $('accountingBankForm');
    if (bankForm) bankForm.addEventListener('submit', event => { event.preventDefault(); saveBankForm(); });
    const journalStatus = $('accountingJournalStatusFilter');
    if (journalStatus) {
      journalStatus.value = state.filters.journalStatus;
      journalStatus.addEventListener('change', event => { state.filters.journalStatus = event.target.value || 'all'; render(); });
    }
    const ledgerAccount = $('accountingLedgerAccountFilter');
    if (ledgerAccount) ledgerAccount.addEventListener('change', event => { state.filters.ledgerAccountId = event.target.value || 'all'; render(); });
    const ledgerFrom = $('accountingLedgerFrom');
    if (ledgerFrom) ledgerFrom.addEventListener('change', event => { state.filters.ledgerFrom = event.target.value || ''; render(); });
    const ledgerTo = $('accountingLedgerTo');
    if (ledgerTo) ledgerTo.addEventListener('change', event => { state.filters.ledgerTo = event.target.value || ''; render(); });
    bindJournalLineInputs();
  }

  function bindJournalLineInputs() {
    document.querySelectorAll('[data-journal-line-index]').forEach(row => {
      const index = Number(row.getAttribute('data-journal-line-index'));
      row.querySelectorAll('[data-journal-line-field]').forEach(input => {
        input.addEventListener('input', event => {
          const field = event.target.getAttribute('data-journal-line-field');
          if (!state.journalLinesDraft[index]) return;
          state.journalLinesDraft[index][field] = event.target.value;
        });
        input.addEventListener('change', event => {
          const field = event.target.getAttribute('data-journal-line-field');
          if (!state.journalLinesDraft[index]) return;
          state.journalLinesDraft[index][field] = event.target.value;
          if (field === 'debit' && num(event.target.value) > 0) state.journalLinesDraft[index].credit = '';
          if (field === 'credit' && num(event.target.value) > 0) state.journalLinesDraft[index].debit = '';
          if (['debit','credit'].includes(field)) render();
        });
      });
    });
  }

  async function saveAccountForm() {
    const id = $('accountingAccountId')?.value || uid('acct');
    const row = {
      id,
      account_code: $('accountingAccountCode')?.value?.trim() || '',
      account_name: $('accountingAccountName')?.value?.trim() || '',
      account_type: $('accountingAccountType')?.value || 'Asset',
      parent_account_id: $('accountingParentAccountId')?.value || null,
      currency: ($('accountingAccountCurrency')?.value || 'USD').trim().toUpperCase(),
      opening_balance: num($('accountingOpeningBalance')?.value),
      is_active: $('accountingAccountActive')?.value !== 'false',
      notes: $('accountingAccountNotes')?.value || '',
      created_at: state.accounts.find(a => a.id === id)?.created_at || new Date().toISOString()
    };
    if (!row.account_code || !row.account_name) return toast('Account code and name are required.');
    await persistRow('accounts', TABLES.accounts, row);
    toast('Account saved.');
    render();
  }

  async function saveBankForm() {
    const id = $('accountingBankId')?.value || uid('bank');
    const row = {
      id,
      account_name: $('accountingBankName')?.value?.trim() || '',
      account_type: $('accountingBankType')?.value || 'Bank',
      currency: ($('accountingBankCurrency')?.value || 'USD').trim().toUpperCase(),
      account_number: $('accountingBankNumber')?.value || '',
      opening_balance: num($('accountingBankOpening')?.value),
      current_balance: num($('accountingBankCurrent')?.value),
      linked_account_id: $('accountingBankLinkedAccount')?.value || null,
      is_active: $('accountingBankActive')?.value !== 'false',
      notes: $('accountingBankNotes')?.value || '',
      created_at: state.bankAccounts.find(a => a.id === id)?.created_at || new Date().toISOString()
    };
    if (!row.account_name) return toast('Bank/cash account name is required.');
    await persistRow('bankAccounts', TABLES.bankAccounts, row);
    toast('Bank/Cash account saved.');
    render();
  }

  function editAccount(id) {
    const row = state.accounts.find(item => item.id === id);
    if (!row) return;
    state.activeTab = 'accounts'; render();
    $('accountingAccountId').value = row.id;
    $('accountingAccountCode').value = row.account_code || '';
    $('accountingAccountName').value = row.account_name || '';
    $('accountingAccountType').value = row.account_type || 'Asset';
    $('accountingParentAccountId').value = row.parent_account_id || '';
    $('accountingAccountCurrency').value = row.currency || 'USD';
    $('accountingOpeningBalance').value = row.opening_balance || 0;
    $('accountingAccountActive').value = row.is_active === false ? 'false' : 'true';
    $('accountingAccountNotes').value = row.notes || '';
  }

  function editBank(id) {
    const row = state.bankAccounts.find(item => item.id === id);
    if (!row) return;
    state.activeTab = 'bank'; render();
    $('accountingBankId').value = row.id;
    $('accountingBankName').value = row.account_name || '';
    $('accountingBankType').value = row.account_type || 'Bank';
    $('accountingBankCurrency').value = row.currency || 'USD';
    $('accountingBankNumber').value = row.account_number || '';
    $('accountingBankOpening').value = row.opening_balance || 0;
    $('accountingBankCurrent').value = row.current_balance || 0;
    $('accountingBankLinkedAccount').value = row.linked_account_id || '';
    $('accountingBankActive').value = row.is_active === false ? 'false' : 'true';
    $('accountingBankNotes').value = row.notes || '';
  }

  function readJournalForm(status) {
    bindJournalLineInputs();
    const id = $('accountingJournalId')?.value || state.editingJournalId || uid('journal');
    const currency = ($('accountingJournalCurrency')?.value || 'USD').trim().toUpperCase();
    const validLines = currentDraftLines().map((line, index) => {
      const account = accountById(line.account_id);
      return {
        id: line.id || uid('line'), journal_id: id, line_no: index + 1, account_id: line.account_id || '', account_code: account?.account_code || '', account_name: account?.account_name || '', debit: num(line.debit), credit: num(line.credit), currency, description: line.description || '', created_at: line.created_at || new Date().toISOString()
      };
    }).filter(line => line.account_id && (line.debit > 0 || line.credit > 0));
    const totalDebit = validLines.reduce((sum,line) => sum + num(line.debit), 0);
    const totalCredit = validLines.reduce((sum,line) => sum + num(line.credit), 0);
    const existing = state.journals.find(j => j.id === id) || {};
    const journal = {
      id,
      journal_no: $('accountingJournalNo')?.value?.trim() || existing.journal_no || nextJournalNo(),
      entry_date: $('accountingJournalDate')?.value || today(),
      description: $('accountingJournalDescription')?.value?.trim() || '',
      reference_no: $('accountingJournalReference')?.value?.trim() || '',
      status,
      currency,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: existing.created_by || authName(),
      posted_by: status === 'posted' ? authName() : existing.posted_by || null,
      posted_at: status === 'posted' ? new Date().toISOString() : existing.posted_at || null,
      created_at: existing.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return { journal, lines: validLines, totalDebit, totalCredit };
  }

  async function saveJournal(status = 'draft') {
    const { journal, lines, totalDebit, totalCredit } = readJournalForm(status);
    if (!journal.description) return toast('Journal description is required.');
    if (lines.length < 2) return toast('Journal needs at least two lines.');
    if (Math.abs(totalDebit - totalCredit) >= 0.01 || totalDebit <= 0) return toast('Journal must be balanced before saving/posting.');
    const jIdx = state.journals.findIndex(j => j.id === journal.id);
    if (jIdx >= 0) state.journals[jIdx] = journal; else state.journals.push(journal);
    state.journalLines = state.journalLines.filter(line => line.journal_id !== journal.id).concat(lines);
    if (status === 'posted') {
      state.ledgerEntries = state.ledgerEntries.filter(entry => entry.journal_id !== journal.id).concat(lines.map(line => ({
        id: uid('ledger'), journal_id: journal.id, journal_line_id: line.id, journal_no: journal.journal_no, entry_date: journal.entry_date, account_id: line.account_id, account_code: line.account_code, account_name: line.account_name, debit: line.debit, credit: line.credit, currency: journal.currency, description: line.description || journal.description, reference_no: journal.reference_no, source_module: 'manual_journal', source_id: journal.id, status: 'posted', created_at: new Date().toISOString()
      })));
    }
    try {
      await upsertRemote(TABLES.journals, journal);
      await deleteRemote(TABLES.journalLines, 'journal_id', journal.id);
      await upsertRemote(TABLES.journalLines, lines);
      if (status === 'posted') {
        const ledgerRows = state.ledgerEntries.filter(entry => entry.journal_id === journal.id);
        await deleteRemote(TABLES.ledgerEntries, 'journal_id', journal.id);
        await upsertRemote(TABLES.ledgerEntries, ledgerRows);
      }
    } catch (error) {
      state.dataSource = 'local';
      console.warn('[Accounting] journal remote save failed', error);
      toast('Journal saved locally. Run Accounting SQL migration to enable Supabase sync.');
    }
    saveLocal();
    state.editingJournalId = journal.id;
    state.journalLinesDraft = lines.map(line => ({ ...line }));
    toast(status === 'posted' ? 'Journal posted and ledger updated.' : 'Journal saved as draft.');
    render();
  }

  function editJournal(id) {
    const journal = state.journals.find(j => j.id === id);
    if (!journal) return;
    state.editingJournalId = id;
    state.journalLinesDraft = journalLinesFor(id).map(line => ({ ...line }));
    if (!state.journalLinesDraft.length) state.journalLinesDraft = [{ account_id:'', debit:'', credit:'', description:'' }, { account_id:'', debit:'', credit:'', description:'' }];
    state.activeTab = 'journals';
    render();
  }

  async function deleteJournal(id) {
    const journal = state.journals.find(j => j.id === id);
    if (!journal) return;
    if (!confirm(`Delete journal ${journal.journal_no}?`)) return;
    state.journals = state.journals.filter(j => j.id !== id);
    state.journalLines = state.journalLines.filter(line => line.journal_id !== id);
    state.ledgerEntries = state.ledgerEntries.filter(entry => entry.journal_id !== id);
    try { await deleteRemote(TABLES.ledgerEntries, 'journal_id', id); await deleteRemote(TABLES.journalLines, 'journal_id', id); await deleteRemote(TABLES.journals, 'id', id); }
    catch (error) { console.warn('[Accounting] remote delete failed', error); state.dataSource = 'local'; }
    if (state.editingJournalId === id) { state.editingJournalId = ''; state.journalLinesDraft = []; }
    saveLocal(); render(); toast('Journal deleted.');
  }

  function resetJournalForm() { state.editingJournalId = ''; state.journalLinesDraft = [{ account_id:'', debit:'', credit:'', description:'' }, { account_id:'', debit:'', credit:'', description:'' }]; render(); }
  function resetAccountForm() { render(); }
  function resetBankForm() { render(); }

  function exportCsv(filename, rows) {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const csv = [headers.join(','), ...rows.map(row => headers.map(key => `"${String(row[key] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  function handleClick(event) {
    const tabBtn = event.target.closest('[data-accounting-tab]');
    if (tabBtn) { state.activeTab = tabBtn.getAttribute('data-accounting-tab'); render(); return; }
    const actionBtn = event.target.closest('[data-accounting-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-accounting-action');
      if (action === 'refresh') { refresh(true); return; }
      if (action === 'export-ledger') { exportCsv('accounting_general_ledger.csv', state.ledgerEntries); return; }
      if (action === 'reset-account-form') { resetAccountForm(); return; }
      if (action === 'reset-bank-form') { resetBankForm(); return; }
      if (action === 'reset-journal-form') { resetJournalForm(); return; }
      if (action === 'add-journal-line') { currentDraftLines().push({ account_id:'', debit:'', credit:'', description:'' }); render(); return; }
      if (action === 'save-journal-draft') { saveJournal('draft'); return; }
      if (action === 'post-journal-form') { saveJournal('posted'); return; }
      if (action === 'clear-ledger-filters') { state.filters.ledgerAccountId = 'all'; state.filters.ledgerFrom = ''; state.filters.ledgerTo = ''; render(); return; }
    }
    const editAccountBtn = event.target.closest('[data-accounting-edit-account]');
    if (editAccountBtn) { editAccount(editAccountBtn.getAttribute('data-accounting-edit-account')); return; }
    const editBankBtn = event.target.closest('[data-accounting-edit-bank]');
    if (editBankBtn) { editBank(editBankBtn.getAttribute('data-accounting-edit-bank')); return; }
    const editJournalBtn = event.target.closest('[data-accounting-edit-journal]');
    if (editJournalBtn) { editJournal(editJournalBtn.getAttribute('data-accounting-edit-journal')); return; }
    const postJournalBtn = event.target.closest('[data-accounting-post-journal]');
    if (postJournalBtn) { editJournal(postJournalBtn.getAttribute('data-accounting-post-journal')); setTimeout(() => saveJournal('posted'), 0); return; }
    const deleteJournalBtn = event.target.closest('[data-accounting-delete-journal]');
    if (deleteJournalBtn) { deleteJournal(deleteJournalBtn.getAttribute('data-accounting-delete-journal')); return; }
    const removeLineBtn = event.target.closest('[data-accounting-remove-line]');
    if (removeLineBtn) { const idx = Number(removeLineBtn.getAttribute('data-accounting-remove-line')); state.journalLinesDraft.splice(idx, 1); render(); }
  }

  async function refresh(force = false) {
    if (!isAdmin()) { render(); return; }
    if (force || state.dataSource !== 'supabase') {
      try { await loadRemote(); }
      catch (error) { console.warn('[Accounting] remote load failed, using local data', error); loadLocal(); state.dataSource = 'local'; }
    }
    if (!state.accounts.length) Object.assign(state, buildSampleData());
    render();
  }

  async function init() {
    if (!isAdmin()) { render(); return; }
    if (!state.initialized) {
      const root = $('accountingRoot');
      if (root) root.addEventListener('click', handleClick);
      state.initialized = true;
      resetJournalForm();
    }
    await refresh(true);
  }

  global.AccountingModule = { init, refresh, state };
})(window);
