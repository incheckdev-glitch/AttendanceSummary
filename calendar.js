/** Calendar helpers */
const CalendarLink = {
  riskBadgeClass(score) {
    if (score >= CONFIG.RISK.critRisk) return 'risk-crit';
    if (score >= CONFIG.RISK.highRisk) return 'risk-high';
    if (score >= 6) return 'risk-med';
    return 'risk-low';
  }
};

/** Events + risk (issues + events) */
function computeEventsRisk(issues, events) {
  const now = new Date(),
    limit = U.dateAddDays(now, 7);
  const openIssues = issues.filter(i => {
    const st = (i.status || '').toLowerCase();
    return !(st.startsWith('resolved') || st.startsWith('rejected'));
  });
  const modules = Array.from(new Set(openIssues.map(i => i.module).filter(Boolean)));
  const res = [];
  events.forEach(ev => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d) || d < now || d > limit) return;
    const title = (ev.title || '').toLowerCase();
    const impacted = modules.filter(m => title.includes((m || '').toLowerCase()));
    let rel = [];
    if (impacted.length) rel = openIssues.filter(i => impacted.includes(i.module));
    else if ((ev.type || '').toLowerCase() !== 'other') {
      const recentOpen = openIssues.filter(i => U.isBetween(i.date, U.daysAgo(7), null));
      rel = recentOpen.filter(
        i => (DataStore.computed.get(i.id)?.risk?.total || 0) >= CONFIG.RISK.highRisk
      );
    }
    if (!rel.length) return;
    const risk = rel.reduce(
      (s, i) => s + (DataStore.computed.get(i.id)?.risk?.total || 0),
      0
    );
    res.push({ event: ev, modules: impacted, issues: rel, risk, date: d });
  });
  res.sort((a, b) => b.risk - a.risk);
  return res.slice(0, 5);
}

/** Change collisions, freeze windows, hot issues flags */
const FREEZE_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getFreezeWindows() {
  if (Array.isArray(DataStore.freezeWindows)) return DataStore.freezeWindows;
  return CONFIG.CHANGE.freezeWindows || [];
}

function formatFreezeWindow(win) {
  if (!win) return '';
  const days = (win.dow || [])
    .map(d => FREEZE_DAY_LABELS[d])
    .filter(Boolean)
    .join(', ');
  const start = `${U.pad(win.startHour)}:00`;
  const end = `${U.pad(win.endHour)}:00`;
  return `${days || '—'} · ${start}–${end}`;
}

function withFreezeIds(windows) {
  return (windows || []).map(win => ({
    ...win,
    id: win.id || `fw_${Math.random().toString(36).slice(2)}`
  }));
}

function computeChangeCollisions(issues, events) {
  const flagsById = new Map();
  const byId = id => {
    let f = flagsById.get(id);
    if (!f) {
      f = { collision: false, freeze: false, hotIssues: false };
      flagsById.set(id, f);
    }
    return f;
  };
  if (!events || !events.length) return { collisions: [], flagsById };

  const openIssues = issues.filter(i => {
    const st = (i.status || '').toLowerCase();
    return !(st.startsWith('resolved') || st.startsWith('rejected'));
  });

  const highRiskIssues = openIssues.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    const risk = meta.risk?.total || 0;
    if (risk < CONFIG.RISK.highRisk) return false;
    if (!i.date) return true;
    const d = new Date(i.date);
    if (isNaN(d)) return true;
    return U.isBetween(d, U.daysAgo(CONFIG.CHANGE.hotIssueRecentDays), null);
  });

  const normalized = events
    .map(ev => {
      const start = ev.start ? new Date(ev.start) : null;
      const end = ev.end ? new Date(ev.end) : null;
      return { ...ev, _start: start, _end: end };
    })
    .filter(ev => ev._start && !isNaN(ev._start));
  normalized.sort((a, b) => a._start - b._start);

  const collisions = [];
  const defaultDurMs = CONFIG.CHANGE.overlapLookbackMinutes * 60000;
  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i];
    const aEnd = a._end || new Date(a._start.getTime() + defaultDurMs);
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j];
      if (a.env && b.env && a.env !== b.env) continue;
      if (b._start >= aEnd) break;
      const bEnd = b._end || new Date(b._start.getTime() + defaultDurMs);
      if (b._start < aEnd && a._start < bEnd) {
        collisions.push([a.id, b.id]);
        byId(a.id).collision = true;
        byId(b.id).collision = true;
      }
    }
  }

 const freezeWindows = getFreezeWindows();
  if (freezeWindows && freezeWindows.length) {
    events.forEach(ev => {
      if (!ev.start) return;
      const d = new Date(ev.start);
      if (isNaN(d)) return;
      const dow = d.getDay(); // 0=Sun
      const hour = d.getHours();
      const inFreeze = freezeWindows.some(
        win => win.dow.includes(dow) && hour >= win.startHour && hour < win.endHour
      );
      if (inFreeze) byId(ev.id).freeze = true;
    });
  }

  events.forEach(ev => {
    const flags = byId(ev.id);
    const modulesArr = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === 'string'
      ? ev.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    let rel = [];
    if (modulesArr.length) {
      rel = highRiskIssues.filter(i => modulesArr.includes(i.module));
    } else {
      const title = (ev.title || '').toLowerCase();
      rel = highRiskIssues.filter(
        i => (i.module || '') && title.includes((i.module || '').toLowerCase())
      );
    }
    if (rel.length) flags.hotIssues = true;
  });

  return { collisions, flagsById };
}

function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(
    d.getDate()
  )}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
}
function toLocalDateValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
}
