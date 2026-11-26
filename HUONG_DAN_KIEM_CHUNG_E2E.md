# HƯỚNG DẪN KIỂM CHỨNG END-TO-END — OBSIDIAN COMPUTE

## 1. Mục đích

Hướng dẫn này giúp thành viên trong nhóm:

- Chạy phiên bản project đã được sửa lỗi.
- Kiểm tra các chức năng ban đầu vẫn hoạt động.
- Kiểm chứng lại 46 mục trong nhật ký sửa lỗi.
- Kiểm tra trực tiếp cả bốn Bonus.

**Phiên bản kiểm chứng:**

- Branch: `fix-issue`.
- Commit: `e1848ce8cfac26829706bfcc7b41ff5c7d5b62c1`.

Thứ tự thực hiện: Khởi chạy project → Kiểm thử tự động → Kiểm tra chức năng và lỗi đã sửa → Kiểm tra Bonus.

---

## 2. Chuẩn bị và chạy project

### 2.1. Yêu cầu

- Git.
- Docker Desktop hoặc Docker Engine, Compose v2, Linux containers.
- Node.js 24 LTS và npm để chạy test.
- Chrome hoặc Chromium.
- Internet để tải dependencies, Docker Image và AI model lần đầu.

Docker Desktop nên được cấp ít nhất 4 GB RAM.

Các câu lệnh bên dưới sử dụng Windows PowerShell.

### 2.2. Lấy source code

Clone project sang thư mục mới để không ảnh hưởng dữ liệu đang sử dụng:

```powershell
git clone --branch fix-issue --single-branch https://github.com/PeterPhan2005/Obsidian-compute.git obsidian-verify
cd obsidian-verify
git switch --detach e1848ce8cfac26829706bfcc7b41ff5c7d5b62c1
git rev-parse HEAD
cd source
```

Không sử dụng nhánh `main` vì phiên bản đã nghiệm thu hiện nằm trên `fix-issue`.

### 2.3. Khởi động

Lệnh chạy project thông thường:

```powershell
docker compose up -d
```

Tuy nhiên, để thực hiện tài liệu này, sử dụng môi trường riêng:

```powershell
$demo = "obsidian-recheck-" + (Get-Date -Format yyyyMMddHHmmss)
docker compose -p $demo up -d
docker compose -p $demo ps --all
```

Chỉ chọn một cách khởi động. Giữ nguyên Terminal chứa biến `$demo` trong suốt quá trình kiểm tra.

Đảm bảo cổng 8080 và 8025 còn trống, Docker Engine chạy local và không sử dụng cấu hình database hoặc SMTP thật.

Kiểm tra API:

```powershell
curl.exe --fail http://localhost:8080/api/v1/health
```

**Kết quả mong đợi:** Init exit code 0; PostgreSQL, Redis, Elasticsearch, hai Core API replicas, Realtime Gateway, Worker, Frontend và Nginx hoạt động.

Nếu gặp lỗi:

```powershell
docker compose -p $demo logs --tail=100 init api-a api-b realtime worker elasticsearch
```

### 2.4. Thông tin demo

| Thành phần | Địa chỉ |
|---|---|
| Website | http://localhost:8080 |
| Mailpit | http://localhost:8025 |
| API Health | http://localhost:8080/api/v1/health |

| Tài khoản | Email | Mật khẩu |
|---|---|---|
| Admin | admin@obsidian.local | ObsidianAdmin!2026 |
| Customer | alex@example.com | ObsidianCustomer!2026 |
| Customer | jordan@example.com | ObsidianCustomer!2026 |
| Customer OTP | sam@example.com | Lấy Email code trong Mailpit |

Database mới có 60 sản phẩm, sáu danh mục và 120 variant.

| Coupon | Công dụng |
|---|---|
| HELLO | Giảm 100.000đ |
| BUILD | Giảm 250.000đ |
| LAST1 | Giảm 50.000đ, một lượt sử dụng |
| ALLIN | Giảm tối đa phần tiền hàng |
| TAKE5 | Giảm 500.000đ |
| EMPTY | Đã hết lượt |
| ZZ999 | Không tồn tại |

Thanh toán sandbox:

- `DEMO-APPROVE`: Thành công.
- `DEMO-DECLINE`: Thất bại.

Chỉ sử dụng dữ liệu giả lập, không nhập thông tin thẻ thật.

---

## 3. Kiểm thử tự động

### 3.1. Chạy toàn bộ test

Mở Docker Desktop và Terminal tại thư mục `source/`:

```powershell
$env:ONNXRUNTIME_NODE_INSTALL_CUDA = "skip"
npm ci
npx playwright install chromium
npm run build
```

Sau đó chạy verifier và lưu kết quả:

```powershell
$verifyLog = Join-Path $env:TEMP ("obsidian-verify-" + (Get-Date -Format yyyyMMddHHmmss) + ".log")

npm run verify 2>&1 | Tee-Object -FilePath $verifyLog
```

Verifier tự tạo stack và database kiểm thử riêng, chạy Backend, Google OAuth fixture và Playwright, sau đó dừng stack và giữ lại volume.

Không cần tự khởi tạo database hoặc viết thêm test.

**Kết quả mong đợi:**

- Backend/OAuth: 60/60.
- Playwright: 34/34.
- Tổng cộng: 94/94.
- Terminal có thông báo `Verification passed.`.

Các cổng kiểm thử 8081, 8026, 15433, 3101 và 3102 phải còn trống.

### 3.2. Các chế độ kiểm thử khác

Chỉ kiểm tra Backend/OAuth:

```powershell
npm run verify -- --api-only
```

Chỉ kiểm tra công thức tính tiền, điểm thưởng và thời gian:

```powershell
npm test
```

Hai chế độ này không thay thế kiểm thử toàn bộ hệ thống.

### 3.3. Đọc kết quả

Mở log đã lưu:

```powershell
notepad $verifyLog
```

Hoặc tìm một bài test cụ thể:

```powershell
Select-String -Path $verifyLog -SimpleMatch "Variant attributes retain"
```

Tên tiếng Anh trong các mục tiếp theo là tên hoặc một phần tên bài test, không phải câu lệnh.

Nếu bài test có dấu kiểm hoặc trạng thái `ok`, nghĩa là bài test đó đã đạt.

Báo cáo và ảnh kiểm thử nằm tại:

```text
source/test-results/<project>/
source/playwright-report/<project>/
```

Mở `index.html` trong thư mục Playwright report để xem chi tiết.

**Chỉ cần chạy verifier đầy đủ một lần cho mỗi phiên bản cần kiểm chứng.** Không cần chạy lại cho từng lỗi.

---

## 4. Kiểm tra chức năng Core và các lỗi đã sửa

### 4.1. Kiểm tra các chức năng ban đầu

Thao tác trực tiếp trên website của stack demo tại `http://localhost:8080`.

| Chức năng | Thao tác kiểm tra | Kết quả mong đợi |
|---|---|---|
| Home | Mở New Products, Best Sellers và các nhóm danh mục | Hiển thị sản phẩm, có số trang |
| Catalog | Tìm kiếm, lọc category/brand/giá/rating, thử bốn kiểu sort tên/giá | Kết quả đúng điều kiện |
| Product Details | Xem ảnh, mô tả, tag, thay đổi variant | Giá và tồn kho đúng variant |
| Realtime | Mở hai cửa sổ, Guest bình luận, Customer đánh giá sao | Cập nhật không cần reload; Guest không được đánh giá sao |
| Đăng ký và đăng nhập | Đăng ký bằng email, họ tên, địa chỉ; lấy OTP; đặt mật khẩu; đăng nhập lại | Xác thực thành công |
| Tài khoản | Sửa profile, thêm địa chỉ, chọn mặc định, đổi/reset mật khẩu | Dữ liệu được lưu đúng |
| Giỏ hàng | Thêm, tăng giảm số lượng, xóa sản phẩm | Giỏ hàng cập nhật đúng |
| Guest checkout | Nhập thông tin giao hàng, thử coupon sai/đúng, thử thanh toán thất bại rồi thành công | Chỉ tạo đơn khi thanh toán hợp lệ |
| Guest chuyển thành Customer | Đăng nhập OTP bằng email vừa đặt hàng | Xem được đơn Guest trước đó |
| Customer checkout | Chọn địa chỉ, coupon, điểm thưởng rồi đặt hàng | Đơn xuất hiện trong Purchase History |
| Email | Mở Mailpit sau khi mua hàng, đăng nhập OTP hoặc reset mật khẩu | Nhận đúng email |
| Admin Products | Tạo, sửa, upload ít nhất ba ảnh, quản lý ít nhất hai variant active, archive sản phẩm | Catalog phản ánh đúng thay đổi |
| Admin Categories | Tạo, sửa, archive và tạo lại danh mục | Không archive danh mục còn sản phẩm active |
| Admin Users | Xem/chỉnh sửa thông tin, ban/unban tài khoản thử nghiệm | Quyền truy cập được cập nhật |
| Admin Orders | Lọc thời gian, xem chi tiết, chuyển trạng thái | Đơn mới nhất trước, 20 đơn/trang, trạng thái hợp lệ |
| Admin Coupons | Tạo coupon năm ký tự chữ/số, tối đa 10 lượt, thử dữ liệu sai | Validation và số lượt hoạt động đúng |
| Dashboard | Xem Simple/Advanced Dashboard, đổi khoảng thời gian, tạo thêm đơn | Thống kê doanh thu, lợi nhuận và số lượng đúng |
| Responsive | Thử Home, Catalog, Product Details, Cart, Dashboard ở màn hình nhỏ | Không tràn ngang hoặc mất chức năng chính |

**Kiểm tra Loyalty Points:**

- 1 điểm = 1.000đ.
- Thanh toán 1.000.000đ nhận 100 điểm.
- Điểm mới được sử dụng từ đơn tiếp theo.
- Tài khoản `sam@example.com` có 100 điểm trên database seed mới.

Kiểm tra số điểm trước và sau khi mua, sau đó thử sử dụng điểm ở đơn tiếp theo.

Google OAuth thật cần cấu hình theo `docs/GOOGLE_OAUTH_SETUP.md`. Test fixture không thay thế việc đăng nhập bằng tài khoản Google thật.

### 4.2. Kiểm chứng 46 mục sửa lỗi

Các số bên dưới tương ứng số thứ tự trong `log_fix_issue.md`.

**Cách sử dụng bảng:**

- Với lỗi giao diện: làm theo thao tác và đối chiếu kết quả.
- Với lỗi concurrency, database hoặc bảo mật: sử dụng bài test tự động đã chạy ở mục 3.
- Cột Test ghi tên file và từ khóa tìm trong log. Các file `.test.js` nằm trong `source/backend/tests/`; các file `.spec.js` nằm trong `source/tests/e2e/`.

#### A. Sản phẩm, tồn kho và danh mục

| Mục log | Lỗi trước khi sửa | Cách kiểm tra → Kết quả mong đợi | Test đối chiếu |
|---|---|---|---|
| 1, 16 | Form Admin ghi đè tồn kho sau checkout; nguy cơ xung đột khóa DB | Mở form khi tồn kho là 20, mua một chiếc bằng cửa sổ khác, sau đó chỉ sửa mô tả và lưu → Tồn kho vẫn là 19. Dùng test tự động kiểm tra cập nhật đồng thời. | `app.spec.js`: `Guest checkout preserves stock`; `integration.test.js`: `Inventory revisions protect product edits` |
| 2, 21 | Trùng ID variant hoặc tính sai variant active | Thử lưu sản phẩm chỉ còn một variant active → Bị từ chối. Variant archive không còn nằm trong danh sách chỉnh sửa active. Test API kiểm tra ID trùng. | `integration.test.js`: `Product saves require distinct active variants`; `admin-variants.spec.js` |
| 4 | Không tạo lại được danh mục cùng slug | Archive danh mục thử nghiệm rồi tạo lại cùng slug → Thành công, giữ ID cũ, không kích hoạt lại sản phẩm đã archive. | `integration.test.js`: `Category creation reuses archived slugs` |
| 5 | Lưu sản phẩm và archive danh mục đồng thời gây sai dữ liệu | Thử archive danh mục còn sản phẩm active → Bị từ chối. Test đồng thời phải không tạo sản phẩm active trong danh mục inactive. | `integration.test.js`: `Product create and reassignment serialize with category archive` |
| 33 | Tag bị mất hoặc tách sai khi sửa sản phẩm | Ghi nhận tag, chỉ sửa mô tả, lưu và mở lại → Tag giữ nguyên. Thử thêm tag mới → Lưu đúng. | `admin-variants.spec.js` |
| 34 | Variant archive vẫn góp vào giá và tồn kho | Tạo ba variant, archive variant rẻ nhất → Giá tối thiểu và tổng tồn đang bán chỉ tính hai variant active. | `core-data.test.js`: `Fresh demo orders snapshot category IDs`; `admin-variants.spec.js` |
| 38 | Form cũ ghi đè trạng thái mới | Mở cùng sản phẩm ở hai tab; lưu hoặc archive từ tab A rồi lưu tab B → Tab B bị từ chối với `409 PRODUCT_CONFLICT`. | `integration.test.js`: `Concurrent product saves that both read the same revision`; `admin-variants.spec.js` |
| 44 | Hai thuộc tính `memory_type` và `memoryType` bị gộp | Test tự tạo sản phẩm có cả hai thuộc tính, đọc, sửa và cập nhật tồn kho → Cả hai khóa và giá trị vẫn nguyên vẹn. | `inventory-regression.test.js`: `Variant attributes retain distinct JSON keys`; `admin-variants.spec.js` |
| 45 | Form cũ ghi đè giá vốn mới | Test lấy giá vốn ban đầu từ dữ liệu kiểm thử, cập nhật giá vốn, thử ghi bằng version cũ và tạo đơn trước/sau thay đổi → Yêu cầu dùng version cũ bị từ chối, đơn cũ giữ giá vốn lúc mua, đơn mới sử dụng giá vốn mới và lợi nhuận được tính đúng. | `inventory-regression.test.js`: `Cost edits fence stale product and inventory writes` |

Để kiểm tra riêng kết quả hai lỗi thuộc tính và giá vốn:

```powershell
Select-String -Path $verifyLog -SimpleMatch "Variant attributes retain distinct JSON keys"

Select-String -Path $verifyLog -SimpleMatch "Cost edits fence stale product and inventory writes"
```

Cả hai bài test phải PASS. Nếu chưa chạy verifier, có thể chạy `npm run verify -- --api-only` theo mục 3.

#### B. Catalog, Dashboard và giao diện

| Mục log | Lỗi trước khi sửa | Cách kiểm tra → Kết quả mong đợi | Test đối chiếu |
|---|---|---|---|
| 8 | Thiếu liên kết tag và SEO metadata | Bấm tag từ Product Details, kết hợp bộ lọc, chuyển trang; xem title và `meta name="description"` trong Elements → Tag và metadata đúng trang, giữ bộ lọc. | `catalog-tags.spec.js`: `Product tag links open a tagged catalog`, `Tag selection, empty results and pagination` |
| 14 | Sort hiển thị không khớp API | Mở Best Sellers, tìm keyword, chọn sort giá, đổi tag và dùng Back → Sort khớp thứ tự thực tế, có Relevance khi tìm kiếm. | `catalog-tags.spec.js`: `Catalog shows the effective sort` |
| 40 | Tổng số sản phẩm không khớp nội dung trang khi có cập nhật đồng thời | Test tự archive sản phẩm giữa hai truy vấn → Tổng và nội dung trang vẫn nhất quán trong cùng phản hồi. | `core-data.test.js`: `Public catalog count and page share a snapshot` |
| 9 | Best Sellers chưa có biểu đồ số lượng bán | Mở Simple Dashboard, xem các thanh và tooltip → Hiển thị đúng số lượng, tên và thứ hạng. | `dashboard-charts.spec.js`: `Best Sellers visualizes the existing ranking` |
| 10 | Thiếu thống kê loại sản phẩm theo thời gian | Đổi kỳ năm/quý/tháng/tuần/custom → Có số loại và số lượng bán theo từng danh mục tại từng mốc. | `dashboard-charts.spec.js`: `Advanced Dashboard displays category counts` |
| 11, 31 | Trùng hoặc đổi tên danh mục làm sai thống kê | Test dữ liệu danh mục trùng tên, tên đặc biệt và đổi tên → Đơn mới được nhóm đúng ID, giữ lịch sử; dữ liệu cũ thiếu ID có giới hạn xử lý. | `core-data.test.js`: `Analytics preserves separate category IDs`; `dashboard-charts.spec.js`: `Category chart preserves distinct IDs` |
| 12 | Sai kỳ thống kê do múi giờ | Kiểm tra kỳ mặc định và chạy test ranh giới ngày/tháng/năm → Dashboard và API thống nhất múi giờ Việt Nam. | `pricing.test.js`: `Calendar analytics ranges respect Vietnam timezone` |
| 13 | Legend chiếm hết vùng biểu đồ | Thu màn hình xuống 375 px, xem chart có tên danh mục dài → Các cột vẫn được vẽ và đọc được chú thích. | `dashboard-charts.spec.js`: `Long category legends leave room` |
| 15 | Tooltip ẩn làm trang tràn ngang | Hover biểu đồ doanh thu trên desktop, di chuột ra ngoài rồi thu xuống 375 px → Không tràn ngang, tooltip vẫn hoạt động. | `dashboard-charts.spec.js`: `Hidden revenue tooltip does not overflow` |

SEO metadata hoạt động không đồng nghĩa với việc Google đã lập chỉ mục website.

#### C. Tài khoản và bảo mật

| Mục log | Lỗi trước khi sửa | Cách kiểm tra → Kết quả mong đợi | Test đối chiếu |
|---|---|---|---|
| 17 | Google OAuth state và liên kết tài khoản chưa an toàn | Chạy OAuth fixture → State chỉ dùng một lần, token sai bị từ chối, không liên kết tài khoản trái phép. | `google-oauth.test.js`: `callback state is one-use`, `invalid tokens and claims fail without writes`, `third-party Google email needs an active matching verified session` |
| 26 | Dữ liệu tài khoản A còn xuất hiện khi đăng nhập B | Đăng nhập Alex, mở Profile/Cart/History, logout rồi đăng nhập Jordan; thử cả hai tab → Không lộ dữ liệu tài khoản trước. | `session-cache.spec.js`; `auth-concurrency.test.js`: `Identity-scoped reads, writes and refresh` |
| 28 | Token reset mật khẩu xuất hiện trong log/referrer | Forgot Password, reset bằng Mailpit; dùng test kiểm tra token giả lập → Reset hoạt động, token không lộ trong log mới được bảo vệ. | `receipt-privacy.spec.js`: `Recovery navigation suppresses referrers` |
| 29 | Xung đột giữa reset, refresh, logout và đổi mật khẩu | Đăng nhập cùng tài khoản ở hai trình duyệt rồi reset mật khẩu → Phiên cũ bị thu hồi, mật khẩu cũ không còn hợp lệ. Test tự động kiểm tra concurrency. | `auth-concurrency.test.js`: `A successful reset revokes existing sessions`, `Logout revokes its session`, `Concurrent password changes`, `Overlapping OTP and reset issuance` |
| 32 | Tắt demo seed không khởi tạo được Admin | Test tự tạo DB mới không có seed → Khởi tạo Admin bằng credentials hợp lệ, khởi động lại không đổi mật khẩu Admin. | `core-data.test.js`: `Non-demo bootstrap requires explicit credentials` |
| 39 | Đăng nhập báo lỗi nhưng vẫn cấp cookie | Test mô phỏng lỗi đọc profile và merge giỏ → Không cấp auth cookie mới khi đăng nhập thất bại. | `auth-concurrency.test.js`: `Failed profile reads and guest-cart merges` |

Không cần tự gây lỗi database hoặc sửa cấu hình xác thực để thực hiện các test trên.

#### D. Giỏ hàng, thanh toán, receipt và email

| Mục log | Lỗi trước khi sửa | Cách kiểm tra → Kết quả mong đợi | Test đối chiếu |
|---|---|---|---|
| 6 | Checkout bỏ qua mã thanh toán sandbox | Thử `DEMO-DECLINE`, sau đó `DEMO-APPROVE` → Lần thất bại không tạo đơn, không trừ tồn kho, coupon hoặc điểm. | `integration.test.js`: `Missing, legacy-only, mixed, invalid and declined payments` |
| 18 | Checkout không hợp lệ tạo giỏ rỗng | Test gửi request không có giỏ hợp lệ → Từ chối, không tạo giỏ hoặc cấp guest cookie ngoài ý muốn. | Test xử lý guest cart và checkout không hợp lệ trong `integration.test.js` |
| 19 | Nội dung đơn thay đổi sau Review | Giữ Customer ở bước Review, Admin đổi giá variant, Customer xác nhận → Phải Review lại. Test retry phải trả cùng đơn, không tạo trùng. | `checkout-quote.test.js`; `checkout-quote.spec.js` |
| 30 | Hai tab Guest tạo giỏ khác nhau | Mở hai tab cùng phiên Guest mới, thêm sản phẩm ở cả hai → Cùng một giỏ, không mất món. | `guest-cart-init.spec.js`: `A delayed first cart read and a concurrent add` |
| 3 | Báo thành công khi chưa có receipt hợp lệ | Đặt đơn, reload Success; sau đó mở `/checkout/success` trong phiên mới không có token → Chỉ receipt hợp lệ mới hiển thị thành công. | `app.spec.js`: `Checkout success requires a receipt` |
| 20, 37 | Receipt token bị lộ trong URL API và log | Mở Network sau checkout → Token đi qua `X-Receipt-Token`, không nằm trong URL API mới. Kiểm tra access log bằng test tự động, error log theo mục 4.3. | `receipt-privacy.spec.js` |
| 7 | Email chỉ dùng được cấu hình Mailpit cố định | Thử email đơn hàng, OTP, reset; dừng/khởi động Worker theo mục 5.2 → Email được xử lý, đơn hàng không bị mất. | `integration.test.js`: `Checkout commits with the Notification Worker stopped` |
| 22 | Subject email gây hiểu nhầm đơn đã được Admin xác nhận | Đặt đơn rồi mở Mailpit → Subject có `has been received`, nội dung đơn mới vẫn `pending`. | Kiểm tra trực tiếp email; đối chiếu bộ test đơn hàng/email |

Các test `Concurrent identical guest checkout`, `Two checkouts contend for one remaining stock unit` và `Two checkouts contend for one coupon use` trong `integration.test.js` kiểm tra thêm việc chống trùng đơn, bán vượt tồn kho và vượt lượt coupon.

SMTP bên ngoài cần kiểm tra bằng nhà cung cấp được phép theo `source/README.txt`, không sử dụng dữ liệu email thật trong stack demo.

#### E. Realtime, triển khai và Bonus

| Mục log | Lỗi trước khi sửa | Cách kiểm tra → Kết quả mong đợi | Test đối chiếu |
|---|---|---|---|
| 27 | Payload WebSocket sai làm gián đoạn service | Kiểm tra realtime hai cửa sổ; chạy test payload sai → Service không bị dừng, kết nối hợp lệ vẫn hoạt động. | `product-rooms.test.js`; `integration.test.js`: `Both API replicas publish comments and ratings` |
| 36 | WebSocket kết nối lại nhưng không vào đúng product room | Restart Realtime Gateway theo mục 5.2 → Trình duyệt tự kết nối lại và nhận cập nhật. | `realtime.spec.js`: `Product reviews recover after Gateway restart` |
| 23 | Sai tên file Compose | Kiểm tra `docker-compose.yml`, khởi động theo mục 2 → Tự migration, seed và chạy ứng dụng. | Docker Compose startup |
| 24 | Verifier có thể ảnh hưởng DB đang dùng | Chạy mục 3, quan sát project `obsidian-test-...` và DB `obsidian_test` → Stack kiểm thử riêng, giữ volume, có OAuth fixture. | `scripts/verify.mjs` |
| 25 | Playwright ghi đè ảnh demo | So sánh Git trước/sau verifier → Báo cáo lưu riêng, không ghi đè ảnh demo. | Kiểm tra Git và thư mục test-results |
| 43 | Checkout lỗi trên LAN HTTP | Thực hiện mục 4.4 → Guest/Customer checkout và realtime hoạt động trên origin LAN đã cấu hình, origin khác bị từ chối. | LAN smoke thực tế; test CSRF/WebSocket trong `integration.test.js` |
| 35 | CI không build được Docker Image | Kiểm tra Actions theo mục 5.1 → Build đúng commit, verify và publish thành công. | GitHub Actions |
| 41 | Vite dev tải nhầm HTML thay vì WASM | Chạy phép kiểm Vite tại mục 5.3 → WASM tải đúng, inference hoạt động. | Vite development smoke; `recommendations.spec.js` cho production |
| 42 | AI đề xuất trái yêu cầu hoặc thông số | Thử các câu không phù hợp tại mục 5.3 → Không trả đề xuất sai trong các mẫu đã kiểm chứng. | `recommendations.spec.js` |
| 46 | AI thiếu số trang | Nhập nhu cầu phù hợp, bấm Page 1 → Không gửi lại form, không chạy lại inference hoặc đổi trang Catalog. | `recommendations.spec.js` |

Kiểm tra việc bảo toàn source và ảnh demo trước/sau verifier, từ thư mục `source/`:

```powershell
git status --short
git -C .. diff -- docs/evidence/
```

### 4.3. Kiểm tra riêng receipt error log

Kiểm tra cấu hình đang chạy:

```powershell
docker compose -p $demo exec -T nginx nginx -T
docker compose -p $demo exec -T frontend nginx -T
```

Tìm các route `/checkout/success` và `/api/v1/checkout/receipts`. Các route receipt nhạy cảm phải có `error_log /dev/null` và biện pháp bảo vệ access log tương ứng.

Để kiểm tra thêm lỗi upstream tại ingress, chỉ thực hiện trên stack demo riêng:

```powershell
$probe = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$since = (Get-Date).ToUniversalTime().ToString("o")

docker compose -p $demo stop api-a api-b

curl.exe -sS -o NUL -w "%{http_code}" "http://localhost:8080/api/v1/checkout/receipts/$probe"
curl.exe -sS -o NUL -w "%{http_code}" "http://localhost:8080/api/v1/health"

docker compose -p $demo logs --since $since nginx frontend | Select-String -SimpleMatch $probe

docker compose -p $demo start api-a api-b
```

**Kết quả mong đợi:** Request thực sự gặp lỗi upstream nhưng token giả lập không xuất hiện trong log mới. Kiểm tra health sau khi khởi động lại API.

Đây là phép kiểm bổ sung tại ingress, chưa thay thế probe error log chuyên biệt ở cả hai lớp Nginx. Log lịch sử vẫn có thể chứa token từng bị ghi trước khi sửa.

### 4.4. Kiểm tra LAN HTTP

Xác định IP LAN của máy chạy Docker bằng `ipconfig`.

Ví dụ IP là `192.168.1.25`:

```powershell
$env:APP_BASE_URL = "http://192.168.1.25:8080"
docker compose -p $demo up -d
```

Thay IP ví dụ bằng IP thực tế.

Từ thiết bị khác cùng mạng, mở đúng URL trên và kiểm tra:

1. Guest checkout.
2. Customer login, checkout và Purchase History.
3. Comment/rating giữa hai cửa sổ.
4. Thao tác ghi dữ liệu và WebSocket từ origin khác phải bị từ chối.

Trong Developer Tools → Console:

```javascript
window.isSecureContext
typeof crypto.randomUUID
```

Nếu trả `false` và `"undefined"` nhưng checkout vẫn thành công, UUID fallback đã hoạt động trong môi trường LAN HTTP thông thường.

Không sử dụng browser flags để biến HTTP thành secure context.

Khôi phục localhost:

```powershell
Remove-Item Env:APP_BASE_URL
docker compose -p $demo up -d
```

LAN HTTP chỉ dùng trên mạng demo được kiểm soát. Mailpit vẫn truy cập từ máy chạy Docker.

---

## 5. Kiểm tra bốn Bonus

### 5.1. CI/CD

**Mục đích kiểm tra:** GitHub tự động build, kiểm thử và phát hành đúng Docker Image đã được kiểm chứng.

**Bước 1 — Kiểm tra Actions**

Mở:

https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45882025076

Kiểm tra commit `e1848ce`, job `verify`, 94/94 kết quả và job `publish`.

**Bước 2 — Kiểm tra GHCR**

Mở https://github.com/PeterPhan2005?tab=packages

Kiểm tra hai package Backend và Frontend có tag tương ứng commit.

**Bước 3 — Chạy image đã phát hành**

Dừng stack source để giải phóng cổng:

```powershell
docker compose -p $demo stop
```

Khai báo và tải hai image:

```powershell
$env:OBSIDIAN_BACKEND_IMAGE = "ghcr.io/peterphan2005/obsidian-compute-backend@sha256:628a93facf8431ea89fcf21049c668ea637b63e4790723d6c56933ecccadca83"

$env:OBSIDIAN_FRONTEND_IMAGE = "ghcr.io/peterphan2005/obsidian-compute-frontend@sha256:ef0b4b294387ca0105b2c0805c4f3528edd029e62443169168caa9b13ad38b73"

docker pull $env:OBSIDIAN_BACKEND_IMAGE
docker pull $env:OBSIDIAN_FRONTEND_IMAGE
```

Chạy đúng image đã phát hành, không build lại:

```powershell
$delivered = "obsidian-delivered-" + (Get-Date -Format yyyyMMddHHmmss)

docker compose -p $delivered -f docker-compose.yml -f compose.images.yaml up -d --no-build

docker compose -p $delivered -f docker-compose.yml -f compose.images.yaml ps --all
```

Mở website, kiểm tra Catalog, checkout và AI.

Muốn chạy toàn bộ test trên hai image GHCR:

```powershell
npm run verify -- --images
```

**Kết quả mong đợi:** 94/94 và đúng image ID của sáu container ứng dụng.

Không cần tạo commit mới để kiểm tra CI/CD.

Sau khi kiểm tra, quay về stack source:

```powershell
docker compose -p $delivered -f docker-compose.yml -f compose.images.yaml stop
docker compose -p $demo up -d
```

### 5.2. Microservices

**Mục đích kiểm tra:** Ba service ứng dụng hoạt động riêng và xử lý tác vụ không đồng bộ.

Kiểm tra container:

```powershell
docker compose -p $demo ps --all
```

| Service | Container | Nhiệm vụ |
|---|---|---|
| Core API | api-a, api-b | Nghiệp vụ chính |
| Realtime Gateway | realtime | WebSocket |
| Notification Worker | worker | Gửi email |

**Demo 1 — Realtime**

1. Mở cùng sản phẩm ở hai cửa sổ.
2. Bình luận hoặc đánh giá ở cửa sổ A.
3. Quan sát cửa sổ B cập nhật.
4. Restart Gateway:

```powershell
docker compose -p $demo restart realtime
```

5. Chờ service hoạt động rồi bình luận tiếp.

**Kết quả mong đợi:** Cửa sổ còn lại cập nhật không reload, kể cả sau khi Gateway kết nối lại.

**Demo 2 — Email bất đồng bộ**

```powershell
docker compose -p $demo stop worker
```

Đặt một đơn thử nghiệm. Đơn vẫn thành công nhưng email tương ứng chưa xuất hiện trong Mailpit.

Khởi động lại Worker:

```powershell
docker compose -p $demo start worker
```

**Kết quả mong đợi:** Email được gửi sau khi Worker hoạt động trở lại.

Có thể thử tương tự bằng cách dừng Mailpit, tạo đơn rồi khởi động lại Mailpit để kiểm tra retry.

**Demo 3 — Horizontal Scaling**

```powershell
1..12 | ForEach-Object {
    curl.exe -sS -D - -o NUL http://localhost:8080/api/v1/health
}
```

**Kết quả mong đợi:** Header `X-Instance-Id` xuất hiện cả `api-a` và `api-b`.

Đây là bằng chứng phân phối request, không phải phép đo khả năng chịu tải production.

### 5.3. AI Product Recommendation

**Mục đích kiểm tra:** AI hiểu nhu cầu bằng tiếng Việt và tiếng Anh, đề xuất sản phẩm trong Catalog.

Mở Catalog → AI product recommendations → Nhập nhu cầu → Get recommendations.

| Nội dung nhập | Kết quả mong đợi |
|---|---|
| A portable notebook for reading documents while I travel | Laptop |
| Tôi cần một chiếc laptop nhỏ nhẹ để làm việc khi đi xa | Laptop |
| Một màn hình lớn để đặt nhiều cửa sổ làm việc cạnh nhau | Monitor |
| Tôi cần thêm dung lượng để lưu nhiều tệp dự án lớn | SSD |
| Tôi muốn đặt bánh sinh nhật vị sô cô la | Không có đề xuất phù hợp |
| Tôi cần chuột không dây làm việc văn phòng | Không có đề xuất phù hợp |
| Không cần máy tính, tôi cần một máy in cho tài liệu văn phòng | Yêu cầu diễn đạt lại |
| Tôi muốn máy tính xách tay RAM 64 GB để phân tích dữ liệu | Yêu cầu diễn đạt lại |

Kiểm tra thêm:

- Chọn category và ngân sách tối đa.
- Giá và tồn kho phải thuộc cùng một variant hợp lệ.
- Tối đa ba đề xuất, có Page 1.
- Bấm Page 1 không gửi lại form hoặc thay đổi trang Catalog.
- Bấm sản phẩm mở đúng Product Details.
- Ngân sách không đủ hoặc vượt giới hạn 64 ứng viên phải có thông báo phù hợp.

**Kiểm tra AI chạy local trong trình duyệt:**

Mở Developer Tools → Network trước khi sử dụng AI. Quan sát ONNX model và WASM chỉ tải khi dùng AI, từ origin của website. Không gửi nhu cầu đến dịch vụ inference bên ngoài.

Lần đầu tải khoảng 158 MB. Tên sản phẩm được đề xuất có thể thay đổi nếu Catalog đã thay đổi.

Các tình huống model lỗi, inference lỗi, giới hạn ứng viên, sản phẩm archive và mobile được kiểm tra bằng `recommendations.spec.js`.

**Kiểm tra bổ sung WASM trong Vite development — mục log 41**

Production PASS không thay thế việc kiểm tra Vite dev.

Vite proxy tới `localhost:3000`. Để chạy trên stack demo mà không sửa source, đảm bảo cổng 3000 và 5173 còn trống rồi tạo override tạm:

```powershell
$previousOrigin = $env:APP_BASE_URL
$viteOverride = Join-Path $env:TEMP "$demo-vite.yaml"

@'
services:
  nginx:
    ports:
      - "127.0.0.1:3000:80"
'@ | Set-Content -Path $viteOverride -Encoding ascii

$env:APP_BASE_URL = "http://localhost:5173"
docker compose -p $demo -f docker-compose.yml -f $viteOverride up -d
```

Mở Terminal khác tại `source/`, chạy:

```powershell
npm run dev -w frontend -- --host localhost --port 5173 --strictPort
```

Mở `http://localhost:5173`, thử một nhu cầu tiếng Việt và kiểm tra Network.

**Kết quả mong đợi:** Request WASM nhận đúng nội dung WASM thay vì HTML, AI trả được đề xuất.

Sau khi kiểm tra, Ctrl+C để dừng Vite và khôi phục stack:

```powershell
if ($null -eq $previousOrigin) {
    Remove-Item Env:APP_BASE_URL -ErrorAction SilentlyContinue
} else {
    $env:APP_BASE_URL = $previousOrigin
}

docker compose -p $demo -f docker-compose.yml up -d
Remove-Item -LiteralPath $viteOverride
```

Kiểm tra lại website localhost:8080.

### 5.4. Elasticsearch

**Mục đích kiểm tra:** Tìm kiếm bằng Elasticsearch, tự đồng bộ dữ liệu và chuyển sang PostgreSQL khi Elasticsearch gặp lỗi.

**Bước 1 — Kiểm tra index và tìm kiếm**

```powershell
docker compose -p $demo ps elasticsearch

docker compose -p $demo exec -T elasticsearch curl -fsS http://127.0.0.1:9200/products-v1/_count

curl.exe -sS -D - -o NUL "http://localhost:8080/api/v1/products?q=Northstar"
```

Kết quả header:

```text
X-Search-Backend: elasticsearch
```

Trên seed chưa chỉnh sửa, `Northstar` trả 18 kết quả.

**Bước 2 — Kiểm tra đồng bộ**

Tạo hoặc sửa sản phẩm thử nghiệm bằng từ khóa riêng biệt. Chờ đồng bộ rồi tìm từ khóa đó. Sau đó archive sản phẩm và tìm lại.

**Kết quả mong đợi:** Sản phẩm xuất hiện sau đồng bộ; sản phẩm archive không còn trong Catalog public.

**Bước 3 — Kiểm tra fallback**

```powershell
docker compose -p $demo stop elasticsearch

curl.exe -sS -D - -o NUL "http://localhost:8080/api/v1/products?q=Northstar"
```

Kết quả header:

```text
X-Search-Backend: postgresql
```

Website vẫn tìm kiếm được, dù tập kết quả hoặc thứ tự có thể khác Elasticsearch.

**Bước 4 — Kiểm tra phục hồi**

```powershell
docker compose -p $demo up -d elasticsearch
```

Chờ index sẵn sàng, gọi lại API tìm kiếm.

**Kết quả mong đợi:** Header trở lại `X-Search-Backend: elasticsearch`.

Bộ `product-search.test.js` kiểm tra thêm timeout, đồng bộ đồng thời, phục hồi index, filter, sorting và pagination.

Không xóa index hoặc volume để kiểm tra. Chưa có bằng chứng Elasticsearch nhanh hơn PostgreSQL trên 60 sản phẩm demo.

---

## 6. Kết thúc kiểm chứng

### 6.1. Checklist

- [ ] Project chạy bằng Docker Compose.
- [ ] Production build thành công.
- [ ] Backend/OAuth đạt 60/60 và Playwright đạt 34/34.
- [ ] Các chức năng Core hoạt động đúng.
- [ ] Đã đối chiếu đủ 46 mục sửa lỗi.
- [ ] Checkout localhost và LAN HTTP hoạt động.
- [ ] CI/CD và image GHCR hoạt động.
- [ ] Microservices, realtime và email bất đồng bộ hoạt động.
- [ ] AI song ngữ, điều kiện đề xuất và phân trang hoạt động.
- [ ] Elasticsearch tìm kiếm, đồng bộ và fallback hoạt động.
- [ ] Source và dữ liệu ngoài môi trường kiểm thử không bị ảnh hưởng.

Nếu gặp lỗi, ghi lại chức năng, các bước tái hiện, kết quả mong đợi, kết quả thực tế và ảnh/log minh chứng không chứa thông tin nhạy cảm.

PASS chỉ xác nhận phạm vi đã kiểm thử, không chứng minh tuyệt đối hệ thống không còn lỗi.

Google OAuth thật, SMTP ngoài, search-engine indexing và hiệu năng AI trên thiết bị di động thật vẫn cần xác minh riêng.

### 6.2. Dừng stack

Đối với stack source:

```powershell
docker compose -p $demo stop
```

Đối với stack GHCR nếu đã tạo:

```powershell
docker compose -p $delivered -f docker-compose.yml -f compose.images.yaml stop
```

Giữ lại volume để đối chiếu khi cần. Không sử dụng `docker compose down -v`, `docker system prune` hoặc xóa tài nguyên chưa xác định rõ.

### 6.3. Tài liệu đối chiếu

- `TONG_KET_CONG_VIEC.md`: Tổng quan công việc.
- `log_fix_issue.md`: Chi tiết 46 mục sửa lỗi.
- `PROJECT_STATE.md`: Trạng thái và checkpoint dự án.
- `source/README.txt`: Hướng dẫn chạy và cấu hình.
- `docs/DEMO_WALKTHROUGH.md`: Demo Core.
- `docs/GOOGLE_OAUTH_SETUP.md`: Cấu hình Google Login.
- Thư mục local `Bonus/`: Bốn hướng dẫn chi tiết về Bonus.

Tài liệu tiến độ và bàn giao nằm trên nhánh `progress`. Source code đã nghiệm thu nằm trên nhánh `fix-issue`.
