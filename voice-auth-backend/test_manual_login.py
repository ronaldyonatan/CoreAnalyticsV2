from app.services.auth_service import login_with_password


def print_result(label, result):
    print(f"\n=== {label} ===")
    print("success :", result.success)
    print("code    :", result.code)
    print("message :", result.message)
    print("user    :", result.user)


def main():
    # Sesuaikan dengan user yang tadi berhasil diregister.
    username = "ronald"

    # Password yang benar saat register.
    good = login_with_password(
        username=username,
        password="Test123!",
    )
    print_result("PASSWORD BENAR", good)

    # Harus gagal.
    bad = login_with_password(
        username=username,
        password="PasswordSalah!",
    )
    print_result("PASSWORD SALAH", bad)


if __name__ == "__main__":
    main()
