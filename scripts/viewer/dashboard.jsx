import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { overview, signatures, timeline, lookup, context } from './model.mjs';
import './dashboard.css';
const data = JSON.parse(document.getElementById('report-data').textContent);
const summary = overview(data);
const groups = signatures(data);
const signatureOptions = [...new Set(data.events.map(event => event.signature))];
const code = event => event.errorCode === null ? 'No error code' : `${data.productPrefix}-${event.errorCode.toString(16).toUpperCase().padStart(8, '0')}`;
const pageSize = 50;
function PageControls({ total, page, setPage }) {
  if (total <= pageSize) return null;
  return <div aria-label="Result pages" role="group">
    <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
    <span role="status"> Page {page + 1} of {Math.ceil(total / pageSize)} </span>
    <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Next page</button>
  </div>;
}
function App() {
  const [view, setView] = useState('Overview');
  const [filters, setFilters] = useState({});
  const [selection, setSelection] = useState(null);
  const selected = selection?.id ?? null;
  const panel = useRef(null);
  const opener = useRef(null);
  const fallback = useRef(null);
  const [groupPage, setGroupPage] = useState(0);
  const [matchPage, setMatchPage] = useState(0);
  useLayoutEffect(() => {
    if (selection) panel.current?.focus();
  }, [selection]);
  const [input, setInput] = useState('');
  const [matches, setMatches] = useState(null);
  const [limit, setLimit] = useState(500);
  const events = useMemo(() => view === 'Timeline' ? timeline(data, filters) : [], [view, filters]);
  function select(id, trigger) {
    if (!panel.current?.contains(trigger)) opener.current = trigger;
    setSelection({ id });
  }
  function closeContext() {
    setSelection(null);
    (opener.current?.isConnected ? opener.current : fallback.current)?.focus();
  }
  function rows(items) {
    return <ol className="events">{items.map(event => <li key={event.id} className={event.id === selected ? 'selected' : ''}>
      <time>{event.timestamp}</time><span className={`level ${event.level}`}>{event.level}</span>
      <div><strong>{event.signature || 'No signature'}</strong><small>{event.source} · {event.count} occurrence{event.count === 1 ? '' : 's'}{event.duration !== null ? ` · ${event.duration} ms` : ''}</small></div>
      {['error', 'fatal'].includes(event.level) ? <button onClick={click => select(event.id, click.currentTarget)} aria-label={`Show context for ${code(event)} at ${event.timestamp}`}>{code(event)} <span aria-hidden="true">↗</span></button> : <span className="muted">No error code</span>}
    </li>)}</ol>;
  }
  return <div className="shell">
    <aside><a className="brand" href="#main">{summary.product}<span>DIAGNOSTICS</span></a><div className="report-label">LOCAL REPORT</div>
      <nav aria-label="Report views">{['Overview', 'Error signatures', 'Timeline', 'Error-code lookup'].map((name, i) => <button key={name} aria-current={view === name ? 'page' : undefined} onClick={() => { setView(name); setSelection(null); }}><span className="nav-number">0{i + 1}</span>{name}</button>)}</nav>
      <div className="privacy"><span className="dot"/>Offline by design<p>No uploads. No external requests.<br/>This report stays on your device.</p></div></aside>
    <main id="main"><header><span>SUPPORT / DIAGNOSTICS REPORT</span><span className="local">LOCAL FILE</span></header>
      <div className="heading"><div><p className="eyebrow">{summary.product} · {summary.version}</p><h1>{view}</h1></div><p className="bundle">Bundle created<br/><strong>{summary.bundleDate}</strong></p></div>
      {view === 'Overview' && <>
        <p className="intro">A clear record of what happened.<br/>Start with the errors, then follow the events.</p>
        <section className="metrics" aria-label="Report summary"><div><span>Event occurrences</span><strong>{summary.events.toLocaleString()}</strong><small>{summary.records.toLocaleString()} log records</small></div><div><span>Days covered · UTC</span><strong>{summary.days.length}</strong><small>{summary.days.length ? `${summary.days[0]} to ${summary.days.at(-1)}` : 'No events'}</small></div><div><span>Error signatures</span><strong>{groups.length}</strong><small>Error and fatal events</small></div></section>
        <section className="panel"><h2>Bundle details</h2><dl>{[['Product', summary.product], ['Version', summary.version], ['Operating system', summary.os], ['Build', summary.build], ['Bundle date', summary.bundleDate]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
        <section className="panel"><h2>Where to start</h2><p>{groups.length ? `${groups[0].signature} is the most frequent error signature, with ${groups[0].count} occurrences.` : 'No error or fatal events were recorded.'}</p><button className="primary" onClick={() => setView('Error signatures')}>Inspect error signatures →</button></section>
      </>}
      {view === 'Error signatures' && <><p className="intro">Most frequent first. Counts include repeated occurrences.</p><p className="note">Version and OS describe the bundle manifest, not individual events. Raw messages remain redacted.</p>
        {groups.length ? <div className="signature-list">{groups.slice(groupPage * pageSize, (groupPage + 1) * pageSize).map((group, i) => <article className="panel signature" key={group.signature}><div className="rank">{String(groupPage * pageSize + i + 1).padStart(2, '0')}</div><div className="signature-body"><h2>{group.signature}</h2><p>{group.versions.join(', ')} · {group.oses.join(', ')}</p><dl><div><dt>First seen</dt><dd>{group.first}</dd></div><div><dt>Last seen</dt><dd>{group.last}</dd></div></dl><button onClick={() => { setFilters({ signature: group.signature }); setView('Timeline'); }}>View matching events →</button></div><div className="frequency"><strong>{group.count}</strong><span>occurrences</span></div></article>)}<PageControls total={groups.length} page={groupPage} setPage={setGroupPage}/></div> : <p className="empty">No error signatures in this report.</p>}</>}
      {view === 'Timeline' && <><p className="intro">Follow the event stream. All dates are filtered in UTC.</p><div className="filters">{[['day', summary.days], ['level', ['trace', 'debug', 'info', 'warn', 'error', 'fatal']], ['signature', signatureOptions]].map(([key, options]) => <label key={key}>{key}<select ref={key === 'day' ? fallback : undefined} aria-label={key} value={filters[key] ?? ''} onChange={event => setFilters({ ...filters, [key]: event.target.value })}><option value="">All {key === 'day' ? 'days' : key === 'level' ? 'levels' : 'signatures'}</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>)}<button onClick={() => setFilters({})}>Reset filters</button></div><p className="note" role="status">{events.length} matching records</p>{events.length ? rows(events.slice(0, limit)) : <p className="empty">No events match these filters.</p>}{events.length > limit && <button onClick={() => setLimit(limit + 500)}>Show next 500 records</button>}</>}
      {view === 'Error-code lookup' && <><p className="intro">One code. The event and what led to it.</p><form className="panel lookup" onSubmit={event => { event.preventDefault(); const found = lookup(data, input); setMatches(found); setMatchPage(0); if (found.length === 1) select(found[0].id, event.currentTarget.querySelector('button')); else setSelection(null); }}><label htmlFor="error-code">Error code</label><div><input ref={fallback} id="error-code" value={input} onChange={event => setInput(event.target.value)} placeholder={`${data.productPrefix}-0000002A`} spellCheck="false" autoComplete="off"/><button className="primary">Find event →</button></div><p className="note">Any product prefix is accepted. Use eight hexadecimal digits after the final hyphen.</p></form>{matches !== null && <section aria-live="polite"><h2>{matches.length} matching record{matches.length === 1 ? '' : 's'}</h2>{matches.length ? <><p className="note">Codes may repeat. Select a timestamp to inspect its context.</p>{rows(matches.slice(matchPage * pageSize, (matchPage + 1) * pageSize))}<PageControls total={matches.length} page={matchPage} setPage={setMatchPage}/></> : <p className="empty">No match. Check the code or try another report.</p>}</section>}</>}
      {selected !== null && <section className="panel context" ref={panel} tabIndex={-1} aria-label="Event context"><div className="context-title"><h2>Surrounding context</h2><button onClick={closeContext}>Close context</button></div><p className="note">Up to three records before and after, across all filters. The selected event is highlighted.</p>{rows(context(data, selected))}</section>}
      {!!data.warnings?.length && <section className="warnings"><h2>Incomplete input</h2>{data.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</section>}
      <footer>Sanitized diagnostics · Missing metadata is shown as unavailable · No network required</footer>
    </main></div>;
}
createRoot(document.getElementById('report')).render(<App/>);
