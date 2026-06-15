#!/usr/bin/env python3
"""
sgra_backend_final.py — Sgr A* GPU microservice
Physics aligned with fixed JS frontend: ε=9.0, true‑radius PN, BH pinning,
iterated second half‑kick for velocity‑dependent PN term.
Supports CUDA (CuPy) or OpenCL.
Copyright (c) 2026 Mark Hurrell
SPDX-License-Identifier: AGPL-3.0-or-later
"""

import sys, os, math, asyncio, logging, traceback
from typing import List, Optional
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np

logging.basicConfig(level=logging.INFO,
    format='%(asctime)s  %(levelname)-7s  %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('sgra')

# ========== Physical constants (exact match) ==========
G        = 4.0 * math.pi**2          # AU³/yr²/M☉
C_AUYR   = 63241.077                 # c in AU/yr
C2       = C_AUYR ** 2
EPS2_BH  = 1e-6                      # BH–star softening squared
EPS2_SS  = 9.0                       # star–star softening (ε=3 AU)
CUSP_M0  = 3.5e5                     # dark cusp normalisation
CUSP_R0  = 103132.0                  # cusp scale (AU)
R_CAP_FAC= 4.0                       # capture radius = 4 R_s

# ========== Backend detection ==========
BACKEND = "numpy"
cp = cl = cl_ctx = cl_queue = cl_mf = None

try:
    import cupy as _cp
    _cp.cuda.Device(0).use()
    _ = _cp.zeros(1)
    cp = _cp
    BACKEND = "cuda"
    log.info("CUDA backend selected (CuPy)")
except Exception as e:
    log.warning(f"CuPy not available: {e}")

if BACKEND == "numpy":
    try:
        import pyopencl as _cl
        chosen_dev = None
        for plat in _cl.get_platforms():
            devs = plat.get_devices(device_type=_cl.device_type.GPU)
            if devs: chosen_dev = devs[0]; break
        if chosen_dev is None:
            for plat in _cl.get_platforms():
                devs = plat.get_devices(device_type=_cl.device_type.CPU)
                if devs: chosen_dev = devs[0]; break
        if chosen_dev:
            cl_ctx = _cl.Context([chosen_dev])
            cl_queue = _cl.CommandQueue(cl_ctx)
            cl_mf = _cl.mem_flags
            cl = _cl
            BACKEND = "opencl"
            log.info(f"OpenCL device: {chosen_dev.name}")
        else:
            log.warning("No OpenCL devices found")
    except Exception as e:
        log.warning(f"PyOpenCL not available: {e}")

_FORCE_BACKEND = os.environ.get('SGRA_BACKEND', '').lower() or None
if _FORCE_BACKEND == 'numpy':
    log.info("SGRA_BACKEND=numpy: forcing CPU fallback")
    BACKEND = 'numpy'

# ========== CUDA kernel (fully fixed: safe inactive reads, single‑block compatible) ==========
CUDA_SRC = r"""
__device__ double rs(double gm, double c2) { return 2.0 * gm / c2; }

__device__ void compute_accel(
    int i, int N,
    const double* pos,
    const double* vel,
    const double* mass,
    const int*    is_bh,
    double G, double C2,
    double EPS2_BH, double EPS2_SS,
    double gm_bh, double rs_bh,
    int gr_on, int cusp_on,
    double CUSP_M0, double CUSP_R0,
    int true_r,
    double& ax, double& ay, double& az)
{
    ax = 0.0; ay = 0.0; az = 0.0;
    double xi = pos[i*3], yi = pos[i*3+1], zi = pos[i*3+2];
    // BH softening floor pinned to horizon scale (EPS2_BH input retained as an
    // absolute lower bound, but in practice rs_bh^2 >> EPS2_BH so this caps the
    // worst-case potential depth at ~Rs instead of ~1e-3 Rs).
    double eps2_bh_eff = fmax(EPS2_BH, rs_bh * rs_bh);
    // Newtonian pair forces
    for (int j = 0; j < N; ++j) {
        if (j == i) continue;
        double dx = pos[j*3] - xi, dy = pos[j*3+1] - yi, dz = pos[j*3+2] - zi;
        double r2 = dx*dx + dy*dy + dz*dz;
        double eps2 = (is_bh[i] || is_bh[j]) ? eps2_bh_eff : EPS2_SS;
        double r2s = r2 + eps2;
        double inv = G * mass[j] / (r2s * sqrt(r2s));
        ax += inv * dx;
        ay += inv * dy;
        az += inv * dz;
    }
    // 1PN Schwarzschild term
    if (gr_on && i > 0) {
        double rx = xi - pos[0], ry = yi - pos[1], rz = zi - pos[2];
        double vx = vel[i*3] - vel[0], vy = vel[i*3+1] - vel[1], vz = vel[i*3+2] - vel[2];
        double r2 = rx*rx + ry*ry + rz*rz;
        double r_true = sqrt(fmax(r2, 1e-12));
        double r_cap = 4.0 * rs_bh;  // R_CAP_FAC=4.0 (Python const not visible in kernel)
        double rmin2 = fmax(r_cap, 1e-4);
        double r_soft = fmax(r_true, rmin2);
        double pnDamp = (r_soft < 3.0 * rmin2) ? fmax(0.0, (r_soft - rmin2) / (2.0 * rmin2)) : 1.0;
        double r_coupling = true_r ? r_true : r_soft;
        double v2 = vx*vx + vy*vy + vz*vz;
        double rdv = rx*vx + ry*vy + rz*vz;
        double k = pnDamp * gm_bh / (C2 * r_soft * r_soft);
        double factor = (4.0 * gm_bh / r_coupling - v2);
        double fx = k * (factor * rx + 4.0 * rdv * vx);
        double fy = k * (factor * ry + 4.0 * rdv * vy);
        double fz = k * (factor * rz + 4.0 * rdv * vz);
        ax += fx; ay += fy; az += fz;
        // Back‑reaction on BH is omitted because BH is pinned to origin.
    }
    // Dark cusp
    if (cusp_on && i > 0) {
        double rx = xi - pos[0], ry = yi - pos[1], rz = zi - pos[2];
        double r = sqrt(rx*rx + ry*ry + rz*rz);
        if (r >= 1.0) {
            double ca = G * CUSP_M0 * pow(r / CUSP_R0, 1.5) / (r*r*r);
            ax -= ca * rx;
            ay -= ca * ry;
            az -= ca * rz;
        }
    }
}

__device__ double body_dt(
    int i, int N,
    const double* pos,
    const double* vel,
    const double* mass,
    double G, double dt_max, double dt_min, double dt_safety,
    int gr_on, double gm_bh, double C2, double rs_bh, int dt_limit)
{
    if (i == 0) return dt_max;
    double rx = pos[i*3] - pos[0], ry = pos[i*3+1] - pos[1], rz = pos[i*3+2] - pos[2];
    double vx = vel[i*3] - vel[0], vy = vel[i*3+1] - vel[1], vz = vel[i*3+2] - vel[2];
    double r2 = rx*rx + ry*ry + rz*rz;
    double r = sqrt(fmax(r2, 1e-30));
    double v = sqrt(vx*vx + vy*vy + vz*vz);
    double td = sqrt(r2 * r / (G * (mass[0] + mass[i])));
    double tc = (v > 0.0) ? r / (10.0 * v) : 1e9;
    double dt = fmin(dt_safety * td, tc);
    if (gr_on && dt_limit && i > 0) {
        double r_safe = fmax(r, 1e-12);
        double v2 = vx*vx + vy*vy + vz*vz;
        double rdv = rx*vx + ry*vy + rz*vz;
        double pnMag = (gm_bh / (C2 * r_safe * r_safe)) *
                      fabs((4.0 * gm_bh / r_safe - v2) * r_safe + 4.0 * rdv * v);
        if (pnMag > 0.0) {
            double dt_pn = dt_safety * v / pnMag;
            dt = fmin(dt, dt_pn);
        }
    }
    return fmin(dt_max, fmax(dt_min, dt));
}

extern "C" __global__
void nbody_integrate(
    double* pos,
    double* vel,
    const double* mass,
    const int*    is_bh,
    double* dt_buf,
    const int N,
    const double G, const double C2,
    const double EPS2_BH, const double EPS2_SS,
    const double gm_bh, const double rs_bh,
    const int gr_on, const int cusp_on,
    const double CUSP_M0, const double CUSP_R0,
    const int true_r, const int dt_limit,
    const double want_dt,
    const double dt_max, const double dt_min, const double dt_safety,
    const int max_substeps, const int dt_refresh,
    const double r_cap_fac,
    double* done_buf,
    int*    steps_buf,
    int*    captured_buf)
{
    extern __shared__ double smem[];
    double* spos = smem;
    double* svel = smem + N*3;
    double* sdt  = smem + N*6;

    int i = blockIdx.x * blockDim.x + threadIdx.x;
    int tid = threadIdx.x;
    int active = (i < N);

    if (active) {
        spos[i*3]   = pos[i*3];
        spos[i*3+1] = pos[i*3+1];
        spos[i*3+2] = pos[i*3+2];
        svel[i*3]   = vel[i*3];
        svel[i*3+1] = vel[i*3+1];
        svel[i*3+2] = vel[i*3+2];
    }
    __syncthreads();

    double ax = 0.0, ay = 0.0, az = 0.0;
    if (active) {
        compute_accel(i, N, spos, svel, mass, is_bh,
                      G, C2, EPS2_BH, EPS2_SS,
                      gm_bh, rs_bh,
                      gr_on, cusp_on, CUSP_M0, CUSP_R0,
                      true_r,
                      ax, ay, az);
    }
    __syncthreads();

    double done = 0.0;
    double dt_cached = dt_max;
    int steps = 0;
    int captured = 0;
    double rcap2 = (r_cap_fac * rs_bh) * (r_cap_fac * rs_bh);

    while (done < want_dt && steps < max_substeps) {
        if (steps % dt_refresh == 0) {
            double my_dt = active ? body_dt(i, N, spos, svel, mass,
                               G, dt_max, dt_min, dt_safety,
                               gr_on, gm_bh, C2, rs_bh, dt_limit) : dt_max;
            sdt[tid] = my_dt;
            __syncthreads();
            for (int s = blockDim.x/2; s > 0; s >>= 1) {
                if (tid < s) sdt[tid] = fmin(sdt[tid], sdt[tid+s]);
                __syncthreads();
            }
            dt_cached = sdt[0];
            if (tid == 0) dt_buf[blockIdx.x] = dt_cached;
            __syncthreads();
        }

        double dt = fmin(dt_cached, want_dt - done);
        double h = 0.5 * dt;

        // Kick 1
        if (active && !captured) {
            svel[i*3]   += ax * h;
            svel[i*3+1] += ay * h;
            svel[i*3+2] += az * h;
        }
        __syncthreads();

        // Drift
        if (active && !captured) {
            spos[i*3]   += svel[i*3]   * dt;
            spos[i*3+1] += svel[i*3+1] * dt;
            spos[i*3+2] += svel[i*3+2] * dt;
        }
        __syncthreads();

        // Capture check (after drift, before recompute): a star that has
        // crossed inside R_CAP_FAC * Rs is considered swallowed for this
        // call. Freeze its state so it stops being integrated further;
        // the host merges it into the BH between calls.
        if (active && !captured && i > 0) {
            double rx = spos[i*3]   - spos[0];
            double ry = spos[i*3+1] - spos[1];
            double rz = spos[i*3+2] - spos[2];
            double r2 = rx*rx + ry*ry + rz*rz;
            if (r2 < rcap2) {
                captured = 1;
                ax = 0.0; ay = 0.0; az = 0.0;
            }
        }
        __syncthreads();

        // Recompute accel (after drift)
        if (active && !captured) {
            compute_accel(i, N, spos, svel, mass, is_bh,
                          G, C2, EPS2_BH, EPS2_SS,
                          gm_bh, rs_bh,
                          gr_on, cusp_on, CUSP_M0, CUSP_R0,
                          true_r,
                          ax, ay, az);
        }
        __syncthreads();

        // Iterated second half‑kick (fixed‑point for velocity‑dependent PN)
        if (gr_on && !captured) {
            // PROTECTED: only read svel for active threads, else 0.0
            double vhx = active ? svel[i*3]   : 0.0;
            double vhy = active ? svel[i*3+1] : 0.0;
            double vhz = active ? svel[i*3+2] : 0.0;
            for (int it = 0; it < 3; ++it) {
                if (active && !captured) {
                    svel[i*3]   = vhx + ax * h;
                    svel[i*3+1] = vhy + ay * h;
                    svel[i*3+2] = vhz + az * h;
                }
                __syncthreads();
                if (active && !captured) {
                    compute_accel(i, N, spos, svel, mass, is_bh,
                                  G, C2, EPS2_BH, EPS2_SS,
                                  gm_bh, rs_bh,
                                  gr_on, cusp_on, CUSP_M0, CUSP_R0,
                                  true_r,
                                  ax, ay, az);
                }
                __syncthreads();
            }
            if (active && !captured) {
                svel[i*3]   = vhx + ax * h;
                svel[i*3+1] = vhy + ay * h;
                svel[i*3+2] = vhz + az * h;
            }
        } else if (!gr_on) {
            if (active && !captured) {
                svel[i*3]   += ax * h;
                svel[i*3+1] += ay * h;
                svel[i*3+2] += az * h;
            }
        }
        __syncthreads();

        done += dt;
        steps++;
        if (done >= want_dt - 1e-12 * want_dt) break;
    }

    // Write back; force BH to origin with zero velocity (pinning)
    if (active) {
        if (i == 0) {
            pos[0] = 0.0; pos[1] = 0.0; pos[2] = 0.0;
            vel[0] = 0.0; vel[1] = 0.0; vel[2] = 0.0;
            captured_buf[0] = 0;
        } else {
            pos[i*3]   = spos[i*3];
            pos[i*3+1] = spos[i*3+1];
            pos[i*3+2] = spos[i*3+2];
            vel[i*3]   = svel[i*3];
            vel[i*3+1] = svel[i*3+1];
            vel[i*3+2] = svel[i*3+2];
            captured_buf[i] = captured;
        }
    }

    if (tid == 0 && blockIdx.x == 0) {
        done_buf[0] = done;
        steps_buf[0] = steps;
    }
}
"""

# OpenCL kernel – fully corrected (already had safe inactive reads and single‑block design)
OPENCL_SRC = r"""
#pragma OPENCL EXTENSION cl_khr_fp64 : enable

double rs(double gm, double c2) { return 2.0 * gm / c2; }

void compute_accel_ocl(
    int i, int N,
    __local const double* spos,
    __local const double* svel,
    __global const double* mass,
    __global const int*    is_bh,
    double G, double C2,
    double EPS2_BH, double EPS2_SS,
    double gm_bh, double rs_bh,
    int gr_on, int cusp_on,
    double CUSP_M0, double CUSP_R0,
    int true_r,
    double* ax, double* ay, double* az)
{
    *ax=0; *ay=0; *az=0;
    double xi=spos[i*3], yi=spos[i*3+1], zi=spos[i*3+2];
    double eps2_bh_eff = max(EPS2_BH, rs_bh * rs_bh);
    for (int j=0; j<N; j++) {
        if (j==i) continue;
        double dx=spos[j*3]-xi, dy=spos[j*3+1]-yi, dz=spos[j*3+2]-zi;
        double r2=dx*dx+dy*dy+dz*dz;
        double eps2=(is_bh[i]||is_bh[j])?eps2_bh_eff:EPS2_SS;
        double r2s=r2+eps2;
        double inv=G*mass[j]/(r2s*sqrt(r2s));
        *ax+=inv*dx; *ay+=inv*dy; *az+=inv*dz;
    }
    if (gr_on && i>0) {
        double rx=xi-spos[0], ry=yi-spos[1], rz=zi-spos[2];
        double vx=svel[i*3]-svel[0], vy=svel[i*3+1]-svel[1], vz=svel[i*3+2]-svel[2];
        double r2=rx*rx+ry*ry+rz*rz;
        double r_true=sqrt(max(r2, 1e-12));
        double r_cap=4.0*rs_bh;
        double rmin2=max(r_cap, 1e-4);
        double r_soft=max(r_true, rmin2);
        double pnDamp=(r_soft<3.0*rmin2)?max(0.0,(r_soft-rmin2)/(2.0*rmin2)):1.0;
        double r_coupling = true_r ? r_true : r_soft;
        double v2=vx*vx+vy*vy+vz*vz;
        double rdv=rx*vx+ry*vy+rz*vz;
        double k=pnDamp*gm_bh/(C2*r_soft*r_soft);
        double factor=(4.0*gm_bh/r_coupling - v2);
        *ax+=k*(factor*rx+4.0*rdv*vx);
        *ay+=k*(factor*ry+4.0*rdv*vy);
        *az+=k*(factor*rz+4.0*rdv*vz);
    }
    if (cusp_on && i>0) {
        double rx=xi-spos[0], ry=yi-spos[1], rz=zi-spos[2];
        double r=sqrt(rx*rx+ry*ry+rz*rz);
        if (r>=1.0) {
            double ca=G*CUSP_M0*pow(r/CUSP_R0,1.5)/(r*r*r);
            *ax-=ca*rx; *ay-=ca*ry; *az-=ca*rz;
        }
    }
}

__kernel void nbody_integrate(
    __global double* pos,
    __global double* vel,
    __global const double* mass,
    __global const int*    is_bh,
    __local  double* spos,
    __local  double* svel,
    __local  double* sdt,
    const int N,
    const double G, const double C2,
    const double EPS2_BH, const double EPS2_SS,
    const double gm_bh, const double rs_bh,
    const int gr_on, const int cusp_on,
    const double CUSP_M0, const double CUSP_R0,
    const int true_r, const int dt_limit,
    const double want_dt,
    const double dt_max, const double dt_min, const double dt_safety,
    const int max_substeps, const int dt_refresh,
    const double r_cap_fac,
    __global double* done_buf,
    __global int*    steps_buf,
    __global int*    captured_buf)
{
    int i   = get_global_id(0);
    int tid = get_local_id(0);
    int active = (i < N);

    if (active) {
        spos[i*3]=pos[i*3]; spos[i*3+1]=pos[i*3+1]; spos[i*3+2]=pos[i*3+2];
        svel[i*3]=vel[i*3]; svel[i*3+1]=vel[i*3+1]; svel[i*3+2]=vel[i*3+2];
    }
    barrier(CLK_LOCAL_MEM_FENCE);

    double ax=0.0, ay=0.0, az=0.0;
    if (active) compute_accel_ocl(i, N, spos, svel, mass, is_bh,
        G, C2, EPS2_BH, EPS2_SS, gm_bh, rs_bh,
        gr_on, cusp_on, CUSP_M0, CUSP_R0, true_r, &ax, &ay, &az);
    barrier(CLK_LOCAL_MEM_FENCE);

    double done=0.0, dt_cached=dt_max;
    int steps=0;
    int captured=0;
    double rcap2 = (r_cap_fac * rs_bh) * (r_cap_fac * rs_bh);

    while (done < want_dt && steps < max_substeps) {
        if (steps % dt_refresh == 0) {
            double my_dt = dt_max;
            if (active && i > 0) {
                double rx=spos[i*3]-spos[0], ry=spos[i*3+1]-spos[1], rz=spos[i*3+2]-spos[2];
                double vx=svel[i*3]-svel[0], vy=svel[i*3+1]-svel[1], vz=svel[i*3+2]-svel[2];
                double r2=rx*rx+ry*ry+rz*rz;
                double r=sqrt(max(r2, 1e-30));
                double v=sqrt(vx*vx+vy*vy+vz*vz);
                double td=sqrt(r2*r/(G*(mass[0]+mass[i])));
                double tc=(v>0.0)?r/(10.0*v):1e9;
                my_dt = min(dt_safety*td, tc);
                if (gr_on && dt_limit) {
                    double r_safe=max(r, 1e-12);
                    double v2=vx*vx+vy*vy+vz*vz;
                    double rdv=rx*vx+ry*vy+rz*vz;
                    double pnMag=(gm_bh/(C2*r_safe*r_safe)) *
                                  fabs((4.0*gm_bh/r_safe - v2)*r_safe + 4.0*rdv*v);
                    if (pnMag>0.0) my_dt = min(my_dt, dt_safety*v/pnMag);
                }
                my_dt = min(dt_max, max(dt_min, my_dt));
            }
            sdt[tid]=my_dt;
            barrier(CLK_LOCAL_MEM_FENCE);
            for (int s=get_local_size(0)/2; s>0; s>>=1) {
                if (tid<s) sdt[tid]=min(sdt[tid],sdt[tid+s]);
                barrier(CLK_LOCAL_MEM_FENCE);
            }
            dt_cached=sdt[0];
            barrier(CLK_LOCAL_MEM_FENCE);
        }

        double dt=min(dt_cached, want_dt-done);
        double h=0.5*dt;

        // Kick 1
        if (active && !captured) {
            svel[i*3]+=ax*h; svel[i*3+1]+=ay*h; svel[i*3+2]+=az*h;
        }
        barrier(CLK_LOCAL_MEM_FENCE);

        // Drift
        if (active && !captured) {
            spos[i*3]+=svel[i*3]*dt; spos[i*3+1]+=svel[i*3+1]*dt; spos[i*3+2]+=svel[i*3+2]*dt;
        }
        barrier(CLK_LOCAL_MEM_FENCE);

        // Capture check (after drift, before recompute): a star that has
        // crossed inside R_CAP_FAC * Rs is considered swallowed for this
        // call. Freeze its state; the host merges it into the BH between calls.
        if (active && !captured && i > 0) {
            double rx = spos[i*3]   - spos[0];
            double ry = spos[i*3+1] - spos[1];
            double rz = spos[i*3+2] - spos[2];
            double r2 = rx*rx + ry*ry + rz*rz;
            if (r2 < rcap2) {
                captured = 1;
                ax = 0.0; ay = 0.0; az = 0.0;
            }
        }
        barrier(CLK_LOCAL_MEM_FENCE);

        // Recompute accel after drift
        if (active && !captured) compute_accel_ocl(i, N, spos, svel, mass, is_bh,
            G, C2, EPS2_BH, EPS2_SS, gm_bh, rs_bh,
            gr_on, cusp_on, CUSP_M0, CUSP_R0, true_r, &ax, &ay, &az);
        barrier(CLK_LOCAL_MEM_FENCE);

        // Iterated second half-kick (fixed-point for velocity-dependent PN)
        if (gr_on && !captured) {
            double vhx = active ? svel[i*3]   : 0.0;
            double vhy = active ? svel[i*3+1] : 0.0;
            double vhz = active ? svel[i*3+2] : 0.0;
            for (int it=0; it<3; it++) {
                if (active && !captured) {
                    svel[i*3]   = vhx + ax*h;
                    svel[i*3+1] = vhy + ay*h;
                    svel[i*3+2] = vhz + az*h;
                }
                barrier(CLK_LOCAL_MEM_FENCE);
                if (active && !captured) compute_accel_ocl(i, N, spos, svel, mass, is_bh,
                    G, C2, EPS2_BH, EPS2_SS, gm_bh, rs_bh,
                    gr_on, cusp_on, CUSP_M0, CUSP_R0, true_r, &ax, &ay, &az);
                barrier(CLK_LOCAL_MEM_FENCE);
            }
            if (active && !captured) {
                svel[i*3]   = vhx + ax*h;
                svel[i*3+1] = vhy + ay*h;
                svel[i*3+2] = vhz + az*h;
            }
        } else if (!gr_on) {
            if (active && !captured) {
                svel[i*3]+=ax*h; svel[i*3+1]+=ay*h; svel[i*3+2]+=az*h;
            }
        }
        barrier(CLK_LOCAL_MEM_FENCE);

        done+=dt; steps++;
        if (done >= want_dt - 1e-12*want_dt) break;
    }

    // Write back; force BH (i==0) to origin with zero velocity (pinning)
    if (active) {
        if (i==0) {
            pos[0]=0.0; pos[1]=0.0; pos[2]=0.0;
            vel[0]=0.0; vel[1]=0.0; vel[2]=0.0;
            captured_buf[0]=0;
        } else {
            pos[i*3]=spos[i*3]; pos[i*3+1]=spos[i*3+1]; pos[i*3+2]=spos[i*3+2];
            vel[i*3]=svel[i*3]; vel[i*3+1]=svel[i*3+1]; vel[i*3+2]=svel[i*3+2];
            captured_buf[i]=captured;
        }
    }
    if (i==0) {
        done_buf[0]=done;
        steps_buf[0]=steps;
    }
}
"""

_cuda_kernel   = None
_opencl_kernel = None

def init_cuda():
    global _cuda_kernel, BACKEND
    if BACKEND != "cuda": return
    try:
        _cuda_kernel = cp.RawKernel(CUDA_SRC, 'nbody_integrate',
                                    options=('--std=c++14',))
        log.info("CUDA kernel compiled OK")
    except Exception as e:
        log.error(f"CUDA compile failed: {e}")
        BACKEND = "numpy"

def init_opencl():
    global _opencl_kernel, BACKEND
    if BACKEND != "opencl": return
    try:
        _opencl_kernel = cl.Program(cl_ctx, OPENCL_SRC).build()
        log.info("OpenCL kernel compiled OK")
    except Exception as e:
        log.error(f"OpenCL build failed: {e}")
        BACKEND = "numpy"

if BACKEND == "cuda":
    init_cuda()
    if BACKEND == "cuda":
        try:
            cp.zeros((4,3), dtype=cp.float64)
            cp.cuda.Stream.null.synchronize()
            log.info("CUDA ready")
        except:
            BACKEND = "numpy"
elif BACKEND == "opencl":
    init_opencl()

def gpu_info():
    info = {"backend": BACKEND}
    if BACKEND == "cuda":
        try:
            props = cp.cuda.runtime.getDeviceProperties(0)
            info["gpu"] = props['name'].decode()
        except:
            info["gpu"] = "CUDA device"
    elif BACKEND == "opencl":
        try:
            info["gpu"] = cl_ctx.get_info(cl.context_info.DEVICES)[0].name.strip()
        except:
            info["gpu"] = "OpenCL device"
    else:
        info["gpu"] = "CPU (NumPy)"
    return info

GPU_INFO = gpu_info()

# ========== Pydantic models ==========
class Body(BaseModel):
    m: float
    x: float; y: float; z: float
    vx: float; vy: float; vz: float
    bh: bool = False

class AdvanceRequest(BaseModel):
    dt: float = Field(..., gt=0, le=1.0)
    maxSubsteps: int = Field(2600, ge=1, le=10000)
    grOn:    bool = False
    cuspOn:  bool = False
    dtMax:   float = Field(0.002, gt=0, le=0.1)
    dtMin:   float = Field(5e-6,  gt=0, le=0.001)
    dtSafety:float = Field(0.001, gt=0, le=0.1)
    generation: int = 0
    trueR:   bool = Field(True)
    dtLimit: bool = Field(True)
    pinBH:   bool = Field(True)   # ignored, kernel always pins
    bodies: List[Body]

# ========== Dispatchers ==========
def advance_cuda(req: AdvanceRequest, N, pos_np, vel_np, mass_np, ibh_np):
    # Force single block so all bodies share the same shared memory
    BLOCK = 512                 # large enough for up to 500 bodies
    GRID  = 1
    DT_REFRESH = 8
    smem_bytes = (N*6 + BLOCK) * 8   # N*6 for pos+vel, plus BLOCK for dt reduction

    pos_d  = cp.asarray(pos_np.ravel().copy())
    vel_d  = cp.asarray(vel_np.ravel().copy())
    mass_d = cp.asarray(mass_np)
    ibh_d  = cp.asarray(ibh_np)
    dt_buf = cp.zeros(GRID, dtype=cp.float64)
    done_d = cp.zeros(1, dtype=cp.float64)
    step_d = cp.zeros(1, dtype=cp.int32)
    cap_d  = cp.zeros(N, dtype=cp.int32)

    gm_bh = G * mass_np[0]
    rs_bh = 2.0 * gm_bh / C2

    _cuda_kernel(
        (GRID,), (BLOCK,),
        (pos_d, vel_d, mass_d, ibh_d, dt_buf,
         np.int32(N),
         np.float64(G), np.float64(C2),
         np.float64(EPS2_BH), np.float64(EPS2_SS),
         np.float64(gm_bh), np.float64(rs_bh),
         np.int32(1 if req.grOn else 0),
         np.int32(1 if req.cuspOn else 0),
         np.float64(CUSP_M0), np.float64(CUSP_R0),
         np.int32(1 if req.trueR else 0),
         np.int32(1 if req.dtLimit else 0),
         np.float64(req.dt),
         np.float64(req.dtMax), np.float64(req.dtMin), np.float64(req.dtSafety),
         np.int32(req.maxSubsteps), np.int32(DT_REFRESH),
         np.float64(R_CAP_FAC),
         done_d, step_d, cap_d),
        shared_mem=smem_bytes
    )
    cp.cuda.Stream.null.synchronize()

    pos_out = cp.asnumpy(pos_d).reshape(N,3)
    vel_out = cp.asnumpy(vel_d).reshape(N,3)
    cap_out = cp.asnumpy(cap_d).astype(bool)
    return pos_out, vel_out, float(done_d[0]), int(step_d[0]), cap_out

def advance_opencl(req: AdvanceRequest, N, pos_np, vel_np, mass_np, ibh_np):
    wg = min(512, 1 << (N-1).bit_length())
    # Force single work‑group
    wg = max(wg, N)
    DT_REFRESH = 8
    pos_flat = pos_np.ravel().copy()
    vel_flat = vel_np.ravel().copy()
    d_pos   = cl.Buffer(cl_ctx, cl_mf.READ_WRITE | cl_mf.COPY_HOST_PTR, hostbuf=pos_flat)
    d_vel   = cl.Buffer(cl_ctx, cl_mf.READ_WRITE | cl_mf.COPY_HOST_PTR, hostbuf=vel_flat)
    d_mass  = cl.Buffer(cl_ctx, cl_mf.READ_ONLY  | cl_mf.COPY_HOST_PTR, hostbuf=mass_np.astype(np.float64))
    d_ibh   = cl.Buffer(cl_ctx, cl_mf.READ_ONLY  | cl_mf.COPY_HOST_PTR, hostbuf=ibh_np.astype(np.int32))
    d_done  = cl.Buffer(cl_ctx, cl_mf.WRITE_ONLY, size=8)
    d_steps = cl.Buffer(cl_ctx, cl_mf.WRITE_ONLY, size=4)
    d_cap   = cl.Buffer(cl_ctx, cl_mf.WRITE_ONLY, size=4*N)

    gm_bh = G * mass_np[0]
    rs_bh = 2.0 * gm_bh / C2

    spos_local = cl.LocalMemory(N * 3 * 8)
    svel_local = cl.LocalMemory(N * 3 * 8)
    sdt_local  = cl.LocalMemory(wg * 8)

    _opencl_kernel.nbody_integrate(
        cl_queue, (wg,), (wg,),
        d_pos, d_vel, d_mass, d_ibh,
        spos_local, svel_local, sdt_local,
        np.int32(N),
        np.float64(G), np.float64(C2),
        np.float64(EPS2_BH), np.float64(EPS2_SS),
        np.float64(gm_bh), np.float64(rs_bh),
        np.int32(1 if req.grOn else 0),
        np.int32(1 if req.cuspOn else 0),
        np.float64(CUSP_M0), np.float64(CUSP_R0),
        np.int32(1 if req.trueR else 0),
        np.int32(1 if req.dtLimit else 0),
        np.float64(req.dt),
        np.float64(req.dtMax), np.float64(req.dtMin), np.float64(req.dtSafety),
        np.int32(req.maxSubsteps), np.int32(DT_REFRESH),
        np.float64(R_CAP_FAC),
        d_done, d_steps, d_cap
    )
    cl_queue.finish()
    pos_out = np.empty_like(pos_flat); vel_out = np.empty_like(vel_flat)
    done_np = np.zeros(1); steps_np = np.zeros(1, dtype=np.int32)
    cap_np  = np.zeros(N, dtype=np.int32)
    cl.enqueue_copy(cl_queue, pos_out, d_pos)
    cl.enqueue_copy(cl_queue, vel_out, d_vel)
    cl.enqueue_copy(cl_queue, done_np,  d_done)
    cl.enqueue_copy(cl_queue, steps_np, d_steps)
    cl.enqueue_copy(cl_queue, cap_np,   d_cap)
    cl_queue.finish()
    return pos_out.reshape(N,3), vel_out.reshape(N,3), float(done_np[0]), int(steps_np[0]), cap_np.astype(bool)

def advance_numpy(req: AdvanceRequest, N, pos, vel, mass, ibh):
    # Full NumPy fallback would be implemented here if needed.
    # For GPU‑only production, raise a clear error.
    raise NotImplementedError("NumPy fallback not implemented. Please use CUDA or OpenCL.")
    # Expected return shape if implemented: pos, vel, done, steps, captured(bool[N])

# ========== FastAPI ==========
app = FastAPI(title="SGR A* Microservice", version="3.0.0")
app.add_middleware(CORSMiddleware,
    allow_origin_regex=r".*", allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"], allow_credentials=False, max_age=3600)

@app.get("/status")
async def status():
    return GPU_INFO

@app.post("/advance")
async def advance(req: AdvanceRequest):
    if len(req.bodies) < 2:
        raise HTTPException(400, "Need at least 2 bodies")
    if len(req.bodies) > 500:
        raise HTTPException(400, "Body count exceeds 500")
    N = len(req.bodies)
    pos_np = np.array([[b.x, b.y, b.z] for b in req.bodies], dtype=np.float64)
    vel_np = np.array([[b.vx, b.vy, b.vz] for b in req.bodies], dtype=np.float64)
    mass_np = np.array([b.m for b in req.bodies], dtype=np.float64)
    ibh_np  = np.array([1 if b.bh else 0 for b in req.bodies], dtype=np.int32)

    if BACKEND == "cuda" and _cuda_kernel is not None:
        pos_out, vel_out, done, steps, captured = advance_cuda(req, N, pos_np, vel_np, mass_np, ibh_np)
    elif BACKEND == "opencl" and _opencl_kernel is not None:
        pos_out, vel_out, done, steps, captured = advance_opencl(req, N, pos_np, vel_np, mass_np, ibh_np)
    else:
        raise HTTPException(501, "GPU backend not available and NumPy fallback not implemented")

    result_bodies = []
    for i, orig in enumerate(req.bodies):
        result_bodies.append({
            "m": orig.m,
            "x": float(pos_out[i,0]), "y": float(pos_out[i,1]), "z": float(pos_out[i,2]),
            "vx": float(vel_out[i,0]), "vy": float(vel_out[i,1]), "vz": float(vel_out[i,2]),
            "bh": orig.bh,
            "captured": bool(captured[i])
        })
    return {"bodies": result_bodies, "simAdvanced": done, "substeps": steps, "generation": req.generation}

@app.post("/shutdown")
async def shutdown():
    asyncio.get_event_loop().call_later(0.3, lambda: sys.exit(0))
    return {"status": "shutting down"}

if __name__ == "__main__":
    port = 7823
    log.info("="*60)
    log.info("  Sgr A* GPU Microservice v3.0  (physics‑aligned)")
    log.info("="*60)
    log.info(f"  backend : {BACKEND.upper()}")
    log.info(f"  device  : {GPU_INFO.get('gpu', '?')}")
    log.info(f"  softening ε_star = {math.sqrt(EPS2_SS):.1f} AU")
    log.info(f"  true‑radius PN : ON, BH pinning : ON, PN‑timestep : ON")
    log.info(f"  iterated second half‑kick : ON (matching JS)")
    log.info(f"  endpoint: http://localhost:{port}")
    log.info("="*60)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
