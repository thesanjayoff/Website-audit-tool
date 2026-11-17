import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ScanSearch size={20} className="text-[var(--accent)]" />
          <span>Website Audit Tool</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--text)]">Dashboard</Link>
          <Link href="/settings" className="hover:text-[var(--text)]">Settings</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
