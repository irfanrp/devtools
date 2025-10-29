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
        <div className="flex min-h-screen flex-col">
          <header className="app-header">
            <div className="container mx-auto h-[var(--header-height)] flex items-center justify-between px-4">
              <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <img src="/file.svg" alt="logo" className="w-8 h-8" />
                <div className="text-lg font-semibold">DevFormat</div>
              </a>
              <div className="flex items-center gap-4">
                <nav className="hidden md:flex gap-4 text-sm">
                  <a href="/generate" className="text-muted hover:text-foreground transition-colors">Generate</a>
                  <a href="/" className="text-muted hover:text-foreground transition-colors">Home</a>
                </nav>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="flex-1 mt-[var(--header-height)]">{children}</main>

          <footer className="app-footer">
            <div className="container mx-auto h-[var(--header-height)] flex items-center justify-between px-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold">DevFormat</span>
                <span className="hidden sm:inline"> — Smart DevOps Formatter &amp; Generator</span>
              </p>
              <div className="flex items-center space-x-4">
                <p className="text-sm text-muted-foreground">Built with <span aria-hidden>♥️</span></p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
