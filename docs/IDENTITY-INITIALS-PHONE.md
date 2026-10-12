# Nhận diện thí sinh bằng viết tắt họ tên và số điện thoại

Form đăng ký mới gồm:

1. Chữ cái viết tắt họ và tên: ví dụ Phạm Trần Bình nhập ptb.
2. Số điện thoại: ví dụ 0985728123.
3. Đơn vị: chọn từ danh sách cấu hình hiện có.

Mã được server tự tính, không tin mã do trình duyệt gửi: ptb0985728123. Viết tắt chuyển chữ thường, bỏ dấu và khoảng trắng; Đ đổi thành d. Giới hạn 1–20 chữ cái. Điện thoại được giữ dưới dạng chuỗi để bảo toàn số 0 đầu, chấp nhận số di động Việt Nam 10 chữ số và chuẩn hóa +84 về 0. Số không hợp lệ bị từ chối. Trình duyệt hiện trước mã hoàn chỉnh khi hai trường hợp lệ; nhập thông tin không tạo request đồng bộ.

Cùng viết tắt và cùng điện thoại đã chuẩn hóa dùng cùng Candidate.code khi thi lại; vẫn lấy điểm cao nhất theo cơ chế hiện có. Khác mã ghép là hồ sơ khác. Không dùng số điện thoại riêng lẻ làm khóa duy nhất: hai viết tắt khác nhau với cùng số điện thoại tạo hai mã khác nhau.

## Dữ liệu lưu

- Candidate.code: mã ghép chữ thường, unique.
- Candidate.phone: số chuẩn hóa, có index để tra cứu, không unique độc lập.
- Candidate.info: nameInitials, phone, candidateCode, unit của lần tạo hồ sơ.
- Attempt.info và summary.userInfo: snapshot đúng thông tin của từng lượt thi, gồm đơn vị lần đó. Không lưu thêm họ tên đầy đủ, cấp bậc, chức vụ hoặc số hiệu từ request đăng ký mới.
- Admin/lịch sử/Excel: thêm cột viết tắt và số điện thoại; mã cũ vẫn hiển thị bằng candidateCode/serviceNumber khi có. JSON export tự chứa các trường mới vì xuất toàn bộ bản ghi.
- API công khai vẫn chỉ trả đơn vị của thí sinh, không công khai số điện thoại/viết tắt/mã ghép.

## Triển khai và dữ liệu cũ

Migration 202610120003_initials_phone_identity bỏ unique index riêng của phone và thêm index thường. Giữ unique code, tất cả hồ sơ, bài thi và kết quả cũ. Vercel dùng npm run vercel-build sẽ chạy migration trước build như cấu hình repo hiện có. npm run build riêng không áp dụng migration. Sao lưu trước áp dụng migration production như quy trình hiện tại.

Lượt đang làm theo số hiệu vẫn có thể khôi phục/nộp với snapshot cũ. Khi đăng ký lượt mới, form chỉ thu viết tắt và điện thoại. Dữ liệu cũ không tự ghép/đổi mã sang phương án mới vì không đủ căn cứ xác định chủ số hiệu; hồ sơ điện thoại của phiên bản rất cũ cũng giữ nguyên mã lịch sử, không tự suy đoán nhập chung.

Nếu một người đã thi bằng số hiệu rồi lại thi bằng mã mới trong cùng kỳ, họ là hai hồ sơ khác nhau trong thống kê. Nên áp dụng phương án mới khi bắt đầu kỳ thi mới bằng nút Admin hiện có; không tự mở kỳ mới hoặc xóa kết quả khi deploy.

Kiểm tra: 81 tests và production build đạt; SQL migration được kiểm tra trên PostgreSQL tạm bằng PGlite, xác nhận giữ bản ghi cũ, vẫn chặn mã trùng và cho lưu cùng phone khi mã ghép khác. Đây không phải lần đo tải 500 người mới; harness đã cập nhật input để lần đo tiếp theo phù hợp form mới.
