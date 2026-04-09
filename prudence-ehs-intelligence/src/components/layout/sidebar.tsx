'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FilePlus2,
  FileSearch,
  BookOpen,
  Library,
  AlertTriangle,
  Settings,
  Shield,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'New Review', href: '/reviews/new', icon: FilePlus2 },
  { name: 'Reviews', href: '/reviews', icon: FileSearch },
  { name: 'Rule Library', href: '/rules', icon: BookOpen },
  { name: 'Reference Library', href: '/references', icon: Library },
  { name: 'Expert Queue', href: '/escalations', icon: AlertTriangle },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Shield className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">Prudence</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            EHS Intelligence
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Reference-backed engine
        </p>
        <p className="mt-0.5 text-[10px] text-gray-400">
          Deterministic &middot; Traceable &middot; Citation-linked
        </p>
      </div>
    </aside>
  );
}
