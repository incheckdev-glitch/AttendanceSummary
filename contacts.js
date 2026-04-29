const Contacts = {
  rows: [],
  normalize(raw = {}) {
    return {
      id: raw.id || '',
      contact_id: String(raw.contact_id || raw.contactId || '').trim(),
      full_name: String(raw.full_name || raw.fullName || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      job_title: String(raw.job_title || raw.jobTitle || '').trim(),
      department: String(raw.department || '').trim(),
      decision_role: String(raw.decision_role || raw.decisionRole || '').trim(),
      email: String(raw.email || '').trim(),
      phone: String(raw.phone || '').trim(),
      is_primary_contact: Boolean(raw.is_primary_contact ?? raw.isPrimaryContact),
      contact_status: String(raw.contact_status || raw.contactStatus || 'Active').trim()
    };
  },
  async loadAndRefresh() {
    if (!Permissions.canView('contacts')) return;
    const response = await Api.requestWithSession('contacts', 'list', { page: 1, limit: 200 }, { requireAuth: true });
    const rows = Array.isArray(response?.rows) ? response.rows : Array.isArray(response) ? response : [];
    this.rows = rows.map(row => this.normalize(row));
    this.render();
  },
  render() {
    const body = document.getElementById('contactsTableBody');
    if (!body) return;
    body.innerHTML = this.rows.map(row => `<tr><td>${U.escapeHtml(row.contact_id)}</td><td>${U.escapeHtml(row.full_name)}</td><td>${U.escapeHtml(row.company_name)}</td><td>${U.escapeHtml(row.job_title)}</td><td>${U.escapeHtml(row.department)}</td><td>${U.escapeHtml(row.decision_role)}</td><td>${U.escapeHtml(row.email)}</td><td>${U.escapeHtml(row.phone)}</td><td>${row.is_primary_contact ? 'Yes' : 'No'}</td><td>${U.escapeHtml(row.contact_status)}</td></tr>`).join('');
  }
};
window.Contacts = Contacts;
