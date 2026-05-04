(function initCommunicationCentre(global){
  const M={state:{rows:[],count:0,page:1,limit:25,filters:{},active:null,messages:[],participants:[]}};
  const $=id=>document.getElementById(id);
  const can=(a)=>global.Permissions?.can?.('communication_centre',a)||global.Permissions?.can?.('communication_centre','manage');
  const db=()=>global.SupabaseClient.getClient();
  const nameOf=(u={})=>u.full_name||u.name||u.display_name||u.username||u.email||u.user_id||'Unknown';
  async function list(){
    let q=db().from('communication_centre_conversations').select('*',{count:'exact'});
    const f=M.state.filters;
    if(f.search){const s=f.search.trim(); q=q.or(`conversation_no.ilike.%${s}%,title.ilike.%${s}%,description.ilike.%${s}%,created_by_name.ilike.%${s}%,last_message_preview.ilike.%${s}%`);}    
    ['status','priority','category','assigned_role','created_by_name'].forEach(k=>{if(f[k]) q=q.eq(k,f[k]);});
    const from=(M.state.page-1)*M.state.limit,to=from+M.state.limit-1;
    const {data,error,count}=await q.order('last_message_at',{ascending:false,nullsFirst:false}).order('updated_at',{ascending:false}).range(from,to);
    if(error) throw error; M.state.rows=data||[]; M.state.count=count||0;
  }
  async function openDetail(id){
    const {data,error}=await db().from('communication_centre_conversations').select('*').eq('id',id).maybeSingle();
    if(error||!data){global.UI.toast(`You do not have access to this conversation.`);return;}
    M.state.active=data; const [msgs,parts]=await Promise.all([
      db().from('communication_centre_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true}),
      db().from('communication_centre_participants').select('*').eq('conversation_id',id).order('participant_type',{ascending:true}).order('user_name',{ascending:true})
    ]);
    M.state.messages=msgs.data||[]; M.state.participants=parts.data||[]; renderDrawer();
    db().rpc('mark_communication_centre_read',{p_conversation_id:id}).then(()=>{}).catch(()=>{});
  }
  async function notifyParticipants(title,body,conversationId,excludeUserId){
    try{
      const {data}=await db().from('communication_centre_participants').select('user_id,user_email').eq('conversation_id',conversationId);
      const ids=[...new Set((data||[]).map(x=>x.user_id).filter(Boolean).filter(x=>String(x)!==String(excludeUserId)))];
      if(!ids.length) return;
      await global.NotificationService?.sendBusinessNotification?.({resource:'communication_centre',action:'update',title,body,targetUsers:ids,url:`/#communication_centre?conversation_id=${conversationId}`,channels:['in_app','push']});
    }catch(e){console.warn('[communication-centre] notify failed',e);} }
  function render(){const b=$('communicationCentreTbody'); if(!b) return; b.innerHTML=M.state.rows.map(r=>`<tr><td>${r.conversation_no||'—'}</td><td>${r.title||''}</td><td>${r.category||'—'}</td><td>${r.priority||'—'}</td><td>${r.status||'—'}</td><td>${r.created_by_name||'—'}</td><td>${r.assigned_role||'—'}</td><td>${r.last_message_preview||'—'}</td><td>${new Date(r.updated_at).toLocaleString()}</td><td><button class='btn ghost sm' data-cc-open='${r.id}'>Open</button></td></tr>`).join('')||'<tr><td colspan="10" class="muted" style="text-align:center;">No Communication Centre conversations found.</td></tr>';
    $('communicationCentrePageInfo').textContent=`Page ${M.state.page} • ${M.state.count} total`;}
  function renderDrawer(){const d=$('communicationCentreDrawer'); if(!d) return; const c=M.state.active; d.style.display='block'; $('communicationCentreDrawerTitle').textContent=`${c.conversation_no||''} ${c.title||''}`; $('communicationCentreDrawerMeta').textContent=`${c.status} • ${c.priority} • ${c.category}`; $('communicationCentreParticipants').innerHTML=M.state.participants.map(p=>`<span class='chip'>${p.participant_type}: ${p.user_name||p.user_email||p.user_id}</span>`).join(' '); $('communicationCentreMessages').innerHTML=M.state.messages.map(m=>`<div class='card' style='padding:8px;margin-bottom:6px;${m.sender_user_id===global.Session?.user?.()?.id?'background:#f1f7ff;':''}'><div class='muted'>${m.sender_name||'System'} • ${new Date(m.created_at).toLocaleString()}</div><div>${(global.U?.escapeHtml?.(m.message_body||m.body||'')||'')}</div></div>`).join(''); $('communicationCentreReplyWrap').style.display=(can('reply')&&c.status!=='Closed')?'':'none'; $('communicationCentreClosedMsg').style.display=c.status==='Closed'?'':'none';}
  async function refresh(){try{await list();render();}catch(e){global.UI.toast(`Unable to load Communication Centre: ${e.message||e}`);}}
  M.openConversationById=openDetail;
  M.init=async function(){
    $('communicationCentreRefreshBtn')?.addEventListener('click',refresh);
    $('communicationCentreSearch')?.addEventListener('input',e=>{M.state.filters.search=e.target.value; M.state.page=1; refresh();});
    ['Status','Priority','Category','AssignedRole','CreatedBy'].forEach(k=>$("communicationCentreFilter"+k)?.addEventListener('change',e=>{M.state.filters[k==='AssignedRole'?'assigned_role':k==='CreatedBy'?'created_by_name':k.toLowerCase()]=e.target.value; M.state.page=1; refresh();}));
    $('communicationCentrePrevBtn')?.addEventListener('click',()=>{if(M.state.page>1){M.state.page--;refresh();}});
    $('communicationCentreNextBtn')?.addEventListener('click',()=>{if(M.state.page*M.state.limit<M.state.count){M.state.page++;refresh();}});
    $('communicationCentreTbody')?.addEventListener('click',e=>{const b=e.target.closest('[data-cc-open]'); if(b) openDetail(b.getAttribute('data-cc-open'));});
    $('communicationCentreDrawerClose')?.addEventListener('click',()=>{$('communicationCentreDrawer').style.display='none';});
    $('communicationCentreReplyBtn')?.addEventListener('click',async()=>{const c=M.state.active; const body=$('communicationCentreReplyInput').value.trim(); if(!body) return global.UI.toast('First message is required'); try{await db().rpc('add_communication_centre_reply',{p_conversation_id:c.id,p_message_body:body}); $('communicationCentreReplyInput').value=''; await openDetail(c.id); await refresh(); global.UI.toast('Reply sent.'); notifyParticipants('New Communication Centre reply',`${global.Session?.displayName?.()||'A user'} replied to “${c.title}”`,c.id,global.Session?.user?.()?.id);}catch(e){global.UI.toast(`Unable to send reply: ${e.message||e}`);}});
    await refresh();
  };
  global.CommunicationCentre=M;
  document.addEventListener('DOMContentLoaded',()=>{
    const tab=document.getElementById('communicationCentreTab') || document.querySelector('[data-view="communication_centre"],[data-tab="communication_centre"],[href="#communication_centre"]');
    if(tab && tab.dataset.ccClickFallbackBound !== 'true'){
      tab.dataset.ccClickFallbackBound = 'true';
      tab.addEventListener('click',event=>{
        event.preventDefault();
        if(typeof global.setActiveView === 'function'){
          global.setActiveView('communication_centre');
          return;
        }
        if(!M._inited){M._inited=true; M.init();}
      });
    }
  });
})(window);
