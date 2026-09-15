PRAGMA foreign_keys = ON;

ALTER TABLE org_nodes ADD COLUMN latitude REAL;
ALTER TABLE org_nodes ADD COLUMN longitude REAL;
UPDATE org_nodes SET latitude=4.8156,longitude=7.0498 WHERE id='cell_radiant';
UPDATE org_nodes SET latitude=4.8351,longitude=7.0192 WHERE id='cell_grace';
UPDATE org_nodes SET latitude=4.8484,longitude=7.0129 WHERE id='cell_victory';
UPDATE org_nodes SET latitude=4.8077,longitude=7.0046 WHERE id='cell_kings';
UPDATE org_nodes SET latitude=4.8309,longitude=7.0821 WHERE id='cell_harbour';

CREATE TABLE role_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  org_node_id TEXT NOT NULL REFERENCES org_nodes(id),
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','ended')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  appointed_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assignments_person ON role_assignments(person_id,status);

CREATE TABLE member_transfers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  from_cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  to_cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','returned','cancelled')),
  category TEXT NOT NULL DEFAULT 'Relocation',
  notes TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(from_cell_id != to_cell_id)
);
CREATE INDEX idx_transfers_status ON member_transfers(organization_id,status,created_at DESC);

CREATE TABLE multiplication_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  parent_cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  child_cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  pioneer_id TEXT REFERENCES people(id),
  event_date TEXT NOT NULL,
  notes TEXT,
  approved_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_cell_id,child_cell_id)
);

CREATE TABLE meeting_attendance (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('present','absent','excused')),
  first_time_guest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(meeting_id,person_id)
);
CREATE INDEX idx_attendance_person ON meeting_attendance(person_id,meeting_id);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  org_node_id TEXT REFERENCES org_nodes(id),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  location TEXT,
  recurrence TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_start ON calendar_events(organization_id,starts_at);

INSERT INTO role_assignments(id,organization_id,person_id,org_node_id,role,start_date,appointed_by) VALUES
 ('ra1','org_hope','p1','cell_radiant','Cell Leader','2022-02-10','usr_demo'),
 ('ra2','org_hope','p2','cell_grace','Cell Leader','2023-06-18','usr_demo'),
 ('ra3','org_hope','p3','cell_victory','Assistant Cell Leader','2024-01-09','usr_demo'),
 ('ra4','org_hope','p4','cell_radiant','Bible Class Teacher','2024-04-21','usr_demo'),
 ('ra5','org_hope','p5','cell_harbour','Cell Leader','2021-11-02','usr_demo');
INSERT INTO multiplication_events(id,organization_id,parent_cell_id,child_cell_id,pioneer_id,event_date,notes,approved_by) VALUES
 ('me1','org_hope','cell_radiant','cell_grace','p2','2023-06-18','Pioneered from Radiant Life','usr_demo'),
 ('me2','org_hope','cell_radiant','cell_victory','p3','2024-01-09','Pioneered from Radiant Life','usr_demo'),
 ('me3','org_hope','cell_grace','cell_kings','p4','2025-02-16','Leadership pipeline multiplication','usr_demo');
INSERT INTO calendar_events(id,organization_id,org_node_id,title,event_type,starts_at,ends_at,location,recurrence,created_by) VALUES
 ('ev1','org_hope','cell_radiant','Radiant Life Weekly Meeting','Cell Meeting','2026-09-18T18:00:00','2026-09-18T19:30:00','Old GRA','weekly','usr_demo'),
 ('ev2','org_hope','cell_grace','Zone Leadership Forum','Leadership','2026-09-19T10:00:00','2026-09-19T13:00:00','Central Church','monthly','usr_demo'),
 ('ev3','org_hope','cell_victory','Community Outreach','Outreach','2026-09-20T15:00:00','2026-09-20T18:00:00','Rumuola','none','usr_demo');
