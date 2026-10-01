// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).

(function attachStatusAnnouncer(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};
  const STATUS_MIN_INTERVAL_MS = 500;
  const STATUS_DUPLICATE_WINDOW_MS = 1000;
  const MODEL_STATUS_INTERVAL_MS = 2000;
  const STATUS_PRIORITY = Object.freeze({ MODEL: 1, VALIDATION: 2, USER: 3 });
  const STATUS_CATEGORY = Object.freeze({ MODEL: 'Model event', VALIDATION: 'Form result', USER: 'User action' });

  function create(deps) {
    const {
      $, simulationClock, surfaceIsOpen, getSonificationArbitration, document: documentRef,
      now = () => global.performance.now()
    } = deps;
    let hintTO = 0, statusTO = 0, pendingStatus = null, lastStatusAt = -Infinity;
    let lastStatusText = '', lastModelStatusAt = -Infinity;
    const recentEvents = [];
    const recentEventListIds = ['recentEventsList', 'recentEventsListM'];

    function statusSimulationTime(){
      const value = typeof simulationClock?.getSimTime === 'function' ? simulationClock.getSimTime() : NaN;
      return Number.isFinite(value) ? `t=${value.toFixed(3)} years` : '';
    }
    function initRecentEvents(){
      for(const id of recentEventListIds){
        const list=$(id); if(!list) continue;
        list.replaceChildren(...Array.from({length: 20}, () => documentRef.createElement('li')));
        Array.from(list.children).forEach(item => { item.hidden=true; });
      }
    }
    function renderRecentEvents(){
      for(const id of recentEventListIds){
        const list=$(id); if(!list) continue;
        Array.from(list.children).forEach((item,index)=>{
          const event=recentEvents[index];
          item.hidden=!event;
          if(event) item.textContent=`${event.category}${event.time ? ` · ${event.time}` : ''}: ${event.text}`;
        });
      }
    }
    function recordRecentEvent(message, category){
      const text=String(message || '').trim(); if(!text) return;
      const previous=recentEvents[recentEvents.length-1];
      if(previous?.text===text) return;
      recentEvents.push({text, category, time:statusSimulationTime()});
      if(recentEvents.length>20) recentEvents.shift();
      renderRecentEvents();
    }
    function isModelEventMessage(message){ return /\b(accreted|pericentre|pericenter|ejected|capture(?:d)?|close approach)\b/i.test(String(message)); }
    function flushAccessibleStatus(){
      const node=$('sgraAccessibleStatus');
      if(!node||pendingStatus===null)return;
      node.textContent=pendingStatus.text;
      lastStatusText=pendingStatus.text;
      getSonificationArbitration()?.notify({ text: pendingStatus.text, priority: pendingStatus.priority });
      pendingStatus=null;
      lastStatusAt=now();
    }
    function announceStatus(message, priority=STATUS_PRIORITY.USER, category=STATUS_CATEGORY.USER){
      const text=String(message || '').trim(); if(!text) return;
      if(priority===STATUS_PRIORITY.USER && category===STATUS_CATEGORY.USER && isModelEventMessage(text)){ priority=STATUS_PRIORITY.MODEL; category=STATUS_CATEGORY.MODEL; }
      recordRecentEvent(text, category);
      const currentTime=now();
      if((text===lastStatusText && currentTime-lastStatusAt<STATUS_DUPLICATE_WINDOW_MS) || text===pendingStatus?.text) return;
      if(priority===STATUS_PRIORITY.MODEL){
        if(currentTime-lastModelStatusAt<MODEL_STATUS_INTERVAL_MS) return;
        lastModelStatusAt=currentTime;
      }
      if(pendingStatus && priority<pendingStatus.priority) return;
      pendingStatus={text, priority};
      const elapsed=currentTime-lastStatusAt;
      if(elapsed>=STATUS_MIN_INTERVAL_MS) flushAccessibleStatus();
      else { clearTimeout(statusTO); statusTO=setTimeout(flushAccessibleStatus,STATUS_MIN_INTERVAL_MS-elapsed); }
    }
    // A3-01: a surface only suppresses visual toasts while it is actually
    // presented. Open state is deliberately retained across closing the
    // mobile sheet and crossing the 720px breakpoint, so the retained flag
    // alone (a desktop drawer [open] at mobile width, the sheet .open at
    // desktop width, or an expanded section inside a closed sheet) must not
    // gate. Mobile sections count only through the sheet that contains them.
    function presented(el){ return !!el && (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0); }
    function interactiveSurfaceOpen(){
      const sheet = $('mobilePanel');
      return Array.from(documentRef.querySelectorAll('#bar details.desktop-drawer[open] > .drawer-content')).some(presented)
        || (!!sheet?.classList.contains('open') && presented(sheet))
        || $('intruderFormPanel')?.open
        || surfaceIsOpen($('objectListPanel'))
        || !$('runtimeTruthPanel')?.hidden
        || $('card')?.classList.contains('show');
    }
    function toast(m,ms=3500){const h=$('hint');announceStatus(m);clearTimeout(hintTO);if(interactiveSurfaceOpen()){h.classList.remove('show');return;}h.textContent=m;h.classList.add('show');hintTO=setTimeout(()=>h.classList.remove('show'),ms);}
    function initialize(){
      initRecentEvents();
    }
    function resetStartup(){
      $('sgraAccessibleStatus').textContent = '';
      pendingStatus = null;
      recentEvents.length = 0;
      renderRecentEvents();
      lastStatusText = '';
      clearTimeout(statusTO);
    }

    return { announceStatus, recordRecentEvent, toast, initialize, resetStartup };
  }

  SGRA.UI.StatusAnnouncer = Object.freeze({ create, STATUS_PRIORITY, STATUS_CATEGORY });
})(typeof window !== 'undefined' ? window : globalThis);
