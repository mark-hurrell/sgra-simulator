// Sgr A* Simulator
/* eslint-disable max-lines-per-function -- the factory keeps controller state and methods in one closure */
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).

(function attachGroupFollowController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Camera = SGRA.Camera || {};

  function create(options = {}) {
    const {
      bodies,
      cameraController,
      cameraProjection,
      viewportState,
      cameraViewState,
      calmMotionEnabled,
      groupFramingState
    } = options;

    const GROUP_RADIAL_DEADBAND = 0.5;
    const GROUP_FRAME_FILL = 0.55;
    const GROUP_FRAME_COMFORT = 1.45;
    const GROUP_VIEW_ELEVATION = 0.55;
    const GROUP_VIEW_ELEVATION_MIN = 0.09;
    const GROUP_VIEW_ELEVATION_MAX = 1.48;
    const GROUP_TARGET_FRACTION = 0.5;
    const GROUP_TARGET_BLEND_SECONDS = 0.6;
    const GROUP_ORIENT_BLEND_SECONDS = 1.2;
    const GROUP_ZOOM_BLEND_SECONDS = 1.1;
    const GROUP_MIN_AU_PER_100PX = 120;
    const GROUP_CORE_OUTLIER_FACTOR = 2.5;

    const groupFollowView = {
      initialised: false, lastRealTime: 0,
      tx: 0, ty: 0, tz: 0,
      rHat: null, nHat: null,
      elevation: GROUP_VIEW_ELEVATION, azimuth: 0,
      targetYaw: 0, targetPitch: 0, haveTargetOrientation: false
    };
    const groupFollowZoomState = { multiplier: 1 };

    function resetGroupFollowCamera() {
      groupFollowView.initialised = false;
      groupFollowView.lastRealTime = 0;
      groupFollowView.rHat = null;
      groupFollowView.nHat = null;
      groupFollowView.elevation = GROUP_VIEW_ELEVATION;
      groupFollowView.azimuth = 0;
      groupFollowView.haveTargetOrientation = false;
      groupFollowZoomState.multiplier = 1;
    }

    const followGroupDisplayState = {
      memberIds: new Set(),
      active: false,
      add(body) { if (!body?.intr || !Number.isFinite(body.id)) return false; const before = this.memberIds.size; this.memberIds.add(body.id); return this.memberIds.size !== before; },
      remove(id) { return this.memberIds.delete(id); },
      stop() { this.active = false; groupFramingState.radialMode = 'inward'; resetGroupFollowCamera(); },
      prune() { for (const id of this.memberIds) { const body = bodies.find(item => item.id === id); if (!body || !body.intr || body.captured) this.memberIds.delete(id); } if (!this.memberIds.size) { this.active = false; groupFramingState.radialMode = 'inward'; resetGroupFollowCamera(); } },
      liveMembers() { this.prune(); return [...this.memberIds].map(id => bodies.find(body => body.id === id)).filter(Boolean); },
      anchor() {
        const members = this.liveMembers();
        const bh = bodies[0];
        if (!members.length || !bh) return null;
        const sum = members.reduce((out, body) => {
          out.x += body.x - bh.x;
          out.y += body.y - bh.y;
          out.z += body.z - bh.z;
          return out;
        }, { x: 0, y: 0, z: 0 });
        return {
          tx: sum.x / members.length,
          ty: sum.y / members.length,
          tz: sum.z / members.length
        };
      }
    };

    function applyGroupFollowRotate(deltaX, deltaY) {
      if (!followGroupDisplayState.active) return false;
      const k = 0.0045;
      groupFollowView.azimuth -= deltaX * k;
      groupFollowView.elevation = Math.min(GROUP_VIEW_ELEVATION_MAX, Math.max(GROUP_VIEW_ELEVATION_MIN, groupFollowView.elevation + deltaY * k));
      cameraViewState.noteManualCameraChange();
      return true;
    }

    function applyGroupFollowZoomFactor(factor) {
      if (!followGroupDisplayState.active || !Number.isFinite(factor) || factor <= 0) return false;
      groupFollowZoomState.multiplier = Math.min(4, Math.max(0.25, groupFollowZoomState.multiplier * factor));
      cameraViewState.noteManualCameraChange();
      return true;
    }

    function groupFollowCoreMembers(members, bh) {
      if (members.length < 3) return members;
      let sx = 0, sy = 0, sz = 0;
      for (const body of members) { sx += body.x - bh.x; sy += body.y - bh.y; sz += body.z - bh.z; }
      const cx = sx / members.length, cy = sy / members.length, cz = sz / members.length;
      const dists = members.map(body => Math.hypot(body.x - bh.x - cx, body.y - bh.y - cy, body.z - bh.z - cz));
      const sorted = [...dists].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (!(median > 1e-9)) return members;
      const core = members.filter((_, i) => dists[i] <= median * GROUP_CORE_OUTLIER_FACTOR);
      return core.length ? core : members;
    }

    function groupFollowKinematics() {
      const allMembers = followGroupDisplayState.liveMembers();
      const bh = bodies[0];
      if (!allMembers.length || !bh) return null;
      const members = groupFollowCoreMembers(allMembers, bh);
      let sx = 0, sy = 0, sz = 0, svx = 0, svy = 0, svz = 0;
      for (const body of members) {
        sx += body.x - bh.x; sy += body.y - bh.y; sz += body.z - bh.z;
        svx += body.vx - bh.vx; svy += body.vy - bh.vy; svz += body.vz - bh.vz;
      }
      const n = members.length;
      const centroid = { x: sx / n, y: sy / n, z: sz / n };
      const centroidVel = { x: svx / n, y: svy / n, z: svz / n };
      const radius = Math.hypot(centroid.x, centroid.y, centroid.z);
      const radialRate = radius > 1e-12 ? (centroid.x * centroidVel.x + centroid.y * centroidVel.y + centroid.z * centroidVel.z) / radius : 0;
      if (radialRate > GROUP_RADIAL_DEADBAND) groupFramingState.radialMode = 'outward';
      else if (radialRate < -GROUP_RADIAL_DEADBAND) groupFramingState.radialMode = 'inward';
      return { allMembers, members, bh, centroid, radius, radialRate };
    }

    function bestFitPlaneNormal(points) {
      if (points.length < 3) return null;
      let cx = 0, cy = 0, cz = 0;
      for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
      const n = points.length; cx /= n; cy /= n; cz /= n;
      let mxx = 0, mxy = 0, mxz = 0, myy = 0, myz = 0, mzz = 0;
      for (const p of points) {
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        mxx += dx * dx; mxy += dx * dy; mxz += dx * dz; myy += dy * dy; myz += dy * dz; mzz += dz * dz;
      }
      const trace = mxx + myy + mzz;
      if (!(trace > 1e-9)) return null;
      const a11 = trace - mxx, a12 = -mxy, a13 = -mxz;
      const a21 = -mxy, a22 = trace - myy, a23 = -myz;
      const a31 = -mxz, a32 = -myz, a33 = trace - mzz;
      let vx = 0.5773502691896258, vy = 0.5773502691896258, vz = 0.5773502691896258;
      for (let i = 0; i < 25; i++) {
        const nx = a11 * vx + a12 * vy + a13 * vz;
        const ny = a21 * vx + a22 * vy + a23 * vz;
        const nz = a31 * vx + a32 * vy + a33 * vz;
        const mag = Math.hypot(nx, ny, nz);
        if (!(mag > 1e-15)) return null;
        vx = nx / mag; vy = ny / mag; vz = nz / mag;
      }
      return { nx: vx, ny: vy, nz: vz };
    }

    function groupOrbitalNormal(kin) {
      if (!kin || !kin.members.length) return null;
      if (kin.members.length >= 3) {
        const positions = kin.members.map(body => ({ x: body.x - kin.bh.x, y: body.y - kin.bh.y, z: body.z - kin.bh.z }));
        const fit = bestFitPlaneNormal(positions);
        if (fit) return { hx: fit.nx, hy: fit.ny, hz: fit.nz };
      }
      let hx = 0, hy = 0, hz = 0, first = null;
      for (const body of kin.members) {
        const rx = body.x - kin.bh.x, ry = body.y - kin.bh.y, rz = body.z - kin.bh.z;
        const vx = body.vx - kin.bh.vx, vy = body.vy - kin.bh.vy, vz = body.vz - kin.bh.vz;
        let hxi = ry * vz - rz * vy, hyi = rz * vx - rx * vz, hzi = rx * vy - ry * vx;
        if (first) {
          if (hxi * first.x + hyi * first.y + hzi * first.z < 0) { hxi = -hxi; hyi = -hyi; hzi = -hzi; }
        } else first = { x: hxi, y: hyi, z: hzi };
        hx += hxi; hy += hyi; hz += hzi;
      }
      const mag = Math.hypot(hx, hy, hz);
      return mag > 1e-12 ? { hx: hx / mag, hy: hy / mag, hz: hz / mag } : null;
    }

    const v3 = {
      dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
      cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
      scale: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
      add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
      norm(a) { const m = Math.hypot(a.x, a.y, a.z); return m > 1e-12 ? { x: a.x / m, y: a.y / m, z: a.z / m } : null; }
    };

    function orientationsForDirection(d) {
      const yaw = Math.atan2(d.x, d.y), pitch = Math.atan2(Math.hypot(d.x, d.y), d.z);
      return [{ yaw, pitch }, { yaw: yaw + Math.PI, pitch: -pitch }];
    }
    function screenUpFor(o) { return { x: Math.cos(o.pitch) * Math.sin(o.yaw), y: Math.cos(o.pitch) * Math.cos(o.yaw), z: -Math.sin(o.pitch) }; }
    function currentCameraDirection() {
      const c = cameraController.getCameraSnapshot();
      return { x: Math.sin(c.pitch) * Math.sin(c.yaw), y: Math.sin(c.pitch) * Math.cos(c.yaw), z: Math.cos(c.pitch) };
    }
    function angleDelta(target, current) {
      let delta = target - current;
      while (delta <= -Math.PI) delta += 2 * Math.PI;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      return delta;
    }
    function orientationDistance(a, b) { return Math.abs(angleDelta(a.yaw, b.yaw)) + Math.abs(angleDelta(a.pitch, b.pitch)); }

    function groupFollowPlaneNormal(kin, rHat) {
      const C = kin.centroid;
      let sx = 0, sy = 0, sz = 0;
      for (const body of kin.members) { sx += body.vx - kin.bh.vx; sy += body.vy - kin.bh.vy; sz += body.vz - kin.bh.vz; }
      const V = { x: sx / kin.members.length, y: sy / kin.members.length, z: sz / kin.members.length };
      const h = v3.cross(C, V);
      const hm = Math.hypot(h.x, h.y, h.z), scale = Math.hypot(C.x, C.y, C.z) * Math.hypot(V.x, V.y, V.z);
      let n = hm > 0.05 * scale && hm > 1e-12 ? v3.scale(h, 1 / hm) : null;
      if (!n) { const g = groupOrbitalNormal(kin); if (g) n = { x: g.hx, y: g.hy, z: g.hz }; }
      if (!n) n = groupFollowView.nHat;
      if (!n) n = currentCameraDirection();
      const ref = groupFollowView.nHat || currentCameraDirection();
      if (v3.dot(n, ref) < 0) n = v3.scale(n, -1);
      const orth = v3.norm(v3.add(n, v3.scale(rHat, -v3.dot(n, rHat))));
      return orth || groupFollowView.nHat || null;
    }

    function blendAlpha(dt, seconds) { return dt > 0 ? 1 - Math.exp(-dt / seconds) : 0; }

    function groupFollowDistance(kin, target) {
      const viewport = viewportState.getLive();
      if (!kin || !(viewport.W > 0) || !(viewport.H > 0) || !(viewport.F > 0)) return null;
      const halfW = viewport.W * GROUP_FRAME_FILL * 0.5;
      const halfH = viewport.H * GROUP_FRAME_FILL * 0.5;
      const tx = target.tx, ty = target.ty, tz = target.tz;
      let required = 40;
      const frame = (wx, wy, wz) => {
        const [px, py, pz] = cameraProjection.rot(wx - tx, wy - ty, wz - tz);
        required = Math.max(required, pz + Math.abs(px) * viewport.F / halfW, pz + Math.abs(py) * viewport.F / halfH);
      };
      frame(0, 0, 0);
      for (const body of kin.members) frame(body.x - kin.bh.x, body.y - kin.bh.y, body.z - kin.bh.z);
      const floor = viewport.F * GROUP_MIN_AU_PER_100PX / 100;
      return Math.min(60000, Math.max(40, floor, required * GROUP_FRAME_COMFORT + 8));
    }

    function updateGroupFollowCamera(realNow) {
      const kin = groupFollowKinematics();
      if (!kin) return;
      const calm = calmMotionEnabled();
      const view = groupFollowView;
      const dt = view.lastRealTime > 0 ? Math.max(0, Math.min(0.25, (realNow - view.lastRealTime) / 1000)) : 0;
      view.lastRealTime = realNow;
      const R = Math.hypot(kin.centroid.x, kin.centroid.y, kin.centroid.z);
      const rHat = R > 1e-6 ? v3.scale(kin.centroid, 1 / R) : view.rHat;
      if (!rHat) return;
      view.rHat = rHat;
      const nHat = groupFollowPlaneNormal(kin, rHat);
      if (!nHat) return;
      view.nHat = nHat;
      const tHat = v3.cross(nHat, rHat);
      const rA = v3.add(v3.scale(rHat, Math.cos(view.azimuth)), v3.scale(tHat, Math.sin(view.azimuth)));
      const d = v3.add(v3.scale(rA, Math.cos(view.elevation)), v3.scale(nHat, Math.sin(view.elevation)));
      const [oA, oB] = orientationsForDirection(d);
      let chosen;
      if (!view.haveTargetOrientation) {
        const e = v3.add(v3.scale(nHat, Math.cos(view.elevation)), v3.scale(rA, -Math.sin(view.elevation)));
        chosen = v3.dot(screenUpFor(oA), e) >= v3.dot(screenUpFor(oB), e) ? oA : oB;
      } else {
        const prev = { yaw: view.targetYaw, pitch: view.targetPitch };
        chosen = orientationDistance(oA, prev) <= orientationDistance(oB, prev) ? oA : oB;
      }
      view.targetYaw = chosen.yaw; view.targetPitch = chosen.pitch; view.haveTargetOrientation = true;
      const current = cameraController.getCameraSnapshot();
      const aOri = calm ? 1 : blendAlpha(dt, GROUP_ORIENT_BLEND_SECONDS);
      cameraController.setOrientation(current.yaw + angleDelta(chosen.yaw, current.yaw) * aOri, current.pitch + angleDelta(chosen.pitch, current.pitch) * aOri);
      const T = v3.scale(kin.centroid, GROUP_TARGET_FRACTION);
      if (!view.initialised) { view.tx = current.tx; view.ty = current.ty; view.tz = current.tz; }
      const aT = calm ? 1 : blendAlpha(dt, GROUP_TARGET_BLEND_SECONDS);
      view.tx += (T.x - view.tx) * aT; view.ty += (T.y - view.ty) * aT; view.tz += (T.z - view.tz) * aT;
      cameraController.setTarget(view.tx, view.ty, view.tz);
      const snapNow = cameraController.getCameraSnapshot();
      cameraProjection.setOrientation(snapNow.yaw, snapNow.pitch);
      const baseline = groupFollowDistance(kin, view);
      if (baseline !== null) {
        const desired = baseline * groupFollowZoomState.multiplier;
        const aZ = calm ? 1 : blendAlpha(dt, GROUP_ZOOM_BLEND_SECONDS);
        cameraController.setZoom(snapNow.dist + (desired - snapNow.dist) * aZ);
      }
      view.initialised = true;
    }

    function groupStatusText() {
      const kin = groupFollowKinematics();
      if (!kin || !followGroupDisplayState.active) return 'Group follow is inactive.';
      const distance = kin.radius;
      const trend = kin.radialRate > GROUP_RADIAL_DEADBAND ? 'increasing' : kin.radialRate < -GROUP_RADIAL_DEADBAND ? 'decreasing' : 'steady';
      const dx = kin.members.map(body => Math.hypot(body.x - kin.bh.x - kin.centroid.x, body.y - kin.bh.y - kin.centroid.y, body.z - kin.bh.z - kin.centroid.z));
      const separation = dx.length ? Math.max(...dx) : 0;
      const excluded = kin.allMembers.filter(body => !kin.members.includes(body)).map(body => body.name || `ID ${body.id}`);
      return `Group status: core centroid ${distance.toFixed(1)} AU from Sgr A*; radial distance ${trend}; core spread ${separation.toFixed(1)} AU; ${excluded.length ? `excluded from camera framing: ${excluded.join(', ')}.` : 'all explicit intruders drive framing.'}`;
    }

    return Object.freeze({
      displayState: followGroupDisplayState,
      view: groupFollowView,
      zoomState: groupFollowZoomState,
      resetGroupFollowCamera,
      applyGroupFollowRotate,
      applyGroupFollowZoomFactor,
      groupFollowKinematics,
      groupFollowDistance,
      updateGroupFollowCamera,
      groupStatusText
    });
  }

  SGRA.Camera.GroupFollowController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
