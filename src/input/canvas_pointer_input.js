// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCanvasPointerInput(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Input = SGRA.Input || {};

  function bind(canvas, actions) {
    const points = new Map();
    let downPosition = null;
    let moved = false;
    let pinchDistance = null;
    let pinchAngle = null;
    const pointList = () => [...points.values()];
    const distance = list => Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    const angle = list => Math.atan2(list[1].y - list[0].y, list[1].x - list[0].x);
    const angleDelta = (next, previous) => {
      let delta = next - previous;
      while (delta <= -Math.PI) delta += 2 * Math.PI;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      return delta;
    };
    const PINCH_DEAD_ZONE_PX = 2;
    const TWIST_DEAD_ZONE_RAD = 0.04;

    function pointerdown(event) {
      canvas.setPointerCapture(event.pointerId);
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      downPosition = { x: event.clientX, y: event.clientY };
      moved = false;
      actions.onPointerDown({ x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerCount: points.size });
      if (points.size === 2) {
        pinchDistance = distance(pointList());
        pinchAngle = angle(pointList());
        actions.onPinchStart();
      } else if (points.size > 2) {
        // A third pointer suspends the two-pointer gesture. Any later return
        // to exactly two pointers must establish a fresh baseline.
        pinchDistance = null;
        pinchAngle = null;
      }
    }
    function pointermove(event) {
      if (!points.has(event.pointerId)) return;
      const previous = points.get(event.pointerId);
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (downPosition && Math.hypot(event.clientX - downPosition.x, event.clientY - downPosition.y) > 6) moved = true;
      if (points.size === 1) {
        const handled = actions.onPointerMove({ x: event.clientX, y: event.clientY, dx, dy, pointerId: event.pointerId, pointerCount: points.size, moved });
        if (!handled) actions.onRotate(dx, dy);
      }
      if (points.size === 2 && pinchDistance !== null && pinchAngle !== null) {
        const currentPoints = pointList();
        const currentDistance = distance(currentPoints);
        const currentAngle = angle(currentPoints);
        if (Math.abs(currentDistance - pinchDistance) >= PINCH_DEAD_ZONE_PX && currentDistance > 0) actions.onPinch(pinchDistance / currentDistance);
        const twist = angleDelta(currentAngle, pinchAngle);
        if (Math.abs(twist) >= TWIST_DEAD_ZONE_RAD) actions.onTwist?.(twist);
      }
    }
    function pointerup(event) {
      const wasTracked = points.has(event.pointerId);
      points.delete(event.pointerId);
      actions.onPointerUp({ x: event.clientX, y: event.clientY, pointerId: event.pointerId, wasTracked, moved, remainingPointers: points.size });
      if (points.size === 2 && wasTracked) {
        pinchDistance = distance(pointList());
        pinchAngle = angle(pointList());
        actions.onPinchStart();
      } else if (points.size === 1) {
        const remaining = pointList()[0];
        downPosition = { x: remaining.x, y: remaining.y };
        moved = false;
      } else if (points.size < 2) {
        pinchDistance = null;
        pinchAngle = null;
      }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    function pointercancel(event) {
      const wasTracked = points.has(event.pointerId);
      points.delete(event.pointerId);
      if (points.size === 2 && wasTracked) {
        pinchDistance = distance(pointList());
        pinchAngle = angle(pointList());
        actions.onPinchStart();
      } else if (points.size === 1) {
        const remaining = pointList()[0];
        downPosition = { x: remaining.x, y: remaining.y };
        moved = false;
      } else if (points.size < 2) {
        pinchDistance = null;
        pinchAngle = null;
      }
      actions.onCancel({ pointerId: event.pointerId, remainingPointers: points.size });
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    function wheel(event) { event.preventDefault(); actions.onZoom(event.deltaY); }

    canvas.addEventListener('pointerdown', pointerdown);
    canvas.addEventListener('pointermove', pointermove);
    canvas.addEventListener('pointerup', pointerup);
    canvas.addEventListener('pointercancel', pointercancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return Object.freeze({
      dispose() {
        canvas.removeEventListener('pointerdown', pointerdown);
        canvas.removeEventListener('pointermove', pointermove);
        canvas.removeEventListener('pointerup', pointerup);
        canvas.removeEventListener('pointercancel', pointercancel);
        canvas.removeEventListener('wheel', wheel);
        points.clear();
      }
    });
  }

  SGRA.Input.CanvasPointerInput = Object.freeze({ bind });
})(typeof window !== 'undefined' ? window : globalThis);
