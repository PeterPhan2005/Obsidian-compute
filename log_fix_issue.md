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
