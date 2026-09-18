export type User = {
  id: string
  name: string
  email: string
  role: string
  organization_id?: string
  scope_node_id?: string | null
}

export type Cell = {
  id: string
  parent_id: string | null
  parent_name?: string
  name: string
  code: string
  status: string
  location?: string
  meeting_day?: string
  meeting_time?: string
  members: number
  leader?: string
  assistant_leader?: string
  class_count?: number
  daughter_cells?: number
  latitude?: number
  longitude?: number
  created_at?: string
}

export type Person = {
  id: string
  full_name: string
  email?: string
  phone?: string
  status: string
  leadership_stage: 'Member' | 'Potential Leader' | 'Class Teacher' | 'Assistant Leader' | 'Cell Leader'
  cell_id: string
  cell_name: string
  cell_code?: string
  joined_at: string
  discipled_by_person_id?: string | null
  discipled_by_name?: string
  disciples_count?: number
}

export type Meeting = {
  id: string
  cell_id: string
  cell_name: string
  meeting_type: string
  held_at: string
  attendance: number
  first_timers: number
  new_converts: number
  notes?: string
  status: 'submitted' | 'approved' | 'returned'
  submitted_by_name?: string
}

export type DashboardData = {
  metrics: {
    cells: number
    people: number
    leaders: number
    meetings: number
    attendance: number
    first_timers: number
    new_converts: number
  }
  recent: Meeting[]
  activity: { action: string; entity_type: string; detail?: string; created_at: string }[]
  trends?: { week: string; attendance: number; first_timers: number; count: number }[]
}

export type BibleClass = {
  id: string
  name: string
  cell_id: string
  cell_name: string
  teacher_id?: string
  teacher?: string
  schedule?: string
  stage: 'Foundation' | 'New Believers' | 'Leadership' | 'Bible Study'
  status: string
  enrolled: number
  graduated?: number
}

export type FollowUp = {
  id: string
  person_name: string
  phone?: string
  cell_id: string
  cell_name: string
  assigned_to?: string
  assignee?: string
  source: 'First timer' | 'New convert' | 'Outreach' | 'Referral'
  status: 'new' | 'contacted' | 'returned' | 'joined'
  due_at: string
  notes?: string
  created_at?: string
}

export type Resource = {
  id: string
  title: string
  category: string
  description?: string
  url: string
  version?: string
  status: string
  published_at: string
}

export type Standard = {
  id: string
  name: string
  version: string
  source: string
  effective_at: string
  status: 'draft' | 'active' | 'archived'
  rules_json: string
}

export type Notification = {
  id: string
  title: string
  message: string
  type: string
  href?: string
  read_at?: string
  created_at: string
}

export type CalendarEvent = {
  id: string
  title: string
  event_type: 'Cell Meeting' | 'Bible Study' | 'Outreach' | 'Leadership' | 'Training' | 'Special Event'
  starts_at: string
  ends_at?: string
  location?: string
  recurrence: 'none' | 'weekly' | 'monthly'
  org_node_id?: string
  scope_name?: string
}

export type Transfer = {
  id: string
  person_id: string
  person_name: string
  from_cell_id: string
  from_cell: string
  to_cell_id: string
  to_cell: string
  status: 'pending' | 'approved' | 'returned' | 'cancelled'
  category: string
  notes?: string
  created_at: string
  requested_by_name: string
}

export type Assignment = {
  id: string
  person_id: string
  person_name: string
  org_node_id: string
  scope_name: string
  role: string
  status: 'active' | 'pending' | 'ended'
  start_date: string
  end_date?: string
}

export type AuditLog = {
  id: string
  user_name?: string
  action: string
  entity_type: string
  entity_id?: string
  detail?: string
  created_at: string
}

export type SearchResult = {
  id: string
  title: string
  subtitle: string
  type: string
  href: string
}

export type MultiplicationEvent = {
  id: string
  organization_id: string
  parent_cell_id: string
  parent_name: string
  parent_code: string
  child_cell_id: string
  child_name: string
  child_code: string
  pioneer_id?: string
  pioneer_name?: string
  event_date: string
  notes?: string
  approved_by_name?: string
  created_at?: string
}

export type CellDetail = {
  cell: Cell & { leader_id?: string; assistant_leader?: string }
  members: Person[]
  classes: BibleClass[]
  meetings: Meeting[]
  children: { id: string; name: string; code: string; location?: string; members: number }[]
  multiplications: MultiplicationEvent[]
}

export type PersonDetail = {
  person: Person & { discipled_by_name?: string; won_by_person_id?: string }
  disciples: { id: string; full_name: string; leadership_stage: string; email?: string; phone?: string }[]
  enrollments: { id: string; class_name: string; class_stage: string; status: string; enrolled_at: string; completed_at?: string }[]
  roles: { id: string; role: string; scope_name: string; status: string; start_date: string; end_date?: string }[]
  attendanceRate: number
  totalMeetings: number
}

export type ClassStudent = {
  enrollment_id: string
  person_id: string
  full_name: string
  email?: string
  phone?: string
  leadership_stage: string
  cell_name: string
  status: 'in_progress' | 'completed' | 'paused'
  enrolled_at: string
  completed_at?: string
}

export type ClassDetail = {
  class: BibleClass & { teacher_id?: string; status: string }
  students: ClassStudent[]
}

export type TerritoryAnalysis = {
  overlaps: { cellA: string; cellB: string; distanceKm: number }[]
  expansionCandidates: { area: string; recommendedPioneer: string; lat: number; lng: number; rationale: string }[]
  totalMapped: number
}
