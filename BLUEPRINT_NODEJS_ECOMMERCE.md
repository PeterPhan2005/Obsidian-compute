# BLUEPRINT TRIỂN KHAI — NODE.JS COMPUTER E-COMMERCE

**Phiên bản:** 1.1 · **Ngôn ngữ triển khai:** JavaScript · **Đối tượng sử dụng:** Codex / nhóm phát triển  
**Nguồn yêu cầu:** *NodeJS Final Project.pdf*, 13 trang, môn Web Programming with Node.js – 502070, học kỳ 2 năm học 2024–2025.  
**Mục tiêu:** Một bản đặc tả duy nhất có thể giao cho Codex để xây dựng ứng dụng, cơ sở dữ liệu, UI, API, kiểm thử và triển khai.

> **QUY TẮC ĐỌC QUAN TRỌNG**
>
> - **[PDF–BẮT BUỘC]**: điều đề bài yêu cầu; không được lược bỏ.
> - **[PDF–TÍM / KHÓA]**: điều có chữ màu tím trong tài liệu gốc; phải giữ nguyên ý nghĩa, không bổ sung/chỉnh sửa trái ràng buộc.
> - **[THIẾT KẾ ĐỀ XUẤT]**: PDF không quy định chi tiết, blueprint chốt một cách triển khai khả thi; Codex phải làm nhất quán nhưng không được coi là lời của giảng viên.
> - **[BONUS–TÙY CHỌN]**: chỉ làm sau khi hoàn tất chức năng lõi và không phá vỡ các giới hạn của đề.
>
> **Thứ tự ưu tiên khi xung đột:** văn bản màu tím của PDF → các yêu cầu còn lại của PDF → quy tắc nghiệp vụ trong blueprint → chi tiết UI/API/tech stack đề xuất. Nếu một đề xuất xung đột PDF, bỏ đề xuất. **Không tự thêm chức năng ngoài danh sách quản trị cho Admin.**

---

## 0. Quyết định đã xác nhận với chủ dự án — 2026-11-08

- Không có yêu cầu bổ sung ngoài PDF. Chủ dự án giao quyền chốt các chi tiết còn mơ hồ trong phạm vi đề.
- Tên cửa hàng: **OBSIDIAN COMPUTE**. Toàn bộ storefront, Admin, email, validation và nội dung sản phẩm dùng **tiếng Anh**; tài liệu nhóm có thể dùng tiếng Việt. Các câu UI tiếng Việt trong phần dưới chỉ minh họa ý nghĩa, phải chuyển thành tiếng Anh khi triển khai.
- Giao diện tối giản, hiện đại, đen làm chủ đạo. Không dùng art direction nền sáng của phiên bản 1.0. Tiền vẫn là VND, timezone Asia/Ho_Chi_Minh.
- Thanh toán: sandbox mô phỏng nội bộ qua DemoPaymentAdapter, có success/failure và zero-amount success; không tích hợp cổng bên ngoài ở core. Ghi rõ **Sandbox payment — no real charge**. Mailpit chỉ nhận email thử nghiệm, không phải cổng thanh toán.
- Auth: giữ đăng ký ba nhóm thông tin, email OTP, đặt mật khẩu sau xác minh và Google OIDC. Chưa có Google credentials; hướng dẫn ở [docs/GOOGLE_OAUTH_SETUP.md](docs/GOOGLE_OAUTH_SETUP.md). Không coi Google login đã hoàn thành trước khi thử callback thật.
- Nhóm có **3 thành viên**, chưa bắt đầu, còn **27 ngày** theo thông tin chủ dự án. Xem kế hoạch tương đối ở [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md); không suy đoán giờ nộp chính thức.
- Nhóm phát triển chuẩn bị catalog/ảnh local có nguồn và quyền sử dụng rõ ràng; Admin hỗ trợ upload ảnh ngay trong form sản phẩm, không thêm module media. File upload lưu ở shared volume dùng chung hai API replicas; validate loại ảnh thực, dung lượng, đổi tên file ngẫu nhiên, không thực thi nội dung upload.
- Core và bằng chứng triển khai ưu tiên trước bonus. Không tự kích hoạt bonus.

---

## 1. Project này là gì?

Xây dựng **website thương mại điện tử B2C chuyên bán máy tính và linh kiện máy tính**, dùng Node.js/JavaScript ở backend, có storefront dành cho khách mua hàng và khu quản trị cho **đúng một Administrator**. Khách có thể xem, tìm kiếm, lọc, chọn biến thể, thêm giỏ, áp mã giảm giá, thanh toán và mua hàng **mà không đăng nhập**. Sau đơn mua của khách vãng lai, tài khoản customer tương ứng email được tạo tự động nếu chưa tồn tại. Khi xác thực email và đăng nhập về sau, họ thấy các đơn trước đó. Customer có địa chỉ giao hàng, lịch sử đơn, đánh giá sao, bình luận, điểm thưởng. Admin quản lý người dùng, sản phẩm/danh mục/tồn kho, đơn hàng, mã giảm giá và hai dashboard.

### 1.1 Phạm vi hàng hóa và tài khoản — KHÔNG ĐƯỢC VI PHẠM

| Điều kiện | Quyết định triển khai |
|---|---|
| **[PDF–TÍM]** Chỉ máy tính và linh kiện máy tính | Chỉ seed và cho phép tạo các danh mục như Laptop, Desktop PC, Monitor, CPU, GPU, RAM, SSD, Motherboard. Tuyệt đối không bán điện thoại hoặc các ngành hàng khác. Validate category ở backend, không chỉ ẩn UI. |
| **[PDF–TÍM]** Chỉ hai loại user | `CUSTOMER` và `ADMIN`; đúng **một** tài khoản ADMIN được seed. Không seller, moderator, staff, vendor hay superadmin khác. |
| **[PDF–TÍM]** Trang đầu tiên là landing | Route `/` là homepage; `/products` là catalog riêng, không gộp vào homepage. |
| **[PDF–TÍM]** Guest mua mà không login | Không ép tạo tài khoản/đăng nhập trong checkout; server tự tạo account customer theo email nếu chưa có. |
| **[PDF–TÍM]** Form tạo account chỉ nhập 3 trường | Chỉ **email, full name, shipping address**. Không hiển thị input password trong form đăng ký. |
| **[PDF–TÍM]** Mã giảm giá | Đúng 5 ký tự chữ/số; do admin tạo; **không hạn sử dụng**; giới hạn lượt dùng do admin chọn, **tối đa 10**. |
| **[PDF–TÍM]** Admin không được có thêm tính năng | Chỉ các module quản trị được liệt kê ở `5.8. Không thêm trang cấu hình, banner, blog, chat, kiểm duyệt review, báo cáo xuất file, quản lý quyền, thanh toán/refund trong Admin. |

### 1.2 Nhóm người dùng và quyền

| Vai trò | Được làm | Không được làm |
|---|---|---|
| Guest | Xem mọi trang public; tìm/lọc/sắp xếp; xem/viết comment; giỏ hàng; checkout; xem phiếu xác nhận đơn của chính phiên mua qua receipt token | Gửi rating sao; truy cập thông tin đơn của user khác; API admin |
| Customer | Toàn bộ guest + đăng nhập, profile, nhiều địa chỉ, đổi/khôi phục mật khẩu, rate sao, xem đơn và timeline, sử dụng điểm tích lũy | Quản lý sản phẩm/đơn của toàn shop, quản trị |
| Admin (duy nhất) | Dashboard đơn giản/nâng cao; quản lý product/category/variant inventory, users, orders/status, discount codes | **Không** có module admin khác ngoài đề |

## 2. Những yêu cầu PDF phải được hiện thực đầy đủ

### 2.1 Homepage

- **[PDF–BẮT BUỘC]** Có nhóm **New Products**, **Best Sellers**, và ít nhất **3 danh mục khác nhau** (đề ví dụ laptop/monitor/hard drive). Đề xuất hiển thị Laptop, Monitor, Graphics Card; vẫn seed thêm Desktop/CPU/RAM/SSD.
- Khách không cần đăng nhập để xem và mua.
- Mọi **danh sách sản phẩm** có phân trang thực sự, bao gồm các section trang chủ: thấy số trang **kể cả chỉ có một trang**; dữ liệu demo đủ để chuyển qua ít nhất hai trang.
- Hero/banner có thể là phần trình bày tĩnh, **không phải hệ thống quản lý banner cho Admin**.

### 2.2 Auth, profile, địa chỉ

- Đăng ký với **đúng 3 đầu vào**: email, full name, shipping address; email unique không phân biệt hoa/thường.
- Đăng nhập bằng ít nhất **một social provider** (chọn Google OAuth 2.0/OIDC); đồng thời hỗ trợ đăng nhập thường, đổi password và password recovery.
- Xem/cập nhật profile; có **hơn một** delivery address; chọn default address; chỉnh/sửa/xóa địa chỉ; prefill default khi checkout đăng nhập nhưng cho đổi địa chỉ khác.
- Giải pháp mâu thuẫn “đăng ký không nhập password” vs “đổi/recover password”: tạo account `passwordHash = null`, xác minh/đăng nhập qua **email OTP** hoặc Google. Trong profile, khách đã xác minh email có thể **đặt mật khẩu lần đầu** qua luồng Change Password; khi đã có password thì đổi phải nhập mật khẩu cũ; Forgot Password gửi link/token để thiết lập lại. Không ép nhập password trong bước đăng ký.
- Guest checkout với email đã có tài khoản sẽ gắn order vào user tương ứng **nhưng không cấp phiên đăng nhập**; chỉ người chứng minh quyền sở hữu email qua OTP/Google/password mới xem order history.

### 2.3 Catalog và product detail

- `/products` là trang catalog **riêng**; card có ảnh, tên, giá, mô tả ngắn; list/grid (một kiểu có thể là đủ, đề cho phép cả hai); pagination.
- Sản phẩm có category, tags, brand; search keyword; sort tối thiểu **4 cách: name A→Z, name Z→A, price low→high, price high→low**. Có thể thêm newest và best_selling như sort phụ.
- Ít nhất **3 tiêu chí filter**, **bắt buộc brand + minPrice/maxPrice**; chọn thêm category và ratingMin để hoàn chỉnh. Kết hợp filter + search + sort + pagination.
- Product detail: tên, giá, brand, các variants, **mô tả ngắn ít nhất 5 dòng**, **ít nhất 3 ảnh**, bình luận, tổng hợp sao, danh sách bình luận.
- Mỗi variant theo dõi tồn kho **độc lập**. Để lấy trọn điểm: **mọi product có ít nhất 2 variants**.
- **Guest được comment**, **chỉ customer đã đăng nhập mới được rate sao**; không cần mua sản phẩm mới được rate. Có cập nhật comment/rating real-time qua WebSocket để đạt dòng rubric riêng.

### 2.4 Giỏ, checkout, coupon

- Add / update quantity / remove item mà **không reload trang**; UI tự tính lại line total, subtotal, tổng tiền.
- Cart summary cho biết subtotal, thuế, phí ship, giảm coupon, sử dụng điểm, final total. Không để frontend quyết định giá thực tế.
- Checkout nhiều bước: **Giỏ → Thông tin nhận hàng → Thanh toán/ưu đãi → Xác nhận → Thành công**. Guest dùng được.
- Nhập coupon trước khi thanh toán, nhìn thấy **hợp lệ/không hợp lệ và số tiền giảm** trên quote. Coupon 5 chữ-số, không expires, usageLimit từ 1–10. Mọi coupon tối đa dùng `usageLimit` **toàn hệ thống**, không phải 10 lần/người.
- **[THIẾT KẾ ĐỀ XUẤT]** Coupon giảm số tiền VND cố định (`discountAmountVnd`) vì PDF chỉ nói “discount value”, không yêu cầu dạng phần trăm. Không tạo editor coupon phức tạp khác; coupon chỉ được tạo và xem.

### 2.5 Order, email, loyalty

- **Chỉ tạo order sau khi payment báo thành công**. Sau đó hiển thị order-success gồm số đơn, người nhận, email, địa chỉ, danh sách variant/quantity/đơn giá, các thành phần tiền, thanh toán, trạng thái.
- Gửi **confirmation email** chứa thông tin đơn vừa đặt; lưu trạng thái gửi/outbox để retry khi SMTP lỗi.
- Trạng thái đơn: `pending → confirmed → shipping → delivered`. Order tracking phải có **toàn bộ lịch sử status và timestamp, mới nhất trước**. Admin là người đổi trạng thái.
- Lịch sử order cho customer: orderNumber, purchaseDate, total, status, từng item và quantity; login required.
- Loyalty đúng ví dụ của PDF: **1.000.000 VND → 100 points → giá trị quy đổi 100.000 VND**, tức **1 point = 1.000 VND** và earn bằng **10% số tiền order**. Công thức được chốt ở `7.6; điểm mới kiếm từ order N chỉ sử dụng từ **order N+1**, không dùng ngay chính order N; không đặt mức đổi tối thiểu/giới hạn sử dụng nhân tạo.

### 2.6 Admin

1. **Simple Dashboard:** total users, new users, total orders, revenue, best sellers và biểu đồ liên quan.
2. **Advanced Dashboard:** mặc định năm; chuyển year/quarter/month/week/custom date range. Có số orders, revenue, profit; biểu đồ so sánh revenue/profit/số sản phẩm bán/loại sản phẩm theo mốc year/month/quarter/week.
3. **Product Management:** create/update/delete sản phẩm; quản lý category, variants, inventory.
4. **User Management:** list/detail, cập nhật thông tin và ban/unban users.
5. **Order Management:** list newest-first, khoảng **20/page**, filter today/yesterday/this week/this month/custom from-to; detail buyer/time/tổng/coupon/items; update status.
6. **Discount Management:** list code, thời gian tạo, discount value, usedCount/usageLimit, những order đã áp dụng; create code.

**Không có trang/quyền admin nào khác.** Dashboard backend có thể có các helper nội bộ; helper không được lộ thành tính năng quản trị mới.

### 2.7 Giao diện và yêu cầu phi chức năng

- UI dễ hiểu, đẹp hơn mức cơ bản, điều hướng mạch lạc; giá định dạng kiểu `75,299,000đ`; thời gian và trạng thái hiển thị dễ đọc.
- Responsive mobile/tablet/desktop, không tràn ngang, header/filters/table/orders hoạt động trên màn hình hẹp.
- Tối ưu tải ảnh, list skeleton, empty/error states, keyboard focus, accessible labels, lỗi field rõ ràng.
- Horizontal scaling thật: nhiều API replicas sau load balancer, process stateless, shared PostgreSQL/Redis, không lưu business data trong RAM instance; có bằng chứng thực tế.

## 3. Tech stack được phép và stack CHỐT để Codex xây

### 3.1 Bắt buộc từ PDF vs lựa chọn

| Thành phần | PDF yêu cầu | Chọn cụ thể cho dự án [ĐỀ XUẤT] |
|---|---|---|
| Ngôn ngữ | **JavaScript** và **Node.js**; backend framework Node.js (ví dụ Express) | JavaScript ESM thống nhất toàn repo; Node.js runtime LTS tương thích |
| Backend | Framework trên Node.js | **Express 5**, REST API `/api/v1`, Socket.IO |
| Frontend | Tự chọn frontend framework dựa trên Node.js toolchain | **React + Vite**, React Router, TanStack Query, React Hook Form + Zod |
| Database | Không chỉ định | **PostgreSQL** + `pg` + **Knex migrations/query builder** (hoặc equivalent JavaScript SQL layer) |
| Styling | Responsive; có thể dùng Bootstrap/CSS Grid | **Tailwind CSS**, CSS Grid/Flexbox, headless accessible components |
| Auth | Normal, social, change/recover | Google OAuth/OIDC, email OTP, password hash Argon2id, httpOnly cookie |
| Email | Order confirmation | Nodemailer / SMTP; **Mailpit** trong Compose để chấm demo |
| Realtime | WebSocket review/rating nếu làm | Socket.IO + Redis adapter cho nhiều replicas |
| Cache/pubsub | Không quy định | Redis cho Socket.IO pub/sub và transient rate limits; **không** làm dữ liệu chính |
| Testing | Chức năng đầy đủ | Vitest/Jest, Supertest, React Testing Library, Playwright |
| Deploy | **Hosting public** hoặc **Docker Compose**, chọn một | **Docker Compose** với frontend, api x2, db, redis, worker, reverse proxy, Mailpit |
| Load balancing | Horizontal scaling | Nginx reverse proxy round-robin 2 API replicas |

**Không bắt buộc** Next.js, MongoDB, TypeScript, microservices, Kubernetes, ElasticSearch hoặc thanh toán ngân hàng thật. Không chuyển cả backend sang Python/Java/TypeScript: đề yêu cầu JavaScript.

Các nguồn kỹ thuật tham khảo để Codex triển khai đúng API thư viện:
- Express 5: https://expressjs.com/en/5x/starter/installing/
- PostgreSQL/Knex: https://knexjs.org/guide/
- Docker Compose: https://docs.docker.com/reference/cli/docker/compose/up/
- Socket.IO rooms: https://socket.io/docs/v4/rooms/

### 3.2 Kiến trúc tổng thể

```text
Browser (React/Vite SPA)
    │  HTTPS / same-origin / cookies
    ▼
Nginx reverse proxy
    ├── frontend static serving
    ├── /api/*  ──► Express API replica A ─┐
    │            └► Express API replica B ─┼── PostgreSQL (source of truth)
    └── /socket.io ─► Socket.IO A/B         │
                                            ├── Redis (pub/sub, rate limiting)
Background Node.js worker ◄── DB outbox ────┘
    └── SMTP / Mailpit demo
```

**Kiểu kiến trúc:** modular monolith (một API ứng dụng chia module nghiệp vụ). Đây là lựa chọn để đạt yêu cầu lõi; microservices là bonus riêng, **không tự động triển khai**. Frontend không truy cập DB/Redis trực tiếp.

### 3.3 Cấu trúc monorepo mong muốn

```text
source/
  frontend/
    src/
      app/ routes/ components/ layouts/ features/
      api/ hooks/ styles/ utils/
    public/
    Dockerfile
  backend/
    src/
      app.js server.js
      config/ middleware/ lib/
      modules/
        auth/ users/ addresses/ catalog/ reviews/
        cart/ checkout/ coupons/ orders/ loyalty/
        admin-dashboard/ admin-users/ admin-catalog/
        admin-orders/ admin-coupons/
      realtime/ jobs/ db/
    migrations/ seeds/ tests/
    Dockerfile
  worker/
    src/ index.js mailer.js
    Dockerfile
  nginx/
    nginx.conf
  compose.yaml
  .env.example
  README.txt
  package.json
tests/e2e/
docs/ (nếu cần ảnh minh chứng)
```

Tên file/thư mục có thể đổi nếu giữ boundaries rõ. Không cần tạo thư mục bonus khi chưa có bonus thật.

### 3.4 Backend module responsibilities

| Module | Chịu trách nhiệm | Không được làm |
|---|---|---|
| auth/users | account, Google, OTP, password, sessions, profile, addresses | Tự ý expose user data của người khác |
| catalog | category/product/variant/search/filter/sort, prices, images | Đặt hàng/tính coupon |
| reviews | comments, rating, aggregate, Socket.IO event | Cho guest rate |
| cart | guest/customer cart, quantity, totals preview | Quyết định giá order cuối cùng |
| checkout | quote, coupon/points validation, payment adapter, atomic order workflow | Tạo paid order trước payment success |
| orders | order read, status history, email outbox | Cho user thấy đơn khác |
| loyalty | ledger append-only, award/redeem | Lưu balance dễ sửa từ client |
| admin | **chỉ** 6 nhóm ở `2.6 | Module lạ |
| worker | gửi email từ outbox có retry/idempotency | Sửa order ngoài hợp đồng |

## 4. Định nghĩa dữ liệu và quy ước dùng chung

### 4.1 Quy ước API

- Base: `/api/v1`; body/response JSON `application/json` (trừ OAuth redirects, DELETE 204).
- ID công khai: UUID string; tên field camelCase; thời gian ISO-8601 UTC, frontend hiển thị `Asia/Ho_Chi_Minh`.
- Tiền: **số nguyên VND**, không dùng float, field có hậu tố `Vnd`; ví dụ `14990000`; UI tự format.
- `true/false` là boolean; không trả passwordHash, otp, refresh token, costPrice cho customer.
- Mọi list đều có `meta: { page, pageSize, totalItems, totalPages }`; `totalPages = max(1, ceil(totalItems/pageSize))` để vẫn hiện **trang 1** khi ít/không dữ liệu.
- Query `page` bắt đầu 1; mặc định product 12/page, admin orders **20/page**; upper bound 100. Invalid query = 400.
- Cookie `access_token` httpOnly + `refresh_token` rotating; cookie giỏ guest `guest_cart` opaque. Mutation dùng `X-CSRF-Token`, kiểm tra Origin/SameSite; frontend gọi cùng origin. Google OAuth callback dùng redirect.
- Quyền: `public`, `guest-or-user` (cả hai), `customer`, `admin`. User bị ban không được auth/checkout hay rate; guest không được mạo danh.
- Error chung:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Số lượng tồn kho không đủ",
    "details": [{ "field": "items[0].quantity", "reason": "Only 2 available" }],
    "requestId": "req_01"
  }
}
```

Mã HTTP: 200 GET/PATCH, 201 create, 202 email queued, 204 delete/logout, 302 OAuth, 400 invalid, 401 not authenticated, 403 forbidden/banned, 404 not found/other user's order, 409 duplicate/conflict/stock, 422 coupon invalid/validation, 429 rate limit, 502 email gateway không chặn order, 500 unexpected. **Không lộ stack trace.**

### 4.2 Các DTO chuẩn để API tham chiếu

```json
{
  "Address": {
    "id": "uuid",
    "recipientName": "Nguyen Van A",
    "phone": "0900000000",
    "line1": "12 Nguyen Hue",
    "ward": "Ben Nghe",
    "district": "Quan 1",
    "city": "Ho Chi Minh",
    "country": "VN",
    "isDefault": true
  },
  "UserSelf": {
    "id": "uuid", "email": "a@example.com", "fullName": "Nguyen Van A",
    "role": "CUSTOMER", "emailVerified": true, "hasPassword": false,
    "isBanned": false, "pointsBalance": 100,
    "defaultAddress": "Address|null", "createdAt": "ISO8601"
  },
  "VariantPublic": {
    "id": "uuid", "sku": "GPU-RTX-16GB",
    "attributes": {"color": "Black", "memory": "16GB"},
    "priceVnd": 15990000, "stock": 8, "isAvailable": true
  },
  "ProductCard": {
    "id": "uuid", "slug": "gpu-example",
    "name": "Graphics Card Example", "brand": "Example Brand",
    "category": {"id": "uuid", "name": "GPU", "slug": "gpu"},
    "minPriceVnd": 14990000, "thumbnailUrl": "/media/gpu-1.webp",
    "shortDescription": "Mô tả ngắn", "averageRating": 4.6,
    "ratingCount": 22, "tags": ["gaming"], "createdAt": "ISO8601"
  },
  "ProductDetail": {
    "...ProductCard": "...",
    "descriptionLines": ["Dòng 1", "Dòng 2", "Dòng 3", "Dòng 4", "Dòng 5"],
    "images": ["/media/1.webp", "/media/2.webp", "/media/3.webp"],
    "variants": ["VariantPublic", "VariantPublic"],
    "reviewSummary": {"averageRating": 4.6, "ratingCount": 22, "commentCount": 18}
  },
  "Cart": {
    "id": "uuid",
    "items": [{
      "id": "uuid", "productId": "uuid", "variantId": "uuid",
      "name": "GPU Example", "sku": "GPU-RTX-16GB",
      "imageUrl": "/media/1.webp", "unitPriceVnd": 15990000,
      "quantity": 2, "lineTotalVnd": 31980000,
      "availableStock": 8
    }],
    "itemCount": 2, "subtotalVnd": 31980000
  }
}
```

Ký hiệu `...ProductCard` ở trên chỉ biểu thị kế thừa field để giải thích; response JSON thực tế phải **phẳng, hợp lệ**, không chứa field giả này. Danh sách DTO dạng `["VariantPublic"]` có nghĩa là mảng object thuộc DTO đó.

### 4.3 DTO cho Checkout / Order / Dashboard

```json
{
  "CheckoutQuote": {
    "cart": "Cart",
    "subtotalVnd": 1000000,
    "taxVnd": 0,
    "shippingFeeVnd": 30000,
    "coupon": {
      "code": "AB12C", "valid": true, "message": "Áp dụng thành công",
      "discountVnd": 100000, "remainingUses": 3
    },
    "couponDiscountVnd": 100000,
    "availablePoints": 100, "pointsToRedeem": 100,
    "pointsDiscountVnd": 100000, "totalPayableVnd": 830000,
    "estimatedEarnedPoints": 83
  },
  "Order": {
    "id": "uuid", "orderNumber": "ORD-20261108-000123",
    "userId": "uuid", "buyerName": "Nguyen Van A", "buyerEmail": "a@example.com",
    "shippingAddress": "AddressSnapshot",
    "items": [{
      "productId": "uuid", "variantId": "uuid", "name": "GPU Example",
      "sku": "GPU-RTX-16GB", "attributes": {"memory": "16GB"},
      "quantity": 1, "unitPriceVnd": 1000000, "lineTotalVnd": 1000000
    }],
    "subtotalVnd": 1000000, "taxVnd": 0, "shippingFeeVnd": 30000,
    "couponCode": "AB12C", "couponDiscountVnd": 100000,
    "pointsRedeemed": 100, "pointsDiscountVnd": 100000,
    "totalPaidVnd": 830000, "pointsEarned": 83,
    "paymentMethod": "DEMO", "paymentStatus": "PAID",
    "status": "pending", "createdAt": "ISO8601",
    "statusHistory": [
      {"status": "pending", "changedAt": "ISO8601", "changedBy": "system"}
    ]
  },
  "DashboardTotals": {
    "totalUsers": 120, "newUsers": 12, "totalOrders": 80,
    "revenueVnd": 80000000, "grossProfitVnd": 18000000
  }
}
```

**Giải thích:** `AddressSnapshot` là bản copy địa chỉ tại thời điểm mua; không thay đổi khi user sửa address. `taxVnd` được đặt 0 trong bản demo nếu không có quy tắc thuế pháp lý được cấu hình; vẫn phải **hiển thị dòng thuế**. `shippingFeeVnd` đề xuất cấu hình cố định 30.000đ tại server để demo; không giả vờ đây là phí thực tế do hãng vận chuyển trả. Những trị số mẫu trong JSON không phải yêu cầu giá/coupon bắt buộc từ PDF.

---

## 5. API CONTRACT ĐẦY ĐỦ (REQUEST / RESPONSE / STATUS / QUYỀN)

**Điều kiện:** Codex phải triển khai nhất quán mọi endpoint bên dưới. Các nội dung JSON dùng tên DTO đã mô tả tại `4; “—” có nghĩa không có body. Không tự tạo API admin khác ngoài nhóm đã liệt kê. Query params là một phần của request, response có envelope `{data: ...}` hoặc `{data: [...], meta: ...}`. `201` body dùng cùng DTO, với field bổ sung nếu ghi rõ.

### 5.1 Authentication (public/customer)

| Method + path | Quyền | Request (body/query/header) | Success response | Lỗi chính |
|---|---|---|---|---|
| `GET /auth/csrf` | public | — | `200 {data:{csrfToken:string}}` + cookie CSRF | 500 |
| `POST /auth/register` | public | `{email:string,fullName:string,shippingAddress:RegistrationAddressInput}` (**chỉ 3 field cấp cao**) | `201 {data:{user:UserSelf,verificationRequired:true}}`; OTP gửi email | 409 email existed, 400 |
| `POST /auth/login/request-code` | public | `{email:string}` | `202 {data:{message:"If eligible, code sent"}}`; OTP hết hạn trong 10 phút | 429 |
| `POST /auth/login/verify-code` | public | `{email:string,code:string(6 digits)}` | `200 {data:{user:UserSelf}}`; set auth cookies | 401 code invalid/expired, 429 |
| `POST /auth/login/password` | public | `{email:string,password:string}` | `200 {data:{user:UserSelf}}` + cookies | 401/403 |
| `GET /auth/google/start` | public | Browser navigation; `returnTo` chỉ allowlist nội bộ | `302` tới Google OIDC, state/PKCE | 400/500 |
| `GET /auth/google/callback` | public | Google `code`, `state` query | `302` về trang nội bộ sau set cookies, hoặc profile-address-completion nếu thiếu địa chỉ | 401/400 |
| `POST /auth/refresh` | public with refresh cookie | CSRF header, body — | `200 {data:{user:UserSelf}}` + rotated cookies | 401 |
| `POST /auth/logout` | logged in | CSRF header; — | `204`, revoke refresh, clear cookies | 401 |
| `POST /auth/password/change` | customer | `{currentPassword?:string,newPassword:string}`; currentPassword bắt buộc nếu hasPassword=true; nếu false cần phiên email-verified gần đây | `204`; passwordHash thay đổi, revoke other sessions | 400/401/403 |
| `POST /auth/password/recover/request` | public | `{email:string}` | `202 {data:{message:"If account exists, instructions sent"}}` | 429 |
| `POST /auth/password/recover/confirm` | public | `{token:string,newPassword:string}` | `204`; token 1 lần, hết hạn, revoke sessions | 400/401 |

**Chi tiết:**

- `RegistrationAddressInput={line1,ward,district,city,country:"VN"}`. Form đăng ký chỉ thu **email, họ tên và địa chỉ giao hàng** (địa chỉ có các thành phần cần thiết); backend tự đặt `recipientName=fullName` và `phone=null`. **Không hỏi thêm điện thoại, tên người nhận riêng hoặc mật khẩu trong registration.** Khi checkout có thể yêu cầu số điện thoại giao hàng như một phần thông tin vận chuyển.
- `/auth/register` với email đã tồn tại **không** tạo trùng user; UI hướng dẫn login. Guest checkout có luồng tạo account riêng qua order, **không** gọi register có yêu cầu login.
- Google OAuth không được liên kết tài khoản bằng email chưa được Google xác minh. Nếu Google account mới, tạo customer với address trống, sau login yêu cầu bổ sung shipping address trước khi đặt hàng; **không có role tùy ý**.
- Email OTP giải quyết mật khẩu chưa tồn tại. Password login chỉ hoạt động sau khi password đã được set.

### 5.2 Profile, addresses, loyalty, order history

| Method + path | Quyền | Request | Success response | Lỗi |
|---|---|---|---|---|
| `GET /me` | customer | — | `200 {data:UserSelf}` | 401/403 |
| `PATCH /me` | customer | `{fullName?:string}`; không cho tự sửa role/emailVerified/points | `200 {data:UserSelf}` | 400 |
| `GET /me/addresses` | customer | — | `200 {data:Address[]}`, default trước | 401 |
| `POST /me/addresses` | customer | `AddressInput + {isDefault?:boolean}` | `201 {data:Address}` | 400 |
| `PATCH /me/addresses/:addressId` | customer | subset `AddressInput + {isDefault?:boolean}` | `200 {data:Address}` | 404 |
| `DELETE /me/addresses/:addressId` | customer | — | `204`; nếu xóa default tự chỉ định một địa chỉ còn lại | 404 |
| `GET /me/loyalty` | customer | `?page=1&pageSize=20` (ledger) | `200 {data:{balancePoints:number,pointValueVnd:1000,entries:LoyaltyEntry[]},meta:PageMeta}` | 401 |
| `GET /me/orders` | customer | `?page=1&pageSize=10&status?` | `200 {data:OrderSummary[],meta:PageMeta}`; newest first | 401 |
| `GET /me/orders/:orderId` | customer | — | `200 {data:Order}` + statusHistory newest-first | 404 (including not owner) |

`AddressInput = {recipientName:string,phone?:string,line1:string,ward:string,district:string,city:string,country:"VN"}`. Không dùng trường tỉnh/quận giả định từ bên thứ ba; nhập tay được. `OrderSummary = {id,orderNumber,createdAt,totalPaidVnd,status,items:[{name,sku,quantity,thumbnailUrl}]}`. `LoyaltyEntry={id,orderId,type:"EARN"|"REDEEM",pointsDelta:signedInteger,createdAt}`.

### 5.3 Homepage, catalog, product detail, comments, ratings

| Method + path | Quyền | Request | Success response | Lỗi |
|---|---|---|---|---|
| `GET /home` | public | — | `200 {data:{sections:[{key:"new"|"best_sellers"|"category:<slug>",title,products:ProductCard[],meta:PageMeta}],categories:Category[]}}`; ít nhất 5 section | 500 |
| `GET /home/sections/:sectionKey/products` | public | `sectionKey=new\|best_sellers\|category:<slug>`; `?page=1&pageSize=8` | `200 {data:ProductCard[],meta:PageMeta}`; pagination ngay trong từng homepage section, không đổi route | 400/404 |
| `GET /categories` | public | — | `200 {data:Category[]}`; chỉ category computer/component | 500 |
| `GET /brands` | public | — | `200 {data:[{name:string,productCount:number}]}` | 500 |
| `GET /products` | public | Query `q?,category?,brand?,minPrice?,maxPrice?,ratingMin?,tag?,collection?,sort?,page?,pageSize?` | `200 {data:ProductCard[],meta:PageMeta,filters:{selected...}}` | 400 |
| `GET /products/:slug` | public | — | `200 {data:ProductDetail}` | 404 |
| `GET /products/:slug/comments` | public | `?page=1&pageSize=10` | `200 {data:Comment[],meta:PageMeta}` newest-first | 404 |
| `POST /products/:slug/comments` | guest-or-user | `{body:string,guestName?:string}`; guestName bắt buộc cho guest | `201 {data:Comment}`; emit `comment.created` | 400/404/429 |
| `PUT /products/:slug/rating` | customer | `{stars:1|2|3|4|5}` | `200 {data:{myRating:Rating,summary:ReviewSummary}}`; create/update own rating; emit `rating.updated` | 401/404 |

`Category={id,name,slug,productCount}`; `Comment={id,productId,authorName,body,createdAt}`; `Rating={id,productId,userId,stars,updatedAt}`; `ReviewSummary={averageRating,ratingCount,commentCount}`.

**Product query contract:**

- `q` không phân biệt hoa/thường, tìm trên tên, brand, mô tả, tag; relevance sort nếu có `q` và không truyền `sort`.
- `category` dùng category slug; `brand` dùng exact canonical brand name; `minPrice/maxPrice` là integer VND, inclusive; `ratingMin` từ 1–5; `tag` optional.
- `collection=new`: newest products; `collection=best_sellers`: tổng quantity bán giảm dần; nếu category section thì `category=slug`. Mọi section `/home` có “Xem tất cả” về `/products` **và pagination số ngay trong section** dùng `GET /home/sections/:sectionKey/products?page=N`. Không thay việc lật trang tại homepage bằng cách chỉ chuyển ra catalog.
- `sort` enum: **`name_asc, name_desc, price_asc, price_desc`** (bắt buộc); thêm `newest, best_selling, relevance`. Price sort dựa `minPriceVnd`, tie-break `id` để phân trang ổn định.
- Product inactive/soft-deleted không hiển thị public; variant hết hàng vẫn hiện nhưng disable nút mua.

### 5.4 Giỏ hàng và checkout

| Method + path | Quyền | Request | Success response | Lỗi |
|---|---|---|---|---|
| `GET /cart` | guest-or-user | cookie guest cart hoặc access cookie | `200 {data:Cart}`; tự tạo cart rỗng nếu cần | 500 |
| `POST /cart/items` | guest-or-user | `{variantId:UUID,quantity:integer>=1}` | `200 {data:Cart}`; cộng số lượng nếu item trùng | 404/409 stock |
| `PATCH /cart/items/:itemId` | guest-or-user | `{quantity:integer>=1}` | `200 {data:Cart}` | 404/409 |
| `DELETE /cart/items/:itemId` | guest-or-user | — | `200 {data:Cart}` đã cập nhật | 404 |
| `POST /checkout/quote` | guest-or-user | `{shippingAddress?:AddressInput,addressId?:UUID,couponCode?:string,pointsToRedeem?:integer}`; lấy items từ server cart | `200 {data:CheckoutQuote}`; mã coupon không hợp lệ trả `coupon.valid=false`, discount=0 | 400 input sai kiểu, 422 points không hợp lệ |
| `POST /checkout/orders` | guest-or-user | header `Idempotency-Key: UUID`; body `CheckoutOrderRequest` (xem dưới) | `201 {data:{order:Order,receiptToken:string}}` sau payment success; với request lặp cùng key trả **cùng order** | 400/409/422/payment failed |
| `GET /checkout/receipts/:receiptToken` | guest-or-user | Token đủ entropy, hết hạn 24h, đọc 1 order | `200 {data:Order}`; cung cấp trang success sau redirect/reload | 401/404 |

**CheckoutOrderRequest:**

```json
{
  "buyer": {"fullName": "Nguyen Van A", "email": "a@example.com"},
  "shippingAddress": {
    "recipientName": "Nguyen Van A", "phone": "0900000000",
    "line1": "12 Nguyen Hue", "ward": "Ben Nghe", "district": "Quan 1",
    "city": "Ho Chi Minh", "country": "VN"
  },
  "addressId": null,
  "couponCode": "AB12C",
  "pointsToRedeem": 100,
  "paymentMethod": "DEMO",
  "demoPaymentOutcome": "success"
}
```

- `shippingAddress` và `addressId` là **one-of**: chỉ truyền một; default address prefill bên UI, khách được thay đổi. `buyer` bắt buộc cho guest, người đã login có thể lấy từ profile và chỉnh người nhận.
- `paymentMethod` bản triển khai chấm điểm **DEMO**: payment adapter ở server giả lập success/failure có ghi trạng thái minh bạch (“Thanh toán mô phỏng”). PDF không yêu cầu cổng thanh toán cụ thể. Không nhập/thao tác với số thẻ thật. `demoPaymentOutcome` chỉ bật trong demo/test environment; production không cho client tự ép success, cần provider đã xác minh.
- **Quan trọng:** Server tính lại giá/stock/coupon/points tại thời điểm submit. Không tin số tiền ở browser. Tạo order sau success và trừ stock + used coupon + redeem/earn points trong transaction an toàn (`7).
- Coupon invalid trả quote với `coupon.valid=false` và lý do để **hiện được tác động**; submit với coupon invalid trả 422, không tạo order.
- Nếu chưa login: dùng email đã normalize để tìm/tạo customer, gắn order; tạo account không yêu cầu người dùng điền form đăng ký. Không tự login guest chỉ vì họ biết một địa chỉ email.
- Receipt token là bí mật như một bearer link; không lưu plain token (lưu hash), không cho đoán `orderNumber` để đọc order.

### 5.5 Admin — Dashboard

**Toàn bộ endpoint `/admin/*` yêu cầu role `ADMIN` và đúng seeded admin account.**

| Method + path | Request | Success response | Lưu ý |
|---|---|---|---|
| `GET /admin/dashboard/summary` | `?newUsersWindowDays=30` | `200 {data:{totals:DashboardTotals,bestSellers:[{productId,name,quantitySold,revenueVnd}],ordersByStatus:[{status,count}],revenueSeries:[{bucket,revenueVnd}]}}` | Chỉ high-level và chart đúng yêu cầu Simple Dashboard |
| `GET /admin/dashboard/analytics` | `?period=year&year=2026` hoặc `period=quarter&year=2026&quarter=2`, `period=month&year=2026&month=11`, `period=week&weekStart=2026-11-02`, `period=custom&from=2026-11-01&to=2026-11-08` | `200 {data:AnalyticsResponse}` | Mặc định **year hiện tại**; validate phạm vi; mọi metrics được nhóm/so sánh nhất quán |

`AnalyticsResponse`:

```json
{
  "period": "year",
  "range": {"from": "2026-01-01", "to": "2026-12-31"},
  "previousRange": {"from": "2025-01-01", "to": "2025-12-31"},
  "totals": {
    "ordersSold": 143, "revenueVnd": 300000000,
    "grossProfitVnd": 70000000,
    "unitsSold": 320, "distinctProductCount": 51,
    "distinctCategoryCount": 8
  },
  "previousTotals": {
    "ordersSold": 100, "revenueVnd": 230000000,
    "grossProfitVnd": 60000000, "unitsSold": 240,
    "distinctProductCount": 42, "distinctCategoryCount": 7
  },
  "series": [{
    "bucket": "2026-01", "ordersSold": 10,
    "revenueVnd": 20000000, "grossProfitVnd": 5000000,
    "unitsSold": 25, "distinctProductCount": 11
  }],
  "byCategory": [{
    "categoryId": "uuid", "categoryName": "GPU",
    "unitsSold": 40, "revenueVnd": 120000000,
    "grossProfitVnd": 24000000
  }]
}
```

- `period` định nghĩa khoảng được chọn; khi annual, chart có 12 bucket tháng; quarter → bucket tuần/tháng tùy UI; month → ngày; week → ngày; custom → ngày hoặc tuần tùy độ dài. **Luôn có đủ các bucket 0** để không vẽ chart méo.
- “number of orders sold” = paid orders; “number of products” cần hiển thị rõ **unitsSold** và **distinctProductCount** để không nhầm; “types of products” = category breakdown.
- Thêm query `groupBy=year|quarter|month|week|day`, độc lập với `period` chọn khoảng xem; response trả `groupBy`. Mặc định year→month, quarter→month, month/week→day; custom→day nếu ≤31 ngày, week nếu ≤180 ngày, month nếu dài hơn. Có lựa chọn groupBy rõ trên UI và custom range nhiều năm để demo so sánh năm. Bucket tuần bắt đầu thứ Hai, năm/quý theo lịch Việt Nam; bucket biên chỉ tính dữ liệu trong khoảng chọn. Điền đầy đủ bucket 0 và giữ các breakdown loại sản phẩm.
- Previous range: năm/quý/tháng/tuần dùng kỳ lịch ngay trước tương ứng; custom dùng khoảng liền trước có cùng số ngày. Trả from/to thực tế của cả hai khoảng; không giả định mọi tháng/năm có số ngày bằng nhau. Profit là **estimated gross profit** (`7.7`).

### 5.6 Admin — Product / category / inventory

| Method + path | Request | Success response | Lỗi |
|---|---|---|---|
| `GET /admin/products` | `?q?,category?,page=1&pageSize=20` | `200 {data:AdminProduct[],meta:PageMeta}` | 401/403 |
| `GET /admin/products/:productId` | — | `200 {data:AdminProduct}` | 404 |
| `POST /admin/products` | `ProductWrite` | `201 {data:AdminProduct}` | 400/409 |
| `PATCH /admin/products/:productId` | subset `ProductWrite`; variants include id to update, new without id | `200 {data:AdminProduct}` | 400/404/409 |
| `DELETE /admin/products/:productId` | — | `204`; soft-delete để giữ order snapshots | 404 |
| `GET /admin/categories` | `?page=1&pageSize=20` | `200 {data:AdminCategory[],meta:PageMeta}` | 403 |
| `POST /admin/categories` | `{name:string,slug:string}`; must be allowed computer taxonomy | `201 {data:AdminCategory}` | 400/409 |
| `PATCH /admin/categories/:categoryId` | `{name?,slug?}` within allowed taxonomy | `200 {data:AdminCategory}` | 400/404 |
| `DELETE /admin/categories/:categoryId` | — | `204` nếu không có active products; nếu còn dùng →409 | 404/409 |
| `PATCH /admin/variants/:variantId/inventory` | `{stock:integer>=0,costPriceVnd?:integer>=0}` | `200 {data:AdminVariant}` | 400/404 |

`ProductWrite` đầy đủ:

```json
{
  "name": "Example GPU RTX", "slug": "example-gpu-rtx",
  "brand": "Example Brand", "categoryId": "uuid",
  "shortDescription": "Dòng giới thiệu ngắn",
  "descriptionLines": [
    "Thông tin kỹ thuật dòng 1", "Thông tin kỹ thuật dòng 2",
    "Thông tin kỹ thuật dòng 3", "Thông tin kỹ thuật dòng 4",
    "Thông tin kỹ thuật dòng 5"
  ],
  "tags": ["gaming", "graphics"],
  "images": [
    {"url": "/media/gpu-front.webp", "sortOrder": 1},
    {"url": "/media/gpu-back.webp", "sortOrder": 2},
    {"url": "/media/gpu-port.webp", "sortOrder": 3}
  ],
  "variants": [
    {
      "sku": "EX-GPU-8", "attributes": {"memory": "8GB"},
      "priceVnd": 12000000, "costPriceVnd": 9500000, "stock": 12
    },
    {
      "sku": "EX-GPU-16", "attributes": {"memory": "16GB"},
      "priceVnd": 15000000, "costPriceVnd": 12000000, "stock": 8
    }
  ]
}
```

`AdminProduct = ProductDetail + {isActive,variants:[AdminVariant],createdAt,updatedAt}`; `AdminVariant = VariantPublic + {costPriceVnd}`. Cost không xuất hiện ở customer APIs. **Create product cần >=2 variants, >=3 images, >=5 descriptionLines**. Cập nhật không được làm product active vi phạm các giới hạn đó. Kết hợp thao tác cập nhật stock qua endpoint riêng; SKU unique.

Ảnh product dùng **đường dẫn asset có sẵn** hoặc upload qua ứng dụng frontend không cần CRUD admin media riêng. Nếu dùng upload, route kỹ thuật chỉ phục vụ trường image của form Product Management và không trở thành module quản trị khác. Dự án ưu tiên seed local images WebP với license hợp lệ để Compose chạy offline.

### 5.7 Admin — User management

| Method + path | Request | Success response | Lỗi |
|---|---|---|---|
| `GET /admin/users` | `?q?,isBanned?,page=1&pageSize=20` | `200 {data:AdminUserSummary[],meta:PageMeta}` | 403 |
| `GET /admin/users/:userId` | — | `200 {data:AdminUserDetail}` | 404 |
| `PATCH /admin/users/:userId` | `{fullName?:string,isBanned?:boolean}` | `200 {data:AdminUserDetail}` | 400/403/404 |

`AdminUserSummary = {id,email,fullName,role:"CUSTOMER",isBanned,createdAt,orderCount}`; `AdminUserDetail = AdminUserSummary + {addresses:Address[],totalSpentVnd}`. Admin **không** được đổi role thành ADMIN, không được tự ban chính mình, không được tạo thêm ADMIN. Ban user phải chặn login, gọi customer endpoints và future checkouts (không làm mất history đã có). Cập nhật fullName/isBanned là cách triển khai tối thiểu của “updating user information”; không ghi đè email chưa xác minh.

### 5.8 Admin — Order management

| Method + path | Request | Success response | Lỗi |
|---|---|---|---|
| `GET /admin/orders` | `?page=1&pageSize=20&timeRange=today|yesterday|this_week|this_month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&status?` | `200 {data:AdminOrderSummary[],meta:PageMeta}` | 400/403 |
| `GET /admin/orders/:orderId` | — | `200 {data:AdminOrderDetail}` | 404 |
| `PATCH /admin/orders/:orderId/status` | `{newStatus:"confirmed"|"shipping"|"delivered",expectedCurrentStatus:"pending"|"confirmed"|"shipping"}` | `200 {data:{order:AdminOrderDetail,statusHistory:OrderStatusHistory[]}}` | 400/409 |

`AdminOrderSummary = {id,orderNumber,buyerName,buyerEmail,createdAt,totalPaidVnd,status,couponCode,itemCount}`. `AdminOrderDetail = Order + {paymentReference,couponApplied:boolean,items:[OrderItem + {unitCostVnd}]}`. Order list **mới nhất trước, 20/page**, custom date range inclusive theo **giờ Việt Nam** rồi convert UTC để query; filter khác hoạt động. Status history mới nhất trên đầu. Không cho phép skip backward/skip trạng thái nếu chưa có yêu cầu; status mới phải là bước ngay sau bước hiện tại. Không tạo admin cancel/refund UI vì đề không yêu cầu.

### 5.9 Admin — Discount codes

| Method + path | Request | Success response | Lỗi |
|---|---|---|---|
| `GET /admin/coupons` | `?page=1&pageSize=20` | `200 {data:AdminCouponSummary[],meta:PageMeta}` | 403 |
| `GET /admin/coupons/:code` | — | `200 {data:AdminCouponDetail}` | 404 |
| `POST /admin/coupons` | `{code:string,discountAmountVnd:integer>0,usageLimit:integer[1..10]}` | `201 {data:AdminCouponDetail}` | 400/409 |

`AdminCouponSummary = {code,discountAmountVnd,usageLimit,usedCount,createdAt,remainingUses}`; `AdminCouponDetail = AdminCouponSummary + {orders:[{id,orderNumber,createdAt,buyerEmail,discountAppliedVnd}]}`. Code được normalize uppercase, regex **`^[A-Z0-9]{5}$`**, không có `expiresAt`, không có coupon edit/delete feature. Mỗi coupon có thể dùng tối đa số lần đã chọn, không vượt 10; nếu dùng hết, quote báo invalid. Nếu áp dụng cho order với subtotal thấp hơn discount, `discountAppliedVnd=min(discountAmountVnd,subtotalVnd)`.

### 5.10 Hợp đồng WebSocket (bên cạnh REST)

| Hướng | Event | Payload | Tác động |
|---|---|---|---|
| Browser → server | `product.join` | `{productId:UUID}` | Join room `product:<id>`, server xác minh product tồn tại |
| Browser → server | `product.leave` | `{productId:UUID}` | Leave room |
| Server → room | `comment.created` | `{productId,comment:Comment,commentCount}` | Append comment khi đang xem product; không reload |
| Server → room | `rating.updated` | `{productId,summary:ReviewSummary}` | Cập nhật average stars/count không reload |

REST **vẫn là nguồn ghi dữ liệu**; Socket.IO chỉ publish event sau DB commit. Khi client reconnect, GET lại comments/product summary để không bỏ lỡ update. Khi có 2 API replicas, Socket.IO dùng Redis adapter. Không tạo server-side realtime cart nếu UI optimistic + revalidate đã đạt yêu cầu “không reload”.

### 5.11 Endpoint kỹ thuật (không phải Admin feature)

| Method + path | Quyền | Request | Response |
|---|---|---|---|
| `GET /health` | internal/ops | — | `200 {data:{status:"ok",instanceId:string,db:"up",redis:"up"}}`; `503` nếu service critical down. Route tương đối với base `/api/v1`. |

---

## 6. Database schema và ràng buộc dữ liệu

**DBMS:** PostgreSQL. **Migration:** Knex; tất cả bảng có `id UUID` nếu không nêu khóa riêng, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` khi phù hợp. Không đưa credentials/mật khẩu vào source control.

### 6.1 Bảng và field chủ đạo

| Table | Trường chính | Ràng buộc / index |
|---|---|---|
| `users` | `id,email,full_name,role,password_hash,email_verified,is_banned,points_balance,created_at` | UNIQUE `lower(email)`; role chỉ CUSTOMER/ADMIN; đúng một admin do seed; points_balance integer >=0 |
| `auth_identities` | `user_id,provider,provider_subject` | UNIQUE(provider,provider_subject); Google subject, email verified trước link |
| `login_otps` | `user_id/email,code_hash,expires_at,consumed_at,attempts` | TTL 10 phút, giới hạn lần thử; không lưu code plaintext |
| `password_reset_tokens` | `user_id,token_hash,expires_at,used_at` | Single use, hashed |
| `refresh_sessions` | `user_id,token_hash,expires_at,revoked_at` | Rotate on refresh |
| `addresses` | `id,user_id,recipient_name,phone,line1,ward,district,city,country,is_default` | FK user; mỗi user tối đa một default (partial unique index) |
| `categories` | `id,name,slug,is_active` | UNIQUE slug; chỉ computer/component taxonomy |
| `products` | `id,category_id,name,slug,brand,short_description,description_lines JSONB,tags JSONB,is_active` | UNIQUE slug; 5 lines active |
| `product_images` | `id,product_id,url,sort_order` | FK; >=3 ảnh trên active product |
| `product_variants` | `id,product_id,sku,attributes JSONB,price_vnd,cost_price_vnd,stock,is_active` | UNIQUE SKU; qty/price/cost >=0; >=2 variants mỗi active product |
| `comments` | `id,product_id,user_id NULL,guest_name NULL,body,created_at` | user nullable để guest bình luận |
| `ratings` | `id,product_id,user_id,stars` | UNIQUE(product_id,user_id); stars 1–5; không cần purchased |
| `carts` | `id,user_id NULL,guest_token_hash NULL` | Một active cart mỗi user hoặc guest; guest cookie opaque |
| `cart_items` | `id,cart_id,variant_id,quantity` | UNIQUE(cart_id,variant_id), quantity>=1 |
| `coupons` | `code,discount_amount_vnd,usage_limit,used_count,created_at` | PK code regex 5 alphanumeric; 1≤usage_limit≤10; 0≤used_count≤usage_limit; **không expires_at** |
| `orders` | `id,order_number,user_id,buyer_name,buyer_email,shipping_snapshot JSONB,subtotal_vnd,tax_vnd,shipping_fee_vnd,coupon_code NULL,coupon_discount_vnd,points_redeemed,points_discount_vnd,total_paid_vnd,points_earned,payment_method,payment_status,status,paid_at,created_at` | UNIQUE order_number; FK user; money >=0; paid order only |
| `order_items` | `id,order_id,product_id NULL,variant_id NULL,name_snapshot,sku_snapshot,attributes_snapshot JSONB,unit_price_vnd,unit_cost_vnd,quantity,line_total_vnd,category_name_snapshot` | Snapshot **không đổi** khi admin update/delete product; qty>=1 |
| `order_status_history` | `id,order_id,status,changed_by,changed_at` | Composite index (order_id, changed_at DESC); append-only |
| `coupon_redemptions` | `id,coupon_code,order_id,discount_applied_vnd` | UNIQUE(order_id), FK coupon/order; admin list referenced orders |
| `loyalty_ledger` | `id,user_id,order_id,type,points_delta,created_at` | EARN positive / REDEEM negative; UNIQUE(order_id,type); append-only |
| `payment_attempts` | `id,checkout_key,user_id NULL,provider,status,provider_reference,amount_vnd,created_at` | UNIQUE checkout_key, payment result audit |
| `checkout_idempotency` | `key,cart_id,request_hash,order_id,result_status` | UNIQUE key; detect same key different payload=409 |
| `receipt_tokens` | `id,order_id,token_hash,expires_at` | Unique hash; 24 giờ; read only order |
| `email_outbox` | `id,type,payload JSONB,order_id,status,attempts,next_attempt_at,sent_at` | UNIQUE(type,order_id) for confirmation; retries idempotent |

### 6.2 Quan hệ logic

```text
User 1──N Address
User 1──N Order 1──N OrderItem ──► ProductVariant (historical nullable FK)
User 1──N LoyaltyLedger ──────────► Order
ProductCategory 1──N Product 1──N ProductVariant
Product 1──N ProductImage
Product 1──N Comment ; Product 1──N Rating ──► User
Cart 1──N CartItem ──► ProductVariant
Coupon 1──N CouponRedemption ──► Order
Order 1──N OrderStatusHistory
Order 1──1 EmailOutbox (confirmation)
```

**Index đáng có:**

- `products(category_id,is_active,created_at DESC)`; `products(slug)`; `product_variants(product_id,stock)`; full text index cho tên/brand/description (PostgreSQL `tsvector/GIN` hoặc `ILIKE` khi seed nhỏ).
- `orders(user_id,created_at DESC)`, `orders(created_at DESC)`, `orders(status,created_at DESC)`, `orders(paid_at)`.
- `comments(product_id,created_at DESC)`, `ratings(product_id)`, `coupons(code)`.

**Không dùng ON DELETE CASCADE để xóa orders/history khi xóa product hoặc user**. Sản phẩm chỉ soft delete. Dữ liệu thống kê và email lịch sử dựa trên snapshots. Các amount nên dùng `BIGINT`/safe integer trên Node (nếu vượt Number.MAX_SAFE_INTEGER chuyển string/BigInt serialization rõ), seed VND trong range an toàn.

### 6.3 Seed data PHẢI ĐỦ để chấm

- **1 admin duy nhất**, tài khoản/password demo đọc được qua `README.txt` (không hardcode mật khẩu production).
- Ít nhất **3 customer**: (1) có password và nhiều addresses, (2) tạo qua guest checkout và sau login thấy lịch sử, (3) social login test nếu có credential.
- **Ít nhất 60 products** thuộc **ít nhất 6 danh mục hợp lệ**, tạo 10+ sản phẩm/category; đảm bảo trang Home, catalog, category và search có thể có >1 trang.
- **Mỗi product ít nhất 2 variants** độc lập stock, >=3 ảnh thật dùng được, 5 description lines, brand, tags. Có cả variant còn hàng và hết hàng.
- Ít nhất **30 orders** trải rộng nhiều ngày/tuần/tháng/quý (có một số năm trước để advanced chart không trống), status history đầy đủ; order items có cost snapshots.
- Ít nhất **6 coupons hợp lệ trong DB**: usable, used up, giảm lớn hơn subtotal, usageLimit 1 và 10; tất cả code đúng 5 alnum. Mã không tồn tại `ZZ999` và input sai định dạng chỉ là dữ liệu nhập thử, không seed bản ghi vi phạm constraint.
- Comments guest + customer; ratings từ customer; các product có averageRating khác nhau.
- Loyalty balances/ledger hợp lệ, có user 100 points để demo “đổi 100 points = 100.000đ”.
- Seed **deterministic và idempotent**: không duplicate khi chạy lại. Dùng asset local hợp lệ, không hotlink ảnh bấp bênh.

---

## 7. Business rules, công thức tiền và transactional consistency

### 7.1 Product / stock / cart

1. Mỗi cart item đại diện **variantId** (không phải productId chung chung); cộng trùng variant, đổi variant thành line khác.
2. Cart chỉ là ý định mua, **không giữ trước stock**; chặn vượt stock ở add/update và **kiểm tra lại** khi checkout. “Out of stock” disabled.
3. ProductCard `minPriceVnd` = min price của **active variants**; giá theo biến thể được cập nhật tức thời khi click variant ở detail.
4. Stock trừ theo variant, không trừ tổng product; order lưu ảnh/tên/sku/price/cost snapshots.
5. Nếu customer login trong khi guest cart có items, **merge** theo variant và kẹp quantity ở tồn thực, sau đó xóa liên kết guest cookie; không làm mất sản phẩm không trùng.

### 7.2 Tax/shipping/pricing trong bản demo [ĐỀ XUẤT]

- `subtotalVnd = Σ(quantity × unitPriceVnd)`.
- `couponDiscountVnd = min(subtotalVnd, coupon.discountAmountVnd)` nếu valid, ngược lại 0.
- `shippingFeeVnd = 30_000` cho giỏ có hàng; 0 nếu giỏ rỗng (không cho checkout giỏ rỗng).
- `taxVnd = 0` trong môi trường demo nếu chưa cấu hình thuế theo quy định; vẫn hiển thị một dòng “Thuế: 0đ” minh bạch.
- `redeemableBaseVnd = max(0, subtotalVnd - couponDiscountVnd + shippingFeeVnd + taxVnd)`.
- `maxRedeemablePoints = min(balancePoints, floor(redeemableBaseVnd / 1_000))`; `pointsToRedeem` phải là số nguyên từ 0 đến max, nếu vượt trả 422. Guest chỉ được dùng 0 điểm.
- `pointsDiscountVnd = pointsToRedeem × 1_000`, không cắt giá trị một điểm. Ví dụ tổng trước điểm 30.500đ và balance 100 thì dùng tối đa 30 điểm, còn trả 500đ. Đây là giới hạn theo giá trị đơn, không thêm ngưỡng đổi điểm.
- `totalPaidVnd = subtotalVnd + shippingFeeVnd + taxVnd - couponDiscountVnd - pointsDiscountVnd`. Không âm.
- Tất cả phép tính chạy server-side, response quote là nguồn chân lý UI. Chỉ dùng số nguyên; không làm tròn tiền ngầm.
- Checkout phải hiển thị được **giá trước/sau mã, shipping/tax, số điểm dùng, tổng cuối** trước nút đặt hàng.

### 7.3 Coupon

- Regex mã `^[A-Z0-9]{5}$` sau uppercase, giới hạn 1…10 và không expiry. Không giảm quá subtotal.
- Quote chỉ **đọc** trạng thái coupon, không tăng usedCount.
- Khi order thành công trong transaction: lock coupon hoặc atomic `UPDATE coupons SET used_count=used_count+1 WHERE code=? AND used_count<usage_limit RETURNING ...`. Không đếm thất bại.
- Trong 2 checkout song song với 1 lượt còn lại: đúng **1 order** được áp coupon thành công; còn lại báo coupon exhausted và không tạo order sai giá.
- Một order áp tối đa một mã. Admin coupon detail hiển thị redemption đến từng order.

### 7.4 Payment & order lifecycle

- PDF không bắt buộc gateway. **PaymentAdapter** có hợp đồng `pay({amountVnd,currency:"VND",idempotencyKey}) → {status:"SUCCEEDED"|"FAILED",reference}`; bản hoàn thiện chạy local dùng **DemoPaymentAdapter** rõ nhãn.
- Với Demo adapter, toàn bộ ghi stock/order/loyalty/coupon thực hiện trong một DB transaction và “payment success” được đánh dấu chỉ khi server chấp nhận giao dịch; simulate fail là test path, **không tạo order**.
- Với cổng thật (nếu chọn bổ sung về sau): xác minh webhook/chữ ký, reserve stock hợp lệ, idempotent capture, xử lý rollback/refund nếu DB transaction lỗi. **Không** dùng `demoPaymentOutcome` để cho khách tự tuyên bố đã trả tiền trên production.
- Sau thành công: atomic (a) tạo/lookup customer email; (b) kiểm stock/giảm stock; (c) dùng coupon; (d) redeem điểm trước; (e) tạo order + order items + status `pending`; (f) earn điểm mới; (g) clear cart; (h) email outbox; (i) persist idempotency; commit.
- Sau commit: redirect `/checkout/success` với token; worker gửi email; Socket.IO event nếu cần. Không gửi email bên trong transaction.
- Payment fail / invalid coupon / insufficient stock: không có paid order, không mất điểm, không mất coupon use, không trừ inventory.

### 7.5 Status transitions

```text
pending ──admin──► confirmed ──admin──► shipping ──admin──► delivered
```

- Order sinh ra với trạng thái `pending` sau thanh toán thành công.
- Thay trạng thái chỉ qua Admin, ghi `order_status_history` sau khi update trong cùng transaction; `changed_at` lấy giờ server; UI hiển thị newest-first.
- State transition lặp từ request retry phải idempotent (không thêm row lịch sử giống nhau); thay đổi từ stale `expectedCurrentStatus` trả 409.
- Không thêm flow hủy/hoàn tiền nếu chưa được người dùng và giáo viên xác nhận.

### 7.6 Loyalty — QUY TẮC ĐẶC BIỆT CẦN ĐÚNG

**PDF viết:** mỗi purchase earn “10% of total order amount as points”; ví dụ **1.000.000 VND → 100 points → 100.000 VND**.

Để vừa khớp 10% giá trị, vừa đúng số điểm của ví dụ:

- **1 point trị giá 1.000 VND**.
- `pointsEarned = floor(totalPaidVnd × 0.10 / 1_000) = floor(totalPaidVnd / 10_000)`. Ví dụ 1.000.000 → 100 points (worth 100.000đ).
- **[THIẾT KẾ ĐỀ XUẤT]** Base earn = số VND **thực trả** sau coupon/points, đã gồm shipping/tax nếu có, vì PDF không định nghĩa chính xác “total” trước/sau discount. Công thức phải được công bố rõ trong UI/README và nhất quán API/tests.
- `pointsDiscountVnd = pointsRedeemed × 1_000`; chỉ point balance đã có **trước** order mới được redeem; kiếm ở order N chỉ dùng từ order N+1.
- Không đặt min redemption, ngưỡng đơn, hạn dùng hay hạn mức redeem ngoài ràng buộc tự nhiên “không vượt balance và giá trị order”. 0-point không giảm.
- `users.points_balance` là cache transactional từ `loyalty_ledger`; mọi delta có ledger entry gắn order (EARN/REDEEM) để audit. Không thay balance chỉ bằng API frontend.
- **Guest:** vẫn tích điểm vào auto-created customer; muốn redeem ở lần sau phải chứng minh quyền sở hữu email qua login. Không cho unauthenticated guest sử dụng điểm của một email bất kỳ.
- Khi finalTotal=0 vì points cover hết: payment adapter xử lý zero-amount success nội bộ, không tạo yêu cầu thu tiền âm; điểm kiếm mới = 0.

### 7.7 Dashboard revenue/profit [THIẾT KẾ ĐỀ XUẤT]

- Only **PAID** orders tính doanh thu; bản đề không có refunds nên không trừ refund giả định.
- `pointsOnMerchandiseVnd = min(pointsDiscountVnd, subtotalVnd - couponDiscountVnd)`; phần point dùng để chi trả shipping/tax (nếu có) không được tạo doanh thu hàng hóa âm.
- `revenueVnd = Σ(max(0, subtotalVnd - couponDiscountVnd - pointsOnMerchandiseVnd))`; đây là **doanh thu hàng hóa ròng sau coupon và điểm**, không bao gồm shipping/tax.
- `COGSVnd = Σ(orderItem.unitCostVnd × quantity)` từ snapshot cost tại lúc mua.
- `grossProfitVnd = revenueVnd - COGSVnd`; label **“Lợi nhuận gộp ước tính”** vì chưa trừ vận hành/marketing/phí giao hàng thật; có thể âm khi discount lớn.
- Khi breakdown theo category/product, phân bổ `couponDiscountVnd + pointsOnMerchandiseVnd` theo tỷ lệ `lineTotalVnd/subtotalVnd` từng order item; phần VND lẻ phân bổ theo thứ tự itemId ổn định để tổng sau phân bổ **khớp tuyệt đối** doanh thu toàn order. Sử dụng `category_name_snapshot` cho lịch sử.
- `ordersSold` đếm distinct paid order; `unitsSold` đếm tổng quantity; `distinctProductCount` distinct productId đã bán; `byCategory` dùng category snapshot.
- Khoảng ngày theo UI timezone Việt Nam; DB lưu UTC; filter date range inclusive ngày cuối (dùng half-open [start,end+1day)).

### 7.8 Security, validation, performance

- Hash password **Argon2id**; OAuth OIDC state + PKCE; login OTP/reset hashed, TTL, single-use, rate-limit, login error không lộ email tồn tại hay không.
- Auth session via signed short-lived token httpOnly; refresh rotation/revoke; RBAC middleware server-side; CSRF + Origin check; `helmet`, CORS same-origin, body-size limits.
- Validate request `Zod`/schema; output encode chống XSS trong comment/review; SQL parametrized via Knex; sanitize image URL; media chỉ từ allowed local paths/domains.
- Rate-limit login, OTP, guest comments/checkout; nếu ban user phải chặn phiên hiện có (kiểm tra `is_banned` trên protected requests hoặc ban-version).
- Orders/loyalty/coupons/stock dùng DB transaction + row locks/atomic conditional updates; concurrency tests bắt buộc. Không tạo race condition “last item oversold”.
- Pagination **server-side**, stable sort; product search có index; cache không được trả stock/price quá cũ ở checkout.
- Error boundary UI, retry GET hợp lý, không retry POST checkout trừ khi giữ nguyên Idempotency-Key.
- Logs với requestId và instanceId, không log password/tokens; health endpoints phục vụ vận hành kỹ thuật, không phải Admin feature.

---

## 8. UI/UX specification — màn hình, thành phần và tương tác

PDF **không** cung cấp ảnh mẫu hoặc một hệ màu bắt buộc. Các yêu cầu sau là **đề xuất thiết kế có chủ đích** để đạt UI/UX + responsive 0.5 + 0.5 điểm, không phải “giảng viên yêu cầu tone màu X”.

### 8.1 Art direction [THIẾT KẾ ĐỀ XUẤT]

- Thương hiệu **OBSIDIAN COMPUTE**: tối giản, hiện đại, đen chủ đạo. Background #09090B, surface #18181B, raised #27272A, text #FAFAFA, secondary text #A1A1AA, border #3F3F46. Primary CTA nền trắng chữ đen, hover xám sáng; focus rõ, status có cả chữ và màu. Admin dùng cùng design system. Tránh neon dày đặc, gradient trang trí và animation gây phân tán.
- Font: Inter hoặc system sans-serif có đủ ký tự tiếng Việt. Body 14–16px, heading có hierarchy rõ; line-height thoáng.
- Grid desktop tối đa 1200–1320px, gutter 24px; card radius 12–16px, shadow rất nhẹ, interactive hover/focus; icon nhất quán.
- Giá: ví dụ **15.990.000đ**, số nổi bật; **không** in raw `15990000`. Trạng thái order dùng badge có cả chữ lẫn màu, không chỉ màu.
- Ảnh sản phẩm tỉ lệ nhất quán (1:1 hoặc 4:3), `object-fit: contain`; lazy-loading ảnh ngoài viewport; ảnh thumb ≥3 ở detail.
- Empty/error/loading states phải có thông điệp và hành động retry/return; toast cho cart/validation; skeleton cho cards/tables.
- Không thiết kế thanh “đăng nhập để mua” chặn giỏ/checkout khách.

### 8.2 Route map frontend

| URL UI | Vai trò | Screen / component |
|---|---|---|
| `/` | public | Homepage |
| `/products` | public | Product Catalog, query filters/sort/paging |
| `/products/:slug` | public | Product Detail/Variants/Comments/Ratings |
| `/cart` | guest/customer | Cart |
| `/checkout` | guest/customer | Multi-step Checkout |
| `/checkout/success` | guest/customer with receipt token | Order Success |
| `/login` | public | Email password / email code / Google |
| `/register` | public | Exactly 3 registration fields |
| `/forgot-password` | public | Request password recovery |
| `/reset-password` | public with token | Set new password |
| `/account` | customer | Profile |
| `/account/addresses` | customer | Multiple Addresses |
| `/account/security` | customer | Change/Set Password |
| `/account/orders` | customer | Order History |
| `/account/orders/:id` | customer | Order Detail + Timeline |
| `/account/loyalty` | customer | Points balance/ledger |
| `/admin` | admin | Simple Dashboard |
| `/admin/analytics` | admin | Advanced Dashboard |
| `/admin/products` | admin | Product List |
| `/admin/products/new` | admin | Product Form |
| `/admin/products/:id/edit` | admin | Product Form / Variants / Stock |
| `/admin/categories` | admin | Category Management |
| `/admin/users` | admin | User List |
| `/admin/users/:id` | admin | User Detail/Update/Ban |
| `/admin/orders` | admin | Order List/Date Filters |
| `/admin/orders/:id` | admin | Order Detail/Status |
| `/admin/coupons` | admin | Coupon List |
| `/admin/coupons/new` | admin | Create Coupon |
| `/admin/coupons/:code` | admin | Coupon Detail/Used Orders |

Route `/admin` không xuất hiện trên navigation customer. Auth-guard khi chưa đăng nhập chuyển `/login?returnTo=...`; đã login sai role trả 403 UI. Guest checkout không có auth-guard. Chặn user banned server-side.

### 8.3 Header/Footer/Navigation

**Header desktop:**

1. Logo/tên shop bên trái → homepage.
2. Thanh search keyword dễ thấy (submit Enter → `/products?q=...`).
3. Link `Sản phẩm`, dropdown category (từ API).
4. Cart icon với badge tổng số lượng.
5. Account (Login/Register khi guest; Profile/Orders/Logout khi customer).

**Mobile:** logo + search icon/input + cart, menu drawer có category; không tràn chiều ngang. Footer: copyright, thông tin cửa hàng dạng tĩnh, vài link điều hướng công khai; **không** thêm CMS/Admin section quản lý footer.

### 8.4 Homepage (`/`)

Thứ tự đề xuất:

1. Hero tĩnh “Power, without the noise.” với CTA “Explore products” → catalog; wordmark OBSIDIAN COMPUTE.
2. Category shortcuts (chỉ máy tính/linh kiện).
3. **New Products**: card grid, số trang (page 1 luôn hiển thị).
4. **Best Sellers**: card grid, số trang.
5. **Laptop**, **Monitor**, **GPU**: ba section riêng, mỗi section card grid + số trang, “Xem tất cả”.

Card: image, name, brand, current starting price `Từ …đ` nếu có nhiều giá variant, star summary, short description clamp 2–3 lines, stock badge tùy variant; CTA “Xem chi tiết”. Có ít nhất 3 danh mục distinct thật, không chỉ labels trống.

### 8.5 Product Catalog (`/products`)

**Desktop:** filter sidebar 260px + main product grid 3–4 columns. **Mobile:** filter mở drawer/sheet, sort dropdown, 2 columns (1 ở <400px), pagination rõ ở cuối.

- Thanh breadcrumb; title + count.
- Search input đồng bộ URL `q`; khi thay đổi filter/sort reset page=1; Back/Forward browser giữ filter state.
- Filters: Category (single/multi tùy implementation, API hiện single), Brand, **Price from/to hai ô nhập số**, Rating ≥ n; tags có thể dưới dạng chips.
- Sort dropdown có tối thiểu 4 option exact: **Tên A–Z, Tên Z–A, Giá thấp→cao, Giá cao→thấp**; thêm “Mới nhất”, “Bán chạy”.
- Product list hiển thị image/name/price/short description; click card đến detail.
- Pagination dạng **« 1 2 3 … »**, ngay cả tổng chỉ 1 trang cũng có **“1”** (disabled/active), không ẩn toàn bộ.
- Search no results: “Không tìm thấy sản phẩm”, giữ filter visible, có nút xóa bộ lọc.

### 8.6 Product Detail (`/products/:slug`)

Desktop 2 cột:

- **Trái:** gallery với ảnh chính + **ít nhất 3 thumbnails**, click đổi ảnh, accessible alt.
- **Phải:** category breadcrumb, name, brand, rating average/count, giá variant đang chọn, **mô tả ít nhất 5 dòng**, selector biến thể (attributes rõ ví dụ RAM 16/32GB), **tồn kho từng variant**, quantity stepper (1…stock), Add to Cart.
- Khi đổi variant: giá, SKU, số tồn kho, trạng thái “Hết hàng” đổi **không reload**; giữ product same detail route.
- Dưới product: “Bình luận & đánh giá”: comment list + số trang; form guest nhập **tên + comment**, không cần login; form logged-in cần comment text, dùng profile name; stars selector chỉ có khi đã login. Guest thấy nút đăng nhập để **đánh giá sao** nhưng vẫn comment được.
- Socket.IO cập nhật comment mới và average rating ngay trong trang, có thông báo “Có bình luận mới” nếu người đang đọc page khác.

### 8.7 Cart (`/cart`)

- Item row: thumbnail, name/variant SKU, unit price, minus/input/plus quantity, line total, remove.
- Summary card: subtotal, **tax, shipping**, coupon chưa áp nếu chỉ áp lúc checkout, total preview.
- Quantity change qua mutation AJAX, optimistic update thận trọng + rollback nếu 409, không full refresh.
- Empty cart state, CTA “Tiếp tục mua sắm”.
- Khi stock vừa bị người khác mua, hiển thị rõ số còn lại và yêu cầu chỉnh quantity.

### 8.8 Multi-step Checkout (`/checkout`)

**Stepper:** Giỏ hàng (review) → Giao hàng → Thanh toán & ưu đãi → Kiểm tra & đặt hàng → Thành công.

| Step | Inputs/outputs | Validation |
|---|---|---|
| 1. Cart review | Items, qty, subtotal, edit cart | Giỏ không rỗng, variant available |
| 2. Shipping | Guest: fullName, email, recipient, phone, address; logged-in prefill default, chọn địa chỉ khác/nhập mới | Email hợp lệ, địa chỉ giao hàng đủ; **không bắt đăng nhập** |
| 3. Payment & discounts | Payment Demo (đánh dấu môi trường test), coupon input 5 chars, nút “Áp dụng”, xem valid/effect, input pointsToRedeem nếu logged in | `POST /checkout/quote` mỗi khi thay coupon/points/address; feedback ngay |
| 4. Review & confirm | Full summary, price breakdown, “Đặt hàng & thanh toán” | Double-click guard, idempotency key, server recheck |
| 5. Success | orderNumber, order items, shipping, total paid, status timeline, points earned, email confirmation note | Guest receipt token, logged user có link order history |

**Guest UI:** không hiện các trường “đặt password” hay bắt bấm “Create Account”; thông báo nhỏ: “Hệ thống sẽ lưu đơn theo email và bạn có thể đăng nhập sau để xem lại.” Nếu guest email trước đó có account, đơn liên kết nhưng guest không tự xem history.

### 8.9 Customer account screens

- `/register`: form cấp cao đúng **Email | Họ và tên | Địa chỉ giao hàng**; phần địa chỉ chỉ gồm đường/số nhà, phường, quận, thành phố, quốc gia (ẩn default VN), **không thêm ô phone/tên người nhận riêng/Password**. Sau submit thấy “Xác thực email” và hướng dẫn OTP.
- `/login`: tab/section “Email & mật khẩu” nếu đã set, “Nhận mã đăng nhập qua email”, nút “Tiếp tục với Google”; báo lỗi trung tính.
- `/account`: email read-only (nếu chưa có email-change workflow), fullName editable, role không hiển thị cần thao tác, default address và points card.
- `/account/addresses`: list nhiều địa chỉ, đánh dấu mặc định, add/edit/delete, có xác nhận xóa; chỉ một default.
- `/account/security`: set/change password theo `hasPassword`; Forgot Password public flow; không show raw token.
- `/account/orders`: table/cards order newest-first, number/date/total/status, mở details; paging nếu đủ dữ liệu.
- `/account/orders/:id`: buyer/shipping/items/discount/paid, **timeline/status table mới nhất trước**, ngày giờ local formatted.
- `/account/loyalty`: point balance lớn, dòng “1 điểm = 1.000đ”, lịch sử earn/redeem order nào khi nào; không thêm tier, rank, expiry hay rule giới hạn.

### 8.10 Admin layout và screens — GIỚI HẠN NGHIÊM NGẶT

Sidebar menu **chỉ**:

1. Dashboard
2. Advanced Analytics
3. Products (trong đó Categories và Variants/Inventory)
4. Users
5. Orders
6. Discount Codes

| Màn hình | Components bắt buộc | Interaction |
|---|---|---|
| Simple Dashboard | KPI cards users/new users/orders/revenue, bar/line chart, Top products | API summary, hiển thị con số có format |
| Advanced Analytics | Period segmented year/quarter/month/week/custom; date range; KPI orders/revenue/profit; revenue/profit/units/product types charts; compare previous period | Default **annual**, filter update mọi chart cùng lúc |
| Product list | Search, category filter, name/price/stock, edit/delete, pagination, Create Product CTA | Delete confirm; inventory theo variant |
| Product form | Name/slug/brand/category/description 5 lines/tags/gallery ≥3/variants ≥2, each price/cost/stock/SKU/attributes | Form validation prevent incomplete active product |
| Category management | Table, create/edit/delete chỉ trong computer component taxonomy | Nếu có products → không xóa |
| User list/detail | Name/email/created/ban state, edit fullName, ban/unban | Không edit roles, không thêm admin |
| Order list | Newest-first, **20/page**, today/yesterday/this week/this month/custom range, status badge, buyer/total/time | Filter thực sự server-side |
| Order detail | Buyer, timestamp, items, coupon applied, amount breakdown, status history | Chọn next valid state, update ngay |
| Discount list | code, createdAt, discount value, **usedCount / usageLimit**, còn lượt, view orders | Create button |
| Discount create/detail | Nhập 5 alnum, giảm VND, usageLimit 1–10; list các orders đã áp dụng | Chỉ **create** và **view**; không edit/delete/cấp phát hàng loạt |

**Không thêm:** Admin settings, review moderation, refund, coupons analytics riêng, CMS, reports export, ads, bulk mail, coupon expiration, thêm vai trò. Nếu thư viện UI tự hiển thị menu mặc định không dùng, phải tắt.

### 8.11 Responsive và accessibility acceptance

- Breakpoints tham khảo: <640 mobile, 640–1023 tablet, ≥1024 desktop; test thực tế **375, 768, 1280, 1440 px**.
- Tất cả product grids, gallery, filters, cart, checkout, admin tables không overflow viewport; admin tables trên mobile chuyển cards hoặc horizontal scroll *trong vùng table*.
- Tap target dễ bấm, form labels rõ, focus-visible, modal/drawer đóng bằng Esc, images có alt, message lỗi gắn field.
- Lighthouse/Web Vitals là mục tiêu chất lượng, không phải mức điểm số PDF ấn định. Cần tải tốt và tương tác mượt trên máy giảng viên.

---

## 9. Docker Compose, scaling, seed và môi trường chạy

### 9.1 Lựa chọn deployment

PDF cho phép **chọn một**: public hosting **hoặc** Docker Compose. Blueprint này **chọn Docker Compose**, vì đảm bảo giảng viên có thể chạy môi trường đầy đủ local và minh chứng horizontal scaling.

**[PDF–TÍM]** Giảng viên phải chạy được chỉ bằng:

```bash
docker compose up -d
```

Không đòi họ chạy trước `npm install`, `knex migrate:latest`, `seed`, `docker build`, tạo database thủ công, chạy thêm script hoặc set secret bắt buộc cho basic demo. Dockerfiles/entrypoints xử lý build/migration/seed tự động và **healthchecks + depends_on** đảm bảo thứ tự.

### 9.2 Services trong `compose.yaml`

| Container | Vai trò | Bắt buộc |
|---|---|---|
| `nginx` | reverse proxy một origin, round-robin `api-a`/`api-b`, serve SPA và proxy socket | Có |
| `frontend` | build React/Vite và serve static assets (hoặc Nginx mount build output; đảm bảo frontend tách component container theo PDF) | Có |
| `api-a` | Express replica A | Có |
| `api-b` | Express replica B, cùng image/config | Có |
| `postgres` | PostgreSQL persistent volume | Có |
| `redis` | Redis pubsub cho Socket.IO + distributed rate limit | Có cho scaling/realtime |
| `worker` | Node worker xử lý email_outbox | Có |
| `mailpit` | SMTP test + web inbox để giáo viên thấy order email | Có cho demo không cần SMTP ngoài |

**Ports đề xuất:** website `http://localhost:8080`; Mailpit Inbox `http://localhost:8025`; PostgreSQL/Redis không mở public port cần thiết. Healthcheck trang `/api/v1/health` (technical endpoint không phải Admin feature).

### 9.3 Scaling evidence [PDF–BẮT BUỘC]

- Có **ít nhất 2 Express replicas chạy đồng thời** sau Nginx và định tuyến được request tới cả hai (ghi access logs với instanceId hoặc internal response header ở demo).
- Server HTTP không dựa vào in-memory session/cache/carts. Cùng user có thể request tới A rồi B, vẫn thấy cart và order.
- Socket.IO Redis adapter đảm bảo comment trên replica A cập nhật cho client nối replica B; nếu sử dụng transport WebSocket-only thì proxy hỗ trợ Upgrade, không dựa vào sticky session mặc định.
- Tạo file/screenshot/log minh chứng: `docker compose ps` hiển thị cả hai replicas; các request liên tiếp trả instance khác; phiên/giỏ vẫn giữ; review event cross-replica; biểu đồ dashboard vẫn dùng shared DB. Bằng chứng có thể ghi trong README hoặc thư mục docs, **không tạo admin scaling dashboard**.

### 9.4 Environment variables và secrets

```dotenv
NODE_ENV=development
APP_BASE_URL=http://localhost:8080
DATABASE_URL=postgresql://app:change_me@postgres:5432/computer_shop
REDIS_URL=redis://redis:6379
COOKIE_SECRET=local_demo_secret_use_secure_one_in_production
JWT_SECRET=local_demo_jwt_secret_use_secure_one_in_production
SMTP_HOST=mailpit
SMTP_PORT=1025
MAIL_FROM=orders@computer-shop.local
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:8080/api/v1/auth/google/callback
DEMO_PAYMENT_ENABLED=true
SEED_DEMO_DATA=true
```

Các giá trị này là **mẫu local**, không phải secret production; phải thay secret khi public. `.env.example` được commit, `.env` thật không commit. Compose dùng default dành cho demo để lệnh trên chạy ngay. Google OAuth thật cần client ID/secret và redirect URL được cấu hình ở Google Console; **không giả mạo** social login nếu thiếu credential. Để chấm trọn phần Social Authentication, nhóm phải chuẩn bị credential hợp lệ và trình diễn account Google thực tế qua URL callback đã đăng ký (có thể triển khai public cho provider nếu môi trường local không đáp ứng). **Basic website vẫn boot nếu Google env chưa cấp.**

### 9.5 Seed/startup, reliability

1. PostgreSQL healthcheck pass → migration idempotent → seed data (nếu `SEED_DEMO_DATA=true`) → api/worker ready.
2. Không chạy migrations cạnh tranh trên cả `api-a` và `api-b`: dùng một service init/migrate hoặc advisory lock.
3. Nginx chỉ đánh dấu ready sau khi có API healthy; SPA route fallback về `index.html`.
4. Persist `postgres` volume và media assets cần thiết; khởi động lại không mất order.
5. Source package đã clean: bỏ `node_modules`, build caches, logs, dump bí mật, large temp; Docker build lúc up.

---

## 10. Automated tests và manual acceptance checklist

**Codex phải có integration tests cho logic ở backend và E2E Playwright ít nhất cho các luồng quan trọng.** Không được chỉ làm UI giả bằng static JSON. Test phải chạy trên database test riêng, không chạm seed production.

### 10.1 Golden paths/edge cases bắt buộc

| ID | Scenario / Given-When-Then | Kỳ vọng |
|---|---|---|
| A01 | Guest mở `/` | Đây là landing page đầu, có New/Best + ≥3 distinct computer categories |
| A02 | Guest mở `/products` | Catalog riêng, ảnh/name/price/description, pagination số |
| A03 | Category hoặc section chỉ có 1 page | Vẫn hiển thị nút/số **1** |
| A04 | Catalog có >12 item | Chuyển page 1→2 thực sự đổi dataset, không trùng lặp do sort instability |
| A05 | Sort 4 options | Name A–Z, Z–A, price ↑/↓ đều đúng |
| A06 | Filter brand + min/max price + category/rating | Cả ba tiêu chí kết hợp, URL state, kết quả đúng |
| A07 | Search keyword | Tìm tên/brand/tag, có no-results |
| A08 | Mở product detail seed | ≥3 ảnh, ≥5 description lines, ≥2 variants, brand/price |
| A09 | Chọn variant khác | SKU/price/stock đổi trên cùng detail page |
| A10 | Guest comment | Không yêu cầu login; comment xuất hiện và lưu DB |
| A11 | Guest thử rate sao | 401 hoặc login CTA; không tạo rating |
| A12 | Logged-in customer rate chưa mua | Thành công; unique per user/product, update average |
| A13 | Hai browser cùng product | Comment/rating push qua socket không reload |
| A14 | Guest thêm/update/remove cart | Quantity/line total/subtotal thay không refresh |
| A15 | Chọn quantity > stock | Server 409; UI hiển thị remaining stock |
| A16 | Guest checkout thành công | Không login; user auto-create nếu chưa có; paid order gắn user; success details |
| A17 | Guest email đã tồn tại | Không duplicate account, không tự tạo authenticated session |
| A18 | Guest sau đó email OTP login | Thấy order guest trong history và detail |
| A19 | Customer checkout có default address | Prefill; có thể chọn địa chỉ khác |
| A20 | Register form | Đúng 3 cấp input email/name/shipping address, **không password** |
| A21 | Google social login thật | OIDC callback, user/customer session; không account takeover |
| A22 | Password change + forgot/reset | Hash changed, old password invalid; token single-use |
| A23 | Profile address | ≥2 addresses, đổi default, edit/delete an toàn |
| A24 | Coupon valid ABC12 | Quote thấy mã hợp lệ và **số tiền giảm** trước pay |
| A25 | Coupon invalid/malformed/exhausted | Nêu lý do, không giảm sai, không tạo order nếu submit |
| A26 | Mã dài 4/6 hoặc non-alphanumeric | Admin create 400; mã hợp lệ đúng 5; no expiry |
| A27 | Admin tạo usageLimit=11 | 400; ≤10 mới hợp lệ |
| A28 | 2 checkout song song tranh lượt coupon cuối | UsedCount không vượt limit; chỉ 1 redemption |
| A29 | Payment failure | Không order/không trừ stock/points/coupon |
| A30 | Double-click submit cùng Idempotency-Key | Chỉ **1 order** và **1 email** |
| A31 | Inventory contention last variant | Không oversell/stock âm, transaction atomic |
| A32 | Order success | Hiện tất cả thông tin + reference; email trong Mailpit |
| A33 | Order history/tracking | Number/date/total/status/items; lịch sử status mới nhất trước |
| A34 | Admin update pending→confirmed→shipping→delivered | Mỗi status append timestamp; không skip/backward |
| A35 | Admin orders list | Newest-first, **20/page**, today/yesterday/week/month/custom filters |
| A36 | Admin order details | Buyer/purchase time/coupon/items/amount; update status |
| A37 | Admin coupon list/detail | created/discount/used/limit và các orders đã áp |
| A38 | Loyalty ví dụ order 1m VND | +100 points = 100k VND; dùng order kế tiếp không min |
| A39 | Loyalty simultaneous redemptions | Balance không âm, không double spend, ledger reconcile |
| A40 | Admin basic dashboard | Users/new users/orders/revenue/best sellers + charts đúng seed |
| A41 | Admin advanced dashboard | Annual default; đổi quarter/month/week/custom; revenue/profit/units/product types compare |
| A42 | Admin product/create/edit/delete | Restrict ≥2 variants/≥3 images/5 lines, stock per variant |
| A43 | Admin user ban/unban | Login/checkout/protected endpoints bị chặn đúng |
| A44 | RBAC | Guest/customer gọi `/admin/*` nhận 401/403; không thêm admin account |
| A45 | Product scope | Không có phone/other goods trong seed; admin không tạo sản phẩm sai scope |
| A46 | Responsive | 375/768/1280/1440 px, không overflow, menu/filter/table usable |
| A47 | Horizontal scaling | 2 API instances, same session/cart, cross-instance socket event |
| A48 | One-command Docker | Clone/extract package và **chỉ** chạy `docker compose up -d` để website hoạt động |

### 10.2 Seed/demo walkthrough 8–12 phút

1. Mở homepage, 5 sections và pagination.
2. Catalog: search, 3+ filters, 4 sorts, chuyển page.
3. Detail: 3 images, 2 variants, stock độc lập, comment guest, rating login và two-tab realtime.
4. Guest cart modify → checkout → coupon valid/invalid preview → thanh toán demo → success + Mailpit email.
5. Login bằng email OTP của guest → order history/status timeline; địa chỉ, password, Google OAuth.
6. Checkout thứ hai dùng ngay 100 loyalty points được tích từ order trước.
7. Admin products/category/inventory/users (ban), orders (time filters, status), discount create/detail.
8. Admin two dashboards: annual mặc định → month/week/custom; charts revenue/profit/số lượng/loại hàng.
9. `docker compose ps` hai API replicas; kiểm tra cross-instance session + socket.

Không cần giảng giải lý thuyết dài trong video; PDF yêu cầu video **thao tác thực tế**.

---

## 11. Traceability theo rubric gốc

Rubric tổng **10 điểm core**: **Customer 6.0 + Admin 2.0 + Other 2.0**. Bảng dưới ánh xạ tới triển khai để Codex không bỏ sót một mục nhỏ. Số **13** không xuất hiện trong bảng rubric của PDF; mục socket update được liệt kê **không mang ID**, vẫn có 0.25 điểm.

| Rubric ID | Điểm | Feature | Tài liệu implement/test |
|---|---:|---|---|
| 1 | .25 | Social Media Authentication | `5.1` Google, A21 |
| 2 | .25 | View profile | `5.2, 8.9` |
| 3 | .25 | Change password | `5.1`, A22 |
| 4 | .25 | Password recovery | `5.1`, A22 |
| 5 | .25 | Multiple delivery addresses | `5.2`, A23 |
| 6 | .25 | Purchase history | `5.2`, A18/A33 |
| 7 | .25 | Purchase details | `5.2`, A33 |
| 8 | .25 | Landing Page | `8.4`, A01 |
| 9 | .25 | Product Catalog by category | `8.5`, A02 |
| 10 | .25 | Pagination | `4.1/5.3/8.5`, A03/A04 |
| 11 | .25 | Product detail | `8.6`, A08 |
| 12 | .25 | Product variants same detail | `8.6`, A09 |
| 14 | .25 | Keyword search | `5.3`, A07 |
| 15 | .25 | Filtering | `5.3`, A06 |
| 16 | .25 | Ordering/sorting | `5.3`, A05 |
| 17 | .25 | Display cart | `5.4/8.7`, A14 |
| 18 | .25 | Update cart | `5.4/8.7`, A14/A15 |
| 19 | .25 | Checkout | `5.4/8.8`, A16 |
| 20 | .25 | Discount on checkout | `5.4/7.3`, A24–A28 |
| 21 | .25 | Email after order | `7.4/9`, A32 |
| 22 | .25 | Product comments | `5.3`, A10 |
| 23 | .25 | Product star ratings | `5.3`, A11/A12 |
| *không đánh số* | .25 | Realtime review/rating via WebSocket | `5.10`, A13 |
| 24 | .25 | Loyalty | `7.6`, A38/A39 |
| 25 | .25 | Admin Product Management | `5.6/8.10`, A42 |
| 26 | .25 | Admin User Management | `5.7`, A43 |
| 27 | .25 | Simple Dashboard | `5.5`, A40 |
| 28 | .50 | Advanced Dashboard | `5.5`, A41 |
| 29 | .25 | Admin View Orders | `5.8`, A35 |
| 30 | .25 | Admin Order Detail/Status | `5.8`, A34/A36 |
| 31 | .25 | Admin Discount Management | `5.9`, A37 |
| 32 | .50 | UI/UX above average | `8` |
| 33 | .50 | Teamwork evidence | `12.2` |
| 34 | .50 | Responsive above average | `8.11`, A46 |
| 35 | .50 | Horizontal scaling | `9.3`, A47 |

**Lưu ý:** Một số chức năng quan trọng (guest auto account, order status timeline, product data count, restriction tím) chưa có dòng rubric độc lập nhưng **vẫn là yêu cầu trong phần II/notes**; không được bỏ chỉ vì bảng điểm không đặt tên.

---

## 12. Gói nộp bài, tài liệu, teamwork, bonus

### 12.1 Chính xác những thứ cần giao

Theo trang 12–13 của PDF:

```text
id1_fullname1_id2_fullname2/
  source/
    frontend/ backend/ worker/ nginx/
    compose.yaml
    .env.example
    README.txt (hướng dẫn chạy nếu đặt trong source)
  demo.mp4
  git/
    github-insights-contributions-*.png
  Readme.txt
  Bonus/
    README.txt (nêu rõ bonus nào đã hoàn tất, evidence)
  Rubrik.docx   (file giảng viên cấp, nhóm tự chấm/điền)

ZIP: id1_fullname1_id2_fullname2.zip
```

- **Source** phải chứa toàn bộ frontend/backend/database migrations/seeds và config chạy được, đã clean files thừa.
- **`demo.mp4`** minimum **1080p**, tiếng rõ, demo **mọi tính năng nhóm tự chấm**, hạn chế nói lý thuyết.
- **`git/`** chứa ảnh GitHub/GitLab Insights contributions.
- **`Readme.txt`** phải có URL nếu deploy public, cách chạy, credential demo **ADMIN**, credential customer seeded, Mailpit URL, chức năng/test notes, bonus đã làm.
- **`Rubrik.docx`** do giáo viên cung cấp về sau: phải điền self-evaluation, URL/credentials nếu cần; **không nộp Rubrik → không được chấm**.
- **`Bonus/`** liệt kê bonus làm thật và bằng chứng, kể cả README và video; nếu chưa có bonus không được tuyên bố đã hoàn thành.
- ZIP theo chính xác naming convention của nhóm và **submit qua e-learning**, không qua email.
- **Không có deployment hoặc thiếu video**: đề nêu **không được chấm**. **Thiếu source code**: 0 điểm. Dự án unrelated / hàng hóa sai: 0. Thiếu Rubrik: không chấm.
- PDF cũng liệt kê điểm trừ do nộp trễ, config quá phức tạp không hướng dẫn (**-2**), nộp source chưa clean (**-0.5**), thiếu thông tin chấm (**-1**). Đừng xem nhẹ README.

### 12.2 Teamwork evidence

- Nhóm **2–3 thành viên**; teamwork score 0.5. Git history có ít nhất **1 tháng phát triển** tính từ bắt đầu đến hiện tại và **mỗi thành viên ≥2 commits/tuần**; evidence phải là GitHub Insights thật (không dựng giả).
- Tách công việc có ý nghĩa, commit đều đặn, review/merge ổn định. Solo không được điểm teamwork.
- Không chia sẻ/chép code nhóm khác hoặc code dự án tương tự trên mạng theo quy định đề. Sử dụng thư viện/framework hợp pháp không đồng nghĩa sao chép nguyên dự án, nhưng phải tự phát triển các chức năng và bảo vệ source.
- Lịch sử commit không thể được “tái tạo” trung thực trong vài ngày; cần kế hoạch nhóm thật từ đầu.

### 12.3 Optional bonus (chỉ sau core, không tự kích hoạt)

PDF có **4 loại bonus**, mỗi loại làm hoàn chỉnh thêm **0.5 điểm**, tổng tối đa **2**:

| Bonus | Định nghĩa đạt | Hướng dẫn |
|---|---|---|
| CI/CD | Jenkins/GitHub Actions/CircleCI/GitLab CI hoặc major cloud provider, pipeline chạy build/test/deploy có evidence | Dễ bổ sung sau core, không thành admin feature |
| Microservices | Frontend + DB và **ít nhất 3 services khác** thật sự tách theo domain, có **async decoupling** qua RabbitMQ/Redis | *Không nhầm* 2 replicas của modular monolith là 3 microservices; đó chỉ là horizontal scaling |
| AI | Chatbot gợi ý đúng mặt hàng computer, image product search hoặc sentiment analysis comments | Không cần làm nếu core còn thiếu; giữ hàng hóa đúng scope |
| ElasticSearch | Tích hợp ElasticSearch tìm product nhanh/relevant, thực tế được sử dụng trong query | Đo hiệu năng/relevance, có evidence |

**Không được** bật bonus giả hay đổi kiến trúc chính khi chưa có chỉ đạo. Nếu làm bonus, ghi rõ trong README, Rubrik, video và folder Bonus kèm bằng chứng.

---

## 13. Những điều PDF chưa nói rõ và quyết định được chốt

| Vấn đề chưa rõ / có thể mâu thuẫn | Quyết định blueprint | Mức rủi ro / cách xử lý |
|---|---|---|
| Register chỉ 3 input nhưng password change/recovery | Passwordless register + email OTP/social; set password sau trong account | Giữ nghiêm yêu cầu màu tím; cần test kỹ |
| Guest email trùng existing user | Attach order bằng normalized email, **không auto-login**; login sau chứng minh email | Không làm guest thấy private history |
| Payment provider bắt buộc? | Không chỉ định; **DemoPaymentAdapter** có success/failure, minh bạch | Nếu giáo viên yêu cầu cổng thật ngoài PDF, thay adapter |
| Coupon discount là fixed hay %? | Fixed VND (amount) | Nếu giáo viên làm rõ %, thay schema/quote/tests nhưng giữ 5-char/≤10/no expiry |
| Thuế bao nhiêu? | `taxVnd=0` demo, vẫn show line; configurable | Không tư vấn hay giả lập luật thuế |
| Shipping fee bao nhiêu? | 30k VND fixed server-config | Không phải realtime courier |
| Điểm 10% nhưng 1m→100 points | 1 point=1k VND; earned=floor(totalPaid/10k) | Khớp chính xác ví dụ PDF |
| Earn base trước/sau discount/tax? | Earn trên final amount thực trả | Nêu rõ trong README; có thể điều chỉnh khi giáo viên xác nhận |
| “Profit” tính thế nào? | Estimated gross profit từ order item cost snapshot, net merchandise revenue | Tránh giả vờ net profit có đủ chi phí |
| “Pagination everywhere product lists” áp vào Home? | **Có**, mọi home product section cũng hiển thị numbered pages | Có nhiều data demo thực để phân trang |
| Review guest cần email? | Chỉ guestName + body (không ép login/email) | Spam rate limit; rating luôn auth |
| Admin can delete product referenced by orders? | Soft delete product; order snapshots giữ nguyên | Không phá lịch sử |
| Admin có được thêm page quản lý? | **Không** ngoài six allowed modules | Màu tím nghiêm ngặt |
| Dashboard time bucket timezone? | Asia/Ho_Chi_Minh; DB UTC | Consistent date filters |
| WebSocket là optional wording “if possible” | **Triển khai để đạt rubric 0.25** | Có phần rubric riêng |
| Core architecture microservices? | Modular monolith + 2 replicas (horizontal scaling) | Microservices bonus riêng, không bắt buộc |
| Deployment public hay Compose? | Compose one-command | Chọn một phương án đủ theo PDF |

---

## 14. Trình tự xây dựng bắt buộc cho Codex

**Nguyên tắc:** mỗi phase phải có migration/API/UI/tests chạy được trước khi sang phase sau. Không dừng ở prototype tĩnh. Nếu thiếu thông tin business, ưu tiên các chốt `13` và báo rõ; không tự đổi scope màu tím.

### Phase 0 — Foundation

- Tạo monorepo JavaScript/ESM, lint/format/test baseline; Compose frontend/API A/B/Postgres/Redis/Mailpit/worker/Nginx; migrations, seeds, healthchecks; CORS/cookies/config.
- Chạy smoke từ lệnh **`docker compose up -d`**.

### Phase 1 — Catalog & customer identity

- DB user/address/auth OAuth/OTP/password/recovery; Google config; customer profile.
- Category/products/variant/images/tags, seed dataset; homepage, catalog/search/filter/sort/pagination/detail.

### Phase 2 — Reviews & cart

- Guest comments, authenticated ratings, Socket.IO + Redis cross-replica.
- Persistent guest/customer cart và UI instant update.

### Phase 3 — Checkout/Orders/Loyalty

- Quote math + coupon validation, checkout multi-step, demo payment + idempotency, transaction order/stock/coupon/points, receipt page, email worker/Mailpit.
- Customer order history/detail/status timeline, loyalty balance/ledger; concurrency/integration tests.

### Phase 4 — Allowed Admin features

- Product/Category/Inventory, Users/Ban, Orders/status/filter/pagination, Coupons create/list/detail.
- Simple + Advanced dashboard with persisted data and accurate revenue/profit formulas. **Không bổ sung module admin khác**.

### Phase 5 — Quality, evidence & delivery

- Playwright E2E A01–A48, responsive passes, accessible UX, performance basics.
- Verify dual replicas/load balance/socket, backup clean package, all docs, demo video 1080p, Git Insights screenshots, Rubrik.
- Chỉ khi core Done và có thời gian mới cân nhắc một bonus.

### Definition of Done — giao hàng thật

Một tính năng chỉ “xong” khi có **database persistence + backend validation + đúng permission + API response contract + UI tích hợp + loading/error/success + test pass**. Không chấp nhận “button nhìn thấy nhưng không hoạt động”, API mock trả static demo data, form admin không save DB, phân trang giả, biểu đồ hardcode, coupon còn lượt mà double-spend, hoặc order được tạo trước payment success.

---

## 15. PROMPT ĐI KÈM ĐỂ GIAO BLUEPRINT CHO CODEX

> **Hãy xây dựng hoàn chỉnh ứng dụng theo file `BLUEPRINT_NODEJS_ECOMMERCE.md` này. Đây là nguồn sự thật về concept, chức năng, REST API, DTO, database, UI, security, transaction, tests và deployment. Mọi yêu cầu được đánh [PDF–TÍM / KHÓA] có mức ưu tiên cao nhất và không được thay đổi. Chỉ bán máy tính/linh kiện; đúng CUSTOMER và một ADMIN; guest checkout tự tạo account; registration chỉ 3 input; coupon 5 chữ/số không expiry, max 10 uses; không thêm chức năng Admin.**
>
> **Stack chốt:** JavaScript/Node.js, Express, React/Vite, PostgreSQL/Knex, Redis/Socket.IO, Nodemailer/Mailpit, Nginx, Docker Compose. Triển khai mã nguồn thật, schema migrations, deterministic seeds, các API được chỉ định, UI responsive, auth và role guards, atomic checkout, loyalty rules, dashboards và tests. Nếu dùng công nghệ thay thế tương đương, phải giữ JavaScript/Node.js và không phá API/requirements. Trước khi tự đổi business rule, hãy hỏi tôi.**
>
> **Hãy làm theo Phase 0→5, chạy test và sửa lỗi; xác minh `docker compose up -d` khởi động được đầy đủ mà không cần lệnh chuẩn bị nào từ giảng viên. Không tuyên bố hoàn thành nếu chưa kiểm chứng. Sau mỗi phase hãy báo các file đã xây, API đã chạy, test result, phần còn lại và blocker. Seed đủ để demo pagination/filter/analytics/loyalty, không dùng dữ liệu tĩnh giả. Đảm bảo tất cả rubric test cases A01–A48 có bằng chứng.**
>
> **Không tạo thêm feature scope (đặc biệt Admin) hoặc bonus khi chưa được tôi yêu cầu.**

---

## 16. Phụ lục: kiểm tra cuối và phạm vi tài liệu

**Đã đọc 13/13 trang** và đối chiếu các phần:

- Trang 1–2: Overview, scope máy tính/linh kiện, landing, account & catalog.
- Trang 3: search/sort/filter/review, cart/checkout/coupon, order.
- Trang 4–5: loyalty, admin dashboards/product/users/orders/coupons, deployment options và hạn chế admin.
- Trang 6: UI/UX, teamwork, responsive, horizontal scaling, bonus.
- Trang 7–11: rubric 6.0 + 2.0 + 2.0 điểm, từng item, examples format/UX.
- Trang 12–13: nộp source/video/Git/README/Bonus/Rubrik, ZIP convention, lưu ý/phạt/không được chấm.

**API contract, database schema, colors, payment mock, points rounding, cost/profit formula, seed counts, package choices** là **thiết kế đề xuất** để Codex có thể làm việc không mơ hồ. PDF không phát hành bất kỳ API specification, wireframe, ERD, database design hay payment provider bắt buộc nào. Nếu giảng viên cung cấp tài liệu bổ sung, các phần đề xuất này có thể điều chỉnh nhưng **không được trái các điều khóa của PDF**.

**Cảnh báo thực tế:** bản blueprint này là đặc tả triển khai, **không phải codebase đã chạy**. Nhóm vẫn phải triển khai, test, quay video, chứng minh teamwork và hoàn tất Rubrik. Không thể chứng nhận social OAuth chạy đầy đủ khi chưa có credential/provider config thật.


