# Sửa hai lỗi ưu tiên cao và kiểm thử 500 người nộp đồng thời

Ngày: 12/10/2026. Nhánh: codex/local-exam-guard-v1.3; phát triển từ 19039ec. Không thử ghi/xóa hoặc tấn công vào production.

## Kết quả sửa

1. Phiên đã bị xóa/không hợp lệ trả errorCode riêng. Popup khóa bài có thao tác xác nhận bỏ bản lưu và đăng ký lại. Mất mạng vẫn giữ đáp án và cho nộp lại; lỗi phiên đã bị hủy ngừng tự retry khi có mạng. Kết quả các lượt đã nộp trước được giữ.
2. Phiên thi và phiên Admin mới có chữ ký HMAC với ngữ cảnh khác nhau. Token/cookie v2 giả được loại trước truy vấn phiên; token thi không cấp quyền Admin. Cookie giả không gây thao tác xóa phiên đăng nhập. Token cũ dùng allowlist cache theo worker để chuyển tiếp, không truy vấn từng token giả. Giới hạn theo phiên thi: 6 lần nộp/phút, 30 lần đọc/phút mỗi worker. Cùng IP nhưng khác phiên không dùng chung hạn mức. Trang bảng kết quả rỗng không đọc chi tiết hoặc tạo cache trang riêng.

Chi tiết biến môi trường, tương thích và giới hạn nằm trong docs/SECURITY-SESSION-1.3.md. Cần EXAM_TOKEN_SECRET ít nhất 32 ký tự hoặc TURNSTILE_SECRET_KEY hiện có đủ dài. Không dùng mật khẩu Admin làm khóa ký và không thay khóa khi còn người đang thi.

## Kiểm thử tự động

79/79 kiểm thử đạt. Production build và TypeScript đạt. Bổ sung kiểm tra mã giả/cookie giả không đọc hoặc xóa phiên, phân biệt quyền thi/Admin, token cũ, giới hạn theo phiên và thời gian reset, khôi phục snapshot v2 có chữ ký, và thoát popup khi phiên đã bị xóa. Các kiểm thử UI dùng component thật qua React harness, không phải kiểm thử thiết bị/trình duyệt thật.

## Đo tải với PostgreSQL thật

Môi trường: Next.js production build trên localhost, PostgreSQL riêng được tạo mới và áp dụng đủ migration; pool Prisma 10 kết nối, đề 30 câu. Chạy trên máy Mac, Node 24. Không có mạng WAN, cold start/autoscaling Vercel hay pool/giới hạn Prisma cloud. Turnstile tắt trong test local; API nộp không gọi Turnstile ở sản phẩm.

Harness đã được cập nhật từ họ tên/điện thoại sang số hiệu + đơn vị của bản hiện tại. Chạy 5.000 thí sinh, 10 đợt; mỗi đợt 500 bắt đầu đồng thời rồi 500 nộp đồng thời:

| Kiểm tra | Kết quả |
|---|---|
| Bắt đầu | 5.000/5.000 thành công; P95 cao nhất các đợt 692 ms |
| Nộp | 5.000/5.000 thành công; P95 cao nhất các đợt 321 ms; lớn nhất 326 ms |
| Nộp lại | 500/500 trả đúng kết quả cũ |
| Dashboard | 500/500 đúng số người; không đếm lượt thi lại thành người mới |
| Một token bị gửi 500 lần cùng lúc | 6 được nhận, 494 trả 429 như thiết kế; các request được nhận có cùng kết quả, không ghi đè |
| Dữ liệu lưu | 5.000 hồ sơ, 5.001 lượt đã nộp (gồm một bài kiểm tra tranh chấp), một QuestionBank |
| Lỗi ngoài các request bị giới hạn có chủ đích | 0 |

Sau khi bổ sung bảo vệ cookie Admin, khởi động lại bản build cuối và chạy thêm 500 người mới bắt đầu rồi nộp đồng thời:

- 500/500 bắt đầu: P95 1.161 ms, lớn nhất 1.221 ms.
- 500/500 nộp: P95 433 ms, lớn nhất 438 ms; cả đợt phản hồi khoảng 460 ms.
- Database tăng đúng 500 bài đã nộp. Đối chiếu điểm của từng bài với ngân hàng đề và thứ tự đáp án đã đảo: tất cả đúng.
- Theo dõi tiến trình Next.js riêng ở lần bổ sung: khoảng 2,866 CPU-giây trên cửa sổ mẫu 2,150 giây; RSS đỉnh quan sát 308,34 MB. Chín mẫu cách khoảng 250 ms, bao quanh cả bắt đầu+nộp; không tính PostgreSQL hoặc load generator. Không suy ra rò bộ nhớ, CPU billing hay mức chịu tải cloud từ đợt ngắn này. Đợt 5.000 không có số đo CPU hợp lệ theo tiến trình trong lần chạy này; không dùng số CPU của load generator làm CPU của web.

Dữ liệu: reports/load-test-security-5000-500.json; reports/load-test-final-500-submit.json; reports/load-test-final-500-cpu-samples.json. Đã dừng server và PostgreSQL thử sau đo; không xóa database production hoặc tạo bài giả ở đó.

## Kết luận triển khai

Có bằng chứng bản hiện tại nhận và chấm đúng 500 người khác nhau nộp đồng thời trên môi trường thử localhost với PostgreSQL thật/pool 10. Request trong khi chọn đáp án vẫn bằng 0; bảo vệ mới không thêm polling/Redis operations. Tốc độ bắt đầu còn phụ thuộc Turnstile khi bật trên cloud.

Chưa chứng nhận Vercel + Prisma Free chịu được cùng tải: cần staging riêng trên đúng gói/cấu hình để đo ghi 500 đồng thời, P95/P99, timeout pool, cold start và quota thực tế. Giới hạn chống spam trong bộ nhớ từng worker không phải giới hạn chung mọi Vercel instance. Requests bị chặn vẫn có thể tốn function invocation; allowlist phiên cũ có lần đọc DB khi cache lạnh/hết hạn. Không có thay đổi tự động ở Firewall hoặc Attack Mode và không bảo đảm chống mọi DDoS.

Các lỗi vừa còn lại (thời điểm nộp offline, khóa Admin chung, lưu trữ lượt bỏ dở, tính đồng nhất bản xuất, thư viện Excel) chưa sửa trong phạm vi hai lỗi ưu tiên cao này. Giữ nguyên chính sách nhận bài offline/Bug 1 theo yêu cầu trước.
