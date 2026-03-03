// firebase-messaging-sw.js
// Place this file at the ROOT of your web server (same level as index.html)
// Handles TWO things:
//   1. PWA offline caching — so the game loads even without internet
//   2. FCM background push notifications — crew alerts

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// ── CACHE CONFIG ────────────────────────────────────────────────────────────
// Bump the version number any time you update index.html or other assets.
// This forces the old cache to clear and the new files to download.
const CACHE_VERSION = "tumbler-v1";

const CACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@400;700&display=swap",
];

// ── INSTALL: pre-cache core assets ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing cache:", CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.allSettled(
        CACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] Failed to pre-cache:", url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating, clearing old caches...");
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ───────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Never intercept Firebase/FCM traffic
  if (
    url.hostname.includes("firebasedatabase.app") ||
    url.hostname.includes("fcm.googleapis.com") ||
    url.hostname.includes("firebase.googleapis.com") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  const isOwnAsset =
    url.origin === self.location.origin ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com");

  if (isOwnAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});

// ── FIREBASE MESSAGING ──────────────────────────────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyD5C8uPGGb_jMuA0ceP5VlWChMV-Ggfles",
  authDomain: "tumbler-51e42.firebaseapp.com",
  databaseURL: "https://tumbler-51e42-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "tumbler-51e42",
  storageBucket: "tumbler-51e42.firebasestorage.app",
  messagingSenderId: "907072959576",
  appId: "1:907072959576:web:641facf27c204c7bb8862d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);
  const { title, body, icon } = payload.notification || {};

  self.registration.showNotification(title || "Tumbler", {
    body: body || "Check your crew leaderboard!",
    icon: icon || "/icons/icon-192.png",
    badge: "/icons/icon-72.png",
    tag: payload.data?.tag || "tumbler-notif",
    data: payload.data || {},
    requireInteraction: false,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});