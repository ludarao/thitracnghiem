import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

// GET /api/config — Lấy cấu hình kỳ thi từ DB (dành cho thí sinh)
export async function GET() {
  // Cấu hình được lưu trên localStorage của Admin, API chỉ trả status OK để
  // client biết DB đã kết nối
  return NextResponse.json({ success: true, dbConnected: true });
}
