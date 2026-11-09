# Demo walkthrough — khoảng 10–12 phút

Chuẩn bị: chạy Compose, mở website và Mailpit, dùng hai cửa sổ browser riêng để minh họa guest/customer và realtime. Dùng trạng thái DB sạch để coupon demo còn lượt; không reset dữ liệu cần giữ. Đăng nhập Google thật trước buổi quay để kiểm tra cấu hình.

1. **Home (1 phút):** giới thiệu OBSIDIAN COMPUTE; chỉ máy tính/linh kiện. New Products, Best Sellers và ba danh mục. Chuyển trang ngay trong một section.
2. **Catalog/detail (1–2 phút):** keyword search, brand + khoảng giá + category/rating, bốn sort tên/giá, pagination. Mở một sản phẩm, ba ảnh, mô tả, hai variants và stock/giá khác nhau.
3. **Comments/realtime (1 phút):** guest comment ở cửa sổ A, cửa sổ B cập nhật không reload. Đăng nhập customer đánh giá sao; guest không rate được.
4. **Guest checkout (2 phút):** tăng/giảm/xóa giỏ không reload. Nhập người nhận, code `ZZ999` không hợp lệ, `HELLO` hợp lệ và hiện số giảm. Thử declined payment trước, sau đó success. Mở receipt và Mailpit confirmation.
5. **Identity/account (1–2 phút):** đăng nhập chính email guest bằng OTP từ Mailpit, xem đơn trước đó. Profile, hai địa chỉ/default, đặt/đổi mật khẩu và reset. Minh họa Continue with Google bằng tài khoản thật.
6. **Loyalty (1 phút):** xem points ledger, đặt đơn tiếp dùng điểm; nêu 1 điểm =1.000đ, tích floor(total paid/10.000), không dùng điểm mới trong chính đơn đó.
7. **Admin (2 phút):** `admin@obsidian.local`, product/edit/upload/stock, category scope, customer ban/unban, orders newest-first/20 per page/date filters, detail và next status, coupon create với max 10/no expiry.
8. **Dashboards/scaling (1 phút):** simple/advanced, year mặc định, quarter/month/week/custom, groupBy và category charts. Chạy `docker compose ps`; gọi health nhiều lần thấy api-a/api-b, dùng hai tab để thấy shared realtime.

Quay thao tác thực tế, chữ đủ đọc, tối thiểu 1080p và lời nói rõ. Không dành thời lượng cho lý thuyết dài. Không trình chiếu `.env`, client secret, session/receipt tokens trong developer tools. Không nhận bonus chưa làm.
