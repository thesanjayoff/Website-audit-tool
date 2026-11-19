"use client";

import Link from "next/link";
import { useState } from "react";
import { ScanSearch, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

export function NavBar() {
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <Button variant="ghost" size="sm" render={<Link href="/" />} onClick={() => setOpen(false)}>
        Dashboard
      </Button>
      <Button variant="ghost" size="sm" render={<Link href="/settings" />} onClick={() => setOpen(false)}>
        Settings
      </Button>
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-[var(--gutter)] py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ScanSearch size={20} className="text-[var(--accent)]" />
          <span>Website Audit Tool</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {links}
          <ThemeToggle />
        </nav>
        <div className="flex items-center gap-1 sm:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </div>

      <div className="circle-menu" data-open={open} aria-hidden={!open}>
        <nav className="flex h-full flex-col items-center justify-center gap-4 text-lg">{links}</nav>
      </div>
    </header>
  );
}
