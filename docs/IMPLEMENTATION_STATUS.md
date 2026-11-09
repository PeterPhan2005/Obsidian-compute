# OBSIDIAN COMPUTE — trạng thái triển khai

Cập nhật: 2026-11-08. Mã nguồn ứng dụng đã được xây và kiểm chứng bằng Docker Compose local. Không đồng nghĩa hồ sơ nộp bài/điểm số đã hoàn thành.

## Đã triển khai

- React storefront và Admin tiếng Anh, giao diện đen tối giản, responsive.
- Catalog 60 sản phẩm demo / 6 danh mục / 120 variants; ảnh local có nguồn và attribution công khai. Chi tiết tên/giá/thông số là dữ liệu demo, ảnh minh họa theo nhóm sản phẩm.
- Mọi section homepage và catalog có phân trang thật; search, sort, bộ lọc kết hợp, chọn variant và stock độc lập.
- Guest comments, customer ratings, Socket.IO qua Redis giữa hai replica.
- Auth OTP/password/recovery, Google OIDC, profile, nhiều địa chỉ/default address và merge guest cart.
- Checkout nhiều bước, sandbox thành công/thất bại, coupon, điểm, receipt, guest tự tạo tài khoản và xem lại đơn sau xác minh email.
- Transaction checkout có khóa giỏ/variant/user/coupon và idempotency; order/status/items lưu snapshot; email outbox có worker/retry.
- Admin product/category/inventory/upload, user ban/update, order/status, discount create/detail và hai dashboards tính từ DB.
- Docker tự build/migrate/seed; Postgres/media volume bền vững, hai API sau Nginx, shared sessions/cart/pubsub.

## Kiểm chứng tự động

Lệnh từ `source/`: `npm run verify`. Script dùng **project obsidian-test riêng**, xóa và tạo lại chỉ dữ liệu test để kết quả có thể tái lập.

Kết quả lượt chạy hoàn chỉnh: **20/20 backend tests và 7/7 Playwright tests đạt**.

| Nhóm yêu cầu | Bằng chứng |
|---|---|
| A01–A09: Home/catalog/detail/filter/sort/pagination | Backend catalog assertions; E2E homepage, catalog và mobile detail |
| A10–A13: Comments/ratings/realtime | Backend guest/customer permissions; hai WebSocket client ở API A/B nhận cùng event |
| A14–A19: Cart/guest checkout/account history | Cart API, E2E guest checkout, OTP vào tài khoản guest, customer pages |
| A20, A22–A23: Register/password/address | Backend strict registration input, OTP single-use, change/reset, defaults; E2E address editing |
| A21: Google login | Luồng OIDC đã triển khai; cấu hình thật được nạp vào bản chính. **Chưa xác nhận một lượt consent/callback với tài khoản Google thật** |
| A24–A31: Coupons/payment/idempotency/concurrency | Invalid quote, usage limit, hai checkout tranh lượt cuối/stock cuối, payment failure, repeated key |
| A32: Success/email | E2E receipt reload và order details; nội dung confirmation email đã đọc từ Mailpit |
| A33–A37: History/admin orders/coupons | Status transitions/timeline, order listing 20/page, dashboards/filter và coupon form E2E |
| A38–A39: Loyalty | Ví dụ 1 triệu →100 điểm; integer rounding; zero amount; simultaneous checkout và ledger reconciliation |
| A40–A41: Dashboards | Range/calendar/quarter buckets, totals/series reconciliation; E2E charts/time filters |
| A42: Product management | E2E tạo product, upload ba ảnh, hai variants, sửa stock, archive và kiểm tra DB-backed UI |
| A43–A45: Ban/RBAC/scope | Backend quyền guest/customer/admin, session revoked khi ban, checkout email bị ban bị chặn; taxonomy whitelist |
| A46: Responsive | Kiểm tra viewport overflow ở 375/768/1280/1440; screenshot homepage, product mobile và Admin mobile |
| A47: Horizontal scaling | Hai API healthy, cùng session/cart; cross-instance comment/rating events |
| A48: One-command startup | Stack mới khởi động bằng Compose: build → migration/seed → hai API healthy → Nginx |

Một test có thể bao phủ nhiều mục; bảng này không khẳng định mỗi mục rubric có một test độc lập hoặc đã được giảng viên đánh giá. Các form đã được sửa nhãn truy cập sau lượt E2E đầu và chạy lại thành công.

- Test code: `source/backend/tests/`, `source/tests/e2e/`.
- Screenshots và báo cáo Playwright: `docs/evidence/`.
- Dependency audit ở thời điểm triển khai: 0 vulnerabilities sau cập nhật Nodemailer và Sharp.

## Cần nhóm thực hiện trước bảo vệ/nộp

1. Trên bản chính `http://localhost:8080/login`, bấm **Continue with Google**, hoàn tất sign-in bằng tài khoản thật, kiểm tra callback và bổ sung địa chỉ. Credentials đã được giữ trong `.env` riêng, không in ra hoặc đưa vào source.
2. Duyệt nghiệp vụ và thiết kế bằng tài khoản demo; nếu phát hiện khác kỳ vọng, ghi nhận để chỉnh trong phạm vi PDF.
3. Tạo Git remote và chia công việc cho ba thành viên, đóng góp/review thật. Không dựng lịch sử một tháng từ 27 ngày còn lại.
4. Quay `demo.mp4` tối thiểu 1080p có tiếng rõ; dùng [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md).
5. Điền `Rubrik.docx` chính thức khi được cấp, chụp Git Insights thật, đặt tên ZIP theo MSSV/họ tên nhóm.

## Giới hạn thực tế

- Chưa có deployment public; Docker Compose là phương án nộp đã chọn.
- Thanh toán là sandbox nội bộ; Mailpit là inbox demo, không phải cổng thanh toán hay SMTP public.
- SMTP có thể redeliver nếu worker bị dừng ngay sau khi SMTP nhận nhưng trước khi DB đánh dấu sent; không tuyên bố exactly-once delivery ngoài hệ thống.
- Các bonus không được triển khai hoặc tự nhận điểm.
- Trình duyệt tích hợp không khả dụng trong phiên làm việc; QA giao diện dùng bộ Playwright headless của dự án và ảnh chụp đã xem trực tiếp.
