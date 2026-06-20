/*!
 * AtmosFlowMarketingAgent — embedded marketing conversion agent for the
 * AtmosFlow landing page. Self-contained vanilla JS + injected CSS, no deps.
 *
 * Drop-in:  <script defer src="/marketing-agent.js"></script>
 *
 * Design notes / safeguards:
 *  - The conversation is a DETERMINISTIC scripted flow (quick replies only, no
 *    free-text Q&A, no LLM). By construction the agent cannot give medical,
 *    legal, or compliance determinations and never claims AtmosFlow replaces a
 *    CIH or professional judgment. It only ever positions AtmosFlow as a
 *    screening + reporting acceleration tool that requires professional review.
 *  - Non-intrusive: the button reveals only after 30s OR 40% scroll (never opens
 *    on load), and the widget remembers when it's been completed/dismissed.
 *  - Honors prefers-reduced-motion. Mobile-friendly (full-width panel + safe area).
 */
(function () {
  'use strict';
  if (window.__atmosflowMarketingAgent) return;
  window.__atmosflowMarketingAgent = true;

  var ENDPOINT = '/api/marketing-agent/chat';
  var SAMPLE_REPORT = '/atmosflow-sample-report.pdf';
  var BETA_URL = '/early-access';
  var DONE_KEY = 'af_ma_done';
  var DISMISS_KEY = 'af_ma_dismissed';

  // Don't bother returning visitors who already converted or dismissed it.
  try {
    if (localStorage.getItem(DONE_KEY)) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
  } catch (e) { /* storage blocked — proceed */ }

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SID = (function () {
    try {
      var k = 'af_ma_sid', v = sessionStorage.getItem(k);
      if (!v) { v = 'ma_' + Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'ma_' + Date.now().toString(36); }
  })();

  var answers = {};       // role, reportsMethod, usesLoggerData, biggestPain, wantsBeta
  var transcript = [];    // [{from, text}]
  var opened = false;
  var qualifiedFired = false;

  /* ---------------------------- analytics ---------------------------- */
  function track(name, props) {
    props = props || {};
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: 'af_' + name }, props));
      if (typeof window.gtag === 'function') window.gtag('event', name, props);
      if (typeof window.plausible === 'function') window.plausible(name, { props: props });
      window.dispatchEvent(new CustomEvent('atmosflow:' + name, { detail: props }));
    } catch (e) { /* never let analytics break the widget */ }
    post({ action: 'event', name: name, sessionId: SID, props: props });
  }

  function post(payload) {
    try {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (e) { return Promise.resolve(); }
  }

  /* ------------------------------ styles ----------------------------- */
  var css = '' +
    '.afma-btn{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:inline-flex;align-items:center;gap:9px;max-width:78vw;padding:12px 16px;border:1px solid rgba(34,211,238,.35);border-radius:999px;background:#0B1220;color:#fff;font:600 14px/1.2 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 10px 28px -12px rgba(11,18,32,.55);opacity:0;transform:translateY(10px);transition:opacity .35s ease,transform .35s ease,box-shadow .2s ease}' +
    '.afma-btn.afma-show{opacity:1;transform:none}' +
    '.afma-btn:hover{box-shadow:0 14px 32px -12px rgba(34,211,238,.6)}' +
    '.afma-btn .afma-dot{width:9px;height:9px;border-radius:50%;background:#22D3EE;flex:0 0 auto;box-shadow:0 0 0 4px rgba(34,211,238,.18)}' +
    '.afma-btn.afma-pulse .afma-dot{animation:afma-pulse 1.6s ease-out 3}' +
    '@keyframes afma-pulse{0%{box-shadow:0 0 0 0 rgba(34,211,238,.5)}100%{box-shadow:0 0 0 12px rgba(34,211,238,0)}}' +
    '.afma-panel{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:2147483001;width:370px;max-width:calc(100vw - 28px);height:560px;max-height:calc(100vh - 110px);display:none;flex-direction:column;background:#fff;border:1px solid #E6EBEF;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(11,18,32,.45);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.afma-panel.afma-open{display:flex;animation:afma-in .26s cubic-bezier(.16,1,.3,1)}' +
    '@keyframes afma-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '.afma-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#0B1220;color:#fff}' +
    '.afma-head .afma-h-dot{width:9px;height:9px;border-radius:50%;background:#22D3EE;box-shadow:0 0 0 4px rgba(34,211,238,.18)}' +
    '.afma-head b{font-size:14px;font-weight:700;letter-spacing:-.01em}' +
    '.afma-head .afma-sub{font-size:11px;color:#9FB0C2}' +
    '.afma-x{margin-left:auto;background:none;border:none;color:#9FB0C2;font-size:20px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}' +
    '.afma-x:hover{color:#fff;background:rgba(255,255,255,.08)}' +
    '.afma-log{flex:1 1 auto;overflow-y:auto;padding:16px;background:#F7F8FA;display:flex;flex-direction:column;gap:10px}' +
    '.afma-row{display:flex;max-width:100%}' +
    '.afma-row.bot{justify-content:flex-start}.afma-row.user{justify-content:flex-end}' +
    '.afma-bubble{max-width:84%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap}' +
    '.afma-row.bot .afma-bubble{background:#fff;color:#0B1220;border:1px solid #E6EBEF;border-bottom-left-radius:5px}' +
    '.afma-row.user .afma-bubble{background:#22D3EE;color:#0B1220;font-weight:600;border-bottom-right-radius:5px}' +
    '.afma-qr{display:flex;flex-wrap:wrap;gap:7px;padding:2px 2px 4px}' +
    '.afma-qr button{font:600 12.5px/1.1 inherit;color:#0E7490;background:#EAF9FF;border:1px solid rgba(34,211,238,.35);border-radius:999px;padding:8px 12px;cursor:pointer;transition:background .15s ease}' +
    '.afma-qr button:hover{background:#d6f4ff}' +
    '.afma-form{display:flex;flex-direction:column;gap:9px;background:#fff;border:1px solid #E6EBEF;border-radius:14px;padding:13px}' +
    '.afma-form label{font-size:11px;font-weight:600;color:#515C6B;display:block;margin-bottom:3px}' +
    '.afma-form input,.afma-form select{width:100%;font:400 14px/1.2 inherit;color:#0B1220;background:#F7F8FA;border:1px solid #E6EBEF;border-radius:9px;padding:10px 11px;box-sizing:border-box;outline:none}' +
    '.afma-form input:focus,.afma-form select:focus{border-color:#22D3EE;background:#fff}' +
    '.afma-form .afma-err{font-size:11.5px;color:#DC2626;min-height:0}' +
    '.afma-submit{width:100%;font:700 14px/1 inherit;color:#0B1220;background:#22D3EE;border:none;border-radius:11px;padding:13px;cursor:pointer;min-height:46px}' +
    '.afma-submit:disabled{opacity:.6;cursor:default}' +
    '.afma-foot{flex:0 0 auto;padding:9px 14px;background:#fff;border-top:1px solid #E6EBEF;font-size:10.5px;line-height:1.4;color:#8A97A6;text-align:center}' +
    '@media (max-width:520px){.afma-panel{right:8px;left:8px;width:auto;bottom:8px;height:auto;max-height:84vh}.afma-btn{right:12px}}' +
    '@media (prefers-reduced-motion:reduce){.afma-btn,.afma-panel.afma-open{transition:none;animation:none}.afma-btn.afma-pulse .afma-dot{animation:none}}';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ------------------------------- DOM ------------------------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var btn = el('button', 'afma-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'See how AtmosFlow fits your workflow');
  btn.appendChild(el('span', 'afma-dot'));
  btn.appendChild(el('span', null, 'See how AtmosFlow fits your workflow'));

  var panel = el('div', 'afma-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AtmosFlow assistant');

  var head = el('div', 'afma-head');
  head.appendChild(el('span', 'afma-h-dot'));
  var headText = el('div');
  headText.appendChild(el('b', null, 'AtmosFlow'));
  headText.appendChild(el('div', 'afma-sub', 'Workflow fit assistant'));
  head.appendChild(headText);
  var xBtn = el('button', 'afma-x', '×');
  xBtn.type = 'button';
  xBtn.setAttribute('aria-label', 'Close');
  head.appendChild(xBtn);

  var log = el('div', 'afma-log');
  var foot = el('div', 'afma-foot',
    'AtmosFlow is a screening & reporting tool that accelerates report drafting. ' +
    'It supports — and never replaces — professional review. Not medical, legal, or compliance advice.');

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(foot);

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  /* ---------------------------- chat helpers ------------------------- */
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function addBubble(from, text) {
    var row = el('div', 'afma-row ' + from);
    row.appendChild(el('div', 'afma-bubble', text));
    log.appendChild(row);
    transcript.push({ from: from, text: text });
    scrollDown();
  }

  function botSay(text, cb) {
    if (prefersReduced) { addBubble('bot', text); if (cb) cb(); return; }
    var row = el('div', 'afma-row bot');
    var b = el('div', 'afma-bubble', '…');
    row.appendChild(b); log.appendChild(row); scrollDown();
    setTimeout(function () {
      b.textContent = text;
      transcript.push({ from: 'bot', text: text });
      scrollDown();
      if (cb) cb();
    }, Math.min(650, 240 + text.length * 12));
  }

  function quickReplies(options, onPick) {
    var wrap = el('div', 'afma-qr');
    options.forEach(function (opt) {
      var b = el('button', null, opt.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        wrap.remove();
        addBubble('user', opt.label);
        onPick(opt);
      });
      wrap.appendChild(b);
    });
    log.appendChild(wrap);
    scrollDown();
  }

  /* ------------------------------ flow ------------------------------- */
  function start() {
    botSay(
      'Hi, I can help you see if AtmosFlow fits your IAQ workflow. Are you an IH consultant, EHS manager, facilities lead, school administrator, or just exploring?',
      askRole
    );
  }

  function askRole() {
    quickReplies([
      { label: 'IH consultant', v: 'IH consultant' },
      { label: 'EHS manager', v: 'EHS manager' },
      { label: 'Facilities lead', v: 'Facilities lead' },
      { label: 'School administrator', v: 'School administrator' },
      { label: 'Just exploring', v: 'Just exploring' },
    ], function (o) {
      answers.role = o.v;
      if (!qualifiedFired) { qualifiedFired = true; track('visitor_qualified', { role: o.v }); }
      botSay('Got it. How do you handle IAQ reports today?', askMethod);
    });
  }

  function askMethod() {
    quickReplies([
      { label: 'By hand in Word/Excel', v: 'Manual (Word/Excel)' },
      { label: 'From templates', v: 'Templates' },
      { label: 'Outside consultant', v: 'Outside consultant' },
      { label: 'Other', v: 'Other' },
    ], function (o) {
      answers.reportsMethod = o.v;
      botSay('Do you work with data-logger files (CSV / XLSX)?', askLogger);
    });
  }

  function askLogger() {
    quickReplies([
      { label: 'Yes', v: 'Yes' },
      { label: 'Sometimes', v: 'Sometimes' },
      { label: 'No', v: 'No' },
    ], function (o) {
      answers.usesLoggerData = o.v;
      botSay("What's the biggest pain in your reporting right now?", askPain);
    });
  }

  function askPain() {
    quickReplies([
      { label: 'Time it takes', v: 'Time' },
      { label: 'Consistency', v: 'Consistency' },
      { label: 'Formatting', v: 'Formatting' },
      { label: 'Data analysis', v: 'Data analysis' },
      { label: 'Other', v: 'Other' },
    ], function (o) {
      answers.biggestPain = o.v;
      botSay(
        'That’s exactly where AtmosFlow helps — it organizes your data and drafts a structured, professional report in minutes, so you spend your time on judgment, not formatting. Want early access?',
        askBeta
      );
    });
  }

  function askBeta() {
    quickReplies([
      { label: 'Yes, sign me up', v: 'Yes' },
      { label: 'Maybe later', v: 'Maybe later' },
      { label: 'Just browsing', v: 'Just browsing' },
    ], function (o) {
      answers.wantsBeta = o.v;
      if (o.v === 'Yes') {
        track('beta_signup_started', { role: answers.role });
        botSay('Great — a few quick details and the team will be in touch.', function () { showForm('beta'); });
      } else {
        botSay('No problem. Whenever you’re ready, I can set you up with beta access or a quick demo.', closing);
      }
    });
  }

  function closing() {
    quickReplies([
      { label: 'Request beta access', v: 'beta' },
      { label: 'Book a demo', v: 'demo' },
      { label: 'See a sample report', v: 'sample' },
    ], function (o) {
      if (o.v === 'sample') {
        try { window.open(SAMPLE_REPORT, '_blank', 'noopener'); } catch (e) { /* ignore */ }
        botSay('Opened a complete sample report in a new tab. Want beta access or a demo when you’re ready?', closing);
        return;
      }
      if (o.v === 'demo') { track('demo_requested', { role: answers.role }); botSay('Happy to set up a quick walkthrough. A few details:', function () { showForm('demo'); }); return; }
      track('beta_signup_started', { role: answers.role });
      botSay('A few quick details and the team will be in touch.', function () { showForm('beta'); });
    });
  }

  /* ---------------------------- lead form ---------------------------- */
  function showForm(kind) {
    var form = el('form', 'afma-form');
    form.setAttribute('novalidate', 'novalidate');

    function field(label, name, type, value) {
      var wrap = el('div');
      wrap.appendChild(el('label', null, label));
      var input = el('input');
      input.type = type || 'text';
      input.name = name;
      if (value) input.value = value;
      input.autocomplete = name === 'email' ? 'email' : (name === 'name' ? 'name' : (name === 'company' ? 'organization' : 'off'));
      wrap.appendChild(input);
      form.appendChild(wrap);
      return input;
    }

    var nameI = field('Full name', 'name', 'text');
    var emailI = field('Work email', 'email', 'email');
    var companyI = field('Company / organization', 'company', 'text');
    var roleI = field('Role', 'role', 'text', answers.role || '');

    var ucWrap = el('div');
    ucWrap.appendChild(el('label', null, 'Interested use case'));
    var uc = el('select');
    uc.name = 'useCase';
    [
      kind === 'demo' ? 'Product demo / walkthrough' : 'Faster report drafting',
      'Faster report drafting',
      'Logger data analysis',
      'Standardizing reports',
      'Team / multi-site rollout',
      'Just exploring',
    ].filter(function (v, i, a) { return a.indexOf(v) === i; })
      .forEach(function (v) { var o = el('option', null, v); o.value = v; uc.appendChild(o); });
    ucWrap.appendChild(uc);
    form.appendChild(ucWrap);

    var err = el('div', 'afma-err');
    form.appendChild(err);
    var submit = el('button', 'afma-submit', kind === 'demo' ? 'Request demo' : 'Request beta access');
    submit.type = 'submit';
    form.appendChild(submit);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lead = {
        name: nameI.value.trim(),
        email: emailI.value.trim(),
        company: companyI.value.trim(),
        role: roleI.value.trim(),
        useCase: uc.value,
      };
      if (!lead.name) { err.textContent = 'Please add your name.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) { err.textContent = 'Please add a valid work email.'; return; }
      err.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Sending…';
      post({ action: 'lead', sessionId: SID, answers: answers, lead: lead, transcript: transcript })
        .then(function (r) { return r && r.json ? r.json().catch(function () { return {}; }) : {}; })
        .then(function () {
          try { localStorage.setItem(DONE_KEY, '1'); } catch (e2) { /* ignore */ }
          if (kind === 'demo') track('demo_requested', { completed: true });
          track('beta_signup_completed', { kind: kind, role: answers.role });
          form.remove();
          botSay('You’re on the list — we’ll be in touch within 48 hours. Thanks for helping shape AtmosFlow.');
        })
        .catch(function () {
          submit.disabled = false;
          submit.textContent = kind === 'demo' ? 'Request demo' : 'Request beta access';
          err.textContent = 'Something went wrong. Please try again or email tsidi@prudenceehs.com.';
        });
    });

    log.appendChild(form);
    scrollDown();
    setTimeout(function () { try { nameI.focus(); } catch (e) { /* ignore */ } }, 50);
  }

  /* --------------------------- open / close -------------------------- */
  function openPanel() {
    panel.classList.add('afma-open');
    btn.style.display = 'none';
    if (!opened) {
      opened = true;
      track('widget_opened', {});
      start();
    }
  }
  function closePanel() {
    panel.classList.remove('afma-open');
    btn.style.display = '';
  }

  btn.addEventListener('click', openPanel);
  xBtn.addEventListener('click', function () {
    closePanel();
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* ignore */ }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('afma-open')) closePanel();
  });

  /* ------------------------------ trigger ---------------------------- */
  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    btn.classList.add('afma-show');
    if (!prefersReduced) btn.classList.add('afma-pulse');
    cleanupTriggers();
  }
  var timer = setTimeout(reveal, 30000); // 30s
  function onScroll() {
    var st = window.pageYOffset || document.documentElement.scrollTop || 0;
    var h = (document.documentElement.scrollHeight - window.innerHeight) || 1;
    if (st / h >= 0.4) reveal(); // 40% down
  }
  function cleanupTriggers() {
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
