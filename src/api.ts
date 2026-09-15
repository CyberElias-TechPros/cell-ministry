const API=import.meta.env.VITE_API_URL||'/api'
export class ApiError extends Error{status:number;constructor(message:string,status:number){super(message);this.status=status}}
export async function api<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(`${API}${path}`,{...options,credentials:'include',headers:{'content-type':'application/json',...options?.headers}})
  const data=await response.json().catch(()=>({error:'The server returned an invalid response'}))
  if(!response.ok)throw new ApiError(data.error||'Request failed',response.status)
  return data as T
}
