import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const CATEGORIES = [
  { name: "Thinking Frameworks",   color: "#00f2ea" },
  { name: "Psychology",            color: "#a78bfa" },
  { name: "Philosophy",            color: "#fbbf24" },
  { name: "Physics",               color: "#60a5fa" },
  { name: "Human Nature",          color: "#fb923c" },
  { name: "Strategy & Incentives", color: "#34d399" },
  { name: "Negotiation",           color: "#f87171" },
  { name: "Risk",                  color: "#f472b6" },
];

// Ghost node positions — shown when sphere is empty so it never looks barren
const GHOST_POSITIONS = [
  { theta:0.3,  phi:0.8 }, { theta:1.8, phi:1.1 }, { theta:3.5, phi:0.6 },
  { theta:2.2,  phi:2.1 }, { theta:4.8, phi:1.4 }, { theta:1.1, phi:2.5 },
  { theta:5.5,  phi:1.8 }, { theta:3.9, phi:0.9 }, { theta:0.8, phi:1.6 },
  { theta:2.9,  phi:0.4 },
];

const R   = 2.4;
const KEY      = "rorbit-v1";
const GH_TOKEN = "rorbit-gh-token";
const GH_GIST  = "rorbit-gist-id";
const INTRO    = "rorbit-intro-seen";

const DARK = {
  appBg:"#010306", panelBg:"#071e35", border:"#1a3a55",
  inputBg:"#082030", inputBorder:"#204a6a",
  text:"#ffffff",           // pure white — no ambiguity
  textMuted:"#d8eef8",      // bright, clearly readable secondary
  textDim:"#8abcd8",        // visible tertiary labels
  accent:"#00f2ea", accentG:"#34d399",
  nodeBg:"#0a2540", legendText:"#d8eef8",
  tagBg:"#0a2540", tagBorder:"#204a6a", tagText:"#8abcd8",
  selBg:"rgba(4,14,28,0.98)", synBg:"#0a2540",
  btnDisabled:"#2a5070", headerSub:"#8abcd8",
  challengeBg:"#0a2540", challengeBorder:"#00f2ea30",
  divider:"#142e48", searchBg:"#082030",
};
const LIGHT = {
  appBg:"#edf2f7", panelBg:"#ffffff", border:"#b0c8da",
  inputBg:"#f4f8fb", inputBorder:"#88aac0",
  text:"#080f18",           // near-black, maximum contrast on white
  textMuted:"#1a3448",      // dark blue-grey, unambiguously readable
  textDim:"#3a6278",        // clear tertiary
  accent:"#0891b2", accentG:"#059669",
  nodeBg:"#e8f0f8", legendText:"#1a3448",
  tagBg:"#e8f0f8", tagBorder:"#a0c0d0", tagText:"#3a6278",
  selBg:"rgba(244,248,251,0.98)", synBg:"#f4f8fb",
  btnDisabled:"#88aac0", headerSub:"#3a6278",
  challengeBg:"#eaf6ff", challengeBorder:"#0891b235",
  divider:"#b0c8da", searchBg:"#f4f8fb",
};

const getcat  = (name) => CATEGORIES.find(c => c.name === name) ?? CATEGORIES[0];
const rndpos  = () => ({ theta: Math.random() * Math.PI * 2, phi: Math.acos(2 * Math.random() - 1) });
const toXYZ   = (theta, phi, r = R) => ({
  x: r * Math.sin(phi) * Math.cos(theta),
  y: r * Math.cos(phi),
  z: r * Math.sin(phi) * Math.sin(theta),
});
const SPIN_Q  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.0006);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Detect Claude artifact sandbox by checking for the actual storage API function.
// Browser extensions sometimes define window.storage so we check for the specific .get function.
const IS_ARTIFACT  = typeof window.storage?.get === "function";
const API_ENDPOINT = IS_ARTIFACT ? "https://api.anthropic.com/v1/messages" : "/api/chat";
const MODEL        = IS_ARTIFACT ? "claude-sonnet-4-20250514" : "claude-sonnet-4-6";

export default function ROrbit() {
  const mountRef    = useRef(null);
  const three       = useRef({});
  const nodesRef    = useRef([]);
  const newNodeAnim = useRef(null);

  const selectedRef       = useRef(null);
  const reviewNodeRef     = useRef(null);
  const highlightedRef    = useRef([]);
  const activeCategoryRef = useRef(null);

  const [nodes,            setNodes]            = useState([]);
  const [input,            setInput]            = useState("");
  const [exampleInput,     setExampleInput]     = useState("");
  const [addMode,          setAddMode]          = useState("enhance"); // 'enhance' | 'keep'
  const [adding,           setAdding]           = useState(false);
  const [lastAdded,        setLastAdded]        = useState(null);
  const [selected,         setSelected]         = useState(null);
  const [mobileCardExpanded, setMobileCardExpanded] = useState(false);
  const [highlighted,      setHighlighted]      = useState([]);
  const [isLight,          setIsLight]          = useState(false);
  const [activeCategory,   setActiveCategory]   = useState(null);
  const [hoveredCat,       setHoveredCat]       = useState(null);
  const [showIntro,        setShowIntro]        = useState(false);
  const [panel,            setPanel]            = useState("capture");
  const [isMobile,         setIsMobile]         = useState(() => window.innerWidth < 700);
  const [nodeSearch,       setNodeSearch]       = useState("");
  const [sphereBrightness, setSphereBrightness] = useState(40);

  // Explore — persisted across tab navigation
  const [queryText,   setQueryText]   = useState("");
  const [querying,    setQuerying]    = useState(false);
  const [synthesis,   setSynthesis]   = useState("");
  const [reviewNode,  setReviewNode]  = useState(null);
  const [challenge,   setChallenge]   = useState("");
  const [challenging, setChallenging] = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [editData,    setEditData]    = useState({ title:"", insight:"", category:"", tags:"" });

  // Library — persisted
  const [recs,        setRecs]        = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Cloud Backup
  const [githubToken, setGithubTokenState] = useState(() => { try { return localStorage.getItem(GH_TOKEN) || ""; } catch { return ""; } });
  const [gistId,      setGistIdState]      = useState(() => { try { return localStorage.getItem(GH_GIST)  || ""; } catch { return ""; } });
  const [backingUp,   setBackingUp]        = useState(false);
  const [backupMsg,   setBackupMsg]        = useState("");
  const [showBackup,  setShowBackup]       = useState(false);

  // Inline ref sync
  selectedRef.current       = selected;
  reviewNodeRef.current     = reviewNode;
  highlightedRef.current    = highlighted;
  activeCategoryRef.current = activeCategory;

  const T     = isLight ? LIGHT : DARK;
  const sans  = "'Inter',system-ui,-apple-system,sans-serif";
  const mono  = "'DM Mono','Courier New',monospace";
  const orbit = "'Orbitron','DM Mono',monospace";

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Load storage + check first-run
  // Uses localStorage in standalone deployment, window.storage in Claude artifact sandbox
  useEffect(() => {
    try {
      if (IS_ARTIFACT) {
        (async () => {
          try {
            const [nr, ir] = await Promise.all([
              window.storage.get(KEY),
              window.storage.get("rorbit-intro-seen"),
            ]);
            if (nr) setNodes(JSON.parse(nr.value));
            if (!ir) setShowIntro(true);
          } catch { setShowIntro(true); }
        })();
      } else {
        const saved = localStorage.getItem(KEY);
        if (saved) setNodes(JSON.parse(saved));
        if (!localStorage.getItem("rorbit-intro-seen")) setShowIntro(true);
      }
    } catch { setShowIntro(true); }
  }, []);

  // Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=DM+Mono:wght@400&family=Inter:wght@300;400;500&display=swap";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch {} };
  }, []);

  // Responsive
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Sphere background brightness — near-black → visible mid-grey
  useEffect(() => {
    const { renderer, starMat, wireMat } = three.current;
    if (!renderer) return;
    const t = sphereBrightness / 100;
    const bg = new THREE.Color(0x010306);
    bg.lerp(new THREE.Color(0x505060), t);
    renderer.setClearColor(bg, 1);
    if (starMat) {
      starMat.opacity     = 0.35 + t * 0.45;
      starMat.size        = 0.055 + t * 0.04;
      starMat.needsUpdate = true;
    }
    // Wireframe lifts so it stays readable against brighter background
    if (wireMat) {
      wireMat.opacity     = 0.12 + t * 0.28;
      wireMat.needsUpdate = true;
    }
  }, [sphereBrightness]);

  // Collapse mobile card when selection changes
  useEffect(() => { setMobileCardExpanded(false); }, [selected]);

  const persist = useCallback((n) => {
    try {
      if (IS_ARTIFACT) window.storage.set(KEY, JSON.stringify(n));
      else localStorage.setItem(KEY, JSON.stringify(n));
    } catch {}
  }, []);

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      if (IS_ARTIFACT) window.storage.set("rorbit-intro-seen", "1");
      else localStorage.setItem("rorbit-intro-seen", "1");
    } catch {}
  };

  const saveGithubToken = (t)  => { setGithubTokenState(t);  try { localStorage.setItem(GH_TOKEN, t);  } catch {} };
  const saveGistId      = (id) => { setGistIdState(id);       try { localStorage.setItem(GH_GIST,  id); } catch {} };

  const backupToGist = async () => {
    if (!githubToken.trim() || backingUp) return;
    setBackingUp(true); setBackupMsg("Backing up...");
    try {
      const body = { description:"ROrbit Knowledge Base", public:false,
        files:{ "rorbit-nodes.json":{ content: JSON.stringify({ nodes, savedAt: new Date().toISOString() }, null, 2) } } };
      const headers = { "Content-Type":"application/json", "Authorization":`token ${githubToken.trim()}` };
      const url    = gistId ? `https://api.github.com/gists/${gistId}` : "https://api.github.com/gists";
      const res    = await fetch(url, { method: gistId ? "PATCH" : "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      saveGistId(data.id);
      setBackupMsg(`✓ Backed up — ${nodes.length} nodes saved`);
    } catch (e) { setBackupMsg(`Failed (${e.message}). Check your token.`); }
    setBackingUp(false); setTimeout(() => setBackupMsg(""), 5000);
  };

  const restoreFromGist = async () => {
    if (!githubToken.trim() || !gistId || backingUp) return;
    if (!window.confirm("Replace current nodes with backup?")) return;
    setBackingUp(true); setBackupMsg("Restoring...");
    try {
      const res  = await fetch(`https://api.github.com/gists/${gistId}`, { headers:{ "Authorization":`token ${githubToken.trim()}` } });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const txt  = data.files["rorbit-nodes.json"]?.content;
      if (!txt) throw new Error("file not found");
      const { nodes: restored } = JSON.parse(txt);
      if (!Array.isArray(restored)) throw new Error("invalid format");
      setNodes(restored); persist(restored);
      setBackupMsg(`✓ Restored ${restored.length} nodes`);
    } catch (e) { setBackupMsg(`Failed (${e.message}). Check token + Gist ID.`); }
    setBackingUp(false); setTimeout(() => setBackupMsg(""), 5000);
  };


  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(nodes, null, 2)], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "rorbit-export.json"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── applyAppearances — material mutation only ─────────────────────────────
  const applyAppearances = useCallback(() => {
    const { meshMap } = three.current;
    if (!meshMap) return;
    const sel = selectedRef.current;
    const rev = reviewNodeRef.current;
    const hi  = highlightedRef.current;
    const ac  = activeCategoryRef.current;
    Object.entries(meshMap).forEach(([nodeId, { ng, core, glow, category }]) => {
      const isSel = sel?.id === nodeId || rev?.id === nodeId;
      const isHi  = hi.includes(nodeId);
      const isDim = ac !== null && category !== ac;
      if (!newNodeAnim.current || newNodeAnim.current.id !== nodeId)
        ng.scale.setScalar(isSel ? 1.45 : 1);
      core.material.transparent = isDim;
      core.material.opacity     = isDim ? 0 : 1;
      core.material.needsUpdate = true;
      glow.material.opacity     = isDim ? 0 : isSel ? 0.40 : isHi ? 0.28 : 0.15;
      glow.material.needsUpdate = true;
    });
    three.current.allConnLines?.forEach(ln => {
      ln.visible = ac === null || ln.userData.catA === ac || ln.userData.catB === ac;
    });
  }, []);

  // ── Three.js init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x010306, 1);
    el.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    const wireMat = new THREE.MeshBasicMaterial({ color:0x0d2a40, wireframe:true, transparent:true, opacity:0.12 });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(R, 28, 28), wireMat));
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.18, 24, 24),
      new THREE.MeshBasicMaterial({ color:0x002a45, transparent:true, opacity:0.07, side:THREE.BackSide })
    ));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R - 0.01, R + 0.015, 80),
      new THREE.MeshBasicMaterial({ color:0x0d3a55, transparent:true, opacity:0.2, side:THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2; group.add(ring);

    const sArr = new Float32Array(2000 * 3);
    for (let i = 0; i < sArr.length; i++) sArr[i] = (Math.random() - 0.5) * 70;
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sArr, 3));
    const starMat = new THREE.PointsMaterial({ color:0xffffff, size:0.055, transparent:true, opacity:0.35 });
    scene.add(new THREE.Points(sGeo, starMat));

    const raycaster = new THREE.Raycaster();
    let dragging = false, autoSpin = true, spinTimer = null;
    let mdPos = { x:0, y:0 }, prev = { x:0, y:0 };
    const resumeSpin = () => { clearTimeout(spinTimer); spinTimer = setTimeout(() => autoSpin = true, 2500); };

    const onMD = (e) => { dragging = true; autoSpin = false; mdPos = prev = { x:e.clientX, y:e.clientY }; };
    const onMM = (e) => {
      if (!dragging) return;
      group.quaternion.premultiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler((e.clientY - prev.y) * 0.004, (e.clientX - prev.x) * 0.004, 0)
      ));
      prev = { x:e.clientX, y:e.clientY };
    };
    const onMU = () => { dragging = false; resumeSpin(); };
    const onClick = (e) => {
      if (Math.hypot(e.clientX - mdPos.x, e.clientY - mdPos.y) > 8) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        camera
      );
      const hits = raycaster.intersectObjects(three.current.clickables ?? []);
      if (hits.length) {
        const nd = nodesRef.current.find(n => n.id === hits[0].object.userData.nodeId) ?? null;
        setSelected(p => p?.id === nd?.id ? null : nd);
      } else setSelected(null);
    };
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(3.5, Math.min(12, camera.position.z + e.deltaY * 0.012));
    };
    const onTS = (e) => {
      if (e.touches.length === 1) { dragging = true; autoSpin = false; mdPos = prev = { x:e.touches[0].clientX, y:e.touches[0].clientY }; }
    };
    let lastPinchDist = null;
    const onTM = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinchDist !== null) camera.position.z = Math.max(3.5, Math.min(12, camera.position.z + (lastPinchDist - dist) * 0.025));
        lastPinchDist = dist; e.preventDefault(); return;
      }
      lastPinchDist = null;
      if (!dragging) return;
      group.quaternion.premultiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler((e.touches[0].clientY - prev.y) * 0.004, (e.touches[0].clientX - prev.x) * 0.004, 0)
      ));
      prev = { x:e.touches[0].clientX, y:e.touches[0].clientY }; e.preventDefault();
    };
    const onTE = () => { dragging = false; lastPinchDist = null; resumeSpin(); };

    const d = renderer.domElement;
    d.addEventListener("mousedown",  onMD); d.addEventListener("mousemove",  onMM);
    d.addEventListener("mouseup",    onMU); d.addEventListener("click",      onClick);
    d.addEventListener("wheel",      onWheel, { passive:false });
    d.addEventListener("touchstart", onTS,    { passive:false });
    d.addEventListener("touchmove",  onTM,    { passive:false });
    d.addEventListener("touchend",   onTE);

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    let raf;
    (function animate() {
      raf = requestAnimationFrame(animate);
      if (autoSpin && !dragging) group.quaternion.premultiply(SPIN_Q);
      const anim = newNodeAnim.current;
      if (anim?.startTime != null) {
        const t  = Math.min((performance.now() - anim.startTime) / 650, 1);
        const e  = easeOut(t);
        const md = three.current.meshMap?.[anim.id];
        if (md) {
          md.ng.scale.setScalar(e);
          md.glow.material.opacity     = e * 0.15 + (1 - e) * 0.55;
          md.glow.material.needsUpdate = true;
        }
        if (t >= 1) { if (md) { md.glow.material.opacity = 0.15; md.glow.material.needsUpdate = true; } newNodeAnim.current = null; }
      }
      renderer.render(scene, camera);
    })();

    three.current = { camera, renderer, group, clickables:[], nodeGroups:[], allConnLines:[], meshMap:{}, starMat, wireMat };

    return () => {
      cancelAnimationFrame(raf); clearTimeout(spinTimer);
      d.removeEventListener("mousedown",  onMD); d.removeEventListener("mousemove",  onMM);
      d.removeEventListener("mouseup",    onMU); d.removeEventListener("click",      onClick);
      d.removeEventListener("wheel",      onWheel);
      d.removeEventListener("touchstart", onTS); d.removeEventListener("touchmove",  onTM); d.removeEventListener("touchend", onTE);
      window.removeEventListener("resize", onResize);
      if (el.contains(d)) el.removeChild(d); renderer.dispose();
    };
  }, []);

  // ── Effect 1: Full rebuild — only when nodes change ───────────────────────
  useEffect(() => {
    const { group, nodeGroups, allConnLines } = three.current;
    if (!group) return;
    (nodeGroups   ?? []).forEach(g => group.remove(g));
    (allConnLines ?? []).forEach(l => group.remove(l));

    const meshMap = {}, newGroups = [], newConnLines = [], clicks = [];

    // Ghost nodes when sphere is empty — so it never looks barren
    if (nodes.length === 0) {
      GHOST_POSITIONS.forEach((gp, i) => {
        const col = new THREE.Color(CATEGORIES[i % CATEGORIES.length].color);
        const gm  = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.08 }));
        const gg  = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.04 }));
        const ng  = new THREE.Group(); ng.add(gm); ng.add(gg);
        const p   = toXYZ(gp.theta, gp.phi); ng.position.set(p.x, p.y, p.z);
        group.add(ng); newGroups.push(ng);
      });
    }

    nodes.forEach(node => {
      const c   = getcat(node.category);
      const pos = toXYZ(node.position.theta, node.position.phi);
      const col = new THREE.Color(c.color);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 14, 14),
        new THREE.MeshBasicMaterial({ color:col })
      );
      core.userData.nodeId = node.id;

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 14, 14),
        new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.15 })
      );
      glow.userData.nodeId = node.id;

      // Larger invisible hit sphere — improves tap accuracy on mobile
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 6, 6),
        new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false, colorWrite:false })
      );
      hit.userData.nodeId = node.id;
      clicks.push(hit, core, glow);

      const ng = new THREE.Group();
      ng.add(core); ng.add(glow); ng.add(hit);
      ng.position.set(pos.x, pos.y, pos.z);
      group.add(ng); newGroups.push(ng);
      meshMap[node.id] = { ng, core, glow, category:node.category };
    });

    // Semantic connection lines
    const drawnPairs = new Set();
    const nodeMap    = Object.fromEntries(nodes.map(n => [n.id, n]));
    nodes.forEach(node => {
      (node.connections ?? []).forEach(connId => {
        const pk = [node.id, connId].sort().join("|");
        if (drawnPairs.has(pk)) return;
        drawnPairs.add(pk);
        const target = nodeMap[connId];
        if (!target) return;
        const sameCat = node.category === target.category;
        const pa = toXYZ(node.position.theta,   node.position.phi);
        const pb = toXYZ(target.position.theta, target.position.phi);
        const ln = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(pa.x, pa.y, pa.z),
            new THREE.Vector3(pb.x, pb.y, pb.z),
          ]),
          new THREE.LineBasicMaterial({
            color: sameCat ? new THREE.Color(getcat(node.category).color) : new THREE.Color(0x8aaac0),
            transparent:true, opacity: sameCat ? 0.35 : 0.22,
          })
        );
        ln.userData.catA = node.category; ln.userData.catB = target.category;
        group.add(ln); newConnLines.push(ln);
      });
    });

    three.current.meshMap      = meshMap;
    three.current.nodeGroups   = newGroups;
    three.current.allConnLines = newConnLines;
    three.current.clickables   = clicks;

    if (newNodeAnim.current && newNodeAnim.current.startTime == null) {
      const md = meshMap[newNodeAnim.current.id];
      if (md) { md.ng.scale.setScalar(0); newNodeAnim.current.startTime = performance.now(); }
    }
    applyAppearances();
  }, [nodes, applyAppearances]);

  // ── Effect 2: Appearances only ────────────────────────────────────────────
  useEffect(() => { applyAppearances(); }, [selected, reviewNode, highlighted, activeCategory, applyAppearances]);

  // ── API: Add ──────────────────────────────────────────────────────────────
  const addThought = async (mode = addMode) => {
    if (!input.trim() || adding) return;
    setAdding(true); setAddMode(mode);
    try {
      const existingCtx = nodes.length > 0
        ? `\n\nExisting nodes — add to "connections" ONLY if there is a clear, unambiguous conceptual link. Omit weak or superficial ones. Empty array if nothing qualifies:\n${
            nodes.slice(-40).map(n => `[${n.id}] ${n.title} (${n.category}): ${n.insight}`).join("\n")
          }`
        : "";

      const exampleNote = exampleInput.trim()
        ? `\nExample provided by user: "${exampleInput.trim()}"`
        : "";

      const insightInstruction = mode === "keep"
        ? `For "insight": correct ONLY grammar and spelling. Preserve the user's exact words, substance, and phrasing as closely as possible — do NOT rephrase, synthesize, or rewrite.`
        : `For "insight": distill the core idea into 1-2 clear, precise sentences.`;

      const exampleInstruction = exampleInput.trim()
        ? (mode === "keep"
            ? `For "example": correct only grammar and spelling, preserve exactly as written.`
            : `For "example": lightly clarify for readability if needed, preserve the substance.`)
        : `For "example": return null.`;

      const res = await fetch(API_ENDPOINT, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:MODEL, max_tokens:800,
          system:"Knowledge graph classifier. Return ONLY valid JSON. No markdown.",
          messages:[{ role:"user", content:
            `Thought: "${input}"${exampleNote}\nCategories: ${CATEGORIES.map(c => c.name).join(", ")}${existingCtx}\n\n${insightInstruction}\n${exampleInstruction}\n\nReturn JSON:\n{"title":"4-7 word title","insight":"see instruction above","example":null,"category":"exact category name","tags":["2-4 tags"],"connections":["nodeId — max 3, genuine only, else empty"]}`
          }]
        })
      });
      const data = await res.json();
      const p    = JSON.parse((data.content?.find(b => b.type==="text")?.text ?? "{}").replace(/```json|```/g,"").trim());
      const validIds = new Set(nodes.map(n => n.id));
      const node = {
        id:`n${Date.now()}`, rawInput:input,
        title:      p.title   ?? "Untitled",
        insight:    p.insight ?? input,
        example:    p.example ?? (exampleInput.trim() || null),
        category:   CATEGORIES.find(c => c.name===p.category) ? p.category : CATEGORIES[0].name,
        tags:       p.tags ?? [],
        connections: (p.connections ?? []).filter(id => validIds.has(id)),
        position:   rndpos(),
        createdAt:  new Date().toISOString(),
        addMode:    mode,
      };
      newNodeAnim.current = { id:node.id, startTime:null };
      const next = [...nodes, node];
      setNodes(next); persist(next); setInput(""); setExampleInput("");
      setLastAdded({ title:node.title, category:node.category });
    } catch { /* silent fail */ }
    setAdding(false);
  };

  // ── API: Query ────────────────────────────────────────────────────────────
  const doQuery = async () => {
    if (!queryText.trim() || querying || !nodes.length) return;
    setQuerying(true); setSynthesis(""); setHighlighted([]);
    try {
      const ctx = nodes.map(n => `[${n.id}] ${n.title} — ${n.category} — ${n.insight}`).join("\n");
      const res = await fetch(API_ENDPOINT, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:MODEL, max_tokens:600,
          system:"Knowledge graph search. Return ONLY valid JSON.",
          messages:[{ role:"user", content:
            `Question: "${queryText}"\n\nNodes:\n${ctx}\n\nReturn JSON:\n{"relevant_ids":["up to 5 node IDs"],"synthesis":"2-3 sentence synthesis"}`
          }]
        })
      });
      const data = await res.json();
      const p    = JSON.parse((data.content?.find(b => b.type==="text")?.text ?? "{}").replace(/```json|```/g,"").trim());
      setHighlighted(p.relevant_ids ?? []); setSynthesis(p.synthesis ?? "");
    } catch { /* silent fail */ }
    setQuerying(false);
  };

  // ── API: Challenge — weighted toward least-recently-challenged ────────────
  const challengeMe = async () => {
    if (!nodes.length) return;
    // Sort ascending by lastChallenged: null (never) first, then oldest
    const sorted = [...nodes].sort((a, b) => {
      const ta = a.lastChallenged ? new Date(a.lastChallenged).getTime() : 0;
      const tb = b.lastChallenged ? new Date(b.lastChallenged).getTime() : 0;
      return ta - tb;
    });
    const pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.6)));
    const rnd  = pool[Math.floor(Math.random() * pool.length)];

    // Stamp lastChallenged
    const now   = new Date().toISOString();
    const stamped = nodes.map(n => n.id === rnd.id ? { ...n, lastChallenged:now } : n);
    setNodes(stamped); persist(stamped);

    setReviewNode(rnd); setSelected(rnd); setChallenge(""); setEditing(false); setChallenging(true);
    try {
      const res = await fetch(API_ENDPOINT, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:MODEL, max_tokens:250,
          system:"Generate one sharp, thought-provoking question. Return ONLY the question.",
          messages:[{ role:"user", content:
            `Concept: "${rnd.title}" — ${rnd.insight}\nCategory: ${rnd.category}\n\nAsk one pointed question that challenges assumptions or demands deeper understanding.`
          }]
        })
      });
      const data = await res.json();
      setChallenge(data.content?.find(b => b.type==="text")?.text?.trim() ?? "");
    } catch { setChallenge("Error generating question."); }
    setChallenging(false);
  };

  const openEditFor = (node) => {
    setReviewNode(node); setSelected(node);
    setEditData({ title:node.title, insight:node.insight, example:node.example||"", category:node.category, tags:node.tags.join(", ") });
    setEditing(true); setPanel("explore");
  };

  const saveEdit = () => {
    if (!reviewNode) return;
    const updated = { ...reviewNode,
      title:    editData.title.trim()   || reviewNode.title,
      insight:  editData.insight.trim() || reviewNode.insight,
      example:  editData.example?.trim() || null,
      category: CATEGORIES.find(c => c.name===editData.category) ? editData.category : reviewNode.category,
      tags:     editData.tags.split(",").map(t => t.trim()).filter(Boolean),
    };
    const next = nodes.map(n => n.id===reviewNode.id ? updated : n);
    setNodes(next); persist(next); setReviewNode(updated); setSelected(updated); setEditing(false);
  };
  const deleteNode = (id) => {
    const next = nodes.filter(n => n.id !== id);
    setNodes(next); persist(next);
    if (reviewNode?.id === id) setReviewNode(null);
    if (selected?.id  === id) setSelected(null);
    setEditing(false);
  };

  // ── API: Recommendations ──────────────────────────────────────────────────
  const getRecs = async () => {
    if (!nodes.length || loadingRecs) return;
    setLoadingRecs(true); setRecs(null);
    try {
      const summary = nodes.map(n => `${n.title} [${n.category}]: ${n.insight}`).join("\n");
      const res = await fetch(API_ENDPOINT, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:MODEL, max_tokens:1200,
          system:"You are a knowledge curator. Return ONLY valid JSON.",
          messages:[{ role:"user", content:
            `Based on this knowledge base, recommend resources that genuinely extend or challenge this thinking.\n\nNodes:\n${summary}\n\nReturn JSON:\n{"books":[{"title":"","author":"","reason":""}],"podcasts":[{"title":"","host":"","reason":""}],"videos":[{"title":"","creator":"","reason":""}]}\n\nExactly 3 per array. Be specific.`
          }]
        })
      });
      const data = await res.json();
      const p    = JSON.parse((data.content?.find(b => b.type==="text")?.text ?? "{}").replace(/```json|```/g,"").trim());
      setRecs(p);
    } catch { /* silent fail */ }
    setLoadingRecs(false);
  };

  // ── Style helpers ─────────────────────────────────────────────────────────
  const taBase    = { width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`, borderRadius:"6px", color:T.text, padding:"10px 12px", fontSize:"13px", fontFamily:sans, lineHeight:1.65, outline:"none", boxSizing:"border-box" };
  const ta        = { ...taBase, resize:"vertical" };
  const inp       = { ...taBase, resize:"none" };
  const aBtn      = (on, col) => ({ width:"100%", padding:"9px", background:"none", border:`1px solid ${on ? col+"66" : T.inputBorder}`, borderRadius:"6px", color:on ? col : T.textDim, fontSize:"11px", fontWeight:600, letterSpacing:"2px", fontFamily:mono, cursor:on ? "pointer" : "not-allowed" });
  const lbl       = { fontSize:"10px", color:T.text, fontWeight:700, letterSpacing:"2px", marginBottom:"8px", fontFamily:mono };
  const dividerEl = <div style={{ borderTop:`1px solid ${T.divider}`, margin:"18px 0" }} />;

  const selCat = selected   ? getcat(selected.category)   : null;
  const rvCat  = reviewNode ? getcat(reviewNode.category) : null;

  // Connected node titles — used in detail cards
  const ExampleBlock = ({ nodeObj }) => {
    if (!nodeObj?.example) return null;
    return (
      <div style={{ marginTop:"10px", padding:"9px 11px", background: isLight ? "#e8f4ff" : "#071e35", border:`1px solid ${isLight ? "#b0c8da" : "#1a3a55"}`, borderRadius:"6px" }}>
        <div style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, letterSpacing:"2px", marginBottom:"5px" }}>EXAMPLE</div>
        <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.75, fontStyle:"italic" }}>{nodeObj.example}</div>
      </div>
    );
  };

  const ConnectedNodes = ({ nodeObj }) => {
    if (!nodeObj?.connections?.length) return null;
    const connected = nodeObj.connections.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if (!connected.length) return null;
    return (
      <div style={{ marginTop:"10px" }}>
        <div style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, letterSpacing:"2px", marginBottom:"6px" }}>CONNECTED TO</div>
        {connected.map(cn => {
          const cc = getcat(cn.category);
          return (
            <div key={cn.id} style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" }}>
              <div style={{ width:"4px", height:"4px", borderRadius:"50%", background:cc.color, flexShrink:0 }} />
              <span style={{ fontSize:"11px", color:T.textMuted }}>{cn.title}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const filteredNodes = nodes.filter(n =>
    !nodeSearch.trim() ||
    n.title.toLowerCase().includes(nodeSearch.toLowerCase()) ||
    n.category.toLowerCase().includes(nodeSearch.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(nodeSearch.toLowerCase()))
  );

  return (
    <div style={{ width:"100%", height:"100vh", background:T.appBg, display:"flex", flexDirection:"column", color:T.text, overflow:"hidden", fontFamily:sans, transition:"background 0.3s" }}>
      <style>{`
        .rorbit-panel textarea::placeholder,
        .rorbit-panel input::placeholder { color: ${isLight ? "rgba(8,15,24,0.4)" : "rgba(216,238,248,0.5)"}; }
        .rorbit-panel select option { background: ${T.inputBg}; color: ${T.text}; }
      `}</style>

      {/* Header */}
      <div style={{ padding:"10px 18px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, background:T.panelBg }}>
        <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
          <span style={{ fontFamily:orbit, fontSize:"14px", fontWeight:900, letterSpacing:"5px", color:T.accent }}>RORBIT</span>
          {!isMobile && <span style={{ fontFamily:mono, fontSize:"9px", color:T.textDim, letterSpacing:"3px" }}>KNOWLEDGE SPHERE</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          {/* Sphere brightness — dark mode only */}
          {!isLight && (
            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, letterSpacing:"1px" }}>☽</span>
              <input
                type="range" min="0" max="100" value={sphereBrightness}
                onChange={e => setSphereBrightness(Number(e.target.value))}
                style={{ width: isMobile ? "60px" : "72px", accentColor:T.accent, cursor:"pointer", opacity:0.8 }}
              />
              <span style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, letterSpacing:"1px" }}>☀</span>
            </div>
          )}
          <span style={{ fontFamily:mono, fontSize:"9px", color:T.textDim, letterSpacing:"2px" }}>{nodes.length} NODE{nodes.length!==1?"S":""}</span>
          <button onClick={() => setIsLight(l => !l)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:"20px", padding:"4px 12px", fontFamily:mono, fontSize:"9px", letterSpacing:"1.5px", color:T.textMuted, cursor:"pointer" }}>
            {isLight ? "◑ DARK" : "◐ LIGHT"}
          </button>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden", flexDirection:isMobile ? "column" : "row" }}>

        {/* Sphere */}
        <div ref={mountRef} style={{ position:"relative", flex:isMobile ? "none" : 1, height:isMobile ? "46vh" : "auto", minHeight:isMobile ? "200px" : "auto" }}>
          <div style={{ position:"absolute", top:10, right:10, fontFamily:mono, fontSize:"9px", color:"#1a3a52", letterSpacing:"1px", pointerEvents:"none" }}>
            {isMobile ? "pinch to zoom" : "scroll to zoom"}
          </div>
          {activeCategory && (
            <div style={{ position:"absolute", top:10, left:10, display:"flex", alignItems:"center", gap:"8px", background:T.selBg, border:`1px solid ${getcat(activeCategory).color}40`, borderRadius:"20px", padding:"5px 12px" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:getcat(activeCategory).color, boxShadow:`0 0 6px ${getcat(activeCategory).color}` }} />
              <span style={{ fontFamily:mono, fontSize:"9px", color:getcat(activeCategory).color, letterSpacing:"1.5px" }}>{activeCategory.toUpperCase()}</span>
              <button onClick={() => setActiveCategory(null)} style={{ background:"none", border:"none", fontFamily:mono, color:T.textDim, fontSize:"10px", cursor:"pointer", padding:"0 0 0 4px" }}>✕</button>
            </div>
          )}
          {highlighted.length > 0 && !activeCategory && (
            <div style={{ position:"absolute", top:10, left:10, background:T.selBg, border:`1px solid ${T.accentG}30`, borderRadius:"20px", padding:"5px 12px" }}>
              <span style={{ fontFamily:mono, fontSize:"9px", color:T.accentG, letterSpacing:"2px" }}>{highlighted.length} NODES ACTIVE</span>
            </div>
          )}

          {/* Desktop node card */}
          {selected && selCat && !isMobile && (
            <div style={{ position:"absolute", bottom:18, left:18, maxWidth:"260px", background:T.selBg, border:`1px solid ${selCat.color}35`, borderRadius:"8px", padding:"14px 16px" }}>
              <div style={{ fontFamily:mono, fontSize:"8px", color:selCat.color, letterSpacing:"2.5px", marginBottom:"6px" }}>{selected.category.toUpperCase()}</div>
              <div style={{ fontSize:"13px", fontWeight:500, color:T.text, marginBottom:"7px", lineHeight:1.4 }}>{selected.title}</div>
              <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.75 }}>{selected.insight}</div>
              <ExampleBlock nodeObj={selected} />
              <ConnectedNodes nodeObj={selected} />
              {selected.tags?.length > 0 && (
                <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginTop:"10px" }}>
                  {selected.tags.map(t => <span key={t} style={{ fontFamily:mono, fontSize:"9px", background:T.tagBg, border:`1px solid ${T.tagBorder}`, padding:"2px 8px", borderRadius:"20px", color:T.tagText }}>#{t}</span>)}
                </div>
              )}
              <button onClick={() => setSelected(null)} style={{ marginTop:"10px", background:"none", border:"none", fontFamily:mono, color:T.textDim, fontSize:"9px", cursor:"pointer", padding:0, letterSpacing:"1.5px" }}>✕ DISMISS</button>
            </div>
          )}

          {/* Mobile node card — compact pill, tap to expand */}
          {selected && selCat && isMobile && (
            <div onClick={() => setMobileCardExpanded(e => !e)}
              style={{ position:"absolute", bottom:0, left:0, right:0, background:T.selBg, borderTop:`1px solid ${selCat.color}35`, borderRadius:"10px 10px 0 0", padding:mobileCardExpanded ? "14px 16px" : "10px 14px", cursor:"pointer", transition:"padding 0.18s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:selCat.color, boxShadow:`0 0 6px ${selCat.color}`, flexShrink:0 }} />
                <div style={{ fontSize:"13px", fontWeight:500, color:T.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:mobileCardExpanded ? "normal" : "nowrap" }}>{selected.title}</div>
                <span style={{ fontFamily:mono, fontSize:"9px", color:T.textDim }}>{mobileCardExpanded ? "▼" : "▲"}</span>
                <button onClick={(e) => { e.stopPropagation(); setSelected(null); }} style={{ background:"none", border:"none", fontFamily:mono, color:T.textDim, fontSize:"12px", cursor:"pointer", padding:"0 0 0 6px" }}>✕</button>
              </div>
              {mobileCardExpanded && (
                <div style={{ marginTop:"10px" }}>
                  <div style={{ fontFamily:mono, fontSize:"8px", color:selCat.color, letterSpacing:"2px", marginBottom:"6px" }}>{selected.category.toUpperCase()}</div>
                  <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.75 }}>{selected.insight}</div>
                  <ExampleBlock nodeObj={selected} />
                  <ConnectedNodes nodeObj={selected} />
                  {selected.tags?.length > 0 && (
                    <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginTop:"8px" }}>
                      {selected.tags.map(t => <span key={t} style={{ fontFamily:mono, fontSize:"9px", background:T.tagBg, border:`1px solid ${T.tagBorder}`, padding:"2px 7px", borderRadius:"20px", color:T.tagText }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* First-run overlay */}
          {showIntro && (
            <div style={{ position:"absolute", inset:0, background:"rgba(1,3,6,0.93)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}>
              <div style={{ maxWidth:"320px", padding:"36px 32px", textAlign:"center" }}>
                <div style={{ fontFamily:orbit, fontSize:"22px", fontWeight:900, color:T.accent, letterSpacing:"5px", marginBottom:"24px" }}>RORBIT</div>
                <p style={{ fontSize:"14px", color:"#edf4fa", lineHeight:1.8, marginBottom:"12px" }}>A personal knowledge sphere that grows with your thinking.</p>
                <p style={{ fontSize:"13px", color:"#9dbdd4", lineHeight:1.8, marginBottom:"12px" }}>Add any concept, quote, or idea. AI classifies it, connects it to what you already know, and places it on the sphere.</p>
                <p style={{ fontSize:"13px", color:"#9dbdd4", lineHeight:1.8, marginBottom:"32px" }}>Query your sphere when facing a problem. Challenge your thinking with random nodes. Watch your knowledge map grow.</p>
                <button onClick={dismissIntro} style={{ padding:"11px 32px", background:"none", border:`1px solid ${T.accent}70`, borderRadius:"6px", fontFamily:mono, fontSize:"11px", letterSpacing:"3px", color:T.accent, cursor:"pointer" }}>START BUILDING</button>
              </div>
            </div>
          )}
        </div>

        {/* Panel */}
        <div className="rorbit-panel" style={{ width:isMobile ? "100%" : "272px", borderLeft:isMobile ? "none" : `1px solid ${T.border}`, borderTop:isMobile ? `1px solid ${T.border}` : "none", display:"flex", flexDirection:"column", background:T.panelBg, flexShrink:0, flex:isMobile ? 1 : "none", overflow:isMobile ? "hidden" : "visible", transition:"background 0.3s" }}>

          {/* Tabs */}
          <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            {[["capture","CAPTURE"],["explore","EXPLORE"],["library","LIBRARY"]].map(([id, label]) => (
              <button key={id} onClick={() => setPanel(id)} style={{ flex:1, padding:"11px 4px", background:"none", border:"none", borderBottom:`2px solid ${panel===id ? T.accent : "transparent"}`, color:panel===id ? T.accent : T.text, fontFamily:mono, fontSize:"9px", fontWeight:panel===id ? 700 : 500, letterSpacing:"1.5px", cursor:"pointer", opacity: panel===id ? 1 : 0.65 }}>{label}</button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"16px 14px" }}>

            {/* CAPTURE */}
            {panel==="capture" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                <div style={lbl}>CAPTURE A THOUGHT</div>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => (e.metaKey||e.ctrlKey) && e.key==="Enter" && addThought()}
                  placeholder="A concept, principle, quote, or observation..."
                  style={{ ...ta, minHeight:"100px" }} />

                {/* Optional example */}
                <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                  <div style={{ ...lbl, marginBottom:0 }}>EXAMPLE</div>
                  <span style={{ fontFamily:mono, fontSize:"8px", color:T.textDim }}>(optional)</span>
                </div>
                <textarea value={exampleInput} onChange={e => setExampleInput(e.target.value)}
                  placeholder="A real-world instance, analogy, or illustration of this idea..."
                  style={{ ...ta, minHeight:"70px" }} />

                {/* Two add buttons */}
                <div style={{ display:"flex", gap:"8px", marginTop:"2px" }}>
                  <button onClick={() => addThought("keep")} disabled={adding||!input.trim()}
                    style={{ ...aBtn(!!input.trim()&&!adding, T.accent), flex:1, fontSize:"9px", letterSpacing:"1px" }}>
                    {adding && addMode==="keep" ? "PROCESSING..." : "✎ KEEP MY WORDS"}
                  </button>
                  <button onClick={() => addThought("enhance")} disabled={adding||!input.trim()}
                    style={{ ...aBtn(!!input.trim()&&!adding, T.accentG), flex:1, fontSize:"9px", letterSpacing:"1px" }}>
                    {adding && addMode==="enhance" ? "PROCESSING..." : "✦ AI ENHANCE"}
                  </button>
                </div>
                <div style={{ fontFamily:mono, fontSize:"8px", color:T.textDim }}>
                  <span style={{ color:T.accent }}>✎ Keep</span> — grammar fixes only &nbsp;·&nbsp; <span style={{ color:T.accentG }}>✦ Enhance</span> — AI synthesises
                </div>

                {lastAdded && (
                  <div style={{ background:T.nodeBg, border:`1px solid ${T.border}`, borderRadius:"6px", padding:"9px 12px", display:"flex", alignItems:"center", gap:"9px", marginTop:"2px" }}>
                    <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:getcat(lastAdded.category).color, boxShadow:`0 0 5px ${getcat(lastAdded.category).color}`, flexShrink:0 }} />
                    <div>
                      <div style={{ fontFamily:mono, fontSize:"7px", color:getcat(lastAdded.category).color, letterSpacing:"1.5px", marginBottom:"2px" }}>LAST ADDED</div>
                      <div style={{ fontSize:"12px", color:T.textMuted }}>{lastAdded.title}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EXPLORE */}
            {panel==="explore" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                <div style={lbl}>QUERY YOUR SPHERE</div>
                <textarea value={queryText} onChange={e => setQueryText(e.target.value)}
                  placeholder="Describe a problem or challenge..."
                  style={{ ...ta, minHeight:"80px" }} />
                <button onClick={doQuery} disabled={querying||!queryText.trim()||!nodes.length} style={aBtn(!!queryText.trim()&&!querying&&nodes.length>0, T.accentG)}>
                  {querying ? "SEARCHING..." : "SEARCH SPHERE"}
                </button>
                {synthesis && (
                  <div style={{ background:T.synBg, border:`1px solid ${T.border}`, borderRadius:"6px", padding:"12px" }}>
                    <div style={lbl}>SYNTHESIS</div>
                    <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.8 }}>{synthesis}</div>
                    <div style={{ fontFamily:mono, fontSize:"9px", color:T.textDim, marginTop:"6px" }}>{highlighted.length} nodes highlighted on sphere</div>
                    <button onClick={() => { setHighlighted([]); setSynthesis(""); setQueryText(""); }}
                      style={{ marginTop:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:"4px", fontFamily:mono, color:T.textDim, fontSize:"8px", cursor:"pointer", padding:"3px 10px", letterSpacing:"1px" }}>CLEAR</button>
                  </div>
                )}
                {!nodes.length && <div style={{ fontSize:"12px", color:T.textDim }}>Add nodes first.</div>}

                {dividerEl}

                <div style={lbl}>CHALLENGE YOUR THINKING</div>
                <button onClick={challengeMe} disabled={challenging||!nodes.length} style={aBtn(!challenging&&nodes.length>0, T.accent)}>
                  {challenging ? "THINKING..." : "↺ RANDOM NODE"}
                </button>

                {reviewNode && rvCat && !editing && (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginTop:"4px" }}>
                    <div style={{ background:T.nodeBg, border:`1px solid ${rvCat.color}30`, borderRadius:"8px", padding:"12px" }}>
                      <div style={{ fontFamily:mono, fontSize:"8px", color:rvCat.color, letterSpacing:"2px", marginBottom:"6px" }}>{reviewNode.category.toUpperCase()}</div>
                      <div style={{ fontSize:"13px", fontWeight:500, color:T.text, marginBottom:"6px", lineHeight:1.4 }}>{reviewNode.title}</div>
                      <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.75 }}>{reviewNode.insight}</div>
                      <ExampleBlock nodeObj={reviewNode} />
                      <ConnectedNodes nodeObj={reviewNode} />
                      {reviewNode.tags?.length > 0 && (
                        <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginTop:"8px" }}>
                          {reviewNode.tags.map(t => <span key={t} style={{ fontFamily:mono, fontSize:"9px", background:T.tagBg, border:`1px solid ${T.tagBorder}`, padding:"2px 7px", borderRadius:"20px", color:T.tagText }}>#{t}</span>)}
                        </div>
                      )}
                    </div>
                    {challenging && <div style={{ fontSize:"12px", color:T.textDim }}>Generating question...</div>}
                    {challenge && !challenging && (
                      <div style={{ background:T.challengeBg, border:`1px solid ${T.challengeBorder}`, borderRadius:"6px", padding:"12px" }}>
                        <div style={{ fontFamily:mono, fontSize:"8px", color:T.accent, letterSpacing:"2.5px", marginBottom:"8px" }}>CHALLENGE</div>
                        <div style={{ fontSize:"13px", color:T.text, lineHeight:1.8 }}>{challenge}</div>
                      </div>
                    )}
                    <button onClick={() => openEditFor(reviewNode)} style={{ ...aBtn(true, T.textMuted), fontSize:"9px" }}>✎ EDIT THIS NODE</button>
                  </div>
                )}

                {editing && reviewNode && (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px", marginTop:"4px" }}>
                    <div style={{ fontFamily:mono, fontSize:"8px", color:T.accent, letterSpacing:"2.5px" }}>EDITING NODE</div>
                    <div><div style={lbl}>TITLE</div><input value={editData.title} onChange={e => setEditData(d => ({ ...d, title:e.target.value }))} style={inp} /></div>
                    <div><div style={lbl}>INSIGHT</div><textarea value={editData.insight} onChange={e => setEditData(d => ({ ...d, insight:e.target.value }))} style={{ ...ta, minHeight:"70px" }} /></div>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"6px" }}>
                        <div style={{ ...lbl, marginBottom:0 }}>EXAMPLE</div>
                        <span style={{ fontFamily:mono, fontSize:"8px", color:T.textDim }}>(optional)</span>
                      </div>
                      <textarea value={editData.example||""} onChange={e => setEditData(d => ({ ...d, example:e.target.value }))}
                        placeholder="A real-world instance or illustration..."
                        style={{ ...ta, minHeight:"60px" }} />
                    </div>
                    <div>
                      <div style={lbl}>CATEGORY</div>
                      <select value={editData.category} onChange={e => setEditData(d => ({ ...d, category:e.target.value }))} style={{ ...inp, appearance:"none" }}>
                        {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div><div style={lbl}>TAGS (comma separated)</div><input value={editData.tags} onChange={e => setEditData(d => ({ ...d, tags:e.target.value }))} style={inp} /></div>
                    <div style={{ display:"flex", gap:"8px" }}>
                      <button onClick={saveEdit} style={{ flex:1, padding:"8px", background:"none", border:`1px solid ${T.accentG}50`, borderRadius:"6px", color:T.accentG, fontFamily:mono, fontSize:"9px", letterSpacing:"1.5px", cursor:"pointer" }}>SAVE</button>
                      <button onClick={() => setEditing(false)} style={{ flex:1, padding:"8px", background:"none", border:`1px solid ${T.border}`, borderRadius:"6px", color:T.textDim, fontFamily:mono, fontSize:"9px", letterSpacing:"1.5px", cursor:"pointer" }}>CANCEL</button>
                    </div>
                    <button onClick={() => deleteNode(reviewNode.id)} style={{ width:"100%", padding:"8px", background:"none", border:"1px solid #f8717130", borderRadius:"6px", color:"#f87171", fontFamily:mono, fontSize:"9px", letterSpacing:"1.5px", cursor:"pointer" }}>DELETE NODE</button>
                  </div>
                )}
              </div>
            )}

            {/* LIBRARY */}
            {panel==="library" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"0" }}>

                {/* Nodes section */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                  <div style={lbl}>{filteredNodes.length} NODES{nodeSearch ? " FOUND" : ""}</div>
                  {nodes.length > 0 && (
                    <button onClick={exportJSON} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:"4px", fontFamily:mono, fontSize:"8px", color:T.textDim, cursor:"pointer", padding:"3px 8px", letterSpacing:"1px" }}>↓ EXPORT</button>
                  )}
                </div>

                {nodes.length > 0 && (
                  <input
                    value={nodeSearch} onChange={e => setNodeSearch(e.target.value)}
                    placeholder="Search nodes..."
                    style={{ ...inp, marginBottom:"10px", fontSize:"12px", background:T.searchBg }}
                  />
                )}

                {!nodes.length && <div style={{ fontSize:"12px", color:T.textDim, marginBottom:"16px" }}>Empty. Start capturing thoughts.</div>}

                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {filteredNodes.reverse().map(n => {
                    const c = getcat(n.category);
                    return (
                      <div key={n.id} onClick={() => setSelected(p => p?.id===n.id ? null : n)}
                        style={{ padding:"9px 11px", background:T.nodeBg, border:`1px solid ${c.color}20`, borderRadius:"6px", cursor:"pointer" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ fontFamily:mono, fontSize:"8px", color:c.color, letterSpacing:"1.5px", marginBottom:"4px" }}>{n.category.toUpperCase()}</div>
                          <button onClick={(e) => { e.stopPropagation(); openEditFor(n); }}
                            style={{ background:"none", border:"none", fontFamily:mono, fontSize:"11px", color:T.textDim, cursor:"pointer", padding:"0 0 2px 6px", lineHeight:1 }}>✎</button>
                        </div>
                        <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.4 }}>{n.title}</div>
                        {n.connections?.length > 0 && (
                          <div style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, marginTop:"5px" }}>{n.connections.length} connection{n.connections.length!==1?"s":""}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {nodes.length > 0 && dividerEl}

                {/* Discover section */}
                {nodes.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <div style={lbl}>DISCOVER</div>
                      <span style={{ fontFamily:mono, fontSize:"8px", color:"#f472b6", border:"1px solid #f472b630", borderRadius:"4px", padding:"1px 6px", letterSpacing:"1px" }}>BETA</span>
                    </div>
                    <div style={{ fontSize:"12px", color:T.textMuted, lineHeight:1.7 }}>AI-curated books, podcasts and videos based on your sphere.</div>
                    <button onClick={getRecs} disabled={loadingRecs} style={aBtn(!loadingRecs, "#f472b6")}>
                      {loadingRecs ? "CURATING..." : "GET RECOMMENDATIONS"}
                    </button>
                    {recs && (
                      <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                        {[{key:"books",icon:"📖",sl:"BOOKS"},{key:"podcasts",icon:"🎙",sl:"PODCASTS"},{key:"videos",icon:"▶",sl:"VIDEOS"}].map(({ key, icon, sl }) => (
                          recs[key]?.length > 0 && (
                            <div key={key}>
                              <div style={{ fontFamily:mono, fontSize:"8px", color:T.textDim, letterSpacing:"2.5px", marginBottom:"8px" }}>{icon} {sl}</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                                {recs[key].map((item, i) => (
                                  <div key={i} style={{ background:T.nodeBg, border:`1px solid ${T.border}`, borderRadius:"6px", padding:"10px 11px" }}>
                                    <div style={{ fontSize:"12px", fontWeight:500, color:T.text, marginBottom:"3px" }}>{item.title}</div>
                                    <div style={{ fontFamily:mono, fontSize:"10px", color:T.accent, marginBottom:"5px" }}>{item.author||item.host||item.creator}</div>
                                    <div style={{ fontSize:"11px", color:T.textMuted, lineHeight:1.6 }}>{item.reason}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        ))}
                        <button onClick={() => setRecs(null)} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:"4px", fontFamily:mono, color:T.textDim, fontSize:"8px", cursor:"pointer", padding:"4px 10px", letterSpacing:"1px" }}>CLEAR</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Cloud Backup — always visible */}
                {dividerEl}
                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={lbl}>CLOUD BACKUP</div>
                    <button onClick={() => setShowBackup(b => !b)} style={{ background:"none", border:"none", fontFamily:mono, fontSize:"9px", color:T.textDim, cursor:"pointer", letterSpacing:"1px" }}>
                      {showBackup ? "▲ HIDE" : "▼ SETUP"}
                    </button>
                  </div>
                  {showBackup && (
                    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                      <div style={{ fontSize:"11px", color:T.textMuted, lineHeight:1.7 }}>
                        Saves your nodes to a private GitHub Gist. Get a token at{" "}
                        <a href="https://github.com/settings/tokens/new?scopes=gist" target="_blank" rel="noreferrer" style={{ color:T.accent, textDecoration:"none" }}>github.com/settings/tokens</a>
                        {" "}— tick only the <strong>gist</strong> scope.
                      </div>
                      <div>
                        <div style={lbl}>GITHUB TOKEN</div>
                        <input type="password" value={githubToken} onChange={e => saveGithubToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" style={{ ...inp, fontSize:"12px" }} />
                      </div>
                      <div>
                        <div style={lbl}>GIST ID <span style={{ color:T.textDim, fontWeight:400 }}>(auto-filled after first backup)</span></div>
                        <input value={gistId} onChange={e => saveGistId(e.target.value)} placeholder="Auto-filled after first backup" style={{ ...inp, fontSize:"12px" }} />
                      </div>
                      <div style={{ display:"flex", gap:"8px" }}>
                        <button onClick={backupToGist} disabled={backingUp || !githubToken.trim()}
                          style={{ ...aBtn(!!githubToken.trim() && !backingUp, T.accentG), flex:1, fontSize:"9px" }}>
                          {backingUp ? "..." : "↑ BACKUP"}
                        </button>
                        <button onClick={restoreFromGist} disabled={backingUp || !githubToken.trim() || !gistId}
                          style={{ ...aBtn(!!githubToken.trim() && !!gistId && !backingUp, T.textMuted), flex:1, fontSize:"9px" }}>
                          {backingUp ? "..." : "↓ RESTORE"}
                        </button>
                      </div>
                      {backupMsg && <div style={{ fontSize:"11px", color: backupMsg.startsWith("✓") ? T.accentG : "#f87171", fontFamily:mono }}>{backupMsg}</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Category legend */}
          <div style={{ padding:"12px 14px", borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ fontFamily:mono, fontSize:"7px", color:T.textDim, letterSpacing:"2.5px", marginBottom:"8px" }}>
              {activeCategory ? "CLICK TO CLEAR FILTER" : "CLICK TO FILTER"}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"5px" }}>
              {CATEGORIES.map(c => {
                const isActive = activeCategory === c.name;
                const isHov    = hoveredCat    === c.name;
                return (
                  <div key={c.name}
                    onClick={() => setActiveCategory(a => a===c.name ? null : c.name)}
                    onMouseEnter={() => setHoveredCat(c.name)}
                    onMouseLeave={() => setHoveredCat(null)}
                    style={{
                      display:"flex", alignItems:"center", gap:"5px",
                      padding:"4px 9px", borderRadius:"20px",
                      background: isActive ? `${c.color}22` : isHov ? `${c.color}14` : `${c.color}0a`,
                      border:`1px solid ${isActive ? c.color+"70" : isHov ? c.color+"40" : c.color+"25"}`,
                      cursor:"pointer",
                      transform: isHov ? "translateY(-2px)" : "translateY(0)",
                      transition:"transform 0.15s ease, background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      boxShadow: isActive ? `0 0 8px ${c.color}30` : isHov ? `0 2px 8px ${c.color}20` : "none",
                    }}>
                    <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:c.color, boxShadow:`0 0 ${isActive?6:4}px ${c.color}` }} />
                    <span style={{ fontFamily:mono, fontSize:"9px", color:isActive||isHov ? c.color : T.legendText, letterSpacing:"0.5px", transition:"color 0.15s" }}>
                      {c.name.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
