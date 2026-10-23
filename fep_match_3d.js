import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const root = document.getElementById('fep3dViewport');
const status = document.getElementById('engineStatus');
const caption = document.getElementById('match3dCaption');
const watch = document.getElementById('watch3d');
if (!root) throw new Error('FEP 3D viewport is missing');

let renderer, scene, camera, clock, animationId, disposed = false;
let homePlayers = [], awayPlayers = [], ball, scoreLabel, phase = 0, running = false;
let fixture = {home:'Home FC', away:'Away FC', homeStrength:60, awayStrength:60, homeScore:null, awayScore:null};
const movers = [];
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
    goal.position.z=z;scene.add(goal);
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
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),skin);head.position.y=2.48;group.add(head);
  for(const dx of [-.27,.27]){
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.7,3,6),shorts);leg.position.set(dx,.55,0);group.add(leg);
  }
  const num=makeLabel(String(number), '#ffffff');num.scale.set(.8,.35,1);num.position.set(0,3.08,0);group.add(num);
  group.position.set(x,0,z);scene.add(group);
  const target=new THREE.Vector3(x,0,z);
  const item={group,target,base:new THREE.Vector3(x,0,z),phase:Math.random()*6.28,keeper};
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.setSize(root.clientWidth||640,root.clientHeight||320,false);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
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
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
function setFixture(data){fixture={...fixture,...data};phase=0;updateScore();caption.textContent='Fixture loaded · '+fixture.home+' vs '+fixture.away}
function setScore(data){fixture={...fixture,...data};updateScore();caption.textContent='Full time · '+fixture.home+' '+fixture.homeScore+'–'+fixture.awayScore+' '+fixture.away}
function playHighlights(){
  if(!homePlayers.length)return;
  running=true;phase=0;
  const homeSide=Math.random()<.5;
  const attackers=homeSide?homePlayers:awayPlayers,defenders=homeSide?awayPlayers:homePlayers;
  const direction=homeSide?1:-1;
  const x=(Math.random()-.5)*26,z=direction*(8+Math.random()*8);
  attackers.forEach((p,i)=>{const angle=i/attackers.length*Math.PI*2;p.target.set(clamp(x+Math.cos(angle)*(5+i%3),-29,29),0,clamp(z+Math.sin(angle)*(5+i%3),-46,46))});
  defenders.forEach((p,i)=>{const angle=i/defenders.length*Math.PI*2;p.target.set(clamp(x+Math.cos(angle)*(9+i%3),-29,29),0,clamp(z+Math.sin(angle)*(9+i%3),-46,46))});
  ball.userData.path=[new THREE.Vector3(x,.7,z),new THREE.Vector3(x+(Math.random()-.5)*18,.7,clamp(z+direction*14,-46,46)),new THREE.Vector3((Math.random()-.5)*20,.7,direction*48)];
  caption.textContent='Highlights playing · player movement and ball progression';
}
function animate(){
  animationId=requestAnimationFrame(animate);
  const dt=Math.min(clock?.getDelta()||.016,.05);phase+=dt;
  for(const p of movers){
    const wobble=Math.sin(phase*3+p.phase)*.07;
    p.group.position.x+=(p.target.x-p.group.position.x)*Math.min(1,dt*1.5);
    p.group.position.z+=(p.target.z-p.group.position.z)*Math.min(1,dt*1.5);
    p.group.position.y=Math.abs(wobble)*.35;
    p.group.rotation.y=Math.sin(phase+p.phase)*.12;
  }
  if(ball){
    if(running&&ball.userData.path){
      const path=ball.userData.path,duration=7,t=(phase%duration)/duration,scaled=t*(path.length-1),idx=Math.min(path.length-2,Math.floor(scaled)),local=scaled-idx;
      ball.position.lerpVectors(path[idx],path[idx+1],local);ball.position.y=.55+Math.abs(Math.sin(t*Math.PI*10))*.8;
      if(t>.98){running=false;homePlayers.concat(awayPlayers).forEach(p=>p.target.copy(p.base));caption.textContent='Highlight sequence complete · manager simulation'}
    }else{ball.position.x=Math.sin(phase*.35)*8;ball.position.z=Math.cos(phase*.23)*6;ball.position.y=.58+Math.abs(Math.sin(phase*2))*.12}
    ball.rotation.x+=dt*1.7;ball.rotation.z+=dt*1.2;
  }
  if(renderer&&scene&&camera)renderer.render(scene,camera);
}
window.FEP3D={setFixture,setScore,playHighlights};
init();
