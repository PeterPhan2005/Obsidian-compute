### 1. ISSUE 01 – Inventory Lost Update

**Vấn đề:** Lưu thông tin sản phẩm từ form cũ có thể ghi đè tồn kho vừa giảm do checkout.

**Khắc phục:** Lưu metadata không ghi lại tồn kho. Thao tác đổi tồn kho kiểm tra `stockVersion`, còn checkout cập nhật số lượng và phiên bản cùng nhau.

### 2. ISSUE 02 – Variant Validation

**Vấn đề:** Một request có thể lặp ID biến thể và vượt qua kiểm tra số biến thể tối thiểu.

**Khắc phục:** Từ chối ID lặp và kiểm tra sản phẩm có tối thiểu hai biến thể đang hoạt động trong transaction lưu sản phẩm.

### 3. ISSUE 03 – Order Success Screen

**Vấn đề:** Trang checkout có thể báo thành công khi chưa tải được receipt hợp lệ.

**Khắc phục:** Chỉ hiện thông báo thành công sau khi tải được receipt. Trạng thái đơn, trạng thái tải và lỗi receipt được hiển thị riêng.

### 4. ISSUE 14 – Category Lifecycle

**Vấn đề:** Không thể tạo lại danh mục có slug trùng với danh mục đã lưu trữ.

**Khắc phục:** Kích hoạt lại bản ghi cùng slug và giữ ID cũ. Các sản phẩm đã lưu trữ vẫn giữ trạng thái.

### 5. ISSUE 18 – Product Save / Category Archive Race

**Vấn đề:** Lưu sản phẩm và lưu trữ danh mục đồng thời có thể để lại sản phẩm đang hoạt động trong danh mục đã lưu trữ.

**Khắc phục:** Lưu sản phẩm giữ khóa chia sẻ trên danh mục đích đến khi commit. Thao tác lưu trữ lấy khóa cập nhật trên cùng bản ghi để hai thao tác được xử lý tuần tự.

### 6. ISSUE 08 – Checkout Payment Validation

**Vấn đề:** Checkout thiếu bước nhập dữ liệu thanh toán và API vẫn cho tạo đơn mới bằng payload legacy thiếu mã thử.

**Khắc phục:** Bắt buộc mã thanh toán thử hợp lệ cho đơn mới. Chỉ replay đơn cũ khi idempotency key, giỏ hàng và hash đều khớp.

### 7. ISSUE 09 – Email Delivery Configuration

**Vấn đề:** Docker Compose cố định SMTP vào Mailpit, nên worker chưa nhận được cấu hình SMTP ngoài cần thiết.

**Khắc phục:** Cho phép cấu hình SMTP và TLS riêng cho worker, giữ Mailpit mặc định. Đã chấp nhận cấu hình và kiểm chứng ba loại thư cùng retry trong Mailpit. SMTP ngoài vẫn chưa được xác minh.
