<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PEDIWAY — Seu delivery, do seu jeito</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --brand: #E8410A;
    --brand-dark: #B83208;
    --brand-light: #FDF1EC;
    --ink: #1A1208;
    --ink2: #4A3F35;
    --ink3: #8C7F74;
    --surface: #FFF9F6;
    --white: #FFFFFF;
    --border: #EDE5DF;
    --success: #1A8A5A;
    --success-bg: #EAF7F0;
    --radius: 14px;
    --radius-sm: 8px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Poppins', sans-serif; background: var(--surface); color: var(--ink); min-height: 100vh; }

  .screen { display: none; min-height: 100vh; }
  .screen.active { display: block; }

  /* LANDING */
  #screen-landing { background: var(--ink); color: var(--white); display: none; flex-direction: column; min-height: 100vh; }
  #screen-landing.active { display: flex; }
  .landing-header { padding: 2rem 2.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .logo { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.6rem; letter-spacing: -0.02em; }
  .logo span { color: var(--brand); }
  .landing-hero { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 4rem 2.5rem; max-width: 680px; }
  .badge { display: inline-block; background: rgba(232,65,10,0.15); color: var(--brand); border: 1px solid rgba(232,65,10,0.3); padding: 0.3rem 0.8rem; border-radius: 100px; font-size: 0.75rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 1.5rem; }
  .landing-hero h1 { font-family: 'Poppins', sans-serif; font-size: clamp(2.8rem, 6vw, 4.5rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.03em; margin-bottom: 1.5rem; }
  .landing-hero h1 em { font-style: normal; color: var(--brand); }
  .landing-hero p { color: rgba(255,255,255,0.6); font-size: 1.1rem; line-height: 1.7; margin-bottom: 2.5rem; max-width: 480px; }
  .landing-stats { display: flex; gap: 2rem; margin-top: 3rem; padding-top: 3rem; border-top: 1px solid rgba(255,255,255,0.08); }
  .stat-item { display: flex; flex-direction: column; }
  .stat-num { font-family: 'Poppins', sans-serif; font-size: 1.8rem; font-weight: 800; color: white; }
  .stat-label { font-size: 0.8rem; color: rgba(255,255,255,0.45); }

  /* BUTTONS */
  .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.85rem 1.75rem; border-radius: var(--radius-sm); font-family: 'Poppins', sans-serif; font-size: 0.95rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s; text-decoration: none; }
  .btn-primary { background: var(--brand); color: white; }
  .btn-primary:hover { background: var(--brand-dark); transform: translateY(-1px); }
  .btn-ghost { background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.15); }
  .btn-ghost:hover { background: rgba(255,255,255,0.13); }
  .btn-full { width: 100%; justify-content: center; }
  .btn-brand { background: var(--brand); color: white; }
  .btn-brand:hover { background: var(--brand-dark); }

  /* AUTH */
  #screen-login, #screen-register { display: none; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; background: var(--surface); }
  #screen-login.active, #screen-register.active { display: flex; }
  .auth-card { background: var(--white); border: 1px solid var(--border); border-radius: 20px; padding: 2.5rem; width: 100%; max-width: 420px; }
  .auth-logo { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.5rem; color: var(--ink); margin-bottom: 0.4rem; }
  .auth-logo span { color: var(--brand); }
  .auth-subtitle { color: var(--ink3); font-size: 0.88rem; margin-bottom: 2rem; }
  .form-group { margin-bottom: 1rem; }
  .form-group label { display: block; font-size: 0.82rem; font-weight: 600; color: var(--ink2); margin-bottom: 0.4rem; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.7rem 1rem; border: 1.5px solid var(--border); border-radius: var(--radius-sm); font-family: 'Poppins', sans-serif; font-size: 0.9rem; color: var(--ink); background: var(--surface); outline: none; transition: border-color 0.2s; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--brand); background: white; }
  .form-group textarea { resize: none; }
  .auth-switch { text-align: center; margin-top: 1.2rem; font-size: 0.85rem; color: var(--ink3); }
  .auth-switch a { color: var(--brand); text-decoration: none; font-weight: 600; cursor: pointer; }

  /* DASHBOARD */
  #screen-dashboard { background: var(--surface); min-height: 100vh; }
  .dash-nav { background: var(--white); border-bottom: 1px solid var(--border); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 60px; position: sticky; top: 0; z-index: 100; }
  .dash-logo { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.3rem; }
  .dash-logo span { color: var(--brand); }
  .dash-store-name { font-size: 0.85rem; color: var(--ink3); font-weight: 500; }
  .dash-tabs { display: flex; gap: 0.25rem; padding: 0 2rem; background: var(--white); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
  .dash-tabs::-webkit-scrollbar { display: none; }
  .tab-btn { padding: 0.75rem 1.25rem; font-family: 'Poppins', sans-serif; font-size: 0.88rem; font-weight: 500; color: var(--ink3); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
  .tab-btn.active { color: var(--brand); border-bottom-color: var(--brand); }
  .dash-content { max-width: 960px; margin: 0 auto; padding: 2rem; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
  .section-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.3rem; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* STATS */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
  .stat-card-label { font-size: 0.75rem; color: var(--ink3); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .stat-card-value { font-family: 'Poppins', sans-serif; font-size: 1.8rem; font-weight: 800; color: var(--ink); }
  .stat-card-value.green { color: var(--success); }
  .stat-card-value.orange { color: var(--brand); }

  /* MENU ADMIN CARDS */
  .menu-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  .menu-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: box-shadow 0.2s, transform 0.2s; }
  .menu-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(26,18,8,0.08); }
  .menu-card-img { width: 100%; height: 160px; background: var(--brand-light); display: flex; align-items: center; justify-content: center; font-size: 3rem; position: relative; overflow: hidden; }
  .menu-card-img img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
  .menu-card-img .emoji-fallback { font-size: 3.5rem; z-index: 1; }
  .menu-card-badge { position: absolute; top: 0.6rem; right: 0.6rem; background: var(--success-bg); color: var(--success); font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 100px; z-index: 2; }
  .menu-card-badge.unavail { background: #FEE; color: #C33; }
  .menu-card-body { padding: 1rem; }
  .menu-card-cat { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--brand); font-weight: 700; margin-bottom: 0.3rem; }
  .menu-card-name { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1rem; margin-bottom: 0.3rem; }
  .menu-card-desc { font-size: 0.82rem; color: var(--ink3); line-height: 1.5; margin-bottom: 0.8rem; }
  .menu-card-footer { display: flex; align-items: center; justify-content: space-between; }
  .menu-price { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.15rem; color: var(--brand); }
  .menu-actions { display: flex; gap: 0.4rem; }
  .icon-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; transition: background 0.15s; }
  .icon-btn:hover { background: var(--border); }
  .icon-btn.danger:hover { background: #FEE; border-color: #F99; }

  /* LINK BOX */
  .link-box { background: var(--brand-light); border: 1.5px solid rgba(232,65,10,0.2); border-radius: var(--radius); padding: 1rem 1.25rem; display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .link-url { flex: 1; font-size: 0.82rem; color: var(--brand-dark); font-weight: 600; word-break: break-all; }
  .copy-btn { flex-shrink: 0; padding: 0.5rem 1rem; background: var(--brand); color: white; border: none; border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif; transition: background 0.15s; }
  .copy-btn:hover { background: var(--brand-dark); }

  /* ORDERS */
  .orders-list { display: flex; flex-direction: column; gap: 1rem; }
  .order-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
  .order-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.8rem; }
  .order-id { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.95rem; }
  .order-time { font-size: 0.78rem; color: var(--ink3); }
  .status-badge { font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.7rem; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.04em; }
  .status-new { background: #FEF3E2; color: #B35E0A; }
  .status-preparing { background: #EEF2FF; color: #3730A3; }
  .status-ready { background: var(--success-bg); color: var(--success); }
  .status-done { background: #F0F0F0; color: #777; }

  /* CLIENT STATUS BANNER */
  .client-status-bar { display: none; margin: 1rem 1.5rem 0; border-radius: var(--radius); padding: 1rem 1.2rem; border: 1.5px solid var(--border); }
  .client-status-bar.visible { display: flex; align-items: center; gap: 0.8rem; }
  .status-bar-icon { font-size: 1.5rem; flex-shrink: 0; }
  .status-bar-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.92rem; }
  .status-bar-sub { font-size: 0.78rem; color: var(--ink3); margin-top: 0.1rem; }
  .status-bar-preparing { background: #EEF2FF; border-color: #C7D2FE; }
  .status-bar-ready { background: var(--success-bg); border-color: #A7F3D0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinning { display: inline-block; animation: spin 1.5s linear infinite; }

  /* NO FORNO upload buttons */
  .upload-capture-btn { background: var(--white); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 1.2rem 1rem; cursor: pointer; text-align: center; font-family: 'Poppins', sans-serif; color: var(--ink); transition: border-color 0.2s, background 0.2s; }
  .upload-capture-btn:hover { border-color: var(--brand); background: var(--brand-light); }

  /* Flash progress bar */
  .flash-prog-track { flex: 1; height: 3px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; }
  .flash-prog-fill { height: 100%; background: white; border-radius: 2px; width: 0%; transition: width 0.05s linear; }
  .order-items { font-size: 0.88rem; color: var(--ink2); margin-bottom: 0.8rem; line-height: 1.6; }
  .order-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.8rem; border-top: 1px solid var(--border); }
  .order-total { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.1rem; }
  .order-actions { display: flex; gap: 0.5rem; }

  /* SETTINGS */
  .settings-section { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1.5rem; }
  .settings-section h3 { font-family: 'Poppins', sans-serif; font-weight: 700; margin-bottom: 1.2rem; font-size: 1rem; }
  .color-row { display: flex; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .color-swatch { width: 36px; height: 36px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; transition: border-color 0.15s; }
  .color-swatch.selected { border-color: var(--ink); }

  /* ========== VITRINE (cliente) ========== */
  #screen-store { background: var(--surface); min-height: 100vh; max-width: 480px; margin: 0 auto; }
  .store-hero { background: var(--ink); color: white; padding: 2rem 1.5rem 1.5rem; position: relative; overflow: hidden; }
  .store-hero::before { content: ''; position: absolute; top: -40px; right: -40px; width: 180px; height: 180px; border-radius: 50%; background: rgba(232,65,10,0.15); }
  .store-emoji { font-size: 3rem; margin-bottom: 0.8rem; display: block; }
  .store-name { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.7rem; margin-bottom: 0.3rem; }
  .store-desc { font-size: 0.88rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem; }
  .store-info { display: flex; gap: 1rem; margin-top: 0.8rem; }
  .store-info-item { font-size: 0.78rem; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 0.3rem; }

  /* FLASH — seção de vídeos/promoções */
  .flash-section { padding: 1.2rem 1.5rem 0; }
  .flash-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--brand); font-weight: 700; margin-bottom: 0.7rem; display: flex; align-items: center; gap: 0.4rem; }
  .flash-label span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--brand); animation: blink 1.2s infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  .flash-row { display: flex; gap: 0.8rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: none; }
  .flash-row::-webkit-scrollbar { display: none; }
  .flash-card { flex-shrink: 0; width: 120px; border-radius: 12px; overflow: hidden; position: relative; cursor: pointer; background: var(--ink); border: 2px solid transparent; transition: border-color 0.2s; }
  .flash-card:hover { border-color: var(--brand); }
  .flash-card-thumb { width: 120px; height: 180px; object-fit: cover; display: block; }
  .flash-card-thumb-placeholder { width: 120px; height: 180px; background: linear-gradient(160deg, #2a1f18, #4a2c1a); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
  .flash-card-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%); display: flex; align-items: flex-end; padding: 0.6rem; }
  .flash-card-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.72rem; color: white; line-height: 1.3; }
  .flash-play-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-60%); width: 32px; height: 32px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; }
  .flash-duration { position: absolute; top: 0.4rem; right: 0.4rem; background: rgba(0,0,0,0.6); color: white; font-size: 0.65rem; font-weight: 600; padding: 0.15rem 0.4rem; border-radius: 4px; }

  .store-content { padding: 1.2rem 1.5rem; }
  .category-tabs { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.4rem; margin-bottom: 1.5rem; scrollbar-width: none; }
  .category-tabs::-webkit-scrollbar { display: none; }
  .cat-pill { padding: 0.4rem 0.9rem; border-radius: 100px; font-size: 0.82rem; font-weight: 600; white-space: nowrap; cursor: pointer; border: 1.5px solid var(--border); background: var(--white); color: var(--ink2); transition: all 0.15s; }
  .cat-pill.active { background: var(--brand); border-color: var(--brand); color: white; }

  /* ITEM CARDS DO CLIENTE */
  .client-menu-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .client-item { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: transform 0.15s, box-shadow 0.15s; }
  .client-item:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(26,18,8,0.07); }
  .client-item-inner { display: flex; gap: 0; align-items: stretch; }
  .client-item-media { width: 90px; min-height: 90px; background: var(--brand-light); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; position: relative; overflow: hidden; }
  .client-item-media img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
  .client-item-media .emoji-fallback { z-index: 1; font-size: 2.2rem; }
  .client-item-body { flex: 1; padding: 0.85rem 1rem; min-width: 0; }
  .client-item-name { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.92rem; margin-bottom: 0.2rem; }
  .client-item-desc { font-size: 0.76rem; color: var(--ink3); line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-bottom: 0.5rem; }
  .client-item-footer { display: flex; align-items: center; justify-content: space-between; }
  .client-item-price { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1rem; color: var(--brand); }
  .client-item-actions { display: flex; align-items: center; gap: 0.4rem; }
  .see-more-btn { font-size: 0.72rem; color: var(--ink3); font-weight: 600; background: var(--surface); border: 1px solid var(--border); border-radius: 100px; padding: 0.2rem 0.6rem; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
  .see-more-btn:hover { border-color: var(--brand); color: var(--brand); }
  .add-btn { width: 28px; height: 28px; border-radius: 50%; background: var(--brand); border: none; color: white; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
  .add-btn:hover { background: var(--brand-dark); }
  .add-btn:active { transform: scale(0.9); }

  /* CART FAB */
  .cart-fab { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); background: var(--ink); color: white; border: none; border-radius: 100px; padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; font-family: 'Poppins', sans-serif; font-size: 0.95rem; font-weight: 500; cursor: pointer; box-shadow: 0 8px 32px rgba(26,18,8,0.25); white-space: nowrap; z-index: 90; transition: transform 0.2s, opacity 0.2s; opacity: 0; pointer-events: none; }
  .cart-fab.visible { opacity: 1; pointer-events: all; }
  .cart-fab:hover { transform: translateX(-50%) scale(1.03); }
  .cart-count { background: var(--brand); border-radius: 100px; padding: 0.15rem 0.6rem; font-size: 0.8rem; font-weight: 700; }

  /* CHECKOUT */
  #screen-checkout { background: var(--surface); min-height: 100vh; max-width: 480px; margin: 0 auto; padding-bottom: 6rem; }
  .checkout-header { background: var(--white); border-bottom: 1px solid var(--border); padding: 1.2rem 1.5rem; display: flex; align-items: center; gap: 1rem; position: sticky; top: 0; z-index: 10; }
  .back-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }
  .checkout-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.1rem; }
  .checkout-content { padding: 1.5rem; }
  .cart-item-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
  .cart-item-emoji { font-size: 1.5rem; width: 40px; text-align: center; }
  .cart-item-name { flex: 1; font-size: 0.9rem; font-weight: 600; }
  .qty-ctrl { display: flex; align-items: center; gap: 0.5rem; }
  .qty-btn { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; }
  .qty-num { font-weight: 700; font-size: 0.9rem; min-width: 20px; text-align: center; }
  .cart-item-price { font-weight: 700; color: var(--brand); font-size: 0.9rem; }
  .section-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink3); font-weight: 700; margin: 1.5rem 0 0.8rem; }
  .pay-option { display: flex; align-items: center; gap: 0.8rem; padding: 0.85rem 1rem; border: 1.5px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; margin-bottom: 0.5rem; transition: border-color 0.15s; font-size: 0.9rem; }
  .pay-option.selected { border-color: var(--brand); background: var(--brand-light); }
  .pay-option input { accent-color: var(--brand); }
  .checkout-footer { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; background: var(--white); border-top: 1px solid var(--border); padding: 1rem 1.5rem; }
  .checkout-summary { display: flex; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.88rem; color: var(--ink2); }
  .checkout-total { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.1rem; }

  /* CONFIRMATION */
  #screen-confirm { background: var(--surface); min-height: 100vh; max-width: 480px; margin: 0 auto; padding-bottom: 2rem; }
  .confirm-hero { background: var(--ink); color: white; padding: 3rem 1.5rem 2rem; text-align: center; }
  .confirm-icon { font-size: 3.5rem; margin-bottom: 1rem; display: block; }
  .confirm-title { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.6rem; margin-bottom: 0.5rem; }
  .confirm-sub { font-size: 0.88rem; color: rgba(255,255,255,0.6); }

  /* RECEIPT */
  .receipt { background: var(--white); border-radius: 20px; padding: 1.5rem; margin: 1.5rem; border: 1px solid var(--border); }
  .receipt-logo { text-align: center; padding-bottom: 1rem; border-bottom: 1px dashed var(--border); margin-bottom: 1rem; }
  .receipt-logo span { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.3rem; }
  .receipt-logo span em { font-style: normal; color: var(--brand); }
  .receipt-row { display: flex; justify-content: space-between; align-items: flex-start; font-size: 0.88rem; padding: 0.4rem 0; gap: 1rem; }
  .receipt-label { color: var(--ink3); min-width: 80px; font-weight: 600; }
  .receipt-value { text-align: right; color: var(--ink); flex: 1; }
  .receipt-divider { border: none; border-top: 1px dashed var(--border); margin: 0.8rem 0; }
  .receipt-total { display: flex; justify-content: space-between; font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.1rem; padding-top: 0.5rem; }
  .receipt-footer { text-align: center; margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border); font-size: 0.78rem; color: var(--ink3); }

  /* MODAL */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(26,18,8,0.55); z-index: 200; display: flex; align-items: flex-end; padding: 0; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
  .modal-backdrop.open { opacity: 1; pointer-events: all; }
  .modal { background: var(--white); border-radius: 24px 24px 0 0; padding: 1.5rem; width: 100%; max-height: 92vh; overflow-y: auto; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.34,1.1,0.64,1); }
  .modal-backdrop.open .modal { transform: translateY(0); }
  .modal-handle { width: 40px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 1.2rem; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
  .modal-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 1.1rem; }
  .close-btn { width: 32px; height: 32px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; }

  /* MODAL PRODUTO CLIENTE */
  .product-modal-img { width: 100%; height: 220px; border-radius: var(--radius); object-fit: cover; background: var(--brand-light); display: flex; align-items: center; justify-content: center; font-size: 5rem; margin-bottom: 1rem; overflow: hidden; position: relative; }
  .product-modal-img img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
  .product-modal-img .emoji-fallback { z-index: 1; font-size: 5rem; }
  .product-modal-name { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.25rem; margin-bottom: 0.4rem; }
  .product-modal-cat { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--brand); font-weight: 700; margin-bottom: 0.6rem; }
  .product-modal-desc { font-size: 0.88rem; color: var(--ink2); line-height: 1.7; margin-bottom: 1rem; }
  .product-modal-price { font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1.5rem; color: var(--brand); margin-bottom: 1.2rem; }
  .product-modal-media { margin-bottom: 1.2rem; }
  .product-modal-media-label { font-size: 0.75rem; font-weight: 700; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.6rem; }
  .extra-media-row { display: flex; gap: 0.6rem; overflow-x: auto; padding-bottom: 0.4rem; scrollbar-width: none; }
  .extra-media-row::-webkit-scrollbar { display: none; }
  .extra-media-thumb { width: 80px; height: 80px; border-radius: var(--radius-sm); object-fit: cover; background: var(--surface); border: 1.5px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; overflow: hidden; cursor: pointer; }
  .extra-media-thumb img { width: 100%; height: 100%; object-fit: cover; }

  /* UPLOAD AREA */
  .upload-area { border: 2px dashed var(--border); border-radius: var(--radius-sm); padding: 1.5rem; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
  .upload-area:hover { border-color: var(--brand); background: var(--brand-light); }
  .upload-area input { display: none; }
  .upload-preview { width: 100%; height: 140px; object-fit: cover; border-radius: var(--radius-sm); margin-top: 0.8rem; display: none; }

  /* EMOJI PICKER */
  .emoji-picker { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.4rem; margin-top: 0.4rem; }
  .emoji-btn { padding: 0.5rem; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; font-size: 1.3rem; text-align: center; transition: border-color 0.15s; }
  .emoji-btn:hover, .emoji-btn.selected { border-color: var(--brand); background: var(--brand-light); }

  /* FLASH UPLOAD (painel) */
  .flash-admin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
  .flash-admin-card { background: var(--white); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .flash-admin-thumb { width: 100%; height: 100px; background: var(--brand-light); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; position: relative; overflow: hidden; }
  .flash-admin-thumb video, .flash-admin-thumb img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset:0; }
  .flash-admin-body { padding: 0.6rem; }
  .flash-admin-title { font-size: 0.78rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .flash-admin-time { font-size: 0.7rem; color: var(--ink3); }
  .flash-admin-del { float: right; background: none; border: none; font-size: 0.85rem; cursor: pointer; color: var(--ink3); }

  /* NOTIFICATION */
  .notif { position: fixed; top: 1rem; right: 1rem; background: var(--ink); color: white; border-radius: var(--radius); padding: 1rem 1.25rem; z-index: 300; max-width: 320px; transform: translateX(200%); transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1); box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
  .notif.show { transform: translateX(0); }
  .notif-title { font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 0.95rem; margin-bottom: 0.3rem; }
  .notif-body { font-size: 0.82rem; color: rgba(255,255,255,0.7); }
  .notif-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--brand); margin-right: 0.5rem; }

  .empty-state { text-align: center; padding: 3rem 1rem; color: var(--ink3); }
  .empty-state .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
  .empty-state p { font-size: 0.9rem; }

  @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
  .pulse { animation: pulse 2s infinite; }

  @media (min-width: 768px) {
    #screen-store, #screen-checkout, #screen-confirm {
      box-shadow: 0 0 0 1px var(--border), 0 32px 80px rgba(26,18,8,0.08);
      border-radius: 20px; margin-top: 2rem; margin-bottom: 2rem; min-height: auto;
    }
    .modal-backdrop { align-items: center; padding: 1rem; }
    .modal { border-radius: 24px; max-width: 480px; margin: 0 auto; }
  }
</style>
</head>
<body>

<div class="notif" id="notif">
  <div class="notif-title"><span class="notif-dot"></span>Novo pedido! 🎉</div>
  <div class="notif-body" id="notif-body">Um cliente acabou de fechar um pedido.</div>
</div>

<!-- LANDING -->
<div class="screen active" id="screen-landing">
  <header class="landing-header">
    <div class="logo">PEDI<span>WAY</span></div>
    <div style="display:flex;gap:0.75rem">
      <button class="btn btn-ghost" onclick="goTo('login')">Entrar</button>
      <button class="btn btn-primary" onclick="goTo('register')">Começar grátis</button>
    </div>
  </header>
  <div class="landing-hero">
    <span class="badge">🚀 Plataforma delivery independente</span>
    <h1>Seu cardápio.<br>Sua marca.<br><em>Seu lucro.</em></h1>
    <p>Crie sua loja em minutos, compartilhe o link com seus clientes e receba pedidos com notinha automática. Sem comissão por venda — só uma mensalidade justa.</p>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="goTo('register')" style="font-size:1rem;padding:1rem 2rem">Criar minha loja →</button>
      <button class="btn btn-ghost" onclick="demoStore()">Ver demo de cliente</button>
    </div>
    <div class="landing-stats">
      <div class="stat-item"><span class="stat-num">R$0</span><span class="stat-label">comissão por pedido</span></div>
      <div class="stat-item"><span class="stat-num">5min</span><span class="stat-label">para montar seu cardápio</span></div>
      <div class="stat-item"><span class="stat-num">100%</span><span class="stat-label">do lucro é seu</span></div>
    </div>
  </div>
</div>

<!-- LOGIN -->
<div class="screen" id="screen-login">
  <div class="auth-card">
    <div class="auth-logo">PEDI<span>WAY</span></div>
    <div class="auth-subtitle">Acesse o painel do seu estabelecimento</div>
    <div class="form-group"><label>E-mail</label><input type="email" id="login-email" value="demo@pediway.com.br"></div>
    <div class="form-group"><label>Senha</label><input type="password" id="login-pass" value="123456"></div>
    <button class="btn btn-brand btn-full" style="margin-top:0.5rem" onclick="doLogin()">Entrar no painel</button>
    <div class="auth-switch">Não tem conta? <a onclick="goTo('register')">Cadastre-se grátis</a></div>
    <div class="auth-switch" style="margin-top:0.5rem"><a onclick="demoStore()" style="color:var(--ink3)">Ver demo do cliente →</a></div>
  </div>
</div>

<!-- REGISTER -->
<div class="screen" id="screen-register">
  <div class="auth-card" style="max-width:480px">
    <div class="auth-logo">PEDI<span>WAY</span></div>
    <div class="auth-subtitle">Cadastre seu estabelecimento</div>
    <div class="form-group"><label>Nome do estabelecimento</label><input type="text" placeholder="Ex: Burguer do Zé" id="reg-name"></div>
    <div class="form-group"><label>Descrição</label><input type="text" placeholder="Ex: Os melhores burguers da cidade!"></div>
    <div class="form-group"><label>E-mail</label><input type="email" placeholder="seu@email.com"></div>
    <div class="form-group"><label>Senha</label><input type="password" placeholder="Mínimo 6 caracteres"></div>
    <button class="btn btn-brand btn-full" style="margin-top:0.5rem" onclick="doRegister()">Criar minha loja →</button>
    <div class="auth-switch">Já tem conta? <a onclick="goTo('login')">Entrar</a></div>
  </div>
</div>

<!-- DASHBOARD -->
<div class="screen" id="screen-dashboard">
  <nav class="dash-nav">
    <div class="dash-logo">PEDI<span>WAY</span></div>
    <div style="display:flex;align-items:center;gap:1rem">
      <span class="dash-store-name" id="dash-store-name">Burguer do Zé</span>
      <button class="btn btn-ghost" style="color:var(--ink);border-color:var(--border);padding:0.4rem 0.9rem;font-size:0.82rem" onclick="goTo('landing')">Sair</button>
    </div>
  </nav>
  <div class="dash-tabs">
    <button class="tab-btn active" onclick="switchTab('overview')">Visão geral</button>
    <button class="tab-btn" onclick="switchTab('menu')">Cardápio</button>
    <button class="tab-btn" onclick="switchTab('flash')">🔥 No Forno</button>
    <button class="tab-btn" onclick="switchTab('orders')">Pedidos</button>
    <button class="tab-btn" onclick="switchTab('settings')">Configurações</button>
  </div>
  <div class="dash-content">

    <!-- OVERVIEW -->
    <div class="tab-panel active" id="tab-overview">
      <div class="link-box">
        <div>
          <div style="font-size:0.72rem;color:var(--brand);font-weight:700;margin-bottom:0.2rem;text-transform:uppercase;letter-spacing:0.05em">Seu link do cliente</div>
          <div class="link-url" id="store-link">pediway.com.br/burguer-do-ze</div>
        </div>
        <button class="copy-btn" onclick="copyLink()">Copiar</button>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-label">Hoje</div><div class="stat-card-value orange" id="stat-today">3</div><div style="font-size:0.78rem;color:var(--ink3);margin-top:0.3rem">pedidos recebidos</div></div>
        <div class="stat-card"><div class="stat-card-label">Faturamento hoje</div><div class="stat-card-value green" id="stat-revenue">R$ 187,00</div></div>
        <div class="stat-card"><div class="stat-card-label">Itens no cardápio</div><div class="stat-card-value" id="stat-items">6</div></div>
        <div class="stat-card"><div class="stat-card-label">Plano ativo</div><div class="stat-card-value" style="font-size:1.2rem">Básico</div><div style="font-size:0.78rem;color:var(--success);margin-top:0.3rem">✓ Ativo</div></div>
      </div>
      <div class="section-header">
        <span class="section-title">Últimos pedidos</span>
        <button class="btn" style="border:1px solid var(--border);color:var(--ink2);font-size:0.82rem;padding:0.4rem 0.9rem" onclick="switchTab('orders')">Ver todos</button>
      </div>
      <div id="overview-orders"></div>
    </div>

    <!-- CARDÁPIO -->
    <div class="tab-panel" id="tab-menu">
      <div class="section-header">
        <span class="section-title">Seu cardápio</span>
        <button class="btn btn-brand" onclick="openAddItem()">+ Adicionar item</button>
      </div>
      <div class="menu-grid" id="menu-grid"></div>
    </div>

    <!-- DESTAQUES (Flash) -->
    <div class="tab-panel" id="tab-flash">
      <div class="section-header">
        <span class="section-title">🔥 No Forno</span>
      </div>
      <div style="background:var(--brand-light);border:1.5px solid rgba(232,65,10,0.2);border-radius:var(--radius);padding:1rem 1.25rem;margin-bottom:1.5rem;">
        <div style="font-size:0.88rem;font-weight:600;margin-bottom:0.3rem;">O que é o No Forno?</div>
        <div style="font-size:0.82rem;color:var(--ink2);line-height:1.6;">Grave ou suba vídeos da sua cozinha, promoções quentinhas e novidades do dia. Ficam visíveis por <strong>4 horas</strong> e somem sozinhos — como se fosse ao vivo! 🔥</div>
      </div>
      <div class="flash-admin-grid" id="flash-admin-grid"></div>
      <!-- BOTÕES DE CAPTURA -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.5rem">
        <button class="upload-capture-btn" onclick="openCamera()">
          <span style="font-size:2rem;display:block;margin-bottom:0.5rem">📷</span>
          <div style="font-weight:700;font-size:0.88rem">Gravar agora</div>
          <div style="font-size:0.75rem;color:var(--ink3);margin-top:0.2rem">Abre a câmera</div>
        </button>
        <button class="upload-capture-btn" onclick="document.getElementById('flash-upload').click()">
          <span style="font-size:2rem;display:block;margin-bottom:0.5rem">🎞</span>
          <div style="font-weight:700;font-size:0.88rem">Enviar arquivo</div>
          <div style="font-size:0.75rem;color:var(--ink3);margin-top:0.2rem">Vídeo ou foto</div>
        </button>
      </div>
      <input type="file" id="flash-upload" accept="video/*,image/*" capture="environment" onchange="addFlash(this)" style="display:none">
      <input type="file" id="flash-camera" accept="video/*" capture="environment" onchange="addFlash(this)" style="display:none">
    </div>

    <!-- PEDIDOS -->
    <div class="tab-panel" id="tab-orders">
      <div class="section-header">
        <span class="section-title">Pedidos</span>
        <span style="font-size:0.82rem;color:var(--ink3)" id="orders-count"></span>
      </div>
      <div class="orders-list" id="orders-list"></div>
    </div>

    <!-- CONFIGURAÇÕES -->
    <div class="tab-panel" id="tab-settings">
      <div class="section-header"><span class="section-title">Configurações</span></div>
      <div class="settings-section">
        <h3>Informações básicas</h3>
        <div class="form-group"><label>Nome da loja</label><input type="text" value="Burguer do Zé" id="s-name"></div>
        <div class="form-group"><label>Descrição</label><input type="text" value="Os melhores burguers da cidade!" id="s-desc"></div>
        <div class="form-group"><label>Mensagem de boas-vindas</label><textarea rows="2" id="s-welcome">Seja bem-vindo! Escolha seu lanche com carinho 🍔</textarea></div>
        <div class="form-group"><label>WhatsApp (com DDI e DDD, ex: 5511999999999)</label><input type="text" id="s-whatsapp" value="5511999999999"></div>
        <button class="btn btn-brand" onclick="saveSettings()">Salvar alterações</button>
      </div>
      <div class="settings-section">
        <h3>Aparência</h3>
        <div class="form-group">
          <label>Cor principal</label>
          <div class="color-row">
            <div class="color-swatch selected" style="background:#E8410A" onclick="selectColor('#E8410A',this)"></div>
            <div class="color-swatch" style="background:#1A8A5A" onclick="selectColor('#1A8A5A',this)"></div>
            <div class="color-swatch" style="background:#2563EB" onclick="selectColor('#2563EB',this)"></div>
            <div class="color-swatch" style="background:#7C3AED" onclick="selectColor('#7C3AED',this)"></div>
            <div class="color-swatch" style="background:#DB2777" onclick="selectColor('#DB2777',this)"></div>
            <div class="color-swatch" style="background:#1A1208" onclick="selectColor('#1A1208',this)"></div>
          </div>
        </div>
        <div class="form-group" style="margin-top:1rem">
          <label>Emoji da loja</label>
          <div class="emoji-picker" id="store-emoji-picker"></div>
        </div>
      </div>
      <div class="settings-section">
        <h3>Pagamentos aceitos</h3>
        <div style="display:flex;flex-direction:column;gap:0.6rem">
          <label style="display:flex;align-items:center;gap:0.6rem;font-size:0.9rem;cursor:pointer"><input type="checkbox" checked> Pix</label>
          <label style="display:flex;align-items:center;gap:0.6rem;font-size:0.9rem;cursor:pointer"><input type="checkbox" checked> Dinheiro</label>
          <label style="display:flex;align-items:center;gap:0.6rem;font-size:0.9rem;cursor:pointer"><input type="checkbox" checked> Cartão (crédito/débito)</label>
          <label style="display:flex;align-items:center;gap:0.6rem;font-size:0.9rem;cursor:pointer"><input type="checkbox"> Vale Refeição</label>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- VITRINE CLIENTE -->
<div class="screen" id="screen-store">
  <div class="store-hero">
    <span class="store-emoji" id="store-emoji-display">🍔</span>
    <div class="store-name" id="store-name-display">Burguer do Zé</div>
    <div class="store-desc" id="store-desc-display">Os melhores burguers da cidade!</div>
    <div class="store-info">
      <span class="store-info-item">⏱ 30-45 min</span>
      <span class="store-info-item">⭐ 4.8</span>
      <span class="store-info-item">📍 Entrega disponível</span>
    </div>
  </div>

  <!-- DESTAQUES NA VITRINE -->
  <div class="flash-section" id="flash-client-section" style="display:none">
    <div class="flash-label"><span></span>No Forno de hoje</div>
    <div class="flash-row" id="flash-client-row"></div>
  </div>

  <div class="store-content">
    <div class="category-tabs" id="category-tabs"></div>
    <div class="client-menu-list" id="client-menu-list"></div>
  </div>
  <button class="cart-fab" id="cart-fab" onclick="goTo('checkout')">
    <span id="cart-count-badge" class="cart-count">0</span>
    Ver carrinho
    <span id="cart-total-badge" style="margin-left:auto;font-family:'Poppins',sans-serif;font-weight:800">R$ 0,00</span>
  </button>
</div>

<!-- CHECKOUT -->
<div class="screen" id="screen-checkout">
  <div class="checkout-header">
    <button class="back-btn" onclick="goTo('store')">←</button>
    <span class="checkout-title">Finalizar pedido</span>
  </div>
  <div class="checkout-content">
    <div class="section-label">Seu pedido</div>
    <div id="cart-items-list"></div>
    <div class="section-label">Entrega</div>
    <div class="form-group"><label>Seu nome</label><input type="text" placeholder="Ex: Maria Silva" id="client-name"></div>
    <div class="form-group"><label>Endereço completo</label><input type="text" placeholder="Rua, número, bairro" id="client-address"></div>
    <div class="form-group"><label>Complemento (opcional)</label><input type="text" placeholder="Apto, bloco..."></div>
    <div class="section-label">Pagamento</div>
    <div id="payment-options">
      <label class="pay-option selected" onclick="selectPayment(this,'Pix')"><input type="radio" name="pay" checked> 💚 Pix</label>
      <label class="pay-option" onclick="selectPayment(this,'Dinheiro')"><input type="radio" name="pay"> 💵 Dinheiro</label>
      <label class="pay-option" onclick="selectPayment(this,'Cartão')"><input type="radio" name="pay"> 💳 Cartão</label>
    </div>
    <div class="form-group" style="margin-top:1rem"><label>Observações</label><textarea rows="2" placeholder="Algum pedido especial? Ex: sem cebola..."></textarea></div>
  </div>
  <div class="checkout-footer">
    <div class="checkout-summary"><span>Total do pedido</span><span class="checkout-total" id="checkout-total-display">R$ 0,00</span></div>
    <button class="btn btn-brand btn-full" style="font-size:1rem;padding:1rem" onclick="placeOrder()">Confirmar pedido 🎉</button>
  </div>
</div>

<!-- CONFIRMAÇÃO -->
<div class="screen" id="screen-confirm">
  <div class="confirm-hero">
    <span class="confirm-icon pulse">🎉</span>
    <div class="confirm-title">Pedido feito!</div>
    <div class="confirm-sub">Aguarde, estamos preparando com carinho</div>
  </div>
  <div id="client-status-bar" class="client-status-bar"></div>
  <div class="receipt" id="receipt-content"></div>
  <div style="padding:0 1.5rem;display:flex;flex-direction:column;gap:0.75rem;margin-bottom:2rem">
    <button class="btn btn-full" style="background:#25D366;color:white;padding:1rem;font-size:0.95rem;font-weight:700;border:none" onclick="openWhatsApp()">💬 Falar com o estabelecimento</button>
    <button class="btn btn-full" style="border:1px solid var(--border);padding:1rem;font-size:0.95rem;color:var(--ink2)" onclick="goTo('store')">← Voltar ao cardápio</button>
  </div>
</div>

<!-- MODAL ADICIONAR ITEM (painel) -->
<div class="modal-backdrop" id="modal-add">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title" id="modal-title">Adicionar item</span>
      <button class="close-btn" onclick="closeModal()">×</button>
    </div>
    <div class="form-group">
      <label>Foto do produto</label>
      <div class="upload-area" onclick="document.getElementById('item-photo-input').click()">
        <input type="file" id="item-photo-input" accept="image/*" onchange="previewItemPhoto(this)">
        <div id="upload-placeholder"><div style="font-size:1.8rem;margin-bottom:0.4rem">📸</div><div style="font-size:0.85rem;font-weight:600">Clique para adicionar foto</div><div style="font-size:0.75rem;color:var(--ink3);margin-top:0.2rem">JPG, PNG · Opcional</div></div>
        <img id="item-photo-preview" class="upload-preview" alt="preview">
      </div>
    </div>
    <div class="form-group">
      <label>Emoji (caso sem foto)</label>
      <div class="emoji-picker" id="item-emoji-picker"></div>
    </div>
    <div class="form-group"><label>Nome do item *</label><input type="text" id="item-name" placeholder="Ex: X-Burguer Especial"></div>
    <div class="form-group"><label>Descrição</label><textarea id="item-desc" rows="2" placeholder="Ex: Pão brioche, carne 180g, queijo, alface..."></textarea></div>
    <div class="form-group"><label>Categoria</label><input type="text" id="item-cat" placeholder="Ex: Lanches, Bebidas, Sobremesas"></div>
    <div class="form-group"><label>Preço (R$) *</label><input type="number" id="item-price" placeholder="0,00" step="0.01" min="0"></div>
    <div style="display:flex;gap:0.75rem;margin-top:0.5rem;padding-bottom:1rem">
      <button class="btn" style="flex:1;border:1px solid var(--border);color:var(--ink2)" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-brand" style="flex:1" onclick="saveItem()">Salvar item</button>
    </div>
  </div>
</div>

<!-- MODAL PRODUTO CLIENTE (ver mais) -->
<div class="modal-backdrop" id="modal-product">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title" id="pm-cat"></span>
      <button class="close-btn" onclick="closeProductModal()">×</button>
    </div>
    <div class="product-modal-img" id="pm-img">
      <div class="emoji-fallback" id="pm-emoji">🍔</div>
    </div>
    <div class="product-modal-name" id="pm-name">Nome do produto</div>
    <div class="product-modal-desc" id="pm-desc">Descrição do produto aparece aqui.</div>
    <div class="product-modal-price" id="pm-price">R$ 0,00</div>
    <div style="display:flex;gap:0.75rem;padding-bottom:1rem">
      <button class="btn" style="flex:1;border:1px solid var(--border);padding:1rem;font-size:0.95rem;color:var(--ink2)" onclick="closeProductModal()">Fechar</button>
      <button class="btn btn-brand" style="flex:2;padding:1rem;font-size:0.95rem" id="pm-add-btn">+ Adicionar ao carrinho</button>
    </div>
  </div>
</div>

<!-- MODAL NOTINHA (painel) -->
<div class="modal-backdrop" id="modal-receipt">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">Notinha do pedido</span>
      <button class="close-btn" onclick="closeReceiptModal()">×</button>
    </div>
    <div id="modal-receipt-content"></div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem;padding-bottom:1rem">
      <button class="btn" style="flex:1;border:1px solid var(--border)" onclick="closeReceiptModal()">Fechar</button>
      <button class="btn btn-brand" style="flex:1" onclick="window.print()">🖨 Imprimir</button>
    </div>
  </div>
</div>

<!-- MODAL FLASH PLAYER — FULLSCREEN ROLLER -->
<div id="modal-flash" style="display:none;position:fixed;inset:0;z-index:400;background:#000;touch-action:pan-y;">
  <!-- top bar -->
  <div style="position:absolute;top:0;left:0;right:0;z-index:10;padding:1rem 1.2rem 0;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-family:'Poppins',sans-serif;font-weight:800;font-size:1rem;color:white;">🔥 No Forno</div>
    <button onclick="closeFlashModal()" style="background:rgba(255,255,255,0.15);border:none;color:white;width:36px;height:36px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
  </div>
  <!-- progress bars -->
  <div id="flash-progress-bars" style="position:absolute;top:3.5rem;left:1rem;right:1rem;z-index:10;display:flex;gap:4px;"></div>
  <!-- slides container -->
  <div id="flash-slides" style="width:100%;height:100%;position:relative;overflow:hidden;"></div>
  <!-- bottom info -->
  <div style="position:absolute;bottom:0;left:0;right:0;z-index:10;padding:1.5rem 1.2rem 2rem;background:linear-gradient(to top,rgba(0,0,0,0.7),transparent);">
    <div id="flash-slide-title" style="font-family:'Poppins',sans-serif;font-weight:700;font-size:1rem;color:white;margin-bottom:0.25rem;"></div>
    <div style="font-size:0.78rem;color:rgba(255,255,255,0.55);">⏱ Expira em 4 horas</div>
  </div>
  <!-- tap zones -->
  <div onclick="flashPrev()" style="position:absolute;left:0;top:0;width:35%;height:100%;z-index:5;cursor:pointer;"></div>
  <div onclick="flashNext()" style="position:absolute;right:0;top:0;width:35%;height:100%;z-index:5;cursor:pointer;"></div>
</div>

<script>
let currentScreen = 'landing';
let selectedPayment = 'Pix';
let editingIndex = null;
let selectedItemEmoji = '🍔';
let selectedItemPhoto = null;
let cart = [];
let orderCounter = 1000;
let flashItems = [
  { id:1, type:'image', emoji:'🔥', title:'Promoção de hoje! 2x1 no X-Burguer', url:null },
  { id:2, type:'image', emoji:'🎉', title:'Novo! Sundae de Nutella chegou', url:null },
];

let store = {
  name: 'Burguer do Zé',
  desc: 'Os melhores burguers da cidade!',
  emoji: '🍔',
  color: '#E8410A',
  link: 'pediway.com.br/burguer-do-ze',
  welcome: 'Seja bem-vindo! Escolha seu lanche com carinho 🍔',
  whatsapp: '5511999999999'
};

let menuItems = [
  { id:1, emoji:'🍔', photo:null, name:'X-Burguer Especial', desc:'Pão brioche, carne 180g, queijo cheddar, alface, tomate e molho especial da casa. Uma explosão de sabor em cada mordida.', cat:'Lanches', price:28.90, available:true },
  { id:2, emoji:'🍔', photo:null, name:'X-Bacon Duplo', desc:'Duplo de carne artesanal, bacon crocante, queijo prato, picles e molho barbecue defumado. Para quem não tem medo de exagerar.', cat:'Lanches', price:36.90, available:true },
  { id:3, emoji:'🍟', photo:null, name:'Batata Frita Grande', desc:'Porção generosa de batata frita crocante com sal grosso. Acompanha nosso molho especial da casa.', cat:'Acompanhamentos', price:14.90, available:true },
  { id:4, emoji:'🥤', photo:null, name:'Refrigerante 350ml', desc:'Coca-Cola, Guaraná Antarctica ou Fanta Laranja gelada.', cat:'Bebidas', price:7.90, available:true },
  { id:5, emoji:'🧃', photo:null, name:'Suco Natural', desc:'Laranja, maracujá ou limão, feito na hora com fruta fresca. Sem conservantes.', cat:'Bebidas', price:12.90, available:true },
  { id:6, emoji:'🧁', photo:null, name:'Sundae de Chocolate', desc:'Sorvete cremoso de baunilha com calda quente de chocolate belga e granulado.', cat:'Sobremesas', price:11.90, available:true },
];

let orders = [
  { id:'#1003', client:'Ana Silva', address:'Rua das Flores, 123', items:[{name:'X-Burguer Especial',qty:2,price:28.90},{name:'Refrigerante 350ml',qty:2,price:7.90}], payment:'Pix', total:73.60, status:'new', time:'há 5 min' },
  { id:'#1002', client:'Carlos Souza', address:'Av. Central, 456', items:[{name:'X-Bacon Duplo',qty:1,price:36.90},{name:'Batata Frita Grande',qty:1,price:14.90}], payment:'Cartão', total:51.80, status:'preparing', time:'há 18 min' },
  { id:'#1001', client:'Fernanda Lima', address:'Rua do Bosque, 78', items:[{name:'X-Burguer Especial',qty:1,price:28.90},{name:'Suco Natural',qty:1,price:12.90},{name:'Sundae de Chocolate',qty:1,price:11.90}], payment:'Dinheiro', total:53.70, status:'done', time:'há 1h' },
];

// NAV
function goTo(s) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-'+s).classList.add('active');
  currentScreen = s;
  if(s==='dashboard') renderDashboard();
  if(s==='store') renderStore();
  if(s==='checkout') renderCheckout();
  window.scrollTo(0,0);
}
function doLogin() { goTo('dashboard'); }
function doRegister() {
  const name = document.getElementById('reg-name').value || 'Minha Loja';
  store.name = name;
  store.link = 'pediway.com.br/' + name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  goTo('dashboard');
}
function demoStore() { goTo('store'); }

// DASHBOARD
function renderDashboard() {
  document.getElementById('dash-store-name').textContent = store.name;
  document.getElementById('store-link').textContent = store.link;
  document.getElementById('stat-items').textContent = menuItems.filter(i=>i.available).length;
  renderMenuGrid();
  renderOrdersList();
  renderOverviewOrders();
  renderFlashAdmin();
}

function switchTab(tab) {
  const tabs = ['overview','menu','flash','orders','settings'];
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', tabs[i]===tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
}

// MENU GRID ADMIN
function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  if(!menuItems.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🍽️</div><p>Nenhum item ainda. Adicione o primeiro!</p></div>'; return; }
  grid.innerHTML = menuItems.map((item,i) => `
    <div class="menu-card">
      <div class="menu-card-img">
        ${item.photo ? `<img src="${item.photo}" alt="${item.name}">` : ''}
        <span class="emoji-fallback" style="${item.photo?'opacity:0':''}">  ${item.emoji}</span>
        <span class="menu-card-badge ${item.available?'':'unavail'}">${item.available?'Disponível':'Pausado'}</span>
      </div>
      <div class="menu-card-body">
        <div class="menu-card-cat">${item.cat}</div>
        <div class="menu-card-name">${item.name}</div>
        <div class="menu-card-desc">${item.desc}</div>
        <div class="menu-card-footer">
          <div class="menu-price">R$ ${item.price.toFixed(2).replace('.',',')}</div>
          <div class="menu-actions">
            <button class="icon-btn" onclick="toggleAvail(${i})" title="${item.available?'Pausar':'Ativar'}">${item.available?'👁':'🚫'}</button>
            <button class="icon-btn" onclick="editItem(${i})">✏️</button>
            <button class="icon-btn danger" onclick="deleteItem(${i})">🗑</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleAvail(i) { menuItems[i].available = !menuItems[i].available; renderMenuGrid(); }
function deleteItem(i) { if(confirm('Remover este item?')) { menuItems.splice(i,1); renderMenuGrid(); } }

// ITEM MODAL
let emojis = ['🍔','🍕','🌮','🌯','🍜','🍣','🍗','🥩','🧆','🥗','🍰','🧁','🍦','🥤','🧃','☕','🍟','🥪','🫕','🥘'];

function openAddItem() {
  editingIndex = null;
  selectedItemPhoto = null;
  document.getElementById('modal-title').textContent = 'Adicionar item';
  document.getElementById('item-name').value = '';
  document.getElementById('item-desc').value = '';
  document.getElementById('item-cat').value = '';
  document.getElementById('item-price').value = '';
  document.getElementById('item-photo-preview').style.display = 'none';
  document.getElementById('upload-placeholder').style.display = 'block';
  selectedItemEmoji = '🍔';
  buildEmojiPicker();
  document.getElementById('modal-add').classList.add('open');
}

function editItem(i) {
  editingIndex = i;
  const item = menuItems[i];
  selectedItemPhoto = item.photo;
  document.getElementById('modal-title').textContent = 'Editar item';
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-desc').value = item.desc;
  document.getElementById('item-cat').value = item.cat;
  document.getElementById('item-price').value = item.price;
  if(item.photo) {
    document.getElementById('item-photo-preview').src = item.photo;
    document.getElementById('item-photo-preview').style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';
  } else {
    document.getElementById('item-photo-preview').style.display = 'none';
    document.getElementById('upload-placeholder').style.display = 'block';
  }
  selectedItemEmoji = item.emoji;
  buildEmojiPicker();
  document.getElementById('modal-add').classList.add('open');
}

function buildEmojiPicker() {
  const picker = document.getElementById('item-emoji-picker');
  picker.innerHTML = emojis.map(e => `<button class="emoji-btn ${e===selectedItemEmoji?'selected':''}" onclick="selectEmoji('${e}',this)">${e}</button>`).join('');
}

function selectEmoji(e, btn) {
  document.querySelectorAll('#item-emoji-picker .emoji-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedItemEmoji = e;
}

function previewItemPhoto(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    selectedItemPhoto = e.target.result;
    document.getElementById('item-photo-preview').src = e.target.result;
    document.getElementById('item-photo-preview').style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function saveItem() {
  const name = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  if(!name || !price) { alert('Preencha nome e preço'); return; }
  const item = { id: Date.now(), emoji: selectedItemEmoji, photo: selectedItemPhoto, name, desc: document.getElementById('item-desc').value, cat: document.getElementById('item-cat').value || 'Geral', price, available: true };
  if(editingIndex !== null) menuItems[editingIndex] = item;
  else menuItems.push(item);
  closeModal();
  renderMenuGrid();
}

function closeModal() { document.getElementById('modal-add').classList.remove('open'); }

// FLASH ADMIN
function renderFlashAdmin() {
  const grid = document.getElementById('flash-admin-grid');
  if(!flashItems.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = flashItems.map((f,i) => `
    <div class="flash-admin-card">
      <div class="flash-admin-thumb">
        ${f.url ? (f.type==='video' ? `<video src="${f.url}" muted></video>` : `<img src="${f.url}">`) : `<span>${f.emoji}</span>`}
      </div>
      <div class="flash-admin-body">
        <button class="flash-admin-del" onclick="deleteFlash(${i})">🗑</button>
        <div class="flash-admin-title">${f.title}</div>
        <div class="flash-admin-time">⏱ 4h restantes</div>
      </div>
    </div>
  `).join('');
}

function addFlash(input) {
  const file = input.files[0];
  if(!file) return;
  const isVideo = file.type.startsWith('video');
  const reader = new FileReader();
  reader.onload = e => {
    flashItems.push({ id: Date.now(), type: isVideo?'video':'image', emoji:'✨', title: file.name.replace(/\.[^.]+$/,''), url: e.target.result });
    renderFlashAdmin();
  };
  reader.readAsDataURL(file);
}

function deleteFlash(i) { flashItems.splice(i,1); renderFlashAdmin(); }

// ORDERS
function statusLabel(s) {
  return s==='new'?'Novo':s==='preparing'?'Preparando':s==='ready'?'Pronto':'Entregue';
}

function renderOrdersList() {
  const list = document.getElementById('orders-list');
  document.getElementById('orders-count').textContent = orders.length + ' pedido(s)';
  list.innerHTML = orders.map((o,i) => `
    <div class="order-card">
      <div class="order-header">
        <div><div class="order-id">${o.id} — ${o.client}</div><div class="order-time">${o.time} · ${o.address}</div></div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="order-items">${o.items.map(it=>`${it.qty}x ${it.name}`).join(' • ')}</div>
      <div class="order-footer">
        <div class="order-total">R$ ${o.total.toFixed(2).replace('.',',')}</div>
        <div class="order-actions">
          <button class="btn" style="border:1px solid var(--border);color:var(--ink2);font-size:0.78rem;padding:0.4rem 0.8rem" onclick="viewReceipt(${i})">📄 Notinha</button>
          ${o.status==='new'?`<button class="btn" style="background:#EEF2FF;color:#3730A3;border:none;font-size:0.78rem;padding:0.4rem 0.8rem;font-weight:700" onclick="markPreparing(${i})">🍳 Preparando</button>`:''}
          ${o.status==='preparing'?`<button class="btn btn-brand" style="font-size:0.78rem;padding:0.4rem 0.8rem" onclick="markReady(${i})">✅ Marcar pronto</button>`:''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderOverviewOrders() {
  const el = document.getElementById('overview-orders');
  const recent = orders.slice(0,2);
  if(!recent.length) { el.innerHTML = '<div class="empty-state"><p>Nenhum pedido ainda hoje</p></div>'; return; }
  el.innerHTML = recent.map((o,i) => `
    <div class="order-card" style="margin-bottom:1rem">
      <div class="order-header">
        <div><div class="order-id">${o.id} — ${o.client}</div><div class="order-time">${o.time}</div></div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="order-items">${o.items.map(it=>`${it.qty}x ${it.name}`).join(' • ')}</div>
      <div style="padding-top:0.6rem;border-top:1px solid var(--border);margin-top:0.5rem;font-family:'Poppins',sans-serif;font-weight:700">R$ ${o.total.toFixed(2).replace('.',',')}</div>
    </div>
  `).join('');
}

function markPreparing(i) {
  orders[i].status = 'preparing';
  renderOrdersList();
  renderOverviewOrders();
  // Simula notificação para o cliente
  showClientStatusNotif('preparing', orders[i].client);
}

function markReady(i) {
  orders[i].status = 'ready';
  renderOrdersList();
  renderOverviewOrders();
  showClientStatusNotif('ready', orders[i].client);
}

function viewReceipt(i) {
  document.getElementById('modal-receipt-content').innerHTML = buildReceiptHTML(orders[i]);
  document.getElementById('modal-receipt').classList.add('open');
}
function buildReceiptHTML(o) {
  const itemsHTML = o.items.map(it=>`<div class="receipt-row"><span class="receipt-label">${it.qty}x ${it.name}</span><span class="receipt-value">R$ ${(it.qty*it.price).toFixed(2).replace('.',',')}</span></div>`).join('');
  return `<div class="receipt"><div class="receipt-logo"><span>PEDI<em>WAY</em></span><div style="font-size:0.78rem;color:var(--ink3);margin-top:0.3rem">${store.name}</div></div><div class="receipt-row"><span class="receipt-label">Nome</span><span class="receipt-value" style="font-weight:700">${o.client}</span></div><div class="receipt-row"><span class="receipt-label">Endereço</span><span class="receipt-value">${o.address}</span></div><hr class="receipt-divider"><div style="font-size:0.75rem;color:var(--ink3);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:700">Pedido</div>${itemsHTML}<hr class="receipt-divider"><div class="receipt-total"><span>Total</span><span style="color:var(--brand)">R$ ${o.total.toFixed(2).replace('.',',')}</span></div><div class="receipt-row" style="margin-top:0.4rem"><span class="receipt-label">Pagamento</span><span class="receipt-value">${o.payment}</span></div><div class="receipt-footer">Pedido ${o.id} · ${new Date().toLocaleDateString('pt-BR')}<br>Obrigado pela preferência! 💛</div></div>`;
}
function closeReceiptModal() { document.getElementById('modal-receipt').classList.remove('open'); }

// SETTINGS
function saveSettings() {
  store.name = document.getElementById('s-name').value;
  store.desc = document.getElementById('s-desc').value;
  store.welcome = document.getElementById('s-welcome').value;
  store.whatsapp = document.getElementById('s-whatsapp').value.replace(/\D/g,'');
  showNotif('Salvo!', '', true);
}
function selectColor(color, el) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  store.color = color;
  document.documentElement.style.setProperty('--brand', color);
  const dark = color === '#E8410A' ? '#B83208' : color;
  document.documentElement.style.setProperty('--brand-dark', dark);
}

// STORE (cliente)
function renderStore() {
  document.getElementById('store-name-display').textContent = store.name;
  document.getElementById('store-desc-display').textContent = store.desc;
  document.getElementById('store-emoji-display').textContent = store.emoji;
  renderFlashClient();
  const avail = menuItems.filter(i=>i.available);
  const cats = ['Todos', ...new Set(avail.map(i=>i.cat))];
  document.getElementById('category-tabs').innerHTML = cats.map((c,i) => `<button class="cat-pill ${i===0?'active':''}" onclick="filterCat('${c}',this)">${c}</button>`).join('');
  renderClientMenu('Todos');
  updateCartUI();
}

function renderFlashClient() {
  const section = document.getElementById('flash-client-section');
  const row = document.getElementById('flash-client-row');
  if(!flashItems.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  row.innerHTML = flashItems.map((f,i) => `
    <div class="flash-card" onclick="openFlashPlayer(${i})">
      ${f.url ? (f.type==='video' ? `<video src="${f.url}" class="flash-card-thumb" muted playsinline></video>` : `<img src="${f.url}" class="flash-card-thumb">`) : `<div class="flash-card-thumb-placeholder">${f.emoji}</div>`}
      <div class="flash-play-icon">▶</div>
      <div class="flash-duration">4h</div>
      <div class="flash-card-overlay"><div class="flash-card-title">${f.title}</div></div>
    </div>
  `).join('');
}

// ── NO FORNO ROLLER ────────────────────────────────────────────────────────
let flashCurrentIdx = 0;
let flashTimer = null;
const FLASH_DURATION = 5000; // ms per slide

function openCamera() {
  document.getElementById('flash-camera').click();
}

function openFlashPlayer(startIdx) {
  if(!flashItems.length) return;
  flashCurrentIdx = startIdx;
  document.getElementById('modal-flash').style.display = 'block';
  document.body.style.overflow = 'hidden';
  renderFlashSlide();
}

function renderFlashSlide() {
  clearTimeout(flashTimer);
  const f = flashItems[flashCurrentIdx];
  if(!f) { closeFlashModal(); return; }

  // Build slide
  const slides = document.getElementById('flash-slides');
  let media = '';
  if(f.url && f.type==='video') {
    media = `<video id="flash-vid" src="${f.url}" autoplay muted playsinline loop style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"></video>`;
  } else if(f.url) {
    media = `<img src="${f.url}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">`;
  } else {
    media = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:8rem;">${f.emoji}</div>`;
  }
  slides.innerHTML = media;

  // Title
  document.getElementById('flash-slide-title').textContent = f.title;

  // Progress bars
  const bars = document.getElementById('flash-progress-bars');
  bars.innerHTML = flashItems.map((_,i) => `
    <div class="flash-prog-track">
      <div class="flash-prog-fill" id="fpb-${i}" style="width:${i < flashCurrentIdx ? '100%' : '0%'}"></div>
    </div>`).join('');

  // Animate current bar
  const fill = document.getElementById('fpb-' + flashCurrentIdx);
  if(fill) {
    fill.style.transition = `width ${FLASH_DURATION}ms linear`;
    requestAnimationFrame(() => { fill.style.width = '100%'; });
  }

  // Auto advance
  flashTimer = setTimeout(() => flashNext(), FLASH_DURATION);
}

function flashNext() {
  if(flashCurrentIdx < flashItems.length - 1) {
    flashCurrentIdx++;
    renderFlashSlide();
  } else {
    closeFlashModal();
  }
}

function flashPrev() {
  if(flashCurrentIdx > 0) {
    flashCurrentIdx--;
    renderFlashSlide();
  }
}

function closeFlashModal() {
  clearTimeout(flashTimer);
  document.getElementById('modal-flash').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('flash-slides').innerHTML = '';
}

function renderClientMenu(cat) {
  const list = document.getElementById('client-menu-list');
  const avail = menuItems.filter(i=>i.available);
  const filtered = cat==='Todos' ? avail : avail.filter(i=>i.cat===cat);
  if(!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">🍽️</div><p>Nenhum item nesta categoria</p></div>'; return; }
  list.innerHTML = filtered.map(item => `
    <div class="client-item">
      <div class="client-item-inner">
        <div class="client-item-media">
          ${item.photo ? `<img src="${item.photo}" alt="${item.name}">` : ''}
          <span class="emoji-fallback" style="${item.photo?'opacity:0':''}">  ${item.emoji}</span>
        </div>
        <div class="client-item-body">
          <div class="client-item-name">${item.name}</div>
          <div class="client-item-desc">${item.desc}</div>
          <div class="client-item-footer">
            <div class="client-item-price">R$ ${item.price.toFixed(2).replace('.',',')}</div>
            <div class="client-item-actions">
              <button class="see-more-btn" onclick="openProductModal(${item.id})">Ver mais</button>
              <button class="add-btn" onclick="addToCartDirect(${item.id},this)">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function filterCat(cat, btn) {
  document.querySelectorAll('.cat-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderClientMenu(cat);
}

// PRODUCT MODAL
function openProductModal(id) {
  const item = menuItems.find(i=>i.id===id);
  if(!item) return;
  const imgEl = document.getElementById('pm-img');
  document.getElementById('pm-emoji').textContent = item.emoji;
  if(item.photo) {
    let img = imgEl.querySelector('img');
    if(!img) { img = document.createElement('img'); imgEl.appendChild(img); }
    img.src = item.photo; img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0';
    document.getElementById('pm-emoji').style.opacity = '0';
  } else {
    const img = imgEl.querySelector('img');
    if(img) img.remove();
    document.getElementById('pm-emoji').style.opacity = '1';
  }
  document.getElementById('pm-cat').textContent = item.cat;
  document.getElementById('pm-name').textContent = item.name;
  document.getElementById('pm-desc').textContent = item.desc;
  document.getElementById('pm-price').textContent = 'R$ ' + item.price.toFixed(2).replace('.',',');
  document.getElementById('pm-add-btn').onclick = () => { addToCartDirect(id, null); closeProductModal(); };
  document.getElementById('modal-product').classList.add('open');
}
function closeProductModal() { document.getElementById('modal-product').classList.remove('open'); }

// CART
function addToCartDirect(id, btn) {
  const item = menuItems.find(i=>i.id===id);
  if(!item) return;
  const existing = cart.find(c=>c.id===id);
  if(existing) existing.qty++;
  else cart.push({...item, qty:1});
  updateCartUI();
  if(btn) {
    btn.textContent = '✓';
    btn.style.background = 'var(--success)';
    setTimeout(()=>{ btn.textContent='+'; btn.style.background=''; }, 700);
  }
}

function updateCartUI() {
  const count = cart.reduce((s,c)=>s+c.qty,0);
  const total = cart.reduce((s,c)=>s+c.qty*c.price,0);
  const fab = document.getElementById('cart-fab');
  fab.classList.toggle('visible', count>0);
  document.getElementById('cart-count-badge').textContent = count;
  document.getElementById('cart-total-badge').textContent = 'R$ '+total.toFixed(2).replace('.',',');
}

// CHECKOUT
function renderCheckout() {
  const list = document.getElementById('cart-items-list');
  if(!cart.length) { list.innerHTML = '<div class="empty-state"><p>Carrinho vazio</p></div>'; return; }
  list.innerHTML = cart.map((item,i) => `
    <div class="cart-item-row">
      <div class="cart-item-emoji">${item.emoji}</div>
      <div class="cart-item-name">${item.name}</div>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="changeQty(${i},-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${i},1)">+</button>
      </div>
      <div class="cart-item-price">R$ ${(item.qty*item.price).toFixed(2).replace('.',',')}</div>
    </div>
  `).join('');
  const total = cart.reduce((s,c)=>s+c.qty*c.price,0);
  document.getElementById('checkout-total-display').textContent = 'R$ '+total.toFixed(2).replace('.',',');
}

function changeQty(i, delta) {
  cart[i].qty += delta;
  if(cart[i].qty <= 0) cart.splice(i,1);
  renderCheckout(); updateCartUI();
}

function selectPayment(el, method) {
  document.querySelectorAll('.pay-option').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  selectedPayment = method;
}

function placeOrder() {
  const name = document.getElementById('client-name').value.trim();
  const addr = document.getElementById('client-address').value.trim();
  if(!name || !addr) { alert('Preencha seu nome e endereço!'); return; }
  orderCounter++;
  const total = cart.reduce((s,c)=>s+c.qty*c.price,0);
  const newOrder = { id:'#'+orderCounter, client:name, address:addr, items:cart.map(c=>({name:c.name,qty:c.qty,price:c.price})), payment:selectedPayment, total, status:'new', time:'agora' };
  orders.unshift(newOrder);
  document.getElementById('receipt-content').innerHTML = buildReceiptHTML(newOrder);
  showNotif(newOrder.client, newOrder.id);
  cart = []; updateCartUI();
  goTo('confirm');
}

// WHATSAPP
function openWhatsApp() {
  const o = orders[0];
  if(!o) return;
  const msg = encodeURIComponent(`Olá! Fiz um pedido pelo PEDIWAY 🎉\n\nPedido ${o.id}\nNome: ${o.client}\nEndereço: ${o.address}\nItens: ${o.items.map(i=>`${i.qty}x ${i.name}`).join(', ')}\nPagamento: ${o.payment}\nTotal: R$ ${o.total.toFixed(2).replace('.',',')}`);
  window.open(`https://wa.me/${store.whatsapp}?text=${msg}`, '_blank');
}

// CLIENT STATUS NOTIF
function showClientStatusNotif(status, clientName) {
  const bar = document.getElementById('client-status-bar');
  if(!bar) return;
  if(status === 'preparing') {
    bar.className = 'client-status-bar visible status-bar-preparing';
    bar.innerHTML = `
      <div class="status-bar-icon"><span class="spinning">🍳</span></div>
      <div>
        <div class="status-bar-title" style="color:#3730A3">Seu pedido está sendo preparado!</div>
        <div class="status-bar-sub">O estabelecimento já está na cozinha 👨‍🍳</div>
      </div>`;
    // Dispara notificação visual no topo também
    showNotifClient('🍳 Preparando seu pedido!', 'O estabelecimento já está cozinhando.');
  } else if(status === 'ready') {
    bar.className = 'client-status-bar visible status-bar-ready';
    bar.innerHTML = `
      <div class="status-bar-icon">✅</div>
      <div>
        <div class="status-bar-title" style="color:var(--success)">Pedido pronto!</div>
        <div class="status-bar-sub">Seu pedido está a caminho. Fique de olho! 🛵</div>
      </div>`;
    showNotifClient('✅ Pedido pronto!', 'Seu pedido está a caminho.');
  }
}

let clientNotifTimeout;
function showNotifClient(title, body) {
  // Reutiliza o banner de notif mas com visual diferente
  const n = document.getElementById('notif');
  n.querySelector('.notif-title').innerHTML = title;
  document.getElementById('notif-body').textContent = body;
  n.classList.add('show');
  clearTimeout(clientNotifTimeout);
  clientNotifTimeout = setTimeout(() => n.classList.remove('show'), 5000);
}

// NOTIFICATION
function showNotif(name, orderId, isSystem=false) {
  const notif = document.getElementById('notif');
  if(isSystem) { notif.querySelector('.notif-title').textContent = '✅ Salvo!'; document.getElementById('notif-body').textContent = 'Configurações atualizadas.'; }
  else { notif.querySelector('.notif-title').innerHTML = '<span class="notif-dot"></span>Novo pedido! 🎉'; document.getElementById('notif-body').textContent = `${name} fez um pedido (${orderId})`; }
  notif.classList.add('show');
  setTimeout(() => notif.classList.remove('show'), 4000);
}

function copyLink() {
  navigator.clipboard?.writeText('https://'+document.getElementById('store-link').textContent).catch(()=>{});
  const btn = event.target; btn.textContent = 'Copiado!';
  setTimeout(()=>btn.textContent='Copiar', 2000);
}

// INIT
function initStoreEmojiPicker() {
  const storeEmojis = ['🍔','🍕','🌮','🍜','🍣','🍗','🥩','🧆','🥗','🍰','🧁','🍦','🍩','🥐','☕','🍺','🌮','🥘','🍱','🎂','🏪','⭐'];
  document.getElementById('store-emoji-picker').innerHTML = storeEmojis.map(e => `<button class="emoji-btn ${e===store.emoji?'selected':''}" onclick="selectStoreEmoji('${e}',this)">${e}</button>`).join('');
}
function selectStoreEmoji(e, btn) {
  document.querySelectorAll('#store-emoji-picker .emoji-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  store.emoji = e;
}

document.addEventListener('DOMContentLoaded', initStoreEmojiPicker);
</script>
</body>
</html>
