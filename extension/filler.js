// Jobify Autopilot: fills an employer's application form and submits it.
// Injected into the application page by background.js. Returns
// { status: "submitted" | "needs_you" | "failed", note }.
// It never solves or bypasses CAPTCHAs, and never submits with required fields empty.

(() => {
  if (window.__jobifyFill) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  }

  /** Set a value so React/Vue forms notice it. */
  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function labelOf(el) {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const by = el.getAttribute("aria-labelledby");
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
    if (el.labels && el.labels.length) return el.labels[0].innerText;
    const c = el.closest("label, fieldset, .field, .application-question, [class*='question'], [class*='field']");
    const l = c && c.querySelector("label, legend, .text, [class*='label']");
    return (l && l.innerText) || el.placeholder || el.name || "";
  }

  const CONTROL = "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea, [role=combobox]";

  /** Find the control (or radio/checkbox group) for a question. */
  function findControl(field) {
    const id = field.id;
    const byId =
      document.getElementById(id) ||
      document.querySelector(`[name="${cssEscape(id)}"]`) ||
      document.querySelector(`[name="${cssEscape(id)}[]"]`) ||
      document.querySelector(`[name="job_application[${cssEscape(id)}]"]`) ||
      document.querySelector(`[name$="[${cssEscape(id)}]"]`);
    if (byId) return byId;

    // By visible question text.
    const want = norm(field.label).slice(0, 60);
    if (!want) return null;
    const labels = [...document.querySelectorAll("label, legend, [class*='label'], [class*='question']")].filter(visible);
    for (const l of labels) {
      const t = norm(l.innerText);
      if (!t || !(t.startsWith(want) || want.startsWith(t.slice(0, 40)))) continue;
      if (l.htmlFor && document.getElementById(l.htmlFor)) return document.getElementById(l.htmlFor);
      const inside = l.querySelector(CONTROL);
      if (inside) return inside;
      const box = l.closest("fieldset, .field, .application-question, [class*='question'], [class*='field'], div");
      const near = box && box.querySelector(CONTROL);
      if (near) return near;
    }
    return null;
  }

  function groupFor(el) {
    if (!(el instanceof HTMLInputElement) || !/radio|checkbox/.test(el.type)) return null;
    const scope = el.closest("fieldset, [role=group], [role=radiogroup], .field, [class*='question']") || document;
    const name = el.name;
    return [...scope.querySelectorAll(`input[type=${el.type}]`)].filter((i) => !name || i.name === name || i.name === `${name}[]`);
  }

  function optionText(input) {
    return norm((input.labels && input.labels[0] && input.labels[0].innerText) || input.closest("label")?.innerText || input.value);
  }

  async function pickInCombobox(el, labels) {
    for (const text of labels) {
      el.focus();
      el.click();
      setNative(el, text);
      await sleep(500);
      const opts = [...document.querySelectorAll("[role=option], [class*='option']")].filter(visible);
      const target = opts.find((o) => norm(o.innerText) === norm(text)) || opts.find((o) => norm(o.innerText).startsWith(norm(text)));
      if (target) {
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.click();
        await sleep(200);
      } else {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await sleep(200);
      }
    }
  }

  async function fillField(field, el, pdf) {
    if (field.kind === "file") {
      if (!field.resume) return true; // optional files (cover letter) are left alone
      const input = el instanceof HTMLInputElement && el.type === "file" ? el : (el?.closest("div, fieldset") || document).querySelector("input[type=file]");
      if (!input) return false;
      const dt = new DataTransfer();
      dt.items.add(pdf);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    if (!field.values.length) return true; // nothing to fill (optional / declined)
    if (!el) return false;

    if (el instanceof HTMLSelectElement) {
      const opt = [...el.options].find((o) => field.values.includes(o.value)) ||
        [...el.options].find((o) => field.labels.some((l) => norm(o.text) === norm(l))) ||
        [...el.options].find((o) => field.labels.some((l) => norm(o.text).startsWith(norm(l))));
      if (!opt) return false;
      setNative(el, opt.value);
      return true;
    }
    const group = groupFor(el);
    if (group) {
      let any = false;
      for (const input of group) {
        const t = optionText(input);
        const want = field.labels.some((l) => t === norm(l) || t.startsWith(norm(l))) || field.values.includes(input.value);
        if (want !== input.checked) input.click();
        any = any || want;
      }
      return any;
    }
    if (el.getAttribute("role") === "combobox" || el.closest("[class*='select__control'], [class*='select-shell']")) {
      await pickInCombobox(el, field.labels.length ? field.labels : field.values);
      return true;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNative(el, field.labels.join(", "));
      return true;
    }
    return false;
  }

  /** Fill common fields that forms name differently (full name, links) from the answers we have. */
  function fillAliases(task) {
    const val = (id) => task.fields.find((f) => f.id === id)?.labels.join(", ") || "";
    const full = [val("first_name"), val("last_name")].filter(Boolean).join(" ");
    const known = [
      [/^(full )?name$|^your name$/, full],
      [/first name/, val("first_name")],
      [/last name|surname|family name/, val("last_name")],
      [/^e ?mail/, val("email")],
      [/phone|mobile/, val("phone")],
      [/linkedin/, val("linkedin")],
      [/github|portfolio|website|personal site/, val("website")],
      [/current (company|employer)|^company$|^org/, val("current_company") || val("question_current_company")],
      [/location|city/, val("location")],
    ];
    for (const el of document.querySelectorAll("input[type=text], input[type=email], input[type=tel], input[type=url], input:not([type])")) {
      if (!visible(el) || el.value) continue;
      const l = norm(labelOf(el));
      const hit = known.find(([re, v]) => v && re.test(l));
      if (hit) setNative(el, hit[1]);
    }
  }

  function hasCaptcha() {
    const frames = [...document.querySelectorAll("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], iframe[src*='turnstile']")];
    const challenge = frames.some((f) => visible(f) && !/size=invisible/.test(f.src));
    return challenge || [...document.querySelectorAll(".g-recaptcha, .h-captcha, .cf-turnstile")].some(visible);
  }

  function emptyRequired() {
    const out = [];
    for (const el of document.querySelectorAll("[required], [aria-required=true]")) {
      if (!visible(el) && !(el instanceof HTMLInputElement && el.type === "file")) continue;
      const group = groupFor(el);
      const empty = group ? !group.some((i) => i.checked) : el instanceof HTMLInputElement && el.type === "file" ? !el.files?.length : !String(el.value || "").trim();
      if (empty) out.push(labelOf(el).trim().slice(0, 80) || el.name);
    }
    return [...new Set(out)];
  }

  function submitButton() {
    const buttons = [...document.querySelectorAll("button, input[type=submit]")].filter(visible);
    return (
      buttons.find((b) => /submit application|send application/i.test(b.innerText || b.value)) ||
      buttons.find((b) => b.type === "submit" && !/linkedin|indeed|save/i.test(b.innerText || b.value)) ||
      buttons.find((b) => /^\s*(submit|apply)\s*$/i.test(b.innerText || b.value))
    );
  }

  const SUCCESS = /thank you for (applying|your application|your interest)|application (has been )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)/i;

  async function waitForResult(startUrl) {
    for (let i = 0; i < 50; i++) {
      await sleep(500);
      if (location.href !== startUrl && /confirm|thank|submitted|success/i.test(location.href)) return { status: "submitted", note: "Confirmation page shown." };
      if (SUCCESS.test(document.body.innerText)) return { status: "submitted", note: "Employer confirmed the application." };
      const err = [...document.querySelectorAll("[role=alert], .error, [class*='error']")].filter(visible).map((e) => e.innerText.trim()).filter(Boolean)[0];
      if (err && i > 4) return { status: "needs_you", note: `The form reported: ${err.slice(0, 200)}` };
    }
    return { status: "needs_you", note: "Submitted, but no confirmation appeared. Check this tab." };
  }

  window.__jobifyFill = async (task, pdfB64, testMode) => {
    try {
      const bytes = Uint8Array.from(atob(pdfB64), (c) => c.charCodeAt(0));
      const pdf = new File([bytes], task.resumeFileName || "Resume.pdf", { type: "application/pdf" });

      // Some pages show an "Apply" button before the form.
      if (!document.querySelector("form input, form textarea")) {
        const apply = [...document.querySelectorAll("a, button")].find((b) => visible(b) && /^\s*apply( for this job| now)?\s*$/i.test(b.innerText));
        if (apply) { apply.click(); await sleep(3000); }
      }

      const notFilled = [];
      for (const field of task.fields) {
        const el = findControl(field);
        const ok = await fillField(field, el, pdf).catch(() => false);
        if (!ok && field.required) notFilled.push(field.label);
        await sleep(80);
      }
      fillAliases(task);
      await sleep(400);

      if (hasCaptcha()) return { status: "needs_you", note: "This form has a CAPTCHA. Junu filled it in; please finish and submit it in the open tab." };
      const empty = [...new Set([...emptyRequired(), ...notFilled])];
      if (empty.length) return { status: "needs_you", note: `Couldn't fill: ${empty.slice(0, 6).join("; ")}. The form is open for you to finish.` };
      if (testMode) return { status: "needs_you", note: "Test mode: filled everything but didn't submit. Review the open tab." };

      const btn = submitButton();
      if (!btn) return { status: "needs_you", note: "Couldn't find the submit button. The filled form is open for you." };
      const start = location.href;
      btn.click();
      return await waitForResult(start);
    } catch (e) {
      return { status: "failed", note: `Error while filling: ${String(e && e.message || e).slice(0, 200)}` };
    }
  };
})();
