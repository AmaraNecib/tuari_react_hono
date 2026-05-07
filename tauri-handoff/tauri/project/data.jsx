// Mock construction-company data

const PROJECTS = [
  { id: "p-atlas", code: "P-024", name: "Atlas Tower — Phase 2", client: "Meridian Holdings", site: "Beirut, Hamra", status: "active", progress: 0.62, budget: 1840000, spent: 1144800, started: "2025-11-04", due: "2026-08-15", crew: 14, manager: "Joseph K." },
  { id: "p-cedar", code: "P-023", name: "Cedar Heights Villas", client: "Karam Family", site: "Broummana", status: "active", progress: 0.34, budget: 720000, spent: 248400, started: "2026-01-15", due: "2026-11-01", crew: 8, manager: "Layla N." },
  { id: "p-marin", code: "P-022", name: "Marina Promenade Renovation", client: "City of Jounieh", site: "Jounieh Bay", status: "at-risk", progress: 0.78, budget: 540000, spent: 471000, started: "2025-09-12", due: "2026-05-30", crew: 11, manager: "Joseph K." },
  { id: "p-ware", code: "P-021", name: "Hangar B Warehouse Build-out", client: "TransMed Logistics", site: "Zahle Industrial", status: "active", progress: 0.45, budget: 380000, spent: 174800, started: "2025-12-02", due: "2026-07-10", crew: 6, manager: "Rami H." },
  { id: "p-clinic", code: "P-020", name: "Lina Health Clinic Fit-out", client: "Dr. Lina Saad", site: "Achrafieh", status: "paused", progress: 0.18, budget: 165000, spent: 28200, started: "2026-02-01", due: "2026-09-15", crew: 4, manager: "Layla N." },
  { id: "p-rest", code: "P-019", name: "Beit Rouge — Restaurant", client: "Rouge Hospitality", site: "Mar Mikhael", status: "complete", progress: 1.0, budget: 290000, spent: 281400, started: "2025-04-08", due: "2025-12-20", crew: 0, manager: "Rami H." },
];

const ITEMS = [
  { id: "i-001", sku: "CEM-42-50", name: "Portland Cement 42.5 (50kg bag)", category: "Consumable", stock: 240, unit: "bag", reorder: 60, value: 8.5, location: "Aisle A1" },
  { id: "i-002", sku: "RBR-12-6M", name: "Rebar Ø12mm — 6m length", category: "Consumable", stock: 1840, unit: "rod", reorder: 400, value: 3.2, location: "Yard Y2" },
  { id: "i-003", sku: "BLK-20-CMU", name: "Concrete Block 20cm CMU", category: "Consumable", stock: 5200, unit: "block", reorder: 1500, value: 0.95, location: "Yard Y1" },
  { id: "i-004", sku: "PHN-IPH13", name: "iPhone 13 — Site Phone", category: "In-Use Asset", stock: 4, unit: "device", reorder: 1, value: 540, location: "Office Safe" },
  { id: "i-005", sku: "VEH-FRD-T", name: "Ford Transit — Site Van", category: "In-Use Asset", stock: 3, unit: "vehicle", reorder: 0, value: 24500, location: "Garage" },
  { id: "i-006", sku: "FUEL-DSL", name: "Diesel Fuel (litre)", category: "Consumable", stock: 1240, unit: "L", reorder: 500, value: 1.15, location: "Tank T1" },
  { id: "i-007", sku: "PNT-WHT-20L", name: "Exterior Paint — White (20L)", category: "Consumable", stock: 18, unit: "tin", reorder: 24, value: 78, location: "Aisle B3" },
  { id: "i-008", sku: "DRL-MKT-18V", name: "Makita 18V Drill", category: "In-Use Asset", stock: 6, unit: "tool", reorder: 1, value: 220, location: "Tool Crib" },
  { id: "i-009", sku: "TIL-PRC-30", name: "Porcelain Tile 30×60 (m²)", category: "Consumable", stock: 84, unit: "m²", reorder: 50, value: 22, location: "Aisle C1" },
  { id: "i-010", sku: "GEN-HND-5K", name: "Honda 5kW Generator", category: "In-Use Asset", stock: 2, unit: "unit", reorder: 0, value: 1850, location: "Garage" },
];

const EMPLOYEES = [
  { id: "e-001", name: "Joseph Khoury",   role: "Site Manager",     phone: "+961 3 411 220", project: "Atlas Tower",  hire: "2019-04-12", salary: 2400, debt: 0,    initials: "JK" },
  { id: "e-002", name: "Layla Nasser",    role: "Project Engineer", phone: "+961 3 884 152", project: "Cedar Heights", hire: "2021-09-01", salary: 2100, debt: 320,  initials: "LN" },
  { id: "e-003", name: "Rami Haddad",     role: "Foreman",          phone: "+961 3 552 098", project: "Hangar B",     hire: "2017-02-20", salary: 1850, debt: 0,    initials: "RH" },
  { id: "e-004", name: "Marwan Abboud",   role: "Mason",            phone: "+961 3 117 449", project: "Atlas Tower",  hire: "2022-06-15", salary: 1200, debt: 540,  initials: "MA" },
  { id: "e-005", name: "Tarek Saliba",    role: "Electrician",      phone: "+961 3 705 366", project: "Marina Reno",  hire: "2020-11-03", salary: 1550, debt: 0,    initials: "TS" },
  { id: "e-006", name: "Nour El-Hajj",    role: "Accountant",       phone: "+961 3 998 211", project: "Office",       hire: "2018-08-19", salary: 1900, debt: 0,    initials: "NH" },
  { id: "e-007", name: "Ali Mansour",     role: "Driver",           phone: "+961 3 244 871", project: "Fleet",        hire: "2023-03-04", salary: 950,  debt: 180,  initials: "AM" },
  { id: "e-008", name: "Hadi Zeineddine", role: "Carpenter",        phone: "+961 3 661 020", project: "Cedar Heights", hire: "2024-01-10", salary: 1100, debt: 0,    initials: "HZ" },
];

const PARTNERS = [
  { id: "pt-1", name: "Beton Express SARL",     type: "Supplier", category: "Concrete & Aggregates", balance:  -8420,  ytd: 142800, last: "3d ago" },
  { id: "pt-2", name: "Steelcorp Trading",      type: "Supplier", category: "Rebar & Steel",         balance:  -22150, ytd: 418500, last: "1d ago" },
  { id: "pt-3", name: "Habib Hardware",         type: "Supplier", category: "Tools & Fasteners",     balance:  -1240,  ytd: 28900,  last: "5d ago" },
  { id: "pt-4", name: "Meridian Holdings",      type: "Client",   category: "Atlas Tower",           balance:  184400, ytd: 1144800,last: "today"  },
  { id: "pt-5", name: "Karam Family",           type: "Client",   category: "Cedar Heights",         balance:  62800,  ytd: 248400, last: "6d ago" },
  { id: "pt-6", name: "City of Jounieh",        type: "Client",   category: "Marina Reno",           balance:  -18500, ytd: 471000, last: "12d ago"},
  { id: "pt-7", name: "Petromed Fuel",          type: "Supplier", category: "Diesel & Petrol",       balance:  -3220,  ytd: 64200,  last: "2d ago" },
];

const INVOICES = [
  { id: "INV-2026-041", party: "Meridian Holdings",     dir: "out", date: "2026-05-01", due: "2026-05-31", amount: 184400, status: "sent",     project: "Atlas Tower" },
  { id: "INV-2026-040", party: "Karam Family",          dir: "out", date: "2026-04-28", due: "2026-05-28", amount: 62800,  status: "sent",     project: "Cedar Heights" },
  { id: "BIL-S-0220",   party: "Steelcorp Trading",     dir: "in",  date: "2026-04-26", due: "2026-05-26", amount: 22150,  status: "unpaid",   project: "Atlas Tower" },
  { id: "BIL-B-0118",   party: "Beton Express SARL",    dir: "in",  date: "2026-04-22", due: "2026-05-22", amount: 8420,   status: "unpaid",   project: "Atlas Tower" },
  { id: "INV-2026-039", party: "City of Jounieh",       dir: "out", date: "2026-04-18", due: "2026-05-18", amount: 92000,  status: "overdue",  project: "Marina Reno" },
  { id: "INV-2026-038", party: "Dr. Lina Saad",         dir: "out", date: "2026-04-12", due: "2026-04-28", amount: 28200,  status: "paid",     project: "Lina Clinic" },
  { id: "BIL-P-0044",   party: "Petromed Fuel",         dir: "in",  date: "2026-04-10", due: "2026-04-24", amount: 3220,   status: "paid",     project: "Fleet" },
  { id: "BIL-H-0091",   party: "Habib Hardware",        dir: "in",  date: "2026-04-08", due: "2026-05-08", amount: 1240,   status: "unpaid",   project: "Cedar Heights" },
];

const EXPENSES = [
  { id: "x-501", date: "2026-05-06", desc: "Diesel — Site Van #2",        cat: "Fuel",       project: "Atlas Tower",  type: "consumable", amount: 142,   approved: true,  by: "Ali M." },
  { id: "x-500", date: "2026-05-06", desc: "Site phone — credit top-up",  cat: "Telecom",    project: "Cedar Heights", type: "in-use",     amount: 25,    approved: true,  by: "Layla N." },
  { id: "x-499", date: "2026-05-05", desc: "Cement — 80 bags",            cat: "Materials",  project: "Atlas Tower",  type: "consumable", amount: 680,   approved: true,  by: "Joseph K." },
  { id: "x-498", date: "2026-05-05", desc: "Crane operator — day rate",   cat: "Labor",      project: "Atlas Tower",  type: "consumable", amount: 320,   approved: true,  by: "Joseph K." },
  { id: "x-497", date: "2026-05-04", desc: "Van service & tires",         cat: "Vehicle",    project: "Fleet",        type: "in-use",     amount: 540,   approved: false, by: "Rami H." },
  { id: "x-496", date: "2026-05-04", desc: "Generator rental — 3 days",   cat: "Equipment",  project: "Marina Reno",  type: "consumable", amount: 450,   approved: true,  by: "Tarek S." },
  { id: "x-495", date: "2026-05-03", desc: "Permit fees — phase 2",       cat: "Permits",    project: "Atlas Tower",  type: "consumable", amount: 1200,  approved: true,  by: "Nour H." },
  { id: "x-494", date: "2026-05-03", desc: "Tile — 60 m²",                cat: "Materials",  project: "Cedar Heights", type: "consumable", amount: 1320,  approved: true,  by: "Layla N." },
];

const ACTIVITY = [
  { time: "09:42", text: "<b>Joseph K.</b> approved expense — Cement 80 bags ($680)", project: "Atlas" },
  { time: "09:18", text: "Stock low: <b>Exterior Paint — White</b> at 18 tins (reorder 24)", project: "Warehouse" },
  { time: "08:55", text: "<b>Meridian Holdings</b> invoice INV-2026-041 sent for $184,400", project: "Atlas" },
  { time: "08:30", text: "<b>Marwan A.</b> debt updated +$120 — advance against May salary", project: "Employees" },
  { time: "Yesterday", text: "<b>City of Jounieh</b> invoice INV-2026-039 is now overdue (12d)", project: "Marina" },
  { time: "Yesterday", text: "<b>Ford Transit T-2</b> assigned to Atlas Tower site", project: "Fleet" },
  { time: "May 5", text: "<b>Petromed Fuel</b> bill paid — $3,220", project: "Fleet" },
];

const ASSIGNMENTS = [
  { item: "Ford Transit T-2",    sku: "VEH-FRD-T",  to: "Atlas Tower",    holder: "Ali M.",    since: "2026-03-12" },
  { item: "iPhone 13 #1",        sku: "PHN-IPH13",  to: "Atlas Tower",    holder: "Joseph K.", since: "2025-11-04" },
  { item: "iPhone 13 #2",        sku: "PHN-IPH13",  to: "Cedar Heights",  holder: "Layla N.",  since: "2026-01-15" },
  { item: "Makita Drill #4",     sku: "DRL-MKT-18V",to: "Hangar B",       holder: "Rami H.",   since: "2025-12-02" },
  { item: "Honda 5kW Gen #1",    sku: "GEN-HND-5K", to: "Marina Reno",    holder: "Tarek S.",  since: "2026-04-29" },
  { item: "Ford Transit T-1",    sku: "VEH-FRD-T",  to: "Cedar Heights",  holder: "Hadi Z.",   since: "2026-01-20" },
];

window.MOCK = { PROJECTS, ITEMS, EMPLOYEES, PARTNERS, INVOICES, EXPENSES, ACTIVITY, ASSIGNMENTS };
