// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Domain = SGRA.Domain || {};

  function getBodyById(bodiesIn, id) {
    return bodiesIn.find(b => b.id === id) || null;
  }

  function getBodyIndexById(bodiesIn, id) {
    return bodiesIn.findIndex(b => b.id === id);
  }

  function bodyRelativeToBH(bodiesIn, b) {
    const bh = bodiesIn[0];
    return {
      x: b.x - bh.x, y: b.y - bh.y, z: b.z - bh.z,
      vx: b.vx - bh.vx, vy: b.vy - bh.vy, vz: b.vz - bh.vz
    };
  }

  function relativeToBH(b, bh) {
    return {
      x: b.x - bh.x,
      y: b.y - bh.y,
      z: b.z - bh.z,
      vx: b.vx - bh.vx,
      vy: b.vy - bh.vy,
      vz: b.vz - bh.vz
    };
  }


  SGRA.Domain.BodyModel = {
    getBodyById,
    getBodyIndexById,
    bodyRelativeToBH,
    relativeToBH
  };
})(window);
