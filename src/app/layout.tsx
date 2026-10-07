import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata: Metadata = {
  title: "Thi trắc nghiệm trực tuyến",
  description:
    "Hệ thống thi trắc nghiệm trực tuyến, tính điểm và xếp hạng tập thể thi đua",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="text-slate-800 antialiased min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <footer className="bg-white border-t border-amber-200 py-6 mt-12 text-center text-xs text-slate-500">
          <p>
            © {new Date().getFullYear()} Hệ thống Khảo sát & Thi Trắc Nghiệm
            Trực Tuyến.{" "}
          </p>
        </footer>
      </body>
    </html>
  );
}
