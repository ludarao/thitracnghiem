# Kiểm thử ngày 07/10/2026 (giờ Việt Nam)

## Kết luận

Quota và dung lượng Free có khả năng đủ cho 5.000 người thi một lượt/tháng với kiến trúc hiện tại. Chưa chứng nhận 500 người bắt đầu/nộp đồng thời trên Vercel + Prisma Free: phần ghi được đo trên localhost; cloud chỉ kiểm thử API dashboard đọc.

## Đo thực tế

- Production build Next.js 16.3.8, Prisma 5.22.0, PostgreSQL 18.4 từ package npm embedded-postgres, trên máy Mac arm64 (binary PostgreSQL báo kiến trúc x86_64). Database riêng, UTF-8, pool app 10 kết nối. Không dùng thí sinh hoặc kết quả thật.
- 10 đợt × 500 thí sinh; trong mỗi đợt gửi 500 POST bắt đầu đồng thời, rồi 500 PATCH nộp đồng thời. Bài 30 câu lấy từ ngân hàng project, đáp án chọn A theo khóa đã đảo; không chạy trình duyệt thực và không đợi 20 phút giữa hai request.
- Đợt đầu: **37/5.000 request nộp lỗi P2034**, do transaction Serializable xung đột. Những request thất bại không được giả định đã nộp. Đã thay bằng update có điều kiện `submittedAt IS NULL` để chốt một lần, không giữ interactive transaction.
- Đợt xác nhận sau sửa: 5.000/5.000 bắt đầu và 5.000/5.000 nộp thành công, 0 request lỗi. P95 lớn nhất trong từng đợt: bắt đầu **1.115 ms**, nộp **493 ms**.
- 500 retry trả nguyên kết quả cũ; 500 request nộp cùng một lượt với hai bộ đáp án khác nhau trả cùng một kết quả, không ghi đè. Tính cả bài race riêng: 5.000 thí sinh, 5.001 lượt đã nộp, một phiên bản ngân hàng đề. Tổng 12.000 request trong các phase, cộng hai request chuẩn bị; đây là concurrency request, không phải 500 tab trình duyệt tồn tại lâu.
- Dashboard local trả đúng 500 người mỗi đơn vị, không đếm lượt thi lại thành người mới. Dữ liệu bảng + index khoảng **18,1 MB**, toàn database khoảng **26,2 MB**. Không bao gồm WAL, backup hay cách nhà cung cấp tính storage. Dữ liệu cũ đầy đủ đề, tên rất dài và nhiều lần thi làm tăng dung lượng.
- Vercel production: **500/500 GET dashboard HTTP 200**, P95 **2.478 ms**, tổng đợt khoảng 3,06 giây. Gửi từ một máy/IP; tất cả header `x-vercel-cache` là MISS, không khẳng định CDN hit hoặc số truy vấn DB đã dùng. Không gửi POST/PATCH bài thi lên production.
- Báo cáo JSON trước sửa có trường idempotent dùng so sánh chuỗi JSON (nhạy thứ tự khóa, và retry bao gồm bài nộp lần đầu thất bại). Không dùng trường này để kết luận chống trùng; lần xác nhận dùng so sánh nội dung sâu, cả idempotent và sameAttemptRace đều true.

## Đối chiếu gói Free

Giả định 5.000 người × một lượt trong cùng tháng, hạn mức tháng chưa bị công việc khác sử dụng hết:

| Hạng mục | Ước tính / đo | Free công bố |
|---|---|---|
| Request nghiệp vụ | 10.000 bắt đầu/nộp, thêm khoảng 5.000 tải cấu hình và thao tác admin/dashboard/retry | Vercel 1.000.000 function invocations, 1.000.000 CDN requests/tháng |
| Database operations | Khoảng 25.000 lời gọi Prisma: 3 lúc bắt đầu, 2 lúc nộp, cộng cache miss/ngân hàng/retry. Dự phòng **25.000–50.000 operations** vì ORM/TCP có thể phát sinh thêm câu SQL; đây là ước tính, chưa đọc billing thực tế | Prisma Postgres 200.000/tháng |
| Dung lượng | Khoảng 26,2 MB database local sau 5.001 lượt | Trang giá Prisma ghi 1,01 GB; phần calculator còn ghi 500 MB, số đo này nhỏ hơn cả hai |
| CPU / RAM Vercel | Chưa đo usage cloud cho phần ghi; số CPU của load generator không đại diện function CPU | 4 active CPU-hours, 360 GB-hours/tháng |

Ba lượt/người làm số operations và lưu trữ tăng gần ba lần; retry nhiều, người xem, tác vụ admin và ứng dụng khác dùng chung quota phải cộng thêm. Không suy ra mức quota *còn lại* của tài khoản từ quota công bố.

500 người đang làm bài không giữ kết nối database vì đáp án lưu trên máy. Hai điểm dồn tải là bắt đầu và nộp. Cloud có độ trễ mạng, cold start, scale nhiều instance và giới hạn pool khác máy local. Phải dùng URL pooled cho runtime. Tài liệu Prisma đang không đồng nhất về số pooled connections (pricing ghi 10, tài liệu pooling ghi 50); cần kiểm tra hạn mức áp dụng trong integration trước buổi thi. Free được FAQ mô tả dành cho evaluation, không phải cam kết tải production. Vercel Hobby giới hạn sử dụng cá nhân, phi thương mại; cần đối chiếu trường hợp tổ chức của người dùng.

Nguồn kiểm tra ngày 07/10/2026:
- [Prisma pricing](https://www.prisma.io/pricing)
- [Prisma FAQ / cách tính operations](https://www.prisma.io/docs/postgres/faq)
- [Connection pooling](https://www.prisma.io/docs/postgres/database/connection-pooling)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## Chạy lại

Cần PostgreSQL riêng trên localhost, database mới tên `quiz_load`, `quiz_load_fixed` hoặc `quiz_load_verified`. Không trỏ vào production. Có thể dùng binary package `@embedded-postgres/darwin-arm64` cài dưới `/tmp`; không thêm dependency database test vào app.

1. Tạo database UTF-8 mới, áp dụng `prisma migrate deploy` bằng hai biến DATABASE_URL và DATABASE_URL_UNPOOLED trỏ vào database đó.
2. Đặt LOAD_TEST_DATABASE_URL tới database local, chạy `node scripts/load-test-seed.mjs`. Script từ chối database có dữ liệu.
3. Build app, chạy `npm run start -- --hostname 127.0.0.1 --port 3097` với DATABASE_URL cùng database và tham số `connection_limit=10&pool_timeout=10`. Xóa riêng cache fetch của build local trước lần đo database mới để tránh snapshot của lần trước.
4. Chạy `node scripts/load-test.mjs` với LOAD_TEST_DATABASE_URL. Script từ chối hostname ngoài localhost và không xóa dữ liệu có sẵn. Kết quả ghi vào `reports/load-test-5000-500.json`; exit code khác 0 nếu lỗi HTTP, sai thống kê hoặc ghi trùng.
5. `node scripts/load-test-readonly.mjs` gửi 500 GET public tới dashboard Vercel và ghi báo cáo riêng. Không thử đường ghi cloud.

Muốn chứng nhận phần ghi trên Free phải chạy cùng harness trên một staging Vercel + Prisma tách riêng, theo dõi quota, độ trễ P95/P99, lỗi pool/timeout, thử cache lạnh và nhiều instance. Bộ kiểm thử hiện tại cố ý chặn target ngoài localhost cho đường ghi, để không làm bẩn production.
