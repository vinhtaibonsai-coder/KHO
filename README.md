# Hệ thống kho nội bộ

Ứng dụng Next.js 16 quản lý vị trí hàng, nhận dữ liệu từ Zalo bot và lưu trên Supabase. Giao diện/API nghiệp vụ được bảo vệ bằng PIN; webhook dùng secret riêng.

## Cấu hình

Yêu cầu Node.js 20.9+. Sao chép `.env.example` thành `.env.local`, rồi tạo giá trị:

```powershell
npm run auth:hash-pin -- 123456
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Đặt kết quả đầu vào `APP_PIN_HASH`. Chạy lệnh random hai lần cho `SESSION_SECRET` và `ZALO_WEBHOOK_SECRET`. Đặt cùng webhook secret trong `zalo-bot/.env`. Không commit các file env. `SUPABASE_SERVICE_ROLE_KEY` chỉ nằm phía server, không dùng tiền tố `NEXT_PUBLIC_`.

## Supabase

Với hệ thống hiện hữu, chạy thủ công `supabase_migration_security_v2.sql` trong Supabase SQL Editor. Browser không còn truy cập Supabase trực tiếp; Next.js dùng service role và giao diện polling `/api/items` mỗi 10 giây.

## Chạy và kiểm tra

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
