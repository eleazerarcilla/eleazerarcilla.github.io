/* Lanyard, real 3D renderer (three.js, self-hosted). */
import * as THREE from "../vendor/three.module.min.js";

export function createGL(host, api) {
    var canvas = document.createElement("canvas");
    canvas.id = "lanyard-gl";
    host.appendChild(canvas);
    var renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch (e) { canvas.remove(); return null; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(20, 1, 10, 6000);

    /* ---- studio environment: bright sky above, a dark horizon band, light ground, two softboxes ---- */
    (function () {
        var c = document.createElement("canvas"); c.width = 512; c.height = 256;
        var g = c.getContext("2d"); g.scale(0.5, 0.5);                  /* drawn in 1024x512 units; half the pixels makes the reflection map far cheaper to prefilter */
        var gr = g.createLinearGradient(0, 0, 0, 512);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, "#e3eaf7"); gr.addColorStop(0.44, "#7a859b");
        gr.addColorStop(0.5, "#2f3646"); gr.addColorStop(0.58, "#bcc7d8"); gr.addColorStop(1, "#f6f8fc");
        g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
        g.fillStyle = "#fff"; g.fillRect(120, 60, 250, 150);       /* softbox, upper left */
        g.fillStyle = "#fff"; g.fillRect(620, 100, 70, 170);
        g.fillStyle = "#06080c"; g.fillRect(480, 190, 110, 60);        /* strip light, right */
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(430, 40, 120, 40);
        /* what a front-facing surface sees: alternating light and dark panels, like a studio flag setup */
        var panels = [[560, 40, "#ffffff"], [610, 22, "#10141c"], [640, 70, "#e8eef9"], [712, 26, "#0b0e14"], [740, 80, "#ffffff"], [822, 30, "#1c222e"], [856, 60, "#cfd9ea"], [920, 24, "#0b0e14"]];
        panels.forEach(function (q) { g.fillStyle = q[2]; g.fillRect(q[0], 0, q[1], 512); });
        /* several separate light sources, as in a photographer's studio: slanted strip lights at different angles plus a big soft */
        function strip(cx, cy, w, h, ang, a) {
            g.save(); g.translate(cx, cy); g.rotate(ang); g.fillStyle = "rgba(255,255,255," + a + ")"; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
        }
        strip(640, 150, 300, 14, -0.9, 1); strip(700, 300, 360, 26, -0.9, 0.9); strip(790, 200, 260, 10, -0.9, 1);
        strip(860, 350, 320, 34, -0.9, 0.8); strip(740, 420, 220, 12, -0.9, 0.95);
        strip(700, 250, 520, 70, -0.9, 0.95); strip(880, 120, 420, 46, -0.9, 0.9);   /* broad window-like bands */
        g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(900, 60, 90, 260);                       /* soft panel, far side */
        g.fillStyle = "rgba(20,26,40,.85)"; g.fillRect(596, 240, 22, 190);                      /* a dark flag between lights */
        /* big soft glows: a rough surface reflects these as a broad, faded patch of light that drifts as it leans */
        [[860, 290, 190, 0.95], [650, 360, 160, 0.8], [770, 140, 140, 0.7]].forEach(function (b) {
            var rg = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
            rg.addColorStop(0, "rgba(255,255,255," + b[3] + ")"); rg.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = rg; g.fillRect(b[0] - b[2], b[1] - b[2], b[2] * 2, b[2] * 2);
        });
        var t = new THREE.CanvasTexture(c);
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        var pm = new THREE.PMREMGenerator(renderer);
        scene.environment = pm.fromEquirectangular(t).texture;
        t.dispose(); pm.dispose();
    })();
    var key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(-300, 500, 600); scene.add(key);
    /* Directional lights at different angles (point lights leave a round hot spot on the glossy face). */
    [[-300, 420, 520, 0xffffff, 0.55], [420, 300, 380, 0xdfe9ff, 0.4], [-120, -400, 460, 0xfff1de, 0.38], [380, -260, 300, 0xffffff, 0.34]].forEach(function (L) {
        var dl = new THREE.DirectionalLight(L[3], L[4]); dl.position.set(L[0], L[1], L[2]); scene.add(dl);
    });
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    /* ---- materials ---- */
    var steel = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: 1, roughness: 0.2, envMapIntensity: 0.95 });
    var steelDark = new THREE.MeshStandardMaterial({ color: 0x9aa3b3, metalness: 1, roughness: 0.34, envMapIntensity: 1.0 });
    var rimMat = new THREE.MeshStandardMaterial({ color: 0x808289, metalness: 1, roughness: 0.2, envMapIntensity: 1.15 });
    var darkPlateMat = new THREE.MeshStandardMaterial({ color: 0x6a6e78, metalness: 0.85, roughness: 0.36, envMapIntensity: 0.6 });
    var ringMat = new THREE.MeshStandardMaterial({ color: 0x808289, metalness: 1, roughness: 0.2, envMapIntensity: 1.15 });
    var plastic = new THREE.MeshPhysicalMaterial({ color: 0xd2d7e2, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 });

    /* woven ribbon texture comes from lanyard.js (single source) */
    var ribbonTex = new THREE.CanvasTexture(api.getRibbonTexture());
    ribbonTex.colorSpace = THREE.SRGBColorSpace;
    ribbonTex.wrapS = THREE.RepeatWrapping; ribbonTex.wrapT = THREE.ClampToEdgeWrapping;
    ribbonTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var bumpTex = ribbonTex.clone(); bumpTex.colorSpace = THREE.NoColorSpace; bumpTex.needsUpdate = true;
    var ribbonMat = new THREE.MeshStandardMaterial({
        map: ribbonTex, bumpMap: bumpTex, bumpScale: 3, color: 0x7a7c82,
        roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide
    });

    var built = { key: "" };
    var badge = new THREE.Group();          /* origin = badge's hanging point; y up, so the badge extends to -y */
    var rootG = new THREE.Group(); rootG.add(badge); scene.add(rootG);
    var clampG = new THREE.Group(); rootG.add(clampG);
    var ribbonMeshes = [null, null];
    var faceFront, faceBack, glowFront, glowBack, body, hardware = new THREE.Group();
    function makeGlow() {
        var c = document.createElement("canvas"); c.width = c.height = 256;
        var g = c.getContext("2d");
        g.translate(128, 128); g.rotate(0.62); g.scale(1, 0.42);               /* a slanted, elongated pool of light */
        var rg = g.createRadialGradient(0, 0, 0, 0, 0, 120);
        rg.addColorStop(0, "rgba(255,255,255,0.75)"); rg.addColorStop(0.45, "rgba(255,255,255,0.28)"); rg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = rg; g.fillRect(-128, -300, 256, 600);
        var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
    }
    var glowTex = makeGlow(), glowTexB = makeGlow();
    badge.add(hardware);

    function roundedShape(w, h, r, x0, y0) {
        var s = new THREE.Shape();
        s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
        s.lineTo(x0 + w, y0 + h - r); s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
        s.lineTo(x0 + r, y0 + h); s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
        s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
        return s;
    }

    function slotHole(hw, hh, cy) {
        var p = new THREE.Path(), r = hh / 2;
        p.moveTo(-hw + r, cy - r); p.lineTo(hw - r, cy - r); p.absarc(hw - r, cy, r, -Math.PI / 2, Math.PI / 2, false);
        p.lineTo(-hw + r, cy + r); p.absarc(-hw + r, cy, r, Math.PI / 2, Math.PI * 1.5, false);
        return p;
    }

    /* Slight cylindrical bow on the clear coat so lights sweep across the face as an angled band. */
    var bowMap = (function () {
        var n = 48, c = document.createElement("canvas"); c.width = c.height = n;
        var g = c.getContext("2d"), im = g.createImageData(n, n), d = im.data, i, j;
        for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
            var x = (i / (n - 1)) * 2 - 1, y = (j / (n - 1)) * 2 - 1, o = (j * n + i) * 4;
            var u = (x - y) / 2;                       /* bent along one diagonal only: a cylinder, so the highlight is an angled band, not a spot */
            d[o] = Math.round(127.5 + 127.5 * u * 0.3); d[o + 1] = Math.round(127.5 - 127.5 * u * 0.3); d[o + 2] = 255; d[o + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
        return t;
    })();

    function faceTexture(front, st) {
        var c = document.createElement("canvas"); c.width = 1280; c.height = Math.round(1280 * st.cardH / st.cardW);   /* sharp enough for the small rotated lettering and the QR */
        var g = c.getContext("2d"), W = c.width, H = c.height;
        var bg = g.createLinearGradient(0, 0, W * 0.6, H);
        bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#e9eef6");
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        if (front) {
            var img = api.getImage();
            if (img) {
                var ir = img.naturalWidth / img.naturalHeight, cr = W / H, dw, dh;
                if (ir > cr) { dh = H; dw = dh * ir; } else { dw = W; dh = dw / ir; }
                g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
            }
        } else {
            api.drawBack(g, W, H);
        }
        var t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        return t;
    }

    function remapUV(geo, w, h, y0) {
        var pos = geo.attributes.position, uv = geo.attributes.uv;
        for (var i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, (pos.getY(i) - y0) / h);
        uv.needsUpdate = true;
    }

    function clearGroup(grp) {
        while (grp.children.length) {
            var ch = grp.children.pop();
            if (ch.geometry) ch.geometry.dispose();
            if (ch.material && ch.material.map && ch.material.map.dispose) ch.material.map.dispose();
        }
    }

    /* (re)build the badge and hardware when the size or the face image changes */
    function build(st) {
        var k = [st.cardW, st.cardH, st.TOP, st.kk, st.imgReady ? 1 : 0].join("|");
        if (k === built.key) return;
        built.key = k;
        clearGroup(badge); clearGroup(clampG); hardware = new THREE.Group(); badge.add(hardware);

        var w = st.cardW, h = st.cardH, top = st.TOP, kk = st.kk, rad = Math.max(10, st.u * 0.14);
        var y0 = -top - h, depth = Math.max(1, w * 0.007);
        var hw = 21 * kk, hh = 10 * kk, hy = top + 7 * kk;               /* slot, in the 2D layout's units */
        var slotCy = -(hy + hh / 2);
        var shape = roundedShape(w, h, rad, -w / 2, y0);
        shape.holes.push(slotHole(hw, hh, slotCy));

        body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.35, bevelSegments: 2, curveSegments: 28 }), plastic);
        body.geometry.translate(0, 0, -depth / 2);
        badge.add(body);

        var fg = new THREE.ShapeGeometry(shape, 28); remapUV(fg, w, h, y0);
        var ftx = faceTexture(true, st);
        faceFront = new THREE.Mesh(fg, new THREE.MeshPhysicalMaterial({ map: ftx, emissiveMap: ftx, color: 0xb4b6bc, roughness: 0.55, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.4, emissive: 0xffffff, emissiveIntensity: 0.16 }));
        faceFront.position.z = depth / 2 + 0.38; badge.add(faceFront);
        var bg2 = new THREE.ShapeGeometry(shape, 28); remapUV(bg2, w, h, y0);
        var btx = faceTexture(false, st);
        faceBack = new THREE.Mesh(bg2, new THREE.MeshPhysicalMaterial({ map: btx, emissiveMap: btx, color: 0xb4b6bc, roughness: 0.55, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.4, emissive: 0xffffff, emissiveIntensity: 0.16 }));
        faceBack.rotation.y = Math.PI; faceBack.position.z = -depth / 2 - 0.38; badge.add(faceBack);

        /* Soft slanted glow over each face; render() slides it with the badge's lean, turn and swing. */
        glowFront = new THREE.Mesh(fg.clone(), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 1 }));
        glowFront.position.z = depth / 2 + 0.44; badge.add(glowFront);
        glowBack = new THREE.Mesh(bg2.clone(), new THREE.MeshBasicMaterial({ map: glowTexB, transparent: true, depthWrite: false, opacity: 1 }));
        glowBack.rotation.y = Math.PI; glowBack.position.z = -depth / 2 - 0.44; badge.add(glowBack);

        /* Hardware as in the reference: a dark-steel plate with a lighter rim */
        var th = 0.35;                                              /* the ring's plane, turned slightly about the vertical */
        var cw = Math.max(st.sw * 0.5, 11 * kk), cy0 = -4 * kk, ch = 11 * kk, cDepth = 2.6 * kk;
        var cs = roundedShape(cw * 2, ch, 2.6 * kk, -cw, -(cy0 + ch));
        var clamp = new THREE.Mesh(new THREE.ExtrudeGeometry(cs, { depth: cDepth, bevelEnabled: true, bevelThickness: 1.5 * kk, bevelSize: 1.3 * kk, bevelSegments: 8, curveSegments: 20 }), rimMat);
        clamp.position.z = -cDepth / 2;
        clampG.add(clamp);
        /* one plain dark-silver plate: no painted shine, the studio lights do the work */

        var tubeR = 1.15 * kk;
        var rTop = 7 * kk, rBot = hy + hh * 0.5 + 1.2 * kk;       /* in downward-positive units */
        var ry = (rBot - rTop) / 2, rx = 6.4 * kk, rcy = -(rTop + rBot) / 2;
        var pts3 = [];
        for (var a2 = 0; a2 <= 64; a2++) {
            var ph = (a2 / 64) * Math.PI * 2;
            pts3.push(new THREE.Vector3(rx * Math.cos(ph) * Math.cos(th), rcy + ry * Math.sin(ph), rx * Math.cos(ph) * Math.sin(th)));
        }
        var ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3, true), 96, tubeR, 14, true), ringMat);
        hardware.add(ring);
    }

    var sampleN = 0;
    function sample(arr, N) {
        var out = [{ x: arr[0].x, y: arr[0].y }], i, k;
        for (i = 1; i < N; i++) {
            var x0q = i === 1 ? arr[0].x : (arr[i - 1].x + arr[i].x) / 2, y0q = i === 1 ? arr[0].y : (arr[i - 1].y + arr[i].y) / 2;
            var mx = (arr[i].x + arr[i + 1].x) / 2, my = (arr[i].y + arr[i + 1].y) / 2;
            for (k = 1; k <= 8; k++) {
                var t = k / 8, a1 = (1 - t) * (1 - t), b1 = 2 * (1 - t) * t, c1 = t * t;
                out.push({ x: a1 * x0q + b1 * arr[i].x + c1 * mx, y: a1 * y0q + b1 * arr[i].y + c1 * my });
            }
        }
        var lx = out[out.length - 1].x, ly = out[out.length - 1].y;
        for (k = 1; k <= 6; k++) out.push({ x: lx + (arr[N].x - lx) * k / 6, y: ly + (arr[N].y - ly) * k / 6 });
        var acc = 0; out[0].s = 0;
        for (i = 1; i < out.length; i++) {
            var dx = out[i].x - out[i - 1].x, dy = out[i].y - out[i - 1].y, dl = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            acc += dl; out[i].s = acc; out[i].tx = dx / dl; out[i].ty = dy / dl;
        }
        out[0].tx = out[1].tx; out[0].ty = out[1].ty;
        for (i = 0; i < out.length; i++) { out[i].nx = -out[i].ty; out[i].ny = out[i].tx; }
        return out;
    }

    function ribbon(idx, arr, st, zOff) {
        var P = sample(arr, st.N), n = P.length, sw = st.sw;
        var mesh = ribbonMeshes[idx];
        if (!mesh || mesh.userData.n !== n) {
            if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
            var g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
            g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2));
            g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
            var ind = [];
            for (var i = 0; i < n - 1; i++) { var a = i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
            g.setIndex(ind);
            mesh = new THREE.Mesh(g, ribbonMat); mesh.userData.n = n; mesh.frustumCulled = false;
            scene.add(mesh); ribbonMeshes[idx] = mesh;
        }
        var pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv, nor = mesh.geometry.attributes.normal;
        var kScale = sw / st.TEX_H;
        /* Twist: none at the top, the badge's full turn at the clamp. */
        var total = P[n - 1].s || 1;
        /* Stretch: past its rest length the cloth elongates (weave too) and narrows. */
        var strain = Math.max(1, total / (st.seg * st.N)), swS = sw / Math.pow(strain, 0.8);
        for (var j = 0; j < n; j++) {
            var p = P[j], uu = p.s / strain / (st.TEX_W * kScale);
            var f = Math.max(0, Math.min(1, (p.s / total - 0.3) / 0.7)), wgt = f * f * (3 - 2 * f), ph = st.yaw * wgt;
            var cph = Math.cos(ph), sph = Math.sin(ph);
            var hx = p.nx * cph * swS / 2, hy2 = p.ny * cph * swS / 2, hz = sph * swS / 2;
            pos.setXYZ(j * 2, p.x - hx, -(p.y - hy2), zOff - hz);
            pos.setXYZ(j * 2 + 1, p.x + hx, -(p.y + hy2), zOff + hz);
            uv.setXY(j * 2, uu, 1); uv.setXY(j * 2 + 1, uu, 0);
            var nx0 = (p.ty || 0) * sph, ny0 = (p.tx || 0) * sph;       /* surface normal of the twisted band */
            nor.setXYZ(j * 2, nx0, ny0, cph); nor.setXYZ(j * 2 + 1, nx0, ny0, cph);
        }
        pos.needsUpdate = true; uv.needsUpdate = true; nor.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
    }

    var size = { w: 0, h: 0, dpr: 0 }, lastClip = "";
    var lean = { x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0 };
    function render(st) {
        if (size.w !== st.W || size.h !== st.H || size.dpr !== st.dpr) {
            size = { w: st.W, h: st.H, dpr: st.dpr };
            renderer.setPixelRatio(st.dpr); renderer.setSize(st.W, st.H, false);
            canvas.style.width = st.W + "px"; canvas.style.height = st.H + "px";
            var dist = 1500;
            camera.fov = 2 * Math.atan(st.H / 2 / dist) * 180 / Math.PI; camera.aspect = st.W / st.H;
            camera.position.set(st.W / 2, -st.H / 2, dist); camera.lookAt(st.W / 2, -st.H / 2, 0);
            camera.updateProjectionMatrix();
        }
        build(st);
        var c = st.pose;
        rootG.position.set(c.x, -c.y, 0);
        /* A real badge rocks as it moves: a springy lean driven by velocity and swing angle moves the reflections. */
        if (!lean.init) { lean.init = 1; lean.px = c.x; lean.py = c.y; }
        var vx = c.x - lean.px, vy = c.y - lean.py; lean.px = c.x; lean.py = c.y;
        var tY = Math.max(-0.42, Math.min(0.42, vx * 0.014 + c.a * 0.5));
        var tX = Math.max(-0.34, Math.min(0.34, -vy * 0.012 + Math.abs(vx) * 0.004));
        lean.vy += (tY - lean.y) * 0.16; lean.vy *= 0.78; lean.y += lean.vy;
        lean.vx += (tX - lean.x) * 0.16; lean.vx *= 0.78; lean.x += lean.vx;
        badge.rotation.set(lean.x, st.yaw + lean.y, -c.a);
        /* where the light falls: it slides with the lean and the turn, and fades in a little as the badge tilts */
        var gu = 0.84 - lean.y * 1.5 - Math.sin(st.yaw) * 0.45, gv = 0.34 + lean.x * 1.5 + c.a * 0.4;
        glowTex.offset.set(0.5 - gu, 0.5 - gv); glowTexB.offset.set(0.5 + gu - 1, 0.5 - gv);
        var gk = 0.55 + Math.min(0.45, (Math.abs(lean.x) + Math.abs(lean.y)) * 1.6);
        if (glowFront) { glowFront.material.opacity = 1.0 * gk * Math.max(0, Math.cos(st.yaw)); glowBack.material.opacity = gk * Math.max(0, -Math.cos(st.yaw)); }
        clampG.rotation.set(lean.x * 0.9, st.yaw + lean.y * 0.9, -c.a);
        ribbon(0, st.pts, st, 0); ribbon(1, st.ptsR, st, 0.6);
        renderer.render(scene, camera);
    }

    return { render: render, canvas: canvas, dispose: function () { renderer.dispose(); canvas.remove(); } };
}
