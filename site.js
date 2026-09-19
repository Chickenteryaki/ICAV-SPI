const menu=document.querySelector('.menu'),nav=document.querySelector('.nav');
menu?.addEventListener('click',()=>{const o=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(o))});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());

const loiter=document.querySelector('.loiter'),sticky=document.querySelector('.sticky'),track=document.querySelector('#track'),prog=document.querySelector('#progress'),plane=document.querySelector('#plane'),progressDot=document.querySelector('#progress-dot'),hours=document.querySelector('#hours'),missionHours=document.querySelector('#mission-hours'),localTime=document.querySelector('#local-time'),state=document.querySelector('#state');
if(loiter&&track&&prog&&plane&&hours&&sticky){
 const len=track.getTotalLength();prog.style.strokeDasharray=len;prog.style.strokeDashoffset=len;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
 const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
 const skyForHour=hour=>{
   const daylight=clamp(Math.sin((hour-6)/12*Math.PI));
   const dawn=Math.exp(-Math.pow((hour-6)/1.7,2));
   const dusk=Math.exp(-Math.pow((hour-18)/1.7,2));
   const twilight=Math.max(dawn,dusk);
   const night=1-daylight;
   const top=rgb(mix([4,9,24],[117,143,171],daylight));
   const mid=rgb(mix([8,17,39],[177,193,207],daylight));
   const bottom=rgb(mix([13,25,46],[103,124,145],daylight));
   return {daylight,night,twilight,top,mid,bottom};
 };
 const phaseForHour=hour=>hour>=5&&hour<8?'DAWN':hour>=8&&hour<17?'DAY':hour>=17&&hour<20?'DUSK':'NIGHT';
 const update=()=>{const r=loiter.getBoundingClientRect(),travel=loiter.offsetHeight-innerHeight,p=Math.max(0,Math.min(1,-r.top/travel)),pt=track.getPointAtLength(len*p),p2=track.getPointAtLength(Math.min(len,len*p+4)),ang=Math.atan2(p2.y-pt.y,p2.x-pt.x)*180/Math.PI,hourValue=p*100,h=String(Math.round(hourValue)).padStart(3,'0'),clock=(6+hourValue*(72/100))%24,sky=skyForHour(clock),sunT=clamp((clock-6)/12),moonT=clock>=18?(clock-18)/12:(clock+6)/12,sunX=8+84*sunT,sunY=78-Math.sin(Math.PI*sunT)*66,moonX=8+84*moonT,moonY=75-Math.sin(Math.PI*moonT)*58,hh=String(Math.floor(clock)).padStart(2,'0'),mm=String(Math.floor((clock%1)*60)).padStart(2,'0');plane.setAttribute('transform',`translate(${pt.x} ${pt.y}) rotate(${ang}) scale(.78)`);if(progressDot){progressDot.setAttribute('cx',pt.x.toFixed(2));progressDot.setAttribute('cy',pt.y.toFixed(2));}prog.style.strokeDasharray=`${len*p} ${len}`;prog.style.strokeDashoffset=0;hours.textContent=h;if(missionHours)missionHours.textContent=h;if(localTime)localTime.textContent=hh+':'+mm;if(state)state.textContent=phaseForHour(clock);sticky.style.setProperty('--p',p.toFixed(3));sticky.style.setProperty('--sky-top',sky.top);sticky.style.setProperty('--sky-mid',sky.mid);sticky.style.setProperty('--sky-bottom',sky.bottom);sticky.style.setProperty('--sun-opacity',clock>=5.5&&clock<=18.5?Math.max(.05,sky.daylight+.18*sky.twilight):0);sticky.style.setProperty('--sun-x',sunX+'%');sticky.style.setProperty('--sun-y',sunY+'%');sticky.style.setProperty('--moon-opacity',clock>=17.5||clock<=6.5?Math.max(.12,sky.night):0);sticky.style.setProperty('--moon-x',moonX+'%');sticky.style.setProperty('--moon-y',moonY+'%');sticky.style.setProperty('--stars-opacity',Math.pow(sky.night,1.55)*.98);sticky.style.setProperty('--horizon-opacity',(.08+sky.twilight*.88+sky.daylight*.10).toFixed(3));sticky.style.setProperty('--cloud-opacity',(.12+sky.daylight*.78).toFixed(3))};
 let ticking=false;addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(()=>{update();ticking=false});ticking=true}},{passive:true});addEventListener('resize',update);update();
}