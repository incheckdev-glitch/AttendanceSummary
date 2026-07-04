(function initAccountingModule(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_accounting_phase3_v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = prefix => (global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
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
  const POSTABLE_TYPES = ['invoices','receipts','credit_notes','biners_payables','biners_payments','hr_payroll','hr_salary_receipts'];
  const REPORT_TABS = ['trial_balance','profit_loss','balance_sheet','cash_flow','ar_aging','ap_aging','customer_statement','vendor_statement','payroll_expense'];

  const state = {
    initialized: false,
    activeTab: 'dashboard',
    activeSourceTab: 'invoices',
    activeReportTab: 'trial_balance',
    dataSource: 'local',
    loading: false,
    editingJournalId: '',
    journalLinesDraft: [],
    filters: {
      ledgerAccountId: 'all', ledgerFrom: '', ledgerTo: '', ledgerSource: 'all', journalStatus: 'all',
      sourceSearch: '', sourceFrom: '', sourceTo: '', sourceStatus: 'unposted',
      reportFrom: '', reportTo: '', reportAsOf: today(), reportSearch: ''
    },
    accounts: [], bankAccounts: [], journals: [], journalLines: [], ledgerEntries: [],
    sources: { invoices: [], receipts: [], creditNotes: [], binersSchedules: [], payrollItems: [], salaryReceipts: [], hrEmployees: [] }
  };

  function client() {
    try { return global.SupabaseClient?.getClient?.() || null; }
    catch { return null; }
  }

  function toast(message) { global.UI?.toast?.(message); }

  function defaultAccounts() {
    const now = new Date().toISOString();
    return [
      ['1000','Assets','Asset'], ['1100','Cash on Hand','Asset'], ['1200','Bank Account','Asset'], ['1300','Accounts Receivable','Asset'],
      ['2000','Liabilities','Liability'], ['2100','Accounts Payable','Liability'], ['2200','Payroll Payable','Liability'], ['2300','VAT Payable','Liability'],
      ['3000','Equity','Equity'],
      ['4000','Revenue','Revenue'], ['4100','SaaS Revenue','Revenue'], ['4200','Setup Fees Revenue','Revenue'], ['4900','Credit Notes / Revenue Contra','Revenue'],
      ['5000','Expenses','Expense'], ['5100','Payroll Expense','Expense'], ['5200','Outsourcing / Biners Expense','Expense'], ['5300','Hosting & Software Expense','Expense'], ['5400','General Operating Expense','Expense']
    ].map(([account_code, account_name, account_type]) => ({
      id: uid('acct'), account_code, account_name, account_type, parent_account_id: null, currency: 'USD', opening_balance: 0, is_active: true, notes: '', created_at: now
    }));
  }

  function buildSampleData() {
    const accounts = defaultAccounts();
    const bankAccount = accounts.find(a => a.account_code === '1200') || accounts[1];
    return {
      accounts,
      bankAccounts: [{ id: uid('bank'), account_name: 'Main Bank USD', account_type: 'Bank', currency: 'USD', account_number: '', opening_balance: 0, current_balance: 0, linked_account_id: bankAccount?.id || null, is_active: true, notes: '', created_at: new Date().toISOString() }],
      journals: [], journalLines: [], ledgerEntries: [],
      sources: { invoices: [], receipts: [], creditNotes: [], binersSchedules: [], payrollItems: [], salaryReceipts: [], hrEmployees: [] }
    };
  }

  function plainState() {
    return { accounts: state.accounts, bankAccounts: state.bankAccounts, journals: state.journals, journalLines: state.journalLines, ledgerEntries: state.ledgerEntries, sources: state.sources };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plainState())); }
    catch (error) { console.warn('[Accounting] local save failed', error); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('incheck360_accounting_phase2_v1') || localStorage.getItem('incheck360_accounting_phase1_v1');
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

  async function safeFetchTable(tableName) {
    try { return await fetchTable(tableName); }
    catch (error) { console.warn(`[Accounting] source table ${tableName} unavailable`, error?.message || error); return []; }
  }

  async function loadIntegrationSources() {
    const [invoices, receipts, creditNotes, binersSchedules, payrollItems, salaryReceipts, hrEmployees] = await Promise.all([
      safeFetchTable('invoices'), safeFetchTable('receipts'), safeFetchTable('credit_notes'), safeFetchTable('biners_payment_schedules'),
      safeFetchTable('hr_payroll_items'), safeFetchTable('hr_salary_receipts'), safeFetchTable('hr_employees')
    ]);
    state.sources = {
      invoices: addSourceKeys(invoices, 'invoice'),
      receipts: addSourceKeys(receipts, 'receipt'),
      creditNotes: addSourceKeys(creditNotes, 'credit_note'),
      binersSchedules: addSourceKeys(binersSchedules, 'biners'),
      payrollItems: addSourceKeys(payrollItems, 'payroll'),
      salaryReceipts: addSourceKeys(salaryReceipts, 'salary_receipt'),
      hrEmployees: addSourceKeys(hrEmployees, 'employee')
    };
  }

  function addSourceKeys(rows, prefix) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => ({ ...row, __acct_key: String(row.id || row[`${prefix}_id`] || row[`${prefix}_no`] || row[`${prefix}_number`] || `${prefix}-${index}`) }));
  }

  async function loadRemote() {
    const [accounts, bankAccounts, journals, journalLines, ledgerEntries] = await Promise.all([
      fetchTable(TABLES.accounts), fetchTable(TABLES.bankAccounts), fetchTable(TABLES.journals), fetchTable(TABLES.journalLines), fetchTable(TABLES.ledgerEntries)
    ]);
    Object.assign(state, { accounts, bankAccounts, journals, journalLines, ledgerEntries, dataSource: 'supabase' });
    await loadIntegrationSources();
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
    catch (error) { state.dataSource = 'local'; console.warn('[Accounting] remote save failed', error); toast('Accounting saved locally. Run Accounting SQL migration to enable Supabase sync.'); }
    saveLocal();
  }

  function accountById(id) { return state.accounts.find(account => account.id === id) || null; }
  function accountByCode(code) { return state.accounts.find(account => String(account.account_code) === String(code)) || null; }
  function requiredAccount(code, label) {
    const account = accountByCode(code);
    if (!account) toast(`Missing account ${code} ${label || ''}. Run Accounting SQL migration.`);
    return account;
  }
  function defaultBankAccount() { return state.bankAccounts.find(b => b.is_active !== false && b.linked_account_id) || state.bankAccounts.find(b => b.is_active !== false) || state.bankAccounts[0] || null; }
  function bankLedgerAccount() { return accountById(defaultBankAccount()?.linked_account_id) || requiredAccount('1200', 'Bank Account'); }
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
  function nextJournalNo(prefix = 'AJ') {
    const year = new Date().getFullYear();
    const max = state.journals.reduce((acc, row) => {
      const match = String(row.journal_no || '').match(/(\d+)$/);
      return Math.max(acc, match ? Number(match[1]) : 0);
    }, 0);
    return `${prefix}/${year}/${String(max + 1).padStart(4, '0')}`;
  }

  function journalLinesFor(journalId) {
    return state.journalLines.filter(line => line.journal_id === journalId).sort((a,b) => num(a.line_no) - num(b.line_no));
  }

  function filteredLedgerEntries() {
    return state.ledgerEntries.filter(entry => {
      if (state.filters.ledgerAccountId !== 'all' && entry.account_id !== state.filters.ledgerAccountId) return false;
      if (state.filters.ledgerSource !== 'all' && norm(entry.source_module) !== state.filters.ledgerSource) return false;
      if (state.filters.ledgerFrom && String(entry.entry_date || '').slice(0,10) < state.filters.ledgerFrom) return false;
      if (state.filters.ledgerTo && String(entry.entry_date || '').slice(0,10) > state.filters.ledgerTo) return false;
      return true;
    }).sort((a,b) => String(b.entry_date || '').localeCompare(String(a.entry_date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  function dateKey(value) { return value ? String(value).slice(0, 10) : ''; }
  function reportAsOf() { return state.filters.reportAsOf || state.filters.reportTo || today(); }
  function reportFrom() { return state.filters.reportFrom || ''; }
  function reportTo() { return state.filters.reportTo || reportAsOf(); }
  function inReportRange(dateValue) {
    const date = dateKey(dateValue);
    if (reportFrom() && date < reportFrom()) return false;
    if (reportTo() && date > reportTo()) return false;
    return true;
  }
  function upToAsOf(dateValue) {
    const date = dateKey(dateValue);
    return !reportAsOf() || !date || date <= reportAsOf();
  }
  function daysBetween(start, end) {
    const a = new Date(`${dateKey(start)}T00:00:00`);
    const b = new Date(`${dateKey(end)}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.floor((b - a) / 86400000);
  }
  function periodLedgerEntries() { return state.ledgerEntries.filter(entry => inReportRange(entry.entry_date)); }
  function asOfLedgerEntries() { return state.ledgerEntries.filter(entry => upToAsOf(entry.entry_date)); }
  function accountNaturalBalance(account, debit, credit) {
    const naturalCredit = ['liability', 'equity', 'revenue'].includes(norm(account.account_type));
    return num(account.opening_balance) + (naturalCredit ? num(credit) - num(debit) : num(debit) - num(credit));
  }
  function ledgerByAccountFor(entries, includeOpening = true) {
    const map = new Map();
    state.accounts.forEach(account => map.set(account.id, { account, debit: 0, credit: 0, balance: includeOpening ? num(account.opening_balance) : 0 }));
    entries.forEach(entry => {
      const account = accountById(entry.account_id) || { id: entry.account_id, account_code: entry.account_code, account_name: entry.account_name, account_type: 'Asset', currency: entry.currency || 'USD', opening_balance: 0 };
      const row = map.get(entry.account_id) || { account, debit: 0, credit: 0, balance: includeOpening ? num(account.opening_balance) : 0 };
      row.debit += num(entry.debit);
      row.credit += num(entry.credit);
      const baseOpening = includeOpening ? num(account.opening_balance) : 0;
      const naturalCredit = ['liability', 'equity', 'revenue'].includes(norm(account.account_type));
      row.balance = baseOpening + (naturalCredit ? row.credit - row.debit : row.debit - row.credit);
      map.set(entry.account_id, row);
    });
    return [...map.values()].sort((a,b) => String(a.account.account_code || '').localeCompare(String(b.account.account_code || '')));
  }
  function reportRowsByAccountTypes(types, entries = periodLedgerEntries(), includeOpening = false) {
    const allowed = new Set(types.map(t => norm(t)));
    return ledgerByAccountFor(entries, includeOpening).filter(row => allowed.has(norm(row.account.account_type)) && (Math.abs(row.debit) > 0.004 || Math.abs(row.credit) > 0.004 || Math.abs(row.balance) > 0.004));
  }
  function reportSearchText() { return norm(state.filters.reportSearch); }
  function rowMatchesReportSearch(row, fields) {
    const search = reportSearchText();
    if (!search) return true;
    return norm(fields.map(key => row?.[key] ?? '').join(' ')).includes(search);
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
    const bankCash = ledgerRows.filter(row => ['1100','1200'].includes(String(row.account.account_code))).reduce((sum,row) => sum + num(row.balance), 0) || state.bankAccounts.filter(b => b.is_active !== false).reduce((sum,b) => sum + num(b.current_balance ?? b.opening_balance), 0);
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
          <h2>Accounting Workspace</h2>
          <p class="muted">Admin-only accounting with Phase 3 financial reports, source sync, ledger controls, and bank/cash tracking.</p>
        </div>
        <div class="accounting-actions">
          ${sourceChip()}
          <button class="btn ghost sm" type="button" data-accounting-action="refresh">Refresh</button>
          <button class="btn sm" type="button" data-accounting-action="export-ledger">Export Ledger CSV</button>
        </div>
      </div>
      <div class="accounting-tabs" role="tablist">
        ${[
          ['dashboard','Dashboard'],['accounts','Chart of Accounts'],['integrations','Module Sync'],['journals','Journal Entries'],['ledger','General Ledger'],['bank','Bank & Cash'],['reports','Financial Reports']
        ].map(([key,label]) => `<button class="accounting-tab ${state.activeTab === key ? 'active' : ''}" type="button" data-accounting-tab="${key}">${label}</button>`).join('')}
      </div>
      ${content}
    `;
  }

  function renderDashboard() {
    const m = dashboardMetrics();
    const sourceStats = getSourceStats();
    const recentJournals = state.journals.slice().sort((a,b) => String(b.entry_date || '').localeCompare(String(a.entry_date || ''))).slice(0, 6);
    return `
      <div class="accounting-grid">
        <div class="accounting-kpi"><div class="label">Total Accounts</div><div class="value">${state.accounts.length}</div><div class="hint">Chart of accounts</div></div>
        <div class="accounting-kpi"><div class="label">Bank / Cash Balance</div><div class="value">${money(m.bankCash)}</div><div class="hint">From ledger bank/cash accounts</div></div>
        <div class="accounting-kpi"><div class="label">Posted Journals</div><div class="value">${m.posted}</div><div class="hint">Posted or locked entries</div></div>
        <div class="accounting-kpi"><div class="label">Unposted Sources</div><div class="value">${sourceStats.unposted}</div><div class="hint">Invoices, receipts, payroll, payables</div></div>
        <div class="accounting-kpi"><div class="label">Revenue</div><div class="value">${money(m.revenue)}</div><div class="hint">Posted ledger revenue</div></div>
        <div class="accounting-kpi"><div class="label">Expenses</div><div class="value">${money(m.expense)}</div><div class="hint">Posted ledger expenses</div></div>
        <div class="accounting-kpi"><div class="label">Net Profit</div><div class="value">${money(m.netProfit)}</div><div class="hint">Revenue minus expenses</div></div>
        <div class="accounting-kpi"><div class="label">Trial Balance</div><div class="value">${Math.abs(m.totalDebit - m.totalCredit) < 0.01 ? 'Balanced' : 'Mismatch'}</div><div class="hint">Debit ${money(m.totalDebit)} · Credit ${money(m.totalCredit)}</div></div>
      </div>
      <div class="accounting-source-grid" style="margin-top:12px;">
        ${renderSourceMiniCard('Invoices', sourceStats.invoices)}
        ${renderSourceMiniCard('Receipts', sourceStats.receipts)}
        ${renderSourceMiniCard('Credit Notes', sourceStats.credit_notes)}
        ${renderSourceMiniCard('Biners', sourceStats.biners)}
        ${renderSourceMiniCard('HR Payroll', sourceStats.hr_payroll)}
        ${renderSourceMiniCard('Salary Receipts', sourceStats.hr_salary_receipts)}
      </div>
      <div class="accounting-card" style="margin-top:12px;">
        <div class="accounting-card-header"><div><h3>Recent Journal Entries</h3><p class="muted">Latest accounting activity.</p></div><button class="btn sm" data-accounting-tab="integrations" type="button">Review Source Sync</button></div>
        ${renderJournalTable(recentJournals, true)}
      </div>
    `;
  }

  function renderSourceMiniCard(label, stats) {
    return `<div class="accounting-mini-card"><div class="label">${esc(label)}</div><div class="value">${stats?.posted || 0}/${stats?.total || 0}</div><div class="hint">Posted / total</div></div>`;
  }

  function getSourceStats() {
    const groups = {
      invoices: getSourceRows('invoices'), receipts: getSourceRows('receipts'), credit_notes: getSourceRows('credit_notes'),
      biners: getSourceRows('biners_payables').concat(getSourceRows('biners_payments')),
      hr_payroll: getSourceRows('hr_payroll'), hr_salary_receipts: getSourceRows('hr_salary_receipts')
    };
    const stats = { unposted: 0 };
    Object.keys(groups).forEach(key => {
      const rows = groups[key];
      const posted = rows.filter(row => row.posted).length;
      stats[key] = { total: rows.length, posted, unposted: rows.length - posted };
      stats.unposted += rows.length - posted;
    });
    return stats;
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
            <div class="accounting-toolbar wide"><button class="btn" type="submit">Save Account</button><button class="btn ghost" type="button" data-accounting-action="reset-account-form">Clear</button></div>
          </form>
        </div>
      </div>
    `;
  }

  function renderAccountsTable(rows = state.accounts) {
    const sorted = rows.slice().sort((a,b) => String(a.account_code || '').localeCompare(String(b.account_code || '')));
    if (!sorted.length) return '<div class="accounting-empty">No accounts yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Currency</th><th>Status</th><th class="num">Opening</th><th>Actions</th></tr></thead><tbody>${sorted.map(row => `
      <tr><td><strong>${esc(row.account_code)}</strong></td><td>${esc(row.account_name)}</td><td>${esc(row.account_type)}</td><td>${esc(row.currency || 'USD')}</td><td><span class="accounting-badge">${row.is_active === false ? 'Inactive' : 'Active'}</span></td><td class="num">${money(row.opening_balance, row.currency)}</td><td><button class="btn ghost sm" type="button" data-accounting-edit-account="${esc(row.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderBank() {
    return `
      <div class="accounting-two-col">
        <div class="accounting-card">
          <div class="accounting-card-header"><div><h3>Bank & Cash Accounts</h3><p class="muted">Receipts and salary payments post to the linked GL account.</p></div></div>
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
        <div class="accounting-card"><h3>${state.editingJournalId ? 'Edit Journal' : 'New Journal'}</h3>${renderJournalForm()}</div>
      </div>
    `;
  }

  function renderJournalTable(rows, compact = false) {
    if (!rows.length) return '<div class="accounting-empty">No journal entries yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>No.</th><th>Date</th><th>Description</th><th>Source</th><th>Status</th><th class="num">Debit</th><th class="num">Credit</th>${compact ? '' : '<th>Actions</th>'}</tr></thead><tbody>${rows.map(row => `<tr>
      <td><strong>${esc(row.journal_no)}</strong></td><td>${fmtDate(row.entry_date)}</td><td>${esc(row.description || '—')}<div class="muted">${esc(row.reference_no || '')}</div></td><td>${esc(row.source_module || 'manual')}</td><td><span class="accounting-badge ${esc(norm(row.status || 'draft'))}">${esc(row.status || 'Draft')}</span></td><td class="num">${money(row.total_debit,row.currency || 'USD')}</td><td class="num">${money(row.total_credit,row.currency || 'USD')}</td>${compact ? '' : `<td><button class="btn ghost sm" type="button" data-accounting-edit-journal="${esc(row.id)}">Edit</button> <button class="btn sm" type="button" data-accounting-post-journal="${esc(row.id)}">Post</button> <button class="btn ghost sm" type="button" data-accounting-delete-journal="${esc(row.id)}">Delete</button></td>`}</tr>`).join('')}</tbody></table></div>`;
  }

  function currentDraftLines() {
    if (!state.journalLinesDraft.length) state.journalLinesDraft = [{ account_id:'', debit:'', credit:'', description:'' }, { account_id:'', debit:'', credit:'', description:'' }];
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
      <div class="accounting-journal-totals"><span class="accounting-total-pill">Debit ${money(debit)}</span><span class="accounting-total-pill">Credit ${money(credit)}</span><span class="accounting-total-pill ${balanced ? 'ok':'bad'}">${balanced ? 'Balanced':'Not Balanced'}</span></div>
      <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="save-journal-draft">Save Draft</button><button class="btn" type="button" data-accounting-action="post-journal-form">Post Journal</button><button class="btn ghost" type="button" data-accounting-action="reset-journal-form">Clear</button></div>
    </form>`;
  }

  function renderLedger() {
    const rows = filteredLedgerEntries();
    const sourceOptions = ['all', ...new Set(state.ledgerEntries.map(e => norm(e.source_module || 'manual_journal')).filter(Boolean))];
    return `<div class="accounting-card">
      <div class="accounting-card-header"><div><h3>General Ledger</h3><p class="muted">Posted manual journals and synced module transactions.</p></div></div>
      <div class="accounting-form-grid">
        <label class="accounting-field">Account<select id="accountingLedgerAccountFilter"><option value="all">All accounts</option>${accountOptions(state.filters.ledgerAccountId, false)}</select></label>
        <label class="accounting-field">Source<select id="accountingLedgerSourceFilter">${sourceOptions.map(s => `<option value="${esc(s)}" ${state.filters.ledgerSource === s ? 'selected':''}>${s === 'all' ? 'All sources' : esc(s)}</option>`).join('')}</select></label>
        <label class="accounting-field">From<input type="date" id="accountingLedgerFrom" value="${esc(state.filters.ledgerFrom)}" /></label>
        <label class="accounting-field">To<input type="date" id="accountingLedgerTo" value="${esc(state.filters.ledgerTo)}" /></label>
        <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="clear-ledger-filters">Clear</button></div>
      </div>
      ${renderLedgerTable(rows)}
    </div>`;
  }

  function renderLedgerTable(rows) {
    if (!rows.length) return '<div class="accounting-empty">No ledger entries match the filters.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Journal</th><th>Account</th><th>Description</th><th>Source</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.entry_date)}</td><td><strong>${esc(row.journal_no || '')}</strong><div class="muted">${esc(row.reference_no || '')}</div></td><td>${esc(row.account_code)} · ${esc(row.account_name)}</td><td>${esc(row.description || '')}</td><td>${esc(row.source_module || 'manual')}<div class="muted">${esc(row.source_reference || '')}</div></td><td class="num">${row.debit ? money(row.debit,row.currency) : '—'}</td><td class="num">${row.credit ? money(row.credit,row.currency) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function reportTabLabel(key) {
    return ({ trial_balance:'Trial Balance', profit_loss:'Profit & Loss', balance_sheet:'Balance Sheet', cash_flow:'Cash Flow', ar_aging:'AR Aging', ap_aging:'AP Aging', customer_statement:'Customer Statement', vendor_statement:'Vendor Statement', payroll_expense:'Payroll Expense' })[key] || key;
  }

  function renderReportFilters() {
    return `<div class="accounting-report-controls">
      <div class="accounting-tabs compact">${REPORT_TABS.map(key => `<button class="accounting-tab ${state.activeReportTab === key ? 'active':''}" type="button" data-accounting-report-tab="${esc(key)}">${esc(reportTabLabel(key))}</button>`).join('')}</div>
      <div class="accounting-form-grid" style="margin-top:10px;">
        <label class="accounting-field">From<input type="date" id="accountingReportFrom" value="${esc(state.filters.reportFrom)}" /></label>
        <label class="accounting-field">To<input type="date" id="accountingReportTo" value="${esc(state.filters.reportTo)}" /></label>
        <label class="accounting-field">As of<input type="date" id="accountingReportAsOf" value="${esc(reportAsOf())}" /></label>
        <label class="accounting-field">Search<input id="accountingReportSearch" value="${esc(state.filters.reportSearch)}" placeholder="client, vendor, employee, account, reference" /></label>
        <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="clear-report-filters">Clear</button><button class="btn ghost" type="button" data-accounting-action="print-report">Print</button><button class="btn" type="button" data-accounting-action="export-report">Export Report CSV</button></div>
      </div>
    </div>`;
  }

  function renderReports() {
    const body = state.activeReportTab === 'trial_balance' ? renderTrialBalanceReport()
      : state.activeReportTab === 'profit_loss' ? renderProfitLossReport()
      : state.activeReportTab === 'balance_sheet' ? renderBalanceSheetReport()
      : state.activeReportTab === 'cash_flow' ? renderCashFlowReport()
      : state.activeReportTab === 'ar_aging' ? renderArAgingReport()
      : state.activeReportTab === 'ap_aging' ? renderApAgingReport()
      : state.activeReportTab === 'customer_statement' ? renderCustomerStatementReport()
      : state.activeReportTab === 'vendor_statement' ? renderVendorStatementReport()
      : state.activeReportTab === 'payroll_expense' ? renderPayrollExpenseReport()
      : renderTrialBalanceReport();
    return `<div class="accounting-card accounting-report-card"><div class="accounting-card-header"><div><h3>Financial Reports</h3><p class="muted">Reports are built from posted ledger entries and synced source data.</p></div><span class="accounting-chip">${esc(reportTabLabel(state.activeReportTab))}</span></div>${renderReportFilters()}<div id="accountingPrintableReport" class="accounting-print-area">${body}</div></div>`;
  }

  function renderTrialBalanceReport() {
    const rows = ledgerByAccountFor(periodLedgerEntries(), true).filter(row => Math.abs(row.debit) > 0.004 || Math.abs(row.credit) > 0.004 || Math.abs(row.balance) > 0.004);
    const debit = rows.reduce((sum,row) => sum + num(row.debit), 0);
    const credit = rows.reduce((sum,row) => sum + num(row.credit), 0);
    const visible = rows.filter(row => rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name} ${row.account.account_type}` }, ['text']));
    return `<div class="accounting-report-title"><h3>Trial Balance</h3><p>Period: ${esc(reportFrom() || 'Start')} to ${esc(reportTo())}</p><span class="accounting-total-pill ${Math.abs(debit-credit)<0.01?'ok':'bad'}">Difference ${money(debit-credit)}</span></div>${reportTable(['Account','Type','Debit','Credit','Balance'], visible.map(row => [accountCell(row.account), row.account.account_type, money(row.debit,row.account.currency), money(row.credit,row.account.currency), money(row.balance,row.account.currency)]), [2,3,4])}`;
  }

  function renderProfitLossReport() {
    const revenueRows = reportRowsByAccountTypes(['Revenue'], periodLedgerEntries(), false).filter(row => rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name}` }, ['text']));
    const expenseRows = reportRowsByAccountTypes(['Expense'], periodLedgerEntries(), false).filter(row => rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name}` }, ['text']));
    const revenue = revenueRows.reduce((sum,row) => sum + num(row.credit) - num(row.debit), 0);
    const expense = expenseRows.reduce((sum,row) => sum + num(row.debit) - num(row.credit), 0);
    const net = revenue - expense;
    return `<div class="accounting-report-title"><h3>Profit & Loss</h3><p>Period: ${esc(reportFrom() || 'Start')} to ${esc(reportTo())}</p><span class="accounting-total-pill ${net >= 0 ? 'ok':'bad'}">Net Profit ${money(net)}</span></div>
      <div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">Revenue</div><div class="value">${money(revenue)}</div></div><div class="accounting-kpi"><div class="label">Expenses</div><div class="value">${money(expense)}</div></div><div class="accounting-kpi"><div class="label">Net Profit</div><div class="value">${money(net)}</div></div></div>
      <h4>Revenue</h4>${reportTable(['Account','Debit','Credit','Revenue Balance'], revenueRows.map(row => [accountCell(row.account), money(row.debit,row.account.currency), money(row.credit,row.account.currency), money(num(row.credit)-num(row.debit), row.account.currency)]), [1,2,3])}
      <h4>Expenses</h4>${reportTable(['Account','Debit','Credit','Expense Balance'], expenseRows.map(row => [accountCell(row.account), money(row.debit,row.account.currency), money(row.credit,row.account.currency), money(num(row.debit)-num(row.credit), row.account.currency)]), [1,2,3])}`;
  }

  function renderBalanceSheetReport() {
    const rows = ledgerByAccountFor(asOfLedgerEntries(), true);
    const assets = rows.filter(row => norm(row.account.account_type) === 'asset' && rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name}` }, ['text']));
    const liabilities = rows.filter(row => norm(row.account.account_type) === 'liability' && rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name}` }, ['text']));
    const equity = rows.filter(row => norm(row.account.account_type) === 'equity' && rowMatchesReportSearch({ text:`${row.account.account_code} ${row.account.account_name}` }, ['text']));
    const rev = rows.filter(row => norm(row.account.account_type) === 'revenue').reduce((sum,row)=>sum+num(row.balance),0);
    const exp = rows.filter(row => norm(row.account.account_type) === 'expense').reduce((sum,row)=>sum+num(row.balance),0);
    const currentEarnings = rev - exp;
    const assetTotal = assets.reduce((sum,row)=>sum+num(row.balance),0);
    const liabilityTotal = liabilities.reduce((sum,row)=>sum+num(row.balance),0);
    const equityTotal = equity.reduce((sum,row)=>sum+num(row.balance),0) + currentEarnings;
    return `<div class="accounting-report-title"><h3>Balance Sheet</h3><p>As of ${esc(reportAsOf())}</p><span class="accounting-total-pill ${Math.abs(assetTotal - liabilityTotal - equityTotal) < 0.01 ? 'ok':'bad'}">Check ${money(assetTotal - liabilityTotal - equityTotal)}</span></div>
      <div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">Assets</div><div class="value">${money(assetTotal)}</div></div><div class="accounting-kpi"><div class="label">Liabilities</div><div class="value">${money(liabilityTotal)}</div></div><div class="accounting-kpi"><div class="label">Equity + Earnings</div><div class="value">${money(equityTotal)}</div></div></div>
      <h4>Assets</h4>${reportTable(['Account','Balance'], assets.map(row => [accountCell(row.account), money(row.balance,row.account.currency)]), [1])}
      <h4>Liabilities</h4>${reportTable(['Account','Balance'], liabilities.map(row => [accountCell(row.account), money(row.balance,row.account.currency)]), [1])}
      <h4>Equity</h4>${reportTable(['Account','Balance'], equity.map(row => [accountCell(row.account), money(row.balance,row.account.currency)]).concat([['Current Earnings (calculated)', money(currentEarnings)]]), [1])}`;
  }

  function renderCashFlowReport() {
    const bankCodes = new Set(['1100','1200']);
    const rows = periodLedgerEntries().filter(entry => bankCodes.has(String(entry.account_code || accountById(entry.account_id)?.account_code || '')));
    const map = new Map();
    rows.forEach(entry => {
      const key = entry.source_module || 'manual_journal';
      const row = map.get(key) || { source:key, inflow:0, outflow:0, net:0 };
      row.inflow += num(entry.debit);
      row.outflow += num(entry.credit);
      row.net = row.inflow - row.outflow;
      map.set(key,row);
    });
    const grouped = [...map.values()].filter(row => rowMatchesReportSearch(row, ['source']));
    const inflow = grouped.reduce((s,r)=>s+r.inflow,0), outflow = grouped.reduce((s,r)=>s+r.outflow,0);
    return `<div class="accounting-report-title"><h3>Cash Flow</h3><p>Period: ${esc(reportFrom() || 'Start')} to ${esc(reportTo())}</p><span class="accounting-total-pill ${inflow-outflow >= 0 ? 'ok':'bad'}">Net Cash ${money(inflow-outflow)}</span></div>${reportTable(['Source','Cash In','Cash Out','Net'], grouped.map(row => [sourceLabel(row.source) || row.source, money(row.inflow), money(row.outflow), money(row.net)]), [1,2,3])}`;
  }

  function sourceRefFields(row) {
    return [row.invoice_number,row.invoice_no,row.invoice_id,row.receipt_number,row.receipt_no,row.receipt_id,row.credit_note_number,row.credit_note_no,row.reference_no,row.linked_invoice_no,row.related_invoice_no,row.invoice_reference,row.notes,row.description].filter(Boolean).map(String);
  }
  function sourceMatchesReference(row, reference) {
    const ref = norm(reference);
    if (!ref) return false;
    return sourceRefFields(row).some(value => norm(value) === ref || norm(value).includes(ref));
  }
  function agingBucket(days) {
    if (days <= 0) return 'current';
    if (days <= 30) return '1_30';
    if (days <= 60) return '31_60';
    if (days <= 90) return '61_90';
    return '90_plus';
  }
  function emptyAgingTotals() { return { current:0, '1_30':0, '31_60':0, '61_90':0, '90_plus':0 }; }

  function arAgingRows() {
    const asOf = reportAsOf();
    const rows = state.sources.invoices.map(invoice => {
      const ref = sourceReference('invoices', invoice);
      const amount = sourceAmount('invoices', invoice);
      const receipts = state.sources.receipts.filter(row => sourceMatchesReference(row, ref)).reduce((sum,row) => sum + sourceAmount('receipts', row), 0);
      const credits = state.sources.creditNotes.filter(row => sourceMatchesReference(row, ref)).reduce((sum,row) => sum + sourceAmount('credit_notes', row), 0);
      const outstanding = amount - receipts - credits;
      const due = dateKey(invoice.due_date || invoice.payment_due_date || invoice.due_at || sourceDate('invoices', invoice));
      const days = daysBetween(due, asOf);
      return { reference: ref || invoice.id, client: sourceCounterparty('invoices', invoice), date: dateKey(sourceDate('invoices', invoice)), due, amount, paid: receipts, credited: credits, outstanding, days, bucket: agingBucket(days), currency: sourceCurrency(invoice) };
    }).filter(row => row.outstanding > 0.01 && rowMatchesReportSearch(row, ['reference','client']));
    return rows.sort((a,b)=>b.days-a.days);
  }

  function renderArAgingReport() {
    const rows = arAgingRows();
    const totals = emptyAgingTotals(); rows.forEach(row => totals[row.bucket] += row.outstanding);
    const total = rows.reduce((s,r)=>s+r.outstanding,0);
    return `<div class="accounting-report-title"><h3>Accounts Receivable Aging</h3><p>As of ${esc(reportAsOf())}</p><span class="accounting-total-pill">Outstanding ${money(total)}</span></div>${agingCards(totals)}${reportTable(['Invoice','Client','Invoice Date','Due Date','Days','Original','Paid/Credited','Outstanding'], rows.map(row => [row.reference,row.client,fmtDate(row.date),fmtDate(row.due),String(Math.max(row.days,0)),money(row.amount,row.currency),money(row.paid+row.credited,row.currency),money(row.outstanding,row.currency)]), [4,5,6,7])}`;
  }

  function apAgingRows() {
    const asOf = reportAsOf();
    const biners = state.sources.binersSchedules.map(row => {
      const amount = sourceAmount('biners_payables', row);
      const paid = sourceAmount('biners_payments', row);
      const outstanding = amount - paid;
      const due = dateKey(row.due_date || sourceDate('biners_payables', row));
      const days = daysBetween(due, asOf);
      return { reference: sourceReference('biners_payables', row), vendor: sourceCounterparty('biners_payables', row), type:'Biners', due, amount, paid, outstanding, days, bucket: agingBucket(days), currency: sourceCurrency(row) };
    }).filter(row => row.outstanding > 0.01);
    const salaryReceipts = state.sources.salaryReceipts;
    const payroll = state.sources.payrollItems.map(item => {
      const employee = employeeName(item.employee_id);
      const amount = sourceAmount('hr_payroll', item);
      const keyMonth = dateKey(item.payroll_month || item.month || item.created_at).slice(0,7);
      const paid = salaryReceipts.filter(r => String(r.employee_id || '') === String(item.employee_id || '') && (!keyMonth || dateKey(r.payment_date || r.created_at).slice(0,7) === keyMonth)).reduce((sum,r)=>sum+sourceAmount('hr_salary_receipts', r),0);
      const outstanding = amount - paid;
      const due = dateKey(item.payment_due_date || item.payroll_month || item.created_at);
      const days = daysBetween(due, asOf);
      return { reference: sourceReference('hr_payroll', item), vendor: employee, type:'Payroll', due, amount, paid, outstanding, days, bucket: agingBucket(days), currency: sourceCurrency(item) };
    }).filter(row => row.outstanding > 0.01);
    return biners.concat(payroll).filter(row => rowMatchesReportSearch(row, ['reference','vendor','type'])).sort((a,b)=>b.days-a.days);
  }

  function renderApAgingReport() {
    const rows = apAgingRows();
    const totals = emptyAgingTotals(); rows.forEach(row => totals[row.bucket] += row.outstanding);
    const total = rows.reduce((s,r)=>s+r.outstanding,0);
    return `<div class="accounting-report-title"><h3>Accounts Payable Aging</h3><p>As of ${esc(reportAsOf())}</p><span class="accounting-total-pill">Outstanding ${money(total)}</span></div>${agingCards(totals)}${reportTable(['Reference','Vendor / Employee','Type','Due Date','Days','Original','Paid','Outstanding'], rows.map(row => [row.reference,row.vendor,row.type,fmtDate(row.due),String(Math.max(row.days,0)),money(row.amount,row.currency),money(row.paid,row.currency),money(row.outstanding,row.currency)]), [4,5,6,7])}`;
  }

  function agingCards(totals) {
    return `<div class="accounting-source-grid" style="margin:12px 0;">${[['current','Current'],['1_30','1-30'],['31_60','31-60'],['61_90','61-90'],['90_plus','90+']].map(([key,label]) => `<div class="accounting-mini-card"><div class="label">${label}</div><div class="value">${money(totals[key] || 0)}</div></div>`).join('')}</div>`;
  }

  function renderCustomerStatementReport() {
    return renderStatementReport('1300', 'Customer Statement', 'Accounts Receivable', row => num(row.debit) - num(row.credit));
  }
  function renderVendorStatementReport() {
    return renderStatementReport('2100', 'Vendor Statement', 'Accounts Payable', row => num(row.credit) - num(row.debit));
  }
  function renderStatementReport(accountCode, title, accountName, movementFn) {
    let balance = 0;
    const rows = periodLedgerEntries().filter(entry => String(entry.account_code || accountById(entry.account_id)?.account_code || '') === accountCode).sort((a,b)=>String(a.entry_date||'').localeCompare(String(b.entry_date||''))).map(entry => {
      balance += movementFn(entry);
      return { date: dateKey(entry.entry_date), journal: entry.journal_no, name: entry.source_label || entry.source_reference || entry.reference_no || '', reference: entry.reference_no || entry.source_reference || '', description: entry.description || '', debit: num(entry.debit), credit: num(entry.credit), balance, currency: entry.currency || 'USD' };
    }).filter(row => rowMatchesReportSearch(row, ['journal','name','reference','description']));
    return `<div class="accounting-report-title"><h3>${esc(title)}</h3><p>${esc(accountName)} · Period: ${esc(reportFrom() || 'Start')} to ${esc(reportTo())}</p><span class="accounting-total-pill">Ending Balance ${money(rows.length ? rows[rows.length-1].balance : 0)}</span></div>${reportTable(['Date','Journal','Name','Reference','Description','Debit','Credit','Running Balance'], rows.map(row => [fmtDate(row.date),row.journal,row.name,row.reference,row.description,money(row.debit,row.currency),money(row.credit,row.currency),money(row.balance,row.currency)]), [5,6,7])}`;
  }

  function renderPayrollExpenseReport() {
    const rows = state.sources.payrollItems.map(item => {
      const employee = employeeName(item.employee_id);
      const payrollMonth = dateKey(item.payroll_month || item.month || item.created_at).slice(0,7) || dateKey(item.created_at).slice(0,7);
      const gross = num(item.gross_salary ?? item.basic_salary ?? item.monthly_salary ?? item.net_salary);
      const net = sourceAmount('hr_payroll', item);
      const paid = state.sources.salaryReceipts.filter(r => String(r.employee_id || '') === String(item.employee_id || '') && (!payrollMonth || dateKey(r.payment_date || r.created_at).slice(0,7) === payrollMonth)).reduce((sum,r)=>sum+sourceAmount('hr_salary_receipts', r),0);
      return { employee, payrollMonth, gross, net, paid, rest: net - paid, status: item.status || item.payroll_status || '', currency: sourceCurrency(item) };
    }).filter(row => (!reportFrom() || `${row.payrollMonth}-01` >= reportFrom()) && (!reportTo() || `${row.payrollMonth}-01` <= reportTo()) && rowMatchesReportSearch(row, ['employee','payrollMonth','status']));
    const net = rows.reduce((s,r)=>s+r.net,0), paid = rows.reduce((s,r)=>s+r.paid,0);
    return `<div class="accounting-report-title"><h3>Payroll Expense Report</h3><p>Period: ${esc(reportFrom() || 'Start')} to ${esc(reportTo())}</p><span class="accounting-total-pill">Net Payroll ${money(net)}</span><span class="accounting-total-pill">Paid ${money(paid)}</span><span class="accounting-total-pill ${net-paid <= 0.01 ? 'ok':'bad'}">Rest ${money(net-paid)}</span></div>${reportTable(['Employee','Month','Gross Salary','Net Salary','Paid','Rest','Status'], rows.map(row => [row.employee,row.payrollMonth,money(row.gross,row.currency),money(row.net,row.currency),money(row.paid,row.currency),money(row.rest,row.currency),row.status]), [2,3,4,5])}`;
  }

  function accountCell(account) { return `<strong>${esc(account.account_code)}</strong> · ${esc(account.account_name)}`; }
  function reportTable(headers, rows, numericIndexes = []) {
    if (!rows.length) return '<div class="accounting-empty">No report rows match the selected filters.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr>${headers.map((h,i)=>`<th class="${numericIndexes.includes(i)?'num':''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell,i)=>`<td class="${numericIndexes.includes(i)?'num':''}">${String(cell ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function currentReportCsvRows() {
    const clean = value => String(value ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&middot;/g,'·');
    if (state.activeReportTab === 'trial_balance') return ledgerByAccountFor(periodLedgerEntries(), true).map(row => ({ account_code: row.account.account_code, account_name: row.account.account_name, type: row.account.account_type, debit: row.debit, credit: row.credit, balance: row.balance }));
    if (state.activeReportTab === 'profit_loss') return reportRowsByAccountTypes(['Revenue','Expense'], periodLedgerEntries(), false).map(row => ({ account_code: row.account.account_code, account_name: row.account.account_name, type: row.account.account_type, debit: row.debit, credit: row.credit, balance: row.balance }));
    if (state.activeReportTab === 'balance_sheet') return ledgerByAccountFor(asOfLedgerEntries(), true).filter(row => ['asset','liability','equity'].includes(norm(row.account.account_type))).map(row => ({ account_code: row.account.account_code, account_name: row.account.account_name, type: row.account.account_type, balance: row.balance }));
    if (state.activeReportTab === 'cash_flow') return periodLedgerEntries().filter(entry => ['1100','1200'].includes(String(entry.account_code || accountById(entry.account_id)?.account_code || ''))).map(entry => ({ date: entry.entry_date, source: entry.source_module, reference: entry.reference_no, debit_cash_in: entry.debit, credit_cash_out: entry.credit, description: entry.description }));
    if (state.activeReportTab === 'ar_aging') return arAgingRows();
    if (state.activeReportTab === 'ap_aging') return apAgingRows();
    if (state.activeReportTab === 'payroll_expense') return state.sources.payrollItems.map(item => ({ employee: employeeName(item.employee_id), month: dateKey(item.payroll_month || item.month || item.created_at).slice(0,7), net_salary: sourceAmount('hr_payroll', item), status: item.status || item.payroll_status || '' }));
    const code = state.activeReportTab === 'vendor_statement' ? '2100' : '1300';
    return periodLedgerEntries().filter(entry => String(entry.account_code || accountById(entry.account_id)?.account_code || '') === code).map(entry => ({ date: entry.entry_date, journal: entry.journal_no, name: entry.source_label, reference: entry.reference_no || entry.source_reference, debit: entry.debit, credit: entry.credit, description: entry.description }));
  }

  function printCurrentReport() {
    document.body.classList.add('accounting-print-active');
    setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('accounting-print-active'), 250); }, 50);
  }

  function renderIntegrations() {
    const rows = filteredSourceRows(state.activeSourceTab);
    return `<div class="accounting-card">
      <div class="accounting-card-header">
        <div><h3>Module Sync</h3><p class="muted">Admin reviews source records before posting them into accounting. Duplicate posting is blocked by source reference.</p></div>
        <div class="accounting-actions"><button class="btn ghost sm" type="button" data-accounting-action="refresh-sources">Refresh Sources</button><button class="btn sm" type="button" data-accounting-action="sync-visible-sources">Post Visible Unposted</button></div>
      </div>
      <div class="accounting-tabs compact">${POSTABLE_TYPES.map(key => `<button class="accounting-tab ${state.activeSourceTab === key ? 'active':''}" type="button" data-accounting-source-tab="${esc(key)}">${esc(sourceLabel(key))}</button>`).join('')}</div>
      <div class="accounting-form-grid" style="margin-top:10px;">
        <label class="accounting-field">Search<input id="accountingSourceSearch" value="${esc(state.filters.sourceSearch)}" placeholder="invoice #, employee, client, reference" /></label>
        <label class="accounting-field">Status<select id="accountingSourceStatus"><option value="all">All</option><option value="unposted" ${state.filters.sourceStatus==='unposted'?'selected':''}>Unposted only</option><option value="posted" ${state.filters.sourceStatus==='posted'?'selected':''}>Posted only</option></select></label>
        <label class="accounting-field">From<input type="date" id="accountingSourceFrom" value="${esc(state.filters.sourceFrom)}" /></label>
        <label class="accounting-field">To<input type="date" id="accountingSourceTo" value="${esc(state.filters.sourceTo)}" /></label>
        <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="clear-source-filters">Clear</button></div>
      </div>
      ${renderSourceTable(rows, state.activeSourceTab)}
    </div>`;
  }

  function sourceLabel(type) {
    return ({ invoices:'Invoices', receipts:'Receipts', credit_notes:'Credit Notes', biners_payables:'Biners Payables', biners_payments:'Biners Payments', hr_payroll:'HR Payroll', hr_salary_receipts:'Salary Receipts' })[type] || type;
  }

  function employeeName(employeeId) {
    const emp = state.sources.hrEmployees.find(row => String(row.id) === String(employeeId));
    return emp ? (emp.full_name || emp.employee_name || emp.name || emp.email || employeeId) : employeeId;
  }

  function sourceDate(type, row) {
    if (type === 'invoices') return row.issue_date || row.invoice_date || row.created_at;
    if (type === 'receipts') return row.receipt_date || row.payment_date || row.created_at;
    if (type === 'credit_notes') return row.credit_note_date || row.note_date || row.created_at;
    if (type.startsWith('biners')) return row.due_date || row.payment_date || row.created_at;
    if (type === 'hr_payroll') return row.created_at || row.updated_at;
    if (type === 'hr_salary_receipts') return row.payment_date || row.created_at;
    return row.created_at || today();
  }

  function sourceReference(type, row) {
    if (type === 'invoices') return String(row.invoice_number || row.invoice_no || row.invoice_id || row.id || '').trim();
    if (type === 'receipts') return String(row.receipt_number || row.receipt_no || row.receipt_id || row.id || '').trim();
    if (type === 'credit_notes') return String(row.credit_note_number || row.credit_note_no || row.id || '').trim();
    if (type === 'biners_payables') return String(row.schedule_no ? `BINER-PAYABLE-${row.entry_id || row.biners_entry_id || ''}-${row.schedule_no}` : row.id || '').trim();
    if (type === 'biners_payments') return String(row.schedule_no ? `BINER-PAYMENT-${row.entry_id || row.biners_entry_id || ''}-${row.schedule_no}` : row.id || '').trim();
    if (type === 'hr_payroll') return String(row.id || `${row.run_id || ''}-${row.employee_id || ''}`).trim();
    if (type === 'hr_salary_receipts') return String(row.receipt_no || row.receipt_number || row.id || '').trim();
    return String(row.id || row.__acct_key || '').trim();
  }

  function sourceAmount(type, row) {
    if (type === 'invoices') return num(row.invoice_total ?? row.grand_total ?? row.total_amount ?? row.amount_due ?? row.total);
    if (type === 'receipts') return num(row.amount_received ?? row.received_amount ?? row.paid_now ?? row.amount ?? row.total_amount);
    if (type === 'credit_notes') return num(row.credit_amount ?? row.amount ?? row.total_amount ?? row.total);
    if (type === 'biners_payables') return num(row.scheduled_amount ?? row.amount ?? row.gross_payable_amount ?? row.payable_amount);
    if (type === 'biners_payments') return num(row.paid_amount ?? row.amount_paid ?? 0);
    if (type === 'hr_payroll') return num(row.net_salary ?? row.gross_salary ?? row.basic_salary);
    if (type === 'hr_salary_receipts') return num(row.amount ?? row.paid_amount ?? row.received_amount);
    return 0;
  }

  function sourceCounterparty(type, row) {
    if (type === 'invoices') return row.customer_name || row.company_name || row.client_name || row.customer_legal_name || 'Customer';
    if (type === 'receipts') return row.customer_name || row.company_name || row.client_name || row.invoice_number || 'Customer Receipt';
    if (type === 'credit_notes') return row.customer_name || row.company_name || row.client_name || row.invoice_number || 'Credit Note';
    if (type.startsWith('biners')) return row.client_name || row.company_name || row.vendor_name || row.location_name || 'Biners';
    if (type === 'hr_payroll') return employeeName(row.employee_id) || 'Employee Payroll';
    if (type === 'hr_salary_receipts') return employeeName(row.employee_id) || 'Employee Salary Receipt';
    return '—';
  }

  function sourceCurrency(row) { return String(row.currency || row.currency_code || 'USD').toUpperCase(); }

  function postedSource(type, row) {
    const ref = sourceReference(type, row);
    return state.ledgerEntries.some(entry => norm(entry.source_module) === norm(type) && String(entry.source_reference || '') === ref);
  }

  function getSourceRows(type) {
    const map = {
      invoices: state.sources.invoices,
      receipts: state.sources.receipts,
      credit_notes: state.sources.creditNotes,
      biners_payables: state.sources.binersSchedules.filter(row => sourceAmount('biners_payables', row) > 0),
      biners_payments: state.sources.binersSchedules.filter(row => sourceAmount('biners_payments', row) > 0),
      hr_payroll: state.sources.payrollItems,
      hr_salary_receipts: state.sources.salaryReceipts
    };
    return (map[type] || []).map(row => ({ ...row, posted: postedSource(type, row) }));
  }

  function filteredSourceRows(type) {
    const search = norm(state.filters.sourceSearch);
    return getSourceRows(type).filter(row => {
      const date = String(sourceDate(type,row) || '').slice(0,10);
      const haystack = norm([sourceReference(type,row), sourceCounterparty(type,row), row.invoice_number, row.receipt_no, row.status, row.notes].join(' '));
      if (search && !haystack.includes(search)) return false;
      if (state.filters.sourceStatus === 'posted' && !row.posted) return false;
      if (state.filters.sourceStatus === 'unposted' && row.posted) return false;
      if (state.filters.sourceFrom && date < state.filters.sourceFrom) return false;
      if (state.filters.sourceTo && date > state.filters.sourceTo) return false;
      return sourceAmount(type,row) > 0;
    }).sort((a,b) => String(sourceDate(type,b) || '').localeCompare(String(sourceDate(type,a) || '')));
  }

  function renderSourceTable(rows, type) {
    if (!rows.length) return `<div class="accounting-empty">No ${esc(sourceLabel(type))} records match the filters.</div>`;
    return `<div class="accounting-table-wrap" style="margin-top:12px;"><table class="accounting-table"><thead><tr><th>Reference</th><th>Date</th><th>Client / Employee / Vendor</th><th>Status</th><th class="num">Amount</th><th>Accounting Entry</th><th>Action</th></tr></thead><tbody>${rows.map(row => {
      const posted = row.posted;
      const entryText = describeSourceEntry(type, row);
      return `<tr><td><strong>${esc(sourceReference(type,row) || '—')}</strong><div class="muted">${esc(row.id || row.__acct_key || '')}</div></td><td>${fmtDate(sourceDate(type,row))}</td><td>${esc(sourceCounterparty(type,row))}</td><td><span class="accounting-badge ${posted ? 'posted':'draft'}">${posted ? 'Posted':'Unposted'}</span></td><td class="num">${money(sourceAmount(type,row), sourceCurrency(row))}</td><td>${entryText}</td><td>${posted ? '<span class="muted">Already in ledger</span>' : `<button class="btn sm" type="button" data-accounting-post-source="${esc(type)}" data-source-key="${esc(row.__acct_key)}">Post to Ledger</button>`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function describeSourceEntry(type) {
    const map = {
      invoices: 'Dr Accounts Receivable · Cr SaaS/Setup Revenue',
      receipts: 'Dr Bank/Cash · Cr Accounts Receivable',
      credit_notes: 'Dr Credit Notes Contra Revenue · Cr Accounts Receivable',
      biners_payables: 'Dr Outsourcing Expense · Cr Accounts Payable',
      biners_payments: 'Dr Accounts Payable · Cr Bank/Cash',
      hr_payroll: 'Dr Payroll Expense · Cr Payroll Payable',
      hr_salary_receipts: 'Dr Payroll Payable · Cr Bank/Cash'
    };
    return `<span class="muted">${esc(map[type] || 'Auto ledger entry')}</span>`;
  }

  function sourceByKey(type, key) {
    return getSourceRows(type).find(row => String(row.__acct_key) === String(key));
  }

  function line(account, debit, credit, description) {
    return { account_id: account.id, account_code: account.account_code, account_name: account.account_name, debit: num(debit), credit: num(credit), description: description || account.account_name };
  }

  function sourceLines(type, row) {
    const amount = sourceAmount(type, row);
    const currency = sourceCurrency(row);
    const ar = requiredAccount('1300', 'Accounts Receivable');
    const bank = bankLedgerAccount();
    const revenue = requiredAccount('4100', 'SaaS Revenue');
    const setupRevenue = requiredAccount('4200', 'Setup Fees Revenue');
    const creditContra = requiredAccount('4900', 'Credit Notes / Revenue Contra');
    const ap = requiredAccount('2100', 'Accounts Payable');
    const payrollPayable = requiredAccount('2200', 'Payroll Payable');
    const payrollExpense = requiredAccount('5100', 'Payroll Expense');
    const binersExpense = requiredAccount('5200', 'Outsourcing / Biners Expense');
    if (amount <= 0) return [];
    if (type === 'invoices') {
      const setup = Math.max(0, Math.min(amount, num(row.subtotal_one_time || row.one_time_total || row.setup_total || 0)));
      const saas = Math.max(0, amount - setup);
      const rows = [line(ar, amount, 0, `Invoice ${sourceReference(type,row)} · ${sourceCounterparty(type,row)}`)];
      if (saas > 0) rows.push(line(revenue, 0, saas, `SaaS revenue · ${sourceReference(type,row)}`));
      if (setup > 0) rows.push(line(setupRevenue, 0, setup, `Setup fees revenue · ${sourceReference(type,row)}`));
      return rows;
    }
    if (type === 'receipts') return [line(bank, amount, 0, `Receipt ${sourceReference(type,row)}`), line(ar, 0, amount, `Customer payment · ${sourceReference(type,row)}`)];
    if (type === 'credit_notes') return [line(creditContra, amount, 0, `Credit note ${sourceReference(type,row)}`), line(ar, 0, amount, `Credit note applied · ${sourceReference(type,row)}`)];
    if (type === 'biners_payables') return [line(binersExpense, amount, 0, `Biners payable ${sourceReference(type,row)}`), line(ap, 0, amount, `Biners payable accrued · ${sourceReference(type,row)}`)];
    if (type === 'biners_payments') return [line(ap, amount, 0, `Biners payment ${sourceReference(type,row)}`), line(bank, 0, amount, `Bank/Cash payment · ${sourceReference(type,row)}`)];
    if (type === 'hr_payroll') return [line(payrollExpense, amount, 0, `Payroll expense · ${sourceCounterparty(type,row)}`), line(payrollPayable, 0, amount, `Payroll payable · ${sourceCounterparty(type,row)}`)];
    if (type === 'hr_salary_receipts') return [line(payrollPayable, amount, 0, `Salary receipt ${sourceReference(type,row)}`), line(bank, 0, amount, `Salary paid · ${sourceCounterparty(type,row)}`)];
    return [];
  }

  async function postSource(type, row) {
    if (!row) return toast('Source record not found. Refresh sources and try again.');
    if (postedSource(type, row)) return toast('This source is already posted to the ledger.');
    const lines = sourceLines(type, row).filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
    const amount = sourceAmount(type, row);
    if (lines.length < 2 || amount <= 0) return toast('Unable to build a balanced journal for this source. Check amount and accounts.');
    await postBalancedJournal({
      sourceModule: type,
      sourceTable: sourceTableName(type),
      sourceId: row.id || null,
      sourceReference: sourceReference(type, row),
      sourceLabel: sourceCounterparty(type, row),
      date: String(sourceDate(type, row) || today()).slice(0,10),
      currency: sourceCurrency(row),
      description: `${sourceLabel(type)} sync · ${sourceReference(type,row)} · ${sourceCounterparty(type,row)}`,
      referenceNo: sourceReference(type, row),
      lines
    });
  }

  function sourceTableName(type) {
    return ({ invoices:'invoices', receipts:'receipts', credit_notes:'credit_notes', biners_payables:'biners_payment_schedules', biners_payments:'biners_payment_schedules', hr_payroll:'hr_payroll_items', hr_salary_receipts:'hr_salary_receipts' })[type] || type;
  }

  async function postBalancedJournal({ sourceModule, sourceTable, sourceId, sourceReference, sourceLabel, date, currency, description, referenceNo, lines }) {
    const validLines = lines.filter(l => l.account_id && (num(l.debit) > 0 || num(l.credit) > 0));
    const totalDebit = validLines.reduce((sum,line) => sum + num(line.debit), 0);
    const totalCredit = validLines.reduce((sum,line) => sum + num(line.credit), 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01 || totalDebit <= 0) return toast('Auto journal is not balanced. Posting stopped.');
    const journalId = uid('journal');
    const now = new Date().toISOString();
    const journal = {
      id: journalId, journal_no: nextJournalNo('AS'), entry_date: date || today(), description, reference_no: referenceNo || sourceReference || '', status: 'posted', currency: currency || 'USD',
      total_debit: totalDebit, total_credit: totalCredit, created_by: authName(), posted_by: authName(), posted_at: now, created_at: now, updated_at: now,
      source_module: sourceModule, source_id: isUuid(sourceId) ? sourceId : null, source_reference: sourceReference || '', source_table: sourceTable || '', auto_generated: true
    };
    const journalLines = validLines.map((item, index) => ({
      id: uid('line'), journal_id: journalId, line_no: index + 1, account_id: item.account_id, account_code: item.account_code, account_name: item.account_name,
      debit: num(item.debit), credit: num(item.credit), currency: currency || 'USD', description: item.description || description, created_at: now, updated_at: now
    }));
    const ledgerRows = journalLines.map(item => ({
      id: uid('ledger'), journal_id: journalId, journal_line_id: item.id, journal_no: journal.journal_no, entry_date: journal.entry_date,
      account_id: item.account_id, account_code: item.account_code, account_name: item.account_name, debit: item.debit, credit: item.credit, currency: journal.currency,
      description: item.description || journal.description, reference_no: journal.reference_no, source_module: sourceModule, source_id: isUuid(sourceId) ? sourceId : null,
      source_reference: sourceReference || '', source_table: sourceTable || '', source_label: sourceLabel || '', status: 'posted', synced_at: now, created_at: now, updated_at: now
    }));
    state.journals.push(journal);
    state.journalLines.push(...journalLines);
    state.ledgerEntries.push(...ledgerRows);
    try {
      await upsertRemote(TABLES.journals, journal);
      await upsertRemote(TABLES.journalLines, journalLines);
      await upsertRemote(TABLES.ledgerEntries, ledgerRows);
      state.dataSource = 'supabase';
    } catch (error) {
      console.warn('[Accounting] source post remote failed', error);
      state.dataSource = 'local';
      toast('Posted locally. Run Accounting Phase 2 SQL migration if Supabase rejected source columns.');
    }
    saveLocal();
    toast(`${sourceLabel || sourceModule} posted to ledger.`);
    render();
  }

  async function syncVisibleSources() {
    const rows = filteredSourceRows(state.activeSourceTab).filter(row => !row.posted).slice(0, 50);
    if (!rows.length) return toast('No visible unposted records to sync.');
    for (const row of rows) await postSource(state.activeSourceTab, row);
    await refresh(true);
    toast(`Posted ${rows.length} visible ${sourceLabel(state.activeSourceTab)} record(s).`);
  }

  function bindFilters() {
    const journalStatus = $('accountingJournalStatusFilter');
    if (journalStatus) {
      journalStatus.value = state.filters.journalStatus;
      journalStatus.addEventListener('change', event => { state.filters.journalStatus = event.target.value || 'all'; render(); });
    }
    const ledgerAccount = $('accountingLedgerAccountFilter');
    if (ledgerAccount) ledgerAccount.addEventListener('change', event => { state.filters.ledgerAccountId = event.target.value || 'all'; render(); });
    const ledgerSource = $('accountingLedgerSourceFilter');
    if (ledgerSource) ledgerSource.addEventListener('change', event => { state.filters.ledgerSource = event.target.value || 'all'; render(); });
    const ledgerFrom = $('accountingLedgerFrom');
    if (ledgerFrom) ledgerFrom.addEventListener('change', event => { state.filters.ledgerFrom = event.target.value || ''; render(); });
    const ledgerTo = $('accountingLedgerTo');
    if (ledgerTo) ledgerTo.addEventListener('change', event => { state.filters.ledgerTo = event.target.value || ''; render(); });
    const sourceSearch = $('accountingSourceSearch');
    if (sourceSearch) sourceSearch.addEventListener('input', event => { state.filters.sourceSearch = event.target.value || ''; render(); });
    const sourceStatus = $('accountingSourceStatus');
    if (sourceStatus) sourceStatus.addEventListener('change', event => { state.filters.sourceStatus = event.target.value || 'unposted'; render(); });
    const sourceFrom = $('accountingSourceFrom');
    if (sourceFrom) sourceFrom.addEventListener('change', event => { state.filters.sourceFrom = event.target.value || ''; render(); });
    const sourceTo = $('accountingSourceTo');
    if (sourceTo) sourceTo.addEventListener('change', event => { state.filters.sourceTo = event.target.value || ''; render(); });
    const reportFromInput = $('accountingReportFrom');
    if (reportFromInput) reportFromInput.addEventListener('change', event => { state.filters.reportFrom = event.target.value || ''; render(); });
    const reportToInput = $('accountingReportTo');
    if (reportToInput) reportToInput.addEventListener('change', event => { state.filters.reportTo = event.target.value || ''; render(); });
    const reportAsOfInput = $('accountingReportAsOf');
    if (reportAsOfInput) reportAsOfInput.addEventListener('change', event => { state.filters.reportAsOf = event.target.value || today(); render(); });
    const reportSearchInput = $('accountingReportSearch');
    if (reportSearchInput) reportSearchInput.addEventListener('input', event => { state.filters.reportSearch = event.target.value || ''; render(); });
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
    const row = { id, account_code: $('accountingAccountCode')?.value?.trim() || '', account_name: $('accountingAccountName')?.value?.trim() || '', account_type: $('accountingAccountType')?.value || 'Asset', parent_account_id: $('accountingParentAccountId')?.value || null, currency: ($('accountingAccountCurrency')?.value || 'USD').trim().toUpperCase(), opening_balance: num($('accountingOpeningBalance')?.value), is_active: $('accountingAccountActive')?.value !== 'false', notes: $('accountingAccountNotes')?.value || '', created_at: state.accounts.find(a => a.id === id)?.created_at || new Date().toISOString() };
    if (!row.account_code || !row.account_name) return toast('Account code and name are required.');
    await persistRow('accounts', TABLES.accounts, row); toast('Account saved.'); render();
  }

  async function saveBankForm() {
    const id = $('accountingBankId')?.value || uid('bank');
    const row = { id, account_name: $('accountingBankName')?.value?.trim() || '', account_type: $('accountingBankType')?.value || 'Bank', currency: ($('accountingBankCurrency')?.value || 'USD').trim().toUpperCase(), account_number: $('accountingBankNumber')?.value || '', opening_balance: num($('accountingBankOpening')?.value), current_balance: num($('accountingBankCurrent')?.value), linked_account_id: $('accountingBankLinkedAccount')?.value || null, is_active: $('accountingBankActive')?.value !== 'false', notes: $('accountingBankNotes')?.value || '', created_at: state.bankAccounts.find(a => a.id === id)?.created_at || new Date().toISOString() };
    if (!row.account_name) return toast('Bank/cash account name is required.');
    await persistRow('bankAccounts', TABLES.bankAccounts, row); toast('Bank/Cash account saved.'); render();
  }

  function editAccount(id) {
    const row = state.accounts.find(item => item.id === id); if (!row) return;
    state.activeTab = 'accounts'; render();
    $('accountingAccountId').value = row.id; $('accountingAccountCode').value = row.account_code || ''; $('accountingAccountName').value = row.account_name || ''; $('accountingAccountType').value = row.account_type || 'Asset'; $('accountingParentAccountId').value = row.parent_account_id || ''; $('accountingAccountCurrency').value = row.currency || 'USD'; $('accountingOpeningBalance').value = row.opening_balance || 0; $('accountingAccountActive').value = row.is_active === false ? 'false' : 'true'; $('accountingAccountNotes').value = row.notes || '';
  }

  function editBank(id) {
    const row = state.bankAccounts.find(item => item.id === id); if (!row) return;
    state.activeTab = 'bank'; render();
    $('accountingBankId').value = row.id; $('accountingBankName').value = row.account_name || ''; $('accountingBankType').value = row.account_type || 'Bank'; $('accountingBankCurrency').value = row.currency || 'USD'; $('accountingBankNumber').value = row.account_number || ''; $('accountingBankOpening').value = row.opening_balance || 0; $('accountingBankCurrent').value = row.current_balance || 0; $('accountingBankLinkedAccount').value = row.linked_account_id || ''; $('accountingBankActive').value = row.is_active === false ? 'false' : 'true'; $('accountingBankNotes').value = row.notes || '';
  }

  function readJournalForm(status) {
    bindJournalLineInputs();
    const id = $('accountingJournalId')?.value || state.editingJournalId || uid('journal');
    const currency = ($('accountingJournalCurrency')?.value || 'USD').trim().toUpperCase();
    const validLines = currentDraftLines().map((line, index) => {
      const account = accountById(line.account_id);
      return { id: line.id || uid('line'), journal_id: id, line_no: index + 1, account_id: line.account_id || '', account_code: account?.account_code || '', account_name: account?.account_name || '', debit: num(line.debit), credit: num(line.credit), currency, description: line.description || '', created_at: line.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    }).filter(line => line.account_id && (line.debit > 0 || line.credit > 0));
    const totalDebit = validLines.reduce((sum,line) => sum + num(line.debit), 0);
    const totalCredit = validLines.reduce((sum,line) => sum + num(line.credit), 0);
    const existing = state.journals.find(j => j.id === id) || {};
    const journal = { id, journal_no: $('accountingJournalNo')?.value?.trim() || existing.journal_no || nextJournalNo(), entry_date: $('accountingJournalDate')?.value || today(), description: $('accountingJournalDescription')?.value?.trim() || '', reference_no: $('accountingJournalReference')?.value?.trim() || '', status, currency, total_debit: totalDebit, total_credit: totalCredit, created_by: existing.created_by || authName(), posted_by: status === 'posted' ? authName() : existing.posted_by || null, posted_at: status === 'posted' ? new Date().toISOString() : existing.posted_at || null, created_at: existing.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), source_module: existing.source_module || 'manual_journal', source_reference: existing.source_reference || '', source_table: existing.source_table || '', auto_generated: existing.auto_generated || false };
    return { journal, lines: validLines, totalDebit, totalCredit };
  }

  async function saveJournal(status = 'draft') {
    const { journal, lines, totalDebit, totalCredit } = readJournalForm(status);
    if (!journal.description) return toast('Journal description is required.');
    if (lines.length < 2) return toast('Journal needs at least two lines.');
    if (Math.abs(totalDebit - totalCredit) >= 0.01 || totalDebit <= 0) return toast('Journal must be balanced before saving/posting.');
    const jIdx = state.journals.findIndex(j => j.id === journal.id); if (jIdx >= 0) state.journals[jIdx] = journal; else state.journals.push(journal);
    state.journalLines = state.journalLines.filter(line => line.journal_id !== journal.id).concat(lines);
    if (status === 'posted') {
      state.ledgerEntries = state.ledgerEntries.filter(entry => entry.journal_id !== journal.id).concat(lines.map(line => ({ id: uid('ledger'), journal_id: journal.id, journal_line_id: line.id, journal_no: journal.journal_no, entry_date: journal.entry_date, account_id: line.account_id, account_code: line.account_code, account_name: line.account_name, debit: line.debit, credit: line.credit, currency: journal.currency, description: line.description || journal.description, reference_no: journal.reference_no, source_module: journal.source_module || 'manual_journal', source_id: null, source_reference: journal.source_reference || journal.journal_no, source_table: journal.source_table || 'accounting_journal_entries', source_label: 'Manual Journal', status: 'posted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })));
    }
    try { await upsertRemote(TABLES.journals, journal); await deleteRemote(TABLES.journalLines, 'journal_id', journal.id); await upsertRemote(TABLES.journalLines, lines); if (status === 'posted') { const ledgerRows = state.ledgerEntries.filter(entry => entry.journal_id === journal.id); await deleteRemote(TABLES.ledgerEntries, 'journal_id', journal.id); await upsertRemote(TABLES.ledgerEntries, ledgerRows); } }
    catch (error) { state.dataSource = 'local'; console.warn('[Accounting] journal remote save failed', error); toast('Journal saved locally. Run Accounting SQL migration to enable Supabase sync.'); }
    saveLocal(); state.editingJournalId = journal.id; state.journalLinesDraft = lines.map(line => ({ ...line })); toast(status === 'posted' ? 'Journal posted and ledger updated.' : 'Journal saved as draft.'); render();
  }

  function editJournal(id) {
    const journal = state.journals.find(j => j.id === id); if (!journal) return;
    state.editingJournalId = id; state.journalLinesDraft = journalLinesFor(id).map(line => ({ ...line }));
    if (!state.journalLinesDraft.length) state.journalLinesDraft = [{ account_id:'', debit:'', credit:'', description:'' }, { account_id:'', debit:'', credit:'', description:'' }];
    state.activeTab = 'journals'; render();
  }

  async function deleteJournal(id) {
    const journal = state.journals.find(j => j.id === id); if (!journal) return;
    if (!confirm(`Delete journal ${journal.journal_no}?`)) return;
    state.journals = state.journals.filter(j => j.id !== id); state.journalLines = state.journalLines.filter(line => line.journal_id !== id); state.ledgerEntries = state.ledgerEntries.filter(entry => entry.journal_id !== id);
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
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  function handleClick(event) {
    const tabBtn = event.target.closest('[data-accounting-tab]');
    if (tabBtn) { state.activeTab = tabBtn.getAttribute('data-accounting-tab'); render(); return; }
    const sourceTab = event.target.closest('[data-accounting-source-tab]');
    if (sourceTab) { state.activeSourceTab = sourceTab.getAttribute('data-accounting-source-tab'); render(); return; }
    const reportTab = event.target.closest('[data-accounting-report-tab]');
    if (reportTab) { state.activeReportTab = reportTab.getAttribute('data-accounting-report-tab') || 'trial_balance'; render(); return; }
    const actionBtn = event.target.closest('[data-accounting-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-accounting-action');
      if (action === 'refresh' || action === 'refresh-sources') { refresh(true); return; }
      if (action === 'export-ledger') { exportCsv('accounting_general_ledger.csv', filteredLedgerEntries()); return; }
      if (action === 'reset-account-form') { resetAccountForm(); return; }
      if (action === 'reset-bank-form') { resetBankForm(); return; }
      if (action === 'reset-journal-form') { resetJournalForm(); return; }
      if (action === 'add-journal-line') { currentDraftLines().push({ account_id:'', debit:'', credit:'', description:'' }); render(); return; }
      if (action === 'save-journal-draft') { saveJournal('draft'); return; }
      if (action === 'post-journal-form') { saveJournal('posted'); return; }
      if (action === 'clear-ledger-filters') { state.filters.ledgerAccountId = 'all'; state.filters.ledgerFrom = ''; state.filters.ledgerTo = ''; state.filters.ledgerSource = 'all'; render(); return; }
      if (action === 'clear-source-filters') { state.filters.sourceSearch = ''; state.filters.sourceFrom = ''; state.filters.sourceTo = ''; state.filters.sourceStatus = 'unposted'; render(); return; }
      if (action === 'clear-report-filters') { state.filters.reportFrom = ''; state.filters.reportTo = ''; state.filters.reportAsOf = today(); state.filters.reportSearch = ''; render(); return; }
      if (action === 'export-report') { exportCsv(`accounting_${state.activeReportTab}_report.csv`, currentReportCsvRows()); return; }
      if (action === 'print-report') { printCurrentReport(); return; }
      if (action === 'sync-visible-sources') { syncVisibleSources(); return; }
    }
    const postSourceBtn = event.target.closest('[data-accounting-post-source]');
    if (postSourceBtn) { postSource(postSourceBtn.getAttribute('data-accounting-post-source'), sourceByKey(postSourceBtn.getAttribute('data-accounting-post-source'), postSourceBtn.getAttribute('data-source-key'))); return; }
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

  function render() {
    const root = $('accountingRoot');
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = '<div class="accounting-empty"><strong>Admin only.</strong><br/>Accounting is restricted to admin users for now.</div>';
      return;
    }
    const body = state.activeTab === 'dashboard' ? renderDashboard()
      : state.activeTab === 'accounts' ? renderAccounts()
      : state.activeTab === 'integrations' ? renderIntegrations()
      : state.activeTab === 'journals' ? renderJournals()
      : state.activeTab === 'ledger' ? renderLedger()
      : state.activeTab === 'bank' ? renderBank()
      : state.activeTab === 'reports' ? renderReports()
      : renderDashboard();
    root.innerHTML = shell(body);
    bindFilters();
    const accountForm = $('accountingAccountForm'); if (accountForm) accountForm.addEventListener('submit', event => { event.preventDefault(); saveAccountForm(); });
    const bankForm = $('accountingBankForm'); if (bankForm) bankForm.addEventListener('submit', event => { event.preventDefault(); saveBankForm(); });
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
    if (!state.initialized) {
      const root = $('accountingRoot');
      if (root) root.addEventListener('click', handleClick);
      state.initialized = true;
      resetJournalForm();
    }
    await refresh(true);
  }

  global.AccountingModule = { init, refresh, state, postSource };
})(window);
