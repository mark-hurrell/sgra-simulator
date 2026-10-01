// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPredictionDisplayState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createPredictionDisplayState() {
    let followedPath = null;
    let followedPathRealTime = 0;
    let previousPrediction = null;
    let blend = 1;

    function getFollowedPath() { return followedPath; }
    function getFollowedPathRealTime() { return followedPathRealTime; }
    function setFollowedPath(path, realTime) {
      followedPath = path;
      followedPathRealTime = Number.isFinite(realTime) ? realTime : followedPathRealTime;
    }
    function clearFollowedPath() { followedPath = null; followedPathRealTime = 0; }

    function getPreviousPrediction() { return previousPrediction; }
    function setPreviousPrediction(path) { previousPrediction = path; }
    function getBlend() { return blend; }
    function setBlend(value) { blend = Number.isFinite(value) ? value : blend; return blend; }

    function reset() {
      followedPath = null;
      followedPathRealTime = 0;
      previousPrediction = null;
      blend = 1;
    }

    function snapshot() {
      return {
        followedPath,
        followedPathRealTime,
        previousPrediction,
        blend
      };
    }

    return Object.freeze({
      getFollowedPath,
      getFollowedPathRealTime,
      setFollowedPath,
      clearFollowedPath,
      getPreviousPrediction,
      setPreviousPrediction,
      getBlend,
      setBlend,
      reset,
      snapshot
    });
  }

  SGRA.State.PredictionDisplayState = Object.freeze({ createPredictionDisplayState });
})(globalThis);
