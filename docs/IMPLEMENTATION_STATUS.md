# OBSIDIAN COMPUTE — trạng thái triển khai

Trạng thái candidate remediation Batch 09, dựa trên Batch 08 `3c76f02021a4c123a456adc2ba53c0f41987dc39`. Bằng chứng CI/GHCR bên dưới thuộc các checkpoint đã phát hành. Đánh giá của giảng viên và hồ sơ nộp bài vẫn đang mở.

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
- **ISSUE 17.3 — AI-related Features.** Trong Catalog, mở **AI product recommendations** và mô tả nhu cầu bằng tiếng Việt hoặc tiếng Anh. Có thể chọn danh mục và giới hạn ngân sách. Browser Worker xếp hạng tối đa 64 sản phẩm Catalog công khai, kiểm lại giá/tồn kho theo variant và hiển thị tối đa ba kết quả trên trang 1. Build sạch tải model MiniLM q8 đã pin và kiểm SHA-256. Hướng dẫn nằm trong mục `AI PRODUCT RECOMMENDATIONS` của [source/README.txt](../source/README.txt).

Bằng chứng chi tiết theo từng Bonus nằm trong [CI/CD](../Bonus/01_CI_CD.md), [Microservices](../Bonus/02_Microservices.md), [Elasticsearch](../Bonus/03_Elasticsearch.md) và [AI Product Recommendation](../Bonus/04_AI_Product_Recommendation.md).

## Kiểm chứng tự động

Chạy `npm run verify` từ `source/`. Mỗi lượt tạo một Compose project mới `obsidian-test-<random-id>`, xác minh PostgreSQL và cổng cách ly, rồi chạy các suite backend, OAuth fixture và Playwright. Script dừng project sau khi kiểm tra và giữ các volume để đối chiếu.

Tại checkpoint Batch 07 `f74cabeb`, [Actions run 45803094915](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45803094915) đạt 53 kết quả backend/OAuth và 29 Playwright, xác minh ID image của sáu container ứng dụng và phát hành hai image đã kiểm thử. Bằng chứng triển khai local cho checkpoint này gồm stack chạy bằng digest GHCR với `--no-build`.

Post-Batch 07 remediation `08f58ca` đạt 87/87 (58 backend/OAuth và 29 Playwright) tại local và [Actions run 45848810378](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45848810378). Lượt publish-only retry thành công dùng artifact `15133545585` đã kiểm thử. Delivered-image smoke đạt 2/2 sau khi chọn lại truy vấn có dữ liệu seed.

Batch 08 `3c76f02` đạt 92/92 (58 backend/OAuth và 34 Playwright) tại local và [Actions run 45864609725](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45864609725). Run xác minh sáu image ID và phát hành hai image từ artifact `15139697801`. Delivered-image smoke đạt 2/2, gồm Catalog và inference song ngữ. Hai digest thuộc checkpoint này nằm trong [AI guide](../Bonus/04_AI_Product_Recommendation.md).

Candidate Batch 09 đạt production build và **94/94** (60 backend/OAuth và 34 Playwright) trên hai image local với `--images`, xác minh sáu container image ID và PostgreSQL `obsidian_test` cô lập. Stack build từ source cũng qua smoke tại `localhost:8080` và origin Wi-Fi HTTP thật với `APP_BASE_URL` tương ứng. Smoke LAN bao phủ guest/Customer checkout, session, comment/rating qua WebSocket và từ chối origin khác. Hai stack dùng IPAM override tạm ngoài cấu hình được commit. Các kết quả Batch 09 là bằng chứng local. Run CI và image GHCR ở trên vẫn thuộc từng checkpoint lịch sử.

| Nhóm yêu cầu | Bằng chứng |
|---|---|
| A01–A09: Home/catalog/detail/filter/sort/pagination | Backend catalog assertions; E2E homepage, catalog và mobile detail |
| A10–A13: Comments/ratings/realtime | Backend guest/customer permissions. Realtime Gateway chuyển sự kiện từ cả hai Core replicas tới WebSocket clients |
| A14–A19: Cart/guest checkout/account history | Cart API, E2E guest checkout, OTP vào tài khoản guest, customer pages |
| A20, A22–A23: Register/password/address | Backend strict registration input, OTP single-use, change/reset, defaults; E2E address editing |
| A21: Google login | Fixtures xác minh luồng OIDC. Cấu hình Web OAuth client và callback theo môi trường. **Google consent/callback với tài khoản thật chưa xác minh** |
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
- Audit Batch 08 ghi nhận hai mục High từ Sharp `0.34.5` trong chuỗi frontend build/dev. Browser entrypoint loại native Sharp. Backend upload dùng Sharp `0.35.5` và audit riêng tại checkpoint đó ghi 0 findings.

## Cần nhóm thực hiện trước bảo vệ/nộp

1. Cấu hình Google theo [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) và giữ credentials trong `source/.env` riêng. Thực hiện consent/callback thật và kiểm tra bổ sung địa chỉ sau khi đăng nhập.
2. Duyệt nghiệp vụ và thiết kế bằng tài khoản demo; nếu phát hiện khác kỳ vọng, ghi nhận để chỉnh trong phạm vi PDF.
3. Thu thập GitHub Insights thật trên remote hiện có và đối chiếu đóng góp theo từng thành viên và từng tuần theo PDF.
4. Quay `demo.mp4` tối thiểu 1080p có tiếng rõ. Dùng [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md) cho Core và bốn guide cho Bonus.
5. Điền `Rubrik.docx` chính thức, chuẩn bị `git/` và `Bonus/`, kiểm tra Compose từ ZIP đã giải nén và nộp theo quy ước của giảng viên.

## Giới hạn thực tế

- Docker Compose là phương án nộp đã chọn. Mặc định dùng `http://localhost:8080`. Với LAN, đặt `APP_BASE_URL` chính xác theo origin demo trong `source/.env` rồi chạy lại `docker compose up -d`. Mapping `8080:80`, tài khoản demo và Mailpit loopback áp dụng cho demo kiểm soát. Production cần HTTPS và credentials riêng.
- Thanh toán là sandbox nội bộ. Mailpit xác minh email trong demo. External SMTP chưa xác minh. Giảng viên đánh giá sandbox và Mailpit.
- SMTP có thể redeliver nếu worker bị dừng ngay sau khi SMTP nhận nhưng trước khi DB đánh dấu sent; không tuyên bố exactly-once delivery ngoài hệ thống.
- Ở checkpoint ban đầu `1def636`, QA giao diện dùng Playwright headless và rà soát trực tiếp ảnh chụp.
- AI tải khoảng 158 MB lần đầu. Ranking chủ yếu theo ngữ nghĩa và có giới hạn với phủ định, mô tả tương tự hoặc cấu hình chính xác. Hiệu năng AI trên thiết bị di động thật chưa đo. Phép đo Elasticsearch trên seed hiện tại chưa cho thấy tốc độ tốt hơn SQL trực tiếp.
- Search-engine indexing thực tế chưa xác minh. Receipt/recovery log lịch sử vẫn có thể chứa token đã ghi trước các bản sửa.
