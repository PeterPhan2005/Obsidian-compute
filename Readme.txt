OBSIDIAN COMPUTE — Node.js Final Project

Chạy từ thư mục source:
    docker compose up -d

Website: http://localhost:8080
Mailpit: http://localhost:8025
Admin: admin@obsidian.local / ObsidianAdmin!2026
Customer: alex@example.com / ObsidianCustomer!2026

Hướng dẫn đầy đủ: source/README.txt
Google OAuth: docs/GOOGLE_OAUTH_SETUP.md
Nguồn ảnh: docs/ASSET_SOURCES.md
Kết quả kiểm thử và giới hạn: docs/IMPLEMENTATION_STATUS.md

Ứng dụng dùng JavaScript, React/Vite, Express, PostgreSQL/Knex, Redis/Socket.IO,
Nodemailer/Mailpit và Nginx. Docker tự migration/seed, có hai API replicas.
Thanh toán sandbox nội bộ không thu tiền thật. Email được giữ tại Mailpit.

Không đưa source/.env chứa credentials vào gói nộp hoặc Git.
Nhóm cần hoàn thành video demo có lời thuyết minh, Git Insights thật và
Rubrik.docx do giảng viên cung cấp. Chưa tuyên bố bonus nào hoàn thành.
