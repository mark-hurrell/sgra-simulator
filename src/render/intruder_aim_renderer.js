// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachIntruderAimRenderer(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  const PREVIEW_STROKE = 'rgba(255,138,76,.65)';
  const VECTOR_STROKE = 'rgba(255,138,76,.9)';
  const ENDPOINT_FILL = '#ff9a6c';
  const TEXT_FILL = 'rgba(255,160,110,.95)';
  const DASH = [3, 5];
  const ENDPOINT_R = 5;
  const FONT = '10px IBM Plex Mono';

  /**
   * Draw the aim overlay. Reads nothing it was not handed; mutates nothing.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} args
   * @param {object|null} args.aim        {p0_rel, p1_rel} or null
   * @param {object|null} args.preview    {pts, outcome, outcomeCol, spd}
   * @param {function} args.projectBH     (x,y,z) -> [sx,sy,depth] | null
   * @param {number} args.mass
   * @param {number} args.focal           F
   * @param {function} args.formatMass    (m) -> string
   * @param {number} args.kms             KMS conversion factor
   */
  function renderAim(ctx, args) {
    const { aim, preview, projectBH, mass, formatMass, kms } = args;
    if (!aim || !preview) return;

    const [abx, aby, abz] = aim.p0_rel;
    const [bbx, bby, bbz] = aim.p1_rel;
    const A = projectBH(abx, aby, abz);
    const B = projectBH(bbx, bby, bbz);
    if (!A || !B) return;

    const { pts, outcome, outcomeCol, spd } = preview;

    ctx.strokeStyle = PREVIEW_STROKE;
    ctx.setLineDash(DASH);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let ps = B;
    for (const p of pts) {
      const S = projectBH(p[0], p[1], p[2]);
      if (S) {
        if (ps) ctx.lineTo(S[0], S[1]); else ctx.moveTo(S[0], S[1]);
        ps = S;
      } else {
        ps = null;
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = VECTOR_STROKE;
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.stroke();

    ctx.fillStyle = ENDPOINT_FILL;
    ctx.beginPath();
    ctx.arc(B[0], B[1], ENDPOINT_R, 0, 2 * Math.PI);
    ctx.fill();

    ctx.font = FONT;
    ctx.fillStyle = TEXT_FILL;
    ctx.fillText(`${(spd * kms).toFixed(0)} km/s · ${formatMass(mass)}`, B[0] + 12, B[1] - 18);
    ctx.fillStyle = outcomeCol;
    ctx.fillText(outcome, B[0] + 12, B[1] - 4);
  }

  SGRA.Render.IntruderAimRenderer = Object.freeze({ renderAim });
})(typeof window !== 'undefined' ? window : globalThis);
