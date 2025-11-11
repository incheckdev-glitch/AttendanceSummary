// calendar.js
// =========== CALENDAR MODULE ===========
// Handles release planning, environment events, and scheduling
// Lazy-loaded when user switches to the Calendar view.

import { showToast } from './utils.js';

let calendar;

// ---------- INIT ENTRY POINT ----------
export async function initCalendar() {
  console.log('Calendar view initialized');

  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) {
    console.warn('Calendar container missing');
    return;
  }

  // Import only necessary FullCalendar modules
  const { Calendar } = await import('@fullcalendar/core');
  const { dayGridPlugin } = await import('@fullcalendar/daygrid');
  const { interactionPlugin } = await import('@fullcalendar/interaction');

  // Destroy existing calendar (if re-opened)
  if (calendar) calendar.destroy();

  // Load events (async)
  const events = await loadCalendarEvents();

  // Initialize FullCalendar
  calendar = new Calendar(calendarEl, {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    height: 'auto',
    events,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: '',
    },
    eventClick: handleEventClick,
    eventDidMount: decorateEvent,
  });

  calendar.render();
  showToast('Calendar loaded');
}

// ---------- LOAD EVENTS ----------
async function loadCalendarEvents() {
  try {
    const response = await fetch('./data/calendar.json');
    if (!response.ok) throw new Error('Failed to load calendar events');
    const events = await response.json();
    return normalizeEvents(events);
  } catch (err) {
    console.error('❌ Error loading calendar data:', err);
    showToast('Error loading calendar data', 'error');
    return [];
  }
}

// ---------- NORMALIZE DATA ----------
function normalizeEvents(events) {
  return events.map(ev => {
    const baseClass = `event-type-${ev.type || 'other'}`;
    const envClass = ev.env ? `event-env-${ev.env}` : '';
    const riskClass = ev.risk ? `event-risk-${ev.risk}` : '';
    const flags = [
      ev.freeze && 'event-freeze',
      ev.collision && 'event-collision',
      ev.hot && 'event-hot',
    ].filter(Boolean);

    return {
      ...ev,
      classNames: [baseClass, envClass, riskClass, ...flags],
    };
  });
}

// ---------- EVENT DECORATION ----------
function decorateEvent(info) {
  const el = info.el;
  const { extendedProps } = info.event;

  if (extendedProps.risk) {
    const badge = document.createElement('span');
    badge.className = `event-risk-badge risk-${extendedProps.risk}`;
    badge.textContent = extendedProps.risk.toUpperCase();
    el.querySelector('.fc-event-title').appendChild(badge);
  }
}

// ---------- EVENT CLICK ----------
function handleEventClick(info) {
  const event = info.event.extendedProps;
  const details = `
    <strong>${info.event.title}</strong><br>
    Environment: ${event.env || 'N/A'}<br>
    Type: ${event.type || 'other'}<br>
    Date: ${info.event.startStr}
  `;

  showToast(details);
  info.jsEvent.preventDefault();
}

// ---------- REFRESH ----------
export function refreshCalendar(events) {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(normalizeEvents(events));
  showToast('Calendar refreshed');
}
