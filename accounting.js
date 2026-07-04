(function initAccountingModule(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_accounting_phase4_v1';
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
    ledgerEntries: 'accounting_ledger_entries',
    taxRates: 'accounting_tax_rates',
    expenses: 'accounting_expenses',
    costCenters: 'accounting_cost_centers',
    closingPeriods: 'accounting_closing_periods',
    revenueSchedules: 'accounting_revenue_schedules',
    bankReconciliations: 'accounting_bank_reconciliations',
    auditLog: 'accounting_audit_log'
  };

  const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const POSTABLE_TYPES = ['invoices','receipts','credit_notes','biners_payables','biners_payments','hr_payroll','hr_salary_receipts'];
  const REPORT_TABS = ['trial_balance','profit_loss','balance_sheet','cash_flow','ar_aging','ap_aging','customer_statement','vendor_statement','payroll_expense'];
  const ADVANCED_TABS = ['deferred_revenue','expenses','tax','cost_centers','closing','reconciliation','audit'];

  const state = {
    initialized: false,
    activeTab: 'dashboard',
    activeSourceTab: 'invoices',
    activeReportTab: 'trial_balance',
    activeAdvancedTab: 'deferred_revenue',
    dataSource: 'local',
    loading: false,
    editingJournalId: '',
    journalLinesDraft: [],
    filters: {
      ledgerAccountId: 'all', ledgerFrom: '', ledgerTo: '', ledgerSource: 'all', journalStatus: 'all',
      sourceSearch: '', sourceFrom: '', sourceTo: '', sourceStatus: 'unposted',
      reportFrom: '', reportTo: '', reportAsOf: today(), reportSearch: '',
      advancedSearch: '', expenseFrom: '', expenseTo: '', expenseStatus: 'all', deferredStatus: 'pending', reconciliationAccountId: 'all', reconciliationDate: today(), statementBalance: ''
    },
    accounts: [], bankAccounts: [], journals: [], journalLines: [], ledgerEntries: [],
    taxRates: [], expenses: [], costCenters: [], closingPeriods: [], revenueSchedules: [], bankReconciliations: [], auditLog: [],
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
      ['1000','Assets','Asset'], ['1100','Cash on Hand','Asset'], ['1200','Bank Account','Asset'], ['1300','Accounts Receivable','Asset'], ['1400','VAT Receivable','Asset'],
      ['2000','Liabilities','Liability'], ['2100','Accounts Payable','Liability'], ['2200','Payroll Payable','Liability'], ['2300','VAT Payable','Liability'], ['2400','Deferred Revenue','Liability'],
      ['3000','Equity','Equity'],
      ['4000','Revenue','Revenue'], ['4100','SaaS Revenue','Revenue'], ['4200','Setup Fees Revenue','Revenue'], ['4900','Credit Notes / Revenue Contra','Revenue'],
      ['5000','Expenses','Expense'], ['5100','Payroll Expense','Expense'], ['5200','Outsourcing / Biners Expense','Expense'], ['5300','Hosting & Software Expense','Expense'], ['5400','General Operating Expense','Expense'], ['5500','Other Operating Expense','Expense'], ['5600','Bank Charges / Finance Fees','Expense']
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
      taxRates: [{ id: uid('tax'), tax_name: 'VAT 0%', tax_rate: 0, tax_type: 'both', is_active: true, notes: '', created_at: new Date().toISOString() }],
      expenses: [], costCenters: [], closingPeriods: [], revenueSchedules: [], bankReconciliations: [], auditLog: [],
      sources: { invoices: [], receipts: [], creditNotes: [], binersSchedules: [], payrollItems: [], salaryReceipts: [], hrEmployees: [] }
    };
  }

  function plainState() {
    return {
      accounts: state.accounts, bankAccounts: state.bankAccounts, journals: state.journals, journalLines: state.journalLines, ledgerEntries: state.ledgerEntries,
      taxRates: state.taxRates, expenses: state.expenses, costCenters: state.costCenters, closingPeriods: state.closingPeriods,
      revenueSchedules: state.revenueSchedules, bankReconciliations: state.bankReconciliations, auditLog: state.auditLog,
      sources: state.sources
    };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plainState())); }
    catch (error) { console.warn('[Accounting] local save failed', error); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('incheck360_accounting_phase3_v1') || localStorage.getItem('incheck360_accounting_phase2_v1') || localStorage.getItem('incheck360_accounting_phase1_v1');
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
    const [accounts, bankAccounts, journals, journalLines, ledgerEntries, taxRates, expenses, costCenters, closingPeriods, revenueSchedules, bankReconciliations, auditLog] = await Promise.all([
      fetchTable(TABLES.accounts), fetchTable(TABLES.bankAccounts), fetchTable(TABLES.journals), fetchTable(TABLES.journalLines), fetchTable(TABLES.ledgerEntries),
      safeFetchTable(TABLES.taxRates), safeFetchTable(TABLES.expenses), safeFetchTable(TABLES.costCenters), safeFetchTable(TABLES.closingPeriods), safeFetchTable(TABLES.revenueSchedules), safeFetchTable(TABLES.bankReconciliations), safeFetchTable(TABLES.auditLog)
    ]);
    Object.assign(state, { accounts, bankAccounts, journals, journalLines, ledgerEntries, taxRates, expenses, costCenters, closingPeriods, revenueSchedules, bankReconciliations, auditLog, dataSource: 'supabase' });
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
    const deferredRevenue = ledgerRows.filter(row => String(row.account.account_code) === '2400').reduce((sum,row) => sum + num(row.balance), 0);
    const vatPayable = ledgerRows.filter(row => String(row.account.account_code) === '2300').reduce((sum,row) => sum + num(row.balance), 0);
    const vatReceivable = ledgerRows.filter(row => String(row.account.account_code) === '1400').reduce((sum,row) => sum + num(row.balance), 0);
    const openExpenses = state.expenses.filter(row => !['paid','locked','cancelled'].includes(norm(row.payment_status || row.status))).length;
    return { totalDebit, totalCredit, bankCash, posted, draft, assets, liabilities, revenue, expense, netProfit: revenue - expense, deferredRevenue, vatPayable, vatReceivable, openExpenses };
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
          <p class="muted">Admin-only accounting with Phase 4 deferred revenue, expenses, tax, cost centers, closing controls, audit log, reports, and source sync.</p>
        </div>
        <div class="accounting-actions">
          ${sourceChip()}
          <button class="btn ghost sm" type="button" data-accounting-action="refresh">Refresh</button>
          <button class="btn sm" type="button" data-accounting-action="export-ledger">Export Ledger CSV</button>
        </div>
      </div>
      <div class="accounting-tabs" role="tablist">
        ${[
          ['dashboard','Dashboard'],['accounts','Chart of Accounts'],['integrations','Module Sync'],['journals','Journal Entries'],['ledger','General Ledger'],['bank','Bank & Cash'],['reports','Financial Reports'],['advanced','Advanced Controls']
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
        <div class="accounting-kpi"><div class="label">Revenue</div><div class="value">${money(m.revenue)}</div><div class="hint">Posted recognized revenue</div></div>
        <div class="accounting-kpi"><div class="label">Deferred Revenue</div><div class="value">${money(m.deferredRevenue)}</div><div class="hint">Annual SaaS not recognized yet</div></div>
        <div class="accounting-kpi"><div class="label">Expenses</div><div class="value">${money(m.expense)}</div><div class="hint">Posted ledger expenses · ${m.openExpenses} open</div></div>
        <div class="accounting-kpi"><div class="label">Net Profit</div><div class="value">${money(m.netProfit)}</div><div class="hint">Recognized revenue minus expenses</div></div>
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
      invoices: 'Dr Accounts Receivable · Cr Deferred Revenue / Setup Revenue',
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
    const deferredRevenue = requiredAccount('2400', 'Deferred Revenue');
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
      if (saas > 0) rows.push(line(deferredRevenue || revenue, 0, saas, `Deferred SaaS revenue · ${sourceReference(type,row)}`));
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
    const journal = await postBalancedJournal({
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
    if (journal && type === 'invoices' && saasAmount(row) > 0) await generateRevenueScheduleForInvoice(row, false);
  }

  function sourceTableName(type) {
    return ({ invoices:'invoices', receipts:'receipts', credit_notes:'credit_notes', biners_payables:'biners_payment_schedules', biners_payments:'biners_payment_schedules', hr_payroll:'hr_payroll_items', hr_salary_receipts:'hr_salary_receipts' })[type] || type;
  }

  async function postBalancedJournal({ sourceModule, sourceTable, sourceId, sourceReference, sourceLabel, date, currency, description, referenceNo, lines }) {
    if (isPeriodClosed(date || today())) { toast('This accounting period is closed. Reopen it before posting.'); return null; }
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
    await recordAudit('post_journal', sourceModule || 'journal', sourceReference || journal.id, `Posted journal ${journal.journal_no}: ${description}.`, { totalDebit, totalCredit });
    render();
    return journal;
  }

  async function syncVisibleSources() {
    const rows = filteredSourceRows(state.activeSourceTab).filter(row => !row.posted).slice(0, 50);
    if (!rows.length) return toast('No visible unposted records to sync.');
    for (const row of rows) await postSource(state.activeSourceTab, row);
    await refresh(true);
    toast(`Posted ${rows.length} visible ${sourceLabel(state.activeSourceTab)} record(s).`);
  }



  // ---------------- Accounting Phase 4 - advanced controls ----------------
  function advancedTabLabel(key) {
    return ({ deferred_revenue:'Deferred Revenue', expenses:'Expenses', tax:'Tax / VAT', cost_centers:'Cost Centers', closing:'Closing Periods', reconciliation:'Bank Reconciliation', audit:'Audit Log' })[key] || key;
  }

  function renderAdvanced() {
    const body = state.activeAdvancedTab === 'deferred_revenue' ? renderDeferredRevenue()
      : state.activeAdvancedTab === 'expenses' ? renderExpenses()
      : state.activeAdvancedTab === 'tax' ? renderTaxVat()
      : state.activeAdvancedTab === 'cost_centers' ? renderCostCenters()
      : state.activeAdvancedTab === 'closing' ? renderClosingPeriods()
      : state.activeAdvancedTab === 'reconciliation' ? renderReconciliation()
      : state.activeAdvancedTab === 'audit' ? renderAuditLog()
      : renderDeferredRevenue();
    return `<div class="accounting-card">
      <div class="accounting-card-header"><div><h3>Advanced Accounting Controls</h3><p class="muted">Phase 4: deferred revenue, monthly recognition, expenses, tax, cost centers, period closing, reconciliation, and audit history.</p></div><span class="accounting-chip">${esc(advancedTabLabel(state.activeAdvancedTab))}</span></div>
      <div class="accounting-tabs compact">${ADVANCED_TABS.map(key => `<button class="accounting-tab ${state.activeAdvancedTab === key ? 'active':''}" type="button" data-accounting-advanced-tab="${esc(key)}">${esc(advancedTabLabel(key))}</button>`).join('')}</div>
      <div style="margin-top:14px;">${body}</div>
    </div>`;
  }

  function saasAmount(row) {
    const amount = sourceAmount('invoices', row);
    const setup = Math.max(0, Math.min(amount, num(row.subtotal_one_time || row.one_time_total || row.setup_total || row.account_setup_total || 0)));
    return Math.max(0, amount - setup);
  }

  function serviceDate(row, kind) {
    const candidates = kind === 'start'
      ? [row.service_start_date, row.start_service_date, row.service_start, row.period_start, row.subscription_start, row.invoice_date, row.issue_date, row.created_at]
      : [row.service_end_date, row.end_service_date, row.service_end, row.period_end, row.subscription_end];
    return dateKey(candidates.find(Boolean)) || '';
  }

  function addMonths(dateValue, months) {
    const d = new Date(`${dateKey(dateValue)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0,10);
  }

  function monthStart(dateValue) {
    const d = new Date(`${dateKey(dateValue)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return today().slice(0,8) + '01';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  }

  function monthlyRecognitionDates(start, end) {
    const dates = [];
    let cursor = monthStart(start || today());
    const limit = dateKey(end) || addMonths(cursor, 11);
    for (let i = 0; i < 36; i += 1) {
      if (cursor > limit) break;
      dates.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    return dates.length ? dates : [monthStart(today())];
  }

  function scheduleRowsForInvoice(row) {
    const invoiceRef = sourceReference('invoices', row);
    const amount = saasAmount(row);
    if (!invoiceRef || amount <= 0) return [];
    const start = serviceDate(row, 'start') || sourceDate('invoices', row) || today();
    const end = serviceDate(row, 'end') || addMonths(start, 11);
    const dates = monthlyRecognitionDates(start, end);
    const monthly = Math.floor((amount / dates.length) * 100) / 100;
    let remaining = amount;
    const now = new Date().toISOString();
    return dates.map((recognitionDate, index) => {
      const value = index === dates.length - 1 ? Number(remaining.toFixed(2)) : monthly;
      remaining -= value;
      return {
        id: uid('revsch'), source_invoice_ref: invoiceRef, source_invoice_id: isUuid(row.id) ? row.id : null, customer_name: sourceCounterparty('invoices', row),
        recognition_date: recognitionDate, service_start_date: dateKey(start), service_end_date: dateKey(end), amount: value, currency: sourceCurrency(row),
        status: 'pending', journal_id: null, recognized_at: null, recognized_by: null,
        description: `Monthly SaaS revenue recognition · ${invoiceRef} · ${sourceCounterparty('invoices', row)}`,
        created_at: now, updated_at: now
      };
    });
  }

  function schedulesForInvoiceRef(ref) {
    return state.revenueSchedules.filter(row => String(row.source_invoice_ref || '') === String(ref));
  }

  async function generateRevenueScheduleForInvoice(row, showToast = true) {
    const invoiceRef = sourceReference('invoices', row);
    if (!invoiceRef) return showToast ? toast('Invoice reference is missing.') : null;
    if (schedulesForInvoiceRef(invoiceRef).length) return showToast ? toast('Revenue schedule already exists for this invoice.') : null;
    const rows = scheduleRowsForInvoice(row);
    if (!rows.length) return showToast ? toast('No SaaS amount found to defer for this invoice.') : null;
    state.revenueSchedules.push(...rows);
    try { await upsertRemote(TABLES.revenueSchedules, rows); }
    catch (error) { state.dataSource = 'local'; console.warn('[Accounting] revenue schedule remote save failed', error); }
    await recordAudit('generate_revenue_schedule', 'invoice', invoiceRef, `Generated ${rows.length} monthly revenue schedule row(s) for ${invoiceRef}.`, { invoiceRef, amount: rows.reduce((s,r)=>s+num(r.amount),0) });
    saveLocal();
    if (showToast) { toast(`Generated ${rows.length} monthly revenue recognition rows.`); render(); }
    return rows;
  }

  async function recognizeRevenueSchedule(row) {
    if (!row || norm(row.status) === 'recognized') return toast('This revenue schedule is already recognized.');
    if (isPeriodClosed(row.recognition_date)) return toast('This recognition date is in a closed accounting period. Reopen the period first.');
    const deferred = requiredAccount('2400', 'Deferred Revenue');
    const revenue = requiredAccount('4100', 'SaaS Revenue');
    if (!deferred || !revenue) return;
    const journal = await postBalancedJournal({
      sourceModule: 'revenue_recognition', sourceTable: TABLES.revenueSchedules, sourceId: row.id, sourceReference: `${row.source_invoice_ref}-${row.recognition_date}`,
      sourceLabel: row.customer_name || row.source_invoice_ref, date: row.recognition_date || today(), currency: row.currency || 'USD',
      description: row.description || `Monthly SaaS revenue recognition · ${row.source_invoice_ref}`, referenceNo: row.source_invoice_ref,
      lines: [line(deferred, num(row.amount), 0, `Release deferred revenue · ${row.source_invoice_ref}`), line(revenue, 0, num(row.amount), `Recognize SaaS revenue · ${row.source_invoice_ref}`)]
    });
    if (!journal) return;
    Object.assign(row, { status: 'recognized', journal_id: journal.id, recognized_at: new Date().toISOString(), recognized_by: authName(), updated_at: new Date().toISOString() });
    try { await upsertRemote(TABLES.revenueSchedules, row); } catch (error) { state.dataSource = 'local'; console.warn('[Accounting] schedule update failed', error); }
    await recordAudit('recognize_revenue', 'revenue_schedule', row.id, `Recognized SaaS revenue ${money(row.amount,row.currency)} for ${row.source_invoice_ref}.`, { invoiceRef: row.source_invoice_ref, recognitionDate: row.recognition_date });
    saveLocal(); render();
  }

  async function recognizeDueRevenue() {
    const asOf = state.filters.reportAsOf || today();
    const due = filteredRevenueSchedules().filter(row => norm(row.status || 'pending') === 'pending' && dateKey(row.recognition_date) <= asOf).slice(0, 60);
    if (!due.length) return toast('No due deferred revenue rows to recognize.');
    for (const row of due) await recognizeRevenueSchedule(row);
    await refresh(true);
    toast(`Recognized ${due.length} revenue schedule row(s).`);
  }

  function filteredRevenueSchedules() {
    const search = norm(state.filters.advancedSearch);
    return state.revenueSchedules.filter(row => {
      if (state.filters.deferredStatus !== 'all' && norm(row.status || 'pending') !== state.filters.deferredStatus) return false;
      if (state.filters.expenseFrom && dateKey(row.recognition_date) < state.filters.expenseFrom) return false;
      if (state.filters.expenseTo && dateKey(row.recognition_date) > state.filters.expenseTo) return false;
      if (search && !norm([row.source_invoice_ref,row.customer_name,row.description,row.status].join(' ')).includes(search)) return false;
      return true;
    }).sort((a,b)=>String(a.recognition_date || '').localeCompare(String(b.recognition_date || '')));
  }

  function renderAdvancedFilters(extra = '') {
    return `<div class="accounting-report-controls">
      <div class="accounting-form-grid">
        <label class="accounting-field">Search<input id="accountingAdvancedSearch" value="${esc(state.filters.advancedSearch)}" placeholder="reference, vendor, account, name" /></label>
        <label class="accounting-field">From<input type="date" id="accountingAdvancedFrom" value="${esc(state.filters.expenseFrom)}" /></label>
        <label class="accounting-field">To<input type="date" id="accountingAdvancedTo" value="${esc(state.filters.expenseTo)}" /></label>
        ${extra}
        <div class="accounting-toolbar"><button class="btn ghost" type="button" data-accounting-action="clear-advanced-filters">Clear</button></div>
      </div>
    </div>`;
  }

  function renderDeferredRevenue() {
    const invoiceRows = getSourceRows('invoices').filter(row => saasAmount(row) > 0).slice(0, 250);
    const scheduleRows = filteredRevenueSchedules();
    const pending = scheduleRows.filter(row => norm(row.status || 'pending') === 'pending').reduce((s,r)=>s+num(r.amount),0);
    const recognized = scheduleRows.filter(row => norm(row.status) === 'recognized').reduce((s,r)=>s+num(r.amount),0);
    const extra = `<label class="accounting-field">Status<select id="accountingDeferredStatus"><option value="all">All</option><option value="pending" ${state.filters.deferredStatus==='pending'?'selected':''}>Pending</option><option value="recognized" ${state.filters.deferredStatus==='recognized'?'selected':''}>Recognized</option><option value="cancelled" ${state.filters.deferredStatus==='cancelled'?'selected':''}>Cancelled</option></select></label>`;
    return `${renderAdvancedFilters(extra)}
      <div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">Pending Deferred Revenue</div><div class="value">${money(pending)}</div></div><div class="accounting-kpi"><div class="label">Recognized From Schedule</div><div class="value">${money(recognized)}</div></div><div class="accounting-kpi"><div class="label">Schedule Rows</div><div class="value">${scheduleRows.length}</div></div></div>
      <div class="accounting-toolbar"><button class="btn" type="button" data-accounting-action="recognize-due-revenue">Recognize Due Revenue</button><button class="btn ghost" type="button" data-accounting-action="export-deferred-revenue">Export Deferred CSV</button></div>
      <h4>Invoices Available for Revenue Schedule</h4>${renderInvoiceScheduleTable(invoiceRows)}
      <h4>Monthly Revenue Recognition Schedule</h4>${renderRevenueScheduleTable(scheduleRows)}`;
  }

  function renderInvoiceScheduleTable(rows) {
    if (!rows.length) return '<div class="accounting-empty">No SaaS invoices found from source sync.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Invoice</th><th>Client</th><th>Service Period</th><th class="num">SaaS Amount</th><th>Schedule</th><th>Action</th></tr></thead><tbody>${rows.map(row => {
      const ref = sourceReference('invoices', row);
      const schedule = schedulesForInvoiceRef(ref);
      const recognized = schedule.filter(item => norm(item.status) === 'recognized').reduce((s,item)=>s+num(item.amount),0);
      return `<tr><td><strong>${esc(ref)}</strong><div class="muted">${fmtDate(sourceDate('invoices',row))}</div></td><td>${esc(sourceCounterparty('invoices',row))}</td><td>${fmtDate(serviceDate(row,'start'))} → ${fmtDate(serviceDate(row,'end') || addMonths(serviceDate(row,'start') || sourceDate('invoices',row),11))}</td><td class="num">${money(saasAmount(row), sourceCurrency(row))}</td><td>${schedule.length ? `${schedule.length} months · recognized ${money(recognized, sourceCurrency(row))}` : '<span class="muted">Not generated</span>'}</td><td>${schedule.length ? '<span class="muted">Generated</span>' : `<button class="btn sm" type="button" data-accounting-generate-schedule="${esc(row.__acct_key)}">Generate Schedule</button>`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderRevenueScheduleTable(rows) {
    if (!rows.length) return '<div class="accounting-empty">No deferred revenue schedule rows match the filters.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Recognition Date</th><th>Invoice</th><th>Customer</th><th class="num">Amount</th><th>Status</th><th>Journal</th><th>Action</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.recognition_date)}</td><td><strong>${esc(row.source_invoice_ref)}</strong></td><td>${esc(row.customer_name || '—')}</td><td class="num">${money(row.amount,row.currency)}</td><td><span class="accounting-badge ${esc(norm(row.status || 'pending'))}">${esc(row.status || 'pending')}</span></td><td>${esc(state.journals.find(j=>j.id===row.journal_id)?.journal_no || '—')}</td><td>${norm(row.status)==='recognized' ? '<span class="muted">Posted</span>' : `<button class="btn sm" type="button" data-accounting-recognize-revenue="${esc(row.id)}">Recognize</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function taxRateOptions(selected = '') {
    return '<option value="">No tax</option>' + state.taxRates.filter(t => t.is_active !== false).map(t => `<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.tax_name)} · ${num(t.tax_rate)}%</option>`).join('');
  }

  function costCenterOptions(selected = '') {
    return '<option value="">No cost center</option>' + state.costCenters.filter(c => c.is_active !== false).map(c => `<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.code || '')} · ${esc(c.name || '')}</option>`).join('');
  }

  function renderExpenses() {
    const rows = filteredExpenses();
    const total = rows.reduce((s,r)=>s+num(r.total_amount || r.amount),0);
    const posted = rows.filter(r => r.journal_id).reduce((s,r)=>s+num(r.total_amount || r.amount),0);
    const statusExtra = `<label class="accounting-field">Status<select id="accountingExpenseStatus"><option value="all">All</option><option value="draft" ${state.filters.expenseStatus==='draft'?'selected':''}>Draft</option><option value="approved" ${state.filters.expenseStatus==='approved'?'selected':''}>Approved</option><option value="paid" ${state.filters.expenseStatus==='paid'?'selected':''}>Paid</option><option value="locked" ${state.filters.expenseStatus==='locked'?'selected':''}>Locked</option></select></label>`;
    return `${renderAdvancedFilters(statusExtra)}
      <div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">Filtered Expenses</div><div class="value">${money(total)}</div></div><div class="accounting-kpi"><div class="label">Posted Expenses</div><div class="value">${money(posted)}</div></div><div class="accounting-kpi"><div class="label">Expense Count</div><div class="value">${rows.length}</div></div></div>
      <div class="accounting-two-col"><div>${renderExpensesTable(rows)}</div><div class="accounting-card"><h3>New / Edit Expense</h3>${renderExpenseForm()}</div></div>`;
  }

  function filteredExpenses() {
    const search = norm(state.filters.advancedSearch);
    return state.expenses.filter(row => {
      const date = dateKey(row.expense_date || row.created_at);
      if (state.filters.expenseStatus !== 'all' && norm(row.payment_status || row.status || 'draft') !== state.filters.expenseStatus) return false;
      if (state.filters.expenseFrom && date < state.filters.expenseFrom) return false;
      if (state.filters.expenseTo && date > state.filters.expenseTo) return false;
      if (search && !norm([row.expense_no,row.vendor_name,row.category,row.description,row.payment_status].join(' ')).includes(search)) return false;
      return true;
    }).sort((a,b)=>String(b.expense_date || '').localeCompare(String(a.expense_date || '')));
  }

  function nextExpenseNo() {
    const year = new Date().getFullYear();
    const max = state.expenses.reduce((acc,row)=>Math.max(acc, num(String(row.expense_no || '').match(/(\d+)$/)?.[1] || 0)),0);
    return `EXP/${year}/${String(max+1).padStart(4,'0')}`;
  }

  function renderExpenseForm() {
    return `<form id="accountingExpenseForm"><input type="hidden" id="accountingExpenseId" />
      <div class="accounting-form-grid">
        <label class="accounting-field">Expense No.<input id="accountingExpenseNo" value="${esc(nextExpenseNo())}" /></label>
        <label class="accounting-field">Date<input id="accountingExpenseDate" type="date" value="${esc(today())}" /></label>
        <label class="accounting-field">Vendor<input id="accountingExpenseVendor" placeholder="Vendor / supplier" /></label>
        <label class="accounting-field">Category<input id="accountingExpenseCategory" placeholder="Hosting, office, travel..." /></label>
        <label class="accounting-field">Expense Account<select id="accountingExpenseAccount">${accountOptions(accountByCode('5400')?.id || '', true)}</select></label>
        <label class="accounting-field">Cost Center<select id="accountingExpenseCostCenter">${costCenterOptions('')}</select></label>
        <label class="accounting-field">Net Amount<input id="accountingExpenseAmount" type="number" step="0.01" value="0" /></label>
        <label class="accounting-field">Tax Rate<select id="accountingExpenseTaxRate">${taxRateOptions('')}</select></label>
        <label class="accounting-field">Currency<input id="accountingExpenseCurrency" value="USD" /></label>
        <label class="accounting-field">Status<select id="accountingExpenseStatusInput"><option value="draft">Draft</option><option value="approved">Approved / Payable</option><option value="paid">Paid</option><option value="locked">Locked</option></select></label>
        <label class="accounting-field">Paid From<select id="accountingExpenseBankAccount"><option value="">Use default bank/cash</option>${state.bankAccounts.map(b=>`<option value="${esc(b.id)}">${esc(b.account_name)} · ${esc(b.currency)}</option>`).join('')}</select></label>
        <label class="accounting-field wide">Description<textarea id="accountingExpenseDescription"></textarea></label>
        <div class="accounting-toolbar wide"><button class="btn" type="submit">Save Expense</button><button class="btn ghost" type="button" data-accounting-action="reset-expense-form">Clear</button></div>
      </div></form>`;
  }

  function renderExpensesTable(rows) {
    if (!rows.length) return '<div class="accounting-empty">No expenses match the filters.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>No.</th><th>Date</th><th>Vendor</th><th>Category</th><th>Status</th><th class="num">Net</th><th class="num">Tax</th><th class="num">Total</th><th>Journal</th><th>Actions</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${esc(row.expense_no)}</strong></td><td>${fmtDate(row.expense_date)}</td><td>${esc(row.vendor_name || '—')}</td><td>${esc(row.category || '—')}</td><td><span class="accounting-badge ${esc(norm(row.payment_status || row.status || 'draft'))}">${esc(row.payment_status || row.status || 'draft')}</span></td><td class="num">${money(row.amount,row.currency)}</td><td class="num">${money(row.tax_amount,row.currency)}</td><td class="num">${money(row.total_amount || row.amount,row.currency)}</td><td>${esc(state.journals.find(j=>j.id===row.journal_id)?.journal_no || '—')}</td><td><button class="btn ghost sm" type="button" data-accounting-edit-expense="${esc(row.id)}">Edit</button> ${row.journal_id ? '<span class="muted">Posted</span>' : `<button class="btn sm" type="button" data-accounting-post-expense="${esc(row.id)}">Post</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function saveExpenseForm() {
    const id = $('accountingExpenseId')?.value || uid('expense');
    const existing = state.expenses.find(row => row.id === id) || {};
    const taxRate = state.taxRates.find(t => t.id === $('accountingExpenseTaxRate')?.value);
    const amount = num($('accountingExpenseAmount')?.value);
    const taxAmount = Number((amount * num(taxRate?.tax_rate) / 100).toFixed(2));
    const row = {
      ...existing, id, expense_no: $('accountingExpenseNo')?.value?.trim() || existing.expense_no || nextExpenseNo(), expense_date: $('accountingExpenseDate')?.value || today(),
      vendor_name: $('accountingExpenseVendor')?.value?.trim() || '', category: $('accountingExpenseCategory')?.value?.trim() || '', description: $('accountingExpenseDescription')?.value?.trim() || '',
      expense_account_id: $('accountingExpenseAccount')?.value || accountByCode('5400')?.id || null, cost_center_id: $('accountingExpenseCostCenter')?.value || null,
      amount, tax_rate_id: taxRate?.id || null, tax_amount: taxAmount, total_amount: Number((amount + taxAmount).toFixed(2)), currency: ($('accountingExpenseCurrency')?.value || 'USD').trim().toUpperCase(),
      payment_status: $('accountingExpenseStatusInput')?.value || 'draft', payment_account_id: $('accountingExpenseBankAccount')?.value || defaultBankAccount()?.id || null,
      created_by: existing.created_by || authName(), created_at: existing.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
    };
    if (!row.vendor_name) return toast('Vendor is required.');
    if (row.amount <= 0) return toast('Expense amount must be above zero.');
    await persistRow('expenses', TABLES.expenses, row);
    await recordAudit('save_expense', 'expense', row.id, `Saved expense ${row.expense_no}.`, { amount: row.total_amount, status: row.payment_status });
    toast('Expense saved.'); render();
  }

  function editExpense(id) {
    const row = state.expenses.find(item => item.id === id); if (!row) return;
    state.activeTab = 'advanced'; state.activeAdvancedTab = 'expenses'; render();
    $('accountingExpenseId').value = row.id; $('accountingExpenseNo').value = row.expense_no || ''; $('accountingExpenseDate').value = dateKey(row.expense_date) || today(); $('accountingExpenseVendor').value = row.vendor_name || ''; $('accountingExpenseCategory').value = row.category || ''; $('accountingExpenseAccount').value = row.expense_account_id || accountByCode('5400')?.id || ''; $('accountingExpenseCostCenter').value = row.cost_center_id || ''; $('accountingExpenseAmount').value = row.amount || 0; $('accountingExpenseTaxRate').value = row.tax_rate_id || ''; $('accountingExpenseCurrency').value = row.currency || 'USD'; $('accountingExpenseStatusInput').value = row.payment_status || 'draft'; $('accountingExpenseBankAccount').value = row.payment_account_id || ''; $('accountingExpenseDescription').value = row.description || '';
  }

  async function postExpense(id) {
    const row = state.expenses.find(item => item.id === id); if (!row) return toast('Expense not found.');
    if (row.journal_id) return toast('Expense already posted.');
    if (isPeriodClosed(row.expense_date)) return toast('This expense date is in a closed period. Reopen the period first.');
    const expenseAccount = accountById(row.expense_account_id) || requiredAccount('5400','General Operating Expense');
    const vatReceivable = requiredAccount('1400','VAT Receivable');
    const bank = accountById(state.bankAccounts.find(b => b.id === row.payment_account_id)?.linked_account_id) || bankLedgerAccount();
    const ap = requiredAccount('2100','Accounts Payable');
    const paid = norm(row.payment_status) === 'paid' || norm(row.payment_status) === 'locked';
    const lines = [line(expenseAccount, num(row.amount), 0, `Expense · ${row.expense_no} · ${row.vendor_name}`)];
    if (num(row.tax_amount) > 0 && vatReceivable) lines.push(line(vatReceivable, num(row.tax_amount), 0, `Purchase VAT · ${row.expense_no}`));
    lines.push(line(paid ? bank : ap, 0, num(row.total_amount || row.amount), paid ? `Expense paid · ${row.expense_no}` : `Expense payable · ${row.expense_no}`));
    const journal = await postBalancedJournal({ sourceModule: 'expenses', sourceTable: TABLES.expenses, sourceId: row.id, sourceReference: row.expense_no, sourceLabel: row.vendor_name, date: row.expense_date, currency: row.currency, description: `Expense ${row.expense_no} · ${row.vendor_name}`, referenceNo: row.expense_no, lines });
    if (!journal) return;
    Object.assign(row, { journal_id: journal.id, posted_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    try { await upsertRemote(TABLES.expenses, row); } catch (error) { state.dataSource = 'local'; console.warn('[Accounting] expense update failed', error); }
    await recordAudit('post_expense', 'expense', row.id, `Posted expense ${row.expense_no}.`, { total: row.total_amount, journalNo: journal.journal_no });
    saveLocal(); render();
  }

  function renderTaxVat() {
    const salesVat = ledgerByAccount().find(row => String(row.account.account_code) === '2300')?.balance || 0;
    const purchaseVat = ledgerByAccount().find(row => String(row.account.account_code) === '1400')?.balance || 0;
    const netVat = num(salesVat) - num(purchaseVat);
    return `<div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">VAT Payable</div><div class="value">${money(salesVat)}</div></div><div class="accounting-kpi"><div class="label">VAT Receivable</div><div class="value">${money(purchaseVat)}</div></div><div class="accounting-kpi"><div class="label">Net VAT Position</div><div class="value">${money(netVat)}</div></div></div>
      <div class="accounting-two-col"><div>${renderTaxTable()}</div><div class="accounting-card"><h3>Tax Rate</h3>${renderTaxForm()}</div></div>`;
  }

  function renderTaxTable() {
    if (!state.taxRates.length) return '<div class="accounting-empty">No tax rates yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Name</th><th>Rate</th><th>Type</th><th>Status</th><th>Notes</th><th>Action</th></tr></thead><tbody>${state.taxRates.map(row=>`<tr><td><strong>${esc(row.tax_name)}</strong></td><td>${num(row.tax_rate)}%</td><td>${esc(row.tax_type || 'both')}</td><td><span class="accounting-badge">${row.is_active===false?'Inactive':'Active'}</span></td><td>${esc(row.notes || '')}</td><td><button class="btn ghost sm" type="button" data-accounting-edit-tax="${esc(row.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderTaxForm() {
    return `<form id="accountingTaxForm"><input type="hidden" id="accountingTaxId" />
      <div class="accounting-form-grid"><label class="accounting-field">Name<input id="accountingTaxName" placeholder="VAT 11%" /></label><label class="accounting-field">Rate %<input id="accountingTaxRate" type="number" step="0.01" value="0" /></label><label class="accounting-field">Type<select id="accountingTaxType"><option value="both">Both</option><option value="sales">Sales</option><option value="purchase">Purchase</option></select></label><label class="accounting-field">Active<select id="accountingTaxActive"><option value="true">Active</option><option value="false">Inactive</option></select></label><label class="accounting-field wide">Notes<textarea id="accountingTaxNotes"></textarea></label><div class="accounting-toolbar wide"><button class="btn" type="submit">Save Tax Rate</button><button class="btn ghost" type="button" data-accounting-action="reset-tax-form">Clear</button></div></div></form>`;
  }

  async function saveTaxForm() {
    const id = $('accountingTaxId')?.value || uid('tax');
    const existing = state.taxRates.find(t=>t.id===id) || {};
    const row = { ...existing, id, tax_name: $('accountingTaxName')?.value?.trim() || '', tax_rate: num($('accountingTaxRate')?.value), tax_type: $('accountingTaxType')?.value || 'both', is_active: $('accountingTaxActive')?.value !== 'false', notes: $('accountingTaxNotes')?.value || '', created_at: existing.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    if (!row.tax_name) return toast('Tax name is required.');
    await persistRow('taxRates', TABLES.taxRates, row); await recordAudit('save_tax_rate','tax_rate',row.id,`Saved tax rate ${row.tax_name}.`,{ rate: row.tax_rate }); toast('Tax rate saved.'); render();
  }

  function editTax(id) { const row = state.taxRates.find(t=>t.id===id); if (!row) return; state.activeTab='advanced'; state.activeAdvancedTab='tax'; render(); $('accountingTaxId').value=row.id; $('accountingTaxName').value=row.tax_name||''; $('accountingTaxRate').value=row.tax_rate||0; $('accountingTaxType').value=row.tax_type||'both'; $('accountingTaxActive').value=row.is_active===false?'false':'true'; $('accountingTaxNotes').value=row.notes||''; }

  function renderCostCenters() {
    return `<div class="accounting-two-col"><div>${renderCostCenterTable()}</div><div class="accounting-card"><h3>Cost Center</h3>${renderCostCenterForm()}</div></div>`;
  }

  function renderCostCenterTable() {
    const rows = state.costCenters.filter(row => !state.filters.advancedSearch || norm([row.code,row.name,row.manager_name,row.notes].join(' ')).includes(norm(state.filters.advancedSearch))).sort((a,b)=>String(a.code||'').localeCompare(String(b.code||'')));
    if (!rows.length) return '<div class="accounting-empty">No cost centers yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Code</th><th>Name</th><th>Manager</th><th>Status</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${esc(row.code)}</strong></td><td>${esc(row.name)}</td><td>${esc(row.manager_name || '—')}</td><td><span class="accounting-badge">${row.is_active===false?'Inactive':'Active'}</span></td><td>${esc(row.notes || '')}</td><td><button class="btn ghost sm" type="button" data-accounting-edit-cost-center="${esc(row.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderCostCenterForm() {
    return `<form id="accountingCostCenterForm"><input type="hidden" id="accountingCostCenterId" /><div class="accounting-form-grid"><label class="accounting-field">Code<input id="accountingCostCenterCode" placeholder="DEV" /></label><label class="accounting-field">Name<input id="accountingCostCenterName" placeholder="Development" /></label><label class="accounting-field">Manager<input id="accountingCostCenterManager" /></label><label class="accounting-field">Active<select id="accountingCostCenterActive"><option value="true">Active</option><option value="false">Inactive</option></select></label><label class="accounting-field wide">Notes<textarea id="accountingCostCenterNotes"></textarea></label><div class="accounting-toolbar wide"><button class="btn" type="submit">Save Cost Center</button><button class="btn ghost" type="button" data-accounting-action="reset-cost-center-form">Clear</button></div></div></form>`;
  }

  async function saveCostCenterForm() {
    const id = $('accountingCostCenterId')?.value || uid('cc');
    const existing = state.costCenters.find(c=>c.id===id) || {};
    const row = { ...existing, id, code: $('accountingCostCenterCode')?.value?.trim() || '', name: $('accountingCostCenterName')?.value?.trim() || '', manager_name: $('accountingCostCenterManager')?.value?.trim() || '', is_active: $('accountingCostCenterActive')?.value !== 'false', notes: $('accountingCostCenterNotes')?.value || '', created_at: existing.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    if (!row.code || !row.name) return toast('Cost center code and name are required.');
    await persistRow('costCenters', TABLES.costCenters, row); await recordAudit('save_cost_center','cost_center',row.id,`Saved cost center ${row.code}.`,{}); toast('Cost center saved.'); render();
  }

  function editCostCenter(id) { const row = state.costCenters.find(c=>c.id===id); if (!row) return; state.activeTab='advanced'; state.activeAdvancedTab='cost_centers'; render(); $('accountingCostCenterId').value=row.id; $('accountingCostCenterCode').value=row.code||''; $('accountingCostCenterName').value=row.name||''; $('accountingCostCenterManager').value=row.manager_name||''; $('accountingCostCenterActive').value=row.is_active===false?'false':'true'; $('accountingCostCenterNotes').value=row.notes||''; }

  function periodKey(dateValue) { return dateKey(dateValue).slice(0,7); }
  function isPeriodClosed(dateValue) {
    const key = periodKey(dateValue);
    const row = state.closingPeriods.find(p => p.period_key === key);
    return row && ['closed','locked'].includes(norm(row.status));
  }

  function renderClosingPeriods() {
    return `<div class="accounting-two-col"><div>${renderClosingTable()}</div><div class="accounting-card"><h3>Close / Reopen Period</h3>${renderClosingForm()}<p class="muted">Closed or locked periods block new posting until admin reopens them.</p></div></div>`;
  }

  function renderClosingTable() {
    const rows = state.closingPeriods.slice().sort((a,b)=>String(b.period_key||'').localeCompare(String(a.period_key||'')));
    if (!rows.length) return '<div class="accounting-empty">No closing periods yet.</div>';
    return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Period</th><th>Dates</th><th>Status</th><th>Closed By</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${esc(row.period_key)}</strong></td><td>${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}</td><td><span class="accounting-badge ${esc(norm(row.status))}">${esc(row.status)}</span></td><td>${esc(row.closed_by || '—')}<div class="muted">${row.closed_at ? fmtDate(row.closed_at) : ''}</div></td><td>${esc(row.notes || '')}</td><td><button class="btn ghost sm" type="button" data-accounting-edit-closing="${esc(row.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderClosingForm() {
    return `<form id="accountingClosingForm"><input type="hidden" id="accountingClosingId" /><div class="accounting-form-grid"><label class="accounting-field">Period Month<input id="accountingClosingMonth" type="month" value="${esc(today().slice(0,7))}" /></label><label class="accounting-field">Status<select id="accountingClosingStatus"><option value="open">Open</option><option value="closed">Closed</option><option value="locked">Locked</option></select></label><label class="accounting-field wide">Notes<textarea id="accountingClosingNotes"></textarea></label><div class="accounting-toolbar wide"><button class="btn" type="submit">Save Period</button><button class="btn ghost" type="button" data-accounting-action="reset-closing-form">Clear</button></div></div></form>`;
  }

  function periodBounds(key) { const start = `${key}-01`; const end = addMonths(start, 1); const d = new Date(`${end}T00:00:00`); d.setDate(d.getDate()-1); return { start, end: d.toISOString().slice(0,10) }; }
  async function saveClosingForm() {
    const id = $('accountingClosingId')?.value || uid('period'); const key = $('accountingClosingMonth')?.value || today().slice(0,7); const existing = state.closingPeriods.find(p=>p.id===id) || state.closingPeriods.find(p=>p.period_key===key) || {}; const bounds = periodBounds(key); const status = $('accountingClosingStatus')?.value || 'open';
    const row = { ...existing, id: existing.id || id, period_key: key, start_date: bounds.start, end_date: bounds.end, status, closed_by: status==='open' ? null : (existing.closed_by || authName()), closed_at: status==='open' ? null : (existing.closed_at || new Date().toISOString()), notes: $('accountingClosingNotes')?.value || '', created_at: existing.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    await persistRow('closingPeriods', TABLES.closingPeriods, row); await recordAudit('save_closing_period','closing_period',row.id,`Saved accounting period ${row.period_key} as ${row.status}.`,{}); toast('Closing period saved.'); render();
  }

  function editClosing(id) { const row = state.closingPeriods.find(p=>p.id===id); if (!row) return; state.activeTab='advanced'; state.activeAdvancedTab='closing'; render(); $('accountingClosingId').value=row.id; $('accountingClosingMonth').value=row.period_key || today().slice(0,7); $('accountingClosingStatus').value=row.status || 'open'; $('accountingClosingNotes').value=row.notes || ''; }

  function renderReconciliation() {
    const accountId = state.filters.reconciliationAccountId === 'all' ? bankLedgerAccount()?.id : state.filters.reconciliationAccountId;
    const asOf = state.filters.reconciliationDate || today();
    const erpBalance = ledgerByAccountFor(state.ledgerEntries.filter(row => row.account_id === accountId && dateKey(row.entry_date) <= asOf), true).find(row => row.account.id === accountId)?.balance || 0;
    const statement = num(state.filters.statementBalance);
    const diff = erpBalance - statement;
    return `<div class="accounting-report-controls"><div class="accounting-form-grid"><label class="accounting-field">Bank/Cash Account<select id="accountingReconciliationAccount"><option value="all">Default bank/cash</option>${accountOptions(accountId || '', false)}</select></label><label class="accounting-field">Statement Date<input type="date" id="accountingReconciliationDate" value="${esc(asOf)}" /></label><label class="accounting-field">Statement Balance<input id="accountingStatementBalance" type="number" step="0.01" value="${esc(state.filters.statementBalance)}" /></label><div class="accounting-toolbar"><button class="btn" type="button" data-accounting-action="save-reconciliation">Save Reconciliation</button></div></div></div><div class="accounting-grid compact"><div class="accounting-kpi"><div class="label">ERP Balance</div><div class="value">${money(erpBalance)}</div></div><div class="accounting-kpi"><div class="label">Statement Balance</div><div class="value">${money(statement)}</div></div><div class="accounting-kpi"><div class="label">Difference</div><div class="value">${money(diff)}</div></div></div>${renderReconciliationTable()}`;
  }

  async function saveReconciliation() { const accountId = $('accountingReconciliationAccount')?.value === 'all' ? bankLedgerAccount()?.id : $('accountingReconciliationAccount')?.value; const asOf = $('accountingReconciliationDate')?.value || today(); const statement = num($('accountingStatementBalance')?.value); const erpBalance = ledgerByAccountFor(state.ledgerEntries.filter(row => row.account_id === accountId && dateKey(row.entry_date) <= asOf), true).find(row => row.account.id === accountId)?.balance || 0; const row = { id: uid('recon'), bank_account_id: accountId, statement_date: asOf, statement_balance: statement, erp_balance: erpBalance, difference: erpBalance - statement, status: Math.abs(erpBalance - statement) < 0.01 ? 'matched':'difference', reconciled_by: authName(), notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; state.bankReconciliations.push(row); try { await upsertRemote(TABLES.bankReconciliations,row); } catch(error) { state.dataSource='local'; console.warn('[Accounting] reconciliation save failed', error); } await recordAudit('save_reconciliation','bank_reconciliation',row.id,`Saved bank reconciliation with difference ${money(row.difference)}.`,{}); saveLocal(); toast('Reconciliation saved.'); render(); }

  function renderReconciliationTable() { const rows = state.bankReconciliations.slice().sort((a,b)=>String(b.statement_date||'').localeCompare(String(a.statement_date||''))); if (!rows.length) return '<div class="accounting-empty">No saved reconciliations yet.</div>'; return `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Account</th><th class="num">ERP</th><th class="num">Statement</th><th class="num">Difference</th><th>Status</th><th>By</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${fmtDate(row.statement_date)}</td><td>${esc(accountById(row.bank_account_id)?.account_name || accountById(row.bank_account_id)?.account_code || '—')}</td><td class="num">${money(row.erp_balance)}</td><td class="num">${money(row.statement_balance)}</td><td class="num">${money(row.difference)}</td><td><span class="accounting-badge ${Math.abs(num(row.difference))<0.01?'posted':'draft'}">${esc(row.status || 'saved')}</span></td><td>${esc(row.reconciled_by || '')}</td></tr>`).join('')}</tbody></table></div>`; }

  function renderAuditLog() {
    const search = norm(state.filters.advancedSearch);
    const rows = state.auditLog.filter(row => !search || norm([row.action,row.entity_type,row.entity_id,row.message,row.created_by].join(' ')).includes(search)).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0, 300);
    return `${renderAdvancedFilters('')} ${rows.length ? `<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr><th>Date</th><th>Action</th><th>Entity</th><th>Message</th><th>User</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${fmtDate(row.created_at)}</td><td><strong>${esc(row.action)}</strong></td><td>${esc(row.entity_type || '')}<div class="muted">${esc(row.entity_id || '')}</div></td><td>${esc(row.message || '')}</td><td>${esc(row.created_by || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="accounting-empty">No audit activity yet.</div>'}`;
  }

  async function recordAudit(action, entityType, entityId, message, metadata = {}) {
    const row = { id: uid('audit'), action, entity_type: entityType || '', entity_id: String(entityId || ''), message: message || '', metadata, created_by: authName(), created_at: new Date().toISOString() };
    state.auditLog.push(row);
    try { await upsertRemote(TABLES.auditLog, row); } catch (error) { state.dataSource = 'local'; }
    saveLocal();
    return row;
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
    const advancedSearch = $('accountingAdvancedSearch');
    if (advancedSearch) advancedSearch.addEventListener('input', event => { state.filters.advancedSearch = event.target.value || ''; render(); });
    const advancedFrom = $('accountingAdvancedFrom');
    if (advancedFrom) advancedFrom.addEventListener('change', event => { state.filters.expenseFrom = event.target.value || ''; render(); });
    const advancedTo = $('accountingAdvancedTo');
    if (advancedTo) advancedTo.addEventListener('change', event => { state.filters.expenseTo = event.target.value || ''; render(); });
    const expenseStatus = $('accountingExpenseStatus');
    if (expenseStatus) expenseStatus.addEventListener('change', event => { state.filters.expenseStatus = event.target.value || 'all'; render(); });
    const deferredStatus = $('accountingDeferredStatus');
    if (deferredStatus) deferredStatus.addEventListener('change', event => { state.filters.deferredStatus = event.target.value || 'pending'; render(); });
    const reconAccount = $('accountingReconciliationAccount');
    if (reconAccount) reconAccount.addEventListener('change', event => { state.filters.reconciliationAccountId = event.target.value || 'all'; render(); });
    const reconDate = $('accountingReconciliationDate');
    if (reconDate) reconDate.addEventListener('change', event => { state.filters.reconciliationDate = event.target.value || today(); render(); });
    const statementBalance = $('accountingStatementBalance');
    if (statementBalance) statementBalance.addEventListener('input', event => { state.filters.statementBalance = event.target.value || ''; render(); });
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
    if (status === 'posted' && isPeriodClosed(journal.entry_date)) return toast('This accounting period is closed. Reopen it before posting.');
    const jIdx = state.journals.findIndex(j => j.id === journal.id); if (jIdx >= 0) state.journals[jIdx] = journal; else state.journals.push(journal);
    state.journalLines = state.journalLines.filter(line => line.journal_id !== journal.id).concat(lines);
    if (status === 'posted') {
      state.ledgerEntries = state.ledgerEntries.filter(entry => entry.journal_id !== journal.id).concat(lines.map(line => ({ id: uid('ledger'), journal_id: journal.id, journal_line_id: line.id, journal_no: journal.journal_no, entry_date: journal.entry_date, account_id: line.account_id, account_code: line.account_code, account_name: line.account_name, debit: line.debit, credit: line.credit, currency: journal.currency, description: line.description || journal.description, reference_no: journal.reference_no, source_module: journal.source_module || 'manual_journal', source_id: null, source_reference: journal.source_reference || journal.journal_no, source_table: journal.source_table || 'accounting_journal_entries', source_label: 'Manual Journal', status: 'posted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })));
    }
    try { await upsertRemote(TABLES.journals, journal); await deleteRemote(TABLES.journalLines, 'journal_id', journal.id); await upsertRemote(TABLES.journalLines, lines); if (status === 'posted') { const ledgerRows = state.ledgerEntries.filter(entry => entry.journal_id === journal.id); await deleteRemote(TABLES.ledgerEntries, 'journal_id', journal.id); await upsertRemote(TABLES.ledgerEntries, ledgerRows); } }
    catch (error) { state.dataSource = 'local'; console.warn('[Accounting] journal remote save failed', error); toast('Journal saved locally. Run Accounting SQL migration to enable Supabase sync.'); }
    saveLocal(); state.editingJournalId = journal.id; state.journalLinesDraft = lines.map(line => ({ ...line })); await recordAudit(status === 'posted' ? 'post_manual_journal' : 'save_journal_draft', 'journal', journal.id, `${status === 'posted' ? 'Posted' : 'Saved'} journal ${journal.journal_no}.`, { totalDebit, totalCredit }); toast(status === 'posted' ? 'Journal posted and ledger updated.' : 'Journal saved as draft.'); render();
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
    const advancedTab = event.target.closest('[data-accounting-advanced-tab]');
    if (advancedTab) { state.activeAdvancedTab = advancedTab.getAttribute('data-accounting-advanced-tab') || 'deferred_revenue'; render(); return; }
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
      if (action === 'clear-advanced-filters') { state.filters.advancedSearch = ''; state.filters.expenseFrom = ''; state.filters.expenseTo = ''; state.filters.expenseStatus = 'all'; state.filters.deferredStatus = 'pending'; render(); return; }
      if (action === 'recognize-due-revenue') { recognizeDueRevenue(); return; }
      if (action === 'export-deferred-revenue') { exportCsv('accounting_deferred_revenue_schedule.csv', filteredRevenueSchedules()); return; }
      if (action === 'reset-expense-form' || action === 'reset-tax-form' || action === 'reset-cost-center-form' || action === 'reset-closing-form') { render(); return; }
      if (action === 'save-reconciliation') { saveReconciliation(); return; }
    }
    const generateScheduleBtn = event.target.closest('[data-accounting-generate-schedule]');
    if (generateScheduleBtn) { generateRevenueScheduleForInvoice(sourceByKey('invoices', generateScheduleBtn.getAttribute('data-accounting-generate-schedule')), true); return; }
    const recognizeRevenueBtn = event.target.closest('[data-accounting-recognize-revenue]');
    if (recognizeRevenueBtn) { recognizeRevenueSchedule(state.revenueSchedules.find(row => row.id === recognizeRevenueBtn.getAttribute('data-accounting-recognize-revenue'))); return; }
    const postExpenseBtn = event.target.closest('[data-accounting-post-expense]');
    if (postExpenseBtn) { postExpense(postExpenseBtn.getAttribute('data-accounting-post-expense')); return; }
    const editExpenseBtn = event.target.closest('[data-accounting-edit-expense]');
    if (editExpenseBtn) { editExpense(editExpenseBtn.getAttribute('data-accounting-edit-expense')); return; }
    const editTaxBtn = event.target.closest('[data-accounting-edit-tax]');
    if (editTaxBtn) { editTax(editTaxBtn.getAttribute('data-accounting-edit-tax')); return; }
    const editCostCenterBtn = event.target.closest('[data-accounting-edit-cost-center]');
    if (editCostCenterBtn) { editCostCenter(editCostCenterBtn.getAttribute('data-accounting-edit-cost-center')); return; }
    const editClosingBtn = event.target.closest('[data-accounting-edit-closing]');
    if (editClosingBtn) { editClosing(editClosingBtn.getAttribute('data-accounting-edit-closing')); return; }
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
      : state.activeTab === 'advanced' ? renderAdvanced()
      : renderDashboard();
    root.innerHTML = shell(body);
    bindFilters();
    const accountForm = $('accountingAccountForm'); if (accountForm) accountForm.addEventListener('submit', event => { event.preventDefault(); saveAccountForm(); });
    const bankForm = $('accountingBankForm'); if (bankForm) bankForm.addEventListener('submit', event => { event.preventDefault(); saveBankForm(); });
    const expenseForm = $('accountingExpenseForm'); if (expenseForm) expenseForm.addEventListener('submit', event => { event.preventDefault(); saveExpenseForm(); });
    const taxForm = $('accountingTaxForm'); if (taxForm) taxForm.addEventListener('submit', event => { event.preventDefault(); saveTaxForm(); });
    const costCenterForm = $('accountingCostCenterForm'); if (costCenterForm) costCenterForm.addEventListener('submit', event => { event.preventDefault(); saveCostCenterForm(); });
    const closingForm = $('accountingClosingForm'); if (closingForm) closingForm.addEventListener('submit', event => { event.preventDefault(); saveClosingForm(); });
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
