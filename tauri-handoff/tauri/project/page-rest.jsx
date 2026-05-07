// Warehouse / Items, Expenses, Invoices, Partners, Employees, Analytics

function WarehousePage() {
  const M = window.MOCK;
  const [tab, setTab] = React.useState("all");
  const items = M.ITEMS.filter(i =>
    tab === "all" ? true :
    tab === "consumable" ? i.category === "Consumable" :
    tab === "asset" ? i.category === "In-Use Asset" :
    i.stock < i.reorder * 1.2
  );
  const totalValue = M.ITEMS.reduce((a,i) => a + i.stock * i.value, 0);
  const lowCount = M.ITEMS.filter(i => i.stock < i.reorder).length;

  return (<>
    <PageHead eyebrow="Operations" title='<b>Warehouse</b>'
      sub="Consumables get used up. In-Use assets stay on the books and get assigned to projects, employees, or vehicles."
      actions={<>
        <button className="btn"><Icon.Truck size={14}/> Receive stock</button>
        <button className="btn btn-primary"><Icon.Plus size={14}/> New item</button>
      </>}/>
    <div className="stat-band">
      <div className="stat"><div className="stat-label">Total items</div>
        <div className="stat-val">{M.ITEMS.length}<span className="unit">SKUs</span></div>
        <div className="stat-meta"><span>{M.ITEMS.filter(i=>i.category==="In-Use Asset").length} assets · {M.ITEMS.filter(i=>i.category==="Consumable").length} consumables</span></div></div>
      <div className="stat"><div className="stat-label">On-hand value</div>
        <div className="stat-val">${(totalValue/1000).toFixed(1)}<span className="unit">k</span></div>
        <div className="stat-meta"><span className="delta up">+$8.2k</span><span>this month</span></div></div>
      <div className="stat"><div className="stat-label">Low stock</div>
        <div className="stat-val" style={{color:"var(--bad)"}}>{lowCount}<span className="unit">items</span></div>
        <div className="stat-meta"><span>below reorder threshold</span></div></div>
      <div className="stat"><div className="stat-label">Assigned</div>
        <div className="stat-val">{M.ASSIGNMENTS.length}<span className="unit">in field</span></div>
        <div className="stat-meta"><span>across {new Set(M.ASSIGNMENTS.map(a=>a.to)).size} projects</span></div></div>
    </div>

    <div className="tabs">
      {[["all","All",M.ITEMS.length],["consumable","Consumables",6],["asset","In-Use Assets",4],["low","Low stock",lowCount]].map(([k,l,c]) =>
        <div key={k} className={"tab"+(tab===k?" is-active":"")} onClick={()=>setTab(k)}>{l}<span className="tab-count">{c}</span></div>)}
    </div>

    <div>
      <div className="item-row h">
        <div></div><div>Item</div><div>Category</div><div>SKU</div><div className="num">Stock</div><div className="num">Value</div><div></div>
      </div>
      {items.map(i => (
        <div className="item-row" key={i.id}>
          <div className="item-thumb"><Icon.Items size={14}/></div>
          <div>
            <div className="cell-bold">{i.name}</div>
            <div className="cell-sub muted">{i.location}</div>
          </div>
          <div><Tag kind={i.category==="In-Use Asset"?"accent":""}>{i.category}</Tag></div>
          <div className="mono muted" style={{fontSize:12}}>{i.sku}</div>
          <div className="num">
            <span style={{color: i.stock<i.reorder?"var(--bad)":i.stock<i.reorder*1.2?"var(--warn)":"var(--ink)", fontWeight:500}}>
              {i.stock}
            </span> <span className="muted">{i.unit}</span>
          </div>
          <div className="num"><Money value={i.value*i.stock}/></div>
          <div><Icon.More size={14} className="muted"/></div>
        </div>
      ))}
    </div>

    <section className="section" style={{marginTop:"var(--s-10)"}}>
      <SectionHead title='Currently <b>assigned</b>' count={M.ASSIGNMENTS.length}/>
      <table className="tbl">
        <thead><tr><th>Asset</th><th>SKU</th><th>Project</th><th>Held by</th><th>Since</th><th></th></tr></thead>
        <tbody>
          {M.ASSIGNMENTS.map(a => (
            <tr key={a.item}>
              <td className="cell-bold">{a.item}</td>
              <td className="mono muted" style={{fontSize:12}}>{a.sku}</td>
              <td><Tag kind="accent">{a.to}</Tag></td>
              <td><span className="row" style={{gap:6}}><Avatar name={a.holder}/><span>{a.holder}</span></span></td>
              <td className="mono muted" style={{fontSize:12}}>{a.since}</td>
              <td className="num"><a className="section-link" href="#" onClick={e=>e.preventDefault()}>Reassign</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>);
}

function ExpensesPage() {
  const M = window.MOCK;
  const [tab, setTab] = React.useState("all");
  const filtered = M.EXPENSES.filter(x =>
    tab === "all" ? true : tab === "pending" ? !x.approved : x.type === tab);
  const total = M.EXPENSES.reduce((a,x) => a + x.amount, 0);
  const byCat = M.EXPENSES.reduce((a,x) => ((a[x.cat]=(a[x.cat]||0)+x.amount), a), {});

  return (<>
    <PageHead eyebrow="Operations" title='<b>Expenses</b>'
      sub="Every dollar that leaves the company. Tag with a project to attribute cost; mark as Consumable (used up) or In-Use (kept on books)."
      actions={<>
        <button className="btn"><Icon.Filter size={14}/> Filter</button>
        <button className="btn btn-primary"><Icon.Plus size={14}/> Log expense</button>
      </>}/>
    <div className="stat-band">
      <div className="stat"><div className="stat-label">This week</div>
        <div className="stat-val">${total.toLocaleString()}</div>
        <div className="stat-meta"><span className="delta down">+$1,840</span><span>vs. last week</span></div></div>
      <div className="stat"><div className="stat-label">Pending approval</div>
        <div className="stat-val" style={{color:"var(--warn)"}}>1<span className="unit">expense</span></div>
        <div className="stat-meta"><span>$540 — Van service</span></div></div>
      <div className="stat"><div className="stat-label">Top category</div>
        <div className="stat-val" style={{fontSize:24}}>Materials</div>
        <div className="stat-meta"><span>${byCat.Materials?.toLocaleString()} · 39%</span></div></div>
      <div className="stat"><div className="stat-label">In-Use assets</div>
        <div className="stat-val">${(byCat.Vehicle||0)+(byCat.Telecom||0)}</div>
        <div className="stat-meta"><span>vehicle + telecom</span></div></div>
    </div>

    <div className="tabs">
      {[["all","All",M.EXPENSES.length],["consumable","Consumables",6],["in-use","In-Use",2],["pending","Pending",1]].map(([k,l,c]) =>
        <div key={k} className={"tab"+(tab===k?" is-active":"")} onClick={()=>setTab(k)}>{l}<span className="tab-count">{c}</span></div>)}
    </div>

    <table className="tbl">
      <thead><tr>
        <th></th><th>Date</th><th>Description</th><th>Project</th><th>Category</th><th>Type</th><th>Logged by</th><th className="num">Amount</th>
      </tr></thead>
      <tbody>
        {filtered.map(x => (
          <tr key={x.id}>
            <td>{x.approved
              ? <span style={{color:"var(--good)"}}><Icon.Check size={14}/></span>
              : <Tag kind="warn">Pending</Tag>}</td>
            <td className="mono muted" style={{fontSize:12}}>{x.date}</td>
            <td className="cell-bold">{x.desc}</td>
            <td><Tag>{x.project}</Tag></td>
            <td className="muted">{x.cat}</td>
            <td><Tag kind={x.type==="in-use"?"accent":""}>{x.type==="in-use"?"In-Use":"Consumable"}</Tag></td>
            <td className="muted">{x.by}</td>
            <td className="num"><Money value={-x.amount}/></td>
          </tr>
        ))}
      </tbody>
    </table>
  </>);
}

function InvoicesPage() {
  const M = window.MOCK;
  const out = M.INVOICES.filter(i => i.dir === "out");
  const inn = M.INVOICES.filter(i => i.dir === "in");
  const owed = out.filter(i=>i.status!=="paid").reduce((a,i)=>a+i.amount,0);
  const owe = inn.filter(i=>i.status!=="paid").reduce((a,i)=>a+i.amount,0);

  return (<>
    <PageHead eyebrow="Money" title='<b>Invoices</b> & bills'
      sub="What clients owe us, and what we owe suppliers. Overdue items are flagged for follow-up."
      actions={<>
        <button className="btn"><Icon.Plus size={14}/> Record bill</button>
        <button className="btn btn-primary"><Icon.Plus size={14}/> Create invoice</button>
      </>}/>

    <div className="ledger-head">
      <div>
        <div className="ledger-h">Receivable</div>
        <div className="ledger-v" style={{color:"var(--good)"}}>${owed.toLocaleString()}</div>
        <div className="muted" style={{fontSize:12,marginTop:4}}>{out.filter(i=>i.status!=="paid").length} open invoices</div>
      </div>
      <div>
        <div className="ledger-h">Payable</div>
        <div className="ledger-v" style={{color:"var(--bad)"}}>${owe.toLocaleString()}</div>
        <div className="muted" style={{fontSize:12,marginTop:4}}>{inn.filter(i=>i.status!=="paid").length} open bills</div>
      </div>
      <div>
        <div className="ledger-h">Net position</div>
        <div className="ledger-v">${(owed-owe).toLocaleString()}</div>
        <div className="muted" style={{fontSize:12,marginTop:4}}>positive — you are net creditor</div>
      </div>
    </div>

    <section className="section">
      <SectionHead title='<b>Receivable</b> — invoices to clients' count={out.length}/>
      <table className="tbl">
        <thead><tr><th>#</th><th>Client</th><th>Project</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {out.map(i => (
            <tr key={i.id}>
              <td className="mono cell-bold" style={{fontSize:12}}>{i.id}</td>
              <td>{i.party}</td>
              <td className="muted">{i.project}</td>
              <td className="mono muted" style={{fontSize:12}}>{i.date}</td>
              <td className="mono muted" style={{fontSize:12}}>{i.due}</td>
              <td><StatusTag status={i.status}/></td>
              <td className="num"><Money value={i.amount} signed/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section className="section">
      <SectionHead title='<b>Payable</b> — supplier bills' count={inn.length}/>
      <table className="tbl">
        <thead><tr><th>#</th><th>Supplier</th><th>Project</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {inn.map(i => (
            <tr key={i.id}>
              <td className="mono cell-bold" style={{fontSize:12}}>{i.id}</td>
              <td>{i.party}</td>
              <td className="muted">{i.project}</td>
              <td className="mono muted" style={{fontSize:12}}>{i.date}</td>
              <td className="mono muted" style={{fontSize:12}}>{i.due}</td>
              <td><StatusTag status={i.status}/></td>
              <td className="num"><Money value={-i.amount} signed/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>);
}

function PartnersPage() {
  const M = window.MOCK;
  const [tab, setTab] = React.useState("all");
  const list = M.PARTNERS.filter(p => tab==="all" ? true : p.type.toLowerCase()===tab);
  return (<>
    <PageHead eyebrow="Money" title='<b>Partners</b>'
      sub="External clients and suppliers. Track running balances, debt, and lifetime value."
      actions={<>
        <button className="btn"><Icon.Filter size={14}/> Filter</button>
        <button className="btn btn-primary"><Icon.Plus size={14}/> New partner</button>
      </>}/>

    <div className="tabs">
      {[["all","All",M.PARTNERS.length],["client","Clients",3],["supplier","Suppliers",4]].map(([k,l,c]) =>
        <div key={k} className={"tab"+(tab===k?" is-active":"")} onClick={()=>setTab(k)}>{l}<span className="tab-count">{c}</span></div>)}
    </div>

    <table className="tbl">
      <thead><tr><th>Partner</th><th>Type</th><th>Category</th><th>Last activity</th><th className="num">YTD volume</th><th className="num">Balance</th></tr></thead>
      <tbody>
        {list.map(p => (
          <tr key={p.id}>
            <td>
              <div className="row" style={{gap:10}}>
                <Avatar name={p.name} hue={(p.id.charCodeAt(3)*73)%360}/>
                <span className="cell-bold">{p.name}</span>
              </div>
            </td>
            <td><Tag kind={p.type==="Client"?"accent":""}>{p.type}</Tag></td>
            <td className="muted">{p.category}</td>
            <td className="muted mono" style={{fontSize:12}}>{p.last}</td>
            <td className="num"><Money value={p.ytd}/></td>
            <td className="num">
              <Money value={p.balance} signed/>
              <div className="cell-sub muted">{p.balance>0?"they owe us":"we owe them"}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </>);
}

function EmployeesPage() {
  const M = window.MOCK;
  const debtTotal = M.EMPLOYEES.reduce((a,e) => a + e.debt, 0);
  const totalSalary = M.EMPLOYEES.reduce((a,e) => a + e.salary, 0);
  return (<>
    <PageHead eyebrow="People" title='<b>Employees</b>'
      sub="Crew, salaries, and outstanding advances. Debt is what an employee owes back to the company — usually a salary advance."
      actions={<>
        <button className="btn"><Icon.Wallet size={14}/> Run payroll</button>
        <button className="btn btn-primary"><Icon.Plus size={14}/> New employee</button>
      </>}/>
    <div className="stat-band">
      <div className="stat"><div className="stat-label">Headcount</div>
        <div className="stat-val">{M.EMPLOYEES.length}</div><div className="stat-meta"><span>2 office · 6 field</span></div></div>
      <div className="stat"><div className="stat-label">Monthly payroll</div>
        <div className="stat-val">${(totalSalary/1000).toFixed(1)}<span className="unit">k</span></div>
        <div className="stat-meta"><span>next run May 31</span></div></div>
      <div className="stat"><div className="stat-label">Outstanding advances</div>
        <div className="stat-val" style={{color:"var(--warn)"}}>${debtTotal.toLocaleString()}</div>
        <div className="stat-meta"><span>{M.EMPLOYEES.filter(e=>e.debt>0).length} employees</span></div></div>
      <div className="stat"><div className="stat-label">Avg. tenure</div>
        <div className="stat-val">3.4<span className="unit">years</span></div>
        <div className="stat-meta"><span>longest: Rami H. — 9y</span></div></div>
    </div>

    <table className="tbl">
      <thead><tr><th></th><th>Name</th><th>Role</th><th>Project</th><th>Hired</th><th>Phone</th><th className="num">Salary</th><th className="num">Debt</th></tr></thead>
      <tbody>
        {M.EMPLOYEES.map(e => (
          <tr key={e.id}>
            <td><Avatar initials={e.initials} name={e.name}/></td>
            <td className="cell-bold">{e.name}</td>
            <td className="muted">{e.role}</td>
            <td><Tag>{e.project}</Tag></td>
            <td className="mono muted" style={{fontSize:12}}>{e.hire}</td>
            <td className="mono muted" style={{fontSize:12}}>{e.phone}</td>
            <td className="num"><Money value={e.salary}/></td>
            <td className="num">
              {e.debt > 0
                ? <span style={{color:"var(--bad)",fontFamily:"var(--font-mono)",fontWeight:500}}>−${e.debt}</span>
                : <span className="muted">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </>);
}

function AnalyticsPage() {
  const M = window.MOCK;
  // Build a fake 12-month series
  const months = ["Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May"];
  const revenue = [142,168,155,180,210,225,198,240,265,290,310,340];
  const cost = [108,132,128,140,165,180,160,200,215,238,256,280];

  const W = 760, H = 280, P = 32;
  const max = 360;
  const x = (i) => P + i * ((W - P*2) / (months.length - 1));
  const y = (v) => H - P - (v / max) * (H - P*2);
  const path = (arr) => arr.map((v,i) => (i?"L":"M") + x(i) + " " + y(v)).join(" ");
  const area = (arr) => path(arr) + ` L ${x(arr.length-1)} ${H-P} L ${x(0)} ${H-P} Z`;

  const projShare = M.PROJECTS.filter(p=>p.status!=="complete").map(p => ({
    name: p.name.split(" ").slice(0,2).join(" "),
    spent: p.spent, color: `oklch(0.6 0.12 ${(p.id.charCodeAt(2)*47)%360})`
  }));
  const totalSpent = projShare.reduce((a,p)=>a+p.spent,0);

  return (<>
    <PageHead eyebrow="Overview" title='<b>Analytics</b>'
      sub="Twelve-month view of revenue and cost, plus where money is being spent across projects."
      actions={<>
        <button className="btn">Last 12 months <Icon.ChevronD size={11}/></button>
        <button className="btn">Export <Icon.Arrow size={12}/></button>
      </>}/>

    <div className="stat-band">
      <div className="stat"><div className="stat-label">Revenue (12mo)</div>
        <div className="stat-val">$2.7<span className="unit">M</span></div>
        <div className="stat-meta"><span className="delta up">+18%</span><span>YoY</span></div></div>
      <div className="stat"><div className="stat-label">Cost</div>
        <div className="stat-val">$2.2<span className="unit">M</span></div>
        <div className="stat-meta"><span className="delta down">+22%</span><span>YoY</span></div></div>
      <div className="stat"><div className="stat-label">Gross margin</div>
        <div className="stat-val">19<span className="unit">%</span></div>
        <div className="stat-meta"><span className="delta down">−3.2pp</span><span>YoY</span></div></div>
      <div className="stat"><div className="stat-label">Projects delivered</div>
        <div className="stat-val">7</div>
        <div className="stat-meta"><span>1 ahead, 1 over budget</span></div></div>
    </div>

    <section className="section">
      <SectionHead title='<b>Revenue</b> vs. cost' link="Detailed report"/>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto"}}>
          {[0,90,180,270,360].map(v => (
            <g key={v}>
              <line x1={P} x2={W-P} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 4"/>
              <text x={4} y={y(v)+3} fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-3)">${v}k</text>
            </g>
          ))}
          {months.map((m,i) => (
            <text key={m} x={x(i)} y={H-10} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-3)">{m}</text>
          ))}
          <path d={area(revenue)} fill="var(--accent-soft)" opacity="0.7"/>
          <path d={path(revenue)} fill="none" stroke="var(--accent)" strokeWidth="2"/>
          <path d={path(cost)} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="4 3"/>
          {revenue.map((v,i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--accent)"/>)}
        </svg>
        <div className="chart-legend">
          <div className="legend-row"><div className="legend-l"><i style={{background:"var(--accent)"}}/>Revenue</div><div className="legend-v">$340k</div></div>
          <div className="legend-row"><div className="legend-l"><i style={{background:"var(--ink-2)"}}/>Cost</div><div className="legend-v">$280k</div></div>
          <div className="legend-row"><div className="legend-l">Gross profit</div><div className="legend-v" style={{color:"var(--good)"}}>$60k</div></div>
          <div className="legend-row"><div className="legend-l">Margin</div><div className="legend-v">17.6%</div></div>
        </div>
      </div>
    </section>

    <section className="section">
      <SectionHead title='Spend <b>by project</b>'/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 240px",gap:"var(--s-8)"}}>
        <div>
          <div style={{display:"flex",height:36,borderRadius:4,overflow:"hidden",border:"1px solid var(--line)"}}>
            {projShare.map(p => (
              <div key={p.name} style={{width:(p.spent/totalSpent*100)+"%",background:p.color}} title={p.name}/>
            ))}
          </div>
          <div style={{marginTop:"var(--s-4)"}}>
            <table className="tbl">
              <thead><tr><th></th><th>Project</th><th className="num">Spent</th><th className="num">Share</th></tr></thead>
              <tbody>
                {projShare.map(p => (
                  <tr key={p.name}>
                    <td style={{width:14}}><i style={{display:"inline-block",width:10,height:10,borderRadius:2,background:p.color}}/></td>
                    <td className="cell-bold">{p.name}</td>
                    <td className="num"><Money value={p.spent}/></td>
                    <td className="num">{(p.spent/totalSpent*100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="aside-block">
            <div className="aside-h">Spend by category</div>
            {[["Materials",42],["Labor",28],["Equipment",12],["Fuel",8],["Permits",6],["Other",4]].map(([k,v]) => (
              <div key={k} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:13,padding:"4px 0"}}>
                <span style={{flex:1}}>{k}</span>
                <div style={{flex:2,display:"flex",alignItems:"center",gap:8}}>
                  <Bar value={v} max={50}/>
                  <span className="mono muted" style={{width:32,textAlign:"right",fontSize:11}}>{v}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  </>);
}

Object.assign(window, { WarehousePage, ExpensesPage, InvoicesPage, PartnersPage, EmployeesPage, AnalyticsPage });
