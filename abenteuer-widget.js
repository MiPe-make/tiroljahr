/* ============================================================
   ABENTEUER-WIDGET — Hauptlogik
   Verwendung:
     1) abenteuer-widget.css einbinden
     2) abenteuer-data.js einbinden  (window.AbenteuerData)
     3) abenteuer-widget.js einbinden (diese Datei)
     4) Konfiguration siehe unten

   Optionen:
     window.AbenteuerWidget.init({
       assetsPath: 'assets/',         // Pfad zu berge.png / tree-big.png / tree-med.png
       autoOpen: false,               // Beim Laden direkt öffnen?
       triggerSelector: '.ab-widget-trigger',  // Selektor für Open-Button(s)
       loadFonts: true                // Google-Fonts (Caveat + Patrick Hand) automatisch laden
     });

   Manuell öffnen / schließen:
     window.AbenteuerWidget.open();
     window.AbenteuerWidget.close();
   ============================================================ */

(function() {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const config = {
    assetsPath: 'assets/',
    photosPath: 'photos/',
    autoOpen: false,
    triggerSelector: '.ab-widget-trigger',
    loadFonts: true
  };

  let widgetBuilt = false;
  let widgetEl = null;
  let currentData = null;
  let mapObj = null;

  // ===== ÖFFENTLICHE API =====
  window.AbenteuerWidget = {
    init: function(opts) {
      Object.assign(config, opts || {});
      if (config.loadFonts) loadFonts();
      // Trigger-Buttons binden
      document.querySelectorAll(config.triggerSelector).forEach(btn => {
        btn.addEventListener('click', e => {
          e.preventDefault();
          openWidget();
        });
      });
      if (config.autoOpen) {
        // Etwas warten bis CSS/Fonts geladen sind
        setTimeout(openWidget, 100);
      }
    },
    open: openWidget,
    close: closeWidget
  };

  // ===== FONTS LADEN =====
  function loadFonts() {
    if (document.querySelector('link[href*="Caveat"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Patrick+Hand&display=swap';
    document.head.appendChild(link);
  }

  // ===== ECHTE KARTE (Leaflet + OpenStreetMap) =====
  let leafletLoading = false;
  const leafletCbs = [];
  function loadLeaflet(cb) {
    if (window.L) { cb(); return; }
    leafletCbs.push(cb);
    if (leafletLoading) return;
    leafletLoading = true;
    if (!document.querySelector('link[href*="leaflet"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = function () { leafletCbs.forEach(function (f) { f(); }); leafletCbs.length = 0; };
    document.head.appendChild(js);
  }

  function ensureLeafletMap() {
    const el = widgetEl && widgetEl.querySelector('.ab-leaflet-map');
    if (!el) return;
    if (mapObj) { mapObj.invalidateSize(); fitRoute(); return; }
    loadLeaflet(function () {
      if (mapObj || !window.L || !currentData) return;
      mapObj = L.map(el, { scrollWheelZoom: true, zoomControl: true });
      // Ansicht ZUERST setzen — Leaflet braucht Center/Zoom, bevor Layer/Marker hinzukommen.
      const rpInit = (currentData && currentData.routePath) || [];
      if (rpInit.length) {
        mapObj.fitBounds(rpInit, { padding: [45, 45] });
      } else {
        mapObj.setView([47.1, 11.3], 8);
      }
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap-Mitwirkende'
      }).addTo(mapObj);

      // Regionen Tirol & Südtirol leicht einfärben (unter der Route)
      if (currentData && currentData.regions) {
        if (currentData.regions.tirol) {
          L.geoJSON(currentData.regions.tirol, { interactive: false,
            style: { color: '#c2557a', weight: 2, opacity: 0.55, fillColor: '#f4b8d0', fillOpacity: 0.32 } }).addTo(mapObj);
        }
        if (currentData.regions.suedtirol) {
          L.geoJSON(currentData.regions.suedtirol, { interactive: false,
            style: { color: '#a9802b', weight: 2, opacity: 0.55, fillColor: '#f0d896', fillOpacity: 0.34 } }).addTo(mapObj);
        }
      }

      const rp = (currentData && currentData.routePath) || [];
      if (rp.length) {
        L.polyline(rp, { color: '#d4691a', weight: 4, opacity: 0.85, dashArray: '10 8', lineCap: 'round' }).addTo(mapObj);
      }

      const routeNum = {};
      (currentData.routeOrder || []).forEach(function (id, i) { routeNum[id] = i + 1; });
      currentData.stations.forEach(function (s) {
        if (s.lat == null || s.lon == null) return;
        const num = routeNum[s.id] || '';
        const icon = L.divIcon({
          className: 'ab-leaflet-pin',
          html: '<svg width="36" height="46" viewBox="-30 -60 60 60">'
            + '<path d="M 0 0 C -8 -8, -28 -22, -28 -38 C -28 -49, -16 -58, 0 -58 C 16 -58, 28 -49, 28 -38 C 28 -22, 8 -8, 0 0 Z" fill="' + s.color + '" stroke="#2c3e50" stroke-width="2.5"/>'
            + '<circle cx="0" cy="-38" r="15" fill="white" stroke="#2c3e50" stroke-width="2"/>'
            + '<text x="0" y="-38" text-anchor="middle" dominant-baseline="central" class="ab-pin-number">' + num + '</text>'
            + '</svg>',
          iconSize: [36, 46], iconAnchor: [18, 46], tooltipAnchor: [0, -40]
        });
        const m = L.marker([s.lat, s.lon], { icon: icon }).addTo(mapObj);
        m.bindTooltip(String(s.name).replace(/\n/g, ' '), { permanent: false, direction: 'top', className: 'ab-leaflet-label', opacity: 1 });
        m.on('click', function () { openStationModal(s); });
      });
      fitRoute();
      // Größe mehrfach nachjustieren (Container kann beim Öffnen/Animation noch 0 sein)
      [120, 400, 800].forEach(function (ms) {
        setTimeout(function () { if (mapObj) { mapObj.invalidateSize(); fitRoute(); } }, ms);
      });
    });
  }

  function fitRoute() {
    if (!mapObj) return;
    const rp = (currentData && currentData.routePath) || [];
    if (rp.length) mapObj.fitBounds(rp, { padding: [45, 45] });
  }

  // ===== WIDGET ÖFFNEN =====
  function openWidget() {
    if (!widgetBuilt) {
      buildWidget();
      widgetBuilt = true;
    }
    widgetEl.classList.add('ab-open');
    document.body.classList.add('ab-widget-open');
    // Zur Spitze scrollen
    widgetEl.scrollTop = 0;
    // Echte Karte initialisieren (erst nach der Einblend-Animation → korrekte Größe)
    setTimeout(ensureLeafletMap, 350);
  }

  function closeWidget() {
    if (!widgetEl) return;
    widgetEl.classList.remove('ab-open');
    document.body.classList.remove('ab-widget-open');
    // Falls Modal noch offen, auch zumachen
    const modal = widgetEl.querySelector('.ab-modal-overlay');
    if (modal) modal.classList.remove('ab-show');
    const lb = widgetEl.querySelector('.ab-lightbox');
    if (lb) lb.classList.remove('ab-show');
  }

  // ===== WIDGET-HTML AUFBAUEN =====
  function buildWidget() {
    const data = window.AbenteuerData;
    if (!data) {
      console.error('AbenteuerWidget: window.AbenteuerData fehlt — abenteuer-data.js einbinden.');
      return;
    }
    currentData = data;

    widgetEl = document.createElement('div');
    widgetEl.className = 'ab-widget';
    widgetEl.setAttribute('role', 'dialog');
    widgetEl.setAttribute('aria-modal', 'true');
    widgetEl.setAttribute('aria-label', 'Unsere Abenteuer in Tirol und Südtirol');

    widgetEl.innerHTML = `
      <button class="ab-close-btn" aria-label="Schließen" title="Schließen">×</button>

      <header>
        <h1>Unsere Abenteuer</h1>
        <div class="ab-subtitle">Tirol & Südtirol — into the wild</div>
      </header>

      <div class="ab-teaser-wrap">
        <img class="ab-berge-img" src="${config.assetsPath}berge.png" alt="">
        <div class="ab-teaser-box">
          <h2>Auf Entdeckungsreise!</h2>
          <div class="ab-school-year-wrap">
            <span class="ab-school-year">Schuljahr 2025/26</span>
          </div>
          <p>Im Schuljahr 2025/26 haben wir uns auf eine ganz besondere Reise gemacht — quer durch <strong>Tirol</strong> und <strong>Südtirol</strong>, von alten Burgmauern über tief verborgene Bergwerksstollen bis hin zu sagenumwobenen Schluchten und einer versunkenen Kirche mitten im See. Jeder Ausflug war ein neues Kapitel voller Geschichte, Natur und Abenteuer.</p>
        </div>
      </div>

      <div class="ab-map-wrapper">
        <div class="ab-map-card">
          <div class="ab-leaflet-map"></div>
        </div>
      </div>

      <div class="ab-modal-overlay">
        <div class="ab-modal">
          <button class="ab-modal-close-btn" aria-label="Schließen">×</button>
          <div class="ab-modal-header"></div>
          <div class="ab-modal-body"></div>
        </div>
      </div>

      <div class="ab-lightbox">
        <img alt="">
        <button class="ab-lb-prev" aria-label="Vorheriges Foto">&#8249;</button>
        <button class="ab-lb-next" aria-label="Nächstes Foto">&#8250;</button>
        <div class="ab-lb-counter"></div>
      </div>
    `;

    document.body.appendChild(widgetEl);

    setupEventHandlers();
  }

  // ===== SVG-Karte aufbauen =====
  function buildSVG(data) {
    return `
      <svg viewBox="${data.viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <!-- Wolken -->
        <g opacity="0.85" pointer-events="none">
          <!-- oben links -->
          <g transform="translate(90, 50)">
            <ellipse cx="0" cy="0" rx="28" ry="11" fill="white"/>
            <ellipse cx="-18" cy="2" rx="18" ry="9" fill="white"/>
            <ellipse cx="18" cy="2" rx="18" ry="9" fill="white"/>
          </g>
          <!-- oben mitte-links -->
          <g transform="translate(280, 75)">
            <ellipse cx="0" cy="0" rx="30" ry="12" fill="white"/>
            <ellipse cx="-20" cy="2" rx="20" ry="10" fill="white"/>
            <ellipse cx="20" cy="2" rx="20" ry="10" fill="white"/>
          </g>
          <!-- oben rechts -->
          <g transform="translate(870, 45)">
            <ellipse cx="0" cy="0" rx="35" ry="14" fill="white"/>
            <ellipse cx="-25" cy="3" rx="22" ry="11" fill="white"/>
            <ellipse cx="25" cy="3" rx="22" ry="11" fill="white"/>
          </g>
          <!-- mitte rechts -->
          <g transform="translate(1060, 180)">
            <ellipse cx="0" cy="0" rx="25" ry="10" fill="white"/>
            <ellipse cx="-16" cy="2" rx="16" ry="8" fill="white"/>
            <ellipse cx="16" cy="2" rx="16" ry="8" fill="white"/>
          </g>
          <!-- unten links -->
          <g transform="translate(80, 620)">
            <ellipse cx="0" cy="0" rx="32" ry="13" fill="white"/>
            <ellipse cx="-22" cy="2" rx="20" ry="10" fill="white"/>
            <ellipse cx="22" cy="2" rx="20" ry="10" fill="white"/>
          </g>
          <!-- unten mitte -->
          <g transform="translate(650, 655)">
            <ellipse cx="0" cy="0" rx="26" ry="10" fill="white"/>
            <ellipse cx="-17" cy="2" rx="17" ry="8" fill="white"/>
            <ellipse cx="17" cy="2" rx="17" ry="8" fill="white"/>
          </g>
          <!-- unten rechts -->
          <g transform="translate(1080, 635)">
            <ellipse cx="0" cy="0" rx="30" ry="12" fill="white"/>
            <ellipse cx="-20" cy="2" rx="19" ry="9" fill="white"/>
            <ellipse cx="20" cy="2" rx="19" ry="9" fill="white"/>
          </g>
        </g>

        <!-- Tirol & Südtirol -->
        <path class="ab-tirol-shape" d="${data.tirolPath}"/>
        <path class="ab-suedtirol-shape" d="${data.suedtirolPath}"/>

        <!-- Country labels (leicht transparent) -->
        <g pointer-events="none" opacity="0.55">
          <text x="430" y="260" text-anchor="middle" font-family="Caveat" font-size="68" font-weight="700"
                fill="#2c3e50" paint-order="stroke" stroke="white" stroke-width="9" stroke-linejoin="round">
            🇦🇹 TIROL
          </text>
          <text x="600" y="490" text-anchor="middle" font-family="Caveat" font-size="68" font-weight="700"
                fill="#2c3e50" paint-order="stroke" stroke="white" stroke-width="9" stroke-linejoin="round">
            🇮🇹 SÜDTIROL
          </text>
        </g>

        <!-- Kompassrose rechts oben -->
        <g transform="translate(1130, 80)" pointer-events="none">
          <circle cx="0" cy="0" r="40" fill="white" stroke="#2c3e50" stroke-width="3"/>
          <path d="M 0 -32 L 6 0 L 0 32 L -6 0 Z" fill="#e63946" stroke="#2c3e50" stroke-width="2"/>
          <path d="M -32 0 L 0 6 L 32 0 L 0 -6 Z" fill="#f4f1e8" stroke="#2c3e50" stroke-width="2"/>
          <text x="0" y="-18" text-anchor="middle" font-family="Caveat" font-size="16" font-weight="700" fill="#2c3e50">N</text>
        </g>

        <!-- Route -->
        <path class="ab-route-path" d="" />

        <!-- Stations -->
        <g class="ab-stations-group"></g>
      </svg>
    `;
  }

  // ===== Pins platzieren =====
  function placePins(data) {
    const stations = data.stations;
    const routeOrder = data.routeOrder;
    const labelOffsets = data.labelOffsets;

    // Reihenfolge-Nummern (1-basiert)
    const routeNum = {};
    routeOrder.forEach((id, i) => { routeNum[id] = i + 1; });

    // Route-Pfad
    const routePoints = routeOrder
      .map(id => stations.find(s => s.id === id))
      .filter(s => s);
    // Weiche, geschwungene Linie (Catmull-Rom-Spline) statt gerader Segmente,
    // damit die Route wie eine kurvige Straße wirkt.
    const pts = routePoints.map(s => ({ x: s.x, y: s.y }));
    let pathD = '';
    if (pts.length === 1) {
      pathD = 'M ' + pts[0].x + ' ' + pts[0].y;
    } else if (pts.length > 1) {
      const k = 0.5; // Kurvenstärke
      pathD = 'M ' + pts[0].x + ' ' + pts[0].y;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6 * (k * 2);
        const cp1y = p1.y + (p2.y - p0.y) / 6 * (k * 2);
        const cp2x = p2.x - (p3.x - p1.x) / 6 * (k * 2);
        const cp2y = p2.y - (p3.y - p1.y) / 6 * (k * 2);
        pathD += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) +
                 ', ' + cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) +
                 ', ' + p2.x + ' ' + p2.y;
      }
    }
    widgetEl.querySelector('.ab-route-path').setAttribute('d', pathD);

    // Stationen
    const group = widgetEl.querySelector('.ab-stations-group');
    stations.forEach((s, i) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'ab-pin-group');
      g.setAttribute('transform', `translate(${s.x}, ${s.y})`);

      const off = labelOffsets[s.id] || { dx: 0, dy: 16 };
      const num = routeNum[s.id] || '';

      g.innerHTML = `
        <g class="ab-pin-drop" transform="scale(0.55)" style="animation-delay: ${0.4 + i * 0.12}s">
          <ellipse cx="0" cy="2" rx="12" ry="3" fill="rgba(0,0,0,0.3)"/>
          <path class="ab-pin-shape" d="M 0 0 C -8 -8, -28 -22, -28 -38 C -28 -49, -16 -58, 0 -58 C 16 -58, 28 -49, 28 -38 C 28 -22, 8 -8, 0 0 Z"
                fill="${s.color}" stroke="#2c3e50" stroke-width="2.5"
                style="filter: drop-shadow(1px 3px 2px rgba(0,0,0,0.3));"/>
          <circle cx="0" cy="-38" r="16" fill="white" stroke="#2c3e50" stroke-width="2"
                  style="pointer-events: none;"/>
          <text x="0" y="-38" text-anchor="middle" dominant-baseline="central" class="ab-pin-number">${num}</text>
        </g>
        <text x="${off.dx}" y="${off.dy}" text-anchor="middle" class="ab-pin-label">${String(s.name).split('\n').map((ln, li) => `<tspan x="${off.dx}" dy="${li === 0 ? '0' : '1.05em'}">${ln}</tspan>`).join('')}</text>
      `;
      g.addEventListener('click', () => openStationModal(s));
      group.appendChild(g);
    });
  }

  // ===== Station-Modal =====
  function openStationModal(s) {
    const modal = widgetEl.querySelector('.ab-modal-overlay');
    const header = widgetEl.querySelector('.ab-modal-header');
    const body = widgetEl.querySelector('.ab-modal-body');

    header.innerHTML = `
      <button class="ab-modal-close-btn" aria-label="Schließen">×</button>
      <div class="ab-modal-title">${String(s.name).replace(/\n/g, ' ')}</div>
      <div class="ab-modal-subtitle">${s.subtitle}</div>
      <div class="ab-modal-date">${s.date}</div>
    `;
    let photosHtml = '';
    if (s.photos && s.photos.length) {
      photosHtml = '<div class="ab-photo-grid">';
      s.photos.forEach((p, i) => {
        photosHtml += `<div class="ab-photo" data-idx="${i}">
          <img src="${config.photosPath}${p.thumb}" alt="" loading="lazy">
        </div>`;
        // Zitate nach diesem Foto einfügen (1-basiert)
        const afterNum = i + 1;
        if (s.quotes && s.quotes[afterNum]) {
          photosHtml += `<div class="ab-quote-row">`;
          s.quotes[afterNum].forEach(item => {
            const text = typeof item === 'string' ? item : item.text;
            const frage = (item && typeof item === 'object' && item.frage) ? item.frage : null;
            photosHtml += `<blockquote class="ab-quote">`;
            if (frage) photosHtml += `<span class="ab-quote-frage">${frage}</span>`;
            photosHtml += `„${text}"<cite class="ab-quote-cite">– Schüler:in</cite></blockquote>`;
          });
          photosHtml += `</div>`;
        }
      });
      photosHtml += '</div>';
    }
    body.innerHTML = `<div class="ab-modal-desc">${s.desc}</div>${photosHtml}`;

    // Foto-Klicks → Lightbox
    body.querySelectorAll('.ab-photo').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        openLightbox(s.photos, idx);
      });
    });

    // Close-Buttons im Modal-Header
    header.querySelector('.ab-modal-close-btn').addEventListener('click', closeStationModal);

    modal.classList.add('ab-show');
  }

  function closeStationModal() {
    widgetEl.querySelector('.ab-modal-overlay').classList.remove('ab-show');
  }

  let lbPhotos = [];
  let lbIndex = 0;

  function openLightbox(photos, idx) {
    lbPhotos = photos;
    lbIndex = idx;
    renderLightbox();
    widgetEl.querySelector('.ab-lightbox').classList.add('ab-show');
  }

  function renderLightbox() {
    const lb = widgetEl.querySelector('.ab-lightbox');
    lb.querySelector('img').src = config.photosPath + (lbPhotos[lbIndex].full || lbPhotos[lbIndex].thumb);
    const counter = lb.querySelector('.ab-lb-counter');
    if (lbPhotos.length > 1) {
      counter.textContent = (lbIndex + 1) + ' / ' + lbPhotos.length;
      counter.style.display = '';
      lb.querySelector('.ab-lb-prev').style.display = '';
      lb.querySelector('.ab-lb-next').style.display = '';
    } else {
      counter.style.display = 'none';
      lb.querySelector('.ab-lb-prev').style.display = 'none';
      lb.querySelector('.ab-lb-next').style.display = 'none';
    }
  }

  function lbNext() { lbIndex = (lbIndex + 1) % lbPhotos.length; renderLightbox(); }
  function lbPrev() { lbIndex = (lbIndex - 1 + lbPhotos.length) % lbPhotos.length; renderLightbox(); }

  // ===== Globale Event-Handler =====
  function setupEventHandlers() {
    // Close-Button oben rechts
    widgetEl.querySelector('.ab-close-btn').addEventListener('click', closeWidget);

    // Modal: Klick außerhalb schließt
    widgetEl.querySelector('.ab-modal-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('ab-modal-overlay')) closeStationModal();
    });

    // Lightbox: Klick auf Hintergrund schließt, Buttons navigieren
    const lb = widgetEl.querySelector('.ab-lightbox');
    lb.addEventListener('click', function(e) {
      if (e.target.closest('.ab-lb-prev') || e.target.closest('.ab-lb-next')) return;
      if (!lbSwipeHappened) lb.classList.remove('ab-show');
      lbSwipeHappened = false;
    });
    lb.querySelector('.ab-lb-prev').addEventListener('click', (e) => { e.stopPropagation(); lbPrev(); });
    lb.querySelector('.ab-lb-next').addEventListener('click', (e) => { e.stopPropagation(); lbNext(); });

    // Touch-Swipe in der Lightbox
    let lbTouchStartX = 0;
    let lbSwipeHappened = false;
    lb.addEventListener('touchstart', (e) => {
      lbTouchStartX = e.touches[0].clientX;
      lbSwipeHappened = false;
    }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - lbTouchStartX;
      if (Math.abs(dx) > 50 && lbPhotos.length > 1) {
        lbSwipeHappened = true;
        if (dx < 0) lbNext(); else lbPrev();
      }
    }, { passive: true });

    // ESC / Pfeiltasten
    document.addEventListener('keydown', e => {
      if (!widgetEl.classList.contains('ab-open')) return;
      const lb = widgetEl.querySelector('.ab-lightbox');
      const modal = widgetEl.querySelector('.ab-modal-overlay');
      if (lb.classList.contains('ab-show')) {
        if (e.key === 'ArrowRight') { lbNext(); return; }
        if (e.key === 'ArrowLeft')  { lbPrev(); return; }
        if (e.key === 'Escape') { lb.classList.remove('ab-show'); return; }
        return;
      }
      if (e.key !== 'Escape') return;
      if (modal.classList.contains('ab-show')) { closeStationModal(); return; }
      closeWidget();
    });
  }

  // ===== ZOOM & PAN (viewBox-basiert) =====
  function setupZoom() {
    const container = widgetEl.querySelector('.ab-map-svg-container');
    const svg = container.querySelector('svg');
    const origVB = svg.getAttribute('viewBox').split(' ').map(Number);
    const [oX, oY, oW, oH] = origVB;

    let scale = 1;
    let vbX = oX, vbY = oY, vbW = oW, vbH = oH;
    const MIN_SCALE = 1, MAX_SCALE = 5;

    function applyCounterScale() {
      const invScale = 1 / scale;
      widgetEl.querySelectorAll('.ab-pin-group').forEach(g => {
        const t = g.getAttribute('transform');
        const m = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
        if (m) {
          const x = parseFloat(m[1]);
          const y = parseFloat(m[2]);
          g.setAttribute('transform', `translate(${x}, ${y}) scale(${invScale})`);
        }
      });
    }

    function apply() {
      svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
      applyCounterScale();
    }

    function zoomAt(newScale, screenX, screenY) {
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      if (newScale === scale) return;
      const r = container.getBoundingClientRect();
      const svgX = vbX + (screenX / r.width) * vbW;
      const svgY = vbY + (screenY / r.height) * vbH;
      const newW = oW / newScale;
      const newH = oH / newScale;
      vbX = svgX - (screenX / r.width) * newW;
      vbY = svgY - (screenY / r.height) * newH;
      vbW = newW;
      vbH = newH;
      clampViewBox();
      scale = newScale;
      apply();
    }

    function clampViewBox() {
      if (vbX < oX) vbX = oX;
      if (vbY < oY) vbY = oY;
      if (vbX + vbW > oX + oW) vbX = oX + oW - vbW;
      if (vbY + vbH > oY + oH) vbY = oY + oH - vbH;
    }

    function reset() {
      scale = 1;
      vbX = oX; vbY = oY; vbW = oW; vbH = oH;
      apply();
    }

    // Buttons
    container.querySelector('.ab-zoom-in').addEventListener('click', () => {
      const r = container.getBoundingClientRect();
      zoomAt(scale * 1.4, r.width / 2, r.height / 2);
    });
    container.querySelector('.ab-zoom-out').addEventListener('click', () => {
      const r = container.getBoundingClientRect();
      zoomAt(scale / 1.4, r.width / 2, r.height / 2);
    });
    container.querySelector('.ab-zoom-reset').addEventListener('click', reset);

    // Mausrad
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = container.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(scale * factor, cx, cy);
    }, { passive: false });

    // Pan mit Maus
    let dragging = false, lastX = 0, lastY = 0, dragStarted = false;
    container.addEventListener('mousedown', (e) => {
      if (scale <= 1) return;
      if (e.target.closest('.ab-pin-group') || e.target.closest('.ab-zoom-controls')) return;
      dragging = true;
      dragStarted = false;
      lastX = e.clientX;
      lastY = e.clientY;
      container.classList.add('ab-panning');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragStarted = true;
      const r = container.getBoundingClientRect();
      vbX -= dx * (vbW / r.width);
      vbY -= dy * (vbH / r.height);
      clampViewBox();
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      container.classList.remove('ab-panning');
    });

    // Pin-Klick blockieren, wenn gerade gepant wurde
    container.addEventListener('click', (e) => {
      if (dragStarted) {
        e.stopPropagation();
        e.preventDefault();
        dragStarted = false;
      }
    }, true);

    // Touch: Pinch + Pan
    let pinchStartDist = 0, pinchStartScale = 1;
    let pinchStartVB = null;
    let touchStartX = 0, touchStartY = 0;
    let touchStartVBX = 0, touchStartVBY = 0;

    function tdist(t1, t2) {
      return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }

    container.addEventListener('touchstart', (e) => {
      if (e.target.closest('.ab-zoom-controls')) return;
      const ts = Array.from(e.touches);
      if (ts.length === 2) {
        e.preventDefault();
        pinchStartDist = tdist(ts[0], ts[1]);
        pinchStartScale = scale;
        pinchStartVB = { x: vbX, y: vbY, w: vbW, h: vbH };
      } else if (ts.length === 1 && scale > 1) {
        touchStartX = ts[0].clientX;
        touchStartY = ts[0].clientY;
        touchStartVBX = vbX;
        touchStartVBY = vbY;
        dragStarted = false;
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (e.target.closest('.ab-zoom-controls')) return;
      const ts = Array.from(e.touches);
      if (ts.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        const newDist = tdist(ts[0], ts[1]);
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale * (newDist / pinchStartDist)));
        const r = container.getBoundingClientRect();
        const cx = (ts[0].clientX + ts[1].clientX) / 2 - r.left;
        const cy = (ts[0].clientY + ts[1].clientY) / 2 - r.top;
        const svgX = pinchStartVB.x + (cx / r.width) * pinchStartVB.w;
        const svgY = pinchStartVB.y + (cy / r.height) * pinchStartVB.h;
        const newW = oW / newScale;
        const newH = oH / newScale;
        vbX = svgX - (cx / r.width) * newW;
        vbY = svgY - (cy / r.height) * newH;
        vbW = newW;
        vbH = newH;
        clampViewBox();
        scale = newScale;
        apply();
      } else if (ts.length === 1 && scale > 1) {
        e.preventDefault();
        const dx = ts[0].clientX - touchStartX;
        const dy = ts[0].clientY - touchStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragStarted = true;
        const r = container.getBoundingClientRect();
        vbX = touchStartVBX - dx * (vbW / r.width);
        vbY = touchStartVBY - dy * (vbH / r.height);
        clampViewBox();
        apply();
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinchStartDist = 0;
      if (e.touches.length === 0 && dragStarted) {
        const blocker = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        container.addEventListener('click', blocker, { capture: true, once: true });
        setTimeout(() => container.removeEventListener('click', blocker, { capture: true }), 100);
        dragStarted = false;
      }
    });

    // Doppelklick
    container.addEventListener('dblclick', (e) => {
      if (e.target.closest('.ab-zoom-controls')) return;
      const r = container.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (scale < 2) zoomAt(2.5, cx, cy);
      else reset();
    });
  }

})();
