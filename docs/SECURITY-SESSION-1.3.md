# Bảo vệ phiên thi và phục hồi phiên bị hủy — bản 1.3

## Các thay đổi

- Phiên mới có token v2 gồm nonce ngẫu nhiên và chữ ký HMAC-SHA256. GET/PATCH kiểm tra định dạng/chữ ký trước truy vấn Attempt. Không thay schema database; chỉ thêm attemptTokenVersion=2 vào cấu hình snapshot của lượt mới.
- Phiên Admin mới cũng có chữ ký HMAC với ngữ cảnh riêng; token thi không thể làm cookie Admin. Cookie giả bị loại trước bước đọc/xóa AdminSession, gồm cả API cấu hình và đăng xuất. Phiên Admin cũ được giữ bằng allowlist tối đa 10.000 token hash, tải một lần/5 phút/worker; đặt LEGACY_ADMIN_COMPAT=false khi không cần giữ các phiên cũ (người dùng phải đăng nhập lại).
- Token giả v2 bị trả 401 ATTEMPT_INVALID, không đọc DB. Phiên hợp lệ nhưng đã bị xóa trả 410 ATTEMPT_GONE. Client phân biệt hai trường hợp này với mất mạng: ngừng tự gửi lại, cho xác nhận bỏ bản lưu và đăng ký lượt mới trong cả popup giám sát.
- Phiên bị khóa nhưng mất mạng vẫn có Thử nộp lại và lựa chọn xác nhận kết thúc để thi lại. Chỉ bỏ bản lưu khi xác nhận; kết quả đã nộp trước vẫn giữ.
- Mỗi worker giới hạn theo token: tối đa 6 request nộp/phút, 30 request đọc/phút. Trả 429 và Retry-After: 60. Người khác không dùng chung bucket, kể cả cùng IP. Map tối đa 20.000 bucket; không thêm truy vấn Redis hay request trình duyệt định kỳ.
- Trang bảng kết quả ngoài phạm vi trả rỗng trước truy vấn chi tiết và không tạo cache theo trang rỗng. Snapshot tổng vẫn dùng cache hiện có.
- Lỗi xác thực/giới hạn dự kiến không ghi stack trace mỗi lần để giảm tải log.

## Cấu hình Vercel

Nên đặt EXAM_TOKEN_SECRET ở Environment Variables: loại Secret, chuỗi ngẫu nhiên ít nhất 32 ký tự, cùng giá trị giữa các deployment phục vụ cùng database. Không đưa vào biến NEXT_PUBLIC_. Lưu ở môi trường cần triển khai rồi redeploy.

Nếu chưa đặt EXAM_TOKEN_SECRET, server dùng TURNSTILE_SECRET_KEY hiện có (cũng phải ít nhất 32 ký tự). Không dùng mật khẩu Admin làm khóa ký. Nếu thiếu cả hai hoặc khóa quá ngắn, tạo lượt mới trả 503 SECURITY_NOT_CONFIGURED; không tự tắt bảo vệ.

Không đổi khóa ký khi đang có người thi: chữ ký các token v2 đang dùng sẽ không còn hợp lệ. Nếu đổi từ khóa Cloudflare dự phòng sang EXAM_TOKEN_SECRET, dùng cùng giá trị hiện có cho giai đoạn chuyển tiếp hoặc triển khai sau khi các lượt v2 đã hoàn tất. Sau đó có thể đổi sang secret riêng trong thời gian bảo trì.

Nếu rollback về code trước thay đổi này, API cũ không nhận token v2 mới. Chờ các lượt v2 kết thúc trước rollback, hoặc dùng bản có hỗ trợ cả hai định dạng; rollback giữa lúc đang thi có thể buộc người dùng đăng ký lượt mới.

## Tương thích phiên cũ

Token 64 ký tự của bản cũ vẫn được hỗ trợ bằng danh sách hash lấy từ những Attempt không có attemptTokenVersion. Mỗi worker chỉ tải danh sách một lần trong 5 phút, cùng Promise cho các request đồng thời, tối đa 100.000 hash. Token không nằm trong danh sách không tạo truy vấn tìm phiên riêng. Khi DB đọc danh sách thất bại, giữ lỗi 30 giây để tránh retry DB dồn dập. Xóa dữ liệu làm mới cache ở worker xử lý việc xóa; worker khác sẽ nhận 410 khi tra phiên đã bị xóa.

Cơ chế này có một lần đọc danh sách DB khi cache cũ chưa có/hết hạn, kể cả request đầu là token cũ giả. Vì vậy không mô tả token cũ là hoàn toàn không chạm DB. Khi không còn phiên cũ cần phục hồi, đặt LEGACY_ATTEMPT_COMPAT=false rồi redeploy để loại cả lần đọc tương thích này. Thay đổi này sẽ từ chối mọi phiên cũ.

Nên triển khai trong lúc không có request bắt đầu từ bản cũ đang chạy: lượt cũ tạo sau khi một worker đã tải danh sách có thể chưa được nhận diện cho tới lần làm mới cache (tối đa 5 phút). Phiên cũ có trước lần tải danh sách vẫn tiếp tục được.

## Phạm vi chống lạm dụng

Đây là bảo vệ phía ứng dụng để giảm đọc DB từ mã giả và spam một phiên. Giới hạn nằm trong bộ nhớ từng worker, không phải giới hạn tổng trên mọi Vercel instance. Token v2 đúng chữ ký vẫn phải đọc DB để xác nhận phiên tồn tại. Turnstile vẫn bảo vệ tạo lượt/đăng nhập; không gọi lại Turnstile khi nộp.

Không có thay đổi tự động vào Firewall Vercel hoặc Attack Mode. Requests bị loại vẫn có thể tốn function invocation/CPU; cần cấu hình lớp bảo vệ trước function nếu muốn hạn chế cả quota này. Không coi thay đổi này là bảo đảm chống mọi DDoS. Giữ nguyên chính sách nhận bài offline và các lỗi ưu tiên vừa khác trong báo cáo audit.
