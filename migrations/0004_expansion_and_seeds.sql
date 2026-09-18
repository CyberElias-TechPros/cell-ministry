PRAGMA foreign_keys = ON;

-- Additional Seed People to create vibrant, realistic cell rosters & discipleship chains
INSERT OR IGNORE INTO people (id, organization_id, cell_id, full_name, email, phone, status, leadership_stage, joined_at, discipled_by_person_id, won_by_person_id) VALUES
 ('p9', 'org_hope', 'cell_radiant', 'Grace Uche', 'grace.uche@example.org', '+234 803 111 2201', 'member', 'Member', '2025-05-14', 'p1', 'p1'),
 ('p10', 'org_hope', 'cell_radiant', 'Kelechi Ibe', 'kelechi.ibe@example.org', '+234 803 111 2202', 'member', 'Potential Leader', '2025-06-20', 'p1', 'p9'),
 ('p11', 'org_hope', 'cell_radiant', 'Precious Amadi', 'precious.amadi@example.org', '+234 803 111 2203', 'member', 'Member', '2025-08-01', 'p6', 'p1'),
 ('p12', 'org_hope', 'cell_grace', 'Daniel Aliu', 'daniel.aliu@example.org', '+234 803 111 2204', 'member', 'Assistant Leader', '2024-09-15', 'p2', 'p2'),
 ('p13', 'org_hope', 'cell_grace', 'Miracle Jumbo', 'miracle.jumbo@example.org', '+234 803 111 2205', 'member', 'Member', '2025-10-10', 'p7', 'p2'),
 ('p14', 'org_hope', 'cell_grace', 'Victor Briggs', 'victor.briggs@example.org', '+234 803 111 2206', 'member', 'Class Teacher', '2024-11-05', 'p2', 'p12'),
 ('p15', 'org_hope', 'cell_victory', 'Esther Braide', 'esther.braide@example.org', '+234 803 111 2207', 'member', 'Potential Leader', '2025-02-18', 'p3', 'p3'),
 ('p16', 'org_hope', 'cell_victory', 'Tari West', 'tari.west@example.org', '+234 803 111 2208', 'member', 'Member', '2025-07-22', 'p8', 'p3'),
 ('p17', 'org_hope', 'cell_victory', 'Oluwaseun Bakare', 'seun.bakare@example.org', '+234 803 111 2209', 'member', 'Member', '2025-11-30', 'p3', 'p15'),
 ('p18', 'org_hope', 'cell_kings', 'Praise Osagie', 'praise.osagie@example.org', '+234 803 111 2210', 'member', 'Potential Leader', '2025-03-04', 'p4', 'p4'),
 ('p19', 'org_hope', 'cell_kings', 'Favour George', 'favour.george@example.org', '+234 803 111 2211', 'member', 'Member', '2025-08-16', 'p4', 'p18'),
 ('p20', 'org_hope', 'cell_kings', 'Michael Tamuno', 'michael.tamuno@example.org', '+234 803 111 2212', 'member', 'Member', '2026-01-10', 'p18', 'p4'),
 ('p21', 'org_hope', 'cell_harbour', 'Irene Wogu', 'irene.wogu@example.org', '+234 803 111 2213', 'member', 'Assistant Leader', '2023-04-12', 'p5', 'p5'),
 ('p22', 'org_hope', 'cell_harbour', 'Chuka Anozie', 'chuka.anozie@example.org', '+234 803 111 2214', 'member', 'Class Teacher', '2024-05-19', 'p5', 'p21'),
 ('p23', 'org_hope', 'cell_harbour', 'Zion Peters', 'zion.peters@example.org', '+234 803 111 2215', 'member', 'Member', '2025-09-09', 'p21', 'p5'),
 ('p24', 'org_hope', 'cell_harbour', 'Mercy Hart', 'mercy.hart@example.org', '+234 803 111 2216', 'member', 'Member', '2026-02-14', 'p22', 'p5');

-- Additional Class Enrollments so every Bible class has active students
INSERT OR IGNORE INTO class_enrollments (id, class_id, person_id, status, enrolled_at) VALUES
 ('ce5', 'bc_foundation', 'p9', 'in_progress', '2026-08-01'),
 ('ce6', 'bc_foundation', 'p11', 'in_progress', '2026-08-15'),
 ('ce7', 'bc_leaders', 'p10', 'in_progress', '2026-07-10'),
 ('ce8', 'bc_leaders', 'p15', 'in_progress', '2026-07-10'),
 ('ce9', 'bc_leaders', 'p18', 'in_progress', '2026-08-01'),
 ('ce10', 'bc_newlife', 'p13', 'in_progress', '2026-08-20'),
 ('ce11', 'bc_newlife', 'p16', 'in_progress', '2026-08-22'),
 ('ce12', 'bc_newlife', 'p17', 'in_progress', '2026-09-01');

-- Meeting attendance records for m1 (Radiant Life), m2 (Grace Haven), m3 (Victory House), m4 (Harbour of Hope)
INSERT OR IGNORE INTO meeting_attendance (id, meeting_id, person_id, attendance_status, first_time_guest) VALUES
 ('att1', 'm1', 'p1', 'present', 0),
 ('att2', 'm1', 'p6', 'present', 0),
 ('att3', 'm1', 'p9', 'present', 0),
 ('att4', 'm1', 'p10', 'present', 0),
 ('att5', 'm1', 'p11', 'absent', 0),
 ('att6', 'm2', 'p2', 'present', 0),
 ('att7', 'm2', 'p7', 'present', 0),
 ('att8', 'm2', 'p12', 'present', 0),
 ('att9', 'm2', 'p13', 'present', 0),
 ('att10', 'm2', 'p14', 'excused', 0),
 ('att11', 'm3', 'p3', 'present', 0),
 ('att12', 'm3', 'p8', 'present', 0),
 ('att13', 'm3', 'p15', 'present', 0),
 ('att14', 'm3', 'p16', 'present', 0),
 ('att15', 'm3', 'p17', 'absent', 0),
 ('att16', 'm4', 'p5', 'present', 0),
 ('att17', 'm4', 'p21', 'present', 0),
 ('att18', 'm4', 'p22', 'present', 0),
 ('att19', 'm4', 'p23', 'present', 0),
 ('att20', 'm4', 'p24', 'excused', 0);

-- Additional Multiplication record so cell lineage has 3 generations
INSERT OR IGNORE INTO multiplication_events (id, organization_id, parent_cell_id, child_cell_id, pioneer_id, event_date, notes, approved_by) VALUES
 ('me4', 'org_hope', 'cell_harbour', 'cell_kings', 'p4', '2025-02-16', 'Pioneered to expand Kingdom presence in D-Line', 'usr_demo');

-- Additional Calendar Events for current and upcoming ministry rhythms
INSERT OR IGNORE INTO calendar_events (id, organization_id, org_node_id, title, event_type, starts_at, ends_at, location, recurrence, created_by) VALUES
 ('ev4', 'org_hope', 'cell_grace', 'Grace Haven Midweek Fellowship', 'Cell Meeting', '2026-09-23T18:00:00', '2026-09-23T19:30:00', 'New GRA', 'weekly', 'usr_demo'),
 ('ev5', 'org_hope', 'cell_radiant', 'Foundation School Graduation', 'Training', '2026-09-27T14:00:00', '2026-09-27T16:00:00', 'Central Church Hall B', 'monthly', 'usr_demo'),
 ('ev6', 'org_hope', 'cell_victory', 'Campus Catchment Outreach', 'Outreach', '2026-09-25T16:30:00', '2026-09-25T18:30:00', 'Rumuola Junction', 'none', 'usr_demo'),
 ('ev7', 'org_hope', NULL, 'Global Day of Prayer Broadcast', 'Special Event', '2026-09-26T18:00:00', '2026-09-27T18:00:00', 'Online & Central Church', 'none', 'usr_demo');
