import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

// POST /api/results — Thí sinh nộp bài, lưu kết quả lên Database
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userInfo,
      score,
      correctCount,
      totalQuestions,
      percentage,
      isPassed,
      totalDurationSeconds,
      startTime,
      endTime,
      submittedAt,
      answers,
    } = body;

    const result = await prisma.examResult.create({
      data: {
        fullName: userInfo.fullName,
        rank: userInfo.rank,
        position: userInfo.position,
        unit: userInfo.unit,
        score,
        correctCount,
        totalQuestions,
        percentage,
        isPassed,
        totalDurationSeconds,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        submittedAt: new Date(submittedAt),
        answersJson: JSON.stringify(answers),
      },
    });

    return NextResponse.json({ success: true, id: result.id }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/results error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống khi lưu kết quả' },
      { status: 500 }
    );
  }
}

// GET /api/results — Dashboard lấy toàn bộ kết quả về để xếp hạng
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get('unit'); // Lọc theo đơn vị (tùy chọn)

    const results = await prisma.examResult.findMany({
      where: unit ? { unit } : undefined,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        rank: true,
        position: true,
        unit: true,
        score: true,
        correctCount: true,
        totalQuestions: true,
        percentage: true,
        isPassed: true,
        totalDurationSeconds: true,
        submittedAt: true,
        startTime: true,
        endTime: true,
        // Không trả answersJson ở danh sách để giảm payload
      },
    });

    // Map về format cũ để Dashboard hiển thị không cần sửa gì
    const mapped = results.map((r) => ({
      id: r.id,
      userInfo: {
        fullName: r.fullName,
        rank: r.rank,
        position: r.position,
        unit: r.unit,
      },
      score: r.score,
      correctCount: r.correctCount,
      totalQuestions: r.totalQuestions,
      percentage: r.percentage,
      isPassed: r.isPassed,
      totalDurationSeconds: r.totalDurationSeconds,
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      submittedAt: r.submittedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, results: mapped });
  } catch (error: any) {
    console.error('GET /api/results error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống khi lấy kết quả' },
      { status: 500 }
    );
  }
}

// DELETE /api/results — Admin xóa toàn bộ kết quả để bắt đầu kỳ thi mới
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const adminKey = searchParams.get('key');

    // Yêu cầu đúng ADMIN_SECRET_KEY mới cho phép xóa
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await prisma.examResult.deleteMany({});
    return NextResponse.json({ success: true, deleted: deleted.count });
  } catch (error: any) {
    console.error('DELETE /api/results error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi xóa kết quả' },
      { status: 500 }
    );
  }
}
