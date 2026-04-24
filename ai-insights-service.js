(function initAIInsightsServiceV2(global) {
  const STORAGE_KEY = 'ai_insights_v2_status';
  const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
  const ALLOWED_CATEGORIES = new Set([
    'ticket_risk',
    'event_risk',
    'linked_ticket_event_risk',
    'data_quality',
    'trend',
    'recommendation'
  ]);
  const ALLOWED_RESOURCES = new Set(['tickets', 'events']);

  const str = value => String(value ?? '').trim();
  const low = value => str(value).toLowerCase();
  const asArray = value => (Array.isArray(value) ? value : []);
  const toDate = value => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const now = () => Date.now();

  function getClient() {
    return global.SupabaseClient?.getClient?.() || null;
  }

  function getStatusMap() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveStatusMap(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
  }

  function isOpenTicketStatus(status) {
    const s = low(status);
    return !['resolved', 'closed', 'done', 'completed', 'cancelled', 'canceled', 'rejected'].includes(s);
  }

  function ticketDisplayId(ticket = {}) {
    return str(ticket.ticket_id || ticket.ticketId || ticket.id);
  }

  function eventDisplayId(event = {}) {
    return str(event.event_code || event.eventCode || event.id);
  }

  function parseTicketRefs(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map(v => str(v)).filter(Boolean)));
    }
    return Array.from(
      new Set(
        str(value)
          .split(/[;,|,]/)
          .map(v => str(v))
          .filter(Boolean)
      )
    );
  }

  function linkedTicketIds(event = {}) {
    return Array.from(
      new Set(
        [
          ...parseTicketRefs(event.issue_id),
          ...parseTicketRefs(event.issueId),
          ...parseTicketRefs(event.ticketId),
          ...parseTicketRefs(event.ticketIds)
        ]
      )
    );
  }

  async function fetchTable(client, table) {
    try {
      const { data, error } = await client.from(table).select('*').limit(3000);
      if (error) throw error;
      return asArray(data);
    } catch (error) {
      console.warn(`[AIInsightsServiceV2] unable to load ${table}`, error?.message || error);
      return [];
    }
  }

  async function fetchData() {
    const client = getClient();
    if (!client) throw new Error('Supabase client unavailable');

    const [ticketsRaw, ticketInternalRaw, eventsRaw] = await Promise.all([
      fetchTable(client, 'tickets'),
      fetchTable(client, 'ticket_internal'),
      fetchTable(client, 'events')
    ]);

    const fallbackTickets = asArray(global.DataStore?.rows);
    const fallbackEvents = asArray(global.DataStore?.events);

    return {
      tickets: ticketsRaw.length ? ticketsRaw : fallbackTickets,
      ticketInternal: ticketInternalRaw,
      events: eventsRaw.length ? eventsRaw : fallbackEvents
    };
  }

  function daysBetween(fromDate, toDate = new Date()) {
    const d = toDate instanceof Date ? toDate : new Date(toDate);
    if (!fromDate || Number.isNaN(fromDate.getTime())) return 0;
    return (d.getTime() - fromDate.getTime()) / 86400000;
  }

  function hoursUntil(dateValue) {
    const d = toDate(dateValue);
    if (!d) return Number.POSITIVE_INFINITY;
    return (d.getTime() - now()) / 3600000;
  }

  function isHighImpactEvent(event = {}) {
    const hay = [event.impact_type, event.impactType, event.impact, event.type, event.environment]
      .map(v => low(v))
      .join(' ');
    return /(downtime|high|critical|major|outage|prod|production)/.test(hay);
  }

  function hasIncompleteReadiness(event = {}) {
    const readiness = event.readiness || event.checklist || {};
    if (!readiness || typeof readiness !== 'object') return false;
    const values = Object.values(readiness);
    if (!values.length) return false;
    return values.some(v => v === false || v === null || v === '' || low(v) === 'false' || low(v) === 'incomplete');
  }

  function createInsightFactory(statusMap) {
    return function createInsight(partial) {
      const insight = {
        insight_id: partial.insight_id,
        category: ALLOWED_CATEGORIES.has(partial.category) ? partial.category : 'recommendation',
        severity: ['critical', 'high', 'medium', 'low'].includes(partial.severity) ? partial.severity : 'medium',
        title: str(partial.title) || 'Insight',
        summary: str(partial.summary),
        why_it_matters: str(partial.why_it_matters),
        recommended_action: str(partial.recommended_action),
        confidence_score: Math.max(70, Math.min(99, Number(partial.confidence_score || 70))),
        resource: ALLOWED_RESOURCES.has(partial.resource) ? partial.resource : 'tickets',
        resource_id: str(partial.resource_id),
        affected_count: Math.max(0, Number(partial.affected_count || 0)),
        evidence: asArray(partial.evidence).slice(0, 12),
        created_at: partial.created_at || new Date().toISOString(),
        status: statusMap[str(partial.insight_id)] || partial.status || 'new'
      };
      return insight;
    };
  }

  function buildInsights(data) {
    const statusMap = getStatusMap();
    const createInsight = createInsightFactory(statusMap);
    const insights = [];

    const tickets = asArray(data.tickets);
    const ticketInternal = asArray(data.ticketInternal);
    const events = asArray(data.events);

    const ticketByAnyId = new Map();
    tickets.forEach(t => {
      const ids = [str(t.id), str(t.ticket_id), str(t.ticketId)].filter(Boolean);
      ids.forEach(id => ticketByAnyId.set(low(id), t));
    });

    const openTickets = tickets.filter(t => isOpenTicketStatus(t.status));

    const criticalPriorityOpen = openTickets.filter(t => ['critical', 'p0', 'urgent'].includes(low(t.priority)));
    if (criticalPriorityOpen.length) {
      insights.push(createInsight({
        insight_id: 'ticket-open-critical-priority',
        category: 'ticket_risk',
        severity: 'critical',
        title: 'Critical-priority tickets remain open',
        summary: `${criticalPriorityOpen.length} critical/urgent ticket(s) are still unresolved.`,
        why_it_matters: 'These tickets can directly impact service continuity and customer trust.',
        recommended_action: 'Review and assign owner / move to development.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(criticalPriorityOpen[0]),
        affected_count: criticalPriorityOpen.length,
        evidence: criticalPriorityOpen.slice(0, 8).map(t => ({ id: ticketDisplayId(t), title: str(t.title) || 'Untitled ticket' }))
      }));
    }

    const highPriorityOpen = openTickets.filter(t => ['high', 'p1'].includes(low(t.priority)));
    if (highPriorityOpen.length) {
      insights.push(createInsight({
        insight_id: 'ticket-open-high-priority',
        category: 'ticket_risk',
        severity: 'high',
        title: 'High-priority tickets remain open',
        summary: `${highPriorityOpen.length} high-priority ticket(s) are open and require active ownership.`,
        why_it_matters: 'Delays on high-priority issues often become escalations and SLA breaches.',
        recommended_action: 'Review and assign owner / move to development.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(highPriorityOpen[0]),
        affected_count: highPriorityOpen.length,
        evidence: highPriorityOpen.slice(0, 8).map(t => ({ id: ticketDisplayId(t), title: str(t.title) || 'Untitled ticket' }))
      }));
    }

    const ageBuckets = {
      medium: openTickets.filter(t => {
        const age = daysBetween(toDate(t.created_at || t.createdAt || t.date));
        return age > 3 && age <= 7;
      }),
      high: openTickets.filter(t => {
        const age = daysBetween(toDate(t.created_at || t.createdAt || t.date));
        return age > 7 && age <= 14;
      }),
      critical: openTickets.filter(t => daysBetween(toDate(t.created_at || t.createdAt || t.date)) > 14)
    };

    Object.entries(ageBuckets).forEach(([severity, rows]) => {
      if (!rows.length) return;
      insights.push(createInsight({
        insight_id: `ticket-aging-${severity}`,
        category: 'ticket_risk',
        severity,
        title: `Open tickets aging at ${severity} level`,
        summary: `${rows.length} open ticket(s) have aged into ${severity} risk thresholds.`,
        why_it_matters: 'Aging backlog increases delivery uncertainty and escalations.',
        recommended_action: 'Prioritize aging backlog and set owner + ETA updates today.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(rows[0]),
        affected_count: rows.length,
        evidence: rows.slice(0, 8).map(t => ({ id: ticketDisplayId(t), age_days: Math.floor(daysBetween(toDate(t.created_at || t.createdAt || t.date))) }))
      }));
    });

    const stuckTickets = openTickets.filter(t => daysBetween(toDate(t.updated_at || t.updatedAt || t.created_at || t.createdAt || t.date)) > 7);
    if (stuckTickets.length) {
      insights.push(createInsight({
        insight_id: 'ticket-stuck-status-over-7-days',
        category: 'ticket_risk',
        severity: 'high',
        title: 'Tickets appear stuck in the same status',
        summary: `${stuckTickets.length} ticket(s) have no meaningful status movement for over 7 days.`,
        why_it_matters: 'Stalled tickets indicate hidden blockers and weak execution flow.',
        recommended_action: 'Escalate blockers and refresh status progression.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(stuckTickets[0]),
        affected_count: stuckTickets.length,
        evidence: stuckTickets.slice(0, 8).map(t => ({ id: ticketDisplayId(t), status: str(t.status), updated_at: t.updated_at || t.updatedAt || t.created_at || t.createdAt }))
      }));
    }

    const internalByTicket = new Map();
    ticketInternal.forEach(row => {
      const id = low(row.ticket_id || row.ticketId || row.id || '');
      if (id) internalByTicket.set(id, row);
    });

    const underDevMissingStatus = openTickets.filter(t => {
      if (low(t.status) !== 'under development') return false;
      const key = low(ticketDisplayId(t));
      const internal = internalByTicket.get(key);
      return !str(internal?.dev_team_status || internal?.devTeamStatus);
    });
    if (underDevMissingStatus.length) {
      insights.push(createInsight({
        insight_id: 'ticket-under-dev-missing-dev-team-status',
        category: 'ticket_risk',
        severity: 'high',
        title: 'Under Development tickets missing dev team status',
        summary: `${underDevMissingStatus.length} in-development ticket(s) do not include dev team status.`,
        why_it_matters: 'Missing execution signal reduces predictability for delivery and communication.',
        recommended_action: 'Update dev team status.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(underDevMissingStatus[0]),
        affected_count: underDevMissingStatus.length,
        evidence: underDevMissingStatus.slice(0, 8).map(t => ({ id: ticketDisplayId(t), title: str(t.title) || 'Untitled ticket' }))
      }));
    }

    const missingFieldTickets = tickets.filter(t => {
      const title = str(t.title || t.subject);
      const emailAddressee = str(t.email_addressee || t.emailAddressee || t.email);
      return !str(t.priority) || !str(t.module) || !str(t.department) || !title || !emailAddressee;
    });
    if (missingFieldTickets.length) {
      insights.push(createInsight({
        insight_id: 'ticket-data-quality-missing-important-fields',
        category: 'data_quality',
        severity: 'medium',
        title: 'Tickets are missing important required fields',
        summary: `${missingFieldTickets.length} ticket(s) are missing priority/module/department/title/email_addressee fields.`,
        why_it_matters: 'Incomplete ticket metadata causes triage delays and poor reporting quality.',
        recommended_action: 'Backfill missing fields and enforce validation on updates.',
        confidence_score: 95,
        resource: 'tickets',
        resource_id: ticketDisplayId(missingFieldTickets[0]),
        affected_count: missingFieldTickets.length,
        evidence: missingFieldTickets.slice(0, 8).map(t => ({
          id: ticketDisplayId(t),
          missing: ['priority', 'module', 'department', 'title', 'email_addressee'].filter(field => {
            if (field === 'title') return !str(t.title || t.subject);
            if (field === 'email_addressee') return !str(t.email_addressee || t.emailAddressee || t.email);
            return !str(t[field]);
          })
        }))
      }));
    }

    const moduleOpenCounts = {};
    openTickets.forEach(t => {
      const module = str(t.module) || 'Unspecified';
      moduleOpenCounts[module] = (moduleOpenCounts[module] || 0) + 1;
    });
    const repeatedModules = Object.entries(moduleOpenCounts).filter(([, count]) => count >= 4).sort((a, b) => b[1] - a[1]);
    if (repeatedModules.length) {
      const topCount = repeatedModules[0][1];
      insights.push(createInsight({
        insight_id: 'ticket-repeated-issue-modules',
        category: 'trend',
        severity: topCount >= 8 ? 'high' : 'medium',
        title: 'Repeated issue concentration by module',
        summary: `${repeatedModules.length} module(s) show clustered open ticket volume.`,
        why_it_matters: 'Repeated module issues often represent systemic defects rather than isolated incidents.',
        recommended_action: 'Review repeated module issues.',
        confidence_score: 75,
        resource: 'tickets',
        resource_id: '',
        affected_count: repeatedModules.reduce((sum, [, c]) => sum + c, 0),
        evidence: repeatedModules.slice(0, 8).map(([module, count]) => ({ module, open_count: count }))
      }));
    }

    const sevenDaysMs = 7 * 24 * 3600000;
    const nowTs = now();
    const recent7 = tickets.filter(t => {
      const created = toDate(t.created_at || t.createdAt || t.date);
      return created && created.getTime() >= nowTs - sevenDaysMs;
    }).length;
    const previous7 = tickets.filter(t => {
      const created = toDate(t.created_at || t.createdAt || t.date);
      return created && created.getTime() >= nowTs - (14 * 24 * 3600000) && created.getTime() < nowTs - sevenDaysMs;
    }).length;
    const growthRate = previous7 > 0 ? (recent7 - previous7) / previous7 : recent7 > 0 ? 1 : 0;
    if (recent7 >= 8 && growthRate >= 0.3) {
      insights.push(createInsight({
        insight_id: 'ticket-volume-trend-last7-vs-prev7',
        category: 'trend',
        severity: growthRate >= 0.6 ? 'high' : 'medium',
        title: 'New ticket intake increased in the last 7 days',
        summary: `Ticket volume moved from ${previous7} to ${recent7} across comparable 7-day windows.`,
        why_it_matters: 'A sudden intake spike can overload triage and increase unresolved backlog risk.',
        recommended_action: 'Review ticket intake spike.',
        confidence_score: 75,
        resource: 'tickets',
        resource_id: '',
        affected_count: recent7,
        evidence: [{ previous_7_days: previous7, last_7_days: recent7, growth_percent: Math.round(growthRate * 100) }]
      }));
    }

    const upcomingEvents7d = events.filter(ev => {
      const hours = hoursUntil(ev.start_at || ev.start);
      return hours >= 0 && hours <= 7 * 24;
    });

    const upcomingHighImpact = upcomingEvents7d.filter(isHighImpactEvent);
    if (upcomingHighImpact.length) {
      insights.push(createInsight({
        insight_id: 'event-upcoming-high-impact-next-7-days',
        category: 'event_risk',
        severity: 'high',
        title: 'Upcoming high-impact events in next 7 days',
        summary: `${upcomingHighImpact.length} upcoming event(s) indicate downtime/high impact risk.`,
        why_it_matters: 'High-impact change windows require strong readiness to avoid service disruption.',
        recommended_action: 'Confirm readiness and communication.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(upcomingHighImpact[0]),
        affected_count: upcomingHighImpact.length,
        evidence: upcomingHighImpact.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), title: str(ev.title), start_at: ev.start_at || ev.start }))
      }));
    }

    const missingOwnerEvents = events.filter(ev => !str(ev.owner));
    if (missingOwnerEvents.length) {
      insights.push(createInsight({
        insight_id: 'event-data-quality-missing-owner',
        category: 'data_quality',
        severity: 'medium',
        title: 'Events missing owner assignment',
        summary: `${missingOwnerEvents.length} event(s) have no owner.`,
        why_it_matters: 'Ownerless events increase planning gaps and delayed decisions.',
        recommended_action: 'Assign an owner to each event.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(missingOwnerEvents[0]),
        affected_count: missingOwnerEvents.length,
        evidence: missingOwnerEvents.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), title: str(ev.title) }))
      }));
    }

    const missingStartEndEvents = events.filter(ev => !toDate(ev.start_at || ev.start) || !toDate(ev.end_at || ev.end));
    if (missingStartEndEvents.length) {
      insights.push(createInsight({
        insight_id: 'event-data-quality-missing-start-end',
        category: 'data_quality',
        severity: 'high',
        title: 'Events missing start/end time',
        summary: `${missingStartEndEvents.length} event(s) are missing start_at or end_at values.`,
        why_it_matters: 'Scheduling without valid dates breaks readiness, collision checks, and stakeholder communication.',
        recommended_action: 'Populate missing start/end values immediately.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(missingStartEndEvents[0]),
        affected_count: missingStartEndEvents.length,
        evidence: missingStartEndEvents.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), start_at: ev.start_at || ev.start || null, end_at: ev.end_at || ev.end || null }))
      }));
    }

    const readinessIncompleteEvents = events.filter(hasIncompleteReadiness);
    if (readinessIncompleteEvents.length) {
      const hasUpcomingWithin7Days = readinessIncompleteEvents.some(ev => {
        const h = hoursUntil(ev.start_at || ev.start);
        return h >= 0 && h <= 7 * 24;
      });
      insights.push(createInsight({
        insight_id: 'event-readiness-incomplete',
        category: 'event_risk',
        severity: hasUpcomingWithin7Days ? 'high' : 'medium',
        title: 'Event readiness checklist is incomplete',
        summary: `${readinessIncompleteEvents.length} event(s) have incomplete readiness checks.`,
        why_it_matters: 'Unfinished readiness checklists elevate execution and rollback risk.',
        recommended_action: 'Complete readiness checklist before execution.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(readinessIncompleteEvents[0]),
        affected_count: readinessIncompleteEvents.length,
        evidence: readinessIncompleteEvents.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), readiness: ev.readiness || ev.checklist || {} }))
      }));
    }

    const recentlyChangedEvents = events.filter(ev => {
      const updated = toDate(ev.updated_at || ev.updatedAt || ev.created_at || ev.createdAt);
      return updated && nowTs - updated.getTime() <= 2 * 24 * 3600000;
    });
    if (recentlyChangedEvents.length) {
      insights.push(createInsight({
        insight_id: 'event-status-changed-recently',
        category: 'recommendation',
        severity: 'low',
        title: 'Event statuses changed recently',
        summary: `${recentlyChangedEvents.length} event(s) changed status in the last 48 hours.`,
        why_it_matters: 'Recent status shifts can indicate planning drift that needs coordinated communication.',
        recommended_action: 'Review recent event status changes with stakeholders.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(recentlyChangedEvents[0]),
        affected_count: recentlyChangedEvents.length,
        evidence: recentlyChangedEvents.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), status: str(ev.status), updated_at: ev.updated_at || ev.updatedAt }))
      }));
    }

    const riskyEventsWithoutLinkedTickets = events.filter(ev => isHighImpactEvent(ev) && linkedTicketIds(ev).length === 0);
    if (riskyEventsWithoutLinkedTickets.length) {
      insights.push(createInsight({
        insight_id: 'event-without-linked-ticket-traceability',
        category: 'event_risk',
        severity: 'medium',
        title: 'Risky events with no linked ticket',
        summary: `${riskyEventsWithoutLinkedTickets.length} event(s) suggest change risk but have no linked ticket(s).`,
        why_it_matters: 'Missing traceability obscures impact analysis and release accountability.',
        recommended_action: 'Link relevant tickets for traceability.',
        confidence_score: 95,
        resource: 'events',
        resource_id: eventDisplayId(riskyEventsWithoutLinkedTickets[0]),
        affected_count: riskyEventsWithoutLinkedTickets.length,
        evidence: riskyEventsWithoutLinkedTickets.slice(0, 8).map(ev => ({ id: eventDisplayId(ev), impact_type: str(ev.impact_type || ev.impactType || ev.impact) }))
      }));
    }

    const unresolvedLinkedUpcoming = [];
    const highImpactLinkedHighPriority = [];
    const missingLinkedTickets = [];
    const pastEventTicketStillOpen = [];

    events.forEach(ev => {
      const ids = linkedTicketIds(ev);
      if (!ids.length) return;

      ids.forEach(id => {
        const ticket = ticketByAnyId.get(low(id));
        if (!ticket) {
          missingLinkedTickets.push({ event_id: eventDisplayId(ev), ticket_ref: id });
          return;
        }

        const eventHours = hoursUntil(ev.start_at || ev.start);
        if (eventHours >= 0 && eventHours <= 7 * 24 && isOpenTicketStatus(ticket.status)) {
          unresolvedLinkedUpcoming.push({ event_id: eventDisplayId(ev), ticket_id: ticketDisplayId(ticket), hours_until_event: Math.round(eventHours) });
        }

        if (isHighImpactEvent(ev) && ['critical', 'urgent', 'p0', 'high', 'p1'].includes(low(ticket.priority))) {
          highImpactLinkedHighPriority.push({ event_id: eventDisplayId(ev), ticket_id: ticketDisplayId(ticket), priority: str(ticket.priority) });
        }

        const eventEnd = toDate(ev.end_at || ev.end);
        if (eventEnd && eventEnd.getTime() < nowTs && isOpenTicketStatus(ticket.status)) {
          pastEventTicketStillOpen.push({ event_id: eventDisplayId(ev), ticket_id: ticketDisplayId(ticket), ticket_status: str(ticket.status) });
        }
      });
    });

    if (unresolvedLinkedUpcoming.length) {
      const within48h = unresolvedLinkedUpcoming.some(item => item.hours_until_event <= 48);
      insights.push(createInsight({
        insight_id: 'linked-upcoming-event-unresolved-tickets',
        category: 'linked_ticket_event_risk',
        severity: within48h ? 'critical' : 'high',
        title: 'Upcoming events are linked to unresolved tickets',
        summary: `${unresolvedLinkedUpcoming.length} linked ticket-event risk relation(s) remain unresolved before execution.`,
        why_it_matters: 'Unresolved dependencies before an event increase outage probability and rollback pressure.',
        recommended_action: 'Resolve linked tickets or delay event.',
        confidence_score: 85,
        resource: 'events',
        resource_id: unresolvedLinkedUpcoming[0]?.event_id || '',
        affected_count: unresolvedLinkedUpcoming.length,
        evidence: unresolvedLinkedUpcoming.slice(0, 12)
      }));
    }

    if (highImpactLinkedHighPriority.length) {
      insights.push(createInsight({
        insight_id: 'linked-high-impact-event-with-high-priority-ticket',
        category: 'linked_ticket_event_risk',
        severity: 'critical',
        title: 'High-impact events linked to high-priority tickets',
        summary: `${highImpactLinkedHighPriority.length} high-risk link(s) combine high-impact events and high-priority tickets.`,
        why_it_matters: 'This combination compounds change risk and incident likelihood.',
        recommended_action: 'Run escalation review and resolve high-priority dependencies first.',
        confidence_score: 85,
        resource: 'events',
        resource_id: highImpactLinkedHighPriority[0]?.event_id || '',
        affected_count: highImpactLinkedHighPriority.length,
        evidence: highImpactLinkedHighPriority.slice(0, 12)
      }));
    }

    if (missingLinkedTickets.length) {
      insights.push(createInsight({
        insight_id: 'linked-ticket-reference-not-found',
        category: 'data_quality',
        severity: 'medium',
        title: 'Linked ticket references not found',
        summary: `${missingLinkedTickets.length} event-linked ticket reference(s) do not match any existing ticket.`,
        why_it_matters: 'Broken linkage makes incident traceability and auditability unreliable.',
        recommended_action: 'Correct linked ticket ID.',
        confidence_score: 85,
        resource: 'events',
        resource_id: missingLinkedTickets[0]?.event_id || '',
        affected_count: missingLinkedTickets.length,
        evidence: missingLinkedTickets.slice(0, 12)
      }));
    }

    if (pastEventTicketStillOpen.length) {
      insights.push(createInsight({
        insight_id: 'linked-past-event-ticket-still-open',
        category: 'linked_ticket_event_risk',
        severity: 'high',
        title: 'Tickets linked to past events are still open',
        summary: `${pastEventTicketStillOpen.length} linked ticket(s) remain open after the event end time.`,
        why_it_matters: 'Open post-event tickets can indicate unresolved fallout or incomplete closure flow.',
        recommended_action: 'Review closure or follow-up.',
        confidence_score: 85,
        resource: 'events',
        resource_id: pastEventTicketStillOpen[0]?.event_id || '',
        affected_count: pastEventTicketStillOpen.length,
        evidence: pastEventTicketStillOpen.slice(0, 12)
      }));
    }

    return insights.sort((a, b) => {
      const sevDiff = (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0);
      if (sevDiff) return sevDiff;
      const confDiff = Number(b.confidence_score || 0) - Number(a.confidence_score || 0);
      if (confDiff) return confDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  function buildSummary(insights) {
    const visibleInsights = insights.filter(i => i.status !== 'dismissed');
    const criticalInsights = visibleInsights.filter(i => i.severity === 'critical').length;
    const highPriorityItems = visibleInsights.filter(i => ['critical', 'high'].includes(i.severity)).length;

    const openTicketRisk = visibleInsights.filter(i => i.category === 'ticket_risk' && ['critical', 'high'].includes(i.severity)).length;
    const eventsRisk = visibleInsights.filter(i => i.category === 'event_risk' && ['critical', 'high'].includes(i.severity)).length;
    const linkedRisk = visibleInsights.filter(i => i.category === 'linked_ticket_event_risk' && ['critical', 'high'].includes(i.severity)).length;

    const weightedRisk = visibleInsights.reduce((sum, i) => sum + (SEVERITY_WEIGHT[i.severity] || 0), 0);
    const ticketHealthScore = Math.max(0, Math.min(100, 100 - weightedRisk));

    return {
      ticket_health_score: ticketHealthScore,
      open_ticket_risk: openTicketRisk,
      events_risk: eventsRisk,
      linked_ticket_event_risk: linkedRisk,
      critical_insights: criticalInsights,
      high_priority_items: highPriorityItems
    };
  }

  async function generateDashboard() {
    const data = await fetchData();
    const insights = buildInsights(data);
    const summary = buildSummary(insights);
    return {
      summary,
      insights,
      generated_at: new Date().toISOString()
    };
  }

  function updateStatus(insightId, status) {
    const map = getStatusMap();
    map[str(insightId)] = status;
    saveStatusMap(map);
  }

  global.AIDecisionService = {
    generateDashboard,
    updateStatus,
    getStatusMap
  };
})(window);
