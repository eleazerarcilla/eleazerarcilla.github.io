(function () {
    "use strict";

    var STORAGE_KEY = "site-settings-v1";
    var DEFAULTS = {
        theme: "light",
        glassClarity: 55,
        fontScale: 1,
        fontWeight: 400,
        contrast: "normal",
        reduceMotion: false,
        background: "glyphs",
        bgColors: null
    };

    var root = document.documentElement;

    /* Refraction relies on Chromium's filter-on-backdrop behavior; everything else gets a plain blur (see */
    var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    var isChromium = brands.some(function (b) { return /Chromium/i.test(b.brand); }) ||
        (/Chrome\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent)) || !!window.chrome;
    if (!isChromium) root.classList.add("lens-fallback");

    function loadSettings() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return Object.assign({}, DEFAULTS);
            var parsed = JSON.parse(raw);
            return Object.assign({}, DEFAULTS, parsed);
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            /* localStorage unavailable (private mode, quota) - fail silently */
        }
    }

    var settings = loadSettings();
    /* Font size / weight controls were removed; ignore any values saved earlier. */
    settings.fontScale = 1;
    settings.fontWeight = 400;

    /* "Reduce motion": every Web Animations call collapses to 1ms while the setting is on (CSS animations are handled by */
    var nativeAnimate = Element.prototype.animate;
    if (nativeAnimate) {
        Element.prototype.animate = function (keyframes, options) {
            if (settings.reduceMotion) {
                options = typeof options === "number" ? 1 : Object.assign({}, options, { duration: 1, delay: 0, endDelay: 0 });
            }
            return nativeAnimate.call(this, keyframes, options);
        };
    }

    function applySettings() {
        root.setAttribute("data-theme", effTheme());
        if (settings.contrast === "high") {
            root.setAttribute("data-contrast", "high");
        } else {
            root.removeAttribute("data-contrast");
        }
        if (settings.reduceMotion) root.setAttribute("data-motion", "reduced");
        else root.removeAttribute("data-motion");
        root.style.setProperty("--glass-clarity", settings.glassClarity);
        root.style.setProperty("--font-scale", settings.fontScale);
        root.style.setProperty("--font-weight-base", settings.fontWeight);
        applyBackdropArt();
    }

    /* Procedural backdrop art: a fresh minimalist composition on every visit a few large flat shapes (blob, circle, pill */
    var art = null;

    function rnd(min, max) { return min + Math.random() * (max - min); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    function blobPath(r) {
        var n = 8, pts = [], i;
        for (i = 0; i < n; i++) {
            var ang = (i / n) * Math.PI * 2, rad = r * rnd(0.72, 1.12);
            pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
        }
        var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
        for (i = 0; i < n; i++) {
            var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += "C" + c1[0].toFixed(1) + " " + c1[1].toFixed(1) + " " + c2[0].toFixed(1) + " " + c2[1].toFixed(1) +
                " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
        }
        return d + "Z";
    }

    function polyPath(pts) {
        return "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L") + "Z";
    }

    // Lobed shape: k=3 rounded triangle, 4 squircle-ish, 5-7 flower.
    function petalPath(r) {
        var k = 3 + Math.floor(Math.random() * 5), amp = rnd(0.12, 0.3), pts = [];
        for (var i = 0; i < 90; i++) {
            var t = (i / 90) * Math.PI * 2, rad = r * (0.72 + amp * Math.cos(k * t));
            pts.push([Math.cos(t) * rad, Math.sin(t) * rad]);
        }
        return polyPath(pts);
    }

    // Thick flowing ribbon.
    function wavePath(r) {
        var w = r * 2.4, th = r * 0.34, amp = r * rnd(0.25, 0.5), ph = rnd(0, 6.28), fq = rnd(1.2, 2.2);
        var top = [], bot = [], n = 48;
        for (var i = 0; i <= n; i++) {
            var x = -w / 2 + (w * i) / n, y = Math.sin((i / n) * Math.PI * fq * 2 + ph) * amp;
            top.push([x, y - th / 2]);
            bot.unshift([x, y + th / 2]);
        }
        return polyPath(top.concat(bot));
    }

    // Code glyphs as chunky round-capped strokes in a -1..1 unit box.
    var BRACE = "M0.3 -0.9C-0.1 -0.9 -0.1 -0.6 -0.1 -0.3C-0.1 -0.05 -0.35 0 -0.5 0C-0.35 0 -0.1 0.05 -0.1 0.3C-0.1 0.6 -0.1 0.9 0.3 0.9";
    var BRACKET = "M0.3 -0.9H-0.3V0.9H0.3";
    var GLYPHS = [
        { d: "M0.55 -0.8L-0.5 0L0.55 0.8" },
        { d: "M-0.55 -0.8L0.5 0L-0.55 0.8" },
        { d: "M0.4 -0.9L-0.4 0.9" },
        { d: BRACE },
        { d: BRACE, flip: true },
        { d: BRACKET },
        { d: BRACKET, flip: true },
        { d: "M-0.9 0H-0.1M-0.5 -0.4V0.4M0.1 0H0.9M0.5 -0.4V0.4", wide: true },
        { d: "M-0.9 0H-0.1M-0.5 -0.4V0.4M0.15 -0.22H0.9M0.15 0.22H0.9", wide: true },
        { d: "M-0.9 -0.2H0.1M-0.9 0.2H0.1M0.2 -0.5L0.75 0L0.2 0.5", wide: true },
        { d: "M-0.5 -0.5L-0.9 0L-0.5 0.5M0.5 -0.5L0.9 0L0.5 0.5M0.15 -0.6L-0.15 0.6", wide: true },
        { d: "M0 -0.35V-0.34M0 0.25C0 0.5 -0.1 0.7 -0.3 0.8" },
        /* the letters of "eleaz" */
        { d: "M-0.62 0H0.62C0.62 -0.45 0.32 -0.7 0 -0.7C-0.5 -0.7 -0.65 -0.3 -0.65 0C-0.65 0.4 -0.4 0.7 0 0.7C0.3 0.7 0.5 0.55 0.6 0.4" },
        { d: "M0 -0.9V0.9" },
        { d: "M0.5 0C0.5 -0.45 0.2 -0.6 -0.05 -0.6C-0.45 -0.6 -0.6 -0.2 -0.6 0.1C-0.6 0.45 -0.35 0.65 -0.05 0.65C0.25 0.65 0.5 0.4 0.5 0M0.5 -0.6V0.65" },
        { d: "M-0.6 -0.6H0.6L-0.6 0.6H0.6" }
    ];

    function glyphSvg(sh, dark) {
        var stroke = "hsla(" + glyphHue(sh.h).toFixed(0) + "," + ((dark ? 75 : 65) * glyphSat()).toFixed(0) + "%," + (dark ? "68%,0.32" : "52%,0.2") + ")";
        var scale = sh.size * (sh.glyph.wide ? 0.8 : 0.6);
        return "<g filter='url(#depth)'><g transform='translate(" + sh.cx.toFixed(1) + " " + sh.cy.toFixed(1) + ") rotate(" + sh.rot.toFixed(0) + ") scale(" +
            (sh.glyph.flip ? -scale : scale).toFixed(1) + " " + scale.toFixed(1) + ")' fill='none' stroke='" + stroke +
            "' stroke-width='0.26' stroke-linecap='round' stroke-linejoin='round'><path d='" + sh.glyph.d + "'/></g></g>";
    }

    /* Inner depth: an inner shadow along the upper-left inside edge plus a soft highlight along the lower-right */
    function depthDefs(dark) {
        var shadow = dark ? "rgba(0,0,0,0.8)" : "rgba(15,35,75,0.5)";
        var light = dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.55)";
        return "<defs><filter id='depth' x='-15%' y='-15%' width='130%' height='130%' color-interpolation-filters='sRGB'>" +
            "<feFlood flood-color='" + shadow + "' result='sc'/>" +
            "<feComposite in='sc' in2='SourceAlpha' operator='out' result='sinv'/>" +
            "<feGaussianBlur in='sinv' stdDeviation='4.5' result='sb'/>" +
            "<feOffset in='sb' dx='1.5' dy='3' result='so'/>" +
            "<feComposite in='so' in2='SourceAlpha' operator='in' result='inner'/>" +
            "<feFlood flood-color='" + light + "' result='lc'/>" +
            "<feComposite in='lc' in2='SourceAlpha' operator='out' result='linv'/>" +
            "<feGaussianBlur in='linv' stdDeviation='2.5' result='lb'/>" +
            "<feOffset in='lb' dx='-2' dy='-3' result='lo'/>" +
            "<feComposite in='lo' in2='SourceAlpha' operator='in' result='rim'/>" +
            "<feMerge><feMergeNode in='SourceGraphic'/><feMergeNode in='inner'/><feMergeNode in='rim'/></feMerge>" +
            "</filter></defs>";
    }

    function generateArt() {
        /* Only calm palettes: green, blue or grey (grey = same blue hue at very low saturation). */
        var fam = pick([{ h: 150, sat: 1 }, { h: 212, sat: 1 }, { h: 214, sat: 0.1 }]);
        var hue = fam.h;
        var a = { hue: hue, sat: fam.sat, orbs: [], shapes: [] };
        var orbCount = 2 + Math.floor(Math.random() * 2);
        for (var i = 0; i < orbCount; i++) {
            a.orbs.push({ x: rnd(5, 95), y: rnd(8, 92), r: rnd(32, 50), h: (hue + rnd(-12, 12) + 360) % 360 });
        }
        /* Placement: glyphs go to named zones around the edges and never into the middle, where the page text sits. */
        var KEEP_OUT = { x0: 290, x1: 910, y0: 240, y1: 630 };
        var ZONES = [
            { x: [930, 1200], y: [30, 230], size: [150, 290] },
            { x: [20, 420],   y: [30, 220], size: [140, 280] },
            { x: [420, 880],  y: [10, 170], size: [110, 200] },
            { x: [-30, 250],  y: [260, 600], size: [150, 300] },
            { x: [950, 1230], y: [260, 600], size: [150, 300] },
            { x: [0, 420],    y: [630, 820], size: [140, 280] },
            { x: [780, 1200], y: [630, 820], size: [140, 280] },
            { x: [430, 780],  y: [690, 830], size: [110, 200] }
        ];
        /* top-right first (always behind the header buttons), then one zone from the top band */
        var first = [0, pick([1, 2])];
        var rest = [];
        for (var zi = 0; zi < ZONES.length; zi++) if (first.indexOf(zi) < 0) rest.push(zi);
        for (var si = rest.length - 1; si > 0; si--) {
            var sj = Math.floor(Math.random() * (si + 1));
            var tmp = rest[si]; rest[si] = rest[sj]; rest[sj] = tmp;
        }
        var order = first.concat(rest);

        var deck = [];
        function nextGlyph() {
            if (!deck.length) {
                deck = GLYPHS.slice();
                for (var di = deck.length - 1; di > 0; di--) {
                    var dj = Math.floor(Math.random() * (di + 1));
                    var t2 = deck[di]; deck[di] = deck[dj]; deck[dj] = t2;
                }
            }
            return deck.pop();
        }

        function hitsKeepOut(cx, cy, r) {
            var nx = Math.max(KEEP_OUT.x0, Math.min(cx, KEEP_OUT.x1));
            var ny = Math.max(KEEP_OUT.y0, Math.min(cy, KEEP_OUT.y1));
            return Math.hypot(cx - nx, cy - ny) < r;
        }

        var glyphTarget = 7 + Math.floor(Math.random() * 3);
        var placed = [];
        for (var q = 0; q < order.length && placed.length < glyphTarget; q++) {
            var zone = ZONES[order[q]];
            var glyph = nextGlyph();
            var size = rnd(zone.size[0], zone.size[1]);
            var ok = false;
            for (var tries = 0; tries < 80 && !ok; tries++) {
                if (tries > 0 && tries % 20 === 0) size *= 0.85;
                var radius = size * (glyph.wide ? 0.8 : 0.6) * 1.15;
                var cx = rnd(zone.x[0], zone.x[1]);
                var cy = rnd(zone.y[0], zone.y[1]);
                ok = !hitsKeepOut(cx, cy, radius) && placed.every(function (o) {
                    return Math.hypot(cx - o.cx, cy - o.cy) > radius + o.r + 24;
                });
                if (ok) {
                    placed.push({ cx: cx, cy: cy, r: radius });
                    a.shapes.push({
                        type: "glyph", glyph: glyph, cx: cx, cy: cy, size: size,
                        rot: pick([0, 0, rnd(-35, 35), rnd(-35, 35)]), h: (hue + rnd(-12, 12) + 360) % 360
                    });
                }
            }
        }
        return a;
    }

    function shapeSvg(sh, dark) {
        if (sh.type === "glyph") return glyphSvg(sh, dark);
        var fill = "hsla(" + sh.h.toFixed(0) + "," + (dark ? "75%,62%,0.18" : "70%,60%,0.16") + ")";
        var g = "<g transform='translate(" + sh.cx.toFixed(1) + " " + sh.cy.toFixed(1) + ") rotate(" + sh.rot.toFixed(0) + ")' fill='" + fill + "'>";
        var r = sh.size;
        var f = function (v) { return v.toFixed(1); };
        if (sh.path) g += "<path d='" + sh.path + "'/>";
        else if (sh.type === "drop") {
            g += "<path d='M0 " + f(-r) + "C" + f(r * 0.15) + " " + f(-r * 0.5) + " " + f(r * 0.8) + " " + f(-r * 0.2) + " " + f(r * 0.8) + " " + f(r * 0.3) +
                "A" + f(r * 0.8) + " " + f(r * 0.8) + " 0 0 1 " + f(-r * 0.8) + " " + f(r * 0.3) + "C" + f(-r * 0.8) + " " + f(-r * 0.2) + " " + f(-r * 0.15) + " " + f(-r * 0.5) + " 0 " + f(-r) + "Z'/>";
        } else if (sh.type === "arch") {
            [[1, 0.78], [0.62, 0.4]].forEach(function (b) {
                var ro = r * b[0], ri = r * b[1];
                g += "<path d='M" + f(-ro) + " 0A" + f(ro) + " " + f(ro) + " 0 0 1 " + f(ro) + " 0L" + f(ri) + " 0A" + f(ri) + " " + f(ri) + " 0 0 0 " + f(-ri) + " 0Z'/>";
            });
        } else {
            g += "<path d='M0 " + f(-r) + "A" + f(r) + " " + f(r) + " 0 1 0 0 " + f(r) + "A" + f(r * 0.62) + " " + f(r) + " 0 1 1 0 " + f(-r) + "Z'/>";
        }
        return g + "</g>";
    }

    /* Background themes Five styles, each generated fresh (random layout) on every page load */
    var BG_THEMES = ["glyphs", "aurora", "grid", "shards", "halftone", "constellation", "hex", "oneday"];
    var HUE_MIN = 135, HUE_MAX = 245;
    var PALETTES = [[214, 196, 232], [172, 150, 196], [204, 226, 244], [160, 185, 215]];
    var bgState = {};
    var SVG_OPEN = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>";
    var KEEP = { x0: 290, x1: 910, y0: 240, y1: 630 };

    function svgLayer(svg) {
        return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\") center / cover no-repeat";
    }

    function hsla(h, s2, l, a) {
        return "hsla(" + ((h % 360 + 360) % 360).toFixed(0) + "," + s2 + "%," + l + "%," + a + ")";
    }

    function clampHue(v) { return Math.max(HUE_MIN, Math.min(HUE_MAX, Number(v))); }

    /* the three-stop palette in effect: the user's two colours (with their blend in the middle) or the layout's random */
    function effPal(st) {
        var c = settings.bgColors;
        if (c && c.length === 2) {
            var a = clampHue(c[0]), b = clampHue(c[1]);
            return [a, (a + b) / 2, b];
        }
        return st.pal;
    }

    /* hue at position t (0..1) along the palette gradient */
    function gradHue(st, t) {
        var p = effPal(st);
        t = Math.max(0, Math.min(1, t));
        return t < 0.5 ? p[0] + (p[1] - p[0]) * (t * 2) : p[1] + (p[2] - p[1]) * ((t - 0.5) * 2);
    }

    /* glyph shapes were generated around one family hue (+-12); map that spread onto the A..B gradient when custom */
    function glyphHue(h) {
        var c = settings.bgColors;
        if (!(c && c.length === 2) || !art) return h;
        var t = Math.max(0, Math.min(1, (h - art.hue + 12) / 24));
        return clampHue(c[0]) + (clampHue(c[1]) - clampHue(c[0])) * t;
    }

    function glyphSat() {
        return (settings.bgColors && settings.bgColors.length === 2) ? 1 : art.sat;
    }

    /* luminance mask: dim in the middle, full strength toward the edges */
    function fadeDefs() {
        return "<defs><radialGradient id='f' gradientUnits='userSpaceOnUse' cx='600' cy='400' r='560'>" +
            "<stop offset='0' stop-color='#1c1c1c'/><stop offset='.45' stop-color='#2e2e2e'/><stop offset='1' stop-color='#fff'/></radialGradient>" +
            "<mask id='m'><rect width='1200' height='800' fill='url(#f)'/></mask></defs>";
    }

    function glowLayer(x, y, r, color) {
        return "radial-gradient(circle at " + x.toFixed(1) + "% " + y.toFixed(1) + "%, " + color + " 0, transparent " + r.toFixed(0) + "%)";
    }

    function circleHitsKeep(cx, cy, r) {
        var nx = Math.max(KEEP.x0, Math.min(cx, KEEP.x1));
        var ny = Math.max(KEEP.y0, Math.min(cy, KEEP.y1));
        return Math.hypot(cx - nx, cy - ny) < r;
    }

    function glyphLayers(dark) {
        if (!art) art = generateArt();
        var svg = SVG_OPEN + depthDefs(dark);
        art.shapes.forEach(function (sh) { svg += shapeSvg(sh, dark); });
        svg += "</svg>";
        var layers = [svgLayer(svg)];
        art.orbs.forEach(function (o) {
            var h = glyphHue(o.h);
            var col = dark ? "hsla(" + h.toFixed(0) + "," + (80 * glyphSat()).toFixed(0) + "%,55%,0.22)" : "hsla(" + h.toFixed(0) + "," + (85 * glyphSat()).toFixed(0) + "%,68%,0.18)";
            layers.push(glowLayer(o.x, o.y, o.r, col));
        });
        return layers;
    }

    /* Aurora: deep colour blobs plus crisp translucent discs */
    function auroraLayers(dark) {
        var st = bgState.aurora;
        if (!st) {
            st = bgState.aurora = { pal: pick(PALETTES), blobs: [], discs: [] };
            for (var i = 0; i < 4; i++) st.blobs.push({ x: rnd(0, 100), y: rnd(0, 100), r: rnd(45, 75), t: Math.max(0, Math.min(1, i / 3 + rnd(-0.08, 0.08))) });
            var tries = 0;
            while (st.discs.length < 6 && tries++ < 200) {
                var d = { cx: rnd(30, 1170), cy: rnd(30, 770), r: rnd(45, 150), t: Math.random() };
                if (circleHitsKeep(d.cx, d.cy, d.r + 10)) continue;
                if (st.discs.some(function (o) { return Math.hypot(d.cx - o.cx, d.cy - o.cy) < d.r + o.r + 10; })) continue;
                st.discs.push(d);
            }
        }
        var svg = SVG_OPEN;
        st.discs.forEach(function (d) {
            var h = gradHue(st, d.t);
            svg += "<circle cx='" + d.cx.toFixed(0) + "' cy='" + d.cy.toFixed(0) + "' r='" + d.r.toFixed(0) + "' fill='" +
                (dark ? hsla(h, 80, 46, 0.26) : hsla(h, 80, 46, 0.3)) + "' stroke='" +
                (dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.8)") + "' stroke-width='2'/>";
        });
        svg += "</svg>";
        var layers = [svgLayer(svg)];
        st.blobs.forEach(function (b) {
            var h = gradHue(st, b.t);
            layers.push(glowLayer(b.x, b.y, b.r, dark ? hsla(h, 80, 36, 0.5) : hsla(h, 75, 52, 0.4)));
        });
        return layers;
    }

    /* Grid: a fine rotated grid with heavier lines every fourth cell */
    function gridLayers(dark) {
        var st = bgState.grid;
        if (!st) {
            st = bgState.grid = {
                pal: pick(PALETTES), pitch: Math.round(rnd(40, 62)), angle: rnd(-14, 14),
                blobs: [{ x: rnd(0, 40), y: rnd(0, 100), r: rnd(50, 70), t: 0.1 }, { x: rnd(60, 100), y: rnd(0, 100), r: rnd(50, 70), t: 0.9 }]
            };
        }
        var P = st.pitch, P4 = P * 4, hl = gradHue(st, 0.3);
        var minor = dark ? hsla(hl, 70, 82, 0.2) : hsla(hl, 45, 36, 0.26);
        var major = dark ? hsla(hl, 75, 86, 0.38) : hsla(hl, 50, 30, 0.42);
        var rot = "rotate(" + st.angle.toFixed(1) + " 600 400)";
        var svg = SVG_OPEN + fadeDefs() + "<defs>" +
            "<pattern id='p1' width='" + P + "' height='" + P + "' patternUnits='userSpaceOnUse' patternTransform='" + rot + "'><path d='M" + P + " 0H0V" + P + "' fill='none' stroke='" + minor + "' stroke-width='1'/></pattern>" +
            "<pattern id='p2' width='" + P4 + "' height='" + P4 + "' patternUnits='userSpaceOnUse' patternTransform='" + rot + "'><path d='M" + P4 + " 0H0V" + P4 + "' fill='none' stroke='" + major + "' stroke-width='1.6'/></pattern></defs>" +
            "<g mask='url(#m)'><rect x='-500' y='-500' width='2200' height='1800' fill='url(#p1)'/><rect x='-500' y='-500' width='2200' height='1800' fill='url(#p2)'/></g></svg>";
        var layers = [svgLayer(svg)];
        st.blobs.forEach(function (b) {
            var h = gradHue(st, b.t);
            layers.push(glowLayer(b.x, b.y, b.r, dark ? hsla(h, 75, 34, 0.45) : hsla(h, 70, 52, 0.3)));
        });
        return layers;
    }

    /* Shards: overlapping translucent glass facets with one bright edge each */
    function shardsLayers(dark) {
        var st = bgState.shards;
        if (!st) {
            st = bgState.shards = { pal: pick(PALETTES), shards: [] };
            var tries = 0;
            while (st.shards.length < 15 && tries++ < 400) {
                var r = rnd(90, 250), cx = rnd(-60, 1260), cy = rnd(-60, 860);
                if (circleHitsKeep(cx, cy, r * 0.8)) continue;
                var k = 3 + Math.floor(Math.random() * 3), rot = rnd(0, 6.283), pts = [];
                for (var i = 0; i < k; i++) {
                    var ang = rot + (i / k) * 6.283 + rnd(-0.35, 0.35), rad = r * rnd(0.6, 1);
                    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
                }
                st.shards.push({ pts: pts, t: Math.random(), cx: cx, cy: cy });
            }
        }
        var svg = SVG_OPEN;
        st.shards.forEach(function (sh) {
            var h = gradHue(st, sh.t);
            var d = "M" + sh.pts.map(function (p) { return p[0].toFixed(0) + " " + p[1].toFixed(0); }).join("L") + "Z";
            svg += "<path d='" + d + "' fill='" + (dark ? hsla(h, 78, 46, 0.24) : hsla(h, 78, 48, 0.24)) + "' stroke='" +
                (dark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.7)") + "' stroke-width='1.4' stroke-linejoin='round'/>";
            svg += "<path d='M" + sh.pts[0][0].toFixed(0) + " " + sh.pts[0][1].toFixed(0) + "L" + sh.pts[1][0].toFixed(0) + " " + sh.pts[1][1].toFixed(0) +
                "' stroke='" + (dark ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.95)") + "' stroke-width='2.4' stroke-linecap='round'/>";
        });
        svg += "</svg>";
        return [svgLayer(svg),
            glowLayer(15, 20, 60, dark ? hsla(gradHue(st, 0), 75, 32, 0.45) : hsla(gradHue(st, 0), 70, 52, 0.28)),
            glowLayer(85, 80, 60, dark ? hsla(gradHue(st, 1), 75, 32, 0.45) : hsla(gradHue(st, 1), 70, 52, 0.28))];
    }

    /* Halftone: a dot matrix whose dots swell toward two off-centre focal points */
    function halftoneLayers(dark) {
        var st = bgState.halftone;
        if (!st) {
            st = bgState.halftone = {
                pal: pick(PALETTES), pitch: Math.round(rnd(34, 44)),
                f1: { x: rnd(-100, 300), y: rnd(-100, 300) }, f2: { x: rnd(900, 1300), y: rnd(500, 900) },
                D: rnd(420, 620)
            };
        }
        var P = st.pitch, dots = "";
        for (var y = P / 2; y < 800 + P; y += P) {
            for (var x = P / 2; x < 1200 + P; x += P) {
                var d1 = Math.hypot(x - st.f1.x, y - st.f1.y), d2 = Math.hypot(x - st.f2.x, y - st.f2.y);
                var f = Math.max(0, 1 - Math.min(d1, d2) / st.D);
                var r = 1.1 + 9 * Math.pow(f, 1.2);
                if (r > 1.2) dots += "<circle cx='" + x.toFixed(0) + "' cy='" + y.toFixed(0) + "' r='" + r.toFixed(1) + "'/>";
            }
        }
        var h0 = gradHue(st, 0), h1 = gradHue(st, 0.5), h2 = gradHue(st, 1);
        var svg = SVG_OPEN + fadeDefs() + "<defs><linearGradient id='hg' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='1200' y2='0'>" +
            "<stop offset='0' stop-color='" + hsla(h0, 78, dark ? 62 : 34, 1) + "'/>" +
            "<stop offset='.5' stop-color='" + hsla(h1, 78, dark ? 64 : 36, 1) + "'/>" +
            "<stop offset='1' stop-color='" + hsla(h2, 78, dark ? 62 : 34, 1) + "'/></linearGradient></defs>" +
            "<g mask='url(#m)' fill='url(#hg)' fill-opacity='" + (dark ? 0.62 : 0.6) + "'>" + dots + "</g></svg>";
        return [svgLayer(svg),
            glowLayer(8, 12, 55, dark ? hsla(h0, 75, 32, 0.4) : hsla(h0, 70, 52, 0.26)),
            glowLayer(92, 88, 55, dark ? hsla(h2, 75, 32, 0.4) : hsla(h2, 70, 52, 0.26))];
    }

    /* Constellation: scattered points joined to their nearest neighbours */
    function constellationLayers(dark) {
        var st = bgState.constellation;
        if (!st) {
            st = bgState.constellation = { pal: pick(PALETTES), pts: [], edges: [] };
            var tries = 0;
            while (st.pts.length < 70 && tries++ < 1500) {
                var x = rnd(10, 1190), y = rnd(10, 790);
                if (x > KEEP.x0 - 20 && x < KEEP.x1 + 20 && y > KEEP.y0 - 20 && y < KEEP.y1 + 20) continue;
                if (st.pts.some(function (p) { return Math.hypot(x - p.x, y - p.y) < 58; })) continue;
                st.pts.push({ x: x, y: y, r: Math.random() < 0.12 ? rnd(4.5, 7) : rnd(1.6, 3.4) });
            }
            var seen = {};
            st.pts.forEach(function (p, i) {
                var near = [];
                st.pts.forEach(function (q, j) {
                    if (i === j) return;
                    var d = Math.hypot(p.x - q.x, p.y - q.y);
                    if (d < 190) near.push([d, j]);
                });
                near.sort(function (a, b) { return a[0] - b[0]; });
                near.slice(0, 2).forEach(function (n) {
                    var key = Math.min(i, n[1]) + "-" + Math.max(i, n[1]);
                    if (!seen[key]) { seen[key] = 1; st.edges.push([i, n[1]]); }
                });
            });
        }
        var svg = SVG_OPEN + "<g stroke-width='1.2' stroke-linecap='round'>";
        st.edges.forEach(function (e) {
            var a = st.pts[e[0]], b = st.pts[e[1]], h = gradHue(st, (a.x + b.x) / 2400);
            svg += "<line x1='" + a.x.toFixed(0) + "' y1='" + a.y.toFixed(0) + "' x2='" + b.x.toFixed(0) + "' y2='" + b.y.toFixed(0) +
                "' stroke='" + (dark ? hsla(h, 70, 72, 0.5) : hsla(h, 65, 34, 0.45)) + "'/>";
        });
        svg += "</g>";
        st.pts.forEach(function (p) {
            var h = gradHue(st, p.x / 1200);
            if (p.r > 4) svg += "<circle cx='" + p.x.toFixed(0) + "' cy='" + p.y.toFixed(0) + "' r='" + (p.r * 3).toFixed(1) + "' fill='" + (dark ? hsla(h, 80, 60, 0.18) : hsla(h, 75, 48, 0.16)) + "'/>";
            svg += "<circle cx='" + p.x.toFixed(0) + "' cy='" + p.y.toFixed(0) + "' r='" + p.r.toFixed(1) + "' fill='" + (dark ? hsla(h, 80, 82, 0.95) : hsla(h, 75, 30, 0.85)) + "'/>";
        });
        svg += "</svg>";
        return [svgLayer(svg),
            glowLayer(12, 15, 55, dark ? hsla(gradHue(st, 0), 75, 32, 0.4) : hsla(gradHue(st, 0), 70, 52, 0.26)),
            glowLayer(88, 85, 55, dark ? hsla(gradHue(st, 1), 75, 32, 0.4) : hsla(gradHue(st, 1), 70, 52, 0.26))];
    }

    /* Hex: a honeycomb of outlined hexagons with a few softly filled */
    function hexLayers(dark) {
        var st = bgState.hex;
        if (!st) {
            st = bgState.hex = { pal: pick(PALETTES), s: Math.round(rnd(44, 66)), ox: Math.random(), oy: Math.random(), fills: {}, glows: [rnd(5, 25), rnd(70, 95)] };
        }
        var s = st.s, w = Math.sqrt(3) * s, outline = "", filled = "";
        var rows = Math.ceil(800 / (1.5 * s)) + 2, cols = Math.ceil(1200 / w) + 2;
        var seed = 7;
        for (var r = -1; r < rows; r++) {
            for (var c = -1; c < cols; c++) {
                var cx = c * w + (r % 2 ? w / 2 : 0) - st.ox * w, cy = r * 1.5 * s - st.oy * 1.5 * s;
                var pts = [];
                for (var k = 0; k < 6; k++) {
                    var a = (Math.PI / 180) * (60 * k - 30);
                    pts.push((cx + s * Math.cos(a)).toFixed(0) + " " + (cy + s * Math.sin(a)).toFixed(0));
                }
                var d = "M" + pts.join("L") + "Z";
                outline += d;
                var key = r + "," + c;
                if (st.fills[key] === undefined) st.fills[key] = Math.random() < 0.1 ? Math.random() : -1;
                if (st.fills[key] >= 0) filled += "<path d='" + d + "' fill='" + (dark ? hsla(gradHue(st, st.fills[key]), 75, 50, 0.22) : hsla(gradHue(st, st.fills[key]), 75, 50, 0.2)) + "'/>";
            }
        }
        var hl = gradHue(st, 0.4);
        var svg = SVG_OPEN + fadeDefs() + "<g mask='url(#m)'>" + filled +
            "<path d='" + outline + "' fill='none' stroke='" + (dark ? hsla(hl, 70, 80, 0.3) : hsla(hl, 55, 32, 0.34)) + "' stroke-width='1.3' stroke-linejoin='round'/></g></svg>";
        return [svgLayer(svg),
            glowLayer(st.glows[0], 20, 55, dark ? hsla(gradHue(st, 0), 75, 32, 0.4) : hsla(gradHue(st, 0), 70, 52, 0.26)),
            glowLayer(st.glows[1], 80, 55, dark ? hsla(gradHue(st, 1), 75, 32, 0.4) : hsla(gradHue(st, 1), 70, 52, 0.26))];
    }

    /* One day: the sky follows the visitor's local clock. */
    var clockStart = performance.now();

    function dayHour() {
        var sp = new URLSearchParams(window.location.search);
        var q = parseFloat(sp.get("hour")), speed = parseFloat(sp.get("speed")) || 1;
        /* ?moon=... alone previews the moon, so it also pins the clock to night */
        if (isNaN(q) && sp.get("moon") !== null && !isNaN(parseFloat(sp.get("moon")))) return 22;
        var base;
        if (!isNaN(q) || speed !== 1) {
            base = !isNaN(q) ? q : (function () { var d = new Date(); return d.getHours() + d.getMinutes() / 60; })();
            /* speed 1 = real time; speed 600 = ten minutes of sky per second */
            base += ((performance.now() - clockStart) / 3600000) * speed;
        } else {
            var d = new Date();
            base = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
        }
        return ((base % 24) + 24) % 24;
    }

    function smooth(a, b, x) {
        var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }

    /* 0 = full day, 1 = full night, with 90-minute twilights */
    function nightness(h) {
        return h < 12 ? 1 - smooth(5, 6.5, h) : smooth(17.5, 19, h);
    }

    function effTheme() {
        if (settings.background === "oneday") return nightness(dayHour()) > 0.5 ? "dark" : "light";
        return settings.theme;
    }

    function mix(a, b, t) { return a + (b - a) * t; }

    function onedayLayers() {
        var h = dayHour(), k = nightness(h);
        /* sky: day blue -> deep night blue, with a low glow while the sun is near the horizon */
        var top = "hsl(" + mix(208, 226, k).toFixed(0) + "," + mix(78, 58, k).toFixed(0) + "%," + mix(74, 7, k).toFixed(1) + "%)";
        var bot = "hsl(" + mix(200, 218, k).toFixed(0) + "," + mix(82, 52, k).toFixed(0) + "%," + mix(90, 14, k).toFixed(1) + "%)";
        var twi = Math.sin(Math.PI * Math.max(0, Math.min(1, k))) ;
        var sky = "linear-gradient(180deg, " + top + " 0%, " + bot + " 100%)";

        /* sun and moon positions along a shallow arc over the top of the page */
        var sunT = (h - 6) / 12;
        var moonT = ((h >= 18 ? h - 18 : h + 6)) / 12;
        function pos(t) { return { x: -80 + 1360 * t, y: 345 - 205 * Math.sin(Math.PI * t) }; }
        var sp = pos(sunT), mp = pos(moonT);
        var sunO = 1 - smooth(0.3, 0.9, k), moonO = smooth(0.35, 0.95, k);

        var svg = SVG_OPEN;
        /* stars */
        if (k > 0.05) {
            var rs = 17;
            function r() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
            svg += "<g fill='#fff' fill-opacity='" + (smooth(0.4, 1, k) * 0.9).toFixed(2) + "'>";
            for (var i = 0; i < 70; i++) {
                var x = r() * 1200, y = r() * 520;
                if (x > KEEP.x0 && x < KEEP.x1 && y > KEEP.y0 - 140) continue;
                svg += "<circle cx='" + x.toFixed(0) + "' cy='" + y.toFixed(0) + "' r='" + (0.8 + r() * 1.6).toFixed(1) + "'/>";
            }
            svg += "</g>";
        }
        /* sun: a glowing disc with stroked rays, like the glyph icons */
        if (sunO > 0.01) {
            svg += "<g opacity='" + sunO.toFixed(2) + "' transform='translate(" + sp.x.toFixed(1) + " " + sp.y.toFixed(1) + ")'>" +
                "<circle r='120' fill='url(#sunGlow)'/>" +
                "<circle r='40' fill='hsl(" + mix(44, 28, twi).toFixed(0) + ",100%,78%)' stroke='rgba(255,255,255,.9)' stroke-width='3'/>";
            for (var a = 0; a < 8; a++) {
                var ang = a * Math.PI / 4;
                svg += "<line x1='" + (Math.cos(ang) * 62).toFixed(1) + "' y1='" + (Math.sin(ang) * 62).toFixed(1) + "' x2='" + (Math.cos(ang) * 84).toFixed(1) + "' y2='" + (Math.sin(ang) * 84).toFixed(1) +
                    "' stroke='hsl(" + mix(44, 28, twi).toFixed(0) + ",100%,74%)' stroke-width='7' stroke-linecap='round'/>";
            }
            svg += "</g>";
        }
        /* moon: the crescent glyph */
        if (moonO > 0.01) {
            svg += "<g opacity='" + moonO.toFixed(2) + "' transform='translate(" + mp.x.toFixed(1) + " " + mp.y.toFixed(1) + ") scale(5.2) translate(-12 -12)'>" +
                "<circle cx='12' cy='12' r='15' fill='url(#moonGlow)'/>" +
                "<path d='M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401' fill='rgba(236,242,255,.95)' stroke='rgba(255,255,255,.95)' stroke-width='.5' stroke-linejoin='round'/></g>";
        }
        svg += "<defs><radialGradient id='sunGlow'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>" +
            "<radialGradient id='moonGlow'><stop offset='0' stop-color='#cfe0ff' stop-opacity='.35'/><stop offset='1' stop-color='#cfe0ff' stop-opacity='0'/></radialGradient></defs></svg>";

        var layers = [svgLayer(svg)];
        /* warm horizon glow around dusk and dawn */
        if (twi > 0.05) {
            var gx = (sunO > moonO ? sp.x : mp.x) / 12, gy = (sunO > moonO ? sp.y : mp.y) / 8;
            layers.push(glowLayer(Math.max(0, Math.min(100, gx)), Math.max(0, Math.min(100, gy + 14)), 55, "hsla(24,90%,58%," + (0.22 * twi).toFixed(2) + ")"));
        }
        layers.push(sky);
        return layers;
    }

    /* One day, live The sun, moon, stars and sky are real elements in a fixed layer behind the page. */
    var odLayer = null, odTimer = null, odLast = null;

    /* ---- realistic sky pieces ---- */

    /* Soft procedural cumulus: fractal noise over a flat-bottomed envelope, shaded white on top to grey-blue underneath. */
    function cloudTexture(seed) {
        var w = 360, h = 170, cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        var ctx = cv.getContext("2d");
        if (!ctx) return "";
        var img = ctx.createImageData(w, h), d = img.data;
        function hash(x, y) { var n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); }
        function vnoise(x, y) {
            var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
            var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
        }
        function fbm(x, y) {
            var sum = 0, amp = 0.5, f = 1;
            for (var o = 0; o < 5; o++) { sum += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
            return sum;
        }
        function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1;
                var wx = fbm(nx * 1.6 + 3.1, ny * 1.6) - 0.5, wy = fbm(nx * 1.6, ny * 1.6 + 7.3) - 0.5;
                var qx = nx + wx * 0.5, qy = ny + wy * 0.5;
                var env = 1 - Math.sqrt(qx * qx * 0.95 + Math.pow(qy * 1.45 + 0.28, 2));
                if (qy > 0.25) env *= 1 - (qy - 0.25) * 2.4;
                var dens = env + (fbm(nx * 3.4 + seed, ny * 3.4) - 0.5) * 0.85;
                var edge = sstep(0, 0.16, Math.min(x, w - 1 - x) / w) * sstep(0, 0.2, Math.min(y, h - 1 - y) / h);
                var alpha = sstep(0.02, 0.5, dens) * edge;
                var shade = sstep(-0.35, 0.8, ny + (0.5 - fbm(nx * 2.2 + 11, ny * 2.2)) * 0.5);
                var i = (y * w + x) * 4;
                d[i] = 255 - shade * 78;
                d[i + 1] = 255 - shade * 60;
                d[i + 2] = 255 - shade * 36;
                d[i + 3] = alpha * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        try { return cv.toDataURL("image/png"); } catch (e) { return ""; }
    }

    /* Moon: a sphere lit from the sun's direction for the given phase. */
    var moonAlbedoCache = null;

    function moonAlbedo(S) {
        if (moonAlbedoCache && moonAlbedoCache.S === S) return moonAlbedoCache.a;
        var a = new Float32Array(S * S), rs = 7;
        function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
        function hash(x, y) { var n = Math.sin(x * 127.1 + y * 311.7 + 13.3) * 43758.5453; return n - Math.floor(n); }
        function vn(x, y) {
            var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
            var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            var p = hash(xi, yi), q = hash(xi + 1, yi), r = hash(xi, yi + 1), t = hash(xi + 1, yi + 1);
            return p + (q - p) * u + (r - p) * v + (p - q - r + t) * u * v;
        }
        function fbm(x, y, oc) { var sum = 0, amp = 0.5, f = 1; for (var o = 0; o < oc; o++) { sum += amp * vn(x * f, y * f); f *= 2.1; amp *= 0.5; } return sum; }
        var craters = [], i;
        for (i = 0; i < 110; i++) {
            var big = i < 6, ang = rnd() * 6.283, rad = Math.sqrt(rnd()) * 0.92;
            craters.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, r: big ? 0.07 + rnd() * 0.07 : 0.01 + rnd() * 0.028, d: 0.35 + rnd() * 0.55 });
        }
        for (var py = 0; py < S; py++) {
            for (var px = 0; px < S; px++) {
                var x = (px / (S - 1)) * 2 - 1, y = (py / (S - 1)) * 2 - 1;
                if (x * x + y * y > 1) continue;
                var maria = fbm(x * 1.5 + 4, y * 1.5 + 9, 4);
                var m = Math.max(0, Math.min(1, (maria - 0.47) * 3.6));
                var v = 0.93 - 0.4 * m + (fbm(x * 11, y * 11, 4) - 0.5) * 0.2;
                for (i = 0; i < craters.length; i++) {
                    var c = craters[i], dx = x - c.x, dy = y - c.y, d = Math.sqrt(dx * dx + dy * dy) / c.r;
                    if (d > 1.5) continue;
                    if (d < 1) v -= 0.045 * c.d * (1 - d * d * 0.5) - (dx / c.r) * 0.03;
                    else v += 0.09 * c.d * (1 - (d - 1) * 2);
                }
                a[py * S + px] = Math.max(0.12, Math.min(1, v));
            }
        }
        moonAlbedoCache = { S: S, a: a };
        return a;
    }

    function moonTexture(phase) {
        var S = 220, cv = document.createElement("canvas");
        cv.width = S; cv.height = S;
        var ctx = cv.getContext("2d");
        if (!ctx) return "";
        var alb = moonAlbedo(S), img = ctx.createImageData(S, S), d = img.data;
        var al = phase * Math.PI * 2, lx = Math.sin(al), lz = -Math.cos(al);
        function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
        for (var py = 0; py < S; py++) {
            for (var px = 0; px < S; px++) {
                var x = (px / (S - 1)) * 2 - 1, y = (py / (S - 1)) * 2 - 1, r2 = x * x + y * y;
                if (r2 > 1) continue;
                var nz = Math.sqrt(1 - r2), ndl = x * lx + nz * lz;
                var lit = sstep(-0.06, 0.34, ndl);
                var edge = sstep(1, 0.93, Math.sqrt(r2));
                var a = alb[py * S + px];
                var light = 0.045 + lit * (0.95 - 0.12 * r2);
                var v = a * light;
                var i = (py * S + px) * 4;
                d[i] = Math.min(255, v * 255 * 1.02);
                d[i + 1] = Math.min(255, v * 255 * 0.99 + 2);
                d[i + 2] = Math.min(255, v * 255 * 0.93 + 8 * (1 - lit));
                d[i + 3] = 255 * edge;
            }
        }
        ctx.putImageData(img, 0, 0);
        try { return cv.toDataURL("image/png"); } catch (e) { return ""; }
    }

    /* lunar phase from the date: 0 = new, 0.5 = full */
    function moonPhase(date) {
        var q = parseFloat(new URLSearchParams(window.location.search).get("moon"));
        if (!isNaN(q)) return ((q % 1) + 1) % 1;
        var days = (date.getTime() / 86400000) + 2440587.5 - 2451550.1;
        var p = (days / 29.530588853) % 1;
        return p < 0 ? p + 1 : p;
    }

    /* the lit part of the moon's disc as a path (radius R, centred on 0,0) */
    function litPath(p, R) {
        var k = Math.cos(2 * Math.PI * p), rx = Math.abs(k) * R, waxing = p < 0.5;
        var limb = waxing ? 1 : 0, term = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
        return "M0 " + (-R) + "A" + R + " " + R + " 0 0 " + limb + " 0 " + R + "A" + rx.toFixed(2) + " " + R + " 0 0 " + term + " 0 " + (-R) + "Z";
    }

    function ensureOneDayLayer() {
        if (odLayer) return;
        var rs = 29;
        function r() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
        function rr(a, b) { return a + Math.random() * (b - a); }

        /* stars: many faint, a few bright with a halo */
        var stars = "<svg class='od-stars' viewBox='0 0 1200 520' preserveAspectRatio='xMidYMin slice'>";
        for (var i = 0; i < 130; i++) {
            var x = r() * 1200, y = r() * 520, br = r();
            if (x > KEEP.x0 && x < KEEP.x1 && y > KEEP.y0 - 140) continue;
            var big = br > 0.93;
            if (big) stars += "<circle cx='" + x.toFixed(0) + "' cy='" + y.toFixed(0) + "' r='6' fill='#cfe0ff' fill-opacity='.12'/>";
            stars += "<circle cx='" + x.toFixed(0) + "' cy='" + y.toFixed(0) + "' r='" + (big ? 1.9 : 0.5 + br * 0.9).toFixed(1) + "' fill='#fff' fill-opacity='" + (big ? 0.95 : 0.35 + br * 0.5).toFixed(2) + "'/>";
        }
        stars += "</svg>";

        /* clouds: each its own procedural texture, random height/size/speed per load */
        var clouds = "", tops = [];
        for (var c = 0; c < 4; c++) {
            var top, guard = 0;
            do {
                top = Math.random() < 0.5 ? rr(3, 28) : rr(62, 90);
                guard++;
            } while (guard < 20 && tops.some(function (t) { return Math.abs(t - top) < 14; }));
            tops.push(top);
            var scale = rr(0.6, 1.6), far = 1 - (scale - 0.6) / 1.0;
            clouds += "<img class='od-cloud' alt='' src='" + cloudTexture(Math.random() * 90 + c) + "' style='top:" + top.toFixed(1) + "%;--cs:" + scale.toFixed(2) +
                ";--op:" + (0.62 + 0.3 * (1 - far)).toFixed(2) + ";--dur:" + (120 + far * 120 + rr(0, 40)).toFixed(0) + "s;--del:-" + rr(0, 240).toFixed(0) + "s;--flip:" + (Math.random() < 0.5 ? 1 : -1) + "'>";
        }

        var phase = moonPhase(new Date());
        odLayer = document.createElement("div");
        odLayer.id = "oneday-layer";
        odLayer.setAttribute("aria-hidden", "true");
        odLayer.innerHTML = stars + "<div class='od-clouds'>" + clouds + "</div>" +
            "<div class='od-glow'></div>" +
            /* sun: a blinding core and layered bloom, no outline and no rays */
            "<div class='od-body od-sun'><svg viewBox='0 0 200 200'>" +
            "<defs>" +
            "<radialGradient id='odBloom'>" +
            "<stop offset='0' stop-color='#fffef8'/><stop offset='.07' stop-color='#fffdf0'/>" +
            "<stop offset='.1' style='stop-color:hsl(var(--sun-hue,44),100%,92%);stop-opacity:.95'/>" +
            "<stop offset='.2' style='stop-color:hsl(var(--sun-hue,44),100%,84%);stop-opacity:.6'/>" +
            "<stop offset='.45' style='stop-color:hsl(var(--sun-hue,44),100%,78%);stop-opacity:.22'/>" +
            "<stop offset='1' style='stop-color:hsl(var(--sun-hue,44),100%,75%);stop-opacity:0'/></radialGradient>" +
            "<linearGradient id='odStreak' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>" +
            "</defs>" +
            "<circle cx='100' cy='100' r='100' fill='url(#odBloom)'/>" +
            "<ellipse cx='100' cy='100' rx='100' ry='2.4' fill='url(#odStreak)'/>" +
            "</svg></div>" +
            /* moon: a lit sphere rendered on a canvas (real phase, maria, craters) */
            "<div class='od-body od-moon'><div class='od-moon-halo'></div><img class='od-moon-img' alt='' src='" + moonTexture(phase) + "'></div>";
        odLayer.dataset.phase = phase.toFixed(2);
        document.body.insertBefore(odLayer, document.body.firstChild);
    }

    function oneDayTick() {
        if (settings.background !== "oneday" || !odLayer) return;
        var h = dayHour(), k = nightness(h);
        var W = window.innerWidth, H = window.innerHeight;
        var sunT = (h - 6) / 12, moonT = (h >= 18 ? h - 18 : h + 6) / 12;
        function pos(t) { t = Math.max(0, Math.min(1, t)); return { x: W * (0.09 + 0.82 * t), y: H * (0.50 - 0.43 * Math.pow(Math.sin(Math.PI * t), 0.4)) }; }
        var sp = pos(sunT), mp = pos(moonT);
        var size = Math.max(220, Math.min(W, H) * 0.42);
        var twi = Math.sin(Math.PI * Math.max(0, Math.min(1, k)));
        var st = odLayer.style;
        st.setProperty("--sky-top", "hsl(" + mix(211, 228, k).toFixed(0) + "," + mix(80, 62, k).toFixed(0) + "%," + mix(64, 4, k).toFixed(1) + "%)");
        st.setProperty("--sky-mid", "hsl(" + mix(207, 226, k).toFixed(0) + "," + mix(85, 55, k).toFixed(0) + "%," + mix(77, 8, k).toFixed(1) + "%)");
        st.setProperty("--sky-bot", "hsl(" + mix(201, 220, k).toFixed(0) + "," + mix(75, 45, k).toFixed(0) + "%," + mix(91, 15, k).toFixed(1) + "%)");
        var ph = moonPhase(new Date());
        /* Singapore sits on the equator, where the lit side of the moon faces the sun below the horizon: it lies like a bowl */
        st.setProperty("--moon-rot", (ph < 0.5 ? 65 : -65) + "deg");
        if (Math.abs(ph - parseFloat(odLayer.dataset.phase || "0")) > 0.006) {
            var mi = odLayer.querySelector(".od-moon-img");
            if (mi) mi.src = moonTexture(ph);
            odLayer.dataset.phase = ph.toFixed(3);
        }
        st.setProperty("--od-size", size.toFixed(0) + "px");
        st.setProperty("--sun-x", sp.x.toFixed(1) + "px");
        st.setProperty("--sun-y", sp.y.toFixed(1) + "px");
        st.setProperty("--moon-x", mp.x.toFixed(1) + "px");
        st.setProperty("--moon-y", mp.y.toFixed(1) + "px");
        /* stay clear of the text: the arc runs high over the column, and a body that still overlaps it is dimmed */
        var col = document.querySelector("main .container"), firstP = document.querySelector("main p");
        function dodge(p) {
            if (!col || !firstP) return 1;
            var cr = col.getBoundingClientRect(), tr = firstP.getBoundingClientRect(), rr = size * 0.42;
            var hit = p.y + rr > tr.top - 10 && p.x + rr > cr.left && p.x - rr < cr.right;
            return hit ? 0.6 : 1;
        }
        st.setProperty("--sun-o", ((1 - smooth(0.3, 0.9, k)) * dodge(sp)).toFixed(3));
        /* a new moon is lost in the sun's glare and can't be seen; thin crescents fade in */
        var illum = (1 - Math.cos(2 * Math.PI * ph)) / 2;
        st.setProperty("--moon-o", (smooth(0.35, 0.95, k) * dodge(mp) * smooth(0.0, 0.12, illum)).toFixed(3));
        st.setProperty("--cloud-o", (1 - smooth(0.15, 0.7, k)).toFixed(3));
        st.setProperty("--star-o", (smooth(0.4, 1, k) * 0.9).toFixed(3));
        st.setProperty("--sun-hue", mix(46, 20, twi).toFixed(0));
        var onSun = (1 - smooth(0.3, 0.9, k)) > smooth(0.35, 0.95, k);
        st.setProperty("--glow-x", (onSun ? sp.x : mp.x).toFixed(1) + "px");
        st.setProperty("--glow-y", ((onSun ? sp.y : mp.y) + H * 0.18).toFixed(1) + "px");
        st.setProperty("--glow-o", (0.85 * twi).toFixed(3));
        /* clouds drift in steps too: position follows the clock, no continuous animation */
        var nowS = Date.now() / 1000;
        odLayer.querySelectorAll(".od-cloud").forEach(function (cl) {
            var dur = parseFloat(cl.style.getPropertyValue("--dur")) || 160, del = parseFloat(cl.style.getPropertyValue("--del")) || 0;
            var frac = ((((nowS + (-del)) / dur) % 1) + 1) % 1, x = -45 + 163 * frac;
            var prev = cl._x;
            if (prev !== undefined && x < prev) { cl.style.transition = "none"; }
            cl.style.setProperty("--cx", x.toFixed(2) + "vw");
            if (cl.style.transition === "none") { void cl.offsetWidth; cl.style.transition = ""; }
            cl._x = x;
        });
        /* the page theme follows the sky; flip it with the circular reveal */
        if (effTheme() !== root.getAttribute("data-theme")) {
            /* the reveal spreads from whichever body is in the sky right now */
            var sunShown = (1 - smooth(0.3, 0.9, k)) >= smooth(0.35, 0.95, k);
            var o = sunShown ? sp : mp;
            applyWithThemeTransition({ x: o.x, y: o.y });
        }
    }

    function startOneDay() {
        ensureOneDayLayer();
        root.style.setProperty("--art-bg", "none");
        if (odLast === null) {
            /* first frame: no glide from the default position */
            odLayer.classList.add("od-jump");
            oneDayTick();
            void odLayer.offsetWidth;
            odLayer.classList.remove("od-jump");
            odLast = 1;
        } else {
            oneDayTick();
        }
        if (!odTimer) {
            var fast = (parseFloat(new URLSearchParams(window.location.search).get("speed")) || 1) > 1;
            /* the CSS glide lasts exactly one tick, so motion never stalls or lags */
            /* Idle cost: the sky only moves for 2 s out of every 30 s (a step, then rest), instead of gliding forever. */
            odLayer.style.setProperty("--od-dt", fast ? "250ms" : "2s");
            odTimer = window.setInterval(oneDayTick, fast ? 250 : 30000);
        }
    }

    function stopOneDay() {
        if (odTimer) { window.clearInterval(odTimer); odTimer = null; }
        if (odLayer) { odLayer.remove(); odLayer = null; odLast = null; }
    }

    function buildLayers(id, dark) {
        if (id === "aurora") return auroraLayers(dark);
        if (id === "grid") return gridLayers(dark);
        if (id === "shards") return shardsLayers(dark);
        if (id === "halftone") return halftoneLayers(dark);
        if (id === "constellation") return constellationLayers(dark);
        if (id === "hex") return hexLayers(dark);
        if (id === "oneday") return onedayLayers();
        return glyphLayers(dark);
    }

    /* Picker thumbnails are small hand-composed close-ups of each style (not crops of the random page art) */
    function thumbSvg(id, dark) {
        var bg1 = dark ? "#0a1426" : "#e6f3ff", bg2 = dark ? "#16294a" : "#f7fbff";
        var ink = dark ? "hsl(186,85%,68%)" : "hsl(206,78%,46%)";
        var ink2 = dark ? "hsl(214,85%,66%)" : "hsl(176,70%,40%)";
        var o = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 100' preserveAspectRatio='xMidYMid slice'>" +
            "<defs><linearGradient id='tb' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='" + bg1 + "'/><stop offset='1' stop-color='" + bg2 + "'/></linearGradient>" +
            "<radialGradient id='ta'><stop offset='0' stop-color='" + ink + "' stop-opacity='.85'/><stop offset='1' stop-color='" + ink + "' stop-opacity='0'/></radialGradient>" +
            "<radialGradient id='tc'><stop offset='0' stop-color='" + ink2 + "' stop-opacity='.8'/><stop offset='1' stop-color='" + ink2 + "' stop-opacity='0'/></radialGradient></defs>" +
            "<rect width='160' height='100' fill='url(#tb)'/>";
        var i, j;
        if (id === "glyphs") {
            o += "<g fill='none' stroke='" + ink + "' stroke-opacity='.8' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'>" +
                "<path d='M58 30L36 50L58 70'/><path d='M102 30L124 50L102 70'/><path d='M89 24L71 76' stroke='" + ink2 + "'/></g>";
        } else if (id === "aurora") {
            o += "<circle cx='55' cy='42' r='70' fill='url(#ta)'/><circle cx='118' cy='62' r='62' fill='url(#tc)'/>" +
                "<circle cx='40' cy='34' r='17' fill='" + ink + "' fill-opacity='.35' stroke='#fff' stroke-opacity='.7' stroke-width='1.4'/>" +
                "<circle cx='122' cy='70' r='22' fill='" + ink2 + "' fill-opacity='.35' stroke='#fff' stroke-opacity='.7' stroke-width='1.4'/>";
        } else if (id === "grid") {
            o += "<g transform='rotate(-9 80 50)' stroke='" + ink + "' fill='none'>";
            for (i = -2; i < 12; i++) o += "<line x1='" + (i * 16) + "' y1='-30' x2='" + (i * 16) + "' y2='130' stroke-width='" + (i % 4 === 0 ? 1.8 : 0.9) + "' stroke-opacity='" + (i % 4 === 0 ? 0.85 : 0.5) + "'/>";
            for (j = -2; j < 9; j++) o += "<line x1='-30' y1='" + (j * 16) + "' x2='200' y2='" + (j * 16) + "' stroke-width='" + (j % 4 === 0 ? 1.8 : 0.9) + "' stroke-opacity='" + (j % 4 === 0 ? 0.85 : 0.5) + "'/>";
            o += "</g>";
        } else if (id === "shards") {
            var sh = [["16,70 62,18 84,62", ink], ["58,86 100,30 146,72", ink2], ["96,12 150,24 128,58", ink]];
            sh.forEach(function (q) {
                o += "<polygon points='" + q[0] + "' fill='" + q[1] + "' fill-opacity='.38' stroke='#fff' stroke-opacity='.85' stroke-width='1.6' stroke-linejoin='round'/>";
            });
        } else if (id === "halftone") {
            for (j = 0; j < 6; j++) for (i = 0; i < 9; i++) {
                var r = 1.2 + 6.4 * Math.max(0, 1 - Math.hypot(i - 0, j - 0) / 9.5);
                o += "<circle cx='" + (12 + i * 17) + "' cy='" + (10 + j * 16) + "' r='" + r.toFixed(1) + "' fill='" + ink + "' fill-opacity='.85'/>";
            }
        } else if (id === "constellation") {
            var pts = [[24, 70], [48, 40], [78, 54], [104, 24], [128, 50], [112, 78], [140, 76]];
            o += "<g stroke='" + ink + "' stroke-width='1.6' stroke-opacity='.8' fill='none'><path d='M24 70L48 40L78 54L104 24L128 50L112 78L140 76M78 54L112 78M48 40L104 24'/></g>";
            pts.forEach(function (q, k) { o += "<circle cx='" + q[0] + "' cy='" + q[1] + "' r='" + (k % 3 === 0 ? 4.6 : 3) + "' fill='" + (dark ? "#eaffff" : ink) + "'/>"; });
        } else if (id === "hex") {
            var hs = 20, hw = Math.sqrt(3) * hs;
            o += "<g fill='none' stroke='" + ink + "' stroke-opacity='.75' stroke-width='1.3' stroke-linejoin='round'>";
            for (j = -1; j < 5; j++) for (i = -1; i < 6; i++) {
                var cx = i * hw + (j % 2 ? hw / 2 : 0), cy = j * 1.5 * hs, pp = [];
                for (var k = 0; k < 6; k++) { var an = (Math.PI / 180) * (60 * k - 30); pp.push((cx + hs * Math.cos(an)).toFixed(1) + "," + (cy + hs * Math.sin(an)).toFixed(1)); }
                var on = (i + j * 2) % 5 === 0;
                o += "<polygon points='" + pp.join(" ") + "'" + (on ? " fill='" + ink2 + "' fill-opacity='.4'" : "") + "/>";
            }
            o += "</g>";
        }
        return o + "</svg>";
    }

    function renderBgTiles(dark) {
        document.querySelectorAll(".bg-tile").forEach(function (tile) {
            var id = tile.getAttribute("data-bg"), thumb = tile.querySelector(".bg-thumb");
            if (!thumb || id === "oneday") return;
            var art = thumb.querySelector(".bg-art");
            if (!art) { art = document.createElement("span"); art.className = "bg-art"; thumb.insertBefore(art, thumb.firstChild); }
            art.style.background = "url(\"data:image/svg+xml," + encodeURIComponent(thumbSvg(id, dark)) + "\") center / cover no-repeat";
        });
    }

    function applyBackdropArt() {
        var dark = effTheme() === "dark";
        if (BG_THEMES.indexOf(settings.background) < 0) settings.background = "glyphs";
        root.setAttribute("data-bg", settings.background);
        if (settings.background === "oneday") {
            if (document.body) startOneDay();
        } else {
            stopOneDay();
            root.style.setProperty("--art-bg", buildLayers(settings.background, dark).join(", "));
        }
        renderBgTiles(dark);
    }

    applySettings();

    document.addEventListener("visibilitychange", function () { if (!document.hidden) tickOneDay(); });

    document.addEventListener("DOMContentLoaded", function () {
        if (settings.background === "oneday") startOneDay();
        wireThemeToggle();
        wireSettingsPanel();
        FetchTranslations();
        SetExpYears();
        /* The lens maps (distortion canvases for ~13 surfaces) cost ~0.7 s of main-thread time. */
        var lensStarted = false;
        function startLens() { if (lensStarted) return; lensStarted = true; initLiquidLens(); }
        if (document.getElementById("lanyard-panel")) {
            document.addEventListener("lanyard-ready", function () { window.setTimeout(startLens, 250); });
            window.setTimeout(startLens, 3500);
        } else { startLens(); }
        enhanceInlinePills();
        initAdaptiveControls();
        initPoemGlass();

        window.default_lang = pickLanguage();
        SetHtmlLang(window.default_lang);

        var langSelector = document.getElementById("language-selector");
        if (langSelector) langSelector.removeAttribute("hidden");
        initLanguageSelector();
    });

    /* Content-aware icon color: instead of a fixed "light theme = dark icon" rule */
    function relativeLuminance(r, g, b) {
        function toLinear(c) {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }

    function parseRGB(str) {
        var m = str && str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        var parts = m[1].split(",").map(function (s) { return parseFloat(s); });
        if (parts.length < 3 || parts.some(isNaN)) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    /* Our own glass chrome (the header pill, the FAB, any other .glass surface) shouldn't count as "content behind the control" - */
    function isOwnGlassChrome(node) {
        return !!(node.classList && node.classList.contains("glass"));
    }

    /* Walks the real stacking order at (x, y) - not just DOM order - and returns the luminance of the first non-transparent */
    function sampleBackgroundLuminance(x, y, ignoreEl) {
        if (typeof document.elementsFromPoint !== "function") return null;
        var stack = document.elementsFromPoint(x, y);
        for (var i = 0; i < stack.length; i++) {
            var node = stack[i];
            if (ignoreEl.contains(node)) continue;
            if (isOwnGlassChrome(node)) continue;
            var bg = parseRGB(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0.5) {
                return relativeLuminance(bg.r, bg.g, bg.b);
            }
        }
        /* Nothing with a real background was found at all (shouldn't normally happen */
        return relativeLuminance(255, 255, 255);
    }

    function updateAdaptiveControl(el) {
        var rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = rect.left + rect.width / 2;
        var y = rect.top + rect.height / 2;
        var lum = sampleBackgroundLuminance(x, y, el);
        if (lum === null) return;
        var onLight = lum > 0.55;
        el.classList.toggle("on-light", onLight);
        el.classList.toggle("on-dark", !onLight);
    }

    function initAdaptiveControls() {
        if (typeof document.elementsFromPoint !== "function") return;
        var targets = Array.prototype.slice.call(document.querySelectorAll(".liquid-control"));
        if (!targets.length) return;

        var refresh = function () {
            targets.forEach(updateAdaptiveControl);
        };
        window.refreshAdaptiveControls = refresh;

        refresh();

        var ticking = false;
        function onScrollOrResize() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                refresh();
                ticking = false;
            });
        }
        window.addEventListener("scroll", onScrollOrResize, { passive: true });
        window.addEventListener("resize", onScrollOrResize);

        /* A hidden/background tab freezes CSS transitions mid-animation (the browser stops advancing their clock while not painting) */
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) refresh();
        });
    }

    /* Real glass refraction - no blur anywhere in this. */
    /* Physical bezel profile (see kube.io/blog/liquid-glass-css-svg): convex squircle height h(x) = (1 - (1 - x)^4)^(1/4) */
    var snellLUT = null;
    function getSnellLUT() {
        if (snellLUT) return snellLUT;
        var n = 256, lut = new Array(n), max = 0, i;
        function h(x) { return Math.pow(1 - Math.pow(1 - x, 4), 0.25); }
        for (i = 0; i < n; i++) {
            var x = Math.min(0.999, Math.max(0.001, i / (n - 1)));
            var d = 0.001;
            var slope = (h(Math.min(1, x + d)) - h(Math.max(0, x - d))) / (2 * d);
            var theta1 = Math.atan(slope);
            var theta2 = Math.asin(Math.sin(theta1) / 1.5);
            var shift = h(x) * Math.tan(theta1 - theta2);
            lut[i] = shift;
            if (shift > max) max = shift;
        }
        for (i = 0; i < n; i++) lut[i] = lut[i] / max * (i === n - 1 ? 0 : 1);
        /* ease the last stretch to zero so the flat center has no seam */
        for (i = 0; i < n; i++) {
            var u = i / (n - 1);
            if (u > 0.7) lut[i] *= Math.max(0, 1 - (u - 0.7) / 0.3);
        }
        snellLUT = lut;
        return lut;
    }

    function buildLensDisplacementMap(width, height, radii, bezelWidth, snell) {
        /* The map is smooth: a quarter of the pixels looks the same once scaled, at a quarter of the cost. */
        var dpr = Math.min(window.devicePixelRatio || 1, 1) * 0.5;
        var canvasW = Math.round(width * dpr);
        var canvasH = Math.round(height * dpr);
        var canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        var ctx = canvas.getContext("2d");
        var imageData = ctx.createImageData(canvasW, canvasH);
        var data = imageData.data;

        /* Per-corner radius: a header flush against the viewport top has square top corners and rounded bottom ones. */
        function roundedBoxSDF(px, py) {
            var cx = px - width / 2;
            var cy = py - height / 2;
            var r = cx > 0
                ? (cy > 0 ? radii.br : radii.tr)
                : (cy > 0 ? radii.bl : radii.tl);
            var qx = Math.abs(cx) - width / 2 + r;
            var qy = Math.abs(cy) - height / 2 + r;
            var outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
            var inside = Math.min(Math.max(qx, qy), 0);
            return outside + inside - r;
        }

        /* A liquid-glass panel has a flat optical center and a narrow curved bezel. */
        var bezel = Math.min(bezelWidth || 22, Math.min(width, height) / 2);

        for (var cy = 0; cy < canvasH; cy++) {
            for (var cx = 0; cx < canvasW; cx++) {
                var x = cx / dpr;
                var y = cy / dpr;
                var edgeDist = Math.max(0, -roundedBoxSDF(x, y));

                /* A squircle-like bezel profile. */
                var t = Math.min(1, edgeDist / bezel);
                var profile = snell
                    ? getSnellLUT()[Math.round(t * 255)]
                    : Math.sin(Math.PI * t) * (1 - 0.45 * t);

                var gx = roundedBoxSDF(x + 1, y) - roundedBoxSDF(x - 1, y);
                var gy = roundedBoxSDF(x, y + 1) - roundedBoxSDF(x, y - 1);
                var glen = Math.hypot(gx, gy) || 1;
                /* Point inward. */
                var dx = -(gx / glen) * profile;
                var dy = -(gy / glen) * profile;

                var idx = (cy * canvasW + cx) * 4;
                data[idx] = Math.round(Math.max(0, Math.min(255, 128 + dx * 127)));
                data[idx + 1] = Math.round(Math.max(0, Math.min(255, 128 + dy * 127)));
                data[idx + 2] = 128;
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    }

    function applyLiquidLens(el, filterId, options) {
        options = options || {};
        /* el.offsetWidth/Height - NOT getBoundingClientRect(), see the block comment above this section for why. */
        var width = options.size ? options.size.width : el.offsetWidth;
        var height = options.size ? options.size.height : el.offsetHeight;
        if (!width || !height) return;

        /* No refraction outside Chromium: a url(#filter) in backdrop-filter is invalid there (and would void the whole declaration) */
        if (root.classList.contains("lens-fallback")) {
            var plain = options.fallbackBlur || "blur(6px) saturate(1.2)";
            if (options.cssVar) {
                el.style.setProperty(options.cssVar, plain);
            } else {
                el.style.backdropFilter = plain;
                el.style.webkitBackdropFilter = plain;
            }
            return;
        }

        var cs = getComputedStyle(el);
        var maxR = Math.min(width, height) / 2;
        var radii = {
            tl: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, maxR),
            tr: Math.min(parseFloat(cs.borderTopRightRadius) || 0, maxR),
            br: Math.min(parseFloat(cs.borderBottomRightRadius) || 0, maxR),
            bl: Math.min(parseFloat(cs.borderBottomLeftRadius) || 0, maxR)
        };
        var maxDisplacement = options.maxDisplacement || 8;
        var bezelWidth = options.bezelWidth || 22;

        var mapUrl = buildLensDisplacementMap(width, height, radii, bezelWidth, options.snell);

        var svgNS = "http://www.w3.org/2000/svg";
        var svg = document.getElementById("liquid-lens-defs");
        if (!svg) {
            svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("id", "liquid-lens-defs");
            svg.setAttribute("width", "0");
            svg.setAttribute("height", "0");
            svg.style.position = "absolute";
            svg.setAttribute("aria-hidden", "true");
            document.body.appendChild(svg);
        }

        var filter = document.getElementById(filterId);
        if (filter) filter.remove();

        filter = document.createElementNS(svgNS, "filter");
        filter.setAttribute("id", filterId);
        filter.setAttribute("x", "0");
        filter.setAttribute("y", "0");
        filter.setAttribute("width", String(width));
        filter.setAttribute("height", String(height));
        filter.setAttribute("filterUnits", "userSpaceOnUse");
        filter.setAttribute("primitiveUnits", "userSpaceOnUse");
        filter.setAttribute("color-interpolation-filters", "sRGB");

        var feImage = document.createElementNS(svgNS, "feImage");
        feImage.setAttribute("x", "0");
        feImage.setAttribute("y", "0");
        feImage.setAttribute("width", String(width));
        feImage.setAttribute("height", String(height));
        feImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", mapUrl);
        feImage.setAttribute("result", "map");
        feImage.setAttribute("preserveAspectRatio", "none");
        filter.appendChild(feImage);

        var dispIn = "SourceGraphic";
        if (options.blurStd) {
            var feBlur = document.createElementNS(svgNS, "feGaussianBlur");
            feBlur.setAttribute("in", "SourceGraphic");
            feBlur.setAttribute("stdDeviation", String(options.blurStd));
            feBlur.setAttribute("result", "pre-blur");
            filter.appendChild(feBlur);
            dispIn = "pre-blur";
        }

        /* channel value 128 + d*127 with scale S shifts by ~S*d/2 px, so a requested peak shift of M px needs scale 2M. */
        var baseScale = options.snell ? maxDisplacement * 2 : maxDisplacement;
        function displacement(scale, result) {
            var d = document.createElementNS(svgNS, "feDisplacementMap");
            d.setAttribute("in", dispIn);
            d.setAttribute("in2", "map");
            d.setAttribute("scale", String(scale));
            d.setAttribute("xChannelSelector", "R");
            d.setAttribute("yChannelSelector", "G");
            if (result) d.setAttribute("result", result);
            filter.appendChild(d);
        }
        if (options.aberration) {
            /* Chromatic aberration: bend each colour channel by a slightly different amount (red least, blue most), keep only that channel */
            var spread = options.aberration * 6;
            [["r", 1 - spread], ["g", 1], ["b", 1 + spread]].forEach(function (c) {
                displacement((baseScale * c[1]).toFixed(2), "ab-" + c[0] + "-d");
                var m = document.createElementNS(svgNS, "feColorMatrix");
                m.setAttribute("in", "ab-" + c[0] + "-d");
                m.setAttribute("type", "matrix");
                m.setAttribute("values", { r: "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0", g: "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0", b: "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" }[c[0]]);
                m.setAttribute("result", "ab-" + c[0]);
                filter.appendChild(m);
            });
            var rg = document.createElementNS(svgNS, "feBlend");
            rg.setAttribute("in", "ab-r"); rg.setAttribute("in2", "ab-g"); rg.setAttribute("mode", "screen"); rg.setAttribute("result", "ab-rg");
            filter.appendChild(rg);
            var rgb = document.createElementNS(svgNS, "feBlend");
            rgb.setAttribute("in", "ab-rg"); rgb.setAttribute("in2", "ab-b"); rgb.setAttribute("mode", "screen");
            filter.appendChild(rgb);
        } else {
            displacement(baseScale);
        }

        if (options.saturate) {
            var feSat = document.createElementNS(svgNS, "feColorMatrix");
            feSat.setAttribute("type", "saturate");
            feSat.setAttribute("values", String(options.saturate));
            filter.appendChild(feSat);
        }

        svg.appendChild(filter);

        /* Refraction is always active. */
        var filterValue = "url(#" + filterId + ")";
        var allowEffects = !options.backdropEffectsDarkOnly || root.getAttribute("data-theme") === "dark";
        if (options.backdropEffects && allowEffects) filterValue += " " + options.backdropEffects;
        if (options.cssVar) {
            el.style.setProperty(options.cssVar, filterValue);
        } else {
            el.style.backdropFilter = filterValue;
            el.style.webkitBackdropFilter = filterValue;
        }
    }

    /* Applies the lens once, then keeps it correct as the element's actual pixel size changes (window resize */
    var lensQueue = [], lensPumping = false;
    function pumpLensQueue() {
        var job = lensQueue.shift();
        if (!job) { lensPumping = false; return; }
        try { job(); } catch (e) { /* one surface failing must not stop the rest */ }
        window.setTimeout(pumpLensQueue, 16);
    }
    function wireResizingLens(el, filterId, options) {
        if (!el) return;
        var refresh = function () {
            applyLiquidLens(el, filterId, options);
        };
        /* Build each surface's first map in its own task so none blocks the page. */
        lensQueue.push(refresh);
        if (!lensPumping) { lensPumping = true; window.setTimeout(pumpLensQueue, 0); }
        if (typeof ResizeObserver !== "undefined") {
            var debounce;
            new ResizeObserver(function () {
                clearTimeout(debounce);
                debounce = setTimeout(refresh, 120);
            }).observe(el);
        }
    }

    function isMineLens() { return root.getAttribute("data-lens") === "mine"; }

    /* The nav header's lens: the shared header lens plus colour fringing on the glass edge. */
    /* Colour fringing costs three displacement passes per frame on every glass surface, which made scrolling */
    var LENS_ABERRATION = 0;
    function navLensOptions() {
        var o = headerLensOptions();
        o.aberration = LENS_ABERRATION;
        o.maxDisplacement = 14;
        o.bezelWidth = 30;
        return o;
    }

    function headerLensOptions() {
        if (isMineLens()) {
            return {
                snell: true,
                maxDisplacement: 9,
                bezelWidth: 22,
                blurStd: 1.4,
                saturate: 1.25,
                cssVar: "--lens-backdrop"
            };
        }
        return {
            maxDisplacement: 10,
            bezelWidth: 24,
            cssVar: "--lens-backdrop",
            /* Reduced from 6.4px so the refraction and the background art read through the header; a light blur is kept for text */
            backdropEffects: "blur(2px) saturate(1.35)"
        };
    }

    /* Only needed when the header lens varies by theme. */
    function refreshHeaderLens() {
        var opts = headerLensOptions();
        if (!opts.backdropEffectsDarkOnly) return;
        var header = document.querySelector(".header-fixed");
        if (header) applyLiquidLens(header, "liquid-lens-header", navLensOptions());
    }

    /* "Read a poem": the whole <details> is one glass container. */
    function initPoemGlass() {
        var d = document.querySelector("main details");
        if (!d || !d.animate) return;
        var summary = d.querySelector("summary");
        var body = d.querySelector("blockquote");
        var running = null;
        var spring = "cubic-bezier(0.34, 1.56, 0.64, 1)";

        var closeWrap = d.querySelector(".poem-close");
        var closeBtn = closeWrap && closeWrap.querySelector("button");

        function toggle(opening) {
            if (running) { running.cancel(); running = null; }
            var startH = d.offsetHeight;
            d.style.transformOrigin = "50% 0";

            /* Whole-container squash & stretch on every toggle, on top of the height spring below */
            d.animate([
                { transform: "scale(1, 1)" },
                { transform: "scale(1.012, 0.975)", offset: 0.2 },
                { transform: "scale(0.995, 1.012)", offset: 0.45 },
                { transform: "scale(1.003, 0.997)", offset: 0.7 },
                { transform: "scale(1, 1)" }
            ], { duration: 900, easing: "ease-out" });

            if (opening) {
                d.open = true;
                /* open = one sheet: title row steps aside, the close bead pops in */
                d.classList.add("poem-open");
                var endH = d.offsetHeight;
                if (closeWrap) {
                    closeWrap.animate(
                        [{ opacity: 0, transform: "scale(0.3)" }, { opacity: 1, transform: "scale(1)" }],
                        { duration: 520, delay: 220, easing: spring, fill: "backwards" }
                    );
                }
                running = d.animate([
                    { height: startH + "px", easing: "ease-out" },
                    { height: endH * 1.035 + "px", offset: 0.42, easing: "ease-in-out" },
                    { height: endH * 0.988 + "px", offset: 0.66, easing: "ease-in-out" },
                    { height: endH * 1.008 + "px", offset: 0.85, easing: "ease-in-out" },
                    { height: endH + "px" }
                ], { duration: 900 });
                if (body) {
                    body.animate(
                        [{ opacity: 0, transform: "translateY(-14px)" }, { opacity: 1, transform: "translateY(0)" }],
                        { duration: 550, delay: 120, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "backwards" }
                    );
                }
            } else {
                if (closeWrap) {
                    closeWrap.animate(
                        [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.3)" }],
                        { duration: 220, easing: "ease-in", fill: "forwards" }
                    );
                }
                d.classList.remove("poem-open");
                var closedH = summary.offsetHeight + (d.offsetHeight - d.clientHeight);
                running = d.animate([
                    { height: startH + "px", easing: "ease-in" },
                    { height: closedH * 0.97 + "px", offset: 0.55, easing: "ease-out" },
                    { height: closedH * 1.02 + "px", offset: 0.8, easing: "ease-in-out" },
                    { height: closedH + "px" }
                ], { duration: 600 });
                if (body) {
                    body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
                }
            }

            var anim = running;
            anim.onfinish = function () {
                if (!opening) d.open = false;
                running = null;
                if (body) body.getAnimations().forEach(function (a) { a.cancel(); });
                if (closeWrap && !opening) closeWrap.getAnimations().forEach(function (a) { a.cancel(); });
            };
            anim.oncancel = function () { /* superseded by a newer toggle */ };
        }

        summary.addEventListener("click", function (e) {
            e.preventDefault();
            toggle(!d.open);
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", function (e) {
                e.preventDefault();
                if (d.open) toggle(false);
            });
        }

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && d.open) toggle(false);
        });
    }

    /* Which lens: "mine" (Snell's-law edge lens, the default) or "default" (blur only). */
    function resolveLensVariant() {
        var variant = "mine";
        try {
            var q = new URLSearchParams(window.location.search).get("lens");
            if (q === "mine" || q === "default") localStorage.setItem("lens-variant", q);
            variant = localStorage.getItem("lens-variant") || "mine";
            if (variant !== "default") variant = "mine";
        } catch (e) {}
        /* No backdrop-filter refraction outside Chromium: plain blur there. */
        if (root.classList.contains("lens-fallback")) variant = "default";
        root.setAttribute("data-lens", variant);
        return variant;
    }

    function initLensVariant() {
        var variant = root.getAttribute("data-lens");
        if (variant !== "mine") return;
        document.querySelectorAll(".pen-icon .pen-btn, .pen-pill .pen-btn").forEach(function (btn, i) {
            var isFab = btn.classList.contains("fab");
            var side = Math.min(btn.offsetWidth, btn.offsetHeight) || 33;
            wireResizingLens(btn, "liquid-lens-mine-" + i, {
                snell: true,
                maxDisplacement: Math.max(4, Math.round(side * 0.2)),
                bezelWidth: Math.round(side * 0.36),
                blurStd: 0.9,
                saturate: 1.15,
                cssVar: "--btn-lens"
            });
        });
    }

    function initLiquidLens() {
        if (typeof CanvasRenderingContext2D === "undefined") return;
        resolveLensVariant();

        wireResizingLens(document.querySelector(".header-fixed"), "liquid-lens-header", navLensOptions());
        initLensVariant();
        /* One lens for every surface (header, footer, settings panel): same displacement map parameters and same light blur. */
        wireResizingLens(document.getElementById("settings-panel"), "liquid-lens-panel", isMineLens() ? {
            snell: true,
            maxDisplacement: 10,
            bezelWidth: 26,
            blurStd: 5,
            saturate: 1.2,
            aberration: LENS_ABERRATION,
            cssVar: "--lens-backdrop"
        } : {
            maxDisplacement: 10,
            bezelWidth: 24,
            aberration: LENS_ABERRATION,
            backdropEffects: "blur(8px) saturate(1.15)",
            cssVar: "--lens-backdrop"
        });
        wireResizingLens(document.querySelector("footer.glass"), "liquid-lens-footer", navLensOptions());
        if (isMineLens()) {
            /* cards and the contrast track get the same edge lens */
            var cardLens = { snell: true, maxDisplacement: 7, bezelWidth: 16, blurStd: 1.4, saturate: 1.15 };
            /* the poem card is one of the big glass sheets: same lens as header and footer */
            var sheetLens = navLensOptions();
            delete sheetLens.cssVar;
            /* "Read a poem" is the clear, demo-style glass: pure refraction with colour fringing and no blur. */
            var poemLens = Object.assign({}, sheetLens, { aberration: LENS_ABERRATION, maxDisplacement: 16, bezelWidth: 30 });
            delete poemLens.backdropEffects;
            wireResizingLens(document.querySelector("main details"), "liquid-lens-poem", poemLens);
            wireResizingLens(document.getElementById("lanyard-panel"), "liquid-lens-lanyard", Object.assign({}, sheetLens));
            document.querySelectorAll(".segmented").forEach(function (seg, i) {
                var tag = i || "";
                /* Track lens lives on ::before so the sliding bead (below) is not inside a backdrop root and sees the real page. */
                wireResizingLens(seg, "liquid-lens-seg" + tag, {
                    snell: true, maxDisplacement: 4, bezelWidth: 10, blurStd: 1, saturate: 1.1, cssVar: "--seg-lens"
                });
                var bead = seg.querySelector(".segmented-indicator");
                if (!bead) return;
                var count = seg.querySelectorAll(":scope > button, :scope > a").length || 2;
                var beadLens = function () {
                    var w = Math.round((seg.offsetWidth - 6) / count - 3);
                    var h = seg.offsetHeight - 6;
                    if (w < 8 || h < 8) return;
                    applyLiquidLens(bead, "liquid-lens-bead" + tag, {
                        snell: true,
                        size: { width: w, height: h },
                        maxDisplacement: Math.max(4, Math.round(h * 0.2)),
                        bezelWidth: Math.round(h * 0.4),
                        blurStd: 0.6,
                        saturate: 1.2,
                        cssVar: "--seg-bead-lens"
                    });
                };
                beadLens();
                if (typeof ResizeObserver !== "undefined") {
                    var t;
                    new ResizeObserver(function () { clearTimeout(t); t = setTimeout(beadLens, 120); }).observe(seg);
                }
            });
        }
    }

    /* Theme (dark/light) - shared between the header icon and the dark-mode switch inside the settings panel. */
    var themeTransitionTimer = null;
    var themeTransitionCleanup = null;

    /* Theme switch. */
    function setTheme(theme, origin) {
        if (theme === settings.theme || settings.background === "oneday") return;
        if (document.startViewTransition && !settings.reduceMotion) {
            var x = origin ? origin.x : window.innerWidth - 40;
            var y = origin ? origin.y : 40;
            root.style.setProperty("--vt-x", x + "px");
            root.style.setProperty("--vt-y", y + "px");
            root.style.setProperty("--vt-r", Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + "px");
            var done = function () { if (window.refreshAdaptiveControls) window.refreshAdaptiveControls(); };
            var vt = document.startViewTransition(function () { commitTheme(theme); });
            vt.finished.then(done, done);
            return;
        }
        setThemeFallback(theme);
    }

    function commitTheme(theme) {
        settings.theme = theme;
        applySettings();
        refreshHeaderLens();
        saveSettings(settings);
        syncThemeControls();
    }

    function setThemeFallback(theme) {
        /* Soft cross-fade on the colors that actually flip with the theme, instead of an instant snap. */
        root.classList.add("theme-transition");
        window.clearTimeout(themeTransitionTimer);
        if (themeTransitionCleanup) {
            root.removeEventListener("transitionend", themeTransitionCleanup);
        }

        var settled = false;
        function finishTransition() {
            if (settled) return;
            settled = true;
            root.classList.remove("theme-transition");
            root.removeEventListener("transitionend", themeTransitionCleanup);
            /* Everything behind every control just changed color (page bg, cards */
            if (window.refreshAdaptiveControls) window.refreshAdaptiveControls();
        }
        themeTransitionCleanup = function (e) {
            if (e.target === root && e.propertyName === "background-color") {
                finishTransition();
            }
        };
        root.addEventListener("transitionend", themeTransitionCleanup);
        themeTransitionTimer = window.setTimeout(finishTransition, 600);

        settings.theme = theme;
        applySettings();
        refreshHeaderLens();
        saveSettings(settings);
        syncThemeControls();
    }

    function syncThemeControls() {
        var btn = document.getElementById("sun");
        var isDark = effTheme() === "dark";
        if (btn) {
            var label = isDark ? "Switch to light mode" : "Switch to dark mode";
            btn.setAttribute("title", label);
            btn.setAttribute("aria-label", label);
        }
        var darkSwitch = document.getElementById("dark-mode-switch");
        if (darkSwitch) darkSwitch.checked = isDark;
    }

    function centerOf(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /* applySettings(), wrapped in the circular theme reveal if the page theme is about to change (used by the One day */
    function applyWithThemeTransition(origin, fadeIfSame) {
        var before = root.getAttribute("data-theme");
        if (effTheme() !== before && document.startViewTransition && !settings.reduceMotion) {
            root.style.setProperty("--vt-x", origin.x + "px");
            root.style.setProperty("--vt-y", origin.y + "px");
            root.style.setProperty("--vt-r", Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y)) + "px");
            var done = function () { if (window.refreshAdaptiveControls) window.refreshAdaptiveControls(); };
            var vt = document.startViewTransition(function () { applySettings(); refreshHeaderLens(); syncThemeControls(); });
            vt.finished.then(done, done);
        } else if (fadeIfSame && document.startViewTransition && !settings.reduceMotion) {
            /* same theme, new background: a soft dissolve instead of an instant swap */
            root.classList.add("vt-fade");
            var undo = function () { root.classList.remove("vt-fade"); };
            var vt2 = document.startViewTransition(function () { applySettings(); refreshHeaderLens(); syncThemeControls(); });
            vt2.finished.then(undo, undo);
        } else {
            applySettings();
            refreshHeaderLens();
            if (window.refreshAdaptiveControls && effTheme() !== before) window.refreshAdaptiveControls();
        }
    }

    /* One day: keep the sky current. */
    function tickOneDay() {
        oneDayTick();
    }

    function wireThemeToggle() {
        var btn = document.getElementById("sun");
        if (btn) {
            btn.addEventListener("click", function () {
                setTheme(settings.theme === "dark" ? "light" : "dark", centerOf(btn));
            });
        }
        syncThemeControls();
    }

    /* FAB + settings panel */
    function wireSettingsPanel() {
        var fab = document.getElementById("settings-fab");
        var panel = document.getElementById("settings-panel");
        if (!fab || !panel) return;

        var closeBtn = document.getElementById("settings-close");

        var fabWrap = fab.closest(".fab-wrap") || fab;
        var morph = null, fabAnim = null;

        /* geometry of the button-sized capsule the panel morphs from/to */
        function fabState() {
            var fr = fab.getBoundingClientRect();
            var pw = panel.offsetWidth, ph = panel.offsetHeight;
            var cs = getComputedStyle(panel);
            var cx = document.documentElement.clientWidth - parseFloat(cs.right) - pw / 2;
            var cy = document.documentElement.clientHeight - parseFloat(cs.bottom) - ph / 2;
            var sx = fr.width / pw, sy = fr.height / ph;
            return { sx: sx, sy: sy, dx: fr.left + fr.width / 2 - cx, dy: fr.top + fr.height / 2 - cy, rx: fr.width / 2 / sx, ry: fr.height / 2 / sy };
        }

        /* Liquid morph driven by two coupled springs (width and height settle slightly out of step */
        function playMorph(opening) {
            var st = fabState();
            if (morph) morph.cancel();
            var target = opening ? 1 : 0;
            var kx = opening ? 0 : 1, ky = kx, vx = 0, vy = 0;
            var P = opening
                ? { sxS: 320, sxD: 21, syS: 400, syD: 25 }
                : { sxS: 460, sxD: 35, syS: 540, syD: 38 };
            var last = performance.now(), raf = 0, cancelled = false, api = {};
            var reduce = !!settings.reduceMotion;

            function clearStyle() { panel.style.transform = ""; panel.style.borderRadius = ""; }

            function apply() {
                var sx = (st.sx + (1 - st.sx) * kx), sy = (st.sy + (1 - st.sy) * ky);
                /* squash/stretch along the direction of travel */
                var stretch = Math.max(-0.16, Math.min(0.2, vy * 0.045));
                sy *= 1 + stretch;
                sx *= 1 - stretch * 0.7;
                var kk = Math.max(0, Math.min(1, ky));
                var tilt = -50 * (1 - kk) * (1 - kk) * (opening ? 1 : 1);
                var rx = st.rx + (22 - st.rx) * Math.min(1, Math.max(0, kx));
                var ry = st.ry + (22 - st.ry) * Math.min(1, Math.max(0, ky));
                panel.style.transform = "perspective(1000px) translate(" + (st.dx * (1 - kx)).toFixed(2) + "px," + (st.dy * (1 - ky)).toFixed(2) + "px) scale(" +
                    sx.toFixed(4) + "," + sy.toFixed(4) + ") rotateX(" + tilt.toFixed(2) + "deg)";
                panel.style.borderRadius = rx.toFixed(1) + "px / " + ry.toFixed(1) + "px";
            }

            function frame(now) {
                if (cancelled) return;
                var dt = Math.min(0.032, (now - last) / 1000); last = now;
                var steps = Math.max(1, Math.round(dt / 0.004)), h = dt / steps;
                for (var i = 0; i < steps; i++) {
                    vx += (-P.sxS * (kx - target) - P.sxD * vx) * h; kx += vx * h;
                    vy += (-P.syS * (ky - target) - P.syD * vy) * h; ky += vy * h;
                }
                apply();
                var rest = Math.abs(kx - target) < 0.0015 && Math.abs(ky - target) < 0.0015 && Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01;
                /* closing ends the moment the sheet has become the button */
                if (!opening && kx < 0.05 && ky < 0.05) rest = true;
                if (rest) {
                    clearStyle();
                    if (api.onfinish) api.onfinish();
                    return;
                }
                raf = requestAnimationFrame(frame);
            }

            api.cancel = function () { cancelled = true; cancelAnimationFrame(raf); clearStyle(); };
            if (reduce) {
                window.setTimeout(function () { clearStyle(); if (api.onfinish) api.onfinish(); }, 0);
            } else {
                apply();
                raf = requestAnimationFrame(frame);
            }
            morph = api;
            return api;
        }

        /* the button: swallowed by the panel on open, springing back on close */
        function playFab(opening) {
            if (fabAnim) fabAnim.cancel();
            if (opening) {
                fabAnim = fabWrap.animate(
                    [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.55)", opacity: 0 }],
                    { duration: 150, easing: "ease-in", fill: "forwards" });
            } else {
                fabAnim = fabWrap.animate(
                    [{ transform: "scale(0.5)", opacity: 0, offset: 0 },
                     { transform: "scale(1.16)", opacity: 1, offset: 0.45 },
                     { transform: "scale(0.94)", opacity: 1, offset: 0.7 },
                     { transform: "scale(1.03)", offset: 0.88 },
                     { transform: "scale(1)", opacity: 1, offset: 1 }],
                    { duration: 400, easing: "ease-out" });
            }
        }

        /* Content-aware labels: while open, flip a label's colour when the bright ID badge sits under it. */
        var adaptiveOn = false;
        function adaptText() {
            if (!panel.classList.contains("is-open") && !panel.classList.contains("is-closing")) { adaptiveOn = false; clearAdaptive(); return; }
            var rect = window.__lanyardCardRect && window.__lanyardCardRect();
            var dark = root.getAttribute("data-theme") === "dark", bg = dark ? 0.12 : 0.94;
            var ca = rect ? Math.cos(rect.a) : 1, sa = rect ? Math.sin(rect.a) : 0;
            panel.querySelectorAll(".setting-label, .settings-panel h2, .bg-name, .setting-value").forEach(function (el) {
                var r = el.getBoundingClientRect(), inside = 0, n = 0, i, j;
                if (!r.width) return;
                for (i = 0; i < 6; i++) for (j = 0; j < 2; j++) {
                    n++;
                    if (!rect) continue;
                    var px = r.left + r.width * (i + 0.5) / 6 - rect.cx, py = r.top + r.height * (j + 1) / 3 - rect.cy;
                    var lx = px * ca + py * sa, ly = -px * sa + py * ca;
                    if (Math.abs(lx) < rect.w / 2 && Math.abs(ly) < rect.h / 2) inside++;
                }
                var cover = inside / n, luma = bg * (1 - cover) + 0.96 * cover;
                var wantDark = dark && luma > 0.5, wantLight = !dark && luma < 0.3;
                el.classList.toggle("under-bright", wantDark);
                el.classList.toggle("under-dark", wantLight);
            });
            setTimeout(function () { requestAnimationFrame(adaptText); }, 110);
        }
        function clearAdaptive() {
            panel.querySelectorAll(".under-bright, .under-dark").forEach(function (el) { el.classList.remove("under-bright", "under-dark"); });
        }
        function startAdaptive() { if (adaptiveOn) return; adaptiveOn = true; adaptText(); }

        function openPanel() {
            panel.classList.remove("is-closing");
            panel.classList.add("is-open");
            startAdaptive();
            fab.setAttribute("aria-expanded", "true");
            panel.setAttribute("aria-hidden", "false");
            playMorph(true);
            playFab(true);
            fabWrap.style.pointerEvents = "none";
            bouncePanel(true);
        }

        /* Rows spring in one after another once the surface has started to unfurl. */
        function bouncePanel(opening) {
            if (!opening || !panel.animate) return;
            panel.querySelectorAll("h2, .setting-row").forEach(function (row, i) {
                row.animate(
                    [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
                    { duration: 260, delay: 140 + i * 26, easing: "cubic-bezier(0.22, 1.2, 0.36, 1)", fill: "backwards" }
                );
            });
        }

        function closePanel() {
            if (!panel.classList.contains("is-open")) return;
            panel.classList.remove("is-open");
            /* .is-closing keeps the panel visible while it flows back into the button */
            panel.classList.add("is-closing");
            fab.setAttribute("aria-expanded", "false");
            panel.setAttribute("aria-hidden", "true");
            var m = playMorph(false);
            var done = function () {
                if (panel.classList.contains("is-open")) return;
                panel.classList.remove("is-closing");
                if (fabAnim) fabAnim.cancel();
                fabWrap.style.pointerEvents = "";
                playFab(false);
            };
            m.onfinish = done;
            m.oncancel = function () { /* superseded by a newer open */ };
        }

        fab.addEventListener("click", function (event) {
            event.stopPropagation();
            if (panel.classList.contains("is-open")) {
                closePanel();
            } else {
                openPanel();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", function (event) {
                event.stopPropagation();
                closePanel();
            });
        }

        panel.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        document.addEventListener("click", function (event) {
            if (panel.classList.contains("is-open") && !panel.contains(event.target) && !fab.contains(event.target)) {
                closePanel();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && panel.classList.contains("is-open")) {
                closePanel();
                fab.focus();
            }
        });

        /* Filled-track look: paint the slider blue up to its value, like iOS sliders */
        function updateFill(rangeEl) {
            var min = Number(rangeEl.min) || 0;
            var max = Number(rangeEl.max) || 100;
            var pct = ((Number(rangeEl.value) - min) / (max - min)) * 100;
            rangeEl.style.setProperty("--fill", pct + "%");
            rangeEl.style.setProperty("--fillp", (pct / 100).toFixed(4));
        }

        /* Clarity slider */
        var clarity = document.getElementById("clarity-range");
        var clarityValue = document.getElementById("clarity-value");
        if (clarity) {
            clarity.value = settings.glassClarity;
            updateFill(clarity);
            if (clarityValue) clarityValue.textContent = settings.glassClarity;
            clarity.addEventListener("input", function () {
                settings.glassClarity = Number(clarity.value);
                updateFill(clarity);
                if (clarityValue) clarityValue.textContent = settings.glassClarity;
                applySettings();
                saveSettings(settings);
            });
        }

        /* Font size slider (as a percentage) */
        var fontSize = document.getElementById("fontsize-range");
        var fontSizeValue = document.getElementById("fontsize-value");
        if (fontSize) {
            var initialPct = Math.round(settings.fontScale * 100);
            fontSize.value = initialPct;
            updateFill(fontSize);
            if (fontSizeValue) fontSizeValue.textContent = initialPct + "%";
            fontSize.addEventListener("input", function () {
                var pct = Number(fontSize.value);
                settings.fontScale = pct / 100;
                updateFill(fontSize);
                if (fontSizeValue) fontSizeValue.textContent = pct + "%";
                applySettings();
                saveSettings(settings);
            });
        }

        /* Font weight slider */
        var weight = document.getElementById("weight-range");
        var weightValue = document.getElementById("weight-value");
        var weightNames = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" };
        if (weight) {
            weight.value = settings.fontWeight;
            updateFill(weight);
            if (weightValue) weightValue.textContent = weightNames[settings.fontWeight] || settings.fontWeight;
            weight.addEventListener("input", function () {
                settings.fontWeight = Number(weight.value);
                updateFill(weight);
                if (weightValue) weightValue.textContent = weightNames[settings.fontWeight] || settings.fontWeight;
                applySettings();
                saveSettings(settings);
            });
        }

        /* Dark mode switch */
        var darkSwitch = document.getElementById("dark-mode-switch");
        if (darkSwitch) {
            darkSwitch.checked = effTheme() === "dark";
            darkSwitch.addEventListener("change", function () {
                setTheme(darkSwitch.checked ? "dark" : "light", centerOf(darkSwitch));
            });
        }

        /* Background theme grid. Tapping the selected tile re-rolls it. */
        var bgTiles = panel.querySelectorAll(".bg-tile");
        function syncBgTiles() {
            bgTiles.forEach(function (tile) {
                var on = tile.getAttribute("data-bg") === settings.background;
                tile.classList.toggle("is-selected", on);
                tile.setAttribute("aria-checked", String(on));
            });
        }
        bgTiles.forEach(function (tile) {
            tile.addEventListener("click", function () {
                var id = tile.getAttribute("data-bg");
                if (settings.background === id) {
                    bgState[id] = null;
                    if (id === "glyphs") art = null;
                } else {
                    settings.background = id;
                }
                applyWithThemeTransition(centerOf(tile), true);
                saveSettings(settings);
                syncBgTiles();
                syncThemeControls();
                var thumb = tile.querySelector(".bg-thumb");
                if (thumb && thumb.animate) {
                    thumb.animate([{ transform: "scale(0.94)" }, { transform: "scale(1.03)", offset: 0.6 }, { transform: "scale(1)" }],
                        { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
                }
            });
        });
        syncBgTiles();
        renderBgTiles(effTheme() === "dark");

        /* Color sliders: two hues, both inside the cool range */
        var hueA = document.getElementById("hue-a");
        var hueB = document.getElementById("hue-b");
        var huePreview = document.getElementById("hue-preview");
        var hueAuto = document.getElementById("hue-auto");
        var hueAutoWrap = document.getElementById("hue-auto-wrap");
        if (hueA && hueB) {
            var huePending = false;
            var syncHue = function () {
                var custom = settings.bgColors && settings.bgColors.length === 2;
                if (custom) {
                    hueA.value = settings.bgColors[0];
                    hueB.value = settings.bgColors[1];
                }
                updateHueTrack(hueA);
                updateHueTrack(hueB);
                if (huePreview) {
                    var a = Number(hueA.value), b = Number(hueB.value);
                    huePreview.style.background = "linear-gradient(135deg, hsl(" + a + ",75%,46%), hsl(" + b + ",75%,44%))";
                    huePreview.classList.toggle("is-auto", !custom);
                }
                if (hueAutoWrap) hueAutoWrap.hidden = !custom;
            };
            var updateHueTrack = function (el) {
                var pct = ((Number(el.value) - 135) / (245 - 135)) * 100;
                el.style.setProperty("--hue-pos", pct + "%");
            };
            var onHue = function () {
                settings.bgColors = [Number(hueA.value), Number(hueB.value)];
                saveSettings(settings);
                syncHue();
                if (!huePending) {
                    huePending = true;
                    window.requestAnimationFrame(function () { huePending = false; applySettings(); });
                }
            };
            hueA.addEventListener("input", onHue);
            hueB.addEventListener("input", onHue);
            if (hueAuto) {
                hueAuto.addEventListener("click", function () {
                    settings.bgColors = null;
                    saveSettings(settings);
                    syncHue();
                    applySettings();
                });
            }
            syncHue();
        }

        /* Reduce motion switch */
        var motionSwitch = document.getElementById("motion-switch");
        if (motionSwitch) {
            motionSwitch.checked = !!settings.reduceMotion;
            motionSwitch.addEventListener("change", function () {
                settings.reduceMotion = motionSwitch.checked;
                applySettings();
                saveSettings(settings);
            });
        }

        /* Contrast segmented switcher */
        var contrastButtons = panel.querySelectorAll("[data-contrast-option]");
        function syncContrastButtons() {
            contrastButtons.forEach(function (btn) {
                var isSelected = btn.getAttribute("data-contrast-option") === settings.contrast;
                btn.classList.toggle("is-selected", isSelected);
                btn.setAttribute("aria-pressed", String(isSelected));
            });
        }
        var segmentedIndicator = panel.querySelector(".segmented-indicator");
        var segmented = panel.querySelector(".segmented");

        function setContrast(contrast) {
            if (settings.contrast === contrast) return;
            settings.contrast = contrast;
            applySettings();
            saveSettings(settings);
            syncContrastButtons();

            if (segmentedIndicator) {
                segmentedIndicator.classList.remove("is-morphing");
                void segmentedIndicator.offsetWidth;
                segmentedIndicator.classList.add("is-morphing");
            }
        }

        contrastButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                setContrast(btn.getAttribute("data-contrast-option"));
            });
        });

        if (segmented) {
            var draggingContrast = false;
            function contrastAt(clientX) {
                var bounds = segmented.getBoundingClientRect();
                return clientX < bounds.left + bounds.width / 2 ? "normal" : "high";
            }
            function finishContrastDrag(event) {
                if (!draggingContrast) return;
                draggingContrast = false;
                segmented.classList.remove("is-dragging");
                if (segmented.hasPointerCapture(event.pointerId)) segmented.releasePointerCapture(event.pointerId);
            }
            segmented.addEventListener("pointerdown", function (event) {
                if (event.button !== 0) return;
                draggingContrast = true;
                segmented.setPointerCapture(event.pointerId);
                segmented.classList.add("is-dragging");
                if (segmentedIndicator) segmentedIndicator.classList.remove("is-morphing");
                setContrast(contrastAt(event.clientX));
                event.preventDefault();
            });
            segmented.addEventListener("pointermove", function (event) {
                if (!draggingContrast) return;
                setContrast(contrastAt(event.clientX));
            });
            segmented.addEventListener("pointerup", finishContrastDrag);
            segmented.addEventListener("pointercancel", finishContrastDrag);
        }
        syncContrastButtons();
    }

    /* Existing site behaviour (translations, years of experience) */
    window.default_lang = "EN";
    window.translations = null;

    function GetSupportedFields() {
        var ids = [];
        document.querySelectorAll("[data-translationkey]").forEach(function (element) {
            if (element.dataset !== undefined) ids.push(element.dataset.translationkey);
        });
        return ids;
    }

    /* The CV / poem / contact links become real glass pills. */
    function enhanceInlinePills() {
        document.querySelectorAll('main p[data-translationkey="p-cv"] a, main p[data-translationkey="p-contact"] a').forEach(function (a) {
            if (a.classList.contains("pen-btn")) return;
            var wrap = document.createElement("span");
            wrap.className = "button-wrap pen-pill inline-pill";
            a.parentNode.insertBefore(wrap, a);
            var inner = document.createElement("span");
            while (a.firstChild) inner.appendChild(a.firstChild);
            a.appendChild(inner);
            a.classList.add("pen-btn");
            wrap.appendChild(a);
        });
        if (!isMineLens()) return;
        document.querySelectorAll(".inline-pill .pen-btn").forEach(function (btn, i) {
            var side = Math.min(btn.offsetWidth, btn.offsetHeight) || 24;
            wireResizingLens(btn, "liquid-lens-inline-" + i, {
                snell: true,
                maxDisplacement: Math.max(4, Math.round(side * 0.2)),
                bezelWidth: Math.round(side * 0.36),
                blurStd: 0.9,
                saturate: 1.15,
                cssVar: "--btn-lens"
            });
        });
    }

    function ApplyTranslation() {
        GetSupportedFields().forEach(function (element) {
            if (element === "a-buymecoffee") {
                document.querySelectorAll("[data-translationkey='" + element + "']").forEach(function (item) {
                    if (item.innerHTML !== "" && item.tagName === "A") {
                        item.title = window.translations[window.default_lang][element];
                    } else {
                        item.innerText = window.translations[window.default_lang][element];
                    }
                });
                return;
            }
            var target = document.querySelector("[data-translationkey='" + element + "']");
            var txt = window.translations[window.default_lang] && window.translations[window.default_lang][element];
            if (target && typeof txt === "string") target.innerHTML = txt;   /* a key missing from the file keeps its built-in text */
        });
        enhanceInlinePills();
    }

    function FetchTranslations() {
        var url = "https://eleazerarcilla.com/translations.json";
        /* on localhost or a preview host, read the sibling file so edits show up before they are published */
        if (/^https?:$/.test(window.location.protocol) && !/(^|\.)eleazerarcilla\.com$/.test(window.location.hostname)) url = "translations.json";
        /* no-cache: always revalidate, so an edited translations.json is never served stale from the browser cache */
        fetch(url, { cache: "no-cache" })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                window.translations = data;
                ApplyTranslation();
                /* The translated "sm-pseudo" string contains its own hardcoded <span id='sp-years'> */
                SetExpYears();
            })
            .catch(function () { /* translations unavailable - keep default copy */ });
    }

    var LANGS = ["EN", "ES", "TL"];
    var LANG_KEY = "site-lang";

    /* ?lang= wins, then the saved choice, then the browser language. */
    function pickLanguage() {
        var q = (new URLSearchParams(window.location.search).get("lang") || "").toUpperCase();
        if (LANGS.indexOf(q) !== -1) { saveLanguage(q); return q; }
        try {
            var saved = localStorage.getItem(LANG_KEY);
            if (LANGS.indexOf(saved) !== -1) return saved;
        } catch (e) {}
        var prefs = navigator.languages || [navigator.language || "en"];
        for (var i = 0; i < prefs.length; i++) {
            var code = String(prefs[i]).slice(0, 3).toLowerCase();
            if (code.slice(0, 2) === "es") return "ES";
            if (code === "tl" || code === "fil" || code.slice(0, 2) === "tl") return "TL";
            if (code.slice(0, 2) === "en") return "EN";
        }
        return "EN";
    }

    function saveLanguage(lang) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    }

    function SetHtmlLang(lang) {
        root.setAttribute("lang", { EN: "en", ES: "es", TL: "tl" }[lang] || "en");
    }

    /* Language segmented control: same sliding indicator as Contrast. */
    function initLanguageSelector() {
        var seg = document.querySelector(".lang-segmented");
        if (!seg) return;
        var links = Array.prototype.slice.call(seg.querySelectorAll("a[data-lang]"));
        var indicator = seg.querySelector(".segmented-indicator");
        var current = -1;

        function sync(lang, animate) {
            var idx = Math.max(0, links.findIndex(function (a) { return a.getAttribute("data-lang") === lang; }));
            if (animate) seg.setAttribute("data-dir", idx > current ? "right" : "left");
            current = idx;
            seg.style.setProperty("--seg-i", idx);
            links.forEach(function (a, i) {
                a.classList.toggle("is-selected", i === idx);
                if (i === idx) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
            });
            if (animate && indicator) {
                indicator.classList.remove("is-morphing");
                void indicator.offsetWidth;
                indicator.classList.add("is-morphing");
            }
        }

        /* first paint: no slide from position 0 */
        if (indicator) indicator.style.transition = "none";
        sync(String(window.default_lang || "EN").toUpperCase(), false);
        if (indicator) { void indicator.offsetWidth; indicator.style.transition = ""; }

        /* Narrow screens: the selector moves from the header to the top of the page content (and back when the screen widens). */
        var article = document.getElementById("language-selector");
        var home = article && article.parentNode;
        var slot = document.getElementById("lang-slot");
        var narrow = window.matchMedia("(max-width: 860px)");
        function place() {
            if (!article || !slot || !home) return;
            if (narrow.matches) slot.appendChild(article);
            else home.appendChild(article);
        }
        place();
        if (narrow.addEventListener) narrow.addEventListener("change", place);
        else if (narrow.addListener) narrow.addListener(place);

        /* Commit a language: translate in place when translations are loaded, otherwise fall back to a normal ?lang= navigation. */
        function commitLang(a) {
            var lang = a.getAttribute("data-lang");
            if (String(window.default_lang).toUpperCase() === lang) return true;
            if (!window.translations || !window.translations[lang]) return false;
            window.default_lang = lang;
            saveLanguage(lang);
            SetHtmlLang(lang);
            sync(lang, true);
            ApplyTranslation();
            SetExpYears();
            try { history.replaceState(null, "", a.getAttribute("href")); } catch (e) { /* file:// etc. */ }
            return true;
        }

        function indexAt(clientX) {
            var r = seg.getBoundingClientRect();
            var i = Math.floor(((clientX - r.left) / r.width) * links.length);
            return Math.max(0, Math.min(links.length - 1, i));
        }

        /* Drag like the contrast selector: the bead follows the pointer and the language is applied on release (a plain tap */
        var dragging = false, dragIdx = -1;
        seg.addEventListener("pointerdown", function (event) {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            dragging = true;
            dragIdx = indexAt(event.clientX);
            seg.setPointerCapture(event.pointerId);
            seg.classList.add("is-dragging");
            if (indicator) indicator.classList.remove("is-morphing");
            if (dragIdx !== current) sync(links[dragIdx].getAttribute("data-lang"), true);
            event.preventDefault();
        });
        seg.addEventListener("pointermove", function (event) {
            if (!dragging) return;
            var i = indexAt(event.clientX);
            if (i !== dragIdx) { dragIdx = i; sync(links[i].getAttribute("data-lang"), true); }
        });
        function endDrag(event, commit) {
            if (!dragging) return;
            dragging = false;
            seg.classList.remove("is-dragging");
            if (seg.hasPointerCapture(event.pointerId)) seg.releasePointerCapture(event.pointerId);
            if (!commit) return;
            var a = links[dragIdx];
            if (a && !commitLang(a)) window.location.href = a.getAttribute("href");
        }
        seg.addEventListener("pointerup", function (event) { endDrag(event, true); });
        seg.addEventListener("pointercancel", function (event) { endDrag(event, false); });

        /* mouse and touch were handled on release; this keeps keyboard activation (Enter on a focused link */
        links.forEach(function (a) {
            a.addEventListener("click", function (event) {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (event.detail === 0) {
                    if (commitLang(a)) event.preventDefault();
                } else {
                    event.preventDefault();
                }
            });
        });
    }

    function SetExpYears() {
        var el = document.getElementById("sp-years");
        if (el) el.innerHTML = GetYears();
        SetCopyrightYear();
    }

    /* The copyright line comes from translations too, so the year in it is swapped for the current one after every */
    function SetCopyrightYear() {
        var el = document.querySelector("[data-translationkey='sm-copyright']");
        if (el) el.innerHTML = el.innerHTML.replace(/\b(?:19|20)\d{2}\b/, String(new Date().getFullYear()));
    }

    function GetYears() {
        var today = new Date();
        var yearStarted = new Date("2015-08-15T00:00:00Z");
        var presentYearDiff = today.getUTCFullYear() - yearStarted.getUTCFullYear();
        var monthDiff = today.getUTCMonth() - yearStarted.getUTCMonth();
        var dayDiff = today.getUTCDate() - yearStarted.getUTCDate();
        var adjustedYears = presentYearDiff;
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
            adjustedYears--;
        }
        return adjustedYears;
    }
})();
