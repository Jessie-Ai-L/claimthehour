const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const suffix = i < 12 ? "AM" : "PM";
  return { hour: i, label: `${h} ${suffix}` };
});

const HOLD_MINUTES = 15;
const PRICE_USD = "1.00";

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

function labelForHourServer(hour) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

function paypalBase(env) {
  return String(env.PAYPAL_ENV || "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured.");
  }

  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
      "accept": "application/json"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    console.error("PayPal token error", data);
    throw new Error("Could not authenticate with PayPal.");
  }
  return data.access_token;
}

async function createPayPalOrder(env, origin, reservation) {
  const accessToken = await paypalAccessToken(env);

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: `claim-${reservation.id}`,
        custom_id: String(reservation.id),
        description: `ClaimTheHour — ${reservation.claim_date} ${labelForHourServer(reservation.claim_hour)}`,
        amount: {
          currency_code: "USD",
          value: PRICE_USD
        }
      }
    ],
    application_context: {
      brand_name: "ClaimTheHour",
      landing_page: "LOGIN",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: `${origin}/api/paypal/return?reservation_id=${reservation.id}`,
      cancel_url: `${origin}/?cancelled=1#board`
    }
  };

  const response = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
      "accept": "application/json",
      "prefer": "return=representation",
      "PayPal-Request-Id": `claimthehour-${reservation.id}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.id) {
    console.error("PayPal create order error", data);
    throw new Error("Could not create PayPal order.");
  }

  const approval = (data.links || []).find(
    link => link.rel === "approve" || link.rel === "payer-action"
  );
  if (!approval?.href) {
    console.error("PayPal approval URL missing", data);
    throw new Error("PayPal did not return an approval URL.");
  }

  return { id: data.id, approval_url: approval.href };
}


async function getPayPalOrder(env, orderId) {
  const accessToken = await paypalAccessToken(env);
  const response = await fetch(
    `${paypalBase(env)}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "accept": "application/json"
      }
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("PayPal get order error", data);
    throw new Error("Could not verify PayPal order.");
  }
  return data;
}

async function capturePayPalOrder(env, orderId) {
  const accessToken = await paypalAccessToken(env);
  const response = await fetch(
    `${paypalBase(env)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
        "accept": "application/json",
        "prefer": "return=representation",
        "PayPal-Request-Id": `capture-${orderId}`
      },
      body: "{}"
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("PayPal capture error", data);
    throw new Error("PayPal capture failed.");
  }
  return data;
}


async function verifyPayPalWebhook(request, env, rawBody) {
  if (!env.PAYPAL_WEBHOOK_ID) {
    throw new Error("PAYPAL_WEBHOOK_ID is not configured.");
  }

  const accessToken = await paypalAccessToken(env);

  const authAlgo = request.headers.get("paypal-auth-algo");
  const certUrl = request.headers.get("paypal-cert-url");
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  const transmissionTime = request.headers.get("paypal-transmission-time");

  if (
    !authAlgo ||
    !certUrl ||
    !transmissionId ||
    !transmissionSig ||
    !transmissionTime
  ) {
    return false;
  }

  // Preserve the webhook event JSON exactly as received while building
  // the verification request required by PayPal.
  const verificationBody =
    `{"auth_algo":${JSON.stringify(authAlgo)},` +
    `"cert_url":${JSON.stringify(certUrl)},` +
    `"transmission_id":${JSON.stringify(transmissionId)},` +
    `"transmission_sig":${JSON.stringify(transmissionSig)},` +
    `"transmission_time":${JSON.stringify(transmissionTime)},` +
    `"webhook_id":${JSON.stringify(env.PAYPAL_WEBHOOK_ID)},` +
    `"webhook_event":${rawBody}}`;

  const response = await fetch(
    `${paypalBase(env)}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: verificationBody
    }
  );

  const data = await response.json();
  if (!response.ok) {
    console.error("PayPal webhook verification API error", data);
    return false;
  }

  return data.verification_status === "SUCCESS";
}

async function markClaimPaidFromCapture(env, orderId, capture) {
  if (
    !orderId ||
    capture?.status !== "COMPLETED" ||
    !capture?.id ||
    capture?.amount?.currency_code !== "USD" ||
    capture?.amount?.value !== PRICE_USD
  ) {
    return { ok: false, reason: "capture_not_valid" };
  }

  const result = await env.DB.prepare(`
    UPDATE claims
    SET
      payment_status = 'paid',
      stripe_payment_intent_id = ?,
      paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
    WHERE stripe_session_id = ?
      AND payment_status = 'pending'
  `).bind(capture.id, orderId).run();

  if ((result.meta?.changes || 0) === 1) {
    return { ok: true, changed: true };
  }

  const existing = await env.DB.prepare(`
    SELECT id, payment_status, stripe_payment_intent_id
    FROM claims
    WHERE stripe_session_id = ?
  `).bind(orderId).first();

  if (
    existing?.payment_status === "paid" &&
    (!existing.stripe_payment_intent_id ||
      existing.stripe_payment_intent_id === capture.id)
  ) {
    if (!existing.stripe_payment_intent_id) {
      await env.DB.prepare(`
        UPDATE claims
        SET stripe_payment_intent_id = ?, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).bind(capture.id, existing.id).run();
    }
    return { ok: true, changed: false };
  }

  return { ok: false, reason: "claim_not_found_or_not_pending" };
}

async function handlePayPalWebhook(request, env) {
  const rawBody = await request.text();

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyPayPalWebhook(request, env, rawBody);
  } catch (error) {
    console.error("Webhook verification error", error);
    return new Response("Webhook verification unavailable", { status: 503 });
  }

  if (!verified) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  try {
    if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const orderId = String(event?.resource?.id || "");
      if (!orderId) return new Response("OK", { status: 200 });

      const claim = await env.DB.prepare(`
        SELECT id, payment_status, stripe_session_id
        FROM claims
        WHERE stripe_session_id = ?
      `).bind(orderId).first();

      if (!claim || claim.payment_status === "paid") {
        return new Response("OK", { status: 200 });
      }

      // Re-read the order from PayPal before capture. This prevents trusting
      // webhook payload fields alone for amount, currency, or reservation ID.
      const order = await getPayPalOrder(env, orderId);
      const unit = order?.purchase_units?.[0];
      const amountOk =
        unit?.amount?.currency_code === "USD" &&
        unit?.amount?.value === PRICE_USD;
      const reservationMatches =
        String(unit?.custom_id || "") === String(claim.id);

      if (
        order?.status !== "APPROVED" ||
        !amountOk ||
        !reservationMatches
      ) {
        console.error("Approved webhook order verification failed", {
          orderId,
          status: order?.status,
          amountOk,
          reservationMatches
        });
        return new Response("OK", { status: 200 });
      }

      const captured = await capturePayPalOrder(env, orderId);
      const capture =
        captured?.purchase_units?.[0]?.payments?.captures?.[0] || null;

      await markClaimPaidFromCapture(env, orderId, capture);
      return new Response("OK", { status: 200 });
    }

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const capture = event?.resource || null;
      const orderId = String(
        capture?.supplementary_data?.related_ids?.order_id || ""
      );

      await markClaimPaidFromCapture(env, orderId, capture);
      return new Response("OK", { status: 200 });
    }

    if (
      event.event_type === "PAYMENT.CAPTURE.DENIED" ||
      event.event_type === "CHECKOUT.PAYMENT-APPROVAL.REVERSED"
    ) {
      // Do not claim the hour. Keep it pending until the normal 15-minute
      // expiry releases it.
      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("PayPal webhook processing error", error);
    // Return 500 so PayPal can retry transient processing failures.
    return new Response("Webhook processing failed", { status: 500 });
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
  let reservationId = null;

  try {
    const result = await env.DB.prepare(`
      INSERT INTO claims (
        claim_date, claim_hour, product_name, product_url, description, payment_status
      ) VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(dateKey, hour, productName, productUrl, description).run();

    reservationId = result.meta?.last_row_id;
    if (!reservationId) throw new Error("Reservation ID missing.");

    const order = await createPayPalOrder(env, new URL(request.url).origin, {
      id: reservationId,
      claim_date: dateKey,
      claim_hour: hour
    });

    await env.DB.prepare(`
      UPDATE claims
      SET stripe_session_id = ?
      WHERE id = ? AND payment_status = 'pending'
    `).bind(order.id, reservationId).run();

    return json({
      ok: true,
      reservation_id: reservationId,
      paypal_order_id: order.id,
      approval_url: order.approval_url,
      hold_minutes: HOLD_MINUTES
    }, 201);
  } catch (error) {
    if (reservationId) {
      await env.DB.prepare(`
        DELETE FROM claims
        WHERE id = ? AND payment_status = 'pending'
      `).bind(reservationId).run();
    }

    const message = String(error?.message || error);
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      return json({ ok: false, error: "That hour was just taken. Pick another spot." }, 409);
    }
    console.error("Reservation / PayPal order error", error);
    return json({ ok: false, error: "Could not start PayPal checkout. Please try again." }, 500);
  }
}

async function handlePayPalReturn(request, env) {
  const url = new URL(request.url);
  const reservationId = Number(url.searchParams.get("reservation_id"));
  const orderId = String(url.searchParams.get("token") || "");

  if (!Number.isInteger(reservationId) || reservationId <= 0 || !orderId) {
    return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
  }

  const reservation = await env.DB.prepare(`
    SELECT id, claim_hour, payment_status, stripe_session_id
    FROM claims
    WHERE id = ?
  `).bind(reservationId).first();

  if (!reservation) {
    return Response.redirect(`${url.origin}/?expired=1#board`, 303);
  }

  if (reservation.payment_status === "paid") {
    return Response.redirect(
      `${url.origin}/?paid=1&hour=${reservation.claim_hour}#board`,
      303
    );
  }

  if (
    reservation.payment_status !== "pending" ||
    reservation.stripe_session_id !== orderId
  ) {
    return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
  }

  const active = await env.DB.prepare(`
    SELECT CASE
      WHEN datetime(created_at, '+${HOLD_MINUTES} minutes') > datetime('now')
      THEN 1 ELSE 0
    END AS active
    FROM claims
    WHERE id = ?
  `).bind(reservationId).first();

  if (!active?.active) {
    await env.DB.prepare(`
      DELETE FROM claims
      WHERE id = ? AND payment_status = 'pending'
    `).bind(reservationId).run();

    return Response.redirect(`${url.origin}/?expired=1#board`, 303);
  }

  try {
    // Returning from PayPal is not sufficient by itself.
    // Re-read the order and verify amount/reservation before any capture.
    const order = await getPayPalOrder(env, orderId);
    const unit = order?.purchase_units?.[0];
    const amountOk =
      unit?.amount?.currency_code === "USD" &&
      unit?.amount?.value === PRICE_USD;
    const reservationMatches =
      String(unit?.custom_id || "") === String(reservationId);

    if (!amountOk || !reservationMatches) {
      return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
    }

    // The webhook may have captured the order before the browser returns.
    if (order?.status === "COMPLETED") {
      const capture =
        unit?.payments?.captures?.find(c => c?.status === "COMPLETED") || null;

      const reconciled = await markClaimPaidFromCapture(env, orderId, capture);
      if (reconciled.ok) {
        return Response.redirect(
          `${url.origin}/?paid=1&hour=${reservation.claim_hour}#board`,
          303
        );
      }

      const latest = await env.DB.prepare(`
        SELECT payment_status FROM claims WHERE id = ?
      `).bind(reservationId).first();

      if (latest?.payment_status === "paid") {
        return Response.redirect(
          `${url.origin}/?paid=1&hour=${reservation.claim_hour}#board`,
          303
        );
      }

      return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
    }

    if (order?.status !== "APPROVED") {
      return Response.redirect(
        `${url.origin}/?not_approved=1&hour=${reservation.claim_hour}#board`,
        303
      );
    }

    const captured = await capturePayPalOrder(env, orderId);
    const capture =
      captured?.purchase_units?.[0]?.payments?.captures?.[0] || null;

    const reconciled = await markClaimPaidFromCapture(env, orderId, capture);
    if (!reconciled.ok) {
      const latest = await env.DB.prepare(`
        SELECT payment_status FROM claims WHERE id = ?
      `).bind(reservationId).first();

      if (latest?.payment_status !== "paid") {
        return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
      }
    }

    return Response.redirect(
      `${url.origin}/?paid=1&hour=${reservation.claim_hour}#board`,
      303
    );
  } catch (error) {
    console.error("PayPal verification/capture error", error);
    return Response.redirect(`${url.origin}/?payment_error=1#board`, 303);
  }
}


function legalPage(title, slug, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} | ClaimTheHour</title>
  <meta name="robots" content="index,follow">
  <meta name="description" content="${title} for ClaimTheHour.">
  <link rel="canonical" href="https://claimthehour.com/${slug}">
  <style>
    :root{--bg:#fbf7f1;--ink:#111318;--muted:#666b73;--line:#e7dfd4;--card:#fffdf9}
    *{box-sizing:border-box}
    body{margin:0;background:linear-gradient(180deg,#fffaf3 0%,#fbf7f1 100%);color:var(--ink);font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    a{color:inherit}
    .wrap{max-width:980px;margin:0 auto;padding:28px 22px 70px}
    .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:58px}
    .brand{font-weight:850;font-size:26px;text-decoration:none}
    .back{padding:10px 16px;border:1px solid var(--line);border-radius:999px;text-decoration:none;background:#fff}
    .eyebrow{display:inline-flex;padding:7px 12px;border:1px solid #f0d7ae;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:#fff7e8}
    h1{font-size:clamp(42px,7vw,76px);line-height:.98;letter-spacing:-.05em;margin:18px 0}
    .lede{font-size:20px;color:var(--muted);max-width:760px;margin-bottom:34px}
    .card{background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:0 12px 40px rgba(20,20,20,.05)}
    h2{font-size:24px;margin:28px 0 8px}
    p{margin:0 0 16px;color:#343840}
    footer{margin-top:34px;padding-top:22px;border-top:1px solid var(--line);display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:14px}
  
    .trust-strip{max-width:1180px;margin:34px auto 70px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .trust-strip div{background:rgba(255,255,255,.72);border:1px solid #e9e0d5;border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 30px rgba(20,20,20,.035)}
    .trust-strip strong{font-size:24px;letter-spacing:-.03em}
    .trust-strip span{font-size:13px;color:#727780}
    .site-footer{max-width:1180px;margin:72px auto 0;padding:28px 0 38px;border-top:1px solid #e7dfd4;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;color:#6f737b;font-size:14px}
    .site-footer nav{display:flex;gap:18px;flex-wrap:wrap}
    .site-footer a{text-decoration:none;color:inherit}
    .site-footer a:hover{text-decoration:underline}
    @media(max-width:820px){.trust-strip{grid-template-columns:repeat(2,1fr)}}


    .trust-strip{
      max-width:1180px;
      margin:42px auto 76px;
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:14px;
    }
    .trust-strip>div{
      min-width:0;
      background:rgba(255,255,255,.82);
      border:1px solid #e9e0d5;
      border-radius:18px;
      padding:18px 20px;
      display:flex;
      flex-direction:column;
      gap:3px;
      box-shadow:0 8px 28px rgba(20,20,20,.04);
    }
    .trust-strip strong{font-size:24px;line-height:1.1;letter-spacing:-.03em}
    .trust-strip span{font-size:13px;line-height:1.35;color:#727780}
    .site-footer{
      max-width:1180px;
      margin:72px auto 0;
      padding:30px 0 40px;
      border-top:1px solid #e7dfd4;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:24px;
      flex-wrap:wrap;
      color:#6f737b;
      font-size:14px;
    }
    .site-footer .footer-brand{display:flex;flex-direction:column;gap:4px}
    .site-footer .footer-brand strong{color:#111318;font-size:16px}
    .site-footer nav{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
    .site-footer a{text-decoration:none;color:inherit}
    .site-footer a:hover{text-decoration:underline}
    @media(max-width:820px){
      .trust-strip{grid-template-columns:repeat(2,minmax(0,1fr));margin:30px auto 58px}
      .site-footer{align-items:flex-start;flex-direction:column}
    }
    @media(max-width:520px){
      .trust-strip{grid-template-columns:1fr}
    }

</style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <a class="brand" href="/">ClaimTheHour</a>
      <a class="back" href="/">Back to board</a>
    </div>
    <span class="eyebrow">ClaimTheHour</span>
    <h1>${title}</h1>
    <p class="lede">Clear, simple terms for a simple product.</p>
    <section class="card">${bodyHtml}</section>
    <footer>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/refunds">Refunds</a>
      <a href="/contact">Contact</a>
    </footer>
  </main>
</body>
</html>`;
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
    .hero-copy{max-width:720px;margin:auto;color:#5c6069;font-size:18px;line-height:1.55}.status-banner{display:none;max-width:850px;margin:22px auto 0;padding:14px 18px;border-radius:14px;font-weight:800;font-size:14px}.status-banner.show{display:block}.status-banner.success{background:#effcf4;border:1px solid #b6e6c7;color:#16683a}.status-banner.warn{background:#fff7e7;border:1px solid #f0d090;color:#8a5a00}.status-banner.error{background:#fff0ef;border:1px solid #f0bab5;color:#9e2b22}
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
    .form-note{font-size:12px;color:var(--muted)}.form-error{font-size:13px;color:#b42318;min-height:18px}.modal-actions{display:flex;gap:10px;margin-top:8px}.modal-actions button{flex:1;border-radius:999px;padding:12px;border:1px solid #d9d9d9;background:#fff;font-weight:800;cursor:pointer}.modal-actions .primary{background:#0070ba;color:white;border-color:#0070ba}.modal-actions .primary:disabled{opacity:.55;cursor:wait}
    .success-box{display:none;background:#f1fff6;border:1px solid #b9e8ca;border-radius:14px;padding:14px;color:#186c3d;font-size:13px;line-height:1.5;margin-top:14px}
    @media(max-width:900px){.grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:700px){nav a:not(.nav-cta){display:none}.hero{padding-top:48px}h1{font-size:56px}.stats{grid-template-columns:1fr}.live-row{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:1fr}.board-head,.faq-top,.footer-row{align-items:flex-start;flex-direction:column}.legend{margin-top:10px}.footer-links{flex-wrap:wrap}}
  
.launch-facts{
  max-width:1180px;
  margin:42px auto 76px;
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
  padding:0 0;
}
.launch-fact{
  background:rgba(255,255,255,.86);
  border:1px solid #e8dfd4;
  border-radius:18px;
  padding:18px 20px;
  box-shadow:0 8px 28px rgba(20,20,20,.04);
  display:flex;
  flex-direction:column;
  gap:4px;
}
.launch-fact strong{
  font-size:24px;
  line-height:1.1;
  letter-spacing:-.03em;
  color:#111318;
}
.launch-fact span{
  font-size:13px;
  line-height:1.35;
  color:#727780;
}
.launch-footer{
  max-width:1180px;
  margin:72px auto 0;
  padding:30px 0 40px;
  border-top:1px solid #e7dfd4;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:24px;
  flex-wrap:wrap;
  color:#6f737b;
  font-size:14px;
}
.launch-footer-brand{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.launch-footer-brand strong{
  color:#111318;
  font-size:16px;
}
.launch-footer nav{
  display:flex;
  gap:18px;
  flex-wrap:wrap;
  align-items:center;
  justify-content:flex-end;
}
.launch-footer a{
  color:inherit;
  text-decoration:none;
}
.launch-footer a:hover{text-decoration:underline}
@media(max-width:820px){
  .launch-facts{grid-template-columns:repeat(2,minmax(0,1fr));margin:30px auto 58px}
  .launch-footer{flex-direction:column}
  .launch-footer nav{justify-content:flex-start}
}
@media(max-width:520px){
  .launch-facts{grid-template-columns:1fr}
}

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
      <div id="statusBanner" class="status-banner"></div>

      <div class="stats">
        <div class="stat"><div class="ico">◷</div><div><small>TODAY'S DATE · UTC</small><strong id="todayDate">—</strong></div></div>
        <div class="stat dark"><div class="ico">◷</div><div><small>TIME LEFT TODAY · UTC</small><strong class="accent" id="timeLeft">—</strong></div></div>
        <div class="stat"><div class="ico">◎</div><div><small>SPOTS LEFT</small><strong class="green" id="spotsLeft">24 / 24</strong></div></div>
      </div>

      <div class="live-row">
        <div class="now-card"><span class="now-badge">NOW</span><div><small>CURRENT TIME · UTC</small><div class="now-time" id="utcTime">—</div></div></div>
        <div class="notice"><div class="bolt">ϟ</div><div><strong>First come, first served</strong><span>Your spot is held for ${HOLD_MINUTES} minutes while you complete PayPal checkout.</span></div></div>
      </div>
    </section>

    <section id="board">
      <div class="board-head">
        <div><h2>TODAY'S BOARD</h2><p>All 24 hours. One pick a day. Board resets at 00:00 UTC.</p></div>
        <div class="legend"><span><i></i>Available</span><span><i class="held"></i>Held</span><span><i class="claimed"></i>Claimed</span></div>
      </div>
      <div class="grid">${slots}</div>
    </section>

    

<section class="launch-facts" aria-label="ClaimTheHour facts">
  <div class="launch-fact"><strong>24</strong><span>daily spots</span></div>
  <div class="launch-fact"><strong>$1</strong><span>flat claim price</span></div>
  <div class="launch-fact"><strong>UTC</strong><span>one global clock</span></div>
  <div class="launch-fact"><strong>15 min</strong><span>checkout hold</span></div>
</section>

<section class="how" id="how">
      <div class="section-label">HOW IT WORKS</div>
      <div class="steps">
        <div class="step"><div class="step-num">01</div><h3>Pick an hour</h3><p>Choose any open spot on today's UTC board.</p></div>
        <div class="step"><div class="step-num">02</div><h3>Pay $1 with PayPal</h3><p>Your spot is held while you approve the $1 Sandbox payment.</p></div>
        <div class="step"><div class="step-num">03</div><h3>It's yours</h3><p>After PayPal confirms payment, your product becomes the official owner of that hour.</p></div>
      </div>
    </section>

    <section class="faq" id="faq">
      <div class="faq-top"><h2>FAQ</h2><span style="color:var(--muted);font-size:13px">Simple rules. No auction.</span></div>
      <details><summary>What am I buying?</summary><p>A one-hour promotional position on ClaimTheHour's UTC board for the selected date.</p></details>
      <details><summary>Can someone take my hour?</summary><p>No after payment is confirmed. Before payment, a new reservation is temporarily held for ${HOLD_MINUTES} minutes.</p></details>
      <details><summary>Is this real money right now?</summary><p>This build uses PayPal Sandbox, so the checkout is a test and does not charge real money.</p></details>
    </section>
  </main>
</div>

<div class="modal" id="modal">
  <div class="modal-card">
    <div class="pill">PAYPAL SANDBOX</div>
    <h3>Claim <span id="selectedHour"></span></h3>
    <p>Enter your product, then continue to PayPal Sandbox to approve the $1 test payment.</p>
    <form class="form" id="claimForm">
      <div class="field"><label for="productName">Product name</label><input id="productName" name="product_name" maxlength="60" required placeholder="Your product"></div>
      <div class="field"><label for="productUrl">Product URL</label><input id="productUrl" name="product_url" type="url" required placeholder="https://example.com"></div>
      <div class="field"><label for="description">Short description</label><textarea id="description" name="description" maxlength="120" placeholder="What does your product do?"></textarea></div>
      <div class="form-note">Sandbox only: no real money will be charged.</div>
      <div class="form-error" id="formError"></div>
      <div class="modal-actions"><button type="button" id="closeModal">Cancel</button><button type="submit" class="primary" id="reserveBtn">Continue to PayPal — $1</button></div>
    </form>
  </div>
</div>

<script>
  const HOLD_MINUTES = ${HOLD_MINUTES};
  let selectedHour = null;
  const modal = document.getElementById('modal');
  const form = document.getElementById('claimForm');
  const formError = document.getElementById('formError');
  const reserveBtn = document.getElementById('reserveBtn');

  function dateKeyUTC(){
    return new Date().toISOString().slice(0,10);
  }

  function labelForHour(hour){
    const h = hour % 12 || 12;
    return h + ' ' + (hour < 12 ? 'AM' : 'PM');
  }

  function showStatusFromUrl(){
    const params = new URLSearchParams(location.search);
    const banner = document.getElementById('statusBanner');
    if(params.get('paid') === '1'){
      banner.className='status-banner show success';
      banner.textContent='Payment confirmed. Your hour is officially claimed.';
    } else if(params.get('cancelled') === '1'){
      banner.className='status-banner show warn';
      banner.textContent='PayPal checkout was cancelled. The temporary hold will expire automatically.';
    } else if(params.get('expired') === '1'){
      banner.className='status-banner show warn';
      banner.textContent='That temporary reservation expired before payment was captured.';
    } else if(params.get('not_approved') === '1'){
      banner.className='status-banner show warn';
      banner.textContent='Payment was not approved. Your spot is still only temporarily held.';
    } else if(params.get('payment_error') === '1'){
      banner.className='status-banner show error';
      banner.textContent='PayPal could not confirm the payment. No claim was activated.';
    }
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
      (isPaid ? '<a class="visit-btn" href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">Visit ↗</a>' : '<span class="form-note">PayPal checkout pending</span>');
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
        form.reset(); formError.textContent='';
        reserveBtn.disabled=false; reserveBtn.textContent='Continue to PayPal — $1';
        modal.classList.add('open');
      });
    });
  }

  document.getElementById('closeModal').onclick=()=>modal.classList.remove('open');
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});

  form.addEventListener('submit', async e=>{
    e.preventDefault();
    if(selectedHour === null) return;
    formError.textContent='';
    reserveBtn.disabled=true; reserveBtn.textContent='Opening PayPal…';

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
      if(!response.ok) throw new Error(data.error || 'Could not start checkout.');
      if(!data.approval_url) throw new Error('PayPal approval URL missing.');
      window.location.href = data.approval_url;
    }catch(error){
      formError.textContent=error.message;
      reserveBtn.disabled=false; reserveBtn.textContent='Continue to PayPal — $1';
    }
  });

  showStatusFromUrl();
  updateClock();
  setInterval(updateClock,1000);
  loadBoard();
</script>



<footer class="launch-footer">
  <div class="launch-footer-brand">
    <strong>ClaimTheHour</strong>
    <span>24 hours. 24 spots. Claim yours.</span>
  </div>
  <nav aria-label="Footer navigation">
    <a href="#how">How it works</a>
    <a href="#faq">FAQ</a>
    <a href="#board">Today's board</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="/refunds">Refunds</a>
    <a href="/contact">Contact</a>
    <span>© 2026 ClaimTheHour</span>
  </nav>
</footer>

</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      try {
        const row = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: row?.ok === 1, service: "claimthehour", version: "1.5.3", d1: true, paypal_env: env.PAYPAL_ENV || "sandbox", paypal_configured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET), webhook_configured: Boolean(env.PAYPAL_WEBHOOK_ID) });
      } catch {
        return json({ ok: false, service: "claimthehour", version: "1.5.3", d1: false }, 500);
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

    if (url.pathname === "/api/paypal/return" && request.method === "GET") {
      return handlePayPalReturn(request, env);
    }

    if (url.pathname === "/api/paypal/webhook" && request.method === "POST") {
      return handlePayPalWebhook(request, env);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const headers = {"content-type":"text/html; charset=UTF-8"};
      if (url.pathname === "/privacy") {
        return new Response(legalPage("Privacy Policy", "privacy", `
          <p>ClaimTheHour collects only the information needed to operate daily spot reservations, process payments, prevent abuse, and maintain the service.</p>
          <h2>Information we process</h2>
          <p>When you claim a spot, we may process your product name, product URL, short description, reservation time, payment status, and technical request data needed for security and reliability.</p>
          <h2>Payments</h2>
          <p>Payments are processed by PayPal. ClaimTheHour does not store your full card or bank details.</p>
          <h2>Retention</h2>
          <p>Reservation and transaction records may be retained for operational, fraud-prevention, accounting, and dispute-handling purposes.</p>
          <h2>Contact</h2>
          <p>For privacy questions, use the contact page.</p>
        `), {headers});
      }
      if (url.pathname === "/terms") {
        return new Response(legalPage("Terms of Service", "terms", `
          <p>ClaimTheHour sells a limited daily promotional placement: one product or website may claim one hourly spot on the current UTC day, subject to availability.</p>
          <h2>Eligibility and content</h2>
          <p>You must have the right to promote the submitted URL and content. Illegal, deceptive, infringing, malicious, adult, hateful, or abusive content may be removed without notice.</p>
          <h2>Availability</h2>
          <p>Spots are first come, first served. A temporary hold does not become final until payment is successfully completed.</p>
          <h2>Service changes</h2>
          <p>We may improve, suspend, or modify the service when needed for security, reliability, compliance, or product changes.</p>
        `), {headers});
      }
      if (url.pathname === "/refunds") {
        return new Response(legalPage("Refund Policy", "refunds", `
          <p>Each purchase reserves a time-limited promotional spot for the selected UTC day.</p>
          <h2>Before payment completes</h2>
          <p>If payment is not completed, the temporary hold expires automatically and no paid claim is created.</p>
          <h2>After payment completes</h2>
          <p>Because the purchased placement is time-sensitive and begins on the selected day, completed claims are generally non-refundable once the placement has been activated.</p>
          <h2>Exceptions</h2>
          <p>If ClaimTheHour fails to provide the purchased placement because of a verified service-side error, contact us and we will review the transaction for an appropriate remedy.</p>
        `), {headers});
      }
      if (url.pathname === "/contact") {
        return new Response(legalPage("Contact", "contact", `
          <p>Need help with a claim, payment, listing, or policy question?</p>
          <h2>Email support</h2>
          <p>Contact: <strong>support@claimthehour.com</strong></p>
          <h2>What to include</h2>
          <p>Please include the claimed hour, UTC date, product URL, and—if relevant—the PayPal transaction reference. Never send passwords or full card details.</p>
        `), {headers});
      }
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
