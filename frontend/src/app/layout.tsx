import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "../components/ThemeToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Smart DevOps Formatter & Generator",
  description: "A tool for generating and formatting Terraform configurations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="app-shell min-h-screen flex flex-col">
          <header className="app-header w-full flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <img src="/file.svg" alt="logo" className="w-8 h-8" />
              <div className="text-lg font-semibold">DevFormat</div>
            </div>
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex gap-4 text-sm muted">
                <a href="/generate">Generate</a>
                <a href="/">Home</a>
              </nav>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="app-footer w-full text-sm muted px-6 py-4 border-t">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div>© {new Date().getFullYear()} DevFormat — Minimal Terraform snippets</div>
              <div>
                <a href="https://github.com/irfanrp/devtools" target="_blank" rel="noreferrer" className="underline">Repo</a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
