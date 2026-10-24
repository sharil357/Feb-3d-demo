import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const root = document.getElementById('fep3dViewport');
const status = document.getElementById('engineStatus');
const caption = document.getElementById('match3dCaption');
const watch = document.getElementById('watch3d');
if (!root) throw new Error('FEP 3D viewport is missing');

let renderer, scene, camera, clock, animationId, disposed = false;
let homePlayers = [], awayPlayers = [], ball, scoreLabel, phase = 0, running = false;
let fixture = {home:'Home FC', away:'Away FC', homeStrength:60, awayStrength:60, homeScore:null, awayScore:null, attendance:6500, capacity:12000};
const movers = [];
let audioContext=null,crowdGain=null,crowdFilter=null,crowdSource=null,crowdBuffer=null,crowdStarted=false,crowdMuted=false,goalPulseAt=-10;
function initCrowdAudio(){
  if(crowdStarted)return;
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)return;
  try{
    audioContext=audioContext||new AudioCtx();
    if(audioContext.state==='suspended')audioContext.resume();
    const length=audioContext.sampleRate*3;
    crowdBuffer=audioContext.createBuffer(1,length,audioContext.sampleRate);
    const data=crowdBuffer.getChannelData(0);
    let low=0;
    for(let i=0;i<length;i++){low=low*.985+(Math.random()*2-1)*.015;data[i]=low*2.8+(Math.random()*2-1)*.12}
    crowdSource=audioContext.createBufferSource();crowdSource.buffer=crowdBuffer;crowdSource.loop=true;
    crowdFilter=audioContext.createBiquadFilter();crowdFilter.type='bandpass';crowdFilter.frequency.value=620;crowdFilter.Q.value=.55;
    const rumble=audioContext.createBiquadFilter();rumble.type='lowpass';rumble.frequency.value=240;
    const rumbleGain=audioContext.createGain();rumbleGain.gain.value=.48;
    crowdGain=audioContext.createGain();crowdGain.gain.value=0;
    crowdSource.connect(crowdFilter);crowdFilter.connect(crowdGain);crowdSource.connect(rumble);rumble.connect(rumbleGain);rumbleGain.connect(crowdGain);crowdGain.connect(audioContext.destination);
    crowdSource.start();crowdStarted=true;setCrowdLevel(.22);
  }catch(e){crowdStarted=false}
}
function attendanceFactor(){return clamp((Number(fixture.attendance)||0)/Math.max(1,Number(fixture.capacity)||12000),.08,1)}
function setCrowdLevel(level,duration=.8){
  if(!crowdGain||!audioContext)return;
  const now=audioContext.currentTime,target=crowdMuted?0:clamp(level,0,1)*(.10+.22*attendanceFactor());
  crowdGain.gain.cancelScheduledValues(now);crowdGain.gain.setTargetAtTime(target,now,duration);
}
function cheerForGoal(){
  initCrowdAudio();if(!crowdGain||!audioContext||crowdMuted)return;
  const now=audioContext.currentTime,peak=(.55+.45*attendanceFactor())*.42;
  crowdGain.gain.cancelScheduledValues(now);crowdGain.gain.setTargetAtTime(peak,now,.07);
  crowdGain.gain.setTargetAtTime((.10+.22*attendanceFactor())*.78,now+2.2,.9);
}
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

function makeLabel(text, colour='#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width=512; canvas.height=96;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(4,14,25,.84)'; ctx.fillRect(0,0,512,96);
  ctx.strokeStyle='rgba(255,255,255,.24)'; ctx.strokeRect(1,1,510,94);
  ctx.fillStyle=colour; ctx.font='bold 30px system-ui, sans-serif'; ctx.textAlign='center';
  ctx.fillText(text.slice(0,29),256,59);
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  sprite.scale.set(5.2,.98,1); return sprite;
}
function addPitch() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(72,108), new THREE.MeshStandardMaterial({color:0x145d38,roughness:.96}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.08; scene.add(ground);
  for(let i=0;i<12;i++){
    const stripe=new THREE.Mesh(new THREE.PlaneGeometry(72,9),new THREE.MeshStandardMaterial({color:i%2?0x17663c:0x1b7043,roughness:1}));
    stripe.rotation.x=-Math.PI/2; stripe.position.set(0,-.065,-49.5+i*9);scene.add(stripe);
  }
  const points=[];
  function line(x1,z1,x2,z2){points.push(new THREE.Vector3(x1,.015,z1),new THREE.Vector3(x2,.015,z2))}
  line(-31,-49,31,-49);line(31,-49,31,49);line(31,49,-31,49);line(-31,49,-31,-49);
  line(-31,0,31,0);
  for(let i=0;i<64;i++){const a=i*Math.PI*2/64,b=(i+1)*Math.PI*2/64;line(Math.cos(a)*9,Math.sin(a)*9,Math.cos(b)*9,Math.sin(b)*9)}
  // Penalty arcs and corner quarter-circles complete more of the regulation pitch markings.
  for(const end of [-1,1]){
    const spotZ=end*38;
    for(let i=0;i<28;i++){
      const a=(-.78+i*(1.56/28)),b=(-.78+(i+1)*(1.56/28));
      line(Math.cos(a)*9,spotZ+Math.sin(a)*9,Math.cos(b)*9,spotZ+Math.sin(b)*9);
    }
    for(const cornerX of [-31,31]){
      const start=cornerX<0?0:Math.PI/2;
      const baseX=cornerX,baseZ=end*49;
      for(let i=0;i<8;i++){
        const a=start+i*Math.PI/16,b=start+(i+1)*Math.PI/16;
        line(baseX+Math.cos(a)*1.4,baseZ-end*Math.sin(a)*1.4,baseX+Math.cos(b)*1.4,baseZ-end*Math.sin(b)*1.4);
      }
    }
  }
  for(const z of [-49,49]){
    line(-18,z+(z<0?1:-1)*16,18,z+(z<0?1:-1)*16);
    line(-18,z, -18,z+(z<0?1:-1)*16);line(18,z,18,z+(z<0?1:-1)*16);
    line(-8,z+(z<0?1:-1)*6,8,z+(z<0?1:-1)*6);
    line(-8,z,-8,z+(z<0?1:-1)*6);line(8,z,8,z+(z<0?1:-1)*6);
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xe7f4e9})));
  for(const z of [-53,53]){
    const goal=new THREE.Group();
    const postMat=new THREE.MeshStandardMaterial({color:0xf3f5f7,roughness:.4});
    for(const x of [-7,7]){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,5.5,8),postMat);p.position.set(x,2.7,0);goal.add(p);
    }
    const bar=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,14,8),postMat);bar.rotation.z=Math.PI/2;bar.position.y=5.4;goal.add(bar);
    // Lightweight visible netting behind the frame gives the goal a more finished silhouette.
    const netPoints=[];
    // Net coordinates are local to the goal group; the group itself is positioned at the goal line.
    const backZ=z<0?-4:4;
    const addNetLine=(x1,y1,z1,x2,y2,z2)=>{netPoints.push(new THREE.Vector3(x1,y1,z1),new THREE.Vector3(x2,y2,z2))};
    for(let x=-7;x<=7.01;x+=1.4){
      addNetLine(x,.15,0,x,.15,backZ);addNetLine(x,.15,backZ,x,5.35,backZ);
    }
    for(let y=.15;y<=5.36;y+=1.05){
      addNetLine(-7,y,backZ,7,y,backZ);
      addNetLine(-7,y,0,-7,y,backZ);addNetLine(7,y,0,7,y,backZ);
    }
    goal.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(netPoints),new THREE.LineBasicMaterial({color:0xdce6e9,transparent:true,opacity:.62})));
    goal.position.z=z;scene.add(goal);
  }
  // Stadium bowl, dense spectator blocks, barriers and touchline details improve the broadcast view.
  const crowdMats=[0x24364b,0xd9dfe4,0x8f3547,0xd6b34d,0x2c8b70,0x4776a8,0xf0f0eb].map(color=>new THREE.MeshStandardMaterial({color,roughness:1}));
  for(const side of [-1,1]){
    const terrace=new THREE.Mesh(new THREE.BoxGeometry(14,7,112),new THREE.MeshStandardMaterial({color:0x182a3a,roughness:.92}));
    terrace.position.set(side*43,5.5,0);scene.add(terrace);
    for(let row=0;row<5;row++){
      const step=new THREE.Mesh(new THREE.BoxGeometry(13,1.05,112),new THREE.MeshStandardMaterial({color:[0x526579,0x3a5065,0x263d52][row%3],roughness:.9}));
      step.position.set(side*(35+row*2.5),2.3+row*1.25,0);scene.add(step);
    }
    // Instanced low-poly spectators: a crowd texture made from small 3D silhouettes, inexpensive on mobile.
    const crowdGeometry=new THREE.CapsuleGeometry(.16,.38,2,4);
    const crowdCount=520;
    const crowd=new THREE.InstancedMesh(crowdGeometry,crowdMats[0],crowdCount);
    const dummy=new THREE.Object3D();
    for(let i=0;i<crowdCount;i++){
      const row=i%20, col=Math.floor(i/20);
      dummy.position.set(side*(37+row*.42),4.4+row*.58, -53+col*4.1+(Math.random()-.5)*1.4);
      dummy.rotation.set((Math.random()-.5)*.12,Math.random()*Math.PI*2,(Math.random()-.5)*.12);
      const scale=.72+Math.random()*.7;dummy.scale.set(scale,scale,scale);dummy.updateMatrix();
      crowd.setMatrixAt(i,dummy.matrix);
      crowd.setColorAt(i,new THREE.Color(crowdMats[Math.floor(Math.random()*crowdMats.length)].color));
    }
    crowd.instanceMatrix.needsUpdate=true;scene.add(crowd);
    const barrier=new THREE.Mesh(new THREE.BoxGeometry(.25,1.1,108),new THREE.MeshStandardMaterial({color:0xc3d0d8,metalness:.25,roughness:.55}));
    barrier.position.set(side*33.2,1.1,0);scene.add(barrier);
  }
  // Simple 3D grandstands and floodlight pylons frame the pitch.
  for(const side of [-1,1]){
    for(let row=0;row<4;row++){
      const stand=new THREE.Mesh(new THREE.BoxGeometry(12,1.5,112),new THREE.MeshStandardMaterial({color:[0x263b50,0x344a60,0x40566a,0x24384b][row],roughness:.85}));
      stand.position.set(side*(38+row*3),1+row*1.2,0);scene.add(stand);
    }
    for(const z of [-42,42]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.22,.32,19,8),new THREE.MeshStandardMaterial({color:0x68798b,metalness:.35,roughness:.55}));
      pole.position.set(side*38,9.5,z);scene.add(pole);
      const lamps=new THREE.Mesh(new THREE.BoxGeometry(4,.65,2),new THREE.MeshBasicMaterial({color:0xfff0c7}));
      lamps.position.set(side*38,19,z);scene.add(lamps);
    }
  }
}
function player(colour, number, x, z, keeper=false) {
  const group=new THREE.Group();
  const kit=new THREE.MeshStandardMaterial({color:colour,roughness:.62});
  const skin=new THREE.MeshStandardMaterial({color:0xb9825a,roughness:.8});
  const shorts=new THREE.MeshStandardMaterial({color:colour===0xe7eaf0?0x23334a:0x101a28,roughness:.8});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.62,.72,4,8),kit);torso.position.y=1.55;group.add(torso);
  // Small shoulder pads and collar break up the capsule silhouette at match-camera distance.
  for(const side of [-1,1]){
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),kit);
    shoulder.scale.set(1.25,.72,1);shoulder.position.set(side*.57,1.91,0);group.add(shoulder);
  }
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.19,.045,5,12),new THREE.MeshStandardMaterial({color:0xf2f3ef,roughness:.8}));
  collar.rotation.x=Math.PI/2;collar.position.set(0,2.01,.05);group.add(collar);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),skin);head.position.y=2.48;group.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.345,10,6,0,Math.PI*2,0,Math.PI*.48),new THREE.MeshStandardMaterial({color:0x33251e,roughness:.95}));
  hair.position.set(0,2.55,-.015);group.add(hair);
  // Hip/shoulder pivots make limbs swing from joints instead of their centres.
  const legs=[];
  const sockMat=new THREE.MeshStandardMaterial({color:0xe9edf1,roughness:.82});
  const bootMat=new THREE.MeshStandardMaterial({color:0x101820,roughness:.52});
  for(const dx of [-.27,.27]){
    const pivot=new THREE.Group();pivot.position.set(dx,.91,0);group.add(pivot);
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.7,3,6),shorts);leg.position.y=-.36;pivot.add(leg);
    const sock=new THREE.Mesh(new THREE.CylinderGeometry(.105,.13,.29,7),sockMat);sock.position.set(0,-.62,.015);pivot.add(sock);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.22,.13,.38),bootMat);boot.position.set(0,-.79,.13);pivot.add(boot);
    legs.push(pivot);
  }
  // Neck and shirt accent add readable football-kit silhouettes at broadcast distance.
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.12,.14,.18,8),skin);neck.position.y=2.08;group.add(neck);
  const shirtStripe=new THREE.Mesh(new THREE.BoxGeometry(.12,.92,.035),new THREE.MeshStandardMaterial({color:colour===0xe7eaf0?0x9caec0:0xe8f2ef,roughness:.8}));
  shirtStripe.position.set(0,1.56,.59);group.add(shirtStripe);
  const arms=[];
  for(const dx of [-.72,.72]){
    const pivot=new THREE.Group();pivot.position.set(dx,1.94,0);group.add(pivot);
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.55,3,6),kit);
    arm.position.set(dx<0?-.06:.06,-.27,0);arm.rotation.z=dx<0?-.16:.16;pivot.add(arm);arms.push(pivot);
  }
  const num=makeLabel(String(number), '#ffffff');num.scale.set(.8,.35,1);num.position.set(0,3.08,0);group.add(num);
  group.position.set(x,0,z);scene.add(group);
  const target=new THREE.Vector3(x,0,z);
  const item={group,target,base:new THREE.Vector3(x,0,z),phase:Math.random()*6.28,keeper,dive:0,diveSide:1,legs,arms,lastX:x,lastZ:z,speed:0};
  movers.push(item);return item;
}
function createPlayers(){
  homePlayers=[];awayPlayers=[];movers.length=0;
  const formation=[[-23,-33],[-8,-36],[8,-36],[23,-33],[-25,-16],[-9,-18],[9,-18],[25,-16],[-15,-4],[15,-4],[0,-44]];
  const awayFormation=[[-23,33],[-8,36],[8,36],[23,33],[-25,16],[-9,18],[9,18],[25,16],[-15,4],[15,4],[0,44]];
  for(let i=0;i<11;i++){homePlayers.push(player(0x1ec7a1,i+1,formation[i][0],formation[i][1],i===10));awayPlayers.push(player(0xe7eaf0,i+1,awayFormation[i][0],awayFormation[i][1],i===10))}
  const ballMesh=new THREE.Mesh(new THREE.SphereGeometry(.58,18,14),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.36}));
  ballMesh.position.set(0,.7,0);scene.add(ballMesh);ball=ballMesh;
  const score=document.createElement('div');score.id='fep3dScore';score.style.cssText='position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:2;padding:7px 12px;border:1px solid #6b879b;border-radius:8px;background:#071321eF;color:#fff;font:700 12px/1.4 system-ui;text-align:center;max-width:95%;white-space:nowrap';
  root.appendChild(score);scoreLabel=score;updateScore();
}
function updateScore(){
  if(!scoreLabel)return;
  scoreLabel.textContent=fixture.home+'  '+(fixture.homeScore===null?'—':fixture.homeScore)+' : '+(fixture.awayScore===null?'—':fixture.awayScore)+'  '+fixture.away;
}
function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
    renderer.setSize(root.clientWidth||640,root.clientHeight||320,false);
    renderer.domElement.addEventListener('webglcontextlost',event=>{
      event.preventDefault();
      running=false;
      status.textContent='3D paused · graphics memory unavailable';
      status.style.color='#f4c64e';
      const fb=document.getElementById('fep3dFallback');
      if(fb)fb.textContent='The 3D graphics context was lost. Reload this page to restore match visuals; your league save remains available.';
    });
    // Keep the manager-view renderer lightweight on mid-range Android devices.
    renderer.shadowMap.enabled=false;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    root.prepend(renderer.domElement);
    scene=new THREE.Scene();scene.background=new THREE.Color(0x101f30);scene.fog=new THREE.Fog(0x101f30,105,190);
    camera=new THREE.PerspectiveCamera(42,(root.clientWidth||640)/(root.clientHeight||320),.1,300);
    camera.position.set(0,82,104);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xdceeff,0x193622,2.2));
    for(const [x,z] of [[-38,-42],[38,-42],[-38,42],[38,42]]){
      const light=new THREE.DirectionalLight(0xffffff,2.0);light.position.set(x,30,z);scene.add(light);
    }
    addPitch();createPlayers();clock=new THREE.Clock();
    status.textContent='3D engine ready';status.style.color='#35ce91';
    document.getElementById('fep3dFallback')?.remove();watch.disabled=false;
    caption.textContent='Automatic manager-view simulation · tap Watch match highlights';
    animate();window.addEventListener('resize',resize);
  }catch(err){status.textContent='3D unavailable';status.style.color='#f4c64e';const fb=document.getElementById('fep3dFallback');if(fb)fb.textContent='This device or browser could not start WebGL. League simulation remains available.';console.error(err)}
}
function resize(){
  if(!renderer||!camera)return;
  const w=root.clientWidth||640,h=root.clientHeight||320;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
function applySquadProfiles(players,data){
  if(!Array.isArray(data))return;
  players.forEach((p,i)=>{
    // The 3D formation has ten outfield models and one keeper; map the keeper profile explicitly.
    const source=i===10?data.find(x=>x.pos==='GK'):data.filter(x=>x.pos!=='GK')[i];
    if(source)p.profile={pace:Number(source.pace)||Number(source.rating)||60,passing:Number(source.passing)||60,dribbling:Number(source.dribbling)||60,shooting:Number(source.shooting)||60,stamina:Number(source.stamina)||60,reflexes:Number(source.reflexes)||Number(source.rating)||60,skill:String(source.specialSkill||'')};
  });
}
function setFixture(data){fixture={...fixture,...data};applySquadProfiles(homePlayers,fixture.homePlayers);applySquadProfiles(awayPlayers,fixture.awayPlayers);phase=0;updateScore();setCrowdLevel(.22);caption.textContent='Fixture loaded · '+fixture.home+' vs '+fixture.away+' · attendance '+Math.round(fixture.attendance||0).toLocaleString()+'/'+Math.round(fixture.capacity||12000).toLocaleString()}
function setScore(data){fixture={...fixture,...data};updateScore();caption.textContent='Full time · '+fixture.home+' '+fixture.homeScore+'–'+fixture.awayScore+' '+fixture.away}
function playHighlights(){
  if(!homePlayers.length)return;
  initCrowdAudio();setCrowdLevel(.3);running=true;phase=0;
  const homeGoals=Math.max(0,Number(fixture.homeScore)||0);
  const awayGoals=Math.max(0,Number(fixture.awayScore)||0);
  // Prefer a side that actually scored; for 0-0 use a neutral attack that ends in a save/miss.
  const scoredHome=homeGoals>0,scoredAway=awayGoals>0;
  const homeSide=scoredHome&&scoredAway?Math.random()<homeGoals/(homeGoals+awayGoals):scoredHome?true:scoredAway?false:Math.random()<.5;
  const attackers=homeSide?homePlayers:awayPlayers,defenders=homeSide?awayPlayers:homePlayers;
  const direction=homeSide?1:-1;
  const x=(Math.random()-.5)*18,z=direction*(12+Math.random()*10);
  const lane=(Math.random()-.5)*10;
  const midfielders=attackers.slice(4,8),forwards=attackers.slice(8,10);
  const receiver=midfielders.slice().sort((a,b)=>(b.profile?.passing||60)-(a.profile?.passing||60))[0]||attackers[4];
  const winger=midfielders.concat(forwards).slice().sort((a,b)=>(b.profile?.dribbling||60)-(a.profile?.dribbling||60))[0]||attackers[7];
  const striker=forwards.slice().sort((a,b)=>(b.profile?.shooting||60)-(a.profile?.shooting||60))[0]||attackers[8];
  const signature=[receiver,winger,striker].map(p=>p.profile?.skill||'').filter(Boolean);
  if(signature.length)caption.textContent='Signature play: '+signature.join(' → ');
  attackers.forEach((p,i)=>{
    // Spread the attacking shape into lanes instead of orbiting everyone around the ball.
    const laneX=[-24,-15,-7,7,15,24][i%6];
    const depth=(i<4? -8 : i<8 ? 1 : i<10 ? 10 : -18);
    p.target.set(clamp(x+laneX*.55,-28,28),0,clamp(z+direction*depth,-44,44));
  });
  defenders.forEach((p,i)=>{
    // Defenders recover goal-side and compress the central shooting lane.
    const laneX=[-22,-14,-6,6,14,22][i%6];
    const depth=(i<4? -18 : i<8 ? -7 : i<10 ? 4 : -29);
    p.target.set(clamp(x+laneX*.6,-28,28),0,clamp(z-direction*depth,-44,44));
  });
  receiver.target.set(clamp(x+lane*.25,-27,27),0,clamp(z+direction*7,-43,43));
  winger.target.set(clamp(x+lane,-27,27),0,clamp(z+direction*16,-43,43));
  striker.target.set(clamp(x-lane*.3,-25,25),0,direction*38);
  // Move the selected receiver and winger through the passing lanes in sequence.
  receiver.group.rotation.y=direction*Math.PI/2;
  winger.group.rotation.y=direction*Math.PI/2;
  striker.group.rotation.y=direction*Math.PI/2;
  const startPoint=new THREE.Vector3(x,.58,z);
  const pass1=new THREE.Vector3(receiver.target.x,.58,receiver.target.z);
  const dribbleSkill=/Speed Dribbler|Trickster Winger/.test(winger.profile?.skill||'');
  const dribbleQuality=clamp((winger.profile?.dribbling||60)/100,.35,.99);
  // Skilled dribblers take a curved touch into space; others keep a straighter, safer line.
  const dribblePoint=new THREE.Vector3(
    clamp(winger.target.x+(dribbleSkill?lane*.42:lane*.12),-27,27),
    .58,
    clamp(winger.target.z+direction*(2+dribbleQuality*3),-43,43)
  );
  const pass2=new THREE.Vector3(striker.target.x,.58,striker.target.z);
  const shotX=clamp(x-lane*.35,-7,7);
  // A goal highlight is only selected when the attacking team has a goal in the simulated score.
  const attackingGoals=homeSide?homeGoals:awayGoals;
  const isGoal=attackingGoals>0;
  const shot=new THREE.Vector3(isGoal?clamp(shotX*.45,-3.5,3.5):clamp(shotX+(Math.random()<.5?-1:1)*8,-15,15),.58,direction*(isGoal?52:48));
  ball.userData.path=[startPoint,pass1,dribblePoint,pass2,shot];
  ball.userData.dribbleCarrier=winger;
  ball.userData.dribbleSkill=dribbleSkill;
  ball.userData.dribbleDirection=direction;
  ball.userData.shooter=striker;
  ball.userData.shotPlayed=false;
  ball.userData.highlightOutcome=isGoal?'goal':'saved-or-missed';
  ball.userData.events=[{time:.19,type:'pass'},{time:.39,type:'dribble'},{time:.58,type:'pass'},{time:.79,type:'shot'},{time:.94,type:isGoal?'goal':'save'}];
  ball.userData.shotDirection=direction;
  const keeper=defenders.find(p=>p.keeper);
  if(keeper){keeper.dive=0;keeper.diveSide=shot.x>=0?1:-1;keeper.target.set(0,0,direction*44);ball.userData.keeper=keeper;}
  // Give the defence readable jobs: one presses the dribbler, another shades the next pass.
  const outfieldDefenders=defenders.filter(p=>!p.keeper);
  const pressDefender=outfieldDefenders.slice().sort((a,b)=>
    Math.hypot(a.group.position.x-winger.target.x,a.group.position.z-winger.target.z)-
    Math.hypot(b.group.position.x-winger.target.x,b.group.position.z-winger.target.z))[0];
  const coverDefender=outfieldDefenders.filter(p=>p!==pressDefender).sort((a,b)=>
    Math.hypot(a.group.position.x-pass2.x,a.group.position.z-pass2.z)-
    Math.hypot(b.group.position.x-pass2.x,b.group.position.z-pass2.z))[0];
  if(pressDefender){
    const side=pressDefender.group.position.x<=winger.target.x?-1:1;
    pressDefender.target.set(clamp(winger.target.x+side*2.1,-28,28),0,clamp(winger.target.z-direction*2.2,-44,44));
  }
  if(coverDefender){
    coverDefender.target.set(clamp(pass2.x+lane*.18,-27,27),0,clamp(pass2.z-direction*3.5,-44,44));
  }
  ball.userData.pressDefender=pressDefender;
  ball.userData.coverDefender=coverDefender;
  ball.userData.phaseStart=phase;
  caption.textContent=(signature.length?'Signature play: '+signature.join(' → ')+' · ':'')+(isGoal?'Build-up → pass → shot · goal highlight from simulated result':'Build-up → pass → shot · save or miss highlight');
}
function homeSideGoal(direction){
  // Goal-mouth target with a slight random placement, keeping the ball within the frame.
  return new THREE.Vector3((Math.random()-.5)*10,.7,direction*51.5);
}
function animate(){
  animationId=requestAnimationFrame(animate);
  const dt=Math.min(clock?.getDelta()||.016,.05);phase+=dt;
  for(const p of movers){
    const oldX=p.group.position.x,oldZ=p.group.position.z;
    p.group.position.x+=(p.target.x-p.group.position.x)*Math.min(1,dt*1.5);
    p.group.position.z+=(p.target.z-p.group.position.z)*Math.min(1,dt*1.5);
    const vx=(p.group.position.x-oldX)/Math.max(dt,.001),vz=(p.group.position.z-oldZ)/Math.max(dt,.001);
    const pace=p.profile?.pace||60;p.speed=Math.min(1,Math.hypot(vx,vz)/(5.5+pace*.035));
    const stride=phase*8+p.phase;
    const swing=Math.sin(stride)*.58*p.speed;
    const skill=p.profile?.skill||'';
    const signatureRunner=/Speed Dribbler|Trickster Winger|Engine/.test(skill);
    const skillSwing=signatureRunner?1.16:1;
    p.legs[0].rotation.x=swing*skillSwing;p.legs[1].rotation.x=-swing*skillSwing;
    p.arms[0].rotation.x=-swing*.65;p.arms[1].rotation.x=swing*.65;
    // Signature runners lean forward slightly while accelerating.
    p.group.rotation.x=signatureRunner&&p.speed>.15?-.08*p.speed:0;
    p.group.position.y=Math.abs(Math.sin(stride*2))*.08*p.speed;
    if(Math.hypot(vx,vz)>.25)p.group.rotation.y=Math.atan2(vx,vz);
    else p.group.rotation.y+=(Math.sin(phase+p.phase)*.12-p.group.rotation.y)*Math.min(1,dt*2);
    // Goalkeepers react to the shot with a short lateral dive and recover afterwards.
    if(p.keeper){
      const diveAmount=p.dive?Math.sin(Math.min(1,(phase-(ball?.userData.phaseStart||phase)-6.55)/.65)*Math.PI/2):0;
      p.group.rotation.z=p.dive? -p.diveSide*Math.max(0,diveAmount)*.72:0;
      if(p.dive&&phase-(ball?.userData.phaseStart||phase)>7.35){p.dive=0;p.group.rotation.z=0;p.target.copy(p.base);}
    }
  }
  if(ball){
    if(running&&ball.userData.path){
      const path=ball.userData.path,duration=9,elapsed=(phase-(ball.userData.phaseStart||0)),t=Math.min(.999,elapsed/duration),scaled=t*(path.length-1),idx=Math.min(path.length-2,Math.floor(scaled)),local=scaled-idx;
      ball.position.lerpVectors(path[idx],path[idx+1],local);
      const dribbleStart=.39,dribbleEnd=.58;
      if(t>=dribbleStart&&t<dribbleEnd&&ball.userData.dribbleCarrier){
        const carrier=ball.userData.dribbleCarrier,progress=(t-dribbleStart)/(dribbleEnd-dribbleStart);
        // Close down the ball carrier dynamically; the covering defender protects the next pass.
        const press=ball.userData.pressDefender,cover=ball.userData.coverDefender;
        if(press){
          const pressSide=press.group.position.x<=carrier.group.position.x?-1:1;
          press.target.set(clamp(carrier.group.position.x+pressSide*1.65,-28,28),0,
            clamp(carrier.group.position.z-ball.userData.dribbleDirection*1.8,-44,44));
        }
        if(cover){
          const next=ball.userData.path[3];
          cover.target.set(clamp(next.x,-27,27),0,
            clamp(next.z-ball.userData.dribbleDirection*2.6,-44,44));
        }
        const skillControl=ball.userData.dribbleSkill?1.15:.72;
        // Keep the ball close to the dribbler's feet, with small alternating touches rather than a floating arc.
        ball.position.x=carrier.group.position.x+Math.sin(progress*Math.PI*4)*skillControl;
        ball.position.z=carrier.group.position.z+(ball.userData.dribbleDirection||1)*(.78+Math.abs(Math.sin(progress*Math.PI*3))*(ball.userData.dribbleSkill?1.05:.55));
        ball.position.y=.34+Math.abs(Math.sin(progress*Math.PI*4))*.12;
      }else{
        ball.position.y=.58+Math.abs(Math.sin(t*Math.PI*9))*.22;
      }
      const shotEvent=ball.userData.events?.find(e=>e.type==='shot');
      if(shotEvent&&t>=shotEvent.time&&!ball.userData.shotPlayed){
        ball.userData.shotPlayed=true;
        const keeper=ball.userData.keeper;
        const shooter=ball.userData.shooter;
        const shooting=shooter?.profile?.shooting||60;
        const keeperSkill=keeper?.profile?.skill||'';
        const keeperReflex=keeper?.profile?.reflexes||60;
        // Finishing and keeper quality bias placement and save reaction, while preserving the simulated result.
        const quality=clamp((shooting-keeperReflex+55)/100,.22,.88);
        const target=homeSideGoal(ball.userData.shotDirection);
        const centralBias=(1-quality)*Math.sign(target.x||1)*2.2;
        target.x=clamp(target.x+centralBias,-6.2,6.2);
        ball.userData.shotTarget=target;
        if(keeper){
          keeper.dive=1;
          const reflexFactor=/Reflex Keeper/.test(keeperSkill)?1.18:1;
          const reaction=clamp((keeperReflex/70)*reflexFactor,.55,1.25);
          keeper.diveSide=target.x>=0?1:-1;
          keeper.target.x=ball.userData.highlightOutcome==='goal'
            ?clamp(target.x*reaction+Math.sign(target.x||1)*1.4,-7,7)
            :clamp(ball.position.x*reaction,-7,7);
        }
        if(ball.userData.highlightOutcome==='goal'){
          if(phase-goalPulseAt>5){goalPulseAt=phase;cheerForGoal()}
          ball.userData.path[path.length-1].x=clamp(target.x,-4.8,4.8);
          caption.textContent='Shot → GOAL highlight · finishing '+Math.round(shooting)+' · simulated score unchanged';
        }else{
          const miss=clamp(target.x+(Math.random()<.5?-1:1)*(9+(100-shooting)*.08),-15,15);
          ball.userData.path[path.length-1].x=miss;
          caption.textContent='Shot → saved or missed · no goal added';
        }
      }
      if(t>=.99){running=false;homePlayers.concat(awayPlayers).forEach(p=>p.target.copy(p.base));caption.textContent=ball.userData.highlightOutcome==='goal'?'Goal highlight complete · score remains from match simulation':'Chance ended · no goal added to simulated score';ball.userData.shotPlayed=false}
    }else{ball.position.x=Math.sin(phase*.35)*8;ball.position.z=Math.cos(phase*.23)*6;ball.position.y=.58+Math.abs(Math.sin(phase*2))*.12}
    ball.rotation.x+=dt*1.7;ball.rotation.z+=dt*1.2;
  }
  if(renderer&&scene&&camera){
    // Broadcast-style camera: tighten the shot during highlights, widen when play is idle.
    const focus=ball?ball.position:new THREE.Vector3(0,0,0);
    const highlightView=running&&ball?.userData?.path;
    const cameraHeight=highlightView?43:58;
    const cameraLead=highlightView?57:78;
    const path=highlightView?ball.userData.path:null;
    const travelSign=path?Math.sign(path[path.length-1].z-path[0].z):0;
    const cameraTarget=new THREE.Vector3(clamp(focus.x*.3,-20,20),cameraHeight,focus.z+cameraLead);
    camera.position.lerp(cameraTarget,Math.min(1,dt*(highlightView?1.15:.8)));
    // Look slightly ahead in the direction of attack, keeping the ball and immediate play readable.
    camera.lookAt(clamp(focus.x*.42,-14,14),0,focus.z+(highlightView?travelSign*-3:-5));
    renderer.render(scene,camera);
  }
}
const crowdToggle=document.getElementById('crowdAudioToggle');
function toggleCrowdAudio(){crowdMuted=!crowdMuted;if(crowdMuted){setCrowdLevel(0,.15);if(crowdToggle)crowdToggle.textContent='Crowd sound: Off'}else{initCrowdAudio();setCrowdLevel(running?.3:.22,.25);if(crowdToggle)crowdToggle.textContent='Crowd sound: On'}}
if(crowdToggle){crowdToggle.textContent='Crowd sound: On';crowdToggle.addEventListener('click',toggleCrowdAudio)}
window.FEP3D={setFixture,setScore,playHighlights,toggleCrowdAudio};
watch.addEventListener('click',()=>{if(!running)playHighlights()});
init();
