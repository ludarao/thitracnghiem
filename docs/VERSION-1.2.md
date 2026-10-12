# Phiên bản 1.2 — dự thi bằng Số hiệu

Nhánh: `codex/service-number-v1.2`. Tag: `v1.2.0`. Dựa trên bản 1.1; không sửa main hoặc nhánh 1.1.

## Người dự thi

Form chỉ có:
1. Số hiệu (ví dụ `649-605`).
2. Đơn vị, chọn từ danh sách cấu hình hiện có.

Số hiệu là mã thí sinh. Giữ nguyên số 0 ở đầu và dấu gạch ngang; chỉ bỏ khoảng trắng ở đầu/cuối. Chấp nhận chữ số và dấu gạch ngang ngăn nhóm chữ số, tối đa 32 ký tự. Cùng số hiệu là cùng một thí sinh dù đổi đơn vị; số hiệu khác là hồ sơ khác. Vì không thu thập thông tin khác, cần cung cấp đúng số hiệu của mình.

Server chỉ lưu số hiệu, mã thí sinh và đơn vị trong hồ sơ/lượt mới. Không lấy tên, điện thoại, cấp bậc hoặc chức vụ kể cả request có gửi thêm. Số hiệu mới dùng `Candidate.code` hiện có làm khóa unique.

Chấm bài và thống kê giữ nguyên quy tắc lấy điểm cao nhất trong mỗi kỳ thi; bằng điểm chọn lượt nộp mới hơn. Đơn vị thống kê lấy từ lượt được chọn. Bài đang làm và kết quả hiển thị số hiệu; lịch sử Admin và xuất Excel có cột số hiệu/mã thí sinh và đơn vị.

Turnstile và các công tắc của 1.1 được giữ nguyên. Nếu muốn không yêu cầu xác minh, đặt `TURNSTILE_ENABLED=false` và redeploy. Không sử dụng Attack Mode.

## Database và triển khai

Migration `202610120001_service_number` chỉ cho phép trường `Candidate.phone` để trống. Không xóa bảng, cột, dữ liệu hay index. Hồ sơ cũ vẫn giữ điện thoại; hồ sơ mới không lưu điện thoại. Lưu bản sao database trước khi migration Production.

Vercel Build Command cần là `npm run vercel-build`, lệnh này chạy migration trước khi build. `npm run build` riêng không áp dụng migration. Nếu chưa chạy migration thì việc tạo hồ sơ mới có thể lỗi do phone bắt buộc trong schema cũ.

Tạo Preview từ nhánh mới, đảm bảo có DATABASE_URL và DATABASE_URL_UNPOOLED đúng môi trường. Nếu bật Turnstile, hostname mới phải nằm trong widget Cloudflare tương ứng, cùng với Site Key/Secret Key. Kiểm tra ở database riêng trước khi đưa lên Production.

Kết quả theo điện thoại ở phiên bản cũ được giữ nguyên nhưng không tự gộp với hồ sơ theo số hiệu: chưa có dữ liệu ánh xạ hai kiểu nhận diện. Không tự suy ra hoặc xóa kết quả cũ. Nên tổ chức đợt thi dùng số hiệu riêng nếu cần thống kê tách khỏi hồ sơ cũ.

## Quay lại

Có thể chọn deployment của 1.1 hoặc bản trước Turnstile để rollback code. Không cần ép lại trường phone bắt buộc, vì schema nullable vẫn giữ được dữ liệu cũ. Các hồ sơ số hiệu không có điện thoại sẽ không được nhận diện bằng form điện thoại của bản cũ; dữ liệu vẫn được lưu. Không chạy migration đảo chiều đặt phone NOT NULL khi còn hồ sơ số hiệu.

Các test kiểm tra hai trường, loại bỏ trường thừa, giữ số hiệu chính xác, thi lại, điểm cao nhất, đơn vị hợp lệ, nộp trùng và xác minh. Build/typecheck được kiểm tra; chưa áp dụng migration hoặc nộp thử vào database Production.
