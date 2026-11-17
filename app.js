import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const state = {
  water:82, temp:29, evaporation:34, speed:1, pump:true, auto:true, paused:false,
  moisture:{FIELD_A:38,FIELD_B:54,FIELD_C:62,FIELD_D:29},
  irrigating:new Set(), pendingQueue:[], blocked:new Set(), leak:false, selected:'FIELD_A',
  path:[], paths:{}, particles:[], time:0, cycle:false, searchHistory:[], maxActiveZones:2
};
const FIELD_META = {
  FIELD_A:{name:'Field A',crop:'Wheat',target:65,position:[-8,0,-5],color:0x8cac61},
  FIELD_B:{name:'Field B',crop:'Corn',target:68,position:[-2.7,0,-5],color:0xa9b86a},
  FIELD_C:{name:'Field C',crop:'Tomato',target:65,position:[2.7,0,-5],color:0x739c5c},
  FIELD_D:{name:'Field D',crop:'Orchard',target:70,position:[8,0,-5],color:0x6d965e}
};
const nodePos = {
  RESERVOIR:[-10,0,5],PUMP:[-7,0,5],MAIN:[-3.5,0,2.5],
  V1:[-8,0,-1],V2:[-3,0,-1],V3:[3,0,-1],V4:[8,0,-1],
  FIELD_A:[-8,0,-5],FIELD_B:[-2.7,0,-5],FIELD_C:[2.7,0,-5],FIELD_D:[8,0,-5]
};
let scene,camera,renderer,controls,raycaster,mouse,fieldMeshes={},pipeMeshes={},waterParticles=[],sprinklers=[];
let clockStart=Date.now(), lastTick=0, eventCount=4;

function mat(color,roughness=.85){return new THREE.MeshStandardMaterial({color,roughness});}
function addBox(parent,x,y,z,w,h,d,material,rx=0,ry=0,rz=0){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function addCylinder(parent,x,y,z,r1,r2,h,material,segments=24){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
}
function addPipe(a,b,key){
  const va=new THREE.Vector3(...nodePos[a]),vb=new THREE.Vector3(...nodePos[b]);va.y=.23;vb.y=.23;
  const dir=new THREE.Vector3().subVectors(vb,va),len=dir.length();
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,len,10),mat(0x52665d,.55));
  mesh.position.copy(va).add(vb).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  mesh.userData={key,a,b};mesh.castShadow=true;scene.add(mesh);pipeMeshes[key]=mesh;
  const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.13,12),mat(0x9aa79a));
  sleeve.position.copy(mesh.position);sleeve.quaternion.copy(mesh.quaternion);scene.add(sleeve);
}
function pipeKey(a,b){return [a,b].sort().join('--');}
function buildScene(){
  const host=$('scene');scene=new THREE.Scene();scene.background=new THREE.Color(0xc9d9d0);scene.fog=new THREE.Fog(0xc9d9d0,28,65);
  camera=new THREE.PerspectiveCamera(42,host.clientWidth/host.clientHeight,.1,100);camera.position.set(17,18,22);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=12;controls.maxDistance=38;
  scene.add(new THREE.HemisphereLight(0xeaf4e8,0x6b7957,2.1));
  const sun=new THREE.DirectionalLight(0xfff0d2,2.4);sun.position.set(-10,20,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;scene.add(sun);
  // Farm terrain and surrounding landscape
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(42,32),mat(0x91aa76));ground.rotation.x=-Math.PI/2;ground.position.y=-.14;ground.receiveShadow=true;scene.add(ground);
  const base=addBox(scene,0,-.42,0,31,.55,23,mat(0x927b5c));base.position.y=-.48;
  for(let i=0;i<20;i++){const tree=new THREE.Group();const x=-15+(i%10)*3.3,z=(i<10?-9:9.2);addCylinder(tree,0,.65,0,.12,.16,1.3,mat(0x705c3f));const crown=new THREE.Mesh(new THREE.SphereGeometry(.75,12,10),mat(i%3?0x557a4e:0x668754));crown.position.y=1.65;crown.scale.set(1,1.1,1);crown.castShadow=true;tree.add(crown);tree.position.set(x,0,z);scene.add(tree);}
  // Farm road
  const road=addBox(scene,0,.015,0,2.3,.08,19,mat(0xc5b99a));road.position.z=-.1;
  const cross=addBox(scene,0,.02,-5,22,.09,1.3,mat(0xc5b99a));
  // Field plots and crop rows
  Object.entries(FIELD_META).forEach(([id,f],idx)=>{
    const [x,_,z]=f.position;
    const plot=addBox(scene,x,.04,z,4.7,.13,5.6,mat(0x6f8954));plot.userData.field=id;fieldMeshes[id]=plot;
    const border=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.78,.16,5.68)),new THREE.LineBasicMaterial({color:0xe2dfbd}));border.position.set(x,.12,z);scene.add(border);
    for(let row=0;row<7;row++){
      const rz=z-2.25+row*.72;
      const furrow=addBox(scene,x,.13,rz,4.35,.025,.10,mat(0x594b34));
      for(let col=0;col<13;col++){
        const cx=x-2+col*.33;
        const stem=addCylinder(scene,cx,.38,rz,.025,.035,.48,mat(0x496d3d),6);stem.rotation.z=(Math.random()-.5)*.18;
        if(idx===1||idx===3){
          const leaf=new THREE.Mesh(new THREE.SphereGeometry(.12,7,6),mat(idx===1?0x8ba64e:0x4c8047));leaf.scale.set(1.7,.45,.6);leaf.position.set(cx,.57,rz);leaf.castShadow=true;scene.add(leaf);
        }else{
          const leaf=new THREE.Mesh(new THREE.ConeGeometry(.10,.35,5),mat(idx===0?0x9ab85e:0x54864e));leaf.position.set(cx,.57,rz);leaf.rotation.z=.2;leaf.castShadow=true;scene.add(leaf);
        }
      }
    }
    const label=makeLabel(`${f.name.toUpperCase()} · ${f.crop.toUpperCase()}`,x,z+3.15);scene.add(label);
    const sprinkler=addCylinder(scene,x,.45,z+2.55,.055,.055,.65,mat(0x7b8980));sprinklers.push({id,mesh:sprinkler});
    const cap=addCylinder(scene,x,.8,z+2.55,.11,.11,.08,mat(0x4c777b));sprinklers[sprinklers.length-1].cap=cap;
  });
  // Reservoir, pump and control manifold
  const tankGroup=new THREE.Group();tankGroup.position.set(-10,0,5);scene.add(tankGroup);
  addCylinder(tankGroup,0,1.0,0,1.35,1.35,2,mat(0x8babb0));addCylinder(tankGroup,0,2.02,0,1.35,1.35,.12,mat(0x526d70));
  const water=new THREE.Mesh(new THREE.CylinderGeometry(1.18,1.18,1.45,32),new THREE.MeshStandardMaterial({color:0x3babc2,transparent:true,opacity:.82,roughness:.25}));water.position.y=.83;tankGroup.add(water);tankGroup.userData.water=water;
  const tankLabel=makeLabel('WATER RESERVOIR',-10,7.1);scene.add(tankLabel);
  const pump=addBox(scene,-7,.45,5,1.25,.9,1.05,mat(0x426d5a));addCylinder(scene,-7,1.0,5,.28,.28,.2,mat(0xb7c8b7));
  addBox(scene,-7.75,.9,5,.28,.22,.28,mat(0xd5aa59));
  const manifold=addBox(scene,-3.5,.45,2.5,1.5,.65,.65,mat(0x536c60));addCylinder(scene,-3.5,.85,2.5,.25,.25,.15,mat(0xb6c4b8));
  // Valves
  for(let i=1;i<=4;i++){const x=[-8,-3,3,8][i-1];addCylinder(scene,x,.36,-1,.19,.19,.6,mat(0x607b68));const handle=addBox(scene,x,.73,-1,.62,.07,.12,mat(0xc6a15d));handle.rotation.y=.3;}
  // Pipe network
  const edges=[['RESERVOIR','PUMP'],['PUMP','MAIN'],['MAIN','V1'],['MAIN','V2'],['MAIN','V3'],['MAIN','V4'],['V1','FIELD_A'],['V2','FIELD_B'],['V3','FIELD_C'],['V4','FIELD_D'],['V1','V2'],['V2','V3'],['V3','V4']];
  edges.forEach(([a,b])=>addPipe(a,b,pipeKey(a,b)));
  // Water animation beads
  for(let i=0;i<65;i++){const bead=new THREE.Mesh(new THREE.SphereGeometry(.085,8,8),new THREE.MeshBasicMaterial({color:0x6ce4f0}));bead.visible=false;scene.add(bead);waterParticles.push(bead);}
  // distant low hills
  for(let i=0;i<8;i++){const hill=new THREE.Mesh(new THREE.SphereGeometry(5,16,10),mat(0x91a986));hill.scale.set(1,.18,.6);hill.position.set(-22+i*6,-.8,-18);scene.add(hill);}
  raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove',onPointerMove);renderer.domElement.addEventListener('click',onSceneClick);
  window.addEventListener('resize',onResize);
  $('sceneLoading').classList.add('hidden');
  animate();
}
function makeLabel(text,x,z){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(247,249,239,.88)';ctx.beginPath();ctx.roundRect(5,5,502,86,16);ctx.fill();ctx.fillStyle='#294b36';ctx.font='bold 34px Arial';ctx.textAlign='center';ctx.fillText(text,256,61);
  const tex=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.position.set(x,1.55,z);sprite.scale.set(3.5,.66,1);return sprite;
}
function onResize(){if(!renderer)return;const host=$('scene');camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);}
function onPointerMove(e){
  const rect=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(Object.values(fieldMeshes),false);
  const tip=$('fieldTooltip');if(hits.length){const id=hits[0].object.userData.field;const meta=FIELD_META[id];tip.style.display='block';tip.style.left=(e.clientX-rect.left+12)+'px';tip.style.top=(e.clientY-rect.top+12)+'px';tip.innerHTML=`<b>${meta.name} · ${meta.crop}</b><span>${Math.round(state.moisture[id])}% soil moisture · target ${meta.target}%</span>`;renderer.domElement.style.cursor='pointer';}else{tip.style.display='none';renderer.domElement.style.cursor='grab';}
}
function onSceneClick(){raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(Object.values(fieldMeshes),false);if(hits.length)selectField(hits[0].object.userData.field);}
function animate(){
  requestAnimationFrame(animate);const t=performance.now()*.001;controls.update();
  updateParticles(t, state.paths, state.path);
  sprinklers.forEach(s=>{s.cap.material.color.set(state.irrigating.has(s.id)?0x55d5e8:0x4c777b);});
  const tank=scene.children.find(o=>o.userData&&o.userData.water);if(tank&&tank.userData.water){tank.userData.water.scale.y=Math.max(.12,state.water/82);tank.userData.water.position.y=.15+(state.water/100)*.7;}
  Object.entries(fieldMeshes).forEach(([id,mesh])=>{const m=state.moisture[id];const color=m<40?0x9a8659:m<60?0x829b5e:0x638e5c;mesh.material.color.lerp(new THREE.Color(color),.04);});
  renderer.render(scene,camera);
}
function updateParticles(t, paths, highlightedPath=[]){
  const activeEdges=[];
  Object.entries(paths || {}).forEach(([field,path])=>{
    if(!state.irrigating.has(field))return;
    for(let i=0;i<path.length-1;i++){
      const key=pipeKey(path[i],path[i+1]);
      if(pipeMeshes[key]&&!state.blocked.has(key))activeEdges.push([path[i],path[i+1]]);
    }
  });
  const highlightEdges=[];
  for(let i=0;i<highlightedPath.length-1;i++){
    const edge=[highlightedPath[i],highlightedPath[i+1]];
    if(pipeMeshes[pipeKey(...edge)]&&!state.blocked.has(pipeKey(...edge)))highlightEdges.push(edge);
  }
  const visibleEdges=activeEdges.length?activeEdges:highlightEdges;
  const flowing=state.pump&&activeEdges.length>0;
  waterParticles.forEach((particle,i)=>{
    const edgeIndex=Math.floor(i*activeEdges.length/waterParticles.length);
    if(!flowing||edgeIndex>=activeEdges.length){particle.visible=false;return;}
    const edge=activeEdges[edgeIndex],progress=(t*.48+(i/waterParticles.length)*.85)%1;
    const a=new THREE.Vector3(...nodePos[edge[0]]),b=new THREE.Vector3(...nodePos[edge[1]]);
    a.y=.35;b.y=.35;particle.position.copy(a).lerp(b,progress);particle.visible=true;
  });
  Object.entries(pipeMeshes).forEach(([key,mesh])=>{
    const isBlocked=state.blocked.has(key);
    const isActive=visibleEdges.some(edge=>pipeKey(...edge)===key);
    mesh.material.color.set(isBlocked?0xb95f52:(isActive?0x36a8bb:0x586d63));
    mesh.material.emissive.set(isActive?0x164e59:0x000000);
  });
}
function selectField(id){
  state.selected=id;document.querySelectorAll('.field-card').forEach(c=>c.classList.toggle('selected',c.dataset.field===id));
  toast(`${FIELD_META[id].name} selected`);$('goalSelect').value=id;
}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2300);}
function logEvent(title,detail,kind='green'){
  const list=$('eventList');const icon=kind==='amber'?'↗':kind==='blue'?'⌁':'✓';const el=document.createElement('div');el.className='event';el.innerHTML=`<i class="event-mark ${kind}">${icon}</i><div><b>${title}</b><small>${detail} · just now</small></div>`;list.prepend(el);while(list.children.length>5)list.lastChild.remove();eventCount++;$('eventCount').textContent=String(eventCount).padStart(2,'0')+' EVENTS';
}
function renderMetrics(){
  const avg=Math.round(Object.values(state.moisture).reduce((a,b)=>a+b,0)/4);
  $('waterMetric').textContent=Math.round(state.water);$('waterBar').style.width=state.water+'%';$('waterLitres').textContent=`${Math.round(state.water*100)} / 10,000 L`;
  $('moistureMetric').textContent=avg;$('moistureBar').style.width=avg+'%';$('activeMetric').textContent=String(state.irrigating.size).padStart(2,'0');$('activeLimit').textContent=String(state.maxActiveZones).padStart(2,'0');
  $('tempMetric').textContent=state.temp;$('tempValue').textContent=state.temp+'°C';$('evapValue').textContent=state.evaporation+'%';$('speedValue').textContent=state.speed+'×';
  $('weatherText').textContent=state.temp>=36?'Heat alert · high evaporation':state.temp<=20?'Cool conditions · low evaporation':'Clear sky · 34% humidity';
  Object.entries(state.moisture).forEach(([id,val])=>{
    const card=document.querySelector(`[data-field="${id}"]`);if(!card)return;
    card.querySelector('.field-moisture').textContent=Math.round(val)+'% moisture';card.querySelector('.mini-track i').style.width=val+'%';
    const tag=card.querySelector('.field-state');
    if(state.irrigating.has(id)){tag.textContent='ACTIVE';tag.className='field-state active';}
    else if(state.pendingQueue.includes(id)){tag.textContent='WAITING';tag.className='field-state waiting';}
    else {tag.textContent=val<40?'DRY':val>80?'WET':'GOOD';tag.className='field-state '+(val<40?'warn':'good');}
  });
  $('pumpStatus').textContent=state.pump?'● PUMP ONLINE':'● PUMP OFFLINE';$('pumpStatus').className='status-pill '+(state.pump?'good':'');
  Object.entries(state.moisture).forEach(([id,val])=>{
    const row=document.querySelector(`[data-analytics-field="${id}"]`);if(!row)return;
    row.querySelector('.chart-track i').style.width=val+'%';row.querySelector('b').textContent=Math.round(val)+'%';
    row.querySelector('.chart-track i').classList.toggle('low',val<40);
  });
}
function activateNextZones(){
  while(state.pump && state.water>0 && state.irrigating.size<state.maxActiveZones && state.pendingQueue.length){
    const next=state.pendingQueue.shift();
    if(state.moisture[next] >= FIELD_META[next].target)continue;
    state.irrigating.add(next);
    logEvent(`${FIELD_META[next].name} irrigation started`,'Activated by smart priority scheduler','blue');
  }
  renderMetrics();
}

function simulateTick(){
  if(state.paused)return;
  const dt=.12*state.speed;state.time+=dt;
  Object.keys(state.moisture).forEach(id=>{
    const irrigating=state.irrigating.has(id);
    const evap=(.006+state.evaporation*.00013+Math.max(0,state.temp-25)*.0007)*dt;
    state.moisture[id]=Math.max(5,Math.min(100,state.moisture[id]-(evap*100)+(irrigating && state.pump ? 4.0*dt : 0)));
    if(irrigating&&state.moisture[id]>=FIELD_META[id].target){
      state.irrigating.delete(id);
      logEvent(`${FIELD_META[id].name} irrigation complete`,`Target moisture ${FIELD_META[id].target}% reached`);
    }
  });
  if(state.irrigating.size&&state.pump)state.water=Math.max(0,state.water-.018*state.irrigating.size*dt*(state.leak?1.8:1));
  if(state.leak)state.water=Math.max(0,state.water-.025*dt);
  if(state.water<=0){state.irrigating.clear();state.pendingQueue=[];state.paths={};state.cycle=false;state.pump=false;$('pumpToggle').checked=false;toast('Reservoir empty · pump stopped');}
  if(state.cycle&&state.pump){
    activateNextZones();
    if(state.irrigating.size===0&&state.pendingQueue.length===0){
      state.cycle=false;state.paths={};state.path=[];
      logEvent('Smart irrigation cycle completed','All reachable target fields completed');
      toast('Smart irrigation cycle completed');
    }
  }
  renderMetrics();
}
async function runCycle(){
  if(state.cycle){toast('Irrigation cycle is already running');return;}
  if(!state.pump){toast('Pump is offline. Turn it on first.');return;}
  if(state.water<5){toast('Reservoir level too low.');return;}
  const targets=Object.keys(state.moisture).filter(id=>state.moisture[id]<FIELD_META[id].target);
  if(!targets.length){toast('All fields are at target moisture.');return;}

  state.cycle=true;state.irrigating.clear();state.pendingQueue=[];state.paths={};state.path=[];
  renderMetrics();
  logEvent('Smart irrigation cycle started',`${targets.length} sectors assessed · highest moisture deficit first`,'blue');
  toast('Ranking field priorities and calculating A* routes');

  let priorityOrder=targets;
  try{
    const scheduleResponse=await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moisture:state.moisture,targets:Object.fromEntries(Object.entries(FIELD_META).map(([id,meta])=>[id,meta.target]))})});
    if(!scheduleResponse.ok)throw new Error(`HTTP ${scheduleResponse.status}`);
    const schedule=await scheduleResponse.json();
    state.maxActiveZones=schedule.max_active_zones;
    priorityOrder=schedule.priority_order;
  }catch(error){
    state.cycle=false;toast('Could not calculate smart irrigation priorities');return;
  }

  const results=await Promise.all(priorityOrder.map(async goal=>{
    const payload={start:'RESERVOIR',goal,blocked:[...state.blocked],pump_on:state.pump};
    try{
      const response=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return {goal,data:await response.json()};
    }catch(error){return {goal,data:null};}
  }));

  if(!state.pump){state.irrigating.clear();state.pendingQueue=[];state.paths={};state.cycle=false;renderMetrics();toast('Pump stopped · irrigation cancelled');return;}

  const reachable=[];
  results.forEach(({goal,data})=>{
    if(data&&data.found){state.paths[goal]=data.path;reachable.push(goal);updateSearchDashboard(data,goal);}
    else{logEvent(`${FIELD_META[goal].name} unavailable`,'No valid route from reservoir','amber');}
  });
  state.pendingQueue=reachable;
  activateNextZones();
  if(reachable.length){
    const first=reachable[0];state.path=state.paths[first]||[];
    logEvent('Smart distribution active',`${state.irrigating.size} active · ${state.pendingQueue.length} waiting · max ${state.maxActiveZones} zones`,'blue');
    toast(`${state.irrigating.size} zones active · ${state.pendingQueue.length} waiting`);
  }else{
    state.cycle=false;toast('No fields have an available water route');
  }
  renderMetrics();
}
async function searchPath(goal,showToast=true){
  const payload={start:'RESERVOIR',goal,blocked:[...state.blocked],pump_on:state.pump};
  try{
    const res=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    state.path=data.found?data.path:[];
    state.paths=data.found?{[goal]:data.path}:{};
    updateSearchDashboard(data,goal);
    if($('searchDrawer').classList.contains('open')||showToast){
      const box=$('searchResult');box.className='search-result';
      const metrics=`<div class="result-metrics"><span><b>${data.execution_time_ms}</b> ms</span><span><b>${data.nodes_explored}</b> explored</span><span><b>${data.graph_edges}</b> active edges</span></div>`;
      if(data.found){
        box.innerHTML=`<b>✓ ROUTE FOUND · A* SEARCH</b><div class="result-path">${data.path.join(' → ')}</div><div>Physical pipe distance: <b>${data.cost} units</b> · Nodes explored: <b>${data.nodes_explored}</b></div>${metrics}<div class="result-section"><b>EXPLORED ORDER</b><div class="node-chips">${data.explored.map(n=>`<span class="node-chip">${n}</span>`).join('')}</div></div><div class="result-section"><b>A* OPEN-SET TRACE</b>${data.steps.map((step,i)=>`<div>${i+1}. Visit <b>${step.current}</b> · g=${step.g}, h=${step.h}, f=${step.f}</div>`).join('')}</div>`;
        if(showToast)toast(`A* found route · ${data.cost} distance units`);
      }else{
        box.innerHTML=`<b>× NO ROUTE FOUND</b><p>There is no available connection from reservoir to this field. Check the pump and pipe condition.</p>${metrics}`;
        if(showToast)toast('No available route to destination');
      }
    }
    return data;
  }catch(e){toast('Could not contact A* search service');return null;}
}
function updateSearchDashboard(data,goal){
  const history=state.searchHistory;
  history.unshift({goal,found:data.found,cost:data.cost,ms:data.execution_time_ms,nodes:data.nodes_explored});
  if(history.length>5)history.pop();
  $('lastExec').textContent=Number(data.execution_time_ms).toFixed(4);
  $('lastExplored').textContent=data.nodes_explored;
  $('lastCost').textContent=data.found?Number(data.cost).toFixed(2):'—';
  $('graphSize').textContent=`${data.graph_nodes} / ${data.graph_edges}`;
  $('searchHealth').textContent=data.found?'● ROUTE FOUND':'● NO ROUTE';
  $('searchHealth').className='status-pill '+(data.found?'good':'');
  $('searchCount').textContent=`${history.length} recent ${history.length===1?'search':'searches'}`;
  $('searchHistory').innerHTML=history.map(item=>`<div class="history-row"><span class="history-status ${item.found?'ok':'fail'}">${item.found?'✓':'×'}</span><b>${item.goal.replace('FIELD_','Field ')}</b><span>${item.found?Number(item.cost).toFixed(2)+' units':'No route'}</span><small>${Number(item.ms).toFixed(3)} ms</small></div>`).join('');
}
function setScenario(name){
  document.querySelectorAll('.scenario').forEach(b=>b.classList.toggle('active',b.dataset.scenario===name));
  state.blocked.clear();state.leak=false;
  if(name==='normal'){state.temp=29;state.evaporation=34;state.pump=true;state.water=82;}
  if(name==='drought'){state.temp=41;state.evaporation=86;state.moisture.FIELD_A=22;state.moisture.FIELD_B=34;state.moisture.FIELD_C=42;state.moisture.FIELD_D=18;}
  if(name==='blocked'){state.blocked.add(pipeKey('V2','FIELD_B'));state.moisture.FIELD_B=27;}
  if(name==='leak'){state.leak=true;state.water=58;state.temp=35;}
  $('tempSlider').value=state.temp;$('evapSlider').value=state.evaporation;$('pumpToggle').checked=state.pump;
  state.irrigating.clear();state.pendingQueue=[];state.paths={};state.path=[];state.cycle=false;renderMetrics();logEvent('Scenario loaded',name.toUpperCase()+' conditions applied','amber');toast(`${name[0].toUpperCase()+name.slice(1)} scenario loaded`);
}
function openDrawer(){ $('searchDrawer').classList.add('open');$('drawerBackdrop').classList.add('open');}
function closeDrawer(){ $('searchDrawer').classList.remove('open');$('drawerBackdrop').classList.remove('open');}
function bindUI(){
  $('pumpToggle').addEventListener('change',e=>{state.pump=e.target.checked;if(!state.pump){state.irrigating.clear();state.pendingQueue=[];state.paths={};state.path=[];state.cycle=false;}renderMetrics();logEvent('Pump status changed',state.pump?'Pump activated':'Pump deactivated','amber');});
  $('autoToggle').addEventListener('change',e=>{state.auto=e.target.checked;toast(state.auto?'Automatic control enabled':'Automatic control disabled');});
  $('tempSlider').addEventListener('input',e=>{state.temp=+e.target.value;renderMetrics();});
  $('evapSlider').addEventListener('input',e=>{state.evaporation=+e.target.value;renderMetrics();});
  $('speedSlider').addEventListener('input',e=>{state.speed=+e.target.value;renderMetrics();});
  document.querySelectorAll('.scenario').forEach(b=>b.addEventListener('click',()=>setScenario(b.dataset.scenario)));
  document.querySelectorAll('.field-card').forEach(b=>b.addEventListener('click',()=>selectField(b.dataset.field)));
  $('runCycle').addEventListener('click',runCycle);
  $('pauseBtn').addEventListener('click',()=>{state.paused=!state.paused;$('pauseBtn').textContent=state.paused?'▶ Resume simulation':'Ⅱ Pause simulation';toast(state.paused?'Simulation paused':'Simulation resumed');});
  $('resetBtn').addEventListener('click',()=>{state.water=82;state.temp=29;state.evaporation=34;state.moisture={FIELD_A:38,FIELD_B:54,FIELD_C:62,FIELD_D:29};state.pump=true;state.auto=true;state.paused=false;state.blocked.clear();state.leak=false;state.irrigating.clear();state.pendingQueue=[];state.path=[];state.paths={};state.cycle=false;$('pumpToggle').checked=true;$('autoToggle').checked=true;$('tempSlider').value=29;$('evapSlider').value=34;$('pauseBtn').textContent='Ⅱ Pause simulation';setScenario('normal');toast('Simulation reset');});
  $('viewReset').addEventListener('click',()=>{camera.position.set(17,18,22);controls.target.set(0,0,0);controls.update();});
  $('navSearch').addEventListener('click',openDrawer);$('navScenarios').addEventListener('click',()=>{document.querySelector('.scenario-block').scrollIntoView({behavior:'smooth',block:'center'});});
  $('closeDrawer').addEventListener('click',closeDrawer);$('drawerBackdrop').addEventListener('click',closeDrawer);
  $('findPath').addEventListener('click',()=>searchPath($('goalSelect').value,true));
  $('clearPath').addEventListener('click',()=>{state.path=[];state.paths={};$('searchResult').className='search-result empty';$('searchResult').textContent='Highlighted route cleared.';toast('Path highlight cleared');});
}
function updateClock(){const elapsed=Math.floor((Date.now()-clockStart)/1000);const h=8+Math.floor(elapsed/3600),m=Math.floor(elapsed/60)%60,s=elapsed%60;$('clock').textContent=[h%24,m,s].map(x=>String(x).padStart(2,'0')).join(':');}
function loop(){const now=performance.now();if(now-lastTick>120){simulateTick();lastTick=now;}updateClock();requestAnimationFrame(loop);}
bindUI();renderMetrics();
try{buildScene();}catch(err){console.error(err);$('sceneLoading').innerHTML='3D engine could not load. Check internet access and refresh.';}
loop();
