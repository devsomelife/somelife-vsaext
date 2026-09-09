"""Renders Chrome Web Store screenshots at exactly 1280x800.

Uses fictional client and project names: a public listing must not carry real
customer data."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1280, 800
GREEN, GREEN_D = (30,136,94), (20,102,74)
WHITE, INK, MUTED, LINE = (255,255,255), (26,26,26), (110,110,110), (222,222,222)

def font(sz, bold=False):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf',
              '/usr/share/fonts/TTF/DejaVuSans%s.ttf'):
        f = p % ('-Bold' if bold else '')
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def gradient(d):
    for y in range(H):
        t = y / H
        d.line([(0,y),(W,y)], fill=tuple(int(a+(b-a)*t) for a,b in zip(GREEN,GREEN_D)))

def panel(d, x, y, w, h, r=12):
    d.rounded_rectangle([x+3,y+5,x+w+3,y+h+5], r, fill=(0,60,40))
    d.rounded_rectangle([x,y,x+w,y+h], r, fill=WHITE)

def caption(d, title, sub):
    f1, f2 = font(31, True), font(16)
    d.text((W//2, 62), title, font=f1, fill=WHITE, anchor="mm")
    d.text((W//2, 100), sub, font=f2, fill=(220,240,232), anchor="mm")

def chip(d, x, y, label, primary=False):
    f = font(13, primary)
    w = int(d.textlength(label, font=f)) + 26
    d.rounded_rectangle([x,y,x+w,y+30], 5,
                        fill=GREEN if primary else (245,245,245),
                        outline=None if primary else LINE)
    d.text((x+w//2, y+15), label, font=f, fill=WHITE if primary else INK, anchor="mm")
    return w

# ---------------------------------------------------------------- screenshot 1
def shot_tracking(path):
    img = Image.new('RGB',(W,H)); d = ImageDraw.Draw(img)
    gradient(d)
    caption(d, "Track your month, then fill VSA in one click",
               "Client and project come from your own VSA data. Nothing is saved until you press Save.")
    px, py, pw, ph = 70, 140, W-140, 500
    panel(d, px, py, pw, ph)

    fh, fr, fs = font(17,True), font(13), font(12)
    d.text((px+26, py+28), "Shadow Tracking", font=fh, fill=INK)
    d.text((px+pw-150, py+30), "<  September 2026  >", font=fs, fill=MUTED)

    cols = [("Date",26,108),("Client",140,210),("Project",356,470),
            ("Days",840,60),("Note",915,150)]
    ty = py+68
    d.line([(px+20,ty+26),(px+pw-20,ty+26)], fill=LINE)
    for name,cx,_ in cols:
        d.text((px+cx, ty+8), name, font=font(12,True), fill=(70,70,70))

    rows = [("09/01/2026","NORTHWIND TRADING","BS-26-000112 [#01_02 Sprint 2] : Refonte portail","1",""),
            ("09/02/2026","NORTHWIND TRADING","BS-26-000112 [#01_02 Sprint 2] : Refonte portail","1",""),
            ("09/03/2026","NORTHWIND TRADING","BS-26-000112 [#01_02 Sprint 2] : Refonte portail","0.5","demi-journee"),
            ("09/03/2026","ATLAS LOGISTIQUE","BS-26-000087 [#03_01 Run] : Maintenance applicative","0.5",""),
            ("09/04/2026","ATLAS LOGISTIQUE","BS-26-000087 [#03_01 Run] : Maintenance applicative","1",""),
            ("09/07/2026","MERIDIAN SANTE","BS-26-000134 [#02_01 Cadrage] : Etude de faisabilite","1",""),
            ("09/08/2026","MERIDIAN SANTE","BS-26-000134 [#02_01 Cadrage] : Etude de faisabilite","0.75","")]
    y = ty+38
    for date,client,proj,days,note in rows:
        for text,cx,cw in ((date,26,108),(client,140,210),(proj,356,470),(days,840,60),(note,915,150)):
            d.rounded_rectangle([px+cx-6,y-4,px+cx+cw,y+21], 4, outline=LINE)
            t = text
            while d.textlength(t, font=fr) > cw-14 and len(t) > 4:
                t = t[:-2]
            if t != text: t = t[:-1] + "…"
            d.text((px+cx+4, y+8), t, font=fr, fill=INK, anchor="lm")
        y += 34

    d.line([(px+20,y+4),(px+pw-20,y+4)], fill=LINE)
    d.text((px+26, y+22), "Total", font=font(13,True), fill=INK)
    d.text((px+844, y+22), "5.75", font=font(13,True), fill=INK)
    d.text((px+915, y+22), "7/7 row(s) ready to inject", font=fs, fill=MUTED)

    bx = px+26; by = y+48
    for lbl in ("Add row","Export JSON","Export CSV","Import JSON"):
        bx += chip(d,bx,by,lbl) + 8
    bx = px+26; by += 42
    for lbl,pri in (("Sync clients & projects from VSA",False),("Reset catalog",False),
                    ("Inject this month into VSA",True)):
        bx += chip(d,bx,by,lbl,pri) + 8
    img.save(path); print("  "+path)

# ---------------------------------------------------------------- screenshot 2
def shot_widen(path):
    img = Image.new('RGB',(W,H)); d = ImageDraw.Draw(img)
    gradient(d)
    caption(d, "Read the dropdown you are actually choosing from",
               "VSA truncates project names. Click one and it widens while open, then snaps back.")
    fr, fs = font(13), font(12)

    # before
    x,y,w,h = 100, 210, 480, 420
    panel(d,x,y,w,h)
    d.text((x+24,y+24), "Before", font=font(15,True), fill=(150,60,60))
    d.rounded_rectangle([x+24,y+70,x+232,y+98], 4, outline=LINE)
    d.text((x+32,y+84), "NORTHWIND TRADING", font=fr, fill=INK, anchor="lm")
    d.polygon([(x+214,y+80),(x+224,y+80),(x+219,y+87)], fill=(120,120,120))
    d.rounded_rectangle([x+24,y+110,x+232,y+138], 4, outline=(90,90,90), width=2)
    d.text((x+32,y+124), "BS-26-000112 [#01_02 Sprin…", font=fr, fill=INK, anchor="lm")
    d.text((x+24,y+160), "The name is cut off. You cannot", font=fs, fill=MUTED)
    d.text((x+24,y+180), "tell which project this is.", font=fs, fill=MUTED)

    # after
    x2 = 700
    panel(d,x2,y,w,420)
    d.text((x2+24,y+24), "After", font=font(15,True), fill=GREEN)
    d.rounded_rectangle([x2+24,y+70,x2+232,y+98], 4, outline=LINE)
    d.text((x2+32,y+84), "NORTHWIND TRADING", font=fr, fill=INK, anchor="lm")
    d.rounded_rectangle([x2+24,y+110,x2+444,y+138], 4, outline=GREEN, width=2)
    d.text((x2+32,y+124), "BS-26-000112 [#01_02 Sprint 2 - Assistance technique]", font=fr, fill=INK, anchor="lm")
    opts = ["BS-26-000112 [#01_02 Sprint 2 - Assistance technique]",
            "BS-26-000087 [#03_01 Run - Forfait] : Maintenance",
            "BS-26-000134 [#02_01 Cadrage - Regie] : Faisabilite",
            "BS-26-000150 [#04_01 TMA - Forfait] : Support N2"]
    oy = y+142
    d.rectangle([x2+24,oy,x2+444,oy+len(opts)*30+8], fill=(252,252,252), outline=LINE)
    for i,o in enumerate(opts):
        yy = oy+8+i*30
        if i == 0:
            d.rectangle([x2+25,yy-3,x2+443,yy+23], fill=(232,245,239))
        d.text((x2+34,yy+10), o, font=fr, fill=INK, anchor="lm")
    d.text((x2+24,oy+len(opts)*30+30), "Full names, readable at a glance.", font=fs, fill=MUTED)
    img.save(path); print("  "+path)

out = os.path.dirname(os.path.abspath(__file__))
shot_tracking(os.path.join(out,'store-1-tracking.png'))
shot_widen(os.path.join(out,'store-2-dropdown.png'))
