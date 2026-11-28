export async function api(path:string,body?:any,timeoutMs=15000){
  // The hard timer guarantees the call settles even when a hung fetch (service worker, network)
  // ignores the abort signal; without it one hung request jams the refresh queue forever.
  const controller=new AbortController();
  const timeoutError=Object.assign(new Error('Request timed out; the server may have committed. Refresh state before retrying.'),{unknownOutcome:body!==undefined});
  let rejectHard:(e:unknown)=>void=()=>{};
  const hard=new Promise<never>((_,reject)=>{rejectHard=reject;});
  const timer=setTimeout(()=>{rejectHard(timeoutError);controller.abort();},timeoutMs);
  try{
    const r=await Promise.race([fetch('/api'+path,{signal:controller.signal,method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),hard]);
    const data=await Promise.race([r.json(),hard]);
    if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status,expectedOrigin:data.expectedOrigin});
    return data;
  }catch(error){if(controller.signal.aborted)throw timeoutError;throw error;}
  finally{clearTimeout(timer);}
}
