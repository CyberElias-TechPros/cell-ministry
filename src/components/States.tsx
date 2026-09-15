import {LoaderCircle,RefreshCw} from 'lucide-react'
export function Loading({label='Loading intelligence'}:{label?:string}){return <div className="state-box"><LoaderCircle className="spin"/><p>{label}</p></div>}
export function ErrorState({message,retry}:{message:string;retry?:()=>void}){return <div className="state-box error-state"><b>We couldn’t load this view.</b><p>{message}</p>{retry&&<button className="button secondary" onClick={retry}><RefreshCw/>Try again</button>}</div>}
export function Empty({title,copy}:{title:string;copy:string}){return <div className="state-box"><div className="empty-orbit"/><b>{title}</b><p>{copy}</p></div>}
