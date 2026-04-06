/* =========================================================
   Release Planner – F&B / Middle East
   ========================================================= */

const ReleasePlanner = {
  envWeight: {
    Prod: 2.5,
    Staging: 1.2,
    Dev: 0.6,
    Other: 1
  },
  releaseTypeWeight: {
    minor: 1,
    feature: 2,
    major: 3
  },
  regionKey(region) {
    if (!region) return 'gulf';
    const r = region.toLowerCase();
    if (r.includes('lev')) return 'levant';
    if (r.includes('af')) return 'northafrica';
    return 'gulf';
  },
  computeRushScore(region, date) {
    const d = date instanceof Date ? date : new Date(date);
    const hour = d.getHours();
    const dow = d.getDay(); // 0=Sun
    const key = this.regionKey(region);
    const weekend = new Set(CONFIG.FNB.WEEKEND[key] || [5, 6]);

    let score = 0;

    CONFIG.FNB.BUSY_WINDOWS.forEach(win => {
      if (hour >= win.start && hour < win.end) score += win.weight;
    });

    CONFIG.FNB.OFFPEAK_WINDOWS.forEach(win => {
      if (hour >= win.start && hour < win.end) score += win.weight;
    });

    if (weekend.has(dow)) {
      score += 1.5;
      if (hour >= 19 && hour < 23) score += 1.5;
    }

    // Late-night service tends to be sensitive for Gulf
    if (key === 'gulf' && (hour >= 23 || hour < 2)) score += 1.5;

    // Very early morning is usually safer
    if (hour < 5) score += 0.8;

    return Math.max(0, Math.min(6, score));
  },
  rushLabel(score) {
    if (score <= 1) return 'off-peak';
    if (score <= 3) return 'moderate service';
    return 'rush / busy service';
  },
  /**
   * Build context from selected tickets:
   * - merged modules
   * - combined text (title/desc/log + other fields)
   * - aggregated risk (max/avg/total)
   */
  buildTicketContext(ticketIds, fallbackModules, fallbackDescription) {
    const ids = Array.isArray(ticketIds) ? ticketIds : [];
    const issues = ids.map(id => DataStore.byId.get(id)).filter(Boolean);

    const modulesSet = new Set(
      (fallbackModules || []).map(m => (m || '').toLowerCase())
    );

    let totalRisk = 0;
    let maxRisk = 0;
    const parts = [fallbackDescription || ''];

    issues.forEach(issue => {
      if (issue.module) modulesSet.add(issue.module.toLowerCase());
      const meta = DataStore.computed.get(issue.id) || {};
      const risk = meta.risk?.total || 0;
      totalRisk += risk;
      if (risk > maxRisk) maxRisk = risk;

      parts.push(
        issue.title || '',
        issue.desc || '',
        issue.log || '',
        issue.module || '',
        issue.type || '',
        issue.status || '',
        issue.priority || ''
      );
    });

    const avgRisk = issues.length ? totalRisk / issues.length : 0;
    const modules = Array.from(modulesSet).filter(Boolean);
    const text = parts.filter(Boolean).join(' ');

    return {
      ticketIds: ids,
      issues,
      modules,
      maxRisk,
      avgRisk,
      totalRisk,
      text
    };
  },
  computeBugPressure(modules, horizonDays, ticketContext) {
    const now = new Date();
    const lookback = U.dateAddDays(now, -90);
    const modSet = new Set((modules || []).map(m => (m || '').toLowerCase()));
    let sum = 0;

    DataStore.rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d) || d < lookback) return;

      const mod = (r.module || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      const desc = (r.desc || '').toLowerCase();
      let related = false;

      if (!modSet.size) related = true;
      else if (modSet.has(mod)) related = true;
      else {
        related = Array.from(modSet).some(m => title.includes(m) || desc.includes(m));
      }
      if (!related) return;

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      if (!risk) return;

      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      let w = 1;
      if (ageDays <= 7) w = 1.4;
      else if (ageDays <= 30) w = 1.1;
      else w = 0.7;

      sum += risk * w;
    });

    const normalized = sum / 40; // tuning constant
    let bugRisk = Math.max(0, Math.min(6, normalized));

    // Boost bug pressure slightly when selected tickets are very risky
    const tc = ticketContext || {};
    const maxTicketRisk = tc.maxRisk || 0;
    if (maxTicketRisk) {
      const boost = 1 + Math.min(maxTicketRisk / 20, 1) * 0.25; // up to +25%
      bugRisk = Math.max(0, Math.min(6, bugRisk * boost));
    }

    return { raw: sum, risk: bugRisk };
  },
  bugLabel(risk) {
    if (risk <= 1.5) return 'light recent bug history';
    if (risk <= 3.5) return 'moderate bug pressure';
    return 'heavy bug pressure';
  },
  computeBombBugRisk(modules, description, ticketContext) {
    // "Bomb bug" = old, high-risk incidents that are textually close to this release
    const now = new Date();
    const lookback = U.dateAddDays(now, -365); // last year
    const modSet = new Set((modules || []).map(m => (m || '').toLowerCase()));

    const text = (description || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
    const tokens = new Set(
      text
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t))
    );

    let raw = 0;
    const examples = [];

    DataStore.rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d) || d < lookback) return;

      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      if (ageDays <= 30) return; // we want "old" tickets

      const st = (r.status || '').toLowerCase();
      const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
      if (!isClosed) return;

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      if (risk < CONFIG.RISK.highRisk) return;

      const mod = (r.module || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      const desc = (r.desc || '').toLowerCase();
      const log = (r.log || '').toLowerCase();
      const body = `${title} ${desc} ${log}`;

      let related = false;
      if (!modSet.size) related = true;
      else if (modSet.has(mod)) related = true;
      else {
        related = Array.from(tokens).some(t => body.includes(t));
      }
      if (!related) return;

      // Soft decay: more recent old bugs weigh a bit more
      const ageFactor = Math.max(0.4, 1.3 - ageDays / 365);
      const score = risk * ageFactor;
      raw += score;

      examples.push({
        id: r.id,
        title: r.title || '',
        risk,
        ageDays
      });
    });

    const normalized = raw / 60; // tuning constant
    let bombRisk = Math.max(0, Math.min(6, normalized));

    // Also let current ticket risk slightly boost bomb-bug signal
    const tc = ticketContext || {};
    if (tc.avgRisk) {
      const boost = 1 + Math.min(tc.avgRisk / 20, 1) * 0.3; // up to +30%
      bombRisk = Math.max(0, Math.min(6, bombRisk * boost));
    }

    examples.sort((a, b) => b.risk - a.risk);
    return { raw, risk: bombRisk, examples: examples.slice(0, 3) };
  },
  bombLabel(risk) {
    if (risk <= 1) return 'no strong historical bomb-bug pattern';
    if (risk <= 3) return 'some historical blast patterns in similar changes';
    return 'strong historical bomb-bug pattern, treat as high risk';
  },
  computeEventsPenalty(date, env, modules, region) {
    const dt = date instanceof Date ? date : new Date(date);
    const center = dt.getTime();
    const windowMs = 2 * 60 * 60 * 1000; // +/- 2h for normal changes
    const mods = new Set((modules || []).map(m => (m || '').toLowerCase()));

    let penalty = 0;
    let count = 0;
    let holidayCount = 0;

    DataStore.events.forEach(ev => {
      if (!ev.start) return;

      const start = new Date(ev.start);
      if (isNaN(start)) return;

      const title = (ev.title || '').toLowerCase();
      const impact = (ev.impactType || '').toLowerCase();
      const type = (ev.type || '').toLowerCase();

      const isHoliday =
        type === 'holiday' ||
        /holiday|eid|ramadan|ramadhan|ramzan|iftar|suhoor|ashura|national day|founding day/i.test(
          title
        ) ||
        /holiday|public holiday/i.test(impact);

      const evEnv = ev.env || 'Prod';

      // For holidays, ignore env filter (they affect all envs operationally)
      if (!isHoliday && env && evEnv && evEnv !== env) return;

      const diffMs = Math.abs(start.getTime() - center);
      const maxWindowMs = isHoliday ? 24 * 60 * 60 * 1000 : windowMs;
      if (diffMs > maxWindowMs) return;

      // Collision with other changes near this time
      const evMods = Array.isArray(ev.modules)
        ? ev.modules
        : typeof ev.modules === 'string'
        ? ev.modules.split(',').map(x => x.trim())
        : [];
      const overlap =
        mods.size &&
        evMods.some(m => mods.has((m || '').toLowerCase()));

      let contribution = 0;
      if (isHoliday) {
        holidayCount++;
        // Strong penalty for public / religious holidays around MENA service hours
        contribution = 4.5;
        if (overlap) contribution += 1.5;
      } else {
        count++;
        if (type === 'deployment' || type === 'maintenance' || type === 'release') {
          contribution = overlap ? 3 : 1.5;
        } else {
          contribution = overlap ? 2 : 1;
        }
      }

      penalty += contribution;
    });

    return { penalty, count, holidayCount };
  },
  computeSlotScore(date, ctx) {
    const { region, env, modules, releaseType, bugRisk, bombBugRisk, ticketRisk } = ctx;

    // Raw component scores
    const rushRisk = this.computeRushScore(region, date);               // 0–6
    const envRaw   = this.envWeight[env] ?? 1;                          // ~0.6–2.5
    const typeRaw  = this.releaseTypeWeight[releaseType] ?? 2;          // 1–3

    const { penalty: eventsRisk, count: eventCount, holidayCount } =
      this.computeEventsPenalty(date, env, modules, region);            // 0+

    const bugRaw     = bugRisk || 0;                                    // 0–6
    const bombRaw    = bombBugRisk || 0;                                // 0–6
    const ticketsRaw = ticketRisk || 0;                                 // 0–6

    // ---- Normalize each factor to 0–1 ----
    const clamp01 = v => Math.max(0, Math.min(1, v));

    const nRush    = clamp01(rushRisk / 6);
    const nBug     = clamp01(bugRaw / 6);
    const nBomb    = clamp01(bombRaw / 6);
    const nTickets = clamp01(ticketsRaw / 6);
    const nEnv     = clamp01(envRaw / 2.5);  // Prod ≈ 1
    const nType    = clamp01(typeRaw / 3);
    const nEvents  = clamp01(eventsRisk / 6); // 0–6+ → 0–1

    // ---- Weighted combination into a 0–10 score ----
    const wRush    = 0.15;
    const wBug     = 0.20;
    const wBomb    = 0.15;
    const wEvents  = 0.20;
    const wTickets = 0.15;
    const wEnv     = 0.075;
    const wType    = 0.075;

    const combined =
      wRush    * nRush    +
      wBug     * nBug     +
      wBomb    * nBomb    +
      wEvents  * nEvents  +
      wTickets * nTickets +
      wEnv     * nEnv     +
      wType    * nType;

    // Final risk: 0–10
    const totalRisk   = Math.max(0, Math.min(10, combined * 10));
    const safetyScore = 10 - totalRisk; // 0–10 (10 = safest)

    return {
      totalRisk,
      safetyScore,
      rushRisk,
      bugRisk: bugRaw,
      bombRisk: bombRaw,
      envRisk: envRaw,
      typeRisk: typeRaw,
      eventsRisk,
      eventCount,
      holidayCount,
      ticketsRisk: ticketsRaw
    };
  },
  riskBucket(totalRisk) {
    // totalRisk is now 0–10
    if (totalRisk < 3.5) {
      return { label: 'Low', className: 'planner-score-low' };
    }
    if (totalRisk < 7.0) {
      return { label: 'Medium', className: 'planner-score-med' };
    }
    return { label: 'High', className: 'planner-score-high' };
  },
  suggestSlots({
    region,
    env,
    modules,
    horizonDays,
    releaseType,
    description,
    slotsPerDay,
    tickets
  }) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Build a richer context from selected tickets (scope + text + risk)
    const ticketContext = this.buildTicketContext(
      tickets || [],
      modules || [],
      description || ''
    );

    const effectiveModules =
      (ticketContext.modules && ticketContext.modules.length
        ? ticketContext.modules
        : modules) || [];
    const combinedDescription = ticketContext.text || description || '';

    const horizon = Math.max(1, horizonDays || 7);

    const bug = this.computeBugPressure(effectiveModules, horizon, ticketContext);
    const bomb = this.computeBombBugRisk(
      effectiveModules,
      combinedDescription,
      ticketContext
    );

    // Ticket risk component: normalize avg risk onto a 0–6 scale
    let ticketRiskComponent = 0;
    if (ticketContext.avgRisk) {
      ticketRiskComponent = Math.min(ticketContext.avgRisk / 4, 6);
    }

    const slots = [];
    const hoursProd = [6, 10, 15, 23]; // Prod: pre-service + between services + late
    const hoursNonProd = [10, 15, 18]; // Staging/Dev can tolerate slightly busier times
    const hours = env === 'Prod' ? hoursProd : hoursNonProd;

    for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
      const base = U.dateAddDays(startOfToday, dayOffset);
      hours.forEach(h => {
        const dt = new Date(base.getTime());
        dt.setHours(h, 0, 0, 0);
        if (dt <= now) return;

        const score = this.computeSlotScore(dt, {
          region,
          env,
          modules: effectiveModules,
          releaseType,
          bugRisk: bug.risk,
          bombBugRisk: bomb.risk,
          ticketRisk: ticketRiskComponent
        });

        slots.push({
          ...score,
          start: dt,
          end: new Date(dt.getTime() + 60 * 60 * 1000)
        });
      });
    }

    slots.sort((a, b) => a.totalRisk - b.totalRisk);

    const perDay = Math.max(1, slotsPerDay || 3);
    const maxSlots = Math.min(slots.length, horizon * perDay);

    return { bug, bomb, slots: slots.slice(0, maxSlots), ticketContext };
  }
};
