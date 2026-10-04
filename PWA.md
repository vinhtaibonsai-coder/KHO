# Production PWA 2026 – Standards-First Specification

> File này là tiêu chuẩn bắt buộc cho toàn bộ project.
> AI/Coder phải đọc và tuân thủ trước khi viết hoặc sửa code liên quan đến PWA, mobile UX, caching, offline, install, update, push notification và local data.

---

## 1. Mục tiêu

Xây dựng ứng dụng theo chuẩn **Production PWA 2026 – Standards First**.

Không được làm kiểu:
- website chỉ thêm icon Home Screen,
- service worker giả để pass Lighthouse,
- cache toàn bộ request một cách mù quáng,
- phụ thuộc riêng Chrome/Chromium,
- hoặc coi PWA chỉ là `manifest + service-worker`.

PWA phải có trải nghiệm gần app thật trên iPhone, Android và desktop.

Ưu tiên:
1. Tính ổn định
2. Không mất dữ liệu người dùng
3. iOS/Safari compatibility
4. Offline/reconnect tốt
5. Update an toàn
6. Hiệu năng
7. Khả năng maintain lâu dài

---

# 2. Browser Target

Ưu tiên:

- iPhone/iPad Safari hiện hành
- iOS/iPadOS 16.4+
- Chrome Android hiện hành
- Chrome Desktop
- Edge Desktop
- Safari macOS

Không được giả định:
- Chrome API nào cũng có trên Safari
- `beforeinstallprompt` có trên iOS
- Background Sync hoạt động giống nhau trên mọi browser
- Push notification hoạt động giống nhau trên mọi nền tảng

Luôn dùng:

```js
if ('serviceWorker' in navigator) {
  // ...
}
```

hoặc feature detection tương đương.

Không dùng user-agent sniffing nếu feature detection giải quyết được.

---

# 3. Web App Manifest

Tạo file:

```text
/public/manifest.webmanifest
```

Header:

```text
Content-Type: application/manifest+json
```

Manifest tối thiểu phải có:

```json
{
  "id": "/",
  "name": "APP NAME",
  "short_name": "APP",
  "description": "APP DESCRIPTION",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Có thể thêm nếu phù hợp:

- `display_override`
- `orientation`
- `shortcuts`
- `categories`
- `screenshots`
- `launch_handler`

Không thêm field chỉ vì “trông hiện đại”.
Chỉ dùng khi browser compatibility và use case thực sự phù hợp.

---

# 4. Icon

Tối thiểu phải có:

```text
icon-192.png
icon-512.png
icon-512-maskable.png
apple-touch-icon.png
```

Khuyến nghị:

```text
apple-touch-icon.png = 180x180
```

Yêu cầu:

- Không để logo sát mép
- Maskable icon phải có safe zone
- Không dùng screenshot làm icon
- Không dùng ảnh quá chi tiết
- Icon phải đọc được ở kích thước nhỏ

---

# 5. HTML Head

Phải có:

```html
<link rel="manifest" href="/manifest.webmanifest" />

<meta
  name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover"
/>

<meta name="theme-color" content="#ffffff" />

<link
  rel="apple-touch-icon"
  href="/icons/apple-touch-icon.png"
/>
```

Nếu project cần standalone behavior cho Safari/iOS, có thể bổ sung metadata Apple phù hợp.

Không dùng metadata Apple thay cho Web App Manifest.

---

# 6. iOS Safe Area

Bắt buộc hỗ trợ:

- notch
- Dynamic Island
- Home Indicator
- portrait
- landscape

Ví dụ:

```css
.app {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
```

Bottom navigation:

```css
.bottom-nav {
  padding-bottom: max(
    12px,
    env(safe-area-inset-bottom)
  );
}
```

Không để:

- header chui dưới Dynamic Island
- nút bị che bởi Home Indicator
- modal bị cắt
- input bị keyboard che

---

# 7. Standalone Mode

Phải detect được app đang chạy dạng PWA:

```js
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
```

Ứng dụng có thể thay đổi UX tùy trạng thái:

```text
Browser mode
vs
Installed PWA mode
```

Không hiển thị hướng dẫn cài app nếu đã chạy standalone.

---

# 8. Service Worker

Service Worker phải production-grade.

Không viết kiểu:

```js
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})
```

rồi coi như PWA hoàn chỉnh.

Service Worker phải quản lý:

- app shell
- static cache
- runtime cache
- offline fallback
- cache cleanup
- versioning
- update flow

---

# 9. Cache Strategy

## Static Assets

Áp dụng:

```text
Cache First
```

Phù hợp cho:

- JS bundle có hash
- CSS có hash
- icon
- font
- immutable assets

---

## Image

Ưu tiên:

```text
Stale While Revalidate
```

Có giới hạn:

- max entries
- max age

Không để image cache tăng vô hạn.

---

## API

Ưu tiên:

```text
Network First
```

Chỉ cache API khi:

- dữ liệu an toàn để cache
- dữ liệu không nhạy cảm
- cache có expiry rõ ràng

Không cache tất cả API.

---

## Navigation

Ưu tiên:

```text
Network First
```

Fallback về:

```text
/offline.html
```

hoặc app shell.

---

# 10. Không Cache

Không cache tùy tiện:

- authentication response
- access token
- refresh token
- dữ liệu cá nhân nhạy cảm
- private API response
- request POST
- request PUT/PATCH/DELETE
- payment response
- dữ liệu chứa credential

Nếu cache private data là requirement bắt buộc, phải thiết kế riêng, có threat model rõ ràng.

---

# 11. Cache Versioning

Ví dụ:

```js
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
```

Khi activate:

- xóa cache cũ
- giữ cache hiện tại
- không xóa cache không thuộc app nếu có nguy cơ conflict

Ví dụ:

```js
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith('static-') &&
            key !== STATIC_CACHE
          )
          .map(key => caches.delete(key))
      )
    )
  );
});
```

---

# 12. Offline UX

Mất mạng không được hiện:

```text
Safari cannot open the page
ERR_INTERNET_DISCONNECTED
```

Phải có:

- app shell offline
hoặc
- offline page

Ví dụ:

```text
Bạn đang offline.
Một số dữ liệu có thể chưa được cập nhật.
```

Phải phân biệt:

```text
offline
server error
timeout
unauthorized
not found
```

Không gom tất cả thành “Có lỗi xảy ra”.

---

# 13. Local Database

Dữ liệu nghiệp vụ phải dùng:

```text
IndexedDB
```

Có thể dùng wrapper tốt nếu framework/project phù hợp.

Ví dụ:
- Dexie
- idb

Không dùng `localStorage` làm database chính.

`localStorage` chỉ nên chứa:

- theme
- preference
- feature flag nhỏ
- simple settings
- last selected tab

---

# 14. IndexedDB Migration

Database phải versioned.

Ví dụ logic:

```text
DB v1
orders

DB v2
orders
customers

DB v3
orders
customers
syncQueue
```

Mỗi thay đổi schema phải có migration.

Không xóa database để “fix migration”.

---

# 15. Offline Mutation Queue

Nếu app có các thao tác:

- tạo đơn
- cập nhật khách hàng
- nhập CRM
- ghi chú
- submit form
- sửa dữ liệu
- upload metadata

thì phải hỗ trợ queue.

Data model ví dụ:

```ts
type SyncQueueItem = {
  id: string;
  action: string;
  payload: unknown;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  retryCount: number;
  createdAt: number;
  updatedAt: number;
};
```

Luồng:

```text
User action
   ↓
Save local
   ↓
Add syncQueue
   ↓
Try API
   ↓
Success → synced
Failure → pending/failed
```

---

# 16. Retry

Phải support retry khi:

- browser online trở lại
- app mở lại
- user refresh
- user bấm Retry
- app resume

Ví dụ:

```js
window.addEventListener('online', () => {
  syncPendingQueue();
});
```

Không phụ thuộc hoàn toàn vào Background Sync.

---

# 17. Conflict Handling

Nếu app có multi-device hoặc multi-user editing:

Phải xác định strategy:

- last-write-wins
- server authoritative
- optimistic versioning
- explicit conflict UI

Không âm thầm overwrite dữ liệu quan trọng.

Khuyến nghị mỗi entity có:

```text
updatedAt
version
```

hoặc equivalent.

---

# 18. Update Manager

Không force reload app khi phát hiện Service Worker mới.

Sai:

```text
SW mới → reload ngay
```

Đúng:

```text
SW mới
   ↓
Notify user
   ↓
"Có phiên bản mới"
   ↓
[Cập nhật]
```

Không reload khi user:

- đang nhập form
- đang tạo đơn
- đang upload
- có unsaved changes

---

# 19. Update UI

Ví dụ:

```text
Có phiên bản mới.

[Cập nhật ngay]
[Để sau]
```

Khi user đồng ý:

1. activate worker mới
2. reload ở thời điểm an toàn

---

# 20. Install UX

## Android / Desktop Chromium

Nếu browser hỗ trợ:

```js
window.addEventListener('beforeinstallprompt', event => {
  // save event
});
```

Không auto trigger liên tục.

---

## iOS

Không phụ thuộc:

```text
beforeinstallprompt
```

Nếu app chưa được cài và user dùng Safari:

Hiện hướng dẫn thủ công:

```text
1. Nhấn nút Chia sẻ
2. Chọn Thêm vào Màn hình chính
```

Không hiện popup ngay lần đầu mở web.

Ưu tiên trigger sau khi user đã sử dụng app và hiểu giá trị.

---

# 21. Push Notification

Kiến trúc phải sẵn sàng cho:

- Service Worker
- Notifications API
- Push API
- Web Push
- VAPID nếu backend dùng chuẩn Web Push

Không request permission khi app vừa load.

Sai:

```js
Notification.requestPermission();
```

ngay khi mở app.

Đúng:

```text
User click "Bật thông báo"
        ↓
Request permission
        ↓
Subscribe push
        ↓
Send subscription to backend
```

---

# 22. Push Permission UX

Trước browser prompt, nên có custom explanation:

```text
Bật thông báo để nhận:
- đơn mới
- tin nhắn mới
- cập nhật trạng thái
```

Sau đó user click:

```text
[Bật thông báo]
```

mới gọi browser permission.

---

# 23. Authentication

Khuyến nghị web auth:

```text
Secure
HttpOnly
SameSite
```

cookie nếu backend architecture phù hợp.

Không lưu refresh token nhạy cảm trong:

```text
localStorage
```

Không log token ra console.

Không gửi token vào analytics.

---

# 24. Logout

Logout phải xử lý:

- clear app auth state
- clear private cache
- clear user-specific IndexedDB nếu business rule yêu cầu
- reset UI state
- unsubscribe push nếu cần
- không ảnh hưởng public static cache

---

# 25. App Navigation

PWA phải hoạt động như app.

Ưu tiên client-side navigation nếu framework phù hợp.

Phải có:

- loading state
- skeleton
- error state
- empty state
- retry state

Browser Back phải hoạt động đúng.

---

# 26. Deep Link

Mọi route quan trọng phải deep-link được.

Ví dụ:

```text
/orders/123
/customers/456
/inbox/789
```

Nếu mở trực tiếp URL:

```text
https://app.example.com/orders/123
```

server phải fallback đúng vào app.

Không được trả 404 chỉ vì SPA route.

---

# 27. Mobile First

Thiết kế từ mobile trước.

Touch target nên tối thiểu khoảng:

```text
44 × 44 px
```

Không yêu cầu hover để sử dụng chức năng.

Không để button quá sát nhau.

---

# 28. Form Input

Dùng đúng input type.

Ví dụ:

```html
<input type="tel" />
<input type="email" />
<input type="search" />
<input inputmode="numeric" />
<input inputmode="decimal" />
```

Mục tiêu:

- keyboard đúng trên mobile
- giảm nhập sai
- UX nhanh

---

# 29. iOS Input Zoom

Tránh font input quá nhỏ gây Safari tự zoom.

Khuyến nghị:

```css
input,
textarea,
select {
  font-size: 16px;
}
```

Nếu thiết kế cần nhỏ hơn, phải test iOS thật.

---

# 30. Keyboard Mobile

Khi keyboard mở:

- input đang focus phải nhìn thấy
- modal không bị vỡ
- bottom action không che input
- scroll hoạt động đúng

Không giả định:

```text
100vh = visible height
```

trên mobile.

---

# 31. Viewport Units

Ưu tiên modern viewport units khi phù hợp:

```css
100dvh
100svh
100lvh
```

Ví dụ:

```css
.app {
  min-height: 100dvh;
}
```

Có fallback nếu target browser yêu cầu.

---

# 32. Performance

Mục tiêu:

- fast first load
- fast subsequent load
- low memory
- low mobile bandwidth usage

Áp dụng:

- code splitting
- lazy loading
- route splitting
- image optimization
- WebP/AVIF khi phù hợp
- responsive images
- font optimization
- tree shaking

---

# 33. Không Bundle Thừa

Không import nguyên package nếu chỉ dùng một phần.

Không bundle:

- editor lớn
- chart library lớn
- date library lớn
- icon pack toàn bộ

nếu không cần.

Ưu tiên import theo module.

---

# 34. Image

Ảnh phải:

- lazy load
- có width/height
- tránh layout shift
- có responsive size

Ví dụ:

```html
<img
  src="/image.webp"
  width="800"
  height="600"
  loading="lazy"
  decoding="async"
/>
```

---

# 35. Accessibility

Mục tiêu:

```text
WCAG AA
```

Các màn hình chính phải có:

- semantic HTML
- label form
- keyboard navigation
- focus state
- contrast hợp lý
- accessible button
- accessible dialog

Không biến toàn bộ app thành:

```html
<div onclick="...">
```

---

# 36. Reduced Motion

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    transition-duration: 0.01ms;
  }
}
```

Không animation quá mức ở business app.

---

# 37. Responsive Test

Test tối thiểu:

```text
320px
375px
390px
430px
768px
1024px
1440px
```

Không hardcode chỉ cho:

```text
iPhone 13
iPhone 15 Pro Max
```

---

# 38. Orientation

Nếu hỗ trợ landscape:

- test keyboard
- test safe area
- test bottom bar
- test modal
- test table
- test navigation

Không mặc định portrait-only trừ khi requirement bắt buộc.

---

# 39. PWA Architecture

Khuyến nghị:

```text
src/
  app/
  components/
  features/
  services/
  api/
  db/
  hooks/
  utils/
  pwa/

public/
  icons/
  offline.html
  manifest.webmanifest
```

---

# 40. PWA Modules

Khuyến nghị:

```text
src/pwa/
  registerServiceWorker.ts
  updateManager.ts
  installManager.ts
  connectivityManager.ts
  pushManager.ts
  syncManager.ts
```

Tách PWA logic khỏi:

```text
business logic
UI components
API implementation
```

---

# 41. Connectivity Manager

Không chỉ dựa vào:

```js
navigator.onLine
```

vì nó không đảm bảo server truy cập được.

Có thể dùng:

```text
navigator.onLine
+
API health check
+
request error
```

để xác định trạng thái thực tế.

---

# 42. Network Timeout

Fetch quan trọng phải có timeout.

Ví dụ:

```js
const controller = new AbortController();

const timeout = setTimeout(() => {
  controller.abort();
}, 15000);

try {
  const response = await fetch(url, {
    signal: controller.signal
  });
} finally {
  clearTimeout(timeout);
}
```

Không để request treo vô hạn.

---

# 43. Error Handling

Mọi API call phải phân loại:

```text
network error
timeout
4xx
401
403
404
409
422
429
5xx
```

Không:

```js
catch {
  alert('Có lỗi');
}
```

cho mọi tình huống.

---

# 44. Optimistic UI

Chỉ dùng optimistic UI khi có rollback rõ ràng.

Ví dụ:

```text
User update status
     ↓
UI cập nhật
     ↓
API fail
     ↓
Rollback / show failed
```

Không để UI báo thành công nếu server chưa lưu và không có queue.

---

# 45. Upload

Nếu app upload ảnh/file:

Phải hỗ trợ:

- progress
- cancel nếu phù hợp
- retry
- failure state
- file size validation
- file type validation

Không cache upload request trong Service Worker.

---

# 46. Security

Bắt buộc HTTPS trong production.

Không expose:

- secret key
- database password
- private API key
- service account
- signing secret

trong frontend bundle.

Frontend env chỉ chứa public configuration.

---

# 47. CSP

Nếu project production nghiêm túc, nên cấu hình Content Security Policy phù hợp.

Không dùng:

```text
unsafe-eval
unsafe-inline
```

một cách tùy tiện.

---

# 48. Storage Quota

Dữ liệu IndexedDB/cache không được tăng vô hạn.

Phải có:

- cleanup strategy
- retention rule
- max cache entries
- expiry

Có thể kiểm tra:

```js
navigator.storage?.estimate()
```

nếu browser hỗ trợ.

---

# 49. Persistent Storage

Nếu app thực sự phụ thuộc offline data, có thể feature-detect:

```js
navigator.storage?.persist()
```

Nhưng không được giả định request sẽ luôn được chấp nhận.

---

# 50. App Lifecycle

App phải chịu được:

```text
open
background
resume
reload
close
reopen
offline
online
session expired
service worker updated
```

Không phụ thuộc vào state chỉ nằm trong memory.

---

# 51. Session Recovery

Nếu user đang nhập form dài:

khuyến nghị autosave draft vào IndexedDB.

Ví dụ:

```text
draft-orders
draft-messages
draft-customer-notes
```

Sau crash/reload:

```text
Khôi phục dữ liệu đang nhập?
```

---

# 52. Logging

Production không spam:

```text
console.log
```

Không log:

- password
- token
- cookie
- customer private data
- full API response nhạy cảm

Có error reporting layer nếu project cần.

---

# 53. Analytics

Analytics không được:

- block UI
- làm app crash
- lưu dữ liệu nhạy cảm không cần thiết

Analytics phải là dependency phụ.

App phải hoạt động nếu analytics bị block.

---

# 54. Progressive Enhancement

Nguyên tắc:

```text
Core feature phải hoạt động
↓
Browser có capability nâng cao
↓
Enable enhancement
```

Ví dụ:

```js
if ('share' in navigator) {
  // native share
} else {
  // copy link fallback
}
```

---

# 55. Web Share

Nếu dùng:

```js
navigator.share()
```

phải có fallback:

```text
Copy link
```

---

# 56. Clipboard

Nếu dùng Clipboard API:

phải có fallback và error handling.

Không giả định permission luôn được cấp.

---

# 57. Camera / Media

Nếu project cần camera:

feature detect:

```js
navigator.mediaDevices?.getUserMedia
```

Phải có fallback:

```html
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

khi phù hợp.

---

# 58. File Handling

Không assume File System Access API có trên Safari.

Nếu dùng API Chromium-specific:

phải có:

```text
fallback input[type=file]
```

---

# 59. Background Tasks

Không thiết kế core business logic phụ thuộc hoàn toàn vào:

```text
Background Sync
Periodic Background Sync
```

Các API background chỉ là enhancement.

Core sync phải hoạt động qua:

- app start
- app resume
- online event
- manual retry

---

# 60. PWA Install Detection

Không có một API install-state hoàn hảo cho mọi platform.

Sử dụng combination phù hợp:

```text
display-mode
window.navigator.standalone
app state
```

Không hard-code riêng một browser.

---

# 61. App Install Banner

Không spam install banner.

Chỉ hiển thị khi:

- user đã sử dụng app một thời gian hợp lý
- app chưa installed
- browser/platform phù hợp

Cho phép dismiss.

Nhớ trạng thái dismiss trong khoảng thời gian hợp lý.

---

# 62. UI States

Mỗi màn hình dữ liệu cần nghĩ đủ:

```text
loading
loaded
empty
error
offline
stale
retrying
```

Không chỉ:

```text
loading / loaded
```

---

# 63. Stale Data

Nếu đang offline và hiển thị cache:

phải cho user biết khi phù hợp:

```text
Dữ liệu được lưu từ 10:32
```

hoặc:

```text
Đang hiển thị dữ liệu offline
```

Không giả vờ dữ liệu realtime.

---

# 64. Realtime

Nếu app dùng:

- WebSocket
- SSE
- realtime backend

thì phải có:

```text
reconnect
backoff
connection state
fallback fetch refresh
```

Không reconnect vòng lặp liên tục.

---

# 65. Retry Backoff

Nên dùng:

```text
exponential backoff
```

Ví dụ:

```text
1s
2s
4s
8s
...
```

có max delay.

Không spam API mỗi 100ms.

---

# 66. API Idempotency

Nếu offline queue gửi thao tác tạo dữ liệu:

backend nên hỗ trợ idempotency.

Ví dụ:

```text
clientMutationId
idempotencyKey
```

để tránh tạo trùng khi retry.

---

# 67. Server Requirements

Backend/server phải hỗ trợ PWA SPA routes.

Ví dụ:

```text
/orders/123
```

không được 404 khi refresh.

Server cần rewrite về:

```text
/index.html
```

đối với client-side route hợp lệ.

Không rewrite:

```text
/api/*
```

về index.html.

---

# 68. Headers

Static assets có hash:

```text
Cache-Control: public, max-age=31536000, immutable
```

HTML entry:

không cache quá dài.

Service Worker:

phải đảm bảo update có thể được phát hiện.

---

# 69. Service Worker Scope

Kiểm tra scope đúng.

Nếu service worker ở:

```text
/sw.js
```

thì scope dễ phủ toàn app.

Không đặt service worker ở folder sâu rồi ngạc nhiên vì route ngoài scope không được intercept.

---

# 70. Build Version

App nên expose version:

```text
APP_VERSION
BUILD_ID
```

để debug.

Ví dụ Settings/About:

```text
Version 1.4.2
Build 20261004.1
```

---

# 71. Debug Panel

Development có thể có panel:

```text
SW state
cache version
app version
network status
sync queue count
push status
```

Production chỉ expose phần an toàn.

---

# 72. Development Mode

Service Worker có thể gây cache cũ khi dev.

Cần cấu hình dev rõ ràng.

Không để developer mất hàng giờ vì SW cũ giữ bundle cũ.

---

# 73. Production Only Rules

Một số caching behavior nên bật production-only nếu dev experience bị ảnh hưởng.

Phải document rõ.

---

# 74. Framework Rules

Nếu project dùng:

```text
Next.js
React
Vue
Nuxt
SvelteKit
Angular
```

thì implementation được phép khác nhau.

Nhưng các requirement trong file này vẫn giữ nguyên.

Không để framework quyết định architecture mà không kiểm tra behavior thực tế.

---

# 75. Workbox

Có thể dùng Workbox nếu phù hợp.

Không bắt buộc.

Nếu dùng Workbox:

- hiểu strategy
- cấu hình expiry
- cấu hình routes cụ thể
- không dùng default magic config mà không hiểu cache behavior

---

# 76. Vite PWA Plugins

Có thể dùng plugin PWA cho Vite.

Nhưng plugin không thay thế requirement về:

- IndexedDB
- offline mutation
- update UX
- iOS behavior
- push
- safe area
- error recovery

---

# 77. Lighthouse

Lighthouse là tool kiểm tra phụ.

Không được coi:

```text
Lighthouse 100
```

là bằng chứng PWA hoàn thành.

Quan trọng hơn là test trên thiết bị thật.

---

# 78. Testing Matrix

Test:

## iPhone Safari

- browser mode
- Add to Home Screen
- standalone
- offline
- reload
- app reopen
- keyboard
- safe area
- push nếu có

## Android Chrome

- install
- standalone
- offline
- update
- push nếu có

## Desktop

- Chrome
- Edge
- Safari macOS nếu relevant

---

# 79. Network Test

Test ít nhất:

```text
Online
Offline
Slow 3G
High latency
Timeout
API 500
API 429
API 401
Reconnect
```

---

# 80. Update Test

Test:

```text
Open old version
Deploy new version
SW detects update
User receives update UI
User đang nhập form
User chooses update
App reloads safely
```

---

# 81. Data Loss Test

Test:

```text
User nhập form
network disconnect
user submit
app reload
network reconnect
sync resumes
data not lost
```

Đây là acceptance test quan trọng.

---

# 82. Offline Startup Test

Test:

```text
App đã từng mở online
close app
turn off internet
reopen installed PWA
```

App phải mở được ít nhất app shell/offline UI.

---

# 83. Fresh Install Offline

Không yêu cầu app chưa từng mở online phải offline hoàn chỉnh.

Nhưng behavior phải graceful.

---

# 84. Storage Cleanup Test

Test cache/database sau thời gian sử dụng.

Không để:

```text
cache 2GB
image cache vô hạn
sync queue không xóa item thành công
```

---

# 85. Push Test

Nếu có push:

Test:

```text
permission denied
permission granted
subscription expired
subscription changed
user logout
multiple devices
installed iOS PWA
Android
```

---

# 86. Accessibility Test

Test:

- keyboard
- screen reader basics
- focus
- modal
- form labels
- contrast
- reduced motion

---

# 87. Acceptance Criteria

PWA chỉ được xem hoàn thành khi:

- [ ] Có valid manifest
- [ ] Có icon 192
- [ ] Có icon 512
- [ ] Có maskable icon
- [ ] Có apple-touch-icon
- [ ] Add to Home Screen hoạt động
- [ ] Standalone mode hoạt động
- [ ] Safe area đúng trên iPhone
- [ ] Không bị Home Indicator che
- [ ] Keyboard không che input quan trọng
- [ ] Deep link hoạt động
- [ ] Refresh route không 404
- [ ] Service Worker register thành công
- [ ] Offline app shell hoạt động
- [ ] Offline fallback hoạt động
- [ ] Cache có version
- [ ] Cache cũ được cleanup
- [ ] API không bị cache mù
- [ ] Private auth data không bị cache sai
- [ ] IndexedDB hoạt động nếu app có local data
- [ ] Offline mutation queue hoạt động nếu app có mutation
- [ ] Retry hoạt động
- [ ] Reconnect hoạt động
- [ ] Update UI an toàn
- [ ] Không force reload giữa lúc nhập form
- [ ] Install UX không spam
- [ ] iOS install flow có fallback
- [ ] Push permission không request ngay khi mở app
- [ ] Logout clear private state đúng
- [ ] Mobile UI usable
- [ ] Không có lỗi console nghiêm trọng
- [ ] Không có uncaught promise rejection
- [ ] Không phụ thuộc API Chromium-only mà không có fallback

---

# 88. AI Coding Rules

AI phải thực hiện các quy tắc sau.

## Trước khi code

AI phải:

1. đọc file này
2. xác định stack hiện tại
3. kiểm tra PWA implementation hiện tại
4. không rewrite toàn bộ app nếu không cần
5. giữ backward compatibility khi có thể

---

## Khi thêm một API web mới

AI phải tự hỏi:

```text
Safari support?
iOS installed PWA support?
Android support?
Desktop support?
Fallback là gì?
```

Nếu không chắc:

không được giả định.

---

## Không tự tiện

AI không được tự tiện:

- thay auth architecture
- đổi database
- xóa local data
- thay service worker strategy toàn bộ
- thêm dependency lớn
- force update
- cache toàn bộ API

nếu không có lý do kỹ thuật rõ ràng.

---

# 89. AI Output Requirement

Khi sửa PWA code, AI phải báo:

```text
Files changed
Reason
Browser impact
Offline impact
Cache impact
Migration needed?
Manual test required?
```

Không chỉ trả:

```text
Done
```

---

# 90. Definition of Done

Một feature liên quan PWA chỉ Done khi:

```text
Implemented
+
Browser fallback checked
+
Offline behavior checked
+
Update impact checked
+
Data-loss risk checked
+
Mobile UX checked
```

---

# 91. Nguyên Tắc Cuối Cùng

Ưu tiên:

```text
Reliable > Clever
Standards > Browser hacks
Data safety > Animation
Progressive enhancement > Chromium-only
Real device testing > Lighthouse score
Maintainability > Magic plugin config
```

Nếu một tính năng PWA mới làm tăng đáng kể nguy cơ:

- mất dữ liệu
- stale data
- authentication bug
- cache bug
- iOS compatibility bug

thì ưu tiên giải pháp đơn giản và an toàn hơn.

---

# 92. Checklist Cho AI Trước Mỗi Commit

```text
[ ] Có ảnh hưởng Service Worker?
[ ] Có ảnh hưởng cache?
[ ] Có ảnh hưởng IndexedDB?
[ ] Có migration?
[ ] Offline có còn hoạt động?
[ ] iOS Safari có fallback?
[ ] Installed PWA có hoạt động?
[ ] Có nguy cơ mất draft?
[ ] Có nguy cơ force reload?
[ ] Có cache private data?
[ ] Deep link có còn hoạt động?
[ ] Mobile keyboard có vấn đề?
[ ] Safe area có vấn đề?
```

Nếu có một mục chưa rõ, phải kiểm tra trước khi coi task hoàn thành.
