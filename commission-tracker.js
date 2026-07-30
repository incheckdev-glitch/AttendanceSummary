(function initSalesCommissionTracker(global){
  'use strict';

  const MODULE = {
    initialized: false,
    loading: false,
    state: {
      commissions: [],
      installments: [],
      receipts: [],
      invoices: [],
      salespeople: [],
      selectedInvoiceSchedule: [],
      editingId: null,
      filters: { search: '', salesperson: 'all', type: 'all', status: 'all', currency: 'all' },
      page: 1,
      pageSize: 20
    },

    el(id){ return document.getElementById(id); },
    db(){ return global.SupabaseClient?.getClient?.() || null; },
    escape(value){ return global.U?.escapeHtml ? U.escapeHtml(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); },
    attr(value){ return this.escape(value).replace(/`/g, '&#096;'); },
    num(value){ const n = Number(value); return Number.isFinite(n) ? n : 0; },
    normalize(value){ return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); },
    currentUser(){ return global.Permissions?.getResolvedCurrentUser?.() || global.Session?.authContext?.()?.profile || {}; },
    currentUserId(){
      const user=this.currentUser();
      return String(user?.id || user?.user_id || user?.profile?.id || global.Session?.authContext?.()?.user?.id || '').trim();
    },
    currentUserEmail(){
      const user=this.currentUser();
      return String(user?.email || user?.profile?.email || global.Session?.authContext?.()?.user?.email || '').trim().toLowerCase();
    },
    permission(action){ return Boolean(global.Permissions?.can?.('sales_commissions',action)); },
    accessLevel(){
      if(this.permission('manage_all') || this.permission('manage')) return 'manage_all';
      if(this.permission('view_all')) return 'view_all';
      if(this.permission('view_related')) return 'view_related';
      return 'none';
    },
    canView(){ return this.accessLevel() !== 'none'; },
    canViewAll(){ return ['manage_all','view_all'].includes(this.accessLevel()); },
    isRelatedOnly(){ return this.accessLevel() === 'view_related'; },
    canManage(){ return this.accessLevel() === 'manage_all'; },
    canDelete(){ return this.canManage(); },
    canExport(){ return this.canView(); },
    isRelatedCommission(row){
      const userId=this.currentUserId();
      const userEmail=this.currentUserEmail();
      const salespersonId=String(row?.salesperson_id || '').trim();
      const salespersonEmail=String(row?.salesperson_email || '').trim().toLowerCase();
      return Boolean((userId && salespersonId === userId) || (userEmail && salespersonEmail === userEmail));
    },
    toast(message){ global.UI?.toast?.(message); },
    formatDate(value){
      if(!value) return '—';
      const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
      if(Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'2-digit'}).format(d);
    },
    isoDate(value){
      if(!value) return '';
      const d = new Date(value);
      if(Number.isNaN(d.getTime())) return String(value).slice(0,10);
      return d.toISOString().slice(0,10);
    },
    money(amount, currency='USD'){
      const code = String(currency || 'USD').trim().toUpperCase();
      try { return new Intl.NumberFormat('en-US',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(this.num(amount)); }
      catch { return `${code} ${this.num(amount).toFixed(2)}`; }
    },
    invoiceNumber(row){ return String(row?.invoice_number || row?.invoice_no || row?.invoiceNumber || row?.reference || row?.id || '').trim(); },
    invoiceClient(row){ return String(row?.customer_legal_name || row?.customer_name || row?.customer || row?.client_name || row?.company_name || row?.legal_name || '—').trim(); },
    invoiceTotal(row){ return this.num(row?.invoice_total ?? row?.grand_total ?? row?.total_amount ?? row?.total ?? row?.amount_due); },
    invoiceCurrency(row){ return String(row?.currency || row?.currency_code || 'USD').trim().toUpperCase(); },
    invoicePaymentTerm(row){ return String(row?.payment_term || row?.payment_terms || row?.billing_frequency || 'Annual').trim(); },
    invoiceDate(row){ return row?.issue_date || row?.invoice_date || row?.issued_date || row?.issued_at || row?.date || row?.created_at || ''; },
    invoiceDueDate(row){ return row?.due_date || row?.payment_due_date || row?.invoice_due_date || this.invoiceDate(row); },
    salespersonName(row){ return String(row?.name || row?.full_name || row?.display_name || row?.username || row?.email || 'Sales User').trim(); },

    ensureUiReady(){
      const view = this.el('commissionTrackerView');
      if(!view) return false;
      if(!global.Permissions || typeof global.Permissions.can !== 'function') return false;
      if(!this.canView()) return false;
      this.mountModal();
      this.bind();
      this.initialized = true;
      return true;
    },

    async init(){
      if(!this.ensureUiReady()){
        const view = this.el('commissionTrackerView');
        if(view && global.Permissions && typeof global.Permissions.can === 'function' && !this.canView()){
          const state = this.el('commissionState');
          if(state) state.textContent = 'You do not have permission to view Sales Commission Tracker.';
        }
        return;
      }
      await this.refresh();
    },

    bind(){
      const once = (id,event,handler) => {
        const el = this.el(id); if(!el || el.dataset.commissionBound === 'true') return;
        el.dataset.commissionBound = 'true'; el.addEventListener(event,handler);
      };
      once('commissionCreateBtn','click',()=>this.openCreate());
      once('commissionRefreshBtn','click',()=>this.refresh());
      once('commissionExportBtn','click',()=>this.exportCsv());
      once('commissionClearFiltersBtn','click',()=>this.clearFilters());
      ['commissionSearchInput','commissionSalespersonFilter','commissionTypeFilter','commissionStatusFilter','commissionCurrencyFilter'].forEach(id => {
        once(id,id === 'commissionSearchInput' ? 'input':'change',()=>{ this.readFilters(); this.state.page=1; this.render(); });
      });
      const tbody=this.el('commissionTbody');
      if(tbody && tbody.dataset.commissionBound!=='true'){
        tbody.dataset.commissionBound='true';
        tbody.addEventListener('click',event=>{
          const btn=event.target.closest('[data-commission-action]'); if(!btn) return;
          const id=btn.dataset.id; const action=btn.dataset.commissionAction;
          if(action==='view') this.openDetails(id);
          if(action==='edit') this.openEdit(id);
          if(action==='delete') this.remove(id);
        });
      }
      once('commissionPrevPage','click',()=>{ if(this.state.page>1){this.state.page--;this.render();} });
      once('commissionNextPage','click',()=>{ const pages=Math.max(1,Math.ceil(this.filtered().length/this.state.pageSize));if(this.state.page<pages){this.state.page++;this.render();} });
    },

    extractInvoiceRows(response){
      if(Array.isArray(response)) return response;
      if(Array.isArray(response?.rows)) return response.rows;
      if(Array.isArray(response?.data)) return response.data;
      if(Array.isArray(response?.items)) return response.items;
      if(Array.isArray(response?.records)) return response.records;
      return [];
    },

    async loadInvoices(db){
      // Do not order by invoice_date here: the deployed invoices table stores the
      // date as issue_date. Ordering by a missing column makes Supabase return no
      // rows and leaves the Add Commission invoice selector empty.
      const direct=await db.from('invoices').select('*').limit(2500);
      const directRows=!direct?.error && Array.isArray(direct?.data) ? direct.data : [];
      if(directRows.length) return directRows;
      if(direct?.error) console.warn('[Commission Tracker] direct invoice load failed',direct.error);

      // Some roles read invoices through the application API rather than direct
      // table RLS. Use the same invoice list service as the main Invoice module.
      if(global.Api?.listInvoices){
        try{
          const response=await global.Api.listInvoices({}, {
            limit:2500,
            page:1,
            summary_only:true,
            forceRefresh:true
          });
          const apiRows=this.extractInvoiceRows(response);
          if(apiRows.length) return apiRows;
        }catch(error){
          console.warn('[Commission Tracker] invoice API fallback failed',error);
        }
      }
      return directRows;
    },

    async refresh(){
      if(this.loading) return;
      if(!this.canView()){
        const deniedState=this.el('commissionState');
        if(deniedState) deniedState.textContent='You do not have access to Sales Commission Tracker.';
        return;
      }
      const db=this.db();
      if(!db){ this.toast('Supabase is not available.'); return; }
      this.loading=true;
      const state=this.el('commissionState'); if(state) state.textContent='Loading commission records…';
      try{
        const manageAll=this.canManage();
        const [commissionsRes,installmentsRes,receiptsRes,invoiceRows,profilesRes]=await Promise.all([
          db.from('sales_commissions').select('*').order('created_at',{ascending:false}),
          db.from('sales_commission_installments').select('*').order('installment_no',{ascending:true}),
          db.from('sales_commission_receipts').select('*').order('issued_at',{ascending:false}),
          manageAll ? this.loadInvoices(db) : Promise.resolve([]),
          manageAll
            ? db.from('profiles').select('id,name,email,username,role_key,is_active,active').limit(2000)
            : Promise.resolve({data:[],error:null})
        ]);
        if(commissionsRes.error) throw commissionsRes.error;
        if(installmentsRes.error) throw installmentsRes.error;
        if(receiptsRes.error && String(receiptsRes.error.code||'')!=='42P01') throw receiptsRes.error;
        if(profilesRes.error) console.warn('[Commission Tracker] profiles load failed',profilesRes.error);

        const rawCommissions=Array.isArray(commissionsRes.data)?commissionsRes.data:[];
        this.state.commissions=this.isRelatedOnly()
          ? rawCommissions.filter(row=>this.isRelatedCommission(row))
          : rawCommissions;

        const allowedCommissionIds=new Set(this.state.commissions.map(row=>String(row.id)));
        this.state.installments=(Array.isArray(installmentsRes.data)?installmentsRes.data:[])
          .filter(row=>allowedCommissionIds.has(String(row.commission_id)));
        this.state.receipts=(Array.isArray(receiptsRes?.data)?receiptsRes.data:[])
          .filter(row=>allowedCommissionIds.has(String(row.commission_id)));

        this.state.invoices=(Array.isArray(invoiceRows)?invoiceRows:[]).filter(row=>{
          const status=this.normalize(row.status || row.invoice_status || row.payment_state);
          return this.invoiceTotal(row)>0 && !['cancelled','canceled','void','deleted'].includes(status);
        }).sort((a,b)=>{
          const right=new Date(this.invoiceDate(b)||0).getTime()||0;
          const left=new Date(this.invoiceDate(a)||0).getTime()||0;
          return right-left;
        });

        if(manageAll){
          const profiles=Array.isArray(profilesRes.data)?profilesRes.data:[];
          let salespeople=profiles.filter(row=>{
            const role=this.normalize(row.role_key);
            const active=row.is_active!==false && row.active!==false;
            return active && (role.includes('sales') || ['head_of_sales','sales_executive','sales_manager'].includes(role));
          });
          if(!salespeople.length) salespeople=profiles.filter(row=>row.is_active!==false && row.active!==false);
          this.state.salespeople=salespeople.sort((a,b)=>this.salespersonName(a).localeCompare(this.salespersonName(b)));
        }else{
          const bySalesperson=new Map();
          this.state.commissions.forEach(row=>{
            const key=String(row.salesperson_id || row.salesperson_email || row.salesperson_name || '').trim();
            if(!key || bySalesperson.has(key)) return;
            bySalesperson.set(key,{
              id:String(row.salesperson_id || key),
              name:row.salesperson_name || row.salesperson_email || 'Sales User',
              email:row.salesperson_email || ''
            });
          });
          this.state.salespeople=[...bySalesperson.values()].sort((a,b)=>this.salespersonName(a).localeCompare(this.salespersonName(b)));
        }

        this.populateFilters();
        this.render();
      }catch(error){
        console.error('[Commission Tracker] refresh failed',error);
        if(state) state.textContent='Unable to load Sales Commission Tracker.';
        this.toast(error?.message || 'Unable to load Sales Commission Tracker.');
      }finally{this.loading=false;}
    },

    installmentsFor(id){ return this.state.installments.filter(row=>String(row.commission_id)===String(id)).sort((a,b)=>this.num(a.installment_no)-this.num(b.installment_no)); },
    receiptForInstallment(id){ return this.state.receipts.find(row=>String(row.installment_id)===String(id) && this.normalize(row.status)!=='void') || null; },
    receiptNumber(row){ return String(row?.receipt_number || row?.receipt_no || row?.id || '').trim(); },
    statsFor(row){
      const installments=this.installmentsFor(row.id);
      const paid=installments.reduce((sum,item)=>sum+this.num(item.paid_amount ?? (this.normalize(item.status)==='paid'?item.commission_amount:0)),0);
      const total=this.num(row.commission_total);
      const remaining=Math.max(0,total-paid);
      const status=this.normalize(row.status)==='cancelled'?'cancelled':(remaining<=0.005&&total>0?'paid':(paid>0?'partial':'scheduled'));
      return {installments,paid,remaining,status};
    },
    groupedMoney(rows,accessor){
      const grouped=new Map();
      rows.forEach(row=>{const currency=String(row.currency||'USD').toUpperCase();grouped.set(currency,(grouped.get(currency)||0)+this.num(accessor(row)));});
      if(!grouped.size) return '—';
      return Array.from(grouped.entries()).map(([currency,value])=>this.money(value,currency)).join(' · ');
    },
    renderKpis(rows){
      const totalEl=this.el('commissionKpiTotal'); const pendingEl=this.el('commissionKpiPending'); const paidEl=this.el('commissionKpiPaid'); const dueEl=this.el('commissionKpiDue');
      if(totalEl) totalEl.textContent=this.groupedMoney(rows,row=>row.commission_total);
      if(pendingEl) pendingEl.textContent=this.groupedMoney(rows,row=>this.statsFor(row).remaining);
      if(paidEl) paidEl.textContent=this.groupedMoney(rows,row=>this.statsFor(row).paid);
      const today=this.isoDate(new Date());
      const dueRows=[]; rows.forEach(row=>this.statsFor(row).installments.forEach(item=>{if(this.normalize(item.status)!=='paid' && item.due_date && String(item.due_date).slice(0,10)<=today) dueRows.push({...item,currency:row.currency});}));
      if(dueEl) dueEl.textContent=this.groupedMoney(dueRows,row=>row.commission_amount);
      const totalSub=this.el('commissionKpiTotalSub'); if(totalSub) totalSub.textContent=`${rows.length} tracked invoice${rows.length===1?'':'s'}`;
      const pendingSub=this.el('commissionKpiPendingSub'); if(pendingSub) pendingSub.textContent='Scheduled commission not yet paid';
      const paidSub=this.el('commissionKpiPaidSub'); if(paidSub) paidSub.textContent='Commission installments marked paid';
      const dueSub=this.el('commissionKpiDueSub'); if(dueSub) dueSub.textContent=`${dueRows.length} due or overdue installment${dueRows.length===1?'':'s'}`;
    },
    readFilters(){
      this.state.filters={
        search:String(this.el('commissionSearchInput')?.value||'').trim().toLowerCase(),
        salesperson:this.isRelatedOnly() ? 'all' : String(this.el('commissionSalespersonFilter')?.value||'all'),
        type:String(this.el('commissionTypeFilter')?.value||'all'),
        status:String(this.el('commissionStatusFilter')?.value||'all'),
        currency:String(this.el('commissionCurrencyFilter')?.value||'all')
      };
    },
    filtered(){
      const f=this.state.filters;
      return this.state.commissions.filter(row=>{
        const stats=this.statsFor(row);
        const hay=[row.invoice_number,row.client_name,row.salesperson_name,row.salesperson_email,row.payment_term,row.notes,row.currency].join(' ').toLowerCase();
        return (!f.search||hay.includes(f.search)) && (f.salesperson==='all'||String(row.salesperson_id)===f.salesperson) && (f.type==='all'||String(row.commission_type)===f.type) && (f.status==='all'||stats.status===f.status) && (f.currency==='all'||String(row.currency||'USD').toUpperCase()===f.currency);
      });
    },
    render(){
      const rows=this.filtered(); this.renderKpis(rows);
      const tbody=this.el('commissionTbody'); if(!tbody) return;
      const pages=Math.max(1,Math.ceil(rows.length/this.state.pageSize)); if(this.state.page>pages)this.state.page=pages;
      const start=(this.state.page-1)*this.state.pageSize; const pageRows=rows.slice(start,start+this.state.pageSize);
      if(!pageRows.length){tbody.innerHTML='<tr><td colspan="11"><div class="commission-empty">No commission records match the current filters.</div></td></tr>';}
      else tbody.innerHTML=pageRows.map(row=>{
        const stats=this.statsFor(row); const rate=this.num(row.commission_rate); const type=this.commissionTypeLabel(row);
        const schedule=`${stats.installments.length || row.installment_count || 1} payment${(stats.installments.length || row.installment_count || 1)===1?'':'s'}`;
        return `<tr>
          <td><strong>${this.escape(row.invoice_number||'—')}</strong><div class="commission-muted">${this.formatDate(row.invoice_date)}</div></td>
          <td><strong>${this.escape(row.client_name||'—')}</strong></td>
          <td><strong>${this.escape(row.salesperson_name||'—')}</strong><div class="commission-muted">${this.escape(row.salesperson_email||'')}</div></td>
          <td><strong>${this.escape(type)}</strong><div class="commission-muted">${rate.toFixed(2)}%</div></td>
          <td class="commission-money">${this.money(row.invoice_value,row.currency)}</td>
          <td class="commission-money">${this.money(row.commission_total,row.currency)}</td>
          <td class="commission-money">${this.money(stats.paid,row.currency)}</td>
          <td class="commission-money">${this.money(stats.remaining,row.currency)}</td>
          <td><strong>${this.escape(row.payment_term||'—')}</strong><div class="commission-muted">${this.escape(schedule)}</div></td>
          <td><span class="commission-badge" data-status="${this.attr(stats.status)}">${this.escape(stats.status)}</span></td>
          <td><div class="commission-actions"><button class="btn ghost sm" type="button" data-commission-action="view" data-id="${this.attr(row.id)}">View</button>${this.canManage()?`<button class="btn ghost sm" type="button" data-commission-action="edit" data-id="${this.attr(row.id)}">Edit</button>`:''}${this.canDelete()?`<button class="btn danger sm" type="button" data-commission-action="delete" data-id="${this.attr(row.id)}">Delete</button>`:''}</div></td>
        </tr>`;
      }).join('');
      const state=this.el('commissionState');
      if(state){
        const scope=this.accessLevel()==='manage_all'
          ? 'View & Manage All'
          : this.accessLevel()==='view_all'
            ? 'View All — Read Only'
            : 'View Related Commissions Only';
        state.textContent=`${scope} · Showing ${pageRows.length ? start+1 : 0}–${Math.min(start+this.state.pageSize,rows.length)} of ${rows.length} commission records.`;
      }
      const pageInfo=this.el('commissionPageInfo'); if(pageInfo) pageInfo.textContent=`Page ${this.state.page} of ${pages}`;
      const prev=this.el('commissionPrevPage'); if(prev) prev.disabled=this.state.page<=1;
      const next=this.el('commissionNextPage'); if(next) next.disabled=this.state.page>=pages;
      const create=this.el('commissionCreateBtn'); if(create) create.style.display=this.canManage()?'':'none';
      const exportBtn=this.el('commissionExportBtn'); if(exportBtn) exportBtn.style.display=this.canExport()?'':'none';
    },
    populateFilters(){
      const salesFilter=this.el('commissionSalespersonFilter');
      if(salesFilter){
        const current=salesFilter.value||'all';
        const relatedOnly=this.isRelatedOnly();
        salesFilter.innerHTML=(relatedOnly?'':'<option value="all">All salespeople</option>')+
          this.state.salespeople.map(row=>`<option value="${this.attr(row.id)}">${this.escape(this.salespersonName(row))}</option>`).join('');
        if(relatedOnly){
          salesFilter.value=this.state.salespeople[0]?.id || '';
          salesFilter.disabled=true;
          this.state.filters.salesperson='all';
        }else{
          salesFilter.disabled=false;
          salesFilter.value=Array.from(salesFilter.options).some(o=>o.value===current)?current:'all';
        }
      }
      const currencies=[...new Set(this.state.commissions.map(row=>String(row.currency||'USD').toUpperCase()))].sort();
      const currencyFilter=this.el('commissionCurrencyFilter');
      if(currencyFilter){const current=currencyFilter.value||'all';currencyFilter.innerHTML='<option value="all">All currencies</option>'+currencies.map(code=>`<option value="${this.attr(code)}">${this.escape(code)}</option>`).join('');currencyFilter.value=currencies.includes(current)?current:'all';}
      if(this.canManage()){
        this.populateInvoiceSelect();
        this.populateSalespersonSelect();
      }
    },
    clearFilters(){
      ['commissionSearchInput'].forEach(id=>{const el=this.el(id);if(el)el.value='';});
      ['commissionSalespersonFilter','commissionTypeFilter','commissionStatusFilter','commissionCurrencyFilter'].forEach(id=>{const el=this.el(id);if(el)el.value='all';});
      this.readFilters();this.state.page=1;this.render();
    },

    mountModal(){
      if(this.el('commissionEntryModal')) return;
      const wrapper=document.createElement('div');
      wrapper.innerHTML=`
      <div id="commissionEntryModal" class="modal commission-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="commissionEntryTitle">
        <div class="modal-content"><div class="header"><div><h2 id="commissionEntryTitle" style="margin:0">Add Sales Commission</h2><div class="muted">Select an invoice, assign the salesperson, and review the term-based payment schedule.</div></div><button id="commissionEntryClose" class="modal-close" type="button">✕</button></div>
          <form id="commissionEntryForm"><div class="modal-body stack" style="gap:16px">
            <div class="commission-info"><strong>Commission base:</strong> the full invoice value is included by default, covering Annual SaaS, one-time fees, and hardware. The record is created manually and is not generated automatically from invoices.</div>
            <div class="commission-form-grid">
              <label class="commission-field"><span>Invoice *</span><select id="commissionInvoiceInput" class="select" required></select></label>
              <label class="commission-field"><span>Salesperson *</span><select id="commissionSalespersonInput" class="select" required></select></label>
              <label class="commission-field"><span>Commission Percentage *</span><select id="commissionTypeInput" class="select"><option value="first_year">First Year — 5%</option><option value="renewal">Renewal — 2.5%</option><option value="custom">Custom %</option></select></label>
              <label id="commissionCustomRateField" class="commission-field" style="display:none"><span>Custom Percentage *</span><input id="commissionCustomRateInput" class="input" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="0.00" /><small>Enter a value from 0 to 100 with up to two decimal places.</small></label>
              <label class="commission-field"><span>Commission Rate</span><input id="commissionRateInput" class="input" type="number" step="0.01" readonly /></label>
              <label class="commission-field"><span>Invoice Value</span><input id="commissionInvoiceValueInput" class="input" type="number" step="0.01" readonly /></label>
              <label class="commission-field"><span>Commissionable Amount *</span><input id="commissionBaseInput" class="input" type="number" min="0" step="0.01" required /></label>
              <label class="commission-field"><span>Currency</span><input id="commissionCurrencyInput" class="input" type="text" readonly /></label>
              <label class="commission-field"><span>Payment Term</span><input id="commissionPaymentTermInput" class="input" type="text" readonly /></label>
              <label id="commissionCustomCountField" class="commission-field" style="display:none"><span>Custom Installment Count</span><input id="commissionCustomCountInput" class="input" type="number" min="1" max="24" value="1" /></label>
              <label class="commission-field full"><span>Notes</span><textarea id="commissionNotesInput" class="input" rows="3" placeholder="Internal notes, exceptions, or payment instructions..."></textarea></label>
            </div>
            <div class="commission-calculation-strip"><div class="commission-calc"><span>Invoice Total</span><strong id="commissionCalcInvoice">—</strong></div><div class="commission-calc"><span>Rate</span><strong id="commissionCalcRate">—</strong></div><div class="commission-calc"><span>Total Commission</span><strong id="commissionCalcTotal">—</strong></div><div class="commission-calc"><span>Payments</span><strong id="commissionCalcPayments">—</strong></div></div>
            <div><div class="commission-panel-title"><h3>Commission Payment Schedule</h3><span class="muted">Dates follow the invoice payment schedule when available.</span></div><div id="commissionSchedulePreview" class="commission-schedule-preview"></div></div>
          </div><div class="modal-footer"><button id="commissionEntryCancel" class="btn ghost" type="button">Cancel</button><button id="commissionEntrySave" class="btn primary" type="submit">Save Commission</button></div></form>
        </div></div>
      <div id="commissionDetailsModal" class="modal commission-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="commissionDetailsTitle"><div class="modal-content"><div class="header"><div><h2 id="commissionDetailsTitle" style="margin:0">Commission Details</h2><div id="commissionDetailsSubtitle" class="muted"></div></div><button id="commissionDetailsClose" class="modal-close" type="button">✕</button></div><div id="commissionDetailsBody" class="modal-body"></div><div class="modal-footer"><button id="commissionDetailsDone" class="btn primary" type="button">Done</button></div></div></div>
      <div id="commissionPaymentModal" class="modal commission-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="commissionPaymentTitle"><div class="modal-content" style="max-width:560px"><div class="header"><div><h2 id="commissionPaymentTitle" style="margin:0">Record Commission Payment</h2><div id="commissionPaymentSubtitle" class="muted"></div></div><button id="commissionPaymentClose" class="modal-close" type="button">✕</button></div><form id="commissionPaymentForm"><input id="commissionPaymentInstallmentId" type="hidden"/><div class="modal-body commission-form-grid"><div class="commission-info full"><strong>Receipt:</strong> marking this installment paid automatically issues a branded commission payment receipt.</div><label class="commission-field"><span>Paid Date *</span><input id="commissionPaymentDate" class="input" type="date" required/></label><label class="commission-field"><span>Reference</span><input id="commissionPaymentReference" class="input" type="text" placeholder="Transfer / payroll reference"/></label><label class="commission-field full"><span>Payment Notes</span><textarea id="commissionPaymentNotes" class="input" rows="3"></textarea></label></div><div class="modal-footer"><button id="commissionPaymentCancel" class="btn ghost" type="button">Cancel</button><button id="commissionPaymentSave" class="btn primary" type="submit">Mark Paid & Issue Receipt</button></div></form></div></div>
      <div id="commissionReceiptModal" class="modal commission-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="commissionReceiptTitle"><div class="modal-content" style="max-width:980px"><div class="header"><div><h2 id="commissionReceiptTitle" style="margin:0">Commission Payment Receipt</h2><div id="commissionReceiptSubtitle" class="muted"></div></div><button id="commissionReceiptClose" class="modal-close" type="button">✕</button></div><div class="modal-body" style="padding:0;background:#eef2f7"><iframe id="commissionReceiptFrame" title="Commission payment receipt preview" style="display:block;width:100%;height:72vh;border:0;background:#eef2f7"></iframe></div><div class="modal-footer"><button id="commissionReceiptDone" class="btn ghost" type="button">Close</button><button id="commissionReceiptPrint" class="btn primary" type="button">Print / Save PDF</button></div></div></div>`;
      document.body.append(...wrapper.children);
      const close=(id)=>this.closeModal(id);
      this.el('commissionEntryClose').addEventListener('click',()=>close('commissionEntryModal'));
      this.el('commissionEntryCancel').addEventListener('click',()=>close('commissionEntryModal'));
      this.el('commissionDetailsClose').addEventListener('click',()=>close('commissionDetailsModal'));
      this.el('commissionDetailsDone').addEventListener('click',()=>close('commissionDetailsModal'));
      this.el('commissionPaymentClose').addEventListener('click',()=>close('commissionPaymentModal'));
      this.el('commissionPaymentCancel').addEventListener('click',()=>close('commissionPaymentModal'));
      this.el('commissionReceiptClose').addEventListener('click',()=>close('commissionReceiptModal'));
      this.el('commissionReceiptDone').addEventListener('click',()=>close('commissionReceiptModal'));
      this.el('commissionReceiptPrint').addEventListener('click',()=>this.printReceipt());
      this.el('commissionEntryForm').addEventListener('submit',event=>{event.preventDefault();this.saveEntry();});
      this.el('commissionPaymentForm').addEventListener('submit',event=>{event.preventDefault();this.savePayment();});
      this.el('commissionInvoiceInput').addEventListener('change',()=>this.onInvoiceChange());
      this.el('commissionTypeInput').addEventListener('change',()=>this.updateCalculation());
      this.el('commissionCustomRateInput').addEventListener('input',()=>this.updateCalculation());
      this.el('commissionBaseInput').addEventListener('input',()=>this.updateCalculation());
      this.el('commissionCustomCountInput').addEventListener('input',()=>this.updateCalculation());
      this.el('commissionDetailsBody').addEventListener('click',event=>{
        const btn=event.target.closest('[data-installment-action]'); if(!btn)return;
        if(btn.dataset.installmentAction==='pay') this.openPayment(btn.dataset.id);
        if(btn.dataset.installmentAction==='undo') this.undoPayment(btn.dataset.id);
        if(btn.dataset.installmentAction==='receipt') this.openReceiptByInstallment(btn.dataset.id);
        if(btn.dataset.installmentAction==='issue_receipt') this.issueReceipt(btn.dataset.id);
      });
    },
    openModal(id){
      const modal=this.el(id);
      if(!modal) return;
      // The shared InCheck360 modal stylesheet displays `.modal.open`.
      // Keep `show` as a compatibility class, but always add `open`.
      modal.classList.add('open','show');
      modal.setAttribute('aria-hidden','false');
      global.ModalScrollLock?.lock?.();
    },
    closeModal(id){
      const modal=this.el(id);
      if(!modal) return;
      modal.classList.remove('open','show');
      modal.setAttribute('aria-hidden','true');
      global.ModalScrollLock?.unlock?.();
    },
    populateInvoiceSelect(selected=''){
      const select=this.el('commissionInvoiceInput'); if(!select)return;
      const existing=new Set(this.state.commissions.filter(row=>String(row.id)!==String(this.state.editingId||'')).map(row=>String(row.invoice_id||row.invoice_number)));
      const invoiceOptions=this.state.invoices.map(row=>{
        const id=String(row.id||this.invoiceNumber(row)); const used=existing.has(id)||existing.has(this.invoiceNumber(row));
        return `<option value="${this.attr(id)}" ${used?'disabled':''}>${this.escape(this.invoiceNumber(row))} · ${this.escape(this.invoiceClient(row))} · ${this.escape(this.money(this.invoiceTotal(row),this.invoiceCurrency(row)))}${used?' · Already tracked':''}</option>`;
      }).join('');
      select.innerHTML=this.state.invoices.length
        ? '<option value="">Select invoice</option>'+invoiceOptions
        : '<option value="">No eligible invoices found</option>';
      if(selected) select.value=selected;
    },
    populateSalespersonSelect(selected=''){
      const select=this.el('commissionSalespersonInput'); if(!select)return;
      select.innerHTML='<option value="">Select salesperson</option>'+this.state.salespeople.map(row=>`<option value="${this.attr(row.id)}">${this.escape(this.salespersonName(row))}${row.email?` · ${this.escape(row.email)}`:''}</option>`).join('');
      if(selected) select.value=selected;
    },
    findInvoice(value){ return this.state.invoices.find(row=>String(row.id||this.invoiceNumber(row))===String(value)||this.invoiceNumber(row)===String(value)); },
    async openCreate(){
      if(!this.canManage()){this.toast('You do not have permission to create commissions.');return;}
      this.state.editingId=null; this.state.selectedInvoiceSchedule=[];
      ['commissionInvoiceInput','commissionTypeInput','commissionCustomRateInput','commissionBaseInput'].forEach(id=>{const el=this.el(id);if(el)el.disabled=false;});
      this.el('commissionEntryTitle').textContent='Add Sales Commission';
      this.el('commissionEntryForm').reset(); this.el('commissionTypeInput').value='first_year';this.el('commissionCustomRateInput').value='';this.el('commissionRateInput').value='5';this.el('commissionCustomCountInput').value='1';
      this.populateInvoiceSelect();this.populateSalespersonSelect();this.clearInvoiceFields();this.updateCalculation();this.openModal('commissionEntryModal');
    },
    clearInvoiceFields(){['commissionInvoiceValueInput','commissionBaseInput','commissionCurrencyInput','commissionPaymentTermInput'].forEach(id=>{const el=this.el(id);if(el)el.value='';});},
    async onInvoiceChange(){
      const invoice=this.findInvoice(this.el('commissionInvoiceInput')?.value);
      this.state.selectedInvoiceSchedule=[];
      if(!invoice){this.clearInvoiceFields();this.updateCalculation();return;}
      const total=this.invoiceTotal(invoice);this.el('commissionInvoiceValueInput').value=total.toFixed(2);this.el('commissionBaseInput').value=total.toFixed(2);this.el('commissionCurrencyInput').value=this.invoiceCurrency(invoice);this.el('commissionPaymentTermInput').value=this.invoicePaymentTerm(invoice);
      this.state.selectedInvoiceSchedule=await this.loadInvoiceSchedule(invoice);
      this.updateCalculation();
    },
    async loadInvoiceSchedule(invoice){
      const db=this.db(); if(!db)return[];
      const queries=[]; const id=invoice.id; const number=this.invoiceNumber(invoice);
      if(id) queries.push(db.from('invoice_payment_schedule').select('*').eq('invoice_id',id).order('schedule_no',{ascending:true}));
      if(number) queries.push(db.from('invoice_payment_schedule').select('*').eq('invoice_number',number).order('schedule_no',{ascending:true}));
      if(!queries.length)return[];
      const results=await Promise.all(queries); const map=new Map();
      results.forEach(result=>{if(result.error){console.warn('[Commission Tracker] invoice schedule query failed',result.error);return;}(result.data||[]).forEach(row=>{const key=String(row.id||`${row.schedule_no}|${row.due_date}|${row.scheduled_amount}`);map.set(key,row);});});
      return Array.from(map.values()).sort((a,b)=>this.num(a.schedule_no)-this.num(b.schedule_no)||String(a.due_date||'').localeCompare(String(b.due_date||'')));
    },
    isCustomRate(){ return this.el('commissionTypeInput')?.value==='custom'; },
    rate(){
      if(this.isCustomRate()) return this.num(this.el('commissionCustomRateInput')?.value);
      return this.el('commissionTypeInput')?.value==='renewal'?2.5:5;
    },
    customRateIsValid(){
      if(!this.isCustomRate()) return true;
      const raw=String(this.el('commissionCustomRateInput')?.value??'').trim();
      return /^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(raw) && Number(raw)>=0 && Number(raw)<=100;
    },
    percentageType(row){ return row?.commission_rate_mode==='custom'||row?.commission_rate_type==='custom'||row?.commission_type==='custom'?'custom':'preset'; },
    commissionTypeLabel(row){
      if(this.percentageType(row)==='custom') return 'Custom';
      return row?.commission_type==='renewal'?'Renewal':'First Year';
    },
    termCount(term){
      const key=this.normalize(term);
      if(key.includes('monthly')||key==='net_7'||key==='net7')return 12;
      if(key.includes('quarter')||key==='net_14'||key==='net14')return 4;
      if(key.includes('semi')||key.includes('half_year')||key==='net_21'||key==='net21')return 2;
      return 1;
    },
    addMonths(dateValue,months){const d=new Date(dateValue||new Date());if(Number.isNaN(d.getTime()))return this.isoDate(new Date());d.setMonth(d.getMonth()+months);return this.isoDate(d);},
    buildSchedule(){
      const base=Math.max(0,this.num(this.el('commissionBaseInput')?.value)); const total=Number((base*this.rate()/100).toFixed(2)); const invoice=this.findInvoice(this.el('commissionInvoiceInput')?.value); const currency=this.invoiceCurrency(invoice||{currency:this.el('commissionCurrencyInput')?.value});
      let rows=[];
      if(this.state.selectedInvoiceSchedule.length){
        const source=this.state.selectedInvoiceSchedule;const weightTotal=source.reduce((s,r)=>s+Math.max(0,this.num(r.scheduled_amount||r.amount)),0);let allocated=0;
        rows=source.map((row,index)=>{const amount=index===source.length-1?Number((total-allocated).toFixed(2)):Number((weightTotal>0?total*(Math.max(0,this.num(row.scheduled_amount||row.amount))/weightTotal):total/source.length).toFixed(2));allocated+=amount;return{installment_no:index+1,schedule_label:row.schedule_label||`Payment ${index+1}`,due_date:this.isoDate(row.due_date||row.payment_date||this.invoiceDueDate(invoice)),commission_amount:amount,source_schedule_id:row.id?String(row.id):null,currency};});
      }else{
        const term=this.el('commissionPaymentTermInput')?.value||this.invoicePaymentTerm(invoice||{});let count=this.termCount(term);if(this.normalize(term).includes('custom'))count=Math.max(1,Math.min(24,Math.floor(this.num(this.el('commissionCustomCountInput')?.value)||1)));const start=this.invoiceDueDate(invoice||{})||this.isoDate(new Date());const interval=count===12?1:count===4?3:count===2?6:12;let allocated=0;
        rows=Array.from({length:count},(_,index)=>{const amount=index===count-1?Number((total-allocated).toFixed(2)):Number((total/count).toFixed(2));allocated+=amount;return{installment_no:index+1,schedule_label:`Payment ${index+1}`,due_date:this.addMonths(start,index*interval),commission_amount:amount,source_schedule_id:null,currency};});
      }
      return {rows,total,base,currency};
    },
    updateCalculation(){
      const rate=this.rate();const rateInput=this.el('commissionRateInput');if(rateInput)rateInput.value=rate;
      const customRateField=this.el('commissionCustomRateField');if(customRateField)customRateField.style.display=this.isCustomRate()?'flex':'none';
      const customRateInput=this.el('commissionCustomRateInput');if(customRateInput){customRateInput.required=this.isCustomRate();customRateInput.setCustomValidity(this.customRateIsValid()?'':'Enter a percentage from 0 to 100 with no more than two decimal places.');}
      const term=this.el('commissionPaymentTermInput')?.value||'';const custom=this.el('commissionCustomCountField');if(custom)custom.style.display=this.normalize(term).includes('custom')?'flex':'none';
      const invoice=this.findInvoice(this.el('commissionInvoiceInput')?.value);const calc=this.buildSchedule();
      this.el('commissionCalcInvoice').textContent=invoice?this.money(this.invoiceTotal(invoice),this.invoiceCurrency(invoice)):'—';
      this.el('commissionCalcRate').textContent=`${rate.toFixed(2)}%`;
      this.el('commissionCalcTotal').textContent=this.money(calc.total,calc.currency);
      this.el('commissionCalcPayments').textContent=`${calc.rows.length} payment${calc.rows.length===1?'':'s'}`;
      const preview=this.el('commissionSchedulePreview');if(preview)preview.innerHTML=calc.rows.length?`<table><thead><tr><th>#</th><th>Payment</th><th>Due Date</th><th>Commission Amount</th></tr></thead><tbody>${calc.rows.map(row=>`<tr><td>${row.installment_no}</td><td>${this.escape(row.schedule_label)}</td><td>${this.formatDate(row.due_date)}</td><td class="commission-money">${this.money(row.commission_amount,calc.currency)}</td></tr>`).join('')}</tbody></table>`:'<div class="commission-empty">Select an invoice to build the commission schedule.</div>';
    },
    installmentInsertPayloads(rows, commissionId){
      return (Array.isArray(rows) ? rows : []).map(row=>({
        commission_id: commissionId,
        installment_no: Math.max(1, Math.floor(this.num(row.installment_no) || 1)),
        schedule_label: String(row.schedule_label || '').trim() || null,
        source_schedule_id: row.source_schedule_id ? String(row.source_schedule_id) : null,
        due_date: row.due_date ? this.isoDate(row.due_date) : null,
        commission_amount: Math.max(0, this.num(row.commission_amount)),
        paid_amount: 0,
        status: 'scheduled',
        paid_date: null,
        payment_reference: null,
        notes: null,
        updated_at: new Date().toISOString()
      }));
    },
    async verifyPersistedCommission(db, commissionId, expectedPayload, expectedInstallments){
      const {data,error}=await db.from('sales_commissions')
        .select('id,commission_type,commission_rate_mode,commission_rate,commission_amount,commission_total,installment_count')
        .eq('id',commissionId)
        .maybeSingle();
      if(error) throw error;
      if(!data) throw new Error('The commission was not found in Supabase after saving. No success message was shown.');

      const expectedMode=String(expectedPayload.commission_rate_mode||'preset');
      const savedMode=String(data.commission_rate_mode||'preset');
      if(savedMode!==expectedMode){
        throw new Error(`Commission rate mode was not persisted. Expected ${expectedMode}, received ${savedMode}.`);
      }
      if(Math.abs(this.num(data.commission_rate)-this.num(expectedPayload.commission_rate))>0.005){
        throw new Error('The custom commission percentage was not persisted in Supabase.');
      }
      if(Math.abs(this.num(data.commission_amount ?? data.commission_total)-this.num(expectedPayload.commission_amount))>0.005){
        throw new Error('The calculated commission amount was not persisted in Supabase.');
      }

      const {data:installments,error:installmentError}=await db.from('sales_commission_installments')
        .select('id,commission_id,installment_no,commission_amount')
        .eq('commission_id',commissionId)
        .order('installment_no',{ascending:true});
      if(installmentError) throw installmentError;
      const savedInstallments=Array.isArray(installments)?installments:[];
      if(savedInstallments.length!==expectedInstallments.length){
        throw new Error(`Commission installments were not fully persisted. Expected ${expectedInstallments.length}, received ${savedInstallments.length}.`);
      }
      return data;
    },
    async saveEntry(){
      if(!this.canManage())return;
      const db=this.db();const invoice=this.findInvoice(this.el('commissionInvoiceInput')?.value);const salesperson=this.state.salespeople.find(row=>String(row.id)===String(this.el('commissionSalespersonInput')?.value));
      if(!invoice||!salesperson){this.toast('Select both an invoice and a salesperson.');return;}
      if(!this.customRateIsValid()){this.el('commissionCustomRateInput')?.reportValidity();this.toast('Custom percentage must be between 0 and 100 with no more than two decimal places.');return;}
      const calc=this.buildSchedule();if(calc.base<=0){this.toast('Commissionable amount must be greater than zero.');return;}
      const current=this.currentUser();const editing=this.state.commissions.find(row=>String(row.id)===String(this.state.editingId));const paidExisting=editing?this.installmentsFor(editing.id).some(row=>this.normalize(row.status)==='paid'||this.num(row.paid_amount)>0):false;
      const selectedRateMode=this.isCustomRate()?'custom':'preset';
      const selectedType=this.el('commissionTypeInput').value;
      // Rate mode and business commission type are separate database concepts.
      // In particular, never persist the UI's "custom" rate choice as commission_type.
      const existingCommissionType=selectedType==='renewal'
        ? 'renewal'
        : (editing?.commission_type==='renewal'?'renewal':'first_year');
      const payload={
        invoice_id:String(invoice.id||''),invoice_number:this.invoiceNumber(invoice),client_id:String(invoice.client_id||invoice.company_id||'').trim()||null,client_name:this.invoiceClient(invoice),salesperson_id:salesperson.id,salesperson_name:this.salespersonName(salesperson),salesperson_email:salesperson.email||null,commission_type:existingCommissionType,commission_rate_mode:selectedRateMode,commission_rate:Number(this.rate()),commission_amount:calc.total,invoice_value:this.invoiceTotal(invoice),commissionable_amount:calc.base,commission_total:calc.total,currency:calc.currency,payment_term:this.invoicePaymentTerm(invoice),invoice_date:this.isoDate(this.invoiceDate(invoice))||null,invoice_due_date:this.isoDate(this.invoiceDueDate(invoice))||null,installment_count:calc.rows.length,notes:String(this.el('commissionNotesInput').value||'').trim()||null,updated_at:new Date().toISOString()
      };
      console.log('Commission payload:',payload);
      const saveBtn=this.el('commissionEntrySave');
      const originalSaveText=saveBtn?.textContent || 'Save Commission';
      if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving…';saveBtn.setAttribute('aria-busy','true');}
      try{
        let commissionId=this.state.editingId;
        if(commissionId){
          const updatePayload=paidExisting?{
            salesperson_id:salesperson.id,
            salesperson_name:this.salespersonName(salesperson),
            salesperson_email:salesperson.email||null,
            notes:payload.notes,
            updated_at:payload.updated_at
          }:payload;
          const {data,error}=await db.from('sales_commissions').update(updatePayload).eq('id',commissionId).select().single();
          if(error){console.error('Supabase save error:',error);throw error;}
          console.log('Saved commission:',data);
          if(!paidExisting){
            const del=await db.from('sales_commission_installments').delete().eq('commission_id',commissionId);
            if(del.error)throw del.error;
            const installmentPayloads=this.installmentInsertPayloads(calc.rows,commissionId);
            const ins=await db.from('sales_commission_installments').insert(installmentPayloads);
            if(ins.error)throw ins.error;
          }
        }else{
          const insertPayload={...payload,status:'scheduled',created_by:current.id||null,created_by_email:current.email||null,created_at:new Date().toISOString()};
          const {data,error}=await db.from('sales_commissions').insert(insertPayload).select().single();
          if(error){console.error('Supabase save error:',error);throw error;}
          console.log('Saved commission:',data);
          commissionId=data?.id;
          if(!commissionId)throw new Error('Commission record was created without an ID.');
          const installmentPayloads=this.installmentInsertPayloads(calc.rows,commissionId);
          const {error:installError}=await db.from('sales_commission_installments').insert(installmentPayloads);
          if(installError){
            await db.from('sales_commissions').delete().eq('id',commissionId);
            throw installError;
          }
        }
        const wasEditing=Boolean(this.state.editingId);
        await this.verifyPersistedCommission(db,commissionId,payload,calc.rows);
        // Reload authoritative rows and verify that the saved UUID is visible in the tracker.
        await this.refresh();
        const refreshedRow=this.state.commissions.find(row=>String(row.id)===String(commissionId));
        if(!refreshedRow) throw new Error('The commission was written but is not visible after refreshing from Supabase. Check the SELECT RLS policy.');
        if(this.percentageType(refreshedRow)!==selectedRateMode || Math.abs(this.num(refreshedRow.commission_rate)-this.num(payload.commission_rate))>0.005){
          throw new Error('The saved custom percentage does not match the refreshed Supabase record.');
        }
        this.closeModal('commissionEntryModal');
        this.state.editingId=null;
        this.toast(wasEditing?'Commission updated successfully':'Commission saved successfully');
      }catch(error){
        console.error('Supabase save error:',error);
        const message=error?.message || error?.details || error?.hint || 'Unable to save commission.';
        this.toast(message);
      }finally{
        if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=originalSaveText;saveBtn.removeAttribute('aria-busy');}
      }
    },
    async openEdit(id){
      const row=this.state.commissions.find(item=>String(item.id)===String(id));if(!row||!this.canManage())return;
      this.state.editingId=row.id;this.el('commissionEntryTitle').textContent='Edit Sales Commission';this.populateInvoiceSelect(String(row.invoice_id||row.invoice_number));this.populateSalespersonSelect(String(row.salesperson_id||''));
      const invoice=this.findInvoice(row.invoice_id||row.invoice_number);this.state.selectedInvoiceSchedule=invoice?await this.loadInvoiceSchedule(invoice):[];
      this.el('commissionTypeInput').value=this.percentageType(row)==='custom'?'custom':(row.commission_type||'first_year');this.el('commissionCustomRateInput').value=this.percentageType(row)==='custom'?this.num(row.commission_rate).toFixed(2):'';this.el('commissionRateInput').value=this.num(row.commission_rate);this.el('commissionInvoiceValueInput').value=this.num(row.invoice_value).toFixed(2);this.el('commissionBaseInput').value=this.num(row.commissionable_amount).toFixed(2);this.el('commissionCurrencyInput').value=row.currency||'USD';this.el('commissionPaymentTermInput').value=row.payment_term||'';this.el('commissionNotesInput').value=row.notes||'';
      const paid=this.installmentsFor(row.id).some(item=>this.normalize(item.status)==='paid'||this.num(item.paid_amount)>0);this.el('commissionInvoiceInput').disabled=paid;this.el('commissionTypeInput').disabled=paid;this.el('commissionCustomRateInput').disabled=paid;this.el('commissionBaseInput').disabled=paid;if(paid)this.toast('Paid installments exist. Invoice, type, and commission amount are locked; salesperson and notes can still be updated.');
      this.updateCalculation();this.openModal('commissionEntryModal');
    },
    async openDetails(id){
      const row=this.state.commissions.find(item=>String(item.id)===String(id));
      if(!row)return;
      const stats=this.statsFor(row);
      this.el('commissionDetailsTitle').textContent=`Commission · ${row.invoice_number}`;
      this.el('commissionDetailsSubtitle').textContent=`${row.client_name||'—'} · ${row.salesperson_name||'—'}`;
      const scheduleRows=stats.installments.map(item=>{
        const paid=this.normalize(item.status)==='paid'||this.num(item.paid_amount)>0;
        const receipt=this.receiptForInstallment(item.id);
        let actions='—';
        if(paid){
          const receiptAction=receipt
            ? `<button class="btn ghost sm" type="button" data-installment-action="receipt" data-id="${this.attr(item.id)}">View Receipt</button>`
            : (this.canManage()?`<button class="btn primary sm" type="button" data-installment-action="issue_receipt" data-id="${this.attr(item.id)}">Issue Receipt</button>`:'Receipt pending');
          const undoAction=this.canManage()?`<button class="btn ghost sm" type="button" data-installment-action="undo" data-id="${this.attr(item.id)}">Undo</button>`:'';
          actions=`<div style="display:flex;gap:6px;flex-wrap:wrap">${receiptAction}${undoAction}</div>`;
        }else if(this.canManage()){
          actions=`<button class="btn primary sm" type="button" data-installment-action="pay" data-id="${this.attr(item.id)}">Mark Paid</button>`;
        }
        return `<tr class="${paid?'commission-installment-paid':''}"><td>${this.num(item.installment_no)}</td><td>${this.formatDate(item.due_date)}</td><td class="commission-money">${this.money(item.commission_amount,row.currency)}</td><td><span class="commission-badge" data-status="${paid?'paid':'scheduled'}">${paid?'Paid':'Scheduled'}</span></td><td>${this.formatDate(item.paid_date)}</td><td>${this.escape(item.payment_reference||'—')}</td><td>${receipt?this.escape(this.receiptNumber(receipt)):'—'}</td><td>${actions}</td></tr>`;
      }).join('');
      this.el('commissionDetailsBody').innerHTML=`<div class="commission-details-grid"><div class="commission-detail-card"><span>Type / Rate</span><strong>${this.commissionTypeLabel(row)} · ${this.num(row.commission_rate).toFixed(2)}%</strong></div><div class="commission-detail-card"><span>Invoice Value</span><strong>${this.money(row.invoice_value,row.currency)}</strong></div><div class="commission-detail-card"><span>Total Commission</span><strong>${this.money(row.commission_total,row.currency)}</strong></div><div class="commission-detail-card"><span>Remaining</span><strong>${this.money(stats.remaining,row.currency)}</strong></div></div><div class="commission-panel-title"><h3>Payment Schedule</h3><span class="commission-badge" data-status="${this.attr(stats.status)}">${this.escape(stats.status)}</span></div><div class="commission-schedule-preview"><table><thead><tr><th>#</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Paid Date</th><th>Reference</th><th>Receipt</th><th>Actions</th></tr></thead><tbody>${scheduleRows}</tbody></table></div>${row.notes?`<div class="commission-info" style="margin-top:14px"><strong>Notes:</strong> ${this.escape(row.notes)}</div>`:''}`;
      this.openModal('commissionDetailsModal');
    },
    openPayment(id){const item=this.state.installments.find(row=>String(row.id)===String(id));if(!item)return;const parent=this.state.commissions.find(row=>String(row.id)===String(item.commission_id));this.el('commissionPaymentInstallmentId').value=id;this.el('commissionPaymentDate').value=this.isoDate(new Date());this.el('commissionPaymentReference').value='';this.el('commissionPaymentNotes').value=item.notes||'';this.el('commissionPaymentSubtitle').textContent=`Payment ${item.installment_no} · ${this.money(item.commission_amount,parent?.currency||'USD')}`;this.openModal('commissionPaymentModal');},
    async savePayment(){
      const id=this.el('commissionPaymentInstallmentId').value;
      const item=this.state.installments.find(row=>String(row.id)===String(id));
      if(!item||!this.canManage())return;
      const db=this.db();
      const saveBtn=this.el('commissionPaymentSave');
      const original=saveBtn?.textContent||'Mark Paid & Issue Receipt';
      if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving & Issuing…';}
      try{
        const {data,error}=await db.rpc('record_sales_commission_payment',{
          p_installment_id:id,
          p_paid_date:this.el('commissionPaymentDate').value,
          p_payment_reference:String(this.el('commissionPaymentReference').value||'').trim()||null,
          p_notes:String(this.el('commissionPaymentNotes').value||'').trim()||null
        });
        if(error)throw error;
        const receipt=Array.isArray(data)?data[0]:data;
        this.closeModal('commissionPaymentModal');
        this.closeModal('commissionDetailsModal');
        this.toast(`Commission payment recorded${receipt?.receipt_number?` · Receipt ${receipt.receipt_number} issued`:''}.`);
        await this.refresh();
        if(receipt?.id){
          this.openReceipt(receipt);
        }else{
          const savedReceipt=this.receiptForInstallment(id);
          if(savedReceipt)this.openReceipt(savedReceipt);
          else this.openDetails(item.commission_id);
        }
      }catch(error){
        console.error('[Commission Tracker] payment/receipt save failed',error);
        this.toast(error?.message||error?.details||'Unable to record payment and issue receipt. Run the V35 commission receipt SQL migration first.');
      }finally{
        if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=original;}
      }
    },
    async undoPayment(id){
      if(!this.canManage()||!confirm('Undo this commission payment and void its receipt?'))return;
      const item=this.state.installments.find(row=>String(row.id)===String(id));
      if(!item)return;
      const {error}=await this.db().rpc('undo_sales_commission_payment',{p_installment_id:id});
      if(error){this.toast(error.message||'Unable to undo payment.');return;}
      this.closeModal('commissionDetailsModal');
      this.toast('Commission payment undone and receipt voided.');
      await this.refresh();
      this.openDetails(item.commission_id);
    },
    async issueReceipt(id){
      if(!this.canManage())return;
      const item=this.state.installments.find(row=>String(row.id)===String(id));
      if(!item)return;
      try{
        const {data,error}=await this.db().rpc('issue_sales_commission_receipt',{p_installment_id:id});
        if(error)throw error;
        const receipt=Array.isArray(data)?data[0]:data;
        await this.refresh();
        this.toast(`Receipt ${receipt?.receipt_number||''} issued.`.trim());
        this.openReceipt(receipt||this.receiptForInstallment(id));
      }catch(error){
        this.toast(error?.message||'Unable to issue commission receipt.');
      }
    },
    openReceiptByInstallment(id){
      const receipt=this.receiptForInstallment(id);
      if(!receipt){this.toast('No issued receipt was found for this installment.');return;}
      this.openReceipt(receipt);
    },
    buildReceiptHtml(receipt){
      const commission=this.state.commissions.find(row=>String(row.id)===String(receipt?.commission_id));
      const installment=this.state.installments.find(row=>String(row.id)===String(receipt?.installment_id));
      if(!receipt||!commission||!installment)return '';
      const text=value=>this.escape(value||'—');
      const amount=this.num(receipt.amount||installment.paid_amount||installment.commission_amount);
      const currency=String(receipt.currency||commission.currency||'USD').toUpperCase();
      const amountWords=global.U?.formatAmountInWords?U.formatAmountInWords(amount,currency):`Only ${global.U?.amountToWords?U.amountToWords(amount,currency):amount.toFixed(2)} ${currency}`;
      const issuedBy=receipt.issued_by_name||receipt.issued_by_email||'InCheck360';
      return `<!doctype html><html><head><meta charset="utf-8"><title>${text(this.receiptNumber(receipt))}</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:12mm 0;background:#eef2f7;color:#0f172a;font-family:Inter,"Segoe UI",Arial,sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:15mm 16mm 13mm;display:flex;flex-direction:column;border:1px solid #dbe3ed;box-shadow:0 14px 34px rgba(15,23,42,.12)}.header{display:grid;grid-template-columns:45mm 1fr 63mm;gap:6mm;align-items:center;border-bottom:2px solid #0b3b82;padding-bottom:7mm}.logo{height:25mm;display:flex;align-items:center}.logo img,.logo svg{max-width:42mm;max-height:23mm;object-fit:contain}.title{text-align:center}.title h1{margin:0;color:#082b61;font-size:21px;line-height:1.15}.title p{margin:5px 0 0;color:#64748b;font-size:11px}.meta{border:1px solid #d6e0ec;border-radius:7px;overflow:hidden}.meta-row{display:grid;grid-template-columns:27mm 1fr;border-bottom:1px solid #e2e8f0}.meta-row:last-child{border-bottom:0}.meta-row span,.meta-row strong{padding:7px 8px;font-size:10.5px}.meta-row span{background:#f6f9fd;color:#475569;font-weight:700}.meta-row strong{overflow-wrap:anywhere}.section{margin-top:8mm}.section-title{font-size:11px;letter-spacing:.09em;color:#1e3a5f;font-weight:800;margin-bottom:3mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.card{border:1px solid #d7e1ed;border-radius:7px;padding:4mm;background:#fbfdff;min-width:0}.card span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.card strong{display:block;margin-top:5px;font-size:13px;overflow-wrap:anywhere}.narrative{margin-top:8mm;padding:5mm;border:1px solid #d7e1ed;border-radius:7px;background:#fbfdff;font-size:13px;line-height:1.65}.amount-box{margin-top:8mm;margin-left:auto;width:100mm;border:1px solid #cad7e6;border-radius:8px;overflow:hidden}.amount-row{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}.amount-row:last-child{border-bottom:0}.amount-row.grand{background:#eaf2ff;color:#082b61;font-size:16px;font-weight:800}.amount-row strong{text-align:right}.words{margin-top:4mm;border:1px solid #d7e1ed;border-radius:7px;padding:4mm;font-size:12px;line-height:1.5}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:16mm;margin-top:18mm}.signature{padding-top:18mm;border-top:1px solid #94a3b8;text-align:center;font-size:11px;color:#475569}.footer{margin-top:auto;padding-top:8mm;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:10.5px}@page{size:A4 portrait;margin:10mm}@media print{body{padding:0;background:#fff}.page{width:auto;min-height:277mm;margin:0;padding:0;border:0;box-shadow:none}}
      </style></head><body><main class="page"><header class="header"><div class="logo"><div data-incheck360-doc-logo-slot></div></div><div class="title"><h1>Sales Commission Payment Receipt</h1><p>InCheck 360 · CRM Commission Tracker</p></div><div class="meta"><div class="meta-row"><span>Receipt No.</span><strong>${text(this.receiptNumber(receipt))}</strong></div><div class="meta-row"><span>Payment Date</span><strong>${text(this.formatDate(receipt.payment_date||installment.paid_date))}</strong></div><div class="meta-row"><span>Status</span><strong>${text(String(receipt.status||'issued').toUpperCase())}</strong></div></div></header>
      <section class="section"><div class="section-title">PAID TO</div><div class="grid"><div class="card"><span>Salesperson</span><strong>${text(receipt.salesperson_name||commission.salesperson_name)}</strong></div><div class="card"><span>Email</span><strong>${text(receipt.salesperson_email||commission.salesperson_email)}</strong></div></div></section>
      <section class="section"><div class="section-title">COMMISSION DETAILS</div><div class="grid"><div class="card"><span>Customer Invoice</span><strong>${text(receipt.invoice_number||commission.invoice_number)}</strong></div><div class="card"><span>Client</span><strong>${text(receipt.client_name||commission.client_name)}</strong></div><div class="card"><span>Commission Type</span><strong>${this.commissionTypeLabel(commission)} · ${this.num(commission.commission_rate).toFixed(2)}%</strong></div><div class="card"><span>Payment Term</span><strong>${text(commission.payment_term)}</strong></div><div class="card"><span>Installment</span><strong>Payment ${this.num(installment.installment_no)} of ${this.num(commission.installment_count)||this.installmentsFor(commission.id).length}</strong></div><div class="card"><span>Payment Reference</span><strong>${text(receipt.payment_reference||installment.payment_reference)}</strong></div></div></section>
      <div class="narrative">This receipt confirms that <strong>${text(receipt.salesperson_name||commission.salesperson_name)}</strong> received the commission payment related to invoice <strong>${text(receipt.invoice_number||commission.invoice_number)}</strong> for <strong>${text(receipt.client_name||commission.client_name)}</strong>.</div>
      <div class="amount-box"><div class="amount-row grand"><span>Amount Paid</span><strong>${this.money(amount,currency)}</strong></div><div class="amount-row"><span>Commission Total</span><strong>${this.money(commission.commission_total,currency)}</strong></div><div class="amount-row"><span>Installment Due Date</span><strong>${text(this.formatDate(installment.due_date))}</strong></div></div>
      <div class="words"><strong>Amount in Words:</strong> ${text(amountWords)}</div>
      ${receipt.notes||installment.notes?`<div class="words"><strong>Notes:</strong> ${text(receipt.notes||installment.notes)}</div>`:''}
      <div class="signatures"><div class="signature">Paid / Issued by: ${text(issuedBy)}</div><div class="signature">Salesperson Acknowledgment</div></div>
      <footer class="footer">InCheck 360 · Commission Payment Receipt · This document is system generated.</footer></main></body></html>`;
    },
    openReceipt(receipt){
      if(!receipt)return;
      const html=this.buildReceiptHtml(receipt);
      if(!html){this.toast('Unable to build the commission receipt preview.');return;}
      const branded=global.U?.addIncheckDocumentLogo?U.addIncheckDocumentLogo(html):html;
      this.el('commissionReceiptTitle').textContent=`Commission Receipt · ${this.receiptNumber(receipt)}`;
      this.el('commissionReceiptSubtitle').textContent=`${receipt.salesperson_name||''} · ${this.money(receipt.amount,receipt.currency)}`;
      this.el('commissionReceiptFrame').srcdoc=branded;
      this.openModal('commissionReceiptModal');
    },
    printReceipt(){
      const frame=this.el('commissionReceiptFrame');
      const win=frame?.contentWindow;
      if(!win){this.toast('Open a commission receipt first.');return;}
      win.focus();
      win.print();
    },
    async syncParentStatus(commissionId){
      const db=this.db();const {data,error}=await db.from('sales_commission_installments').select('commission_amount,paid_amount,status').eq('commission_id',commissionId);if(error)return;const rows=data||[];const paid=rows.reduce((s,r)=>s+this.num(r.paid_amount),0);const total=rows.reduce((s,r)=>s+this.num(r.commission_amount),0);const status=total>0&&paid>=total-.005?'paid':paid>0?'partial':'scheduled';await db.from('sales_commissions').update({status,updated_at:new Date().toISOString()}).eq('id',commissionId);
    },
    async remove(id){
      if(!this.canDelete())return;const row=this.state.commissions.find(item=>String(item.id)===String(id));if(!row)return;const stats=this.statsFor(row);if(stats.paid>0){this.toast('A commission with paid installments cannot be deleted. Undo the payments first.');return;}if(!confirm(`Delete commission tracking for ${row.invoice_number}?`))return;const {error}=await this.db().from('sales_commissions').delete().eq('id',id);if(error){this.toast(error.message);return;}this.toast('Commission record deleted.');await this.refresh();
    },
    exportCsv(){
      if(!this.canExport()){this.toast('You do not have permission to export commissions.');return;}
      const rows=this.filtered();if(!rows.length){this.toast('No commission records to export.');return;}const headers=['Invoice','Client','Salesperson','Salesperson Email','Commission Type','Rate %','Invoice Value','Commissionable Amount','Commission Total','Paid','Remaining','Currency','Payment Term','Installments','Status','Invoice Date','Notes'];
      const csv=[headers,...rows.map(row=>{const stats=this.statsFor(row);return[row.invoice_number,row.client_name,row.salesperson_name,row.salesperson_email,row.commission_type,this.num(row.commission_rate).toFixed(2),this.num(row.invoice_value).toFixed(2),this.num(row.commissionable_amount).toFixed(2),this.num(row.commission_total).toFixed(2),stats.paid.toFixed(2),stats.remaining.toFixed(2),row.currency,row.payment_term,stats.installments.length,stats.status,row.invoice_date,row.notes];})].map(cols=>cols.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob=new Blob([`\ufeff${csv}`],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sales-commission-tracker-${this.isoDate(new Date())}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }
  };

  global.SalesCommissionTracker=MODULE;

  // Robust CRM bootstrapping: the Commission Tracker can be opened through
  // grouped CRM navigation, hash routing, or a restored active view. Bind the
  // workspace in every path instead of relying on only one app.js callback.
  const bootWhenAvailable = () => {
    const view = document.getElementById('commissionTrackerView');
    if(!view) return;

    const tryBoot = () => {
      if(!document.getElementById('commissionTrackerView')) return;
      if(!global.Permissions || typeof global.Permissions.can !== 'function') return;
      if(!MODULE.canView()) return;
      MODULE.ensureUiReady();
      if(view.classList.contains('active') && !MODULE.loading){
        MODULE.refresh();
      }
    };

    const tab = document.getElementById('commissionTrackerTab');
    if(tab && tab.dataset.commissionBootBound !== 'true'){
      tab.dataset.commissionBootBound = 'true';
      tab.addEventListener('click', () => setTimeout(tryBoot, 0));
    }

    if(view.dataset.commissionObserverBound !== 'true'){
      view.dataset.commissionObserverBound = 'true';
      const observer = new MutationObserver(() => {
        if(view.classList.contains('active')) tryBoot();
      });
      observer.observe(view, {attributes:true, attributeFilter:['class']});
    }

    // Capture the first click if the module became visible before its normal
    // loader ran. This makes Add, Refresh, Export, filters, paging, row actions,
    // and modal controls responsive immediately.
    if(document.documentElement.dataset.commissionFallbackBound !== 'true'){
      document.documentElement.dataset.commissionFallbackBound = 'true';
      document.addEventListener('click', event => {
        const control = event.target?.closest?.(
          '#commissionTrackerView button, #commissionEntryModal button, #commissionDetailsModal button, #commissionPaymentModal button'
        );
        if(!control || control.dataset.commissionBound === 'true') return;
        const wasReady = MODULE.initialized;
        if(!MODULE.ensureUiReady()) return;
        if(wasReady) return;

        // The first event began before listeners existed, so execute the
        // requested action once. Later clicks use the regular bound handlers.
        const id = control.id;
        const action = control.dataset.commissionAction;
        const installmentAction = control.dataset.installmentAction;
        if(id === 'commissionCreateBtn') MODULE.openCreate();
        else if(id === 'commissionRefreshBtn') MODULE.refresh();
        else if(id === 'commissionExportBtn') MODULE.exportCsv();
        else if(id === 'commissionClearFiltersBtn') MODULE.clearFilters();
        else if(id === 'commissionPrevPage' && MODULE.state.page > 1){ MODULE.state.page--; MODULE.render(); }
        else if(id === 'commissionNextPage'){
          const pages = Math.max(1, Math.ceil(MODULE.filtered().length / MODULE.state.pageSize));
          if(MODULE.state.page < pages){ MODULE.state.page++; MODULE.render(); }
        }
        else if(action === 'view') MODULE.openDetails(control.dataset.id);
        else if(action === 'edit') MODULE.openEdit(control.dataset.id);
        else if(action === 'delete') MODULE.remove(control.dataset.id);
        else if(installmentAction === 'pay') MODULE.openPayment(control.dataset.id);
        else if(installmentAction === 'undo') MODULE.undoPayment(control.dataset.id);
      }, true);
    }

    tryBoot();
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWhenAvailable, {once:true});
  else bootWhenAvailable();
})(window);
