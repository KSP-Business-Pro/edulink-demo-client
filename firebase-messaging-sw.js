importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBEdRgcfDi2ai23shWBf4TLBZiM16MpW-U",
  authDomain:        "edulink-demo-client.firebaseapp.com",
  projectId:         "edulink-demo-client",
  storageBucket:     "edulink-demo-client.firebasestorage.app",
  messagingSenderId: "988597670758",
  appId:             "1:988597670758:web:86ee62dc5f96e2bf0caea7"
});

const messaging = firebase.messaging();

// Réception des notifications en arrière-plan
messaging.onBackgroundMessage(function(payload) {
  console.log('[EduLink SW] Notification reçue en background:', payload);
  const notif = payload.notification || {};
  const data  = payload.data || {};
  self.registration.showNotification(notif.title || 'EduLink', {
    body:  notif.body  || '',
    icon:  notif.icon  || '/icon-192.png',
    badge: '/icon-72.png',
    data:  { url: data.url || '/edulink-portail.html' },
    requireInteraction: data.important === 'true',
    tag: data.tag || 'edulink-notif'
  });
});

// Clic sur la notification → ouvrir l'URL
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/edulink-portail.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

