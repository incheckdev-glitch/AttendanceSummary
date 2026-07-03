(function initHRModule(global) {
  'use strict';

  const STORAGE_KEY = 'incheck360_hr_module_v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const uid = prefix => (global.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const num = value => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = value => value ? new Date(`${String(value).slice(0,10)}T00:00:00`).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }) : '—';
  const monthName = value => value ? new Date(`${String(value).slice(0,7)}-01T00:00:00`).toLocaleDateString(undefined, { month:'long', year:'numeric' }) : '—';
  const toIsoMonth = value => String(value || today()).slice(0, 7);
  const authProfile = () => global.Session?.authContext?.()?.profile || {};
  const authName = () => global.Session?.displayName?.() || authProfile()?.full_name || authProfile()?.email || 'System';

  const TABLES = {
    employees: 'hr_employees',
    shifts: 'hr_shifts',
    attendance: 'hr_attendance',
    leaveRequests: 'hr_leave_requests',
    documents: 'hr_documents',
    payrollRuns: 'hr_payroll_runs',
    payrollItems: 'hr_payroll_items',
    leaveTypes: 'hr_leave_types'
  };

  const state = {
    initialized: false,
    activeTab: 'dashboard',
    dataSource: 'local',
    loading: false,
    filters: {
      employeeSearch: '', department: 'all', status: 'active',
      attendanceDate: today(), attendanceDepartment: 'all',
      leaveStatus: 'all', payrollMonth: toIsoMonth(today()), payrollRunId: '', payslipRunId: '', documentStatus: 'all'
    },
    selectedPayslip: null,
    editEmployeeId: '',
    editAttendanceId: '',
    editLeaveId: '',
    editDocumentId: '',
    employees: [],
    shifts: [],
    attendance: [],
    leaveRequests: [],
    documents: [],
    payrollRuns: [],
    payrollItems: [],
    leaveTypes: []
  };

  const can = action => {
    if (!global.Permissions) return true;
    return Boolean(
      Permissions.can?.('hr', action) ||
      Permissions.can?.('hr', 'manage') ||
      Permissions.canPerformAction?.('hr', action) ||
      Permissions.canPerformAction?.('hr', 'manage') ||
      Permissions.hasAdminOverride?.()
    );
  };
  const canPayroll = action => {
    if (!global.Permissions) return true;
    return Boolean(
      Permissions.can?.('hr_payroll', action) ||
      Permissions.can?.('hr_payroll', 'manage') ||
      Permissions.can?.('hr', 'manage') ||
      Permissions.hasAdminOverride?.()
    );
  };

  function client() {
    try { return global.SupabaseClient?.getClient?.() || null; }
    catch { return null; }
  }

  function defaultShift() {
    return {
      id: uid('shift'), name: 'Office Shift', start_time: '09:00', end_time: '18:00', grace_minutes: 15,
      break_minutes: 60, working_days: 'Mon,Tue,Wed,Thu,Fri', weekend_days: 'Sat,Sun', overtime_rate: 1.5,
      late_deduction_per_minute: 0, early_leave_deduction_per_minute: 0, is_active: true, created_at: new Date().toISOString()
    };
  }

  function defaultLeaveTypes() {
    return [
      { id: uid('leave'), name: 'Annual Leave', paid: true, yearly_balance: 15, requires_document: false, is_active: true },
      { id: uid('leave'), name: 'Sick Leave', paid: true, yearly_balance: 7, requires_document: true, is_active: true },
      { id: uid('leave'), name: 'Emergency Leave', paid: true, yearly_balance: 3, requires_document: false, is_active: true },
      { id: uid('leave'), name: 'Unpaid Leave', paid: false, yearly_balance: 0, requires_document: false, is_active: true },
      { id: uid('leave'), name: 'Work From Home', paid: true, yearly_balance: 24, requires_document: false, is_active: true }
    ];
  }

  function buildSampleData() {
    const shift = defaultShift();
    const employeeA = {
      id: uid('emp'), employee_no: 'EMP-0001', full_name: 'Sample Employee', email: 'employee@incheck360.nl', phone: '',
      department: 'Operations', job_title: 'Operations Coordinator', manager_name: 'HR Manager', employment_type: 'Full-time', joining_date: `${new Date().getFullYear()}-01-01`,
      status: 'active', work_location: 'Office', shift_id: shift.id, leave_policy: 'Standard', base_salary: 1500, currency: 'USD', allowances: 100,
      fixed_deductions: 0, payment_method: 'Bank Transfer', bank_name: '', bank_account: '', salary_effective_date: `${new Date().getFullYear()}-01-01`, created_at: new Date().toISOString()
    };
    return {
      employees: [employeeA], shifts: [shift], attendance: [], leaveRequests: [], documents: [], payrollRuns: [], payrollItems: [], leaveTypes: defaultLeaveTypes()
    };
  }

  function plainState() {
    return {
      employees: state.employees,
      shifts: state.shifts,
      attendance: state.attendance,
      leaveRequests: state.leaveRequests,
      documents: state.documents,
      payrollRuns: state.payrollRuns,
      payrollItems: state.payrollItems,
      leaveTypes: state.leaveTypes
    };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(state, buildSampleData(), parsed);
        return;
      }
    } catch (error) {
      console.warn('[HR] local cache read failed', error);
    }
    Object.assign(state, buildSampleData());
    saveLocal();
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plainState())); }
    catch (error) { console.warn('[HR] local cache save failed', error); }
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
    const supabase = client();
    if (!supabase) throw new Error('Supabase is not configured');
    const [employees, shifts, attendance, leaveRequests, documents, payrollRuns, payrollItems, leaveTypes] = await Promise.all([
      fetchTable(TABLES.employees, 'employee_no', true),
      fetchTable(TABLES.shifts, 'name', true),
      fetchTable(TABLES.attendance, 'attendance_date', false),
      fetchTable(TABLES.leaveRequests, 'created_at', false),
      fetchTable(TABLES.documents, 'expiry_date', true),
      fetchTable(TABLES.payrollRuns, 'payroll_month', false),
      fetchTable(TABLES.payrollItems, 'created_at', false),
      fetchTable(TABLES.leaveTypes, 'name', true)
    ]);
    Object.assign(state, { employees, shifts, attendance, leaveRequests, documents, payrollRuns, payrollItems, leaveTypes, dataSource: 'supabase' });
    if (!state.shifts.length) state.shifts = [defaultShift()];
    if (!state.leaveTypes.length) state.leaveTypes = defaultLeaveTypes();
    saveLocal();
  }

  async function syncUpsert(table, row) {
    saveLocal();
    const supabase = client();
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
      if (error) throw error;
      state.dataSource = 'supabase';
      return data || row;
    } catch (error) {
      state.dataSource = 'local';
      console.warn(`[HR] Supabase upsert failed for ${table}; record kept locally`, error);
      global.UI?.toast?.('HR saved locally. Apply the HR SQL migration to enable Supabase sync.');
      return row;
    }
  }

  async function syncDelete(table, id) {
    saveLocal();
    const supabase = client();
    if (!supabase) return;
    try { await supabase.from(table).delete().eq('id', id); }
    catch (error) { console.warn(`[HR] Supabase delete failed for ${table}`, error); }
  }

  function employeeNo() {
    const max = state.employees.reduce((highest, emp) => {
      const match = String(emp.employee_no || '').match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `EMP-${String(max + 1).padStart(4, '0')}`;
  }

  function getEmployee(id) { return state.employees.find(item => String(item.id) === String(id)) || null; }
  function getShift(id) { return state.shifts.find(item => String(item.id) === String(id)) || state.shifts[0] || defaultShift(); }
  function statusChip(value) {
    const key = norm(value || 'active').replace(/\s+/g, '_');
    const cls = ['approved','paid','active','present'].includes(key) ? 'success' : ['pending','draft','late','reviewed'].includes(key) ? 'warning' : ['rejected','absent','terminated','overdue','expired'].includes(key) ? 'danger' : 'info';
    return `<span class="hr-chip ${cls}">${esc(String(value || '—').replace(/_/g, ' '))}</span>`;
  }

  function minutesFromTime(value) {
    const [h, m] = String(value || '00:00').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  }

  function hoursBetween(start, end) {
    if (!start || !end) return 0;
    let diff = minutesFromTime(end) - minutesFromTime(start);
    if (diff < 0) diff += 24 * 60;
    return Math.max(0, diff / 60);
  }

  function calculateAttendance(row) {
    const emp = getEmployee(row.employee_id);
    const shift = getShift(emp?.shift_id || row.shift_id);
    const workedRaw = hoursBetween(row.check_in_time, row.check_out_time);
    const worked = row.check_in_time && row.check_out_time ? Math.max(0, workedRaw - num(shift.break_minutes) / 60) : 0;
    const late = row.check_in_time ? Math.max(0, minutesFromTime(row.check_in_time) - minutesFromTime(shift.start_time) - num(shift.grace_minutes)) : 0;
    const early = row.check_out_time ? Math.max(0, minutesFromTime(shift.end_time) - minutesFromTime(row.check_out_time)) : 0;
    const overtime = row.check_out_time ? Math.max(0, (minutesFromTime(row.check_out_time) - minutesFromTime(shift.end_time)) / 60) : 0;
    let status = row.status || 'present';
    if (!row.check_in_time && !row.check_out_time && !['on_leave','holiday','weekend'].includes(status)) status = 'absent';
    else if (late > 0 && status === 'present') status = 'late';
    return { ...row, worked_hours: Number(worked.toFixed(2)), late_minutes: Math.round(late), early_leave_minutes: Math.round(early), overtime_hours: Number(overtime.toFixed(2)), status };
  }

  function inclusiveDays(start, end) {
    if (!start || !end) return 0;
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.floor((e - s) / 86400000) + 1;
  }

  function dateInRange(date, start, end) {
    return String(date || '') >= String(start || '') && String(date || '') <= String(end || '');
  }

  function workingDaysInMonth(month, shift) {
    const [year, monthIndex] = String(month).split('-').map(Number);
    if (!year || !monthIndex) return 0;
    const working = new Set(String(shift?.working_days || 'Mon,Tue,Wed,Thu,Fri').split(',').map(s => s.trim().slice(0,3)));
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const days = new Date(year, monthIndex, 0).getDate();
    let count = 0;
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, monthIndex - 1, day);
      if (working.has(names[date.getDay()])) count += 1;
    }
    return count;
  }

  function attendanceForEmployeeMonth(employeeId, month) {
    return state.attendance.filter(row => String(row.employee_id) === String(employeeId) && String(row.attendance_date || '').slice(0, 7) === month);
  }

  function approvedLeaveDays(employeeId, month, paid) {
    const [year, monthIndex] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = `${month}-${String(new Date(year, monthIndex, 0).getDate()).padStart(2, '0')}`;
    return state.leaveRequests.reduce((total, leave) => {
      if (String(leave.employee_id) !== String(employeeId)) return total;
      if (norm(leave.status) !== 'approved') return total;
      if (Boolean(leave.paid) !== Boolean(paid)) return total;
      const start = String(leave.start_date || '') < first ? first : leave.start_date;
      const end = String(leave.end_date || '') > last ? last : leave.end_date;
      if (!start || !end || end < first || start > last) return total;
      return total + inclusiveDays(start, end);
    }, 0);
  }

  function summarize() {
    const activeEmployees = state.employees.filter(emp => norm(emp.status || 'active') === 'active');
    const todayRows = state.attendance.filter(row => String(row.attendance_date) === today());
    const presentToday = todayRows.filter(row => ['present','late'].includes(norm(row.status))).length;
    const lateToday = todayRows.filter(row => norm(row.status) === 'late' || num(row.late_minutes) > 0).length;
    const onLeaveToday = state.leaveRequests.filter(row => norm(row.status) === 'approved' && dateInRange(today(), row.start_date, row.end_date)).length;
    const pendingLeaves = state.leaveRequests.filter(row => String(row.status || '').startsWith('pending')).length;
    const expiringDocs = state.documents.filter(doc => documentStatus(doc) === 'expiring').length;
    const currentRun = state.payrollRuns.find(run => run.payroll_month === state.filters.payrollMonth);
    return { activeEmployees: activeEmployees.length, presentToday, absentToday: Math.max(0, activeEmployees.length - presentToday - onLeaveToday), lateToday, onLeaveToday, pendingLeaves, expiringDocs, payrollStatus: currentRun?.status || 'not generated' };
  }

  function documentStatus(doc) {
    if (!doc.expiry_date) return doc.status || 'valid';
    const d = new Date(`${String(doc.expiry_date).slice(0,10)}T00:00:00`);
    const now = new Date(); now.setHours(0,0,0,0);
    const days = Math.ceil((d - now) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return doc.status || 'valid';
  }

  function renderRoot() {
    const root = $('hrRoot');
    if (!root) return;
    const source = state.dataSource === 'supabase'
      ? '<span class="hr-chip success">Supabase synced</span>'
      : '<span class="hr-chip warning">Local mode · apply SQL migration for Supabase</span>';
    root.innerHTML = `
      <div class="hr-page-header">
        <div>
          <span class="hr-eyebrow">People · Attendance · Payroll</span>
          <h2>HR & Payroll</h2>
          <p class="muted">Manage employees, attendance, leaves, monthly salary reports, payslips, documents, and HR settings.</p>
          <div>${source}</div>
        </div>
        <div class="hr-header-actions">
          <button id="hrRefreshBtn" class="btn ghost sm" type="button">Refresh</button>
          <button id="hrExportAttendanceBtn" class="btn ghost sm" type="button">Export Attendance</button>
          <button id="hrExportPayrollBtn" class="btn ghost sm" type="button">Export Payroll</button>
          <button id="hrNewEmployeeBtn" class="btn sm" data-permission-resource="hr" data-permission-action="create" type="button">New Employee</button>
        </div>
      </div>
      <nav class="hr-tabs" aria-label="HR sections">
        ${['dashboard','employees','attendance','leaves','payroll','payslips','documents','settings'].map(tab => `<button type="button" class="${state.activeTab === tab ? 'active' : ''}" data-hr-tab="${tab}">${tabLabel(tab)}</button>`).join('')}
      </nav>
      <div id="hrSummary" class="hr-summary-grid"></div>
      <div id="hrBody"></div>
      ${modalMarkup()}
    `;
    renderSummary();
    renderBody();
    global.applyPermissionVisibility?.(root);
  }

  function tabLabel(tab) {
    return ({ dashboard:'Dashboard', employees:'Employees', attendance:'Attendance', leaves:'Leave Management', payroll:'Monthly Payroll', payslips:'Payslips', documents:'Documents', settings:'HR Settings' })[tab] || tab;
  }

  function renderSummary() {
    const s = summarize();
    const target = $('hrSummary');
    if (!target) return;
    target.innerHTML = `
      ${metric('Employees', s.activeEmployees, 'Active employees')}
      ${metric('Present Today', s.presentToday, `${s.absentToday} absent · ${s.lateToday} late`)}
      ${metric('On Leave', s.onLeaveToday, `${s.pendingLeaves} pending requests`)}
      ${metric('Payroll', String(s.payrollStatus).replace(/_/g, ' '), monthName(state.filters.payrollMonth))}
    `;
  }

  function metric(label, value, sub) {
    return `<div class="hr-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub || '')}</small></div>`;
  }

  function renderBody() {
    const body = $('hrBody');
    if (!body) return;
    const renderers = { dashboard: renderDashboard, employees: renderEmployees, attendance: renderAttendance, leaves: renderLeaves, payroll: renderPayroll, payslips: renderPayslips, documents: renderDocuments, settings: renderSettings };
    body.innerHTML = (renderers[state.activeTab] || renderDashboard)();
    global.applyPermissionVisibility?.(body);
  }

  function departmentOptions(selected = 'all') {
    const values = Array.from(new Set(state.employees.map(emp => emp.department).filter(Boolean))).sort();
    return `<option value="all">All departments</option>${values.map(value => `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
  }

  function employeeOptions(selected = '') {
    return `<option value="">Select employee...</option>${state.employees.map(emp => `<option value="${esc(emp.id)}" ${String(selected) === String(emp.id) ? 'selected' : ''}>${esc(emp.employee_no || '')} · ${esc(emp.full_name || '')}</option>`).join('')}`;
  }

  function shiftOptions(selected = '') {
    return state.shifts.map(shift => `<option value="${esc(shift.id)}" ${String(selected) === String(shift.id) ? 'selected' : ''}>${esc(shift.name)}</option>`).join('');
  }

  function renderDashboard() {
    const month = state.filters.payrollMonth;
    const run = latestPayrollRun();
    const payrollItems = run ? state.payrollItems.filter(item => String(item.run_id) === String(run.id)) : [];
    const netPayroll = payrollItems.reduce((sum, item) => sum + num(item.net_salary), 0);
    const attendanceRows = state.attendance.filter(row => String(row.attendance_date || '').slice(0,7) === month);
    const lateMinutes = attendanceRows.reduce((sum, row) => sum + num(row.late_minutes), 0);
    const departments = Array.from(new Set(state.employees.map(emp => emp.department).filter(Boolean)));
    return `
      <div class="hr-grid-2">
        <section class="hr-panel">
          <div class="hr-panel-head"><div><h3>HR Overview</h3><p class="muted">Live operational snapshot for attendance and people management.</p></div></div>
          <div class="hr-dashboard-list">
            ${dashboardItem('Monthly net payroll', money(netPayroll, payrollItems[0]?.currency || 'USD'), run ? `${run.status} · ${monthName(run.payroll_month)}` : 'No payroll generated')}
            ${dashboardItem('Attendance rows this month', attendanceRows.length, `${lateMinutes} total late minutes`)}
            ${dashboardItem('Pending leave approvals', state.leaveRequests.filter(r => String(r.status || '').startsWith('pending')).length, 'Manager/HR approvals')}
            ${dashboardItem('Expiring documents', state.documents.filter(doc => documentStatus(doc) === 'expiring').length, 'Within 30 days')}
          </div>
        </section>
        <section class="hr-panel">
          <div class="hr-panel-head"><div><h3>Department Distribution</h3><p class="muted">Active employee count by department.</p></div></div>
          <div class="hr-dashboard-list">
            ${departments.length ? departments.map(dep => {
              const count = state.employees.filter(emp => emp.department === dep && norm(emp.status) === 'active').length;
              const pct = state.employees.length ? Math.round((count / Math.max(1, state.employees.length)) * 100) : 0;
              return `<div class="hr-mini-card"><strong>${esc(dep)} · ${count}</strong><div class="hr-progress"><span style="width:${pct}%"></span></div></div>`;
            }).join('') : empty('No departments yet.')}
          </div>
        </section>
      </div>
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Recommended HR Flow</h3><p class="muted">Employee → Shift → Attendance → Leave → Monthly Payroll → Payslip.</p></div></div>
        <div class="hr-grid-3">
          ${['Create employees with salary setup','Record attendance/check-in/out','Approve leaves and generate payroll'].map((item, index) => `<div class="hr-mini-card"><span class="hr-chip info">Step ${index + 1}</span><strong style="margin-top:10px">${esc(item)}</strong><p class="muted">${index === 0 ? 'Include department, job title, shift, salary, allowances, bank details.' : index === 1 ? 'Daily records calculate late minutes, worked hours, early leave and overtime.' : 'Payroll calculates gross, deductions, net salary and creates payslips.'}</p></div>`).join('')}
        </div>
      </section>
    `;
  }

  function dashboardItem(title, value, sub) {
    return `<div class="hr-dashboard-item"><div><strong>${esc(title)}</strong><div class="muted">${esc(sub)}</div></div><span class="hr-chip info">${esc(value)}</span></div>`;
  }

  function empty(text) { return `<div class="hr-empty">${esc(text)}</div>`; }

  function renderEmployees() {
    const rows = filteredEmployees();
    return `
      <section class="hr-panel">
        <div class="hr-panel-head">
          <div><h3>Employee Directory</h3><p class="muted">Core HR database with salary setup and shift assignment.</p></div>
          <div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-employee" data-permission-resource="hr" data-permission-action="create">New Employee</button></div>
        </div>
        <div class="hr-filter-grid">
          <input id="hrEmployeeSearch" class="input" type="search" placeholder="Search employee, email, job..." value="${esc(state.filters.employeeSearch)}">
          <select id="hrDepartmentFilter" class="select">${departmentOptions(state.filters.department)}</select>
          <select id="hrEmployeeStatusFilter" class="select"><option value="all">All statuses</option>${['active','suspended','resigned','terminated'].map(s => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn ghost sm" type="button" data-hr-action="clear-employee-filters">Clear</button>
        </div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>ID</th><th>Employee</th><th>Department</th><th>Shift</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          ${rows.length ? rows.map(emp => employeeRow(emp)).join('') : `<tr><td colspan="7">${empty('No employees found.')}</td></tr>`}
        </tbody></table></div>
      </section>
    `;
  }

  function filteredEmployees() {
    const search = norm(state.filters.employeeSearch);
    return state.employees.filter(emp => {
      if (state.filters.department !== 'all' && emp.department !== state.filters.department) return false;
      if (state.filters.status !== 'all' && norm(emp.status || 'active') !== state.filters.status) return false;
      if (!search) return true;
      return [emp.employee_no, emp.full_name, emp.email, emp.job_title, emp.department].some(value => norm(value).includes(search));
    });
  }

  function employeeRow(emp) {
    const shift = getShift(emp.shift_id);
    return `<tr>
      <td><strong>${esc(emp.employee_no || '—')}</strong><div class="muted">${esc(emp.employment_type || '')}</div></td>
      <td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.email || '')}</div></td>
      <td>${esc(emp.department || '—')}<div class="muted">${esc(emp.job_title || '')}</div></td>
      <td>${esc(shift.name || '—')}<div class="muted">${esc(shift.start_time)}-${esc(shift.end_time)}</div></td>
      <td>${money(emp.base_salary, emp.currency)}<div class="muted">Allow. ${money(emp.allowances, emp.currency)}</div></td>
      <td>${statusChip(emp.status || 'active')}</td>
      <td><div class="hr-row-actions"><button class="btn ghost xs" type="button" data-hr-edit-employee="${esc(emp.id)}">Edit</button><button class="btn ghost xs" type="button" data-hr-attendance-employee="${esc(emp.id)}">Attendance</button></div></td>
    </tr>`;
  }

  function renderAttendance() {
    const employees = state.employees.filter(emp => norm(emp.status || 'active') === 'active' && (state.filters.attendanceDepartment === 'all' || emp.department === state.filters.attendanceDepartment));
    const rows = employees.map(emp => {
      const existing = state.attendance.find(row => String(row.employee_id) === String(emp.id) && String(row.attendance_date) === state.filters.attendanceDate);
      return { emp, row: existing || null };
    });
    return `
      <section class="hr-panel">
        <div class="hr-panel-head">
          <div><h3>Attendance</h3><p class="muted">Manual, QR/mobile-ready attendance records with late, early leave, overtime and total hours.</p></div>
          <div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-attendance" data-permission-resource="hr_attendance" data-permission-action="create">Add Attendance</button></div>
        </div>
        <div class="hr-filter-grid">
          <input id="hrAttendanceDate" class="input" type="date" value="${esc(state.filters.attendanceDate)}">
          <select id="hrAttendanceDepartmentFilter" class="select">${departmentOptions(state.filters.attendanceDepartment)}</select>
          <button class="btn ghost sm" type="button" data-hr-action="mark-all-absent" data-permission-resource="hr_attendance" data-permission-action="create">Mark Missing as Absent</button>
        </div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Shift</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          ${rows.length ? rows.map(({emp, row}) => attendanceRow(emp, row)).join('') : `<tr><td colspan="7">${empty('No active employees found.')}</td></tr>`}
        </tbody></table></div>
      </section>
    `;
  }

  function attendanceRow(emp, row) {
    const shift = getShift(emp.shift_id);
    return `<tr>
      <td><strong>${esc(emp.full_name)}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td>
      <td>${esc(shift.name)}<div class="muted">${esc(shift.start_time)}-${esc(shift.end_time)} · grace ${num(shift.grace_minutes)}m</div></td>
      <td>${esc(row?.check_in_time || '—')}<div class="muted">${esc(row?.method || '')}</div></td>
      <td>${esc(row?.check_out_time || '—')}</td>
      <td>${num(row?.worked_hours).toFixed(2)}<div class="muted">Late ${num(row?.late_minutes)}m · OT ${num(row?.overtime_hours).toFixed(2)}h</div></td>
      <td>${row ? statusChip(row.status) : statusChip('missing')}</td>
      <td><div class="hr-row-actions">
        ${row ? `<button class="btn ghost xs" type="button" data-hr-edit-attendance="${esc(row.id)}">Edit</button>` : `<button class="btn ghost xs" type="button" data-hr-checkin="${esc(emp.id)}">Check In</button>`}
        ${row && !row.check_out_time ? `<button class="btn ghost xs" type="button" data-hr-checkout="${esc(row.id)}">Check Out</button>` : ''}
        ${!row ? `<button class="btn ghost xs" type="button" data-hr-absent="${esc(emp.id)}">Absent</button>` : ''}
      </div></td>
    </tr>`;
  }

  function renderLeaves() {
    const rows = state.leaveRequests.filter(row => state.filters.leaveStatus === 'all' || norm(row.status) === state.filters.leaveStatus);
    return `
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Leave Management</h3><p class="muted">Employee leave requests with manager and HR approval status.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-leave" data-permission-resource="hr_leave" data-permission-action="create">New Leave Request</button></div></div>
        <div class="hr-filter-grid"><select id="hrLeaveStatusFilter" class="select"><option value="all">All leave statuses</option>${['pending_manager','pending_hr','approved','rejected','cancelled'].map(s => `<option value="${s}" ${state.filters.leaveStatus === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          ${rows.length ? rows.map(leaveRow).join('') : `<tr><td colspan="7">${empty('No leave requests found.')}</td></tr>`}
        </tbody></table></div>
      </section>
    `;
  }

  function leaveRow(row) {
    const emp = getEmployee(row.employee_id) || {};
    return `<tr>
      <td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td>
      <td>${esc(row.leave_type || '—')}<div class="muted">${esc(row.reason || '')}</div></td>
      <td>${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}</td>
      <td>${num(row.days)}</td><td>${row.paid ? 'Yes' : 'No'}</td><td>${statusChip(row.status)}</td>
      <td><div class="hr-row-actions">
        <button class="btn ghost xs" type="button" data-hr-edit-leave="${esc(row.id)}">Edit</button>
        ${norm(row.status).startsWith('pending') ? `<button class="btn ghost xs" type="button" data-hr-approve-leave="${esc(row.id)}" data-permission-resource="hr_leave" data-permission-action="approve">Approve</button><button class="btn ghost xs" type="button" data-hr-reject-leave="${esc(row.id)}" data-permission-resource="hr_leave" data-permission-action="approve">Reject</button>` : ''}
      </div></td>
    </tr>`;
  }

  function renderPayroll() {
    const run = latestPayrollRun();
    const rows = run ? state.payrollItems.filter(item => String(item.run_id) === String(run.id)) : [];
    const totals = payrollTotals(rows);
    return `
      <section class="hr-panel">
        <div class="hr-panel-head">
          <div><h3>Monthly Payroll Report</h3><p class="muted">Generate salary report from attendance, leaves, overtime, allowances and deductions.</p></div>
          <div class="hr-toolbar"><input id="hrPayrollMonth" class="input" type="month" value="${esc(state.filters.payrollMonth)}"><button class="btn sm" type="button" data-hr-action="generate-payroll" data-permission-resource="hr_payroll" data-permission-action="generate">Generate Payroll</button></div>
        </div>
        ${run ? `<div class="hr-grid-3" style="margin-bottom:14px">${metric('Run Status', String(run.status || 'draft').replace(/_/g,' '), monthName(run.payroll_month))}${metric('Gross Salary', money(totals.gross, totals.currency), `${rows.length} employees`)}${metric('Net Salary', money(totals.net, totals.currency), `Deductions ${money(totals.deductions, totals.currency)}`)}</div>` : `<div class="hr-source-banner">No payroll generated for ${monthName(state.filters.payrollMonth)} yet.</div>`}
        ${run ? `<div class="hr-toolbar" style="margin-bottom:12px">
          <button class="btn ghost sm" type="button" data-hr-payroll-status="reviewed" data-permission-resource="hr_payroll" data-permission-action="review">Mark Reviewed</button>
          <button class="btn ghost sm" type="button" data-hr-payroll-status="approved" data-permission-resource="hr_payroll" data-permission-action="approve">Approve</button>
          <button class="btn ghost sm" type="button" data-hr-payroll-status="paid" data-permission-resource="hr_payroll" data-permission-action="pay">Mark Paid</button>
        </div>` : ''}
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Days</th><th>Basic</th><th>Allowances</th><th>Overtime</th><th>Deductions</th><th>Net</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          ${rows.length ? rows.map(payrollRow).join('') : `<tr><td colspan="9">${empty('Generate payroll to show monthly salary report.')}</td></tr>`}
        </tbody></table></div>
      </section>
    `;
  }

  function payrollRow(item) {
    const emp = getEmployee(item.employee_id) || {};
    return `<tr>
      <td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td>
      <td>Work ${num(item.working_days)} · Present ${num(item.present_days)}<div class="muted">Absent ${num(item.absent_days)} · Unpaid ${num(item.unpaid_leave_days)}</div></td>
      <td>${money(item.basic_salary, item.currency)}</td><td>${money(item.allowances, item.currency)}</td><td>${money(item.overtime_amount, item.currency)}</td><td>${money(item.deductions, item.currency)}</td><td><strong>${money(item.net_salary, item.currency)}</strong></td><td>${statusChip(item.status || 'draft')}</td>
      <td><button class="btn ghost xs" type="button" data-hr-payslip-item="${esc(item.id)}">Payslip</button></td>
    </tr>`;
  }

  function payrollTotals(rows) {
    return rows.reduce((acc, item) => {
      acc.gross += num(item.gross_salary); acc.net += num(item.net_salary); acc.deductions += num(item.deductions); acc.currency = item.currency || acc.currency; return acc;
    }, { gross:0, net:0, deductions:0, currency:'USD' });
  }

  function latestPayrollRun() {
    const month = state.filters.payrollMonth;
    return state.payrollRuns.filter(run => run.payroll_month === month).sort((a,b) => String(b.generated_at || b.created_at || '').localeCompare(String(a.generated_at || a.created_at || '')))[0] || null;
  }

  function renderPayslips() {
    const runs = state.payrollRuns.slice().sort((a,b) => String(b.payroll_month).localeCompare(String(a.payroll_month)));
    const runId = state.filters.payslipRunId || runs[0]?.id || '';
    const items = state.payrollItems.filter(item => String(item.run_id) === String(runId));
    const selected = state.selectedPayslip || items[0]?.id || '';
    const item = state.payrollItems.find(row => String(row.id) === String(selected));
    return `
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Payslips</h3><p class="muted">Employee payslip preview with print/save-as-PDF support.</p></div><div class="hr-toolbar"><select id="hrPayslipRunFilter" class="select">${runs.map(run => `<option value="${esc(run.id)}" ${runId === run.id ? 'selected' : ''}>${esc(monthName(run.payroll_month))} · ${esc(run.status)}</option>`).join('')}</select></div></div>
        <div class="hr-grid-2">
          <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Month</th><th>Net Salary</th><th>Action</th></tr></thead><tbody>${items.length ? items.map(item => {
            const emp = getEmployee(item.employee_id) || {};
            const run = state.payrollRuns.find(r => r.id === item.run_id) || {};
            return `<tr><td>${esc(emp.full_name || '—')}<div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(monthName(run.payroll_month))}</td><td>${money(item.net_salary, item.currency)}</td><td><button class="btn ghost xs" type="button" data-hr-select-payslip="${esc(item.id)}">Preview</button></td></tr>`;
          }).join('') : `<tr><td colspan="4">${empty('No payslips found. Generate payroll first.')}</td></tr>`}</tbody></table></div>
          <div>${item ? payslipHtml(item, true) : empty('Select a payslip to preview.')}</div>
        </div>
      </section>
    `;
  }

  function payslipHtml(item, includeAction = false) {
    const emp = getEmployee(item.employee_id) || {};
    const run = state.payrollRuns.find(row => String(row.id) === String(item.run_id)) || {};
    return `<div class="hr-payslip-preview" id="hrPayslipPreview">
      <div class="hr-payslip-header"><div><div class="hr-payslip-title">Payslip</div><div class="muted">InCheck360 Payroll</div></div><div style="text-align:right"><strong>${esc(monthName(run.payroll_month))}</strong><div>${statusChip(run.status || 'draft')}</div></div></div>
      <div class="hr-payslip-grid"><div><strong>Employee</strong><div>${esc(emp.full_name || '—')}</div><div class="muted">${esc(emp.employee_no || '')} · ${esc(emp.job_title || '')}</div></div><div><strong>Department</strong><div>${esc(emp.department || '—')}</div><div class="muted">Payment: ${esc(emp.payment_method || '—')}</div></div></div>
      <table class="hr-payslip-table"><thead><tr><th>Earnings</th><th>Amount</th></tr></thead><tbody><tr><td>Basic Salary</td><td>${money(item.basic_salary, item.currency)}</td></tr><tr><td>Allowances</td><td>${money(item.allowances, item.currency)}</td></tr><tr><td>Overtime</td><td>${money(item.overtime_amount, item.currency)}</td></tr><tr><td><strong>Gross Salary</strong></td><td><strong>${money(item.gross_salary, item.currency)}</strong></td></tr></tbody></table>
      <table class="hr-payslip-table"><thead><tr><th>Deductions</th><th>Amount</th></tr></thead><tbody><tr><td>Absence / Unpaid Leave / Late / Fixed Deductions</td><td>${money(item.deductions, item.currency)}</td></tr></tbody></table>
      <div class="hr-payslip-grid"><div><strong>Attendance</strong><div>Present ${num(item.present_days)} / Working ${num(item.working_days)}</div><div class="muted">Paid leave ${num(item.paid_leave_days)} · Unpaid leave ${num(item.unpaid_leave_days)} · Late ${num(item.late_minutes)}m</div></div><div><strong>Payment Date</strong><div>${fmtDate(run.paid_at || run.approved_at || run.generated_at)}</div><div class="muted">Prepared by ${esc(run.generated_by || 'HR')}</div></div></div>
      <div class="hr-payslip-total"><span>Net Salary</span><span>${money(item.net_salary, item.currency)}</span></div>
      ${includeAction ? `<div class="hr-toolbar" style="margin-top:14px; justify-content:flex-end"><button class="btn sm" type="button" data-hr-print-payslip="${esc(item.id)}">Print / Save PDF</button></div>` : ''}
    </div>`;
  }

  function renderDocuments() {
    const rows = state.documents.filter(doc => state.filters.documentStatus === 'all' || documentStatus(doc) === state.filters.documentStatus);
    return `
      <section class="hr-panel">
        <div class="hr-panel-head"><div><h3>Employee Documents</h3><p class="muted">Track employee files, missing documents and expiry alerts.</p></div><div class="hr-toolbar"><button class="btn sm" type="button" data-hr-action="new-document" data-permission-resource="hr_documents" data-permission-action="create">Add Document</button></div></div>
        <div class="hr-filter-grid"><select id="hrDocumentStatusFilter" class="select"><option value="all">All documents</option>${['valid','expiring','expired','missing'].map(s => `<option value="${s}" ${state.filters.documentStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Type</th><th>Document</th><th>Expiry</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(documentRow).join('') : `<tr><td colspan="7">${empty('No employee documents found.')}</td></tr>`}</tbody></table></div>
      </section>
    `;
  }

  function documentRow(row) {
    const emp = getEmployee(row.employee_id) || {};
    return `<tr><td><strong>${esc(emp.full_name || '—')}</strong><div class="muted">${esc(emp.employee_no || '')}</div></td><td>${esc(row.document_type || '—')}</td><td>${esc(row.document_name || '—')}</td><td>${fmtDate(row.expiry_date)}</td><td>${statusChip(documentStatus(row))}</td><td>${esc(row.notes || '')}</td><td><button class="btn ghost xs" type="button" data-hr-edit-document="${esc(row.id)}">Edit</button></td></tr>`;
  }

  function renderSettings() {
    return `
      <div class="hr-grid-2">
        <section class="hr-panel">
          <div class="hr-panel-head"><div><h3>Shift Policies</h3><p class="muted">Control attendance calculations, grace period and overtime.</p></div></div>
          <form id="hrShiftForm" class="hr-inline-form">
            <input type="hidden" id="hrShiftId" value="${esc(state.shifts[0]?.id || '')}">
            <label>Name<input id="hrShiftName" class="input" value="${esc(state.shifts[0]?.name || 'Office Shift')}"></label>
            <label>Start<input id="hrShiftStart" class="input" type="time" value="${esc(state.shifts[0]?.start_time || '09:00')}"></label>
            <label>End<input id="hrShiftEnd" class="input" type="time" value="${esc(state.shifts[0]?.end_time || '18:00')}"></label>
            <label>Grace Minutes<input id="hrShiftGrace" class="input" type="number" value="${esc(state.shifts[0]?.grace_minutes || 15)}"></label>
            <label>Break Minutes<input id="hrShiftBreak" class="input" type="number" value="${esc(state.shifts[0]?.break_minutes || 60)}"></label>
            <label>Working Days<input id="hrShiftWorkingDays" class="input" value="${esc(state.shifts[0]?.working_days || 'Mon,Tue,Wed,Thu,Fri')}"></label>
            <label>Overtime Rate<input id="hrShiftOvertimeRate" class="input" type="number" step="0.01" value="${esc(state.shifts[0]?.overtime_rate || 1.5)}"></label>
            <button class="btn sm" type="submit" data-permission-resource="hr_settings" data-permission-action="update">Save Shift</button>
          </form>
        </section>
        <section class="hr-panel">
          <div class="hr-panel-head"><div><h3>Leave Types</h3><p class="muted">Configurable paid/unpaid leave categories.</p></div></div>
          <div class="hr-dashboard-list">${state.leaveTypes.map(type => `<div class="hr-dashboard-item"><div><strong>${esc(type.name)}</strong><div class="muted">${type.paid ? 'Paid' : 'Unpaid'} · ${num(type.yearly_balance)} days/year</div></div>${statusChip(type.is_active ? 'active' : 'inactive')}</div>`).join('')}</div>
        </section>
      </div>
    `;
  }

  function modalMarkup() {
    return `
      <div id="hrEmployeeModal" class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="hrEmployeeModalTitle" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrEmployeeForm" class="hr-dialog"><header><div><span class="hr-eyebrow">HR</span><h3 id="hrEmployeeModalTitle">Employee</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${employeeFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Employee</button></footer></form></div>
      <div id="hrAttendanceModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrAttendanceForm" class="hr-dialog"><header><div><span class="hr-eyebrow">Attendance</span><h3>Attendance Record</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${attendanceFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Attendance</button></footer></form></div>
      <div id="hrLeaveModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrLeaveForm" class="hr-dialog"><header><div><span class="hr-eyebrow">Leave</span><h3>Leave Request</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${leaveFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Leave</button></footer></form></div>
      <div id="hrDocumentModal" class="hr-modal" role="dialog" aria-modal="true" hidden><button class="hr-modal-backdrop" data-hr-close-modal type="button"></button><form id="hrDocumentForm" class="hr-dialog"><header><div><span class="hr-eyebrow">Documents</span><h3>Employee Document</h3></div><button class="btn ghost sm" data-hr-close-modal type="button">Close</button></header><div class="hr-dialog-body"><div class="hr-form-grid">${documentFields()}</div></div><footer class="hr-dialog-footer"><button class="btn ghost sm" data-hr-close-modal type="button">Cancel</button><button class="btn sm" type="submit">Save Document</button></footer></form></div>
    `;
  }

  function employeeFields() {
    return `
      <input type="hidden" id="hrEmployeeId"><label>Employee ID<input id="hrEmployeeNo" class="input" readonly></label><label>Full Name *<input id="hrEmployeeName" class="input" required></label><label>Email<input id="hrEmployeeEmail" class="input" type="email"></label><label>Phone<input id="hrEmployeePhone" class="input"></label><label>Department<input id="hrEmployeeDepartment" class="input"></label><label>Job Title<input id="hrEmployeeJobTitle" class="input"></label><label>Manager<input id="hrEmployeeManager" class="input"></label><label>Employment Type<select id="hrEmployeeType" class="select"><option>Full-time</option><option>Part-time</option><option>Contractor</option><option>Intern</option></select></label><label>Joining Date<input id="hrEmployeeJoinDate" class="input" type="date"></label><label>Status<select id="hrEmployeeStatus" class="select"><option value="active">Active</option><option value="suspended">Suspended</option><option value="resigned">Resigned</option><option value="terminated">Terminated</option></select></label><label>Work Location<input id="hrEmployeeLocation" class="input"></label><label>Shift<select id="hrEmployeeShift" class="select">${shiftOptions()}</select></label><label>Base Salary<input id="hrEmployeeBaseSalary" class="input" type="number" step="0.01"></label><label>Currency<input id="hrEmployeeCurrency" class="input" value="USD"></label><label>Allowances<input id="hrEmployeeAllowances" class="input" type="number" step="0.01"></label><label>Fixed Deductions<input id="hrEmployeeDeductions" class="input" type="number" step="0.01"></label><label>Payment Method<input id="hrEmployeePaymentMethod" class="input" value="Bank Transfer"></label><label>Bank Name<input id="hrEmployeeBankName" class="input"></label><label>Bank Account<input id="hrEmployeeBankAccount" class="input"></label><label>Salary Effective Date<input id="hrEmployeeSalaryDate" class="input" type="date"></label>
    `;
  }

  function attendanceFields() {
    return `<input type="hidden" id="hrAttendanceId"><label>Employee<select id="hrAttendanceEmployee" class="select" required>${employeeOptions()}</select></label><label>Date<input id="hrAttendanceModalDate" class="input" type="date" required></label><label>Check In<input id="hrAttendanceCheckIn" class="input" type="time"></label><label>Check Out<input id="hrAttendanceCheckOut" class="input" type="time"></label><label>Status<select id="hrAttendanceStatus" class="select"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="half_day">Half Day</option><option value="on_leave">On Leave</option><option value="holiday">Holiday</option><option value="weekend">Weekend</option></select></label><label>Method<select id="hrAttendanceMethod" class="select"><option>Manual</option><option>QR</option><option>Mobile</option><option>Web</option><option>Imported</option></select></label><label class="full">Notes<textarea id="hrAttendanceNotes" class="input"></textarea></label>`;
  }

  function leaveFields() {
    return `<input type="hidden" id="hrLeaveId"><label>Employee<select id="hrLeaveEmployee" class="select" required>${employeeOptions()}</select></label><label>Leave Type<select id="hrLeaveType" class="select">${state.leaveTypes.map(type => `<option value="${esc(type.name)}" data-paid="${type.paid ? '1' : '0'}">${esc(type.name)}</option>`).join('')}</select></label><label>Start Date<input id="hrLeaveStart" class="input" type="date" required></label><label>End Date<input id="hrLeaveEnd" class="input" type="date" required></label><label>Status<select id="hrLeaveStatus" class="select"><option value="pending_manager">Pending Manager</option><option value="pending_hr">Pending HR</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></label><label>Paid<select id="hrLeavePaid" class="select"><option value="true">Paid</option><option value="false">Unpaid</option></select></label><label class="full">Reason<textarea id="hrLeaveReason" class="input"></textarea></label>`;
  }

  function documentFields() {
    return `<input type="hidden" id="hrDocumentId"><label>Employee<select id="hrDocumentEmployee" class="select" required>${employeeOptions()}</select></label><label>Document Type<select id="hrDocumentType" class="select"><option>Contract</option><option>ID / Passport</option><option>Work Permit</option><option>Certificate</option><option>NDA</option><option>Bank Details</option><option>Insurance</option><option>Other</option></select></label><label>Document Name<input id="hrDocumentName" class="input" required></label><label>Expiry Date<input id="hrDocumentExpiry" class="input" type="date"></label><label>Status<select id="hrDocumentStatus" class="select"><option value="valid">Valid</option><option value="missing">Missing</option><option value="expired">Expired</option></select></label><label class="full">Notes<textarea id="hrDocumentNotes" class="input"></textarea></label>`;
  }

  function openModal(id) { const modal = $(id); if (modal) { modal.hidden = false; global.ModalScrollLock?.lock?.(); } }
  function closeModals() { document.querySelectorAll('.hr-modal').forEach(modal => { modal.hidden = true; }); global.ModalScrollLock?.unlock?.(); }

  function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ''; }
  function value(id) { return $(id)?.value ?? ''; }

  function openEmployeeModal(employeeId = '') {
    state.editEmployeeId = employeeId || '';
    renderRoot();
    const emp = getEmployee(employeeId) || { id:'', employee_no: employeeNo(), status:'active', employment_type:'Full-time', shift_id: state.shifts[0]?.id, currency:'USD', payment_method:'Bank Transfer', joining_date: today(), salary_effective_date: today() };
    setValue('hrEmployeeId', emp.id); setValue('hrEmployeeNo', emp.employee_no); setValue('hrEmployeeName', emp.full_name); setValue('hrEmployeeEmail', emp.email); setValue('hrEmployeePhone', emp.phone); setValue('hrEmployeeDepartment', emp.department); setValue('hrEmployeeJobTitle', emp.job_title); setValue('hrEmployeeManager', emp.manager_name); setValue('hrEmployeeType', emp.employment_type || 'Full-time'); setValue('hrEmployeeJoinDate', emp.joining_date); setValue('hrEmployeeStatus', emp.status || 'active'); setValue('hrEmployeeLocation', emp.work_location); setValue('hrEmployeeShift', emp.shift_id || state.shifts[0]?.id); setValue('hrEmployeeBaseSalary', emp.base_salary); setValue('hrEmployeeCurrency', emp.currency || 'USD'); setValue('hrEmployeeAllowances', emp.allowances); setValue('hrEmployeeDeductions', emp.fixed_deductions); setValue('hrEmployeePaymentMethod', emp.payment_method || 'Bank Transfer'); setValue('hrEmployeeBankName', emp.bank_name); setValue('hrEmployeeBankAccount', emp.bank_account); setValue('hrEmployeeSalaryDate', emp.salary_effective_date);
    openModal('hrEmployeeModal');
  }

  async function saveEmployee(event) {
    event.preventDefault();
    if (!can('create') && !can('update')) return global.UI?.toast?.('You do not have permission to save employees.');
    const id = value('hrEmployeeId') || uid('emp');
    const existing = getEmployee(id) || {};
    const row = { ...existing, id, employee_no: value('hrEmployeeNo') || employeeNo(), full_name: value('hrEmployeeName'), email: value('hrEmployeeEmail'), phone: value('hrEmployeePhone'), department: value('hrEmployeeDepartment'), job_title: value('hrEmployeeJobTitle'), manager_name: value('hrEmployeeManager'), employment_type: value('hrEmployeeType'), joining_date: value('hrEmployeeJoinDate') || null, status: value('hrEmployeeStatus') || 'active', work_location: value('hrEmployeeLocation'), shift_id: value('hrEmployeeShift') || null, leave_policy: existing.leave_policy || 'Standard', base_salary: num(value('hrEmployeeBaseSalary')), currency: value('hrEmployeeCurrency') || 'USD', allowances: num(value('hrEmployeeAllowances')), fixed_deductions: num(value('hrEmployeeDeductions')), payment_method: value('hrEmployeePaymentMethod'), bank_name: value('hrEmployeeBankName'), bank_account: value('hrEmployeeBankAccount'), salary_effective_date: value('hrEmployeeSalaryDate') || null, updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.employees.findIndex(emp => emp.id === id);
    if (index >= 0) state.employees[index] = row; else state.employees.unshift(row);
    await syncUpsert(TABLES.employees, row);
    closeModals(); renderRoot(); global.UI?.toast?.('Employee saved.');
  }

  function openAttendanceModal(attendanceId = '', employeeId = '') {
    state.editAttendanceId = attendanceId || '';
    renderRoot();
    const row = state.attendance.find(item => String(item.id) === String(attendanceId)) || { id:'', employee_id: employeeId || '', attendance_date: state.filters.attendanceDate, check_in_time: '', check_out_time: '', status:'present', method:'Manual', notes:'' };
    setValue('hrAttendanceId', row.id); setValue('hrAttendanceEmployee', row.employee_id); setValue('hrAttendanceModalDate', row.attendance_date); setValue('hrAttendanceCheckIn', row.check_in_time); setValue('hrAttendanceCheckOut', row.check_out_time); setValue('hrAttendanceStatus', row.status || 'present'); setValue('hrAttendanceMethod', row.method || 'Manual'); setValue('hrAttendanceNotes', row.notes || '');
    openModal('hrAttendanceModal');
  }

  async function saveAttendance(event) {
    event.preventDefault();
    if (!can('manage_attendance') && !can('create')) return global.UI?.toast?.('You do not have permission to save attendance.');
    const id = value('hrAttendanceId') || uid('att');
    const existing = state.attendance.find(row => row.id === id) || {};
    let row = { ...existing, id, employee_id: value('hrAttendanceEmployee'), attendance_date: value('hrAttendanceModalDate') || today(), check_in_time: value('hrAttendanceCheckIn') || null, check_out_time: value('hrAttendanceCheckOut') || null, status: value('hrAttendanceStatus') || 'present', method: value('hrAttendanceMethod') || 'Manual', notes: value('hrAttendanceNotes'), approved_by: authName(), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    row = calculateAttendance(row);
    const index = state.attendance.findIndex(item => item.id === id);
    if (index >= 0) state.attendance[index] = row; else state.attendance.unshift(row);
    await syncUpsert(TABLES.attendance, row);
    closeModals(); renderRoot(); global.UI?.toast?.('Attendance saved.');
  }

  async function quickAttendance(employeeId, type) {
    const existing = state.attendance.find(row => String(row.employee_id) === String(employeeId) && String(row.attendance_date) === state.filters.attendanceDate);
    let row = existing || { id: uid('att'), employee_id: employeeId, attendance_date: state.filters.attendanceDate, method:'Manual', created_at: new Date().toISOString() };
    if (type === 'checkin') { row.check_in_time = nowTime(); row.status = 'present'; }
    if (type === 'checkout') { row.check_out_time = nowTime(); }
    if (type === 'absent') { row.check_in_time = null; row.check_out_time = null; row.status = 'absent'; }
    row.approved_by = authName(); row.updated_at = new Date().toISOString(); row = calculateAttendance(row);
    const index = state.attendance.findIndex(item => item.id === row.id);
    if (index >= 0) state.attendance[index] = row; else state.attendance.unshift(row);
    await syncUpsert(TABLES.attendance, row);
    renderRoot();
  }

  async function markAllMissingAbsent() {
    const active = state.employees.filter(emp => norm(emp.status || 'active') === 'active');
    for (const emp of active) {
      const exists = state.attendance.some(row => String(row.employee_id) === String(emp.id) && String(row.attendance_date) === state.filters.attendanceDate);
      if (!exists) {
        const row = calculateAttendance({ id: uid('att'), employee_id: emp.id, attendance_date: state.filters.attendanceDate, status:'absent', method:'Manual', notes:'Auto-marked missing as absent', approved_by: authName(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        state.attendance.unshift(row);
        await syncUpsert(TABLES.attendance, row);
      }
    }
    renderRoot(); global.UI?.toast?.('Missing employees marked as absent.');
  }

  function openLeaveModal(leaveId = '') {
    renderRoot();
    const row = state.leaveRequests.find(item => String(item.id) === String(leaveId)) || { id:'', employee_id:'', leave_type: state.leaveTypes[0]?.name || 'Annual Leave', start_date: today(), end_date: today(), status:'pending_manager', paid:true, reason:'' };
    setValue('hrLeaveId', row.id); setValue('hrLeaveEmployee', row.employee_id); setValue('hrLeaveType', row.leave_type); setValue('hrLeaveStart', row.start_date); setValue('hrLeaveEnd', row.end_date); setValue('hrLeaveStatus', row.status || 'pending_manager'); setValue('hrLeavePaid', row.paid === false ? 'false' : 'true'); setValue('hrLeaveReason', row.reason || '');
    openModal('hrLeaveModal');
  }

  async function saveLeave(event) {
    event.preventDefault();
    const id = value('hrLeaveId') || uid('leave-req');
    const existing = state.leaveRequests.find(row => row.id === id) || {};
    const row = { ...existing, id, employee_id: value('hrLeaveEmployee'), leave_type: value('hrLeaveType'), start_date: value('hrLeaveStart'), end_date: value('hrLeaveEnd'), days: inclusiveDays(value('hrLeaveStart'), value('hrLeaveEnd')), status: value('hrLeaveStatus') || 'pending_manager', paid: value('hrLeavePaid') !== 'false', reason: value('hrLeaveReason'), manager_status: value('hrLeaveStatus') === 'pending_manager' ? 'pending' : 'approved', hr_status: value('hrLeaveStatus') === 'approved' ? 'approved' : 'pending', updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString(), requested_by: existing.requested_by || authName() };
    const index = state.leaveRequests.findIndex(item => item.id === id);
    if (index >= 0) state.leaveRequests[index] = row; else state.leaveRequests.unshift(row);
    await syncUpsert(TABLES.leaveRequests, row);
    closeModals(); renderRoot(); global.UI?.toast?.('Leave request saved.');
  }

  async function setLeaveStatus(id, status) {
    const row = state.leaveRequests.find(item => String(item.id) === String(id));
    if (!row) return;
    Object.assign(row, { status, manager_status: status === 'approved' ? 'approved' : row.manager_status, hr_status: status === 'approved' ? 'approved' : status, approved_by: status === 'approved' ? authName() : row.approved_by, updated_at: new Date().toISOString() });
    await syncUpsert(TABLES.leaveRequests, row);
    renderRoot();
  }

  function openDocumentModal(documentId = '') {
    renderRoot();
    const row = state.documents.find(item => String(item.id) === String(documentId)) || { id:'', employee_id:'', document_type:'Contract', document_name:'', expiry_date:'', status:'valid', notes:'' };
    setValue('hrDocumentId', row.id); setValue('hrDocumentEmployee', row.employee_id); setValue('hrDocumentType', row.document_type); setValue('hrDocumentName', row.document_name); setValue('hrDocumentExpiry', row.expiry_date); setValue('hrDocumentStatus', row.status || 'valid'); setValue('hrDocumentNotes', row.notes || '');
    openModal('hrDocumentModal');
  }

  async function saveDocument(event) {
    event.preventDefault();
    const id = value('hrDocumentId') || uid('doc');
    const existing = state.documents.find(row => row.id === id) || {};
    const row = { ...existing, id, employee_id: value('hrDocumentEmployee'), document_type: value('hrDocumentType'), document_name: value('hrDocumentName'), expiry_date: value('hrDocumentExpiry') || null, status: value('hrDocumentStatus') || 'valid', notes: value('hrDocumentNotes'), updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.documents.findIndex(item => item.id === id);
    if (index >= 0) state.documents[index] = row; else state.documents.unshift(row);
    await syncUpsert(TABLES.documents, row);
    closeModals(); renderRoot(); global.UI?.toast?.('Document saved.');
  }

  function calculatePayrollItem(emp, run) {
    const shift = getShift(emp.shift_id);
    const month = run.payroll_month;
    const working = workingDaysInMonth(month, shift);
    const records = attendanceForEmployeeMonth(emp.id, month);
    const present = records.filter(row => ['present','late','half_day'].includes(norm(row.status))).length;
    const paidLeave = approvedLeaveDays(emp.id, month, true);
    const unpaidLeave = approvedLeaveDays(emp.id, month, false);
    const absentMarked = records.filter(row => norm(row.status) === 'absent').length;
    const absent = Math.max(absentMarked, Math.max(0, working - present - paidLeave - unpaidLeave));
    const dailyRate = working > 0 ? num(emp.base_salary) / working : 0;
    const hourlyRate = dailyRate / 8;
    const lateMinutes = records.reduce((sum, row) => sum + num(row.late_minutes), 0);
    const overtimeHours = records.reduce((sum, row) => sum + num(row.overtime_hours), 0);
    const lateDeduction = lateMinutes * num(shift.late_deduction_per_minute);
    const absenceDeduction = (absent + unpaidLeave) * dailyRate;
    const overtimeAmount = overtimeHours * hourlyRate * num(shift.overtime_rate || 1.5);
    const allowances = num(emp.allowances);
    const deductions = absenceDeduction + lateDeduction + num(emp.fixed_deductions);
    const gross = num(emp.base_salary) + allowances + overtimeAmount;
    return {
      id: uid('pay-item'), run_id: run.id, employee_id: emp.id, currency: emp.currency || run.currency || 'USD',
      working_days: working, present_days: present, absent_days: absent, paid_leave_days: paidLeave, unpaid_leave_days: unpaidLeave,
      late_minutes: lateMinutes, overtime_hours: Number(overtimeHours.toFixed(2)), basic_salary: num(emp.base_salary), daily_rate: Number(dailyRate.toFixed(2)),
      allowances: Number(allowances.toFixed(2)), overtime_amount: Number(overtimeAmount.toFixed(2)), deductions: Number(deductions.toFixed(2)),
      gross_salary: Number(gross.toFixed(2)), net_salary: Number(Math.max(0, gross - deductions).toFixed(2)), status: 'draft', created_at: new Date().toISOString(), notes: ''
    };
  }

  async function generatePayroll() {
    if (!canPayroll('generate')) return global.UI?.toast?.('You do not have permission to generate payroll.');
    const month = state.filters.payrollMonth;
    const oldRun = state.payrollRuns.find(run => run.payroll_month === month && ['approved','paid'].includes(norm(run.status)));
    if (oldRun) return global.UI?.toast?.('Approved/paid payroll is locked. Create adjustments in next run.');
    const run = { id: uid('pay-run'), payroll_month: month, status:'draft', currency:'USD', generated_at: new Date().toISOString(), generated_by: authName(), created_at: new Date().toISOString() };
    const draftRunIds = state.payrollRuns
      .filter(item => item.payroll_month === month && norm(item.status) === 'draft')
      .map(item => item.id);
    state.payrollRuns = state.payrollRuns.filter(item => !draftRunIds.includes(item.id));
    state.payrollItems = state.payrollItems.filter(item => !draftRunIds.includes(item.run_id));
    for (const oldRunId of draftRunIds) await syncDelete(TABLES.payrollRuns, oldRunId);
    state.payrollRuns.unshift(run);
    const items = state.employees.filter(emp => norm(emp.status || 'active') === 'active').map(emp => calculatePayrollItem(emp, run));
    state.payrollItems.unshift(...items);
    await syncUpsert(TABLES.payrollRuns, run);
    for (const item of items) await syncUpsert(TABLES.payrollItems, item);
    state.selectedPayslip = items[0]?.id || '';
    renderRoot(); global.UI?.toast?.('Monthly payroll generated.');
  }

  async function setPayrollStatus(status) {
    const run = latestPayrollRun();
    if (!run) return;
    if (status === 'approved' && !canPayroll('approve')) return global.UI?.toast?.('You do not have permission to approve payroll.');
    if (status === 'paid' && !canPayroll('pay')) return global.UI?.toast?.('You do not have permission to mark payroll paid.');
    run.status = status;
    if (status === 'approved') run.approved_at = new Date().toISOString();
    if (status === 'paid') run.paid_at = new Date().toISOString();
    const items = state.payrollItems.filter(item => item.run_id === run.id);
    items.forEach(item => { item.status = status; });
    await syncUpsert(TABLES.payrollRuns, run);
    for (const item of items) await syncUpsert(TABLES.payrollItems, item);
    renderRoot();
  }

  async function saveShift(event) {
    event.preventDefault();
    const id = value('hrShiftId') || uid('shift');
    const existing = state.shifts.find(row => row.id === id) || {};
    const row = { ...existing, id, name: value('hrShiftName') || 'Office Shift', start_time: value('hrShiftStart') || '09:00', end_time: value('hrShiftEnd') || '18:00', grace_minutes: num(value('hrShiftGrace')), break_minutes: num(value('hrShiftBreak')), working_days: value('hrShiftWorkingDays') || 'Mon,Tue,Wed,Thu,Fri', weekend_days: existing.weekend_days || 'Sat,Sun', overtime_rate: num(value('hrShiftOvertimeRate') || 1.5), late_deduction_per_minute: existing.late_deduction_per_minute || 0, early_leave_deduction_per_minute: existing.early_leave_deduction_per_minute || 0, is_active: true, updated_at: new Date().toISOString(), created_at: existing.created_at || new Date().toISOString() };
    const index = state.shifts.findIndex(item => item.id === id);
    if (index >= 0) state.shifts[index] = row; else state.shifts.unshift(row);
    await syncUpsert(TABLES.shifts, row);
    renderRoot(); global.UI?.toast?.('Shift policy saved.');
  }

  function exportCsv(type) {
    let rows = [];
    if (type === 'attendance') rows = state.attendance.map(row => ({ ...row, employee: getEmployee(row.employee_id)?.full_name || '' }));
    else {
      const run = latestPayrollRun();
      rows = run ? state.payrollItems.filter(item => item.run_id === run.id).map(item => ({ ...item, employee: getEmployee(item.employee_id)?.full_name || '', payroll_month: run.payroll_month })) : [];
    }
    if (!rows.length) return global.UI?.toast?.('No rows to export.');
    const headers = Array.from(rows.reduce((set, row) => { Object.keys(row).forEach(key => set.add(key)); return set; }, new Set()));
    const csv = [headers.join(','), ...rows.map(row => headers.map(key => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hr-${type}-${type === 'payroll' ? state.filters.payrollMonth : today()}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  }

  function printPayslip(itemId) {
    const item = state.payrollItems.find(row => String(row.id) === String(itemId));
    if (!item) return;
    const html = `<!DOCTYPE html><html><head><title>Payslip</title><style>body{font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px}.hr-payslip-preview{background:#fff;max-width:820px;margin:auto;padding:28px;border:1px solid #cbd5e1;border-radius:18px}.hr-payslip-header{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:14px;margin-bottom:14px}.hr-payslip-title{font-size:26px;font-weight:900}.muted{color:#64748b}.hr-payslip-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.hr-payslip-table{width:100%;border-collapse:collapse;margin-top:12px}.hr-payslip-table th,.hr-payslip-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}.hr-payslip-total{display:flex;justify-content:space-between;margin-top:14px;padding:14px;background:#0f172a;color:#fff;border-radius:12px;font-size:18px;font-weight:900}.hr-chip{display:inline-block;padding:4px 8px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px}</style></head><body>${payslipHtml(item, false)}</body></html>`;
    const w = global.open('', '_blank');
    if (!w) return global.UI?.toast?.('Popup blocked. Allow popups to print payslip.');
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
      if (action === 'new-document') openDocumentModal();
      if (action === 'clear-employee-filters') { state.filters.employeeSearch = ''; state.filters.department = 'all'; state.filters.status = 'all'; renderRoot(); }
      if (action === 'mark-all-absent') await markAllMissingAbsent();
      if (action === 'generate-payroll') await generatePayroll();
      const editEmp = event.target.closest?.('[data-hr-edit-employee]')?.dataset.hrEditEmployee;
      if (editEmp) openEmployeeModal(editEmp);
      const attEmp = event.target.closest?.('[data-hr-attendance-employee]')?.dataset.hrAttendanceEmployee;
      if (attEmp) { state.activeTab = 'attendance'; state.filters.attendanceDepartment = getEmployee(attEmp)?.department || 'all'; renderRoot(); }
      const editAtt = event.target.closest?.('[data-hr-edit-attendance]')?.dataset.hrEditAttendance;
      if (editAtt) openAttendanceModal(editAtt);
      const checkIn = event.target.closest?.('[data-hr-checkin]')?.dataset.hrCheckin;
      if (checkIn) await quickAttendance(checkIn, 'checkin');
      const checkOut = event.target.closest?.('[data-hr-checkout]')?.dataset.hrCheckout;
      if (checkOut) { const row = state.attendance.find(item => String(item.id) === String(checkOut)); if (row) await quickAttendance(row.employee_id, 'checkout'); }
      const absent = event.target.closest?.('[data-hr-absent]')?.dataset.hrAbsent;
      if (absent) await quickAttendance(absent, 'absent');
      const editLeave = event.target.closest?.('[data-hr-edit-leave]')?.dataset.hrEditLeave;
      if (editLeave) openLeaveModal(editLeave);
      const approveLeave = event.target.closest?.('[data-hr-approve-leave]')?.dataset.hrApproveLeave;
      if (approveLeave) await setLeaveStatus(approveLeave, 'approved');
      const rejectLeave = event.target.closest?.('[data-hr-reject-leave]')?.dataset.hrRejectLeave;
      if (rejectLeave) await setLeaveStatus(rejectLeave, 'rejected');
      const editDoc = event.target.closest?.('[data-hr-edit-document]')?.dataset.hrEditDocument;
      if (editDoc) openDocumentModal(editDoc);
      const payrollStatus = event.target.closest?.('[data-hr-payroll-status]')?.dataset.hrPayrollStatus;
      if (payrollStatus) await setPayrollStatus(payrollStatus);
      const payslipItem = event.target.closest?.('[data-hr-payslip-item]')?.dataset.hrPayslipItem;
      if (payslipItem) { state.activeTab = 'payslips'; state.selectedPayslip = payslipItem; renderRoot(); }
      const selectPayslip = event.target.closest?.('[data-hr-select-payslip]')?.dataset.hrSelectPayslip;
      if (selectPayslip) { state.selectedPayslip = selectPayslip; renderRoot(); }
      const printId = event.target.closest?.('[data-hr-print-payslip]')?.dataset.hrPrintPayslip;
      if (printId) printPayslip(printId);
    });
    document.addEventListener('input', event => {
      if (event.target.id === 'hrEmployeeSearch') { state.filters.employeeSearch = event.target.value; renderBody(); }
    });
    document.addEventListener('change', event => {
      const id = event.target.id;
      if (id === 'hrDepartmentFilter') { state.filters.department = event.target.value; renderBody(); }
      if (id === 'hrEmployeeStatusFilter') { state.filters.status = event.target.value; renderBody(); }
      if (id === 'hrAttendanceDate') { state.filters.attendanceDate = event.target.value || today(); renderBody(); }
      if (id === 'hrAttendanceDepartmentFilter') { state.filters.attendanceDepartment = event.target.value; renderBody(); }
      if (id === 'hrLeaveStatusFilter') { state.filters.leaveStatus = event.target.value; renderBody(); }
      if (id === 'hrPayrollMonth') { state.filters.payrollMonth = event.target.value || toIsoMonth(today()); state.selectedPayslip = null; renderRoot(); }
      if (id === 'hrPayslipRunFilter') { state.filters.payslipRunId = event.target.value; state.selectedPayslip = null; renderBody(); }
      if (id === 'hrDocumentStatusFilter') { state.filters.documentStatus = event.target.value; renderBody(); }
    });
    document.addEventListener('submit', event => {
      if (event.target.id === 'hrEmployeeForm') saveEmployee(event);
      if (event.target.id === 'hrAttendanceForm') saveAttendance(event);
      if (event.target.id === 'hrLeaveForm') saveLeave(event);
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
        catch (error) { console.warn('[HR] remote load failed, using local data', error); loadLocal(); state.dataSource = 'local'; }
      }
      renderRoot();
    } finally { state.loading = false; }
  }

  async function init() {
    wire();
    loadLocal();
    await refresh(false);
  }

  global.HRModule = { init, wire, refresh, state, generatePayroll, calculateAttendance, workingDaysInMonth };
})(window);
