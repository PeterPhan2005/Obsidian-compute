# TỔNG KẾT CÔNG VIỆC — OBSIDIAN COMPUTE

## 1. Tổng quan

Công việc của mình trong dự án gồm ba phần chính:

- Rà soát source code hiện có, đối chiếu yêu cầu đề bài và khắc phục các lỗi của hệ thống.
- Triển khai đầy đủ bốn nhóm tính năng Bonus.
- Kiểm thử, kiểm tra chất lượng code và đảm bảo hệ thống có thể triển khai bằng Docker Compose.

## 2. Các vấn đề đã khắc phục

`log_fix_issue.md` ghi nhận 60 mục công việc, gồm 46 mục trước đợt hậu nghiệm thu và 14 mục bổ sung (47–60). Nhật ký bao gồm cả sửa lỗi, hoàn thiện tính năng và gia cố phòng vệ.

| Nhóm chức năng | Công việc đã thực hiện |
|---|---|
| Sản phẩm và tồn kho | Sửa lỗi mất số lượng tồn kho, trùng variant, mất thuộc tính, ghi đè giá vốn và cập nhật đồng thời. Cho phép giảm số lượng giỏ về mức còn hàng và gỡ thao tác mua khi Product Details xác nhận sản phẩm đã bị archive. |
| Danh mục | Sửa lỗi khôi phục danh mục đã xóa và xung đột giữa cập nhật sản phẩm và xóa danh mục. Trang Home chọn danh mục còn sản phẩm và thay thế section thiếu, với phân trang theo section đang hiển thị. |
| Tìm kiếm và giao diện | Hoàn thiện Product Tags, bộ lọc, sắp xếp, phân trang, SEO metadata và giao diện mobile. AI làm mới đề xuất khi giá hoặc khả năng bán thay đổi, hiểu đúng mẫu câu `không chỉ … mà còn …` và chạy lượt đầu khi Vite tối ưu dependency từ cache trống. |
| Tài khoản và bảo mật | Hoàn thiện Google OAuth, sửa session, đăng xuất, khôi phục mật khẩu và ngăn lẫn dữ liệu tài khoản. Cho phép để trống số điện thoại ở địa chỉ đã lưu. Bổ sung cấu hình phòng vệ cho error log của trang reset mật khẩu cũ. |
| Giỏ hàng và thanh toán | Sửa khởi tạo giỏ và việc xác nhận lại báo giá khi giỏ thay đổi. Checkout giữ yêu cầu nhập số điện thoại. Khi mất phản hồi hoặc tải lại trang, trình duyệt có thể tìm lại đơn đã hoàn tất mà không tạo đơn trùng. |
| Đơn hàng và email | Sửa màn hình đặt hàng thành công và bảo vệ dữ liệu truy cập hóa đơn. Trạng thái đơn và timeline đọc cùng snapshot. Notification Worker bỏ qua yêu cầu gửi OTP/reset đã hết hạn, đã dùng hoặc đã bị thay thế. |
| Dashboard | Sửa biểu đồ sản phẩm bán chạy, thống kê danh mục, múi giờ, hiển thị và dữ liệu lợi nhuận. Chỉ số tổng hợp và chuỗi doanh thu của Simple Dashboard đọc cùng snapshot khi có đơn hàng commit đồng thời. |
| Realtime | Sửa xử lý WebSocket và cập nhật bình luận/đánh giá giữa nhiều người dùng. Payload bình luận công khai qua HTTP và realtime chỉ giữ các trường công khai cần dùng. |
| Triển khai | Hoàn thiện Docker Compose, kiểm thử tự động, localhost và LAN. Nginx tiếp tục chuyển request khi Core container được tạo lại với địa chỉ IP mới. |

Sau Batch 09, Independent Full-System Review ghi nhận bảy lỗi đã tái hiện (A1–C3), sáu lỗi được xác nhận thêm và một điểm cần gia cố phòng vệ. Owner cho phép triển khai, sau đó candidate qua review độc lập và re-review. Cả 14 mục đã được nghiệm thu. Với trang reset cũ, điểm được xác nhận là thiếu cấu hình phòng vệ. Khả năng lộ token trong log lịch sử hoặc khi upstream lỗi vẫn chưa được xác minh.

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

Commit được Final Technical Acceptance là `068bb1eca89283241544310186b3da95e122abee` trên `origin/fix-issue`. Pipeline tại commit này build production và cả hai image thành công. Job `verify` đạt **112/112** (66 Backend/OAuth, 46 Playwright). Job `publish` nạp artifact `verified-images` (ID `15190671043`) để đưa hai image đã kiểm thử lên GHCR. [GitHub Actions run 45983344230, attempt 1](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45983344230)

- Backend: `ghcr.io/peterphan2005/obsidian-compute-backend@sha256:14ed59c43493822c49e35d6d7da430e55507292f1df9241870c782dd01dd3d61`
- Frontend: `ghcr.io/peterphan2005/obsidian-compute-frontend@sha256:58777cd5614050c915acbef7e180ba1f85cafb469f0c6560d564c08e12363e14`

Technical advisor đã kiểm tra độc lập commit và phạm vi thay đổi trên GitHub, kết quả Actions, thông tin artifact và đối chiếu hai registry manifest digest trên GHCR với log publish của GitHub Actions. Codex thực hiện và báo cáo riêng việc đối chiếu image configuration digest tại local và chạy hai image tải theo digest, với Compose tại đúng commit và `--no-build`. Lượt này đạt **112/112**, init thoát `0` và cả sáu container ứng dụng dùng đúng image.

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

Core API có hai instance và được Nginx phân phối request để hỗ trợ Horizontal Scaling. Smoke trên image phát hành xác nhận cả hai Core container được tạo lại với IP mới. Nginx vẫn phân phối request và Gateway tiếp tục tra cứu qua listener nội bộ, không cần khởi động lại Nginx.

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

Nhờ vậy, khi Worker dừng, checkout vẫn có thể hoàn tất và email chờ được gửi khi Worker chạy lại. Trong kiểm thử phục hồi xác thực, Worker chỉ gửi OTP hoặc liên kết reset cho yêu cầu còn hiệu lực, kể cả khi hàng chờ có job theo định dạng cũ. Kiểm thử realtime xác nhận trình duyệt nhận cập nhật trở lại sau khi Gateway restart hoặc Redis mất subscriber.

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

Khi người dùng quay lại tab Catalog hoặc mở một đề xuất, giao diện kiểm tra lại giá và tình trạng bán của các đề xuất đã hiển thị, gỡ mục đã archive và dùng offer còn đủ điều kiện. Thao tác này dùng lại thứ hạng hiện có. Test song ngữ đã chạy inference thật với cả câu tiếng Việt có `không chỉ … mà còn …`. Test Vite riêng dùng cache tối ưu dependency mới và xác nhận lượt AI đầu hoàn tất bằng WASM local.

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

Verifier trên image phát hành xác nhận cả hai Core API đều tìm qua Elasticsearch, tìm kiếm vẫn có kết quả khi Elasticsearch timeout hoặc dừng và các cập nhật được đồng bộ bù khi Elasticsearch chạy lại. Các phép đo với 60 sản phẩm demo chỉ mô tả tải nhẹ. Hiệu năng ở quy mô production chưa được đo.

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

Kết quả kiểm thử tăng qua ba checkpoint. Batch 09 đạt **94/94** (60 Backend/OAuth, 34 Playwright). Bản sửa A1–C3 đạt **102/102** (61 Backend/OAuth, 41 Playwright). Bản tích lũy cuối đạt **112/112** (66 Backend/OAuth, 46 Playwright). Actions và verifier trên image đã publish đều đạt **112/112** tại checkpoint cuối. Smoke local trên hai image phát hành còn xác nhận storefront, Catalog, health và guest checkout trên localhost lẫn LAN HTTP.

Ứng dụng ở trạng thái **ACCEPTED / FINALIZED** trong phạm vi kỹ thuật đã kiểm chứng. Google OAuth consent/callback thật, SMTP ngoài Mailpit, search-engine indexing, hiệu năng AI trên thiết bị di động thật, tải production, log nhạy cảm lịch sử và khả năng lộ legacy reset token khi upstream lỗi vẫn cần bằng chứng riêng. Các advisory của dependency build/dev đã ghi nhận vẫn còn trong phạm vi theo dõi. Điểm cho sandbox thanh toán, Mailpit và cả bốn Bonus do giảng viên đánh giá.

Bằng chứng teamwork thực tế, khả năng chạy từ ZIP cuối, demo video, Rubrik và bằng chứng nộp bài vẫn đang chờ. TASK 19 và TASK 20 vẫn pending.

## 5. Tài liệu tham khảo

- `log_fix_issue.md`: Chi tiết 60 mục công việc, gồm 14 mục hậu nghiệm thu.
- `PROJECT_STATE.md`: Tiến độ và trạng thái toàn bộ dự án.
- `HUONG_DAN_KIEM_CHUNG_E2E.md`: Cách kiểm chứng checkpoint hiện tại, hai image phát hành và 60 mục trong nhật ký.
- `Bonus/01_CI_CD.md`: Hướng dẫn CI/CD.
- `Bonus/02_Microservices.md`: Hướng dẫn Microservices.
- `Bonus/03_Elasticsearch.md`: Hướng dẫn Elasticsearch.
- `Bonus/04_AI_Product_Recommendation.md`: Hướng dẫn AI.
- `source/README.txt`: Hướng dẫn chạy và kiểm thử ứng dụng.

Bản tài liệu này được soạn từ checkpoint `900d0f2175bdef162f6aae7cd9fb1e98242138d1` của nhánh `progress` để review trước khi xuất bản. Source code đã nghiệm thu nằm trên `fix-issue`. Các guide Bonus được lưu tại thư mục local `Bonus/`.
