// ===========================================================================
// MFCG Voronoi — Delaunay triangulation → Voronoi cells
// Port of com.watabou.geom.Delaunator + getVoronoi
// ===========================================================================

import Delaunator from "delaunator";
import { Pt } from "./topology.js";

/**
 * Build Voronoi cells from a set of input points.
 * Returns a Map mapping each input point to its Voronoi cell polygon vertices.
 *
 * The original code adds 6 boundary points at 2× the bounding radius to ensure
 * all Voronoi cells close properly. We mirror this approach.
 */
export function buildVoronoi(inputPoints: Pt[]): Map<string, Pt[]> {
  if (inputPoints.length < 3) return new Map();

  // Find bounding radius
  const cx = inputPoints.reduce((s, p) => s + p.x, 0) / inputPoints.length;
  const cy = inputPoints.reduce((s, p) => s + p.y, 0) / inputPoints.length;
  let maxR = 0;
  for (const p of inputPoints) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > maxR) maxR = d;
  }

  // Add 6 regular boundary points at 2× maxR to close all Voronoi cells
  const boundaryRadius = 2 * maxR;
  const allPoints = [...inputPoints];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    allPoints.push(new Pt(cx + boundaryRadius * Math.cos(angle), cy + boundaryRadius * Math.sin(angle)));
  }

  // Run Delaunay triangulation (delaunator v5 expects [x, y] tuples by default)
  const tuples: [number, number][] = allPoints.map(p => [p.x, p.y] as [number, number]);
  const del = Delaunator.from(tuples);

  // Build Voronoi cells: map from each input point index to its cell vertices
  const cellMap = new Map<number, Pt[]>();

  const numTriangles = del.triangles.length / 3;
  for (let t = 0; t < numTriangles; t++) {
    const pi = del.triangles[t * 3]!;
    const pj = del.triangles[t * 3 + 1]!;
    const pk = del.triangles[t * 3 + 2]!;

    // Skip triangles involving boundary points (the last 6 entries)
    // We still compute the circumcenter but only add it to non-boundary indices

    const a = allPoints[pi]!;
    const b = allPoints[pj]!;
    const c = allPoints[pk]!;

    const center = circumcenter(a, b, c);
    if (!center) continue;

    if (pi < inputPoints.length) {
      if (!cellMap.has(pi)) cellMap.set(pi, []);
      cellMap.get(pi)!.push(center);
    }
    if (pj < inputPoints.length) {
      if (!cellMap.has(pj)) cellMap.set(pj, []);
      cellMap.get(pj)!.push(center);
    }
    if (pk < inputPoints.length) {
      if (!cellMap.has(pk)) cellMap.set(pk, []);
      cellMap.get(pk)!.push(center);
    }
  }

  // Now we need to order the circumcenters CW/CCW around each point
  // This is done by sorting by angle from the point
  const result = new Map<string, Pt[]>();
  for (const [idx, centers] of cellMap) {
    const origin = inputPoints[idx]!;
    // Sort by angle around origin
    centers.sort((a, b) => {
      const angleA = Math.atan2(a.y - origin.y, a.x - origin.x);
      const angleB = Math.atan2(b.y - origin.y, b.x - origin.x);
      return angleA - angleB;
    });
    // Remove duplicates (adjacent identical centers)
    const unique: Pt[] = [];
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i]!;
      const prev = unique[unique.length - 1];
      if (!prev || Math.hypot(c.x - prev.x, c.y - prev.y) > 1e-6) {
        unique.push(c);
      }
    }
    if (unique.length >= 3) {
      result.set(`${origin.x},${origin.y}`, unique);
    }
  }

  return result;
}

/**
 * Compute the circumcenter of three points (center of circle through all three).
 */
function circumcenter(a: Pt, b: Pt, c: Pt): Pt | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-10) return null; // collinear
  const aLen = a.x * a.x + a.y * a.y;
  const bLen = b.x * b.x + b.y * b.y;
  const cLen = c.x * c.x + c.y * c.y;
  return new Pt(
    (aLen * (b.y - c.y) + bLen * (c.y - a.y) + cLen * (a.y - b.y)) / d,
    (aLen * (c.x - b.x) + bLen * (a.x - c.x) + cLen * (b.x - a.x)) / d,
  );
}
