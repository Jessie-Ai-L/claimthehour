const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const suffix = i < 12 ? "AM" : "PM";
  return { hour: i, label: `${h} ${suffix}` };
});

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSlot(item) {
  return `
    <article class="slot available" data-hour="${item.hour}">
      <div class="slot-top">
        <strong>${esc(item.label)}</strong>
        <span class="dot"></span>
      </div>
      <span class="availability">AVAILABLE</span>
      <p>Your product could own this hour.</p>
      <button class="claim-btn" data-label="${esc(item.label)}">Claim for $1</button>
    </article>
  `;
}

function html() {
  const slots = HOURS.map(renderSlot).join("");
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
      --bg:#fbfaf7;--panel:rgba(255,255,255,.78);--ink:#111319;--muted:#6d7078;
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
    a{color:inherit}
    button{font:inherit}
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
    h1 span{display:inline-block}
    .dot-end{color:#f5a30a}
    .hero-copy{max-width:720px;margin:auto;color:#5c6069;font-size:18px;line-height:1.55}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:34px auto 16px;max-width:850px}
    .stat,.notice,.now-card{border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(12px);border-radius:18px;box-shadow:var(--shadow)}
    .stat{padding:20px;display:flex;gap:14px;align-items:center;text-align:left}
    .stat.dark{background:#12151b;color:white;border-color:#12151b}
    .ico{width:38px;height:38px;border-radius:50%;border:1px solid currentColor;display:grid;place-items:center;font-weight:800;opacity:.9}
    .stat small,.now-card small{display:block;color:#7a7d85;font-size:11px;font-weight:900;letter-spacing:.1em;margin-bottom:5px}
    .dark small{color:#d5d7db}
    .stat strong{font-size:18px}
    .stat .accent{color:#ffc21a;font-size:22px}
    .stat .green{color:var(--green)}
    .live-row{display:grid;grid-template-columns:1fr 1.35fr;gap:14px;max-width:850px;margin:0 auto 68px}
    .now-card,.notice{padding:18px 20px;text-align:left}
    .now-card{display:flex;align-items:center;gap:14px}
    .now-badge{background:#ffc928;border-radius:8px;padding:6px 9px;font-weight:900;font-size:11px}
    .now-time{font-size:22px;font-weight:900;letter-spacing:-.03em}
    .notice{display:flex;align-items:center;gap:14px}
    .bolt{font-size:24px;color:var(--amber)}
    .notice strong{display:block;font-size:14px}
    .notice span{color:var(--muted);font-size:13px}
    .board-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:18px}
    .board-head h2,.how h2,.faq h2{font-size:28px;letter-spacing:-.04em;margin:0 0 4px}
    .board-head p{margin:0;color:var(--muted)}
    .legend{display:flex;gap:18px;font-size:13px;color:#555}
    .legend span{display:flex;align-items:center;gap:8px}
    .legend i{width:9px;height:9px;border-radius:50%;display:block;background:var(--green)}
    .legend i.claimed{background:#111319}
    .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
    .slot{min-height:156px;border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:17px;box-shadow:0 7px 24px rgba(30,24,18,.035);display:flex;flex-direction:column}
    .slot-top{display:flex;justify-content:space-between;align-items:center}
    .slot-top strong{font-size:18px}
    .dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
    .availability{color:var(--green);font-weight:900;font-size:10px;letter-spacing:.09em;margin-top:13px}
    .slot p{font-size:12px;line-height:1.45;color:var(--muted);margin:7px 0 14px;flex:1}
    .claim-btn{background:transparent;border:1.5px solid var(--green);color:#168a45;font-weight:900;font-size:12px;border-radius:999px;padding:8px 9px;cursor:pointer;transition:.18s}
    .claim-btn:hover{background:#ecfff3;transform:translateY(-1px)}
    .how{padding:70px 0 32px}
    .section-label{text-align:center;font-size:13px;font-weight:900;letter-spacing:.16em;margin-bottom:18px}
    .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .step{border:1px solid var(--line);border-radius:20px;padding:24px;min-height:188px;background:rgba(255,255,255,.62)}
    .step:nth-child(1){background:linear-gradient(135deg,rgba(248,244,255,.92),rgba(255,255,255,.72))}
    .step:nth-child(2){background:linear-gradient(135deg,rgba(241,255,248,.92),rgba(255,255,255,.72))}
    .step:nth-child(3){background:linear-gradient(135deg,rgba(255,247,237,.92),rgba(255,255,255,.72))}
    .step-num{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:white;border:1px solid var(--line)}
    .step h3{margin:22px 0 8px;font-size:18px}
    .step p{margin:0;color:var(--muted);line-height:1.55;font-size:14px}
    .faq{padding:34px 0 70px}
    .faq-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    details{border-top:1px solid var(--line);padding:16px 0}
    details:last-child{border-bottom:1px solid var(--line)}
    summary{font-weight:800;cursor:pointer}
    details p{color:var(--muted);line-height:1.6;max-width:760px}
    footer{border-top:1px solid var(--line);padding:28px 0 44px}
    .footer-row{display:flex;justify-content:space-between;align-items:flex-end;gap:30px}
    .footer-brand strong{font-size:20px;display:block}
    .footer-brand span{font-size:13px;color:var(--muted)}
    .footer-links{display:flex;gap:24px;font-size:13px;color:#656973}
    .footer-links a{text-decoration:none}
    .modal{position:fixed;inset:0;background:rgba(8,10,14,.55);display:none;place-items:center;padding:20px;z-index:20}
    .modal.open{display:grid}
    .modal-card{width:min(470px,100%);background:white;border-radius:24px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.18)}
    .modal-card h3{font-size:30px;letter-spacing:-.04em;margin:12px 0 8px}
    .modal-card p{color:var(--muted);line-height:1.55}
    .modal-actions{display:flex;gap:10px;margin-top:20px}
    .modal-actions button{flex:1;border-radius:999px;padding:12px;border:1px solid #d9d9d9;background:#fff;font-weight:800;cursor:pointer}
    .modal-actions .primary{background:#111319;color:white;border-color:#111319}
    @media(max-width:900px){.grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:700px){
      nav a:not(.nav-cta){display:none}.hero{padding-top:48px}
      h1{font-size:56px}.stats{grid-template-columns:1fr}.live-row{grid-template-columns:1fr}
      .grid{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:1fr}
      .board-head,.faq-top,.footer-row{align-items:flex-start;flex-direction:column}
      .legend{margin-top:10px}.footer-links{flex-wrap:wrap}
    }
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/">ClaimTheHour</a>
    <nav>
      <a href="#how">How it works</a>
      <a href="#faq">FAQ</a>
      <a href="#board">Today's board</a>
      <a class="nav-cta" href="#board">Claim an hour</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="pill"><span class="spark">✦</span> 24 HOURS. 24 SPOTS. ONE DAY.</div>
      <h1><span>Claim an hour of</span><br><span>the internet<span class="dot-end">.</span></span></h1>
      <p class="hero-copy">Pick an open hour, claim it for $1, and put your product in the spotlight.<br>Once an hour is claimed, it's gone for the day.</p>

      <div class="stats">
        <div class="stat">
          <div class="ico">◷</div>
          <div><small>TODAY'S DATE</small><strong id="todayDate">—</strong></div>
        </div>
        <div class="stat dark">
          <div class="ico">◷</div>
          <div><small>TIME LEFT TODAY</small><strong class="accent" id="timeLeft">—</strong></div>
        </div>
        <div class="stat">
          <div class="ico">◎</div>
          <div><small>SPOTS LEFT</small><strong class="green">24 / 24</strong></div>
        </div>
      </div>

      <div class="live-row">
        <div class="now-card">
          <span class="now-badge">NOW</span>
          <div><small>CURRENT TIME</small><div class="now-time" id="localTime">—</div></div>
        </div>
        <div class="notice">
          <div class="bolt">ϟ</div>
          <div><strong>First come, first served</strong><span>When an hour is claimed, it's locked for the rest of the day.</span></div>
        </div>
      </div>
    </section>

    <section id="board">
      <div class="board-head">
        <div><h2>TODAY'S BOARD</h2><p>All 24 hours. One pick a day.</p></div>
        <div class="legend"><span><i></i>Available</span><span><i class="claimed"></i>Claimed</span></div>
      </div>
      <div class="grid">${slots}</div>
    </section>

    <section class="how" id="how">
      <div class="section-label">HOW IT WORKS</div>
      <div class="steps">
        <div class="step"><div class="step-num">01</div><h3>Pick an hour</h3><p>Choose any open spot on today's 24-hour board.</p></div>
        <div class="step"><div class="step-num">02</div><h3>Pay $1</h3><p>Add your product name, URL and a short description.</p></div>
        <div class="step"><div class="step-num">03</div><h3>It's yours</h3><p>Your product owns that hour. Share your claim and send people to it.</p></div>
      </div>
    </section>

    <section class="faq" id="faq">
      <div class="faq-top"><h2>FAQ</h2><span style="color:var(--muted);font-size:13px">Simple rules. No auction.</span></div>
      <details><summary>What am I buying?</summary><p>A one-hour promotional position on ClaimTheHour's board for the selected date.</p></details>
      <details><summary>Can someone take my hour?</summary><p>No. ClaimTheHour is first-come, first-served. Once a spot is claimed and payment is confirmed, it is locked for that day.</p></details>
      <details><summary>What happens after I claim?</summary><p>Your product name, short description and destination link will appear in the selected hour. Checkout and persistent claims are added in the payment build.</p></details>
    </section>
  </main>
</div>

<footer>
  <div class="wrap footer-row">
    <div class="footer-brand"><strong>ClaimTheHour</strong><span>24 hours. 24 spots. Claim yours.</span></div>
    <div class="footer-links"><a href="#how">How it works</a><a href="#faq">FAQ</a><a href="#board">Today's board</a><span>© 2026 ClaimTheHour</span></div>
  </div>
</footer>

<div class="modal" id="modal">
  <div class="modal-card">
    <div class="pill">V1.1 PREVIEW</div>
    <h3>Claim <span id="selectedHour"></span></h3>
    <p>This is the polished front-end preview. The next step connects this action to Stripe Checkout and Cloudflare D1 so real claims can be stored and paid for.</p>
    <div class="modal-actions">
      <button id="closeModal">Close</button>
      <button class="primary" id="demoPay">Continue — $1</button>
    </div>
  </div>
</div>

<script>
  function updateClock(){
    const now = new Date();
    const dateText = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(now);
    const timeText = new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
    const midnight = new Date(now);
    midnight.setHours(24,0,0,0);
    let ms = midnight - now;
    const h = Math.floor(ms/3600000); ms%=3600000;
    const m = Math.floor(ms/60000); ms%=60000;
    const s = Math.floor(ms/1000);
    document.getElementById('todayDate').textContent = dateText;
    document.getElementById('localTime').textContent = timeText;
    document.getElementById('timeLeft').textContent = h + 'h ' + m + 'm ' + s + 's';

    document.querySelectorAll('.slot').forEach(el=>{
      el.style.outline = '';
      if(Number(el.dataset.hour) === now.getHours()){
        el.style.outline = '2px solid #f2b01c';
        el.style.outlineOffset = '2px';
      }
    });
  }
  updateClock();
  setInterval(updateClock,1000);

  const modal=document.getElementById('modal');
  const selected=document.getElementById('selectedHour');
  document.querySelectorAll('.claim-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selected.textContent=btn.dataset.label;
      modal.classList.add('open');
    });
  });
  document.getElementById('closeModal').onclick=()=>modal.classList.remove('open');
  document.getElementById('demoPay').onclick=()=>alert('Stripe Checkout will be connected in the next step.');
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
</script>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "claimthehour", version: "1.1" }), {
        headers: { "content-type": "application/json; charset=UTF-8" }
      });
    }
    return new Response(html(), {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "public, max-age=60"
      }
    });
  }
};
