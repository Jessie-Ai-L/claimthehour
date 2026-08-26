const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const suffix = i < 12 ? "AM" : "PM";
  return { hour: i, label: `${h} ${suffix}` };
});

const HOLD_MINUTES = 15;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function normalizeUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function cleanupExpiredPending(env, dateKey) {
  await env.DB.prepare(`
    DELETE FROM claims
    WHERE claim_date = ?
      AND payment_status = 'pending'
      AND datetime(created_at, '+${HOLD_MINUTES} minutes') <= datetime('now')
  `).bind(dateKey).run();
}

async function getBoard(env, dateKey) {
  await cleanupExpiredPending(env, dateKey);
  const result = await env.DB.prepare(`
    SELECT
      id, claim_date, claim_hour, product_name, product_url, description,
      payment_status, created_at, paid_at
    FROM claims
    WHERE claim_date = ?
      AND payment_status IN ('paid', 'pending')
    ORDER BY claim_hour ASC
  `).bind(dateKey).all();

  return result.results || [];
}

async function reserveClaim(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  const dateKey = String(body.claim_date || "");
  const hour = Number(body.claim_hour);
  const productName = String(body.product_name || "").trim();
  const description = String(body.description || "").trim();
  const productUrl = normalizeUrl(body.product_url);

  if (!isValidDateKey(dateKey) || dateKey !== utcDateKey()) {
    return json({ ok: false, error: "Claims are currently available for today's UTC board only." }, 400);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return json({ ok: false, error: "Invalid hour." }, 400);
  }
  if (productName.length < 2 || productName.length > 60) {
    return json({ ok: false, error: "Product name must be 2–60 characters." }, 400);
  }
  if (!productUrl) {
    return json({ ok: false, error: "Enter a valid http:// or https:// URL." }, 400);
  }
  if (description.length > 120) {
    return json({ ok: false, error: "Description must be 120 characters or fewer." }, 400);
  }

  await cleanupExpiredPending(env, dateKey);

  try {
    const result = await env.DB.prepare(`
      INSERT INTO claims (
        claim_date, claim_hour, product_name, product_url, description, payment_status
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(dateKey, hour, productName, productUrl, description).run();

    return json({
      ok: true,
      reservation_id: result.meta?.last_row_id ?? null,
      hold_minutes: HOLD_MINUTES,
      message: `Reserved for ${HOLD_MINUTES} minutes. Stripe payment is the next step.`
    }, 201);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      return json({ ok: false, error: "That hour was just taken. Pick another spot." }, 409);
    }
    return json({ ok: false, error: "Could not reserve this hour." }, 500);
  }
}

function html() {
  const slots = HOURS.map(item => `
    <article class="slot available" id="slot-${item.hour}" data-hour="${item.hour}">
      <div class="slot-top">
        <strong>${esc(item.label)}</strong>
        <span class="dot"></span>
      </div>
      <span class="availability">AVAILABLE</span>
      <p>Your product could own this hour.</p>
      <button class="claim-btn" data-hour="${item.hour}" data-label="${esc(item.label)}">Claim for $1</button>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ClaimTheHour — Own an hour of the internet</title>
  <meta name="description" content="24 hours. 24 spots. One day. Claim an hour of the internet for $1 and put your product in the spotlight.">
  <meta property="og:title" content="ClaimTheHour">
  <meta property="og:description" content="24 hours. 24 spots. One day. Claim yours.">
  <meta name="theme-color" content="#fbfaf7">
  <style>
    :root{
      --bg:#fbfaf7;--panel:rgba(255,255,255,.8);--ink:#111319;--muted:#6d7078;
      --line:#e8e3da;--green:#14a44d;--amber:#f4a000;--shadow:0 10px 35px rgba(28,21,12,.06)
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{
      margin:0;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:
        radial-gradient(circle at 50% 8%,rgba(255,191,92,.13),transparent 30%),
        radial-gradient(circle at 10% 5%,rgba(164,134,255,.08),transparent 25%),
        var(--bg);
    }
    a{color:inherit} button,input,textarea{font:inherit}
    .wrap{width:min(1120px,calc(100% - 36px));margin:auto}
    header{display:flex;justify-content:space-between;align-items:center;padding:22px 0}
    .brand{font-size:22px;font-weight:900;letter-spacing:-.04em;text-decoration:none}
    nav{display:flex;gap:26px;align-items:center;font-size:14px}
    nav a{text-decoration:none;color:#30323a}
    .nav-cta{background:#111319;color:#fff;padding:11px 16px;border-radius:12px;font-weight:800}
    .hero{text-align:center;padding:74px 0 34px}
    .pill{display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid #f0dcc0;border-radius:999px;background:rgba(255,249,239,.78);font-size:12px;font-weight:900;letter-spacing:.08em}
    .spark{color:var(--amber)}
    h1{font-size:clamp(54px,8vw,92px);line-height:.92;letter-spacing:-.07em;margin:22px auto 18px;max-width:920px}
    .dot-end{color:#f5a30a}
    .hero-copy{max-width:720px;margin:auto;color:#5c6069;font-size:18px;line-height:1.55}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:34px auto 16px;max-width:850px}
    .stat,.notice,.now-card{border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(12px);border-radius:18px;box-shadow:var(--shadow)}
    .stat{padding:20px;display:flex;gap:14px;align-items:center;text-align:left}
    .stat.dark{background:#12151b;color:white;border-color:#12151b}
    .ico{width:38px;height:38px;border-radius:50%;border:1px solid currentColor;display:grid;place-items:center;font-weight:800;opacity:.9}
    .stat small,.now-card small{display:block;color:#7a7d85;font-size:11px;font-weight:900;letter-spacing:.1em;margin-bottom:5px}
    .dark small{color:#d5d7db}.stat strong{font-size:18px}.stat .accent{color:#ffc21a;font-size:22px}.stat .green{color:var(--green)}
    .live-row{display:grid;grid-template-columns:1fr 1.35fr;gap:14px;max-width:850px;margin:0 auto 68px}
    .now-card,.notice{padding:18px 20px;text-align:left}
    .now-card{display:flex;align-items:center;gap:14px}.now-badge{background:#ffc928;border-radius:8px;padding:6px 9px;font-weight:900;font-size:11px}
    .now-time{font-size:22px;font-weight:900;letter-spacing:-.03em}.notice{display:flex;align-items:center;gap:14px}.bolt{font-size:24px;color:var(--amber)}
    .notice strong{display:block;font-size:14px}.notice span{color:var(--muted);font-size:13px}
    .board-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:18px}.board-head h2,.faq h2{font-size:28px;letter-spacing:-.04em;margin:0 0 4px}
    .board-head p{margin:0;color:var(--muted)}.legend{display:flex;gap:18px;font-size:13px;color:#555}.legend span{display:flex;align-items:center;gap:8px}
    .legend i{width:9px;height:9px;border-radius:50%;display:block;background:var(--green)}.legend i.claimed{background:#111319}.legend i.held{background:var(--amber)}
    .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
    .slot{min-height:162px;border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:17px;box-shadow:0 7px 24px rgba(30,24,18,.035);display:flex;flex-direction:column;transition:.18s}
    .slot-top{display:flex;justify-content:space-between;align-items:center}.slot-top strong{font-size:18px}.dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
    .availability{color:var(--green);font-weight:900;font-size:10px;letter-spacing:.09em;margin-top:13px}.slot p{font-size:12px;line-height:1.45;color:var(--muted);margin:7px 0 14px;flex:1}
    .claim-btn,.visit-btn{background:transparent;border:1.5px solid var(--green);color:#168a45;font-weight:900;font-size:12px;border-radius:999px;padding:8px 9px;cursor:pointer;text-align:center;text-decoration:none}
    .claim-btn:hover{background:#ecfff3;transform:translateY(-1px)}
    .slot.claimed{background:#14171c;color:#fff;border-color:#14171c}.slot.claimed .dot{background:#fff}.slot.claimed .availability{color:#d8d8d8}
    .slot.claimed p{color:#bbb}.slot.claimed .visit-btn{background:#fff;border-color:#fff;color:#111319}
    .slot.held{background:#fff8e8;border-color:#efc66c}.slot.held .dot{background:var(--amber)}.slot.held .availability{color:#b87800}
    .slot.now{outline:2px solid #f2b01c;outline-offset:2px}
    .section-label{text-align:center;font-size:13px;font-weight:900;letter-spacing:.16em;margin-bottom:18px}
    .how{padding:70px 0 32px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.step{border:1px solid var(--line);border-radius:20px;padding:24px;min-height:188px;background:rgba(255,255,255,.62)}
    .step:nth-child(1){background:linear-gradient(135deg,rgba(248,244,255,.92),rgba(255,255,255,.72))}.step:nth-child(2){background:linear-gradient(135deg,rgba(241,255,248,.92),rgba(255,255,255,.72))}.step:nth-child(3){background:linear-gradient(135deg,rgba(255,247,237,.92),rgba(255,255,255,.72))}
    .step-num{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:white;border:1px solid var(--line)}.step h3{margin:22px 0 8px;font-size:18px}.step p{margin:0;color:var(--muted);line-height:1.55;font-size:14px}
    .faq{padding:34px 0 70px}.faq-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}details{border-top:1px solid var(--line);padding:16px 0}details:last-child{border-bottom:1px solid var(--line)}summary{font-weight:800;cursor:pointer}details p{color:var(--muted);line-height:1.6;max-width:760px}
    footer{border-top:1px solid var(--line);padding:28px 0 44px}.footer-row{display:flex;justify-content:space-between;align-items:flex-end;gap:30px}.footer-brand strong{font-size:20px;display:block}.footer-brand span{font-size:13px;color:var(--muted)}.footer-links{display:flex;gap:24px;font-size:13px;color:#656973}.footer-links a{text-decoration:none}
    .modal{position:fixed;inset:0;background:rgba(8,10,14,.55);display:none;place-items:center;padding:20px;z-index:20}.modal.open{display:grid}
    .modal-card{width:min(500px,100%);background:white;border-radius:24px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.18)}.modal-card h3{font-size:30px;letter-spacing:-.04em;margin:12px 0 8px}.modal-card>p{color:var(--muted);line-height:1.55}
    .form{display:grid;gap:12px;margin-top:18px}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:900}.field input,.field textarea{width:100%;border:1px solid #dedbd4;border-radius:12px;padding:12px 13px;background:#fff}.field textarea{resize:vertical;min-height:82px}
    .form-note{font-size:12px;color:var(--muted)}.form-error{font-size:13px;color:#b42318;min-height:18px}.modal-actions{display:flex;gap:10px;margin-top:8px}.modal-actions button{flex:1;border-radius:999px;padding:12px;border:1px solid #d9d9d9;background:#fff;font-weight:800;cursor:pointer}.modal-actions .primary{background:#111319;color:white;border-color:#111319}.modal-actions .primary:disabled{opacity:.55;cursor:wait}
    .success-box{display:none;background:#f1fff6;border:1px solid #b9e8ca;border-radius:14px;padding:14px;color:#186c3d;font-size:13px;line-height:1.5;margin-top:14px}
    @media(max-width:900px){.grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:700px){nav a:not(.nav-cta){display:none}.hero{padding-top:48px}h1{font-size:56px}.stats{grid-template-columns:1fr}.live-row{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:1fr}.board-head,.faq-top,.footer-row{align-items:flex-start;flex-direction:column}.legend{margin-top:10px}.footer-links{flex-wrap:wrap}}
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/">ClaimTheHour</a>
    <nav><a href="#how">How it works</a><a href="#faq">FAQ</a><a href="#board">Today's board</a><a class="nav-cta" href="#board">Claim an hour</a></nav>
  </header>

  <main>
    <section class="hero">
      <div class="pill"><span class="spark">✦</span> 24 HOURS. 24 SPOTS. ONE DAY.</div>
      <h1>Claim an hour of<br>the internet<span class="dot-end">.</span></h1>
      <p class="hero-copy">Pick an open hour, claim it for $1, and put your product in the spotlight.<br>Once an hour is claimed, it's gone for the day.</p>

      <div class="stats">
        <div class="stat"><div class="ico">◷</div><div><small>TODAY'S DATE · UTC</small><strong id="todayDate">—</strong></div></div>
        <div class="stat dark"><div class="ico">◷</div><div><small>TIME LEFT TODAY · UTC</small><strong class="accent" id="timeLeft">—</strong></div></div>
        <div class="stat"><div class="ico">◎</div><div><small>SPOTS LEFT</small><strong class="green" id="spotsLeft">24 / 24</strong></div></div>
      </div>

      <div class="live-row">
        <div class="now-card"><span class="now-badge">NOW</span><div><small>CURRENT TIME · UTC</small><div class="now-time" id="utcTime">—</div></div></div>
        <div class="notice"><div class="bolt">ϟ</div><div><strong>First come, first served</strong><span>Pending reservations are held for ${HOLD_MINUTES} minutes while checkout is completed.</span></div></div>
      </div>
    </section>

    <section id="board">
      <div class="board-head">
        <div><h2>TODAY'S BOARD</h2><p>All 24 hours. One pick a day. Board resets at 00:00 UTC.</p></div>
        <div class="legend"><span><i></i>Available</span><span><i class="held"></i>Held</span><span><i class="claimed"></i>Claimed</span></div>
      </div>
      <div class="grid">${slots}</div>
    </section>

    <section class="how" id="how">
      <div class="section-label">HOW IT WORKS</div>
      <div class="steps">
        <div class="step"><div class="step-num">01</div><h3>Pick an hour</h3><p>Choose any open spot on today's UTC board.</p></div>
        <div class="step"><div class="step-num">02</div><h3>Reserve it</h3><p>Add your product and hold the spot for ${HOLD_MINUTES} minutes while you complete checkout.</p></div>
        <div class="step"><div class="step-num">03</div><h3>It's yours</h3><p>After payment, your product owns that hour and visitors can click through to your site.</p></div>
      </div>
    </section>

    <section class="faq" id="faq">
      <div class="faq-top"><h2>FAQ</h2><span style="color:var(--muted);font-size:13px">Simple rules. No auction.</span></div>
      <details><summary>What am I buying?</summary><p>A one-hour promotional position on ClaimTheHour's UTC board for the selected date.</p></details>
      <details><summary>Can someone take my hour?</summary><p>No after payment is confirmed. Before payment, a new reservation is temporarily held for ${HOLD_MINUTES} minutes.</p></details>
      <details><summary>Why UTC?</summary><p>ClaimTheHour is global. UTC gives every visitor one unambiguous daily board and reset time.</p></details>
    </section>
  </main>
</div>

<footer><div class="wrap footer-row"><div class="footer-brand"><strong>ClaimTheHour</strong><span>24 hours. 24 spots. Claim yours.</span></div><div class="footer-links"><a href="#how">How it works</a><a href="#faq">FAQ</a><a href="#board">Today's board</a><span>© 2026 ClaimTheHour</span></div></div></footer>

<div class="modal" id="modal">
  <div class="modal-card">
    <div class="pill">CLAIM A SPOT</div>
    <h3>Claim <span id="selectedHour"></span></h3>
    <p>Tell us what you want to feature. This build saves a ${HOLD_MINUTES}-minute reservation to D1; Stripe checkout is the next step.</p>
    <form class="form" id="claimForm">
      <div class="field"><label for="productName">Product name</label><input id="productName" name="product_name" maxlength="60" required placeholder="Your product"></div>
      <div class="field"><label for="productUrl">Product URL</label><input id="productUrl" name="product_url" type="url" required placeholder="https://example.com"></div>
      <div class="field"><label for="description">Short description</label><textarea id="description" name="description" maxlength="120" placeholder="What does your product do?"></textarea></div>
      <div class="form-note">No payment is taken in this build. The next release will send this reservation to Stripe Checkout.</div>
      <div class="form-error" id="formError"></div>
      <div class="success-box" id="successBox"></div>
      <div class="modal-actions"><button type="button" id="closeModal">Cancel</button><button type="submit" class="primary" id="reserveBtn">Reserve hour</button></div>
    </form>
  </div>
</div>

<script>
  const HOLD_MINUTES = ${HOLD_MINUTES};
  let selectedHour = null;
  const modal = document.getElementById('modal');
  const form = document.getElementById('claimForm');
  const formError = document.getElementById('formError');
  const successBox = document.getElementById('successBox');
  const reserveBtn = document.getElementById('reserveBtn');

  function dateKeyUTC(){
    return new Date().toISOString().slice(0,10);
  }

  function labelForHour(hour){
    const h = hour % 12 || 12;
    return h + ' ' + (hour < 12 ? 'AM' : 'PM');
  }

  function updateClock(){
    const now = new Date();
    document.getElementById('todayDate').textContent =
      new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(now);

    document.getElementById('utcTime').textContent =
      new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(now);

    const midnight = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1,0,0,0));
    let ms = midnight - now;
    const h = Math.floor(ms/3600000); ms%=3600000;
    const m = Math.floor(ms/60000); ms%=60000;
    const s = Math.floor(ms/1000);
    document.getElementById('timeLeft').textContent = h + 'h ' + m + 'm ' + s + 's';

    document.querySelectorAll('.slot').forEach(el=>el.classList.remove('now'));
    const current = document.getElementById('slot-' + now.getUTCHours());
    if(current) current.classList.add('now');
  }

  function resetSlot(hour){
    const el = document.getElementById('slot-' + hour);
    if(!el) return;
    el.className = 'slot available';
    el.innerHTML =
      '<div class="slot-top"><strong>' + labelForHour(hour) + '</strong><span class="dot"></span></div>' +
      '<span class="availability">AVAILABLE</span>' +
      '<p>Your product could own this hour.</p>' +
      '<button class="claim-btn" data-hour="' + hour + '" data-label="' + labelForHour(hour) + '">Claim for $1</button>';
  }

  function renderClaim(claim){
    const el = document.getElementById('slot-' + claim.claim_hour);
    if(!el) return;
    const isPaid = claim.payment_status === 'paid';
    el.className = 'slot ' + (isPaid ? 'claimed' : 'held');
    const safeName = String(claim.product_name || '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const safeDesc = String(claim.description || '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const safeUrl = String(claim.product_url || '#').replace(/"/g,'&quot;');
    el.innerHTML =
      '<div class="slot-top"><strong>' + labelForHour(claim.claim_hour) + '</strong><span class="dot"></span></div>' +
      '<span class="availability">' + (isPaid ? 'CLAIMED' : 'HELD') + '</span>' +
      '<p><strong>' + safeName + '</strong><br>' + (safeDesc || (isPaid ? 'Owns this hour.' : 'Checkout pending.')) + '</p>' +
      (isPaid ? '<a class="visit-btn" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">Visit ↗</a>' : '<span class="form-note">Reserved for checkout</span>');
  }

  async function loadBoard(){
    try{
      const response = await fetch('/api/board?date=' + encodeURIComponent(dateKeyUTC()), {cache:'no-store'});
      const data = await response.json();
      if(!response.ok) throw new Error(data.error || 'Could not load board.');
      for(let i=0;i<24;i++) resetSlot(i);
      data.claims.forEach(renderClaim);
      document.getElementById('spotsLeft').textContent = (24 - data.claims.length) + ' / 24';
      bindClaimButtons();
      updateClock();
    }catch(error){
      console.error(error);
    }
  }

  function bindClaimButtons(){
    document.querySelectorAll('.claim-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        selectedHour = Number(btn.dataset.hour);
        document.getElementById('selectedHour').textContent = btn.dataset.label;
        form.reset(); formError.textContent=''; successBox.style.display='none'; successBox.textContent='';
        reserveBtn.disabled=false; reserveBtn.textContent='Reserve hour';
        modal.classList.add('open');
      });
    });
  }

  document.getElementById('closeModal').onclick=()=>modal.classList.remove('open');
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});

  form.addEventListener('submit', async e=>{
    e.preventDefault();
    if(selectedHour === null) return;
    formError.textContent=''; successBox.style.display='none';
    reserveBtn.disabled=true; reserveBtn.textContent='Reserving…';

    const payload = {
      claim_date: dateKeyUTC(),
      claim_hour: selectedHour,
      product_name: document.getElementById('productName').value,
      product_url: document.getElementById('productUrl').value,
      description: document.getElementById('description').value
    };

    try{
      const response = await fetch('/api/reserve',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      const data = await response.json();
      if(!response.ok) throw new Error(data.error || 'Reservation failed.');
      successBox.textContent = data.message;
      successBox.style.display='block';
      reserveBtn.textContent='Reserved';
      await loadBoard();
    }catch(error){
      formError.textContent=error.message;
      reserveBtn.disabled=false; reserveBtn.textContent='Reserve hour';
    }
  });

  updateClock();
  setInterval(updateClock,1000);
  loadBoard();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      try {
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: row?.ok === 1, service: "claimthehour", version: "1.2", d1: true });
      } catch {
        return json({ ok: false, service: "claimthehour", version: "1.2", d1: false }, 500);
      }
    }

    if (url.pathname === "/api/board" && request.method === "GET") {
      const dateKey = url.searchParams.get("date") || utcDateKey();
      if (!isValidDateKey(dateKey)) return json({ ok: false, error: "Invalid date." }, 400);
      try {
        const claims = await getBoard(env, dateKey);
        return json({ ok: true, date: dateKey, claims });
      } catch {
        return json({ ok: false, error: "Database query failed." }, 500);
      }
    }

    if (url.pathname === "/api/reserve" && request.method === "POST") {
      return reserveClaim(request, env);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    return new Response(html(), {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-cache"
      }
    });
  }
};
