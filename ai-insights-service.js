(function initAIDecisionService(global){
  const STORAGE_KEY = 'ai_decision_center_status_v1';
  const MODULES = ['tickets','events','workflow','crm','proposals','agreements','invoices','receipts','operations_onboarding','clients','revenue','operations','data_quality'];
  const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

  function getClient(){
    return global.SupabaseClient?.getClient?.() || null;
  }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function str(v){ return String(v ?? '').trim(); }
  function low(v){ return str(v).toLowerCase(); }
  function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function toDate(v){ const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; }
  function daysOld(v){ const d = toDate(v); return d ? (Date.now()-d.getTime())/86400000 : 0; }
  function hoursOld(v){ const d = toDate(v); return d ? (Date.now()-d.getTime())/3600000 : 0; }
  function isOpenStatus(status){
    const s = low(status);
    return !['closed','resolved','done','completed','cancelled','canceled','paid','approved','dismissed'].includes(s);
  }
  function money(v){ return num(v); }
  function parseList(v){
    if (Array.isArray(v)) return v.map(str).filter(Boolean);
    return str(v).split(/[;,|,]/).map(str).filter(Boolean);
  }
  function getStatusMap(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveStatusMap(map){ localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {})); }

  async function fetchTable(client, table){
    try {
      const { data, error } = await client.from(table).select('*').limit(1500);
      if (error) throw error;
      return safeArray(data);
    } catch (error){
      console.warn(`[AIDecisionService] unable to load table ${table}`, error?.message || error);
      return [];
    }
  }

  async function fetchData(){
    const client = getClient();
    if (!client) throw new Error('Supabase client unavailable');
    const [tickets, ticketInternal, events, workflowApprovals, workflowAudit, leads, deals, proposals, agreements, invoices, receipts, clients, onboarding] = await Promise.all([
      fetchTable(client,'tickets'),
      fetchTable(client,'ticket_internal'),
      fetchTable(client,'events'),
      fetchTable(client,'workflow_approvals'),
      fetchTable(client,'workflow_audit_log'),
      fetchTable(client,'leads'),
      fetchTable(client,'deals'),
      fetchTable(client,'proposals'),
      fetchTable(client,'agreements'),
      fetchTable(client,'invoices'),
      fetchTable(client,'receipts'),
      fetchTable(client,'clients'),
      fetchTable(client,'operations_onboarding')
    ]);
    return {tickets,ticketInternal,events,workflowApprovals,workflowAudit,leads,deals,proposals,agreements,invoices,receipts,clients,onboarding};
  }

  function mkInsight(partial, statusMap){
    const base = {
      insight_id: partial.insight_id || `ins-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      category: partial.category || 'operations',
      severity: partial.severity || 'medium',
      title: partial.title || 'Insight',
      summary: partial.summary || '',
      why_it_matters: partial.why_it_matters || '',
      recommended_action: partial.recommended_action || 'Review affected records.',
      confidence_score: Math.max(30, Math.min(99, num(partial.confidence_score || 70))),
      resource: partial.resource || 'tickets',
      resource_id: str(partial.resource_id || ''),
      affected_count: Math.max(0, num(partial.affected_count || 0)),
      evidence: safeArray(partial.evidence).slice(0,8),
      created_at: partial.created_at || new Date().toISOString(),
      status: 'new'
    };
    base.status = statusMap[base.insight_id] || partial.status || 'new';
    return base;
  }

  function buildInsights(data){
    const statusMap = getStatusMap();
    const insights = [];
    const tickets = safeArray(data.tickets);
    const ticketInternal = safeArray(data.ticketInternal);
    const events = safeArray(data.events);
    const workflowApprovals = safeArray(data.workflowApprovals);
    const proposals = safeArray(data.proposals);
    const deals = safeArray(data.deals);
    const agreements = safeArray(data.agreements);
    const invoices = safeArray(data.invoices);
    const receipts = safeArray(data.receipts);
    const clients = safeArray(data.clients);
    const onboarding = safeArray(data.onboarding);

    const openTickets = tickets.filter(t => isOpenStatus(t.status));
    const highOldTickets = openTickets.filter(t => ['high','urgent','critical','p1','p0'].includes(low(t.priority)) && daysOld(t.created_at || t.updated_at || t.date) > 3);
    if (highOldTickets.length) insights.push(mkInsight({
      insight_id:'ticket-high-priority-aged', category:'tickets', severity: highOldTickets.length > 8 ? 'critical':'high',
      title:'High-priority tickets are aging beyond SLA',
      summary:`${highOldTickets.length} high-priority ticket(s) have been open for more than 3 days.`,
      why_it_matters:'Extended aging on urgent issues raises customer-impact and escalates operational disruption.',
      recommended_action:'Assign an owner and commit an ETA on each aged high-priority ticket within today.',
      confidence_score:95, resource:'tickets', resource_id:str(highOldTickets[0]?.ticket_id || highOldTickets[0]?.id),
      affected_count:highOldTickets.length, evidence:highOldTickets.slice(0,5).map(t=>`${t.ticket_id || t.id}: ${t.title || 'Untitled'} (${Math.round(daysOld(t.created_at||t.date))}d open)`)
    }, statusMap));

    const staleStatusTickets = openTickets.filter(t => daysOld(t.updated_at || t.created_at || t.date) > 7);
    if (staleStatusTickets.length) insights.push(mkInsight({
      insight_id:'ticket-stuck-status',category:'tickets',severity: staleStatusTickets.length > 12 ? 'high':'medium',
      title:'Tickets appear stuck in the same status',
      summary:`${staleStatusTickets.length} open ticket(s) have no status movement for over 7 days.`,
      why_it_matters:'Stale workflows create hidden backlog and delay delivery commitments.',
      recommended_action:'Run a status sweep and move blocked items to escalated owner queues.',
      confidence_score:92,resource:'tickets',resource_id:str(staleStatusTickets[0]?.ticket_id || staleStatusTickets[0]?.id),
      affected_count:staleStatusTickets.length,evidence:staleStatusTickets.slice(0,5).map(t=>`${t.ticket_id || t.id}: status ${t.status || 'n/a'}, updated ${t.updated_at || t.created_at || 'n/a'}`)
    }, statusMap));

    const incompleteTickets = tickets.filter(t => !str(t.module) || !str(t.priority) || !str(t.owner || t.assigned_to));
    if (incompleteTickets.length) insights.push(mkInsight({
      insight_id:'ticket-missing-fields',category:'data quality',severity:'medium',
      title:'Ticket records missing required ownership fields',
      summary:`${incompleteTickets.length} ticket(s) are missing module, priority, or owner.`,
      why_it_matters:'Incomplete metadata prevents accurate triage and SLA enforcement.',
      recommended_action:'Backfill required fields and enforce validation on ticket creation/editing.',
      confidence_score:96,resource:'tickets',resource_id:str(incompleteTickets[0]?.ticket_id || incompleteTickets[0]?.id),
      affected_count:incompleteTickets.length,evidence:incompleteTickets.slice(0,5).map(t=>`${t.ticket_id || t.id}: module=${t.module || '—'}, priority=${t.priority || '—'}, owner=${t.owner || t.assigned_to || '—'}`)
    }, statusMap));

    const missingDevStatus = openTickets.filter(t => low(t.status).includes('development') && !ticketInternal.find(i => str(i.ticket_id) === str(t.id || t.ticket_id) && str(i.dev_team_status)));
    if (missingDevStatus.length) insights.push(mkInsight({
      insight_id:'ticket-dev-without-dev-status',category:'tickets',severity:'high',
      title:'Development tickets missing dev-team progress',
      summary:`${missingDevStatus.length} in-development ticket(s) have no dev team status signal.`,
      why_it_matters:'No dev status increases delivery risk and weakens stakeholder communication.',
      recommended_action:'Require dev team status updates on every ticket in development.',
      confidence_score:90,resource:'tickets',resource_id:str(missingDevStatus[0]?.ticket_id || missingDevStatus[0]?.id),affected_count:missingDevStatus.length,
      evidence:missingDevStatus.slice(0,5).map(t=>`${t.ticket_id || t.id}: ${t.title || 'Untitled'}`)
    }, statusMap));

    const next72h = Date.now() + (72*3600000);
    const highImpactSoon = events.filter(ev => {
      const start = toDate(ev.start_at || ev.start);
      return start && start.getTime() >= Date.now() && start.getTime() <= next72h && ['high','critical','major'].includes(low(ev.impact_type || ev.impact));
    });
    if (highImpactSoon.length) insights.push(mkInsight({
      insight_id:'event-high-impact-soon',category:'events',severity:'high',title:'High-impact events scheduled soon',
      summary:`${highImpactSoon.length} high-impact event(s) are scheduled within the next 72 hours.`,
      why_it_matters:'High-impact operational windows can trigger incidents without readiness checks.',
      recommended_action:'Run readiness and rollback review for each high-impact event before execution.',
      confidence_score:93,resource:'events',resource_id:str(highImpactSoon[0]?.id || highImpactSoon[0]?.event_code),affected_count:highImpactSoon.length,
      evidence:highImpactSoon.slice(0,5).map(ev=>`${ev.event_code || ev.id}: ${ev.title || 'Untitled'} at ${ev.start_at || ev.start}`)
    }, statusMap));

    const pendingApprovals = workflowApprovals.filter(a => ['pending','requested','waiting'].includes(low(a.status)) && hoursOld(a.created_at || a.requested_at) > 24);
    if (pendingApprovals.length) insights.push(mkInsight({
      insight_id:'workflow-delayed-approvals',category:'workflow',severity: pendingApprovals.length > 10 ? 'critical':'high',title:'Workflow approvals are delayed',
      summary:`${pendingApprovals.length} approval request(s) are pending for more than 24 hours.`,
      why_it_matters:'Delayed approvals block changes, delay revenue actions, and increase operational lag.',
      recommended_action:'Escalate pending approvals to backup approvers and apply SLA reminders.',
      confidence_score:95,resource:'workflow',resource_id:str(pendingApprovals[0]?.id || pendingApprovals[0]?.request_id),affected_count:pendingApprovals.length,
      evidence:pendingApprovals.slice(0,5).map(a=>`${a.id || a.request_id}: ${a.resource || 'resource'} waiting ${Math.round(hoursOld(a.created_at || a.requested_at))}h`)
    }, statusMap));

    const unpaidInvoices = invoices.filter(i => {
      const status = low(i.status || i.payment_state);
      return ['unpaid','overdue','partially paid','sent','issued'].includes(status) || money(i.pending_amount) > 0;
    });
    const revenueRisk = unpaidInvoices.reduce((s, i) => s + money(i.pending_amount || (money(i.invoice_total)-money(i.received_amount))), 0);
    if (unpaidInvoices.length) insights.push(mkInsight({
      insight_id:'revenue-invoices-pending',category:'revenue',severity: revenueRisk > 100000 ? 'critical':'high',title:'Outstanding invoices expose revenue risk',
      summary:`${unpaidInvoices.length} invoice(s) are still pending payment (${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(revenueRisk)} at risk).`,
      why_it_matters:'Open receivables weaken cash flow and increase collection effort.',
      recommended_action:'Prioritize follow-up on oldest pending invoices and trigger collection workflow.',
      confidence_score:97,resource:'invoices',resource_id:str(unpaidInvoices[0]?.invoice_id || unpaidInvoices[0]?.id),affected_count:unpaidInvoices.length,
      evidence:unpaidInvoices.slice(0,5).map(i=>`${i.invoice_id || i.id}: pending ${money(i.pending_amount || (money(i.invoice_total)-money(i.received_amount))).toFixed(2)}`)
    }, statusMap));

    const signedNoOnboarding = agreements.filter(a => ['signed','active'].includes(low(a.status)) && !onboarding.find(o => str(o.agreement_id) && str(o.agreement_id) === str(a.agreement_id || a.id)));
    if (signedNoOnboarding.length) insights.push(mkInsight({
      insight_id:'operations-missing-onboarding',category:'operations',severity:'high',title:'Signed agreements missing onboarding requests',
      summary:`${signedNoOnboarding.length} signed agreement(s) do not have operations onboarding records.`,
      why_it_matters:'Missing onboarding creates delivery delays immediately after commercial closure.',
      recommended_action:'Create onboarding records for each signed agreement and assign responsible CSM.',
      confidence_score:88,resource:'agreements',resource_id:str(signedNoOnboarding[0]?.agreement_id || signedNoOnboarding[0]?.id),affected_count:signedNoOnboarding.length,
      evidence:signedNoOnboarding.slice(0,5).map(a=>`${a.agreement_id || a.id}: ${a.customer_name || a.client_name || 'Unnamed client'}`)
    }, statusMap));

    const proposalsStuck = proposals.filter(p => ['sent','review','negotiation'].includes(low(p.status)) && daysOld(p.updated_at || p.created_at) > 14);
    if (proposalsStuck.length) insights.push(mkInsight({
      insight_id:'revenue-proposals-stuck',category:'revenue',severity:'medium',title:'Commercial proposals are stuck in pipeline',
      summary:`${proposalsStuck.length} proposal(s) have not moved for over 14 days.`,
      why_it_matters:'Aging proposals reduce conversion probability and delay forecasted revenue.',
      recommended_action:'Run commercial follow-ups and close-lost hygiene on aging proposals.',
      confidence_score:91,resource:'proposals',resource_id:str(proposalsStuck[0]?.proposal_id || proposalsStuck[0]?.id),affected_count:proposalsStuck.length,
      evidence:proposalsStuck.slice(0,5).map(p=>`${p.proposal_id || p.id}: ${p.status || 'n/a'} last update ${p.updated_at || p.created_at || 'n/a'}`)
    }, statusMap));

    const clientsHighDue = clients.filter(c => money(c.total_due || c.due_amount || c.outstanding_amount) > 0);
    if (clientsHighDue.length) insights.push(mkInsight({
      insight_id:'clients-high-due-amounts',category:'clients',severity: clientsHighDue.length > 10 ? 'high':'medium',title:'Clients carry outstanding due balances',
      summary:`${clientsHighDue.length} client account(s) show due amounts pending settlement.`,
      why_it_matters:'Client arrears increase churn risk and impact renewals.',
      recommended_action:'Prioritize account outreach for top due balances and align with finance collection.',
      confidence_score:84,resource:'clients',resource_id:str(clientsHighDue[0]?.client_id || clientsHighDue[0]?.id),affected_count:clientsHighDue.length,
      evidence:clientsHighDue.slice(0,5).map(c=>`${c.client_id || c.id}: due ${money(c.total_due || c.due_amount || c.outstanding_amount).toFixed(2)}`)
    }, statusMap));

    const duplicatedTicketIds = (() => {
      const seen = new Set(); const dup = [];
      tickets.forEach(t => { const id = str(t.ticket_id || t.id); if (!id) return; if (seen.has(id)) dup.push(id); else seen.add(id); });
      return Array.from(new Set(dup));
    })();
    if (duplicatedTicketIds.length) insights.push(mkInsight({
      insight_id:'data-duplicate-ticket-ids',category:'data quality',severity:'high',title:'Duplicate ticket identifiers detected',
      summary:`${duplicatedTicketIds.length} duplicate ticket ID value(s) found in dataset.`,
      why_it_matters:'Duplicate identifiers break traceability and can corrupt reporting accuracy.',
      recommended_action:'Resolve duplicate IDs and enforce uniqueness constraints in data source.',
      confidence_score:98,resource:'tickets',resource_id:duplicatedTicketIds[0],affected_count:duplicatedTicketIds.length,
      evidence:duplicatedTicketIds.slice(0,8).map(id=>`Duplicate ticket_id: ${id}`)
    }, statusMap));

    const moduleCounts = {};
    tickets.forEach(t => { const m = low(t.module || 'unspecified'); moduleCounts[m] = (moduleCounts[m] || 0) + 1; });
    const topModules = Object.entries(moduleCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    if (topModules.length && topModules[0][1] >= 5) insights.push(mkInsight({
      insight_id:'ticket-module-cluster-trend',category:'tickets',severity:'low',title:'Repeated issue concentration by module',
      summary:`Top repeated module is ${topModules[0][0]} with ${topModules[0][1]} tickets in current dataset.`,
      why_it_matters:'Recurring module concentration points to systemic defect patterns.',
      recommended_action:'Run root-cause review for repeated modules and create preventive backlog items.',
      confidence_score:75,resource:'tickets',resource_id:'',affected_count:topModules[0][1],
      evidence:topModules.map(([m,c])=>`${m}: ${c} ticket(s)`)
    }, statusMap));

    const sorted = insights.sort((a,b)=> (SEVERITY_WEIGHT[b.severity]-SEVERITY_WEIGHT[a.severity]) || (b.confidence_score-a.confidence_score) || (new Date(b.created_at)-new Date(a.created_at)));
    return sorted;
  }

  function buildSummary(insights, data){
    const critical = insights.filter(i => i.severity === 'critical' && i.status !== 'dismissed').length;
    const high = insights.filter(i => i.severity === 'high' && i.status !== 'dismissed').length;
    const delayedApprovals = insights.find(i => i.insight_id === 'workflow-delayed-approvals')?.affected_count || 0;
    const highRiskTickets = insights.find(i => i.insight_id === 'ticket-high-priority-aged')?.affected_count || 0;
    const revenueRisk = safeArray(data.invoices).reduce((sum, row) => sum + Math.max(0, money(row.pending_amount || (money(row.invoice_total) - money(row.received_amount)))), 0);
    const operationsRisk = insights.filter(i => ['operations','workflow'].includes(low(i.category)) && ['critical','high'].includes(i.severity)).length;
    const weighted = insights.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.severity] * Math.max(1, i.affected_count)), 0);
    const health = Math.max(0, Math.min(100, 100 - weighted));

    const moduleRisk = MODULES.map(module => {
      const moduleInsights = insights.filter(i => low(i.category) === module || low(i.resource) === module);
      const score = moduleInsights.reduce((sum, item) => sum + (SEVERITY_WEIGHT[item.severity] * Math.max(1, item.affected_count)), 0);
      return { module, score, count: moduleInsights.length };
    });

    const trends = [
      { label: 'Increasing ticket volume', value: insights.some(i => i.insight_id === 'ticket-module-cluster-trend') ? 'Signal detected' : 'Stable', state: insights.some(i => i.insight_id === 'ticket-module-cluster-trend') ? 'high' : 'low' },
      { label: 'Aging open tickets', value: `${highRiskTickets} high-risk aging`, state: highRiskTickets > 0 ? 'high' : 'low' },
      { label: 'Delayed workflow approvals', value: `${delayedApprovals} pending >24h`, state: delayedApprovals > 0 ? 'high' : 'low' },
      { label: 'Invoices pending receipts', value: `${safeArray(data.invoices).filter(i => money(i.pending_amount) > 0).length} invoices`, state: 'medium' },
      { label: 'Events with high impact', value: `${safeArray(data.events).filter(e => ['high','critical','major'].includes(low(e.impact_type || e.impact))).length} upcoming/high-impact`, state: 'medium' }
    ];

    return { platform_health_score: health, critical_insights: critical, high_risk_tickets: highRiskTickets, delayed_approvals: delayedApprovals, revenue_risk: revenueRisk, operations_risk: operationsRisk, module_risk: moduleRisk, trends };
  }

  async function generateDashboard(){
    const data = await fetchData();
    const insights = buildInsights(data);
    const summary = buildSummary(insights, data);
    return { summary, insights, generated_at: new Date().toISOString() };
  }

  function updateStatus(insightId, status){
    const map = getStatusMap();
    map[str(insightId)] = status;
    saveStatusMap(map);
  }

  global.AIDecisionService = { generateDashboard, updateStatus, getStatusMap };
})(window);
