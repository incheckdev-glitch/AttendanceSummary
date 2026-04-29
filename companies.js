const Companies = {
  rows: [],
  normalize(raw = {}) {
    return {
      id: raw.id || '',
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      industry: String(raw.industry || '').trim(),
      company_status: String(raw.company_status || raw.companyStatus || 'Prospect').trim(),
      owner_name: String(raw.owner_name || raw.ownerName || '').trim(),
      main_email: String(raw.main_email || raw.mainEmail || '').trim(),
      main_phone: String(raw.main_phone || raw.mainPhone || '').trim(),
      country: String(raw.country || '').trim(),
      city: String(raw.city || '').trim(),
      created_at: raw.created_at || raw.createdAt || ''
    };
  },
  async loadAndRefresh() {
    if (!Permissions.canView('companies')) return;
    const response = await Api.requestWithSession('companies', 'list', { page: 1, limit: 200 }, { requireAuth: true });
    const rows = Array.isArray(response?.rows) ? response.rows : Array.isArray(response) ? response : [];
    this.rows = rows.map(row => this.normalize(row));
    this.render();
  },
  render() {
    const body = document.getElementById('companyTableBody');
    if (!body) return;
    body.innerHTML = this.rows.map(row => `<tr><td>${U.escapeHtml(row.company_id)}</td><td>${U.escapeHtml(row.company_name)}</td><td>${U.escapeHtml(row.industry)}</td><td>${U.escapeHtml(row.company_status)}</td><td>${U.escapeHtml(row.owner_name)}</td><td>${U.escapeHtml(row.main_email)}</td><td>${U.escapeHtml(row.main_phone)}</td><td>${U.escapeHtml(row.country)}</td><td>${U.escapeHtml(row.city)}</td><td>${U.escapeHtml(U.fmtTS(row.created_at))}</td></tr>`).join('');
  }
};
window.Companies = Companies;
