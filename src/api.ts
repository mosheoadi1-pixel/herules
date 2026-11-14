export async function api(path:string,body?:any){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch('/api'+path,{signal:controller.signal,method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status,expectedOrigin:data.expectedOrigin});return data;}
 catch(error){if(controller.signal.aborted)throw Object.assign(new Error('Request timed out; the server may have committed. Refresh state before retrying.'),{unknownOutcome:body!==undefined});throw error;}
 finally{clearTimeout(timer);}
}
