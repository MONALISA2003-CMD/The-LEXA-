#!/usr/bin/env python3
"""Rebuild LEXA identity derivatives from the approved transparent symbol/wordmark.

Developer-only build tool; generated assets are committed so CI needs no imaging dependencies.
Do not replace the master images with generic type or a redrawn LX silhouette.
"""
from __future__ import annotations
from pathlib import Path
import colorsys
import numpy as np
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[1] / 'lexa-frontend' / 'public'
ASSETS = PUBLIC / 'lexa-identity'
ASSETS.mkdir(exist_ok=True)
S = Image.open(PUBLIC / 'lexa-master-symbol.png').convert('RGBA')
W = Image.open(PUBLIC / 'lexa-master-wordmark.png').convert('RGBA')

def recolor_wordmark_light(img: Image.Image) -> Image.Image:
    a = np.asarray(img, dtype=np.uint8).copy()
    color = a[:, :, :3].astype(float)
    # The approved X turquoise region is retained; only dark navy letters become white.
    green = (color[:,:,1] > color[:,:,0]*1.5 + 14) & (color[:,:,1] > color[:,:,2]*0.75)
    lum = color.mean(axis=2)
    bright = np.clip(242 + (lum - 40)*0.06, 230, 254).astype(np.uint8)
    for c in range(3):
        a[:,:,c] = np.where(green, a[:,:,c], bright)
    return Image.fromarray(a, 'RGBA')

def make_lockup(wordmark: Image.Image, name: str) -> None:
    canvas = Image.new('RGBA', (1240, 340))
    sym = S.copy(); sym.thumbnail((355, 278), Image.Resampling.LANCZOS)
    mark_x, mark_y = 11, (340 - sym.height)//2
    canvas.alpha_composite(sym,(mark_x,mark_y))
    word = wordmark.copy();word.thumbnail((839, 193),Image.Resampling.LANCZOS)
    canvas.alpha_composite(word,(386,(340-word.height)//2 + 4))
    canvas.save(PUBLIC/name,optimize=True)

make_lockup(W,'lexa-master-lockup.png')
recolor_wordmark_light(W).save(PUBLIC/'lexa-master-wordmark-light.png', optimize=True)
make_lockup(recolor_wordmark_light(W),'lexa-master-lockup-light.png')
(PUBLIC/'lexa-logo.png').write_bytes((PUBLIC/'lexa-master-lockup.png').read_bytes())
S.save(PUBLIC/'lexa-lx-symbol.png', optimize=True)

# Deterministic colour derivatives from the exact silhouette, preserving its shading.
PALETTE = {
    'navy':('#488DFF','#2BE2C6'), 'blue':('#075CF5','#2BE2C6'),
    'cyan':('#0891B2','#49DBF7'), 'emerald':('#047857','#2EE7B1'),
    'gold':('#BE861F','#FFE16D'), 'orange':('#C26419','#FFC267'),
    'coral':('#D14B40','#FFA68C'), 'violet':('#7C3AED','#CEAAFF'),
    'volt':('#5D850A','#C9F955'), 'bronze':('#8F4B18','#F0B06C'),
    'indigo':('#4338CA','#B1A7FF'), 'teal':('#0F766E','#45DFC3'),
    'sapphire':('#174A9C','#76B8FF'), 'mulberry':('#8B225A','#F19BC6'),
    'industrial':('#C2410C','#FFAA66')
}

def rgb(hexstr: str) -> tuple[int,int,int]:
    return tuple(int(hexstr[i:i+2],16) for i in (1,3,5))

def variant(primary: str, companion: str, on_dark: bool) -> Image.Image:
    a = np.asarray(S).copy()
    v = a[:,:,:3]
    # Blue region is original brand ink; teal region is its interlocking highlight.
    r,g,b = v[:,:,0].astype(np.float32),v[:,:,1].astype(np.float32),v[:,:,2].astype(np.float32)
    greenish = np.clip((g - r - 11)/90,0,1)
    teal = np.clip((g - 30)/130,0,1) * np.clip((155 - (b-g))/100,0,1)
    mix = np.maximum(greenish,teal)
    mix = np.clip(mix*0.98,0,1)[:,:,None]
    p = np.array(rgb(primary),dtype=np.float32)
    t = np.array(rgb(companion),dtype=np.float32)
    base = (1-mix)*p + mix*t
    # Retain original highlights and shadow detail while avoiding muddy monochrome icons.
    brightness = np.maximum(r,np.maximum(g,b)) / 255.0
    detail = (0.46 + 0.67*brightness)[:,:,None]
    if on_dark:
        detail = detail + 0.11
    recolored = np.clip(base*detail,0,255).astype(np.uint8)
    a[:,:,:3] = recolored
    out=Image.fromarray(a,'RGBA')
    out.thumbnail((590,440),Image.Resampling.LANCZOS)
    return out

for key,(base,accent) in PALETTE.items():
    variant(base,accent,False).save(ASSETS/f'{key}.png',optimize=True)
    variant(base,accent,True).save(ASSETS/f'{key}-on-dark.png',optimize=True)

# Small icon silhouette is the original approved LX, against the official navy.
def icon(size:int, maskable:bool=False)->Image.Image:
    im=Image.new('RGBA',(size,size),(0,0,0,0))
    d=ImageDraw.Draw(im)
    radius=int(size*0.23)
    d.rounded_rectangle((0,0,size-1,size-1),radius=radius,fill='#06132F')
    allowed=(0.69 if maskable else 0.79)*size
    sym=S.copy();sym.thumbnail((round(allowed),round(allowed*0.76)),Image.Resampling.LANCZOS)
    im.alpha_composite(sym,((size-sym.width)//2,(size-sym.height)//2))
    return im

for sz in (16,32,48,180,192,256,512):
    icon(sz,maskable=sz==512).save(PUBLIC/f'lexa-icon-{sz}.png',optimize=True)
icon(256).save(PUBLIC/'lexa-favicon.png',optimize=True)
icon(192).save(PUBLIC/'apple-touch-icon.png',optimize=True) if False else None
icon(180).save(PUBLIC/'apple-touch-icon.png',optimize=True)
icon(16).save(PUBLIC/'favicon-16.png',optimize=True)
icon(32).save(PUBLIC/'favicon-32.png',optimize=True)
icon(48).save(PUBLIC/'favicon-48.png',optimize=True)
icon(64).save(PUBLIC/'favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64)])
print('LEXA exact-artwork logo assets generated:',len(list(ASSETS.glob('*.png'))),'module marks')
