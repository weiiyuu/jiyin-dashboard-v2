import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "極印｜智慧設備監控平台",
  description: "離線優先的工廠監測與歷史分析儀表板",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
