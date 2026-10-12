# Phiên bản 1.3 — giám sát màn hình local

Nhánh `codex/local-exam-guard-v1.3`, tag `v1.3.0`. Giữ nhánh 1.2 và các tag cũ để quay lại. Bản này không sửa Bug 1: server vẫn nhận bài nộp offline sau hạn như trước.

## Hoạt động

- Lượt mới mặc định bật giám sát, ngưỡng 30 giây liên tục và hạn chế copy; có thể bật/tắt và đặt 5–300 giây trong Admin, rồi Lưu cấu hình.
- Chỉ giám sát khi đang làm bài, không áp dụng khi đăng ký hoặc xác minh Turnstile. Mỗi lượt giữ cấu hình đã nhận lúc bắt đầu; lượt cũ thiếu cờ giám sát không tự bị bật giữa chừng.
- Blur/focus và visibilitychange/pagehide/pageshow phát hiện chuyển tab, cửa sổ/ứng dụng hoặc khóa màn hình khi trình duyệt có gửi sự kiện. Che bằng lớp phủ tối + làm mờ, khóa thao tác và popup. Tab ẩn chỉ thấy popup khi quay lại.
- Quay lại trước hạn cần bấm Tiếp tục. Thời gian đọc popup sau khi đã quay lại không tính vào thời gian rời; đồng hồ tổng vẫn chạy. Nếu rời lần nữa khi popup còn mở, bắt đầu tính lần rời mới.
- Rời từ ngưỡng trở lên: khóa lượt, nộp đáp án tại thời điểm rời. Không cho điểm 0 hay loại kết quả; server chấm như lượt bình thường và tiếp tục lấy điểm cao nhất. Nếu tổng deadline đến trước ngưỡng rời thì hạn tổng thắng.
- Khi hệ điều hành đình chỉ ứng dụng, không bảo đảm nộp đúng giây thứ 30. Kiểm tra mốc đã lưu ngay khi hoạt động lại/reload, khóa trước khi cho tương tác. Mất mạng giữ bản frozen và cho gửi lại/online retry.
- Không có API giám sát, heartbeat hay request mỗi giây. Thông tin rời màn hình gửi kèm request nộp hiện có, được ghi rõ là trình duyệt báo cáo trong Admin/Excel; không phải bằng chứng độc lập về gian lận.
- Chặn copy/cut, menu chuột phải và chọn chữ trong vùng câu hỏi/đáp án lúc đang thi. Không chặn paste Số hiệu hay copy trang kết quả/Admin; thao tác copy không tự kết thúc lượt.

## Một tab và phục hồi bản lưu

Web Locks giữ một tab phòng thi được ghi localStorage trong cùng origin và cùng hồ sơ trình duyệt. Tab khác chỉ hiển thị thông báo; đóng tab chính rồi bấm Thử nhận phiên ở tab còn lại. Khóa được giữ cả ở trang đăng ký/kết quả để tránh tab khác ghi đè bản lưu. Không dùng đồng bộ qua server. Không phối hợp được giữa các trình duyệt, chế độ ẩn danh riêng, thiết bị hoặc hostname khác nhau; các bản 1.2 chưa dùng khóa cũng không tham gia cơ chế này.

Nếu trình duyệt không hỗ trợ/không cho Web Locks, thông báo dùng trình duyệt mới qua HTTPS, không âm thầm cho hai tab ghi cùng phiên. Cần kiểm tra các trình duyệt sẽ dùng để thi.

Bản lưu v2 hợp lệ được đọc và lưu tiếp theo cấu trúc v3, giữ cùng khóa `quiz_local_attempt_v2`. Bản lỗi được sao lưu dưới khóa `quiz_corrupt_attempt_<timestamp>` trước khi cách ly. Nếu sao lưu thất bại do quota, giữ nguyên bản gốc. UI có tải bản lưu, phục hồi từ server và đặt lại rõ ràng. Phục hồi từ server có thể không lấy lại đáp án chưa từng nộp; bản sao lỗi vẫn giữ để xử lý. File tải xuống có token lượt thi, không chia sẻ công khai.

## Giới hạn

Giám sát local không chứng minh gian lận và có thể bị can thiệp bằng DevTools, sửa đồng hồ hoặc xóa storage. Không phát hiện mọi thao tác hệ điều hành; gọi điện, khóa màn hình, bấm thanh địa chỉ cũng có thể gây cảnh báo/kết thúc lượt. Không chống chụp màn hình, thiết bị khác hoặc đọc nội dung từ API. Không bật Attack Mode.

## Triển khai và kiểm thử

Build Command `npm run vercel-build`. Không có migration mới của 1.3; các migration 1.2 vẫn áp dụng nếu database chưa cập nhật. Turnstile dùng cấu hình môi trường và hostname như bản trước. Không đổi link hoặc triển khai giữa buổi thi; thử Preview trước khi đưa vào Production.

Kiểm thử tự động chạy component thật với hook/DOM mô phỏng, state machine, Web Locks mô phỏng và route handler: duplicate blur/hidden, trở lại/ack, hết ngưỡng, reload/offline, không phát sinh request giám sát, khóa tab thứ hai, copy, bản lưu lỗi, cấu hình Admin và báo cáo kèm nộp. Build/typecheck cũng được chạy. Chưa thay thế kiểm thử trên Chrome/Safari và điện thoại thật.

Trước buổi thi kiểm tra thực tế: hai cửa sổ cạnh nhau, đổi tab, bấm thanh địa chỉ, đổi ứng dụng, nhận cuộc gọi, tắt màn hình, reload khi rời, mất mạng/nộp lại, mở hai tab, và recovery. Nếu chặn nhầm, tắt Giám sát trong Admin cho lượt mới. Cấu hình lượt đang làm không tự đổi.

Quay lại: chọn deployment 1.2 trong Vercel hoặc deploy từ tag `backup/pre-v1.3-2026-10-12` (commit `af082a7`, bản 1.2 đã có các sửa lỗi gần nhất). Database tương thích. Bản lưu v3 có thể được code 1.2 đọc session/frozen nhưng không thực thi trạng thái giám sát; không đổi phiên bản giữa lượt đang thi.
