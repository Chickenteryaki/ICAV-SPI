const menu=document.querySelector('.menu'),nav=document.querySelector('.nav');
menu?.addEventListener('click',()=>{const o=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(o))});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());

const loiter=document.querySelector('.loiter'),sticky=document.querySelector('.sticky'),track=document.querySelector('#track'),prog=document.querySelector('#progress'),plane=document.querySelector('#plane'),hours=document.querySelector('#hours'),energy=document.querySelector('#energy'),state=document.querySelector('#state');
if(loiter&&track&&prog&&plane&&hours&&sticky){
 const len=track.getTotalLength();prog.style.strokeDasharray=len;prog.style.strokeDashoffset=len;
 const label=p=>p<.18?'DAWN':p<.46?'CLIMB':p<.72?'CRUISE':p<.9?'DUSK':'NIGHT';
 const update=()=>{const r=loiter.getBoundingClientRect(),travel=loiter.offsetHeight-innerHeight,p=Math.max(0,Math.min(1,-r.top/travel)),pt=track.getPointAtLength(len*p),p2=track.getPointAtLength(Math.min(len,len*p+2)),ang=Math.atan2(p2.y-pt.y,p2.x-pt.x)*180/Math.PI;plane.setAttribute('transform',`translate(${pt.x} ${pt.y}) rotate(${ang})`);prog.style.strokeDashoffset=len*(1-p);hours.textContent=String(Math.round(p*100)).padStart(3,'0');if(energy)energy.textContent=Math.round(82+(Math.sin(p*Math.PI*2-1.1)+1)*9)+'%';if(state)state.textContent=label(p);sticky.style.setProperty('--p',p.toFixed(3))};
 let ticking=false;addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(()=>{update();ticking=false});ticking=true}},{passive:true});addEventListener('resize',update);update();
}