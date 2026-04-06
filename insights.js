/** Command DSL parser */
const DSL = {
  parse(text) {
    const lower = (text || '').toLowerCase();
    let w = ' ' + lower + ' ';
    const out = {
      module: null,
      status: null,
      priority: null,
      id: null,
      type: null,
      missing: null,
      riskOp: null,
      riskVal: null,
      severityOp: null,
      severityVal: null,
      impactOp: null,
      impactVal: null,
      urgencyOp: null,
      urgencyVal: null,
      ageOp: null,
      ageVal: null,
      lastDays: null,
      cluster: null,
      sort: null,
      eventScope: null,
      words: []
    };
    const eat = (re, key, fn = v => v) => {
      const m = w.match(re);
      if (m) {
        out[key] = fn(m[1].trim());
        w = w.replace(m[0], ' ');
      }
    };
    eat(/\bmodule:([^\s]+)/, 'module');
    eat(/\bstatus:([^\s]+)/, 'status');
    eat(/\bpriority:([^\s]+)/, 'priority');
    eat(/\bid:([^\s]+)/, 'id');
    eat(/\btype:([^\s]+)/, 'type');
    eat(/\bmissing:([^\s]+)/, 'missing');

    const rv = lower.match(/\brisk([><=]{1,2})(\d+)/);
    if (rv) {
      out.riskOp = rv[1];
      out.riskVal = +rv[2];
      w = w.replace(rv[0], ' ');
    }

    const sv = lower.match(/\bseverity([><=]{1,2})(\d+)/);
    if (sv) {
      out.severityOp = sv[1];
      out.severityVal = +sv[2];
      w = w.replace(sv[0], ' ');
    }
    const iv = lower.match(/\bimpact([><=]{1,2})(\d+)/);
    if (iv) {
      out.impactOp = iv[1];
      out.impactVal = +iv[2];
      w = w.replace(iv[0], ' ');
    }
    const uv = lower.match(/\burgency([><=]{1,2})(\d+)/);
    if (uv) {
      out.urgencyOp = uv[1];
      out.urgencyVal = +uv[2];
      w = w.replace(uv[0], ' ');
    }

    eat(/\blast:(\d+)d/, 'lastDays', n => +n);
    const av = lower.match(/\bage([><=]{1,2})(\d+)d/);
    if (av) {
      out.ageOp = av[1];
      out.ageVal = +av[2];
      w = w.replace(av[0], ' ');
    }

    eat(/\bcluster:([^\s]+)/, 'cluster');
    eat(/\bsort:(risk|date|priority)/, 'sort');
    eat(/\bevent:(\S+)/, 'eventScope');

    out.words = w
      .split(/\s+/)
      .filter(Boolean)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));
    return out;
  },
  matches(issue, meta, q) {
    if (q.module && !(issue.module || '').toLowerCase().includes(q.module)) return false;
    if (q.priority) {
      const p = q.priority[0].toUpperCase();
      if (['H', 'M', 'L'].includes(p)) {
        if ((issue.priority || '')[0] !== p) return false;
      } else if (!(issue.priority || '').toLowerCase().includes(q.priority)) return false;
    }
    if (q.status) {
      const st = (issue.status || '').toLowerCase();
      if (q.status === 'open') {
        const closed = st.startsWith('resolved') || st.startsWith('rejected');
        if (closed) return false;
      } else if (q.status === 'closed') {
        const closed = st.startsWith('resolved') || st.startsWith('rejected');
        if (!closed) return false;
      } else if (!st.includes(q.status)) return false;
    }
    if (q.id && !(issue.id || '').toLowerCase().includes(q.id)) return false;
    if (q.type && !(issue.type || '').toLowerCase().includes(q.type)) return false;
    if (q.missing) {
      const m = q.missing;
      if (m === 'priority' && issue.priority) return false;
      if (m === 'module' && issue.module && issue.module !== 'Unspecified') return false;
      if (m === 'type' && issue.type) return false;
    }
    if (q.lastDays) {
      const after = U.daysAgo(q.lastDays);
      if (!U.isBetween(issue.date, after, null)) return false;
    }
    if (q.ageOp && q.ageVal != null) {
      if (!issue.date) return false;
      const d = new Date(issue.date);
      if (isNaN(d)) return false;
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      const op = q.ageOp,
        b = q.ageVal;
      let pass = false;
      if (op === '>') pass = ageDays > b;
      else if (op === '>=') pass = ageDays >= b;
      else if (op === '<') pass = ageDays < b;
      else if (op === '<=') pass = ageDays <= b;
      else if (op === '=' || op === '==') pass = Math.round(ageDays) === b;
      if (!pass) return false;
    }
    if (q.cluster) {
      const t = q.cluster.toLowerCase();
      if (!meta.tokens || !Array.from(meta.tokens).some(x => x.includes(t))) return false;
    }
    const risk = meta.risk || {};
    if (q.riskOp) {
      const rv = risk.total || 0;
      const op = q.riskOp,
        b = q.riskVal;
      let pass = false;
      if (op === '>') pass = rv > b;
      else if (op === '>=') pass = rv >= b;
      else if (op === '<') pass = rv < b;
      else if (op === '<=') pass = rv <= b;
      else if (op === '=' || op === '==') pass = rv === b;
      if (!pass) return false;
    }
    const cmpNum = (val, op, b) => {
      const v = val || 0;
      if (op === '>') return v > b;
      if (op === '>=') return v >= b;
      if (op === '<') return v < b;
      if (op === '<=') return v <= b;
      if (op === '=' || op === '==') return v === b;
      return true;
    };
    if (q.severityOp && !cmpNum(risk.severity, q.severityOp, q.severityVal)) return false;
    if (q.impactOp && !cmpNum(risk.impact, q.impactOp, q.impactVal)) return false;
    if (q.urgencyOp && !cmpNum(risk.urgency, q.urgencyOp, q.urgencyVal)) return false;

    if (q.words && q.words.length) {
      const txt = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase();
      for (const w of q.words) {
        if (!txt.includes(w)) return false;
      }
    }
    return true;
  }

};
