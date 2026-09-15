export type User={id:string;name:string;email:string;role:string;organization_id?:string}
export type Cell={id:string;parent_id:string|null;parent_name?:string;name:string;code:string;status:string;location?:string;meeting_day?:string;meeting_time?:string;members:number;leader?:string}
export type Person={id:string;full_name:string;email?:string;phone?:string;status:string;leadership_stage:string;cell_id:string;cell_name:string;joined_at:string}
export type Meeting={id:string;cell_id:string;cell_name:string;meeting_type:string;held_at:string;attendance:number;first_timers:number;new_converts:number;notes?:string;status:string}
export type DashboardData={metrics:{cells:number;people:number;leaders:number;meetings:number;attendance:number;first_timers:number;new_converts:number};recent:Meeting[];activity:{action:string;entity_type:string;detail?:string;created_at:string}[]}
