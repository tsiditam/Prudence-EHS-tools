#!/usr/bin/env python3
"""
AtmosFlow landing page acceptance tests.
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

check("Primary button: navy text on cyan >= 4.5", ratio('#0B1220','#06B6D4')>=4.5, f"{ratio('#0B1220','#06B6D4'):.2f}")
check("Body slate on white >= 4.5", ratio('#515C6B','#FFFFFF')>=4.5, f"{ratio('#515C6B','#FFFFFF'):.2f}")
check("Body slate on mist panel >= 4.5", ratio('#515C6B','#F5F8FA')>=4.5, f"{ratio('#515C6B','#F5F8FA'):.2f}")
check("Ink on white >= 4.5", ratio('#0B1220','#FFFFFF')>=4.5, f"{ratio('#0B1220','#FFFFFF'):.2f}")
check("Teal label on white >= 4.5", ratio('#0E7490','#FFFFFF')>=4.5, f"{ratio('#0E7490','#FFFFFF'):.2f}")
check("Footer muted on ink >= 4.5", ratio('#C4CCD6','#0B1220')>=4.5, f"{ratio('#C4CCD6','#0B1220'):.2f}")
# guard: white text must NOT sit on cyan anywhere (would fail)
check("No white-on-cyan button (would fail contrast)", ratio('#FFFFFF','#06B6D4')<4.5, "guard")

# ---------- typography ----------
check("No mono font family referenced", ('jetbrains' not in html.lower()) and ('monospace' not in html.lower()))
check("Inter is loaded", 'family=Inter' in html)
check("OpenType features set (cv11/ss03/tnum)", all(t in html for t in ['cv11','ss03','tnum']))

# ---------- copy discipline ----------
check("No em dash anywhere", '—' not in html, "U+2014")
primary = len(re.findall(r'>\s*Join the Beta\s*<', html))
check("Primary CTA 'Join the Beta' appears >= 3 times", primary>=3, f"count={primary}")
banned = [b for b in ["Get Started","Request Access","Sign Up","Sign up","See How It Works","Try for free","Learn More"] if b in html]
check("No competing CTA verbs", not banned, f"found={banned}")
check("Secondary CTA 'See a sample report' present", "See a sample report" in html)
check("Positioning line present", "people who write and sign IAQ reports" in html)
check("Defensibility headline present", "AI-Assisted, Expert-Reviewed." in html)
check("Screening-not-compliance line present", "Screening, not compliance." in html)

# ---------- assets ----------
check("Light logo embedded", html.count('data:image/png;base64,')>=3)
check("Favicon linked", 'rel="icon"' in html)
check("Social/OG meta present", 'property="og:title"' in html and 'name="twitter:card"' in html)

# ---------- structure / DOM ----------
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.h1=0; s.ids=set(); s.anchors=[]
        s.inputs=0; s.selects=0; s.imgs_no_alt=0
        s.faq_btn=0; s.ans_region=0; s.viewport=False; s.menu_aria=False
    def handle_starttag(s, tag, attrs):
        d=dict(attrs)
        if tag=='h1': s.h1+=1
        if 'id' in d: s.ids.add(d['id'])
        if tag=='a' and d.get('href','').startswith('#') and d['href']!='#': s.anchors.append(d['href'][1:])
        if tag=='input': s.inputs+=1
        if tag=='select': s.selects+=1
        if tag=='img' and not d.get('alt'): s.imgs_no_alt+=1
        if tag=='button' and 'aria-controls' in d and 'aria-expanded' in d: s.faq_btn+=1
        if tag=='button' and d.get('id')=='menuBtn' and 'aria-expanded' in d: s.menu_aria=True
        if tag=='div' and d.get('role')=='region': s.ans_region+=1
        if tag=='meta' and d.get('name')=='viewport': s.viewport=True
p=P(); p.feed(html)

check("Exactly one <h1>", p.h1==1, f"count={p.h1}")
check("Viewport meta present", p.viewport)
check("All images have alt text", p.imgs_no_alt==0, f"missing={p.imgs_no_alt}")
missing=[a for a in p.anchors if a not in p.ids]
check("All in-page anchors resolve to an id", not missing, f"missing={missing}")
check("Beta form has 3 inputs (name,email,role)", p.inputs==2 and p.selects==1, f"inputs={p.inputs} selects={p.selects}")
check("FAQ buttons have aria-expanded + aria-controls (5)", p.faq_btn==5, f"count={p.faq_btn}")
check("Mobile menu button exposes aria-expanded", p.menu_aria)
check("FAQ answers are aria regions (5)", p.ans_region==5, f"count={p.ans_region}")

# ---------- behavior / quality floor ----------
check("Reduced-motion respected", 'prefers-reduced-motion' in html)
check("Focus-visible styles present", 'focus-visible' in html)
check("Sticky nav + scroll behavior", 'scrolled' in html and 'addEventListener(\'scroll\'' in html)
check("Mobile menu wired", 'menuBtn' in html and 'navlinks' in html)
check("Form validates email", '@' in html and 'test(e)' in html)
check("Form shows success state", 'betaOk' in html and "classList.add('show')" in html)
check("Email input type=email + autocomplete", 'type="email"' in html and 'autocomplete="email"' in html)

# ---------- report ----------
passed=sum(1 for _,ok,_ in results if ok)
total=len(results)
print("="*64)
print(f"AtmosFlow landing page acceptance suite  ({passed}/{total} passed)")
print("="*64)
for name,ok,detail in results:
    mark="PASS" if ok else "FAIL"
    extra=f"  [{detail}]" if detail else ""
    print(f"  {mark}  {name}{extra}")
print("="*64)
sys.exit(0 if passed==total else 1)
