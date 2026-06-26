(function () {
  'use strict';

  const state = { actions: [] };

  const escapeHtml = value => {
    if (window.U?.escapeHtml) return window.U.escapeHtml(String(value ?? ''));
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  };

  const escapeAttr = value => {
    if (window.U?.escapeAttr) return window.U.escapeAttr(String(value ?? ''));
    return escapeHtml(value).replaceAll('`', '&#096;');
  };

  const display = value => {
    const text = String(value ?? '').trim();
    return text || '—';
  };

  const formatValue = value => {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) return value.map(display).filter(v => v !== '—').join(', ') || '—';
    return display(value);
  };

  function ensureDrawer() {
    let drawer = document.getElementById('recordDetailsDrawer');
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.id = 'recordDetailsDrawer';
    drawer.className = 'payment-forecast-details-drawer record-details-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'recordDetailsTitle');
    drawer.hidden = true;
    drawer.innerHTML = `
      <button class="payment-forecast-details-backdrop record-details-backdrop" type="button" aria-label="Close details" data-record-details-close></button>
      <section class="payment-forecast-details-panel record-details-panel">
        <header class="payment-forecast-details-header record-details-header">
          <div>
            <span id="recordDetailsEyebrow" class="pf-eyebrow">Details</span>
            <h2 id="recordDetailsTitle">Record Details</h2>
            <p id="recordDetailsSubtitle" class="muted"></p>
          </div>
          <button class="btn ghost sm" type="button" data-record-details-close>Close</button>
        </header>
        <div id="recordDetailsContent" class="payment-forecast-details-content record-details-content" aria-live="polite"></div>
      </section>`;
    document.body.appendChild(drawer);
    drawer.addEventListener('click', event => {
      if (event.target?.closest?.('[data-record-details-close]')) {
        window.RecordDetailsDrawer.close();
        return;
      }
      const actionButton = event.target?.closest?.('[data-record-details-action]');
      if (!actionButton) return;
      const index = Number(actionButton.getAttribute('data-record-details-action'));
      const action = state.actions[index];
      if (!action || typeof action.onClick !== 'function') return;
      if (action.closeOnClick !== false) window.RecordDetailsDrawer.close();
      action.onClick(actionButton);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawer.hidden === false) window.RecordDetailsDrawer.close();
    });
    return drawer;
  }

  function renderField([label, value]) {
    return `<div class="record-details-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatValue(value))}</strong></div>`;
  }

  function renderFields(fields = []) {
    return `<div class="record-details-fields">${fields.map(renderField).join('')}</div>`;
  }

  function renderCards(cards = []) {
    return `<div class="payment-forecast-details-grid record-details-cards">${cards.map(([label, value]) => `<div class="payment-forecast-details-card record-details-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatValue(value))}</strong></div>`).join('')}</div>`;
  }

  function renderSection(section = {}) {
    const title = section.title || 'Details';
    const body = section.html || (Array.isArray(section.cards) ? renderCards(section.cards) : renderFields(section.fields || []));
    return `<section class="payment-forecast-details-section record-details-section ${escapeAttr(section.className || '')}"><h3>${escapeHtml(title)}</h3>${body}</section>`;
  }

  function renderActions(actions = []) {
    state.actions = Array.isArray(actions) ? actions.filter(Boolean) : [];
    if (!state.actions.length) return '';
    const buttons = state.actions.map((action, index) => {
      const variant = action.variant || 'ghost';
      const label = action.label || 'Action';
      const permissionResource = action.permissionResource ? ` data-permission-resource="${escapeAttr(action.permissionResource)}"` : '';
      const permissionAction = action.permissionAction ? ` data-permission-action="${escapeAttr(action.permissionAction)}"` : '';
      return `<button class="btn ${escapeAttr(variant)} sm" type="button" data-record-details-action="${index}"${permissionResource}${permissionAction}>${escapeHtml(label)}</button>`;
    }).join('');
    return renderSection({ title: 'Actions', html: `<div class="record-details-actions">${buttons}</div>` });
  }

  window.RecordDetailsDrawer = {
    open(config = {}) {
      const drawer = ensureDrawer();
      const title = document.getElementById('recordDetailsTitle');
      const subtitle = document.getElementById('recordDetailsSubtitle');
      const eyebrow = document.getElementById('recordDetailsEyebrow');
      const content = document.getElementById('recordDetailsContent');
      if (eyebrow) eyebrow.textContent = config.eyebrow || config.moduleLabel || 'Details';
      if (title) title.textContent = config.title || 'Record Details';
      if (subtitle) subtitle.textContent = config.subtitle || '';
      if (content) {
        const sections = Array.isArray(config.sections) ? config.sections.map(renderSection).join('') : '';
        content.innerHTML = `${sections}${renderActions(config.actions || [])}`;
        if (typeof window.applyPermissionVisibility === 'function') window.applyPermissionVisibility(content);
      }
      drawer.hidden = false;
      document.body.classList.add('pf-modal-open');
    },
    close() {
      const drawer = ensureDrawer();
      drawer.hidden = true;
      document.body.classList.remove('pf-modal-open');
      state.actions = [];
    },
    isOpen() {
      const drawer = document.getElementById('recordDetailsDrawer');
      return Boolean(drawer && drawer.hidden === false);
    }
  };
})();
