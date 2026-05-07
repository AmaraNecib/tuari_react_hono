// Lucide-style line icons, hand-rolled. 16px default, currentColor.

const I = ({ d, size = 16, sw = 1.5, fill, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor"
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

const Icon = {
  Dashboard: (p) => <I {...p} d={<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>} />,
  Projects:  (p) => <I {...p} d={<><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></>} />,
  Warehouse: (p) => <I {...p} d={<><path d="M3 9l9-5 9 5v11H3z"/><path d="M9 20v-7h6v7"/></>} />,
  Items:     (p) => <I {...p} d={<><rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 10h18"/><path d="M9 6V4h6v2"/></>} />,
  Expenses:  (p) => <I {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5h-3.5a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9.5"/><path d="M12 7v1.5M12 15.5v1.5"/></>} />,
  Invoices:  (p) => <I {...p} d={<><path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></>} />,
  Partners:  (p) => <I {...p} d={<><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 19c0-2 2-3.5 4.5-3.5"/></>} />,
  Employees: (p) => <I {...p} d={<><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></>} />,
  Analytics: (p) => <I {...p} d={<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>} />,
  Reports:   (p) => <I {...p} d={<><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/></>} />,
  Settings:  (p) => <I {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
  Search:    (p) => <I {...p} d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} />,
  Plus:      (p) => <I {...p} d="M12 5v14M5 12h14" />,
  Bell:      (p) => <I {...p} d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>} />,
  Filter:    (p) => <I {...p} d="M3 5h18l-7 9v6l-4-2v-4z" />,
  Chevron:   (p) => <I {...p} d="M9 6l6 6-6 6" />,
  ChevronD:  (p) => <I {...p} d="M6 9l6 6 6-6" />,
  Arrow:     (p) => <I {...p} d="M5 12h14M13 5l7 7-7 7" />,
  Dot:       (p) => <I {...p} d={<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>} />,
  Phone:     (p) => <I {...p} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2z" />,
  Mail:      (p) => <I {...p} d={<><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7l9 7 9-7"/></>} />,
  Truck:     (p) => <I {...p} d={<><path d="M1 7h13v10H1z"/><path d="M14 11h4l3 3v3h-7"/><circle cx="5.5" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></>} />,
  Tag:       (p) => <I {...p} d={<><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></>} />,
  Folder:    (p) => <I {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  More:      (p) => <I {...p} d={<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>} />,
  ArrowUp:   (p) => <I {...p} d="M12 19V5M5 12l7-7 7 7" />,
  ArrowDown: (p) => <I {...p} d="M12 5v14M5 12l7 7 7-7" />,
  Check:     (p) => <I {...p} d="M5 12l5 5 9-11" />,
  X:         (p) => <I {...p} d="M6 6l12 12M6 18L18 6" />,
  Cmd:       (p) => <I {...p} d="M9 6a3 3 0 1 1-3 3v6a3 3 0 1 1 3-3h6a3 3 0 1 1-3 3V9a3 3 0 1 1 3 3z" />,
  Sun:       (p) => <I {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></>} />,
  Moon:      (p) => <I {...p} d="M21 13A9 9 0 0 1 11 3a7 7 0 1 0 10 10z" />,
  Layers:    (p) => <I {...p} d={<><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 18l9 5 9-5"/></>} />,
  SidebarToggle: (p) => <I {...p} d={<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>} />,
  Help:      (p) => <I {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/></>} />,
  Wallet:    (p) => <I {...p} d={<><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2"/><path d="M3 10h18"/></>} />,
  Building:  (p) => <I {...p} d={<><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/><path d="M10 21v-3h4v3"/></>} />,
};

window.Icon = Icon;
