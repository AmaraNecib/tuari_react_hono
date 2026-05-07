// Projects list + detail

function ProjectsPage({ onOpen }) {
  const M = window.MOCK;
  const [tab, setTab] = React.useState("all");
  const filtered = M.PROJECTS.filter(p =>
    tab === "all" ? true : tab === "active" ? p.status === "active" :
    tab === "risk" ? p.status === "at-risk" : tab === "paused" ? p.status === "paused" :
    p.status === "complete"
  );
  return (
    <>
      <PageHead
        eyebrow="Operations"
        title='<b>Projects</b>'
        sub="All construction work, past and present. Open a project to see budget, crew, expenses and assets on site."
        actions={<>
          <button className="btn"><Icon.Filter size={14}/> Filter</button>
          <button className="btn btn-primary"><Icon.Plus size={14}/> New Project</button>
        </>}
      />
      <div className="tabs">
        {[["all","All",M.PROJECTS.length],["active","Active",4],["risk","At risk",1],["paused","Paused",1],["complete","Complete",1]].map(([k,l,c]) => (
          <div key={k} className={"tab" + (tab===k?" is-active":"")} onClick={()=>setTab(k)}>{l}<span className="tab-count">{c}</span></div>
        ))}
      </div>
      <div className="filters">
        <div className="chip is-active">All sites</div>
        <div className="chip">Beirut</div>
        <div className="chip">Mount Lebanon</div>
        <div className="chip">Bekaa</div>
        <div className="spacer"/>
        <div className="chip">Sort: Due date <Icon.ChevronD size={11}/></div>
      </div>

      <div>
        <div className="proj-row h">
          <div>Project</div><div>Status</div><div>Budget</div><div>Due</div><div>Crew</div>
        </div>
        {filtered.map(p => (
          <div className="proj-row" key={p.id} onClick={()=>onOpen(p.id)}>
            <div className="proj-name">
              <span className="proj-name-t">{p.name}</span>
              <span className="proj-name-s">{p.code} · {p.client} · {p.site} · PM {p.manager}</span>
            </div>
            <div><StatusTag status={p.status}/></div>
            <div className="proj-budget">
              <Bar value={p.spent} max={p.budget} over={p.spent/p.budget > 0.9 && p.status !== "complete"} />
              <div className="proj-budget-l">
                <span className="a">${(p.spent/1000).toFixed(0)}k</span>
                <span className="b">/ ${(p.budget/1000).toFixed(0)}k · {Math.round(p.progress*100)}%</span>
              </div>
            </div>
            <div className="mono" style={{fontSize:12,color:"var(--ink-2)"}}>{p.due}</div>
            <div className="row" style={{gap:4}}>
              <span className="av-stack">
                {Array.from({length:Math.min(3,p.crew)}).map((_,i)=>
                  <Avatar key={i} name={`X${i}`} hue={(p.id.charCodeAt(2)*37+i*60)%360}/>)}
              </span>
              {p.crew>3 && <span className="mono" style={{fontSize:11,color:"var(--ink-3)"}}>+{p.crew-3}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ProjectDetail({ id, onBack }) {
  const M = window.MOCK;
  const p = M.PROJECTS.find(x => x.id === id) || M.PROJECTS[0];
  const projExpenses = M.EXPENSES.filter(x => x.project.includes(p.name.split(" ")[0]));
  const projAssets = M.ASSIGNMENTS.filter(a => p.name.includes(a.to.split(" ")[0]));
  return (
    <>
      <PageHead
        eyebrow={<><a className="section-link" onClick={(e)=>{e.preventDefault();onBack();}} href="#">← Projects</a> &nbsp; · &nbsp; {p.code}</>}
        title={`<b>${p.name}</b>`}
        sub={`${p.client} · ${p.site} · Project Manager ${p.manager}`}
        actions={<>
          <button className="btn"><Icon.More size={14}/></button>
          <button className="btn"><Icon.Plus size={14}/> Log expense</button>
          <button className="btn btn-primary"><Icon.Invoices size={14}/> Bill client</button>
        </>}
      />

      <div className="stat-band">
        <div className="stat">
          <div className="stat-label">Status</div>
          <div className="stat-val" style={{fontSize:24,fontStyle:"normal",fontFamily:"var(--font-body)",fontWeight:500}}><StatusTag status={p.status}/></div>
          <div className="stat-meta"><span>Started {p.started}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Progress</div>
          <div className="stat-val">{Math.round(p.progress*100)}<span className="unit">%</span></div>
          <div className="stat-meta"><Bar value={p.progress}/></div>
        </div>
        <div className="stat">
          <div className="stat-label">Budget used</div>
          <div className="stat-val">${(p.spent/1000).toFixed(0)}<span className="unit">k of ${(p.budget/1000).toFixed(0)}k</span></div>
          <div className="stat-meta">
            <span className={"delta " + (p.spent/p.budget > 0.9 ? "down" : "up")}>{Math.round(p.spent/p.budget*100)}%</span>
            <span>{p.spent/p.budget > 0.9 ? "over forecast" : "on track"}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Due</div>
          <div className="stat-val" style={{fontSize:24}}>{p.due}</div>
          <div className="stat-meta"><span>{p.crew} crew on site</span></div>
        </div>
      </div>

      <div className="split">
        <div>
          <section className="section">
            <SectionHead title='<b>Expenses</b> on this project' link="Full ledger" count={projExpenses.length}/>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {projExpenses.map(x => (
                  <tr key={x.id}>
                    <td className="mono muted" style={{fontSize:12}}>{x.date}</td>
                    <td className="cell-bold">{x.desc}</td>
                    <td className="muted">{x.cat}</td>
                    <td><Tag kind={x.type==="in-use"?"accent":""}>{x.type==="in-use"?"In-Use":"Consumable"}</Tag></td>
                    <td className="num"><Money value={-x.amount}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="section">
            <SectionHead title='Assets <b>on site</b>' count={projAssets.length}/>
            <table className="tbl">
              <thead><tr><th>Asset</th><th>SKU</th><th>Held by</th><th>Since</th><th></th></tr></thead>
              <tbody>
                {projAssets.map(a => (
                  <tr key={a.item}>
                    <td className="cell-bold">{a.item}</td>
                    <td className="mono muted" style={{fontSize:12}}>{a.sku}</td>
                    <td><span className="row" style={{gap:6}}><Avatar name={a.holder}/><span>{a.holder}</span></span></td>
                    <td className="mono muted" style={{fontSize:12}}>{a.since}</td>
                    <td className="num"><a className="section-link" href="#" onClick={e=>e.preventDefault()}>Return</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="section">
            <SectionHead title='<b>Crew</b>' count={p.crew}/>
            <table className="tbl">
              <thead><tr><th></th><th>Name</th><th>Role</th><th>Hired</th><th>Phone</th><th className="num">Salary</th></tr></thead>
              <tbody>
                {M.EMPLOYEES.filter(e => e.project === p.name.split(" ")[0] || e.project.includes(p.name.split(" ")[0])).slice(0,5).map(e => (
                  <tr key={e.id}>
                    <td><Avatar initials={e.initials} name={e.name}/></td>
                    <td className="cell-bold">{e.name}</td>
                    <td className="muted">{e.role}</td>
                    <td className="mono muted" style={{fontSize:12}}>{e.hire}</td>
                    <td className="mono muted" style={{fontSize:12}}>{e.phone}</td>
                    <td className="num"><Money value={e.salary}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="aside">
          <div className="aside-block">
            <div className="aside-h">Client</div>
            <div className="cell-bold">{p.client}</div>
            <div className="aside-row"><span className="k">Contract</span><span className="v">${(p.budget).toLocaleString()}</span></div>
            <div className="aside-row"><span className="k">Billed YTD</span><span className="v">${(p.spent*0.85).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
            <div className="aside-row"><span className="k">Outstanding</span><span className="v" style={{color:"var(--good)"}}>${(p.budget*0.10).toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
          </div>
          <div className="aside-block">
            <div className="aside-h">Schedule</div>
            <div className="aside-row"><span className="k">Started</span><span className="v mono">{p.started}</span></div>
            <div className="aside-row"><span className="k">Due</span><span className="v mono">{p.due}</span></div>
            <div className="aside-row"><span className="k">Days remaining</span><span className="v">{Math.round((new Date(p.due) - new Date('2026-05-07'))/86400000)}</span></div>
          </div>
          <div className="aside-block">
            <div className="aside-h">Documents</div>
            {["Contract.pdf","Permit-2025-441.pdf","Site-plan-rev3.dwg","Insurance-cert.pdf"].map(d => (
              <div key={d} className="aside-row"><span className="k row" style={{gap:6}}><Icon.Folder size={12}/> {d}</span><span className="muted mono" style={{fontSize:11}}>↓</span></div>
            ))}
          </div>
          <div className="aside-block">
            <div className="aside-h">Site photos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div className="slot" style={{aspectRatio:"1",fontSize:9}}>SITE PHOTO</div>
              <div className="slot" style={{aspectRatio:"1",fontSize:9}}>SITE PHOTO</div>
              <div className="slot" style={{aspectRatio:"1",fontSize:9}}>SITE PHOTO</div>
              <div className="slot" style={{aspectRatio:"1",fontSize:9}}>+ 12 MORE</div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

window.ProjectsPage = ProjectsPage;
window.ProjectDetail = ProjectDetail;
