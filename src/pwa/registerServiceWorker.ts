export interface PWAUpdateCallbacks {
  onUpdateAvailable: (reload: () => void) => void;
}

export function registerServiceWorker(callbacks?: PWAUpdateCallbacks) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Kiểm tra định kỳ update
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Service Worker mới đã tải xong và đang chờ
              if (callbacks?.onUpdateAvailable) {
                callbacks.onUpdateAvailable(() => {
                  installingWorker.postMessage({ type: "SKIP_WAITING" });
                  window.location.reload();
                });
              }
            }
          });
        });
      })
      .catch((err) => {
        console.warn("ServiceWorker registration failed:", err);
      });

    // Khi worker mới nhận quyền điều khiển
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
