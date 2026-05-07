// Dashboard — overview of the construction company

function Dashboard({ t = (k) => k }) {
  const M = window.MOCK;
  const totalBudget = M.PROJECTS.reduce((a,p) => a + p.budget, 0);
  const totalSpent = M.PROJECTS.reduce((a,p) => a + p.spent, 0);
  const activeProjects = M.PROJECTS.filter(p => p.status === "active" || p.status === "at-risk").length;
  const receivables = M.PARTNERS.filter(p => p.balance > 0).reduce((a,p) => a + p.balance, 0);
  const payables = M.PARTNERS.filter(p => p.balance < 0).reduce((a,p) => a + Math.abs(p.balance), 0);

  return (
    <>
      <PageHead
        eyebrow={t("greet_eyebrow")}
        title={t("greet_title")}
        sub={t("greet_sub")}
        actions={<>
          <button className="btn"><Icon.Filter size={14}/> {t("btn_filter")}</button>
          <button className="btn btn-primary"><Icon.Plus size={14}/> {t("btn_new_project")}</button>
        </>}
      />

      <div className="stat-band">
        <div className="stat">
          <div className="stat-label"><Icon.Building size={11}/> {t("s_active")}</div>
          <div className="stat-val">{activeProjects}<span className="unit">{t("s_of")} {M.PROJECTS.length}</span></div>
          <div className="stat-meta"><span className="delta up">+1</span><span>{t("s_vs_last")}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label"><Icon.Wallet size={11}/> {t("s_spent")}</div>
          <div className="stat-val">${(totalSpent/1000).toFixed(0)}<span className="unit">k / ${(totalBudget/1000).toFixed(0)}k</span></div>
          <div className="stat-meta"><Bar value={totalSpent} max={totalBudget} /></div>
        </div>
        <div className="stat">
          <div className="stat-label"><Icon.ArrowDown size={11}/> {t("s_recv")}</div>
          <div className="stat-val" style={{ color: "var(--good)" }}>${(receivables/1000).toFixed(1)}<span className="unit">k</span></div>
          <div className="stat-meta"><span className="delta up">3 {t("s_clients")}</span><span>{t("s_overdue")}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label"><Icon.ArrowUp size={11}/> {t("s_pay")}</div>
          <div className="stat-val" style={{ color: "var(--bad)" }}>${(payables/1000).toFixed(1)}<span className="unit">k</span></div>
          <div className="stat-meta"><span className="delta down">4 {t("s_suppliers")}</span><span>{t("s_due_in")}</span></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--s-10)" }}>
        <div>
          <section className="section">
            <SectionHead title={t("sec_inflight")} link={t("see_all")} count={activeProjects} />
            <div>
              <div className="proj-row h">
                <div>{t("col_project")}</div><div>{t("col_status")}</div><div>{t("col_budget")}</div><div>{t("col_due")}</div><div>{t("col_crew")}</div>
              </div>
              {M.PROJECTS.filter(p => p.status !== "complete").map(p => (
                <div className="proj-row" key={p.id}>
                  <div className="proj-name">
                    <span className="proj-name-t">{p.name}</span>
                    <span className="proj-name-s">{p.code} · {p.client} · {p.site}</span>
                  </div>
                  <div><StatusTag status={p.status} /></div>
                  <div className="proj-budget">
                    <Bar value={p.spent} max={p.budget} over={p.spent/p.budget > 0.9 && p.status !== "complete"} />
                    <div className="proj-budget-l">
                      <span className="a">${(p.spent/1000).toFixed(0)}k</span>
                      <span className="b">/ ${(p.budget/1000).toFixed(0)}k</span>
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{p.due}</div>
                  <div className="row" style={{ gap: 4 }}>
                    <span className="av-stack">
                      {Array.from({length: Math.min(3, p.crew)}).map((_,i) =>
                        <Avatar key={i} name={`X${i}`} hue={(p.id.charCodeAt(2)*37 + i*60)%360}/>)}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>+{p.crew - 3}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <SectionHead title={t("sec_qactions")} />
            <div className="actions-grid">
              {[
                { i: "Plus",     k: "E" },
                { i: "Invoices", k: "I" },
                { i: "Items",    k: "R" },
                { i: "Truck",    k: "A" },
                { i: "Employees",k: "P" },
                { i: "Partners", k: "S" },
                { i: "Reports",  k: "G" },
                { i: "Folder",   k: "U" },
              ].map((a, idx) => {
                const Ic = Icon[a.i];
                const qa = (window.T?.[t._lang]?.qa || window.T.en.qa)[idx];
                return (
                  <div className="qa" key={idx}>
                    <Ic className="qa-icon" />
                    <div className="qa-title">{qa.t}</div>
                    <div className="qa-sub">{qa.s}</div>
                    <span className="qa-shortcut">{a.k}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <SectionHead title={t("sec_recent")} link={t("see_ledger")} />
            <table className="tbl">
              <thead><tr>
                <th>{t("col_date")}</th><th>{t("col_desc")}</th><th>{t("col_project")}</th><th>{t("col_type")}</th><th>{t("col_by")}</th><th className="num">{t("col_amount")}</th>
              </tr></thead>
              <tbody>
                {M.EXPENSES.slice(0, 6).map(x => (
                  <tr key={x.id}>
                    <td className="mono muted" style={{fontSize: 12}}>{x.date}</td>
                    <td><span className="cell-bold">{x.desc}</span></td>
                    <td className="muted">{x.project}</td>
                    <td><Tag kind={x.type === "in-use" ? "accent" : ""}>{x.type === "in-use" ? t("inuse") : t("consumable")}</Tag></td>
                    <td className="muted" style={{fontSize: 12}}>{x.by}</td>
                    <td className="num"><Money value={-x.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div>
          <section className="section">
            <SectionHead title={t("sec_activity")} link={t("inbox")} />
            <div className="feed">
              {M.ACTIVITY.map((a,i) => (
                <div className="feed-item" key={i}>
                  <div className="feed-time">{a.time}</div>
                  <div className="feed-text" dangerouslySetInnerHTML={{__html: a.text}} />
                  <div className="feed-meta">{a.project}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <SectionHead title={t("sec_alerts")} />
            <div className="feed">
              {M.ITEMS.filter(i => i.stock < i.reorder * 1.2 && i.category === "Consumable").map(i => (
                <div className="feed-item" key={i.id} style={{ gridTemplateColumns: "1fr auto" }}>
                  <div>
                    <div className="cell-bold">{i.name}</div>
                    <div className="cell-sub muted">{i.sku} · {t("reorder_at")} {i.reorder} {i.unit}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono cell-bold" style={{ color: i.stock < i.reorder ? "var(--bad)" : "var(--warn)" }}>
                      {i.stock} {i.unit}
                    </div>
                    <div className="cell-sub muted">{t("on_hand")}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

window.Dashboard = Dashboard;
