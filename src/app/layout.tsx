import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "基音儀表板 v2",
  description: "離線優先的工廠監測與歷史分析儀表板",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
