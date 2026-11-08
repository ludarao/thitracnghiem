# Nhiều bộ câu hỏi và phân bổ theo chương — 1.4

Áp dụng cho repo gốc `ludarao/thitracnghiem`, nhánh `codex/question-sets-v1.4`. Không thay repo `thitracnghiem-2`.

## Cách dùng trong Admin

1. Vào mục **Các bộ câu hỏi & phân bổ đề**. Ngân hàng cũ tự hiển thị là **Bộ 1**, giữ nguyên toàn bộ câu hỏi. Việc mở Admin chưa thay đổi dữ liệu trên server.
2. Bấm **Thêm bộ câu hỏi** để tạo Bộ 2, Bộ 3… Có thể đổi tên theo chương. Hỗ trợ 1–1000 bộ, tổng ngân hàng tối đa 10.000 câu như giới hạn hiện tại.
3. Bấm **Nạp Excel** tại từng bộ. Cấu trúc mỗi file giữ nguyên: `TT, Question, A, B, C, D, Correct`. TT có thể bắt đầu từ 1 ở mỗi file; ứng dụng cấp ID riêng để các bộ không trùng ID. File tối đa 5 MB; file sai không thay ngân hàng đang chỉnh.
4. Đặt **Số câu lấy từ…** cho từng bộ, ví dụ 10 + 8 + 12 = 30. Đặt 0 nếu muốn giữ bộ nhưng tạm không lấy câu.
5. Tổng phân bổ phải đúng **Số lượng câu hỏi trong mỗi đề thi** đã cấu hình, và từng bộ phải đủ câu. Không tự giảm tổng số câu khi thay file. UI báo lỗi; cả giao diện lưu cấu hình và server đều kiểm tra. Không lưu cấu hình sai, kể cả kỳ thi đang đóng.
6. Bấm **Lưu Cấu Hình** một lần để lưu tất cả bộ và chỉ tiêu. Chọn file mới chỉ cập nhật bản đang chỉnh trên trình duyệt.

Nạp lại một bộ chỉ thay câu hỏi của bộ đó. Xóa bộ cần xác nhận và chỉ áp dụng khi lưu; không thể xóa bộ cuối cùng. Lượt đã bắt đầu giữ đề cũ, kể cả khi thay file, xóa bộ hoặc thay chỉ tiêu. Khôi phục đề cũ và chấm điểm vẫn dùng phiên bản ngân hàng đã chốt khi bắt đầu lượt.

## Cách tạo đề

Server chọn riêng số câu yêu cầu trong từng bộ, không lấy bù từ bộ khác. Bật đảo câu hỏi: chọn ngẫu nhiên trong từng bộ rồi trộn toàn bộ đề; tắt đảo: lấy các câu đầu theo thứ tự từng bộ. Đảo đáp án vẫn đi kèm ánh xạ đáp án đúng. Một đề không lặp ID câu hỏi.

Các cấu hình cũ chưa có danh sách bộ tiếp tục dùng cách lấy câu cũ. Admin chuyển chúng thành một bộ khi chỉnh/sau khi bấm lưu. Đề đang làm không phụ thuộc cấu hình phân bổ mới.

## Lưu trữ và triển khai

- `Question.setId` chỉ bộ sở hữu câu. `ExamConfig.questionSets` lưu `{id, name, questionCount}`. Dùng các cột JSON sẵn có trong `QuizSettings` và snapshot `QuestionBank`/`Attempt`; **không thêm bảng hoặc migration**.
- Giữ cách lưu ngân hàng theo hash: toàn bộ câu hỏi lưu một lần cho mỗi phiên bản, mỗi lượt chỉ lưu ID và thứ tự đáp án. Chỉnh bộ tạo phiên bản mới khi phát sinh lượt thi mới; không nhân toàn bộ câu hỏi theo số thí sinh.
- Không tăng số request trong lúc thi hoặc khi nộp bài. Chọn câu theo bộ được xử lý local trong server khi tạo lượt; không truy vấn riêng cho từng bộ. Nạp các file ở Admin đọc ngay trên máy rồi lưu chung một lần bằng API cấu hình như trước.
- Phân bổ/tên bộ thêm một lượng metadata vào cấu hình và snapshot từng lượt. Số câu/phiên bản đề mới vẫn chiếm dung lượng như trước. Upload file tổng quá lớn có thể gặp giới hạn payload của nền tảng; không coi giới hạn 10.000 câu là bảo đảm upload được mọi file kích thước đó.
- Deploy nhánh mới để kiểm tra trước. Mốc quay lại mã nguồn: `backup/pre-question-sets-2026-11-08`. Quay lại code không tự khôi phục cấu hình cũ trong database; code cũ bỏ qua chỉ tiêu theo bộ. Nếu cần quay lại, cấu hình phẳng phải được thiết lập lại trước khi cho lượt mới bắt đầu. Các lượt đã nhận đề vẫn dùng snapshot riêng.

## Kiểm tra

Bộ test kiểm tra quota qua nhiều đề ngẫu nhiên, không trùng ID, chấm đúng sau đảo đáp án; từ chối chỉ tiêu thiếu/thừa, âm/lẻ, bộ thiếu câu hoặc không xác định; tương thích ngân hàng cũ; thay đúng một bộ; nhiều file Excel thực có TT giống nhau; API lưu/đọc cấu hình, đề nhận đúng chỉ tiêu, khôi phục và chấm đề cũ sau thay ngân hàng. Test UI kiểm tra thêm/xóa bộ, nhập file, lỗi file, tổng phân bổ và chặn nhập đồng thời. Các API tests dùng database mô phỏng; không ghi dữ liệu thi lên production.
