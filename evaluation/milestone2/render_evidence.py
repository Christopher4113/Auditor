"""Render a diagram and a browser screenshot of an actual recorded response.

python3 evaluation/milestone2/render_evidence.py
Needs Chrome/Chromium, or set CHROME_BIN. Uses a fresh temporary browser profile.
This does not capture the user's open tabs or call any external services.
"""
from pathlib import Path
import html
import json
import os
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/milestone2'
RESULTS=ROOT/'evaluation/milestone2/results'


def render():
    OUT.mkdir(parents=True,exist_ok=True)
    result=json.loads((RESULTS/'results.json').read_text())
    row=next(r for r in result['records'] if r['exampleId']=='C04' and r['method']=='auditor-local')
    trace=['POST /query (actual local HTTP handler)',
        json.dumps(row['request'],ensure_ascii=False),
        '', 'HTTP 200 — recorded response',
        json.dumps(row['hits'],indent=2,ensure_ascii=False),
        '', 'No Claude call, controller approval or ledger posting in this run.']
    (OUT/'case_trace.html').write_text('<!doctype html><meta charset="utf-8"><title>Actual C04 evidence</title><style>body{margin:0;padding:22px;background:#101c2e;color:#e8f0fb}h1{font:24px sans-serif;color:#76e0c9;margin:0 0 12px}pre{font:18px/1.4 monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}</style><h1>Executed evidence: Apex contract lookup (C04)</h1><pre>'+html.escape('\n'.join(trace))+'</pre>')
    boxes=[(20,45,'Source data','Bank + books + documents'),(228,45,'Matcher / Workflow','Deterministic reconciliation'),(436,45,'Accountant agent','Sonnet + typed tools'),(644,45,'Controls / posting','Rules + server guard'),(852,45,'Ledger / interface','State + audit + React')]
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="405" viewBox="0 0 1060 405"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#314f70"/></marker></defs><rect width="1060" height="405" fill="white"/><style>text{font-family:Arial,sans-serif;fill:#173a5e}.title{font-size:20px;font-weight:700}.sub{font-size:13px}</style>']
    for x,y,title,sub in boxes:
        svg.append(f'<rect x="{x}" y="{y}" width="188" height="92" rx="12" fill="#e7eff8" stroke="#4b7198" stroke-width="2"/><text class="title" x="{x+94}" y="{y+35}" text-anchor="middle">{html.escape(title)}</text><text class="sub" x="{x+94}" y="{y+61}" text-anchor="middle">{html.escape(sub)}</text>')
    for x in [208,416,624,832]:svg.append(f'<path d="M{x},90 H{x+20}" stroke="#314f70" stroke-width="2" marker-end="url(#arrow)"/>')
    svg.extend([
        '<rect x="355" y="190" width="292" height="86" rx="12" fill="#d8f2e9" stroke="#168568" stroke-width="2"/><text class="title" x="501" y="221" text-anchor="middle">FastAPI + canonical catalog</text><text class="sub" x="501" y="246" text-anchor="middle">Moss provider / local BM25 retrieval</text><text class="sub" x="501" y="264" text-anchor="middle">GREEN: local slice executed here</text>',
        '<path d="M530,137 V190" stroke="#314f70" stroke-width="2" marker-end="url(#arrow)"/>',
        '<rect x="705" y="190" width="260" height="86" rx="12" fill="#e7eff8" stroke="#4b7198" stroke-width="2"/><text class="title" x="835" y="226" text-anchor="middle">Human controller</text><text class="sub" x="835" y="250" text-anchor="middle">Review / instructions / sign-off</text>',
        '<path d="M740,190 V137" stroke="#314f70" stroke-width="2" marker-end="url(#arrow)"/>',
        '<rect x="90" y="318" width="880" height="62" rx="12" fill="#fff4e5" stroke="#d38622" stroke-dasharray="8 5" stroke-width="2"/><text class="title" x="530" y="345" text-anchor="middle">Remaining work / verification</text><text class="sub" x="530" y="366" text-anchor="middle">Complete non-cash coverage • full agent + 2 baselines on 2 datasets • stakeholder review</text>',
        '<text class="sub" x="20" y="25">Solid blue: implemented in source; green: locally exercised component; dashed orange: remaining work.</text></svg>'])
    (OUT/'architecture.svg').write_text(''.join(svg))
    (OUT/'architecture.html').write_text('<!doctype html><meta charset="utf-8"><style>body{margin:0}</style>'+''.join(svg))
    chrome=os.getenv('CHROME_BIN') or shutil.which('google-chrome') or shutil.which('chromium') or '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    for source,target,size in [('architecture.html','architecture.png','1060,405'),('case_trace.html','case_trace.png','1060,470')]:
        with tempfile.TemporaryDirectory(prefix='auditor-evidence-browser-') as profile:
            run=subprocess.run([chrome,'--headless','--disable-gpu','--hide-scrollbars','--no-first-run',f'--user-data-dir={profile}',f'--window-size={size}',f'--screenshot={OUT/target}',(OUT/source).as_uri()],capture_output=True,text=True,timeout=45)
            if run.returncode:raise RuntimeError(run.stderr[-1000:])
        if not (OUT/target).exists():raise RuntimeError(f'No rendered image: {target}')
        print(f'Rendered {target} from {source}')


if __name__=='__main__':render()
