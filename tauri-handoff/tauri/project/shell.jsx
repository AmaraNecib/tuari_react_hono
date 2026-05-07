// Sidebar + topbar + page chrome shared across screens.

const NAV_GROUPS = [
  { h: "g_overview", items: [
    { k: "dashboard", label: "nav_dashboard", icon: "Dashboard" },
    { k: "analytics", label: "nav_analytics", icon: "Analytics" },
  ]},
  { h: "g_ops", items: [
    { k: "projects",  label: "nav_projects",  icon: "Projects",  count: 5 },
    { k: "warehouse", label: "nav_warehouse", icon: "Warehouse", count: 184 },
    { k: "expenses",  label: "nav_expenses",  icon: "Expenses" },
  ]},
  { h: "g_money", items: [
    { k: "invoices",  label: "nav_invoices",  icon: "Invoices",  count: 8 },
    { k: "partners",  label: "nav_partners",  icon: "Partners",  count: 7 },
  ]},
  { h: "g_people", items: [
    { k: "employees", label: "nav_employees", icon: "Employees", count: 8 },
  ]},
  { h: "g_system", items: [
    { k: "reports",   label: "nav_reports",   icon: "Reports" },
    { k: "settings",  label: "nav_settings",  icon: "Settings" },
  ]},
];

function Sidebar({ active, onNav, t = (k) => k }) {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">T</div>
        <div className="sb-name">Tauri<b>{t("brand_sub")}</b></div>
      </div>
      <div className="sb-org">
        <div className="sb-org-init">KC</div>
        <div className="sb-org-name">{t("org")}</div>
        <Icon.ChevronD className="sb-org-chev" />
      </div>
      <nav className="sb-nav">
        {NAV_GROUPS.map(g => (
          <div className="sb-group" key={g.h}>
            <div className="sb-group-h">{t(g.h)}</div>
            {g.items.map(it => {
              const I = Icon[it.icon];
              return (
                <div key={it.k}
                     className={"sb-item" + (active === it.k ? " is-active" : "")}
                     onClick={() => onNav(it.k)}>
                  <I className="sb-icon" />
                  <span>{t(it.label)}</span>
                  {it.count != null && <span className="sb-count">{it.count}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sb-foot">
        <div className="sb-avatar">JK</div>
        <div style={{flex: 1, minWidth: 0}}>
          <div className="sb-user-name">Joseph Khoury</div>
          <div className="sb-user-role">{t("role")}</div>
        </div>
        <Icon.Help size={14} style={{ color: "var(--ink-3)" }} />
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [], onToggleTheme, dark, onToggleSidebar, t = (k) => k }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icon.SidebarToggle size={16}/>
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon.Chevron className="crumb-sep" size={12} />}
            <span className={i === crumbs.length - 1 ? "crumb-cur" : "crumb"}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-spacer" />
      <div className="search">
        <Icon.Search size={14} />
        <input placeholder={t("search")} />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
        {dark ? <Icon.Sun size={16}/> : <Icon.Moon size={16}/>}
      </button>
      <button className="icon-btn"><Icon.Bell size={16}/></button>
      <button className="btn btn-accent btn-sm"><Icon.Plus size={14}/> {t("btn_new")}</button>
    </div>
  );
}

function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <div className="page-h">
      <div className="page-h-l">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title" dangerouslySetInnerHTML={{__html: title}} />
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {actions && <div className="page-h-r">{actions}</div>}
    </div>
  );
}

function SectionHead({ title, link, actions, count }) {
  return (
    <div className="section-h">
      <h2 className="section-title" dangerouslySetInnerHTML={{__html: title}} />
      <div className="section-actions">
        {count != null && <span className="muted mono" style={{fontSize: 11}}>{count} total</span>}
        {actions}
        {link && <a className="section-link" onClick={(e)=>e.preventDefault()} href="#">{link} →</a>}
      </div>
    </div>
  );
}

function Tag({ kind, dot, children }) {
  return <span className={"tag" + (dot ? " dot" : "") + (kind ? " t-" + kind : "")}>{children}</span>;
}

function Avatar({ name, initials, hue }) {
  const ini = initials || name.split(" ").map(s=>s[0]).slice(0,2).join("").toUpperCase();
  const h = hue ?? (name.charCodeAt(0) * 47) % 360;
  return <span className="av" style={{ background: `oklch(0.55 0.10 ${h})` }}>{ini}</span>;
}

function Money({ value, signed }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return <span className={"money" + (signed ? (neg ? " neg" : " pos") : "")}>{neg ? "−" : signed ? "+" : ""}${formatted}</span>;
}

function Bar({ value, max = 1, over }) {
  const pct = Math.min(1, value / max);
  return <div className={"bar" + (over ? " over" : "")}><span style={{ width: (pct*100)+"%" }} /></div>;
}

function StatusTag({ status }) {
  const map = {
    active: ["good", "Active"],
    "at-risk": ["warn", "At risk"],
    paused: ["", "Paused"],
    complete: ["accent", "Complete"],
    paid: ["good", "Paid"],
    sent: ["", "Sent"],
    unpaid: ["warn", "Unpaid"],
    overdue: ["bad", "Overdue"],
  };
  const [k, label] = map[status] || ["", status];
  return <Tag kind={k} dot>{label}</Tag>;
}

Object.assign(window, { Sidebar, Topbar, PageHead, SectionHead, Tag, Avatar, Money, Bar, StatusTag });
