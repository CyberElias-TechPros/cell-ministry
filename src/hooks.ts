import {useCallback,useEffect,useRef,useState} from 'react'
export function useLoad<T>(loader:()=>Promise<T>,_deps:unknown[]=[]){
  const loaderRef=useRef(loader);loaderRef.current=loader
  const[data,setData]=useState<T>();const[error,setError]=useState('');const[loading,setLoading]=useState(true)
  const load=useCallback(()=>{setLoading(true);setError('');loaderRef.current().then(setData).catch(e=>setError(e instanceof Error?e.message:'Request failed')).finally(()=>setLoading(false))},[])
  useEffect(()=>{load()},[load])
  return{data,error,loading,reload:load,setData}
}
