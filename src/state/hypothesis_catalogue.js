// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachHypothesisCatalogue(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §9 — immutable, append-only hypothesis catalogue.
  //
  // ================== SCIENTIFIC-DATA STATUS: PENDING ==================
  //
  // The authority document SGRA-SPEC-001-DISC-SPIN-FRAMEDRAGGING.md §4.1
  // defines the SCHEMA for OrientationHypothesisFamily / -Variant, but the
  // repository contains no source-backed numeric values: no inclination, no
  // position angle, no rotation sense, no line-of-sight direction, no
  // provenance citation. A search across all Markdown, JS and JSON in the tree
  // returns nothing.
  //
  // Per the B-3B execution packet §9 scientific-data prohibition, orientation
  // A/B variants are therefore NOT fabricated. This module implements:
  //
  //   1. the immutable catalogue schema;
  //   2. the non-spinning reference preset (a* = 0), which makes no
  //      observational claim;
  //   3. an explicit `unselected` orientation state;
  //   4. a machine-readable ORIENTATION_DATA_PENDING finding.
  //
  // Populating the orientation family is a prerequisite for A-0. Do not close
  // the A/B scientific-data gate on the strength of this module.
  //
  // Note also authority §4.3: branch B is NOT the negation of branch A. Only
  // the sky-plane component reverses; the line-of-sight component is pinned by
  // the observed rotation sense. `assertVariantPair` below enforces that a
  // populated pair cannot be a full-vector reversal.
  //
  // =====================================================================

  const CATALOGUE_VERSION = 1;

  const ORIENTATION_DATA_PENDING = D.deepFreeze({
    finding_id: 'ORIENTATION_DATA_PENDING',
    severity: 'blocking-for-A-0',
    block_raised: 'B-3B',
    status: 'open',
    summary:
      'No source-backed flow-orientation values exist in the repository. The A/B orientation ' +
      'family is declared but unpopulated. B-3B closes structurally only.',
    required_fields_missing: Object.freeze([
      'inclination',
      'position_angle',
      'rotation_sense',
      'line_of_sight_direction',
      'source_convention',
      'derived_world_axis',
      'provenance'
    ]),
    required_before: Object.freeze(['A-0', 'Phase C Lense-Thirring work']),
    prohibition:
      'Values must come from a cited source with a stated convention. Do not synthesise ' +
      'plausible-looking angles to turn a gate green.'
  });

  function frozenVariant(spec) {
    // A variant is either fully populated or explicitly unpopulated. Partial
    // variants are rejected: a half-filled orientation is how fabricated data
    // gets in.
    const populated = spec.status === 'populated';
    if (populated) {
      for (const field of ['inclination', 'position_angle', 'rotation_sense',
        'line_of_sight_direction', 'source_convention', 'derived_world_axis', 'transform_version']) {
        if (spec[field] === null || spec[field] === undefined) {
          throw new Error(`populated orientation variant '${spec.variant_id}' is missing '${field}'`);
        }
      }
      const axis = spec.derived_world_axis;
      if (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite)) {
        throw new Error(`populated orientation variant '${spec.variant_id}' needs a 3-vector derived_world_axis`);
      }
    }
    return D.deepFreeze({
      variant_id: spec.variant_id,
      status: spec.status,
      inclination: spec.inclination ?? null,
      position_angle: spec.position_angle ?? null,
      rotation_sense: spec.rotation_sense ?? null,
      line_of_sight_direction: spec.line_of_sight_direction ?? null,
      source_convention: spec.source_convention ?? null,
      derived_world_axis: spec.derived_world_axis ? [...spec.derived_world_axis] : null,
      transform_version: spec.transform_version ?? null,
      pending_finding: populated ? null : ORIENTATION_DATA_PENDING.finding_id
    });
  }

  // Authority §4.3: s_B must not be -s_A. Enforced for populated pairs.
  function assertVariantPair(a, b) {
    if (a.status !== 'populated' || b.status !== 'populated') return { checked: false, reason: 'unpopulated' };
    const va = a.derived_world_axis, vb = b.derived_world_axis;
    const isNegation = va.every((component, i) => Math.abs(component + vb[i]) < 1e-12);
    if (isNegation) {
      throw new Error(
        `orientation variants '${a.variant_id}' and '${b.variant_id}' are a full-vector reversal. ` +
        'Authority section 4.3 forbids branch B = -branch A: only the sky-plane component ' +
        'reverses, the line-of-sight component is pinned by the observed rotation sense.');
    }
    const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
    return { checked: true, dot, separation_deg: Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI };
  }

  const ORIENTATION_FAMILIES = D.deepFreeze([
    {
      family_id: 'unselected',
      family_version: 1,
      provenance: 'No orientation hypothesis selected. This is the default and makes no claim.',
      source_frame: null,
      status: 'unselected',
      variants: [frozenVariant({ variant_id: 'unselected', status: 'unselected' })]
    },
    {
      family_id: 'flow-orientation-family-pending',
      family_version: 1,
      provenance: ORIENTATION_DATA_PENDING.summary,
      source_frame: null,
      status: 'pending-source-data',
      variants: [
        frozenVariant({ variant_id: 'branch-a', status: 'pending-source-data' }),
        frozenVariant({ variant_id: 'branch-b', status: 'pending-source-data' })
      ]
    }
  ]);

  const SPIN_PRESETS = D.deepFreeze([
    {
      preset_id: 'non-spinning-reference',
      preset_version: 1,
      magnitude: 0,
      axis_source: 'aligned-to-flow',
      alignment_tilt: 0,
      alignment_azimuth: 0,
      alignment_assumption:
        'No alignment assumption is in force at zero spin: with a* = 0 the spin axis is ' +
        'undefined and the tilt/azimuth values are inert placeholders, not a claim.',
      provenance: 'Reference case. Makes no observational claim. Preserves the frozen ' +
        'Yoshida baseline bit-identically through the zero-spin short circuit.',
      confidence_status: 'reference-not-an-estimate',
      model_version: 1
    }
  ]);

  function findFamily(familyId) {
    return ORIENTATION_FAMILIES.find(f => f.family_id === familyId) || null;
  }
  function findVariant(familyId, variantId) {
    const family = findFamily(familyId);
    if (!family) return null;
    return family.variants.find(v => v.variant_id === variantId) || null;
  }
  function findSpinPreset(presetId) {
    return SPIN_PRESETS.find(p => p.preset_id === presetId) || null;
  }

  function catalogueStatus() {
    const populated = ORIENTATION_FAMILIES
      .filter(f => f.status !== 'unselected')
      .every(f => f.variants.every(v => v.status === 'populated'));
    return {
      catalogue_version: CATALOGUE_VERSION,
      orientation_families: ORIENTATION_FAMILIES.length,
      spin_presets: SPIN_PRESETS.length,
      orientation_data_populated: populated,
      finding: populated ? null : ORIENTATION_DATA_PENDING
    };
  }

  SGRA.State.HypothesisCatalogue = Object.freeze({
    CATALOGUE_VERSION,
    ORIENTATION_DATA_PENDING,
    ORIENTATION_FAMILIES,
    SPIN_PRESETS,
    findFamily,
    findVariant,
    findSpinPreset,
    assertVariantPair,
    catalogueStatus
  });
})(typeof window !== 'undefined' ? window : globalThis);
