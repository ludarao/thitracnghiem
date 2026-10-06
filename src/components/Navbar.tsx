"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BarChart3, Settings, Award } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: "Phòng Thi", href: "/", icon: BookOpen },
    { label: "Số lượng dự thi", href: "/dashboard", icon: BarChart3 },
    { label: "Quản Trị Admin", href: "/admin", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Award className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900 leading-tight text-base sm:text-lg">
                  THI TRẮC NGHIỆM ĐOÀN
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Nghị Quyết Đại Hội Toàn Quốc XIII
                </span>
              </div>
            </Link>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  aria-label={item.label}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-slate-500"}`}
                  />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
