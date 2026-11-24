// Only the appearance preference is stored; no account or console data is cached.
(()=>{
 const key='sendrack-admin-theme',root=document.documentElement,media=matchMedia('(prefers-color-scheme: dark)');let preference=null,button;
 try{const saved=localStorage.getItem(key);if(['light','dark'].includes(saved))preference=saved;}catch{}
 function apply(){const dark=(preference|| (media.matches?'dark':'light'))==='dark';root.dataset.consoleTheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0a1628':'#f5f7fb');if(button){button.textContent=dark?'☀ Light mode':'☾ Dark mode';button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');button.setAttribute('aria-pressed',String(dark));}}
 apply();
 function mount(){const target=document.querySelector('.topbar .top-actions')||document.querySelector('body>header')||document.body;if(button.parentElement!==target)target.append(button);button.classList.toggle('console-theme-floating',target===document.body);}
 document.addEventListener('DOMContentLoaded',()=>{button=document.createElement('button');button.type='button';button.id='console-theme-toggle';button.className='console-theme-toggle';button.onclick=()=>{preference=root.dataset.consoleTheme==='dark'?'light':'dark';try{localStorage.setItem(key,preference);}catch{}apply();};apply();mount();const app=document.querySelector('#admin-app');if(app)new MutationObserver(mount).observe(app,{childList:true,subtree:true});});
 media.addEventListener('change',()=>{if(!preference)apply();});
 addEventListener('storage',e=>{if(e.key===key||e.key===null){preference=['light','dark'].includes(e.newValue)?e.newValue:null;apply();}});
})();
