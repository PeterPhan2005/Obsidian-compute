OBSIDIAN COMPUTE — Node.js Final Project

Chạy từ thư mục source:
    docker compose up -d

Website: http://localhost:8080
Mailpit: http://localhost:8025
Admin: admin@obsidian.local / ObsidianAdmin!2026
Customer: alex@example.com / ObsidianCustomer!2026

Cổng storefront 8080:80 và tài khoản công khai ở trên dành cho demo. Lệnh
mặc định chạy trên localhost. Để demo tương tác qua LAN, đặt APP_BASE_URL
trong source/.env thành chính xác origin giảng viên sẽ mở, ví dụ
http://192.168.1.25:8080, rồi chạy lại docker compose up -d. Dùng cùng origin
trên các cửa sổ trình duyệt. Mailpit vẫn chỉ mở trên localhost của máy chạy
Docker. LAN HTTP dành cho demo kiểm soát với dữ liệu giả. Hosting production
cần HTTPS và credentials riêng.

Hướng dẫn đầy đủ: source/README.txt
Google OAuth: docs/GOOGLE_OAUTH_SETUP.md
Nguồn ảnh: docs/ASSET_SOURCES.md
Kết quả kiểm thử và giới hạn: docs/IMPLEMENTATION_STATUS.md

Ứng dụng dùng JavaScript, React/Vite, Express, PostgreSQL/Knex, Redis/Socket.IO,
Elasticsearch, Nodemailer/Mailpit và Nginx. Docker tự migration/seed, có hai
Core API replicas sau Nginx, một Realtime Gateway và một Notification Worker.
Thanh toán sandbox nội bộ không thu tiền thật. Mailpit là inbox mặc định.
Google OAuth cần cấu hình riêng theo môi trường. Consent/callback Google
thật và gửi thư qua external SMTP vẫn cần kiểm chứng.

Không đưa source/.env chứa credentials vào gói nộp hoặc Git.

Nhóm cần hoàn thành demo.mp4 từ 1080p có lời, Git Insights thật, Rubrik.docx
do giảng viên cấp và kiểm tra chạy từ ZIP cuối trước khi nộp qua e-learning.

Bonus CI/CD (ISSUE 17.1): GitHub Actions kiểm thử và chuyển image đã kiểm thử
đến GHCR trên nhánh fix-issue và main. Mục CONTINUOUS INTEGRATION AND DELIVERY
trong source/README.txt hướng dẫn xem run, đối chiếu digest và chạy image.
Bonus Microservices (ISSUE 17.2): Core API phát sự kiện qua Redis Pub/Sub cho
Realtime Gateway. Notification Worker xử lý email từ PostgreSQL outbox.
Bonus Elasticsearch (ISSUE 17.4): Tìm kiếm từ khóa qua Elasticsearch, dùng
PostgreSQL cho dữ liệu hiện hành, bộ lọc, phân trang và SQL fallback. Mục
PRODUCT SEARCH trong source/README.txt hướng dẫn kiểm tra và khôi phục tìm kiếm.
Bonus AI (ISSUE 17.3): Trong Catalog, mở AI product recommendations. Nhập
nhu cầu bằng tiếng Việt hoặc tiếng Anh, chọn danh mục/ngân sách nếu cần.
Model chạy trong trình duyệt. Build sạch lấy model đã pin và kiểm checksum.
Lượt AI đầu tải khoảng 158 MB. Xem mục AI PRODUCT RECOMMENDATIONS để biết
cách dùng và giới hạn về thông số chính xác, phủ định và thiết bị yếu.

Bằng chứng Bonus: Bonus/01_CI_CD.md, Bonus/02_Microservices.md,
Bonus/03_Elasticsearch.md và Bonus/04_AI_Product_Recommendation.md.


