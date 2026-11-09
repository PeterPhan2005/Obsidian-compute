# Google OAuth setup — OBSIDIAN COMPUTE

Hướng dẫn chuẩn bị credentials cho Google OIDC, đối chiếu tài liệu Google ngày 2026-11-08. Backend chưa được xây dựng: tạo credentials được ngay, thử login sau khi ứng dụng chạy.

## 1. Tạo project và cấu hình ứng dụng

1. Mở [Google Cloud Console](https://console.cloud.google.com/), đăng nhập tài khoản Google của người phụ trách cấu hình.
2. Dùng project selector → **New project**, đặt tên `Obsidian Compute` và chọn project vừa tạo.
3. Tìm **Google Auth Platform** → **Get started**. Nếu project đã được cấu hình, dùng các mục **Branding**, **Audience**, **Data Access**, **Clients**.
4. App name: `Obsidian Compute`. User support email và contact email: email thật của người phụ trách nhóm.
5. Audience: **External**, phù hợp nhóm có thể dùng các Gmail khác nhau. Giữ publishing status **Testing** trong thời gian phát triển.
6. Chỉ yêu cầu scopes `openid`, `email`, `profile` (giao diện có thể hiển thị `userinfo.email` và `userinfo.profile`). Không cần Gmail API, Google+ API, Drive API hay quyền đọc hộp thư để đăng nhập.

Google có ngoại lệ cho app chỉ yêu cầu tên/email/profile qua OIDC: người dùng không bắt buộc nằm trong test-user list và authorization không hết hạn sau 7 ngày theo quy tắc testing thông thường. Có thể thêm email ba thành viên trong **Audience → Test users** nếu giao diện cho phép, nhưng không coi đó là điều kiện bắt buộc cho basic sign-in. Tài khoản trường có thể chịu chính sách riêng của Google Workspace.

Nguồn: [Google Auth Platform setup](https://support.google.com/cloud/answer/15544987?hl=en), [Audience và ngoại lệ basic sign-in](https://support.google.com/cloud/answer/15549945?hl=en).

## 2. Tạo OAuth client

Trong **Clients → Create client**:

- Application type: **Web application**, không chọn Desktop app.
- Name: `Obsidian Compute Local`.
- **Authorized redirect URIs**: thêm chính xác:

```text
http://localhost:8080/api/v1/auth/google/callback
```

Luồng server redirect không cần Authorized JavaScript origins; có thể để trống. Nếu sau này dùng thư viện Google chạy trong browser thì đăng ký origin `http://localhost:8080` cho luồng đó. Không dùng URL container `api-a`, không thêm dấu `/` cuối callback và không thay localhost bằng 127.0.0.1 khi chạy nếu chưa đăng ký URI tương ứng.

Tạo client, lưu **Client ID** và **Client secret** ở nơi riêng của nhóm. Client secret thuộc backend, không đưa vào biến `VITE_*` hay frontend bundle. Nếu console cho tải JSON hoặc chỉ hiển thị secret khi tạo, lưu ngay; mất secret thì tạo/rotate theo console.

Nguồn: [Google web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

## 3. Cấu hình dự án khi có ứng dụng

File dự kiến: `source/.env`, nằm cạnh `source/compose.yaml`. File này chưa tồn tại và không được commit. `.env.example` chỉ chứa placeholder.

```dotenv
APP_BASE_URL=http://localhost:8080
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8080/api/v1/auth/google/callback
```

Compose phải truyền ba biến GOOGLE vào **cả api-a và api-b**. Sau khi đổi file `.env`, áp dụng bằng `docker compose up -d` từ thư mục `source/`; `restart` đơn thuần không nạp lại environment container. Bản nộp vẫn khởi động được với Google credentials trống; nút login Google phải giải thích chưa cấu hình, không giả báo đăng nhập thành công.

Mailpit không tham gia xác thực Google. Mailpit sẽ nhận OTP, password reset và email đơn hàng của ứng dụng ở `http://localhost:8025`.

## 4. Kiểm chứng sau khi backend chạy

1. Mở `http://localhost:8080/login` bằng browser thông thường, chọn **Continue with Google**.
2. Chọn tài khoản thử nghiệm, hoàn tất màn hình Google nếu có, quay về đúng origin của ứng dụng.
3. Kiểm tra đã tạo CUSTOMER, email đã được xác minh và tài khoản thiếu địa chỉ được hướng dẫn bổ sung địa chỉ.
4. Logout, đăng nhập lại, kiểm tra không tạo trùng user.
5. Thử với email đã có tài khoản trong ứng dụng; chỉ liên kết khi backend xác thực ID token, `email_verified`, subject, issuer, audience và nonce hợp lệ. Không dựa vào email do browser tự gửi.
6. Kiểm tra callback vẫn hoạt động khi request bắt đầu ở replica A và kết thúc ở B: state/nonce/PKCE phải có cách xác minh dùng chung giữa các replica.

Không yêu cầu Google offline access/refresh token cho mục đích chỉ đăng nhập; phiên ứng dụng do hệ thống quản lý riêng.

## 5. Lỗi thường gặp

| Lỗi | Kiểm tra |
|---|---|
| `redirect_uri_mismatch` | URI trong console và backend phải khớp scheme, host, port, path và dấu slash cuối |
| `invalid_client` | Client ID/secret đúng client loại Web application; cả hai API đã được nạp biến mới |
| `org_internal` / access blocked | Audience External; kiểm tra chính sách tài khoản trường, thử Gmail cá nhân của nhóm |
| Callback không kết nối được | Ứng dụng phải đang chạy, truy cập localhost từ chính máy mở browser |
| State/nonce invalid | Cookie/origin và shared state giữa replica; không bỏ kiểm tra state để chữa lỗi |

Nếu có public deployment sau này, đăng ký thêm callback HTTPS chính xác cho domain đó và cập nhật environment của deployment. Không cần mua domain để thử bản localhost.

Không gửi Client secret trong chat hoặc commit lên repository. Bạn chỉ cần thông báo đã tạo xong; credentials được đặt trực tiếp trong file môi trường local.
