import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

export function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ScanSearch size={20} className="text-[var(--accent)]" />
          <span>Website Audit Tool</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" render={<Link href="/" />}>
            Dashboard
          </Button>
          <Button variant="ghost" size="sm" render={<Link href="/settings" />}>
            Settings
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
