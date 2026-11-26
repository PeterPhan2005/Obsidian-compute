### 1. ISSUE 01 – Inventory Lost Update

**Vấn đề:** Form sửa sản phẩm giữ số tồn kho tại thời điểm mở. Nếu checkout giảm tồn kho trước khi Admin lưu thông tin, giá trị cũ từ form có thể ghi đè số tồn kho mới.

**Khắc phục:** Khi chỉ sửa thông tin sản phẩm, API bỏ qua trường tồn kho. Thao tác đổi tồn kho kiểm tra `stockVersion` và từ chối phiên bản cũ. Checkout cập nhật số lượng và phiên bản tồn kho cùng nhau.

### 2. ISSUE 02 – Variant Validation

**Vấn đề:** Một request có thể dùng cùng ID biến thể nhiều lần để đạt số phần tử tối thiểu dù các phần tử trỏ tới cùng một bản ghi.

**Khắc phục:** API từ chối ID lặp và đếm lại các biến thể đang hoạt động đã lưu trong cùng transaction. Nếu sản phẩm còn dưới hai biến thể đang hoạt động, transaction bị rollback.

### 3. ISSUE 03 – Order Success Screen

**Vấn đề:** Trang kết quả checkout có thể hiện thông báo thành công trước khi tải được receipt hợp lệ, khiến người dùng hiểu nhầm đơn đã được ghi nhận.

**Khắc phục:** Trang chỉ hiện thông báo thành công sau khi tải được receipt hợp lệ. Trang hiển thị riêng trạng thái đang tải, lỗi receipt và trạng thái thực tế của đơn, kể cả `pending`.

### 4. ISSUE 14 – Category Lifecycle

**Vấn đề:** Bản ghi danh mục đã lưu trữ vẫn giữ slug duy nhất, nên thao tác tạo lại cùng slug bị từ chối.

**Khắc phục:** Tạo danh mục với slug đã lưu trữ sẽ kích hoạt lại bản ghi và giữ nguyên ID. Thao tác này giữ nguyên trạng thái của các sản phẩm đã lưu trữ.

### 5. ISSUE 18 – Product Save / Category Archive Race

**Vấn đề:** Khi lưu sản phẩm và lưu trữ danh mục chạy đồng thời, mỗi thao tác có thể kiểm tra trạng thái trước khi thao tác kia hoàn tất. Kết quả có thể là sản phẩm vẫn hoạt động trong danh mục đã lưu trữ.

**Khắc phục:** Lưu sản phẩm giữ khóa `FOR SHARE` trên danh mục đích đến khi commit. Thao tác lưu trữ dùng `FOR UPDATE` trên cùng bản ghi trước khi kiểm tra sản phẩm đang hoạt động, nên hai thao tác được xử lý tuần tự.

### 6. ISSUE 08 – Checkout Payment Validation

**Vấn đề:** Checkout thiếu bước nhập dữ liệu thanh toán mô phỏng. API vẫn có thể tạo đơn mới từ payload legacy thiếu mã thử, bỏ qua bước xác thực thanh toán sandbox.

**Khắc phục:** Checkout có bước nhập mã thanh toán thử và API yêu cầu mã hợp lệ cho mọi đơn mới. Request legacy chỉ được replay đơn đã tạo khi idempotency key, giỏ hàng và hash lịch sử đều khớp.

### 7. ISSUE 09 – Email Delivery Configuration

**Vấn đề:** Docker Compose cố định SMTP vào Mailpit, nên worker chưa thể dùng thông số SMTP và TLS của nhà cung cấp ngoài.

**Khắc phục:** Worker nhận cấu hình SMTP và TLS riêng, với Mailpit là mặc định. Đã kiểm chứng thư xác nhận đơn, OTP, khôi phục tài khoản và retry sau gián đoạn trên Mailpit. Gửi qua SMTP ngoài vẫn chưa được xác minh.

### 8. ISSUE 05 – Product Tag Navigation & SEO Metadata

**Vấn đề:** API đã lọc được theo tag, nhưng Catalog chưa có bộ chọn tag và Product Details chưa có link tag. Catalog và Product Details dùng chung title và meta description mặc định.

**Khắc phục:** Thêm bộ chọn và nút xóa tag trong Catalog, cùng link tag từ Product Details. Danh sách tag lấy từ sản phẩm đang hoạt động, thuộc danh mục đang hoạt động và có ít nhất một biến thể đang hoạt động. Catalog giữ các bộ lọc URL khi đổi tag và về trang đầu. Title và meta description cập nhật theo route trong SPA. Khả năng lập chỉ mục vẫn chưa được xác minh.

### 9. ISSUE 06 – Best Sellers Chart

**Vấn đề:** Simple Dashboard đã nhận dữ liệu `bestSellers` nhưng chỉ hiển thị thứ hạng dưới dạng danh sách, nên khó so sánh số lượng bán giữa các sản phẩm.

**Khắc phục:** Vẽ thanh ngang tỷ lệ với `quantitySold`, giữ tên, thứ hạng và doanh thu từ kết quả hiện có. Thông báo riêng khi chưa có sản phẩm bán.

### 10. ISSUE 07 – Product Type Analytics

**Vấn đề:** Advanced Dashboard chỉ tổng hợp loại sản phẩm trên toàn kỳ. Biểu đồ theo thời gian chưa cho thấy số loại hoặc loại nào đã bán ở từng mốc.

**Khắc phục:** Vẽ `distinctCategoryCount` và số đơn vị bán theo tên danh mục snapshot cho từng mốc. Giữ bảng tổng hợp theo danh mục toàn kỳ và các định nghĩa hiện có về doanh thu, lợi nhuận gộp, số đơn và sản phẩm.

### 11. ISSUE 07 – Category Name Collision

**Vấn đề:** Phần tổng hợp dùng object thường với tên danh mục làm khóa. Tên như `constructor` hoặc `__proto__` có thể trùng thuộc tính kế thừa, làm thiếu dòng danh mục trong kết quả.

**Khắc phục:** Dùng `Map` để nhóm theo tên danh mục snapshot và dùng khóa dữ liệu riêng trong biểu đồ. Tên hiển thị và số liệu theo danh mục được giữ đúng.

### 12. ISSUE 07 – Dashboard Timezone

**Vấn đề:** Dashboard lấy năm, tháng theo múi giờ trình duyệt nhưng lấy ngày từ UTC. Người dùng mở Dashboard gần giao ngày hoặc giao năm có thể thấy kỳ mặc định lệch so với API.

**Khắc phục:** Tính năm, tháng, quý và các ngày mặc định theo `Asia/Ho_Chi_Minh`, cùng múi giờ với API analytics.

### 13. ISSUE 07 – Mobile Chart Legend

**Vấn đề:** Ở viewport 375 px, nhiều tên danh mục dài làm legend chiếm gần hết vùng vẽ có chiều cao cố định. Biểu đồ không vẽ cột dù có số liệu bán.

**Khắc phục:** Đưa legend ra dưới vùng vẽ. Tên có thể xuống dòng và người dùng vẫn xem được tên đầy đủ cùng số lượng bằng tooltip bàn phím. Test hồi quy xác nhận các cột có kích thước dương ở mobile và desktop.

### 14. ISSUE 19 – Catalog Sort Inconsistency

**Vấn đề:** Nếu URL thiếu `sort`, Catalog luôn hiện `Newest arrivals`, dù API có thể đang dùng thứ tự bán chạy hoặc độ liên quan theo từ khóa.

**Khắc phục:** Đồng bộ bộ chọn với thứ tự ưu tiên của API và hiện `Relevance` khi có từ khóa. Khi đổi tag hoặc phân trang, giao diện giữ lựa chọn sort tường minh trong URL.

### 15. ISSUE 20 – Dashboard Tooltip Resize Overflow

**Vấn đề:** Recharts ẩn tooltip bằng `visibility: hidden` nhưng giữ `transform` theo tọa độ desktop. Khi thu cửa sổ, hộp tooltip đã ẩn vẫn nằm ngoài viewport và làm trang tràn ngang.

**Khắc phục:** Áp dụng `display: none` riêng cho tooltip đang ẩn trong chart để hộp này không còn ảnh hưởng chiều rộng trang. Tooltip đang mở giữ cách định vị, hiển thị giá trị và tương tác chuột, bàn phím.

### 16. ISSUE 01 – Product Save / Checkout Lock Ordering

**Vấn đề:** Lưu sản phẩm từng khóa product rồi chờ variant, còn checkout khóa variant trước và cần khóa khóa ngoại trên product khi ghi order item. Thứ tự này có thể gây deadlock. Chưa có bằng chứng tái hiện deadlock trên baseline.

**Khắc phục:** Lưu sản phẩm dùng `FOR NO KEY UPDATE` trên product và khóa variant theo ID tăng dần, cùng thứ tự với checkout. Kiểm thử đồng thời xác nhận hai luồng giữ đúng tồn kho.

### 17. ISSUE 04 – Google OAuth State & Account Linking

**Vấn đề:** Callback cũ tiêu thụ state trước khi kiểm tra browser binding. Luồng liên kết email bên thứ ba có thể thiếu xác minh phiên chủ tài khoản. Query callback được ghi vào access log.

**Khắc phục:** Kiểm tra binding trước khi tiêu thụ state một lần, giữ PKCE và nonce, tuần tự hóa linking và yêu cầu phiên Customer đã xác minh phù hợp với email bên thứ ba. Tắt access log của callback và đặt `no-referrer`. Hạng mục vẫn PARTIAL cho tới khi xác minh consent và callback thật với Google.

### 18. ISSUE 08 – Rejected Checkout Creating Empty Carts

**Vấn đề:** Checkout thiếu giỏ có thể tạo giỏ rỗng và cấp guest cookie trước khi trả lỗi, phát sinh dữ liệu dù không tạo đơn.

**Khắc phục:** Checkout chỉ tra cứu giỏ sẵn có. Integration test xác nhận request bị từ chối không tăng số bản ghi giỏ và không cấp guest cookie.

### 19. ISSUE 21 – Checkout Quote Consistency

**Vấn đề:** Checkout tính lại từ giỏ hiện hành khi đặt đơn mà không đối chiếu với báo giá đã Review. Đổi giỏ hoặc giá sau Review có thể tạo đơn khác nội dung khách đã xem, kể cả thay variant mà subtotal giữ nguyên.

**Khắc phục:** Frontend giữ snapshot đã Review và khóa idempotency. API đối chiếu fingerprint của giỏ, cấu hình variant, số lượng, giá, coupon, điểm và tổng tiền trong transaction trước khi ghi. Báo giá lệch yêu cầu Review lại. Test xác nhận từ chối không thay đổi dữ liệu nghiệp vụ, retry sau mất phản hồi trả cùng đơn và replay lịch sử còn hoạt động.

### 20. ISSUE 22 – Receipt Token Exposure

**Vấn đề:** Request target và trường Referer có thể đưa receipt token còn hạn vào access log. Token cấp quyền xem thông tin đơn và giao hàng.

**Khắc phục:** Hai lớp Nginx bỏ log request ở route receipt nhạy cảm và chỉ ghi origin của Referer. Link mới dùng fragment, link query cũ vẫn hoạt động, và HTTP/SPA áp dụng `no-referrer`. Test tổng hợp kiểm tra log mới và request đi ra. Log lịch sử được giữ lại và có thể còn chứa token từng được ghi. Không thu hồi token hiện có.

### 21. ISSUE 02 – Inactive Variant Editor

**Vấn đề:** Form sửa sản phẩm hiển thị variant inactive như variant active và tính giới hạn xóa theo toàn bộ dòng, tạo cảm giác có thể xóa vượt ngưỡng hai variant active.

**Khắc phục:** Form chỉ tải các variant active nên điều kiện xóa dựa trên đúng số variant active. Browser test xác nhận ngưỡng hai variant và giữ ID, stock version cùng bản ghi inactive.

### 22. ISSUE 09 – Order Email Subject

**Vấn đề:** Subject email dùng `is confirmed` trong khi trạng thái đơn trong nội dung là `pending`, dễ bị hiểu là Admin đã xác nhận đơn.

**Khắc phục:** Dùng `has been received` để xác nhận đã nhận đơn. Mailpit xác nhận subject mới và nội dung giữ nguyên trạng thái `pending`.

### 23. ISSUE 11 – Docker Compose Filename

**Vấn đề:** File chính có tên `compose.yaml`, khác tên `docker-compose.yml` mà đề bài nêu.

**Khắc phục:** Đổi tên file chính và cập nhật các tham chiếu. Khởi chạy từ `source/` bằng `docker compose up -d` trên project và volume mới đã pass, gồm migration, seed và đăng nhập demo.

### 24. ISSUE 11 – Verification Safety & Test Coverage

**Vấn đề:** Verifier cũ dùng tên project cố định, xóa volume khi chạy lại và bỏ OAuth fixture. README còn số test và lệnh dọn stack cũ.

**Khắc phục:** Verifier tạo project mới, xác minh cổng, project và PostgreSQL trước khi chạy test, tự phát hiện backend suite, chạy OAuth fixture và Playwright, rồi dừng đúng project và giữ volume. README hướng dẫn `npm run verify` từ `source/` với Docker Engine local và cổng trống, thêm `-- --api-only` khi chỉ chạy backend. Lượt xác minh cuối pass 54/54.

### 25. ISSUE 11 – Test Artifact Overwriting

**Vấn đề:** Một số Playwright spec ghi ảnh thẳng vào `docs/evidence/`, nên một lượt test có thể ghi đè ảnh demo trong Git.

**Khắc phục:** Dùng `testInfo.outputPath` cho ảnh tạo trong test, ghi artifact và báo cáo HTML vào thư mục riêng theo project. Lượt verify cuối giữ nguyên ảnh demo tracked.

### 26. ISSUE 23 – Cross-Account Session Isolation

**Vấn đề:** Cache dùng chung giữa các tài khoản có thể giữ dữ liệu riêng tư sau khi đổi phiên. Callback Google cũng có thể chồng lấn với refresh và bị phản hồi đến muộn ghi đè cookie phiên.

**Khắc phục:** Phân vùng cache theo danh tính, đồng bộ đổi phiên giữa các tab và kiểm tra danh tính dự kiến ở API. SPA hoàn tất callback Google bằng POST có CSRF dưới cùng khóa với refresh. Kiểm chứng dùng OAuth fixture và trình duyệt cô lập.

### 27. ISSUE 24 – WebSocket Error Isolation

**Vấn đề:** Dữ liệu sự kiện không hợp lệ hoặc lỗi bất đồng bộ có thể thoát khỏi handler và làm dừng API replica.

**Khắc phục:** Kiểm tra payload trong vùng xử lý lỗi và tuần tự hóa thay đổi room theo kết nối. Luồng cập nhật comment và rating giữa replica vẫn hoạt động.

### 28. ISSUE 25 – Password Recovery Token Privacy

**Vấn đề:** Link reset dạng query có thể đưa token vào access log. Metadata báo cáo kiểm thử cũng có thể ghi URL chứa token reset hoặc receipt.

**Khắc phục:** Link mới dùng fragment, giao diện tiếp tục hỗ trợ link cũ và dọn URL sau khi đọc. Hai lớp Nginx bảo vệ log mới và referrer. Test điều hướng nhạy cảm tránh ghi token vào metadata. Log lịch sử được giữ nguyên.

### 29. ISSUE 26 – Authentication Transaction Ordering

**Vấn đề:** Các thao tác thay thông tin xác thực, cấp challenge và tạo hoặc thu hồi phiên có thể chồng lấn. Logout có thể bỏ sót phiên vừa xoay refresh hash.

**Khắc phục:** Khóa theo tài khoản và kiểm tra lại trạng thái trước khi ghi. Logout nhận hash hiện hành hoặc ngay trước lần xoay để thu hồi đúng phiên. Refresh chỉ nhận hash hiện hành.

### 30. ISSUE 27 – Guest Cart Initialization

**Vấn đề:** Hai request đầu chưa có định danh guest có thể tạo hai giỏ. Phản hồi đến muộn có thể khiến giỏ đang hiển thị mất món vừa thêm.

**Khắc phục:** Mutation chờ khởi tạo giỏ và backend kiểm tra lại định danh trước khi ghi. Web Locks hoặc transaction IndexedDB tuần tự hóa khởi tạo giữa các tab. Checkout bị từ chối vẫn không tạo giỏ.

### 31. ISSUE 28 – Category Identity in Analytics

**Vấn đề:** Nhóm theo tên làm gộp danh mục trùng tên hoặc tách một danh mục sau khi đổi tên.

**Khắc phục:** Lưu UUID danh mục lúc mua và giữ tên snapshot. Dữ liệu cũ thiếu căn cứ xác định UUID được nhóm xấp xỉ theo tên lịch sử. Migration giữ nguyên snapshot và số tiền cũ.

### 32. ISSUE 29 – Admin Bootstrap Without Demo Seed

**Vấn đề:** Tắt demo seed cũng bỏ qua đường tạo Admin trên cơ sở dữ liệu mới.

**Khắc phục:** Tách bootstrap Admin khỏi demo seed, yêu cầu credential non-demo tường minh khi chưa có Admin và giữ nguyên Admin hiện hữu khi khởi động lại.

### 33. ISSUE 30 – Product Tag Editing

**Vấn đề:** Parse từng phím làm mất dấu phân cách. Parse lại mảng tag đã lưu khi chỉ sửa trường khác có thể tách tag chứa dấu phẩy.

**Khắc phục:** Giữ text trong lúc nhập, chỉ parse khi lưu nội dung tag đã sửa và giữ nguyên mảng đã lưu khi ô tag chưa đổi.

### 34. ISSUE 31 – Active Variant Aggregation

**Vấn đề:** Variant đã archive vẫn góp vào giá tối thiểu và tổng tồn đang bán trong Admin Products.

**Khắc phục:** Tính giá và tồn đang bán từ variant active. Giữ bản ghi inactive, ID và stock version phục vụ quản trị và lịch sử.

### 35. ISSUE 17.1 – Docker Build Context in GitHub Actions

**Vấn đề:** Workflow chạy `git archive HEAD:source` từ thư mục `source/`, tạo archive rỗng. Docker không nhận stdin là build context và báo lỗi Dockerfile ở lần chạy `45767628794`. CI dừng tại bước build image và job publish được bỏ qua.

**Khắc phục:** Chạy `git archive` từ workspace root, giải nén cây `source` đã commit vào thư mục tạm và chỉ rõ build context cùng đường dẫn Dockerfile của từng image. Lần chạy `45768557009` đạt 74/74, sau đó publish cả hai image lên GHCR. Compose khởi động sạch từ hai digest đã công bố.

### 36. ISSUE 17.2 – Product Room Rejoin After Lookup Timeout

**Vấn đề:** Review Batch 06 phát hiện trường hợp trình duyệt đã kết nối lại WebSocket nhưng lần kiểm tra sản phẩm nội bộ đầu tiên bị timeout. Socket vẫn mở mà chưa vào product room, nên có thể bỏ lỡ cập nhật sau khi Core phục hồi.

**Khắc phục:** Client thử join lại khi không nhận được acknowledgement trên kết nối hiện tại, hủy retry khi socket ngắt hoặc trang unmount và tải lại trạng thái qua REST sau acknowledgement. Probe Playwright tái hiện lỗi lookup khi Gateway vừa khởi động lại và xác nhận client vào lại room, khôi phục dữ liệu. Run `45777143382` đạt 76/76.

### 37. ISSUE 22 – Receipt Token Exposure in Error Logs

**Vấn đề:** Frontend đặt bearer token trong URL API. Hai lớp Nginx có thể ghi URL chứa token vào error log khi xảy ra lỗi, làm lộ quyền xem receipt khi token còn hiệu lực.

**Khắc phục:** Request mới gửi token qua `X-Receipt-Token`. API vẫn kiểm tra token và thời hạn, đồng thời giữ tương thích với link và API cũ. Chỉ tắt error log ở các route receipt liên quan. Probe lỗi có kiểm soát xác nhận token giả lập vắng mặt trong log mới và route thường vẫn ghi lỗi. Log lịch sử và trạng thái token hiện hữu được giữ nguyên.

### 38. ISSUE 32 – Stale Product Form Updates

**Vấn đề:** Form Admin giữ trạng thái sản phẩm và biến thể từ lúc mở. Nếu một tab khác archive sản phẩm hoặc bỏ biến thể, lần lưu form cũ có thể bật lại trạng thái vừa bị tắt.

**Khắc phục:** Form gửi `expectedRevision`. API kiểm tra revision trong điều kiện `UPDATE` và trả `409 PRODUCT_CONFLICT` nếu dữ liệu đã đổi. Save và archive tăng revision. Bản sửa giữ `stockVersion`, thứ tự khóa và ID biến thể lịch sử.

### 39. ISSUE 33 – Authentication Cookie Ordering

**Vấn đề:** `signIn()` đặt auth cookie trước khi đọc profile và merge guest cart. Phản hồi lỗi có thể vẫn cấp cookie phiên mới, khiến trình duyệt nhận phiên dù giao diện báo đăng nhập thất bại.

**Khắc phục:** Luồng password, OTP và Google hoàn tất các thao tác cần thiết trước khi đặt auth cookie. Test gây lỗi khi đọc profile và merge cart xác nhận phản hồi lỗi không cấp cookie xác thực mới.

### 40. ISSUE 34 – Catalog Snapshot Consistency

**Vấn đề:** Catalog public không có từ khóa chạy truy vấn đếm và truy vấn lấy trang trên các snapshot khác nhau. Một lần archive xen giữa có thể làm tổng báo còn sản phẩm trong khi trang trả về rỗng.

**Khắc phục:** Dùng chung transaction `REPEATABLE READ READ ONLY` cho tổng, trang và DTO. Regression test commit thao tác archive giữa hai truy vấn để xác nhận cùng phản hồi vẫn đọc một snapshot. Luồng tìm kiếm Elasticsearch giữ nguyên hành vi.

### 41. ISSUE 17.3 – WASM Asset Resolution in Vite Development

**Vấn đề:** Worker để ONNX Runtime tự tìm WASM trong thư mục dependency đã optimize của Vite dev. Đường dẫn đó trả HTML với HTTP 200, khiến Chromium không khởi tạo được runtime và Catalog báo trợ lý tạm thời không khả dụng.

**Khắc phục:** Import WASM đã pin qua Vite `?url` và đặt `wasmPaths.wasm` tới URL cùng origin. Review độc lập kiểm tra Vite dev trả `application/wasm` và truy vấn lưu trữ tiếng Việt chạy inference thành công. Chromium cũng chạy inference từ frontend image production.

### 42. ISSUE 17.3 – Unsupported Negation and Exact-Capacity Requests

**Vấn đề:** Điểm tương đồng có thể cao dù kết quả vi phạm điều kiện trong câu nhập. Review độc lập tái hiện truy vấn yêu cầu chuột và loại trừ desktop trả desktop, câu tiếng Việt yêu cầu máy in trả màn hình, và câu yêu cầu laptop RAM 64 GB trả laptop hoặc RAM 16 GB.

**Khắc phục:** Phát hiện các mẫu phủ định và dung lượng chính xác để yêu cầu diễn đạt lại mục đích trước khi lấy ứng viên hoặc tải model. Review độc lập kiểm tra lại bốn ca đã tái hiện và xác nhận các truy vấn Anh–Việt phù hợp vẫn chạy model thật. Các cách diễn đạt ngoài mẫu phát hiện vẫn là giới hạn của trợ lý.

### 43. ISSUE 11 – Interactive LAN HTTP Deployment

**Vấn đề:** Với URL LAN HTTP, Core API và Realtime Gateway từ chối origin khác `APP_BASE_URL` mặc định. Sau khi cấu hình đúng origin, Checkout vẫn dừng ở bước Review vì gọi `crypto.randomUUID()`, API không có trong ngữ cảnh LAN HTTP thông thường.

**Khắc phục:** Hướng dẫn đặt `APP_BASE_URL` khớp chính xác origin demo. Checkout dùng `crypto.getRandomValues()` để sinh UUID v4 khi thiếu `crypto.randomUUID()` và tái sử dụng khóa idempotency khi retry. Kiểm chứng guest và customer checkout trên LAN HTTP thật, cập nhật qua WebSocket, từ chối origin khác và guest checkout tại localhost mặc định.

### 44. ISSUE 02 – Variant Attribute Preservation

**Vấn đề:** DTO áp dụng `camel()` đệ quy lên JSON thuộc tính variant. Hai khóa hợp lệ như `memory_type` và `memoryType` có thể bị gộp. Form Admin hoặc Product PATCH chỉ sửa metadata có thể ghi lại DTO đã mất khóa vào DB.

**Khắc phục:** Giữ nguyên JSON `attributes` ở DTO variant của Catalog, Admin và Inventory PATCH. Regression kiểm chứng hai khóa và giá trị còn nguyên khi đọc, lưu qua form Admin, PATCH metadata và cập nhật inventory.

### 45. ISSUE 32 – Concurrent Cost-Price Updates

**Vấn đề:** Inventory PATCH chỉ đổi giá vốn không tăng product revision hoặc stock version. Form Admin cũ và hai Inventory PATCH dùng chung version có thể ghi đè giá vốn mới, khiến đơn kế tiếp lưu sai giá vốn và dashboard tính sai lợi nhuận gộp.

**Khắc phục:** Khi Inventory PATCH đổi giá vốn, khóa product trước variant và tăng product revision cùng stock version trong một transaction. Product PATCH đổi giá vốn cũng tăng stock version, buộc Inventory PATCH cũ trả `409`. Regression xác nhận xung đột hai chiều, hai cập nhật inventory cạnh tranh, bảo vệ tồn kho và snapshot giá vốn của đơn đã lưu.

### 46. ISSUE 17.3 – AI Recommendation Pagination

**Vấn đề:** Danh sách kết quả AI giới hạn ba sản phẩm nhưng thiếu số trang, vi phạm yêu cầu PDF về phân trang có số kể cả khi chỉ có một trang.

**Khắc phục:** Dùng `Pagination` với metadata một trang và nhãn riêng của danh sách đề xuất. Nút có `type="button"`, hai nút chuyển trang bị vô hiệu hóa. Playwright xác nhận Page 1 xuất hiện khi có kết quả, không gửi lại form, không chạy lại inference và không đổi trang Catalog.
