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

// ========== SMOOTH SCROLL ==========
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
      // Optional: smooth height
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

    // Optional message length check
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

    // Here you would POST to your backend or CRM
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
