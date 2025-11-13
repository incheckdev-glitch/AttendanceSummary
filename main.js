// main.js

// ========== NAV TOGGLE (MOBILE) ==========
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close nav when clicking a link (mobile)
  nav.addEventListener("click", (event) => {
    if (event.target.matches("a") && nav.classList.contains("nav-open")) {
      nav.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

// ========== SMOOTH SCROLL (links + buttons with data-scroll) ==========
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#'], button[data-scroll]");
  if (!link) return;

  const targetSelector =
    link.tagName.toLowerCase() === "button"
      ? link.getAttribute("data-scroll")
      : link.getAttribute("href");

  if (!targetSelector || targetSelector === "#") return;

  const targetEl = document.querySelector(targetSelector);
  if (!targetEl) return;

  event.preventDefault();
  targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ========== FAQ ACCORDION ==========
const faqItems = document.querySelectorAll(".faq-item");

faqItems.forEach((item) => {
  const button = item.querySelector(".faq-question");
  const answer = item.querySelector(".faq-answer");
  const icon = item.querySelector(".faq-icon");

  if (!button || !answer || !icon) return;

  button.addEventListener("click", () => {
    const isOpen = item.getAttribute("data-open") === "true";

    // Close all items
    faqItems.forEach((i) => {
      i.setAttribute("data-open", "false");
      const ic = i.querySelector(".faq-icon");
      const q = i.querySelector(".faq-question");
      const ans = i.querySelector(".faq-answer");
      if (ic) ic.textContent = "+";
      if (q) q.setAttribute("aria-expanded", "false");
      if (ans) ans.style.maxHeight = "";
    });

    // Open current if it was closed
    if (!isOpen) {
      item.setAttribute("data-open", "true");
      icon.textContent = "–";
      button.setAttribute("aria-expanded", "true");
      answer.style.maxHeight = answer.scrollHeight + "px";
    }
  });
});

// ========== ON-SCROLL ANIMATIONS ==========
const animatedEls = document.querySelectorAll("[data-animate]");

if ("IntersectionObserver" in window && animatedEls.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.18,
    }
  );

  animatedEls.forEach((el) => observer.observe(el));
}

// ========== SCROLLSPY (highlight active section in nav) ==========
const sections = document.querySelectorAll("main section[id]");
const navLinks = document.querySelectorAll(".nav-list a[href^='#']");

function updateActiveNav() {
  let currentSectionId = null;
  const offset = 120; // offset from top to account for sticky header

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.top - offset <= 0 && rect.bottom - offset > 0) {
      currentSectionId = section.id;
    }
  });

  if (!currentSectionId) return;

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    const id = href.replace("#", "");
    if (id === currentSectionId) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

// Simple throttle to avoid running on every scroll pixel
function throttle(fn, wait) {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn(...args);
    }
  };
}

if (sections.length && navLinks.length) {
  window.addEventListener("scroll", throttle(updateActiveNav, 100));
  // Initial call so the correct item is active on load
  updateActiveNav();
}

// ========== ANIMATED COUNTERS ==========
const counterEls = document.querySelectorAll("[data-counter]");

function animateCounter(el, duration = 1300) {
  const target = Number(el.getAttribute("data-counter"));
  if (!target || isNaN(target)) return;

  const start = 0;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const value = Math.floor(start + (target - start) * eased);
    el.textContent = value.toString();

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target.toString();
    }
  }

  requestAnimationFrame(tick);
}

if ("IntersectionObserver" in window && counterEls.length > 0) {
  const countersObserver = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          animateCounter(el);
          obs.unobserve(el);
        }
      });
    },
    {
      threshold: 0.6,
    }
  );

  counterEls.forEach((el) => countersObserver.observe(el));
} else {
  // Fallback: just set to target immediately
  counterEls.forEach((el) => {
    const target = el.getAttribute("data-counter");
    if (target) el.textContent = target;
  });
}

// ========== CONTACT FORM (FRONT-END VALIDATION ONLY) ==========
const form = document.getElementById("demo-form");
const successMessage = document.getElementById("form-success-message");

function showError(fieldName, message) {
  const field = document.querySelector(`[name="${fieldName}"]`);
  const errorEl = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!field || !errorEl) return;

  errorEl.textContent = message || "";
  if (message) {
    field.setAttribute("aria-invalid", "true");
  } else {
    field.removeAttribute("aria-invalid");
  }
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = formData.get("name")?.toString().trim();
    const email = formData.get("email")?.toString().trim();
    const message = formData.get("message")?.toString().trim();

    let hasError = false;

    // Name
    if (!name) {
      showError("name", "Please enter your full name.");
      hasError = true;
    } else {
      showError("name", "");
    }

    // Email
    if (!email) {
      showError("email", "Please enter your work email.");
      hasError = true;
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showError("email", "Please enter a valid email address.");
      hasError = true;
    } else {
      showError("email", "");
    }

    // Optional: message length check
    if (message && message.length < 10) {
      showError(
        "message",
        "Please share a bit more detail (at least 10 characters)."
      );
      hasError = true;
    } else {
      showError("message", "");
    }

    if (hasError) {
      if (successMessage) {
        successMessage.hidden = true;
      }
      return;
    }

    // Here you would POST to your backend/CRM
    form.reset();
    if (successMessage) {
      successMessage.hidden = false;
    }
  });
}

// ========== FOOTER YEAR ==========
const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
