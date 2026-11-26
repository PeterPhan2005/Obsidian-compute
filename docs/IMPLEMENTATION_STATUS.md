# OBSIDIAN COMPUTE — trạng thái triển khai

Cập nhật 2026-11-26 theo checkpoint Batch 07 `f74cabeb48ec8b93f51423949ed9b829eba6f9c8`. Đánh giá của giảng viên và hồ sơ nộp bài vẫn đang mở.

## Đã triển khai

- React storefront và Admin tiếng Anh, giao diện đen tối giản, responsive.
- Catalog 60 sản phẩm demo / 6 danh mục / 120 variants; ảnh local có nguồn và attribution công khai. Chi tiết tên/giá/thông số là dữ liệu demo, ảnh minh họa theo nhóm sản phẩm.
- Mọi section homepage và catalog có phân trang thật; search, sort, bộ lọc kết hợp, chọn variant và stock độc lập.
- Guest comments và customer ratings từ hai Core API replicas được phát qua Redis Pub/Sub. Realtime Gateway đưa sự kiện đến product room trên Socket.IO.
- Auth OTP/password/recovery, Google OIDC, profile, nhiều địa chỉ/default address và merge guest cart.
- Checkout nhiều bước, sandbox thành công/thất bại, coupon, điểm, receipt, guest tự tạo tài khoản và xem lại đơn sau xác minh email.
- Transaction checkout có khóa giỏ/variant/user/coupon và idempotency; order/status/items lưu snapshot; email outbox có worker/retry.
- Admin product/category/inventory/upload, user ban/update, order/status, discount create/detail và hai dashboards tính từ DB.
- Docker tự build/migrate/seed. Hai Core API replicas sau Nginx dùng chung PostgreSQL cho session/cart, cùng với Realtime Gateway và Notification Worker chạy bằng entrypoint riêng. PostgreSQL, media và Elasticsearch có volume riêng.

## Bonus

- **ISSUE 17.1 — CI/CD.** GitHub Actions build và verify trước khi phát hành hai image đã kiểm thử lên GHCR. Chạy image qua Docker Compose là bước triển khai riêng.
- **ISSUE 17.2 — Microservices.** Core API, Realtime Gateway và Notification Worker chạy bằng cùng Backend image. Redis Pub/Sub chuyển sự kiện tương tác đến Gateway, còn PostgreSQL outbox chuyển công việc email đến Worker.
- **ISSUE 17.4 — Elasticsearch.** Tìm kiếm từ khóa và relevance chạy qua Elasticsearch. PostgreSQL quyết định visibility, bộ lọc, sort tường minh, tổng và phân trang, đồng thời cung cấp SQL fallback. Với 60 sản phẩm demo, median/p95 của Elasticsearch là 23,7/32,1 ms và của SQL trực tiếp là 15,8/23,1 ms.
- **ISSUE 17.3 — AI.** Chưa triển khai.

## Kiểm chứng tự động

Chạy `npm run verify` từ `source/`. Mỗi lượt tạo một Compose project mới `obsidian-test-<random-id>`, xác minh PostgreSQL và cổng cách ly, rồi chạy các suite backend, OAuth fixture và Playwright. Script dừng project sau khi kiểm tra và giữ các volume để đối chiếu.

Tại checkpoint Batch 07 `f74cabeb`, [Actions run 45803094915](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45803094915) đạt 53 kết quả backend/OAuth và 29 Playwright, xác minh ID image của sáu container ứng dụng và phát hành hai image đã kiểm thử. Bằng chứng triển khai local cho checkpoint này gồm stack chạy bằng digest GHCR với `--no-build`.

| Nhóm yêu cầu | Bằng chứng |
|---|---|
| A01–A09: Home/catalog/detail/filter/sort/pagination | Backend catalog assertions; E2E homepage, catalog và mobile detail |
| A10–A13: Comments/ratings/realtime | Backend guest/customer permissions. Realtime Gateway chuyển sự kiện từ cả hai Core replicas tới WebSocket clients |
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

Một test có thể bao phủ nhiều mục. Bảng trên mô tả phạm vi kiểm chứng kỹ thuật. Đánh giá rubric thuộc giảng viên.

- Test code: `source/backend/tests/`, `source/tests/e2e/`.
- Checkpoint ban đầu `1def636` lưu 20 kết quả backend và 7 Playwright đạt tại [`docs/evidence/verification.txt`](evidence/verification.txt), cùng ảnh demo trong `docs/evidence/`. Các form đã được sửa nhãn truy cập sau lượt E2E đầu và chạy lại thành công ở checkpoint này.
- Artifacts của mỗi lượt kiểm thử mới nằm trong `source/test-results/` và `source/playwright-report/`.
- Dependency audit lúc triển khai ban đầu (báo cáo 2026-11-08) ghi nhận 0 vulnerabilities sau cập nhật Nodemailer và Sharp.

## Cần nhóm thực hiện trước bảo vệ/nộp

1. Trên bản chính `http://localhost:8080/login`, bấm **Continue with Google**, hoàn tất sign-in bằng tài khoản thật, kiểm tra callback và bổ sung địa chỉ. Credentials đã được giữ trong `.env` riêng, không in ra hoặc đưa vào source.
2. Duyệt nghiệp vụ và thiết kế bằng tài khoản demo; nếu phát hiện khác kỳ vọng, ghi nhận để chỉnh trong phạm vi PDF.
3. Tạo Git remote và chia công việc cho ba thành viên, đóng góp/review thật. Không dựng lịch sử một tháng từ 27 ngày còn lại.
4. Quay `demo.mp4` tối thiểu 1080p có tiếng rõ; dùng [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md).
5. Điền `Rubrik.docx` chính thức khi được cấp, chụp Git Insights thật, đặt tên ZIP theo MSSV/họ tên nhóm.

## Giới hạn thực tế

- Docker Compose là phương án nộp đã chọn. Owner giữ mapping `8080:80` và tài khoản demo công khai để giảng viên có thể truy cập qua mạng. Cấu hình mặc định dành cho môi trường demo được kiểm soát. Production cần giới hạn phạm vi truy cập và dùng thông tin đăng nhập riêng.
- Thanh toán là sandbox nội bộ; Mailpit là inbox demo, không phải cổng thanh toán hay SMTP public.
- SMTP có thể redeliver nếu worker bị dừng ngay sau khi SMTP nhận nhưng trước khi DB đánh dấu sent; không tuyên bố exactly-once delivery ngoài hệ thống.
- Ở checkpoint ban đầu `1def636`, QA giao diện dùng Playwright headless và rà soát trực tiếp ảnh chụp.
