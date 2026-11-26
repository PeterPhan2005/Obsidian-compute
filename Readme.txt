OBSIDIAN COMPUTE — Node.js Final Project

Chạy từ thư mục source:
    docker compose up -d

Website: http://localhost:8080
Mailpit: http://localhost:8025
Admin: admin@obsidian.local / ObsidianAdmin!2026
Customer: alex@example.com / ObsidianCustomer!2026

Cổng storefront 8080:80 và tài khoản công khai ở trên dành cho demo. Owner
giữ cổng mở trên các interface của host để giảng viên có thể truy cập qua mạng.
Cấu hình này chỉ phù hợp với môi trường demo được kiểm soát.

Hướng dẫn đầy đủ: source/README.txt
Google OAuth: docs/GOOGLE_OAUTH_SETUP.md
Nguồn ảnh: docs/ASSET_SOURCES.md
Kết quả kiểm thử và giới hạn: docs/IMPLEMENTATION_STATUS.md

Ứng dụng dùng JavaScript, React/Vite, Express, PostgreSQL/Knex, Redis/Socket.IO,
Elasticsearch, Nodemailer/Mailpit và Nginx. Docker tự migration/seed, có hai
Core API replicas sau Nginx, một Realtime Gateway và một Notification Worker.
Thanh toán sandbox nội bộ không thu tiền thật. Email được giữ tại Mailpit.

Không đưa source/.env chứa credentials vào gói nộp hoặc Git.

Nhóm cần hoàn thành video demo có lời thuyết minh, Git Insights thật và
Rubrik.docx do giảng viên cung cấp.

Bonus CI/CD (ISSUE 17.1): GitHub Actions kiểm thử và chuyển image đã kiểm thử
đến GHCR trên nhánh fix-issue và main. Mục CONTINUOUS INTEGRATION AND DELIVERY
trong source/README.txt hướng dẫn xem run, đối chiếu digest và chạy image.
Bonus Microservices (ISSUE 17.2): Core API phát sự kiện qua Redis Pub/Sub cho
Realtime Gateway. Notification Worker xử lý email từ PostgreSQL outbox.
Bonus Elasticsearch (ISSUE 17.4): Tìm kiếm từ khóa qua Elasticsearch, dùng
PostgreSQL cho dữ liệu hiện hành, bộ lọc, phân trang và SQL fallback. Mục
PRODUCT SEARCH trong source/README.txt hướng dẫn kiểm tra và khôi phục tìm kiếm.
Bonus AI (ISSUE 17.3): Chưa triển khai.


