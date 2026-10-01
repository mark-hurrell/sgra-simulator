(function attachScenarioCatalogueController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Scenarios = SGRA.Scenarios || {};

  function create(options = {}) {
    const {
      $, document, stars, getBodies, selectionState, followGroupDisplayState,
      setIntruderFieldValidation, updateIntruderFormSummary, announceStatus, toast
    } = options;
    if (!Array.isArray(stars) || typeof getBodies !== 'function') throw new TypeError('ScenarioCatalogueController requires stars and getBodies');
    if (!selectionState || !followGroupDisplayState) throw new TypeError('ScenarioCatalogueController requires selection and group state');
    let scenarioCatalogueState = null;
    let starSelectSignature = '';

    function populateStarSel() {
      const sel = $('starSel');
      const groupMembers = followGroupDisplayState?.liveMembers?.() || [];
      const signature = [`group:${groupMembers.map(body => body.id).join(',')}`, `selected:${selectionState.getFollowIndex()}`, ...getBodies().slice(1).filter(body => !body.field).map(body => `${body.id}:${body.name || ''}`)].join('|');
      if (signature === starSelectSignature) return;
      starSelectSignature = signature;
      sel.replaceChildren(new Option('— follow —', '-1'));
      if (groupMembers.length) {
        const groupOpt = document.createElement('option');
        groupOpt.value = '__group__';
        groupOpt.textContent = `Group (${groupMembers.length} intruders)`;
        groupOpt.selected = followGroupDisplayState.active;
        sel.appendChild(groupOpt);
      }
      for (let i = 1; i < getBodies().length; i++) {
        const body = getBodies()[i];
        if (body.field) continue;
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = body.name || (body.intr ? 'intruder' : '?');
        if (i === selectionState.getFollowIndex()) opt.selected = true;
        sel.appendChild(opt);
      }
      const selM = $('starSelM');
      if (selM) {
        selM.replaceChildren(...[...sel.options].map(option => option.cloneNode(true)));
        selM.value = sel.value;
      }
    }

    function scenarioKnownExploreBodyIds() { return stars.map(row => row[0]); }
    function scenarioValidationOptions() { return { knownExploreBodyIds: scenarioKnownExploreBodyIds() }; }
    function scenarioDescriptionText(scenario) { return `${scenario.sceneContext}: ${scenario.shortDescription} ${scenario.accessibilityDescription}`; }
    function renderIntruderPresetCatalogue() {
      const select = $('intruderPresetSelect');
      if (!select) return;
      const current = select.value;
      const options = [new Option('Custom values', '')];
      for (const preset of scenarioCatalogueState?.intruderPresets || []) options.push(new Option(`${preset.title} — ${preset.description}`, preset.id));
      select.replaceChildren(...options);
      select.value = options.some(option => option.value === current) ? current : '';
    }
    function applyIntruderPreset(presetId) {
      if (!presetId) return;
      const preset = (scenarioCatalogueState?.intruderPresets || []).find(item => item.id === presetId);
      if (!preset) return;
      $('intruderMassInput').value = String(preset.massSolarMasses);
      [['launchP0X', preset.p0Rel[0]], ['launchP0Y', preset.p0Rel[1]], ['launchP0Z', preset.p0Rel[2]], ['launchP1X', preset.p1Rel[0]], ['launchP1Y', preset.p1Rel[1]], ['launchP1Z', preset.p1Rel[2]]].forEach(([id, value]) => { $(id).value = String(value); });
      setIntruderFieldValidation(null);
      updateIntruderFormSummary();
      announceStatus(`Applied illustrative preset: ${preset.title}.`);
    }
    function renderScenarioCatalogue() {
      const catalogue = scenarioCatalogueState;
      if (!catalogue) return;
      const selected = $('sScenario')?.value || $('sScenarioM')?.value;
      for (const id of ['sScenario', 'sScenarioM']) {
        const select = $(id); if (!select) continue;
        const value = catalogue.scenarios.some(scenario => scenario.id === selected) ? selected : catalogue.scenarios[0].id;
        select.replaceChildren(...catalogue.scenarios.map(scenario => { const option = document.createElement('option'); option.value = scenario.id; option.textContent = `${scenario.title} · ${scenario.sceneContext}`; return option; }));
        select.value = value;
        select.setAttribute('aria-describedby', id === 'sScenario' ? 'scenarioDescription' : 'scenarioDescriptionM');
      }
      const scenario = catalogue.scenarios.find(item => item.id === selected) || catalogue.scenarios[0];
      for (const id of ['scenarioDescription', 'scenarioDescriptionM']) { const node = $(id); if (node) node.textContent = scenarioDescriptionText(scenario); }
    }
    function selectedScenario() { const id = $('sScenario')?.value || $('sScenarioM')?.value; return scenarioCatalogueState?.scenarios.find(scenario => scenario.id === id) || null; }
    function setScenarioCatalogue(catalogue, sourceLabel, announce = true) {
      scenarioCatalogueState = catalogue;
      renderScenarioCatalogue();
      renderIntruderPresetCatalogue();
      if (announce) announceStatus(`Scenario catalogue loaded: ${catalogue.scenarios.length} initial-condition scenario${catalogue.scenarios.length === 1 ? '' : 's'} and ${(catalogue.intruderPresets || []).length} illustrative intruder preset${(catalogue.intruderPresets || []).length === 1 ? '' : 's'} from ${sourceLabel}.`);
    }
    async function loadScenarioCatalogueFile(file) {
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const catalogue = SGRA.Scenarios.Catalogue.validateCatalogue(parsed, scenarioValidationOptions());
        if (catalogue.schemaVersion === 2 && scenarioCatalogueState?.intruderPresets?.length) {
          const existingIds = new Set(scenarioCatalogueState.intruderPresets.map(preset => preset.id));
          const duplicate = catalogue.intruderPresets.find(preset => existingIds.has(preset.id));
          if (duplicate) throw new Error(`intruderPresets.${duplicate.id}: duplicate preset ID already loaded`);
          setScenarioCatalogue({ ...catalogue, intruderPresets: [...scenarioCatalogueState.intruderPresets, ...catalogue.intruderPresets] }, file.name);
        } else setScenarioCatalogue(catalogue, file.name);
      } catch (error) {
        const message = `Scenario catalogue rejected: ${error.message}`;
        announceStatus(message); toast(message, 5000);
      }
    }
    return Object.freeze({ populateStarSel, scenarioKnownExploreBodyIds, scenarioValidationOptions, scenarioDescriptionText, renderIntruderPresetCatalogue, applyIntruderPreset, renderScenarioCatalogue, selectedScenario, setScenarioCatalogue, loadScenarioCatalogueFile });
  }

  SGRA.Scenarios.ScenarioCatalogueController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
