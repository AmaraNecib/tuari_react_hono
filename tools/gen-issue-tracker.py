"""
Generate tmp/issue-tracker.html from GitHub or the durable local snapshot.
Run: python tools/gen-issue-tracker.py --offline
"""
import argparse
import subprocess, json, re, sys, os, html as html_mod
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL_SNAPSHOT = ROOT / 'docs' / 'local-issue-snapshot.json'


def gh(args):
    r = subprocess.run(['gh'] + args, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"gh error: {r.stderr.strip()}", file=sys.stderr)
        return None
    return r.stdout


def fetch_issues():
    raw = gh(['issue', 'list', '--state', 'open', '--limit', '80', '--json', 'number,title,labels,body'])
    return json.loads(raw) if raw else None


def load_local_snapshot():
    if not LOCAL_SNAPSHOT.exists():
        return None
    payload = json.loads(LOCAL_SNAPSHOT.read_text(encoding='utf-8'))
    return payload.get('issues', [])


def save_local_snapshot(issues):
    payload = {
        'schema': 1,
        'capturedAt': __import__('datetime').date.today().isoformat(),
        'source': 'gh issue list --state open --limit 80',
        'sourceStatus': 'live GitHub snapshot',
        'issues': issues,
    }
    LOCAL_SNAPSHOT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\\n', encoding='utf-8')


def get_issues(offline):
    if offline:
        issues = load_local_snapshot()
        if issues is None:
            raise SystemExit(f'No local issue snapshot at {LOCAL_SNAPSHOT}')
        return issues, 'local issue snapshot'

    issues = fetch_issues()
    if issues is not None:
        save_local_snapshot(issues)
        return issues, 'live GitHub data'

    issues = load_local_snapshot()
    if issues is None:
        raise SystemExit(
            f'GitHub issue data is unavailable and no local snapshot exists at {LOCAL_SNAPSHOT}'
        )
    print(f'Falling back to local issue snapshot: {LOCAL_SNAPSHOT}', file=sys.stderr)
    return issues, 'local issue snapshot (GitHub unavailable)'

def fetch_deps():
    """blockedBy edges for every open issue via graphql (batched by one query)."""
    # simpler: per-issue via REST is not exposed; use graphql with aliases in chunks
    return {}

# ---- Level assignment (by issue number) ----
# Level 1: no blockers, parallel-safe (can start now)
# Level 2: after Level 1 lands
# Level 3: after Level 2
# Level 4: big plans / architecture
# Level 0: reference / map / parent / spec

LEVELS = {
    # Level 1 — frontier: ALL of these are runnable in parallel;
    # the tracker colors only the first 8 (priority order) so you know the
    # max parallel batch. The rest are Level-1 too — pick any 8.
    # ── Worktrees already created ──

    # ── Security / hardening follow-ups (High-assurance) ──
    265: 1,
    # ── Web perf / UX (the load-time family) ──
    287: 1, 282: 1, 281: 1, 271: 1, 243: 1, 244: 1, 214: 1,
    # ── Quality / hygiene ──
    277: 1, 278: 1, 275: 1, 284: 1, 230: 1, 232: 1, 247: 1, 263: 1, 259: 1, 241: 1, 242: 1,
    # ── New: payment/finance hardening ──
    288: 1, 289: 1, 294: 1, 307: 1, 312: 1,
    # Level 2
    183: 2, 228: 2, 229: 2, 234: 2, 217: 2, 255: 2, 253: 2, 252: 2, 256: 2,
    # Level 3
    199: 3, 213: 3, 216: 3, 237: 3, 240: 3, 257: 3,
    # Level 4
    182: 4, 175: 4, 178: 4, 176: 4, 238: 4,
    # Reference
    190: 0, 191: 0, 211: 0, 235: 0, 248: 0,
}


def js_json(obj):
    """JSON that is safe to embed inside a <script> block.

    json.dumps leaves '<' intact, so an issue title containing '</script>'
    would end the block and let issue-authored text execute as page script.
    """
    return (
        json.dumps(obj, ensure_ascii=False)
        .replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


# Priority order WITHIN each level — the first MAX_PARALLEL of these get the
# colored READY badge. Lower number = higher priority.
PRIORITY = [
    # security first
    265,
    # load-time family
    287, 282, 281, 271,
    # quality / data-integrity
    232, 277, 278, 247,
    # rest of level 1
    243, 244, 214, 230, 259, 263, 241, 242, 275, 284,
    # payment/finance
    288, 289,
]

# Max parallel worktrees shown as READY/colored per level
MAX_PARALLEL = 6  # crew policy default: six concurrent mutation lanes

# Worktree names for issues we've already created
WORKTREES = {
    271: 'issue-271-i18n-resources',
    294: 'issue-294-signin-translation',
    275: 'issue-275-tour-a11y',
    282: 'issue-282-web-hygiene',
    284: 'issue-284-repo-hygiene',
    281: 'issue-281-fonts',
    232: 'issue-232-tx-tests',
    247: 'issue-247-rpc-wire-tests',
    287: 'issue-287-splashscreen',
    278: 'issue-278-zod-validation',
    230: 'issue-230-whitespace-pw',
    288: 'issue-288-tx-model',
    183: 'issue-183-search-filter',
    228: 'issue-228-recovery-e2e',
}

CONFLICTS = {
    # file-overlap clusters
    214: ['#238'], 238: ['#198', '#199', '#213', '#239'],
    199: ['#238', '#213'], 213: ['#238', '#199', '#216'], 216: ['#213'],
    236: ['#240', '#237'], 240: ['#236', '#237'], 237: ['#236', '#240'],
    230: ['#234'], 234: ['#230'],
    251: ['#255'], 249: ['#255'], 250: ['#255'], 253: ['#255'], 252: ['#255'],
    255: ['#251', '#249', '#250', '#253', '#252'], 257: ['#232'], 232: ['#257'],
    254: ['#247'], 247: ['#254'],
    265: ['#238'], 266: ['#209'],
}

BLOCKED_BY = {
    199: [198],
    213: [238],  # native: 212 closed; keep simple
    216: [213],
    255: [251, 249, 250, 253, 252],
    257: [255],
    210: [209],
    217: [236],
    265: [238],
}

SKILLS = {
    'grilling': {213, 216, 236},
    'high_assurance': {209, 216, 230, 234, 250, 249, 251, 257, 266},
    'playwright': {254, 247, 263},
    'coverage': {249, 250, 251, 252, 253, 255, 256, 257},
    'ref': {190, 191, 211, 235, 248},
}

def skills_for(n):
    parts = []
    if n in SKILLS['grilling']: parts.append('grilling')
    parts.append('feature-implement')
    if n in SKILLS['playwright']: parts.append('playwright-best-practices')
    if n in SKILLS['coverage']: parts.append('test-audit')
    return ' + '.join(parts)

def tier_for(n):
    return 'High-assurance' if n in SKILLS['high_assurance'] else 'Standard' if n not in SKILLS['ref'] else 'Reference'

def short_title(title):
    return title

def main():
    parser = argparse.ArgumentParser(description='Generate the Tuari issue tracker')
    parser.add_argument(
        '--offline',
        action='store_true',
        help='Use docs/local-issue-snapshot.json and never call GitHub (default)',
    )
    parser.add_argument(
        '--refresh',
        action='store_true',
        help='Explicitly fetch live GitHub issues and refresh the local snapshot',
    )
    args = parser.parse_args()
    if args.offline and args.refresh:
        parser.error('--offline and --refresh are mutually exclusive')
    offline = not args.refresh
    issues, source = get_issues(offline)
    by_num = {i['number']: i for i in issues}

    # sanity: every LEVELS key must be a real open issue
    unknown = [n for n in LEVELS if n not in by_num]
    unassigned = [n for n in by_num if n not in LEVELS]
    if unknown: print(f"WARN: LEVELS has non-open/missing issues: {unknown}")
    if unassigned: print(f"WARN: open issues without level: {unassigned}")

    open_items = sorted(issues, key=lambda x: x['number'])
    cards = []
    for i in open_items:
        n = i['number']
        lvl = LEVELS.get(n, 3)
        title = i['title']
        body = (i.get('body') or '')[:400].replace('"', '&quot;').replace('\n', ' ')
        labels = [l['name'] for l in i.get('labels', [])]
        prio = 'high' if any('high' in l for l in labels) else 'med' if any('med' in l for l in labels) else ''
        tier = tier_for(n)
        skills = skills_for(n)
        wb = WORKTREES.get(n, '')
        blockers = BLOCKED_BY.get(n, [])
        unlocks = [k for k, v in BLOCKED_BY.items() if n in v]
        conflicts = CONFLICTS.get(n, [])
        ready = (lvl == 1 and not blockers)
        cards.append({
            'n': n, 'lvl': lvl, 'title': title, 'body': body, 'prio': prio,
            'tier': tier, 'skills': skills, 'wb': wb, 'blockers': blockers,
            'unlocks': unlocks, 'conflicts': conflicts, 'ready': ready,
            'labels': labels,
        })

    # Color only the first MAX_PARALLEL Level-1 issues (priority order) as
    # READY — the rest stay Level 1 but uncolored, so you know the max batch.
    l1_rank = {num: i for i, num in enumerate(PRIORITY) if num in by_num}
    colored = 0
    for c in cards:
        if c['lvl'] == 1 and c['ready']:
            rank = l1_rank.get(c['n'], 10 ** 9)
            c['rank'] = rank
        else:
            c['rank'] = 10 ** 9
    for c in sorted(cards, key=lambda x: x['rank']):
        if c['lvl'] == 1 and c['ready'] and colored < MAX_PARALLEL:
            c['colored'] = True
            colored += 1
        else:
            c['colored'] = False
    for c in cards:
        c['ready'] = c['ready'] and c['colored']

    cards.sort(key=lambda c: (c['lvl'], -1000 if c['prio'] == 'high' else 0, c['n']))

    open_count = len(cards)
    ready_count = sum(1 for c in cards if c['ready'])

    # Build level rows
    level_names = {
        1: 'LEVEL 1 — ALL runnable now · 🎯 the 8 colored = your parallel batch (pick any 8)',
        2: 'LEVEL 2 — after Level 1 lands',
        3: 'LEVEL 3 — after Level 2',
        4: 'LEVEL 4 — big plans / architecture, one at a time',
    }

    def chip_html(c):
        cls = 'ready' if c['ready'] else ('blocked' if c['lvl'] > 1 else '')
        return f'<button class="chip {cls}" data-filter="lvl{c["lvl"]}">#{c["n"]}</button>'

    rows = ''
    for lvl in [1, 2, 3, 4]:
        items = [c for c in cards if c['lvl'] == lvl]
        if not items: continue
        chips = ' '.join(chip_html(c) for c in items)
        rows += f'<div class="level-row"><span class="level-badge l{lvl}">L{lvl}</span>'
        rows += f'<span class="lvl-hint" style="font-size:12px;color:var(--muted)">{level_names[lvl]}</span> {chips}</div>\n'
        if lvl < 4:
            rows += '  <div class="arrow-down">▼</div>\n'
    refs = [c for c in cards if c['lvl'] == 0]
    if refs:
        chips = ' '.join(chip_html(c) for c in refs)
        rows += f'<div class="level-row"><span class="level-badge r0" style="background:var(--closed)">REF</span> {chips} <span style="font-size:12px;color:var(--muted)">— reference / map / parent issues, not work</span></div>\n'

    # Cards HTML
    def card_html(c):
        badges = ''
        if c['lvl'] > 0: badges += f'<span class="b-lvl l{c["lvl"]}">L{c["lvl"]}</span>'
        if c['ready']: badges += '<span class="badge b-lvl l1">READY</span>'
        if c['prio'] == 'high': badges += '<span class="badge b-prio-high">HIGH</span>'
        if c['tier'] == 'High-assurance': badges += '<span class="badge b-high">HIGH-ASSURANCE</span>'
        if c['lvl'] == 0: badges += '<span class="badge b-tier">REF</span>'
        meta = []
        if c['blockers']: meta.append(f'<span class="blocker">⛔ needs: {", ".join("#"+str(b) for b in c["blockers"])}</span>')
        if c['unlocks']: meta.append(f'<span>🔓 unlocks: {", ".join("#"+str(u) for u in c["unlocks"])}</span>')
        if c['conflicts']: meta.append(f'<span class="conflict">⚠ conflicts: {", ".join(c["conflicts"])}</span>')
        if c['skills'] and c['lvl'] > 0: meta.append(f'<span>🧩 {c["skills"]}</span>')
        copy = f'<button class="btn btn-copy" data-n="{c["n"]}"><span class="ico">📋</span> Copy launch prompt</button>' if c['wb'] and c['lvl'] > 0 else ''
        ghbtn = (
            f'<a class="btn gh" href="https://github.com/AmaraNecib/tuari_react_hono/issues/{c["n"]}" target="_blank">↗ GitHub</a>'
            if source.startswith('live GitHub')
            else '<span class="btn gh" aria-label="offline issue snapshot">offline snapshot</span>'
        )
        extra = 'ready' if c['ready'] else ('blocked' if c['lvl'] > 1 else '')
        wb_note = f'<div style="font-size:11px;color:var(--cyan);margin-top:4px">worktree: worktrees/{c["wb"]} ✓ deps ready</div>' if c['wb'] else ''
        return f'''<div class="card {extra}" data-n="{c["n"]}" data-lvl="{c["lvl"]}" data-state="open" data-ready="{1 if c["ready"] else 0}" data-conflict="{1 if c["conflicts"] else 0}">
    <div class="card-top"><div class="num">#{c["n"]}</div><div class="badges">{badges}</div></div>
    <div class="title">{html_mod.escape(c["title"])}</div>
    <div class="desc">{html_mod.escape(c["body"])}</div>
    {f'<div class="meta">{"".join(meta)}</div>' if meta else ''}
    {wb_note}
    <div class="actions">{copy}{ghbtn}</div>
  </div>'''

    sections = ''
    for lvl in [1, 2, 3, 4]:
        items = [c for c in cards if c['lvl'] == lvl]
        if not items: continue
        grid = '\n'.join(card_html(c) for c in items)
        sections += f'''<div class="section"><div class="section-title"><span class="level-badge l{lvl}">L{lvl}</span> {level_names[lvl]} <span class="rule"></span><span class="count">{len(items)}</span></div><div class="grid">{grid}</div></div>'''
    ref_items = [c for c in cards if c['lvl'] == 0]
    if ref_items:
        grid = '\n'.join(card_html(c) for c in ref_items)
        sections += f'''<div class="section"><div class="section-title"><span class="level-badge r0" style="background:var(--closed)">REF</span> Reference / map / parent <span class="rule"></span><span class="count">{len(ref_items)}</span></div><div class="grid">{grid}</div></div>'''

    # JSON for the copy-prompt JS
    import json as j
    js_data = js_json(cards)
    source_js = js_json(source)

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tuari Issue Tracker — Live</title>
<style>
  :root {{
    --bg: #0f1117; --panel: #171a23; --panel2: #1d2130; --border: #2a2f42;
    --text: #e6e9f2; --muted: #9aa3b8; --accent: #6c8cff; --green: #3ddc97;
    --amber: #ffb454; --red: #ff6b6b; --purple: #b28cff; --cyan: #4dd0e1;
    --level1: #3ddc97; --level2: #4dd0e1; --level3: #ffb454; --level4: #ff6b6b; --closed: #9aa3b8;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Roboto, Inter, sans-serif; line-height: 1.55; padding: 24px; }}
  .container {{ max-width: 1180px; margin: 0 auto; }}
  header {{ margin-bottom: 28px; }}
  h1 {{ font-size: 26px; font-weight: 700; }}
  .subtitle {{ color: var(--muted); margin-top: 4px; font-size: 14px; }}
  .stats {{ display: flex; gap: 14px; flex-wrap: wrap; margin-top: 16px; }}
  .stat {{ background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; min-width: 110px; }}
  .stat .num {{ font-size: 24px; font-weight: 700; }}
  .stat .lbl {{ font-size: 12px; color: var(--muted); text-transform: uppercase; }}
  .stat.open .num {{ color: var(--open); }}
  .stat.ready .num {{ color: var(--amber); }}
  .diagram {{ background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin: 20px 0 28px; }}
  .diagram h2 {{ font-size: 15px; margin-bottom: 14px; color: var(--muted); }}
  .level-row {{ display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }}
  .level-badge {{ min-width: 86px; text-align: center; border-radius: 8px; padding: 6px 10px; font-weight: 700; font-size: 12px; color: #0f1117; flex-shrink: 0; }}
  .l1 {{ background: var(--level1); }} .l2 {{ background: var(--level2); }}
  .l3 {{ background: var(--level3); }} .l4 {{ background: var(--level4); }}
  .chip {{ background: var(--panel2); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 13px; cursor: pointer; color: var(--text); }}
  .chip:hover {{ border-color: var(--accent); }}
  .chip.ready {{ border-color: var(--level1); color: var(--level1); }}
  .chip.blocked {{ opacity: .55; }}
  .arrow-down {{ color: var(--muted); text-align: center; margin: 2px 0; font-size: 13px; }}
  .toolbar {{ display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }}
  input#search {{ background: var(--panel); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 9px 14px; font-size: 14px; flex: 1; min-width: 240px; outline: none; }}
  .filter-btn {{ background: var(--panel); border: 1px solid var(--border); color: var(--muted); border-radius: 8px; padding: 9px 14px; font-size: 13px; cursor: pointer; }}
  .filter-btn.active {{ border-color: var(--accent); color: var(--accent); }}
  .section {{ margin-bottom: 26px; }}
  .section-title {{ font-size: 15px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }}
  .section-title .count {{ color: var(--accent); }}
  .rule {{ flex: 1; height: 1px; background: var(--border); }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }}
  .card {{ background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: all .15s; }}
  .card:hover {{ border-color: var(--accent); transform: translateY(-2px); }}
  .card.ready {{ border-left: 3px solid var(--level1); }}
  .card.blocked {{ border-left: 3px solid var(--border); opacity: .85; }}
  .card-top {{ display: flex; justify-content: space-between; gap: 8px; }}
  .num {{ font-weight: 700; color: var(--accent); font-size: 14px; }}
  .badges {{ display: flex; gap: 6px; flex-wrap: wrap; }}
  .badge {{ font-size: 10.5px; border-radius: 6px; padding: 2px 8px; font-weight: 600; }}
  .b-tier {{ background: var(--panel2); color: var(--muted); border: 1px solid var(--border); }}
  .b-high {{ background: rgba(255,107,107,.14); color: var(--red); border: 1px solid rgba(255,107,107,.3); }}
  .b-prio-high {{ background: rgba(255,107,107,.14); color: var(--red); }}
  .b-lvl {{ font-size: 10.5px; border-radius: 6px; padding: 2px 8px; font-weight: 700; color: #0f1117; }}
  .b-lvl.l1 {{ background: var(--level1); }} .b-lvl.l2 {{ background: var(--level2); }}
  .b-lvl.l3 {{ background: var(--level3); }} .b-lvl.l4 {{ background: var(--level4); }}
  .title {{ font-size: 14.5px; font-weight: 600; }}
  .desc {{ font-size: 12.5px; color: var(--muted); flex: 1; }}
  .meta {{ display: flex; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--muted); }}
  .meta span {{ background: var(--panel2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; }}
  .meta .conflict {{ color: var(--amber); border-color: rgba(255,180,84,.35); }}
  .meta .blocker {{ color: var(--red); border-color: rgba(255,107,107,.35); }}
  .actions {{ display: flex; gap: 8px; margin-top: 2px; }}
  .btn {{ background: var(--panel2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 7px 12px; font-size: 12.5px; cursor: pointer; flex: 1; text-align: center; text-decoration: none; }}
  .btn:hover {{ border-color: var(--accent); }}
  .btn.copied {{ border-color: var(--green); color: var(--green); }}
  .btn.gh {{ flex: 0 0 auto; }}
  .toast {{ position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(80px); background: var(--panel2); border: 1px solid var(--green); color: var(--green); padding: 12px 20px; border-radius: 10px; font-size: 13.5px; z-index: 999; transition: transform .25s; }}
  .toast.show {{ transform: translateX(-50%) translateY(0); }}
  footer {{ margin-top: 40px; color: var(--muted); font-size: 12px; text-align: center; border-top: 1px solid var(--border); padding-top: 18px; }}
</style>
</head>
<body>
<div class="container">
<header>
  <h1>🎯 Tuari — Issue Wave Tracker</h1>
  <div class="subtitle">Generated from {source} — {open_count} tickets · levels &amp; conflicts · copy-paste launch prompts</div>
  <div class="stats">
    <div class="stat open"><div class="num">{open_count}</div><div class="lbl">Open</div></div>
    <div class="stat ready"><div class="num">{ready_count}</div><div class="lbl">Ready now</div></div>
    <div class="stat"><div class="num">4</div><div class="lbl">Levels</div></div>
  </div>
</header>
<div class="diagram">
  <h2>📊 Dependency levels — same level = safe to run in parallel (max 8)</h2>
  {rows}
</div>
<div class="toolbar">
  <input id="search" type="text" placeholder="Search by number, title…">
  <button class="filter-btn active" data-filter="all">All</button>
  <button class="filter-btn" data-filter="ready">Ready now</button>
  <button class="filter-btn" data-filter="blocked">Blocked</button>
  <button class="filter-btn" data-filter="conflict">⚠ conflicts</button>
</div>
<div id="content">{sections}</div>
<footer>{source} · re-generate with <code>python tools/gen-issue-tracker.py --offline</code> · prompts are copy-paste ready for pi</footer>
</div>
<div class="toast" id="toast">📋 Copied</div>
<script>
const ISSUE_SOURCE = {source_js};
const ISSUES = {js_data};
function promptFor(i) {{
  const tier = i.tier === 'Reference' ? 'Standard' : i.tier;
  const parts = [
    `WORKTREE: worktrees/${{i.wb}} (deps ready — cd there and run pi)`,
    '',
    '── LAUNCH PROMPT (paste into pi) ──',
    `${{ISSUE_SOURCE === 'live GitHub data' ? 'Use the feature-implement skill to work on issue #' + i.n + ' (https://github.com/AmaraNecib/tuari_react_hono/issues/' + i.n + ').' : 'Use the feature-implement skill to work on local ticket #' + i.n + ' (see docs/local-issue-status.md).' }}`,
    `Review tier: ${{tier}}. Quality bar: APOSD + clean code — load the codebase-design skill in the quality-check step.`,
    `Skills: ${{i.skills}}.`,
  ];
  if (i.blockers.length) parts.push(`NOTE: blocked by ${{i.blockers.join(', ')}} — confirm merged before starting.`);
  if (i.conflicts.length) parts.push(`⚠ FILE CONFLICTS with ${{i.conflicts.join(', ')}} — sequence them.`);
  parts.push(`Scope: ${{i.title}}.`);
  return parts.join('\\n');
}}
function fallbackCopy(text, done) {{
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try {{ document.execCommand('copy'); done(); }} catch {{ alert('Copy failed'); }}
  document.body.removeChild(ta);
}}
document.querySelectorAll('.btn-copy').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const issue = ISSUES.find(x => x.n === +btn.dataset.n);
    const text = promptFor(issue);
    const done = () => {{
      btn.classList.add('copied');
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => {{ t.classList.remove('show'); btn.classList.remove('copied'); }}, 1800);
    }};
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }});
}});
document.querySelectorAll('.filter-btn').forEach(btn => {{
  btn.addEventListener('click', () => {{
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    document.querySelectorAll('.card').forEach(card => {{
      const i = ISSUES.find(x => x.n === +card.dataset.n);
      let show = true;
      if (f === 'ready') show = i.ready;
      if (f === 'blocked') show = !i.ready && i.lvl > 0;
      if (f === 'conflict') show = i.conflicts.length > 0;
      card.style.display = show ? '' : 'none';
    }});
  }});
}});
document.getElementById('search').addEventListener('input', e => {{
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.card').forEach(card => {{
    const i = ISSUES.find(x => x.n === +card.dataset.n);
    card.style.display = (i.title + ' #' + i.n).toLowerCase().includes(q) ? '' : 'none';
  }});
}});
</script>
</body>
</html>'''

    out = os.path.join(os.path.dirname(__file__), '..', 'tmp', 'issue-tracker.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Wrote {out} — {open_count} tickets, {ready_count} ready ({source})")

if __name__ == '__main__':
    main()
