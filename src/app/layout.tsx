import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Định vị 30 Ô Kho · Mã sản phẩm độc bản",
  description:
    "Web App quản lý định vị mã sản phẩm tại 30 ô kho, tìm kiếm phát sáng ô kho, webhook Zalo và giả lập tin nhắn Zalo.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className="h-full bg-slate-50 antialiased">
      <body className="min-h-full bg-slate-50 text-slate-800">{children}</body>
    </html>
  );
}
