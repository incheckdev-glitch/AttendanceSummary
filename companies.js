const Companies = {
  state: { rows: [], page: 1, limit: 50, total: 0, search: '', filters: {}, sortBy: 'created_at', sortDir: 'desc' },
  normalize(raw = {}) { return { ...raw, id: raw.id||'', company_id: raw.company_id||raw.companyId||'', company_name: raw.company_name||raw.companyName||'', industry: raw.industry||'', company_status: raw.company_status||raw.companyStatus||'Prospect', owner_name: raw.owner_name||raw.ownerName||'', main_email: raw.main_email||raw.mainEmail||'', main_phone: raw.main_phone||raw.mainPhone||'', country: raw.country||'', city: raw.city||'', created_at: raw.created_at||raw.createdAt||'' }; },
  ensureControls() {
    const view = document.getElementById('companyView'); if (!view || document.getElementById('companySearchInput')) return;
    const card = view.querySelector('.card');
    card.insertAdjacentHTML('afterbegin', `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><input id="companySearchInput" class="input" type="search" placeholder="Search companies..."/><button id="companyExportBtn" class="btn ghost sm">Export</button><span id="companyPageInfo" class="muted"></span></div>`);
    view.querySelector('.table-wrap')?.insertAdjacentHTML('afterend', `<div class="table-actions"><div class="pagination"><button id="companyPrevBtn" class="chip-btn">‹ Prev</button><button id="companyNextBtn" class="chip-btn">Next ›</button></div><div><label class="muted">Rows</label><select id="companyRowsPerPage" class="select sm"><option>25</option><option selected>50</option><option>100</option></select></div></div>`);
    document.getElementById('companySearchInput').addEventListener('input', e=>{ this.state.search=e.target.value.trim(); this.state.page=1; this.loadAndRefresh(); });
    document.getElementById('companyPrevBtn').onclick=()=>{ if(this.state.page>1){this.state.page--;this.loadAndRefresh();}};
    document.getElementById('companyNextBtn').onclick=()=>{ if(this.state.page*this.state.limit<this.state.total){this.state.page++;this.loadAndRefresh();}};
    document.getElementById('companyRowsPerPage').onchange=(e)=>{ this.state.limit=Number(e.target.value)||50; this.state.page=1; this.loadAndRefresh(); };
    document.getElementById('companyExportBtn').onclick=()=>this.exportCsv();
  },
  async loadAndRefresh() {
    if (!Permissions.canView('companies')) return; this.ensureControls();
    try {
      const res = await Api.requestWithSession('companies','list',{ page:this.state.page, limit:this.state.limit, search:this.state.search, filters:this.state.filters, sortBy:this.state.sortBy, sortDir:this.state.sortDir},{requireAuth:true});
      const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
      this.state.rows = rows.map(r=>this.normalize(r)); this.state.total = Number(res?.total ?? rows.length) || rows.length; this.render();
    } catch (e) { UI?.toast?.('Unable to load companies','error'); console.error(e); }
  },
  async save(record, id='') { const action=id?'update':'create'; const payload=id?{id,updates:record}:record; return Api.requestWithSession('companies',action,payload,{requireAuth:true}); },
  async quickForm(existing={}) { const name = prompt('Company Name', existing.company_name||''); if(!name) return null; return { ...existing, company_name:name, industry:prompt('Industry', existing.industry||'')||'', company_status:prompt('Status', existing.company_status||'Prospect')||'Prospect', owner_name:prompt('Owner', existing.owner_name||'')||'', main_email:prompt('Main Email', existing.main_email||'')||'', main_phone:prompt('Main Phone', existing.main_phone||'')||'', country:prompt('Country', existing.country||'')||'', city:prompt('City', existing.city||'')||'' }; },
  render() {
    const body=document.getElementById('companyTableBody'); if(!body) return;
    const canEdit=Permissions.canEdit('companies'), canDelete=Permissions.canDelete('companies');
    body.innerHTML=this.state.rows.map(r=>`<tr><td>${U.escapeHtml(r.company_id)}</td><td>${U.escapeHtml(r.company_name)}</td><td>${U.escapeHtml(r.industry)}</td><td>${U.escapeHtml(r.company_status)}</td><td>${U.escapeHtml(r.owner_name)}</td><td>${U.escapeHtml(r.main_email)}</td><td>${U.escapeHtml(r.main_phone)}</td><td>${U.escapeHtml(r.country)}</td><td>${U.escapeHtml(r.city)}</td><td>${U.escapeHtml(U.fmtTS(r.created_at))}</td><td><button class='chip-btn' data-a='lead' data-id='${r.id}'>Create Lead</button>${canEdit?`<button class='chip-btn' data-a='edit' data-id='${r.id}'>Edit</button>`:''}${canDelete?`<button class='chip-btn' data-a='del' data-id='${r.id}'>Delete</button>`:''}<button class='chip-btn' data-a='contacts' data-id='${r.id}'>Open Contacts</button></td></tr>`).join('');
    body.querySelectorAll('button').forEach(b=>b.onclick=()=>this.onAction(b.dataset.a,b.dataset.id));
    const start = this.state.total ? ((this.state.page-1)*this.state.limit)+1 : 0; const end = Math.min(this.state.page*this.state.limit,this.state.total);
    const pi=document.getElementById('companyPageInfo'); if(pi) pi.textContent=`Showing ${start}-${end} of ${this.state.total} records`;
    const createBtn=document.getElementById('companyCreateBtn'); if(createBtn){ createBtn.style.display=Permissions.canCreate('companies')?'':'none'; createBtn.onclick=async()=>{ const rec=await this.quickForm({}); if(!rec) return; try{await this.save(rec); UI?.toast?.('Company saved','success'); this.loadAndRefresh();}catch(e){UI?.toast?.('Unable to save company','error'); console.error(e);} }; }
  },
  async onAction(a,id){ const row=this.state.rows.find(x=>x.id===id); if(!row) return; if(a==='edit'){const rec=await this.quickForm(row); if(!rec) return; try{await this.save(rec,id); UI?.toast?.('Company updated','success'); this.loadAndRefresh();}catch(e){UI?.toast?.('Unable to save company','error');}} if(a==='del'){ if(!confirm('Delete company?')) return; try{await Api.requestWithSession('companies','delete',{id},{requireAuth:true}); this.loadAndRefresh();}catch(e){UI?.toast?.('Unable to delete company','error');console.error(e);} } if(a==='contacts'){ window.Contacts?.setCompanyFilter?.(row.company_id,row.company_name); window.App?.showView?.('contacts'); } if(a==='lead'){ window.Leads?.openCreatePrefilled?.({ company_id:row.company_id, company_name:row.company_name }); }
  },
  exportCsv(){ if(!Permissions.canExport('companies')) return; const h=['company_id','company_name','industry','company_status','owner_name','main_email','main_phone','country','city']; const csv=[h.join(',')].concat(this.state.rows.map(r=>h.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='companies.csv'; a.click(); }
}; window.Companies=Companies;
