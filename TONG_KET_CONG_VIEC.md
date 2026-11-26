# TỔNG KẾT CÔNG VIỆC — OBSIDIAN COMPUTE

## 1. Tổng quan

Công việc của mình trong dự án gồm ba phần chính:

- Rà soát source code hiện có, đối chiếu yêu cầu đề bài và khắc phục các lỗi của hệ thống.
- Triển khai đầy đủ bốn nhóm tính năng Bonus.
- Kiểm thử, kiểm tra chất lượng code và đảm bảo hệ thống có thể triển khai bằng Docker Compose.

## 2. Các vấn đề đã khắc phục

Tổng cộng có 46 mục sửa lỗi được ghi nhận trong `log_fix_issue.md`, bao gồm các nhóm sau:

| Nhóm chức năng | Công việc đã thực hiện |
|---|---|
| Sản phẩm và tồn kho | Sửa lỗi mất số lượng tồn kho, trùng variant, mất thuộc tính sản phẩm, ghi đè giá vốn và cập nhật dữ liệu đồng thời. |
| Danh mục | Sửa lỗi khôi phục danh mục đã xóa, ngăn xung đột giữa cập nhật sản phẩm và xóa danh mục. |
| Tìm kiếm và giao diện | Hoàn thiện Product Tags, bộ lọc, sắp xếp, phân trang, SEO metadata và sửa các lỗi hiển thị trên thiết bị di động. |
| Tài khoản và bảo mật | Hoàn thiện Google OAuth, sửa lỗi session, đăng xuất, khôi phục mật khẩu và ngăn dữ liệu tài khoản bị lẫn giữa người dùng. |
| Giỏ hàng và thanh toán | Sửa lỗi khởi tạo giỏ hàng, thanh toán sandbox, thay đổi đơn hàng sau khi xác nhận và ngăn tạo trùng đơn hàng khi gửi lại yêu cầu. |
| Đơn hàng và email | Sửa màn hình đặt hàng thành công, bảo vệ thông tin truy cập hóa đơn, hoàn thiện gửi email và cơ chế gửi lại khi gặp lỗi. |
| Dashboard | Sửa biểu đồ sản phẩm bán chạy, thống kê danh mục, múi giờ, hiển thị biểu đồ và tính chính xác của dữ liệu lợi nhuận. |
| Realtime | Sửa lỗi xử lý WebSocket, cập nhật bình luận và đánh giá giữa nhiều người dùng. |
| Triển khai | Hoàn thiện Docker Compose, kiểm thử tự động, khả năng chạy trên localhost và truy cập tương tác qua LAN. |

Các lỗi được kiểm tra trước và sau khi sửa, đồng thời kiểm thử lại những chức năng liên quan để tránh phát sinh lỗi mới.

Chi tiết nguyên nhân và cách khắc phục từng lỗi nằm trong `log_fix_issue.md`.

---

## 3. Bốn tính năng Bonus đã triển khai

### 3.1. CI/CD — Tự động kiểm thử và phát hành ứng dụng

**Mục đích**

Tự động kiểm tra chất lượng code và đóng gói ứng dụng sau khi lập trình viên push code lên GitHub.

Thay vì mỗi thành viên phải tự build và kiểm thử thủ công, GitHub Actions sẽ thực hiện quy trình này tự động.

**Công nghệ sử dụng**

GitHub Actions, Docker, GitHub Container Registry (GHCR), Node.js Test và Playwright.

**Workflow hoạt động**

1. Lập trình viên push code lên nhánh `fix-issue` hoặc `main`.
2. GitHub Actions lấy source code của commit đó.
3. Cài đặt dependencies và build ứng dụng.
4. Tạo hai Docker Image: Backend và Frontend.
5. Khởi chạy hệ thống kiểm thử bằng chính hai image vừa build.
6. Nếu toàn bộ kiểm thử thành công, lưu lại hai image đã kiểm chứng.
7. Phát hành chính hai image đó lên GitHub Container Registry, không build lại.
8. Thành viên có thể tải image về và chạy bằng Docker Compose.

Nếu kiểm thử thất bại, pipeline không phát hành phiên bản image mới.

**Image được lưu ở đâu?**

- Backend: `ghcr.io/peterphan2005/obsidian-compute-backend`
- Frontend: `ghcr.io/peterphan2005/obsidian-compute-frontend`

Mỗi image được đánh dấu bằng commit SHA để xác định chính xác phiên bản mã nguồn.

**Kết quả**

Pipeline cuối cùng đã vượt qua 94/94 kiểm tra và phát hành thành công cả hai image.

Đây là Continuous Integration và Continuous Delivery, chưa phải tự động triển khai website lên máy chủ public.

---

### 3.2. Microservices — Tách hệ thống thành các dịch vụ độc lập

**Mục đích**

Tách những nhóm công việc khác nhau của Backend thành các service riêng để giảm sự phụ thuộc và tránh việc một tác vụ chậm làm ảnh hưởng không cần thiết đến các tác vụ khác.

**Ba service đã triển khai**

| Service | Nhiệm vụ |
|---|---|
| Core API | Xử lý tài khoản, sản phẩm, giỏ hàng, đơn hàng, thanh toán và quản trị. |
| Realtime Gateway | Xử lý kết nối WebSocket, cập nhật bình luận và đánh giá theo thời gian thực. |
| Notification Worker | Xử lý gửi email xác nhận đơn hàng, OTP và khôi phục mật khẩu. |

Ba service chạy dưới các tiến trình và container riêng, sử dụng chung Backend Image.

Core API có hai instance và được Nginx phân phối request để hỗ trợ Horizontal Scaling.

**Workflow 1 — Bình luận và đánh giá realtime**

1. Người dùng bình luận hoặc đánh giá sản phẩm.
2. Core API lưu dữ liệu vào PostgreSQL.
3. Core API gửi sự kiện thông qua Redis Pub/Sub.
4. Realtime Gateway nhận sự kiện.
5. Gateway gửi thông báo qua Socket.IO đến các trình duyệt đang xem sản phẩm.
6. Giao diện được cập nhật mà không cần tải lại trang.

Ví dụ: Hai người đang xem cùng một sản phẩm. Khi một người bình luận, người còn lại có thể thấy bình luận mới ngay lập tức.

**Workflow 2 — Gửi email sau khi đặt hàng**

1. Khách hàng đặt hàng thành công.
2. Core API lưu đơn hàng và yêu cầu gửi email vào PostgreSQL.
3. Khách hàng nhận kết quả đặt hàng mà không cần chờ email gửi xong.
4. Notification Worker đọc yêu cầu gửi email từ bảng outbox.
5. Worker gửi email đến Mailpit trong môi trường demo.
6. Nếu gửi thất bại, Worker có thể thử lại sau.

Nhờ vậy, khi dịch vụ email gặp sự cố, chức năng đặt hàng vẫn có thể hoạt động.

---

### 3.3. AI-related Features — Gợi ý sản phẩm bằng AI

**Mục đích**

Cho phép người dùng mô tả nhu cầu sử dụng bằng ngôn ngữ tự nhiên thay vì phải biết chính xác tên sản phẩm hoặc từ khóa cần tìm.

**Công nghệ sử dụng**

Transformers.js, mô hình multilingual MiniLM, ONNX Runtime, WebAssembly và Web Worker.

AI hỗ trợ cả tiếng Việt và tiếng Anh, chạy trực tiếp trên trình duyệt mà không cần API key hoặc dịch vụ AI trả phí.

**Workflow hoạt động**

1. Người dùng mở mục **AI product recommendations** trong Catalog.
2. Nhập mô tả nhu cầu bằng tiếng Việt hoặc tiếng Anh.
3. Có thể chọn thêm danh mục và ngân sách tối đa.
4. Hệ thống lấy danh sách sản phẩm phù hợp với các điều kiện, giới hạn tối đa 64 sản phẩm để phân tích.
5. Mô hình AI chuyển nội dung nhu cầu và mô tả sản phẩm thành các vector số, gọi là embeddings.
6. Hệ thống so sánh mức độ tương đồng về ngữ nghĩa giữa nhu cầu và từng sản phẩm.
7. Chọn các sản phẩm phù hợp nhất.
8. Kiểm tra lại giá và tình trạng tồn kho trước khi hiển thị tối đa ba đề xuất.

**Ví dụ**

Người dùng nhập:

> Tôi cần một chiếc laptop nhẹ để đọc tài liệu khi đi xa.

AI sẽ phân tích ý nghĩa của câu và tìm những laptop có mô tả phù hợp trong Catalog, kể cả khi người dùng không nhập tên sản phẩm cụ thể.

**Điểm đặc biệt**

AI chỉ đề xuất sản phẩm có thật trong Catalog của hệ thống, không tự tạo tên sản phẩm hoặc giá bán.

Đây là hệ thống gợi ý sản phẩm theo ngữ nghĩa, không phải chatbot đa năng như ChatGPT.

Lần đầu sử dụng cần tải khoảng 158 MB dữ liệu mô hình và runtime. Chất lượng đề xuất phụ thuộc vào mô tả sản phẩm và nhu cầu được nhập.

---

### 3.4. Elasticsearch — Tìm kiếm sản phẩm

**Mục đích**

Cải thiện khả năng tìm kiếm theo từ khóa và sắp xếp sản phẩm theo mức độ liên quan, thay vì chỉ dựa vào cách tìm kiếm chuỗi ký tự thông thường trong PostgreSQL.

**Công nghệ sử dụng**

Elasticsearch, PostgreSQL và Node.js.

**Workflow 1 — Đồng bộ dữ liệu sản phẩm**

1. Admin thêm, sửa hoặc thay đổi sản phẩm.
2. Dữ liệu được lưu vào PostgreSQL.
3. Hệ thống ghi nhận những thay đổi cần đồng bộ.
4. Core API tự động đồng bộ thông tin tìm kiếm sang Elasticsearch.
5. Elasticsearch cập nhật index để phục vụ các lần tìm kiếm tiếp theo.

**Workflow 2 — Người dùng tìm kiếm**

1. Người dùng nhập từ khóa vào Catalog.
2. Core API gửi từ khóa đến Elasticsearch.
3. Elasticsearch tìm kiếm trong tên, thương hiệu, mô tả ngắn và tags.
4. Elasticsearch trả về danh sách ID sản phẩm cùng điểm liên quan.
5. Core API truy xuất PostgreSQL để lấy dữ liệu sản phẩm hiện tại.
6. PostgreSQL áp dụng các điều kiện lọc, sắp xếp và phân trang.
7. Kết quả được trả về giao diện.

**Workflow 3 — Khi Elasticsearch gặp sự cố**

1. Core API không nhận được kết quả Elasticsearch trong thời gian cho phép.
2. Hệ thống tự động chuyển sang tìm kiếm bằng PostgreSQL.
3. Người dùng vẫn có thể tìm kiếm sản phẩm.
4. Khi Elasticsearch hoạt động trở lại, hệ thống tiếp tục đồng bộ dữ liệu.

Cơ chế này được gọi là SQL Fallback.

**Ví dụ**

Khi tìm kiếm từ khóa `Northstar`, Elasticsearch xác định các sản phẩm liên quan, còn PostgreSQL cung cấp giá bán, trạng thái sản phẩm và dữ liệu hiện hành.

Elasticsearch hỗ trợ tìm kiếm theo mức độ liên quan và khả năng phục hồi khi gặp sự cố. Với 60 sản phẩm demo hiện tại, chưa có bằng chứng cho thấy Elasticsearch nhanh hơn PostgreSQL.

---

## 4. Quy trình thực hiện công việc

Toàn bộ quá trình phát triển được chia thành từng batch:

1. Đọc yêu cầu đề bài và xác định vấn đề.
2. Kiểm tra source code, tìm nguyên nhân.
3. Triển khai bản sửa hoặc tính năng Bonus.
4. Kiểm thử chức năng đã thay đổi.
5. Kiểm tra code độc lập và sửa các vấn đề được phát hiện.
6. Kiểm thử lại toàn bộ hệ thống.
7. Commit và push lên GitHub.
8. Kiểm tra CI/CD và chạy thử image đã phát hành.
9. Cập nhật tài liệu và nhật ký sửa lỗi.

Mục tiêu là đảm bảo những tính năng mới không làm hỏng các chức năng đã hoạt động trước đó.

## 5. Tài liệu tham khảo

- `log_fix_issue.md`: Chi tiết 46 mục sửa lỗi.
- `PROJECT_STATE.md`: Tiến độ và trạng thái toàn bộ dự án.
- `Bonus/01_CI_CD.md`: Hướng dẫn CI/CD.
- `Bonus/02_Microservices.md`: Hướng dẫn Microservices.
- `Bonus/03_Elasticsearch.md`: Hướng dẫn Elasticsearch.
- `Bonus/04_AI_Product_Recommendation.md`: Hướng dẫn AI.
- `source/README.txt`: Hướng dẫn chạy và kiểm thử ứng dụng.

Hai tài liệu tiến độ nằm trên nhánh `progress`. Source code đã nghiệm thu nằm trên nhánh `fix-issue`. Các guide Bonus được lưu tại thư mục local `Bonus/`.
