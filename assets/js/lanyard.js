/* Lanyard: an ID badge on a V strap inside the glass panel. It swings when it appears and when dragged. */
(function () {
    "use strict";

    var SCRIPT_SRC = document.currentScript && document.currentScript.src;
    /* While the 3D renderer is still loading, draw nothing: showing the flat drawing first and then swapping to 3D */
    var glPending = !!window.WebGLRenderingContext && !!window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var gl = null;                       /* the 3D renderer, once it has loaded (else the 2D drawing below is used) */
    var panel = document.getElementById("lanyard-panel");
    var cv = document.getElementById("lanyard");
    var hit = document.getElementById("lanyard-hit");
    if (!panel || !cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    var root = document.documentElement;

    var W = 0, H = 0, dpr = 1;
    var N = 3;                          /* rope links */
    var pts = [], ptsR = [], cb;                   /* rope points (pts[N] = badge top) and badge bottom point */
    var flipped = false;                    /* which face is showing after a click */
    var yaw = 0, yawV = 0, lastV = 0;       /* spin of the badge about its long axis */
    var TOP = 21, kk = 1, u = 100, g = 4000, seg = 100, cardW = 160, cardH = 225, link = 200;
    var img = null, imgReady = false;
    var drag = null;                    /* { ox, oy } while held */
    var pointer = { x: 0, y: 0, vx: 0, t: 0 };
    var running = false, raf = 0, visible = true, last = 0, acc = 0, calm = 0;
    var anchor = { x: 0, y: 0 };
    var half = 80, drop = 200;          /* the V: half-spread of the two anchors, drop to the clamp */
    var box = { l: 0, r: 0, t: 0, b: 0 }, pan = { l: 0, r: 0, t: 0, b: 0, rad: 22 }, stretch = 1;   /* the glass panel: the badge stays inside and bounces off its edges */
    var roofY = 0;                      /* the top edge of the glass panel: the badge bounces off it */
    var REST = 0.5;                     /* bounce off the viewport edges */
    var reduced = function () { return root.getAttribute("data-motion") === "reduced"; };

    /* Woven ribbon texture (built once): a fine twill with warp threads along the length, plain selvedge edges */
    var TEX_H = 64, TEX_W = 2560, tex = null;
    function buildTex() {
        var cvT = document.createElement("canvas"); cvT.width = TEX_W; cvT.height = TEX_H;
        var cx = cvT.getContext("2d");
        var mk = document.createElement("canvas"); mk.width = TEX_W; mk.height = TEX_H;
        var mx = mk.getContext("2d");
        mx.fillStyle = "#000"; mx.fillRect(0, 0, TEX_W, TEX_H);
        mx.fillStyle = "#fff"; mx.textBaseline = "middle";
        var fs = TEX_H * 0.5, x = fs, word = "ELEAZ";
        mx.font = "800 " + fs + "px Inter, system-ui, sans-serif";
        var gap = fs * 0.2;
        while (x < TEX_W - fs * 2) {
            for (var i = 0; i < word.length; i++) {
                var ch = word.charAt(i), w = mx.measureText(ch).width;
                mx.fillText(ch, x, TEX_H / 2 + 1); x += w + gap;
            }
            x += fs * 1.3;
        }
        var md = mx.getImageData(0, 0, TEX_W, TEX_H).data;
        var out = cx.createImageData(TEX_W, TEX_H), d = out.data;
        function A(px, py) { px = Math.max(0, Math.min(TEX_W - 1, px)); py = Math.max(0, Math.min(TEX_H - 1, py)); return md[(py * TEX_W + px) * 4] / 255; }
        function hsh(a, b) { var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); }
        var fiber = [], ribJit = [], yy2;
        for (yy2 = 0; yy2 < TEX_H; yy2++) fiber.push((hsh(3.1, yy2) - 0.5) * 7 + (hsh(9.7, yy2 >> 1) - 0.5) * 5);
        for (var rr = 0; rr < TEX_W; rr++) ribJit.push((hsh(rr, 4.4) - 0.5) * 6);
        var P = 5;
        for (var y = 0; y < TEX_H; y++) {
            for (var xx = 0; xx < TEX_W; xx++) {
                var a = A(xx, y), v, edgeBand = (y < 6 || y > TEX_H - 7);
                var per = edgeBand ? 3 : P;
                var ph = (xx % per) / per, prof = 0.5 - 0.5 * Math.cos(ph * 6.2832);
                prof = Math.pow(prof, 1.4);
                v = 9 + 24 * prof + ribJit[Math.floor(xx / per) % TEX_W] * (0.4 + prof) + fiber[y];
                v += (hsh(xx, y) - 0.5) * 4;                              /* loose fibres */
                if (edgeBand) v += 5;
                if (y === 6 || y === TEX_H - 7) v -= 10;                  /* seam between body and selvedge */
                if (a > 0.5) {                                            /* satin letters: smooth, no ribs */
                    v = 66 + ((y & 1) ? 8 : 0) + fiber[y] * 0.6 + (hsh(xx >> 3, y) - 0.5) * 3;
                }
                var em = (A(xx - 1, y - 1) - A(xx + 1, y + 1));
                v += em * 70;
                v = Math.max(0, Math.min(255, v));
                var o = (y * TEX_W + xx) * 4;
                d[o] = v; d[o + 1] = v; d[o + 2] = v + 3; d[o + 3] = 255;
            }
        }
        cx.putImageData(out, 0, 0);
        tex = cvT;
    }

    /* Front face: name, role and cut-out photo composed once on a canvas, shared by both renderers. */
    function composeFront(photo) {
        var W = 640, H = Math.round(640 * 2.25 / 1.6), c = document.createElement("canvas");
        c.width = W; c.height = H;
        var g = c.getContext("2d");
        var bg = g.createLinearGradient(0, 0, 0, H);                  /* custom white at the top easing to light grey at the bottom */
        bg.addColorStop(0, "#f8f9fd"); bg.addColorStop(0.4, "#dfe3ec"); bg.addColorStop(1, "#a9b2c5");     /* a cool off-white, so the photo's white sticker edge stands out */
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.textAlign = "center"; g.textBaseline = "alphabetic";
        g.fillStyle = "#0c0f16"; g.font = "800 76px Inter, system-ui, sans-serif";
        if ("letterSpacing" in g) g.letterSpacing = "-3px";
        g.fillText("Eleaz", W / 2, 180);
        g.fillStyle = "#1c2536"; g.font = "800 25px Inter, system-ui, sans-serif";
        if ("letterSpacing" in g) g.letterSpacing = "0.8px";
        g.fillText("SENIOR SOFTWARE ENGINEER", W / 2, 224);
        if ("letterSpacing" in g) g.letterSpacing = "0px";
        if (photo) {
            /* cropped just below the armpits and run edge to edge */
            var keep = 0.76, pw = W * 1.04, chH = pw * keep * photo.naturalHeight / photo.naturalWidth;
            g.drawImage(photo, 0, 0, photo.naturalWidth, photo.naturalHeight * keep, (W - pw) / 2, H - chH + 3, pw, chH);
        }
        /* hand the canvas over directly: encoding it to a PNG and decoding it again cost hundreds of ms */
        c.naturalWidth = W; c.naturalHeight = H;
        img = c; imgReady = true; draw();
    }

    function loadImage() {
        var portraitSrc = panel.getAttribute("data-portrait"), done = false;
        function fallback() {
            if (done) return; done = true;
            var src = panel.getAttribute("data-image");
            if (!src) return;
            img = new Image();
            img.onload = function () { imgReady = true; draw(); };
            img.src = src;
        }
        if (!portraitSrc) { fallback(); return; }
        var ph = new Image();
        ph.onload = function () { if (done) return; done = true; composeFront(ph); };
        ph.onerror = fallback;
        ph.src = portraitSrc;
    }

    var panelPos = { left: 0, top: 0 };      /* the panel's last viewport position, to feel it move */

    /* The canvas lives inside the panel, so it scrolls natively with the page; the physics run in the panel's own coordinates. */
    function readAnchor() {
        var r = panel.getBoundingClientRect();
        anchor.x = r.width / 2;
        anchor.y = -6;
        roofY = 0;
        pan.l = 0; pan.r = r.width; pan.t = 0; pan.b = r.height;
        box.l = 0; box.r = r.width; box.t = 0; box.b = r.height - 34;   /* leave the caption clear */
        return r;
    }

    function localPoint(e) {
        var r = panel.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function layout() {
        var rp = panel.getBoundingClientRect();
        W = Math.round(rp.width); H = Math.round(rp.height);
        panelPos.left = rp.left; panelPos.top = rp.top;
        dpr = Math.min(window.matchMedia("(hover: none)").matches ? 1.75 : 2, window.devicePixelRatio || 1);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        cv.style.width = W + "px"; cv.style.height = H + "px";
        var r = readAnchor();
        /* badge sized so strap (3 units) + badge (2.25 units) fit the glass panel */
        /* a shorter panel keeps the badge its full size: the spare room under it eases away as the panel grows from 440 to 530 px */
        u = Math.max(40, Math.min(104, (r.height - (78 - 58 * Math.max(0, Math.min(1, (r.height - 440) / 90)))) / 4.9));
        u = Math.min(u, r.width / 1.9);
        cardH = 2.25 * u; cardW = 1.6 * u; kk = u / 90; TOP = 21 * kk;
        g = 40 * u; link = cardH * 0.9;
        half = 0.85 * u; drop = 2.1 * u;
        var side = Math.sqrt(half * half + drop * drop);
        seg = side / N * 1.02;      /* a little extra cloth: it flexes when the badge swings, and eases straight at rest */
        var ex = anchor.x, ey = anchor.y + drop;                    /* where the straps meet */
        pts = []; ptsR = [];
        for (var i = 0; i <= N; i++) {
            var f = i / N;
            pts.push({ x: anchor.x - half * (1 - f), y: anchor.y + drop * f, px: 0, py: 0 });
        }
        for (var j = 0; j < N; j++) {
            var g2 = j / N;
            ptsR.push({ x: anchor.x + half * (1 - g2), y: anchor.y + drop * g2, px: 0, py: 0 });
        }
        ptsR.push(pts[N]);                                          /* shared end: the clamp */
        cb = { x: ex, y: ey + link, px: 0, py: 0 };
        pts.concat(ptsR).forEach(function (p) { p.px = p.x; p.py = p.y; });
        cb.px = cb.x; cb.py = cb.y;
        yaw = flipped ? Math.PI : 0; yawV = 0; lastV = 0;
    }

    function rope(a, b, len, wa, wb) {
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= len || d < 0.0001) return;                 /* slack: a rope only pulls */
        var diff = (d - len) / d * (drag ? 0.16 : 1), sa = wa / (wa + wb), sb = wb / (wa + wb);
        a.x += dx * diff * sa; a.y += dy * diff * sa;
        b.x -= dx * diff * sb; b.y -= dy * diff * sb;
    }

    /* only pushes apart (never pulls): keeps the cloth from folding flat */
    function minDist(a, b, len, wa, wb) {
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= len || d < 0.0001) return;
        var diff = (d - len) / d * 0.6, sa = wa / (wa + wb), sb = wb / (wa + wb);
        a.x += dx * diff * sa; a.y += dy * diff * sa;
        b.x -= dx * diff * sb; b.y -= dy * diff * sb;
    }

    function rod(a, b, len, wa, wb) {
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (d - len) / d, sa = wa / (wa + wb), sb = wb / (wa + wb);
        a.x += dx * diff * sa; a.y += dy * diff * sa;
        b.x -= dx * diff * sb; b.y -= dy * diff * sb;
    }

    function pose() {
        var t = pts[N], dx = cb.x - t.x, dy = cb.y - t.y;
        return { x: t.x, y: t.y, a: Math.atan2(dy, dx) - Math.PI / 2 };
    }

    /* Keep the badge inside the glass panel and bounce it off all four edges, reflecting its motion */
    function collide() {
        var p = pose(), ca = Math.cos(p.a), sa = Math.sin(p.a), top = TOP;
        var lx = [-cardW / 2, cardW / 2, cardW / 2, -cardW / 2], ly = [top, top, top + cardH, top + cardH];
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < 4; i++) {
            var wx = p.x + lx[i] * ca - ly[i] * sa, wy = p.y + lx[i] * sa + ly[i] * ca;
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        }
        var sx = 0, sy = 0;
        if (maxX < pan.l - cardW * 1.5) sx = pan.l - cardW * 1.5 - maxX; else if (minX > pan.r + cardW * 1.5) sx = pan.r + cardW * 1.5 - minX;
        if (minY < box.t) sy = box.t - minY; else if (maxY > box.b) sy = box.b - maxY;
        if (!sx && !sy) return;
        yawV += (Math.random() - 0.5) * 3;       /* a knock sets it spinning */
        var t = pts[N], vtx = t.x - t.px, vty = t.y - t.py, vbx = cb.x - cb.px, vby = cb.y - cb.py;
        t.x += sx; cb.x += sx; t.y += sy; cb.y += sy;
        if (sx) { t.px = t.x + vtx * REST; cb.px = cb.x + vbx * REST; }
        if (sy) { t.py = t.y + vty * REST; cb.py = cb.y + vby * REST; }
    }

    function step(h) {
        var damp = Math.exp(-0.55 * h), all = pts.slice(1).concat(ptsR.slice(1, N), [cb]), i;
        for (i = 0; i < all.length; i++) {
            var p = all[i], vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
            p.px = p.x; p.py = p.y;
            p.x += vx; p.y += vy + g * h * h;
        }
        /* angular damping: also bleed off the badge's spin relative to its hanging point */
        var t = pts[N], rvx = (cb.x - cb.px) - (t.x - t.px), rvy = (cb.y - cb.py) - (t.y - t.py), keep = Math.exp(-0.9 * h);
        var dvx = rvx * (1 - keep) * 0.5, dvy = rvy * (1 - keep) * 0.5;
        cb.px += dvx; cb.py += dvy; t.px -= dvx; t.py -= dvy;

        if (drag) {
            /* held: the badge follows the pointer like a kinematic body */
            var cx = (t.x + cb.x) / 2, cy = (t.y + cb.y) / 2;
            /* The pointer may go anywhere; the badge follows with rubber-band resistance beyond the glass */
            var tx = pointer.x - drag.ox, ty = pointer.y - drag.oy;
            function band(v, lo, hi) { var o = v < lo ? v - lo : v > hi ? v - hi : 0; return (v - o) + Math.sign(o) * 36 * Math.log(1 + Math.abs(o) / 36); }
            var bx2 = band(tx, box.l + cardW / 2, box.r - cardW / 2), by2 = band(ty, box.t + cardH / 2, box.b - cardH / 2);
            var over = Math.hypot(tx - bx2, ty - by2);
            /* the straps are inextensible: the badge can only be pulled as far as they reach */
            var reach = (seg * N * 1.0 + TOP + cardH * 0.5) * 1.32;
            for (var ai = 0; ai < 2; ai++) {
                var axp = anchor.x + (ai ? half : -half), rdx = bx2 - axp, rdy = by2 - anchor.y, rd = Math.hypot(rdx, rdy);
                if (rd > reach) { bx2 = axp + rdx * reach / rd; by2 = anchor.y + rdy * reach / rd; }
            }
            var mx = (bx2 - cx) * 0.5, my = (by2 - cy) * 0.5, ml = Math.hypot(mx, my), cap = u * 0.22;
            if (ml > cap) { mx *= cap / ml; my *= cap / ml; }
            t.x += mx; cb.x += mx; t.y += my; cb.y += my;
            t.px = t.x - (mx * 0.6); cb.px = cb.x - (mx * 0.6); t.py = t.y - (my * 0.6); cb.py = cb.y - (my * 0.6);
        }
        /* Cloth is only stiff while taut: slack straps must be free to fold. */
        var tautL = Math.min(1, Math.max(0, (Math.hypot(pts[N].x - pts[0].x, pts[N].y - pts[0].y) / (seg * N) - 0.7) / 0.22));
        var tautR = Math.min(1, Math.max(0, (Math.hypot(ptsR[N].x - ptsR[0].x, ptsR[N].y - ptsR[0].y) / (seg * N) - 0.7) / 0.22));
        for (var it = 0, itN = drag ? 90 : 40; it < itN; it++) {
            pts[0].x = anchor.x - half; pts[0].y = anchor.y;
            ptsR[0].x = anchor.x + half; ptsR[0].y = anchor.y;
            for (var k = 0; k < N; k++) {
                rope(pts[k], pts[k + 1], seg, k === 0 ? 0 : 1, k === N - 1 ? (drag ? 0.12 : 0.5) : 1);
                rope(ptsR[k], ptsR[k + 1], seg, k === 0 ? 0 : 1, k === N - 1 ? (drag ? 0.12 : 0.5) : 1);
            }
            for (var kb = 0; kb + 2 <= N; kb++) {
                minDist(pts[kb], pts[kb + 2], seg * (0.25 + 1.67 * tautL), kb === 0 ? 0 : 1, 1);
                minDist(ptsR[kb], ptsR[kb + 2], seg * (0.25 + 1.67 * tautR), kb === 0 ? 0 : 1, 1);
            }
            rod(pts[N], cb, link, drag ? 1 : 0.22, drag ? 1 : 0.22);
        }
        /* Woven cloth is stiff, but not rigid: the straps ease toward the straight line between their anchor and the clamp */
        var vsp = Math.abs(cb.x - cb.px) + Math.abs(cb.y - cb.py);
        var soft0 = vsp < 0.25 ? 0.22 : (vsp < 1.2 ? 0.07 : 0.015);
        for (var chain = 0; chain < 2; chain++) {
            var arr = chain ? ptsR : pts, ea = arr[0], eb = arr[N], soft = soft0 * (chain ? tautR : tautL);
            for (var sk = 1; sk < N; sk++) {
                var tx = ea.x + (eb.x - ea.x) * sk / N, ty = ea.y + (eb.y - ea.y) * sk / N;
                arr[sk].x += (tx - arr[sk].x) * soft; arr[sk].y += (ty - arr[sk].y) * soft;
            }
        }
        collide();

        /* Spin about the long axis. */
        var vNow = pts[N].x - pts[N].px, ax = (vNow - lastV) / (h * h);
        lastV = vNow;
        ax = Math.max(-40000, Math.min(40000, ax));
        if (drag) { pointer.vx *= Math.exp(-6 * h); yawV += pointer.vx * 0.012 * h; }
        yawV += (-ax * 0.0006 - 11 * Math.sin(yaw - (flipped ? Math.PI : 0))) * h;
        yawV *= Math.exp(-2.3 * h);
        yaw += yawV * h;
        if (yaw > 6.2832) yaw -= 6.2832; else if (yaw < -6.2832) yaw += 6.2832;
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    function draw() {
        if (!booted) return;
        if (gl) { drawGL(); return; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (glPending) return;
        var dark = root.getAttribute("data-theme") === "dark";
        var sw = Math.max(18, u * 0.3);
        ctx.save();
        roundRect(pan.l, pan.t, pan.r - pan.l, pan.b - pan.t, pan.rad); ctx.clip();

        /* The strap: two woven black ribbons in a V, engraved with repeated ELEAZ. Each ribbon is sampled into a polyline so the weave */
        function sample(arr) {
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
            var acc2 = 0;
            out[0].s = 0; out[0].nx = 0; out[0].ny = 0;
            for (i = 1; i < out.length; i++) {
                var dx = out[i].x - out[i - 1].x, dy = out[i].y - out[i - 1].y, dl = Math.sqrt(dx * dx + dy * dy) || 0.0001;
                acc2 += dl; out[i].s = acc2;
                out[i].tx = dx / dl; out[i].ty = dy / dl;
            }
            out[0].tx = out[1].tx; out[0].ty = out[1].ty;
            for (i = 0; i < out.length; i++) { out[i].nx = -out[i].ty; out[i].ny = out[i].tx; }
            return out;
        }

        function ribbon(arr) {
            if (!tex) buildTex();
            var P = sample(arr), i, k = sw / TEX_H, tilt;
            /* Stretch: past its rest length the cloth elongates (weave and lettering too), narrows and pales. */
            var strain = Math.max(1, P[P.length - 1].s / (seg * N));
            var totalS = P[P.length - 1].s || 1;
            var swS = sw / Math.pow(strain, 0.8), pale = Math.min(0.28, (strain - 1) * 0.9);
            ctx.lineCap = "butt";
            /* soft cast shadow on the panel behind the strap */
            ctx.save(); ctx.shadowColor = "rgba(5,10,25,.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
            ctx.strokeStyle = "#08080a";
            /* the backing follows the twist too, otherwise a full-width strap stays visible under the twisted one */
            for (i = 1; i < P.length; i++) {
                var fB = Math.max(0, Math.min(1, ((P[i - 1].s + P[i].s) / 2 / totalS - 0.3) / 0.7)), cB = Math.cos(yaw * fB * fB * (3 - 2 * fB));
                ctx.lineWidth = Math.max(0.5, (swS - 1) * Math.max(0.05, Math.abs(cB)));
                ctx.beginPath(); ctx.moveTo(P[i - 1].x, P[i - 1].y); ctx.lineTo(P[i].x, P[i].y); ctx.stroke();
            }
            ctx.restore();

            var edge = ctx.createLinearGradient(0, -swS / 2, 0, swS / 2);
            edge.addColorStop(0, "rgba(0,0,0,.62)"); edge.addColorStop(0.14, "rgba(0,0,0,.18)");
            edge.addColorStop(0.5, "rgba(255,255,255,.035)");
            edge.addColorStop(0.86, "rgba(0,0,0,.2)"); edge.addColorStop(1, "rgba(0,0,0,.62)");
            var LX = -0.55, LY = -0.83;                                   /* light from the upper left */
            for (i = 1; i < P.length; i++) {
                var A0 = P[i - 1], B0 = P[i], len = B0.s - A0.s;
                if (len < 0.01) continue;
                var srcLen = len / k / strain, sx = (A0.s / k / strain) % TEX_W;
                if (sx + srcLen + 0.5 > TEX_W) sx = 0;
                ctx.save();
                ctx.translate(A0.x, A0.y); ctx.rotate(Math.atan2(B0.ty, B0.tx));
                /* Twist: none at the top, the badge's full turn at the clamp; width follows its cosine. */
                var fT = Math.max(0, Math.min(1, ((A0.s + B0.s) / 2 / totalS - 0.3) / 0.7)), phT = yaw * fT * fT * (3 - 2 * fT), cT = Math.cos(phT);
                ctx.scale(1, Math.max(0.05, Math.abs(cT)));
                ctx.drawImage(tex, sx, 0, Math.min(srcLen + 0.4, TEX_W - sx), TEX_H, 0, -swS / 2, len + 0.7, swS);
                ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(0, -swS / 2, len + 0.7, swS);   /* a deeper black */
                if (cT < 0) { ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(0, -swS / 2, len + 0.7, swS); }   /* the back of the band */
                if (pale > 0.01) { ctx.fillStyle = "rgba(190,200,220," + pale.toFixed(3) + ")"; ctx.fillRect(0, -swS / 2, len + 0.7, swS); }
                ctx.fillStyle = edge; ctx.fillRect(0, -swS / 2, len + 0.7, swS);
                /* cloth sheen: brighter where this stretch of ribbon faces the light */
                var facing = Math.max(0, B0.nx * LX + B0.ny * LY);
                if (!dark) facing *= 0.8;
                tilt = Math.pow(facing, 3) * 0.2;
                if (tilt > 0.01) {
                    var sh = ctx.createLinearGradient(0, -swS / 2, 0, swS / 2);
                    sh.addColorStop(0, "rgba(190,205,235,0)"); sh.addColorStop(0.45, "rgba(190,205,235," + tilt.toFixed(3) + ")");
                    sh.addColorStop(0.62, "rgba(190,205,235," + (tilt * 0.4).toFixed(3) + ")"); sh.addColorStop(1, "rgba(190,205,235,0)");
                    ctx.fillStyle = sh; ctx.fillRect(0, -swS / 2, len + 0.7, swS);
                }
                ctx.restore();
            }
        }

        ctx.save();
        ribbon(pts);
        ribbon(ptsR);
        ctx.restore();

        var c = pose(), top = TOP, x0 = -cardW / 2, rad = Math.max(10, u * 0.14);
        /* Light is fixed in the room: how far this badge is turned and where it hangs decides where the highlights sit */
        var cxw = c.x - Math.sin(c.a) * (top + cardH / 2), cyw = c.y + Math.cos(c.a) * (top + cardH / 2);
        var slide = (c.a * 2.2) + ((cxw - W / 2) / W) * 1.5 + ((cyw - H / 2) / H) * 0.4;

        function metal(xa, ya, xb, yb) {
            var hz = Math.max(0.3, Math.min(0.62, 0.46 + slide * 0.06));
            var m = ctx.createLinearGradient(xa, ya, xb, yb);
            m.addColorStop(0, "#f7f9fc");
            m.addColorStop(Math.max(0.05, hz - 0.2), "#bcc4d1");
            m.addColorStop(Math.max(0.1, hz - 0.04), "#8590a2");
            m.addColorStop(hz, "#4b5364");
            m.addColorStop(Math.min(0.9, hz + 0.05), "#8e97a7");
            m.addColorStop(Math.min(0.96, hz + 0.3), "#e6ebf3");
            m.addColorStop(1, "#97a0b0");
            return m;
        }
        var hw = 21 * kk, hh = 10 * kk, hy = top + 7 * kk;                  /* the slot */
        function slotPath() {
            var r = hh / 2;
            ctx.moveTo(-hw + r, hy); ctx.lineTo(hw - r, hy); ctx.arc(hw - r, hy + r, r, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(-hw + r, hy + hh); ctx.arc(-hw + r, hy + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath();
        }
        function cardPath() { roundRect(x0, top, cardW, cardH, rad); slotPath(); }
        var cs = Math.cos(yaw), sx = Math.max(0.025, Math.abs(cs)), front = cs >= 0, sn = Math.sin(yaw);
        slide += sn * 0.9;
        var rTop = 7 * kk, rBot = hy + hh * 0.5 + 2.2 * kk, ry = (rBot - rTop) / 2, rx = 6.4 * kk, rcy = (rTop + rBot) / 2, rw = 2 * kk;

        /* the ring's back half, behind the card (seen through the hole) */
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.ellipse(0, rcy, rx, ry, 0, 0, Math.PI * 2);
        ctx.lineWidth = rw; ctx.strokeStyle = metal(-rx, rcy - ry, rx, rcy + ry); ctx.stroke();
        ctx.lineWidth = rw; ctx.strokeStyle = "rgba(25,32,48,.38)"; ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        /* thickness: a darker edge peeks out on the side the badge is turning toward */
        var thick = cardW * 0.03 * Math.abs(sn), eo = (sn >= 0 ? 1 : -1) * thick;
        if (thick > 0.4) {
            var e1 = ctx.createLinearGradient(x0, 0, -x0, 0);
            e1.addColorStop(0, "#d2d9e5"); e1.addColorStop(1, "#e8ecf3");
            /* drawn with the strap slot cut out, like the face, so the hole stays see-through while the badge turns */
            ctx.save(); ctx.translate(eo, 0); ctx.scale(sx, 1);
            ctx.fillStyle = e1; cardPath(); ctx.fill("evenodd");
            ctx.restore();
        }
        ctx.save();
        ctx.scale(sx, 1);
        /* badge body: white with a faint top-to-bottom falloff, lifted by a shadow */
        ctx.shadowColor = dark ? "rgba(0,0,0,.4)" : "rgba(10,20,45,.18)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
        var body = ctx.createLinearGradient(x0, top, x0 + cardW * 0.6, top + cardH);
        body.addColorStop(0, "#ffffff"); body.addColorStop(1, "#f1f4f9");
        cardPath(); ctx.fillStyle = body; ctx.fill("evenodd");
        ctx.shadowColor = "transparent";
        ctx.save(); cardPath(); ctx.clip("evenodd");
        if (front) {
            if (img && imgReady) {
                var ir = img.naturalWidth / img.naturalHeight, cr = cardW / cardH, dw, dh;
                if (ir > cr) { dh = cardH; dw = dh * ir; } else { dw = cardW; dh = dw / ir; }
                ctx.drawImage(img, x0 + (cardW - dw) / 2, top + (cardH - dh) / 2, dw, dh);
            }
        } else {
            /* the back of the badge */
            var bk = ctx.createLinearGradient(x0, top, x0 + cardW, top + cardH);
            bk.addColorStop(0, "#f3f5f9"); bk.addColorStop(1, "#dde3ed");
            ctx.fillStyle = bk; ctx.fillRect(x0, top, cardW, cardH);
            ctx.save(); ctx.translate(x0, top); drawBack(ctx, cardW, cardH); ctx.restore();
        }
        /* turned away from the light: the face darkens a little */
        ctx.fillStyle = "rgba(70,85,115," + ((1 - sx) * 0.4).toFixed(3) + ")"; ctx.fillRect(x0, top, cardW, cardH);
        ctx.restore();
        ctx.restore();

        /* clear-coat reflection, drawn in screen space: a cool dark band with a bright streak beside it, plus a broad soft glare. */
        ctx.save();
        ctx.scale(sx, 1);
        cardPath(); ctx.clip("evenodd");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var L = cardH * 1.5, bx = cxw + slide * cardW * 1.5, by = cyw - slide * cardW * 0.35;
        var d = L * 0.36;
        var band = ctx.createLinearGradient(bx - d, by - d, bx + d, by + d);
        band.addColorStop(0.00, "rgba(115,130,158,0)");
        band.addColorStop(0.28, "rgba(115,130,158,.00)");
        band.addColorStop(0.40, "rgba(115,130,158,.025)");
        band.addColorStop(0.47, "rgba(255,255,255,.03)");
        band.addColorStop(0.52, "rgba(255,255,255,.09)");
        band.addColorStop(0.57, "rgba(255,255,255,.04)");
        band.addColorStop(0.66, "rgba(115,130,158,.015)");
        band.addColorStop(0.80, "rgba(115,130,158,0)");
        band.addColorStop(1.00, "rgba(115,130,158,0)");
        ctx.fillStyle = band; ctx.fillRect(0, 0, W, H);
        var glare = ctx.createRadialGradient(bx - cardW * 0.35, by - cardH * 0.3, 0, bx - cardW * 0.35, by - cardH * 0.3, cardW * 1.1);
        glare.addColorStop(0, "rgba(255,255,255,.04)"); glare.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glare; ctx.fillRect(0, 0, W, H);
        ctx.restore();

        ctx.save(); ctx.scale(sx, 1);
        cardPath(); ctx.lineWidth = 1.4 / Math.max(0.4, sx); ctx.strokeStyle = "rgba(20,30,55,.14)"; ctx.stroke();
        ctx.restore();
        /* the hole's inner wall: the card has thickness, so the top wall falls in shadow and the bottom wall catches the light */
        ctx.save(); ctx.scale(sx, 1);
        ctx.save(); ctx.beginPath(); slotPath(); ctx.clip();
        var wall = ctx.createLinearGradient(0, hy, 0, hy + hh);
        wall.addColorStop(0, "rgba(10,15,30,.55)"); wall.addColorStop(0.35, "rgba(10,15,30,.10)"); wall.addColorStop(1, "rgba(10,15,30,0)");
        ctx.fillStyle = wall; ctx.fillRect(-hw, hy, hw * 2, hh);
        ctx.restore();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(20,30,55,.5)"; ctx.beginPath(); slotPath(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.rect(-hw, hy + hh * 0.5, hw * 2, hh); ctx.clip();
        ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.beginPath();
        ctx.translate(0, 0.9); slotPath(); ctx.stroke(); ctx.restore();
        ctx.restore();
        /* the ring's front side, over the card (drawn before the clamp so the clamp covers its top) */
        function tube(x, y, ang0, ang1) {
            ctx.lineCap = "round";
            ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, ang0, ang1); ctx.lineWidth = rw + 1.2; ctx.strokeStyle = "rgba(20,26,40,.5)"; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, ang0, ang1); ctx.lineWidth = rw; ctx.strokeStyle = metal(-rx, rcy - ry, rx, rcy + ry); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(x, y, rx - rw * 0.18, ry, 0, ang0 + 0.1, ang1 - 0.1); ctx.lineWidth = Math.max(1, rw * 0.28); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
        }
        tube(0, rcy, Math.PI * 0.5, Math.PI * 1.5);

        /* the strap's plate, as in the reference: dark steel with a lighter rounded rim */
        var cw = Math.max(sw * 0.5, 11 * kk), cy0 = -4 * kk, ch = 11 * kk, cr = 2.6 * kk;
        ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 2.5;
        /* the flat fallback has no lights to catch, so keep it a plain dark-silver plate */
        ctx.fillStyle = "#6a707c"; roundRect(-cw, cy0, cw * 2, ch, cr); ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.3)"; roundRect(-cw + 0.5, cy0 + 0.5, cw * 2 - 1, ch - 1, cr); ctx.stroke();
        ctx.restore();

        ctx.restore();

        /* keep the touch/mouse hit area on the badge */
        if (hit) {
            var ax = c.x - Math.sin(c.a) * (top + cardH / 2), ay = c.y + Math.cos(c.a) * (top + cardH / 2);
            var pad = 12;
            hit.style.width = (cardW + pad * 2) + "px"; hit.style.height = (cardH + pad * 2) + "px";
            hit.style.transform = "translate(" + (ax - cardW / 2 - pad).toFixed(1) + "px," + (ay - cardH / 2 - pad).toFixed(1) + "px) rotate(" + c.a.toFixed(4) + "rad)";
        }
    }

    function drawGL() {
        var c = pose(), top = TOP;
        try {
        gl.render({
            W: W, H: H, dpr: dpr, pose: c, yaw: yaw, pts: pts, ptsR: ptsR, N: N, seg: seg, sw: Math.max(18, u * 0.3),
            cardW: cardW, cardH: cardH, TOP: TOP, kk: kk, u: u, TEX_W: TEX_W, TEX_H: TEX_H, imgReady: imgReady,
            pan: { l: pan.l, r: pan.r, t: pan.t, b: pan.b, rad: pan.rad }
        });
        } catch (err) {
            try { gl.dispose(); } catch (e2) { /* ignore */ }
            gl = null; cv.style.visibility = ""; draw(); return;
        }
        if (hit) {
            var ax = c.x - Math.sin(c.a) * (top + cardH / 2), ay = c.y + Math.cos(c.a) * (top + cardH / 2);
            var pad = 12;
            hit.style.width = (cardW + pad * 2) + "px"; hit.style.height = (cardH + pad * 2) + "px";
            hit.style.transform = "translate(" + (ax - cardW / 2 - pad).toFixed(1) + "px," + (ay - cardH / 2 - pad).toFixed(1) + "px) rotate(" + c.a.toFixed(4) + "rad)";
        }
    }

    /* Back face, landscape (quarter turn) on a portrait canvas. Details come from data-* on the panel; phone is omitted until set. */
    var QR_BITS = "1111111010010110001111111100000101101101000100000110111010111001101010111011011101001001100001011101101110101001111010101110110000010011110000010000011111111010101010101111111000000000110110000000000010011111111100111100101110111000011111111000111110010111101111000100011100101010000000000011111011110000101011011001001100001110101011010101110001001011000110111001110110111111000010000000010011101101101010111100110111111011000000000100000001000101101111111010110110101010001100000101111010110001000010111010110110011111100001011101010010110011000011101110100111010111001111110000010001010010111101111111111010011000101001001", QR_N = 25;
    function drawBack(g, W, H) {
        var d = panel.dataset, k = W / 320, ink = "#0c0f16", mute = "#56627a";
        g.save();
        g.scale(k, k); g.translate(0, 450); g.rotate(-Math.PI / 2);          /* landscape area: 450 x 320 */
        function ls(v) { try { g.letterSpacing = v + "px"; } catch (e) {} }
        /* magnetic stripe, kept clear of the strap slot */
        var st = g.createLinearGradient(0, 34, 0, 84);
        st.addColorStop(0, "#2a2d34"); st.addColorStop(0.45, "#15171c"); st.addColorStop(1, "#0b0c10");
        g.fillStyle = st; g.fillRect(-2, 34, 454, 50);
        g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(-2, 36, 454, 2);
        /* QR code, white tile with its quiet zone */
        var qx = 66, qy = 112, cell = 4.4, pad = 10, qs = QR_N * cell + pad * 2;
        g.save(); g.shadowColor = "rgba(20,30,55,.18)"; g.shadowBlur = 8; g.shadowOffsetY = 2;
        g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect ? g.roundRect(qx, qy, qs, qs, 8) : g.rect(qx, qy, qs, qs); g.fill(); g.restore();
        g.strokeStyle = "rgba(120,135,160,.35)"; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(qx, qy, qs, qs, 8) : g.rect(qx, qy, qs, qs); g.stroke();
        g.fillStyle = ink;
        /* One path, one fill: separate rects leave hairline gaps when scaled (dotted QR on iOS). */
        g.beginPath();
        for (var r = 0; r < QR_N; r++) for (var c = 0; c < QR_N; c++)
            if (QR_BITS.charAt(r * QR_N + c) === "1") g.rect(qx + pad + c * cell, qy + pad + r * cell, cell, cell);
        g.fill();
        g.textAlign = "center"; g.fillStyle = mute; g.font = "700 9.5px Inter, system-ui, sans-serif"; ls(1.6);
        g.fillText("SCAN TO VISIT", qx + qs / 2, qy + qs + 18);
        /* details */
        var tx = 226;
        g.textAlign = "left"; g.fillStyle = ink; g.font = "800 23px Inter, system-ui, sans-serif"; ls(-0.3);
        g.fillText("Eleazer Arcilla", tx, 138);
        g.fillStyle = mute; g.font = "600 12.5px Inter, system-ui, sans-serif"; ls(0.2);
        g.fillText(d.title || "Senior Software Engineer", tx, 159);
        g.fillStyle = "rgba(120,135,160,.4)"; g.fillRect(tx, 170, 190, 1);
        var rows = [["WEBSITE", d.web || "eleazerarcilla.com"], ["EMAIL", d.email || "contact@eleazerarcilla.com"]];
        if (d.phone) rows.push(["PHONE", d.phone]);
        rows.push(["COUNTRY", d.country || "Singapore"]);
        var y = 192, gap = rows.length > 3 ? 30 : 36;
        rows.forEach(function (row) {
            g.fillStyle = mute; g.font = "700 8.5px Inter, system-ui, sans-serif"; ls(1.4); g.fillText(row[0], tx, y);
            g.fillStyle = ink; g.font = "600 13.5px Inter, system-ui, sans-serif"; ls(0); g.fillText(row[1], tx, y + 14);
            y += gap;
        });
        ls(0);
        g.restore();
    }

    function initGL() {
        if (!SCRIPT_SRC || !window.WebGLRenderingContext) { settle(); return; }
        /* The 3D renderer is for desktop-class devices only. */
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) { settle(); return; }
        var api = {
            getRibbonTexture: function () { if (!tex) buildTex(); return tex; },
            getImage: function () { return imgReady ? img : null; },
            drawBack: drawBack
        };
        import(new URL("lanyard-gl.js?v=109", SCRIPT_SRC).href).then(function (m) {
            var g = m.createGL(panel, api);
            if (g) { gl = g; cv.style.visibility = "hidden"; draw(); }
            settle();
        }).catch(function () { settle(); /* stay on the 2D drawing */ });
    }

    function frame(now) {
        raf = 0;
        lastFrameAt = performance.now();
        if (!running) return;
        var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
        acc += dt;
        var H2 = 1 / 120, n = 0;
        try {
            while (acc >= H2 && n < 8) { step(H2); acc -= H2; n++; }
            draw();
        } catch (err) {
            frameErr = String(err && err.message || err).slice(0, 140);
            /* one bad frame must not freeze the badge for good: try again, but give up if it keeps failing */
            if (++frameFails > 30) { running = false; return; }
            raf = requestAnimationFrame(frame);
            return;
        }
        var speed = Math.abs(cb.x - cb.px) + Math.abs(cb.y - cb.py) + Math.abs(pts[N].x - pts[N].px) + Math.abs(pts[N].y - pts[N].py);
        /* the badge is only at rest once its spin has settled too, not just the strap */
        var spinning = Math.abs(yawV) > 0.02 || Math.abs(Math.sin(yaw - (flipped ? Math.PI : 0))) > 0.003;
        calm = (speed < 0.01 && !drag && !spinning) ? calm + 1 : 0;
        if (calm > 60) { running = false; return; }
        raf = requestAnimationFrame(frame);
    }

    var frameFails = 0, lastFrameAt = 0;
    var booted = false;                       /* the badge is set up only after the page has loaded (see startLanyard) */
    function start() {
        if (!booted) return;
        if (reduced() || !visible || document.hidden) { readAnchor(); draw(); return; }
        calm = 0;
        if (!running) { running = true; last = performance.now(); acc = 0; }
        /* a frame callback the browser dropped (iOS does this around scrolling) leaves raf set but never firing */
        if (raf && performance.now() - lastFrameAt > 250) { cancelAnimationFrame(raf); raf = 0; last = performance.now(); }
        if (!raf) raf = requestAnimationFrame(frame);
    }

    /* A press that barely moves flips the badge, with a springy spin. */
    var downAt = null;
    function flipCard() {
        flipped = !flipped;
        yawV += flipped ? 7.5 : -7.5;      /* the kick that sends it round (back the way it came on the second click); the spring settles it */
        start();
    }
    function tapStart(x, y, t) { downAt = { x: x, y: y, t: t }; }
    function tapEnd(x, y, t) {
        var d = downAt; downAt = null;
        if (d && Math.hypot(x - d.x, y - d.y) < 7 && t - d.t < 400) flipCard();
    }

    var HAS_TOUCH = "ontouchstart" in window;
    var frameErr = "";
    if (hit) {
        hit.addEventListener("pointerdown", function (e) {
            if (reduced()) return;
            if (e.pointerType === "touch" && HAS_TOUCH) return;       /* touch is handled by the touch listeners below */
            var lp0 = localPoint(e); pointer.x = lp0.x; pointer.y = lp0.y; pointer.vx = 0; pointer.t = e.timeStamp;
            var t = pts[N], cx = (t.x + cb.x) / 2, cy = (t.y + cb.y) / 2;
            drag = { ox: lp0.x - cx, oy: lp0.y - cy };
            tapStart(lp0.x, lp0.y, e.timeStamp);
            hit.setPointerCapture(e.pointerId);
            hit.style.cursor = "grabbing";
            e.preventDefault();
            start();
        });
        hit.addEventListener("pointermove", function (e) {
            if (!drag) return;
            var dt = Math.max(0.004, (e.timeStamp - (pointer.t || e.timeStamp - 16)) / 1000);
            var lp1 = localPoint(e);
            pointer.vx = pointer.vx * 0.6 + ((lp1.x - pointer.x) / dt) * 0.4;
            pointer.t = e.timeStamp;
            pointer.x = lp1.x; pointer.y = lp1.y;
        });
        var release = function (e) {
            if (!drag) return;
            if (e.type === "pointerup") { var lpu = localPoint(e); tapEnd(lpu.x, lpu.y, e.timeStamp); } else downAt = null;
            drag = null; hit.style.cursor = "grab";
            if (hit.hasPointerCapture(e.pointerId)) hit.releasePointerCapture(e.pointerId);
            start();
        };
        hit.addEventListener("pointerup", release);
        hit.addEventListener("pointercancel", release);
    }

    /* debug probe: strap stretch (max segment length / rest length) and swing state */
    /* where the badge is on screen (viewport pixels, a rotated rectangle), so other UI can tell what is under it */
    window.__lanyardCardRect = function () {
        if (!visible || !booted) return null;
        var c = pose(), top = TOP, r = panel.getBoundingClientRect();
        var ax = c.x - Math.sin(c.a) * (top + cardH / 2), ay = c.y + Math.cos(c.a) * (top + cardH / 2);
        return { cx: r.left + ax, cy: r.top + ay, w: cardW * Math.max(0.05, Math.abs(Math.cos(yaw))), h: cardH, a: c.a };
    };
    window.__lanyardSetYaw = function (v) { yaw = v; yawV = 0; start(); };
    window.__lanyardDbg = function () {
        var m = 0, k;
        for (k = 0; k < N; k++) {
            m = Math.max(m, Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y) / seg, Math.hypot(ptsR[k + 1].x - ptsR[k].x, ptsR[k + 1].y - ptsR[k].y) / seg);
        }
        return { L: pts.map(function (q) { return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]; }), R: ptsR.map(function (q) { return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]; }), seg: Math.round(seg * 10) / 10, maxStretch: +m.toFixed(3), cardLink: +(Math.hypot(cb.x - pts[N].x, cb.y - pts[N].y) / link).toFixed(3), x: Math.round(cb.x), y: Math.round(cb.y), running: running };
    };
    /* "Just hung up": raised and thrown to one side, so it drops, swings and settles. */
    var arrived = false, arriveWanted = false, rendererReady = false;
    /* The swing waits until the badge can actually be drawn (3D loaded, or the 2D fallback is in use) */
    function settle() { rendererReady = true; var was = glPending; glPending = false; if (was && !gl) draw(); tryArrive(); }
    function tryArrive() {
        if (arrived || !arriveWanted || !rendererReady) return;
        arrived = true;
        window.setTimeout(arrive, 60);
        window.setTimeout(function () { document.dispatchEvent(new Event("lanyard-ready")); }, 120);
    }
    function arrive() {
        if (reduced() || !pts.length) return;
        var k = u / 100;
        /* Gentle settle: the larger swing made first load heavy. */
        pts[N].px = pts[N].x - 1.5 * k; cb.px = cb.x - 1.5 * k;
        cb.py = cb.y - 0.9 * k;                      /* a small downward kick: it bounces on the strap */
        for (var i = 1; i < N; i++) { pts[i].px = pts[i].x - 0.5 * k; ptsR[i].px = ptsR[i].x - 0.5 * k; }
        yawV = 1.0;
        start();
    }

    function boot() { layout(); draw(); start(); }

    if (typeof ResizeObserver !== "undefined") {
        var t0;
        new ResizeObserver(function () { clearTimeout(t0); t0 = setTimeout(boot, 80); }).observe(panel);
    }
    window.addEventListener("resize", function () { clearTimeout(window.__lanyardT); window.__lanyardT = setTimeout(boot, 120); });
    /* Touch (iOS and other phones): the badge is found by hit-testing the finger position against the badge's rectangle */
    function onCard(px, py) {
        var c = pose(), top = TOP, ax = c.x - Math.sin(c.a) * (top + cardH / 2), ay = c.y + Math.cos(c.a) * (top + cardH / 2);
        var dx = px - ax, dy = py - ay, ca = Math.cos(c.a), sa = Math.sin(c.a);
        var lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca, pad = 16;
        return Math.abs(lx) < cardW / 2 + pad && Math.abs(ly) < cardH / 2 + pad;
    }
    function touchLocal(t) { var r = panel.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }
    var touchId = null;
    panel.addEventListener("touchstart", function (e) {
        if (reduced() || touchId !== null || !e.changedTouches.length) return;
        var t = e.changedTouches[0], lp = touchLocal(t);
        if (!onCard(lp.x, lp.y)) return;
        touchId = t.identifier;
        pointer.x = lp.x; pointer.y = lp.y; pointer.vx = 0; pointer.t = e.timeStamp;
        var tt = pts[N], cx = (tt.x + cb.x) / 2, cy = (tt.y + cb.y) / 2;
        drag = { ox: lp.x - cx, oy: lp.y - cy };
        tapStart(lp.x, lp.y, e.timeStamp);
        e.preventDefault();
        start();
    }, { passive: false });
    panel.addEventListener("touchmove", function (e) {
        if (touchId === null) return;
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (t.identifier !== touchId) continue;
            var lp = touchLocal(t), dt = Math.max(0.004, (e.timeStamp - (pointer.t || e.timeStamp - 16)) / 1000);
            pointer.vx = pointer.vx * 0.6 + ((lp.x - pointer.x) / dt) * 0.4;
            pointer.t = e.timeStamp; pointer.x = lp.x; pointer.y = lp.y;
            e.preventDefault();
        }
    }, { passive: false });
    function touchEnd(e) {
        if (touchId === null) return;
        for (var i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                if (e.type === "touchend") { var lpt = touchLocal(e.changedTouches[i]); tapEnd(lpt.x, lpt.y, e.timeStamp); } else downAt = null;
                touchId = null; drag = null; start(); break;
            }
        }
    }
    panel.addEventListener("touchend", touchEnd);
    panel.addEventListener("touchcancel", touchEnd);

    /* No scroll physics: the lanyard moves only when it is dragged, and once when it first appears. */
    if (typeof IntersectionObserver !== "undefined") {
        new IntersectionObserver(function (en) {
            visible = en[0].isIntersecting;
            cv.style.visibility = visible ? "" : "hidden";
            if (hit) hit.style.display = visible ? "" : "none";
            if (visible) { arriveWanted = true; tryArrive(); }
            if (visible) start(); else running = false;
        }, { rootMargin: "300px 0px" }).observe(panel);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    /* iOS scroll momentum can leave the loop stopped or its clock stale: wake it on scroll. */
    window.addEventListener("scroll", function () { if (visible && booted) { frameFails = 0; start(); } }, { passive: true });
    new MutationObserver(function () { draw(); }).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });

    /* Diagnostics: open the page with ?lanyarddebug=1 to see what the lanyard receives. */
    if (/[?&]lanyarddebug=1/.test(window.location.search)) {
        var box2 = document.createElement("pre");
        box2.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;max-width:92vw;font:11px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.82);border-radius:8px;white-space:pre-wrap;pointer-events:none";
        document.body.appendChild(box2);
        var cnt = { pdown: 0, pmove: 0, pup: 0, tstart: 0, tmove: 0, tend: 0, err: "" };
        window.addEventListener("error", function (e) { cnt.err = String(e.message || e).slice(0, 120); });
        window.addEventListener("unhandledrejection", function (e) { cnt.err = "rej:" + String(e.reason).slice(0, 110); });
        document.addEventListener("pointerdown", function (e) { cnt.pdown++; cnt.ptype = e.pointerType; cnt.ptarget = (e.target && (e.target.id || e.target.tagName)); }, true);
        document.addEventListener("pointermove", function () { cnt.pmove++; }, true);
        document.addEventListener("pointerup", function () { cnt.pup++; }, true);
        document.addEventListener("touchstart", function (e) { cnt.tstart++; cnt.ttarget = (e.target && (e.target.id || e.target.tagName)); }, true);
        document.addEventListener("touchmove", function () { cnt.tmove++; }, true);
        document.addEventListener("touchend", function () { cnt.tend++; }, true);
        window.setInterval(function () {
            var h = hit && hit.getBoundingClientRect(), pr = panel.getBoundingClientRect();
            var top = h ? document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2) : null;
            box2.textContent = "lanyard debug\n" +
                "3D:" + !!gl + " touch:" + ("ontouchstart" in window) + " hover:" + window.matchMedia("(hover: hover)").matches + " fine:" + window.matchMedia("(pointer: fine)").matches + "\n" +
                "running:" + running + " drag:" + !!drag + " visible:" + visible + " reduced:" + reduced() + "\n" +
                "panel " + Math.round(pr.width) + "x" + Math.round(pr.height) + "  canvas " + W + "x" + H + "\n" +
                "hit " + (h ? Math.round(h.width) + "x" + Math.round(h.height) + " @" + Math.round(h.left) + "," + Math.round(h.top) : "none") + " top:" + (top && (top.id || top.tagName)) + "\n" +
                "ptr down/move/up " + cnt.pdown + "/" + cnt.pmove + "/" + cnt.pup + " (" + (cnt.ptype || "-") + " on " + (cnt.ptarget || "-") + ")\n" +
                "touch start/move/end " + cnt.tstart + "/" + cnt.tmove + "/" + cnt.tend + " (on " + (cnt.ttarget || "-") + ")\n" +
                "err: " + (cnt.err || "none") + " | frame err: " + (frameErr || "none");
        }, 400);
    }

    /* Start once the page is loaded and idle: the badge is decoration. */
    function startLanyard() { loadImage(); boot(); booted = true; initGL(); start(); }
    function whenIdle() {
        if (window.requestIdleCallback) window.requestIdleCallback(startLanyard, { timeout: 2500 });
        else window.setTimeout(startLanyard, 300);
    }
    if (document.readyState === "complete") whenIdle(); else window.addEventListener("load", whenIdle, { once: true });
})();
