'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { format } from 'date-fns';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/briefing', label: 'Briefing' },
  { href: '/sources', label: 'Sources' },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Top Nav Bar */}
      <nav className="bg-bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo + Nav Links */}
            <div className="flex items-center gap-8">
              <Link href="/" className="text-lg font-bold text-text-primary tracking-tight">
                Daily Briefing
              </Link>
              <div className="flex items-center gap-1">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-accent bg-accent-muted'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div className="text-sm text-text-muted hidden sm:block">
              {today}
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main className="max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
