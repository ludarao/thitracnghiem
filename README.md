# Thi trắc nghiệm

Ứng dụng Next.js với PostgreSQL/Prisma. Cấu hình, ngân hàng đề, hồ sơ và lượt thi được lưu trên server.

## Quy tắc

- Số điện thoại di động Việt Nam bắt buộc; `+84` được chuẩn hóa thành `0`.
- Hồ sơ nhận diện bằng số điện thoại, mã thí sinh = chữ cái đầu từng từ họ tên (viết hoa, bỏ dấu) + số điện thoại. Ví dụ `Nguyễn Văn An`, `0912345678` → `NVA0912345678`.
- Số điện thoại đã có hồ sơ phải dùng cùng họ tên. Mã đã cấp được giữ nguyên. Chưa có OTP xác minh số điện thoại.
- Có thể thi nhiều lần. Mỗi kỳ thi chỉ tính lượt **đã nộp cuối**, kể cả thấp hơn lượt trước; lượt chưa nộp không thay thế kết quả.
- Bảng tập thể đếm số người, không đếm số lượt. Ngưỡng đạt dùng cấu hình được chốt lúc bắt đầu lượt thi.
- Nếu bật thời gian từng câu: chỉ làm câu hiện tại, chuyển tiếp sẽ khóa câu, hết giờ tự khóa và chuyển câu. Không xem/sửa lại câu đã khóa. Tải lại trang không reset thời gian.
- Server chấm điểm và giữ hạn giờ. Lượt hết hạn khi đóng tab được chốt khi server nhận yêu cầu tiếp theo hoặc bảng xếp hạng làm mới; thời điểm nộp tính tại hạn giờ, không tại thời điểm xử lý muộn.
- Trang kết quả chỉ hiển thị hoàn thành sau khi server xác nhận. Đáp án đang chọn được ghi ngay lên server; khi mất mạng, UI báo lỗi và cần chọn lại/thử lại. Không nhận đáp án gửi đến sau hạn giờ.
- Trình duyệt chỉ giữ token phiên thi để tiếp tục sau khi tải lại; không dùng dữ liệu local làm bảng xếp hạng chung.
- Điện thoại/mã thí sinh chỉ trả về cho người dự thi sở hữu token và admin. Bảng công khai không có các trường này.

## Chạy local

Yêu cầu Node.js 22.13+ và PostgreSQL.

1. `npm install`
2. Tạo `.env.local` theo `.env.local.example`. Điền URL của database và mật khẩu admin riêng tối thiểu 10 ký tự. Không commit file này.
3. `npm run db:migrate`
4. `npm run dev`

Lần đầu đọc cấu hình, hệ thống tạo cấu hình mặc định và 50 câu hỏi có sẵn. Đăng nhập `/admin` để sửa, nhập Excel và nhấn **Lưu Cấu Hình**. Các thiết bị dùng cùng dữ liệu trên server.

## Vercel với database đã cấu hình

Giữ integration PostgreSQL hiện tại và thêm `ADMIN_PASSWORD`. App nhận `DATABASE_URL` dạng PostgreSQL; nếu integration cũ đặt URL Accelerate ở biến này, app dùng `DATABASE_POSTGRES_URL`. Migration ưu tiên `DATABASE_URL_UNPOOLED`, `DIRECT_URL`, rồi `DATABASE_POSTGRES_URL` nếu có; không cần tạo thêm biến trùng khi integration đã cung cấp URL PostgreSQL.

Đặt Node.js 22+. File `vercel.json` đã đặt Build Command là `npm run vercel-build`. Lệnh này chạy migration trước khi build. `npm run build` riêng chỉ build code, không sửa database.

Migration thêm bảng mới và giữ bảng `ExamResult` cũ. Nếu app cũ đã tạo bảng bằng `prisma db push`, script tự ghi nhận migration gốc sau khi kiểm tra tên cột, rồi áp dụng migration mới. Nếu schema cũ khác, script dừng để kiểm tra, không xóa bảng. Lưu bản sao database trước khi áp dụng trên production.

**Kết quả cũ không tự nhập vào bảng xếp hạng mới**, vì không có số điện thoại để xác định hồ sơ và lượt thi. Chúng vẫn nằm trong `ExamResult`. Các cấu hình/câu hỏi từng sửa bằng localStorage cần nhập lại hoặc lưu lại từ Excel; không thể tự lấy dữ liệu nằm trên máy admin từ server.

## Quản trị và lịch sử

- Mật khẩu hash bằng scrypt, phiên đăng nhập qua cookie HttpOnly, hạn 8 giờ.
- Sai mật khẩu 5 lần khóa đăng nhập admin 15 phút. Đổi mật khẩu hủy các phiên cũ.
- **Bắt Đầu Kỳ Thi Mới** tạo mã kỳ mới và làm mới bảng xếp hạng; không xóa lịch sử, không thay cấu hình/ngân hàng đề.
- Admin xem/xuất tối đa 500 lượt đã nộp gần nhất của các kỳ. Toàn bộ lịch sử vẫn lưu trong database.
- API nộp bài nhận token lượt thi, không nhận điểm do client tính. Nộp lại giữ nguyên kết quả. Ghi tiến độ/chấm bài dùng transaction Serializable và thử lại khi xung đột.

## Kiểm tra

- `npm test`: quy tắc thi và kiểm tra các API thật với database mô phỏng (quyền admin, phiên, lượt cuối, dữ liệu công khai, lịch sử). Các test này không thay thế kiểm tra migration và transaction trên PostgreSQL thật.
- `npm run typecheck`
- `npm run build`

Kiểm tra với database thật trước khi tổ chức thi: đăng nhập admin; thay cấu hình rồi mở bằng trình duyệt khác; thi hai lượt cùng số điện thoại (lượt sau điểm thấp hơn); tải lại khi làm bài; gửi đáp án sau hết giờ; nộp trùng; mở kỳ mới và kiểm tra lịch sử/xuất Excel.
