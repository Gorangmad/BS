self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('my-cache').then((cache) => {
      return cache.addAll([
        // Include the URLs of your cached assets here
        'hhttps://lobster-app-77lrc.ondigitalocean.app/resources/views/home.ejs',
        'https://lobster-app-77lrc.ondigitalocean.app/resources/css/styles.css',   // Example CSS file
        'https://lobster-app-77lrc.ondigitalocean.app/resources/js/app.js',       // Example JavaScript file
        'https://lobster-app-77lrc.ondigitalocean.app/resources/img/logo.png',    // Example image file
        // Add more URLs as needed
      ])
      .catch((error) => {
        console.error('Failed to cache resources', error)
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Service worker code for handling push notifications and caching
self.addEventListener("push", (event) => {
  if (event.data) {
    const options = {
      body: event.data.text(), // Extract the notification message from the event data
      icon: 'icon.png', // Replace with the path to your notification icon
      badge: 'badge.png', // Replace with the path to your notification badge (optional)
    };

    event.waitUntil(
      self.registration.showNotification('Push Notification Title', options)
    );
  }
});


// Other service worker code for caching, etc.


