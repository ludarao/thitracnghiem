# Dashboard số lượng dự thi và xếp hạng

Dashboard công khai có hai bảng với phân trang độc lập:

- Thí sinh: 20 người/trang, điểm giảm dần; cùng điểm thì thời gian làm bài tăng dần. Hiển thị hạng, mã đã che, đơn vị, điểm /10 và thời gian.
- Đơn vị: 10 đơn vị/trang, số người đã nộp bài giảm dần. Cùng số lượng sắp theo tên đơn vị để thứ tự ổn định. Đơn vị chưa có bài nộp vẫn có dòng số 0.

Mỗi Candidate chỉ lấy một lượt đã nộp của kỳ hiện tại: điểm cao nhất, cùng điểm chọn thời gian ngắn nhất, cùng thời gian chọn submittedAt mới hơn rồi ID để ổn định. Đơn vị của lượt được chọn là đơn vị nhận một người tham gia; thi lại không tăng tổng người. Không đổi nội dung bài thi hoặc xóa các lượt cũ. Chính sách nhận bài offline/Bug 1 giữ nguyên; submittedAt hiện có vẫn giữ cơ chế cũ.

Mã mới ptb0985728123 được xuất công khai thành ptb098572****. Mask tại server, không truyền số điện thoại đầy đủ/viết tắt riêng/mã gốc/chi tiết đáp án/giám sát local trong response bảng công khai. Những mã cũ chỉ có số hiệu cũng được che bốn ký tự cuối; bản ghi không đủ mã hợp lệ hiển thị Thí sinh cũ. Admin và file xuất có quyền xem thông tin đầy đủ như trước.

## API và request

- GET /api/results?dashboard=1&page=1&unitsPage=1: trả cả hai bảng trong một request, gồm tổng người/đơn vị và số trang. Dashboard tự đưa trang vượt phạm vi về trang cuối hợp lệ, ví dụ sau khi mở kỳ mới/xóa kết quả.
- GET /api/results?page=1: bảng cá nhân 20 dòng; trang ngoài phạm vi trả rỗng, không truy vấn chi tiết/cached page riêng.
- GET /api/results?counts=1&page=1: bảng đơn vị 10 dòng, có tổng và số trang.
- GET history=1 vẫn yêu cầu Admin, phân trang 50 lượt và giữ thông tin đầy đủ; không đổi.

Mở Dashboard một request; đổi trang hoặc Làm mới một request. Không polling. Loading chặn bấm trùng, lỗi mạng giữ dữ liệu và số trang trước. Cache server/CDN giữ 60 giây và stale-while-revalidate hiện có; số liệu có thể chậm vài phút. Các cache key mới tách thứ tự/response cũ. Không cần thêm biến môi trường hoặc migration cho thay đổi Dashboard.

## Kiểm tra

88 tests đạt; production build/TypeScript đạt. Có kiểm tra 5.001 người và trang cuối, bộ dữ liệu 45 người/26 đơn vị, chọn lượt nhanh nhất giữa điểm cao nhất, không đếm trùng, mask trên response, trang sai không truy vấn DB, UI phân trang độc lập, giữ trang khi lỗi mạng và không tự tải lại. Hai câu SQL chọn người/đếm đơn vị thực tế cũng được chạy trên PostgreSQL tạm bằng PGlite để xác nhận chọn lượt nhanh và khử trùng đúng. UI dùng React harness; chưa kiểm thử thiết bị/trình duyệt thật trong lượt này và không chạy lại phép đo ghi 500 đồng thời vì luồng ghi không thay đổi.
