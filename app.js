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
function bindSubmit() {
    var form = document.getElementById('submissionForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var title = String(fd.get('title') || '').trim();
      var type = String(fd.get('type') || 'BUSINESS');
      var url = String(fd.get('url') || '').trim();
      var price = Number(fd.get('price') || 0);
      var desc = String(fd.get('description') || '').trim();
      if (!title || !desc || !url) { toast('Fill required fields', 'error'); return; }

      var rec = {
        title: title, type: type, desc: desc, price: price || 0,
        status: 'UNDER_REVIEW', score: 0, risk: 'UNASSESSED', url: url,
        createdAt: new Date().toISOString()
      };

      function done(id) {
        var result = document.getElementById('submissionResult');
        if (result) {
          result.innerHTML = '<strong>INSPECTION RECORD CREATED</strong><span>' + id + '</span><p>Not public until review is complete.</p>';
        }
        form.reset();
        toast('Record created', 'success');
        renderGrid();
      }

      if (fb.mode === 'firebase' && fb.db) {
        if (!user) { toast('Sign in required', 'error'); return; }
        rec.sellerId = user.uid;
        fb.db.collection('listings').add(rec).then(function (ref) { done(ref.id); })
          .catch(function () { toast('Submit failed — check login and rules', 'error'); });
        return;
      }
      var list = assetsLocal();
      rec.id = 'WL-' + String(50 + list.length + 1).padStart(4, '0');
      list.unshift(rec);
      lsSet('WL_ASSETS', list);
      done(rec.id);
    });
  }

  window.handleOffer = function (form) {
    var fd = new FormData(form);
    var assetId = fd.get('asset');
    var buyer = String(fd.get('buyer') || '').trim();
    var amount = Number(fd.get('amount') || 0);
    if (!buyer || amount < 1) { toast('Buyer and amount required', 'error'); return; }

    function go(txId) {
      toast('Offer recorded', 'success');
      setTimeout(function () { location.href = 'transaction.html?id=' + encodeURIComponent(txId); }, 400);
    }

    if (fb.mode === 'firebase' && fb.db) {
      if (!user) { toast('Sign in required', 'error'); return; }
      window.getListingAsync(assetId).then(function (listing) {
        var offer = {
          listingId: assetId, buyerId: user.uid, buyerName: buyer,
          sellerId: listing && listing.sellerId || null,
          amount: amount, status: 'RECORDED', createdAt: new Date().toISOString()
        };
        return fb.db.collection('offers').add(offer).then(function (oRef) {
          return fb.db.collection('transactions').add({
            offerId: oRef.id, listingId: assetId, buyerId: user.uid,
            sellerId: offer.sellerId, buyerName: buyer, amount: amount,
            stage: 'ROOM_OPEN', paymentStatus: 'PENDING_ADMIN',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }).then(function (tRef) { go(tRef.id); });
      }).catch(function () { toast('Offer failed', 'error'); });
      return;
    }

    var offers = lsGet('WL_OFFERS', []);
    var oid = 'OF-' + Date.now().toString(36).toUpperCase();
    offers.push({ id: oid, listingId: assetId, buyer: buyer, amount: amount, status: 'RECORDED' });
    lsSet('WL_OFFERS', offers);
    var txs = lsGet('WL_TX', []);
    var tid = 'TX-' + Date.now().toString(36).toUpperCase();
    txs.push({ id: tid, listingId: assetId, buyer: buyer, amount: amount, stage: 'ROOM_OPEN', paymentStatus: 'PENDING_ADMIN' });
    lsSet('WL_TX', txs);
    go(tid);
  };

  window.transaction = function () {
    var root = document.getElementById('transaction');
    if (!root) return;
    var txId = new URLSearchParams(location.search).get('id');

    function draw(tx, asset) {
      var stages = ['OFFER_RECORDED', 'OFFER_ACCEPTED', 'ROOM_OPEN', 'PAYMENT_MARKED', 'TRANSFER', 'COMPLETE'];
      var labels = ['Offer recorded', 'Offer accepted', 'Room opened', 'Payment marked (admin)', 'Transfer', 'Complete'];
      var idx = Math.max(0, stages.indexOf(tx.stage || 'ROOM_OPEN'));
      root.innerHTML =
        '<nav class="breadcrumb"><a href="index.html">Home</a><span>/</span><span class="current">' + (tx.id || txId || '') + '</span></nav>' +
        '<a class="back-link" href="index.html#market">← Back</a>' +
        '<div class="sectiontag">TRANSACTION ROOM</div><h1>' + (asset && asset.title || 'Transfer') + '</h1>' +
        '<div class="statusline"><span>STAGE <b>' + (tx.stage || 'ROOM_OPEN') + '</b></span>' +
        '<span>PAYMENT <b>' + (tx.paymentStatus || 'PENDING_ADMIN') + '</b></span>' +
        '<span>AMOUNT <b>' + money(tx.amount) + '</b></span></div>' +
        '<div class="timeline">' + labels.map(function (l, i) {
          var c = i < idx ? 'done' : (i === idx ? 'active' : 'pending');
          return '<div class="' + c + '"><b>' + (i + 1) + '</b> ' + l + '</div>';
        }).join('') + '</div>' +
        '<div class="notice"><b>Admin payment</b><p>Payment is marked by admin — not by the browser alone.</p></div>';
    }

    if (fb.mode === 'firebase' && fb.db && txId) {
      fb.db.collection('transactions').doc(txId).get().then(function (snap) {
        if (!snap.exists) { root.innerHTML = '<h1>No transaction</h1>'; return; }
        var tx = snap.data(); tx.id = snap.id;
        window.getListingAsync(tx.listingId).then(function (a) { draw(tx, a); });
      });
      return;
    }
    var txs = lsGet('WL_TX', []);
    var tx = txs.find(function (t) { return t.id === txId; }) || txs[txs.length - 1];
    if (!tx) { root.innerHTML = '<h1>No transaction</h1><p><a href="index.html#market">Registry</a></p>'; return; }
    draw(tx, window.listing(tx.listingId));
  };

  window.wlSignIn = function (email, password) {
    if (fb.mode !== 'firebase') { toast('Firebase not connected', 'info'); return Promise.resolve(); }
    return fb.auth.signInWithEmailAndPassword(email, password);
  };
  window.wlSignUp = function (email, password) {
    if (fb.mode !== 'firebase') { toast('Firebase not connected', 'info'); return Promise.resolve(); }
    return fb.auth.createUserWithEmailAndPassword(email, password);
  };
  window.wlSignOut = function () {
    if (fb.auth) return fb.auth.signOut();
    return Promise.resolve();
  };

  document.addEventListener('DOMContentLoaded', function () {
    initFirebase().then(function (ok) {
      var bar = document.querySelector('.systembar span');
      if (bar) bar.innerHTML = ok ? '<i></i>SYSTEM STATUS: FIREBASE' : '<i></i>SYSTEM STATUS: LOCAL DEMO';
      assetsLocal();
      renderGrid();
      bindSubmit();
      var searchEl = document.getElementById('search');
      if (searchEl) {
        var t;
        searchEl.addEventListener('input', function () {
          clearTimeout(t);
          t = setTimeout(function () { search = searchEl.value || ''; renderGrid(); }, 200);
        });
      }
      if (document.querySelector('.filters')) setFilter('ALL');
    });
  });
})();
