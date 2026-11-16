const config=document.querySelector('[data-ratings-api]');
if(config)start(config.dataset.ratingsApi);
async function start(api){
 const storage='loghub-anonymous-rating-credential',selector=document.querySelector('[data-rating-selector]'),status=document.querySelector('[data-rating-status]');
 const say=text=>{if(status)status.textContent=text;};
 let identity;
 function credential(create=false){
  if(identity)return identity;
  const stored=localStorage.getItem(storage);if(stored&&/^[A-Za-z0-9_-]{43}$/.test(stored))return identity=stored;
  if(!create)return null;
  const candidate=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  return navigator.locks.request(storage,()=>{const current=localStorage.getItem(storage);identity=current&&/^[A-Za-z0-9_-]{43}$/.test(current)?current:candidate;localStorage.setItem(storage,identity);return identity;});
 }
 async function request(path,method='GET',data,auth=false){
  const token=auth?await credential(method==='PUT'):null;if(auth&&!token)throw Error('No saved browser rating.');
  const response=await fetch(api+path,{method,credentials:'omit',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===429?'Too many changes. Try again shortly.':'Ratings unavailable. Please try again.');return response.json();
 }
 function display(id,data){
  if(!Number.isInteger(data.count)||data.count<0||(data.count===0?data.average!==null:!Number.isFinite(data.average)||data.average<1||data.average>7))throw Error('Ratings unavailable.');
  document.querySelectorAll('[data-ratings-project]').forEach(el=>{if(el.dataset.ratingsProject!==id)return;const text=data.count?`${data.average.toFixed(1)} / 7 (${data.count} ratings)`:'Not rated yet';el.querySelector('.rating-value').textContent=text;el.setAttribute('aria-label','Community rating: '+text);el.querySelectorAll('.dragon-ball').forEach((ball,i)=>ball.classList.toggle('muted',!data.count||i>=Math.round(data.average)));});
 }
 function unavailable(id){document.querySelectorAll('[data-ratings-project]').forEach(el=>{if(el.dataset.ratingsProject===id){el.querySelector('.rating-value').textContent='Ratings unavailable';el.setAttribute('aria-label','Community ratings unavailable');el.querySelectorAll('.dragon-ball').forEach(ball=>ball.classList.add('muted'));}});}
 async function refresh(id){try{display(id,await request('/projects/'+id));}catch{unavailable(id);}}
 const ids=[...new Set([...document.querySelectorAll('[data-ratings-project]')].map(el=>el.dataset.ratingsProject))];await Promise.all(ids.map(refresh));if(!selector)return;
 const id=selector.dataset.ratingSelector;let saved=null,busy=false,queued=null;
 const remove=document.querySelector('[data-rating-delete]');
 function selected(score){selector.querySelectorAll('input').forEach(el=>el.checked=Number(el.value)===score);}
 async function mine(){
  try{identity=null;if(!credential()){selected(null);remove.disabled=true;return;}
   const data=await request('/projects/'+id+'/mine','GET',undefined,true);display(id,data);saved=data.score;selected(saved);remove.disabled=saved===null;say(data.excluded?'Your rating is excluded from community aggregates.':saved?`Your saved rating: ${saved} out of 7.`:'Choose a Dragon Ball to save a rating.');
  }catch(error){selected(null);remove.disabled=true;say(error.message);unavailable(id);}
 }
 async function save(score){
  queued=score;if(busy)return;busy=true;remove.disabled=true;
  while(queued!==null){const next=queued;queued=null;say('Saving rating...');try{const data=await request('/projects/'+id+'/mine','PUT',{score:next},true);display(id,data);saved=data.score;if(queued===null)selected(saved);say(data.excluded?'Your rating is excluded from community aggregates.':`Rating saved: ${saved} out of 7.`);}catch(error){if(queued===null)selected(saved);say(error.message);unavailable(id);}}
  busy=false;remove.disabled=saved===null;
 }
 selector.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{if(input.checked)save(Number(input.value));}));
 remove.onclick=async()=>{if(busy)return;busy=true;remove.disabled=true;selector.querySelectorAll('input').forEach(el=>el.disabled=true);say('Removing rating...');try{const data=await request('/projects/'+id+'/mine','DELETE',undefined,true);display(id,data);saved=null;selected(null);say('Your rating was removed.');}catch(error){say(error.message);unavailable(id);}finally{busy=false;remove.disabled=saved===null;selector.querySelectorAll('input').forEach(el=>el.disabled=false);}};
 document.querySelector('[data-rating-erase]').onclick=async()=>{if(busy||!confirm('Remove all ratings made with this browser identity?'))return;busy=true;selector.querySelectorAll('input').forEach(el=>el.disabled=true);try{await request('/identity','DELETE',undefined,true);saved=null;selected(null);remove.disabled=true;await refresh(id);say('All ratings made with this browser identity were removed.');}catch(error){say(error.message);}finally{busy=false;selector.querySelectorAll('input').forEach(el=>el.disabled=false);}};
 window.addEventListener('storage',event=>{if(event.key===storage&&!busy)mine();});
 window.addEventListener('pageshow',event=>{if(event.persisted&&!busy)mine();});
 await mine();
}
