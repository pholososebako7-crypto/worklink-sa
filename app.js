/**
 * WorkLink SA — app.js (Firebase + local fallback)
 */
(function () {
  'use strict';

  var cfg = window.WL_FIREBASE_CONFIG || window.WORKLINK_FIREBASE_CONFIG || null;
  var enabled = !!(cfg && cfg.apiKey && cfg.apiKey.indexOf('REPLACE') === -1 && cfg.apiKey.indexOf('YOUR_') === -1);
  var fb = { mode: 'local', auth: null, db: null };
  var user = null;
  var cache = {};
  var filter = 'ALL';
  var search = '';

  var SEED = [
    { id: 'WL-0042', title: 'Cape SaaS Analytics Desk', type: 'BUSINESS', desc: 'Operating analytics service. Identity reviewed. Revenue partial.', price: 185000, status: 'INSPECTION_LIVE', score: 74, risk: 'MODERATE' },
    { id: 'WL-0047', title: 'Joburg Marketplace Template', type: 'PRODUCT', desc: 'Multi-vendor template. Ownership verified.', price: 42000, status: 'INSPECTION_LIVE', score: 81, risk: 'LOW' },
    { id: 'WL-0051', title: 'Durban Logistics Tracker', type: 'BUSINESS', desc: 'Live tracking product. Projections not verified.', price: 310000, status: 'UNDER_REVIEW', score: 62, risk: 'HIGH' }
  ];

  function lsGet(k, d) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; }
  }
  function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function assetsLocal() {
    var a = lsGet('WL_ASSETS', null);
    if (!a || !a.length) { a = SEED.slice(); lsSet('WL_ASSETS', a); }
    return a;
  }

  window.money = function (n) {
    if (n == null || n === '') return '—';
    return 'R ' + Number(n).toLocaleString('en-ZA');
  };

  function toast(msg, type) {
    var root = document.getElementById('wl-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'wl-toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    var el = document.createElement('div');
    el.className = 'wl-toast wl-toast-' + (type || 'info');
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 3000);
  }
  window.toast = toast;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function initFirebase() {
    if (!enabled) {
      fb.mode = 'local';
      return Promise.resolve(false);
    }
    return loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js'); })
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'); })
      .then(function () {
        firebase.initializeApp(cfg);
        fb.auth = firebase.auth();
        fb.db = firebase.firestore();
        fb.mode = 'firebase';
        fb.auth.onAuthStateChanged(function (u) { user = u; });
        return true;
      })
      .catch(function (e) {
        console.warn(e);
        fb.mode = 'local';
        return false;
      });
  }
function filterList(list) {
    return list.filter(function (a) {
      var t = filter === 'ALL' || a.type === filter;
      var q = search.trim().toLowerCase();
      var s = !q || String(a.id).toLowerCase().indexOf(q) >= 0 ||
        (a.title || '').toLowerCase().indexOf(q) >= 0 ||
        (a.desc || '').toLowerCase().indexOf(q) >= 0;
      return t && s;
    });
  }

  function fetchListings() {
    if (fb.mode === 'firebase' && fb.db) {
      return fb.db.collection('listings').get().then(function (snap) {
        var list = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          d.id = doc.id;
          cache[d.id] = d;
          list.push(d);
        });
        if (!list.length) return filterList(assetsLocal());
        return filterList(list);
      }).catch(function () { return filterList(assetsLocal()); });
    }
    return Promise.resolve(filterList(assetsLocal()));
  }

  window.listing = function (id) {
    return cache[id] || assetsLocal().find(function (a) { return a.id === id; }) || null;
  };

  window.getListingAsync = function (id) {
    if (fb.mode === 'firebase' && fb.db) {
      return fb.db.collection('listings').doc(id).get().then(function (snap) {
        if (!snap.exists) return window.listing(id);
        var d = snap.data();
        d.id = snap.id;
        cache[id] = d;
        return d;
      }).catch(function () { return window.listing(id); });
    }
    return Promise.resolve(window.listing(id));
  };

  function renderGrid() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    fetchListings().then(function (list) {
      var countEl = document.getElementById('assetCount');
      if (countEl) {
        var n = String(list.length).padStart(2, '0');
        countEl.textContent = n + ' INSPECTION RECORD' + (list.length === 1 ? '' : 'S');
      }
      if (!list.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>NO MATCHING RECORDS</strong></div>';
        return;
      }
      grid.innerHTML = list.map(function (a) {
        return '<article class="asset" tabindex="0" data-id="' + a.id + '">' +
          '<div class="assetmeta"><span>' + a.id + '</span><span>' + (a.type || '') + '</span></div>' +
          '<h3>' + (a.title || '') + '</h3><p>' + (a.desc || '') + '</p>' +
          '<div class="data"><span>TRUST ' + (a.score != null ? a.score + '/100' : '—') + '</span><span>' + money(a.price) + '</span></div>' +
          '<button type="button" class="inspect" data-id="' + a.id + '">INSPECT RECORD →</button></article>';
      }).join('');
      grid.querySelectorAll('.asset, .inspect').forEach(function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-id') || (el.closest('.asset') && el.closest('.asset').getAttribute('data-id'));
          if (id) location.href = 'asset.html?id=' + encodeURIComponent(id);
        });
      });
    });
  }

  window.setFilter = function (type) {
    filter = type || 'ALL';
    document.querySelectorAll('.filters button').forEach(function (btn) {
      var on = btn.textContent.trim().toUpperCase() === filter || (filter === 'ALL' && btn.textContent.trim().toUpperCase() === 'ALL');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderGrid();
  };
