# Kế hoạch 27 ngày — OBSIDIAN COMPUTE

Thông tin chủ dự án xác nhận ngày 2026-11-08: nhóm ba thành viên, chưa triển khai, còn 27 ngày. Dùng ngày tương đối D1–D27, chưa coi một ngày/giờ cụ thể là deadline chính thức.

## Các quyết định sản phẩm

- English UI, Admin, emails và catalog; dark minimal design trong blueprint 1.1.
- Core theo PDF; Docker Compose hai API replicas, PostgreSQL, Redis, worker, Mailpit và Nginx.
- Internal payment sandbox có success/failure; không thu tiền thật và không tích hợp gateway bên ngoài ở core.
- OTP/password/Google OIDC; chủ dự án chuẩn bị Google client theo hướng dẫn riêng.
- Catalog và ảnh do nhóm phát triển chuẩn bị, upload ảnh tích hợp vào Product Management.
- Chưa làm bonus; ưu tiên core, tests, demo và gói nộp.

## Mốc triển khai

| Ngày | Mục tiêu | Kết quả có thể kiểm tra |
|---|---|---|
| D1–D3 | Foundation, design tokens, schema, Compose và CI kiểm tra cơ bản nếu cần cho phát triển | Một lệnh boot, migrations/seed, hai API healthy; không tuyên bố bonus CI/CD |
| D4–D8 | Catalog, dữ liệu/ảnh, home, detail, auth/profile/address | Home có pagination thật; Google callback thật khi có credentials; mobile usable |
| D9–D11 | Guest/customer cart, comments, ratings, realtime | Không reload; event chạy xuyên hai replicas |
| D12–D16 | Quote, coupon, sandbox payment, orders, loyalty, email | Checkout atomic, không oversell/double spend; receipt, history, Mailpit |
| D17–D21 | Các module Admin và hai dashboards | CRUD lưu DB, order status/history, báo cáo đối chiếu dữ liệu |
| D22–D24 | Tích hợp, E2E/concurrency, responsive, scaling evidence | Các mục A01–A48 có kết quả hoặc ghi rõ blocker; sửa lỗi nghiêm trọng |
| D25–D27 | Đóng băng scope, quay demo, tài liệu, clean ZIP/Rubrik | Clone/extract và chạy Compose; demo 1080p, credentials và evidence đầy đủ |

Đây là mục tiêu làm việc, không cam kết trước rằng toàn bộ tính năng đã hoàn thành hoặc đủ điểm. Test logic quan trọng cùng lúc phát triển, không dồn toàn bộ kiểm thử vào D22.

## Phân công đề xuất

- Thành viên A: frontend storefront, catalog/cart/checkout/account và responsive.
- Thành viên B: backend identity/catalog/reviews, auth, migrations, dữ liệu và ảnh.
- Thành viên C: backend checkout/orders/loyalty/Admin, Compose/worker/scaling.
- Admin UI chia A/C sau khi thống nhất API; kiểm tra chéo A↔B↔C. Mỗi người có phần code và kiểm chứng có ý nghĩa; điều chỉnh theo năng lực thực tế.

Tạo repository và mời đủ ba thành viên từ D1; dùng branch/PR nhỏ, commit thật đều đặn ít nhất hai lần/tuần/người, họp tích hợp ngắn hàng ngày. Không tự init/push repository hay phân công cho tài khoản cụ thể khi chưa có tên và remote do nhóm chọn.

**Giới hạn teamwork:** 27 ngày không đủ lịch sử ít nhất một tháng mà PDF yêu cầu nếu bắt đầu từ bây giờ. Lưu bằng chứng thực tế, chấp nhận rủi ro mất một phần/toàn bộ 0.5 điểm teamwork; nhóm có thể trao đổi với giảng viên về tiêu chí này. Không backdate commit hay tạo contributions giả.

## Dữ liệu và ảnh cần giao trong phase catalog

- 60 products: Laptop, Desktop PC, Monitor, GPU, RAM, SSD; mỗi category 10 products. Mỗi product ≥2 variants, ≥3 ảnh minh họa phù hợp, ≥5 dòng mô tả tiếng Anh, brand/tags/price/cost/stock.
- Thông số và quan hệ biến thể hợp lý; ví dụ RAM kit theo capacity, SSD theo capacity, monitor theo cấu hình thực tế. Không bịa biến thể model thực chưa kiểm chứng; dùng tên cấu hình demo rõ ràng khi cần.
- Seed idempotent với ID ổn định. Có đủ dữ liệu home 8/page và catalog 12/page; search có truy vấn trả >1 trang.
- Ảnh lưu local, tối ưu WebP, alt tiếng Anh; không hotlink và không copy ảnh không rõ quyền. Nguồn/author/license/attribution ghi vào `docs/ASSET_SOURCES.md` khi tải asset. Không dùng ba bản sao/crop của một ảnh để giả ba góc sản phẩm.
- Upload: tối đa 5 MB/ảnh, chấp nhận JPEG/PNG/WebP theo file signature, xử lý lại thành ảnh, loại metadata, từ chối SVG/HTML. Shared media volume phục vụ hai replica; kiểm tra tồn tại và thứ tự ảnh trước publish product.
- Đơn mẫu, comment/rating, loyalty ledger và coupon hợp lệ theo mục 6.3 blueprint; dữ liệu analytics được sinh từ orders thật trong DB.

**Cập nhật triển khai 2026-11-08:** đã có source ứng dụng, dataset 60 sản phẩm, ảnh local/attribution và Docker Compose chạy được. Kết quả kiểm thử và việc còn lại được theo dõi tại [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Lịch D1–D27 phía trên là kế hoạch nhóm ban đầu, không phải lịch sử đóng góp Git đã thực hiện.
