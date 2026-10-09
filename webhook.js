// Power Automate HTTP-triggered flow endpoint. Keep this URL private in host environment variables.
async function webhook(payload) {
  const url=process.env.PA_WEBHOOK_URL;
  if(!url){console.warn('PA_WEBHOOK_URL is not configured; no email automation was triggered for',payload.event,payload.record.id);return;}
  const headers={'Content-Type':'application/json'};
  if(process.env.PA_SHARED_SECRET) headers['x-sfi-secret']=process.env.PA_SHARED_SECRET;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
  try { const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({event:payload.event,record:payload.record}),signal:controller.signal}); if(!response.ok)throw new Error(`Power Automate returned HTTP ${response.status}`); }
  finally {clearTimeout(timer);}
}
module.exports={webhook};
