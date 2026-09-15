PRAGMA foreign_keys = ON;

ALTER TABLE people ADD COLUMN won_by_person_id TEXT REFERENCES people(id);
ALTER TABLE people ADD COLUMN discipled_by_person_id TEXT REFERENCES people(id);
UPDATE people SET discipled_by_person_id='p1' WHERE id IN ('p6','p3');
UPDATE people SET discipled_by_person_id='p2' WHERE id IN ('p7','p4');
UPDATE people SET discipled_by_person_id='p3' WHERE id='p8';

CREATE TABLE bible_classes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  name TEXT NOT NULL,
  teacher_id TEXT REFERENCES people(id),
  schedule TEXT,
  stage TEXT NOT NULL DEFAULT 'Foundation',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bible_classes_cell ON bible_classes(cell_id);

CREATE TABLE class_enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES bible_classes(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','paused')),
  enrolled_at TEXT NOT NULL DEFAULT (date('now')),
  completed_at TEXT,
  UNIQUE(class_id, person_id)
);

CREATE TABLE follow_ups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  person_name TEXT NOT NULL,
  phone TEXT,
  cell_id TEXT NOT NULL REFERENCES org_nodes(id),
  assigned_to TEXT REFERENCES people(id),
  source TEXT NOT NULL DEFAULT 'First timer',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','returned','joined')),
  due_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_followups_due ON follow_ups(organization_id,status,due_at);

CREATE TABLE standard_sets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
  rules_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id,name,version)
);

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','archived')),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  href TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(organization_id,user_id,read_at,created_at DESC);

INSERT INTO bible_classes (id,organization_id,cell_id,name,teacher_id,schedule,stage) VALUES
 ('bc_foundation','org_hope','cell_radiant','Foundation Class 01','p4','Saturdays · 4:00 PM','Foundation'),
 ('bc_leaders','org_hope','cell_grace','Emerging Leaders Circle','p2','Thursdays · 6:00 PM','Leadership'),
 ('bc_newlife','org_hope','cell_victory','New Life Class','p3','Sundays · 3:30 PM','New Believers');
INSERT INTO class_enrollments (id,class_id,person_id,status) VALUES
 ('ce1','bc_foundation','p6','in_progress'),('ce2','bc_foundation','p7','in_progress'),
 ('ce3','bc_leaders','p7','in_progress'),('ce4','bc_newlife','p8','in_progress');
INSERT INTO follow_ups (id,organization_id,person_name,phone,cell_id,assigned_to,source,status,due_at,notes) VALUES
 ('fu1','org_hope','Adaeze Okoli','+234 802 555 0111','cell_radiant','p6','First timer','contacted','2026-09-15','Called once; invited to Friday meeting'),
 ('fu2','org_hope','Tobi Martins','+234 802 555 0112','cell_grace','p7','Outreach','new','2026-09-15','Met at community outreach'),
 ('fu3','org_hope','Ifeoma Chukwu','+234 802 555 0113','cell_victory','p3','New convert','returned','2026-09-17','Attended Bible study');
INSERT INTO standard_sets (id,organization_id,name,version,source,effective_at,status,rules_json,created_by) VALUES
 ('std_local','org_hope','PH Zone 3 Reporting Standard','1.0','Local ministry administration','2026-09-01','active','{"weeklyReportDue":"Sunday 18:00","approvalRequired":true,"meetingTypes":["Cell Meeting","Bible Study","Outreach"]}','usr_demo');
INSERT INTO resources (id,organization_id,title,category,description,url,version,created_by) VALUES
 ('res1','org_hope','Weekly Cell Meeting Guide','Meeting Guides','Current facilitation guide for weekly cell meetings.','https://loveworldcellministry.org/','September 2026','usr_demo'),
 ('res2','org_hope','Leadership Development Pathway','Leadership','Approved pathway for identifying and developing leaders.','https://loveworldcellministry.org/','1.0','usr_demo'),
 ('res3','org_hope','Follow-up Field Guide','Outreach','Practical steps for caring for first timers and new converts.','https://loveworldcellministry.org/','2026','usr_demo');
INSERT INTO notifications (id,organization_id,user_id,title,message,type,href) VALUES
 ('not1','org_hope','usr_demo','Three reports ready','Review this week''s submitted cell reports.','review','/reports'),
 ('not2','org_hope','usr_demo','Two follow-ups due','Keep today''s new connections warm.','followup','/follow-ups'),
 ('not3','org_hope','usr_demo','New leadership signal','Grace Haven has a potential leader progressing well.','growth','/people');
