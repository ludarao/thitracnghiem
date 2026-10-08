"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BarChart3, Settings } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: "Phòng Thi", href: "/", icon: BookOpen },
    { label: "Số lượng dự thi", href: "/dashboard", icon: BarChart3 },
    { label: "Quản Trị Admin", href: "/admin", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-t-[10px] border-t-brand-700 border-b border-b-amber-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src="/logo.png"
                alt="Logo Công an nhân dân"
                width={72}
                height={59}
                priority
                className="w-14 sm:w-[72px] h-auto shrink-0"
              />
              <div className="flex flex-col">
                <span className="font-bold text-brand-700 leading-tight text-base sm:text-xl">
                  HỆ THỐNG THI TRẮC NGHIỆM
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  Đội Điều lệnh, Quân sự, Võ thuật, Văn thể
                </span>
              </div>
            </Link>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-center sm:justify-end">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  aria-label={item.label}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? "bg-brand-50 text-brand-700 border-b-2 border-brand-700"
                      : "text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? "text-brand-700" : "text-brand-700"}`}
                  />
                  <span className="inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
