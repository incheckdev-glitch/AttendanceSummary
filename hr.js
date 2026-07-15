(function initHRModule(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_hr_admin_only_v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const currentMonth = () => today().slice(0, 7);
  const uid = prefix => (global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const num = value => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = value => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : '—';
  const monthName = value => value ? new Date(`${String(value).slice(0,7)}-01T00:00:00`).toLocaleDateString(undefined, { month:'long', year:'numeric' }) : '—';
  const authProfile = () => global.Session?.authContext?.()?.profile || {};
  const authName = () => global.Session?.displayName?.() || authProfile()?.full_name || authProfile()?.email || 'Admin';

  const ADMIN_ROLES = new Set(['admin']);
  function isAdmin() {
    const role = norm(authProfile()?.role_key || authProfile()?.role || authProfile()?.user_role || global.Session?.role?.() || '');
    return ADMIN_ROLES.has(role) || Boolean(global.Permissions?.hasAdminOverride?.());
  }

  const TABLES = {
    employees: 'hr_employees',
    shifts: 'hr_shifts',
    attendance: 'hr_attendance',
    leaveRequests: 'hr_leave_requests',
    leaveTypes: 'hr_leave_types',
    leaveBalances: 'hr_leave_balances',
    holidays: 'hr_holidays',
    payrollRuns: 'hr_payroll_runs',
    payrollItems: 'hr_payroll_items',
    salaryReceipts: 'hr_salary_receipts',
    documents: 'hr_documents',
    hrNotifications: 'hr_notifications'
  };

  const HR_DOCUMENTS_BUCKET = 'hr-employee-documents';
  const MAX_DOCUMENT_PDF_SIZE = 10 * 1024 * 1024;

  const state = {
    initialized: false,
    activeTab: 'dashboard',
    dataSource: 'local',
    loading: false,
    selectedPayslip: '',
    filters: {
      globalEmployee: 'all', globalFrom: '', globalTo: '',
      employeeSearch: '', department: 'all', employeeStatus: 'active',
      attendanceDate: today(), attendanceDepartment: 'all',
      leaveStatus: 'all', balanceYear: String(new Date().getFullYear()),
      holidayYear: String(new Date().getFullYear()), payrollMonth: currentMonth(),
      payslipRunId: '', receiptMonth: currentMonth(), receiptEmployee: 'all', receiptFrom: '', receiptTo: '', documentStatus: 'all', statementStatus: 'All'
    },
    employees: [], shifts: [], attendance: [], leaveRequests: [], leaveTypes: [], leaveBalances: [], holidays: [],
    payrollRuns: [], payrollItems: [], salaryReceipts: [], documents: [], hrNotifications: []
  };

  function client() {
    try { return global.SupabaseClient?.getClient?.() || null; }
    catch { return null; }
  }

  function toast(message) { global.UI?.toast?.(message); }

  function defaultShift() {
    return {
      id: uid('shift'), name: 'Office Shift', start_time: '09:00', end_time: '18:00', grace_minutes: 0,
      break_minutes: 60, working_days: 'Mon,Tue,Wed,Thu,Fri', weekend_days: 'Sat,Sun', overtime_rate: 1.5,
      late_deduction_per_minute: 0, early_leave_deduction_per_minute: 0, is_active: true, created_at: new Date().toISOString()
    };
  }

  function defaultLeaveTypes() {
    return [
      { id: uid('lt'), name: 'Annual Leave', paid: true, yearly_balance: 15, monthly_accrual: 1.25, deduct_transportation: true, requires_document: false, is_active: true },
      { id: uid('lt'), name: 'Sick Leave', paid: true, yearly_balance: 0, monthly_accrual: 0, deduct_transportation: true, requires_document: true, is_active: true },
      { id: uid('lt'), name: 'Emergency Leave', paid: true, yearly_balance: 0, monthly_accrual: 0, deduct_transportation: true, requires_document: false, is_active: true },
      { id: uid('lt'), name: 'Unpaid Leave', paid: false, yearly_balance: 0, monthly_accrual: 0, deduct_transportation: true, requires_document: false, is_active: true }
    ];
  }

  function buildSampleData() {
    const shift = defaultShift();
    return {
      shifts: [shift],
      leaveTypes: defaultLeaveTypes(),
      employees: [{
        id: uid('emp'), employee_no: 'EMP-0001', full_name: 'Sample Employee', email: 'employee@incheck360.nl', phone: '',
        department: 'Operations', job_title: 'Operations Coordinator', manager_name: '', employment_type: 'Full-time', joining_date: `${new Date().getFullYear()}-01-01`,
        status: 'active', work_location: 'Office', shift_id: shift.id, base_salary: 1500, currency: 'USD', allowances: 0,
        transportation_monthly: 100, transportation_per_day: 0, fixed_deductions: 0, payment_method: 'Bank Transfer', bank_name: '', bank_account: '', salary_effective_date: `${new Date().getFullYear()}-01-01`, created_at: new Date().toISOString()
      }],
      attendance: [], leaveRequests: [], leaveBalances: [], holidays: [], payrollRuns: [], payrollItems: [], salaryReceipts: [], documents: [], hrNotifications: []
    };
  }

  function plainState() {
    return {
      employees: state.employees, shifts: state.shifts, attendance: state.attendance, leaveRequests: state.leaveRequests,
      leaveTypes: state.leaveTypes, leaveBalances: state.leaveBalances, holidays: state.holidays, payrollRuns: state.payrollRuns,
      payrollItems: state.payrollItems, salaryReceipts: state.salaryReceipts, documents: state.documents, hrNotifications: state.hrNotifications
    };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plainState())); }
    catch (error) { console.warn('[HR] local save failed', error); }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { Object.assign(state, buildSampleData(), JSON.parse(raw)); return; }
    } catch (error) { console.warn('[HR] local load failed', error); }
    Object.assign(state, buildSampleData());
    saveLocal();
  }

  async function fetchTable(tableName, orderColumn = 'created_at', ascending = false) {
    const supabase = client();
    if (!supabase) throw new Error('Supabase client unavailable');
    let query = supabase.from(tableName).select('*').limit(5000);
    if (orderColumn) query = query.order(orderColumn, { ascending, nullsFirst: false });
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadRemote() {
    const [employees, shifts, attendance, leaveRequests, leaveTypes, leaveBalances, holidays, payrollRuns, payrollItems, salaryReceipts, documents, hrNotifications] = await Promise.all([
      fetchTable(TABLES.employees, 'employee_no', true),
      fetchTable(TABLES.shifts, 'name', true),
      fetchTable(TABLES.attendance, 'attendance_date', false),
      fetchTable(TABLES.leaveRequests, 'created_at', false),
      fetchTable(TABLES.leaveTypes, 'name', true),
      fetchTable(TABLES.leaveBalances, 'year', false),
      fetchTable(TABLES.holidays, 'holiday_date', true),
      fetchTable(TABLES.payrollRuns, 'payroll_month', false),
      fetchTable(TABLES.payrollItems, 'created_at', false),
      fetchTable(TABLES.salaryReceipts, 'payment_date', false),
      fetchTable(TABLES.documents, 'expiry_date', true),
      fetchTable(TABLES.hrNotifications, 'created_at', false)
    ]);
    Object.assign(state, { employees, shifts, attendance, leaveRequests, leaveTypes, leaveBalances, holidays, payrollRuns, payrollItems, salaryReceipts, documents, hrNotifications, dataSource: 'supabase' });
    if (!state.shifts.length) state.shifts = [defaultShift()];
    if (!state.leaveTypes.length) state.leaveTypes = defaultLeaveTypes();
    saveLocal();
  }

  const pendingHrWrites = new Set();

  function restoreConfirmedHrCache() {
    loadLocal();
    state.dataSource = 'cache';
  }

  async function syncUpsert(table, row, options = {}) {
    const writeKey = `${table}:${row?.id || 'new'}`;
    if (pendingHrWrites.has(writeKey)) {
      if (options.notify !== false) toast('This HR save is already in progress.');
      throw new Error('Duplicate HR write blocked');
    }
    pendingHrWrites.add(writeKey);
    const supabase = client();
    try {
      if (!supabase) throw new Error('Supabase client unavailable');
      const { data, error } = await supabase.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
      if (error) throw error;
      state.dataSource = 'supabase';
      if (options.cache !== false) saveLocal();
      return data || row;
    } catch (error) {
      restoreConfirmedHrCache();
      console.error(`[HR] Database did not confirm upsert for ${table}`, error);
      if (options.notify !== false) toast('HR was not saved. The database did not confirm the change. Check your connection and try again.');
      throw error;
    } finally {
      pendingHrWrites.delete(writeKey);
    }
  }

  async function syncDelete(table, id, options = {}) {
    const writeKey = `${table}:${id}:delete`;
    if (pendingHrWrites.has(writeKey)) {
      if (options.notify !== false) toast('This HR deletion is already in progress.');
      throw new Error('Duplicate HR delete blocked');
    }
    pendingHrWrites.add(writeKey);
    const supabase = client();
    try {
      if (!supabase) throw new Error('Supabase client unavailable');
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      state.dataSource = 'supabase';
      if (options.cache !== false) saveLocal();
    } catch (error) {
      restoreConfirmedHrCache();
      console.error(`[HR] Database did not confirm delete for ${table}`, error);
      if (options.notify !== false) toast('HR deletion failed. The database did not confirm the change.');
      throw error;
    } finally {
      pendingHrWrites.delete(writeKey);
    }
  }

  function statusChip(value) {
    const key = norm(value || 'active').replace(/\s+/g, '_');
    const cls = ['approved','paid','active','present','cleared'].includes(key) ? 'success' : ['pending','draft','reviewed','half_day','partial'].includes(key) ? 'warning' : ['rejected','absent','terminated','overdue','expired','unpaid'].includes(key) ? 'danger' : 'info';
    return `<span class="hr-chip ${cls}">${esc(String(value || '—').replace(/_/g, ' '))}</span>`;
  }

  function metric(label, value, sub) { return `<div class="hr-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub || '')}</small></div>`; }
  function empty(text) { return `<div class="hr-empty">${esc(text)}</div>`; }
  function getEmployee(id) { return state.employees.find(item => String(item.id) === String(id)) || null; }
  function getShift(id) { return state.shifts.find(item => String(item.id) === String(id)) || state.shifts[0] || defaultShift(); }

  function employeeNo() {
    const max = state.employees.reduce((highest, emp) => {
      const match = String(emp.employee_no || '').match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `EMP-${String(max + 1).padStart(4, '0')}`;
  }

  function dateObj(value) { return new Date(`${String(value).slice(0,10)}T00:00:00`); }
  function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function daysInMonth(month) { const [y, m] = String(month).split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function monthBounds(month) { return { first: `${month}-01`, last: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` }; }
  function dateInRange(date, start, end) { return String(date || '') >= String(start || '') && String(date || '') <= String(end || ''); }

  function isWeekend(dateValue, shift = state.shifts[0]) {
    const weekend = new Set(String(shift?.weekend_days || 'Sat,Sun').split(',').map(s => s.trim().slice(0,3)));
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return weekend.has(names[dateObj(dateValue).getDay()]);
  }

  function holidayForDate(dateValue) {
    return state.holidays.find(row => String(row.holiday_date).slice(0,10) === String(dateValue).slice(0,10)) || null;
  }

  function isWorkingDay(dateValue, shift = state.shifts[0]) {
    if (isWeekend(dateValue, shift)) return false;
    if (holidayForDate(dateValue)) return false;
    return true;
  }

  function workingDaysInMonth(month, shift = state.shifts[0]) {
    const bounds = monthBounds(month);
    let count = 0;
    for (let d = dateObj(bounds.first); isoDate(d) <= bounds.last; d = addDays(d, 1)) {
      if (isWorkingDay(isoDate(d), shift)) count += 1;
    }
    return count;
  }

  function businessDaysBetween(start, end, shift = state.shifts[0]) {
    if (!start || !end || String(end) < String(start)) return 0;
    let count = 0;
    for (let d = dateObj(start); isoDate(d) <= String(end); d = addDays(d, 1)) {
      if (isWorkingDay(isoDate(d), shift)) count += 1;
    }
    return count;
  }

  function leaveDaysInRange(leave, start, end) {
    const s = String(leave.start_date || '') < start ? start : String(leave.start_date || '');
    const e = String(leave.end_date || '') > end ? end : String(leave.end_date || '');
    if (!s || !e || e < start || s > end) return 0;
    return businessDaysBetween(s, e, getShift(getEmployee(leave.employee_id)?.shift_id));
  }

  function approvedLeavesForDate(employeeId, dateValue) {
    return state.leaveRequests.filter(row => String(row.employee_id) === String(employeeId) && norm(row.status) === 'approved' && dateInRange(dateValue, row.start_date, row.end_date));
  }

  function attendanceException(employeeId, dateValue) {
    return state.attendance.find(row => String(row.employee_id) === String(employeeId) && String(row.attendance_date).slice(0,10) === String(dateValue).slice(0,10)) || null;
  }

  function computedDayStatus(emp, dateValue) {
    const shift = getShift(emp.shift_id);
    if (isWeekend(dateValue, shift)) return { status: 'weekend', label: 'Weekend', transport: false, source: 'Saturday/Sunday' };
    const holiday = holidayForDate(dateValue);
    if (holiday) return { status: 'holiday', label: holiday.name || 'Holiday', transport: false, source: 'Holiday calendar' };
    const leaves = approvedLeavesForDate(emp.id, dateValue);
    if (leaves.length) return { status: 'on_leave', label: leaves[0].leave_type || 'Leave', transport: false, source: 'Approved leave' };
    const exception = attendanceException(emp.id, dateValue);
    if (exception) return { status: exception.status || 'present', label: exception.status || 'present', transport: !['absent','half_day','on_leave'].includes(norm(exception.status)), source: 'Admin manual' };
    return { status: 'present', label: 'Present', transport: true, source: 'Default working day' };
  }

  function leaveTypeByName(name) {
    return state.leaveTypes.find(type => norm(type.name) === norm(name)) || { name: name || 'Leave', paid: true, yearly_balance: 0, monthly_accrual: 0, deduct_transportation: true };
  }

  function annualLeaveAccrued(year) {
    const y = Number(year) || new Date().getFullYear();
    const now = new Date();
    const currentYear = now.getFullYear();
    const months = y < currentYear ? 12 : (y > currentYear ? 0 : now.getMonth() + 1);
    return Number(Math.min(15, months * 1.25).toFixed(2));
  }

  function usedLeaveDaysByType(employeeId, leaveType, year) {
    const first = `${year}-01-01`;
    const last = `${year}-12-31`;
    return state.leaveRequests.reduce((total, leave) => {
      if (String(leave.employee_id) !== String(employeeId)) return total;
      if (norm(leave.status) !== 'approved') return total;
      if (norm(leave.leave_type) !== norm(leaveType)) return total;
      return total + leaveDaysInRange(leave, first, last);
    }, 0);
  }

  function leaveBalanceFor(employeeId, leaveTypeName, year = state.filters.balanceYear) {
    const type = leaveTypeByName(leaveTypeName);
    const manual = state.leaveBalances.find(row => String(row.employee_id) === String(employeeId) && norm(row.leave_type) === norm(leaveTypeName) && String(row.year) === String(year)) || {};
    const hasManualEntitlement = manual.entitlement_days !== null && manual.entitlement_days !== undefined && manual.entitlement_days !== '';
    const defaultEntitlement = norm(leaveTypeName) === 'annual leave' ? annualLeaveAccrued(year) : num(type.yearly_balance);
    const entitlement = hasManualEntitlement ? num(manual.entitlement_days) : defaultEntitlement;
    const carry = num(manual.carry_forward_days);
    const adjustment = num(manual.adjustment_days);
    const used = usedLeaveDaysByType(employeeId, leaveTypeName, year);
    return { entitlement, carry, adjustment, used, remaining: Number((entitlement + carry + adjustment - used).toFixed(2)), paid: type.paid !== false };
  }

  function leaveStats(employeeId, month) {
    const bounds = monthBounds(month);
    return state.leaveRequests.reduce((acc, leave) => {
      if (String(leave.employee_id) !== String(employeeId)) return acc;
      if (norm(leave.status) !== 'approved') return acc;
      const days = leaveDaysInRange(leave, bounds.first, bounds.last);
      if (!days) return acc;
      acc.total += days;
      if (leave.paid === false) acc.unpaid += days; else acc.paid += days;
      acc.transportDeduct += leave.deduct_transportation === false ? 0 : days;
      const key = norm(leave.leave_type).replace(/\s+/g, '_');
      acc.byType[key] = (acc.byType[key] || 0) + days;
      return acc;
    }, { total: 0, paid: 0, unpaid: 0, transportDeduct: 0, byType: {} });
  }

  function manualAbsenceStats(employeeId, month) {
    return state.attendance.reduce((acc, row) => {
      if (String(row.employee_id) !== String(employeeId)) return acc;
      if (String(row.attendance_date || '').slice(0,7) !== month) return acc;
      if (!isWorkingDay(row.attendance_date, getShift(getEmployee(employeeId)?.shift_id))) return acc;
      if (approvedLeavesForDate(employeeId, row.attendance_date).length) return acc;
      const status = norm(row.status);
      if (status === 'absent') { acc.absent += 1; acc.transportDeduct += 1; }
      if (status === 'half_day') { acc.half += 1; acc.transportDeduct += 0.5; }
      return acc;
    }, { absent: 0, half: 0, transportDeduct: 0 });
  }

  function receiptsForItem(itemId) { return state.salaryReceipts.filter(row => String(row.payroll_item_id) === String(itemId)); }
  function receiptPaidAmount(itemId) { return receiptsForItem(itemId).reduce((sum, row) => sum + num(row.amount), 0); }
  function receiptStatus(item) {
    const paid = receiptPaidAmount(item.id);
    const remaining = Math.max(0, num(item.net_salary) - paid);
    if (paid <= 0) return { paid, remaining, status: 'unpaid' };
    if (remaining > 0.004) return { paid, remaining, status: 'partial' };
    return { paid, remaining: 0, status: 'paid' };
  }


  function displayPaymentStatus(item) {
    const rs = receiptStatus(item);
    if (rs.status === 'paid') return 'Paid';
    if (rs.status === 'partial') return 'Partially Paid';
    return 'Unpaid';
  }

  function payrollMonthDate(month) {
    const value = String(month || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : today();
  }

  function documentTitle(row) {
    return row?.document_title || row?.document_name || row?.document_type || 'Employee Document';
  }

  function documentExpiryStatus(row) {
    if (norm(row?.status) === 'missing') return 'missing';
    const expiry = String(row?.expiry_date || '').slice(0, 10);
    if (!expiry) return row?.file_path || row?.file_url ? 'valid' : (row?.status || 'valid');
    const now = today();
    if (expiry < now) return 'expired';
    const warning = isoDate(addDays(dateObj(now), 30));
    if (expiry <= warning) return 'expiring soon';
    return row?.status || 'valid';
  }

  function documentFileStatus(row) {
    return row?.file_path || row?.file_url ? 'PDF uploaded' : 'No file uploaded';
  }

  function receiptNo() {
    const max = state.salaryReceipts.reduce((highest, row) => {
      const match = String(row.receipt_no || '').match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `HRR/${new Date().getFullYear()}/${String(max + 1).padStart(4, '0')}`;
  }

  async function pushHrNotification(title, message, type = 'info', entityType = '', entityId = '') {
    const row = { id: uid('hr-notify'), title, message, type, entity_type: entityType, entity_id: entityId, is_read: false, created_by: authName(), created_at: new Date().toISOString() };
    state.hrNotifications.unshift(row);
    await syncUpsert(TABLES.hrNotifications, row);
  }

  function latestPayrollRun() {
    const month = state.filters.payrollMonth;
    return state.payrollRuns.filter(run => run.payroll_month === month).sort((a,b) => String(b.generated_at || b.created_at || '').localeCompare(String(a.generated_at || a.created_at || '')))[0] || null;
  }

  function summarize() {
    const active = globalFilteredEmployees({ activeOnly: true });
    const date = state.filters.attendanceDate || today();
    const todayStats = active.map(emp => computedDayStatus(emp, date));
    const run = latestPayrollRun();
    const runItems = run ? state.payrollItems.filter(item => String(item.run_id) === String(run.id)) : [];
    return {
      activeEmployees: active.length,
      presentToday: todayStats.filter(s => norm(s.status) === 'present').length,
      absentToday: todayStats.filter(s => norm(s.status) === 'absent').length,
      onLeaveToday: todayStats.filter(s => norm(s.status) === 'on_leave').length,
      pendingLeaves: state.leaveRequests.filter(row => matchesGlobalEmployee(row.employee_id) && dateOverlapsGlobal(row.start_date, row.end_date) && norm(row.status).startsWith('pending')).length,
      payrollStatus: run?.status || 'not generated',
      netPayroll: runItems.reduce((sum, item) => sum + num(item.net_salary), 0),
      remainingPayroll: runItems.reduce((sum, item) => sum + receiptStatus(item).remaining, 0)
    };
  }

  function renderRoot() {
    const root = $('hrRoot');
    if (!root) return;
    if (!isAdmin()) {
      root.innerHTML = `<section class="hr-panel"><div class="hr-empty"><h3>HR admin access only</h3><p>This HR module is currently restricted to Admin only. Other roles can be added later from permissions.</p></div></section>`;
      return;
    }
    const readOnly = state.dataSource !== 'supabase';
    const source = readOnly
      ? '<span class="hr-chip warning">Read-only cache · database unavailable</span>'
      : '<span class="hr-chip success">Supabase synced</span>';
    root.innerHTML = `
      <div class="hr-page-header">
        <div>
          <span class="hr-eyebrow">Admin HR · Attendance · Payroll</span>
          <h2>HR & Payroll</h2>
          <p class="muted">Admin-only HR flow: fixed monthly salary, Sat/Sun off, holidays, approved leave, manual absences, monthly transport calculation, salary receipts and payslips.</p>
          <div>${source}</div>
        </div>
        <div class="hr-header-actions">
          <button id="hrRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="hrExportAttendanceBtn" class="btn ghost sm" type="button">Export Attendance</button>
          <button id="hrExportPayrollBtn" class="btn ghost sm" type="button">Export Payroll</button>
          <button id="hrNewEmployeeBtn" class="btn sm" type="button">New Employee</button>
        </div>
      </div>
      <nav class="hr-tabs" aria-label="HR sections">
        ${['dashboard','employees','attendance','leaves','leave_balances','holidays','payroll','payslips','salary_receipts','employee_statement','documents','settings'].map(tab => `<button type="button" class="${state.activeTab === tab ? 'active' : ''}" data-hr-tab="${tab}">${tabLabel(tab)}</button>`).join('')}
      </nav>
      ${readOnly ? '<div class="hr-source-banner" role="alert"><strong>Read-only mode.</strong> HR changes are disabled until Supabase reconnects. Cached records are shown for reference only.</div>' : ''}
      ${globalFilterBar()}
      <div id="hrSummary" class="hr-summary-grid"></div>
      <div id="hrBody"></div>
      ${modalMarkup()}
    `;
    renderSummary();
    renderBody();
    if (readOnly) {
      root.querySelectorAll('form input, form select, form textarea, form button').forEach(element => { element.disabled = true; });
      root.querySelectorAll('[data-hr-absent], [data-hr-halfday], [data-hr-clear-attendance], [data-hr-approve-leave], [data-hr-reject-leave], [data-hr-adjust-balance], [data-hr-payroll-status], [data-hr-add-receipt], [data-hr-edit-receipt], [data-hr-edit-document], [data-hr-remove-document-pdf]').forEach(element => { element.disabled = true; });
      const newEmployee = $('hrNewEmployeeBtn');
      if (newEmployee) newEmployee.disabled = true;
    }
  }

  function tabLabel(tab) {
    return ({ dashboard:'Dashboard', employees:'Employees', attendance:'Attendance', leaves:'Leave Management', leave_balances:'Leave Balance', holidays:'Holidays Calendar', payroll:'Monthly Payroll', payslips:'Payslips', salary_receipts:'Salary Receipts', employee_statement:'Employee Statement', documents:'Documents', settings:'HR Settings' })[tab] || tab;
  }

  function renderSummary() {
    const s = summarize();
    const target = $('hrSummary');
    if (!target) return;
    target.innerHTML = `
      ${metric('Employees', s.activeEmployees, 'Active employees')}
      ${metric('Today Present', s.presentToday, `${s.absentToday} absent · ${s.onLeaveToday} on leave`)}
      ${metric('Payroll', String(s.payrollStatus).replace(/_/g, ' '), `${money(s.netPayroll)} net`)}
      ${metric('Salary Rest', money(s.remainingPayroll), 'Unpaid from selected payroll')}
    `;
  }

  function renderBody() {
    const body = $('hrBody');
    if (!body) return;
    const renderers = { dashboard: renderDashboard, employees: renderEmployees, attendance: renderAttendance, leaves: renderLeaves, leave_balances: renderLeaveBalances, holidays: renderHolidays, payroll: renderPayroll, payslips: renderPayslips, salary_receipts: renderSalaryReceipts, employee_statement: renderEmployeeStatement, documents: renderDocuments, settings: renderSettings };
    body.innerHTML = (renderers[state.activeTab] || renderDashboard)();
  }

  function departmentOptions(selected = 'all') {
    const values = Array.from(new Set(state.employees.map(emp => emp.department).filter(Boolean))).sort();
    return `<option value="all">All departments</option>${values.map(value => `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
  }

  function employeeOptions(selected = '') {
    return `<option value="">Select employee...</option>${state.employees.map(emp => `<option value="${esc(emp.id)}" ${String(selected) === String(emp.id) ? 'selected' : ''}>${esc(emp.employee_no || '')} · ${esc(emp.full_name || '')}</option>`).join('')}`;
  }

  function globalEmployeeOptions(selected = 'all') {
    return `<option value="all" ${selected === 'all' ? 'selected' : ''}>All employees</option>${state.employees.map(emp => `<option value="${esc(emp.id)}" ${String(selected) === String(emp.id) ? 'selected' : ''}>${esc(emp.employee_no || '')} · ${esc(emp.full_name || '')}</option>`).join('')}`;
  }

  function matchesGlobalEmployee(employeeId) {
    return state.filters.globalEmployee === 'all' || String(employeeId || '') === String(state.filters.globalEmployee);
  }

  function selectedDateFrom() { return state.filters.globalFrom || ''; }
  function selectedDateTo() { return state.filters.globalTo || ''; }
  function globalRangeLabel() {
    if (selectedDateFrom() || selectedDateTo()) return `${selectedDateFrom() || 'Start'} → ${selectedDateTo() || 'Today'}`;
    return 'All dates';
  }

  function dateOverlapsGlobal(startDate, endDate = startDate) {
    const from = selectedDateFrom();
    const to = selectedDateTo();
    if (!from && !to) return true;
    const start = String(startDate || '').slice(0, 10);
    const end = String(endDate || startDate || '').slice(0, 10);
    if (!start && !end) return true;
    if (from && end && end < from) return false;
    if (to && start && start > to) return false;
    return true;
  }

  function monthInGlobalRange(month) {
    const value = String(month || '').slice(0, 7);
    if (!value) return true;
    return dateOverlapsGlobal(`${value}-01`, `${value}-${String(daysInMonth(value)).padStart(2, '0')}`);
  }

  function globalFilteredEmployees(options = {}) {
    const activeOnly = options.activeOnly !== false;
    return state.employees.filter(emp => {
      if (activeOnly && norm(emp.status || 'active') !== 'active') return false;
      return matchesGlobalEmployee(emp.id);
    });
  }

  function globalFilterBar() {
    return `<section class="hr-panel hr-global-filter-panel"><div class="hr-panel-head"><div><h3>HR Filters</h3><p class="muted">These filters apply across the HR tabs wherever employee/date data exists.</p></div><button class="btn ghost sm" type="button" data-hr-reset-global-filters>Clear Filters</button></div><div class="hr-filter-grid"><label><span class="muted">Employee</span><select id="hrGlobalEmployeeFilter" class="select">${globalEmployeeOptions(state.filters.globalEmployee)}</select></label><label><span class="muted">From date</span><input id="hrGlobalFrom" class="input" type="date" value="${esc(state.filters.globalFrom)}"></label><label><span class="muted">To date</span><input id="hrGlobalTo" class="input" type="date" value="${esc(state.filters.globalTo)}"></label><label><span class="muted">Active range</span><input class="input" readonly value="${esc(globalRangeLabel())}"></label></div></section>`;
  }

  function shiftOptions(selected = '') {
    return state.shifts.map(shift => `<option value="${esc(shift.id)}" ${String(selected) === String(shift.id) ? 'selected' : ''}>${esc(shift.name)}</option>`).join('');
  }

  function renderDashboard() {
    const s = summarize();
    const run = latestPayrollRun();
    const holidaysThisYear = state.holidays.filter(row => String(row.holiday_date || '').slice(0,4) === String(state.filters.holidayYear) && dateOverlapsGlobal(row.holiday_date)).length;
    return `
      <div class="hr-grid-2">
        <section class="hr-panel"><div class="hr-panel-head"><div><h3>Admin HR Overview</h3><p class="muted">No employee portal/check-in is enabled. Admin controls all HR records.</p></div></div>
          <div class="hr-dashboard-list">
            ${dashboardItem('Selected payroll month', monthName(state.filters.payrollMonth), run ? `Status: ${run.status}` : 'Not generated')}
            ${dashboardItem('Working days', workingDaysInMonth(state.filters.payrollMonth), 'Sat/Sun and holidays excluded')}
            ${dashboardItem('Pending leave requests', s.pendingLeaves, 'Admin can approve or edit directly')}
            ${dashboardItem('Holidays this year', holidaysThisYear, 'Calendar affects payroll working days')}
          </div>
        </section>
        <section class="hr-panel"><div class="hr-panel-head"><div><h3>Payroll Rules Active</h3><p class="muted">Current calculation method requested for your ERP.</p></div></div>
          <div class="hr-dashboard-list">
            ${dashboardItem('Monthly salary', 'Fixed', 'Basic salary is not reduced by missing check-in/out')}
            ${dashboardItem('Transport', 'Prorated', 'Monthly transport ÷ working days × eligible days')}
            ${dashboardItem('Default attendance', 'Present', 'Except holiday, weekend, approved leave, or admin-marked absent')}
            ${dashboardItem('Annual Leave', '15/year', 'Accrues 1.25 days per month')}
          </div>
        </section>
      </div>
      <section class="hr-panel"><div class="hr-panel-head"><div><h3>Recent HR Activity</h3><p class="muted">Payroll, leave and salary receipt activity.</p></div></div><div class="hr-dashboard-list">${notificationFeed(8)}</div></section>
    `;
  }

  function dashboardItem(title, value, sub) {
    return `<div class="hr-dashboard-item"><div><strong>${esc(title)}</strong><div class="muted">${esc(sub)}</div></div><span class="hr-chip info">${esc(value)}</span></div>`;
  }

  function notificationFeed(limit = 6) {
    const rows = state.hrNotifications.filter(row => dateOverlapsGlobal(row.created_at)).slice(0, limit);
    return rows.length ? rows.map(row => `<div class="hr-dashboard-item"><div><strong>${esc(row.title)}</strong><div class="muted">${esc(row.message || '')}</div></div><small>${fmtDate(row.created_at)}</small></div>`).join('') : empty('No HR activity yet.');
  }

  function filteredEmployees() {
    const search = norm(state.filters.employeeSearch);
    return state.employees.filter(emp => {
      if (!matchesGlobalEmployee(emp.id)) return false;
      if (state.filters.employeeStatus !== 'all' && norm(emp.status || 'active') !== state.filters.employeeStatus) return false;
      if (state.filters.department !== 'all' && emp.department !== state.filters.department) return false;
      if (!search) return true;
      return [emp.employee_no, emp.full_name, emp.email, emp.department, emp.job_title].some(value => norm(value).includes(search));
    });
  }

  function monthlyTransport(emp, month = state.filters.payrollMonth) {
    const monthly = num(emp.transportation_monthly ?? emp.transportation_allowance ?? emp.transportation_monthly_allowance ?? 0);
    if (monthly > 0) return monthly;
    const legacyPerDay = num(emp.transportation_per_day);
    return legacyPerDay > 0 ? legacyPerDay * workingDaysInMonth(month, getShift(emp.shift_id)) : 0;
  }

  function renderEmployees() {
    const rows = filteredEmployees();
    return `
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Employees</h3><p class="muted">Employee profile, fixed monthly salary, monthly transportation allowance, and payment info.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-employee">New Employee</button></div></div>
        <div class="hr-filter-grid"><input id="hrEmployeeSearch" class="input" placeholder="Search employee" value="${esc(state.filters.employeeSearch)}"><select id="hrDepartmentFilter" class="select">${departmentOptions(state.filters.department)}</select><select id="hrEmployeeStatusFilter" class="select"><option value="active" ${state.filters.employeeStatus === 'active' ? 'selected' : ''}>Active</option><option value="all" ${state.filters.employeeStatus === 'all' ? 'selected' : ''}>All statuses</option><option value="suspended" ${state.filters.employeeStatus === 'suspended' ? 'selected' : ''}>Suspended</option><option value="resigned" ${state.filters.employeeStatus === 'resigned' ? 'selected' : ''}>Resigned</option><option value="terminated" ${state.filters.employeeStatus === 'terminated' ? 'selected' : ''}>Terminated</option></select></div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Department</th><th>Shift</th><th>Salary</th><th>Transport</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(employeeRow).join('') : `<tr><td colspan="7">${empty('No employees found.')}</td></tr>`}</tbody></table></div>
      </section>
    `;
  }

  function employeeRow(emp) {
    const shift = getShift(emp.shift_id);
    const transport = monthlyTransport(emp);
    const perDay = workingDaysInMonth(state.filters.payrollMonth, shift) ? transport / workingDaysInMonth(state.filters.payrollMonth, shift) : 0;
    return `<tr><td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')} · ${esc(emp.email || '')}</div></td><td>${esc(emp.department || '—')}<div class="muted">${esc(emp.job_title || '')}</div></td><td>${esc(shift.name || '—')}<div class="muted">Mon-Fri · Sat/Sun off</div></td><td>${money(emp.base_salary, emp.currency)}<div class="muted">Allowances ${money(emp.allowances, emp.currency)}</div></td><td>${money(transport, emp.currency)}<div class="muted">≈ ${money(perDay, emp.currency)} / working day</div></td><td>${statusChip(emp.status || 'active')}</td><td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-edit-employee="${esc(emp.id)}">Edit</button><button class="btn ghost xs" type="button" data-hr-attendance-employee="${esc(emp.id)}">Attendance</button></div></td></tr>`;
  }

  function attendanceDatesForCurrentFilters() {
    const from = selectedDateFrom();
    const to = selectedDateTo();
    if (!from && !to) return [state.filters.attendanceDate || today()];
    const start = from || to || today();
    const end = to || from || start;
    const dates = [];
    for (let d = dateObj(start); isoDate(d) <= end && dates.length < 370; d = addDays(d, 1)) dates.push(isoDate(d));
    return dates;
  }

  function renderAttendance() {
    const employees = state.employees.filter(emp => norm(emp.status || 'active') === 'active' && matchesGlobalEmployee(emp.id) && (state.filters.attendanceDepartment === 'all' || emp.department === state.filters.attendanceDepartment));
    const dates = attendanceDatesForCurrentFilters();
    const rows = [];
    employees.forEach(emp => dates.forEach(date => rows.push({ emp, date })));
    return `
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Attendance</h3><p class="muted">No check-in/check-out. Employees are present by default on working days unless leave/holiday/weekend or admin marks absent. Global date range shows a full range; otherwise this tab uses the selected attendance date.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-attendance">Add Manual Status</button></div></div>
        <div class="hr-filter-grid"><input id="hrAttendanceDate" class="input" type="date" value="${esc(state.filters.attendanceDate)}"><select id="hrAttendanceDepartmentFilter" class="select">${departmentOptions(state.filters.attendanceDepartment)}</select></div>
        <div class="hr-source-banner">Showing ${esc(String(rows.length))} attendance row(s) for ${esc(globalRangeLabel())}.</div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Date</th><th>Status</th><th>Source</th><th>Transport</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(row => attendanceRow(row.emp, row.date)).join('') : `<tr><td colspan="7">${empty('No active employees found for the selected filters.')}</td></tr>`}</tbody></table></div>
      </section>
    `;
  }

  function attendanceRow(emp, dateValue = state.filters.attendanceDate) {
    const computed = computedDayStatus(emp, dateValue);
    const manual = attendanceException(emp.id, dateValue);
    return `<tr><td><strong>${esc(emp.full_name)}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>${fmtDate(dateValue)}</td><td>${statusChip(computed.status)}<div class="muted">${esc(computed.label)}</div></td><td>${esc(computed.source)}</td><td>${computed.transport ? 'Eligible' : 'Not eligible'}</td><td>${esc(manual?.notes || '')}</td><td><div class="hr-row-actions">${manual ? `<button class="btn ghost xs" type="button" data-hr-edit-attendance="${esc(manual.id)}">Edit</button><button class="btn ghost xs" type="button" data-hr-clear-attendance="${esc(manual.id)}">Clear</button>` : isWorkingDay(dateValue, getShift(emp.shift_id)) ? `<button class="btn ghost xs" type="button" data-hr-absent="${esc(emp.id)}" data-hr-absent-date="${esc(dateValue)}">Mark Absent</button><button class="btn ghost xs" type="button" data-hr-halfday="${esc(emp.id)}" data-hr-halfday-date="${esc(dateValue)}">Half Day</button>` : `<span class="muted">Auto</span>`}</div></td></tr>`;
  }

  function renderLeaves() {
    const rows = state.leaveRequests.filter(row => matchesGlobalEmployee(row.employee_id) && dateOverlapsGlobal(row.start_date, row.end_date) && (state.filters.leaveStatus === 'all' || norm(row.status) === state.filters.leaveStatus));
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Leave Management</h3><p class="muted">Admin creates/approves leave. Approved leave is automatically reflected in attendance and payroll transport deduction.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-leave">New Leave</button></div></div><div class="hr-filter-grid"><select id="hrLeaveStatusFilter" class="select"><option value="all">All leave statuses</option>${['pending','approved','rejected','cancelled'].map(s => `<option value="${s}" ${state.filters.leaveStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Working Days</th><th>Paid</th><th>Transport</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(leaveRow).join('') : `<tr><td colspan="8">${empty('No leave requests found.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function leaveRow(row) {
    const emp = getEmployee(row.employee_id) || {};
    return `<tr><td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(row.leave_type || '—')}<div class="muted">${esc(row.reason || '')}</div></td><td>${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}</td><td>${num(row.days)}</td><td>${row.paid === false ? 'No' : 'Yes'}</td><td>${row.deduct_transportation === false ? 'Paid' : 'Deducted'}</td><td>${statusChip(row.status)}</td><td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-edit-leave="${esc(row.id)}">Edit</button>${norm(row.status) !== 'approved' ? `<button class="btn ghost xs" type="button" data-hr-approve-leave="${esc(row.id)}">Approve</button>` : ''}<button class="btn ghost xs" type="button" data-hr-reject-leave="${esc(row.id)}">Reject</button></div></td></tr>`;
  }

  function renderLeaveBalances() {
    const year = state.filters.balanceYear;
    const rows = [];
    state.employees.filter(emp => norm(emp.status || 'active') === 'active' && matchesGlobalEmployee(emp.id)).forEach(emp => state.leaveTypes.forEach(type => rows.push({ emp, type, balance: leaveBalanceFor(emp.id, type.name, year) })));
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Leave Balance</h3><p class="muted">Annual leave accrues 1.25 days/month, 15 days/year. Admin can always adjust entitlement, carry-forward, and adjustment days.</p></div><div class="hr-toolbar"><input id="hrBalanceYear" class="input" type="number" min="2020" max="2100" value="${esc(year)}"></div></div><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Leave Type</th><th>Entitlement</th><th>Carry</th><th>Adjustment</th><th>Used</th><th>Remaining</th><th>Action</th></tr></thead><tbody>${rows.length ? rows.map(({emp,type,balance}) => `<tr><td><strong>${esc(emp.full_name)}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(type.name)}${norm(type.name) === 'annual leave' ? '<div class="muted">1.25/month accrual</div>' : ''}</td><td>${num(balance.entitlement)}</td><td>${num(balance.carry)}</td><td>${num(balance.adjustment)}</td><td>${num(balance.used)}</td><td><strong>${num(balance.remaining)}</strong></td><td><button class="btn ghost xs" type="button" data-hr-adjust-balance="${esc(emp.id)}" data-leave-type="${esc(type.name)}">Adjust</button></td></tr>`).join('') : `<tr><td colspan="8">${empty('No balance rows found.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function renderHolidays() {
    const rows = state.holidays.filter(row => String(row.holiday_date || '').slice(0,4) === String(state.filters.holidayYear) && dateOverlapsGlobal(row.holiday_date)).sort((a,b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Holidays Calendar</h3><p class="muted">Holidays are excluded from monthly working days and transport calculation.</p></div><div class="hr-toolbar"><input id="hrHolidayYear" class="input" type="number" min="2020" max="2100" value="${esc(state.filters.holidayYear)}"><button class="btn sm" type="button" data-hr-action="new-holiday">Add Holiday</button></div></div><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Name</th><th>Country</th><th>Paid</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td>${fmtDate(row.holiday_date)}</td><td><strong>${esc(row.name)}</strong></td><td>${esc(row.country || '')}</td><td>${row.is_paid === false ? 'No' : 'Yes'}</td><td>${esc(row.notes || '')}</td><td><button class="btn ghost xs" type="button" data-hr-edit-holiday="${esc(row.id)}">Edit</button></td></tr>`).join('') : `<tr><td colspan="6">${empty('No holidays added for this year.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function calculatePayrollItem(emp, run) {
    const shift = getShift(emp.shift_id);
    const month = run.payroll_month;
    const working = workingDaysInMonth(month, shift);
    const leave = leaveStats(emp.id, month);
    const abs = manualAbsenceStats(emp.id, month);
    const transportMonthly = monthlyTransport(emp, month);
    const transportPerDay = working > 0 ? transportMonthly / working : 0;
    const transportDeductDays = Math.min(working, leave.transportDeduct + abs.transportDeduct);
    const transportDays = Math.max(0, working - transportDeductDays);
    const transportationAllowance = transportDays * transportPerDay;
    const transportationDeduction = Math.max(0, transportMonthly - transportationAllowance);
    const presentDays = Math.max(0, working - leave.total - abs.absent - (abs.half * 0.5));
    const fixedSalary = num(emp.base_salary);
    const fixedAllowances = num(emp.allowances);
    const fixedDeductions = num(emp.fixed_deductions);
    const gross = fixedSalary + fixedAllowances + transportationAllowance;
    const deductions = fixedDeductions;
    const net = Math.max(0, gross - deductions);
    return {
      id: uid('pay-item'), run_id: run.id, employee_id: emp.id, currency: emp.currency || run.currency || 'USD',
      working_days: working, present_days: Number(presentDays.toFixed(2)), absent_days: Number((abs.absent + (abs.half * 0.5)).toFixed(2)), paid_leave_days: Number(leave.paid.toFixed(2)), unpaid_leave_days: Number(leave.unpaid.toFixed(2)),
      late_minutes: 0, overtime_hours: 0, detected_overtime_hours: 0, basic_salary: fixedSalary, daily_rate: working > 0 ? Number((fixedSalary / working).toFixed(2)) : 0, allowances: fixedAllowances,
      transportation_monthly: Number(transportMonthly.toFixed(2)), transportation_per_day: Number(transportPerDay.toFixed(2)), transportation_days: Number(transportDays.toFixed(2)), transportation_allowance: Number(transportationAllowance.toFixed(2)), transportation_deduction: Number(transportationDeduction.toFixed(2)), leave_transport_deduct_days: Number(leave.transportDeduct.toFixed(2)), leave_transport_paid_days: 0,
      overtime_amount: 0, absence_deduction: 0, late_deduction: 0, early_leave_deduction: 0, fixed_deductions: fixedDeductions, deductions: Number(deductions.toFixed(2)), gross_salary: Number(gross.toFixed(2)), net_salary: Number(net.toFixed(2)), paid_amount: 0, remaining_amount: Number(net.toFixed(2)), status: 'draft',
      notes: `Fixed monthly salary. Transport ${transportMonthly} ÷ ${working} working days = ${transportPerDay.toFixed(2)} per day. Transport deducted for approved leave/sick/manual absent days only.`,
      details: { transport_deduct_days: transportDeductDays, leave_by_type: leave.byType }, created_at: new Date().toISOString()
    };
  }

  async function generatePayroll() {
    const month = state.filters.payrollMonth;
    const run = { id: uid('pay-run'), payroll_month: month, status:'draft', currency:'USD', generated_at: new Date().toISOString(), generated_by: authName(), created_at: new Date().toISOString() };
    const previousRuns = state.payrollRuns.filter(item => item.payroll_month === month).map(item => item.id);
    state.payrollRuns = state.payrollRuns.filter(item => !previousRuns.includes(item.id));
    state.payrollItems = state.payrollItems.filter(item => !previousRuns.includes(item.run_id));
    for (const oldRunId of previousRuns) await syncDelete(TABLES.payrollRuns, oldRunId);
    state.payrollRuns.unshift(run);
    const items = state.employees.filter(emp => norm(emp.status || 'active') === 'active').map(emp => calculatePayrollItem(emp, run));
    state.payrollItems.unshift(...items);
    await syncUpsert(TABLES.payrollRuns, run);
    for (const item of items) await syncUpsert(TABLES.payrollItems, item);
    state.selectedPayslip = items[0]?.id || '';
    await pushHrNotification('Payroll generated', `${monthName(month)} · ${items.length} employees`, 'payroll', 'payroll_run', run.id);
    renderRoot(); toast('Monthly payroll generated.');
  }

  async function setPayrollStatus(status) {
    const run = latestPayrollRun();
    if (!run) return;
    run.status = status;
    if (status === 'reviewed') { run.reviewed_at = new Date().toISOString(); run.reviewed_by = authName(); }
    if (status === 'approved') run.approved_at = new Date().toISOString();
    if (status === 'paid') run.paid_at = new Date().toISOString();
    if (status === 'locked') run.locked_at = new Date().toISOString();
    const items = state.payrollItems.filter(item => item.run_id === run.id);
    items.forEach(item => { item.status = status; });
    await syncUpsert(TABLES.payrollRuns, run);
    for (const item of items) await syncUpsert(TABLES.payrollItems, item);
    await pushHrNotification(`Payroll ${status}`, `${monthName(run.payroll_month)} payroll is now ${status}`, 'payroll', 'payroll_run', run.id);
    renderRoot();
  }

  function payrollTotals(rows) {
    return rows.reduce((acc, item) => { acc.gross += num(item.gross_salary); acc.net += num(item.net_salary); acc.deductions += num(item.deductions); acc.transport += num(item.transportation_allowance); acc.paid += receiptStatus(item).paid; acc.remaining += receiptStatus(item).remaining; acc.currency = item.currency || acc.currency; return acc; }, { gross:0, net:0, deductions:0, transport:0, paid:0, remaining:0, currency:'USD' });
  }

  function renderPayroll() {
    const run = latestPayrollRun();
    const rows = run && monthInGlobalRange(run.payroll_month) ? state.payrollItems.filter(item => String(item.run_id) === String(run.id) && matchesGlobalEmployee(item.employee_id)) : [];
    const totals = payrollTotals(rows);
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Monthly Payroll Report</h3><p class="muted">Fixed monthly salary + prorated transportation. Admin can regenerate/edit any month.</p></div><div class="hr-toolbar"><input id="hrPayrollMonth" class="input" type="month" value="${esc(state.filters.payrollMonth)}"><button class="btn sm" type="button" data-hr-action="generate-payroll">Generate / Recalculate</button></div></div>${run ? `<div class="hr-grid-3" style="margin-bottom:14px">${metric('Status', String(run.status || 'draft').replace(/_/g,' '), monthName(run.payroll_month))}${metric('Net Salary', money(totals.net, totals.currency), `${rows.length} employees`)}${metric('Remaining', money(totals.remaining, totals.currency), `Paid ${money(totals.paid, totals.currency)}`)}</div><div class="hr-toolbar" style="margin-bottom:12px"><button class="btn ghost sm" type="button" data-hr-payroll-status="reviewed">Mark Reviewed</button><button class="btn ghost sm" type="button" data-hr-payroll-status="approved">Approve</button><button class="btn ghost sm" type="button" data-hr-payroll-status="paid">Mark Paid</button><button class="btn ghost sm" type="button" data-hr-payroll-status="locked">Lock</button></div>` : `<div class="hr-source-banner">No payroll generated for ${monthName(state.filters.payrollMonth)} yet.</div>`}<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Days</th><th>Fixed Salary</th><th>Transport</th><th>Deductions</th><th>Net</th><th>Paid</th><th>Rest</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(payrollRow).join('') : `<tr><td colspan="10">${empty('Generate payroll to show monthly salary report.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function payrollRow(item) {
    const emp = getEmployee(item.employee_id) || {};
    const rs = receiptStatus(item);
    return `<tr><td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>Working ${num(item.working_days)} · Present ${num(item.present_days)}<div class="muted">Leave ${num(item.paid_leave_days) + num(item.unpaid_leave_days)} · Absent ${num(item.absent_days)}</div></td><td>${money(item.basic_salary, item.currency)}<div class="muted">Allow. ${money(item.allowances, item.currency)}</div></td><td>${money(item.transportation_allowance, item.currency)}<div class="muted">${num(item.transportation_days)} days · deducted ${money(item.transportation_deduction, item.currency)}</div></td><td>${money(item.deductions, item.currency)}</td><td><strong>${money(item.net_salary, item.currency)}</strong></td><td>${money(rs.paid, item.currency)}</td><td>${money(rs.remaining, item.currency)}</td><td>${statusChip(rs.status)}</td><td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-payslip-item="${esc(item.id)}">Payslip</button><button class="btn ghost xs" type="button" data-hr-add-receipt="${esc(item.id)}">Receipt</button></div></td></tr>`;
  }

  function renderPayslips() {
    const runs = state.payrollRuns.slice().filter(run => monthInGlobalRange(run.payroll_month)).sort((a,b) => String(b.payroll_month).localeCompare(String(a.payroll_month)));
    const runId = state.filters.payslipRunId && runs.some(run => String(run.id) === String(state.filters.payslipRunId)) ? state.filters.payslipRunId : (runs[0]?.id || '');
    const items = state.payrollItems.filter(item => String(item.run_id) === String(runId) && matchesGlobalEmployee(item.employee_id));
    const selected = state.selectedPayslip && items.some(item => String(item.id) === String(state.selectedPayslip)) ? state.selectedPayslip : (items[0]?.id || '');
    const item = state.payrollItems.find(row => String(row.id) === String(selected));
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Payslips</h3><p class="muted">Monthly payslip with transport calculation and salary receipt balance. Global employee/date filters apply here.</p></div><div class="hr-toolbar"><select id="hrPayslipRunFilter" class="select">${runs.map(run => `<option value="${esc(run.id)}" ${runId === run.id ? 'selected' : ''}>${esc(monthName(run.payroll_month))} · ${esc(run.status)}</option>`).join('')}</select></div></div><div class="hr-grid-2"><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Month</th><th>Net</th><th>Rest</th><th>Action</th></tr></thead><tbody>${items.length ? items.map(item => { const emp = getEmployee(item.employee_id) || {}; const run = state.payrollRuns.find(r => r.id === item.run_id) || {}; const rs = receiptStatus(item); return `<tr><td>${esc(emp.full_name || '—')}<div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(monthName(run.payroll_month))}</td><td>${money(item.net_salary, item.currency)}</td><td>${money(rs.remaining, item.currency)}</td><td><button class="btn ghost xs" type="button" data-hr-select-payslip="${esc(item.id)}">Preview</button></td></tr>`; }).join('') : `<tr><td colspan="5">${empty('No payslips match the selected filters. Generate payroll first or clear filters.')}</td></tr>`}</tbody></table></div><div>${item ? payslipHtml(item, true) : empty('Select a payslip to preview.')}</div></div></section>`;
  }

  function payslipHtml(item, includeAction = false) {
    const emp = getEmployee(item.employee_id) || {};
    const run = state.payrollRuns.find(row => String(row.id) === String(item.run_id)) || {};
    const rs = receiptStatus(item);
    const receiptRows = receiptsForItem(item.id);
    return `<div class="hr-payslip-preview" id="hrPayslipPreview"><div class="hr-payslip-header"><div><div class="hr-payslip-title">Payslip</div><div class="muted">InCheck360 Payroll</div></div><div style="text-align:right"><strong>${esc(monthName(run.payroll_month))}</strong><div>${statusChip(run.status || 'draft')}</div></div></div><div class="hr-payslip-grid"><div><strong>Employee</strong><div>${esc(emp.full_name || '—')}</div><div class="muted">${esc(emp.employee_no || '')} · ${esc(emp.job_title || '')}</div></div><div><strong>Department</strong><div>${esc(emp.department || '—')}</div><div class="muted">Payment: ${esc(emp.payment_method || '—')}</div></div></div><table class="hr-payslip-table"><thead><tr><th>Earnings</th><th>Amount</th></tr></thead><tbody><tr><td>Fixed Monthly Salary</td><td>${money(item.basic_salary, item.currency)}</td></tr><tr><td>Fixed Allowances</td><td>${money(item.allowances, item.currency)}</td></tr><tr><td>Transportation Paid</td><td>${money(item.transportation_allowance, item.currency)}</td></tr><tr><td><strong>Gross Salary</strong></td><td><strong>${money(item.gross_salary, item.currency)}</strong></td></tr></tbody></table><table class="hr-payslip-table"><thead><tr><th>Deductions / Balance</th><th>Amount</th></tr></thead><tbody><tr><td>Fixed Admin Deductions</td><td>${money(item.deductions, item.currency)}</td></tr><tr><td>Transportation Not Paid for Leave/Sick/Absent</td><td>${money(item.transportation_deduction, item.currency)}</td></tr><tr><td>Salary Receipts Paid</td><td>${money(rs.paid, item.currency)}</td></tr><tr><td>Remaining Salary Rest</td><td>${money(rs.remaining, item.currency)}</td></tr></tbody></table><div class="hr-payslip-grid"><div><strong>Attendance Basis</strong><div>Working ${num(item.working_days)} · Present ${num(item.present_days)}</div><div class="muted">Leave ${num(item.paid_leave_days) + num(item.unpaid_leave_days)} · Manual absent ${num(item.absent_days)} · Transport days ${num(item.transportation_days)}</div></div><div><strong>Transport Calculation</strong><div>${money(item.transportation_monthly || (num(item.transportation_allowance) + num(item.transportation_deduction)), item.currency)} monthly</div><div class="muted">${money(item.transportation_per_day, item.currency)} per eligible working day</div></div></div><div class="hr-payslip-total"><span>Net Salary</span><span>${money(item.net_salary, item.currency)}</span></div>${receiptRows.length ? `<div class="hr-dashboard-list" style="margin-top:12px">${receiptRows.map(r => `<div class="hr-dashboard-item"><div><strong>${esc(r.receipt_no)}</strong><div class="muted">${fmtDate(r.payment_date)} · ${esc(r.payment_method || '')}</div></div><span>${money(r.amount, r.currency || item.currency)}</span></div>`).join('')}</div>` : ''}${includeAction ? `<div class="hr-toolbar" style="margin-top:14px; justify-content:flex-end"><button class="btn ghost sm" type="button" data-hr-add-receipt="${esc(item.id)}">Add Receipt</button><button class="btn sm" type="button" data-hr-print-payslip="${esc(item.id)}">Print / Save PDF</button></div>` : ''}</div>`;
  }

  function filteredSalaryReceipts() {
    return state.salaryReceipts.filter(row => {
      const paymentDate = String(row.payment_date || '').slice(0,10);
      const employeeFilter = state.filters.receiptEmployee !== 'all' ? state.filters.receiptEmployee : state.filters.globalEmployee;
      const fromFilter = state.filters.receiptFrom || state.filters.globalFrom;
      const toFilter = state.filters.receiptTo || state.filters.globalTo;
      if (employeeFilter !== 'all' && String(row.employee_id) !== String(employeeFilter)) return false;
      if (fromFilter && paymentDate < fromFilter) return false;
      if (toFilter && paymentDate > toFilter) return false;
      if (!fromFilter && !toFilter && state.filters.receiptMonth && String(row.payroll_month || '').slice(0,7) !== state.filters.receiptMonth) return false;
      return true;
    }).sort((a,b) => String(b.payment_date).localeCompare(String(a.payment_date)) || String(b.receipt_no || '').localeCompare(String(a.receipt_no || '')));
  }

  function receiptFilterSummary(rows) {
    const total = rows.reduce((sum, row) => sum + num(row.amount), 0);
    const currency = rows.find(row => row.currency)?.currency || 'USD';
    const fromFilter = state.filters.receiptFrom || state.filters.globalFrom;
    const toFilter = state.filters.receiptTo || state.filters.globalTo;
    const employeeFilter = state.filters.receiptEmployee !== 'all' ? state.filters.receiptEmployee : state.filters.globalEmployee;
    const label = fromFilter || toFilter ? `${fromFilter || 'Start'} → ${toFilter || 'Today'}` : monthName(state.filters.receiptMonth);
    const employeeLabel = employeeFilter === 'all' ? 'All' : (getEmployee(employeeFilter)?.full_name || 'Selected');
    return `<div class="hr-grid-3" style="margin-bottom:14px">${metric('Receipts', String(rows.length), label)}${metric('Total Paid', money(total, currency), 'Filtered salary receipts')}${metric('Employee Filter', employeeLabel, 'Global + receipt filter')}</div>`;
  }

  function renderSalaryReceipts() {
    const rows = filteredSalaryReceipts();
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Salary Receipts</h3><p class="muted">Record full or partial salary payments, print each receipt, and track remaining salary rest.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-receipt">New Salary Receipt</button></div></div><div class="hr-filter-grid"><label><span class="muted">Month</span><input id="hrReceiptMonth" class="input" type="month" value="${esc(state.filters.receiptMonth)}"></label><label><span class="muted">Employee</span><select id="hrReceiptEmployeeFilter" class="select"><option value="all" ${state.filters.receiptEmployee === 'all' ? 'selected' : ''}>All employees</option>${employeeOptions(state.filters.receiptEmployee).replace('<option value="">Select employee...</option>', '')}</select></label><label><span class="muted">From payment date</span><input id="hrReceiptFrom" class="input" type="date" value="${esc(state.filters.receiptFrom)}"></label><label><span class="muted">To payment date</span><input id="hrReceiptTo" class="input" type="date" value="${esc(state.filters.receiptTo)}"></label><label><span class="muted">Reset</span><button class="btn ghost sm" type="button" data-hr-reset-receipt-filters>Clear Date Filter</button></label></div>${receiptFilterSummary(rows)}<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Receipt</th><th>Employee</th><th>Payroll Month</th><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(receiptRow).join('') : `<tr><td colspan="9">${empty('No salary receipts match the selected filters.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function receiptRow(row) {
    const emp = getEmployee(row.employee_id) || {};
    return `<tr><td><strong>${esc(row.receipt_no || '')}</strong></td><td>${esc(emp.full_name || '—')}<div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(monthName(row.payroll_month))}</td><td>${fmtDate(row.payment_date)}</td><td>${money(row.amount, row.currency)}</td><td>${esc(row.payment_method || '')}</td><td>${esc(row.reference_no || '')}</td><td>${esc(row.notes || '')}</td><td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-print-receipt="${esc(row.id)}">Print</button><button class="btn ghost xs" type="button" data-hr-edit-receipt="${esc(row.id)}">Edit</button></div></td></tr>`;
  }


  function statementStatusFilterMatches(item) {
    const wanted = state.filters.statementStatus || 'All';
    if (wanted === 'All') return true;
    return norm(displayPaymentStatus(item)) === norm(wanted);
  }

  function buildEmployeeStatementRows() {
    const rows = [];
    state.payrollItems.forEach(item => {
      const run = state.payrollRuns.find(row => String(row.id) === String(item.run_id)) || {};
      const emp = getEmployee(item.employee_id) || {};
      if (!matchesGlobalEmployee(item.employee_id)) return;
      if (!statementStatusFilterMatches(item)) return;
      const generatedDate = payrollMonthDate(run.payroll_month || item.payroll_month);
      if (!dateOverlapsGlobal(generatedDate)) return;
      rows.push({
        employee_id: item.employee_id,
        employee: emp.full_name || '—',
        employee_no: emp.employee_no || '',
        date: generatedDate,
        reference: `PAY-${run.payroll_month || ''}`,
        source_table: 'hr_payroll_items',
        source_id: item.id,
        type: 'Salary Generated',
        description: `Monthly salary generated for ${monthName(run.payroll_month)}`,
        debit: num(item.net_salary),
        credit: 0,
        currency: item.currency || emp.currency || 'USD',
        payroll_month: run.payroll_month || '',
        status: displayPaymentStatus(item),
        sort: `${generatedDate}-0-${item.created_at || ''}`
      });
    });
    state.salaryReceipts.forEach(receipt => {
      const item = state.payrollItems.find(row => String(row.id) === String(receipt.payroll_item_id)) || {};
      const empId = receipt.employee_id || item.employee_id;
      const emp = getEmployee(empId) || {};
      if (!matchesGlobalEmployee(empId)) return;
      const relatedStatus = item.id ? displayPaymentStatus(item) : 'Paid';
      const wanted = state.filters.statementStatus || 'All';
      if (wanted !== 'All' && norm(relatedStatus) !== norm(wanted)) return;
      const paymentDate = String(receipt.payment_date || receipt.created_at || today()).slice(0, 10);
      if (!dateOverlapsGlobal(paymentDate)) return;
      rows.push({
        employee_id: empId,
        employee: emp.full_name || '—',
        employee_no: emp.employee_no || '',
        date: paymentDate,
        reference: receipt.receipt_no || 'SALARY-RECEIPT',
        source_table: 'hr_salary_receipts',
        source_id: receipt.id,
        type: 'Salary Payment',
        description: `Salary receipt/payment for ${monthName(receipt.payroll_month || item.payroll_month)}`,
        debit: 0,
        credit: num(receipt.amount),
        currency: receipt.currency || item.currency || emp.currency || 'USD',
        payroll_month: receipt.payroll_month || '',
        status: relatedStatus,
        sort: `${paymentDate}-1-${receipt.created_at || ''}`
      });
    });
    const byEmployee = new Map();
    rows.sort((a,b) => String(a.employee).localeCompare(String(b.employee)) || String(a.sort).localeCompare(String(b.sort)) || String(a.reference).localeCompare(String(b.reference)));
    rows.forEach(row => {
      const key = String(row.employee_id || '');
      const balance = (byEmployee.get(key) || 0) + num(row.debit) - num(row.credit);
      byEmployee.set(key, balance);
      row.balance = Number(balance.toFixed(2));
    });
    return rows;
  }

  function statementTotals(rows) {
    const totalGenerated = rows.reduce((sum, row) => sum + num(row.debit), 0);
    const totalPaid = rows.reduce((sum, row) => sum + num(row.credit), 0);
    const relevantItems = state.payrollItems.filter(item => matchesGlobalEmployee(item.employee_id) && statementStatusFilterMatches(item) && dateOverlapsGlobal(payrollMonthDate((state.payrollRuns.find(run => String(run.id) === String(item.run_id)) || {}).payroll_month)));
    const paidMonths = relevantItems.filter(item => receiptStatus(item).status === 'paid').length;
    const openMonths = relevantItems.filter(item => receiptStatus(item).status !== 'paid').length;
    const currency = rows.find(row => row.currency)?.currency || 'USD';
    return { totalGenerated, totalPaid, remaining: totalGenerated - totalPaid, paidMonths, openMonths, currency };
  }

  function renderEmployeeStatement() {
    const rows = buildEmployeeStatementRows();
    const totals = statementTotals(rows);
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Employee Statement of Account</h3><p class="muted">Salary generated is Debit. Salary receipts/payments are Credit. Balance is salary still unpaid by employee.</p></div><div class="hr-toolbar"><button class="btn ghost sm" type="button" data-hr-print-statement>Print Statement</button><button class="btn ghost sm" type="button" data-hr-export-statement>Export CSV</button><button class="btn sm" type="button" id="hrRefreshBtn">Refresh</button></div></div><div class="hr-filter-grid"><label><span class="muted">Status</span><select id="hrStatementStatusFilter" class="select">${['All','Paid','Partially Paid','Unpaid'].map(status => `<option value="${status}" ${state.filters.statementStatus === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label><span class="muted">Employee</span><input class="input" readonly value="${esc(state.filters.globalEmployee === 'all' ? 'All employees' : (getEmployee(state.filters.globalEmployee)?.full_name || 'Selected'))}"></label><label><span class="muted">From</span><input class="input" readonly value="${esc(state.filters.globalFrom || 'Start')}"></label><label><span class="muted">To</span><input class="input" readonly value="${esc(state.filters.globalTo || 'Today')}"></label><label><span class="muted">Global filters</span><input class="input" readonly value="Use HR Filters above"></label></div><div class="hr-grid-3" style="margin-bottom:14px">${metric('Total Salary Generated', money(totals.totalGenerated, totals.currency), 'Debit')}${metric('Total Paid', money(totals.totalPaid, totals.currency), 'Credit')}${metric('Remaining Balance', money(totals.remaining, totals.currency), `${totals.paidMonths} paid · ${totals.openMonths} unpaid/partial`)}</div><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Reference</th><th>Employee</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(statementRow).join('') : `<tr><td colspan="10">${empty('No salary statement rows match the selected filters.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function statementRow(row) {
    const action = row.source_table === 'hr_payroll_items'
      ? `<button class="btn ghost xs" type="button" data-hr-payslip-item="${esc(row.source_id)}">Open Payslip</button>`
      : `<button class="btn ghost xs" type="button" data-hr-print-receipt="${esc(row.source_id)}">Open Receipt</button>`;
    return `<tr><td>${fmtDate(row.date)}</td><td><strong>${esc(row.reference)}</strong></td><td>${esc(row.employee)}<div class="muted">${esc(row.employee_no)}</div></td><td>${esc(row.type)}</td><td>${esc(row.description)}</td><td>${row.debit ? money(row.debit, row.currency) : '—'}</td><td>${row.credit ? money(row.credit, row.currency) : '—'}</td><td><strong>${money(row.balance, row.currency)}</strong></td><td>${statusChip(row.status)}</td><td>${action}</td></tr>`;
  }

  function employeeStatementHtml(rows = buildEmployeeStatementRows()) {
    const totals = statementTotals(rows);
    const empLabel = state.filters.globalEmployee === 'all' ? 'All employees' : (getEmployee(state.filters.globalEmployee)?.full_name || 'Selected employee');
    return `<div id="hrEmployeeStatementPrint" class="hr-statement-print"><div class="hr-receipt-header"><div><div class="hr-receipt-title">Employee Statement of Account</div><div class="muted">InCheck360 HR & Payroll</div></div><div style="text-align:right"><strong>${esc(empLabel)}</strong><div class="muted">${esc(globalRangeLabel())}</div><div class="muted">Generated ${fmtDate(today())} · ${esc(authName())}</div></div></div><div class="hr-grid-3" style="margin-bottom:14px">${metric('Salary Generated', money(totals.totalGenerated, totals.currency), 'Debit')}${metric('Paid', money(totals.totalPaid, totals.currency), 'Credit')}${metric('Remaining', money(totals.remaining, totals.currency), 'Balance')}</div><table class="hr-payslip-table"><thead><tr><th>Date</th><th>Reference</th><th>Employee</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.date)}</td><td>${esc(row.reference)}</td><td>${esc(row.employee)}</td><td>${esc(row.type)}</td><td>${esc(row.description)}</td><td>${row.debit ? money(row.debit, row.currency) : '—'}</td><td>${row.credit ? money(row.credit, row.currency) : '—'}</td><td>${money(row.balance, row.currency)}</td><td>${esc(row.status)}</td></tr>`).join('')}</tbody></table><div class="hr-receipt-footer">This statement is generated from HR payroll and salary receipts only. It is not a customer accounting statement.</div></div>`;
  }

  function printEmployeeStatement() {
    const rows = buildEmployeeStatementRows();
    if (!rows.length) return toast('No statement rows to print.');
    const html = `<!DOCTYPE html><html><head><title>Employee Statement of Account</title><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px}.hr-statement-print{background:#fff;max-width:1100px;margin:auto;padding:28px;border:1px solid #cbd5e1;border-radius:18px}.hr-receipt-header{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:14px}.hr-receipt-title{font-size:26px;font-weight:900}.muted{color:#64748b}.hr-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.hr-metric{padding:12px;border:1px solid #e2e8f0;border-radius:12px}.hr-metric span{display:block;color:#64748b;font-size:12px;font-weight:800}.hr-metric strong{display:block;margin-top:6px;font-size:20px}.hr-metric small{display:block;color:#64748b}.hr-payslip-table{width:100%;border-collapse:collapse;margin-top:12px}.hr-payslip-table th,.hr-payslip-table td{padding:9px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px}.hr-receipt-footer{margin-top:20px;color:#64748b;font-size:12px;text-align:center}@media print{body{background:#fff;padding:0}.hr-statement-print{border:0;border-radius:0;max-width:none}}</style></head><body>${employeeStatementHtml(rows)}</body></html>`;
    const w = global.open('', '_blank');
    if (!w) return toast('Popup blocked. Allow popups to print employee statement.');
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  }

  function exportEmployeeStatementCsv() {
    const rows = buildEmployeeStatementRows();
    if (!rows.length) return toast('No statement rows to export.');
    const columns = ['date','reference','employee_no','employee','type','description','debit','credit','balance','status','payroll_month'];
    const csv = [columns.join(','), ...rows.map(row => columns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `hr-employee-statement-${state.filters.globalFrom || 'start'}-${state.filters.globalTo || 'today'}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  }

  function renderDocuments() {
    const rows = state.documents.filter(doc => {
      const derived = documentExpiryStatus(doc);
      if (!matchesGlobalEmployee(doc.employee_id)) return false;
      if (!dateOverlapsGlobal(doc.expiry_date || doc.uploaded_at || doc.created_at)) return false;
      if (state.filters.documentStatus === 'all') return true;
      return norm(derived) === norm(state.filters.documentStatus);
    });
    return `<section class="hr-panel"><div class="hr-panel-head"><div><h3>Employee Documents</h3><p class="muted">Admin-managed employee documents, PDF upload, PDF view/download and expiry tracking.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-document">Add Document</button></div></div><div class="hr-filter-grid"><select id="hrDocumentStatusFilter" class="select"><option value="all">All documents</option>${['valid','expiring soon','missing','expired'].map(s => `<option value="${s}" ${state.filters.documentStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Type</th><th>Document</th><th>PDF</th><th>Expiry</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(documentRow).join('') : `<tr><td colspan="8">${empty('No employee documents found.')}</td></tr>`}</tbody></table></div></section>`;
  }

  function documentRow(row) {
    const emp = getEmployee(row.employee_id) || {};
    const hasPdf = Boolean(row.file_path || row.file_url);
    const status = documentExpiryStatus(row);
    const size = row.file_size ? `${(num(row.file_size) / 1024 / 1024).toFixed(2)} MB` : '';
    return `<tr><td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(row.document_type || '—')}</td><td><strong>${esc(documentTitle(row))}</strong><div class="muted">Issued ${fmtDate(row.issue_date)}${row.file_name ? ` · ${esc(row.file_name)}` : ''}</div></td><td>${hasPdf ? `<span class="hr-chip success">PDF uploaded</span><div class="muted">${esc(size)}${row.uploaded_at ? ` · ${fmtDate(row.uploaded_at)}` : ''}</div>` : `<span class="hr-chip warning">No file uploaded</span>`}</td><td>${fmtDate(row.expiry_date)}</td><td>${statusChip(status)}</td><td>${esc(row.notes || '')}</td><td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-edit-document="${esc(row.id)}">Edit / Replace PDF</button>${hasPdf ? `<button class="btn ghost xs" type="button" data-hr-view-document="${esc(row.id)}">View PDF</button><button class="btn ghost xs" type="button" data-hr-download-document="${esc(row.id)}">Download</button><button class="btn ghost xs" type="button" data-hr-remove-document-pdf="${esc(row.id)}">Remove PDF</button>` : ''}</div></td></tr>`;
  }

  function renderSettings() {
    return `<div class="hr-grid-2"><section class="hr-panel"><div class="hr-panel-head"><div><h3>Working Day Policy</h3><p class="muted">Your current rule: Saturday and Sunday are always non-working days.</p></div></div><form id="hrShiftForm" class="hr-inline-form"><input type="hidden" id="hrShiftId" value="${esc(state.shifts[0]?.id || '')}"><label>Name<input id="hrShiftName" class="input" value="${esc(state.shifts[0]?.name || 'Office Shift')}"></label><label>Working Days<input id="hrShiftWorkingDays" class="input" value="Mon,Tue,Wed,Thu,Fri" readonly></label><label>Weekend Days<input id="hrShiftWeekendDays" class="input" value="Sat,Sun" readonly></label><button class="btn sm" type="submit">Save Policy</button></form></section><section class="hr-panel"><div class="hr-panel-head"><div><h3>Leave Types</h3><p class="muted">Annual Leave accrues 1.25/month. Sick/other leave deducts transport by default.</p></div></div><div class="hr-dashboard-list">${state.leaveTypes.map(type => `<div class="hr-dashboard-item"><div><strong>${esc(type.name)}</strong><div class="muted">${type.paid ? 'Paid salary' : 'Unpaid'} · ${norm(type.name) === 'annual leave' ? '1.25/month, 15/year' : `${num(type.yearly_balance)} days/year`} · transport ${type.deduct_transportation === false ? 'paid' : 'deducted'}</div></div>${statusChip(type.is_active ? 'active' : 'inactive')}</div>`).join('')}</div></section></div>`;
  }

  function modalMarkup() {
    return `
      <div id="hrEmployeeModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrEmployeeForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Employee</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${employeeFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Employee</button></footer></form></div>
      <div id="hrAttendanceModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrAttendanceForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Manual Attendance Status</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${attendanceFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Status</button></footer></form></div>
      <div id="hrLeaveModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrLeaveForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Leave</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${leaveFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Leave</button></footer></form></div>
      <div id="hrBalanceModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrBalanceForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Adjust Leave Balance</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${balanceFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Adjustment</button></footer></form></div>
      <div id="hrHolidayModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrHolidayForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Holiday</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${holidayFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Holiday</button></footer></form></div>
      <div id="hrReceiptModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrReceiptForm" class="hr-dialog"><header><div><span class="hr-eyebrow">Payroll</span><h3>Salary Receipt</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${receiptFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn ghost sm" type="submit">Save Receipt</button><button class="btn sm" type="submit" data-hr-save-print-receipt="true">Save & Print</button></footer></form></div>
      <div id="hrDocumentModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrDocumentForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3>Document</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${documentFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Document</button></footer></form></div>
    `;
  }

  function employeeFields() {
    return `<input type="hidden" id="hrEmployeeId"><label>Employee ID<input id="hrEmployeeNo" class="input" readonly></label><label>Full Name *<input id="hrEmployeeName" class="input" required></label><label>Email<input id="hrEmployeeEmail" class="input" type="email"></label><label>Phone<input id="hrEmployeePhone" class="input"></label><label>Department<input id="hrEmployeeDepartment" class="input"></label><label>Job Title<input id="hrEmployeeJobTitle" class="input"></label><label>Employment Type<select id="hrEmployeeType" class="select"><option>Full-time</option><option>Part-time</option><option>Contractor</option><option>Intern</option></select></label><label>Joining Date<input id="hrEmployeeJoinDate" class="input" type="date"></label><label>Status<select id="hrEmployeeStatus" class="select"><option value="active">Active</option><option value="suspended">Suspended</option><option value="resigned">Resigned</option><option value="terminated">Terminated</option></select></label><label>Work Location<input id="hrEmployeeLocation" class="input"></label><label>Shift<select id="hrEmployeeShift" class="select">${shiftOptions()}</select></label><label>Fixed Monthly Salary<input id="hrEmployeeBaseSalary" class="input" type="number" step="0.01"></label><label>Currency<input id="hrEmployeeCurrency" class="input" value="USD"></label><label>Fixed Monthly Allowances<input id="hrEmployeeAllowances" class="input" type="number" step="0.01"></label><label>Monthly Transportation Allowance<input id="hrEmployeeTransportMonthly" class="input" type="number" step="0.01" placeholder="Example: 100"></label><label>Fixed Admin Deductions<input id="hrEmployeeDeductions" class="input" type="number" step="0.01"></label><label>Payment Method<input id="hrEmployeePaymentMethod" class="input" value="Bank Transfer"></label><label>Bank Name<input id="hrEmployeeBankName" class="input"></label><label>Bank Account<input id="hrEmployeeBankAccount" class="input"></label><label>Salary Effective Date<input id="hrEmployeeSalaryDate" class="input" type="date"></label>`;
  }

  function attendanceFields() {
    return `<input type="hidden" id="hrAttendanceId"><label>Employee<select id="hrAttendanceEmployee" class="select" required>${employeeOptions()}</select></label><label>Date<input id="hrAttendanceModalDate" class="input" type="date" required></label><label>Status<select id="hrAttendanceStatus" class="select"><option value="absent">Absent</option><option value="half_day">Half Day</option><option value="present">Present / Clear Exception</option></select></label><label class="full">Notes<textarea id="hrAttendanceNotes" class="input" placeholder="Reason added by admin"></textarea></label>`;
  }

  function leaveFields() {
    return `<input type="hidden" id="hrLeaveId"><label>Employee<select id="hrLeaveEmployee" class="select" required>${employeeOptions()}</select></label><label>Leave Type<select id="hrLeaveType" class="select">${state.leaveTypes.map(type => `<option value="${esc(type.name)}">${esc(type.name)}</option>`).join('')}</select></label><label>Start Date<input id="hrLeaveStart" class="input" type="date" required></label><label>End Date<input id="hrLeaveEnd" class="input" type="date" required></label><label>Status<select id="hrLeaveStatus" class="select"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></label><label>Paid Salary<select id="hrLeavePaid" class="select"><option value="true">Paid salary</option><option value="false">Unpaid salary</option></select></label><label>Transportation<select id="hrLeaveDeductTransport" class="select"><option value="true">Deduct transport for these days</option><option value="false">Do not deduct transport</option></select></label><label class="full">Reason / Notes<textarea id="hrLeaveReason" class="input"></textarea></label>`;
  }

  function balanceFields() {
    return `<input type="hidden" id="hrBalanceId"><input type="hidden" id="hrBalanceEmployee"><label>Employee<input id="hrBalanceEmployeeName" class="input" readonly></label><label>Leave Type<input id="hrBalanceLeaveType" class="input" readonly></label><label>Year<input id="hrBalanceYearValue" class="input" type="number"></label><label>Manual Entitlement Days<input id="hrBalanceEntitlement" class="input" type="number" step="0.25" placeholder="Blank = auto accrual"></label><label>Carry Forward<input id="hrBalanceCarry" class="input" type="number" step="0.25"></label><label>Adjustment Days<input id="hrBalanceAdjustment" class="input" type="number" step="0.25"></label><label class="full">Notes<textarea id="hrBalanceNotes" class="input"></textarea></label>`;
  }

  function holidayFields() {
    return `<input type="hidden" id="hrHolidayId"><label>Date<input id="hrHolidayDate" class="input" type="date" required></label><label>Name<input id="hrHolidayName" class="input" required></label><label>Country<input id="hrHolidayCountry" class="input" placeholder="Optional"></label><label>Paid Holiday<select id="hrHolidayPaid" class="select"><option value="true">Yes</option><option value="false">No</option></select></label><label class="full">Notes<textarea id="hrHolidayNotes" class="input"></textarea></label>`;
  }

  function receiptFields() {
    const payableItems = state.payrollItems.slice(0, 500).map(item => { const emp = getEmployee(item.employee_id) || {}; const run = state.payrollRuns.find(r => r.id === item.run_id) || {}; const rs = receiptStatus(item); return `<option value="${esc(item.id)}">${esc(monthName(run.payroll_month))} · ${esc(emp.employee_no || '')} ${esc(emp.full_name || '')} · Rest ${money(rs.remaining, item.currency)}</option>`; }).join('');
    return `<input type="hidden" id="hrReceiptId"><label>Receipt No<input id="hrReceiptNo" class="input" readonly></label><label>Payroll / Employee<select id="hrReceiptPayrollItem" class="select" required>${payableItems}</select></label><label>Payment Date<input id="hrReceiptDate" class="input" type="date" required></label><label>Amount Received<input id="hrReceiptAmount" class="input" type="number" step="0.01" required></label><label>Payment Method<input id="hrReceiptMethod" class="input" value="Bank Transfer"></label><label>Reference<input id="hrReceiptReference" class="input"></label><label class="full">Notes<textarea id="hrReceiptNotes" class="input"></textarea></label>`;
  }

  function documentFields() {
    return `<input type="hidden" id="hrDocumentId"><label>Employee<select id="hrDocumentEmployee" class="select" required>${employeeOptions()}</select></label><label>Document Type<select id="hrDocumentType" class="select"><option>Contract</option><option>ID / Passport</option><option>Work Permit</option><option>Certificate</option><option>NDA</option><option>Bank Details</option><option>Insurance</option><option>Other</option></select></label><label>Document Title<input id="hrDocumentName" class="input" required></label><label>Issue Date<input id="hrDocumentIssue" class="input" type="date"></label><label>Expiry Date<input id="hrDocumentExpiry" class="input" type="date"></label><label>Status<select id="hrDocumentStatus" class="select"><option value="valid">Valid</option><option value="missing">Missing</option><option value="expired">Expired</option></select></label><label class="full">PDF File (optional, max 10 MB)<input id="hrDocumentPdf" class="input" type="file" accept="application/pdf,.pdf"><span class="muted">Only PDF files are accepted. Use Replace PDF from the document row to update an existing file.</span></label><label class="full">Notes<textarea id="hrDocumentNotes" class="input"></textarea></label>`;
  }

  function openModal(id) { const modal = $(id); if (modal) { modal.hidden = false; global.ModalScrollLock?.lock?.(); } }
  function closeModals() { document.querySelectorAll('.hr-modal').forEach(modal => { modal.hidden = true; }); global.ModalScrollLock?.unlock?.(); }
  function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ''; }
  function value(id) { return $(id)?.value ?? ''; }

  function openEmployeeModal(employeeId = '') {
    renderRoot();
    const emp = getEmployee(employeeId) || { id:'', employee_no: employeeNo(), status:'active', employment_type:'Full-time', shift_id: state.shifts[0]?.id, currency:'USD', payment_method:'Bank Transfer', joining_date: today(), salary_effective_date: today(), transportation_monthly: 100 };
    setValue('hrEmployeeId', emp.id); setValue('hrEmployeeNo', emp.employee_no); setValue('hrEmployeeName', emp.full_name); setValue('hrEmployeeEmail', emp.email); setValue('hrEmployeePhone', emp.phone); setValue('hrEmployeeDepartment', emp.department); setValue('hrEmployeeJobTitle', emp.job_title); setValue('hrEmployeeType', emp.employment_type || 'Full-time'); setValue('hrEmployeeJoinDate', emp.joining_date); setValue('hrEmployeeStatus', emp.status || 'active'); setValue('hrEmployeeLocation', emp.work_location); setValue('hrEmployeeShift', emp.shift_id || state.shifts[0]?.id); setValue('hrEmployeeBaseSalary', emp.base_salary); setValue('hrEmployeeCurrency', emp.currency || 'USD'); setValue('hrEmployeeAllowances', emp.allowances); setValue('hrEmployeeTransportMonthly', monthlyTransport(emp)); setValue('hrEmployeeDeductions', emp.fixed_deductions); setValue('hrEmployeePaymentMethod', emp.payment_method || 'Bank Transfer'); setValue('hrEmployeeBankName', emp.bank_name); setValue('hrEmployeeBankAccount', emp.bank_account); setValue('hrEmployeeSalaryDate', emp.salary_effective_date);
    openModal('hrEmployeeModal');
  }

  async function saveEmployee(event) {
    event.preventDefault();
    const id = value('hrEmployeeId') || uid('emp');
    const existing = getEmployee(id) || {};
    const row = { ...existing, id, employee_no: value('hrEmployeeNo') || employeeNo(), full_name: value('hrEmployeeName'), email: value('hrEmployeeEmail'), phone: value('hrEmployeePhone'), department: value('hrEmployeeDepartment'), job_title: value('hrEmployeeJobTitle'), employment_type: value('hrEmployeeType'), joining_date: value('hrEmployeeJoinDate') || null, status: value('hrEmployeeStatus') || 'active', work_location: value('hrEmployeeLocation'), shift_id: value('hrEmployeeShift') || null, leave_policy: existing.leave_policy || 'Standard', base_salary: num(value('hrEmployeeBaseSalary')), currency: value('hrEmployeeCurrency') || 'USD', allowances: num(value('hrEmployeeAllowances')), transportation_monthly: num(value('hrEmployeeTransportMonthly')), transportation_monthly_allowance: num(value('hrEmployeeTransportMonthly')), transportation_per_day: 0, fixed_deductions: num(value('hrEmployeeDeductions')), payment_method: value('hrEmployeePaymentMethod'), bank_name: value('hrEmployeeBankName'), bank_account: value('hrEmployeeBankAccount'), salary_effective_date: value('hrEmployeeSalaryDate') || null, updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.employees.findIndex(emp => emp.id === id);
    if (index >= 0) state.employees[index] = row; else state.employees.unshift(row);
    await syncUpsert(TABLES.employees, row);
    closeModals(); renderRoot(); toast('Employee saved.');
  }

  function openAttendanceModal(attendanceId = '', employeeId = '', status = 'absent') {
    renderRoot();
    const row = state.attendance.find(item => String(item.id) === String(attendanceId)) || { id:'', employee_id: employeeId || '', attendance_date: state.filters.attendanceDate, status, method:'Manual', notes:'' };
    setValue('hrAttendanceId', row.id); setValue('hrAttendanceEmployee', row.employee_id); setValue('hrAttendanceModalDate', row.attendance_date); setValue('hrAttendanceStatus', row.status || status); setValue('hrAttendanceNotes', row.notes || '');
    openModal('hrAttendanceModal');
  }

  async function saveAttendance(event) {
    event.preventDefault();
    const status = value('hrAttendanceStatus') || 'absent';
    const id = value('hrAttendanceId') || uid('att');
    const existing = state.attendance.find(row => row.id === id) || {};
    if (status === 'present') {
      if (existing.id) { state.attendance = state.attendance.filter(row => row.id !== existing.id); await syncDelete(TABLES.attendance, existing.id); }
      closeModals(); renderRoot(); toast('Manual attendance exception cleared.'); return;
    }
    const row = { ...existing, id, employee_id: value('hrAttendanceEmployee'), attendance_date: value('hrAttendanceModalDate') || today(), check_in_time: null, check_out_time: null, worked_hours: 0, late_minutes: 0, early_leave_minutes: 0, overtime_hours: 0, status, method:'Manual', notes: value('hrAttendanceNotes'), approved_by: authName(), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.attendance.findIndex(item => item.id === id);
    if (index >= 0) state.attendance[index] = row; else state.attendance.unshift(row);
    await syncUpsert(TABLES.attendance, row);
    closeModals(); renderRoot(); toast('Manual attendance status saved.');
  }

  async function quickManualAttendance(employeeId, status, dateValue = state.filters.attendanceDate) {
    const existing = attendanceException(employeeId, dateValue);
    const row = { ...(existing || {}), id: existing?.id || uid('att'), employee_id: employeeId, attendance_date: dateValue, check_in_time: null, check_out_time: null, worked_hours: 0, late_minutes: 0, early_leave_minutes: 0, overtime_hours: 0, status, method:'Manual', notes: status === 'absent' ? 'Marked absent by admin' : 'Marked half day by admin', approved_by: authName(), updated_at: new Date().toISOString(), created_at: existing?.created_at || new Date().toISOString() };
    const index = state.attendance.findIndex(item => item.id === row.id);
    if (index >= 0) state.attendance[index] = row; else state.attendance.unshift(row);
    await syncUpsert(TABLES.attendance, row);
    renderRoot();
  }

  async function clearAttendance(id) {
    state.attendance = state.attendance.filter(row => String(row.id) !== String(id));
    await syncDelete(TABLES.attendance, id);
    renderRoot(); toast('Manual attendance exception cleared.');
  }

  function openLeaveModal(leaveId = '') {
    renderRoot();
    const row = state.leaveRequests.find(item => String(item.id) === String(leaveId)) || { id:'', employee_id: '', leave_type: 'Annual Leave', start_date: today(), end_date: today(), status:'approved', paid:true, deduct_transportation:true, reason:'' };
    setValue('hrLeaveId', row.id); setValue('hrLeaveEmployee', row.employee_id); setValue('hrLeaveType', row.leave_type); setValue('hrLeaveStart', row.start_date); setValue('hrLeaveEnd', row.end_date); setValue('hrLeaveStatus', row.status || 'approved'); setValue('hrLeavePaid', row.paid === false ? 'false' : 'true'); setValue('hrLeaveDeductTransport', row.deduct_transportation === false ? 'false' : 'true'); setValue('hrLeaveReason', row.reason || '');
    openModal('hrLeaveModal');
  }

  async function saveLeave(event) {
    event.preventDefault();
    const id = value('hrLeaveId') || uid('leave');
    const existing = state.leaveRequests.find(row => row.id === id) || {};
    const days = businessDaysBetween(value('hrLeaveStart'), value('hrLeaveEnd'), getShift(getEmployee(value('hrLeaveEmployee'))?.shift_id));
    const row = { ...existing, id, employee_id: value('hrLeaveEmployee'), leave_type: value('hrLeaveType'), start_date: value('hrLeaveStart'), end_date: value('hrLeaveEnd'), days, status: value('hrLeaveStatus') || 'approved', paid: value('hrLeavePaid') !== 'false', deduct_transportation: value('hrLeaveDeductTransport') !== 'false', reason: value('hrLeaveReason'), manager_status: 'approved', hr_status: value('hrLeaveStatus') === 'approved' ? 'approved' : 'pending', approved_by: value('hrLeaveStatus') === 'approved' ? authName() : existing.approved_by, updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString(), requested_by: existing.requested_by || authName() };
    const index = state.leaveRequests.findIndex(item => item.id === id);
    if (index >= 0) state.leaveRequests[index] = row; else state.leaveRequests.unshift(row);
    await syncUpsert(TABLES.leaveRequests, row);
    await pushHrNotification('Leave saved', `${getEmployee(row.employee_id)?.full_name || 'Employee'} · ${row.leave_type} · ${days} working day(s)`, 'leave', 'leave', row.id);
    closeModals(); renderRoot(); toast('Leave saved.');
  }

  async function setLeaveStatus(id, status) {
    const row = state.leaveRequests.find(item => String(item.id) === String(id));
    if (!row) return;
    row.status = status; row.hr_status = status === 'approved' ? 'approved' : status; row.approved_by = status === 'approved' ? authName() : row.approved_by; row.updated_at = new Date().toISOString();
    await syncUpsert(TABLES.leaveRequests, row);
    renderRoot();
  }

  function openBalanceModal(employeeId, leaveType) {
    renderRoot();
    const year = Number(state.filters.balanceYear);
    const existing = state.leaveBalances.find(row => String(row.employee_id) === String(employeeId) && norm(row.leave_type) === norm(leaveType) && Number(row.year) === year) || {};
    const emp = getEmployee(employeeId) || {};
    setValue('hrBalanceId', existing.id || ''); setValue('hrBalanceEmployee', employeeId); setValue('hrBalanceEmployeeName', `${emp.employee_no || ''} · ${emp.full_name || ''}`); setValue('hrBalanceLeaveType', leaveType); setValue('hrBalanceYearValue', year); setValue('hrBalanceEntitlement', existing.entitlement_days ?? ''); setValue('hrBalanceCarry', existing.carry_forward_days || 0); setValue('hrBalanceAdjustment', existing.adjustment_days || 0); setValue('hrBalanceNotes', existing.notes || '');
    openModal('hrBalanceModal');
  }

  async function saveBalance(event) {
    event.preventDefault();
    const id = value('hrBalanceId') || uid('bal');
    const existing = state.leaveBalances.find(row => row.id === id) || {};
    const row = { ...existing, id, employee_id: value('hrBalanceEmployee'), leave_type: value('hrBalanceLeaveType'), year: Number(value('hrBalanceYearValue') || state.filters.balanceYear), entitlement_days: value('hrBalanceEntitlement') === '' ? null : num(value('hrBalanceEntitlement')), carry_forward_days: num(value('hrBalanceCarry')), adjustment_days: num(value('hrBalanceAdjustment')), notes: value('hrBalanceNotes'), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.leaveBalances.findIndex(item => item.id === id);
    if (index >= 0) state.leaveBalances[index] = row; else state.leaveBalances.unshift(row);
    await syncUpsert(TABLES.leaveBalances, row);
    closeModals(); renderRoot(); toast('Leave balance adjusted.');
  }

  function openHolidayModal(id = '') {
    renderRoot();
    const row = state.holidays.find(item => String(item.id) === String(id)) || { id:'', holiday_date: today(), name:'', country:'', is_paid:true, notes:'' };
    setValue('hrHolidayId', row.id); setValue('hrHolidayDate', row.holiday_date); setValue('hrHolidayName', row.name); setValue('hrHolidayCountry', row.country); setValue('hrHolidayPaid', row.is_paid === false ? 'false' : 'true'); setValue('hrHolidayNotes', row.notes || '');
    openModal('hrHolidayModal');
  }

  async function saveHoliday(event) {
    event.preventDefault();
    const id = value('hrHolidayId') || uid('holiday');
    const existing = state.holidays.find(row => row.id === id) || {};
    const row = { ...existing, id, holiday_date: value('hrHolidayDate'), name: value('hrHolidayName'), country: value('hrHolidayCountry'), is_paid: value('hrHolidayPaid') !== 'false', notes: value('hrHolidayNotes'), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.holidays.findIndex(item => item.id === id);
    if (index >= 0) state.holidays[index] = row; else state.holidays.unshift(row);
    await syncUpsert(TABLES.holidays, row);
    closeModals(); renderRoot(); toast('Holiday saved.');
  }

  function openReceiptModal(receiptId = '', payrollItemId = '') {
    renderRoot();
    const item = state.payrollItems.find(row => String(row.id) === String(payrollItemId));
    const run = item ? state.payrollRuns.find(r => r.id === item.run_id) : null;
    const existing = state.salaryReceipts.find(row => String(row.id) === String(receiptId)) || {};
    const rs = item ? receiptStatus(item) : { remaining: 0 };
    const row = existing.id ? existing : { id:'', receipt_no: receiptNo(), payroll_item_id: payrollItemId || state.payrollItems[0]?.id || '', payment_date: today(), amount: rs.remaining || 0, payment_method: 'Bank Transfer', reference_no:'', notes:'' };
    setValue('hrReceiptId', row.id); setValue('hrReceiptNo', row.receipt_no); setValue('hrReceiptPayrollItem', row.payroll_item_id); setValue('hrReceiptDate', row.payment_date); setValue('hrReceiptAmount', row.amount); setValue('hrReceiptMethod', row.payment_method || 'Bank Transfer'); setValue('hrReceiptReference', row.reference_no || ''); setValue('hrReceiptNotes', row.notes || '');
    if (run) state.filters.receiptMonth = run.payroll_month;
    openModal('hrReceiptModal');
  }

  async function saveReceipt(event) {
    event.preventDefault();
    const shouldPrint = Boolean(event.submitter?.dataset?.hrSavePrintReceipt);
    const id = value('hrReceiptId') || uid('receipt');
    const existing = state.salaryReceipts.find(row => row.id === id) || {};
    const item = state.payrollItems.find(row => String(row.id) === String(value('hrReceiptPayrollItem')));
    if (!item) return toast('Select a payroll item first.');
    const run = state.payrollRuns.find(row => row.id === item.run_id) || {};
    const row = { ...existing, id, receipt_no: value('hrReceiptNo') || receiptNo(), payroll_item_id: item.id, payroll_run_id: item.run_id, employee_id: item.employee_id, payroll_month: run.payroll_month, payment_date: value('hrReceiptDate') || today(), amount: num(value('hrReceiptAmount')), currency: item.currency || 'USD', payment_method: value('hrReceiptMethod'), reference_no: value('hrReceiptReference'), notes: value('hrReceiptNotes'), created_by: authName(), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.salaryReceipts.findIndex(receipt => receipt.id === id);
    if (index >= 0) state.salaryReceipts[index] = row; else state.salaryReceipts.unshift(row);
    const rsAfter = { paid: receiptPaidAmount(item.id) + (existing.id ? 0 : row.amount), remaining: Math.max(0, num(item.net_salary) - receiptPaidAmount(item.id)) };
    await syncUpsert(TABLES.salaryReceipts, row);
    await pushHrNotification('Salary receipt saved', `${getEmployee(row.employee_id)?.full_name || 'Employee'} · ${money(row.amount, row.currency)}`, 'receipt', 'salary_receipt', row.id);
    closeModals(); renderRoot(); toast(`Salary receipt saved. Rest: ${money(receiptStatus(item).remaining, item.currency)}`);
    if (shouldPrint) setTimeout(() => printSalaryReceipt(row.id), 150);
  }

  function openDocumentModal(id = '') {
    renderRoot();
    const row = state.documents.find(item => String(item.id) === String(id)) || { id:'', employee_id:'', document_type:'Contract', document_name:'', document_title:'', issue_date:'', expiry_date:'', status:'valid', notes:'' };
    setValue('hrDocumentId', row.id); setValue('hrDocumentEmployee', row.employee_id); setValue('hrDocumentType', row.document_type || 'Contract'); setValue('hrDocumentName', documentTitle(row)); setValue('hrDocumentIssue', row.issue_date || ''); setValue('hrDocumentExpiry', row.expiry_date || ''); setValue('hrDocumentStatus', row.status || 'valid'); setValue('hrDocumentNotes', row.notes || '');
    const fileInput = $('hrDocumentPdf');
    if (fileInput) fileInput.value = '';
    openModal('hrDocumentModal');
  }

  async function uploadDocumentPdf(documentId, employeeId, existing = {}) {
    const input = $('hrDocumentPdf');
    const file = input?.files?.[0];
    if (!file) return {};
    if (file.type !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
      toast('Only PDF files are allowed for employee documents.');
      throw new Error('Invalid document file type');
    }
    if (file.size > MAX_DOCUMENT_PDF_SIZE) {
      toast('PDF is too large. Maximum size is 10 MB.');
      throw new Error('PDF file too large');
    }
    const supabase = client();
    if (!supabase?.storage?.from) {
      toast('Supabase Storage is unavailable. Run the HR document SQL migration and deploy with Supabase enabled.');
      throw new Error('Supabase Storage unavailable');
    }
    if (existing.file_path) {
      try { await supabase.storage.from(HR_DOCUMENTS_BUCKET).remove([existing.file_path]); }
      catch (error) { console.warn('[HR] old PDF removal failed', error); }
    }
    const safeName = String(file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document.pdf';
    const path = `hr-documents/${employeeId}/${documentId}/${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage.from(HR_DOCUMENTS_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) {
      console.warn('[HR] PDF upload failed', error);
      toast('PDF upload failed. Make sure the hr-employee-documents bucket/migration exists.');
      throw error;
    }
    let uploadedBy = null;
    try { uploadedBy = (await supabase.auth?.getUser?.())?.data?.user?.id || null; } catch {}
    return {
      file_name: file.name,
      file_path: data?.path || path,
      file_mime_type: 'application/pdf',
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploadedBy
    };
  }

  async function saveDocument(event) {
    event.preventDefault();
    const id = value('hrDocumentId') || uid('doc');
    const existing = state.documents.find(row => row.id === id) || {};
    const employeeId = value('hrDocumentEmployee');
    if (!employeeId) return toast('Select an employee first.');
    let pdfMeta = {};
    try { pdfMeta = await uploadDocumentPdf(id, employeeId, existing); }
    catch { return; }
    const title = value('hrDocumentName');
    const row = { ...existing, ...pdfMeta, id, employee_id: employeeId, document_type: value('hrDocumentType'), document_name: title, document_title: title, issue_date: value('hrDocumentIssue') || null, expiry_date: value('hrDocumentExpiry') || null, status: value('hrDocumentStatus') || 'valid', notes: value('hrDocumentNotes'), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.documents.findIndex(item => item.id === id);
    if (index >= 0) state.documents[index] = row; else state.documents.unshift(row);
    await syncUpsert(TABLES.documents, row);
    closeModals(); renderRoot(); toast(pdfMeta.file_path ? 'Document and PDF saved.' : 'Document saved.');
  }

  async function signedDocumentUrl(row, download = false) {
    if (row.file_url) return row.file_url;
    if (!row.file_path) return '';
    const supabase = client();
    if (!supabase?.storage?.from) throw new Error('Supabase Storage unavailable');
    const options = download ? { download: row.file_name || 'employee-document.pdf' } : undefined;
    const { data, error } = await supabase.storage.from(HR_DOCUMENTS_BUCKET).createSignedUrl(row.file_path, 300, options);
    if (error) throw error;
    return data?.signedUrl || '';
  }

  async function openDocumentPdf(id, download = false) {
    const row = state.documents.find(item => String(item.id) === String(id));
    if (!row?.file_path && !row?.file_url) return toast('No PDF uploaded for this document.');
    try {
      const url = await signedDocumentUrl(row, download);
      if (!url) return toast('Could not create PDF link.');
      if (download) {
        const link = document.createElement('a');
        link.href = url; link.download = row.file_name || `${documentTitle(row)}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      } else {
        global.open(url, '_blank');
      }
    } catch (error) {
      console.warn('[HR] PDF open/download failed', error);
      toast('Could not open PDF. Run the latest HR document migration and check Storage policies.');
    }
  }

  async function removeDocumentPdf(id) {
    const row = state.documents.find(item => String(item.id) === String(id));
    if (!row) return;
    if (!confirm('Remove the uploaded PDF from this employee document?')) return;
    const supabase = client();
    if (row.file_path && supabase?.storage?.from) {
      try { await supabase.storage.from(HR_DOCUMENTS_BUCKET).remove([row.file_path]); }
      catch (error) { console.warn('[HR] PDF storage removal failed', error); }
    }
    Object.assign(row, { file_name:null, file_path:null, file_url:null, file_mime_type:null, file_size:null, uploaded_at:null, uploaded_by:null, updated_at:new Date().toISOString() });
    await syncUpsert(TABLES.documents, row);
    renderRoot(); toast('PDF removed from document.');
  }

  async function saveShift(event) {
    event.preventDefault();
    const id = value('hrShiftId') || state.shifts[0]?.id || uid('shift');
    const existing = state.shifts.find(row => row.id === id) || {};
    const row = { ...existing, id, name: value('hrShiftName') || 'Office Shift', working_days: 'Mon,Tue,Wed,Thu,Fri', weekend_days: 'Sat,Sun', start_time: existing.start_time || '09:00', end_time: existing.end_time || '18:00', grace_minutes: 0, break_minutes: existing.break_minutes || 60, overtime_rate: existing.overtime_rate || 1.5, is_active: true, updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.shifts.findIndex(item => item.id === id);
    if (index >= 0) state.shifts[index] = row; else state.shifts.unshift(row);
    await syncUpsert(TABLES.shifts, row);
    renderRoot(); toast('Working day policy saved.');
  }

  function exportCsv(type) {
    let rows = [];
    if (type === 'attendance') {
      const employees = state.employees.filter(emp => norm(emp.status || 'active') === 'active' && matchesGlobalEmployee(emp.id));
      const dates = attendanceDatesForCurrentFilters();
      employees.forEach(emp => dates.forEach(date => rows.push({ employee_no: emp.employee_no, employee: emp.full_name, date, status: computedDayStatus(emp, date).status, source: computedDayStatus(emp, date).source })));
    } else {
      const run = latestPayrollRun();
      rows = run && monthInGlobalRange(run.payroll_month) ? state.payrollItems.filter(item => item.run_id === run.id && matchesGlobalEmployee(item.employee_id)).map(item => ({ employee: getEmployee(item.employee_id)?.full_name || '', month: run.payroll_month, net_salary: item.net_salary, paid: receiptStatus(item).paid, remaining: receiptStatus(item).remaining })) : [];
    }
    if (!rows.length) return toast('No rows to export.');
    const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    const csv = [columns.join(','), ...rows.map(row => columns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `hr-${type}-${type === 'payroll' ? state.filters.payrollMonth : (state.filters.globalFrom || state.filters.attendanceDate)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  }

  function printPayslip(itemId) {
    const item = state.payrollItems.find(row => String(row.id) === String(itemId));
    if (!item) return;
    const html = `<!DOCTYPE html><html><head><title>Payslip</title><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px}.hr-payslip-preview{background:#fff;max-width:820px;margin:auto;padding:28px;border:1px solid #cbd5e1;border-radius:18px}.hr-payslip-header{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:14px}.hr-payslip-title{font-size:26px;font-weight:900}.muted{color:#64748b}.hr-payslip-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.hr-payslip-table{width:100%;border-collapse:collapse;margin-top:12px}.hr-payslip-table th,.hr-payslip-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}.hr-payslip-total{display:flex;justify-content:space-between;margin-top:14px;padding:14px;background:#0f172a;color:#fff;border-radius:12px;font-size:18px;font-weight:900}.hr-chip{display:inline-block;padding:4px 8px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px}.hr-dashboard-item{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0}</style></head><body>${payslipHtml(item, false)}</body></html>`;
    const w = global.open('', '_blank');
    if (!w) return toast('Popup blocked. Allow popups to print payslip.');
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  }


  function receiptHtml(receiptId) {
    const receipt = state.salaryReceipts.find(row => String(row.id) === String(receiptId));
    if (!receipt) return '';
    const item = state.payrollItems.find(row => String(row.id) === String(receipt.payroll_item_id)) || {};
    const run = state.payrollRuns.find(row => String(row.id) === String(receipt.payroll_run_id || item.run_id)) || {};
    const emp = getEmployee(receipt.employee_id || item.employee_id) || {};
    const status = item.id ? receiptStatus(item) : { paid: num(receipt.amount), remaining: 0, status: 'paid' };
    return `<div class="hr-receipt-preview" id="hrSalaryReceiptPreview"><div class="hr-receipt-header"><div><div class="hr-receipt-title">Salary Receipt</div><div class="muted">InCheck360 HR & Payroll</div></div><div style="text-align:right"><strong>${esc(receipt.receipt_no || '')}</strong><div class="muted">${fmtDate(receipt.payment_date)}</div></div></div><div class="hr-payslip-grid"><div><strong>Received By</strong><div>${esc(emp.full_name || '—')}</div><div class="muted">${esc(emp.employee_no || '')} · ${esc(emp.job_title || '')}</div></div><div><strong>Payroll Month</strong><div>${esc(monthName(receipt.payroll_month || run.payroll_month))}</div><div class="muted">Department: ${esc(emp.department || '—')}</div></div></div><table class="hr-payslip-table"><tbody><tr><td>Amount Received</td><td><strong>${money(receipt.amount, receipt.currency || item.currency)}</strong></td></tr><tr><td>Payment Method</td><td>${esc(receipt.payment_method || '—')}</td></tr><tr><td>Reference</td><td>${esc(receipt.reference_no || '—')}</td></tr><tr><td>Net Salary</td><td>${item.id ? money(item.net_salary, item.currency) : '—'}</td></tr><tr><td>Total Paid for This Payslip</td><td>${money(status.paid, receipt.currency || item.currency)}</td></tr><tr><td>Remaining Salary Rest</td><td>${money(status.remaining, receipt.currency || item.currency)}</td></tr></tbody></table>${receipt.notes ? `<div class="hr-receipt-note"><strong>Notes</strong><div>${esc(receipt.notes)}</div></div>` : ''}<div class="hr-signature-grid"><div><span>Prepared By</span><strong>${esc(receipt.created_by || authName())}</strong></div><div><span>Employee Signature</span><strong>&nbsp;</strong></div></div><div class="hr-receipt-footer">This receipt confirms salary payment received for the payroll period shown above. Partial payments remain open until the salary rest reaches zero.</div></div>`;
  }

  function printSalaryReceipt(receiptId) {
    const htmlBody = receiptHtml(receiptId);
    if (!htmlBody) return toast('Salary receipt not found.');
    const html = `<!DOCTYPE html><html><head><title>Salary Receipt</title><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px}.hr-receipt-preview{background:#fff;max-width:820px;margin:auto;padding:28px;border:1px solid #cbd5e1;border-radius:18px}.hr-receipt-header{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:14px}.hr-receipt-title{font-size:26px;font-weight:900}.muted{color:#64748b}.hr-payslip-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.hr-payslip-table{width:100%;border-collapse:collapse;margin-top:12px}.hr-payslip-table th,.hr-payslip-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}.hr-receipt-note{margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.hr-signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:40px}.hr-signature-grid div{border-top:1px solid #0f172a;padding-top:10px}.hr-signature-grid span{display:block;color:#64748b;font-size:12px}.hr-receipt-footer{margin-top:20px;color:#64748b;font-size:12px;text-align:center}@media print{body{background:#fff;padding:0}.hr-receipt-preview{border:0;border-radius:0;max-width:none}}</style></head><body>${htmlBody}</body></html>`;
    const w = global.open('', '_blank');
    if (!w) return toast('Popup blocked. Allow popups to print salary receipt.');
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  }

  function wire() {
    if (state.initialized) return;
    state.initialized = true;
    document.addEventListener('click', async event => {
      const tab = event.target.closest?.('[data-hr-tab]');
      if (tab) { state.activeTab = tab.dataset.hrTab; renderRoot(); return; }
      if (event.target.closest?.('[data-hr-close-modal]')) { closeModals(); return; }
      const action = event.target.closest?.('[data-hr-action]')?.dataset.hrAction;
      if (action === 'new-employee') openEmployeeModal();
      if (action === 'new-attendance') openAttendanceModal();
      if (action === 'new-leave') openLeaveModal();
      if (action === 'new-holiday') openHolidayModal();
      if (action === 'new-document') openDocumentModal();
      if (action === 'new-receipt') openReceiptModal();
      if (action === 'generate-payroll') await generatePayroll();
      if (event.target.closest?.('[data-hr-reset-global-filters]')) { state.filters.globalEmployee = 'all'; state.filters.globalFrom = ''; state.filters.globalTo = ''; renderRoot(); return; }
      const editEmp = event.target.closest?.('[data-hr-edit-employee]')?.dataset.hrEditEmployee;
      if (editEmp) openEmployeeModal(editEmp);
      const attEmp = event.target.closest?.('[data-hr-attendance-employee]')?.dataset.hrAttendanceEmployee;
      if (attEmp) { state.activeTab = 'attendance'; state.filters.attendanceDepartment = getEmployee(attEmp)?.department || 'all'; renderRoot(); }
      const editAtt = event.target.closest?.('[data-hr-edit-attendance]')?.dataset.hrEditAttendance;
      if (editAtt) openAttendanceModal(editAtt);
      const absentBtn = event.target.closest?.('[data-hr-absent]');
      const absent = absentBtn?.dataset.hrAbsent;
      if (absent) await quickManualAttendance(absent, 'absent', absentBtn?.dataset.hrAbsentDate);
      const halfdayBtn = event.target.closest?.('[data-hr-halfday]');
      const halfday = halfdayBtn?.dataset.hrHalfday;
      if (halfday) await quickManualAttendance(halfday, 'half_day', halfdayBtn?.dataset.hrHalfdayDate);
      const clearAtt = event.target.closest?.('[data-hr-clear-attendance]')?.dataset.hrClearAttendance;
      if (clearAtt) await clearAttendance(clearAtt);
      const editLeave = event.target.closest?.('[data-hr-edit-leave]')?.dataset.hrEditLeave;
      if (editLeave) openLeaveModal(editLeave);
      const approveLeave = event.target.closest?.('[data-hr-approve-leave]')?.dataset.hrApproveLeave;
      if (approveLeave) await setLeaveStatus(approveLeave, 'approved');
      const rejectLeave = event.target.closest?.('[data-hr-reject-leave]')?.dataset.hrRejectLeave;
      if (rejectLeave) await setLeaveStatus(rejectLeave, 'rejected');
      const balBtn = event.target.closest?.('[data-hr-adjust-balance]');
      if (balBtn) openBalanceModal(balBtn.dataset.hrAdjustBalance, balBtn.dataset.leaveType);
      const editHoliday = event.target.closest?.('[data-hr-edit-holiday]')?.dataset.hrEditHoliday;
      if (editHoliday) openHolidayModal(editHoliday);
      const payrollStatus = event.target.closest?.('[data-hr-payroll-status]')?.dataset.hrPayrollStatus;
      if (payrollStatus) await setPayrollStatus(payrollStatus);
      const payslipItem = event.target.closest?.('[data-hr-payslip-item]')?.dataset.hrPayslipItem;
      if (payslipItem) { state.activeTab = 'payslips'; state.selectedPayslip = payslipItem; renderRoot(); }
      const selectPayslip = event.target.closest?.('[data-hr-select-payslip]')?.dataset.hrSelectPayslip;
      if (selectPayslip) { state.selectedPayslip = selectPayslip; renderRoot(); }
      const addReceipt = event.target.closest?.('[data-hr-add-receipt]')?.dataset.hrAddReceipt;
      if (addReceipt) openReceiptModal('', addReceipt);
      const editReceipt = event.target.closest?.('[data-hr-edit-receipt]')?.dataset.hrEditReceipt;
      if (editReceipt) openReceiptModal(editReceipt);
      const printReceipt = event.target.closest?.('[data-hr-print-receipt]')?.dataset.hrPrintReceipt;
      if (printReceipt) printSalaryReceipt(printReceipt);
      if (event.target.closest?.('[data-hr-reset-receipt-filters]')) { state.filters.receiptFrom = ''; state.filters.receiptTo = ''; renderBody(); }
      const printId = event.target.closest?.('[data-hr-print-payslip]')?.dataset.hrPrintPayslip;
      if (printId) printPayslip(printId);
      const editDoc = event.target.closest?.('[data-hr-edit-document]')?.dataset.hrEditDocument;
      if (editDoc) openDocumentModal(editDoc);
      const viewDoc = event.target.closest?.('[data-hr-view-document]')?.dataset.hrViewDocument;
      if (viewDoc) await openDocumentPdf(viewDoc, false);
      const downloadDoc = event.target.closest?.('[data-hr-download-document]')?.dataset.hrDownloadDocument;
      if (downloadDoc) await openDocumentPdf(downloadDoc, true);
      const removeDocPdf = event.target.closest?.('[data-hr-remove-document-pdf]')?.dataset.hrRemoveDocumentPdf;
      if (removeDocPdf) await removeDocumentPdf(removeDocPdf);
      if (event.target.closest?.('[data-hr-print-statement]')) printEmployeeStatement();
      if (event.target.closest?.('[data-hr-export-statement]')) exportEmployeeStatementCsv();
    });
    document.addEventListener('input', event => {
      if (event.target.id === 'hrEmployeeSearch') { state.filters.employeeSearch = event.target.value; renderBody(); }
    });
    document.addEventListener('change', event => {
      const id = event.target.id;
      if (id === 'hrGlobalEmployeeFilter') { state.filters.globalEmployee = event.target.value || 'all'; state.selectedPayslip = ''; renderRoot(); }
      if (id === 'hrGlobalFrom') { state.filters.globalFrom = event.target.value || ''; state.selectedPayslip = ''; renderRoot(); }
      if (id === 'hrGlobalTo') { state.filters.globalTo = event.target.value || ''; state.selectedPayslip = ''; renderRoot(); }
      if (id === 'hrDepartmentFilter') { state.filters.department = event.target.value; renderBody(); }
      if (id === 'hrEmployeeStatusFilter') { state.filters.employeeStatus = event.target.value; renderBody(); }
      if (id === 'hrAttendanceDate') { state.filters.attendanceDate = event.target.value || today(); renderRoot(); }
      if (id === 'hrAttendanceDepartmentFilter') { state.filters.attendanceDepartment = event.target.value; renderBody(); }
      if (id === 'hrLeaveStatusFilter') { state.filters.leaveStatus = event.target.value; renderBody(); }
      if (id === 'hrBalanceYear') { state.filters.balanceYear = event.target.value || String(new Date().getFullYear()); renderBody(); }
      if (id === 'hrHolidayYear') { state.filters.holidayYear = event.target.value || String(new Date().getFullYear()); renderBody(); }
      if (id === 'hrPayrollMonth') { state.filters.payrollMonth = event.target.value || currentMonth(); state.selectedPayslip = ''; renderRoot(); }
      if (id === 'hrPayslipRunFilter') { state.filters.payslipRunId = event.target.value; state.selectedPayslip = ''; renderBody(); }
      if (id === 'hrReceiptMonth') { state.filters.receiptMonth = event.target.value || currentMonth(); renderBody(); }
      if (id === 'hrReceiptEmployeeFilter') { state.filters.receiptEmployee = event.target.value || 'all'; renderBody(); }
      if (id === 'hrReceiptFrom') { state.filters.receiptFrom = event.target.value || ''; renderBody(); }
      if (id === 'hrReceiptTo') { state.filters.receiptTo = event.target.value || ''; renderBody(); }
      if (id === 'hrDocumentStatusFilter') { state.filters.documentStatus = event.target.value; renderBody(); }
      if (id === 'hrStatementStatusFilter') { state.filters.statementStatus = event.target.value || 'All'; renderBody(); }
    });
    document.addEventListener('submit', event => {
      if (event.target.id === 'hrEmployeeForm') saveEmployee(event);
      if (event.target.id === 'hrAttendanceForm') saveAttendance(event);
      if (event.target.id === 'hrLeaveForm') saveLeave(event);
      if (event.target.id === 'hrBalanceForm') saveBalance(event);
      if (event.target.id === 'hrHolidayForm') saveHoliday(event);
      if (event.target.id === 'hrReceiptForm') saveReceipt(event);
      if (event.target.id === 'hrDocumentForm') saveDocument(event);
      if (event.target.id === 'hrShiftForm') saveShift(event);
    });
    document.addEventListener('click', event => {
      if (event.target.id === 'hrRefreshBtn') refresh(true);
      if (event.target.id === 'hrNewEmployeeBtn') openEmployeeModal();
      if (event.target.id === 'hrExportAttendanceBtn') exportCsv('attendance');
      if (event.target.id === 'hrExportPayrollBtn') exportCsv('payroll');
    });
  }

  async function refresh(force = false) {
    if (state.loading) return;
    state.loading = true;
    try {
      if (force || state.dataSource !== 'supabase') {
        try { await loadRemote(); }
        catch (error) { console.warn('[HR] remote load failed, using confirmed cache', error); loadLocal(); state.dataSource = 'cache'; }
      }
      renderRoot();
    } finally { state.loading = false; }
  }

  async function init() {
    wire();
    loadLocal();
    await refresh(false);
  }

  global.HRModule = { init, wire, refresh, state, generatePayroll, workingDaysInMonth, leaveBalanceFor, computedDayStatus };
})(window);
