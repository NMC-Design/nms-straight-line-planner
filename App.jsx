import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Sphere, Line } from "@react-three/drei";

/**
 * NMS Straight-Line Galaxy Planner
 * -------------------------------------------------
 * What it does
 * - Visualize a galaxy sphere, start & end points, and a straight-line path between them
 * - Generate evenly spaced checkpoints along the line
 * - Track progress (checkpoints done), persist locally, import/export JSON
 * - Export PNG of the current 3D view
 * - Copy checkpoints to clipboard (CSV)
 *
 * Notes
 * - All client-side; host anywhere (GitHub Pages / Netlify / Vercel)
 * - Coordinates: use in-game galactic XYZ from your save or a save editor
 */

// ---------- Utility Functions ----------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function formatNum(n) {
  return Number(n).toFixed(2);
}

function toCSV(rows) {
  const header = ["index", "x", "y", "z", "t"].join(",");
  const body = rows
    .map((r, i) => [i, r.x, r.y, r.z, r.t].join(","))
    .join("\n");
  return header + "\n" + body;
}

function download(filename, text) {
  const element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function downloadDataURL(filename, dataURL) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------- Three Components ----------
function Galaxy({ radius = 500 }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      {/* semi-transparent to see inside */}
      <meshBasicMaterial transparent opacity={0.06} />
    </mesh>
  );
}

function CheckpointDots({ points = [], size = 2 }) {
  return (
    <group>
      {points.map((p, i) => (
        <Sphere key={i} args={[size, 16, 16]} position={[p.x, p.y, p.z]}>
          <meshBasicMaterial />
        </Sphere>
      ))}
    </group>
  );
}

function ProgressDot({ point, size = 4 }) {
  if (!point) return null;
  return (
    <Sphere args={[size, 16, 16]} position={[point.x, point.y, point.z]}>
      <meshBasicMaterial />
    </Sphere>
  );
}

function SpinningHelper({ speed = 0.002 }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) ref.current.rotation.y += speed;
  });
  return (
    <group ref={ref}>
      {/* faint axes lines */}
      <Line points={[[0, 0, 0], [600, 0, 0]]} lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 600, 0]]} lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, 600]]} lineWidth={1} />
    </group>
  );
}

// ---------- Main App ----------
export default function App() {
  const [radius, setRadius] = useState(500);
  const [start, setStart] = useState([0, 0, 0]);
  const [end, setEnd] = useState([400, 50, -300]);
  const [numCheckpoints, setNumCheckpoints] = useState(50);
  const [stateKey, setStateKey] = useState("nms-line-state-v1");

  // progress flags array
  const [done, setDone] = useState([]); // boolean[] same length as checkpoints

  // derived
  const linePoints = useMemo(() => {
    const pts = [];
    // include endpoints and evenly spaced internal points
    for (let i = 0; i <= numCheckpoints; i++) {
      const t = i / numCheckpoints;
      const [x, y, z] = lerpVec(start, end, t);
      pts.push({ x, y, z, t });
    }
    return pts;
  }, [start, end, numCheckpoints]);

  // initialize done array when checkpoint count changes
  useEffect(() => {
    setDone((prev) => {
      const n = linePoints.length;
      const out = new Array(n).fill(false);
      for (let i = 0; i < Math.min(prev.length, n); i++) out[i] = prev[i];
      return out;
    });
  }, [linePoints.length]);

  // localStorage persistence
  useEffect(() => {
    const saved = localStorage.getItem(stateKey);
    if (saved) {
      try {
        const obj = JSON.parse(saved);
        if (obj.start && obj.end && obj.numCheckpoints) {
          setStart(obj.start);
          setEnd(obj.end);
          setNumCheckpoints(obj.numCheckpoints);
          setRadius(obj.radius ?? 500);
          setDone(obj.done ?? []);
        }
      } catch {}
    }
  }, [stateKey]);

  useEffect(() => {
    const data = { start, end, numCheckpoints, radius, done };
    localStorage.setItem(stateKey, JSON.stringify(data));
  }, [start, end, numCheckpoints, radius, done, stateKey]);

  const totalDist = useMemo(() => distance(start, end), [start, end]);
  const completedCount = done.filter(Boolean).length;
  const progress = linePoints.length > 1 ? (completedCount / (linePoints.length - 1)) * 100 : 0;

  const currentPoint = useMemo(() => {
    const idx = done.findIndex((v) => !v);
    if (idx === -1) return linePoints[linePoints.length - 1];
    return linePoints[idx];
  }, [done, linePoints]);

  function parseVec3(str) {
    const parts = (str || "").split(",").map((s) => parseFloat(s.trim()));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    return parts;
  }

  function handleExportJSON() {
    const data = { start, end, numCheckpoints, radius, done };
    download("nms_straight_line_state.json", JSON.stringify(data, null, 2));
  }

  function handleImportJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj.start && obj.end) {
          setStart(obj.start);
          setEnd(obj.end);
          setNumCheckpoints(obj.numCheckpoints || 50);
          setRadius(obj.radius || 500);
          setDone(obj.done || []);
        }
      } catch (err) {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  function handleCopyCSV() {
    const csv = toCSV(linePoints);
    navigator.clipboard.writeText(csv);
  }

  const canvasRef = useRef();

  function handleExportPNG() {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataURL = canvas.toDataURL("image/png");
    downloadDataURL("nms_galaxy_line.png", dataURL);
  }

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-3 bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <div className="p-4 lg:col-span-1 space-y-4 border-b lg:border-b-0 lg:border-r border-zinc-800">
        <h1 className="text-2xl font-semibold">NMS Straight-Line Galaxy Planner</h1>
        <p className="text-sm text-zinc-400">
          Plan, visualize, and track a straight-line crossing of the No Man's Sky
          galaxy. Input your start & end XYZ (galactic coordinates), generate
          checkpoints, and mark progress as you warp.
        </p>

        {/* Inputs */}
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-zinc-300">Local Save Key</label>
            <input
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
              value={stateKey}
              onChange={(e) => setStateKey(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-sm text-zinc-300">Galaxy Radius</label>
            <input
              type="number"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
              value={radius}
              onChange={(e) => setRadius(parseFloat(e.target.value) || 500)}
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <label className="text-sm text-zinc-300">Start (x,y,z)</label>
            <input
              placeholder="0, 0, 0"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
              defaultValue={start.join(", ")}
              onBlur={(e) => {
                const v = parseVec3(e.target.value);
                if (v) setStart(v);
                else e.target.value = start.join(", ");
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <label className="text-sm text-zinc-300">End (x,y,z)</label>
            <input
              placeholder="400, 50, -300"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
              defaultValue={end.join(", ")}
              onBlur={(e) => {
                const v = parseVec3(e.target.value);
                if (v) setEnd(v);
                else e.target.value = end.join(", ");
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-sm text-zinc-300"># of Checkpoints</label>
            <input
              type="number"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
              value={numCheckpoints}
              onChange={(e) =>
                setNumCheckpoints(Math.max(1, parseInt(e.target.value) || 1))
              }
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            className="px-3 py-2 rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white transition"
            onClick={handleCopyCSV}
          >
            Copy Checkpoints CSV
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white transition"
            onClick={handleExportJSON}
          >
            Export JSON
          </button>
          <label className="px-3 py-2 rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white transition cursor-pointer">
            Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={handleImportJSON} />
          </label>
          <button
            className="px-3 py-2 rounded-xl bg-zinc-200 text-zinc-900 hover:bg-white transition"
            onClick={handleExportPNG}
          >
            Export PNG View
          </button>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-xs text-zinc-500">Total Distance</div>
            <div className="text-lg font-semibold">{formatNum(totalDist)}</div>
          </div>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-xs text-zinc-500">Progress</div>
            <div className="text-lg font-semibold">{formatNum(progress)}%</div>
          </div>
        </div>

        {/* Checklist */}
        <div className="mt-4 max-h-[40vh] overflow-auto rounded-2xl bg-zinc-900 border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900">
              <tr>
                <th className="text-left px-3 py-2">✓</th>
                <th className="text-left px-3 py-2">Idx</th>
                <th className="text-left px-3 py-2">X</th>
                <th className="text-left px-3 py-2">Y</th>
                <th className="text-left px-3 py-2">Z</th>
              </tr>
            </thead>
            <tbody>
              {linePoints.map((p, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!done[i]}
                      onChange={(e) =>
                        setDone((d) => {
                          const copy = [...d];
                          copy[i] = e.target.checked;
                          return copy;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{i}</td>
                  <td className="px-3 py-2">{formatNum(p.x)}</td>
                  <td className="px-3 py-2">{formatNum(p.y)}</td>
                  <td className="px-3 py-2">{formatNum(p.z)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3D View */}
      <div className="lg:col-span-2 relative" ref={canvasRef}>
        <Canvas camera={{ position: [0, radius * 1.1, radius * 1.1], fov: 50 }}>
          <color attach="background" args={[0.02, 0.02, 0.02]} />
          <ambientLight intensity={0.8} />
          <Galaxy radius={radius} />

          {/* Start & End markers */}
          <Sphere args={[6, 32, 32]} position={start}>
            <meshBasicMaterial />
          </Sphere>
          <Sphere args={[6, 32, 32]} position={end}>
            <meshBasicMaterial />
          </Sphere>

          {/* Straight line */}
          <Line
            points={[start, end]}
            lineWidth={2}
          />

          {/* Checkpoints */}
          <CheckpointDots points={linePoints} size={2} />
          <ProgressDot point={currentPoint} size={4} />

          <SpinningHelper speed={0.0005} />
          <OrbitControls enableDamping />

          {/* HUD labels */}
          <Html position={start} center>
            <div className="text-xs px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700">Start</div>
          </Html>
          <Html position={end} center>
            <div className="text-xs px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700">End</div>
          </Html>
        </Canvas>

        <div className="absolute bottom-4 left-4 right-4">
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-200"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {completedCount}/{linePoints.length - 1} legs completed
          </div>
        </div>
      </div>
    </div>
  );
}
