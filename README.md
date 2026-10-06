# Thi trắc nghiệm

Ứng dụng Next.js với PostgreSQL/Prisma. Cấu hình, ngân hàng đề, hồ sơ và lượt thi được lưu trên server.

## Quy tắc

- Số điện thoại di động Việt Nam bắt buộc; `+84` được chuẩn hóa thành `0`.
- Hồ sơ nhận diện bằng số điện thoại, mã thí sinh = chữ cái đầu từng từ họ tên (viết hoa, bỏ dấu) + số điện thoại. Ví dụ `Nguyễn Văn An`, `0912345678` → `NVA0912345678`.
- Số điện thoại đã có hồ sơ phải dùng cùng họ tên. Mã đã cấp được giữ nguyên. Chưa có OTP xác minh số điện thoại.
- Có thể thi nhiều lần. Mỗi kỳ thi chỉ tính lượt **đã nộp cuối**, kể cả thấp hơn lượt trước; lượt chưa nộp không thay thế kết quả.
- Bảng tập thể đếm số người, không đếm số lượt. Ngưỡng đạt dùng cấu hình được chốt lúc bắt đầu lượt thi.
- Chỉ giới hạn tổng thời gian toàn bài. Thí sinh có thể chuyển và sửa mọi câu trước hạn nộp. Cấu hình từng câu cũ không còn được áp dụng. Tải lại trang không reset hạn giờ.
- Server chấm điểm. Trình duyệt khóa toàn bài theo hạn tổng và nộp toàn bộ đáp án; không có giới hạn từng câu. Lượt chưa gửi không xuất hiện trên bảng xếp hạng.
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


## Chế độ tiết kiệm request và dung lượng

- Bắt đầu: một POST nhận diện thí sinh, tạo lượt và trả toàn bộ đề (ngoài request cấu hình khi mở trang đăng ký).
- Khi làm bài: đáp án, vị trí câu, đề và hạn tổng nằm trong localStorage; không polling hoặc gọi API khi chọn/chuyển câu. Tải lại khôi phục từ máy, không cần truy vấn database.
- Nộp: một PATCH gửi toàn bộ đáp án. Server chấm và ghi một bản tóm tắt; retry cùng token trả đúng kết quả cũ, không ghi lại. Khi nộp hoặc hết giờ, đáp án được đóng băng trên máy. Lỗi mạng giữ bài, có nút nộp lại và thử lại khi trình duyệt phát sự kiện online.
- Bảng xếp hạng chỉ tải lúc mở trang/bấm làm mới; cache server 60 giây và CDN 60 giây (có thể cũ lâu hơn khi phục vụ stale). Không truy vấn để chốt lượt bỏ dở. PostgreSQL chọn lượt cuối từng thí sinh, chỉ đọc summary. Cache chỉ giữ ID/thống kê tổng; danh sách cá nhân 100 người/trang để giữ nhỏ response và cache. Thống kê/tập thể vẫn tính toàn bộ người, Excel cá nhân xuất trang đang xem.
- Lịch sử admin: 50 lượt/trang theo cursor; chỉ đọc summary, không đọc đề/đáp án. Excel xuất trang đang xem.
- Các lượt mới chỉ lưu ID câu và hoán vị đáp án; toàn văn ngân hàng đề lưu một lần theo hash. Sửa đề tạo phiên bản khác, không đổi đề của lượt đang làm. Migration giữ dữ liệu cũ và backfill summary; không tự xóa lịch sử.

**Giới hạn của lưu trên máy:** xóa dữ liệu trình duyệt/đổi thiết bị làm mất bài chưa nộp. Cần mở lại đúng trình duyệt để gửi bài khi có mạng. Cho phép gửi muộn để phục hồi lỗi mạng, nhưng server không thể chứng minh đáp án được chọn trước hạn khi không đồng bộ; người sửa localStorage hoặc gọi API trực tiếp có thể vượt khóa phía trình duyệt. Đây là phương án tiết kiệm cho bài thi không yêu cầu chống gian lận thời gian nghiêm ngặt. Thời gian kết quả được giới hạn bởi deadline server. Chưa kiểm thử tải 1000 người trên production; hai request nghiệp vụ không đồng nghĩa hai database operations và còn phụ thuộc retake, retry, cold start và người xem bảng.


Dashboard chỉ hiển thị số người đã nộp bài theo từng đơn vị trong kỳ hiện tại, tính mỗi thí sinh một lần theo đơn vị lượt nộp cuối. Không tính hoặc hiển thị tỷ lệ, điểm trung bình, thi đua hay danh sách cá nhân trên dashboard. Endpoint `GET /api/results?counts=1` đếm trực tiếp trong PostgreSQL, chỉ trả tên đơn vị và số lượng, cache 60 giây. Các đơn vị chưa có người thi hiển thị 0. Kết quả/đáp án từng lượt và lịch sử admin vẫn được lưu để xử lý sau.
