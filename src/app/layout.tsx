import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavBar } from "@/components/NavBar";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Preloader } from "@/components/Preloader";
import { Manrope, DM_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Website Audit Tool",
  description: "Local, single-user agency tool for auditing client websites.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", manrope.variable, dmMono.variable)}>
      <body className="min-h-screen antialiased">
        <Providers>
          <SmoothScroll />
          <Preloader />
          <NavBar />
          <main className="mx-auto max-w-6xl px-[var(--gutter)] py-[var(--section-y)]">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
