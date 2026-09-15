PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE org_nodes (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  parent_id TEXT REFERENCES org_nodes(id), node_type TEXT NOT NULL CHECK(node_type IN ('region','zone','church','cell')),
  name TEXT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  meeting_day TEXT, meeting_time TEXT, location TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, code)
);
CREATE INDEX idx_org_nodes_parent ON org_nodes(parent_id);
CREATE TABLE users (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL, scope_node_id TEXT REFERENCES org_nodes(id), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE TABLE people (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), cell_id TEXT REFERENCES org_nodes(id),
  full_name TEXT NOT NULL, email TEXT, phone TEXT, status TEXT NOT NULL DEFAULT 'member',
  leadership_stage TEXT NOT NULL DEFAULT 'Member', joined_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_people_cell ON people(cell_id);
CREATE TABLE meetings (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  meeting_type TEXT NOT NULL, held_at TEXT NOT NULL, attendance INTEGER NOT NULL CHECK(attendance >= 0),
  first_timers INTEGER NOT NULL DEFAULT 0 CHECK(first_timers >= 0), new_converts INTEGER NOT NULL DEFAULT 0 CHECK(new_converts >= 0),
  notes TEXT, status TEXT NOT NULL DEFAULT 'submitted', submitted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_meetings_cell_date ON meetings(cell_id, held_at DESC);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO organizations (id,name,code) VALUES ('org_hope','Christ Embassy Central','CEC');
INSERT INTO org_nodes (id,organization_id,parent_id,node_type,name,code,status,location) VALUES
 ('reg_south','org_hope',NULL,'region','Southern Region','SR','active','Nigeria'),
 ('zone_3','org_hope','reg_south','zone','Port Harcourt Zone 3','PHZ3','active','Port Harcourt'),
 ('church_central','org_hope','zone_3','church','Central Church','CC3','active','GRA, Port Harcourt'),
 ('cell_radiant','org_hope','church_central','cell','Radiant Life','RL-01','active','Old GRA'),
 ('cell_grace','org_hope','cell_radiant','cell','Grace Haven','GH-02','active','New GRA'),
 ('cell_victory','org_hope','cell_radiant','cell','Victory House','VH-03','active','Rumuola'),
 ('cell_kings','org_hope','cell_grace','cell','Kingdom Lights','KL-04','active','D-Line'),
 ('cell_harbour','org_hope','church_central','cell','Harbour of Hope','HH-05','active','Trans Amadi');
INSERT INTO users (id,organization_id,name,email,password_salt,password_hash,role,scope_node_id) VALUES
 ('usr_demo','org_hope','Amara Okafor','admin@nexus.demo','36a127334b74c4a4ca6b164b16a29db4','a64893fb13bb7679cd1f5aef4f26cb3bcb24f39ecaf58a3efe751981541d5b68','Ministry Administrator','reg_south');
INSERT INTO people (id,organization_id,cell_id,full_name,email,phone,status,leadership_stage,joined_at) VALUES
 ('p1','org_hope','cell_radiant','David Eze','david@example.org','+234 801 234 1001','leader','Cell Leader','2022-02-10'),
 ('p2','org_hope','cell_grace','Nneka Obi','nneka@example.org','+234 801 234 1002','leader','Cell Leader','2023-06-18'),
 ('p3','org_hope','cell_victory','Samuel Udo','samuel@example.org','+234 801 234 1003','leader','Assistant Leader','2024-01-09'),
 ('p4','org_hope','cell_kings','Blessing Adeyemi','blessing@example.org','+234 801 234 1004','member','Class Teacher','2024-04-21'),
 ('p5','org_hope','cell_harbour','Chinedu Nwosu','chinedu@example.org','+234 801 234 1005','leader','Cell Leader','2021-11-02'),
 ('p6','org_hope','cell_radiant','Joy Daniels','joy@example.org','+234 801 234 1006','member','Member','2025-03-12'),
 ('p7','org_hope','cell_grace','Emeka James','emeka@example.org','+234 801 234 1007','member','Potential Leader','2025-07-19'),
 ('p8','org_hope','cell_victory','Ruth Charles','ruth@example.org','+234 801 234 1008','member','Member','2026-01-23');
INSERT INTO meetings (id,organization_id,cell_id,meeting_type,held_at,attendance,first_timers,new_converts,notes,status,submitted_by) VALUES
 ('m1','org_hope','cell_radiant','Cell Meeting','2026-09-13',38,3,1,'Strong participation','approved','usr_demo'),
 ('m2','org_hope','cell_grace','Bible Study','2026-09-12',27,2,1,'Two guests returned','approved','usr_demo'),
 ('m3','org_hope','cell_victory','Outreach','2026-09-11',34,6,3,'Community outreach','submitted','usr_demo'),
 ('m4','org_hope','cell_harbour','Cell Meeting','2026-09-10',22,1,0,NULL,'approved','usr_demo'),
 ('m5','org_hope','cell_radiant','Bible Study','2026-09-06',35,1,2,NULL,'approved','usr_demo');
