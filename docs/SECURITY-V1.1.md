# Phiên bản 1.1 — bảo vệ chống spam

Bản mới ở nhánh `codex/anti-abuse-v1.1`. Bản đang chạy trước thay đổi giữ ở `backup/pre-anti-abuse-2026-10-12` (commit 4b6fb9f). Không sử dụng Vercel Attack Mode. Không đổi schema, không xóa dữ liệu, không đổi cách lấy điểm cao nhất.

## Các thay đổi

- Turnstile tại bước bắt đầu thi và đăng nhập Admin. Server xác minh token, action và hostname trước khi truy vấn database. Không xác minh khi chọn đáp án hay nộp bài.
- Token hết hạn/thất bại có nút thử lại; thông tin nhập giữ nguyên. Token được làm mới sau lần gửi. Khi script không tải được, hướng dẫn kiểm tra mạng/tải lại trang.
- Server từ chối dữ liệu vượt 128 KB ở API thi, vượt 4 KB ở API mật khẩu; kiểm tra cả dữ liệu thực, không chỉ Content-Length. JSON sai, sai Content-Type và mã lượt không đúng 64 ký tự hex bị từ chối sớm.
- Lỗi dịch vụ xác minh trả 503, không tự bỏ qua bảo vệ. Thiếu cấu hình khi đã bật cũng không cho bắt đầu/đăng nhập.
- Lỗi phản hồi không phải JSON được hiển thị rõ; bài đang làm vẫn dùng cơ chế lưu local và gửi lại hiện có.
- Không thêm database operations để đếm spam. Không giới hạn IP dùng chung mạng trong code. Vẫn cần Firewall để chặn lưu lượng trước khi vào Function; đây không phải bảo đảm chống mọi DDoS.

## Cấu hình trước khi chạy thật

1. Tạo widget Cloudflare Turnstile, cho phép đúng hostname production của web. Preview dùng widget riêng hoặc thêm hostname phù hợp. Site Key công khai; Secret Key chỉ được đặt ở server, không dùng tiền tố NEXT_PUBLIC.
2. Đặt Vercel Environment Variables cho đúng môi trường:
   - `TURNSTILE_SITE_KEY`: Site Key.
   - `TURNSTILE_SECRET_KEY`: Secret Key.
   - `TURNSTILE_ENABLED=true`.
3. Deploy nhánh mới vào Preview trước. Kiểm tra bắt đầu, token hết hạn, đăng nhập, nộp bài, mạng đơn vị/điện thoại. Không nộp bài giả vào production.
4. Khi đã kiểm tra xong mới đưa nhánh mới vào main/Production. Nếu không đặt `TURNSTILE_ENABLED=true`, xác minh tắt để bản mới không làm khóa người dùng khi chưa có khóa.

Muốn tắt yêu cầu xác minh khi dịch vụ gặp sự cố: đặt `TURNSTILE_ENABLED=false`, redeploy. Đây là công tắc môi trường, không phải nút Admin; cần quyền truy cập Vercel. Mức bảo vệ chống bot giảm khi tắt.

## Firewall và việc chưa thực hiện tự động

Không thay đổi Firewall của tài khoản trong phiên bản này. Đề xuất tạo rule rate limit riêng POST `/api/admin` trên Vercel, bắt đầu ở chế độ Log để kiểm tra, rồi áp dụng ngưỡng phù hợp (ví dụ ban đầu 10 yêu cầu/phút/IP cho ít quản trị viên). Không dùng ngưỡng này cho API thi vì hàng trăm người có thể chung IP. Kiểm tra hạn mức/giá thực tế trước khi bật rule.

Cơ chế khóa Admin sau nhiều lần nhập sai của bản cũ vẫn được giữ; Turnstile làm khó spam tự động, nhưng không loại bỏ hoàn toàn khả năng gây khóa tài khoản. Không bỏ khóa chung khi chưa có giới hạn phân tán thay thế. Rule Firewall và thay cơ chế khóa cần kiểm thử riêng.

Cache cấu hình công khai chưa được đổi sang CDN trong bản này: API hiện ghép phản hồi công khai và Admin; không cache CDN nguyên endpoint vì có nguy cơ lộ ngân hàng câu hỏi. Có thể tách endpoint ở phiên bản sau.

Chưa thử widget thật trên trình duyệt hoặc xác minh tải 500 người khi bật Turnstile vì chưa có khóa. Các test mock kiểm tra hợp đồng server, lỗi dịch vụ, action/hostname, từ chối trước khi tạo dữ liệu và giới hạn JSON. Các test cũ tiếp tục kiểm tra chấm bài, offline/retry, điểm cao nhất và giữ lịch sử.

## Quay về bản cũ

Trong Vercel chọn deployment Production trước phiên bản này và thực hiện rollback/promote theo UI của Vercel. Đây là cách quay lại nhanh; không reset/force push main.

Nếu cần triển khai lại từ source, tạo deployment từ tag `backup/pre-anti-abuse-2026-10-12` hoặc commit `4b6fb9f`. Đặt `TURNSTILE_ENABLED=false` nếu dùng bản code mới mà chỉ muốn tắt xác minh. Database của bản mới tương thích bản cũ, không có migration cần đảo ngược.
