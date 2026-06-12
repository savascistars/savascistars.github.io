/**
 * ============================================================
 *  SAVAŞÇI STARS — script.js
 * ============================================================
 *
 *  ╔══════════════════════════════════════════════════════════╗
 *  ║          📌 KURULUM TALİMATLARI (LÜTFEN OKU!)           ║
 *  ╠══════════════════════════════════════════════════════════╣
 *  ║  1. https://console.cloud.google.com/ → Yeni proje       ║
 *  ║  2. APIs & Services → YouTube Data API v3 → Enable       ║
 *  ║  3. Credentials → Create → API Key → Kopyala            ║
 *  ║  4. Aşağıdaki API_KEY'e yaz                             ║
 *  ║  5. Kanalın ID'sini bul: YouTube → Hakkında → Paylaş    ║
 *  ║     → "Kanal kimliğini kopyala" → CHANNEL_ID'ye yaz     ║
 *  ║  6. SOCIAL_LINKS nesnesindeki linkleri güncelle          ║
 *  ╚══════════════════════════════════════════════════════════╝
 */

// ─── Yapılandırma ───────────────────────────────────────────
const API_KEY    = "AIzaSyCRXwaCM8ETt3AdJPcxepuAvOGl_RaIsiY";
const CHANNEL_ID = "UCfsXh_1RNbhGfCLX286ikZA";

const SOCIAL_LINKS = {
  youtube:   "https://youtube.com/@savascistars_38",
  discord:   "https://discord.gg/savascistars",
  instagram: "https://instagram.com/savascistars",
  twitter:   "https://twitter.com/savascistars",
  tiktok:    "https://tiktok.com/@savasci_stars",
  twitch:    "https://twitch.tv/savascistars",
};

const MAX_RESULTS         = 24;   // Videolar grid'inde gösterilecek max video
const VIDEOS_FETCH_LIMIT  = 100;  // Playlist'ten çekilecek ID sayısı (shorts filtresi sonrası MAX_RESULTS kadar kalır)
const SHORTS_LIMIT        = 100;  // Shorts için de fazladan çek
const SHORTS_DURATION_MAX = 65;
const HOME_PREVIEW_COUNT  = 4;

// ─── State ──────────────────────────────────────────────────
let videosData   = [];
let shortsData   = [];
let videoSort    = "newest";
let shortsSort   = "newest";

// ⚑  FIX 1: Ayrı "yüklendin mi" bayrakları
//    Ana sayfa önizlemesi veriyi dolduruyor ama grid hâlâ spinner
//    gösteriyordu. Artık verinin dolu olması yetmiyor; sadece bu
//    bayraklar true ise grid yeniden render'dan korunur.
let videosLoaded = false;
let shortsLoaded = false;

/* ============================================================
   NAVIGATION
============================================================ */
function initNavigation() {
  document.querySelectorAll("[data-section]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.getAttribute("data-section") || "home");
      closeMobileMenu();
    });
  });
  const hash = window.location.hash.replace("#", "") || "home";
  navigateTo(hash, false);
}

function navigateTo(sectionId, pushState = true) {
  const valid = ["home","videos","shorts","links","about"];
  const id = valid.includes(sectionId) ? sectionId : "home";

  document.querySelectorAll(".section").forEach(s => {
    s.classList.remove("active");
    s.style.display = "";
    // Ana sayfa container scroll'unu sıfırla
    if (s.id === "home") s.scrollTop = 0;
  });
  const target = document.getElementById(id);
  if (target) { target.classList.add("active"); target.style.display = "flex"; }

  document.querySelectorAll(".nav-link, .mobile-link").forEach(l =>
    l.classList.toggle("active", l.getAttribute("data-section") === id)
  );

  if (pushState) history.pushState(null, "", `#${id}`);
  window.scrollTo({ top: 0, behavior: "instant" });
  document.dispatchEvent(new Event("sectionChanged"));

  // Lazy-load:
  // - Daha önce yüklendiyse grid'i cache'den çiz (API çağrısı yok)
  // - Hiç yüklenmemişse fetch başlat
  if (id === "videos") {
    if (videosLoaded && videosData.length) {
      const grid = document.getElementById("videosGrid");
      if (grid) renderVideos(grid, videosData);
    } else if (!videosLoaded) {
      fetchVideos();
    }
  }
  if (id === "shorts") {
    if (shortsLoaded && shortsData.length) {
      const grid = document.getElementById("shortsGrid");
      if (grid) renderShorts(grid, shortsData);
    } else if (!shortsLoaded) {
      fetchShorts();
    }
  }
}

window.addEventListener("popstate", () => {
  navigateTo(window.location.hash.replace("#","") || "home", false);
});

/* ============================================================
   NAVBAR SCROLL
============================================================ */
function initNavbarScroll() {
  const nav = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

/* ============================================================
   HAMBURGER
============================================================ */
function initHamburger() {
  const btn     = document.getElementById("hamburger");
  const menu    = document.getElementById("mobileMenu");
  const overlay = document.getElementById("mobileOverlay");

  btn.addEventListener("click", () => {
    const isOpen = btn.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen);
    menu.classList.toggle("open", isOpen);
    menu.setAttribute("aria-hidden", !isOpen);
    overlay.classList.toggle("visible", isOpen);
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  overlay.addEventListener("click", closeMobileMenu);
  menu.addEventListener("keydown", e => { if (e.key === "Escape") closeMobileMenu(); });
}

function closeMobileMenu() {
  const btn     = document.getElementById("hamburger");
  const menu    = document.getElementById("mobileMenu");
  const overlay = document.getElementById("mobileOverlay");
  btn.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
  menu.classList.remove("open");
  menu.setAttribute("aria-hidden", "true");
  overlay.classList.remove("visible");
  document.body.style.overflow = "";
}

/* ============================================================
   SCROLL-TOP BUTTON
   Ana sayfa kendi içinde scroll eder (overflow-y:auto),
   diğer sayfalar window'u scroll eder — ikisini de dinliyoruz.
============================================================ */
function initScrollTop() {
  const btn      = document.getElementById("scrollTopBtn");
  const ringFill = document.getElementById("scrollRingFill");
  if (!btn || !ringFill) return;

  const circumference = 2 * Math.PI * 22; // r=22 → ~138.2

  function updateRing(scrollTop, scrollHeight, clientHeight) {
    const docHeight = scrollHeight - clientHeight;
    const progress  = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
    ringFill.style.strokeDashoffset = circumference * (1 - progress);
    btn.classList.toggle("visible", scrollTop > 200);
  }

  // window scroll (videos, shorts, links, about, hakkında)
  window.addEventListener("scroll", () => {
    updateRing(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
  }, { passive: true });

  // Ana sayfa kendi container'ında scroll eder
  const homeSection = document.getElementById("home");
  if (homeSection) {
    homeSection.addEventListener("scroll", () => {
      updateRing(homeSection.scrollTop, homeSection.scrollHeight, homeSection.clientHeight);
    }, { passive: true });
  }

  // Tıklayınca aktif scroll container'ı yukarı al
  btn.addEventListener("click", () => {
    const homeSection = document.getElementById("home");
    if (homeSection && homeSection.classList.contains("active") && homeSection.scrollTop > 0) {
      homeSection.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Sayfa değişince ring'i sıfırla
  document.addEventListener("sectionChanged", () => {
    ringFill.style.strokeDashoffset = circumference;
    btn.classList.remove("visible");
  });
}

/* ============================================================
   PARTICLES
============================================================ */
function initParticles() {
  const container = document.getElementById("heroParticles");
  if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left              = `${Math.random() * 100}%`;
    p.style.width             = `${1 + Math.random() * 2}px`;
    p.style.height            = p.style.width;
    p.style.animationDuration = `${7 + Math.random() * 11}s`;
    p.style.animationDelay    = `${Math.random() * 10}s`;
    container.appendChild(p);
  }
}

/* ============================================================
   VIDEO PLAYER MODAL
   FIX 2: Kartlar artık YouTube'a gitmiyor, modal açıyor.
============================================================ */
function initPlayerModal() {
  const modal    = document.getElementById("playerModal");
  const backdrop = document.getElementById("playerBackdrop");
  const closeBtn = document.getElementById("playerClose");

  if (!modal) return;

  closeBtn.addEventListener("click", closePlayer);
  backdrop.addEventListener("click", closePlayer);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) closePlayer();
  });
}

function openPlayer(video, isShort) {
  const modal     = document.getElementById("playerModal");
  const iframe    = document.getElementById("playerIframe");
  const titleEl   = document.getElementById("playerTitle");
  const ytLink    = document.getElementById("playerYTLink");
  const embedWrap = document.getElementById("playerEmbedWrap");

  if (!modal || !iframe) return;

  // Embed URL — autoplay=1, rel=0 (önerilen videolarda yabancı kanal çıkmasın)
  const embedUrl = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`;

  iframe.src      = embedUrl;
  titleEl.textContent = video.title;
  ytLink.href     = video.url;

  // Shorts dikey, normal video yatay oran
  embedWrap.className = `player-embed-wrap ${isShort ? "short" : "normal"}`;

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePlayer() {
  const modal  = document.getElementById("playerModal");
  const iframe = document.getElementById("playerIframe");
  if (!modal) return;

  // iframe src'yi temizle → videoyu durdurur
  if (iframe) iframe.src = "";

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* ============================================================
   SEARCH
============================================================ */
function initSearch() {
  setupSearchBox(
    "videosSearch", "videosClear", "videosResultLabel",
    () => videosData,
    filtered => renderVideos(document.getElementById("videosGrid"), filtered, true)
  );
  setupSearchBox(
    "shortsSearch", "shortsClear", "shortsResultLabel",
    () => shortsData,
    filtered => renderShorts(document.getElementById("shortsGrid"), filtered, true)
  );
}

function setupSearchBox(inputId, clearId, labelId, getData, renderFn) {
  const input = document.getElementById(inputId);
  const clear = document.getElementById(clearId);
  const label = document.getElementById(labelId);
  if (!input) return;

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    clear.classList.toggle("show", q.length > 0);
    const data = getData();
    if (!q) { if (label) label.textContent = ""; renderFn(data); return; }
    const filtered = data.filter(v => v.title.toLowerCase().includes(q));
    if (label) label.textContent = filtered.length
      ? `"${q}" için ${filtered.length} sonuç`
      : `"${q}" için sonuç bulunamadı`;
    renderFn(filtered);
  }

  input.addEventListener("input", doSearch);
  clear.addEventListener("click", () => { input.value = ""; doSearch(); input.focus(); });
}

/* ============================================================
   YOUTUBE API HELPERS
============================================================ */
function formatNumber(n) {
  if (n == null) return "—";
  const num = parseInt(n, 10);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(".0","") + "M";
  if (num >= 1_000)     return (num / 1_000).toFixed(1).replace(".0","") + "K";
  return num.toLocaleString("tr-TR");
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("tr-TR", { day:"numeric", month:"long", year:"numeric" });
}

function parseDurationSeconds(dur) {
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 9999;
  return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
}

async function ytFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchUploadPlaylistId() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&id=${CHANNEL_ID}&key=${API_KEY}`;
  const data = await ytFetch(url);
  const ch = data.items?.[0];
  if (!ch) throw new Error("Kanal bulunamadı — CHANNEL_ID'yi kontrol et.");
  return { playlistId: ch.contentDetails.relatedPlaylists.uploads, stats: ch.statistics, snippet: ch.snippet };
}

async function fetchPlaylistItems(playlistId, max) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${max}&key=${API_KEY}`;
  const data = await ytFetch(url);
  return data.items?.map(i => i.snippet.resourceId.videoId).filter(Boolean) || [];
}

async function fetchVideoDetails(ids) {
  if (!ids.length) return [];
  const results = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i+50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${API_KEY}`;
    const data = await ytFetch(url);
    results.push(...(data.items || []));
  }
  return results;
}

function transformVideo(item) {
  return {
    id:          item.id,
    title:       item.snippet.title,
    thumbnail:   item.snippet.thumbnails?.maxres?.url
                  || item.snippet.thumbnails?.high?.url
                  || item.snippet.thumbnails?.medium?.url || "",
    publishedAt: item.snippet.publishedAt,
    views:       parseInt(item.statistics?.viewCount || 0),
    duration:    parseDurationSeconds(item.contentDetails?.duration || "PT0S"),
    url:         `https://www.youtube.com/watch?v=${item.id}`,
  };
}

/* ============================================================
   CHANNEL DATA
============================================================ */
async function fetchChannelData() {
  if (isDemoMode()) { populateDemoChannelData(); return null; }
  try { return await fetchUploadPlaylistId(); }
  catch(e) { console.warn("Kanal verisi alınamadı:", e.message); return null; }
}

function populateChannelUI(stats, snippet) {
  setText("statSubs",   formatNumber(stats.subscriberCount));
  setText("statViews",  formatNumber(stats.viewCount));
  setText("statVideos", formatNumber(stats.videoCount));

  const desc = snippet.description?.split("\n")[0]?.trim() || "";
  if (desc) setText("heroDesc", desc);

  setText("aboutName",     snippet.title || "Savaşçı Stars");
  setText("aboutDesc",     snippet.description || "—");
  setText("aboutSubs",     formatNumber(stats.subscriberCount));
  setText("aboutViews",    formatNumber(stats.viewCount));
  setText("aboutVidCount", formatNumber(stats.videoCount));

  setText("homeAboutName", snippet.title || "Savaşçı Stars");
  setText("homeAboutDesc", snippet.description?.split("\n")[0] || "");

  const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url;
  if (thumb) {
    ["aboutAvatar","homeAvatar"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<img src="${thumb}" alt="${snippet.title}" />`;
    });
  }

  const ytUrl = `https://youtube.com/channel/${CHANNEL_ID}`;
  setHref("heroYTLink",  ytUrl);
  setHref("aboutYTLink", ytUrl);
}

function populateDemoChannelData() {
  populateChannelUI(
    { subscriberCount:"12500", viewCount:"890000", videoCount:"142" },
    { title:"Savaşçı Stars", description:"Gaming içerikleri, rekabetçi oynanışlar ve eğlenceli anlar.", thumbnails:{} }
  );
}

/* ============================================================
   FETCH VIDEOS
============================================================ */
async function fetchVideos() {
  const grid = document.getElementById("videosGrid");
  if (!grid) return;
  showLoading(grid);

  if (isDemoMode()) {
    if (!videosData.length) videosData = generateDemoVideos(12, false);
    videosLoaded = true;
    renderVideos(grid, videosData);
    renderHomePreview();
    return;
  }

  try {
    const ch  = await fetchUploadPlaylistId();
    // Fazladan ID çek — shorts filtresi sonrası yeterli video kalsın
    const ids = await fetchPlaylistItems(ch.playlistId, VIDEOS_FETCH_LIMIT);
    const dets = await fetchVideoDetails(ids);
    videosData = dets
      .filter(v => parseDurationSeconds(v.contentDetails?.duration||"PT0S") > SHORTS_DURATION_MAX)
      .slice(0, MAX_RESULTS)
      .map(transformVideo);
    videosLoaded = true;
    renderVideos(grid, videosData);
    renderHomePreview();
  } catch(err) {
    showError(grid, "Videolar yüklenemedi", err.message);
  }
}

/* ============================================================
   FETCH SHORTS
============================================================ */
async function fetchShorts() {
  const grid = document.getElementById("shortsGrid");
  if (!grid) return;
  showLoading(grid);

  if (isDemoMode()) {
    if (!shortsData.length) shortsData = generateDemoVideos(12, true);
    shortsLoaded = true;
    renderShorts(grid, shortsData);
    renderHomeShortsPreview();
    return;
  }

  try {
    const ch   = await fetchUploadPlaylistId();
    const ids  = await fetchPlaylistItems(ch.playlistId, SHORTS_LIMIT);
    const dets = await fetchVideoDetails(ids);
    shortsData = dets
      .filter(v => parseDurationSeconds(v.contentDetails?.duration||"PT0S") <= SHORTS_DURATION_MAX)
      .slice(0, MAX_RESULTS)
      .map(transformVideo);
    shortsLoaded = true;
    if (!shortsData.length) { showEmpty(grid, "Shorts bulunamadı."); return; }
    renderShorts(grid, shortsData);
    renderHomeShortsPreview();
  } catch(err) {
    showError(grid, "Shorts yüklenemedi", err.message);
  }
}

/* ============================================================
   HOME PREVIEW
============================================================ */
async function loadHomePreview() {
  if (isDemoMode()) {
    if (!videosData.length) videosData = generateDemoVideos(12, false);
    if (!shortsData.length) shortsData = generateDemoVideos(12, true);
    // Demo modda bayrakları set et — grid'e ilk girişte tekrar fetch gerekmiyor
    videosLoaded = true;
    shortsLoaded = true;
    renderHomePreview();
    renderHomeShortsPreview();
    // O an videos/shorts sayfasındaysa grid'i hemen render et
    _renderGridIfActive("videos");
    _renderGridIfActive("shorts");
    return;
  }

  try {
    const ch  = await fetchUploadPlaylistId();
    // Ana sayfa için de fazladan ID çek
    const ids = await fetchPlaylistItems(ch.playlistId, VIDEOS_FETCH_LIMIT);
    const all = await fetchVideoDetails(ids);

    if (!videosData.length) {
      videosData = all
        .filter(v => parseDurationSeconds(v.contentDetails?.duration||"PT0S") > SHORTS_DURATION_MAX)
        .slice(0, MAX_RESULTS)
        .map(transformVideo);
      videosLoaded = true;
    }

    if (!shortsData.length) {
      shortsData = all
        .filter(v => parseDurationSeconds(v.contentDetails?.duration||"PT0S") <= SHORTS_DURATION_MAX)
        .slice(0, MAX_RESULTS)
        .map(transformVideo);
      shortsLoaded = true;
    }

    renderHomePreview();
    renderHomeShortsPreview();

    // O an videos/shorts sayfasındaysa grid'i hemen render et
    _renderGridIfActive("videos");
    _renderGridIfActive("shorts");
  } catch(e) {
    const vg = document.getElementById("homeVideosPreview");
    const sg = document.getElementById("homeShortsPreview");
    if (vg) vg.innerHTML = `<p style="color:var(--grey);font-size:.85rem;padding:16px 0">Önizleme yüklenemedi.</p>`;
    if (sg) sg.innerHTML = "";
  }
}

// Yardımcı: belirtilen section aktifse grid'i hemen çiz
function _renderGridIfActive(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section || !section.classList.contains("active")) return;
  if (sectionId === "videos") {
    const grid = document.getElementById("videosGrid");
    if (grid && videosData.length) renderVideos(grid, videosData);
  } else if (sectionId === "shorts") {
    const grid = document.getElementById("shortsGrid");
    if (grid && shortsData.length) renderShorts(grid, shortsData);
  }
}

function renderHomePreview() {
  const grid = document.getElementById("homeVideosPreview");
  if (!grid || !videosData.length) return;
  const sorted = sortVideos(videosData, "newest").slice(0, HOME_PREVIEW_COUNT);
  grid.innerHTML = "";
  sorted.forEach(v => grid.appendChild(createVideoCard(v, false)));
  animateCards(grid);
}

function renderHomeShortsPreview() {
  const grid = document.getElementById("homeShortsPreview");
  if (!grid || !shortsData.length) return;
  const sorted = sortVideos(shortsData, "newest").slice(0, HOME_PREVIEW_COUNT);
  grid.innerHTML = "";
  sorted.forEach(v => grid.appendChild(createVideoCard(v, true)));
  animateCards(grid);
}

/* ============================================================
   RENDER FUNCTIONS
============================================================ */
function sortVideos(arr, key) {
  const c = [...arr];
  if (key === "newest") return c.sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  if (key === "oldest") return c.sort((a,b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  if (key === "views")  return c.sort((a,b) => b.views - a.views);
  return c;
}

function renderVideos(grid, data, skipSort = false) {
  const sorted = skipSort ? data : sortVideos(data, videoSort);
  grid.innerHTML = "";
  if (!sorted.length) { showEmpty(grid, "Video bulunamadı."); return; }
  sorted.forEach(v => grid.appendChild(createVideoCard(v, false)));
  animateCards(grid);
}

function renderShorts(grid, data, skipSort = false) {
  const sorted = skipSort ? data : sortVideos(data, shortsSort);
  grid.innerHTML = "";
  if (!sorted.length) { showEmpty(grid, "Short bulunamadı."); return; }
  sorted.forEach(v => grid.appendChild(createVideoCard(v, true)));
  animateCards(grid);
}

/* ============================================================
   CREATE VIDEO CARD
   FIX 2: <a href=yt> yerine button → modal açılıyor
============================================================ */
function createVideoCard(video, isShort) {
  const card = document.createElement("div");
  card.className = "video-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", video.title);

  const fallback = isShort
    ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
    : `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`;

  card.innerHTML = `
    <div class="card-thumb">
      <img src="${video.thumbnail || fallback}" alt="${escHtml(video.title)}" loading="lazy" onerror="this.src='${fallback}'" />
      <div class="card-play-overlay">
        <div class="card-play-btn"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="card-views-badge"><i class="fa-solid fa-eye"></i> ${formatNumber(video.views)}</div>
    </div>
    <div class="card-body">
      <p class="card-title">${escHtml(video.title)}</p>
      <div class="card-meta">
        <span>${formatDate(video.publishedAt)}</span>
        <span class="card-meta-dot">●</span>
        <span>${formatNumber(video.views)} izlenme</span>
      </div>
    </div>`;

  // Tıklama → modal aç
  card.addEventListener("click", () => openPlayer(video, isShort));
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(video, isShort); } });

  return card;
}

function animateCards(grid) {
  grid.querySelectorAll(".video-card").forEach((card, i) => {
    card.style.opacity   = "0";
    card.style.transform = "translateY(18px)";
    card.style.transition = `opacity 0.36s ease ${i*0.04}s, transform 0.36s ease ${i*0.04}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.opacity   = "1";
      card.style.transform = "translateY(0)";
    }));
  });
}

/* ============================================================
   FILTERS
============================================================ */
function initFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sort   = btn.getAttribute("data-sort");
      const target = btn.getAttribute("data-target");

      btn.closest(".filter-bar").querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Arama kutusunu sıfırla
      const inputId = target === "videos" ? "videosSearch" : "shortsSearch";
      const clearId = target === "videos" ? "videosClear"  : "shortsClear";
      const labelId = target === "videos" ? "videosResultLabel" : "shortsResultLabel";
      const inp = document.getElementById(inputId);
      if (inp) inp.value = "";
      setText(labelId, "");
      document.getElementById(clearId)?.classList.remove("show");

      if (target === "videos") {
        videoSort = sort;
        if (videosData.length) renderVideos(document.getElementById("videosGrid"), videosData);
      } else {
        shortsSort = sort;
        if (shortsData.length) renderShorts(document.getElementById("shortsGrid"), shortsData);
      }
    });
  });
}

/* ============================================================
   SOCIAL LINKS
============================================================ */
function applySocialLinks() {
  const map = {
    "a.link-youtube":   SOCIAL_LINKS.youtube,
    "a.link-discord":   SOCIAL_LINKS.discord,
    "a.link-instagram": SOCIAL_LINKS.instagram,
    "a.link-twitter":   SOCIAL_LINKS.twitter,
    "a.link-tiktok":    SOCIAL_LINKS.tiktok,
    "a.link-twitch":    SOCIAL_LINKS.twitch,
  };
  for (const [sel, url] of Object.entries(map))
    document.querySelectorAll(sel).forEach(el => { el.href = url; });

  setHref("mobileYT",    SOCIAL_LINKS.youtube);
  setHref("mobileDC",    SOCIAL_LINKS.discord);
  setHref("mobileIG",    SOCIAL_LINKS.instagram);
  setHref("heroYTLink",  SOCIAL_LINKS.youtube);
  setHref("aboutYTLink", SOCIAL_LINKS.youtube);
  setHref("homeSocialYT", SOCIAL_LINKS.youtube);
  setHref("homeSocialDC", SOCIAL_LINKS.discord);
  setHref("homeSocialIG", SOCIAL_LINKS.instagram);
  setHref("homeSocialTW", SOCIAL_LINKS.twitter);
  setHref("homeSocialTT", SOCIAL_LINKS.tiktok);
  setHref("homeSocialTV", SOCIAL_LINKS.twitch);
}

/* ============================================================
   HELPERS
============================================================ */
function isDemoMode() {
  return API_KEY === "BURAYA_API_ANAHTARINI_YAZ" || CHANNEL_ID === "BURAYA_KANAL_ID_YAZ";
}
function setText(id, txt) { const el = document.getElementById(id); if(el) el.textContent = txt; }
function setHref(id, url) { const el = document.getElementById(id); if(el) el.href = url; }
function escHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function showLoading(grid) {
  grid.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>İçerikler yükleniyor…</p></div>`;
}
function showError(grid, title, detail) {
  grid.innerHTML = `<div class="error-state"><i class="fa-solid fa-triangle-exclamation"></i>
    <p><strong>${title}</strong><br><span style="font-size:.82rem;opacity:.7">${detail||""}</span></p>
    <p style="margin-top:10px;font-size:.8rem;opacity:.5">API anahtarını ve Kanal ID'sini script.js'de kontrol et.</p></div>`;
}
function showEmpty(grid, msg) {
  grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-video-slash"></i><p>${msg}</p></div>`;
}

/* ============================================================
   DEMO DATA
============================================================ */
function generateDemoVideos(count, isShort) {
  const titles = [
    "EN İYİ OYUNCU ANLAR! 🔥","RANK ATLADIK NASIL YAPTIK?",
    "24 SAAT KESINTISIZ OYNARSAK NE OLUR?","PRO GİBİ OYNAMANIN SIRRI",
    "YENİ GÜNCELLEME NELER GETİRDİ?","BU HAMLEYLE HERKESİ ŞOK ETTİM",
    "TAKIMLA KOOPERATİF OYNADIK","EN ZOR BÖLÜMÜ BİTİRDİK!",
    "YENİ KARAKTERİ DENEDİM","SEZON FİNALİ BÜYÜK KAPANIŞ",
    "1V1 TURNUVASI KİM KAZANDI?","LEGEND STATÜSÜNE GEÇTİK!",
  ];
  const demoIds = [
    "dQw4w9WgXcQ","tgbNymZ7vqY","oHg5SJYRHA0","ZTidn2dBYbY",
    "yPYZpwSpKmA","M7lc1UVf-VE","RL0MX3bFG1c","e-ORhEE9VVg",
    "iik25wqIuFo","WZB0YM_0Qx4","kffacxfA7G4","xvFZjo5PgG0",
  ];
  return Array.from({ length: Math.min(count, titles.length) }, (_,i) => ({
    id:          demoIds[i] || `demo_${i}`,
    title:       titles[i],
    thumbnail:   `https://picsum.photos/seed/${i+(isShort?100:0)}/640/360`,
    publishedAt: new Date(Date.now() - i*7*24*3600*1000).toISOString(),
    views:       Math.floor(Math.random()*500000)+1000,
    duration:    isShort ? 30+i*5 : 300+i*120,
    url:         `https://www.youtube.com/watch?v=${demoIds[i]||"dQw4w9WgXcQ"}`,
  }));
}

/* ============================================================
   INIT
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  applySocialLinks();
  initNavigation();
  initNavbarScroll();
  initHamburger();
  initFilters();
  initSearch();
  initParticles();
  initScrollTop();
  initPlayerModal();   // ← modal listener'ları kur

  // Kanal verisi
  const channelInfo = await fetchChannelData();
  if (channelInfo) populateChannelUI(channelInfo.stats, channelInfo.snippet);

  // Ana sayfa önizlemesi
  await loadHomePreview();

  // Sayfa zaten videos/shorts'ta açıldıysa
  const hash = window.location.hash.replace("#","") || "home";
  if (hash === "videos" && !videosLoaded) fetchVideos();
  if (hash === "shorts" && !shortsLoaded) fetchShorts();
});
