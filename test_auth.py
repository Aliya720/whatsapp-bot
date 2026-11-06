import requests

res = requests.post("http://localhost:8080/api/auth/register", json={
    "email": "test@example.com",
    "password": "securepassword",
    "company_name": "Test Corp"
})
print("Register:", res.status_code, res.text)

login = requests.post("http://localhost:8080/api/auth/login", data={
    "username": "test@example.com",
    "password": "securepassword"
})
print("Login:", login.status_code, login.text)
