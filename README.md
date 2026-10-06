# HỆ THỐNG THI TRẮC NGHIỆM ĐOÀN & ĐÁNH GIÁ THI ĐUA TẬP THỂ

Ứng dụng thi trắc nghiệm trực tuyến chuyên nghiệp được tối ưu sẵn sàng deploy 1-click lên **Vercel** và lưu trữ trên **GitHub**. Dữ liệu đề thi trích xuất và nạp tự động từ file Excel.

---

## 🌟 TÍNH NĂNG NỔI BẬT

### 1. Phòng Thi Thí Sinh (`/`)
- **Thu thập đầy đủ 4 trường thông tin bắt buộc**:
  - Họ và tên
  - Cấp bậc
  - Chức vụ
  - Đơn vị (thuộc danh mục các Chi đoàn / Đoàn cơ sở để tính thi đua)
- **Cơ chế tính giờ thông minh**:
  - Đồng hồ đếm ngược **Tổng thời gian cả bài thi** (tự động thu bài khi hết giờ).
  - Đồng hồ đếm ngược **Thời gian trả lời từng câu hỏi** (cấu hình linh hoạt từ Admin).
- **Trải nghiệm mượt mà**:
  - Thanh tiến độ làm bài (Progress bar).
  - Bản đồ chuyển câu hỏi nhanh trực quan (đánh dấu câu đã làm / câu đang làm).
  - Báo cáo kết quả tức thì (Điểm số thang 10, Số câu đúng, %, Đạt/Không đạt).
  - Xem lại chi tiết đáp án câu đúng/sai sau khi nộp (bật/tắt được từ Admin).

### 2. Bảng Tổng Hợp Kết Quả & Xếp Hạng Tập Thể (`/dashboard`)
- **Xếp hạng thi đua Đơn vị theo đúng 3 tiêu chí cốt lõi**:
  1. **Tỷ lệ cán bộ, chiến sĩ tham gia**: `(Số người đã thi / Quân số đăng ký) × 100%`.
  2. **Điểm trung bình của người dự thi**: Thang điểm 10.
  3. **Tỷ lệ người đạt từ 80% số điểm trở lên**: `(Số người đạt ≥ 80% / Tổng số người đã thi) × 100%`.
  4. **Điểm thi đua tổng hợp**: Tự động tính toán và xếp thứ hạng 1, 2, 3 kèm huy hiệu vinh danh.
- **Bảng vinh danh cá nhân**: Sắp xếp theo thứ tự điểm số từ cao xuống thấp và thời gian làm bài nhanh nhất.
- **Xuất báo cáo Excel**: 1 click xuất toàn bộ kết quả gồm 2 sheet (Bảng xếp hạng tập thể & Chi tiết từng cá nhân).

### 3. Trang Quản Trị Hệ Thống (`/admin`)
- **Bảo mật**: Đăng nhập bằng mật khẩu (mặc định: `admin123`), hỗ trợ đổi mật khẩu trực tiếp trong trang quản trị.
- **Tùy biến cấu hình kỳ thi**:
  - Đổi tiêu đề, mô tả và quy chế thi.
  - Chọn số lượng câu hỏi bốc từ ngân hàng (ví dụ: bốc 30 câu trong 50 câu).
  - Cấu hình tổng thời gian thi & thời gian tối đa cho mỗi câu.
  - Cấu hình ngưỡng đạt chuẩn % (mặc định 80%).
  - Bật / tắt **Đảo thứ tự câu hỏi** (Shuffle questions).
  - Bật / tắt **Đảo thứ tự các đáp án A, B, C, D** (Shuffle options).
  - Bật / tắt chức năng cho phép xem lại đáp án sau khi thi.
  - Mở cổng / Khóa cổng kỳ thi.
- **Quản lý danh sách Đơn vị & Quân số**:
  - Thêm, sửa, xóa đơn vị và cập nhật quân số đăng ký (để tính tỷ lệ tham gia chuẩn xác).
- **Quản lý Ngân hàng câu hỏi**:
  - **Nạp file Excel mới trực tiếp**: Hỗ trợ upload file `.xlsx` chuẩn 7 cột (`TT`, `Question`, `A`, `B`, `C`, `D`, `Correct`). Hệ thống tự động phân tích và cập nhật đề mới ngay lập tức.
  - **Làm sạch dữ liệu**: Nút reset kết quả để bắt đầu kỳ thi mới.

---

## 🚀 HƯỚNG DẪN CHẠY DỰ ÁN TRÊN MÁY (LOCAL)

```bash
# Cài đặt thư viện (nếu chưa có)
npm install

# Khởi chạy server phát triển
npm run dev
```

Truy cập trên trình duyệt: [http://localhost:3000](http://localhost:3000)

---

## 📤 HƯỚNG DẪN PUSH LÊN GITHUB & DEPLOY VERCEL

### Bước 1: Đưa code lên GitHub
```bash
git init
git add .
git commit -m "Khoi tao he thong thi trac nghiem"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git
git push -u origin main
```

### Bước 2: Deploy lên Vercel (Miễn phí 100%)
1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
2. Bấm **"Add New..."** -> Chọn **"Project"**.
3. Chọn Repository vừa tạo trên GitHub và bấm **"Import"**.
4. Giữ nguyên toàn bộ cấu hình mặc định của Next.js và bấm **"Deploy"**.
5. Sau 1 phút, bạn sẽ nhận được đường link website chính thức để chia sẻ cho cán bộ, chiến sĩ dự thi!

---

## 📁 ĐỊNH DẠNG FILE EXCEL ĐỀ THI
File Excel nạp vào hệ thống sử dụng cấu trúc 7 cột chuẩn:
- **Cột A**: `TT` (Số thứ tự: 1, 2, 3...)
- **Cột B**: `Question` (Nội dung câu hỏi)
- **Cột C**: `A` (Đáp án A)
- **Cột D**: `B` (Đáp án B)
- **Cột E**: `C` (Đáp án C)
- **Cột F**: `D` (Đáp án D)
- **Cột G**: `Correct` (Chữ cái đáp án đúng: A, B, C hoặc D)
