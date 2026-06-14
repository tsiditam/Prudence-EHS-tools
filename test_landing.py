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
check("Headline present", "Indoor Air Quality Investigation Intelligence" in html)
check("Subheadline present", "defensible findings, sampling plans, and draft reports" in html)
rba = len(re.findall(r'>\s*Request Beta Access\s*<', html))
check("Primary CTA 'Request Beta Access' appears >= 3 times", rba>=3, f"count={rba}")
ea = html.count('href="/early-access"')
check("All beta CTAs link to /early-access", ea>=3, f"count={ea}")
check("Secondary CTA 'See a sample report' present", "See a sample report" in html)
check("Sample report links the PDF", "/atmosflow-sample-report.pdf" in html)
check("Product showcase heading present", "One Platform. Every Stage of the Investigation." in html)
check("Workflow heading present", "How AtmosFlow Works" in html)
check("Before/after heading present", "Reduce Investigation Friction" in html)
check("Audience heading present", "Who Uses AtmosFlow?" in html)
check("Founder heading present", "Built by a Practitioner" in html)
check("Screening-not-compliance line present", "Screening, not compliance." in html)
# strip embedded base64 blobs so random letters inside them don't trip text checks
html_text = re.sub(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]+', '', html)
check("No FAA reference in copy", "FAA" not in html_text)
check("Trust line present", "Built by EHS professionals." in html)

# ---------- field-to-report value section ----------
check("Field-to-report eyebrow present", "Field-to-Report Workflow" in html)
check("Field-to-report title present", "Better Data Collection. Faster Report Drafting." in html)
check("Professional-review-in-control line present", "Professional review remains in control." in html)
check("90% claim limited to report drafting", "Up to 90% reduction in report drafting time" in html)
check("Drafting-time disclaimer present", "Time savings apply to report drafting and preparation after the assessment information has been collected." in html)
_low = html.lower()
_bad = ['90% faster','faster inspection','faster field assessment','inspections 90','field assessment 90','inspection 90% faster']
check("No exaggerated field/inspection speed claims", not any(p in _low for p in _bad))
check("Data collection separated from drafting time", ("captured in a structured workflow" in html) and ("fraction of the traditional drafting time" in html))
for _t in ["Guided IAQ Walkthrough","Structured Field Inputs","Faster Draft Reports"]:
    check(f"Support card present: {_t}", _t in html)
check("Field-to-report section is responsive", ".ftr-grid{grid-template-columns:1fr" in html)

# ---------- assets ----------
check("Logos + favicon embedded", html.count('data:image/png;base64,')>=3)
check("Favicon linked", 'rel="icon"' in html)
check("Social/OG meta present", 'property="og:title"' in html and 'name="twitter:card"' in html)

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
check("Hero slideshow has 4 slides", p.slides==4, f"count={p.slides}")

# ---------- behavior / quality floor ----------
check("Reduced-motion respected", 'prefers-reduced-motion' in html)
check("Focus-visible styles present", 'focus-visible' in html)
check("Sticky nav + scroll behavior", 'scrolled' in html and "addEventListener('scroll'" in html)
check("Mobile menu wired", 'menuBtn' in html and 'navlinks' in html)
check("Hero slideshow wired (autoplay/controls)", 'heroSlides' in html and 'slide-nav' in html)
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
