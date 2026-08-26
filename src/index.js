const HOURS = [
  { time: "12 AM", status: "claimed", name: "LaunchKit", desc: "Launch better products.", url: "https://example.com" },
  { time: "1 AM", status: "available" },
  { time: "2 AM", status: "available" },
  { time: "3 AM", status: "claimed", name: "TinyShip", desc: "Ship small. Learn fast.", url: "https://example.com" },
  { time: "4 AM", status: "available" },
  { time: "5 AM", status: "available" },
  { time: "6 AM", status: "available" },
  { time: "7 AM", status: "claimed", name: "MakerBoard", desc: "Tools for independent makers.", url: "https://example.com" },
  { time: "8 AM", status: "available" },
  { time: "9 AM", status: "available" },
  { time: "10 AM", status: "claimed", name: "BuildFast", desc: "From idea to launch.", url: "https://example.com" },
  { time: "11 AM", status: "available" },
  { time: "12 PM", status: "available" },
  { time: "1 PM", status: "available" },
  { time: "2 PM", status: "claimed", name: "OnePage", desc: "One page. One clear offer.", url: "https://example.com" },
  { time: "3 PM", status: "available" },
  { time: "4 PM", status: "available" },
  { time: "5 PM", status: "claimed", name: "IndieStack", desc: "A stack for solo builders.", url: "https://example.com" },
  { time: "6 PM", status: "available" },
  { time: "7 PM", status: "available" },
  { time: "8 PM", status: "available" },
  { time: "9 PM", status: "claimed", name: "ShipToday", desc: "Stop waiting. Put it online.", url: "https://example.com" },
  { time: "10 PM", status: "available" },
  { time: "11 PM", status: "available" }
];

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHour(item) {
  if (item.status === "claimed") {
    return `
      <article class="slot claimed">
        <div class="time">${esc(item.time)}</div>
        <div class="slot-body">
          <span class="badge">CLAIMED</span>
          <strong>${esc(item.name)}</strong>
          <p>${esc(item.desc)}</p>
        </div>
        <a class="visit" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Visit ↗</a>
      </article>`;
  }
  return `
    <article class="slot">
      <div class="time">${esc(item.time)}</div>
      <div class="slot-body">
        <span class="badge available">AVAILABLE</span>
        <strong>Your product here</strong>
        <p>Own this hour of the internet.</p>
      </div>
      <button class="claim-btn" data-hour="${esc(item.time)}">Claim for $1</button>
    </article>`;
}

function html() {
  const claimed = HOURS.filter(h => h.status === "claimed").length;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());

  const slots = HOURS.map(renderHour).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ClaimTheHour — 24 hours. 24 spots. Claim yours.</title>
  <meta name="description" content="Own an hour of the internet. Pick an available hour, claim it, and put your product in the spotlight.">
  <meta property="og:title" content="ClaimTheHour">
  <meta property="og:description" content="24 hours. 24 spots. Claim yours.">
  <meta name="theme-color" content="#0b0b0b">
  <style>
    :root{--bg:#f7f5ef;--ink:#111;--muted:#67645d;--line:#d9d4c8;--panel:#fffdf8;--accent:#111}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    a{color:inherit}
    .wrap{width:min(980px,calc(100% - 32px));margin:auto}
    header{display:flex;align-items:center;justify-content:space-between;padding:24px 0}
    .logo{font-weight:900;letter-spacing:-.04em;font-size:22px;text-decoration:none}
    nav{display:flex;gap:20px;font-size:14px}
    nav a{text-decoration:none;color:var(--muted)}
    .hero{padding:82px 0 58px;text-align:center}
    .eyebrow{display:inline-flex;padding:7px 11px;border:1px solid var(--line);border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.08em;background:var(--panel)}
    h1{font-size:clamp(48px,8vw,88px);line-height:.94;letter-spacing:-.07em;margin:20px auto 22px;max-width:850px}
    .sub{max-width:620px;margin:auto;font-size:19px;line-height:1.55;color:var(--muted)}
    .board-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:40px 0 14px}
    .board-head h2{font-size:28px;letter-spacing:-.04em;margin:0}
    .board-meta{text-align:right;color:var(--muted);font-size:14px}
    .progress{height:8px;background:#e6e1d6;border-radius:99px;overflow:hidden;margin-bottom:22px}
    .progress>span{display:block;height:100%;background:#111;width:${(claimed/24)*100}%}
    .slots{display:grid;gap:10px}
    .slot{display:grid;grid-template-columns:90px 1fr auto;align-items:center;gap:18px;border:1px solid var(--line);background:var(--panel);padding:16px 18px;border-radius:16px}
    .slot.claimed{background:#111;color:#fff;border-color:#111}
    .time{font-weight:900;font-size:18px;letter-spacing:-.02em}
    .slot-body{min-width:0}
    .slot-body strong{display:block;font-size:16px;margin:5px 0 2px}
    .slot-body p{margin:0;font-size:13px;color:var(--muted)}
    .claimed .slot-body p{color:#aaa}
    .badge{font-size:10px;font-weight:900;letter-spacing:.12em;color:#bbb}
    .badge.available{color:#777}
    .claim-btn,.visit{appearance:none;border:0;border-radius:999px;padding:11px 15px;font-weight:800;font-size:13px;cursor:pointer;text-decoration:none;white-space:nowrap}
    .claim-btn{background:#111;color:#fff}
    .visit{background:#fff;color:#111}
    .sections{padding:84px 0 40px}
    .three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .card{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:24px}
    .num{font-size:12px;font-weight:900;color:var(--muted);letter-spacing:.1em}
    .card h3{font-size:20px;margin:28px 0 8px;letter-spacing:-.03em}
    .card p{margin:0;color:var(--muted);line-height:1.55;font-size:14px}
    .faq{padding:60px 0}
    .faq h2{font-size:36px;letter-spacing:-.05em}
    details{border-top:1px solid var(--line);padding:18px 0}
    details:last-child{border-bottom:1px solid var(--line)}
    summary{cursor:pointer;font-weight:800}
    details p{color:var(--muted);line-height:1.6;max-width:720px}
    footer{display:flex;justify-content:space-between;gap:20px;padding:38px 0 60px;color:var(--muted);font-size:13px}
    .modal{position:fixed;inset:0;background:rgba(0,0,0,.58);display:none;align-items:center;justify-content:center;padding:20px}
    .modal.open{display:flex}
    .modal-card{background:#fff;border-radius:22px;padding:26px;width:min(460px,100%)}
    .modal-card h3{font-size:28px;letter-spacing:-.04em;margin:4px 0 10px}
    .modal-card p{color:#666;line-height:1.55}
    .modal-actions{display:flex;gap:10px;margin-top:20px}
    .modal-actions button{flex:1;padding:12px;border-radius:999px;border:1px solid #ccc;background:white;font-weight:800;cursor:pointer}
    .modal-actions .primary{background:#111;color:#fff;border-color:#111}
    @media(max-width:700px){
      nav{display:none}.hero{padding-top:50px}
      .board-head{align-items:start;flex-direction:column}.board-meta{text-align:left}
      .slot{grid-template-columns:68px 1fr}.slot .claim-btn,.slot .visit{grid-column:1/-1;text-align:center}
      .three{grid-template-columns:1fr}footer{flex-direction:column}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <a class="logo" href="/">ClaimTheHour</a>
      <nav><a href="#how">How it works</a><a href="#faq">FAQ</a><a href="#board">Today</a></nav>
    </header>

    <main>
      <section class="hero">
        <span class="eyebrow">24 HOURS · 24 SPOTS</span>
        <h1>Claim an hour of the internet.</h1>
        <p class="sub">Pick an available hour, claim it for $1, and put your product in the spotlight. Once an hour is claimed, it's gone.</p>
      </section>

      <section id="board">
        <div class="board-head">
          <div>
            <div class="eyebrow">TODAY · ${esc(date.toUpperCase())}</div>
            <h2 style="margin-top:12px">The board</h2>
          </div>
          <div class="board-meta"><strong>${claimed} / 24 claimed</strong><br>${24-claimed} hours left</div>
        </div>
        <div class="progress" aria-label="${claimed} of 24 hours claimed"><span></span></div>
        <div class="slots">${slots}</div>
      </section>

      <section class="sections" id="how">
        <div class="three">
          <div class="card"><div class="num">01 · PICK</div><h3>Choose an hour</h3><p>Grab any open spot on today's 24-hour board.</p></div>
          <div class="card"><div class="num">02 · CLAIM</div><h3>Pay $1</h3><p>Add your product name, URL and one short description.</p></div>
          <div class="card"><div class="num">03 · OWN</div><h3>It's yours</h3><p>Your product owns that hour. Share your claim and send people to it.</p></div>
        </div>
      </section>

      <section class="faq" id="faq">
        <h2>FAQ</h2>
        <details><summary>What am I buying?</summary><p>A single one-hour position on ClaimTheHour's daily board. In V1, this page is a product-preview and checkout is not connected yet.</p></details>
        <details><summary>Can someone take my hour?</summary><p>No. The concept is first-come, first-served. Once an hour is claimed, it stays claimed for that date.</p></details>
        <details><summary>What happens after I claim?</summary><p>Your product name, short description and link appear in your hour. Payment and persistent storage will be added in the next build.</p></details>
      </section>
    </main>

    <footer><span>© 2026 ClaimTheHour</span><span>24 hours. 24 spots. Claim yours.</span></footer>
  </div>

  <div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal-card">
      <div class="eyebrow">V1 PREVIEW</div>
      <h3 id="modalTitle">Claim <span id="selectedHour"></span></h3>
      <p>The front end is working. We will connect this button to Stripe and Cloudflare D1 after the first deployment is confirmed.</p>
      <div class="modal-actions">
        <button id="closeModal">Close</button>
        <button class="primary" id="demoPay">Continue — $1</button>
      </div>
    </div>
  </div>

  <script>
    const modal = document.getElementById('modal');
    const selectedHour = document.getElementById('selectedHour');
    document.querySelectorAll('.claim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedHour.textContent = btn.dataset.hour;
        modal.classList.add('open');
      });
    });
    document.getElementById('closeModal').onclick = () => modal.classList.remove('open');
    document.getElementById('demoPay').onclick = () => alert('Stripe will be connected in the next step.');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  </script>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "claimthehour" }), {
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
