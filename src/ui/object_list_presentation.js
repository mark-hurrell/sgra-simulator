(function attachObjectListPresentation(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function create(options = {}) {
    const {
      $, document, getBodies, selectionState, followGroupDisplayState,
      relativityState, updateHUD, syncContinuousEligibility, populateStarSel,
      restoreObjectsAfterGroupFollow, updateRuntimeTruth, updateSemanticSceneSummary,
      interactionCommands
    } = options;
    if (typeof getBodies !== 'function') throw new TypeError('ObjectListPresentation requires getBodies');
    if (!selectionState || !followGroupDisplayState || !interactionCommands) throw new TypeError('ObjectListPresentation requires selection and interaction ports');

    let objectListSignature = '';
    let followGroupMembersSignature = '';

    function objectRole(body) { return body.bh ? 'black hole' : body.intr ? 'intruder' : body.field ? 'field tracers' : body.star ? 'S-star' : 'body'; }

    function updateObjectList() {
      const table = $('objectList');
      if (!table) return;
      const bodies = getBodies();
      // A2-01: rows follow the body roles actually present, not the mode.
      // "Sandbox = Sgr A* + intruders" is only true for hand-built Sandbox
      // scenes; a canonical-state Sandbox scenario restores S-stars and field
      // tracers, and the mode filter hid them -- including the selected /
      // followed body -- from the structured Bodies list. For a BH+intruder
      // scene this produces exactly the same rows as before.
      const visible = bodies.filter(body => !body.field);
      const fieldCount = bodies.filter(body => body.field).length;
      const rows = visible.map((body, index) => ({ body, index: bodies.indexOf(body) }));
      if (fieldCount) rows.push({ aggregate: true, count: fieldCount });
      const signature = rows.map(row => row.aggregate ? `field:${row.count}` : `${row.body.id}:${row.index}`).join('|');
      if (signature !== objectListSignature) {
        const focused = document.activeElement?.closest?.('.object-select');
        const focusedBodyId = focused?.dataset.bodyId || null;
        const fragment = document.createDocumentFragment();
        for (const row of rows) {
          const tr = document.createElement('tr');
          if (row.aggregate) {
            const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = 'Field tracers';
            const kind = document.createElement('td'); kind.textContent = 'aggregate';
            const count = document.createElement('td'); count.colSpan = 4; count.textContent = `${row.count} tracers`;
            tr.append(heading, kind, count);
          } else {
            const body = row.body;
            const name = body.name || `${objectRole(body)} ${body.id}`;
            const heading = document.createElement('th'); heading.scope = 'row';
            if (body.bh) {
              heading.textContent = `${name} (ID ${body.id})`;
              heading.setAttribute('aria-label', `${name} (central body; not selectable)`);
            } else {
              const select = document.createElement('button'); select.type = 'button'; select.className = 'object-select'; select.dataset.bodyId = String(body.id); select.textContent = `${name} `;
              const id = document.createElement('span'); id.textContent = `(ID ${body.id})`; select.append(id); heading.append(select);
              select.addEventListener('click', () => {
                const currentBodies = getBodies();
                const currentIndex = currentBodies.findIndex(item => item.id === body.id);
                if (currentIndex < 0) return;
                interactionCommands.setFollowBody(currentIndex);
                if (selectionState.getFollowIndex() === currentIndex) options.showCard();
                else options.hideCard();
                updateHUD();
              });
            }
            const kind = document.createElement('td'); kind.textContent = objectRole(body);
            const state = document.createElement('td'); state.className = 'object-state';
            const distance = document.createElement('td'); distance.className = 'object-distance';
            const speed = document.createElement('td'); speed.className = 'object-speed';
            const regime = document.createElement('td'); regime.className = 'object-regime';
            tr.append(heading, kind, state, distance, speed, regime);
            if (body.intr) {
              const groupButton = document.createElement('button');
              groupButton.type = 'button';
              groupButton.className = 'ctl object-group-toggle';
              groupButton.addEventListener('click', event => {
                event.stopPropagation();
                if (followGroupDisplayState.memberIds.has(body.id)) interactionCommands.removeGroupMember(body.id);
                else interactionCommands.addGroupMember(body.id);
              });
              tr.querySelector('th').append(' ', groupButton);
            }
          }
          fragment.appendChild(tr);
        }
        table.tBodies[0].replaceChildren(fragment);
        objectListSignature = signature;
        if (focusedBodyId) {
          const replacement = table.querySelector(`.object-select[data-body-id="${CSS.escape(focusedBodyId)}"]`);
          (replacement || $('objectListHeading') || $('bObjects'))?.focus?.();
        }
      }
      const selected = selectionState.getFollowIndex();
      [...table.tBodies[0].rows].forEach((tr, rowIndex) => {
        const row = rows[rowIndex];
        tr.classList.toggle('selected', !row.aggregate && row.index === selected);
        if (row.aggregate) return;
        const body = row.body, bh = bodies[0];
        const radius = Math.hypot(body.x - bh.x, body.y - bh.y, body.z - bh.z);
        const speed = Math.hypot(body.vx - bh.vx, body.vy - bh.vy, body.vz - bh.vz);
        tr.querySelector('.object-state').textContent = row.index === selected ? 'selected/followed' : 'available';
        tr.querySelector('.object-distance').textContent = `${radius.toFixed(1)} AU`;
        tr.querySelector('.object-speed').textContent = `${speed.toFixed(1)} AU/yr`;
        tr.querySelector('.object-regime').textContent = relativityState(body).regime;
      });
      followGroupDisplayState.prune();
      if (!followGroupDisplayState.active) restoreObjectsAfterGroupFollow();
      const members = followGroupDisplayState.liveMembers();
      const summary = $('followGroupSummary');
      if (summary) summary.textContent = `Follow group: ${members.length} explicit intruders; camera follows the group encounter while keeping Sgr A* in view.`;
      syncContinuousEligibility?.();
      const memberList = $('followGroupMembers');
      const memberSignature = members.map(body => body.id).join('|');
      if (memberList && memberSignature !== followGroupMembersSignature) {
        memberList.replaceChildren(...members.map(body => {
          const item = document.createElement('p');
          item.className = 'follow-group-member';
          item.textContent = `${body.name || 'intruder'} (ID ${body.id}) `;
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'ctl';
          remove.textContent = 'remove from group';
          remove.setAttribute('aria-label', `Remove ${body.name || 'intruder'} ID ${body.id} from group`);
          remove.addEventListener('click', () => interactionCommands.removeGroupMember(body.id));
          item.append(remove);
          return item;
        }));
        followGroupMembersSignature = memberSignature;
      }
      const followButton = $('bFollowGroup'); if (followButton) followButton.disabled = !members.length;
      const stopButton = $('bStopGroupFollow'); if (stopButton) stopButton.disabled = !followGroupDisplayState.active;
      const statusButton = $('bGroupStatus'); if (statusButton) statusButton.disabled = !followGroupDisplayState.active;
      populateStarSel?.();
      [...table.tBodies[0].rows].forEach((tr, rowIndex) => {
        const row = rows[rowIndex];
        if (!row?.aggregate && row.body.intr) {
          const button = tr.querySelector('.object-group-toggle');
          if (button) {
            const inGroup = followGroupDisplayState.memberIds.has(row.body.id);
            button.textContent = inGroup ? 'remove from group' : 'add to group';
            button.setAttribute('aria-label', `${inGroup ? 'Remove' : 'Add'} ${row.body.name || 'intruder'} ID ${row.body.id} ${inGroup ? 'from' : 'to'} visual follow group`);
          }
        }
      });
      updateRuntimeTruth();
      updateSemanticSceneSummary();
    }

    return Object.freeze({ objectRole, updateObjectList });
  }

  SGRA.UI.ObjectListPresentation = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
