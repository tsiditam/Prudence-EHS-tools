#!/usr/bin/env python3
"""
AtmosFlow landing page (v2) acceptance tests.
Static + DOM-level checks. No browser required.
Run: python3 test_landing.py
Exit 0 = all pass.
"""
import os, re, sys
from html.parser import HTMLParser

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atmosflow-landing.html")
html = open(PATH, encoding="utf-8").read()

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

# ---------- contrast ----------
def lum(hexv):
    hexv = hexv.lstrip('#')
    r,g,b = [int(hexv[i:i+2],16)/255 for i in (0,2,4)]
    f = lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    R,G,B = f(r),f(g),f(b)
    return 0.2126*R+0.7152*G+0.0722*B
def ratio(a,b):
    L1,L2 = lum(a),lum(b); hi,lo = max(L1,L2),min(L1,L2)
    return (hi+0.05)/(lo+0.05)

check("Primary button: navy text on cyan >= 4.5", ratio('#0B1220','#22D3EE')>=4.5, f"{ratio('#0B1220','#22D3EE'):.2f}")
check("Body slate on white >= 4.5", ratio('#515C6B','#FFFFFF')>=4.5, f"{ratio('#515C6B','#FFFFFF'):.2f}")
check("Body slate on mist panel >= 4.5", ratio('#515C6B','#F7F8FA')>=4.5, f"{ratio('#515C6B','#F7F8FA'):.2f}")
check("Ink on white >= 4.5", ratio('#0B1220','#FFFFFF')>=4.5, f"{ratio('#0B1220','#FFFFFF'):.2f}")
check("Teal label on white >= 4.5", ratio('#0E7490','#FFFFFF')>=4.5, f"{ratio('#0E7490','#FFFFFF'):.2f}")
check("Light eyebrow on ink section >= 4.5", ratio('#7FE3FF','#0B1220')>=4.5, f"{ratio('#7FE3FF','#0B1220'):.2f}")
check("Footer link on ink >= 4.5", ratio('#C4CCD6','#0B1220')>=4.5, f"{ratio('#C4CCD6','#0B1220'):.2f}")
# guard: white text must NOT sit on cyan anywhere (would fail)
check("No white-on-cyan button (would fail contrast)", ratio('#FFFFFF','#22D3EE')<4.5, "guard")

# ---------- typography ----------
check("No mono font family referenced", ('jetbrains' not in html.lower()) and ('monospace' not in html.lower()))
check("Inter is loaded", 'family=Inter' in html)
check("OpenType features set (cv11/ss03/tnum)", all(t in html for t in ['cv11','ss03','tnum']))

# ---------- copy / positioning ----------
check("No em dash anywhere", '—' not in html, "U+2014")
check("Brand + category present in title/meta", "Indoor Air Quality Investigation Intelligence" in html)
check("Hero headline leads with the outcome", ("From field data to a defensible IAQ draft report" in html) and ('<span class="accent">in minutes</span>.' in html))
check("Exactly one outcome <h1> with cyan-accented 'in minutes'", '<h1>From field data to a defensible IAQ draft report <span class="accent">in minutes</span>.</h1>' in html)
check("Subheadline present", "findings, sampling plans, and draft reports" in html)
rba = len(re.findall(r'>\s*Request Beta Access\s*<', html))
check("Primary CTA 'Request Beta Access' appears >= 3 times", rba>=3, f"count={rba}")
ea = html.count('href="/early-access"')
check("All beta CTAs link to /early-access", ea>=3, f"count={ea}")
check("Secondary CTA 'See a sample report' present", "See a sample report" in html)
check("Sample report links the PDF", "/atmosflow-sample-report.pdf" in html)
check("Product showcase heading present", "See AtmosFlow in action." in html)
check("Demo video embedded (self-hosted mp4)", ('src="/atmosflow-demo.mp4"' in html) and ('<video' in html))
check("Demo video autoplays muted, loops, inline", 'autoplay muted loop playsinline' in html)
check("Demo video has accessible label + fallback link", ('aria-label="Screen recording' in html) and ('Watch the AtmosFlow demo' in html))
check("Demo video respects reduced motion", 'removeAttribute("autoplay")' in html)
check("Demo video has an iPhone-style device skin on a gradient stage", all(c in html for c in ['class="demo-stage"','class="device"','class="frame"','class="screen"','class="island"']))
check("Workflow heading present", "How AtmosFlow Works" in html)
check("Before/after heading present", "Reduce Investigation Friction" in html)
check("Audience heading present", "Who Uses AtmosFlow?" in html)
check("Founder heading present", "A Note from the Founder" in html)
check("Founder circular photo present", ('class="founder-photo"' in html) and ('/founder-tsidi.jpg' in html))
# strip embedded base64 blobs so random letters inside them don't trip text checks
html_text = re.sub(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+', '', html)
check("No FAA reference in copy", "FAA" not in html_text)
check("Hero social proof: experience-led trust line (not credential bragging)", ("Built by an EHS professional" in html) and ("13+ years of experience" in html) and ("Certified Safety Professional" not in html) and ("BCSP" not in html))
check("Hero CTA hierarchy: one primary button + quiet secondary link", ('class="link-cta"' in html) and (html.count('class="btn btn-ghost"')==1))
check("Standards badges surfaced near the hero", 'class="hero-std"' in html and "Built on the standards you cite" in html)

# ---------- field-to-report value section ----------
check("Field-to-report eyebrow present", "Field-to-Report Workflow" in html)
check("Field-to-report title present", "Guided Assessment. Draft Reports in Minutes." in html)
check("Professional-review-in-control line present", "Professional review remains in control." in html)
check("No '90%' claim anywhere on the page", "90%" not in html)
check("No '1 Hour' / '10 Hours' numeric claim", ("1 Hour" not in html) and ("10 Hours" not in html))
check("Drafting-time disclaimer present", "Time savings apply to report drafting and preparation after assessment information has been collected." in html)
_low = html.lower()
# Guard: no claim that the FIELD inspection/assessment/investigation is faster.
# "90% faster report drafting" is allowed (drafting is the established claim);
# a bare "90% faster" tied to inspections/field work is not.
_bad = ['faster inspection','faster investigation','faster field','faster field assessment',
        'inspections 90','field assessment 90','inspection 90% faster','90% faster inspection']
check("No exaggerated field/inspection speed claims", not any(p in _low for p in _bad))
check("Data collection separated from drafting time", ("captured in a structured workflow" in html) and ("a structured draft report in minutes" in html))
check("Field-to-report is payoff-only (pipeline-retelling cards removed)", '<div class="ftr-cards">' not in html)
check("Field-to-report section is responsive", ".ftr-grid{grid-template-columns:1fr" in html)
check("Metric card premium styling (32px radius, soft shadow)", '.metric-card{background:#FFFFFF;border:1px solid rgba(15,23,42,.06);border-radius:32px' in html)
check("Metric bars animate from data-fill (full vs short)", ('data-fill="100"' in html) and ('data-fill="14"' in html))
check("Metric uses Hours vs Minutes, no numeric counters", ('data-count' not in html) and ('Hours of manual drafting' in html))
check("AtmosFlow outcome is the prominent 'Draft Report in Minutes'", "Draft Report<br>in Minutes" in html)
check("Metric badge reinforces a structured draft", "Structured draft reports in minutes" in html)
check("Metric bar labels cleaned up (no small Hours/Minutes foot labels)", 'bar-foot' not in html)
check("Metric animates once on scroll (IntersectionObserver)", "getElementById('draftMetric')" in html)
check("AtmosFlow bar gradient + premium badge gradient", ('linear-gradient(90deg,#22D3EE,#67E8F9)' in html) and ('linear-gradient(90deg,rgba(34,211,238,.12),rgba(34,211,238,.05))' in html))
check("Traditional bar crawls slowly to imply a slow workflow", '.metric-bar.trad .bar-fill{background:#CBD5E1;transition:width 10000ms linear}' in html)
check("Metric one-time glow + reduced-motion guard", ('@keyframes afGlowIn' in html) and ("matchMedia('(prefers-reduced-motion: reduce)')" in html))

# ---------- premium icon system (Lucide, monochromatic + cyan accent) ----------
check("Premium icon containers (white/cyan gradient)", "linear-gradient(180deg,#FFFFFF,#F7FBFF)" in html)
check("Icon containers have cyan-tinted border", "rgba(34,211,238,.18)" in html)
check("Thin-line (1.75) navy icons", html.count('stroke-width="1.75"')>=10 and 'stroke="#0B1220"' in html)
check("Cyan accent elements on icons", html.count('stroke="#22D3EE"')>=10)
check("No leftover emoji feature icons", not any(e in html for e in ['📊','🔍','📁','📄','🛡️','🏢']))
check("Before/After rows use distinct Lucide icons, not generic X/check", ('M18 6L6 18M6 6l12 12' not in html) and ('M4 14a1 1 0 0 1-.78-1.63' in html) and ('M8 13h2' in html))
check("Before/After uses upgraded icons (chart-column, notebook-pen, clock-3)", all(p in html for p in ['M18 17V9','M21.378 5.626','M12 6v6h4']))
check("Before/After says 'Faster report drafting' (no 90%, no field-speed)", ("Faster report drafting" in html) and ("Faster investigations" not in html) and ("Up to 90% Faster Report Drafting" not in html))
check("Before/After markers are 48px gradient chips", '.mk{flex:0 0 auto;width:48px' in html and '.mk.no{background:linear-gradient(180deg,#FFFFFF,#F7FBFF)' in html)

# ---------- "How AtmosFlow Works" workflow ----------
check("Workflow subtitle present", "Guide assessments, analyze data, generate findings, and draft reports from a single investigation workspace." in html)
check("Workflow has the updated step content", all(t in html for t in ["Complete Guided Assessment","Import &amp; Analyze Data","Generate Findings","Build Causal Pathways","Draft Report in Minutes"]))
check("Workflow steps have icon containers + one-line descriptions", html.count('class="fs-ico"')==6 and html.count('class="fs-desc"')==6)
check("Workflow uses Lucide icons (folder-open present)", 'm6 14 1.5-2.9' in html)
check("Workflow animates once (staggered .flow.run + connector nodes)", ('.flow.run .flow-step' in html) and ('.flow-conn::after' in html) and ("classList.add('run')" in html))
check("Workflow final step emphasized", ('class="flow-step final"' in html) and ('.flow-step.final' in html))
check("Workflow has a looping current that lights the final card", all(k in html for k in ['@keyframes currentFlow','@keyframes cardGlow','.flow.run .flow-conn::before{animation:currentFlow','.flow.run .flow-step.final{animation:cardGlow']))
check("Workflow final card links to the sample report", '<a class="flow-link" href="/atmosflow-sample-report.pdf"' in html)
check("Workflow steps 1-6 have product thumbnails (lazy)", html.count('class="fs-thumb"')==6 and html.count('loading="lazy"')>=6 and ("/ss-guided-assessment.png" in html) and ("/ss-report.jpeg" in html))

# ---------- assets ----------
check("Favicon embedded (base64)", html.count('data:image/png;base64,')>=1)
check("Wordmark logos are transparent SVG (no white box, no tagline)", html.count('/icons/atmosflow-wordmark')>=2)
check("Favicon linked", 'rel="icon"' in html)
check("Social/OG meta present", 'property="og:title"' in html and 'name="twitter:card"' in html)
check("OG image + twitter image present for rich link previews", ('property="og:image"' in html) and ('name="twitter:image"' in html) and ('/ss-report.jpeg' in html))

# ---------- trust / standards zone ----------
check("Trust section present", 'id="trust"' in html and "Built on the standards you already cite." in html)
check("Standards strip cites the referenced frameworks", all(s in html for s in ['ASHRAE 62.1','ASHRAE 55','NIOSH RELs','US EPA','>WHO<']))
check("Data/defensibility reassurance present (WHY merged in)", all(t in html for t in ['Your data stays yours','Deterministic first, AI second','You own every conclusion']))
check("WHY section merged into TRUST (no standalone duplicate)", ('id="why"' not in html) and ('Defensible by design.' not in html))
check("Sample report featured prominently in trust band", "See exactly what AtmosFlow produces." in html)
check("Logger compatibility line present", "Works with CSV and XLSX exports from common IAQ data loggers." in html)

# ---------- FAQ ----------
check("FAQ section present", 'id="faq"' in html and "Common questions" in html)
check("FAQ uses native details/summary accordion", html.count('<details>')>=5 and html.count('<summary>')>=5)
check("FAQ covers the screening-only positioning", "Is AtmosFlow a compliance or regulatory tool?" in html)
check("FAQ does not over-claim compliance", "AtmosFlow is a screening and reporting workspace." in html)

# ---------- founder credential + pricing signal ----------
check("Founder note present and signed", ("Tsidi Tamakloe" in html) and ("Founder, AtmosFlow" in html) and ("Help the professionals who protect people" in html))
check("Pricing signal present (founding-member)", "Founding-member pricing" in html and "founding-member pricing at launch" in html)

# ---------- structure / DOM ----------
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.h1=0; s.ids=set(); s.anchors=[]
        s.inputs=0; s.selects=0; s.imgs_no_alt=0
        s.slides=0; s.viewport=False; s.menu_aria=False
    def handle_starttag(s, tag, attrs):
        d=dict(attrs)
        if tag=='h1': s.h1+=1
        if 'id' in d: s.ids.add(d['id'])
        if tag=='a' and d.get('href','').startswith('#') and d['href']!='#': s.anchors.append(d['href'][1:])
        if tag=='input': s.inputs+=1
        if tag=='select': s.selects+=1
        if tag=='img' and not d.get('alt'): s.imgs_no_alt+=1
        if tag=='img' and 'slide' in d.get('class',''): s.slides+=1
        if tag=='button' and d.get('id')=='menuBtn' and 'aria-expanded' in d: s.menu_aria=True
        if tag=='meta' and d.get('name')=='viewport': s.viewport=True
p=P(); p.feed(html)

check("Exactly one <h1>", p.h1==1, f"count={p.h1}")
check("Viewport meta present", p.viewport)
check("All images have alt text", p.imgs_no_alt==0, f"missing={p.imgs_no_alt}")
missing=[a for a in p.anchors if a not in p.ids]
check("All in-page anchors resolve to an id", not missing, f"missing={missing}")
check("Inline beta form removed (CTAs route to /early-access)", 'id="betaForm"' not in html)
check("Mobile menu button exposes aria-expanded", p.menu_aria)

# ---------- behavior / quality floor ----------
check("Reduced-motion respected", 'prefers-reduced-motion' in html)
check("Focus-visible styles present", 'focus-visible' in html)
check("Sticky nav + scroll behavior", 'scrolled' in html and "addEventListener('scroll'" in html)
check("Mobile menu wired", 'menuBtn' in html and 'navlinks' in html)
check("Hero is single-column (no mockup slideshow)", ('heroSlides' not in html) and ('hero-grid{max-width:760px;margin:0 auto;text-align:center' in html))
check("Mobile menu is a frosted drawer panel", all(x in html for x in ['border-radius:0 0 28px 28px','rgba(255,255,255,0.86)','backdrop-filter:blur(18px)']))
check("Hamburger morphs to X", 'aria-expanded="true"] span:nth-child(1)' in html)
check("Drawer has in-menu CTA + sample report", 'class="drawer-cta"' in html)
check("Mobile menu has overlay/backdrop", 'id="navOverlay"' in html)
check("Menu closes on Escape + locks body scroll", ("e.key==='Escape'" in html) and ('document.body.style.overflow' in html))
check("Scroll reveal wired", 'IntersectionObserver' in html and "classList.add('in')" in html)

# ---------- report ----------
passed=sum(1 for _,ok,_ in results if ok)
total=len(results)
print("="*64)
print(f"AtmosFlow landing page v2 acceptance suite  ({passed}/{total} passed)")
print("="*64)
for name,ok,detail in results:
    mark="PASS" if ok else "FAIL"
    extra=f"  [{detail}]" if detail else ""
    print(f"  {mark}  {name}{extra}")
print("="*64)
sys.exit(0 if passed==total else 1)
